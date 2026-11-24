/**
 * SIMITI — Analisis titik (klik peta): data kerawanan sekitar titik -> model mitigasi.
 *
 * Mengikuti Rancangan Logika AI SIMITI:
 *  - §6/§9 : lokasi dipilih, data di sekitar lokasi di-overlay (buffer radius)
 *  - §8    : matriks permasalahan -> alternatif mitigasi (aturan eksplisit)
 *  - §7.2  : skor MCDA dari aiMitigationScoring (dipakai ulang)
 *  - §12.3 : hard constraint -> ELIGIBLE / NEEDS_DATA / NOT_ELIGIBLE
 *  - §4    : jarak ke sarana eksisting terdekat (tidak menggandakan infrastruktur)
 *  - §14.1/Lampiran B : bentuk keluaran
 *
 * Seluruh angka, skor, jarak, dan koordinat berasal dari analisis GIS.
 * Tidak ada pemanggilan LLM di sini: keluaran deterministik dan bisa ditelusuri.
 */

const MODEL_VERSION = "0.1.0-point-rules";

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const round1 = (n) => Math.round(n * 10) / 10;

/** Persentase luas buffer yang kelasnya cocok dengan pola (0-100). */
function classShare(layer, include, exclude) {
  if (!layer?.available || !Array.isArray(layer.classes)) return null;
  let total = 0;
  for (const c of layer.classes) {
    const name = String(c.kelas || "");
    if (exclude && exclude.test(name)) continue;
    if (include.test(name)) total += Number(c.persen_wilayah || 0);
  }
  return round1(Math.min(100, total));
}

function riskShares(evidence) {
  const classes = evidence?.risk_classes || [];
  const pick = (re) =>
    round1(classes.filter((c) => re.test(String(c.kelas))).reduce((s, c) => s + Number(c.persen_wilayah || 0), 0));
  return { tinggi: pick(/tinggi/i), sedang: pick(/sedang/i), rendah: pick(/rendah/i) };
}

/** Jarak terdekat (m) ke sarana relevan; null bila tidak ada data. */
function nearestOf(assets, tables) {
  const hits = assets.filter((a) => tables.includes(a.table) && a.jarak_m !== null);
  if (!hits.length) return null;
  return hits.reduce((best, a) => (a.jarak_m < best.jarak_m ? a : best));
}

const WATER_STORAGE = ["embung", "situ", "danau", "bendungan"];

/**
 * Aturan Rancangan §8. Tiap aturan mengembalikan null (tidak berlaku) atau
 * kandidat dengan driver 0-100, constraint, pemeriksaan wajib, dan alasan.
 * `ctx` hanya berisi hasil analisis GIS.
 */
