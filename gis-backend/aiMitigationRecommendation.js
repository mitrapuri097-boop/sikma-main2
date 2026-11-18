"use strict";

/**
 * SIMITI — AI Mitigation Recommendation (router Express).
 *
 * Alur (Rancangan Logika AI SIMITI, bab 6):
 *   1. Wilayah terpilih (GeoJSON) → 2. ekstraksi layer PostGIS
 *   3. diagnosis risiko + histori kejadian → 4. sarana mitigasi eksisting
 *   5–6. skor MCDA deterministik (aiMitigationScoring.js)
 *   7. OpenAI menyusun diagnosis & memilih intervensi dari katalog, berbasis bukti.
 *
 * Env:
 *   OPENAI_API_KEY          (wajib)  key OpenAI, hanya di server
 *   OPENAI_MODEL            (opsional, default gpt-6-luna)
 *   OPENAI_TIMEOUT_MS       (opsional, default 90000)
 *   AI_REQUIRE_AUTH         (opsional, default true) wajib login (JWT_SECRET sama dgn server.js)
 *   AI_RATE_LIMIT_PER_HOUR  (opsional, default 30 per pengguna)
 *   AI_CACHE_TTL_MINUTES    (opsional, default 30)
 *   AI_EVIDENCE_QUERY_TIMEOUT_MS (opsional, default 15000 per query PostGIS)
 */

const crypto = require("crypto");
const express = require("express");
const jwt = require("jsonwebtoken");
const OpenAI = require("openai");
const { computeMcda } = require("./aiMitigationScoring");

const VERSION = "SIMITI-AI-MITIGATION-V5.0";
// gpt-4.1-mini dihentikan OpenAI 14 Jan 2027; pengganti resminya gpt-6-luna.
const DEFAULT_MODEL = "gpt-6-luna";

const CATALOG = {
  banjir: [
    ["drainase", "Rehabilitasi / peningkatan sistem drainase"],
    ["retensi", "Kolam retensi / detensi"],
    ["pompa", "Peningkatan / penyediaan sistem pompa air"],
    ["sungai", "Pengelolaan dan peningkatan kapasitas alur sungai"],
    ["tanggul", "Pengendalian luapan / perlindungan tebing dan tanggul"],
    ["resapan", "Sumur resapan / infrastruktur infiltrasi"],
    ["ews_banjir", "Sistem peringatan dini banjir"],
  ],
  banjir_bandang: [
    ["aliran_sedimen", "Bangunan pengendali aliran dan sedimen"],
    ["sungai", "Pengelolaan alur sungai dan sempadan"],
    ["rehab_hulu", "Rehabilitasi kawasan hulu"],
    ["ews_banjir_bandang", "Sistem peringatan dini banjir bandang"],
    ["jalur_evakuasi", "Penguatan jalur dan kesiapsiagaan evakuasi"],
  ],
  longsor: [
    ["drainase_lereng", "Drainase lereng"],
    ["stabilisasi_lereng", "Stabilisasi / penguatan lereng"],
    ["revegetasi", "Revegetasi dan penguatan vegetasi lereng"],
    ["erosi_sedimen", "Pengendalian erosi dan sedimentasi"],
    ["ews_longsor", "Sistem peringatan dini longsor"],
    ["tata_ruang", "Pengendalian pemanfaatan ruang pada zona rawan"],
  ],
  karhutla: [
    ["sekat_kanal", "Penguatan sekat kanal dan pembasahan gambut"],
    ["restorasi_gambut", "Restorasi dan rehabilitasi ekosistem gambut"],
    ["ews_karhutla", "Monitoring hotspot dan sistem peringatan dini karhutla"],
    ["patroli", "Patroli, pencegahan dan pengelolaan bahan bakar vegetasi"],
    ["sumber_air", "Penyediaan / penguatan sumber air untuk pemadaman"],
    ["rehab_lahan", "Rehabilitasi hutan dan lahan kritis"],
  ],
  kekeringan: [
    ["embung", "Embung / tampungan air"],
    ["panen_hujan", "Panen air hujan"],
    ["infiltrasi", "Infrastruktur resapan dan konservasi air"],
    ["irigasi", "Peningkatan efisiensi dan keandalan irigasi"],
    ["sumber_air", "Penguatan sumber air alternatif"],
    ["konservasi_air", "Konservasi tanah dan air"],
  ],
  abrasi: [
    ["mangrove", "Rehabilitasi / restorasi mangrove"],
    ["perlindungan_pantai", "Perlindungan pantai sesuai karakteristik lokasi"],
    ["sempadan_pantai", "Pengelolaan sempadan dan zona penyangga pantai"],
    ["vegetasi_pantai", "Penguatan vegetasi pantai"],
    ["monitoring_garis_pantai", "Monitoring perubahan garis pantai"],
  ],
};

const RISK_TABLES = Object.freeze({
  banjir: "risiko_banjir",
  banjir_bandang: "risiko_banjir_bandang",
  longsor: "risiko_longsor",
  karhutla: "risiko_karhutla",
  kekeringan: "risiko_kekeringan",
  abrasi: "risiko_abrasi",
});

const EVENT_MAPPING = Object.freeze({
  banjir: ["banjir"],
  banjir_bandang: ["banjir", "banjir bandang"],
  longsor: ["tanah longsor dan erosi"],
  karhutla: ["kebakaran hutan dan kekeringan"],
  kekeringan: ["kebakaran hutan dan kekeringan"],
  abrasi: [],
});

// ------------------------------------------------------------------
// Konfigurasi layer pendukung. Nama tabel eksplisit diambil dari daftar
// layer SIMITI (/api/layers); pola nama dipakai sebagai cadangan bila
// tabel di-rename. Tabel kegiatan mitigasi tidak boleh terdeteksi sebagai
// layer kondisi wilayah (mis. rehabilitasi_das bukan batas DAS).
// ------------------------------------------------------------------
const MITIGATION_TABLES = Object.freeze([
  "sekat_kanal", "sumur_bor", "bendung", "bendungan", "embung", "danau",
  "situ", "pengaman_pantai", "pompa_air", "pengendali_sedimen",
  "reforestasi_20232024", "dta_danau", "rehabilitasi_das",
  "rehabilitasi_hutan", "restorasi_gambut", "penerapan_teknik_kta",
]);

