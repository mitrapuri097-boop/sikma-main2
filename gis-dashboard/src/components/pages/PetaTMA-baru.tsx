import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Activity,
  BatteryCharging,
  Bell,
  CheckCircle2,
  CloudRain,
  Droplets,
  Gauge,
  Layers3,
  Map as MapIcon,
  Menu,
  Mountain,
  RefreshCw,
  ShieldCheck,
  Thermometer,
  Waves,
  Wifi,
  X,
} from "lucide-react";

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const TMA_API = import.meta.env.VITE_TMA_API_URL || `${API_BASE}/api/tma`;

type TmaRow = {
  id?: string | number;
  idname?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  hari?: string;
  tanggal?: string;
  jam?: string;
  kedalaman?: number | string | null;
  statusled?: string;
  suhu?: number | string | null;
  kelembaban?: number | string | null;
  ec?: number | string | null;
  ph?: number | string | null;
  Rain?: number | string | null;
  RainDate?: string;
  RainTime?: string;
  Elevation?: number | string | null;
  tegangan?: number | string | null;
  arus?: number | string | null;
  power?: number | string | null;
  persen?: number | string | null;
  [key: string]: unknown;
};

const INDONESIA_CENTER: [number, number] = [-2.5, 118];
const INDONESIA_BOUNDS = L.latLngBounds([-11.5, 94.5], [6.5, 141.5]);

function normalizeRows(payload: unknown): TmaRow[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as Record<string, unknown>).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  return Object.entries(data as Record<string, unknown>).map(([key, value]) =>
    value && typeof value === "object"
      ? ({ id: key, ...(value as Record<string, unknown>) } as TmaRow)
      : ({ id: key, value } as TmaRow),
  );
}

function toNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeStatus(status: unknown): string {
  const value = String(status || "").trim().toUpperCase();
  return ["AMAN", "WASPADA", "SIAGA", "AWAS", "BAHAYA"].includes(value)
    ? value
    : value || "UNKNOWN";
}

function hasValidCoordinates(row: TmaRow): boolean {
  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function statusColor(status: string): string {
  switch (normalizeStatus(status)) {
    case "BAHAYA":
    case "AWAS":
      return "#dc2626";
    case "SIAGA":
      return "#ea580c";
    case "WASPADA":
      return "#d97706";
    case "AMAN":
      return "#059669";
    default:
      return "#64748b";
  }
}

function markerIcon(status: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:34px;height:34px;border-radius:50%;background:${statusColor(status)};border:4px solid #fff;box-shadow:0 3px 12px rgba(15,23,42,.28);display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;font-weight:800">≈</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17],
  });
}

function statusBadge(status: string) {
  switch (normalizeStatus(status)) {
    case "BAHAYA":
    case "AWAS":
      return "bg-red-50 text-red-700 ring-red-200";
    case "SIAGA":
      return "bg-orange-50 text-orange-700 ring-orange-200";
    case "WASPADA":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "AMAN":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    default:
      return "bg-slate-100 text-slate-600 ring-slate-200";
  }
}

