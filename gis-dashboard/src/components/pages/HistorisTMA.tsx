import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  Download,
  History,
  RefreshCw,
  TrendingUp,
  Waves,
} from "lucide-react";

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const HISTORY_API =
  import.meta.env.VITE_TMA_HISTORY_API_URL || `${API_BASE}/api/tma/history`;
const TMA_API = import.meta.env.VITE_TMA_API_URL || `${API_BASE}/api/tma`;

type Point = {
  timestamp?: string;
  time?: string;
  captured_at?: string;
  observed_at?: string;
  value?: number;
  tma?: number;
  water_level?: number;
  suhu?: number;
  ph?: number;
  ec?: number;
  kelembaban?: number;
  battery?: number;
  curah_hujan?: number;
  penurunan_tanah?: number;
  status?: string;
};
type Station = { id: any; code?: string; name?: string; station_name?: string };

function valueOf(p: Point) {
  return Number(p.value ?? p.tma ?? p.water_level ?? 0);
}

function normalizeStations(payload: any): Station[] {
  if (Array.isArray(payload)) return payload;

  if (
    payload?.data &&
    typeof payload.data === "object" &&
    !Array.isArray(payload.data)
  ) {
    return Object.entries(payload.data).map(([id, raw]: [string, any]) => ({
      id,
      code: id,
      name: raw?.idname || id,
      station_name: raw?.idname || id,
    }));
  }

  if (Array.isArray(payload?.items)) return payload.items;

  return [];
}