const SUPPORTING_LAYERS = Object.freeze({
  critical_land: {
    label: "Lahan kritis",
    tables: ["lahan_kritis"],
    patterns: ["lahan_kritis", "lahan_krit"],
    classHints: ["kritis", "kelas_kritis", "tingkat_kritis", "klas_kritis", "kelas", "klas", "kategori", "keterangan", "ket"],
  },
  land_cover: {
    label: "Tutupan / penutupan lahan",
    tables: ["penutupan_lahan_2024"],
    patterns: ["penutupan_lahan", "tutupan_lahan", "land_cover", "penggunaan_lahan"],
    classHints: ["pl24", "pl_24", "pl2024", "penutupan", "tutupan", "pl", "kelas", "klasifikasi", "kls", "deskripsi", "keterangan", "ket", "nama"],
  },
  rainfall: {
    label: "Curah hujan tahunan",
    tables: ["curah_hujan_tahunan"],
    patterns: ["curah_hujan", "curahhujan", "rainfall"],
    classHints: ["ch", "curah_hujan", "curah", "ch_tahunan", "kelas", "range", "rentang", "nilai", "keterangan", "ket"],
  },
  slope: {
    label: "Kelerengan",
    tables: [],
    patterns: ["kelerengan", "kemiringan", "lereng", "slope"],
    classHints: ["kelas", "lereng", "kemiringan", "slope", "keterangan"],
  },
  geology: {
    label: "Geologi",
    tables: ["geologi"],
    patterns: ["geologi", "litologi"],
    classHints: ["litologi", "lithology", "batuan", "jenis_batuan", "satuan", "nama_satuan", "formasi", "nama_formasi", "keterangan", "kelas", "deskripsi"],
    excludeColumns: ["das"],
  },
  soil: {
    label: "Jenis tanah",
    tables: ["jenis_tanah"],
    patterns: ["jenis_tanah"],
    classHints: ["jenis_tanah", "jenis", "tanah", "soil", "kelas", "keterangan", "nama"],
  },
  peat: {
    label: "Ekosistem gambut",
    tables: ["ekosistem_gambut"],
    patterns: ["gambut"],
    classHints: ["fungsi", "fungsi_ekosistem", "kelas", "keterangan", "nama"],
  },
  forest_area: {
    label: "Kawasan hutan",
    tables: ["kawasan_hutan"],
    patterns: ["kawasan_hutan"],
    classHints: ["fungsi", "fungsikws", "fungsi_kws", "kawasan", "kelas", "keterangan", "nama"],
  },
  watershed: {
    label: "DAS",
    tables: ["das_adm"],
    patterns: ["batas_das", "das_adm"],
    classHints: ["nama_das", "das", "nama"],
  },
});

// Proxy hidrologi/topografi per hazard (kelerengan/DEM belum ada di SIMITI).
const HYDRO_PROXY_TABLES = Object.freeze({
  banjir: ["rawan_limpasan"],
  banjir_bandang: ["rawan_limpasan", "rawan_erosi"],
  longsor: ["rawan_erosi", "rawan_longsor"],
  karhutla: ["ekosistem_gambut", "rawan_karhutla"],
  kekeringan: [],
  abrasi: [],
});

// Sarana mitigasi eksisting yang relevan per hazard (tahap 4 rancangan).
const RELEVANT_MITIGATION = Object.freeze({
  banjir: ["embung", "situ", "danau", "bendung", "bendungan", "pompa_air", "pengendali_sedimen", "rehabilitasi_das", "penerapan_teknik_kta"],
  banjir_bandang: ["pengendali_sedimen", "bendung", "bendungan", "rehabilitasi_das", "rehabilitasi_hutan", "penerapan_teknik_kta"],
  longsor: ["penerapan_teknik_kta", "pengendali_sedimen", "rehabilitasi_hutan", "rehabilitasi_das", "reforestasi_20232024"],
  karhutla: ["sekat_kanal", "sumur_bor", "restorasi_gambut", "embung", "rehabilitasi_hutan"],
  kekeringan: ["embung", "sumur_bor", "situ", "danau", "bendung", "bendungan", "dta_danau"],
  abrasi: ["pengaman_pantai"],
});

const EXCLUDED_CLASS_COLUMNS = new Set([
  "id", "gid", "fid", "objectid", "object_id", "shape_area", "shape_leng",
  "shape_length", "luas", "luas_ha", "luas_m2", "area", "created_at",
  "updated_at", "geom", "geom_valid", "geometry", "the_geom", "wkb_geometry",
]);
const CLASS_COLUMN_TYPES = new Set([
  "text", "character varying", "character", "integer", "bigint", "smallint",
  "numeric", "double precision", "real",
]);

const QUERY_TIMEOUT_MS = Number(process.env.AI_EVIDENCE_QUERY_TIMEOUT_MS || 15000);

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/** Jalankan query dengan statement_timeout lokal agar wilayah besar tidak menggantung. */
async function queryWithTimeout(pool, sql, params, timeoutMs = QUERY_TIMEOUT_MS) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL statement_timeout = ${Math.max(1000, Number(timeoutMs) | 0)}`);
    const result = await client.query(sql, params);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch (_) { /* ignore */ }
    throw error;
  } finally {
    client.release();
  }
}

/** Jalankan fungsi async dengan batas paralel. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

let spatialCatalogCache = null;
let spatialCatalogLoadedAt = 0;

/** Katalog tabel spasial (geometry_columns + kolom atribut), di-cache 10 menit. */
async function loadSpatialCatalog(pool) {
  if (spatialCatalogCache && Date.now() - spatialCatalogLoadedAt < 10 * 60 * 1000) {
    return spatialCatalogCache;
  }
  const geomRows = await pool.query(`
    SELECT f_table_name AS table_name, f_geometry_column AS geom_column, srid
    FROM geometry_columns
    WHERE f_table_schema = 'public'
  `);
  const columnRows = await pool.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `);

  const catalog = new Map();
  for (const row of geomRows.rows || []) {
    const name = row.table_name;
    const entry = catalog.get(name) || { table: name, geoms: [], columns: [] };
    entry.geoms.push({ column: row.geom_column, srid: Number(row.srid) || 0 });
    catalog.set(name, entry);
  }
  for (const row of columnRows.rows || []) {
    const entry = catalog.get(row.table_name);
    if (entry) entry.columns.push({ name: row.column_name, type: row.data_type });
  }
  for (const entry of catalog.values()) {
    const withKnownSrid = entry.geoms.find((g) => g.srid > 0);
    const tableSrid = withKnownSrid ? withKnownSrid.srid : (entry.geoms[0]?.srid || 0);
    const preferred =
      entry.geoms.find((g) => g.column === "geom_valid") ||
      entry.geoms.find((g) => g.column === "geom") ||
      entry.geoms[0];
    entry.geomColumn = preferred.column;
    entry.srid = preferred.srid || tableSrid;
  }

  spatialCatalogCache = catalog;
  spatialCatalogLoadedAt = Date.now();
  return catalog;
}

const TEXT_TYPES = new Set(["text", "character varying", "character"]);
const isCodeLike = (name) => /(^|_)(id|kode|kd|code|fid|objectid)$|^(kode|kd)_/i.test(name);

