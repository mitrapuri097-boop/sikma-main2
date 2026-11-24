/**
 * SIMITI — data eksternal untuk analisis titik (Rancangan §5).
 *
 * - BMKG prakiraan cuaca (tanpa kunci): titik -> desa (kel_desa.kode_kd == adm4 BMKG)
 *   -> ringkasan hujan ±3 hari ke depan.
 * - NASA FIRMS (opsional, butuh NASA_FIRMS_MAP_KEY): jumlah hotspot dalam radius.
 *
 * Prinsip §5.1: bila sumber gagal diakses, tandai "tidak tersedia" dan jangan
 * mengarang nilai. Data ini adalah bukti pendukung dan TIDAK mengubah skor MCDA
 * (prakiraan/hotspot bukan klimatologi atau kerawanan).
 */

const BMKG_URL = "https://api.bmkg.go.id/publik/prakiraan-cuaca";
const FIRMS_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";
const DEFAULT_TIMEOUT_MS = Number(process.env.AI_EXTERNAL_TIMEOUT_MS || 8000);

async function fetchWithTimeout(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, headers: { Accept: "application/json, text/csv" } });
  } finally {
    clearTimeout(timer);
  }
}

/** Ringkas respons BMKG: total/maks hujan (mm per slot 3 jam) dan jumlah slot hujan. */
function summarizeBmkg(payload, horizonHours = 72) {
  const entry = payload?.data?.[0];
  const slots = (entry?.cuaca || []).flat().filter((s) => s && s.datetime);
  if (!entry || !slots.length) return null;
  slots.sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)));
  const start = new Date(slots[0].datetime).getTime();
  const within = slots.filter((s) => new Date(s.datetime).getTime() - start < horizonHours * 3600 * 1000);
  const tp = within.map((s) => Number(s.tp)).filter(Number.isFinite);
  const rainy = within.filter((s) => /hujan/i.test(String(s.weather_desc || "")));
  const heavy = within.filter((s) => /lebat|petir/i.test(String(s.weather_desc || "")));
  return {
    desa: entry.lokasi?.desa || null,
    kecamatan: entry.lokasi?.kecamatan || null,
    kab_kota: entry.lokasi?.kotkab || null,
    adm4: entry.lokasi?.adm4 || null,
    dari: within[0]?.datetime || null,
    sampai: within[within.length - 1]?.datetime || null,
    jumlah_slot: within.length,
    slot_hujan: rainy.length,
    slot_hujan_lebat_atau_petir: heavy.length,
    hujan_total_mm: Math.round(tp.reduce((s, v) => s + v, 0) * 10) / 10,
    hujan_maks_mm_per_3jam: tp.length ? Math.max(...tp) : null,
  };
}

async function loadBmkgForecast(pool, lat, lng, queryWithTimeout) {
  const base = { source: "BMKG prakiraan cuaca (adm4)", available: false };
  try {
    const r = await queryWithTimeout(
      pool,
      `SELECT kode_kd FROM kel_desa
       WHERE geom_valid && ST_SetSRID(ST_MakePoint($1, $2), 4326)
         AND ST_Intersects(geom_valid, ST_SetSRID(ST_MakePoint($1, $2), 4326))
       LIMIT 1`,
      [lng, lat],
      5000,
    );
    const adm4 = r.rows?.[0]?.kode_kd;
    if (!adm4 || !/^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(adm4)) {
      return { ...base, note: "Titik tidak berada di desa/kelurahan terdaftar; prakiraan BMKG tidak dapat dicocokkan." };
    }
    const res = await fetchWithTimeout(`${BMKG_URL}?adm4=${encodeURIComponent(adm4)}`);
    if (!res.ok) return { ...base, note: `BMKG membalas HTTP ${res.status}.` };
    const summary = summarizeBmkg(await res.json());
    if (!summary) return { ...base, note: "Respons BMKG tidak berisi data prakiraan." };
    return {
      ...base,
      available: true,
      ...summary,
      note: "Prakiraan cuaca ±3 hari ke depan dari BMKG; bukan data observasi dan tidak masuk skor MCDA.",
    };
  } catch (error) {
    return { ...base, note: `BMKG tidak dapat diakses (${error?.name === "AbortError" ? "timeout" : error?.message || "error"}).` };
  }
}

/** Hitung baris data CSV FIRMS (tanpa header). Respons error FIRMS berupa teks non-CSV. */
function parseFirmsCsv(text) {
  const lines = String(text || "").trim().split(/\r?\n/);
  if (!lines.length || !/latitude/i.test(lines[0])) return null;
  const header = lines[0].split(",");
  const iConf = header.indexOf("confidence");
  const iFrp = header.indexOf("frp");
  let high = 0;
  let frp = 0;
  const rows = lines.slice(1).filter(Boolean);
  for (const line of rows) {
    const cols = line.split(",");
    const conf = (cols[iConf] || "").toLowerCase();
    if (conf === "h" || conf === "high" || Number(conf) >= 80) high++;
    frp += Number(cols[iFrp]) || 0;
  }
  return { hotspots: rows.length, hotspots_high_confidence: high, frp_total_mw: Math.round(frp * 10) / 10 };
}

async function loadFirmsHotspots(lat, lng, radiusM, days = 3) {
  const key = process.env.NASA_FIRMS_MAP_KEY;
  const base = { source: "NASA FIRMS VIIRS SNPP NRT", available: false };
  if (!key) return { ...base, note: "NASA_FIRMS_MAP_KEY belum diisi di .env backend; hotspot tidak diambil." };
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const bbox = [lng - dLng, lat - dLat, lng + dLng, lat + dLat].map((n) => n.toFixed(4)).join(",");
  try {
    const res = await fetchWithTimeout(`${FIRMS_URL}/${encodeURIComponent(key)}/VIIRS_SNPP_NRT/${bbox}/${days}`);
    const text = await res.text();
    const parsed = res.ok ? parseFirmsCsv(text) : null;
    if (!parsed) return { ...base, note: `FIRMS tidak mengembalikan data valid (HTTP ${res.status}).` };
    return {
      ...base,
      available: true,
      periode_hari: days,
      ...parsed,
      note: "Hotspot adalah indikasi anomali termal dalam kotak pembatas radius, bukan batas kebakaran; perlu verifikasi.",
    };
  } catch (error) {
    return { ...base, note: `FIRMS tidak dapat diakses (${error?.name === "AbortError" ? "timeout" : error?.message || "error"}).` };
  }
}

module.exports = { loadBmkgForecast, loadFirmsHotspots, _internal: { summarizeBmkg, parseFirmsCsv } };
