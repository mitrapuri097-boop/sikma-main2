import React, { useEffect, useMemo, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";

import {
  BarChart3,
  CalendarDays,
  CloudRain,
  Database,
  Filter,
  MapPin,
  RefreshCw,
  Search,
  MapPinned,
  Waves,
  ShieldAlert,
  Sprout,
  TrendingUp,
  X,
} from "lucide-react";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

const EVENTS_ENDPOINT = `${API_URL}/api/kejadian/list`;
const ANALYTICS_ENDPOINT = `${API_URL}/api/kejadian/analytics`;

type EventRow = {
  id: string;
  date: string;
  location: string;
  type: string;
  latitude: number | null;
  longitude: number | null;
  rainfall: number | null;
  landCover: string;
  adminNames: string[];
  das: string;
};

type AnalyticsPayload = {
  rainfall?: Array<{
    kejadian_id?: number | string;
    hari?: string;
    jam?: string;
    curah_hujan?: number | string;
  }>;

  landCover?: Array<{
    kejadian_id?: number | string;
    jenis_tutupan?: string;
    persentase?: number | string;
  }>;
};

const COLORS = [
  "#10b981",
  "#0ea5e9",
  "#8b5cf6",
  "#f59e0b",
  "#ef4444",
  "#14b8a6",
  "#6366f1",
  "#f97316",
];

const first = (...values: any[]) =>
  values.find((v) => v !== undefined && v !== null && v !== "");

const num = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;

  const n = Number(String(v).replace(",", "."));

  return Number.isFinite(n) ? n : null;
};

const dateOnly = (v: any) => {
  if (!v) return "";

  const d = new Date(v);

  if (Number.isNaN(d.getTime())) {
    return String(v).slice(0, 10);
  }

  return d.toISOString().slice(0, 10);
};

const formatDate = (v: string) => {
  if (!v) return "—";

  const d = new Date(`${v}T00:00:00`);

  if (Number.isNaN(d.getTime())) {
    return v;
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
};

const formatShortDate = (v: string) => {
  if (!v) return "";

  const d = new Date(`${v}T00:00:00`);

  if (Number.isNaN(d.getTime())) {
    return v;
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
  }).format(d);
};

const fmt = (v: number, digits = 1) =>
  new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: digits,
  }).format(v);

const pct = (value: number, total: number) => {
  if (!total) return 0;
  return (value / total) * 100;
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const INDONESIA_BOUNDS: L.LatLngBoundsExpression = [
  [-11.5, 94],
  [6.5, 142],
];

const getEventColor = (type: string) => {
  const value = String(type || "Tidak diketahui");
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return COLORS[Math.abs(hash) % COLORS.length];
};

const extractArray = (payload: any, keys: string[]) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  for (const k of keys) {
    if (Array.isArray(payload?.[k])) {
      return payload[k];
    }

    if (Array.isArray(payload?.data?.[k])) {
      return payload.data[k];
    }

    if (Array.isArray(payload?.result?.[k])) {
      return payload.result[k];
    }
  }

  return [];
};

function normalizeEvent(row: any, index: number): EventRow {
  return {
    id: String(first(row.id, row.event_id, row.id_kejadian, `event-${index}`)),

    date: dateOnly(
      first(row.date, row.tanggal, row.incident_date, row.event_date),
    ),

    location: String(
      first(
        row.location,
        row.lokasi,
        row.nama_lokasi,
        row.kecamatan,
        row.kabupaten,
        "Lokasi tidak tersedia",
      ),
    ),

    type: String(
      first(
        row.category,
        row.jenis_bencana,
        row.jenis,
        row.type,
        row.disaster_type,
        row.kategori,
        "Tidak diketahui",
      ),
    ),

    latitude: num(first(row.latitude, row.lat, row.y)),

    longitude: num(first(row.longitude, row.lon, row.lng, row.x)),

    rainfall: num(
      first(row.curah_hujan, row.curahHujan, row.rainfall, row.rainfall_mm),
    ),

    landCover: String(
      first(
        row.land_cover,
        row.tutupan_lahan,
        row.jenis_tutupan,
        "Belum tersedia",
      ),
    ),
    adminNames: [
      row.provinsi, row.province, row.kabupaten, row.kab_kota, row.kota,
      row.district, row.kecamatan, row.subdistrict, row.kelurahan,
      row.kel_desa, row.desa,
    ].filter((value) => value != null && String(value).trim() !== "").map(String),
    das: String(first(row.nama_das, row.das, row.das_name, row.namaDAS, "")),
  };
}

