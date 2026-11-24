"use strict";

/**
 * Uji offline modul AI mitigasi.
 *   cd gis-backend && node --test tests/
 * Tidak memanggil OpenAI maupun database sungguhan: pool dan klien OpenAI
 * dipalsukan agar alur router (auth → evidence → MCDA → AI → normalisasi)
 * bisa diverifikasi tanpa biaya.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { computeMcda, parseRainfallMm, riskClassValue, criticalLandValue } =
  require("../aiMitigationScoring");

// ------------------------------------------------------------------ MCDA
test("riskClassValue memetakan kelas teks", () => {
  assert.equal(riskClassValue("Sangat Tinggi"), 100);
  assert.equal(riskClassValue("Tinggi"), 85);
  assert.equal(riskClassValue("Sedang"), 55);
  assert.equal(riskClassValue("Rendah"), 25);
  assert.equal(riskClassValue("Tidak diketahui"), null);
});

test("criticalLandValue membedakan 'tidak kritis' dan 'sangat kritis'", () => {
  assert.equal(criticalLandValue("Tidak Kritis"), 0);
  assert.equal(criticalLandValue("Sangat Kritis"), 100);
  assert.equal(criticalLandValue("Agak Kritis"), 50);
  assert.equal(criticalLandValue("Potensial Kritis"), 25);
  assert.equal(criticalLandValue("Kritis"), 80);
});

test("parseRainfallMm membaca label rentang dan angka ribuan", () => {
  assert.equal(parseRainfallMm("2500 - 3000 mm"), 2500);
  assert.equal(parseRainfallMm("3.000-3.500"), 3000);
  assert.equal(parseRainfallMm("Tinggi"), null);
});

test("computeMcda: indikator tanpa data tidak dikarang dan skor dinormalisasi", () => {
  const evidence = {
    hazard: "banjir",
    risk_classes: [
      { kelas: "Tinggi", jumlah_fitur: 221, luas_interseksi_m2: 10428597 },
      { kelas: "Sedang", jumlah_fitur: 213, luas_interseksi_m2: 21876521 },
      { kelas: "Rendah", jumlah_fitur: 12, luas_interseksi_m2: 212378 },
    ],
    event_history: { available: true, count: 2 },
    supporting_layers: {},
    existing_mitigation: { checked: true, relevant_total: 0 },
  };
  const m = computeMcda(evidence);
  const byKey = Object.fromEntries(m.indicators.map((i) => [i.key, i]));
  assert.equal(byKey.lahan_kritis.available, false);
  assert.equal(byKey.iklim.available, false);
  assert.equal(byKey.kelayakan.available, false);
  assert.equal(byKey.historis.value, 50);
  assert.equal(byKey.infrastruktur_eksisting.value, 100);
  // cakupan = (25 + 15 + 10) / 100
  assert.equal(m.coverage_percent, 50);
  assert.equal(m.low_coverage, true);
  // risiko ≈ (85*10.43 + 55*21.88 + 25*0.21) / 32.52 ≈ 64.4
  assert.ok(byKey.risiko.value > 63 && byKey.risiko.value < 66, byKey.risiko.value);
  const expected = (25 * byKey.risiko.value + 15 * 50 + 10 * 100) / 50;
  assert.ok(Math.abs(m.score - expected) < 0.2, `${m.score} vs ${expected}`);
});

test("computeMcda: curah hujan dibalik untuk kekeringan", () => {
  const base = {
    risk_classes: [],
    event_history: { available: false },
    existing_mitigation: { checked: false },
    supporting_layers: {
      rainfall: {
        available: true,
        source_table: "curah_hujan_tahunan",
        classes: [{ kelas: "1000 - 1500", luas_m2: 100 }],
      },
    },
  };
  const wet = computeMcda({ ...base, hazard: "banjir" });
  const dry = computeMcda({ ...base, hazard: "kekeringan" });
  const v = (m) => m.indicators.find((i) => i.key === "iklim").value;
  assert.equal(v(wet), 20);
  assert.equal(v(dry), 80);
});

test("computeMcda: tanpa data sama sekali → skor null", () => {
  const m = computeMcda({ hazard: "abrasi", supporting_layers: {} });
  assert.equal(m.score, null);
  assert.equal(m.category, "Belum dapat dinilai");
});

// ------------------------------------------------------------ Router (mock)
const OpenAI = require("openai"); // stub saat dijalankan di sandbox; SDK asli di server
const isStub = Array.isArray(OpenAI.calls);

function fakePool() {
  const log = [];
  const respond = (sql) => {
    if (/FROM geometry_columns/.test(sql)) {
      return { rows: [
        { table_name: "lahan_kritis", geom_column: "geom", srid: 4326 },
        { table_name: "penutupan_lahan_2024", geom_column: "geom", srid: 4326 },
        { table_name: "curah_hujan_tahunan", geom_column: "geom", srid: 0 },
        { table_name: "rawan_limpasan", geom_column: "geom", srid: 4326 },
        { table_name: "embung", geom_column: "geom", srid: 4326 },
        { table_name: "situ", geom_column: "geom", srid: 32748 },
        { table_name: "rehabilitasi_das", geom_column: "geom", srid: 4326 },
      ] };
    }
    if (/information_schema\.columns/.test(sql)) {
      return { rows: [
        { table_name: "lahan_kritis", column_name: "gid", data_type: "integer" },
        { table_name: "lahan_kritis", column_name: "kritis", data_type: "character varying" },
        { table_name: "penutupan_lahan_2024", column_name: "pl24_desc", data_type: "text" },
        { table_name: "curah_hujan_tahunan", column_name: "ch", data_type: "character varying" },
        { table_name: "rawan_limpasan", column_name: "kelas", data_type: "text" },
      ] };
    }
    if (/AS kosong/.test(sql)) return { rows: [{ luas_m2: 100000000, kosong: false }] };
    if (/FROM risiko_banjir/.test(sql)) {
      return { rows: [
        { kelas: "Tinggi", jumlah_fitur: 221, luas_interseksi_m2: 10428597 },
        { kelas: "Sedang", jumlah_fitur: 213, luas_interseksi_m2: 21876521 },
      ] };
    }
    if (/FROM kejadian/.test(sql)) return { rows: [{ jumlah: 2, tanggal_pertama: "2026-03-10", tanggal_terakhir: "2026-09-30" }] };
    if (/FROM "lahan_kritis"/.test(sql)) return { rows: [{ kelas: "Kritis", jumlah_fitur: 5, luas_m2: 30000000 }, { kelas: "Tidak Kritis", jumlah_fitur: 9, luas_m2: 50000000 }] };
    if (/FROM "curah_hujan_tahunan"/.test(sql)) return { rows: [{ kelas: "3000 - 3500", jumlah_fitur: 2, luas_m2: 100000000 }] };
    if (/FROM "rawan_limpasan"/.test(sql)) return { rows: [{ kelas: "Tinggi", jumlah_fitur: 3, luas_m2: 40000000 }] };
    if (/FROM "penutupan_lahan_2024"/.test(sql)) return { rows: [{ kelas: "Permukiman", jumlah_fitur: 40, luas_m2: 60000000 }] };
    if (/FROM "embung"/.test(sql)) return { rows: [{ n: 1 }] };
    if (/FROM "situ"/.test(sql)) throw Object.assign(new Error("SRID"), { code: "XX000" });
    if (/COUNT\(\*\)::bigint AS n/.test(sql)) return { rows: [{ n: 0 }] };
    return { rows: [] };
  };
  const client = {
    query: async (sql) => {
      if (/^(BEGIN|COMMIT|ROLLBACK|SET LOCAL)/.test(sql.trim())) return { rows: [] };
      log.push(sql);
      return respond(sql);
    },
    release() {},
  };
  return {
    log,
    query: async (sql) => { log.push(sql); return respond(sql); },
    connect: async () => client,
  };
}

function mockRes() {
  return {
    statusCode: 200, body: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    set(k, v) { this.headers[k] = v; return this; },
  };
}

async function invoke(router, method, path, req) {
  const route = router.routes.find((r) => r.method === method && r.path === path);
  const res = mockRes();
  let i = 0;
  const next = async () => {
    const h = route.handlers[i++];
    if (h) await h(req, res, next);
  };
  await next();
  return res;
}

const GEOM = { type: "Polygon", coordinates: [[[106.7, -6.7], [106.9, -6.7], [106.9, -6.5], [106.7, -6.5], [106.7, -6.7]]] };
const body = (hazard = "banjir") => ({ context: { hazard, area: { label: "Uji Bogor", level: "kabupaten", geom: GEOM } } });

test("router: tanpa token → 401, hazard salah → 400", { skip: !isStub }, async () => {
  const { createAiMitigationRecommendationRouter } = require("../aiMitigationRecommendation");
  const router = createAiMitigationRecommendationRouter(fakePool());
  const r1 = await invoke(router, "POST", "/mitigation-recommendation", { headers: {}, body: body() });
  assert.equal(r1.statusCode, 401);
  const r2 = await invoke(router, "POST", "/mitigation-recommendation", { headers: { authorization: "Bearer good" }, body: body("gempa") });
  assert.equal(r2.statusCode, 400);
  assert.equal(r2.body.code, "INVALID_HAZARD");
});

test("router: tanpa OPENAI_API_KEY → 503 + evidence & MCDA tetap dikirim", { skip: !isStub }, async () => {
  delete process.env.OPENAI_API_KEY;
  const { createAiMitigationRecommendationRouter } = require("../aiMitigationRecommendation");
  const router = createAiMitigationRecommendationRouter(fakePool());
  const res = await invoke(router, "POST", "/mitigation-recommendation", { headers: { authorization: "Bearer good" }, body: body() });
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, "AI_NOT_CONFIGURED");
  const ev = res.body.spatial_evidence;
  assert.equal(ev.supporting_layers.land_cover.source_table, "penutupan_lahan_2024");
  assert.equal(ev.supporting_layers.land_cover.class_column, "pl24_desc");
  assert.equal(ev.supporting_layers.critical_land.class_column, "kritis");
  assert.equal(ev.supporting_layers.watershed.available, false); // das_adm tidak ada di mock
  assert.equal(ev.existing_mitigation.relevant_total, 1); // embung
  assert.ok(res.body.mcda.score > 0);
  // SRID 0 → wilayah di-set SRID 0; SRID 32748 → ditransformasi
  assert.ok(ev.supporting_layers.rainfall.available);
  const sqlAll = ev && JSON.stringify(res.body.mcda);
  assert.ok(sqlAll.includes("iklim"));
});

test("router: alur sukses + normalisasi katalog + cache + confidence dibatasi cakupan", { skip: !isStub }, async () => {
  process.env.OPENAI_API_KEY = "sk-test";
  process.env.OPENAI_MODEL = "gpt-test";
  OpenAI.calls.length = 0;
  OpenAI.handler = async () => ({
    output_text: JSON.stringify({
      diagnosis: "Risiko banjir tinggi.",
      risk_level: "tinggi",
      primary_drivers: ["kelas risiko Tinggi 32%"],
      recommendations: [
        { rank: 1, intervention_id: "retensi", intervention: "x", priority_score: 140, urgency: "tinggi", expected_effect: "e", why: "w", evidence: ["risiko_banjir"], implementation_notes: [] },
        { rank: 2, intervention_id: "tidak_ada", intervention: "Karangan", priority_score: 90, urgency: "tinggi", expected_effect: "e", why: "w", evidence: [], implementation_notes: [] },
        { rank: 3, intervention_id: "retensi", intervention: "dup", priority_score: 50, urgency: "rendah", expected_effect: "e", why: "w", evidence: [], implementation_notes: [] },
        { rank: 4, intervention_id: "", intervention: "Sumur resapan / infrastruktur infiltrasi", priority_score: 70, urgency: "menengah", expected_effect: "e", why: "w", evidence: [], implementation_notes: [] },
      ],
      adaptation_measures: ["Peringatan dini"],
      data_gaps: ["Kelerengan"],
      confidence: 95,
      verification_needed: false,
      verification_reason: "",
    }),
    usage: { input_tokens: 1000, output_tokens: 300 },
  });

  const { createAiMitigationRecommendationRouter } = require("../aiMitigationRecommendation");
  const router = createAiMitigationRecommendationRouter(fakePool());
  const req = { headers: { authorization: "Bearer good" }, body: body(), ip: "1.2.3.4" };
  const res = await invoke(router, "POST", "/mitigation-recommendation", req);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body).slice(0, 300));
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.recommendations.map((r) => r.intervention_id), ["retensi", "resapan"]);
  assert.equal(res.body.recommendations[0].priority_score, 100);
  assert.equal(res.body.recommendations[0].intervention, "Kolam retensi / detensi");
  assert.ok(res.body.confidence <= res.body.mcda.coverage_percent);
  assert.equal(res.body.meta.model, "gpt-test");
  assert.equal(OpenAI.lastOpts.maxRetries, 1);

  // prompt tidak boleh membawa geometri mentah
  const sent = OpenAI.calls[0].input[1].content[0].text;
  assert.ok(!sent.includes("106.7"), "geometri bocor ke prompt");
  assert.equal(OpenAI.calls[0].text.format.strict, true);

  const res2 = await invoke(router, "POST", "/mitigation-recommendation", req);
  assert.equal(res2.body.meta.cached, true);
  assert.equal(OpenAI.calls.length, 1);
});

test("router: error OpenAI dipetakan ke pesan yang jelas", { skip: !isStub }, async () => {
  process.env.OPENAI_API_KEY = "sk-test";
  const cases = [
    [{ status: 429, code: "insufficient_quota" }, "AI_CREDITS_UNAVAILABLE"],
    [{ status: 401 }, "AI_KEY_INVALID"],
    [{ status: 404, code: "model_not_found" }, "AI_MODEL_NOT_FOUND"],
    [{ status: 429, code: "rate_limit_exceeded" }, "AI_PROVIDER_BUSY"],
  ];
  const { createAiMitigationRecommendationRouter } = require("../aiMitigationRecommendation");
  for (const [err, code] of cases) {
    process.env.OPENAI_MODEL = `m-${code}`; // hindari cache
    OpenAI.handler = async () => { throw Object.assign(new Error("x"), err); };
    const router = createAiMitigationRecommendationRouter(fakePool());
    const res = await invoke(router, "POST", "/mitigation-recommendation", { headers: { authorization: "Bearer good" }, body: body(), ip: `ip-${code}` });
    assert.equal(res.body.code, code);
    assert.ok(res.body.mcda);
  }
});

test("router: rate limit per pengguna", { skip: !isStub }, async () => {
  process.env.AI_RATE_LIMIT_PER_HOUR = "2";
  delete process.env.OPENAI_API_KEY;
  const { createAiMitigationRecommendationRouter } = require("../aiMitigationRecommendation");
  const router = createAiMitigationRecommendationRouter(fakePool());
  const req = { headers: { authorization: "Bearer good" }, body: body() };
  // pengguna id 7 sudah memakai kuota pada test sebelumnya → langsung dibatasi
  const res = await invoke(router, "POST", "/mitigation-recommendation", req);
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.code, "AI_RATE_LIMITED");
  delete process.env.AI_RATE_LIMIT_PER_HOUR;
});

test("router: /status tidak membocorkan key", { skip: !isStub }, async () => {
  process.env.OPENAI_API_KEY = "sk-secret";
  const { createAiMitigationRecommendationRouter } = require("../aiMitigationRecommendation");
  const router = createAiMitigationRecommendationRouter(fakePool());
  const res = await invoke(router, "GET", "/status", { headers: {} });
  assert.equal(res.body.configured, true);
  assert.ok(!JSON.stringify(res.body).includes("sk-secret"));
});

test("parseModelJson: tahan terhadap item pesan ganda dan refusal", { skip: !isStub }, () => {
  const { _internal } = require("../aiMitigationRecommendation");
  const good = JSON.stringify({ recommendations: [], diagnosis: "x" });
  const doubled = {
    output_text: good + good,
    output: [
      { type: "message", content: [{ type: "output_text", text: good }] },
      { type: "message", content: [{ type: "output_text", text: good }] },
    ],
  };
  assert.equal(_internal.parseModelJson(doubled).diagnosis, "x");
  assert.throws(
    () => _internal.parseModelJson({ output: [{ content: [{ type: "refusal", refusal: "no" }] }] }),
    (e) => e.code === "model_refusal",
  );
  assert.throws(() => _internal.parseModelJson({ status: "incomplete", output: [] }), (e) => e.code === "incomplete");
});

// ------------------------------------------------- perbaikan dari uji lokal
test("MCDA: lahan kritis 8% wilayah tidak lagi terbaca 90+", () => {
  const { _internal } = require("../aiMitigationScoring");
  const r = _internal.scoreCriticalLand({
    available: true,
    source_table: "lahan_kritis",
    area_m2: 489186200,
    classes: [
      { kelas: "Sangat Kritis", luas_m2: 27900000 },
      { kelas: "Kritis", luas_m2: 12200000 },
    ],
  });
  // (100×27.9 + 80×12.2) / 489.2 ≈ 7.7
  assert.ok(r.value > 7 && r.value < 8.5, String(r.value));
});

test("MCDA: proxy hidrologi tanpa kelas tidak diskor 100", () => {
  const { _internal } = require("../aiMitigationScoring");
  const classless = { available: true, source_table: "rawan_limpasan", classes: [], coverage_ratio: 1, area_m2: 100 };
  assert.equal(_internal.scoreHydroProxy([classless]), null);
  const peat = { available: true, source_table: "ekosistem_gambut", classes: [], coverage_ratio: 0.4, area_m2: 100 };
  assert.equal(_internal.scoreHydroProxy([peat]).value, 40);
});

test("pickClassColumn: teks deskriptif diutamakan, kolom DAS ditolak untuk geologi", { skip: !isStub }, () => {
  const { _internal } = require("../aiMitigationRecommendation");
  const landCover = {
    columns: [
      { name: "pl2024_id", type: "integer" },
      { name: "pl24_desc", type: "text" },
    ],
  };
  assert.equal(_internal.pickClassColumn(landCover, ["pl24", "pl2024", "kelas"]), "pl24_desc");
  const onlyCode = { columns: [{ name: "pl2024_id", type: "integer" }] };
  assert.equal(_internal.pickClassColumn(onlyCode, ["pl2024"]), "pl2024_id");
  const geologi = { columns: [{ name: "nama_das", type: "text" }, { name: "keterangan", type: "text" }] };
  assert.equal(_internal.pickClassColumn(geologi, ["nama", "keterangan"], ["das"]), "keterangan");
  assert.equal(_internal.pickClassColumn({ columns: [{ name: "nama_das", type: "text" }] }, ["nama"], ["das"]), null);
});

function scriptedPool(handler) {
  const sqls = [];
  const client = {
    async query(sql, params) {
      if (/^(BEGIN|COMMIT|ROLLBACK|SET LOCAL)/.test(sql.trim())) return { rows: [] };
      sqls.push(sql);
      return handler(sql, sqls.length);
    },
    release() {},
  };
  return { sqls, connect: async () => client, query: client.query };
}

test("summarizeLayer: deteksi kolom kelas otomatis bila nama kolom tak dikenal", { skip: !isStub }, async () => {
  const { _internal } = require("../aiMitigationRecommendation");
  const entry = {
    table: "curah_hujan_tahunan", geomColumn: "geom", srid: 4326,
    columns: [{ name: "provinsi", type: "text" }, { name: "kls_ch", type: "text" }, { name: "remark", type: "text" }],
  };
  const pool = scriptedPool((sql) => {
    if (/COUNT\(DISTINCT/.test(sql)) return { rows: [{ d0: 1, d1: 3, d2: 120 }] };
    return { rows: [{ kelas: "2500 - 3000", jumlah_fitur: 2, luas_m2: 50 }] };
  });
  const r = await _internal.summarizeLayer(pool, entry, "{}", 100, ["zzz"], []);
  assert.equal(r.class_column, "kls_ch");
  assert.equal(r.class_column_source, "deteksi otomatis nilai unik");
  assert.equal(r.classes[0].kelas, "2500 - 3000");
});

test("summarizeLayer: TopologyException dicoba ulang dengan ST_MakeValid, error dilaporkan", { skip: !isStub }, async () => {
  const { _internal } = require("../aiMitigationRecommendation");
  const entry = { table: "penutupan_lahan_2024", geomColumn: "geom", srid: 4326, columns: [{ name: "pl24_desc", type: "text" }] };

  const recovering = scriptedPool((sql, n) => {
    if (n === 1) throw Object.assign(new Error("GEOSIntersects: TopologyException"), { code: "XX000" });
    return { rows: [{ kelas: "Hutan", jumlah_fitur: 1, luas_m2: 10 }] };
  });
  const ok = await _internal.summarizeLayer(recovering, entry, "{}", 100, ["pl24"], []);
  assert.equal(ok.available, true);
  assert.match(recovering.sqls[1], /ST_Intersects\(ST_MakeValid\(/);

  const failing = scriptedPool(() => { throw Object.assign(new Error("Geometry has Z dimension but column does not"), { code: "22023" }); });
  const bad = await _internal.summarizeLayer(failing, entry, "{}", 100, ["pl24"], []);
  assert.equal(bad.available, false);
  assert.equal(bad.error.code, "22023");
  assert.match(bad.note, /Z dimension/);
});

// ------------------------------------------- wilayah tanpa titik kejadian
/**
 * Pool palsu yang bisa diatur: risk = { banjir: [...rows] }, events = { banjir: n }.
 * Tabel lain kosong. Dipakai untuk skrining hazard dan short-circuit.
 */
