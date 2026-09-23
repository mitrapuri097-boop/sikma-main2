import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Activity,
  BatteryCharging,
  CloudRain,
  Droplets,
  Gauge,
  Layers3,
  Map as MapIcon,
  Mountain,
  RefreshCw,
  ShieldCheck,
  Thermometer,
  Waves,
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
  const obj = payload as Record<string, unknown>;
  const data = obj.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];

  return Object.entries(data as Record<string, unknown>).map(([key, value]) => {
    if (!value || typeof value !== "object")
      return { id: key, value } as TmaRow;
    return { id: key, ...(value as Record<string, unknown>) } as TmaRow;
  });
}

function toNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function hasValidCoordinates(row: TmaRow): boolean {
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function normalizeStatus(status: unknown): string {
  const value = String(status || "")
    .trim()
    .toUpperCase();
  return ["AMAN", "WASPADA", "SIAGA", "AWAS", "BAHAYA"].includes(value)
    ? value
    : value || "UNKNOWN";
}

function getStatusColor(status: string): string {
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
  const bg = getStatusColor(status);
  return L.divIcon({
    className: "",
    html: `<div style="
      width:34px;height:34px;border-radius:50%;background:${bg};
      border:4px solid white;box-shadow:0 2px 10px rgba(0,0,0,.25);
      display:flex;align-items:center;justify-content:center;
      color:white;font-weight:800;font-size:16px;line-height:1;">≈</div>`,
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
  tone = "blue",
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tone?: "blue" | "green" | "orange" | "red";
}) {
  const tones = {
    blue: "border-blue-200 text-blue-600 bg-blue-50",
    green: "border-emerald-200 text-emerald-600 bg-emerald-50",
    orange: "border-orange-200 text-orange-600 bg-orange-50",
    red: "border-red-200 text-red-600 bg-red-50",
  };

  return (
    <div className="group rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-4">
      <div className="flex items-center justify-between">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl border ${tones[tone]}`}
        >
          {icon}
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          SiPEAT
        </span>
      </div>
      <div className="mt-3 text-xl font-extrabold tracking-tight text-slate-950 sm:mt-4 sm:text-2xl">
        {value}
      </div>
      <div className="mt-1 text-xs font-medium text-slate-500">{label}</div>
    </div>
  );
}

function InfoItem({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-0.5 text-xs font-semibold text-slate-800">{value}</div>
    </div>
  );
}

function StatusRow({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
        <span className="text-xs font-medium text-slate-600">{label}</span>
      </div>
      <span className="text-xs font-bold text-slate-800">{count}</span>
    </div>
  );
}

function LayerRow({
  name,
  count,
  active = true,
  note,
}: {
  name: string;
  count: number;
  active?: boolean;
  note?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${active ? "bg-emerald-500" : "bg-slate-300"}`}
        />
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-slate-700">
            {name}
          </div>
          {note && (
            <div className="mt-0.5 text-[10px] text-slate-400">{note}</div>
          )}
        </div>
      </div>
      <span className="ml-3 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
        {count}
      </span>
    </div>
  );
}

function SensorChart({ rows, metric }: { rows: TmaRow[]; metric: string }) {
  const values = useMemo(() => {
    const keyMap: Record<string, keyof TmaRow> = {
      tma: "kedalaman",
      suhu: "suhu",
      kelembaban: "kelembaban",
      ph: "ph",
      ec: "ec",
      battery: "persen",
      rain: "Rain",
    };
    const key = keyMap[metric] || "kedalaman";
    return rows.map((row) => toNumber(row[key])).slice(0, 24);
  }, [rows, metric]);

  const points = useMemo(() => {
    if (!values.length) return "";
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;
    return values
      .map((value, index) => {
        const x = 12 + (index / Math.max(values.length - 1, 1)) * 96;
        const y = 82 - ((value - min) / range) * 62;
        return `${x},${y}`;
      })
      .join(" ");
  }, [values]);

  const labels: Record<string, string> = {
    tma: "Tinggi Muka Air",
    suhu: "Suhu",
    kelembaban: "Kelembaban",
    ph: "pH",
    ec: "EC",
    battery: "Battery",
    rain: "Curah Hujan Online",
  };

  return (
    <div className="relative h-[250px] w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-bold text-slate-700">{labels[metric]}</div>
        <div className="text-[10px] text-slate-400">
          {values.length ? `${values.length} titik data` : "Belum ada data"}
        </div>
      </div>
      <svg
        viewBox="0 0 120 92"
        className="h-[190px] w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Grafik ${labels[metric]}`}
      >
        {[20, 40, 60, 80].map((y) => (
          <line
            key={y}
            x1="8"
            y1={y}
            x2="112"
            y2={y}
            stroke="#e2e8f0"
            strokeWidth="0.35"
          />
        ))}
        <line
          x1="8"
          y1="86"
          x2="112"
          y2="86"
          stroke="#cbd5e1"
          strokeWidth="0.5"
        />
        {points && (
          <polyline
            points={points}
            fill="none"
            stroke="#3478f6"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
      {!values.length && (
        <div className="absolute inset-0 flex items-center justify-center pt-8 text-xs text-slate-400">
          Data historis belum tersedia dari endpoint ini.
        </div>
      )}
    </div>
  );
}

export default function PetaTMA() {
  const [rows, setRows] = useState<TmaRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState("tma");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(TMA_API);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload: unknown = await response.json();
      console.log("[PetaTMA] API:", TMA_API);
      console.log("[PetaTMA] RAW API RESPONSE:", payload);
      const normalizedRows = normalizeRows(payload);
      console.log("[PetaTMA] Normalized rows:", normalizedRows);
      setRows(normalizedRows);
    } catch (err) {
      console.error("[PetaTMA] Load error:", err);
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

  const statusSummary = rows.reduce(
    (summary, row) => {
      const status = normalizeStatus(row.statusled);
      if (status === "AMAN") summary.aman += 1;
      else if (status === "WASPADA") summary.waspada += 1;
      else if (status === "SIAGA") summary.siaga += 1;
      else if (status === "BAHAYA" || status === "AWAS") summary.bahaya += 1;
      return summary;
    },
    { aman: 0, waspada: 0, siaga: 0, bahaya: 0 },
  );

  const latest = rows[0];
  const lastUpdate = latest
    ? `${String(latest.tanggal || "-")} ${String(latest.jam || "")}`
    : "-";

  const tabs = [
    {
      id: "tma",
      label: "Tinggi Muka Air",
      icon: <Waves className="h-4 w-4" />,
    },
    { id: "suhu", label: "Suhu", icon: <Thermometer className="h-4 w-4" /> },
    {
      id: "kelembaban",
      label: "Kelembaban",
      icon: <Droplets className="h-4 w-4" />,
    },
    { id: "ph", label: "pH" },
    { id: "ec", label: "EC" },
    {
      id: "battery",
      label: "Battery",
      icon: <BatteryCharging className="h-4 w-4" />,
    },
    {
      id: "rain",
      label: "Curah Hujan Online",
      icon: <CloudRain className="h-4 w-4" />,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-100 p-2 sm:p-3 md:p-5">
      <div className="mx-auto w-full max-w-[1800px] space-y-3 sm:space-y-4 lg:space-y-5">
        <header className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5 md:px-6 md:py-5">
          <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 sm:text-xs">
                <MapIcon className="h-4 w-4 text-blue-500" />
                SiPEAT Monitoring
              </div>
              <h1 className="mt-1 text-xl font-extrabold tracking-tight text-slate-950 sm:text-2xl md:text-[28px]">
                Monitoring Hidrologi
              </h1>
              <p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-500 sm:text-xs">
                Pemantauan tinggi muka air dan parameter sensor secara terpusat.
              </p>
            </div>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-950 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              {loading ? "Memuat..." : "Refresh Data"}
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 sm:gap-3 lg:grid-cols-4">
          <StatCard
            label="Total Sensor"
            value={rows.length}
            icon={<Waves className="h-5 w-5" />}
          />
          <StatCard
            label="Sensor Aman"
            value={statusSummary.aman}
            icon={<ShieldCheck className="h-5 w-5" />}
            tone="green"
          />
          <StatCard
            label="Waspada / Siaga"
            value={statusSummary.waspada + statusSummary.siaga}
            icon={<Gauge className="h-5 w-5" />}
            tone="orange"
          />
          <StatCard
            label="Bahaya / Awas"
            value={statusSummary.bahaya}
            icon={<Activity className="h-5 w-5" />}
            tone="red"
          />
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
            <div className="font-bold">Gagal memuat data TMA</div>
            <div className="mt-1">{error}</div>
          </div>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 pt-3">
            <div className="flex max-w-full gap-1 overflow-x-auto border-b-2 border-blue-500 pb-0 [scrollbar-width:thin]">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMetric(tab.id)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-t-lg px-3 py-3 text-xs font-semibold transition ${
                    metric === tab.id
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 p-3 sm:gap-4 sm:p-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Grafik Monitoring
                </div>
                <select
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 outline-none focus:border-blue-500"
                  defaultValue="7"
                  aria-label="Rentang waktu"
                >
                  <option value="7">7 Hari Terakhir</option>
                  <option value="30">30 Hari Terakhir</option>
                  <option value="90">90 Hari Terakhir</option>
                </select>
              </div>
              <SensorChart rows={rows} metric={metric} />
              <div className="mt-2 text-[10px] text-slate-400">
                Catatan: endpoint saat ini mengirim data sensor terkini. Grafik
                akan menampilkan titik data yang tersedia; histori waktu
                membutuhkan endpoint histori.
              </div>
            </div>

            <aside className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
                  <Layers3 className="h-4 w-4" />
                </div>

                <div>
                  <div className="text-xs font-bold text-slate-900">
                    Layer & Analisis
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Monitoring hidrologi
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {/* =========================
        LAYER & ANALISIS
    ========================== */}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Layer & Analisis
                  </div>

                  <div className="mt-2 space-y-2">
                    <LayerRow name="Stasiun TMA" count={validRows.length} />

                    <LayerRow name="Data Sensor" count={rows.length} />

                    <LayerRow
                      name="Sensor Tanpa Koordinat"
                      count={invalidCoordinateCount}
                      active={false}
                      note={
                        invalidCoordinateCount
                          ? "Belum tampil di peta"
                          : "Semua sensor memiliki koordinat"
                      }
                    />
                  </div>
                </div>

                {/* =========================
        STATUS SENSOR
    ========================== */}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Status Sensor
                  </div>

                  <div className="mt-2 space-y-2">
                    <StatusRow
                      label="Aman"
                      count={statusSummary.aman}
                      color="bg-emerald-500"
                    />

                    <StatusRow
                      label="Waspada"
                      count={statusSummary.waspada}
                      color="bg-amber-500"
                    />

                    <StatusRow
                      label="Siaga"
                      count={statusSummary.siaga}
                      color="bg-orange-500"
                    />

                    <StatusRow
                      label="Bahaya / Awas"
                      count={statusSummary.bahaya}
                      color="bg-red-500"
                    />
                  </div>
                </div>
              </div>

              {/* =========================
      API STATUS
  ========================== */}
              <div className="mt-5 rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Last Update
                </div>

                <div className="mt-1 text-xs font-semibold text-slate-800">
                  {lastUpdate}
                </div>

                <div className="mt-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Status API
                </div>

                <div
                  className={`mt-1 text-xs font-bold ${
                    error
                      ? "text-red-600"
                      : loading
                        ? "text-amber-600"
                        : "text-emerald-600"
                  }`}
                >
                  {error ? "Error" : loading ? "Loading" : "Connected"}
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <div className="text-sm font-bold text-slate-800">Maps</div>
              <div className="mt-0.5 text-[10px] text-slate-400">
                Lokasi stasiun sensor yang memiliki koordinat valid
              </div>
            </div>
            <div className="rounded-lg bg-blue-50 px-3 py-2 text-[10px] font-bold text-blue-700">
              {validRows.length} sensor terpetakan
            </div>
          </div>

          <div className="relative h-[360px] min-[480px]:h-[420px] sm:h-[500px] lg:h-[560px] xl:h-[620px]">
            <MapContainer
              center={INDONESIA_CENTER}
              zoom={5}
              minZoom={5}
              maxBounds={INDONESIA_BOUNDS}
              maxBoundsViscosity={1}
              scrollWheelZoom
              className="h-full w-full"
            >
              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {validRows.map((station, index) => {
                const status = normalizeStatus(station.statusled);
                const stationName =
                  String(station.idname || "").trim() || `Stasiun ${index + 1}`;
                const tma = toNumber(station.kedalaman);
                const suhu = toNumber(station.suhu);
                const kelembaban = toNumber(station.kelembaban);
                const ec = toNumber(station.ec);
                const ph = toNumber(station.ph);
                const rain = toNumber(station.Rain);
                const elevation = toNumber(station.Elevation);
                const tegangan = toNumber(station.tegangan);
                const arus = toNumber(station.arus);
                const power = toNumber(station.power);
                const persen = toNumber(station.persen);

                return (
                  <Marker
                    key={station.id ?? `${stationName}-${index}`}
                    position={[
                      Number(station.latitude),
                      Number(station.longitude),
                    ]}
                    icon={markerIcon(status)}
                  >
                    <Popup>
                      <div className="w-[280px] sm:w-[300px]">
                        <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                          <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
                            style={{ backgroundColor: getStatusColor(status) }}
                          >
                            <Waves className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-slate-900">
                              {stationName}
                            </div>
                            <div className="mt-0.5 text-[10px] text-slate-400">
                              ID Sensor: {String(station.id || "-")}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5">
                          <span className="text-xs font-medium text-slate-500">
                            Status TMA
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${statusBadge(status)}`}
                          >
                            {status}
                          </span>
                        </div>

                        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                          <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                            Tinggi / Kedalaman Muka Air
                          </div>
                          <div className="mt-1 flex items-end gap-1">
                            <span className="text-2xl font-bold tracking-tight text-slate-900">
                              {tma.toFixed(1)}
                            </span>
                            <span className="mb-1 text-xs font-medium text-slate-500">
                              m
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          Data Sensor
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <InfoItem
                            icon={<Thermometer className="h-3 w-3" />}
                            label="Suhu"
                            value={`${suhu.toFixed(1)} °C`}
                          />
                          <InfoItem
                            icon={<Droplets className="h-3 w-3" />}
                            label="Kelembaban"
                            value={`${kelembaban.toFixed(1)} %`}
                          />
                          <InfoItem label="EC" value={`${ec}`} />
                          <InfoItem label="pH" value={`${ph.toFixed(1)}`} />
                          <InfoItem
                            icon={<CloudRain className="h-3 w-3" />}
                            label="Curah Hujan"
                            value={`${rain}`}
                          />
                          <InfoItem
                            icon={<Mountain className="h-3 w-3" />}
                            label="Elevasi"
                            value={`${elevation}`}
                          />
                        </div>

                        <div className="mt-4 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          Power & Telemetri
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <InfoItem
                            label="Tegangan"
                            value={`${tegangan.toFixed(2)} V`}
                          />
                          <InfoItem label="Arus" value={`${arus.toFixed(1)}`} />
                          <InfoItem
                            label="Power"
                            value={`${power.toFixed(2)} W`}
                          />
                          <InfoItem
                            icon={<BatteryCharging className="h-3 w-3" />}
                            label="Baterai"
                            value={`${persen}%`}
                          />
                        </div>

                        {(station.RainDate || station.RainTime) && (
                          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
                            <div className="text-[10px] text-slate-400">
                              Update Curah Hujan
                            </div>
                            <div className="mt-0.5 text-xs font-semibold text-slate-700">
                              {String(station.RainDate || "-")}{" "}
                              {String(station.RainTime || "")}
                            </div>
                          </div>
                        )}

                        <div className="mt-3 border-t border-slate-200 pt-3 text-[10px] text-slate-400">
                          Update data:{" "}
                          <span className="font-medium text-slate-600">
                            {String(station.tanggal || "-")}
                          </span>{" "}
                          <span className="font-medium text-slate-600">
                            {String(station.jam || "-")}
                          </span>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>

            {loading && (
              <div className="pointer-events-none absolute inset-0 z-[1001] flex items-center justify-center bg-white/20">
                <div className="rounded-xl border border-white/80 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                    <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                    Memuat data sensor...
                  </div>
                </div>
              </div>
            )}

            <div className="pointer-events-none absolute left-3 top-3 z-[1000] sm:left-4 sm:top-4">
              <div className="rounded-xl border border-white/80 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Monitoring TMA
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-800">
                    {validRows.length}
                  </span>
                  <span className="text-xs text-slate-500">
                    sensor terpetakan
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {!loading && !error && rows.length === 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-700">
            API berhasil dipanggil, tetapi belum ada data sensor TMA.
          </div>
        )}
      </div>
    </div>
  );
}