/** Kolom kandidat kelas: tipe sesuai, bukan kolom teknis, tidak dikecualikan. */
function classColumnCandidates(entry, excludeColumns = []) {
  return entry.columns.filter((c) => {
    const n = c.name.toLowerCase();
    return CLASS_COLUMN_TYPES.has(c.type) &&
      !EXCLUDED_CLASS_COLUMNS.has(n) &&
      !excludeColumns.some((x) => n.includes(x));
  });
}

/**
 * Pilih kolom kelas dari petunjuk nama. Kolom teks deskriptif diutamakan
 * daripada kolom kode/ID numerik (mis. pl2024_id) yang tidak bisa dibaca AI.
 */
function pickClassColumn(entry, hints, excludeColumns = []) {
  const usable = classColumnCandidates(entry, excludeColumns);
  const tiers = [
    usable.filter((c) => TEXT_TYPES.has(c.type) && !isCodeLike(c.name)),
    usable.filter((c) => !isCodeLike(c.name)),
    usable,
  ];
  for (const pool of tiers) {
    for (const hint of hints || []) {
      const exact = pool.find((c) => c.name.toLowerCase() === hint);
      if (exact) return exact.name;
    }
    for (const hint of hints || []) {
      if (hint.length < 3) continue;
      const partial = pool.find((c) => c.name.toLowerCase().includes(hint));
      if (partial) return partial.name;
    }
  }
  return null;
}

function resolveTables(catalog, config) {
  const found = [];
  for (const name of config.tables || []) {
    if (catalog.has(name)) found.push(catalog.get(name));
  }
  if (found.length) return found;
  for (const entry of catalog.values()) {
    const n = entry.table.toLowerCase();
    if (MITIGATION_TABLES.includes(n)) continue;
    if ((config.patterns || []).some((p) => n.includes(p))) found.push(entry);
  }
  return found.slice(0, 2);
}

/** Ekspresi SQL: wilayah terpilih ($1, EPSG:4326) dalam SRID tabel. */
function areaInTableSrid(srid) {
  if (srid === 4326) return "a.geom";
  // SRID 0 = tabel tanpa SRID terdaftar; diasumsikan koordinat geografis.
  if (!srid) return "ST_SetSRID(a.geom, 0)";
  return `ST_Transform(a.geom, ${Number(srid)})`;
}

function areaM2Expr(expr, srid) {
  const withSrid = srid ? expr : `ST_SetSRID(${expr}, 4326)`;
  return `ST_Area(ST_Transform(${withSrid}, 6933))`;
}

const SELECTED_AREA_CTE = `
  WITH a AS (
    SELECT ST_CollectionExtract(
      ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)), 3
    ) AS geom
  )
`;

/**
 * Ringkas satu layer pendukung terhadap wilayah: luas cakupan, porsi wilayah,
 * dan kelas dominan (bila kolom kelas dapat diidentifikasi).
 */
/**
 * Bila tidak ada kolom yang cocok dengan petunjuk nama, pilih kolom teks
 * dengan jumlah nilai unik paling wajar (2–40) pada fitur yang beririsan.
 */
async function detectClassColumnByData(pool, entry, geometry, excludeColumns, whereSql) {
  const textCols = classColumnCandidates(entry, excludeColumns)
    .filter((c) => TEXT_TYPES.has(c.type) && !isCodeLike(c.name))
    .slice(0, 12);
  if (!textCols.length) return null;
  const qTable = quoteIdent(entry.table);
  const selects = textCols
    .map((c, i) => `COUNT(DISTINCT NULLIF(BTRIM(t.${quoteIdent(c.name)}::text), '')) AS d${i}`)
    .join(", ");
  try {
    const result = await queryWithTimeout(
      pool,
      `${SELECTED_AREA_CTE}
       SELECT ${selects} FROM (
         SELECT t.* FROM ${qTable} t CROSS JOIN a WHERE ${whereSql} LIMIT 5000
       ) t`,
      [geometry],
    );
    const row = result.rows?.[0] || {};
    const ranked = textCols
      .map((c, i) => ({ name: c.name, distinct: Number(row[`d${i}`] || 0) }))
      .filter((c) => c.distinct >= 2 && c.distinct <= 40)
      .sort((x, y) => x.distinct - y.distinct);
    return ranked[0]?.name || null;
  } catch (error) {
    return null;
  }
}

/**
 * Ringkas satu layer pendukung terhadap wilayah: luas cakupan, porsi wilayah,
 * dan kelas dominan (bila kolom kelas dapat diidentifikasi).
 */