function scenarioPool({ risk = {}, events = {}, priority = [] } = {}) {
  const tableToHazard = {
    risiko_banjir: "banjir", risiko_banjir_bandang: "banjir_bandang", risiko_longsor: "longsor",
    risiko_karhutla: "karhutla", risiko_kekeringan: "kekeringan", risiko_abrasi: "abrasi",
  };
  const respond = (sql, params) => {
    if (/FROM geometry_columns/.test(sql) || /information_schema\.columns/.test(sql)) return { rows: [] };
    if (/AS kosong/.test(sql) || /AS luas_m2 FROM a/.test(sql)) return { rows: [{ luas_m2: 100000000, kosong: false }] };
    if (/cand AS/.test(sql)) return { rows: priority };
    const m = sql.match(/FROM (risiko_[a-z_]+) r/);
    if (m) return { rows: risk[tableToHazard[m[1]]] || [] };
    if (/FROM kejadian/.test(sql)) {
      const cats = (params && params[1]) || [];
      const hz = Object.keys(events).find((h) => cats.length && cats.every((c) => events[h + ":cats"] ? events[h + ":cats"].includes(c) : true));
      const n = hz ? events[hz] : 0;
      return { rows: [{ jumlah: n, tanggal_pertama: null, tanggal_terakhir: null }] };
    }
    if (/COUNT\(\*\)::bigint AS n/.test(sql)) return { rows: [{ n: 0 }] };
    return { rows: [] };
  };
  const client = {
    query: async (sql, params) => (/^(BEGIN|COMMIT|ROLLBACK|SET LOCAL)/.test(sql.trim()) ? { rows: [] } : respond(sql, params)),
    release() {},
  };
  return { query: client.query, connect: async () => client };
}

