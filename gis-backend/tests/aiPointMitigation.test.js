const test = require("node:test");
const assert = require("node:assert/strict");
const { _internal } = require("../aiPointMitigation");

const { applyRules, riskShares } = _internal;

const ctxBase = (over = {}) => ({
  hazard: "kekeringan",
  risk: { tinggi: 40, sedang: 30, rendah: 30 },
  layers: {},
  assets: [],
  events: 0,
  ...over,
});

test("riskShares menjumlahkan persen per kelas", () => {
  const r = riskShares({ risk_classes: [
    { kelas: "Tinggi", persen_wilayah: 10 }, { kelas: "Sangat Tinggi", persen_wilayah: 5 },
    { kelas: "Sedang", persen_wilayah: 20 }, { kelas: "Rendah", persen_wilayah: 30 },
  ] });
  assert.deepEqual(r, { tinggi: 15, sedang: 20, rendah: 30 });
});

test("embung baru ditolak bila sudah ada tampungan <= 1500 m (tidak menggandakan)", () => {
  const recs = applyRules("kekeringan", ctxBase({ assets: [{ table: "embung", jarak_m: 400, nama: "E1" }] }), 60);
  const embung = recs.find((r) => r.model_type.startsWith("Embung"));
  assert.equal(embung.constraint_status, "NOT_ELIGIBLE");
  assert.equal(embung.suitability_score, null);
  assert.ok(recs.some((r) => r.model_type.startsWith("Optimalisasi")));
  // yang tidak layak diurutkan paling akhir
  assert.equal(recs[recs.length - 1].constraint_status, "NOT_ELIGIBLE");
});

test("embung tanpa sarana terdekat -> perlu verifikasi/data, skor terisi", () => {
  const recs = applyRules("kekeringan", ctxBase(), 60);
  const embung = recs.find((r) => r.model_type.startsWith("Embung"));
  assert.equal(embung.constraint_status, "NEEDS_DATA"); // geologi belum tersedia
  assert.ok(embung.suitability_score > 0);
});

test("sekat kanal NOT_ELIGIBLE tanpa ekosistem gambut", () => {
  const recs = applyRules("karhutla", ctxBase({ hazard: "karhutla" }), 60);
  const sekat = recs.find((r) => r.rule_id === "sekat_kanal");
  assert.equal(sekat.constraint_status, "NOT_ELIGIBLE");
  assert.deepEqual(sekat.failed_constraints, ["peat_ecosystem_present"]);
});

test("sekat kanal diusulkan bila gambut ada", () => {
  const layers = { peat: { available: true, classes: [{ kelas: "Fungsi Lindung", persen_wilayah: 80 }] } };
  const recs = applyRules("karhutla", ctxBase({ hazard: "karhutla", layers }), 60);
  const sekat = recs.find((r) => r.rule_id === "sekat_kanal");
  assert.equal(sekat.constraint_status, "NEEDS_FIELD_VERIFICATION");
});

test("tanpa skor MCDA memakai dasar netral 50, tidak error", () => {
  const recs = applyRules("banjir", ctxBase({ hazard: "banjir" }), undefined);
  assert.ok(recs.length > 0);
  assert.ok(recs.every((r) => r.verification_status === undefined)); // diisi di handler, bukan di aturan
});