async function summarizeLayer(pool, entry, geometry, selectedAreaM2, classHints, excludeColumns = []) {
  const srid = entry.srid; // 0 = tidak diketahui
  const qTable = quoteIdent(entry.table);
  const qGeom = quoteIdent(entry.geomColumn);
  const areaExpr = areaInTableSrid(srid);

  const rawGeom = srid === 4326 ? `ST_SetSRID(t.${qGeom}, 4326)` : `t.${qGeom}`;
  const buildWhere = (geomRef) => `t.${qGeom} IS NOT NULL
      AND ${rawGeom} && ${areaExpr}
      AND ST_Intersects(${geomRef}, ${areaExpr})`;

  let classColumn = pickClassColumn(entry, classHints, excludeColumns);
  let classSource = classColumn ? "nama kolom" : null;
  if (!classColumn) {
    classColumn = await detectClassColumnByData(pool, entry, geometry, excludeColumns, buildWhere(rawGeom));
    if (classColumn) classSource = "deteksi otomatis nilai unik";
  }
  const classSelect = classColumn
    ? `COALESCE(NULLIF(BTRIM(t.${quoteIdent(classColumn)}::text), ''), 'Tidak diketahui')`
    : `'(tanpa kolom kelas)'::text`;

  const isValidColumn = entry.geomColumn === "geom_valid";
  const fixedGeom = isValidColumn ? rawGeom : `ST_MakeValid(${rawGeom})`;
  const interExpr = `ST_CollectionExtract(ST_Intersection(${fixedGeom}, ${areaExpr}), 3)`;

  // repairPredicate=false: predikat pada geometri asli (cepat, pakai indeks).
  // repairPredicate=true : predikat juga pada geometri yang diperbaiki.
  const buildSql = (repairPredicate) => `
    ${SELECTED_AREA_CTE}
    SELECT ${classSelect} AS kelas,
           COUNT(*)::bigint AS jumlah_fitur,
           COALESCE(SUM(${areaM2Expr(interExpr, srid)}), 0)::float8 AS luas_m2
    FROM ${qTable} t CROSS JOIN a
    WHERE ${buildWhere(repairPredicate ? fixedGeom : rawGeom)}
    GROUP BY 1
    ORDER BY luas_m2 DESC
    LIMIT 12
  `;

  let result;
  let lastError = null;
  // Percobaan 1: predikat pada geometri asli (cepat). Percobaan 2: geometri
  // diperbaiki dengan ST_MakeValid (untuk TopologyException / geometri invalid).
  for (const repairPredicate of [false, true]) {
    try {
      result = await queryWithTimeout(pool, buildSql(repairPredicate), [geometry]);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (error?.code === "57014") break; // timeout: jangan diulang
    }
  }

  if (lastError) {
    const timedOut = lastError?.code === "57014";
    const detail = String(lastError?.message || "").slice(0, 160);
    console.warn("[AI MITIGATION] layer summary failed:", entry.table, lastError?.code, detail);
    return {
      available: false,
      source_table: entry.table,
      class_column: classColumn,
      features: 0,
      classes: [],
      error: { code: lastError?.code || null, message: detail },
      note: timedOut
        ? "Query melebihi batas waktu (wilayah terlalu luas); pilih wilayah yang lebih kecil."
        : `Layer gagal dioverlay dengan wilayah terpilih (${lastError?.code || "error"}: ${detail}).`,
    };
  }

  const classes = (result.rows || []).map((row) => ({
    kelas: row.kelas,
    jumlah_fitur: Number(row.jumlah_fitur || 0),
    luas_m2: Math.round(Number(row.luas_m2 || 0)),
    persen_wilayah: selectedAreaM2 > 0
      ? Math.round((Number(row.luas_m2 || 0) / selectedAreaM2) * 1000) / 10
      : null,
  }));
  const covered = classes.reduce((s, c) => s + c.luas_m2, 0);
  const features = classes.reduce((s, c) => s + c.jumlah_fitur, 0);
  return {
    available: features > 0,
    source_table: entry.table,
    class_column: classColumn,
    class_column_source: classSource,
    features,
    area_m2: Math.round(selectedAreaM2),
    covered_m2: covered,
    coverage_ratio: selectedAreaM2 > 0 ? Math.min(1, covered / selectedAreaM2) : 0,
    classes: classColumn ? classes.slice(0, 8) : [],
    note: features > 0
      ? (classColumn
        ? `Kelas dibaca dari kolom "${classColumn}" (${classSource}).`
        : "Fitur beririsan, tetapi kolom kelas tidak dapat diidentifikasi.")
      : "Tidak ada fitur yang beririsan dengan wilayah terpilih.",
  };
}

async function loadSupportingLayerEvidence(pool, hazard, geometry, selectedAreaM2) {
  const catalog = await loadSpatialCatalog(pool);
  const jobs = [];

  for (const [key, config] of Object.entries(SUPPORTING_LAYERS)) {
    const tables = resolveTables(catalog, config);
    if (!tables.length) {
      jobs.push({ key, missing: true, label: config.label });
      continue;
    }
    jobs.push({ key, entry: tables[0], label: config.label, hints: config.classHints, exclude: config.excludeColumns || [] });
  }

  const results = await mapLimit(jobs, 4, async (job) => {
    if (job.missing) {
      return [job.key, {
        label: job.label,
        available: false,
        source_table: null,
        classes: [],
        note: "Tabel layer ini belum ditemukan di database SIMITI.",
      }];
    }
    const summary = await summarizeLayer(pool, job.entry, geometry, selectedAreaM2, job.hints, job.exclude);
    return [job.key, { label: job.label, ...summary }];
  });

  const supporting = Object.fromEntries(results);

  const proxyNames = HYDRO_PROXY_TABLES[hazard] || [];
  const proxyLayers = await mapLimit(
    proxyNames.filter((name) => catalog.has(name)),
    3,
    (name) => summarizeLayer(pool, catalog.get(name), geometry, selectedAreaM2, ["kelas", "klas", "kategori", "keterangan", "fungsi"]),
  );
  supporting.hydro_proxy = {
    label: "Proxy hidrologi/topografi",
    available: proxyLayers.some((layer) => layer.available),
    layers: proxyLayers,
    note: proxyNames.length
      ? "Kelerengan/DEM belum tersedia; dipakai layer kerawanan hidrologis terkait sebagai proxy."
      : "Belum ada layer proxy hidrologi untuk hazard ini.",
  };

  return supporting;
}

/** Tahap 4: sarana mitigasi eksisting di dalam wilayah. */
async function loadExistingMitigation(pool, hazard, geometry) {
  const catalog = await loadSpatialCatalog(pool);
  const relevant = new Set(RELEVANT_MITIGATION[hazard] || []);
  const tables = MITIGATION_TABLES.filter((name) => catalog.has(name));

  const rows = await mapLimit(tables, 4, async (name) => {
    const entry = catalog.get(name);
    const qTable = quoteIdent(entry.table);
    const qGeom = quoteIdent(entry.geomColumn);
    const areaExpr = areaInTableSrid(entry.srid);
    const rawGeom = entry.srid === 4326 ? `ST_SetSRID(t.${qGeom}, 4326)` : `t.${qGeom}`;
    try {
      const result = await queryWithTimeout(
        pool,
        `${SELECTED_AREA_CTE}
         SELECT COUNT(*)::bigint AS n
         FROM ${qTable} t CROSS JOIN a
         WHERE t.${qGeom} IS NOT NULL
           AND ${rawGeom} && ${areaExpr}
           AND ST_Intersects(${rawGeom}, ${areaExpr})`,
        [geometry],
      );
      return { table: name, count: Number(result.rows?.[0]?.n || 0), relevant: relevant.has(name) };
    } catch (error) {
      return { table: name, count: null, relevant: relevant.has(name), note: "Gagal dibaca." };
    }
  });

  const present = rows.filter((row) => row.count > 0);
  return {
    checked: rows.some((row) => row.count !== null),
    relevant_tables: Array.from(relevant),
    relevant_total: rows
      .filter((row) => row.relevant && row.count)
      .reduce((sum, row) => sum + row.count, 0),
    by_table: present.length ? present : [],
    missing_tables: Array.from(relevant).filter((name) => !catalog.has(name)),
    note:
      "Jumlah fitur sarana yang beririsan dengan wilayah; kondisi, kapasitas, dan status fungsi belum dinilai dan perlu verifikasi.",
  };
}
function parsePolygonGeometry(value) {
  if (typeof value === "string") {
    if (value.length > 5 * 1024 * 1024) {
      throw new Error("GeoJSON wilayah melebihi batas 5 MiB.");
    }
    value = JSON.parse(value);
  }

  if (value && value.type === "Feature") value = value.geometry;

  if (
    !value ||
    !["Polygon", "MultiPolygon"].includes(value.type) ||
    !Array.isArray(value.coordinates)
  ) {
    throw new Error("Geometri wilayah harus berupa GeoJSON Polygon/MultiPolygon.");
  }

  const serialized = JSON.stringify(value);
  if (serialized.length > 5 * 1024 * 1024) {
    throw new Error("GeoJSON wilayah melebihi batas 5 MiB.");
  }

  return serialized;
}

