import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Circle, MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/$/, "");

type RiskFactor = {
  key: string;
  label: string;
  status: string;
  level: number | null;
  class?: string | null;
  source?: string;
  available?: boolean;
};

type Assessment = {
  success: boolean;
  generatedAt?: string;
  source?: string;
  analysisType?: string;
  location?: {
    latitude: number;
    longitude: number;
    administrative?: {
      provinsi?: string | null;
      kabupaten?: string | null;
      kecamatan?: string | null;
      kelurahan?: string | null;
      desa?: string | null;
      das?: string | null;
      [key: string]: unknown;
    };
  };
  risk?: {
    status: string;
    index: number | null;
    scale?: string;
    factors?: RiskFactor[];
    [key: string]: unknown;
  };
  recommendations?: Array<{
    title: string;
    detail: string;
    priority: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

type Weather = {
  success: boolean;
  source?: string;
  generatedAt?: string;
  current?: Record<string, number | null> | null;
  current_units?: Record<string, string>;
  [key: string]: unknown;
};

const gpsIcon = L.divIcon({
  className: "smiti-gps-marker",
  html: `<div style="width:42px;height:42px;border-radius:50%;background:rgba(14,165,233,.16);border:1px solid rgba(56,189,248,.65);display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 9px rgba(14,165,233,.06),0 0 24px rgba(34,211,238,.35)"><div style="width:16px;height:16px;border-radius:50%;background:#22d3ee;border:3px solid #08233e"></div></div>`,
  iconSize: [42, 42],
  iconAnchor: [21, 21],
});

function statusMeta(status?: string) {
  const value = String(status || "").toLowerCase();

  if (value.includes("bahaya")) {
    return { color: "text-red-300", bg: "bg-red-500/10", border: "border-red-500/30", dot: "bg-red-400", icon: "!" };
  }
  if (value.includes("waspada")) {
    return { color: "text-orange-300", bg: "bg-orange-500/10", border: "border-orange-500/30", dot: "bg-orange-400", icon: "!" };
  }
  if (value.includes("siaga")) {
    return { color: "text-amber-300", bg: "bg-amber-500/10", border: "border-amber-500/30", dot: "bg-amber-400", icon: "⚠" };
  }
  if (value.includes("aman")) {
    return { color: "text-emerald-300", bg: "bg-emerald-500/10", border: "border-emerald-500/30", dot: "bg-emerald-400", icon: "✓" };
  }

  // Level faktor individual: Tinggi=3, Sedang=2, Rendah=1.
  if (value.includes("tinggi")) {
    return { color: "text-red-300", bg: "bg-red-500/10", border: "border-red-500/30", dot: "bg-red-400", icon: "!" };
  }
  if (value.includes("sedang")) {
    return { color: "text-amber-300", bg: "bg-amber-500/10", border: "border-amber-500/30", dot: "bg-amber-400", icon: "⚠" };
  }
  if (value.includes("rendah")) {
    return { color: "text-emerald-300", bg: "bg-emerald-500/10", border: "border-emerald-500/30", dot: "bg-emerald-400", icon: "✓" };
  }

  return { color: "text-slate-300", bg: "bg-slate-500/10", border: "border-slate-700", dot: "bg-slate-400", icon: "•" };
}

const RISK_PARAMETERS = [
  "longsor",
  "banjir",
  "banjir bandang",
  "kekeringan",
  "karhutla",
] as const;

function normalizeRiskLevel(value: unknown): 1 | 2 | 3 | null {
  const v = String(value ?? "").trim().toLowerCase();

  if (v === "tinggi" || v === "3") return 3;
  if (v === "sedang" || v === "2") return 2;
  if (v === "rendah" || v === "1") return 1;

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value === 3) return 3;
    if (value === 2) return 2;
    if (value === 1) return 1;
  }

  return null;
}

function classifyLocationScore(score: number | null) {
  if (score == null) return { status: "Belum tersedia", color: "unknown" };

  if (score >= 5 && score <= 7) return { status: "Aman", color: "green" };
  if (score >= 8 && score <= 10) return { status: "Siaga", color: "yellow" };
  if (score >= 11 && score <= 13) return { status: "Waspada", color: "orange" };
  if (score >= 14 && score <= 15) return { status: "Bahaya", color: "red" };

  return { status: "Belum tersedia", color: "unknown" };
}