function Card({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_5px_18px_rgba(15,23,42,0.06)] transition-shadow duration-200 hover:shadow-[0_10px_28px_rgba(15,23,42,0.08)] sm:p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {title}
          </p>

          <p className="mt-3 text-3xl font-bold text-slate-800">{value}</p>

          <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-emerald-700">
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

function Section({
  eyebrow,
  title,
  description,
  icon: Icon,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.07)]">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-emerald-700">
            <Icon size={18} />
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700">
              {eyebrow}
            </p>

            <h2 className="mt-1 text-lg font-bold text-slate-800">{title}</h2>

            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
              {description}
            </p>
          </div>
        </div>
      </div>

      <div className="p-5">{children}</div>
    </section>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm">
          <ShieldAlert size={22} />
        </div>

        <p className="text-sm font-semibold text-slate-600">{message}</p>

        <p className="mt-1 text-xs text-slate-400">
          Data akan muncul otomatis ketika tersedia dari API.
        </p>
      </div>
    </div>
  );
}

export default function DataKejadianEnterprise() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsPayload>({});

  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const [error, setError] = useState("");

  const [analysisMode, setAnalysisMode] = useState<"administrasi" | "das">("administrasi");
  const [adminLevel, setAdminLevel] = useState<"provinsi" | "kabupaten" | "kecamatan" | "kelurahan">("provinsi");
  const [areaQuery, setAreaQuery] = useState("");
  const [areaResults, setAreaResults] = useState<any[]>([]);
  const [selectedArea, setSelectedArea] = useState<any | null>(null);
  const [showAreaResults, setShowAreaResults] = useState(false);
  const [areaSearching, setAreaSearching] = useState(false);
  const [dasQuery, setDasQuery] = useState("");
  const [dasResults, setDasResults] = useState<any[]>([]);
  const [selectedDas, setSelectedDas] = useState<any | null>(null);
  const [showDasResults, setShowDasResults] = useState(false);
  const [dasSearching, setDasSearching] = useState(false);
  const areaRequestRef = useRef(0);
  const dasRequestRef = useRef(0);
  const areaDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dasDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [type, setType] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(EVENTS_ENDPOINT);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();

      const rows = extractArray(payload, [
        "events",
        "kejadian",
        "incidents",
        "records",
        "rows",
        "data",
      ]);

      setEvents(rows.map(normalizeEvent));
    } catch (e: any) {
      setError(
        `Gagal mengambil data kejadian: ${e?.message || "unknown error"}`,
      );

      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async () => {
    setAnalyticsLoading(true);

    try {
      const response = await fetch(ANALYTICS_ENDPOINT);

      if (!response.ok) {
        return;
      }

      const payload = await response.json();

      setAnalytics({
        rainfall: extractArray(payload, ["rainfall", "curah_hujan"]),

        landCover: extractArray(payload, [
          "landCover",
          "land_cover",
          "tutupan_lahan",
        ]),
      });
    } catch {
      // Endpoint analytics bersifat optional.
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadAnalytics();
  }, []);

  const types = useMemo(
    () => [
      "ALL",
      ...Array.from(new Set(events.map((e) => e.type).filter(Boolean))).sort(),
    ],
    [events],
  );


  // Pencarian administrasi berdasarkan level yang dipilih pengguna.
  // Setiap level dicari langsung; tidak memaksa pengguna memilih wilayah induk.
  const searchAdministrativeAreas = async (query: string, levelOverride?: typeof adminLevel) => {
    const q = query.trim();
    const requestId = ++areaRequestRef.current;
    if (q.length < 2) {
      setAreaResults([]);
      setShowAreaResults(false);
      setAreaSearching(false);
      return;
    }
    const level = levelOverride || adminLevel;
    setAreaSearching(true);
    try {
      const params = new URLSearchParams({ query: q, level });
      const response = await fetch(
        `${API_URL}/api/areas/search?${params.toString()}`,
        { headers: { Accept: "application/json" } },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (requestId !== areaRequestRef.current) return;
      setAreaResults(Array.isArray(data) ? data.slice(0, 18) : []);
      setShowAreaResults(true);
    } catch (error) {
      if (requestId === areaRequestRef.current) {
        console.error("Pencarian wilayah analitik gagal:", error);
        setAreaResults([]);
        setShowAreaResults(true);
      }
    } finally {
      if (requestId === areaRequestRef.current) setAreaSearching(false);
    }
  };

  const searchDasAreas = async (query: string) => {
    const q = query.trim();
    const requestId = ++dasRequestRef.current;
    if (q.length < 2) {
      setDasResults([]);
      setShowDasResults(false);
      setDasSearching(false);
      return;
    }
    setDasSearching(true);
    try {
      const response = await fetch(
        `${API_URL}/api/das/search?query=${encodeURIComponent(q)}`,
        { headers: { Accept: "application/json" } },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (requestId !== dasRequestRef.current) return;
      setDasResults(Array.isArray(data) ? data.slice(0, 18) : []);
      setShowDasResults(true);
    } catch (error) {
      if (requestId === dasRequestRef.current) {
        console.error("Pencarian DAS analitik gagal:", error);
        setDasResults([]);
        setShowDasResults(false);
      }
    } finally {
      if (requestId === dasRequestRef.current) setDasSearching(false);
    }
  };

  const handleAdminLevelChange = (value: typeof adminLevel) => {
    setAdminLevel(value);
    setSelectedArea(null);
    setAreaResults([]);
    setShowAreaResults(false);
    areaRequestRef.current += 1;
    if (areaDebounceRef.current) clearTimeout(areaDebounceRef.current);
    if (areaQuery.trim().length >= 2) {
      areaDebounceRef.current = setTimeout(() => void searchAdministrativeAreas(areaQuery, value), 180);
    }
  };

  const handleAreaQueryChange = (value: string) => {
    setAreaQuery(value);
    if (areaDebounceRef.current) clearTimeout(areaDebounceRef.current);
    setSelectedArea(null);
    areaDebounceRef.current = setTimeout(() => void searchAdministrativeAreas(value, adminLevel), 280);
  };

  const handleDasQueryChange = (value: string) => {
    setDasQuery(value);
    if (dasDebounceRef.current) clearTimeout(dasDebounceRef.current);
    dasDebounceRef.current = setTimeout(() => void searchDasAreas(value), 280);
  };

  useEffect(() => () => {
    if (areaDebounceRef.current) clearTimeout(areaDebounceRef.current);
    if (dasDebounceRef.current) clearTimeout(dasDebounceRef.current);
    areaRequestRef.current += 1;
    dasRequestRef.current += 1;
  }, []);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      const selectedAreaName = selectedArea
        ? String(selectedArea.label || selectedArea.nama || selectedArea.name || selectedArea.kel_desa || selectedArea.kecamatan || selectedArea.kab_kota || selectedArea.provinsi || "").toLowerCase()
        : "";
      const matchArea = !selectedAreaName ||
        e.location.toLowerCase().includes(selectedAreaName) ||
        e.adminNames.some((name) => name.toLowerCase() === selectedAreaName);
      const selectedDasName = selectedDas
        ? String(selectedDas.nama_das || selectedDas.label || selectedDas.nama || selectedDas.name || "").toLowerCase()
        : "";
      const matchDas = !selectedDasName || e.das.toLowerCase() === selectedDasName ||
        e.location.toLowerCase().includes(selectedDasName);

      const matchType = type === "ALL" || e.type === type;

      const matchStart = !startDate || e.date >= startDate;

      const matchEnd = !endDate || e.date <= endDate;

      return (
        matchArea && matchDas && matchType && matchStart && matchEnd
      );
    });
  }, [events, selectedArea, selectedDas, type, startDate, endDate]);

  /*
   * TEMPORAL / DATE DISTRIBUTION
   *
   * X = tanggal kejadian
   * Y = jumlah kejadian
   * 1 line = total kejadian pada tanggal tersebut
   *
   * Dibuat seperti grafik referensi: sederhana, kronologis,
   * titik kejadian terlihat jelas, dan tetap mengikuti filter aktif.
   */
  const eventTrendData = useMemo(() => {
    const byDate = new Map<string, number>();

    filtered.forEach((event) => {
      if (!event.date) return;
      byDate.set(event.date, (byDate.get(event.date) || 0) + 1);
    });

    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({
        date,
        dateLabel: formatShortDate(date),
        value,
      }));
  }, [filtered]);

  const eventTrendStats = useMemo(() => {
    if (!eventTrendData.length) {
      return {
        peak: null,
        peakDate: null,
        activeDays: 0,
        average: 0,
      };
    }

    const peak = eventTrendData.reduce(
      (max, item) => (item.value > max.value ? item : max),
      eventTrendData[0],
    );

    const total = eventTrendData.reduce((sum, item) => sum + item.value, 0);

    return {
      peak: peak.value,
      peakDate: peak.date,
      activeDays: eventTrendData.length,
      average: total / eventTrendData.length,
    };
  }, [eventTrendData]);

  /*
   * DISASTER TYPE
   */
  const typeChart = useMemo(() => {
    const grouped = new Map<string, number>();

    filtered.forEach((e) => {
      grouped.set(e.type, (grouped.get(e.type) || 0) + 1);
    });

    const total = filtered.length;

    return Array.from(grouped.entries())
      .map(([name, value]) => ({
        name,
        value,
        percentage: pct(value, total),
      }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  /*
   * RAINFALL
   */
  const rainfallRows = useMemo(() => {
    if (analytics.rainfall?.length) {
      return analytics.rainfall
        .map((r) => ({
          label: r.hari || r.jam || "Periode",

          value: num(r.curah_hujan),
        }))
        .filter((r) => r.value !== null) as {
        label: string;
        value: number;
      }[];
    }

    return filtered
      .filter((e) => e.rainfall !== null)
      .map((e) => ({
        label: formatDate(e.date),
        value: e.rainfall as number,
      }));
  }, [analytics.rainfall, filtered]);

  const rainfallStats = useMemo(() => {
    const values = rainfallRows.map((r) => r.value).filter(Number.isFinite);

    if (!values.length) {
      return {
        avg: null,
        high: null,
        low: null,
      };
    }

    return {
      avg: values.reduce((a, b) => a + b, 0) / values.length,

      high: Math.max(...values),

      low: Math.min(...values),
    };
  }, [rainfallRows]);

  /*
   * LAND COVER
   */
  const landCoverChart = useMemo(() => {
    if (analytics.landCover?.length) {
      const grouped = new Map<string, number>();

      analytics.landCover.forEach((r) => {
        const name = String(r.jenis_tutupan || "Tidak diketahui");

        const value = num(r.persentase) ?? 0;

        grouped.set(name, (grouped.get(name) || 0) + value);
      });

      const total = Array.from(grouped.values()).reduce((a, b) => a + b, 0);

      return Array.from(grouped.entries())
        .map(([name, value]) => ({
          name,
          value,
          percentage: pct(value, total),
        }))
        .sort((a, b) => b.value - a.value);
    }

    const grouped = new Map<string, number>();

    filtered.forEach((e) => {
      if (e.landCover && e.landCover !== "Belum tersedia") {
        grouped.set(e.landCover, (grouped.get(e.landCover) || 0) + 1);
      }
    });

    const total = Array.from(grouped.values()).reduce((a, b) => a + b, 0);

    return Array.from(grouped.entries())
      .map(([name, value]) => ({
        name,
        value,
        percentage: pct(value, total),
      }))
      .sort((a, b) => b.value - a.value);
  }, [analytics.landCover, filtered]);

  const mappedLocations = useMemo(() => {
    return new Set(
      filtered
        .filter((e) => e.latitude !== null && e.longitude !== null)
        .map((e) => `${e.latitude},${e.longitude}`),
    ).size;
  }, [filtered]);

  const mappedEvents = useMemo(
    () =>
      filtered.filter(
        (event) =>
          event.latitude !== null &&
          event.longitude !== null &&
          event.latitude >= -11.5 &&
          event.latitude <= 6.5 &&
          event.longitude >= 94 &&
          event.longitude <= 142,
      ),
    [filtered],
  );

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapRef.current) return;

    const map = L.map(container, {
      zoomControl: true,
      scrollWheelZoom: true,
      minZoom: 3,
      maxZoom: 13,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    map.fitBounds(INDONESIA_BOUNDS, { padding: [18, 18] });

    const markerLayer = L.layerGroup().addTo(map);
    mapRef.current = map;
    markerLayerRef.current = markerLayer;

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const markerLayer = markerLayerRef.current;
    if (!markerLayer) return;

    markerLayer.clearLayers();

    mappedEvents.forEach((event) => {
      const latitude = Number(event.latitude);
      const longitude = Number(event.longitude);
      const color = getEventColor(event.type);

      const popup = `
        <div style="min-width:190px;font-family:Arial,sans-serif">
          <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#059669;margin-bottom:6px">
            ${escapeHtml(event.type)}
          </div>
          <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:5px">
            ${escapeHtml(event.location)}
          </div>
          <div style="font-size:11px;color:#64748b">
            ${escapeHtml(event.date ? formatDate(event.date) : "Tanggal tidak tersedia")}
          </div>
          <div style="font-size:10px;color:#94a3b8;margin-top:6px">
            ${latitude.toFixed(5)}, ${longitude.toFixed(5)}
          </div>
        </div>
      `;

      L.circleMarker([latitude, longitude], {
        radius: 7,
        color: "#ffffff",
        weight: 2,
        fillColor: color,
        fillOpacity: 0.9,
      })
        .bindPopup(popup)
        .bindTooltip(escapeHtml(event.location), {
          direction: "top",
          offset: [0, -7],
        })
        .addTo(markerLayer);
    });
  }, [mappedEvents]);

  const reset = () => {
    setAdminLevel("provinsi");
    setAreaQuery("");
    setAreaResults([]);
    setSelectedArea(null);
    setShowAreaResults(false);
    setDasQuery("");
    setDasResults([]);
    setSelectedDas(null);
    setShowDasResults(false);
    setType("ALL");
    setStartDate("");
    setEndDate("");
  };

  return (
    <div className="min-h-screen bg-[#f3f6f9] px-3 py-4 text-slate-800 sm:px-5 sm:py-5 lg:px-7 lg:py-6">
      <div className="mx-auto max-w-[1680px] space-y-5 lg:space-y-6">
        {/* HEADER */}
        <header className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white via-white to-[#edf7f2] p-5 shadow-[0_8px_28px_rgba(15,23,42,0.055)] sm:p-6 lg:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-emerald-700">
                <ShieldAlert size={18} />

                <span className="text-[10px] font-extrabold uppercase tracking-[0.22em]">
                  SIMITI • Enterprise Analytics
                </span>
              </div>

              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-800 sm:text-3xl md:text-4xl">
                Data Kejadian
              </h1>

              <p className="mt-2 max-w-3xl text-sm text-slate-500">
                Pusat analitik spasial untuk memantau sebaran kejadian, tren waktu, jenis bencana, curah hujan, dan tutupan lahan.
              </p>
            </div>

            <button
              onClick={() => {
                load();
                loadAnalytics();
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-bold text-emerald-800 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50"
            >
              <RefreshCw
                size={16}
                className={loading || analyticsLoading ? "animate-spin" : ""}
              />
              Refresh Data
            </button>
          </div>
        </header>

        {/* FILTER ANALITIK — pencarian bebas Administrasi / DAS */}
        <div className="relative z-20 overflow-visible rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_8px_26px_rgba(15,23,42,0.05)] sm:p-5 lg:p-6">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
                <Filter size={17} />
              </div>
              <div>
                <h2 className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-500">Filter Analitik</h2>
                <p className="mt-0.5 text-base font-bold text-slate-800">{analysisMode === "administrasi" ? "Wilayah Administrasi" : "Daerah Aliran Sungai (DAS)"}</p>
              </div>
            </div>
            <div className={`rounded-full px-3 py-1.5 text-[11px] font-extrabold ${analysisMode === "administrasi" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>
              {analysisMode === "administrasi" ? "ADMIN" : "DAS"}
            </div>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2">
            <button
              type="button"
              onClick={() => { setAnalysisMode("administrasi"); setDasQuery(""); setDasResults([]); setSelectedDas(null); setShowDasResults(false); }}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition-all ${analysisMode === "administrasi" ? "border border-slate-200 bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:bg-white/70"}`}
            >
              <MapPinned size={16} /> Administrasi
            </button>
            <button
              type="button"
              onClick={() => { setAnalysisMode("das"); setAreaQuery(""); setAreaResults([]); setSelectedArea(null); setShowAreaResults(false); }}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition-all ${analysisMode === "das" ? "border border-slate-200 bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:bg-white/70"}`}
            >
              <Waves size={16} /> DAS
            </button>
          </div>

          {analysisMode === "administrasi" ? (
            <div className="relative">
              <div className="grid gap-2 sm:grid-cols-[minmax(150px,0.38fr)_minmax(0,1fr)]">
              <select
                aria-label="Tingkat administrasi"
                value={adminLevel}
                onChange={(e) => handleAdminLevelChange(e.target.value as typeof adminLevel)}
                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
              >
                <option value="provinsi">Provinsi</option>
                <option value="kabupaten">Kabupaten/Kota</option>
                <option value="kecamatan">Kecamatan</option>
                <option value="kelurahan">Kelurahan/Desa</option>
              </select>
              <div className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 transition focus-within:border-emerald-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-emerald-500/10">
                <Search size={17} className="shrink-0 text-slate-400" />
                <input
                  value={areaQuery}
                  onChange={(e) => handleAreaQueryChange(e.target.value)}
                  onFocus={() => { if (areaResults.length) setShowAreaResults(true); }}
                  onKeyDown={(e) => { if (e.key === "Escape") setShowAreaResults(false); if (e.key === "Enter" && areaQuery.trim().length >= 2) { e.preventDefault(); if (areaDebounceRef.current) clearTimeout(areaDebounceRef.current); void searchAdministrativeAreas(areaQuery, adminLevel); } }}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={`Cari ${adminLevel === "kelurahan" ? "kelurahan/desa" : adminLevel === "kabupaten" ? "kabupaten/kota" : adminLevel}...`}
                  className="h-12 min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                />
                {areaSearching && <RefreshCw size={15} className="animate-spin text-emerald-600" />}
                {areaQuery && <button type="button" onClick={() => { setAreaQuery(""); setAreaResults([]); setShowAreaResults(false); setSelectedArea(null); areaRequestRef.current += 1; }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700" aria-label="Hapus pencarian"><X size={15} /></button>}
              </div>
              </div>
              {showAreaResults && (
                <div className="absolute left-0 right-0 top-full z-[100] mt-2 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl">
                  {areaResults.length ? areaResults.map((area: any, index: number) => {
                    const label = area.label || area.nama || area.name || area.kel_desa || area.kecamatan || area.kab_kota || area.provinsi || "Wilayah";
                    const detail = [area.level, area.kecamatan, area.kab_kota, area.provinsi].filter(Boolean).join(" • ");
                    return <button key={`${area.level || "wilayah"}-${label}-${index}`} type="button" onClick={() => { setSelectedArea(area); setAreaQuery(label); setShowAreaResults(false); setAreaResults([]); }} className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-emerald-50">
                      <span className="mt-0.5 rounded-lg bg-emerald-50 p-2 text-emerald-700"><MapPinned size={15} /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-800">{label}</span><span className="mt-0.5 block truncate text-[11px] capitalize text-slate-500">{detail || (adminLevel === "kelurahan" ? "Kelurahan/Desa" : adminLevel === "kabupaten" ? "Kabupaten/Kota" : adminLevel)}</span></span>
                      <span className="text-[10px] font-bold text-emerald-700">Pilih</span>
                    </button>;
                  }) : <div className="px-4 py-5 text-center text-xs text-slate-500">Tidak ditemukan. Coba kata kunci lain.</div>}
                </div>
              )}
              {selectedArea && <div className="mt-2 flex flex-wrap items-center gap-2"><span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">{selectedArea.label || selectedArea.nama || selectedArea.name || areaQuery}</span><button type="button" onClick={() => { setSelectedArea(null); setAreaQuery(""); }} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"><X size={13} /> Hapus wilayah</button></div>}
            </div>
          ) : (
            <div className="relative">
              <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-500">Wilayah analisis DAS</label>
              <div className="grid gap-2 sm:grid-cols-[minmax(150px,0.38fr)_minmax(0,1fr)]">
              <select
                aria-label="Jenis pencarian DAS"
                value="das"
                disabled
                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 outline-none"
              >
                <option value="das">DAS</option>
              </select>
              <div className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 transition focus-within:border-blue-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-500/10">
                <Waves size={17} className="shrink-0 text-blue-500" />
                <input
                  value={dasQuery}
                  onChange={(e) => handleDasQueryChange(e.target.value)}
                  onFocus={() => { if (dasResults.length) setShowDasResults(true); }}
                  onKeyDown={(e) => { if (e.key === "Escape") setShowDasResults(false); if (e.key === "Enter" && dasQuery.trim().length >= 2) { e.preventDefault(); if (dasDebounceRef.current) clearTimeout(dasDebounceRef.current); void searchDasAreas(dasQuery); } }}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Cari nama DAS..."
                  className="h-12 min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                />
                {dasSearching && <RefreshCw size={15} className="animate-spin text-blue-600" />}
                {dasQuery && <button type="button" onClick={() => { setDasQuery(""); setDasResults([]); setShowDasResults(false); setSelectedDas(null); dasRequestRef.current += 1; }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700" aria-label="Hapus pencarian"><X size={15} /></button>}
              </div>
              </div>
              {showDasResults && (
                <div className="absolute left-0 right-0 top-full z-[100] mt-2 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl">
                  {dasResults.length ? dasResults.map((das: any, index: number) => {
                    const label = das.nama_das || das.label || das.nama || das.name || "DAS";
                    return <button key={`${das.id || label}-${index}`} type="button" onClick={() => { setSelectedDas(das); setDasQuery(label); setShowDasResults(false); setDasResults([]); }} className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-blue-50">
                      <span className="mt-0.5 rounded-lg bg-blue-50 p-2 text-blue-700"><Waves size={15} /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-800">{label}</span><span className="mt-0.5 block text-[11px] text-slate-500">Daerah Aliran Sungai</span></span>
                      <span className="text-[10px] font-bold text-blue-700">Pilih</span>
                    </button>;
                  }) : <div className="px-4 py-5 text-center text-xs text-slate-500">Tidak ditemukan. Coba kata kunci lain.</div>}
                </div>
              )}
              {selectedDas && <div className="mt-2 flex flex-wrap items-center gap-2"><span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800">{selectedDas.nama_das || selectedDas.label || selectedDas.nama || selectedDas.name || dasQuery}</span><button type="button" onClick={() => { setSelectedDas(null); setDasQuery(""); }} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"><X size={13} /> Hapus DAS</button></div>}
            </div>
          )}

          <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Jenis bencana</label>
              <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800">
                {types.map((v) => <option key={v} value={v}>{v === "ALL" ? "Semua jenis" : v}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Dari tanggal</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800" />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Sampai tanggal</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800" />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button onClick={reset} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-800"><X size={14} /> Reset Filter</button>
          </div>
        </div>

        {/* ERROR */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* MAP — national event distribution */}
        <Section
          eyebrow="01 • Spatial Intelligence"
          title="Peta Sebaran Kejadian Indonesia"
          description="Pemetaan lokasi kejadian berdasarkan koordinat geografis dan seluruh filter analitik yang sedang aktif."
          icon={MapPin}
        >
          {/* INDONESIA EVENT MAP */}
          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-gradient-to-r from-white to-emerald-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-2.5 text-emerald-700">
                  <MapPin size={18} />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    Ringkasan Sebaran pada Peta
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Sebaran titik kejadian berdasarkan koordinat pada data dan filter aktif.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-600">
                  {fmt(mappedEvents.length, 0)} titik pada peta
                </span>
                <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-600">
                  {fmt(filtered.length, 0)} total kejadian
                </span>
              </div>
            </div>

            <div className="relative bg-slate-100 p-2 sm:p-3">
              <div
                ref={mapContainerRef}
                className="z-0 h-[420px] w-full overflow-hidden rounded-xl border border-slate-200 bg-[#e8f1f5] sm:h-[540px] lg:h-[600px]"
                aria-label="Peta Indonesia dengan titik sebaran kejadian"
              />

              {mappedEvents.length === 0 && (
                <div className="pointer-events-none absolute inset-2 flex items-center justify-center sm:inset-3">
                  <div className="rounded-xl border border-slate-200 bg-white/95 px-5 py-4 text-center shadow-lg">
                    <MapPin size={22} className="mx-auto mb-2 text-slate-400" />
                    <p className="text-sm font-semibold text-slate-700">
                      Belum ada koordinat kejadian untuk ditampilkan
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Periksa data latitude dan longitude atau sesuaikan filter.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                Titik menunjukkan lokasi kejadian; klik titik untuk melihat detail.
              </div>
              <span className="text-[10px] font-medium text-slate-400">
                Peta dasar © OpenStreetMap
              </span>
            </div>
          </div>

        </Section>

        {/* TEMPORAL */}
        <Section
          eyebrow="02 • Temporal Intelligence"
          title="Distribusi Kejadian Berdasarkan Tanggal"
          description="Grafik kronologis menunjukkan jumlah kejadian pada setiap tanggal. Titik data dapat di-hover untuk melihat tanggal dan jumlah kejadian."
          icon={TrendingUp}
        >
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    Distribusi kejadian berdasarkan tanggal
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Sumbu X = tanggal • Sumbu Y = jumlah kejadian
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-600">
                  {fmt(filtered.length, 0)} kejadian
                </div>
              </div>

              <div className="h-[430px] w-full rounded-xl border border-slate-100 bg-slate-50/40 p-2 sm:p-3">
                {eventTrendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={eventTrendData}
                      margin={{
                        top: 18,
                        right: 22,
                        bottom: 18,
                        left: 4,
                      }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#e2e8f0"
                        vertical={false}
                      />

                      <XAxis
                        dataKey="dateLabel"
                        tick={{
                          fontSize: 11,
                          fill: "#64748b",
                        }}
                        tickLine={false}
                        axisLine={{ stroke: "#94a3b8" }}
                        minTickGap={24}
                      />

                      <YAxis
                        allowDecimals={false}
                        domain={[0, "auto"]}
                        tick={{
                          fontSize: 11,
                          fill: "#64748b",
                        }}
                        tickLine={false}
                        axisLine={false}
                        width={38}
                      />

                      <Tooltip
                        cursor={{
                          stroke: "#94a3b8",
                          strokeDasharray: "4 4",
                        }}
                        content={({ active, payload }) => {
                          if (!active || !payload || !payload.length) {
                            return null;
                          }

                          const item = payload[0]?.payload as
                            | {
                                date?: string;
                                dateLabel?: string;
                                value?: number;
                              }
                            | undefined;

                          if (!item) return null;

                          return (
                            <div className="min-w-[190px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">
                                Tanggal kejadian
                              </p>

                              <p className="mt-1 text-sm font-bold text-slate-800">
                                {item.date ? formatDate(item.date) : item.dateLabel}
                              </p>

                              <div className="mt-3 flex items-end justify-between border-t border-slate-100 pt-3">
                                <span className="text-xs text-slate-500">
                                  Jumlah kejadian
                                </span>
                                <span className="text-lg font-black text-emerald-700">
                                  {fmt(Number(item.value || 0), 0)}
                                </span>
                              </div>
                            </div>
                          );
                        }}
                      />

                      <Line
                        type="monotone"
                        dataKey="value"
                        name="Kejadian"
                        stroke="#ef4444"
                        strokeWidth={3}
                        dot={{
                          r: 4,
                          strokeWidth: 1.5,
                          fill: "#ffffff",
                        }}
                        activeDot={{
                          r: 7,
                          strokeWidth: 2,
                        }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart message="Belum ada data kejadian" />
                )}
              </div>
            </div>

            {/* TREND INSIGHT */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Puncak kejadian
                </p>

                <p className="mt-2 text-2xl font-black text-slate-800">
                  {eventTrendStats.peak ?? "—"}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  {eventTrendStats.peakDate
                    ? formatDate(eventTrendStats.peakDate)
                    : "Belum tersedia"}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Hari aktif
                </p>

                <p className="mt-2 text-2xl font-black text-slate-800">
                  {fmt(eventTrendStats.activeDays, 0)}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  Tanggal dengan kejadian
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Rata-rata / hari aktif
                </p>

                <p className="mt-2 text-2xl font-black text-slate-800">
                  {eventTrendStats.average
                    ? fmt(eventTrendStats.average, 1)
                    : "—"}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  Kejadian per tanggal
                </p>
              </div>
            </div>
          </div>

        </Section>

        {/* TYPE + RAINFALL */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* RAINFALL */}
          <Section
            eyebrow="04 • Rainfall Intelligence"
            title="Tren curah hujan"
            description="Visualisasi nilai curah hujan yang tersedia dari endpoint analytics atau atribut kejadian."
            icon={CloudRain}
          >
            <div className="mb-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                  Rata-rata
                </p>

                <p className="mt-2 text-xl font-bold text-slate-800">
                  {rainfallStats.avg == null
                    ? "—"
                    : `${fmt(rainfallStats.avg)} mm`}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                  Tertinggi
                </p>

                <p className="mt-2 text-xl font-bold text-slate-800">
                  {rainfallStats.high == null
                    ? "—"
                    : `${fmt(rainfallStats.high)} mm`}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                  Terendah
                </p>

                <p className="mt-2 text-xl font-bold text-slate-800">
                  {rainfallStats.low == null
                    ? "—"
                    : `${fmt(rainfallStats.low)} mm`}
                </p>
              </div>
            </div>

            <div className="h-[300px]">
              {rainfallRows.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={rainfallRows}
                    margin={{
                      top: 10,
                      right: 10,
                      left: 0,
                      bottom: 10,
                    }}
                  >
                    <defs>
                      <linearGradient
                        id="rainfallGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#38bdf8"
                          stopOpacity={0.35}
                        />

                        <stop
                          offset="100%"
                          stopColor="#38bdf8"
                          stopOpacity={0.02}
                        />
                      </linearGradient>
                    </defs>

                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />

                    <XAxis
                      dataKey="label"
                      stroke="#64748b"
                      tick={{
                        fontSize: 10,
                      }}
                    />

                    <YAxis
                      stroke="#64748b"
                      tick={{
                        fontSize: 10,
                      }}
                    />

                    <Tooltip
                      contentStyle={{
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: 12,
                      }}
                      formatter={(value: any) => [
                        `${fmt(Number(value))} mm`,
                        "Curah hujan",
                      ]}
                    />

                    <Area
                      type="monotone"
                      dataKey="value"
                      name="Curah hujan"
                      stroke="#0ea5e9"
                      strokeWidth={3}
                      fill="url(#rainfallGradient)"
                      dot={{
                        r: 3,
                      }}
                      activeDot={{
                        r: 6,
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="Data curah hujan belum tersedia" />
              )}
            </div>
          </Section>
        </div>

        {/* FOOTER */}
        <footer className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Database size={14} />
            Source: SIMITI API / PostgreSQL data
          </div>

          <div className="flex items-center gap-2">
            <CalendarDays size={14} />
            {fmt(filtered.length, 0)} record sesuai filter
          </div>
        </footer>
      </div>
    </div>
  );
}