function resolveArea(context) {
  const areas = Array.isArray(context.selected_areas) ? context.selected_areas : [];

  for (let i = areas.length - 1; i >= 0; i--) {
    const area = areas[i];
    if (area && (area.geom || area.geometry)) return area;
  }

  if (context.area && (context.area.geom || context.area.geometry)) {
    return context.area;
  }

  return null;
}

function getCatalogItems(hazard) {
  const entry = CATALOG && CATALOG[hazard];
  return Array.isArray(entry) ? entry : [];
}

function catalogTitle(item) {
  if (Array.isArray(item)) return String(item[1] ?? item[0] ?? "").trim();
  return String(item?.intervention || item?.title || item?.name || item || "").trim();
}

function catalogId(item, index) {
  if (Array.isArray(item)) return String(item[0] ?? index + 1).trim();
  return String(item?.intervention_id || item?.id || index + 1).trim();
}

async function loadSpatialEvidence(pool, hazard, area) {
  const geometry = parsePolygonGeometry(area.geom || area.geometry);

  const areaResult = await queryWithTimeout(
    pool,
    `${SELECTED_AREA_CTE}
     SELECT ST_Area(ST_Transform(a.geom, 6933))::float8 AS luas_m2,
            ST_IsEmpty(a.geom) AS kosong
     FROM a`,
    [geometry],
  );
  const selectedAreaM2 = Number(areaResult.rows?.[0]?.luas_m2 || 0);
  if (areaResult.rows?.[0]?.kosong || selectedAreaM2 <= 0) {
    throw Object.assign(new Error("Geometri wilayah kosong atau tidak valid."), { userFacing: true });
  }

  const riskSql = `
    ${SELECTED_AREA_CTE}
    SELECT
      COALESCE(NULLIF(BTRIM(r.kelas), ''), 'Tidak diketahui') AS kelas,
      COUNT(*)::bigint AS jumlah_fitur,
      ROUND(
        COALESCE(
          SUM(ST_Area(ST_Transform(ST_Intersection(r.geom_valid, a.geom), 6933))),
          0
        )::numeric,
        2
      ) AS luas_interseksi_m2
    FROM ${RISK_TABLES[hazard]} r
    CROSS JOIN a
    WHERE r.geom_valid IS NOT NULL
      AND NOT ST_IsEmpty(r.geom_valid)
      AND r.geom_valid && a.geom
      AND ST_Intersects(r.geom_valid, a.geom)
    GROUP BY COALESCE(NULLIF(BTRIM(r.kelas), ''), 'Tidak diketahui')
    ORDER BY MIN(
      CASE LOWER(COALESCE(r.kelas, ''))
        WHEN 'sangat tinggi' THEN 1
        WHEN 'tinggi' THEN 2
        WHEN 'sedang' THEN 3
        WHEN 'rendah' THEN 4
        ELSE 5
      END
    )
  `;

  const riskResult = await queryWithTimeout(pool, riskSql, [geometry]);

  const eventCategories = EVENT_MAPPING[hazard] || [];
  let eventEvidence = {
    available: false,
    count: null,
    first_date: null,
    last_date: null,
    limitation: "Kategori kejadian yang sepadan tidak tersedia untuk hazard ini.",
  };

  if (eventCategories.length) {
    const eventSql = `
      ${SELECTED_AREA_CTE}
      SELECT
        COUNT(*)::bigint AS jumlah,
        MIN(k.date) AS tanggal_pertama,
        MAX(k.date) AS tanggal_terakhir
      FROM kejadian k
      CROSS JOIN a
      WHERE k.longitude BETWEEN -180 AND 180
        AND k.latitude BETWEEN -90 AND 90
        AND LOWER(BTRIM(COALESCE(k.category, ''))) = ANY($2::text[])
        AND ST_Covers(a.geom, ST_SetSRID(ST_MakePoint(k.longitude, k.latitude), 4326))
    `;

    const eventResult = await queryWithTimeout(pool, eventSql, [geometry, eventCategories]);
    const event = eventResult.rows[0] || {};

    eventEvidence = {
      available: true,
      count: Number(event.jumlah || 0),
      first_date: event.tanggal_pertama || null,
      last_date: event.tanggal_terakhir || null,
      limitation:
        hazard === "banjir_bandang"
          ? "Kategori sumber hanya mencatat Banjir; kejadian banjir bandang tidak dapat dipisahkan secara pasti."
          : hazard === "karhutla" || hazard === "kekeringan"
            ? "Kategori sumber menggabungkan kebakaran hutan dan kekeringan; hitungan tidak dapat dipisahkan per hazard."
            : null,
    };
  }

  const classes = riskResult.rows.map((row) => ({
    kelas: row.kelas,
    jumlah_fitur: Number(row.jumlah_fitur || 0),
    luas_interseksi_m2: Number(row.luas_interseksi_m2 || 0),
    persen_wilayah: selectedAreaM2 > 0
      ? Math.round((Number(row.luas_interseksi_m2 || 0) / selectedAreaM2) * 1000) / 10
      : null,
  }));

  const [supportingLayers, existingMitigation] = await Promise.all([
    loadSupportingLayerEvidence(pool, hazard, geometry, selectedAreaM2),
    loadExistingMitigation(pool, hazard, geometry),
  ]);

  const evidence = {
    source: "PostgreSQL/PostGIS",
    hazard,
    area_m2: Math.round(selectedAreaM2),
    area_ha: Math.round(selectedAreaM2 / 100) / 100,
    risk_table: RISK_TABLES[hazard],
    risk_classes: classes,
    total_risk_features: classes.reduce((sum, row) => sum + row.jumlah_fitur, 0),
    high_risk_features: classes
      .filter((row) => /tinggi/i.test(row.kelas))
      .reduce((sum, row) => sum + row.jumlah_fitur, 0),
    event_history: eventEvidence,
    supporting_layers: supportingLayers,
    existing_mitigation: existingMitigation,
    area_method:
      "Luas dihitung dari irisan geometri fitur dengan wilayah terpilih, ditransformasikan ke EPSG:6933; hasil bukan luas unik jika fitur sumber saling tumpang tindih.",
    limitations: [
      "Hasil mengikuti cakupan, kualitas, dan klasifikasi data yang tersimpan.",
      "Jumlah fitur bukan jumlah kejadian unik.",
      "Tidak ada ekstrapolasi data yang tidak tersedia.",
      "Data eksternal (BMKG, BNPB, citra satelit) belum diintegrasikan ke analisis ini.",
    ],
  };

  evidence.mcda = computeMcda(evidence);
  return { geometry, evidence };
}

function buildResponseSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      diagnosis: { type: "string" },
      risk_level: { type: "string", enum: ["rendah", "sedang", "tinggi", "belum dapat ditentukan"] },
      primary_drivers: { type: "array", items: { type: "string" } },
      recommendations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            rank: { type: "integer" },
            intervention_id: { type: "string" },
            intervention: { type: "string" },
            priority_score: { type: "number" },
            urgency: { type: "string", enum: ["tinggi", "menengah", "rendah"] },
            expected_effect: { type: "string" },
            why: { type: "string" },
            evidence: { type: "array", items: { type: "string" } },
            implementation_notes: { type: "array", items: { type: "string" } },
          },
          required: [
            "rank", "intervention_id", "intervention", "priority_score",
            "urgency", "expected_effect", "why", "evidence",
            "implementation_notes",
          ],
        },
      },
      adaptation_measures: { type: "array", items: { type: "string" } },
      data_gaps: { type: "array", items: { type: "string" } },
      confidence: { type: "number" },
      verification_needed: { type: "boolean" },
      verification_reason: { type: "string" },
    },
    required: [
      "diagnosis", "risk_level", "primary_drivers", "recommendations",
      "adaptation_measures", "data_gaps", "confidence",
      "verification_needed", "verification_reason",
    ],
  };
}

/**
 * Ambil JSON hasil Structured Outputs. Beberapa model (mis. gpt-6-luna) kadang
 * mengirim lebih dari satu item pesan, sehingga output_text gabungan bukan JSON
 * valid; karena itu setiap potongan teks dicoba satu per satu.
 */
function parseModelJson(response) {
  const candidates = [];
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "refusal") {
        throw Object.assign(new Error("Model menolak permintaan."), { code: "model_refusal" });
      }
      if (content?.type === "output_text" && content.text) candidates.push(content.text);
    }
  }
  if (typeof response?.output_text === "string" && response.output_text) {
    candidates.unshift(response.output_text);
  }

  let lastError = null;
  for (const text of candidates) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && "recommendations" in parsed) return parsed;
    } catch (error) {
      lastError = error;
    }
  }
  if (response?.status === "incomplete") {
    throw Object.assign(new Error("Respons model terpotong (incomplete)."), { code: "incomplete" });
  }
  throw lastError || new SyntaxError("Respons model tidak berisi JSON output.");
}

function normalizeRecommendations(items, catalogItems) {
  const allowed = catalogItems
    .map((item, index) => ({ id: catalogId(item, index), title: catalogTitle(item) }))
    .filter((item) => item.title);

  const normalized = [];
  const seen = new Set();
  for (const candidate of Array.isArray(items) ? items : []) {
    const requestedId = String(candidate.intervention_id || "").trim().toLowerCase();
    const requestedTitle = String(candidate.intervention || "").trim().toLowerCase();

    const match =
      allowed.find((item) => item.id.toLowerCase() === requestedId) ||
      allowed.find((item) => item.title.toLowerCase() === requestedTitle);

    if (!match || seen.has(match.id)) continue;
    seen.add(match.id);

    normalized.push({
      ...candidate,
      rank: normalized.length + 1,
      intervention_id: match.id,
      intervention: match.title,
      priority_score: Math.max(0, Math.min(100, Number(candidate.priority_score) || 0)),
      evidence: Array.isArray(candidate.evidence) ? candidate.evidence : [],
      implementation_notes: Array.isArray(candidate.implementation_notes)
        ? candidate.implementation_notes
        : [],
    });
  }

  return normalized.slice(0, 5);
}

// ------------------------------------------------------------------
// Proteksi endpoint: hanya pengguna login, dibatasi per jam, dan hasil
// untuk wilayah+hazard yang sama di-cache agar kredit OpenAI tidak boros.
// ------------------------------------------------------------------
const DEFAULT_JWT_SECRET = "your_secret_key_change_in_production"; // sama dengan fallback server.js

function aiAuth(req, res, next) {
  if (String(process.env.AI_REQUIRE_AUTH || "true").toLowerCase() === "false") {
    return next();
  }
  const header = String(req.headers?.authorization || "");
  const token = /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, "").trim() : "";
  if (!token) {
    return res.status(401).json({ success: false, code: "AUTH_REQUIRED", message: "Silakan login untuk menjalankan analisis AI." });
  }
  try {
    req.aiUser = jwt.verify(token, process.env.JWT_SECRET || DEFAULT_JWT_SECRET);
    return next();
  } catch (error) {
    return res.status(401).json({ success: false, code: "AUTH_INVALID", message: "Sesi login tidak valid atau kedaluwarsa. Silakan login ulang." });
  }
}

const rateBuckets = new Map();
function aiRateLimit(req, res, next) {
  const limit = Number(process.env.AI_RATE_LIMIT_PER_HOUR || 30);
  if (!(limit > 0)) return next();
  const key = String(req.aiUser?.id || req.aiUser?.username || req.ip || "anon");
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const bucket = (rateBuckets.get(key) || []).filter((t) => now - t < windowMs);
  if (bucket.length >= limit) {
    const retryAfter = Math.ceil((windowMs - (now - bucket[0])) / 1000);
    res.set("Retry-After", String(retryAfter));
    return res.status(429).json({
      success: false,
      code: "AI_RATE_LIMITED",
      message: `Batas ${limit} analisis AI per jam tercapai. Coba lagi dalam ${Math.ceil(retryAfter / 60)} menit.`,
    });
  }
  bucket.push(now);
  rateBuckets.set(key, bucket);
  return next();
}

const resultCache = new Map();
function cacheKey(hazard, geometry, model) {
  return crypto.createHash("sha256").update(`${model}|${hazard}|${geometry}`).digest("hex");
}
function cacheGet(key) {
  const ttl = Number(process.env.AI_CACHE_TTL_MINUTES || 30) * 60 * 1000;
  const hit = resultCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ttl) {
    resultCache.delete(key);
    return null;
  }
  return hit.value;
}
function cacheSet(key, value) {
  if (resultCache.size > 200) resultCache.delete(resultCache.keys().next().value);
  resultCache.set(key, { at: Date.now(), value });
}

