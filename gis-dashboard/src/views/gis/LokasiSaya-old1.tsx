import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Circle, MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

type RiskFactor = {
  key: string;
  label: string;
  status: string;
  level: number | null;
  class?: string | null;
  source: string;
  available: boolean;
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
      das?: string | null;
    };
  };
  risk?: {
    status: string;
    index: number | null;
    scale: string;
    factors: RiskFactor[];
  };
  recommendations?: Array<{
    title: string;
    detail: string;
    priority: string;
  }>;
};

type Weather = {
  success: boolean;
  current?: {
    temperature_2m?: number;
    relative_humidity_2m?: number;
    apparent_temperature?: number;
    precipitation?: number;
    rain?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    cloud_cover?: number;
  } | null;
  current_units?: Record<string, string>;
};

const gpsIcon = L.divIcon({
  className: "smiti-gps-marker",
  html: `<div style="width:44px;height:44px;border-radius:999px;background:rgba(14,165,233,.16);border:1px solid rgba(56,189,248,.55);display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 10px rgba(14,165,233,.07),0 0 28px rgba(14,165,233,.35)"><div style="width:17px;height:17px;border-radius:999px;background:#22d3ee;border:3px solid #08233e;box-shadow:0 0 18px rgba(34,211,238,.9)"></div></div>`,
  iconSize: [44, 44],
  iconAnchor: [22, 22],
});

const statusMeta = (status: string) => {
  if (status === "Rawan") return { color: "text-red-300", bg: "bg-red-500/15", border: "border-red-500/30", icon: "!" };
  if (status === "Waspada") return { color: "text-amber-300", bg: "bg-amber-500/15", border: "border-amber-500/30", icon: "⚠" };
  if (status === "Aman") return { color: "text-emerald-300", bg: "bg-emerald-500/15", border: "border-emerald-500/30", icon: "✓" };
  return { color: "text-slate-300", bg: "bg-slate-500/15", border: "border-slate-500/30", icon: "•" };
};

const riskIcon = (key: string) => {
  if (key.includes("banjir")) return "≋";
  if (key === "longsor") return "△";
  if (key === "kekeringan") return "☀";
  if (key === "karhutla") return "♨";
  return "◈";
};

function RecenterMap({ position }: { position: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo(position, 15, { duration: 1.1 });
  }, [map, position]);
  return null;
}

function RiskBar({ value }: { value: number | null }) {
  const width = value == null ? 0 : Math.min(100, Math.max(0, value));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
      <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500" style={{ width: `${width}%` }} />
    </div>
  );
}