const RULES = [
  {
    id: "embung",
    model: "Embung / tampungan air",
    hazards: ["kekeringan"],
    evaluate(ctx) {
      if (ctx.risk.tinggi + ctx.risk.sedang < 10) return null;
      const near = nearestOf(ctx.assets, WATER_STORAGE);
      const reasons = [`Risiko kekeringan Tinggi ${ctx.risk.tinggi}% dan Sedang ${ctx.risk.sedang}% dari area analisis.`];
      const checks = ["Hidrologi dan neraca air", "Geologi dan geoteknik", "Status lahan", "Environmental screening"];
      const missing = [];
      if (!ctx.layers.geology?.available) missing.push("Data geologi di sekitar titik belum tersedia.");
      if (near && near.jarak_m <= 1500) {
        return {
          driver: ctx.risk.tinggi + ctx.risk.sedang,
          status: "NOT_ELIGIBLE",
          reasons: [...reasons, `Sudah ada ${near.table} (${near.nama || "tanpa nama"}) ±${Math.round(near.jarak_m)} m dari titik; pembangunan baru berpotensi menggandakan sarana.`],
          checks,
          failed: ["existing_water_storage_within_1500m"],
          missing,
          alt: "optimalisasi_sarana",
        };
      }
      return {
        driver: ctx.risk.tinggi + ctx.risk.sedang,
        status: missing.length ? "NEEDS_DATA" : "NEEDS_FIELD_VERIFICATION",
        reasons: [...reasons, near ? `Sarana tampungan terdekat ±${Math.round(near.jarak_m)} m (di luar jangkauan duplikasi).` : "Tidak ditemukan embung/situ/danau/bendungan terdekat pada data SIMITI."],
        checks,
        missing,
      };
    },
  },
  {
    id: "optimalisasi_sarana",
    model: "Optimalisasi sarana air eksisting",
    hazards: ["kekeringan", "banjir"],
    evaluate(ctx) {
      const near = nearestOf(ctx.assets, WATER_STORAGE);
      if (!near || near.jarak_m > 1500) return null;
      return {
        driver: clamp(100 - near.jarak_m / 15, 20, 90),
        status: "NEEDS_FIELD_VERIFICATION",
        reasons: [`${near.table} (${near.nama || "tanpa nama"}) berada ±${Math.round(near.jarak_m)} m dari titik; kapasitas dan fungsi perlu diperiksa sebelum membangun baru.`],
        checks: ["Kapasitas dan kondisi sarana", "Status fungsi dan pengelola", "Cakupan layanan"],
        missing: ["Kapasitas, kondisi, dan status fungsi sarana belum tercatat di SIMITI."],
      };
    },
  },
  {
    id: "sumur_bor_panen_hujan",
    model: "Sumur bor / panen air hujan",
    hazards: ["kekeringan"],
    evaluate(ctx) {
      if (ctx.risk.tinggi + ctx.risk.sedang < 10) return null;
      const near = nearestOf(ctx.assets, ["sumur_bor"]);
      return {
        driver: (ctx.risk.tinggi + ctx.risk.sedang) * 0.8,
        status: "NEEDS_FIELD_VERIFICATION",
        reasons: [
          "Alternatif skala kecil untuk pasokan air pada wilayah dengan tekanan kekeringan.",
          near ? `Sumur bor terdekat ±${Math.round(near.jarak_m)} m.` : "Tidak ada sumur bor tercatat di sekitar titik.",
        ],
        checks: ["Potensi air tanah (geologi/hidrogeologi)", "Kebutuhan pengguna", "Kualitas air"],
        missing: ctx.layers.geology?.available ? [] : ["Data geologi/hidrogeologi belum tersedia."],
      };
    },
  },
  {
    id: "retensi",
    model: "Kolam retensi / situ / restorasi sempadan",
    hazards: ["banjir"],
    evaluate(ctx) {
      if (ctx.risk.tinggi + ctx.risk.sedang < 10) return null;
      const near = nearestOf(ctx.assets, WATER_STORAGE.concat(["pompa_air"]));
      return {
        driver: ctx.risk.tinggi + ctx.risk.sedang * 0.6,
        status: "NEEDS_FIELD_VERIFICATION",
        reasons: [
          `Risiko banjir Tinggi ${ctx.risk.tinggi}% dan Sedang ${ctx.risk.sedang}% dari area analisis.`,
          near ? `Sarana pengendali terdekat: ${near.table} ±${Math.round(near.jarak_m)} m.` : "Tidak ada situ/embung/pompa tercatat di sekitar titik.",
        ],
        checks: ["Hidrologi-hidraulika", "Kapasitas alur", "Sedimentasi", "Dampak hulu-hilir"],
        missing: [],
      };
    },
  },
  {
    id: "pengendali_aliran_sedimen",
    model: "Bangunan pengendali aliran dan sedimen",
    hazards: ["banjir_bandang", "longsor"],
    evaluate(ctx) {
      if (ctx.risk.tinggi + ctx.risk.sedang < 10) return null;
      const near = nearestOf(ctx.assets, ["pengendali_sedimen", "bendung"]);
      const erosi = ctx.layers.hydro_proxy?.available;
      return {
        driver: ctx.risk.tinggi + ctx.risk.sedang * 0.6,
        status: "NEEDS_FIELD_VERIFICATION",
        reasons: [
          `Risiko Tinggi ${ctx.risk.tinggi}% dan Sedang ${ctx.risk.sedang}% dari area analisis.`,
          erosi ? "Layer kerawanan erosi/limpasan beririsan dengan area (proxy hidrologi)." : "Layer proxy hidrologi tidak tersedia di sekitar titik.",
          near ? `Sarana terdekat: ${near.table} ±${Math.round(near.jarak_m)} m.` : "Tidak ada pengendali sedimen/bendung tercatat di sekitar titik.",
        ],
        checks: ["Hidrologi-hidraulika", "Sedimentasi dan stabilitas", "Dampak hulu-hilir", "Kajian keselamatan"],
        missing: erosi ? [] : ["Kelerengan/DEM dan proxy hidrologi belum tersedia."],
      };
    },
  },
  {
    id: "konservasi_tanah",
    model: "Konservasi tanah dan air (terasering, rorak, drainase lereng)",
    hazards: ["longsor", "banjir_bandang"],
    evaluate(ctx) {
      const kritis = classShare(ctx.layers.critical_land, /kritis/i, /tidak|potensial/i);
      if ((kritis ?? 0) < 10 && ctx.risk.tinggi < 20) return null;
      return {
        driver: Math.max(kritis ?? 0, ctx.risk.tinggi),
        status: "NEEDS_FIELD_VERIFICATION",
        reasons: [
          kritis !== null ? `Lahan kritis ±${kritis}% dari area analisis.` : "Data lahan kritis tidak tersedia di sekitar titik.",
          `Risiko Tinggi ${ctx.risk.tinggi}%.`,
        ],
        checks: ["Kemiringan dan stabilitas lereng", "Jenis tanah", "Tutupan lahan", "Geoteknik"],
        missing: ctx.layers.soil?.available ? [] : ["Data jenis tanah belum tersedia."],
      };
    },
  },
  {
    id: "sekat_kanal",
    model: "Sekat kanal dan pembasahan gambut",
    hazards: ["karhutla"],
    evaluate(ctx) {
      const gambut = ctx.layers.peat?.available;
      const share = classShare(ctx.layers.peat, /./, null);
      const base = {
        driver: ctx.risk.tinggi + ctx.risk.sedang * 0.6,
        checks: ["Kedalaman gambut dan hidrotopografi", "Jaringan kanal dan elevasi", "Dampak ke lahan sekitar"],
      };
      if (!gambut) {
        return {
          ...base,
          driver: 0,
          status: "NOT_ELIGIBLE",
          reasons: ["Tidak ada ekosistem gambut yang beririsan dengan area analisis; sekat kanal tidak relevan."],
          failed: ["peat_ecosystem_present"],
          missing: [],
        };
      }
      return {
        ...base,
        status: "NEEDS_FIELD_VERIFICATION",
        reasons: [
          `Ekosistem gambut beririsan ±${share ?? "?"}% dari area analisis; risiko karhutla Tinggi ${ctx.risk.tinggi}%.`,
        ],
        missing: ["Jaringan kanal dan kedalaman gambut belum tersedia sebagai layer."],
      };
    },
  },
  {
    id: "patroli_karhutla",
    model: "Patroli, pemantauan hotspot, dan kesiapsiagaan karhutla",
    hazards: ["karhutla"],
    evaluate(ctx) {
      if (ctx.risk.tinggi + ctx.risk.sedang < 10 && !(ctx.events > 0)) return null;
      return {
        driver: ctx.risk.tinggi + ctx.risk.sedang * 0.6 + Math.min(30, (ctx.events || 0) * 5),
        status: "ELIGIBLE_FOR_FURTHER_TECHNICAL_REVIEW",
        reasons: [
          `Risiko karhutla Tinggi ${ctx.risk.tinggi}%, Sedang ${ctx.risk.sedang}%.`,
          ctx.events > 0 ? `${ctx.events} kejadian tercatat di sekitar titik.` : "Tidak ada kejadian tercatat di sekitar titik.",
        ],
        checks: ["Akses dan sumber air", "Historis titik panas"],
        missing: ["Data hotspot eksternal (NASA FIRMS) belum diintegrasikan."],
      };
    },
  },
  {
    id: "rehabilitasi_lahan",
    model: "Rehabilitasi lahan kritis dan revegetasi",
    hazards: ["banjir", "banjir_bandang", "longsor", "karhutla", "kekeringan"],
    evaluate(ctx) {
      const kritis = classShare(ctx.layers.critical_land, /kritis/i, /tidak|potensial/i);
      if ((kritis ?? 0) < 15) return null;
      const near = nearestOf(ctx.assets, ["rehabilitasi_hutan", "rehabilitasi_das", "reforestasi_20232024", "restorasi_gambut"]);
      return {
        driver: kritis,
        status: "NEEDS_FIELD_VERIFICATION",
        reasons: [
          `Lahan kritis ±${kritis}% dari area analisis.`,
          near ? `Kegiatan rehabilitasi terdekat: ${near.table} ±${Math.round(near.jarak_m)} m — periksa duplikasi.` : "Tidak ada kegiatan rehabilitasi tercatat di sekitar titik.",
        ],
        checks: ["Kemiringan, jenis tanah, tutupan lahan", "Spesies lokal sesuai", "Status kawasan dan lahan"],
        missing: [],
      };
    },
  },
  {
    id: "rehabilitasi_das",
    model: "Rehabilitasi DAS (perlindungan hulu, konservasi tanah dan air)",
    hazards: ["banjir", "banjir_bandang", "longsor"],
    evaluate(ctx) {
      const kritis = classShare(ctx.layers.critical_land, /kritis/i, /tidak|potensial/i) ?? 0;
      if (!ctx.layers.watershed?.available || kritis < 10 || ctx.risk.tinggi < 10) return null;
      const das = ctx.layers.watershed.classes?.[0]?.kelas;
      return {
        driver: (kritis + ctx.risk.tinggi) / 2,
        status: "NEEDS_FIELD_VERIFICATION",
        reasons: [
          `Titik berada di DAS ${das || "(nama tidak tercatat)"}; lahan kritis ±${kritis}% dan risiko Tinggi ${ctx.risk.tinggi}%.`,
        ],
        checks: ["Prioritas sub-DAS", "Konektivitas hulu-hilir", "Status kawasan", "Penyebab degradasi"],
        missing: [],
      };
    },
  },
  {
    id: "ews",
    model: "Sistem peringatan dini dan kesiapsiagaan (nonstruktural)",
    hazards: ["banjir", "banjir_bandang", "longsor"],
    evaluate(ctx) {
      if (ctx.risk.tinggi < 20) return null;
      return {
        driver: ctx.risk.tinggi * 0.7,
        status: "ELIGIBLE_FOR_FURTHER_TECHNICAL_REVIEW",
        reasons: [`Risiko Tinggi ${ctx.risk.tinggi}% dari area analisis; langkah nonstruktural dapat berjalan paralel dengan intervensi fisik.`],
        checks: ["Cakupan sensor dan komunikasi", "Kesiapan masyarakat dan jalur evakuasi"],
        missing: [],
      };
    },
  },
  {
    id: "pesisir",
    model: "Rehabilitasi mangrove / pengaman pantai",
    hazards: ["abrasi"],
    evaluate(ctx) {
      if (ctx.risk.tinggi + ctx.risk.sedang < 10) return null;
      const near = nearestOf(ctx.assets, ["pengaman_pantai"]);
      return {
        driver: ctx.risk.tinggi + ctx.risk.sedang * 0.6,
        status: "NEEDS_FIELD_VERIFICATION",
        reasons: [
          `Risiko abrasi Tinggi ${ctx.risk.tinggi}% dan Sedang ${ctx.risk.sedang}%.`,
          near ? `Pengaman pantai terdekat ±${Math.round(near.jarak_m)} m.` : "Tidak ada pengaman pantai tercatat di sekitar titik.",
        ],
        checks: ["Karakteristik pantai dan arus", "Substrat untuk mangrove", "Dampak ke sekitar"],
        missing: ["Data garis pantai multitemporal belum tersedia."],
      };
    },
  },
];