const goodReq = (hazard, ip) => ({ headers: { authorization: "Bearer good" }, body: body(hazard), ip, });

test("hazard auto tanpa risiko dan tanpa kejadian: jawaban jujur, OpenAI tidak dipanggil", { skip: !isStub }, async () => {
  process.env.OPENAI_API_KEY = "sk-test";
  delete process.env.AI_RATE_LIMIT_PER_HOUR;
  process.env.AI_RATE_LIMIT_PER_HOUR = "0";
  OpenAI.calls.length = 0;
  const { createAiMitigationRecommendationRouter } = require("../aiMitigationRecommendation");
  const router = createAiMitigationRecommendationRouter(scenarioPool());
  const res = await invoke(router, "POST", "/mitigation-recommendation", goodReq("auto"));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.ai_used, false);
  assert.equal(res.body.no_mapped_risk, true);
  assert.equal(res.body.hazard_screening.length, 6);
  assert.equal(OpenAI.calls.length, 0);
});

test("hazard auto memilih bencana dengan risiko terpetakan terbesar", { skip: !isStub }, async () => {
  process.env.OPENAI_API_KEY = "sk-test";
  process.env.OPENAI_MODEL = "m-auto";
  OpenAI.calls.length = 0;
  OpenAI.handler = async () => ({ output_text: JSON.stringify({
    diagnosis: "d", risk_level: "sedang", primary_drivers: [], recommendations: [], adaptation_measures: [],
    data_gaps: [], confidence: 70, verification_needed: false, verification_reason: "",
  }) });
  const pool = scenarioPool({
    risk: {
      banjir: [{ kelas: "Sedang", jumlah_fitur: 3, luas_interseksi_m2: 5000000 }],
      longsor: [{ kelas: "Tinggi", jumlah_fitur: 9, luas_interseksi_m2: 30000000 }],
    },
    priority: [{ kelas: "Tinggi", lat: -6.6, lng: 106.8, luas_m2: 2500000 }],
  });
  const { createAiMitigationRecommendationRouter } = require("../aiMitigationRecommendation");
  const router = createAiMitigationRecommendationRouter(pool);
  const res = await invoke(router, "POST", "/mitigation-recommendation", goodReq("semua"));
  assert.equal(res.statusCode, 200, JSON.stringify(res.body).slice(0, 300));
  assert.equal(res.body.hazard, "longsor");
  assert.equal(res.body.hazard_source, "auto");
  assert.equal(res.body.hazard_screening[0].hazard, "longsor");
  // 0 kejadian tercatat → wajib verifikasi + catatan jujur
  assert.equal(res.body.verification_needed, true);
  assert.match(res.body.verification_reason, /tidak berarti tidak pernah terjadi/);
  // titik prioritas dari GIS, bukan dari AI
  assert.equal(res.body.priority_locations.length, 1);
  assert.equal(res.body.priority_locations[0].lat, -6.6);
  const sent = JSON.parse(OpenAI.calls[0].input[1].content[0].text);
  assert.equal(sent.hazard_source, "auto");
  assert.equal(sent.priority_locations[0].lat, undefined, "koordinat tidak dikirim ke AI");
});