export default function LokasiSaya() {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [gpsState, setGpsState] = useState<"idle" | "requesting" | "ready" | "error">("idle");
  const [gpsMessage, setGpsMessage] = useState("Menunggu izin lokasi perangkat…");
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [loadingAssessment, setLoadingAssessment] = useState(false);
  const [activePanel, setActivePanel] = useState<"risk" | "recommendation">("risk");

  const requestGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsState("error");
      setGpsMessage("Browser tidak mendukung GPS/geolocation.");
      return;
    }

    setGpsState("requesting");
    setGpsMessage("Mengambil lokasi GPS perangkat…");

    navigator.geolocation.getCurrentPosition(
      (geo) => {
        const next: [number, number] = [geo.coords.latitude, geo.coords.longitude];
        setPosition(next);
        setAccuracy(geo.coords.accuracy);
        setGpsState("ready");
        setGpsMessage(`GPS aktif • akurasi ±${Math.round(geo.coords.accuracy)} m`);
      },
      (error) => {
        setGpsState("error");
        const message = error.code === 1
          ? "Izin lokasi ditolak. Aktifkan Location untuk situs ini."
          : error.code === 2
            ? "Lokasi perangkat tidak tersedia."
            : "GPS timeout. Coba ambil lokasi lagi.";
        setGpsMessage(message);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 },
    );
  }, []);

  const analyzeLocation = useCallback(async (lat: number, lng: number) => {
    setLoadingAssessment(true);
    try {
      const [assessmentResponse, weatherResponse] = await Promise.all([
        fetch(`${API_URL}/api/location-assessment?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}`),
        fetch(`${API_URL}/api/weather/current?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}`),
      ]);

      const assessmentJson = await assessmentResponse.json();
      if (!assessmentResponse.ok || !assessmentJson?.success) {
        throw new Error(assessmentJson?.message || "Analisis lokasi gagal.");
      }
      setAssessment(assessmentJson);

      if (weatherResponse.ok) {
        const weatherJson = await weatherResponse.json();
        if (weatherJson?.success) setWeather(weatherJson);
      }
    } catch (error) {
      setGpsState("error");
      setGpsMessage(error instanceof Error ? error.message : "Gagal menganalisis lokasi.");
    } finally {
      setLoadingAssessment(false);
    }
  }, []);

  useEffect(() => {
    requestGps();
  }, [requestGps]);

  useEffect(() => {
    if (position) analyzeLocation(position[0], position[1]);
  }, [position, analyzeLocation]);

  const overall = assessment?.risk?.status || "Belum dianalisis";
  const meta = statusMeta(overall);
  const factors = assessment?.risk?.factors || [];
  const recommendations = assessment?.recommendations || [];
  const index = assessment?.risk?.index ?? null;
  const admin = assessment?.location?.administrative || {};

  const address = useMemo(() => {
    return [admin.kelurahan, admin.kecamatan, admin.kabupaten, admin.provinsi]
      .filter(Boolean)
      .join(" • ") || "Administrasi belum terpetakan";
  }, [admin.kelurahan, admin.kecamatan, admin.kabupaten, admin.provinsi]);

  return (
    <div className="min-h-screen bg-[#06111f] text-slate-100">
      <div className="border-b border-slate-800/80 bg-[#071426]/95 px-6 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1700px] items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-xl">◎</div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">SIMITI Enterprise</div>
              <h1 className="text-lg font-semibold tracking-tight">Cek Lokasi Saya</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={requestGps} className="rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-400/15">⌖ Ambil GPS Lagi</button>
            <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">Analisis spasial real-time</div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1700px] space-y-4 p-4 md:p-5">
        <section className={`rounded-2xl border ${meta.border} ${meta.bg} px-4 py-3 shadow-2xl shadow-black/10`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl border ${meta.border} bg-slate-950/30 text-xl ${meta.color}`}>{meta.icon}</div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Status lokasi</div>
                <div className={`text-lg font-bold ${meta.color}`}>{loadingAssessment ? "Menganalisis lokasi…" : `Lokasi Anda ${overall.toUpperCase()}`}</div>
                <div className="text-xs text-slate-400">{gpsMessage}</div>
              </div>
            </div>
            <button onClick={() => setActivePanel("recommendation")} className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-400/15">Lihat Rincian Analisis →</button>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_370px]">
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#08172a] shadow-2xl shadow-black/20">
            <div className="relative h-[520px] w-full">
              <MapContainer center={position || [-2.5, 118]} zoom={position ? 15 : 5} scrollWheelZoom className="h-full w-full">
                <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {position && <RecenterMap position={position} />}
                {position && accuracy != null && <Circle center={position} radius={accuracy} pathOptions={{ color: "#22d3ee", fillColor: "#0ea5e9", fillOpacity: 0.08, weight: 1 }} />}
                {position && <Marker position={position} icon={gpsIcon} />}
              </MapContainer>
              <div className="pointer-events-none absolute left-4 top-4 z-[500] rounded-xl border border-slate-700 bg-[#071426]/90 px-3 py-2 text-xs shadow-xl backdrop-blur-md">
                <div className="font-semibold text-slate-100">Lokasi GPS Anda</div>
                <div className="mt-0.5 text-[10px] text-slate-400">Titik analisis • EPSG:4326</div>
              </div>
              <div className="pointer-events-none absolute bottom-4 left-4 z-[500] flex flex-wrap gap-2 rounded-xl border border-slate-700 bg-[#071426]/90 px-3 py-2 text-[10px] text-slate-300 backdrop-blur-md">
                <span>● Risiko tinggi</span><span>● Waspada</span><span>● Aman</span><span>○ Radius akurasi GPS</span>
              </div>
              {!position && (
                <div className="absolute inset-0 z-[600] flex items-center justify-center bg-[#06111f]/60 backdrop-blur-[2px]">
                  <div className="max-w-sm rounded-2xl border border-slate-700 bg-[#08172a]/95 p-6 text-center shadow-2xl">
                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400/10 text-2xl text-cyan-300">⌖</div>
                    <h2 className="font-semibold">Aktifkan lokasi perangkat</h2>
                    <p className="mt-2 text-xs leading-5 text-slate-400">SIMITI akan mengambil koordinat GPS dan menggunakannya sebagai titik analisis risiko.</p>
                    <button onClick={requestGps} className="mt-4 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400">Izinkan & Ambil Lokasi</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-[#08172a] p-4 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold">Status Risiko Bencana</div>
                <span className="rounded-full border border-slate-700 px-2 py-1 text-[10px] text-slate-400">Spatial</span>
              </div>
              <div className={`rounded-xl border ${meta.border} ${meta.bg} p-4`}>
                <div className="flex items-center gap-3">
                  <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${meta.border} text-2xl ${meta.color}`}>{meta.icon}</div>
                  <div>
                    <div className={`text-2xl font-black ${meta.color}`}>{overall.toUpperCase()}</div>
                    <div className="text-[11px] leading-4 text-slate-400">{overall === "Aman" ? "Tidak ditemukan kelas risiko menengah/tinggi pada layer yang tersedia." : "Terdapat faktor risiko yang perlu diperhatikan di titik GPS."}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-[#08172a] p-4 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold">Faktor Risiko di Lokasi</div>
                <span className="text-[10px] text-slate-500">{factors.length} layer</span>
              </div>
              <div className="space-y-3">
                {factors.map((factor) => {
                  const fmeta = statusMeta(factor.status);
                  return (
                    <div key={factor.key} className="rounded-xl border border-slate-800/80 bg-slate-950/20 p-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-sm text-cyan-300">{riskIcon(factor.key)}</div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium text-slate-200">{factor.label}</div>
                          <div className="mt-1"><RiskBar value={factor.level == null ? null : factor.level * 20} /></div>
                        </div>
                        <span className={`rounded-md px-2 py-1 text-[10px] font-bold ${fmeta.bg} ${fmeta.color}`}>{factor.status}</span>
                      </div>
                      {factor.class && <div className="mt-1.5 pl-9 text-[10px] text-slate-500">Kelas data: {factor.class}</div>}
                    </div>
                  );
                })}
                {!factors.length && <div className="rounded-xl border border-dashed border-slate-700 p-4 text-center text-xs text-slate-500">Belum ada hasil analisis.</div>}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-[#08172a] p-4 shadow-xl">
              <div className="mb-2 flex items-center justify-between"><div className="text-sm font-semibold">Cuaca Saat Ini</div><span className="text-[10px] text-slate-500">Open-Meteo</span></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-slate-950/30 p-3"><div className="text-[10px] text-slate-500">Suhu</div><div className="mt-1 text-lg font-bold">{weather?.current?.temperature_2m ?? "—"}°C</div></div>
                <div className="rounded-xl bg-slate-950/30 p-3"><div className="text-[10px] text-slate-500">Kelembapan</div><div className="mt-1 text-lg font-bold">{weather?.current?.relative_humidity_2m ?? "—"}%</div></div>
                <div className="rounded-xl bg-slate-950/30 p-3"><div className="text-[10px] text-slate-500">Hujan</div><div className="mt-1 text-lg font-bold">{weather?.current?.precipitation ?? "—"} mm</div></div>
                <div className="rounded-xl bg-slate-950/30 p-3"><div className="text-[10px] text-slate-500">Angin</div><div className="mt-1 text-lg font-bold">{weather?.current?.wind_speed_10m ?? "—"} km/j</div></div>
              </div>
            </div>
          </aside>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.05fr_.95fr]">
          <div className="rounded-2xl border border-slate-800 bg-[#08172a] p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between"><div><div className="text-[10px] font-bold uppercase tracking-[.16em] text-cyan-300">Informasi lokasi saat ini</div><div className="mt-1 text-sm font-semibold">Koordinat & wilayah administratif</div></div><span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-300">GPS Active</span></div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-3"><div className="text-[10px] text-slate-500">Koordinat</div><div className="mt-1 font-mono text-xs text-cyan-200">{position ? `${position[0].toFixed(6)}, ${position[1].toFixed(6)}` : "—"}</div></div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-3"><div className="text-[10px] text-slate-500">Akurasi GPS</div><div className="mt-1 text-xs font-semibold">{accuracy != null ? `±${Math.round(accuracy)} meter` : "—"}</div></div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-3 md:col-span-2"><div className="text-[10px] text-slate-500">Administrasi</div><div className="mt-1 text-xs leading-5 text-slate-200">{address}</div></div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-3"><div className="text-[10px] text-slate-500">DAS</div><div className="mt-1 text-xs">{admin.das || "Belum terpetakan"}</div></div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-3"><div className="text-[10px] text-slate-500">Sumber Analisis</div><div className="mt-1 text-xs">PostgreSQL / PostGIS</div></div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#08172a] p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between"><div><div className="text-[10px] font-bold uppercase tracking-[.16em] text-cyan-300">Analisis risiko</div><div className="mt-1 text-sm font-semibold">Indeks Risiko Lokasi</div></div><span className="text-[10px] text-slate-500">Indikatif 0–100</span></div>
            <div className="flex items-center gap-5 rounded-xl border border-slate-800 bg-slate-950/20 p-4">
              <div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(#22d3ee ${(index || 0) * 3.6}deg, #14253a 0deg)` }}>
                <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-[#08172a]"><div className="text-2xl font-black">{index ?? "—"}</div><div className="text-[9px] text-slate-500">/100</div></div>
              </div>
              <div className="min-w-0 flex-1"><div className={`text-lg font-bold ${meta.color}`}>{overall}</div><p className="mt-1 text-xs leading-5 text-slate-400">Indeks dihitung dari kelas risiko spasial yang berhasil dipetakan tepat di titik GPS. Gunakan sebagai ringkasan operasional, bukan pengganti indeks risiko resmi.</p><button onClick={() => setActivePanel("risk")} className="mt-3 rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-[10px] font-bold text-cyan-200">Lihat Detail Perhitungan →</button></div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-[#08172a] p-4 shadow-xl">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div><div className="text-[10px] font-bold uppercase tracking-[.16em] text-cyan-300">Enterprise decision support</div><div className="mt-1 text-sm font-semibold">Rekomendasi Tindakan Mitigasi & Adaptasi</div></div>
            <div className="flex rounded-lg border border-slate-800 bg-slate-950/30 p-1"><button onClick={() => setActivePanel("risk")} className={`rounded-md px-3 py-1.5 text-[10px] font-semibold ${activePanel === "risk" ? "bg-cyan-400/10 text-cyan-200" : "text-slate-500"}`}>Risk</button><button onClick={() => setActivePanel("recommendation")} className={`rounded-md px-3 py-1.5 text-[10px] font-semibold ${activePanel === "recommendation" ? "bg-cyan-400/10 text-cyan-200" : "text-slate-500"}`}>Recommendation</button></div>
          </div>
          {activePanel === "risk" ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
              {factors.map((factor) => <div key={factor.key} className="rounded-xl border border-slate-800 bg-slate-950/20 p-3"><div className="text-[10px] text-slate-500">{factor.label}</div><div className="mt-2 text-sm font-bold text-slate-100">{factor.class || factor.status}</div><div className="mt-2"><RiskBar value={factor.level == null ? null : factor.level * 20} /></div></div>)}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {recommendations.map((item, idx) => <div key={`${item.title}-${idx}`} className="rounded-xl border border-slate-800 bg-slate-950/20 p-4"><div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300">✓</div><div><div className="flex flex-wrap items-center gap-2"><div className="text-sm font-semibold">{item.title}</div><span className="rounded-md bg-amber-400/10 px-2 py-1 text-[9px] font-bold text-amber-300">Prioritas {item.priority}</span></div><p className="mt-1 text-xs leading-5 text-slate-400">{item.detail}</p></div></div></div>)}
            </div>
          )}
        </section>

        <div className="flex flex-col gap-1 border-t border-slate-800/80 pt-3 text-[10px] text-slate-500 md:flex-row md:items-center md:justify-between">
          <span>Analisis: GPS point-in-polygon • {assessment?.source || "SIMITI"}</span>
          <span>{assessment?.generatedAt ? `Diperbarui ${new Date(assessment.generatedAt).toLocaleString("id-ID")}` : "Menunggu analisis"}</span>
        </div>
      </main>
    </div>
  );
}