const STATUS_ORDER = { ELIGIBLE_FOR_FURTHER_TECHNICAL_REVIEW: 0, NEEDS_FIELD_VERIFICATION: 1, NEEDS_DATA: 2, NOT_ELIGIBLE: 3 };

function priorityClass(score) {
  if (score === null) return "TIDAK_DIPRIORITASKAN";
  if (score >= 70) return "TINGGI";
  if (score >= 50) return "MENENGAH";
  return "RENDAH";
}

function applyRules(hazard, ctx, mcdaScore) {
  const base = Number.isFinite(mcdaScore) ? mcdaScore : 50;
  const out = [];
  for (const rule of RULES) {
    if (!rule.hazards.includes(hazard)) continue;
    const r = rule.evaluate(ctx);
    if (!r) continue;
    const driver = clamp(Number(r.driver) || 0, 0, 100);
    const blocked = r.status === "NOT_ELIGIBLE";
    // Skor indikatif: 60% skor MCDA wilayah + 40% kekuatan pendorong aturan.
    const score = blocked ? null : round1(0.6 * base + 0.4 * driver);
    out.push({
      rule_id: rule.id,
      model_type: rule.model,
      priority: priorityClass(blocked ? null : score),
      suitability_score: score,
      constraint_status: r.status,
      reasons: r.reasons,
      required_checks: r.checks,
      failed_constraints: r.failed || [],
      uncertainty: r.missing || [],
    });
  }
  return out.sort(
    (a, b) =>
      STATUS_ORDER[a.constraint_status] === 3 || STATUS_ORDER[b.constraint_status] === 3
        ? STATUS_ORDER[a.constraint_status] - STATUS_ORDER[b.constraint_status]
        : (b.suitability_score ?? -1) - (a.suitability_score ?? -1),
  ).map((item, i) => ({ recommendation_id: `REC-${String(i + 1).padStart(3, "0")}`, ...item }));
}

