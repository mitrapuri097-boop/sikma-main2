const test = require("node:test");
const assert = require("node:assert/strict");
const { _internal } = require("../aiExternalData");

test("summarizeBmkg: total, maks, dan slot hujan lebat dalam 72 jam", () => {
  const slot = (h, tp, desc) => ({ datetime: `2026-11-24T${String(h).padStart(2, "0")}:00:00Z`, tp, weather_desc: desc });
  const payload = { data: [{ lokasi: { desa: "Batu Tulis", adm4: "32.71.01.1001" }, cuaca: [[slot(0, 1.5, "Cerah Berawan"), slot(3, 12.7, "Hujan Petir")], [slot(6, 4, "Hujan Ringan")]] }] };
  const s = _internal.summarizeBmkg(payload);
  assert.equal(s.hujan_total_mm, 18.2);
  assert.equal(s.hujan_maks_mm_per_3jam, 12.7);
  assert.equal(s.slot_hujan, 2);
  assert.equal(s.slot_hujan_lebat_atau_petir, 1);
  assert.equal(s.desa, "Batu Tulis");
});

test("summarizeBmkg: data kosong -> null (tidak mengarang)", () => {
  assert.equal(_internal.summarizeBmkg({ data: [] }), null);
  assert.equal(_internal.summarizeBmkg(null), null);
});

test("parseFirmsCsv: hitung hotspot & confidence tinggi; respons error -> null", () => {
  const csv = "latitude,longitude,confidence,frp\n-1.1,110.1,h,10.5\n-1.2,110.2,n,3\n-1.3,110.3,h,2.5\n";
  assert.deepEqual(_internal.parseFirmsCsv(csv), { hotspots: 3, hotspots_high_confidence: 2, frp_total_mw: 16 });
  assert.equal(_internal.parseFirmsCsv("Invalid MAP_KEY"), null);
  assert.deepEqual(_internal.parseFirmsCsv("latitude,longitude,confidence,frp\n"), { hotspots: 0, hotspots_high_confidence: 0, frp_total_mw: 0 });
});