export default function HistorisTMA() {
  const [stations, setStations] = useState<Station[]>([]);
  const [selected, setSelected] = useState("");
  const [points, setPoints] = useState<Point[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    fetch(TMA_API)
      .then((r) => r.json())
      .then((p) => setStations(normalizeStations(p)))
      .catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (selected) params.set("station_id", selected);

      // Endpoint histori TMA umumnya membutuhkan rentang waktu yang lengkap.
      // Jika user hanya memilih tanggal "Sampai", isi otomatis "Mulai" = 30 hari sebelumnya
      // agar request tidak terkirim hanya dengan `to=YYYY-MM-DD` (yang memicu HTTP 400).
      let fromDate = from ? new Date(from) : null;
      const toDate = to ? new Date(to) : null;

      if (!fromDate && toDate && !Number.isNaN(toDate.getTime())) {
        fromDate = new Date(toDate);
        fromDate.setDate(fromDate.getDate() - 30);
      }

      if (fromDate && !Number.isNaN(fromDate.getTime())) {
        params.set("from", fromDate.toISOString());
      }
      if (toDate && !Number.isNaN(toDate.getTime())) {
        // Kirim akhir hari supaya tanggal "Sampai" tetap inklusif.
        const endOfDay = new Date(toDate);
        endOfDay.setHours(23, 59, 59, 999);
        params.set("to", endOfDay.toISOString());
      }

      const query = params.toString();
      const r = await fetch(query ? `${HISTORY_API}?${query}` : HISTORY_API);
      if (!r.ok) {
        let detail = "";
        try {
          const body = await r.json();
          detail = body?.message || body?.error || "";
        } catch {}
        throw new Error(
          detail ? `HTTP ${r.status}: ${detail}` : `HTTP ${r.status}`,
        );
      }
      const p = await r.json();
      setPoints(Array.isArray(p) ? p : (p.data ?? p.items ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengambil histori TMA");
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const vals = points.map(valueOf).filter(Number.isFinite);
    if (!vals.length) return { min: 0, max: 0, avg: 0 };
    return {
      min: Math.min(...vals),
      max: Math.max(...vals),
      avg: vals.reduce((a, b) => a + b, 0) / vals.length,
    };
  }, [points]);

  const totalPages = Math.max(1, Math.ceil(points.length / pageSize));
  const pagedPoints = useMemo(
    () => points.slice((page - 1) * pageSize, page * pageSize),
    [points, page, pageSize]
  );

  useEffect(() => {
    setPage(1);
  }, [points]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const exportCsv = () => {
    const header = "timestamp,tma_m\\n";
    const body = points
      .map((p) => `${p.timestamp || p.time || ""},${valueOf(p)}`)
      .join("\\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "historis-tma.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-slate-900 p-3 text-white shadow-sm">
                <Waves className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  <Activity className="h-3.5 w-3.5" /> Monitoring Hidrologi
                </div>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                  Historis TMA
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Analisis deret waktu tinggi muka air dan parameter sensor.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={load}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                {loading ? "Memuat..." : "Analisis"}
              </button>
              <button
                onClick={exportCsv}
                disabled={!points.length}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-40"
              >
                <Download className="h-4 w-4" /> Export CSV
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Stasiun</label>
            <select value={selected} onChange={(e) => setSelected(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium outline-none transition focus:border-slate-400 focus:bg-white">
              <option value="">Semua / pilih stasiun</option>
              {stations.map((st, i) => (
                <option key={st.id ?? i} value={st.id}>
                  {st.station_name || st.name || st.code || `Stasiun ${i + 1}`}
                </option>
              ))}
            </select>
          </div>
          <DateInput label="Mulai" value={from} onChange={setFrom} />
          <DateInput label="Sampai" value={to} onChange={setTo} />
          <div className="rounded-2xl border border-slate-200 bg-slate-900 p-4 text-white shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Observasi</div>
            <div className="mt-1 text-3xl font-bold">{points.length.toLocaleString("id-ID")}</div>
            <div className="mt-1 text-xs text-slate-400">data sensor ditemukan</div>
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold">Deret Waktu TMA</h2>
              <p className="text-sm text-slate-500">
                Data histori pembacaan sensor dari API.
              </p>
            </div>
            <CalendarDays className="h-5 w-5 text-slate-400" />
          </div>

          {points.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <label htmlFor="tma-page-size" className="whitespace-nowrap text-xs font-semibold text-slate-600">
                  Baris per halaman
                </label>
                <select
                  id="tma-page-size"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                >
                  {[10, 20, 25, 50, 100].map((size) => (
                    <option key={size} value={size}>{size} baris</option>
                  ))}
                </select>
              </div>
              <div className="text-xs text-slate-500">
                Pilih jumlah baris yang ditampilkan pada tabel
              </div>
            </div>
          )}

          <div className="mt-5 overflow-x-auto rounded-xl border">
            {points.length ? (
              <table className="min-w-[1200px] w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-3 py-3 text-center font-semibold">No</th>
                    <th className="px-3 py-3 text-left font-semibold">
                      Tanggal
                    </th>
                    <th className="px-3 py-3 text-left font-semibold">Jam</th>
                    <th className="px-3 py-3 text-right font-semibold">
                      Tinggi Muka Air (cm)
                    </th>
                    <th className="px-3 py-3 text-right font-semibold">
                      Suhu (°C)
                    </th>
                    <th className="px-3 py-3 text-right font-semibold">pH</th>
                    <th className="px-3 py-3 text-right font-semibold">EC</th>
                    <th className="px-3 py-3 text-right font-semibold">
                      Kelembaban (%)
                    </th>
                    <th className="px-3 py-3 text-right font-semibold">
                      Penurunan Tanah (cm)
                    </th>
                    <th className="px-3 py-3 text-center font-semibold">
                      Status
                    </th>
                    <th className="px-3 py-3 text-right font-semibold">
                      Battery
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {pagedPoints.map((p, i) => {
                    const rawDate =
                      p.captured_at ||
                      p.observed_at ||
                      p.timestamp ||
                      p.time ||
                      "";
                    const dateObj = rawDate ? new Date(rawDate) : null;

                    const tanggal =
                      dateObj && !Number.isNaN(dateObj.getTime())
                        ? dateObj.toLocaleDateString("id-ID", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })
                        : "-";

                    const jam =
                      dateObj && !Number.isNaN(dateObj.getTime())
                        ? dateObj.toLocaleTimeString("id-ID", {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                            hour12: false,
                          })
                        : "-";

                    const status = p.status || "-";

                    return (
                      <tr
                        key={p.timestamp || p.captured_at || i}
                        className="hover:bg-slate-50"
                      >
                        <td className="px-3 py-2.5 text-center text-slate-500">
                          {(page - 1) * pageSize + i + 1}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {tanggal}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{jam}</td>
                        <td className="px-3 py-2.5 text-right font-semibold">
                          {valueOf(p).toFixed(1)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {Number(p.suhu ?? 0).toFixed(1)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {Number(p.ph ?? 0).toFixed(1)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {Number(p.ec ?? 0).toFixed(0)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {Number(p.kelembaban ?? 0).toFixed(1)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {p.penurunan_tanah == null
                            ? "-"
                            : Number(p.penurunan_tanah).toFixed(1)}
                        </td>
                        <td className="px-3 py-2.5 text-center">{status}</td>
                        <td className="px-3 py-2.5 text-right">
                          {p.battery == null
                            ? "-"
                            : Number(p.battery).toFixed(0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="flex min-h-48 items-center justify-center text-sm text-slate-400">
                Belum ada data histori untuk parameter yang dipilih.
              </div>
            )}
          </div>

          {points.length > 0 && (
            <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="text-xs text-slate-500">
                Menampilkan <span className="font-semibold text-slate-700">{Math.min((page - 1) * pageSize + 1, points.length)}</span>
                {" - "}
                <span className="font-semibold text-slate-700">{Math.min(page * pageSize, points.length)}</span>
                {" dari "}
                <span className="font-semibold text-slate-700">{points.length.toLocaleString("id-ID")}</span> observasi
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button disabled={page === 1} onClick={() => setPage(1)} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40 hover:bg-slate-50">«</button>
                <button disabled={page === 1} onClick={() => setPage((v) => Math.max(1, v - 1))} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40 hover:bg-slate-50">‹</button>
                <span className="min-w-[90px] rounded-lg bg-slate-900 px-3 py-2 text-center text-xs font-semibold text-white">
                  {page} / {totalPages}
                </span>
                <button disabled={page === totalPages} onClick={() => setPage((v) => Math.min(totalPages, v + 1))} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40 hover:bg-slate-50">›</button>
                <button disabled={page === totalPages} onClick={() => setPage(totalPages)} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40 hover:bg-slate-50">»</button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <label className="text-xs font-semibold text-slate-500">{label}</label>
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium outline-none transition focus:border-slate-400 focus:bg-white"
      />
    </div>
  );
}
function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-slate-400">{icon}</div>
      <div className="mt-2 text-xl font-bold">{value}</div>
      <div className="text-sm text-slate-500">{label}</div>
    </div>
  );
}