test("hazard eksplisit tanpa risiko & kejadian: short-circuit dengan MCDA, tanpa OpenAI", { skip: !isStub }, async () => {
  process.env.OPENAI_API_KEY = "sk-test";
  process.env.OPENAI_MODEL = "m-explicit";
  OpenAI.calls.length = 0;
  const { createAiMitigationRecommendationRouter } = require("../aiMitigationRecommendation");
  const router = createAiMitigationRecommendationRouter(scenarioPool());
  const res = await invoke(router, "POST", "/mitigation-recommendation", goodReq("abrasi"));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ai_used, false);
  assert.equal(res.body.hazard, "abrasi");
  assert.ok(res.body.mcda);
  assert.equal(OpenAI.calls.length, 0);
});

test("hazard tidak dikenal tetap ditolak", { skip: !isStub }, async () => {
  const { createAiMitigationRecommendationRouter } = require("../aiMitigationRecommendation");
  const router = createAiMitigationRecommendationRouter(scenarioPool());
  const res = await invoke(router, "POST", "/mitigation-recommendation", goodReq("gempa"));
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "INVALID_HAZARD");
});

// ------------------------------------------------ lapisan peta dasar keputusan
test("map_layers: zona risiko + titik sarana ikut di respons, tidak dikirim ke AI", { skip: !isStub }, async () => {
  process.env.OPENAI_API_KEY = "sk-test";
  process.env.OPENAI_MODEL = "m-layers";
  process.env.AI_RATE_LIMIT_PER_HOUR = "0";
  OpenAI.calls.length = 0;
  OpenAI.handler = async () => ({ output_text: JSON.stringify({
    diagnosis: "d", risk_level: "tinggi", primary_drivers: [], recommendations: [], adaptation_measures: [],
    data_gaps: [], confidence: 70, verification_needed: false, verification_reason: "",
  }) });
  const zoneGeo = JSON.stringify({ type: "Polygon", coordinates: [[[106.8, -6.1], [106.9, -6.1], [106.9, -6.2], [106.8, -6.1]]] });
  const base = fakePool();
  const pool = {
    ...base,
    connect: async () => {
      const client = await base.connect();
      return {
        ...client,
        query: async (sql, params) => {
          if (/ST_AsGeoJSON/.test(sql) && /risiko_banjir/.test(sql)) {
            return { rows: [{ kelas: "Tinggi", gj: zoneGeo, luas_m2: 28000000 }] };
          }
          if (/AS nama/.test(sql) && /"situ"/.test(sql)) {
            return { rows: [{ nama: "Situ Uji", lat: -6.15, lng: 106.85 }] };
          }
          return client.query(sql, params);
        },
      };
    },
  };
  const { createAiMitigationRecommendationRouter } = require("../aiMitigationRecommendation");
  const router = createAiMitigationRecommendationRouter(pool);
  const res = await invoke(router, "POST", "/mitigation-recommendation", { headers: { authorization: "Bearer good" }, body: body("banjir"), ip: "layers" });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body).slice(0, 300));
  const zones = res.body.map_layers.risk_zones.features;
  assert.equal(zones.length, 1);
  assert.equal(zones[0].properties.kelas, "Tinggi");
  assert.equal(zones[0].properties.luas_ha, 2800);
  assert.equal(zones[0].properties.persen_wilayah, 28);
  const sent = OpenAI.calls[0].input[1].content[0].text;
  assert.ok(!sent.includes("risk_zones") && !sent.includes("106.85"), "lapisan peta bocor ke prompt");
});

test("map_layers: lapisan poligon yang melebihi batas ukuran dibuang dan dicatat", { skip: !isStub }, async () => {
  const { _internal } = require("../aiMitigationRecommendation");
  assert.ok(_internal.simplifyTolerance(5.38e6) >= 0.00002);
  assert.ok(_internal.simplifyTolerance(1e10) <= 0.002);
  const bigRing = Array.from({ length: 4000 }, (_, i) => [106 + i / 1e4, -6 - i / 1e4]);
  bigRing.push(bigRing[0]);
  const pool = scriptedPool((sql) => (/ST_AsGeoJSON/.test(sql)
    ? { rows: [{ kelas: "Tinggi", gj: JSON.stringify({ type: "Polygon", coordinates: [bigRing] }), luas_m2: 1e6 }] }
    : { rows: [] }));
  process.env.AI_MAP_LAYER_MAX_BYTES = "20000";
  const layers = await _internal.loadMapLayers(pool, "banjir", "{}", { area_m2: 1e7, total_risk_features: 1 });
  delete process.env.AI_MAP_LAYER_MAX_BYTES;
  assert.equal(layers.risk_zones, null);
  assert.deepEqual(layers.omitted, ["risk_zones"]);
});