function createPointMitigationHandler(pool, deps) {
  const {
    loadSpatialEvidence, screenHazards, queryWithTimeout, loadSpatialCatalog, quoteIdent,
    pickClassColumn, RISK_TABLES, MITIGATION_TABLES, RELEVANT_MITIGATION, NAME_HINTS, VERSION,
  } = deps;

  /** Sarana mitigasi terdekat per tabel (jarak geodesik, meter). */
  async function nearestAssets(lat, lng, hazard) {
    const catalog = await loadSpatialCatalog(pool);
    const wanted = new Set([...(RELEVANT_MITIGATION[hazard] || []), ...WATER_STORAGE, "sumur_bor"]);
    const tables = MITIGATION_TABLES.filter((t) => wanted.has(t) && catalog.has(t));
    const rows = await Promise.all(tables.map(async (name) => {
      const entry = catalog.get(name);
      const g = quoteIdent(entry.geomColumn);
      const srid = entry.srid;
      const geomRaw = srid === 4326 ? `ST_SetSRID(t.${g}, 4326)` : `t.${g}`;
      const pointInSrid = srid === 4326 ? "p.g" : !srid ? "ST_SetSRID(p.g, 0)" : `ST_Transform(p.g, ${Number(srid)})`;
      const geom4326 = srid === 4326 ? geomRaw : !srid ? `ST_SetSRID(${geomRaw}, 4326)` : `ST_Transform(${geomRaw}, 4326)`;
      const nameCol = pickClassColumn(entry, NAME_HINTS);
      const nameSel = nameCol ? `NULLIF(BTRIM(t.${quoteIdent(nameCol)}::text), '')` : "NULL::text";
      try {
        const r = await queryWithTimeout(
          pool,
          `WITH p AS (SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326) AS g)
           SELECT ${nameSel} AS nama,
                  ST_Distance(${geom4326}::geography, p.g::geography) AS jarak_m,
                  ST_Y(ST_Centroid(${geom4326})) AS lat, ST_X(ST_Centroid(${geom4326})) AS lng
           FROM ${quoteIdent(entry.table)} t, p
           WHERE t.${g} IS NOT NULL
           ORDER BY ${geomRaw} <-> ${pointInSrid}
           LIMIT 1`,
          [lng, lat],
          8000,
        );
        const row = r.rows?.[0];
        if (!row) return { table: name, jarak_m: null };
        return {
          table: name,
          nama: row.nama,
          jarak_m: Number.isFinite(Number(row.jarak_m)) ? Math.round(Number(row.jarak_m)) : null,
          lat: Number(row.lat),
          lng: Number(row.lng),
        };
      } catch (error) {
        return { table: name, jarak_m: null, error: error?.code || "query_failed" };
      }
    }));
    return rows.filter((r) => r.jarak_m !== null);
  }

  return async function pointMitigation(req, res) {
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ success: false, code: "INVALID_POINT", message: "Koordinat titik tidak valid." });
    }
    const radius = clamp(Math.round(Number(req.body?.radius_m) || 1500), 200, 5000);
    const requested = String(req.body?.hazard || "").toLowerCase().trim().replace(/\s+/g, "_");
    const auto = ["", "auto", "semua", "all"].includes(requested);
    if (!auto && !RISK_TABLES[requested]) {
      return res.status(400).json({
        success: false, code: "INVALID_HAZARD",
        message: `Hazard tidak valid. Pilihan: auto, ${Object.keys(RISK_TABLES).join(", ")}.`,
      });
    }

    try {
      const buf = await queryWithTimeout(
        pool,
        `SELECT ST_AsGeoJSON(ST_Buffer(ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)::geometry) AS gj`,
        [lng, lat, radius],
      );
      const bufferGeom = JSON.parse(buf.rows[0].gj);
      const bufferStr = JSON.stringify(bufferGeom);
      const areaM2 = Math.PI * radius * radius;

      const screening = await screenHazards(pool, bufferStr, areaM2);
      const hazard = auto
        ? screening.find((s) => s.features > 0 || (s.events || 0) > 0)?.hazard || null
        : requested;

      const location = { lat, lng, radius_m: radius, geometry_type: "Point+Buffer", crs: "EPSG:4326", area_ha: Math.round(areaM2 / 100) / 100 };
      const base = {
        success: true,
        analysis_id: `SIM-PT-${Date.now().toString(36).toUpperCase()}`,
        location,
        buffer: { type: "Feature", properties: { radius_m: radius }, geometry: bufferGeom },
        hazard_screening: screening,
        model_version: `${VERSION}/${MODEL_VERSION}`,
        created_at: new Date().toISOString(),
        verification_status: "BELUM_DIVERIFIKASI",
        ai_used: false,
      };

      if (!hazard) {
        return res.json({
          ...base,
          hazard: null,
          no_mapped_risk: true,
          diagnosis: [],
          recommendations: [],
          data_status: { internal_layers_used: [], external_sources_used: [], missing_data: ["Tidak ada poligon risiko atau kejadian di sekitar titik."], data_quality: "INSUFFICIENT" },
          message: `Tidak ada data risiko maupun kejadian dalam radius ${radius} m dari titik. Perbesar radius atau pilih titik lain; ini tidak berarti lokasi bebas bencana.`,
        });
      }

      const [{ evidence, mapLayers }, assets] = await Promise.all([
        loadSpatialEvidence(pool, hazard, { geometry: bufferGeom }),
        nearestAssets(lat, lng, hazard),
      ]);

      const ctx = {
        hazard,
        risk: riskShares(evidence),
        layers: evidence.supporting_layers || {},
        assets,
        events: evidence.event_history?.available ? evidence.event_history.count : null,
      };
      const mcda = evidence.mcda;
      const recommendations = applyRules(hazard, ctx, mcda?.score).map((r) => ({
        ...r,
        geometry: { type: "Point", coordinates: [lng, lat] },
        geometry_note: "Titik yang Anda pilih; lokasi tepat penerapan ditentukan setelah verifikasi lapangan.",
        existing_assets: assets
          .filter((a) => (RELEVANT_MITIGATION[hazard] || []).includes(a.table) || WATER_STORAGE.includes(a.table))
          .slice(0, 4),
        verification_status: "BELUM_DIVERIFIKASI",
      }));

      const layersUsed = Object.entries(evidence.supporting_layers || {})
        .filter(([, v]) => v?.available || v?.layers?.some?.((l) => l.available))
        .map(([k]) => k);
      const missing = Object.entries(evidence.supporting_layers || {})
        .filter(([k, v]) => k !== "hydro_proxy" && !v?.available)
        .map(([, v]) => `${v?.label || "layer"}: ${v?.error ? "gagal dioverlay" : "tidak ada fitur / tabel tidak ditemukan"}`);

      return res.json({
        ...base,
        hazard,
        hazard_source: auto ? "auto" : "user",
        no_mapped_risk: false,
        diagnosis: [
          {
            issue: `Risiko ${hazard.replace("_", " ")}`,
            severity: ctx.risk.tinggi >= 30 ? "TINGGI" : ctx.risk.tinggi + ctx.risk.sedang >= 30 ? "SEDANG" : "RENDAH",
            shares_percent: ctx.risk,
            evidence: [evidence.risk_table, ...(evidence.event_history?.available ? ["kejadian"] : [])],
            events_in_radius: ctx.events,
          },
        ],
        mcda,
        recommendations,
        nearest_assets: assets,
        evidence_summary: {
          risk_classes: evidence.risk_classes,
          supporting_layers: Object.fromEntries(
            Object.entries(evidence.supporting_layers || {}).map(([k, v]) => [
              k,
              v?.layers ? { available: v.available } : { available: v?.available, source_table: v?.source_table, classes: (v?.classes || []).slice(0, 3) },
            ]),
          ),
        },
        data_status: {
          internal_layers_used: [evidence.risk_table, ...layersUsed],
          external_sources_used: [],
          missing_data: [...missing, "Data eksternal (BMKG, satelit) belum diintegrasikan."],
          data_quality: mcda?.low_coverage ? "REVIEW_REQUIRED" : "ACCEPTABLE",
        },
        map_layers: mapLayers,
        limitations: [
          "Skor bersifat indikatif (60% skor MCDA wilayah + 40% kekuatan pendorong aturan) dan bukan probabilitas keberhasilan.",
          "Jarak ke sarana eksisting adalah jarak lurus, bukan jarak hidrologis.",
          "Rekomendasi adalah kandidat sampai diverifikasi ahli dan survei lapangan.",
        ],
      });
    } catch (error) {
      console.error("[AI POINT] gagal:", error?.code || error?.message);
      return res.status(500).json({
        success: false,
        code: "POINT_ANALYSIS_FAILED",
        message: error?.userFacing ? error.message : "Analisis titik gagal diproses. Coba kurangi radius atau ulangi.",
      });
    }
  };
}

module.exports = { createPointMitigationHandler, _internal: { applyRules, riskShares, classShare, nearestOf, RULES } };
