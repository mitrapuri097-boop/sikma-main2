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

function catalogFor(hazard) {
  return CATALOG[hazard] || CATALOG.banjir;
}

function safeJson(value) {
  try { return JSON.stringify(value); } catch { return "{}"; }
}

function createAiMitigationRecommendationRouter(pool) {
  const router = express.Router();

  router.post("/mitigation-recommendation", async (req, res) => {
    try {
      const context = req.body?.context || {};
      const hazard = String(context.hazard || "").toLowerCase();
      if (!CATALOG[hazard]) {
        return res.status(400).json({ success: false, message: `Jenis bencana '${hazard}' belum memiliki katalog mitigasi.` });
      }

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey || apiKey === "YOUR_KEY") {
        return res.status(503).json({ success: false, message: "OPENAI_API_KEY belum dikonfigurasi di backend .env." });
      }

      const client = new OpenAI({ apiKey });
      const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";
      const catalog = catalogFor(hazard).map(([id, name]) => ({ intervention_id: id, intervention: name }));

      const system = `Kamu adalah SIMITI Mitigation Decision Assistant. Tugasmu memilih intervensi mitigasi yang paling sesuai untuk SATU wilayah berdasarkan evidence yang diberikan. Kamu WAJIB hanya memilih intervention_id dari katalog yang diberikan untuk hazard tersebut. Jangan membuat intervensi baru. Jangan mengarang angka/data. Priority_score adalah penilaian kecocokan 0-100 berdasarkan evidence, bukan probabilitas. Jika evidence tidak cukup untuk keputusan engineering, tandai verification_needed=true. Maksimal 3 rekomendasi, urutkan dari skor tertinggi. Jawaban harus Bahasa Indonesia.`;
      const user = `HAZARD: ${hazard}\nKATALOG INTERVENSI YANG DIIZINKAN:\n${safeJson(catalog)}\n\nCONTEXT WILAYAH SIMITI:\n${safeJson(context)}\n\nPilih maksimal 3 intervensi yang paling relevan. Jelaskan diagnosis, faktor utama, alasan setiap intervensi, evidence yang benar-benar berasal dari context, urgensi, efek yang diharapkan, dan catatan implementasi. Jangan mengklaim ukuran desain, kapasitas teknis, atau biaya jika tidak tersedia.`;

      const response = await client.responses.create({
        model,
        input: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "simiti_mitigation_recommendation",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                diagnosis: { type: "string" },
                risk_level: { type: "string" },
                primary_drivers: { type: "array", items: { type: "string" } },
                recommendations: {
                  type: "array",
                  minItems: 1,
                  maxItems: 3,
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
                      implementation_notes: { type: "string" },
                    },
                    required: ["rank", "intervention_id", "intervention", "priority_score", "urgency", "expected_effect", "why", "evidence", "implementation_notes"],
                  },
                },
                confidence: { type: "number" },
                verification_needed: { type: "boolean" },
                verification_reason: { type: "string" },
              },
              required: ["diagnosis", "risk_level", "primary_drivers", "recommendations", "confidence", "verification_needed", "verification_reason"],
            },
          },
        },
      });

      const raw = response.output_text || "";
      const result = JSON.parse(raw);
      const allowed = new Map(catalog.map((x) => [x.intervention_id, x.intervention]));
      const recommendations = (Array.isArray(result.recommendations) ? result.recommendations : [])
        .filter((x) => allowed.has(x.intervention_id))
        .map((x, i) => ({
          ...x,
          rank: i + 1,
          intervention: allowed.get(x.intervention_id),
          priority_score: Math.max(0, Math.min(100, Number(x.priority_score) || 0)),
          evidence: Array.isArray(x.evidence) ? x.evidence.slice(0, 5) : [],
        }))
        .slice(0, 3);

      if (!recommendations.length) {
        return res.status(502).json({ success: false, message: "LLM tidak menghasilkan rekomendasi yang valid dari katalog bencana." });
      }

      // Audit ringan: simpan hasil jika tabel AI run tersedia. Gagal simpan tidak menggagalkan jawaban.
      try {
        await pool.query(
          `INSERT INTO simiti_ai_recommendation_runs (question, hazard, selected_region, weights, algorithm_version, data_version, model, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          ["Click-to-diagnose mitigation recommendation", hazard, context.selected_region || null, JSON.stringify({ mode: "llm_scoring" }), "SIMITI-AI-MITIGATION-V3.1", context.data_timestamp || new Date().toISOString(), model, "completed"]
        );
      } catch (auditError) {
        console.warn("AI audit insert dilewati:", auditError.message);
      }

      res.json({
        success: true,
        area: context.selected_region || context.area?.label || "Wilayah terpilih",
        hazard,
        diagnosis: result.diagnosis,
        risk_level: result.risk_level,
        primary_drivers: result.primary_drivers || [],
        recommendations,
        confidence: Math.max(0, Math.min(100, Number(result.confidence) || 0)),
        verification_needed: Boolean(result.verification_needed),
        verification_reason: result.verification_reason || "",
        meta: { model, source: "OpenAI LLM scoring", generated_at: new Date().toISOString() },
      });
    } catch (error) {
      console.error("/api/ai/mitigation-recommendation error:", error);
      res.status(500).json({ success: false, message: error?.message || "AI recommendation gagal." });
    }
  });

  return router;
}

module.exports = { createAiMitigationRecommendationRouter, CATALOG };
