"use strict";

/**
 * SIMITI — skor prioritas wilayah berbasis MCDA (deterministik, tanpa LLM).
 *
 * Mengikuti "Rancangan Logika AI SIMITI" bab 7.2–7.3:
 *   S = Σ (w_i × x_i), x_i dinormalisasi 0–100.
 *
 * Indikator yang datanya tidak tersedia TIDAK dikarang: indikator tersebut
 * dikeluarkan dari perhitungan, skor dinormalisasi ulang terhadap bobot yang
 * tersedia, dan cakupan bobot (coverage) dilaporkan agar pengguna tahu
 * seberapa lengkap dasar skornya.
 */

const DEFAULT_WEIGHTS = Object.freeze({
  risiko: 25,
  lahan_kritis: 20,
  historis: 15,
  hidrologi_topografi: 15,
  infrastruktur_eksisting: 10,
  iklim: 10,
  kelayakan: 5,
});

const INDICATOR_LABELS = Object.freeze({
  risiko: "Kerawanan dan risiko",
  lahan_kritis: "Lahan kritis dan tutupan lahan",
  historis: "Historis kejadian",
  hidrologi_topografi: "Hidrologi dan topografi",
  infrastruktur_eksisting: "Kesenjangan infrastruktur mitigasi eksisting",
  iklim: "Iklim dan curah hujan",
  kelayakan: "Kelayakan teknis dan lingkungan",
});

const WET_HAZARDS = new Set(["banjir", "banjir_bandang", "longsor"]);
const DRY_HAZARDS = new Set(["kekeringan", "karhutla"]);