function StatCard({
  label,
  value,
  icon,
  tone,
  detail,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tone: "blue" | "green" | "orange" | "red";
  detail: string;
}) {
  const toneClass = {
    blue: "border-blue-200 bg-blue-50 text-blue-600",
    green: "border-emerald-200 bg-emerald-50 text-emerald-600",
    orange: "border-orange-200 bg-orange-50 text-orange-600",
    red: "border-red-200 bg-red-50 text-red-600",
  }[tone];

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-[0_2px_10px_rgba(15,23,42,.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${toneClass}`}>{icon}</div>
        <span className="rounded-full bg-slate-50 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">Live</span>
      </div>
      <div className="mt-4 text-2xl font-extrabold tracking-tight text-slate-900">{value}</div>
      <div className="mt-1 text-xs font-semibold text-slate-600">{label}</div>
      <div className="mt-1 text-[10px] text-slate-400">{detail}</div>
    </div>
  );
}

function InfoItem({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] text-slate-400">{icon}{label}</div>
      <div className="mt-1 text-xs font-bold text-slate-800">{value}</div>
    </div>
  );
}

function SensorChart({ rows, metric }: { rows: TmaRow[]; metric: string }) {
  const config: Record<string, { label: string; key: keyof TmaRow; unit: string }> = {
    tma: { label: "Tinggi Muka Air", key: "kedalaman", unit: "m" },
    suhu: { label: "Suhu", key: "suhu", unit: "°C" },
    kelembaban: { label: "Kelembaban", key: "kelembaban", unit: "%" },
    ph: { label: "pH", key: "ph", unit: "" },
    ec: { label: "EC", key: "ec", unit: "" },
    battery: { label: "Battery", key: "persen", unit: "%" },
    rain: { label: "Curah Hujan Online", key: "Rain", unit: "" },
  };
  const selected = config[metric] || config.tma;
  const values = rows.map((row) => toNumber(row[selected.key])).slice(0, 32);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = 8 + (index / Math.max(values.length - 1, 1)) * 84;
      const y = 80 - ((value - min) / range) * 62;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-slate-800">{selected.label}</div>
          <div className="mt-0.5 text-[10px] text-slate-400">Trend data sensor • 7 hari terakhir</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-semibold text-slate-500">
          7 Hari ▾
        </div>
      </div>
      <svg viewBox="0 0 100 90" className="h-[235px] w-full" preserveAspectRatio="none" role="img" aria-label={`Grafik ${selected.label}`}>
        {[18, 34, 50, 66, 82].map((y) => (
          <line key={y} x1="7" y1={y} x2="93" y2={y} stroke="#e2e8f0" strokeWidth=".35" />
        ))}
        <line x1="7" y1="84" x2="93" y2="84" stroke="#cbd5e1" strokeWidth=".5" />
        {points && <polyline points={points} fill="none" stroke="#3478f6" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>Data awal</span>
        <span>{values.length ? `${values.length} titik data` : "Belum ada histori"}</span>
        <span>Terbaru</span>
      </div>
      {!values.length && <div className="mt-2 rounded-lg bg-amber-50 p-2 text-[10px] text-amber-700">Endpoint saat ini belum mengirim histori waktu.</div>}
    </div>
  );
}

function SideNav({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const items = [
    { label: "Dashboard Monitoring", icon: <Activity className="h-4 w-4" />, active: true },
    { label: "Peta Sensor", icon: <MapIcon className="h-4 w-4" /> },
    { label: "Data Historis", icon: <Waves className="h-4 w-4" /> },
    { label: "Notifikasi", icon: <Bell className="h-4 w-4" /> },
    { label: "Konfigurasi", icon: <Layers3 className="h-4 w-4" /> },
  ];

  return (
    <aside className={`shrink-0 border-r border-slate-200 bg-[#75b8c8] text-white transition-all duration-200 ${collapsed ? "w-[76px]" : "w-[236px]"}`}>
      <div className="flex h-20 items-center justify-between border-b border-white/20 px-4">
        {!collapsed && (
          <div>
            <div className="text-base font-extrabold tracking-tight">SiPEAT</div>
            <div className="text-[9px] font-semibold uppercase tracking-[.22em] text-white/75">Monitoring System</div>
          </div>
        )}
        <button type="button" onClick={onToggle} className="rounded-full bg-white p-2 text-slate-700 shadow-sm hover:bg-slate-100" aria-label="Toggle sidebar">
          {collapsed ? <Menu className="h-4 w-4" /> : <X className="h-4 w-4" />}
        </button>
      </div>
      <div className="px-3 py-5">
        {!collapsed && <div className="mb-3 px-2 text-[10px] font-bold uppercase tracking-widest text-white/65">Main Menu</div>}
        <div className="space-y-1.5">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-xs font-semibold transition ${item.active ? "bg-white text-[#23869d] shadow-sm" : "text-white/90 hover:bg-white/15"}`}
            >
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
            </button>
          ))}
        </div>
      </div>
      {!collapsed && (
        <div className="mt-auto px-4 pb-5">
          <div className="rounded-xl border border-white/20 bg-white/10 p-3">
            <div className="flex items-center gap-2 text-xs font-bold"><Wifi className="h-4 w-4" /> System Online</div>
            <div className="mt-1 text-[10px] text-white/70">Terhubung ke API TMA</div>
          </div>
        </div>
      )}
    </aside>
  );
}

export default function PetaTMA() {
  const [rows, setRows] = useState<TmaRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState("tma");
  const [collapsed, setCollapsed] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(TMA_API);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload: unknown = await response.json();
      const normalized = normalizeRows(payload);
      console.log("[PetaTMA] API:", TMA_API);
      console.log("[PetaTMA] Normalized rows:", normalized);
      setRows(normalized);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Gagal mengambil data TMA");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const validRows = rows.filter(hasValidCoordinates);
  const invalidCoordinateCount = rows.length - validRows.length;
  const summary = rows.reduce(
    (acc, row) => {
      const status = normalizeStatus(row.statusled);
      if (status === "AMAN") acc.aman++;
      else if (status === "WASPADA") acc.waspada++;
      else if (status === "SIAGA") acc.siaga++;
      else if (status === "BAHAYA" || status === "AWAS") acc.bahaya++;
      return acc;
    },
    { aman: 0, waspada: 0, siaga: 0, bahaya: 0 },
  );

  const latest = rows[0];
  const lastUpdate = latest ? `${String(latest.tanggal || "-")} ${String(latest.jam || "")}` : "-";
  const tabs = [
    { id: "tma", label: "Tinggi Muka Air", icon: <Waves className="h-4 w-4" /> },
    { id: "suhu", label: "Suhu", icon: <Thermometer className="h-4 w-4" /> },
    { id: "kelembaban", label: "Kelembaban", icon: <Droplets className="h-4 w-4" /> },
    { id: "ph", label: "pH" },
    { id: "ec", label: "EC" },
    { id: "battery", label: "Battery", icon: <BatteryCharging className="h-4 w-4" /> },
    { id: "rain", label: "Curah Hujan Online", icon: <CloudRain className="h-4 w-4" /> },
  ];

  return (
    <div className="flex min-h-screen bg-[#f3f6f8] text-slate-800">
      <SideNav collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />

      <main className="min-w-0 flex-1">
        <div className="border-b border-slate-200 bg-white px-4 py-3 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-50 p-2 text-blue-600"><MapIcon className="h-5 w-5" /></div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">SiPEAT Monitoring</div>
                <h1 className="text-lg font-extrabold tracking-tight text-slate-900">Dashboard Monitoring Hidrologi</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-700 sm:flex"><CheckCircle2 className="h-3.5 w-3.5" /> System Connected</span>
              <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-3 md:p-5">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard label="Total Sensor" value={rows.length} icon={<Waves className="h-5 w-5" />} tone="blue" detail="Seluruh sensor terdaftar" />
            <StatCard label="Aman" value={summary.aman} icon={<ShieldCheck className="h-5 w-5" />} tone="green" detail="Status normal" />
            <StatCard label="Waspada / Siaga" value={summary.waspada + summary.siaga} icon={<Gauge className="h-5 w-5" />} tone="orange" detail="Perlu pemantauan" />
            <StatCard label="Bahaya / Awas" value={summary.bahaya} icon={<Activity className="h-5 w-5" />} tone="red" detail="Perlu tindakan cepat" />
          </div>

          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700"><b>Gagal memuat data TMA:</b> {error}</div>}

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_2px_12px_rgba(15,23,42,.04)]">
            <div className="border-b border-slate-200 px-3 pt-2 md:px-4">
              <div className="flex flex-wrap items-end gap-1 border-b-2 border-blue-500">
                {tabs.map((tab) => (
                  <button key={tab.id} type="button" onClick={() => setMetric(tab.id)} className={`inline-flex items-center gap-1.5 rounded-t-lg px-3 py-3 text-xs font-semibold transition ${metric === tab.id ? "bg-emerald-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}>
                    {tab.icon}{tab.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-4 p-3 md:p-4 xl:grid-cols-[minmax(0,1fr)_315px]">
              <SensorChart rows={rows} metric={metric} />
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white"><Layers3 className="h-4 w-4" /></div>
                  <div><div className="text-xs font-bold text-slate-900">Layer & Analisis</div><div className="text-[10px] text-slate-400">Monitoring hidrologi</div></div>
                </div>
                <div className="mt-4 space-y-2">
                  <InfoItem label="Stasiun TMA terpetakan" value={`${validRows.length} sensor`} />
                  <InfoItem label="Data sensor diterima" value={`${rows.length} sensor`} />
                  <InfoItem label="Tanpa koordinat valid" value={`${invalidCoordinateCount} sensor`} />
                </div>
                <div className="mt-5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Status Sensor</div>
                <div className="mt-2 space-y-2">
                  {[
                    ["Aman", summary.aman, "bg-emerald-500"],
                    ["Waspada", summary.waspada, "bg-amber-500"],
                    ["Siaga", summary.siaga, "bg-orange-500"],
                    ["Bahaya / Awas", summary.bahaya, "bg-red-500"],
                  ].map(([label, count, color]) => (
                    <div key={label as string} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                      <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${color}`} /><span className="text-xs font-semibold text-slate-600">{label}</span></div>
                      <span className="text-xs font-extrabold text-slate-800">{count}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-5 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Last Update</div>
                  <div className="mt-1 text-xs font-bold text-slate-800">{lastUpdate}</div>
                  <div className="mt-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">API Status</div>
                  <div className={`mt-1 text-xs font-extrabold ${error ? "text-red-600" : loading ? "text-amber-600" : "text-emerald-600"}`}>{error ? "Error" : loading ? "Loading" : "Connected"}</div>
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_2px_12px_rgba(15,23,42,.04)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <div><div className="text-sm font-bold text-slate-800">Maps</div><div className="mt-0.5 text-[10px] text-slate-400">Sebaran lokasi sensor TMA</div></div>
              <div className="rounded-lg bg-blue-50 px-3 py-2 text-[10px] font-bold text-blue-700">{validRows.length} sensor terpetakan</div>
            </div>
            <div className="relative h-[560px]">
              <MapContainer center={INDONESIA_CENTER} zoom={5} minZoom={5} maxBounds={INDONESIA_BOUNDS} maxBoundsViscosity={1} scrollWheelZoom className="h-full w-full">
                <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {validRows.map((station, index) => {
                  const status = normalizeStatus(station.statusled);
                  const stationName = String(station.idname || "").trim() || `Stasiun ${index + 1}`;
                  return (
                    <Marker key={station.id ?? `${stationName}-${index}`} position={[Number(station.latitude), Number(station.longitude)]} icon={markerIcon(status)}>
                      <Popup>
                        <div className="w-[300px]">
                          <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg text-white" style={{ backgroundColor: statusColor(status) }}><Waves className="h-4 w-4" /></div>
                            <div className="min-w-0"><div className="truncate text-sm font-bold text-slate-900">{stationName}</div><div className="text-[10px] text-slate-400">ID Sensor: {String(station.id || "-")}</div></div>
                          </div>
                          <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5"><span className="text-xs text-slate-500">Status TMA</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${statusBadge(status)}`}>{status}</span></div>
                          <div className="mt-3 rounded-xl border border-slate-200 p-3"><div className="text-[10px] uppercase tracking-wide text-slate-400">Tinggi / Kedalaman Muka Air</div><div className="mt-1 text-2xl font-extrabold text-slate-900">{toNumber(station.kedalaman).toFixed(1)} <span className="text-xs font-semibold text-slate-500">m</span></div></div>
                          <div className="mt-4 text-[10px] font-bold uppercase tracking-wide text-slate-400">Data Sensor</div>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <InfoItem label="Suhu" value={`${toNumber(station.suhu).toFixed(1)} °C`} icon={<Thermometer className="h-3 w-3" />} />
                            <InfoItem label="Kelembaban" value={`${toNumber(station.kelembaban).toFixed(1)} %`} icon={<Droplets className="h-3 w-3" />} />
                            <InfoItem label="EC" value={`${toNumber(station.ec)}`} />
                            <InfoItem label="pH" value={`${toNumber(station.ph).toFixed(1)}`} />
                            <InfoItem label="Curah Hujan" value={`${toNumber(station.Rain)}`} icon={<CloudRain className="h-3 w-3" />} />
                            <InfoItem label="Elevasi" value={`${toNumber(station.Elevation)}`} icon={<Mountain className="h-3 w-3" />} />
                            <InfoItem label="Tegangan" value={`${toNumber(station.tegangan).toFixed(2)} V`} />
                            <InfoItem label="Baterai" value={`${toNumber(station.persen)} %`} icon={<BatteryCharging className="h-3 w-3" />} />
                          </div>
                          <div className="mt-3 border-t border-slate-200 pt-3 text-[10px] text-slate-400">Update data: <b className="text-slate-600">{String(station.tanggal || "-")} {String(station.jam || "-")}</b></div>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
              <div className="pointer-events-none absolute left-4 top-4 z-[1000] rounded-xl border border-white/80 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Monitoring TMA</div>
                <div className="mt-0.5 flex items-center gap-2"><span className="text-sm font-extrabold text-slate-800">{validRows.length}</span><span className="text-xs text-slate-500">sensor terpetakan</span></div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