function RiskBar({ value }: { value: number | null }) {
  const width = value == null ? 0 : Math.min(100, Math.max(0, value));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
      <div
        className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500 transition-all duration-500"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function RecenterMap({ position, zoom }: { position: [number, number] | null; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo(position, zoom, { duration: 1 });
  }, [map, position, zoom]);
  return null;
}

function MapResize() {
  const map = useMap();
  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 150);
    return () => window.clearTimeout(timer);
  }, [map]);
  return null;
}

function formatNumber(value: unknown, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("id-ID", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function displayKey(key: string) {
  return key
    .replace(/_2m|_10m/g, "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusDescription(status?: string) {
  if (!status) return "Status risiko belum tersedia dari layanan analisis.";
  return `Status risiko ${status} berdasarkan hasil analisis spasial pada titik GPS aktif.`;
}

function getNumericRiskPercent(level: number | null) {
  if (level == null || !Number.isFinite(level)) return null;
  // Hanya normalisasi tampilan. Nilai sumber tetap berasal dari API.
  if (level >= 0 && level <= 1) return level * 100;
  if (level >= 0 && level <= 100) return level;
  return Math.min(100, Math.max(0, level * 20));
}

export default function LokasiSaya() {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [gpsState, setGpsState] = useState<"idle" | "requesting" | "ready" | "error">("idle");
  const [gpsMessage, setGpsMessage] = useState("Menunggu izin lokasi perangkat…");

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);

  const [assessmentState, setAssessmentState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [weatherState, setWeatherState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [activePanel, setActivePanel] = useState<"risk" | "recommendation">("risk");
  const [mapZoom, setMapZoom] = useState(16);

  const requestGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsState("error");
      setGpsMessage("Browser tidak mendukung Geolocation API.");
      return;
    }

    setGpsState("requesting");
    setGpsMessage("Mengambil koordinat GPS dengan akurasi tinggi…");
    setErrorMessage("");

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) {
          setGpsState("error");
          setGpsMessage("Koordinat GPS tidak valid.");
          return;
        }

        setPosition([coords.latitude, coords.longitude]);
        setAccuracy(Number.isFinite(coords.accuracy) ? coords.accuracy : null);
        setMapZoom(16);
        setGpsState("ready");
        setGpsMessage(
          Number.isFinite(coords.accuracy)
            ? `GPS aktif • akurasi ±${Math.round(coords.accuracy)} m`
            : "GPS aktif",
        );
      },
      (error) => {
        setGpsState("error");
        setGpsMessage(
          error.code === 1
            ? "Izin lokasi ditolak. Aktifkan Location untuk situs ini."
            : error.code === 2
              ? "Lokasi perangkat tidak tersedia."
              : "Pengambilan GPS timeout. Coba lagi.",
        );
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 },
    );
  }, []);

  const analyzeLocation = useCallback(async (lat: number, lng: number) => {
    setAssessmentState("loading");
    setWeatherState("loading");
    setErrorMessage("");

    const assessmentUrl =
      `${API_URL}/api/location-assessment?latitude=${encodeURIComponent(lat)}` +
      `&longitude=${encodeURIComponent(lng)}`;

    const weatherUrl =
      `${API_URL}/api/weather/current?latitude=${encodeURIComponent(lat)}` +
      `&longitude=${encodeURIComponent(lng)}`;

    const [assessmentResult, weatherResult] = await Promise.allSettled([
      fetch(assessmentUrl),
      fetch(weatherUrl),
    ]);

    let assessmentFailed = false;

    if (assessmentResult.status === "fulfilled") {
      try {
        const response = assessmentResult.value;
        const json = await response.json();

        if (!response.ok || !json?.success) {
          throw new Error(json?.message || "Analisis lokasi gagal.");
        }

        setAssessment(json);
        setAssessmentState("ready");
      } catch (error) {
        assessmentFailed = true;
        setAssessmentState("error");
        setErrorMessage(error instanceof Error ? error.message : "Analisis lokasi gagal.");
      }
    } else {
      assessmentFailed = true;
      setAssessmentState("error");
      setErrorMessage("Tidak dapat terhubung ke API analisis lokasi.");
    }

    if (weatherResult.status === "fulfilled") {
      try {
        const response = weatherResult.value;
        if (!response.ok) throw new Error("API cuaca tidak tersedia.");

        const json = await response.json();
        if (!json?.success) throw new Error(json?.message || "Data cuaca tidak tersedia.");

        setWeather(json);
        setWeatherState("ready");
      } catch {
        setWeatherState("error");
      }
    } else {
      setWeatherState("error");
    }

    if (assessmentFailed) setGpsState("error");
  }, []);

  useEffect(() => {
    requestGps();
  }, [requestGps]);

  useEffect(() => {
    if (position) analyzeLocation(position[0], position[1]);
  }, [position, analyzeLocation]);

  const factors = assessment?.risk?.factors || [];
  const recommendations = assessment?.recommendations || [];

  // ATURAN MY LOKASI:
  // 5 parameter wajib: Longsor, Banjir, Banjir Bandang, Kekeringan, Karhutla.
  // Bobot: Tinggi=3, Sedang=2, Rendah=1.
  // Skor minimum=5, maksimum=15.
  // 5–7 Aman, 8–10 Siaga, 11–13 Waspada, 14–15 Bahaya.
  const weightedRisk = useMemo(() => {
    const byName = new Map(
      factors.map((factor) => [
        String(factor.label || factor.key || "").trim().toLowerCase(),
        factor,
      ]),
    );

    const levels = RISK_PARAMETERS.map((parameter) => {
      const exact = byName.get(parameter);
      if (exact) return normalizeRiskLevel(exact.status) ?? normalizeRiskLevel(exact.level);

      const found = factors.find((factor) => {
        const name = String(factor.label || factor.key || "").trim().toLowerCase();
        return name === parameter || name.includes(parameter) || parameter.includes(name);
      });

      return found
        ? normalizeRiskLevel(found.status) ?? normalizeRiskLevel(found.level)
        : null;
    });

    const complete = levels.every((level): level is 1 | 2 | 3 => level !== null);
    if (!complete) {
      return {
        score: null,
        status: "Belum tersedia",
        levels,
        completed: false,
      };
    }

    const score = levels.reduce((sum, level) => sum + level, 0);
    return {
      score,
      status: classifyLocationScore(score).status,
      levels,
      completed: true,
    };
  }, [factors]);

  const calculatedStatus = weightedRisk.status;
  const displayOverall = weightedRisk.completed ? calculatedStatus : (assessment?.risk?.status || "");
  const overall = displayOverall;
  const meta = statusMeta(overall);

  const index = assessment?.risk?.index ?? null;
  const admin = assessment?.location?.administrative || {};

  const address = useMemo(
    () =>
      [
        admin.kelurahan || admin.desa,
        admin.kecamatan,
        admin.kabupaten,
        admin.provinsi,
      ]
        .filter(Boolean)
        .join(" • ") || "Administrasi belum terpetakan",
    [admin],
  );

  const weatherItems = useMemo(() => {
    const current = weather?.current || {};
    return Object.keys(current)
      .filter((key) => current[key] !== null && current[key] !== undefined)
      .map((key) => ({
        key,
        label: displayKey(key),
        value: current[key],
        unit: weather?.current_units?.[key] || "",
      }));
  }, [weather]);

  const authoritativeIndex = weightedRisk.completed
    ? weightedRisk.score
    : index;

  // Visual percentage for a 5–15 score. The actual score remains 5–15.
  const indexPercent = authoritativeIndex == null
    ? 0
    : Math.min(100, Math.max(0, ((Number(authoritativeIndex) - 5) / 10) * 100));

  const dynamicRiskDetails = useMemo(() => {
    if (!assessment?.risk) return [];

    return Object.entries(assessment.risk)
      .filter(([key, value]) => !["status", "index", "scale", "factors"].includes(key))
      .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
      .map(([key, value]) => ({
        key,
        label: displayKey(key),
        value: String(value),
      }));
  }, [assessment]);

  return (
    <div className="min-h-screen bg-[#06111f] text-slate-100">
      <header className="sticky top-0 z-[1000] border-b border-slate-800/80 bg-[#071426]/95 px-4 py-3 backdrop-blur-xl md:px-6">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-xl">
              ◎
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">
                SIMITI Enterprise • Spatial Decision Support
              </div>
              <h1 className="truncate text-lg font-semibold tracking-tight">Cek Lokasi Saya</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className={`hidden rounded-lg border px-3 py-2 text-[10px] font-semibold md:block ${meta.border} ${meta.bg} ${meta.color}`}>
              <span className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${meta.dot}`} />
              {overall || "ANALISIS BELUM TERSEDIA"}
            </div>
            <button
              onClick={requestGps}
              disabled={gpsState === "requesting"}
              className="rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/15 disabled:opacity-50"
            >
              {gpsState === "requesting" ? "⌖ Mengambil…" : "⌖ Ambil GPS"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] space-y-4 p-4 md:p-5">
        {errorMessage && (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-xs text-red-200">
            <span>⚠ {errorMessage}</span>
            {position && (
              <button
                onClick={() => analyzeLocation(position[0], position[1])}
                className="rounded-md border border-red-400/20 px-2 py-1 font-semibold hover:bg-red-400/10"
              >
                Coba lagi
              </button>
            )}
          </div>
        )}

        <section className={`rounded-2xl border ${meta.border} ${meta.bg} p-4 shadow-2xl`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl border ${meta.border} text-xl ${meta.color}`}>
                {assessmentState === "loading" ? "…" : meta.icon}
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">
                  Status analisis spasial
                </div>
                <div className={`text-xl font-black ${meta.color}`}>
                  {assessmentState === "loading" ? "MENGANALISIS…" : overall || "BELUM DIANALISIS"}
                </div>
                <div className="text-xs text-slate-400">{gpsMessage}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                ["GPS", gpsState],
                ["Risk API", assessmentState],
                ["Weather API", weatherState],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-slate-800 bg-slate-950/25 px-3 py-2">
                  <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
                  <div className="mt-1 text-xs font-semibold">{String(value).toUpperCase()}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#08172a] shadow-2xl">
            <div className="relative h-[540px]">
              <MapContainer
                center={position || [0, 0]}
                zoom={position ? mapZoom : 2}
                minZoom={2}
                scrollWheelZoom
                className="h-full w-full"
              >
                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapResize />
                <RecenterMap position={position} zoom={mapZoom} />

                {position && accuracy != null && (
                  <Circle
                    center={position}
                    radius={accuracy}
                    pathOptions={{
                      color: "#22d3ee",
                      fillColor: "#0ea5e9",
                      fillOpacity: 0.08,
                      weight: 1,
                    }}
                  />
                )}

                {position && <Marker position={position} icon={gpsIcon} />}
              </MapContainer>

              <div className="pointer-events-none absolute left-4 top-4 z-[500] rounded-xl border border-slate-700 bg-[#071426]/90 px-3 py-2 shadow-xl backdrop-blur-md">
                <div className="text-xs font-semibold">Lokasi GPS Anda</div>
                <div className="mt-0.5 text-[10px] text-slate-400">
                  {position
                    ? `${position[0].toFixed(6)}, ${position[1].toFixed(6)} • EPSG:4326`
                    : "Menunggu koordinat…"}
                </div>
              </div>

              {position && (
                <div className="pointer-events-none absolute bottom-4 left-4 z-[500] rounded-xl border border-slate-700 bg-[#071426]/90 px-3 py-2 text-[10px] text-slate-300 backdrop-blur-md">
                  ● Titik GPS
                  {accuracy != null && <span className="ml-4">○ Radius ±{Math.round(accuracy)} m</span>}
                </div>
              )}

              {!position && (
                <div className="absolute inset-0 z-[600] flex items-center justify-center bg-[#06111f]/70 backdrop-blur-[2px]">
                  <div className="max-w-sm rounded-2xl border border-slate-700 bg-[#08172a]/95 p-6 text-center shadow-2xl">
                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400/10 text-2xl text-cyan-300">
                      ⌖
                    </div>
                    <h2 className="font-semibold">Lokasi perangkat diperlukan</h2>
                    <p className="mt-2 text-xs leading-5 text-slate-400">
                      Titik GPS menjadi input analisis spasial.
                    </p>
                    <button
                      onClick={requestGps}
                      className="mt-4 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400"
                    >
                      Izinkan & Ambil Lokasi
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-[#08172a] p-4 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold">Status Risiko</div>
                <span className="rounded-full border border-slate-700 px-2 py-1 text-[10px] text-slate-400">
                  {assessment?.risk?.scale || "API"}
                </span>
              </div>

              <div className={`rounded-xl border ${meta.border} ${meta.bg} p-4`}>
                <div className="flex items-center gap-4">
                  <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${meta.border} text-2xl ${meta.color}`}>
                    {assessmentState === "loading" ? "…" : meta.icon}
                  </div>
                  <div>
                    <div className={`text-2xl font-black ${meta.color}`}>
                      {overall || "—"}
                    </div>
                    <div className="mt-1 text-[11px] leading-4 text-slate-400">
                      {statusDescription(overall)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-[#08172a] p-4 shadow-xl">
              <div className="mb-3 text-sm font-semibold">Penghitungan Bobot MY Lokasi</div>
              <div className="grid grid-cols-3 gap-2 text-[10px]">
                <div className="rounded-lg bg-emerald-400/10 p-2 text-center text-emerald-300">Rendah = 1</div>
                <div className="rounded-lg bg-amber-400/10 p-2 text-center text-amber-300">Sedang = 2</div>
                <div className="rounded-lg bg-red-400/10 p-2 text-center text-red-300">Tinggi = 3</div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[9px] text-slate-400">
                <div>5–7 • Aman</div>
                <div>8–10 • Siaga</div>
                <div>11–13 • Waspada</div>
                <div>14–15 • Bahaya</div>
              </div>
              <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/30 p-2 text-[10px]">
                <span className="text-slate-500">Skor 5 parameter:</span>
                <span className="ml-2 font-bold text-slate-100">
                  {weightedRisk.score ?? "—"} / 15
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-[#08172a] p-4 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold">Faktor Risiko di Lokasi</div>
                <span className="text-[10px] text-slate-500">{factors.length} faktor</span>
              </div>

              <div className="max-h-[350px] space-y-2 overflow-auto pr-1">
                {factors.map((factor) => {
                  const fm = statusMeta(factor.status);
                  const percent = getNumericRiskPercent(factor.level);

                  return (
                    <div key={factor.key} className="rounded-xl border border-slate-800/80 bg-slate-950/20 p-3">
                      <div className="flex items-start gap-2">
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${fm.dot}`} />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-slate-200">{factor.label || factor.key}</div>
                          {factor.class && (
                            <div className="mt-1 text-[10px] text-slate-500">{factor.class}</div>
                          )}
                          {percent != null && (
                            <div className="mt-2"><RiskBar value={percent} /></div>
                          )}
                          {factor.source && (
                            <div className="mt-1 text-[9px] text-slate-600">{factor.source}</div>
                          )}
                        </div>
                        <span className={`rounded-md px-2 py-1 text-[10px] font-bold ${fm.bg} ${fm.color}`}>
                          {factor.status || "—"}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {!factors.length && (
                  <div className="rounded-xl border border-dashed border-slate-700 p-5 text-center text-xs text-slate-500">
                    Tidak ada faktor risiko yang dikembalikan API.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-[#08172a] p-4 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold">Cuaca Saat Ini</div>
                <span className="text-[10px] text-slate-500">{weather?.source || "API"}</span>
              </div>

              {weatherItems.length ? (
                <div className="grid grid-cols-2 gap-2">
                  {weatherItems.map((item) => (
                    <div key={item.key} className="rounded-xl bg-slate-950/30 p-3">
                      <div className="truncate text-[10px] text-slate-500">{item.label}</div>
                      <div className="mt-1 text-lg font-bold">
                        {formatNumber(item.value, 1)}
                        <span className="ml-1 text-[10px] font-normal text-slate-500">{item.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-700 p-4 text-center text-xs text-slate-500">
                  {weatherState === "loading" ? "Mengambil data cuaca…" : "Data cuaca tidak tersedia."}
                </div>
              )}
            </div>
          </aside>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.05fr_.95fr]">
          <div className="rounded-2xl border border-slate-800 bg-[#08172a] p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[.16em] text-cyan-300">Spatial context</div>
                <div className="mt-1 text-sm font-semibold">Koordinat & Administrasi</div>
              </div>
              <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-300">
                {gpsState === "ready" ? "GPS ACTIVE" : gpsState.toUpperCase()}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {[
                ["Latitude", position?.[0]?.toFixed(7) || "—"],
                ["Longitude", position?.[1]?.toFixed(7) || "—"],
                ["Akurasi GPS", accuracy != null ? `±${Math.round(accuracy)} meter` : "—"],
                ["DAS", admin.das || "Belum terpetakan"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-slate-800 bg-slate-950/20 p-3">
                  <div className="text-[10px] text-slate-500">{label}</div>
                  <div className="mt-1 text-xs font-semibold">{value}</div>
                </div>
              ))}

              <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-3 md:col-span-2">
                <div className="text-[10px] text-slate-500">Wilayah Administratif</div>
                <div className="mt-1 text-xs leading-5 text-slate-200">{address}</div>
              </div>
            </div>
          </div>

          {/* ANALISIS 2 — seluruh nilai berasal dari API, tidak ada angka/status/deskripsi risiko yang ditanam. */}
          <div className="rounded-2xl border border-slate-800 bg-[#08172a] p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[.16em] text-cyan-300">
                  Risk intelligence
                </div>
                <div className="mt-1 text-sm font-semibold">Indeks Risiko Lokasi</div>
              </div>
              <span className="text-[10px] text-slate-500">
                {assessment?.risk?.scale || "Scale dari API"}
              </span>
            </div>

            <div className="flex items-center gap-5 rounded-xl border border-slate-800 bg-slate-950/20 p-4">
              <div
                className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: `conic-gradient(#22d3ee ${indexPercent * 3.6}deg, #14253a 0deg)`,
                }}
              >
                <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-[#08172a]">
                  <div className="text-2xl font-black">
                    {authoritativeIndex == null ? "—" : formatNumber(authoritativeIndex, 0)}
                  </div>
                  <div className="text-[9px] text-slate-500">
                    {assessment?.risk?.scale || "INDEX"}
                  </div>
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className={`text-lg font-bold ${meta.color}`}>
                  {overall || "Belum tersedia"}
                </div>
                <div className="mt-2">
                  <RiskBar value={authoritativeIndex == null ? null : indexPercent} />
                </div>

                {dynamicRiskDetails.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {dynamicRiskDetails.map((item) => (
                      <div key={item.key} className="rounded-lg bg-slate-950/30 px-2.5 py-2">
                        <div className="text-[9px] text-slate-500">{item.label}</div>
                        <div className="mt-0.5 truncate text-[10px] font-semibold text-slate-200">
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 text-[10px] text-slate-500">
                  Analysis type: {assessment?.analysisType || "—"} • Source: {assessment?.source || "—"}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-[#08172a] p-4 shadow-xl">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[.16em] text-cyan-300">
                Enterprise decision support
              </div>
              <div className="mt-1 text-sm font-semibold">Risk & Recommendation</div>
            </div>

            <div className="flex rounded-lg border border-slate-800 bg-slate-950/30 p-1">
              <button
                onClick={() => setActivePanel("risk")}
                className={`rounded-md px-3 py-1.5 text-[10px] font-semibold ${activePanel === "risk" ? "bg-cyan-400/10 text-cyan-200" : "text-slate-500"}`}
              >
                Risk
              </button>
              <button
                onClick={() => setActivePanel("recommendation")}
                className={`rounded-md px-3 py-1.5 text-[10px] font-semibold ${activePanel === "recommendation" ? "bg-cyan-400/10 text-cyan-200" : "text-slate-500"}`}
              >
                Recommendation
              </button>
            </div>
          </div>

          {activePanel === "risk" ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {factors.map((factor) => (
                <div key={factor.key} className="rounded-xl border border-slate-800 bg-slate-950/20 p-3">
                  <div className="text-[10px] text-slate-500">{factor.label || factor.key}</div>
                  <div className="mt-2 text-sm font-bold">{factor.class || factor.status || "—"}</div>
                  <div className="mt-2">
                    <RiskBar value={getNumericRiskPercent(factor.level)} />
                  </div>
                  {factor.source && (
                    <div className="mt-2 text-[9px] text-slate-600">{factor.source}</div>
                  )}
                </div>
              ))}

              {!factors.length && (
                <div className="md:col-span-2 xl:col-span-4 rounded-xl border border-dashed border-slate-700 p-6 text-center text-xs text-slate-500">
                  Tidak ada detail risiko dari API.
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {recommendations.map((item, idx) => (
                <div key={`${item.title}-${idx}`} className="rounded-xl border border-slate-800 bg-slate-950/20 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300">
                      ✓
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold">{item.title}</div>
                        <span className="rounded-md bg-amber-400/10 px-2 py-1 text-[9px] font-bold text-amber-300">
                          {item.priority || "—"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-400">{item.detail}</p>
                    </div>
                  </div>
                </div>
              ))}

              {!recommendations.length && (
                <div className="md:col-span-2 rounded-xl border border-dashed border-slate-700 p-6 text-center text-xs text-slate-500">
                  Tidak ada rekomendasi yang dikembalikan API untuk titik ini.
                </div>
              )}
            </div>
          )}
        </section>

        <footer className="flex flex-col gap-1 border-t border-slate-800/80 pt-3 text-[10px] text-slate-500 md:flex-row md:items-center md:justify-between">
          <span>
            {position ? `GPS ${position[0].toFixed(6)}, ${position[1].toFixed(6)}` : "GPS belum tersedia"}
            {" • "}
            {assessment?.source || "SIMITI API"}
          </span>
          <span>
            {assessment?.generatedAt
              ? `Risk diperbarui ${new Date(assessment.generatedAt).toLocaleString("id-ID")}`
              : "Menunggu data analisis"}
          </span>
        </footer>
      </main>
    </div>
  );
}