function clamp(value, min = 0, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function round1(value) {
  return Math.round(Number(value) * 10) / 10;
}

/** Nilai 0–100 untuk label kelas risiko/kerawanan teks. */
function riskClassValue(label) {
  const s = String(label || "").toLowerCase();
  if (/sangat\s*tinggi/.test(s)) return 100;
  if (/tinggi/.test(s)) return 85;
  if (/sedang|menengah/.test(s)) return 55;
  if (/sangat\s*rendah/.test(s)) return 10;
  if (/rendah/.test(s)) return 25;
  return null;
}

/** Rata-rata tertimbang luas dari daftar kelas risiko. */
function scoreRisk(riskClasses) {
  const rows = (riskClasses || [])
    .map((row) => ({
      value: riskClassValue(row.kelas),
      area: Number(row.luas_interseksi_m2) || 0,
      count: Number(row.jumlah_fitur) || 0,
    }))
    .filter((row) => row.value !== null);
  if (!rows.length) return null;

  const totalArea = rows.reduce((sum, row) => sum + row.area, 0);
  const useArea = totalArea > 0;
  const total = useArea ? totalArea : rows.reduce((sum, row) => sum + row.count, 0);
  if (total <= 0) return null;

  const weighted = rows.reduce(
    (sum, row) => sum + row.value * (useArea ? row.area : row.count),
    0,
  );
  return {
    value: round1(weighted / total),
    basis: useArea ? "rata-rata tertimbang luas irisan kelas risiko" : "rata-rata tertimbang jumlah fitur",
  };
}

/** Nilai 0–100 untuk kelas lahan kritis. */
function criticalLandValue(label) {
  const s = String(label || "").toLowerCase();
  if (/tidak\s*kritis|non\s*kritis/.test(s)) return 0;
  if (/sangat\s*kritis/.test(s)) return 100;
  if (/agak\s*kritis/.test(s)) return 50;
  if (/potensial/.test(s)) return 25;
  if (/kritis/.test(s)) return 80;
  return null;
}

/**
 * classes: [{ kelas, luas_m2 }], coverageRatio: porsi wilayah yang tertutup
 * layer (0–1). Area di luar layer dianggap tidak teridentifikasi, bukan kritis.
 */
function scoreCriticalLand(layer) {
  if (!layer || !layer.available || !Array.isArray(layer.classes) || !layer.classes.length) {
    return null;
  }
  const rows = layer.classes
    .map((row) => ({ value: criticalLandValue(row.kelas), area: Number(row.luas_m2) || 0 }))
    .filter((row) => row.value !== null && row.area > 0);
  if (!rows.length) return null;
  const area = rows.reduce((sum, row) => sum + row.area, 0);
  const mean = rows.reduce((sum, row) => sum + row.value * row.area, 0) / area;
  return {
    value: round1(mean),
    basis: `kelas lahan kritis tertimbang luas (${layer.source_table})`,
  };
}

function scoreHistory(eventHistory) {
  if (!eventHistory || !eventHistory.available) return null;
  const n = Number(eventHistory.count) || 0;
  let value;
  if (n <= 0) value = 0;
  else if (n === 1) value = 30;
  else if (n === 2) value = 50;
  else if (n <= 4) value = 70;
  else if (n <= 9) value = 85;
  else value = 100;
  return { value, basis: `${n} kejadian tercatat di dalam wilayah` };
}

/**
 * Proxy hidrologi/topografi: porsi wilayah yang tercakup layer kerawanan
 * pendukung (mis. rawan limpasan/erosi) dengan kelas tinggi, atau tercakup
 * sama sekali bila layer tidak mempunyai kolom kelas.
 */
function scoreHydroProxy(layers) {
  const usable = (layers || []).filter((layer) => layer && layer.available);
  if (!usable.length) return null;
  const parts = usable.map((layer) => {
    if (Array.isArray(layer.classes) && layer.classes.length && layer.area_m2 > 0) {
      const scored = layer.classes
        .map((row) => ({ value: riskClassValue(row.kelas), area: Number(row.luas_m2) || 0 }))
        .filter((row) => row.value !== null);
      if (scored.length) {
        const covered = scored.reduce((s, r) => s + r.area, 0);
        const weighted = scored.reduce((s, r) => s + r.value * r.area, 0);
        // area tanpa layer = 0
        return weighted / Math.max(covered, layer.area_m2);
      }
    }
    return clamp((Number(layer.coverage_ratio) || 0) * 100);
  });
  const value = parts.reduce((sum, v) => sum + v, 0) / parts.length;
  return {
    value: round1(value),
    basis: `proxy dari ${usable.map((l) => l.source_table).join(", ")} (kelerengan/DEM belum tersedia)`,
  };
}

/** Semakin sedikit sarana mitigasi relevan di wilayah, semakin besar kebutuhan. */
function scoreInfrastructureGap(existing) {
  if (!existing || !existing.checked) return null;
  const n = Number(existing.relevant_total) || 0;
  let value;
  if (n === 0) value = 100;
  else if (n <= 2) value = 60;
  else if (n <= 5) value = 30;
  else value = 10;
  return {
    value,
    basis: `${n} sarana mitigasi relevan ditemukan di dalam wilayah`,
  };
}

/** Ambil angka mm/tahun pertama dari label kelas curah hujan, mis. "2500 - 3000". */
function parseRainfallMm(label) {
  const match = String(label ?? "").replace(/\./g, "").match(/\d{3,5}(?:[.,]\d+)?/);
  if (!match) return null;
  const n = Number(match[0].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function scoreRainfall(layer, hazard) {
  if (!layer || !layer.available || !Array.isArray(layer.classes) || !layer.classes.length) {
    return null;
  }
  const rows = layer.classes
    .map((row) => ({ mm: parseRainfallMm(row.kelas), area: Number(row.luas_m2) || 0 }))
    .filter((row) => row.mm !== null && row.area > 0);
  if (!rows.length) return null;
  const area = rows.reduce((s, r) => s + r.area, 0);
  const mm = rows.reduce((s, r) => s + r.mm * r.area, 0) / area;

  let value;
  if (WET_HAZARDS.has(hazard)) {
    value = mm >= 3000 ? 100 : mm >= 2500 ? 80 : mm >= 2000 ? 60 : mm >= 1500 ? 40 : 20;
  } else if (DRY_HAZARDS.has(hazard)) {
    value = mm < 1000 ? 100 : mm < 1500 ? 80 : mm < 2000 ? 60 : mm < 2500 ? 40 : 20;
  } else {
    return null;
  }
  return {
    value,
    basis: `curah hujan tahunan ±${Math.round(mm)} mm (tertimbang luas, ${layer.source_table})`,
  };
}

function categoryFor(score) {
  if (score === null) return "Belum dapat dinilai";
  if (score >= 80) return "Sangat sesuai";
  if (score >= 65) return "Sesuai";
  if (score >= 50) return "Perlu kajian lanjutan";
  return "Kurang sesuai";
}

/**
 * Hitung skor MCDA wilayah dari spatial evidence yang dihasilkan backend.
 * Mengembalikan breakdown per indikator agar bisa dijelaskan (explainable).
 */
function computeMcda(evidence, weights = DEFAULT_WEIGHTS) {
  const hazard = evidence?.hazard;
  const layers = evidence?.supporting_layers || {};

  const raw = {
    risiko: scoreRisk(evidence?.risk_classes),
    lahan_kritis: scoreCriticalLand(layers.critical_land),
    historis: scoreHistory(evidence?.event_history),
    hidrologi_topografi: scoreHydroProxy(layers.hydro_proxy?.layers),
    infrastruktur_eksisting: scoreInfrastructureGap(evidence?.existing_mitigation),
    iklim: scoreRainfall(layers.rainfall, hazard),
    // Kelayakan wajib diperlakukan sebagai constraint & verifikasi lapangan,
    // bukan nilai yang ditebak dari data yang belum tersedia.
    kelayakan: null,
  };

  const indicators = Object.keys(weights).map((key) => {
    const result = raw[key];
    return {
      key,
      label: INDICATOR_LABELS[key] || key,
      weight: weights[key],
      available: Boolean(result),
      value: result ? clamp(result.value) : null,
      contribution: result ? round1((weights[key] * clamp(result.value)) / 100) : 0,
      basis: result
        ? result.basis
        : key === "kelayakan"
          ? "Tidak diskor; diperlakukan sebagai syarat wajib yang diverifikasi lapangan."
          : "Data belum tersedia untuk wilayah ini; indikator tidak dihitung.",
    };
  });

  const totalWeight = indicators.reduce((s, i) => s + i.weight, 0);
  const availableWeight = indicators
    .filter((i) => i.available)
    .reduce((s, i) => s + i.weight, 0);
  const weightedSum = indicators
    .filter((i) => i.available)
    .reduce((s, i) => s + i.weight * i.value, 0);

  const score = availableWeight > 0 ? round1(weightedSum / availableWeight) : null;
  const coverage = totalWeight > 0 ? round1((availableWeight / totalWeight) * 100) : 0;

  return {
    method: "MCDA weighted sum (bobot awal Rancangan Logika AI SIMITI §7.2)",
    score,
    category: categoryFor(score),
    coverage_percent: coverage,
    low_coverage: coverage < 60,
    indicators,
    note:
      "Skor dinormalisasi terhadap bobot indikator yang datanya tersedia. Ambang kategori bersifat ilustratif dan wajib dikalibrasi.",
  };
}

module.exports = {
  DEFAULT_WEIGHTS,
  computeMcda,
  categoryFor,
  riskClassValue,
  criticalLandValue,
  parseRainfallMm,
  _internal: {
    scoreRisk,
    scoreCriticalLand,
    scoreHistory,
    scoreHydroProxy,
    scoreInfrastructureGap,
    scoreRainfall,
  },
};
