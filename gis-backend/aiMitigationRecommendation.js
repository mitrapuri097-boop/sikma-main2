"use strict";

const express = require("express");
const OpenAI = require("openai");

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
  const areas = Array.isArray(context.selected_areas)
    ? context.selected_areas
    : [];

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
  if (!entry) return [];

  if (Array.isArray(entry)) return entry;
  if (Array.isArray(entry.recommendations)) return entry.recommendations;
  if (Array.isArray(entry.interventions)) return entry.interventions;
  if (Array.isArray(entry.items)) return entry.items;

  if (typeof entry === "object") {
    return Object.entries(entry).map(([key, value]) => {
      if (typeof value === "string") {
        return { id: key, intervention: value };
      }
      if (value && typeof value === "object") {
        return { id: value.id || value.intervention_id || key, ...value };
      }
      return { id: key, intervention: String(value ?? "") };
    });
  }

  return [];
}

function catalogTitle(item) {
  if (Array.isArray(item)) {
    return String(item[1] ?? item[0] ?? "").trim();
  }

  if (typeof item === "string") {
    return item.trim();
  }

  return String(
    item?.intervention ||
    item?.title ||
    item?.name ||
    item?.action ||
    item?.recommendation ||
    item?.label ||
    ""
  ).trim();
}

function catalogId(item, index) {
  if (Array.isArray(item)) {
    return String(item[0] ?? index + 1).trim();
  }

  if (typeof item === "string") {
    return String(index + 1);
  }

  return String(
    item?.intervention_id ||
    item?.id ||
    item?.code ||
    item?.slug ||
    index + 1
  ).trim();
}

const SUPPORTING_LAYER_PATTERNS = Object.freeze({
  slope: ["lereng", "kelerengan", "kemiringan"],
  geology: ["geologi", "litologi"],
  land_cover: ["tutupan_lahan", "tutupan_lahan", "land_cover", "penggunaan_lahan"],
  critical_land: ["lahan_kritis", "lahan_krit"],
  watershed: ["das", "daerah_aliran_sungai", "watershed"],
  rainfall: ["curah_hujan", "curahhujan", "rainfall", "hujan"],
  burned_area: ["area_terbakar", "burned_area", "karhutla_terbakar", "kebakaran_202"],
});

async function loadSupportingLayerEvidence(pool, geometry) {
  const result = {};
  const discovered = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN ('geom', 'geom_valid', 'geometry', 'the_geom', 'wkb_geometry')
  `);
  const tables = new Map();
  for (const row of discovered.rows || []) {
    if (!tables.has(row.table_name)) tables.set(row.table_name, []);
    tables.get(row.table_name).push(row.column_name);
  }

  for (const [key, patterns] of Object.entries(SUPPORTING_LAYER_PATTERNS)) {
    const candidates = [];
    for (const [tableName, geomColumns] of tables.entries()) {
      const normalized = tableName.toLowerCase();
      if (patterns.some((pattern) => normalized.includes(pattern))) {
        candidates.push({ tableName, geomColumn: geomColumns.includes("geom_valid")
          ? "geom_valid"
          : (geomColumns.includes("geom") ? "geom" : geomColumns[0]) });
      }
    }
    if (!candidates.length) {
      result[key] = { available: false, source_tables: [], note: "Tabel pendukung yang sesuai belum ditemukan pada schema public." };
      continue;
    }

    const summaries = [];
    for (const candidate of candidates.slice(0, 5)) {
      // Identifiers originate from information_schema and are still quoted defensively.
      const qTable = `"${candidate.tableName.replace(/"/g, '""')}"`;
      const qGeom = `"${candidate.geomColumn.replace(/"/g, '""')}"`;
      try {
        const query = `
          WITH selected_area AS (
            SELECT ST_CollectionExtract(
              ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)), 3
            ) AS geom
          )
          SELECT COUNT(*)::bigint AS intersecting_features
          FROM ${qTable} t CROSS JOIN selected_area a
          WHERE t.${qGeom} IS NOT NULL
            AND NOT ST_IsEmpty(t.${qGeom})
            AND t.${qGeom} && a.geom
            AND ST_Intersects(t.${qGeom}, a.geom)
        `;
        const q = await pool.query(query, [geometry]);
        summaries.push({
          table: candidate.tableName,
          intersecting_features: Number(q.rows?.[0]?.intersecting_features || 0),
        });
      } catch (error) {
        summaries.push({ table: candidate.tableName, available: false, note: "Geometri tabel tidak dapat dioverlay dengan wilayah terpilih." });
      }
    }
    result[key] = {
      available: summaries.some((item) => item.intersecting_features > 0),
      source_tables: summaries,
      note: summaries.some((item) => item.intersecting_features > 0)
        ? "Fitur yang beririsan terdeteksi; atribut tematik perlu ditafsirkan dari data sumber."
        : "Tabel ditemukan, tetapi fitur yang beririsan tidak terdeteksi atau geometri tidak kompatibel.",
    };
  }
  return result;
}