/** Terjemahkan error OpenAI menjadi pesan yang bisa ditindaklanjuti admin. */
function describeOpenAiError(error, model) {
  const status = error?.status ?? null;
  const code = error?.code || error?.error?.code || null;
  const text = [error?.message, code, error?.error?.type, error?.type]
    .filter(Boolean).join(" ").toLowerCase();

  if (status === 429 && (code === "insufficient_quota" || /quota|billing|credit/.test(text))) {
    return { http: 503, code: "AI_CREDITS_UNAVAILABLE", message: "Analisis AI tidak tersedia karena saldo/kuota akun OpenAI habis. Hubungi administrator untuk top-up billing." };
  }
  if (status === 429) {
    return { http: 503, code: "AI_PROVIDER_BUSY", message: "Layanan OpenAI sedang membatasi permintaan (rate limit). Coba lagi sebentar lagi." };
  }
  if (status === 401) {
    return { http: 503, code: "AI_KEY_INVALID", message: "OPENAI_API_KEY di server tidak valid atau sudah dicabut. Hubungi administrator." };
  }
  if (status === 403) {
    return { http: 503, code: "AI_KEY_FORBIDDEN", message: "API key OpenAI tidak punya akses ke model/proyek ini. Periksa permission key di dashboard OpenAI." };
  }
  if (status === 404 || code === "model_not_found") {
    return { http: 503, code: "AI_MODEL_NOT_FOUND", message: `Model "${model}" tidak tersedia untuk akun OpenAI ini. Periksa OPENAI_MODEL di .env backend.` };
  }
  if (status === 400) {
    return { http: 502, code: "AI_BAD_REQUEST", message: `Model "${model}" menolak format permintaan (mungkin tidak mendukung Structured Outputs). Coba model lain di OPENAI_MODEL.` };
  }
  if (error?.name === "APIConnectionTimeoutError" || /timeout|timed out/.test(text)) {
    return { http: 504, code: "AI_TIMEOUT", message: "OpenAI tidak merespons tepat waktu. Coba lagi." };
  }
  if (error?.name === "APIConnectionError" || /econn|enotfound|network|fetch failed/.test(text)) {
    return { http: 502, code: "AI_UNREACHABLE", message: "Server backend tidak dapat terhubung ke api.openai.com. Periksa koneksi internet/firewall server." };
  }
  if (error?.code === "model_refusal") {
    return { http: 502, code: "AI_REFUSED", message: "Model AI menolak menyusun rekomendasi untuk permintaan ini." };
  }
  if (error?.code === "incomplete") {
    return { http: 502, code: "AI_INCOMPLETE", message: "Respons AI terpotong. Coba jalankan ulang atau pilih wilayah lebih kecil." };
  }
  if (error instanceof SyntaxError) {
    return { http: 502, code: "AI_BAD_OUTPUT", message: "Respons AI tidak dapat dibaca sebagai JSON. Coba jalankan ulang." };
  }
  return { http: 502, code: "AI_FAILED", message: "Bukti spasial berhasil dibaca, tetapi pembuatan rekomendasi AI gagal." };
}

const SYSTEM_PROMPT = [
  "Anda adalah analis mitigasi dan adaptasi bencana hidrometeorologi kehutanan untuk SIMITI.",
  "Gunakan HANYA bukti PostGIS dan skor MCDA yang diberikan. Jangan mengarang jumlah, luas, koordinat, sejarah, atau fakta lapangan.",
  "Langkah: (1) diagnosis masalah utama dan pendukung; (2) periksa sarana mitigasi eksisting agar tidak menggandakan infrastruktur — utamakan optimalisasi bila sarana relevan sudah ada; (3) pilih 3–5 intervensi HANYA dari katalog, gunakan ID dan nama persis; (4) jelaskan alasan berbasis bukti.",
  "priority_score (0–100) adalah penilaian analitis kesesuaian intervensi, konsisten dengan skor MCDA wilayah dan bukti; bukan pengukuran ilmiah.",
  "Setiap butir evidence harus menyebut sumber layer/tabel dan angka yang benar-benar ada di input.",
  "adaptation_measures: 2–4 langkah adaptasi non-struktural yang relevan (kesiapsiagaan, peringatan dini, tata ruang, dsb.).",
  "data_gaps: sebutkan indikator yang tidak tersedia (lihat mcda.indicators dengan available=false) dan layer yang gagal dibaca.",
  "Jika cakupan MCDA rendah atau bukti tidak cukup, set verification_needed=true dan turunkan confidence (0–100).",
  "Jangan mengklaim kondisi hulu-hilir, hujan, geologi, lereng, atau area terbakar jika evidence tidak mendukung.",
  "Gunakan Bahasa Indonesia yang ringkas dan teknis.",
].join(" ");

function compactEvidenceForPrompt(evidence) {
  // Kirim ringkasan saja ke model (hemat token, tanpa geometri).
  const layers = {};
  for (const [key, layer] of Object.entries(evidence.supporting_layers || {})) {
    if (key === "hydro_proxy") {
      layers[key] = {
        available: layer.available,
        note: layer.note,
        layers: (layer.layers || []).map((l) => ({
          table: l.source_table, available: l.available,
          coverage_percent: Math.round((l.coverage_ratio || 0) * 1000) / 10,
          classes: (l.classes || []).slice(0, 5).map((c) => ({ kelas: c.kelas, persen_wilayah: c.persen_wilayah })),
        })),
      };
      continue;
    }
    layers[key] = {
      label: layer.label,
      available: layer.available,
      table: layer.source_table,
      coverage_percent: layer.coverage_ratio != null ? Math.round(layer.coverage_ratio * 1000) / 10 : null,
      classes: (layer.classes || []).slice(0, 6).map((c) => ({ kelas: c.kelas, persen_wilayah: c.persen_wilayah })),
      note: layer.note,
    };
  }
  return {
    hazard: evidence.hazard,
    area_ha: evidence.area_ha,
    risk_table: evidence.risk_table,
    risk_classes: evidence.risk_classes,
    event_history: evidence.event_history,
    supporting_layers: layers,
    existing_mitigation: evidence.existing_mitigation,
    mcda: {
      score: evidence.mcda.score,
      category: evidence.mcda.category,
      coverage_percent: evidence.mcda.coverage_percent,
      indicators: evidence.mcda.indicators.map((i) => ({
        key: i.key, weight: i.weight, available: i.available, value: i.value, basis: i.basis,
      })),
    },
    limitations: evidence.limitations,
  };
}

function aiStatus() {
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  return {
    success: true,
    configured: Boolean(process.env.OPENAI_API_KEY),
    model,
    auth_required: String(process.env.AI_REQUIRE_AUTH || "true").toLowerCase() !== "false",
    rate_limit_per_hour: Number(process.env.AI_RATE_LIMIT_PER_HOUR || 30),
    cache_ttl_minutes: Number(process.env.AI_CACHE_TTL_MINUTES || 30),
    version: VERSION,
  };
}

