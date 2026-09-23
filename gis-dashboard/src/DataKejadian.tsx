import React, { useEffect, useMemo, useState } from "react";

import {
  BarChart3,
  CalendarDays,
  CloudRain,
  Database,
  Filter,
  MapPin,
  RefreshCw,
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
  Scatter,
  ScatterChart,
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

  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("ALL");
  const [type, setType] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

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

  const locations = useMemo(
    () => [
      "ALL",
      ...Array.from(
        new Set(events.map((e) => e.location).filter(Boolean)),
      ).sort(),
    ],
    [events],
  );

  const types = useMemo(
    () => [
      "ALL",
      ...Array.from(new Set(events.map((e) => e.type).filter(Boolean))).sort(),
    ],
    [events],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return events.filter((e) => {
      const matchSearch =
        !q ||
        e.location.toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q);

      const matchLocation = location === "ALL" || e.location === location;

      const matchType = type === "ALL" || e.type === type;

      const matchStart = !startDate || e.date >= startDate;

      const matchEnd = !endDate || e.date <= endDate;

      return (
        matchSearch && matchLocation && matchType && matchStart && matchEnd
      );
    });
  }, [events, search, location, type, startDate, endDate]);

  /*
   * TEMPORAL DATA
   *
   * Satu titik = satu tanggal.
   * Y = jumlah kejadian pada tanggal tersebut.
   */
  const eventScatter = useMemo(() => {
    const grouped = new Map<string, EventRow[]>();

    filtered.forEach((event) => {
      if (!event.date) return;

      const current = grouped.get(event.date) || [];

      current.push(event);

      grouped.set(event.date, current);
    });

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dayEvents]) => ({
        x: new Date(`${date}T00:00:00`).getTime(),

        date,

        dateLabel: formatDate(date),

        value: dayEvents.length,

        location:
          dayEvents.length === 1
            ? dayEvents[0].location
            : `${dayEvents.length} lokasi`,

        type:
          dayEvents.length === 1
            ? dayEvents[0].type
            : `${dayEvents.length} jenis/kejadian`,
      }));
  }, [filtered]);

  /*
   * TREND SUMMARY
   */
  const eventTrendStats = useMemo(() => {
    if (!eventScatter.length) {
      return {
        peak: null,
        peakDate: null,
        activeDays: 0,
        average: 0,
      };
    }

    const peak = eventScatter.reduce(
      (max, item) => (item.value > max.value ? item : max),
      eventScatter[0],
    );

    const total = eventScatter.reduce((sum, item) => sum + item.value, 0);

    return {
      peak: peak.value,
      peakDate: peak.date,
      activeDays: eventScatter.length,
      average: total / eventScatter.length,
    };
  }, [eventScatter]);

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

  const reset = () => {
    setSearch("");
    setLocation("ALL");
    setType("ALL");
    setStartDate("");
    setEndDate("");
  };

  return (
    <div className="min-h-screen bg-[#f4f7fa] p-3 text-slate-800 sm:p-4 lg:p-6">
      <div className="mx-auto max-w-[1800px] space-y-5 lg:space-y-6">
        {/* HEADER */}
        <header className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-[#fbfdfc] to-[#eef7f3] p-4 shadow-[0_10px_30px_rgba(15,23,42,0.07)] sm:p-5 lg:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-emerald-700">
                <ShieldAlert size={18} />

                <span className="text-[10px] font-bold uppercase tracking-[0.25em]">
                  SIMITI • Enterprise Analytics
                </span>
              </div>

              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-800 sm:text-3xl md:text-4xl">
                Data Kejadian
              </h1>

              <p className="mt-2 max-w-3xl text-sm text-slate-500">
                Dashboard analitik kejadian bencana berdasarkan lokasi, periode,
                jenis bencana, curah hujan, dan tutupan lahan.
              </p>
            </div>

            <button
              onClick={() => {
                load();
                loadAnalytics();
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100"
            >
              <RefreshCw
                size={16}
                className={loading || analyticsLoading ? "animate-spin" : ""}
              />
              Refresh Data
            </button>
          </div>
        </header>

        {/* FILTER */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_5px_18px_rgba(15,23,42,0.06)]">
          <div className="mb-3 flex items-center gap-2">
            <Filter size={16} className="text-emerald-700" />

            <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              Filter Analitik
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="xl:col-span-2">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Pencarian
              </label>

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Lokasi atau jenis bencana..."
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Lokasi
              </label>

              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm"
              >
                {locations.map((v) => (
                  <option key={v} value={v}>
                    {v === "ALL" ? "Semua lokasi" : v}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Jenis Bencana
              </label>

              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm"
              >
                {types.map((v) => (
                  <option key={v} value={v}>
                    {v === "ALL" ? "Semua jenis" : v}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Dari tanggal
              </label>

              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Sampai tanggal
              </label>

              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm"
              />
            </div>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            >
              <X size={14} />
              Reset Filter
            </button>
          </div>
        </div>

        {/* ERROR */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* KPI */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            title="Total Kejadian"
            value={fmt(filtered.length, 0)}
            subtitle="Sesuai filter aktif"
            icon={ShieldAlert}
          />

          <Card
            title="Jenis Bencana"
            value={fmt(typeChart.length, 0)}
            subtitle="Jenis teridentifikasi"
            icon={BarChart3}
          />

          <Card
            title="Curah Hujan Rata-rata"
            value={
              rainfallStats.avg == null ? "—" : `${fmt(rainfallStats.avg)} mm`
            }
            subtitle="Dari nilai tersedia"
            icon={CloudRain}
          />

          <Card
            title="Lokasi Terpetakan"
            value={fmt(mappedLocations, 0)}
            subtitle="Koordinat valid"
            icon={MapPin}
          />
        </div>

        {/* TEMPORAL */}
        <Section
          eyebrow="01 • Temporal Intelligence"
          title="Tren kejadian berdasarkan waktu"
          description="Setiap titik menunjukkan jumlah kejadian pada tanggal tertentu. Gunakan filter lokasi, jenis bencana, dan periode untuk melihat perubahan pola kejadian."
          icon={TrendingUp}
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="h-[390px] w-full">
              {eventScatter.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart
                    margin={{
                      top: 20,
                      right: 25,
                      bottom: 25,
                      left: 5,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />

                    <XAxis
                      type="number"
                      dataKey="x"
                      domain={["auto", "auto"]}
                      tick={{
                        fontSize: 11,
                      }}
                      stroke="#64748b"
                      tickFormatter={(value) => {
                        const d = new Date(Number(value));

                        if (Number.isNaN(d.getTime())) {
                          return "";
                        }

                        return new Intl.DateTimeFormat("id-ID", {
                          day: "2-digit",
                          month: "short",
                        }).format(d);
                      }}
                    />

                    <YAxis
                      type="number"
                      dataKey="value"
                      allowDecimals={false}
                      domain={[0, "auto"]}
                      tick={{
                        fontSize: 11,
                      }}
                      stroke="#64748b"
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

                        const item = payload[0]?.payload;

                        if (!item) {
                          return null;
                        }

                        return (
                          <div className="min-w-[240px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                              Tanggal
                            </p>

                            <p className="mt-1 text-sm font-bold text-slate-800">
                              {item.dateLabel}
                            </p>

                            <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-xs text-slate-500">
                                  Jumlah kejadian
                                </span>

                                <span className="text-sm font-bold text-emerald-700">
                                  {item.value}
                                </span>
                              </div>

                              <div className="flex items-center justify-between gap-4">
                                <span className="text-xs text-slate-500">
                                  Lokasi
                                </span>

                                <span className="max-w-[150px] text-right text-xs font-semibold text-slate-700">
                                  {item.location}
                                </span>
                              </div>

                              <div className="flex items-center justify-between gap-4">
                                <span className="text-xs text-slate-500">
                                  Jenis
                                </span>

                                <span className="max-w-[150px] text-right text-xs font-semibold text-slate-700">
                                  {item.type}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    />

                    <Scatter
                      name="Kejadian"
                      data={eventScatter}
                      fill="#10b981"
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="Belum ada data kejadian" />
              )}
            </div>

            {/* TREND INSIGHT */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
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
          {/* TYPE */}
          <Section
            eyebrow="02 • Disaster Profile"
            title="Komposisi jenis bencana"
            description="Distribusi jumlah kejadian dan kontribusi persentase setiap jenis bencana berdasarkan data API dan filter aktif."
            icon={BarChart3}
          >
            <div className="mb-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Total
                </p>

                <p className="mt-1 text-xl font-black text-slate-800">
                  {fmt(filtered.length, 0)}
                </p>

                <p className="text-[10px] text-slate-400">kejadian</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Kategori
                </p>

                <p className="mt-1 text-xl font-black text-slate-800">
                  {fmt(typeChart.length, 0)}
                </p>

                <p className="text-[10px] text-slate-400">jenis bencana</p>
              </div>
            </div>

            <div className="h-[350px]">
              {typeChart.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={typeChart}
                    layout="vertical"
                    margin={{
                      left: 10,
                      right: 45,
                      top: 5,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />

                    <XAxis
                      type="number"
                      allowDecimals={false}
                      stroke="#64748b"
                    />

                    <YAxis
                      type="category"
                      dataKey="name"
                      width={115}
                      stroke="#64748b"
                      tick={{
                        fontSize: 10,
                      }}
                    />

                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) {
                          return null;
                        }

                        const item = payload[0]?.payload;

                        if (!item) {
                          return null;
                        }

                        return (
                          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                            <p className="text-xs font-bold text-slate-800">
                              {item.name}
                            </p>

                            <div className="mt-2 flex gap-5">
                              <div>
                                <p className="text-[10px] text-slate-400">
                                  Kejadian
                                </p>

                                <p className="text-sm font-bold text-emerald-700">
                                  {item.value}
                                </p>
                              </div>

                              <div>
                                <p className="text-[10px] text-slate-400">
                                  Persentase
                                </p>

                                <p className="text-sm font-bold text-slate-800">
                                  {fmt(item.percentage, 1)}%
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    />

                    <Bar
                      dataKey="value"
                      name="Kejadian"
                      radius={[0, 6, 6, 0]}
                      fill="#10b981"
                    >
                      <LabelList
                        dataKey="percentage"
                        position="right"
                        formatter={(value: any) => `${fmt(Number(value), 1)}%`}
                        fill="#64748b"
                        fontSize={10}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="Belum ada data jenis bencana" />
              )}
            </div>
          </Section>

          {/* RAINFALL */}
          <Section
            eyebrow="03 • Rainfall Intelligence"
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

        {/* LAND COVER */}
        <Section
          eyebrow="04 • Land Cover Intelligence"
          title="Komposisi tutupan lahan"
          description="Distribusi jenis tutupan lahan yang terkait dengan kejadian. Persentase menggunakan data analytics jika endpoint tersedia."
          icon={Sprout}
        >
          <div className="grid gap-6 lg:grid-cols-[minmax(300px,460px)_minmax(0,1fr)]">
            <div className="h-[380px]">
              {landCoverChart.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={landCoverChart}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={135}
                      innerRadius={70}
                      paddingAngle={2}
                    >
                      {landCoverChart.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>

                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) {
                          return null;
                        }

                        const item = payload[0]?.payload;

                        if (!item) {
                          return null;
                        }

                        return (
                          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                            <p className="text-xs font-bold text-slate-800">
                              {item.name}
                            </p>

                            <p className="mt-1 text-sm font-bold text-emerald-700">
                              {fmt(item.value, 2)}
                            </p>

                            <p className="text-xs text-slate-500">
                              {fmt(item.percentage, 1)}% dari total
                            </p>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="Data tutupan lahan belum tersedia" />
              )}
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    Detail distribusi
                  </p>

                  <p className="text-xs text-slate-500">
                    Berdasarkan data yang tersedia
                  </p>
                </div>

                <Sprout size={18} className="text-emerald-600" />
              </div>

              <div className="space-y-2">
                {landCoverChart.map((item, i) => (
                  <div
                    key={item.name}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{
                            background: COLORS[i % COLORS.length],
                          }}
                        />

                        <span className="truncate text-sm font-medium text-slate-700">
                          {item.name}
                        </span>
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-800">
                          {fmt(item.value, 2)}
                        </p>

                        <p className="text-[10px] text-slate-400">
                          {fmt(item.percentage, 1)}%
                        </p>
                      </div>
                    </div>

                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, item.percentage)}%`,
                          background: COLORS[i % COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

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