async function loadSpatialEvidence(pool, hazard, area) {
  const geometry = parsePolygonGeometry(area.geom || area.geometry);

  const riskSql = `
    WITH selected_area AS (
      SELECT ST_CollectionExtract(
        ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)),
        3
      ) AS geom
    )
    SELECT
      COALESCE(NULLIF(BTRIM(r.kelas), ''), 'Tidak diketahui') AS kelas,
      COUNT(*)::bigint AS jumlah_fitur,
      ROUND(
        COALESCE(
          SUM(
            ST_Area(
              ST_Transform(
                ST_Intersection(r.geom_valid, a.geom),
                6933
              )
            )
          ),
          0
        )::numeric,
        2
      ) AS luas_interseksi_m2
    FROM ${RISK_TABLES[hazard]} r
    CROSS JOIN selected_area a
    WHERE r.geom_valid IS NOT NULL
      AND NOT ST_IsEmpty(r.geom_valid)
      AND r.geom_valid && a.geom
      AND ST_Intersects(r.geom_valid, a.geom)
    GROUP BY COALESCE(NULLIF(BTRIM(r.kelas), ''), 'Tidak diketahui')
    ORDER BY MIN(
      CASE LOWER(COALESCE(r.kelas, ''))
        WHEN 'tinggi' THEN 1
        WHEN 'sangat tinggi' THEN 2
        WHEN 'sedang' THEN 3
        WHEN 'rendah' THEN 4
        ELSE 5
      END
    )
  `;

  const riskResult = await pool.query(riskSql, [geometry]);

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
      WITH selected_area AS (
        SELECT ST_CollectionExtract(
          ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)),
          3
        ) AS geom
      )
      SELECT
        COUNT(*)::bigint AS jumlah,
        MIN(k.date) AS tanggal_pertama,
        MAX(k.date) AS tanggal_terakhir
      FROM kejadian k
      CROSS JOIN selected_area a
      WHERE k.longitude BETWEEN -180 AND 180
        AND k.latitude BETWEEN -90 AND 90
        AND k.longitude IS NOT NULL
        AND k.latitude IS NOT NULL
        AND LOWER(BTRIM(COALESCE(k.category, ''))) = ANY($2::text[])
        AND ST_Covers(
          a.geom,
          ST_SetSRID(ST_MakePoint(k.longitude, k.latitude), 4326)
        )
    `;

    const eventResult = await pool.query(eventSql, [
      geometry,
      eventCategories,
    ]);
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
  }));
  const supporting_layers = await loadSupportingLayerEvidence(pool, geometry);

  return {
    source: "PostgreSQL/PostGIS",
    hazard,
    risk_table: RISK_TABLES[hazard],
    risk_classes: classes,
    total_risk_features: classes.reduce((sum, row) => sum + row.jumlah_fitur, 0),
    high_risk_features: classes
      .filter((row) => /tinggi/i.test(row.kelas))
      .reduce((sum, row) => sum + row.jumlah_fitur, 0),
    event_history: eventEvidence,
    supporting_layers,
    analysis_dimensions: [
      "kerawanan/risiko sesuai jenis bencana",
      "historis kejadian bencana",
      "kelerengan",
      "geologi",
      "tutupan lahan",
      "lahan kritis",
      "DAS dan kondisi hulu-hilir",
      "curah hujan",
      ...(hazard === "karhutla" ? ["area terbakar periode 2021-2026"] : []),
    ],
    area_method:
      "Luas dihitung dari irisan geometri fitur dengan wilayah terpilih, ditransformasikan ke EPSG:6933; hasil bukan luas unik jika fitur sumber saling tumpang tindih.",
    limitations: [
      "Hasil mengikuti cakupan, kualitas, dan klasifikasi data yang tersimpan.",
      "Jumlah fitur bukan jumlah kejadian unik.",
      "Tidak ada ekstrapolasi data yang tidak tersedia.",
    ],
  };
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
            urgency: { type: "string" },
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
      confidence: { type: "number" },
      verification_needed: { type: "boolean" },
      verification_reason: { type: "string" },
    },
    required: [
      "diagnosis", "risk_level", "primary_drivers", "recommendations",
      "confidence", "verification_needed", "verification_reason",
    ],
  };
}

function parseModelJson(response) {
  if (response && typeof response.output_text === "string") {
    return JSON.parse(response.output_text);
  }

  const parts = [];
  for (const item of response?.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) parts.push(content.text);
    }
  }
  if (!parts.length) throw new Error("Respons model tidak berisi JSON output.");
  return JSON.parse(parts.join(""));
}

function normalizeRecommendations(items, catalogItems, evidence) {
  const allowed = catalogItems.map((item, index) => ({
    id: catalogId(item, index),
    title: catalogTitle(item),
    original: item,
  })).filter((item) => item.title);

  const normalized = [];
  for (const candidate of Array.isArray(items) ? items : []) {
    const requestedId = String(candidate.intervention_id || "").trim();
    const requestedTitle = String(candidate.intervention || "").trim();

    const match = allowed.find((item) =>
      item.id.toLowerCase() === requestedId.toLowerCase()
    ) || allowed.find((item) =>
      item.title.toLowerCase() === requestedTitle.toLowerCase()
    );

    if (!match) continue;

    const hasRiskEvidence = evidence.total_risk_features > 0;
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
      _has_spatial_support: hasRiskEvidence,
    });
  }

  return normalized.map(({ _has_spatial_support, ...item }) => item);
}

function createAiMitigationRecommendationRouter(pool) {
  const router = express.Router();

  router.post("/mitigation-recommendation", async (req, res) => {
    const context = req.body?.context || {};
    const hazard = String(context.hazard || "").toLowerCase().trim();

    if (!RISK_TABLES[hazard]) {
      return res.status(400).json({
        success: false,
        message: "Hazard tidak valid atau belum didukung.",
      });
    }

    const area = resolveArea(context);
    if (!area) {
      return res.status(400).json({
        success: false,
        message: "Pilih wilayah yang memiliki geometri GeoJSON sebelum meminta rekomendasi.",
      });
    }

    let spatialEvidence;
    try {
      spatialEvidence = await loadSpatialEvidence(pool, hazard, area);
    } catch (error) {
      console.error("[AI MITIGATION] Spatial evidence query failed:", JSON.stringify({
  name: error?.name ?? null,
  code: error?.code ?? null,
  message: error?.message ?? "Unknown error",
  detail: error?.detail ?? null,
  hint: error?.hint ?? null,
  position: error?.position ?? null,
  table: error?.table ?? null,
  column: error?.column ?? null,
  constraint: error?.constraint ?? null,
  stack: error?.stack ?? null,
}));
      return res.status(500).json({
        success: false,
        message: "Gagal membaca bukti spasial wilayah dari database.",
        detail: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }

    const catalogItems = getCatalogItems(hazard);
    if (!catalogItems.length) {
      return res.status(500).json({
        success: false,
        message: "Katalog mitigasi untuk hazard ini kosong atau formatnya tidak dikenali.",
        spatial_evidence: spatialEvidence,
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        success: false,
        message: "Bukti spasial berhasil dibaca, tetapi OPENAI_API_KEY belum tersedia.",
        spatial_evidence: spatialEvidence,
      });
    }

    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

      const prompt = {
        area: area.label || area.name || context.selected_region || "Wilayah terpilih",
        hazard,
        spatial_evidence: spatialEvidence,
        available_mitigation_catalog: catalogItems.map((item, index) => ({
          intervention_id: catalogId(item, index),
          intervention: catalogTitle(item),
          details: item,
        })),
      };

      const response = await client.responses.create({
        model,
        input: [
          {
            role: "system",
            content: [{
              type: "input_text",
              text:
                "Anda adalah analis mitigasi bencana SIMITI. Gunakan bukti PostGIS yang diberikan. " +
                "Jangan mengarang jumlah, luas, sejarah, atau fakta lapangan. " +
                "Pilih intervensi hanya dari katalog yang disediakan dan gunakan ID serta nama persis. " +
                "Analisis kerawanan, historis kejadian, kelerengan, geologi, tutupan lahan, lahan kritis, DAS/hulu-hilir, dan curah hujan berdasarkan evidence yang benar-benar tersedia. " +
                "Untuk karhutla, periksa juga evidence area terbakar periode 2021-2026 bila tersedia. " +
                "Jelaskan penyebab dominan dan tingkat risiko; jangan mengklaim kondisi hulu-hilir, hujan, geologi, atau area terbakar jika evidence tidak mendukungnya. " +
                "Nilai prioritas adalah penilaian analitis, bukan pengukuran ilmiah. " +
                "Jika bukti tidak cukup, nyatakan verifikasi diperlukan dan turunkan confidence.",
            }],
          },
          {
            role: "user",
            content: [{
              type: "input_text",
              text: JSON.stringify(prompt),
            }],
          },
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
      const recommendations = normalizeRecommendations(
        result.recommendations,
        catalogItems,
        spatialEvidence
      );

      const noSpatialRisk = spatialEvidence.total_risk_features === 0;
      const noHistory = !spatialEvidence.event_history.available;

      return res.json({
        success: true,
        area: prompt.area,
        hazard,
        diagnosis: result.diagnosis,
        risk_level: result.risk_level,
        primary_drivers: result.primary_drivers,
        recommendations,
        confidence: Math.max(0, Math.min(100, Number(result.confidence) || 0)),
        verification_needed: Boolean(result.verification_needed) || noSpatialRisk || noHistory,
        verification_reason: [
          result.verification_reason,
          noSpatialRisk ? "Tidak ditemukan fitur risiko pada wilayah terpilih." : null,
          noHistory ? "Riwayat kejadian yang sepadan tidak tersedia untuk hazard ini." : null,
        ].filter(Boolean).join(" "),
        spatial_evidence: spatialEvidence,
        meta: {
          version: "SIMITI-AI-MITIGATION-V4.0",
          model,
          source: "PostgreSQL/PostGIS + AI",
          generated_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("[AI MITIGATION] OpenAI diagnostic:", JSON.stringify({
        status: error?.status ?? null,
        code: error?.code ?? null,
        type: error?.type ?? null,
        error_type: error?.error?.type ?? null,
        error_code: error?.error?.code ?? null,
        request_id: error?.request_id ?? null,
        message: error?.message ?? "Unknown error",
      }));

      const errorText = [
        error?.message,
        error?.code,
        error?.error?.type,
        error?.type,
      ].filter(Boolean).join(" ").toLowerCase();

      const isCreditExhausted =
        error?.status === 429 &&
        (
          errorText.includes("insufficient_quota") ||
          errorText.includes("quota") ||
          errorText.includes("billing") ||
          errorText.includes("credit")
        );

      if (isCreditExhausted && catalogItems.length > 0) {
        const fallbackRecommendations = catalogItems
          .slice(0, 3)
          .map((item, index) => ({
            rank: index + 1,
            intervention_id: catalogId(item, index),
            intervention: catalogTitle(item),
            priority_score: 50,
            urgency: "Perlu verifikasi",
            expected_effect:
              "Potensi manfaat mitigasi perlu dinilai berdasarkan karakteristik wilayah dan kajian teknis.",
            why:
              `Diambil dari katalog lokal SIMITI untuk hazard ${hazard}. Urutan katalog bukan peringkat prioritas teknis dan belum divalidasi oleh AI.`,
            evidence: [
              "Berasal dari katalog mitigasi lokal SIMITI.",
              `Jumlah fitur risiko pada hasil query spasial: ${spatialEvidence.total_risk_features}.`,
            ],
            implementation_notes:
              "Validasi bukti spasial, kondisi lapangan, kelayakan teknis, dan kewenangan instansi sebelum pelaksanaan.",
          }))
          .filter((item) => item.intervention);

        return res.json({
          success: true,
          area: area.label || area.name || context.selected_region || "Wilayah terpilih",
          hazard,
          diagnosis:
            `Rekomendasi mitigasi ${hazard} menggunakan katalog lokal SIMITI karena layanan AI tidak tersedia.`,
          risk_level: "Perlu verifikasi",
          primary_drivers: [],
          recommendations: fallbackRecommendations,
          confidence: 50,
          verification_needed: true,
          verification_reason:
            "Kredit atau kuota OpenAI tidak mencukupi. Skor fallback bersifat netral, urutan mengikuti katalog lokal dan bukan peringkat prioritas teknis. Seluruh rekomendasi wajib diverifikasi.",
          spatial_evidence: spatialEvidence,
          meta: {
            version: "SIMITI-AI-MITIGATION-V4.0",
            model: "local-catalog-fallback",
            source: "SIMITI local mitigation catalog + PostgreSQL/PostGIS",
            fallback_reason: "OpenAI quota or credit exhausted",
            generated_at: new Date().toISOString(),
          },
        });
      }

      console.error("[AI MITIGATION] Recommendation failed:", error.message);
      return res.status(502).json({
        success: false,
        message: "Bukti spasial berhasil dibaca, tetapi pembuatan rekomendasi AI gagal.",
        spatial_evidence: spatialEvidence,
        detail: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  });

  return router;
}

module.exports = {
  createAiMitigationRecommendationRouter,
  CATALOG,
};