function createAiMitigationRecommendationRouter(pool) {
  const router = express.Router();

  // Cek konfigurasi tanpa memanggil OpenAI (tidak membocorkan key).
  router.get("/status", (req, res) => res.json(aiStatus()));

  router.post("/mitigation-recommendation", aiAuth, aiRateLimit, async (req, res) => {
    const context = req.body?.context || {};
    const hazard = String(context.hazard || "").toLowerCase().trim().replace(/\s+/g, "_");

    if (!RISK_TABLES[hazard]) {
      return res.status(400).json({
        success: false,
        code: "INVALID_HAZARD",
        message: `Hazard "${context.hazard || ""}" tidak valid atau belum didukung. Pilihan: ${Object.keys(RISK_TABLES).join(", ")}.`,
      });
    }

    const area = resolveArea(context);
    if (!area) {
      return res.status(400).json({
        success: false,
        code: "AREA_REQUIRED",
        message: "Pilih wilayah yang memiliki geometri GeoJSON sebelum meminta rekomendasi.",
      });
    }

    let spatial;
    try {
      spatial = await loadSpatialEvidence(pool, hazard, area);
    } catch (error) {
      console.error("[AI MITIGATION] Spatial evidence query failed:", JSON.stringify({
        name: error?.name ?? null,
        code: error?.code ?? null,
        message: error?.message ?? null,
        detail: error?.detail ?? null,
        hint: error?.hint ?? null,
        table: error?.table ?? null,
        column: error?.column ?? null,
      }));
      const timedOut = error?.code === "57014";
      return res.status(timedOut ? 504 : error?.userFacing ? 400 : 500).json({
        success: false,
        code: timedOut ? "EVIDENCE_TIMEOUT" : "EVIDENCE_FAILED",
        message: timedOut
          ? "Wilayah terlalu luas untuk dianalisis dalam batas waktu. Pilih kabupaten/kecamatan yang lebih kecil."
          : error?.userFacing
            ? error.message
            : "Gagal membaca bukti spasial wilayah dari database.",
      });
    }

    const { geometry, evidence } = spatial;
    const areaLabel = area.label || area.name || context.selected_region || "Wilayah terpilih";

    const catalogItems = getCatalogItems(hazard);
    if (!catalogItems.length) {
      return res.status(500).json({
        success: false,
        code: "CATALOG_EMPTY",
        message: "Katalog mitigasi untuk hazard ini kosong.",
        spatial_evidence: evidence,
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        success: false,
        code: "AI_NOT_CONFIGURED",
        message: "Layanan analisis AI SIMITI belum dikonfigurasi: OPENAI_API_KEY belum diisi di .env backend.",
        spatial_evidence: evidence,
        mcda: evidence.mcda,
      });
    }

    const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
    const key = cacheKey(hazard, geometry, model);
    const cached = cacheGet(key);
    if (cached) {
      return res.json({ ...cached, area: areaLabel, meta: { ...cached.meta, cached: true } });
    }

    try {
      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: Number(process.env.OPENAI_TIMEOUT_MS || 90000),
        maxRetries: 1,
      });

      const prompt = {
        area: areaLabel,
        admin_level: area.level || null,
        hazard,
        spatial_evidence: compactEvidenceForPrompt(evidence),
        available_mitigation_catalog: catalogItems.map((item, index) => ({
          intervention_id: catalogId(item, index),
          intervention: catalogTitle(item),
        })),
      };

      const response = await client.responses.create({
        model,
        input: [
          { role: "system", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
          { role: "user", content: [{ type: "input_text", text: JSON.stringify(prompt) }] },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "simiti_mitigation_recommendation",
            strict: true,
            schema: buildResponseSchema(),
          },
        },
      });

      const result = parseModelJson(response);
      const recommendations = normalizeRecommendations(result.recommendations, catalogItems);

      const mcda = evidence.mcda;
      const noSpatialRisk = evidence.total_risk_features === 0;
      const noHistory = !evidence.event_history.available;
      const modelConfidence = Math.max(0, Math.min(100, Number(result.confidence) || 0));
      // Confidence tidak boleh melampaui kelengkapan data dasar.
      const confidence = Math.round(Math.min(modelConfidence, mcda.coverage_percent || 0));

      const payload = {
        success: true,
        area: areaLabel,
        hazard,
        diagnosis: result.diagnosis,
        risk_level: result.risk_level,
        primary_drivers: result.primary_drivers,
        recommendations,
        adaptation_measures: Array.isArray(result.adaptation_measures) ? result.adaptation_measures : [],
        data_gaps: Array.isArray(result.data_gaps) ? result.data_gaps : [],
        mcda,
        confidence,
        verification_needed:
          Boolean(result.verification_needed) || noSpatialRisk || noHistory || mcda.low_coverage,
        verification_reason: [
          result.verification_reason,
          noSpatialRisk ? "Tidak ditemukan fitur risiko pada wilayah terpilih." : null,
          noHistory ? "Riwayat kejadian yang sepadan tidak tersedia untuk hazard ini." : null,
          mcda.low_coverage ? `Cakupan indikator MCDA baru ${mcda.coverage_percent}%.` : null,
        ].filter(Boolean).join(" "),
        spatial_evidence: evidence,
        meta: {
          version: VERSION,
          model,
          source: "PostgreSQL/PostGIS + MCDA + OpenAI",
          generated_at: new Date().toISOString(),
          model_confidence: modelConfidence,
          usage: response?.usage
            ? {
              input_tokens: response.usage.input_tokens ?? null,
              output_tokens: response.usage.output_tokens ?? null,
            }
            : null,
          cached: false,
        },
      };

      cacheSet(key, payload);
      return res.json(payload);
    } catch (error) {
      const info = describeOpenAiError(error, model);
      console.error("[AI MITIGATION] OpenAI error:", JSON.stringify({
        status: error?.status ?? null,
        code: error?.code ?? error?.error?.code ?? null,
        type: error?.type ?? error?.error?.type ?? null,
        name: error?.name ?? null,
        request_id: error?.request_id ?? null,
        mapped: info.code,
      }));
      return res.status(info.http).json({
        success: false,
        code: info.code,
        message: info.message,
        spatial_evidence: evidence,
        mcda: evidence.mcda,
        meta: {
          version: VERSION,
          ai_decision_generated: false,
          source: "PostgreSQL/PostGIS",
          generated_at: new Date().toISOString(),
        },
      });
    }
  });

  return router;
}

module.exports = {
  createAiMitigationRecommendationRouter,
  CATALOG,
  // diekspor untuk pengujian
  _internal: {
    parsePolygonGeometry,
    resolveArea,
    normalizeRecommendations,
    describeOpenAiError,
    parseModelJson,
    pickClassColumn,
    summarizeLayer,
    resolveTables,
    areaInTableSrid,
    compactEvidenceForPrompt,
    buildResponseSchema,
  },
};
