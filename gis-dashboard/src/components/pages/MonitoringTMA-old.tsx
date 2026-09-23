import React, { useEffect, useMemo, useState } from "react";
import { Activity, CircleAlert, Filter, Gauge, MapPin, RefreshCw, Search, Waves } from "lucide-react";

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const TMA_API = import.meta.env.VITE_TMA_API_URL || `${API_BASE}/api/tma`;

type Station = Record<string, any>;

function statusOf(s: Station) {
  const v = String(s.status || "").toLowerCase();
  if (v.includes("awas")) return "awas";
  if (v.includes("siaga")) return "siaga";
  if (v.includes("waspada")) return "waspada";
  return "normal";
}
function tmaOf(s: Station) { return Number(s.tma ?? s.water_level ?? s.value ?? 0); }

export default function MonitoringTMA() {
  const [rows, setRows] = useState<Station[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch(TMA_API);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const p = await r.json();
      setRows(Array.isArray(p) ? p : p.data ?? p.items ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "Gagal mengambil data"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter(s => {
    const q = search.toLowerCase();
    const text = [s.station_name, s.name, s.code, s.river, s.das, s.province, s.kabupaten].filter(Boolean).join(" ").toLowerCase();
    return (!q || text.includes(q)) && (status === "all" || statusOf(s) === status);
  }), [rows, search, status]);

  return <div className="min-h-screen bg-slate-50 p-4 md:p-6">
    <div className="mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><div className="flex items-center gap-2 text-sm text-slate-500"><Waves className="h-4 w-4"/> Operasional Hidrologi</div><h1 className="mt-2 text-2xl font-bold text-slate-900">Monitoring TMA</h1><p className="mt-1 text-sm text-slate-500">Pemantauan stasiun secara operasional dan near real-time.</p></div>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-semibold shadow-sm"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}/> Refresh</button>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Stat icon={<Gauge/>} label="Stasiun terpantau" value={rows.length}/>
        <Stat icon={<CircleAlert/>} label="Perlu perhatian" value={rows.filter(s => ["waspada","siaga","awas"].includes(statusOf(s))).length}/>
        <Stat icon={<Activity/>} label="Hasil filter" value={filtered.length}/>
      </section>

      <section className="rounded-2xl border bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari stasiun, sungai, DAS, wilayah..." className="w-full rounded-lg border py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"/></div>
          <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-slate-400"/><select value={status} onChange={e=>setStatus(e.target.value)} className="rounded-lg border px-3 py-2.5 text-sm"><option value="all">Semua status</option><option value="normal">Normal</option><option value="waspada">Waspada</option><option value="siaga">Siaga</option><option value="awas">Awas</option></select></div>
        </div>
        {error && <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">API TMA: {error}</div>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Stasiun</th><th className="px-4 py-3">Lokasi</th><th className="px-4 py-3">DAS</th><th className="px-4 py-3">TMA</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Sensor</th><th className="px-4 py-3">Update</th></tr></thead>
            <tbody>
              {filtered.map((s,i) => <tr key={s.id ?? i} className="border-t hover:bg-slate-50">
                <td className="px-4 py-3"><div className="font-semibold text-slate-800">{s.station_name || s.name || s.code || `Stasiun ${i+1}`}</div><div className="text-xs text-slate-400">{s.code || "-"}</div></td>
                <td className="px-4 py-3 text-slate-600"><MapPin className="mr-1 inline h-3.5 w-3.5"/>{s.province || s.kabupaten || "-"}</td>
                <td className="px-4 py-3">{s.das || "-"}</td>
                <td className="px-4 py-3 font-bold">{tmaOf(s).toFixed(2)} m</td>
                <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize">{statusOf(s)}</span></td>
                <td className="px-4 py-3"><span className="inline-flex items-center gap-1 text-xs"><span className="h-2 w-2 rounded-full bg-emerald-500"/>{s.sensor_status || s.connection_status || "Online"}</span></td>
                <td className="px-4 py-3 text-xs text-slate-500">{s.updated_at || s.timestamp || "-"}</td>
              </tr>)}
              {!loading && !filtered.length && <tr><td colSpan={7} className="py-12 text-center text-slate-500">Tidak ada data sesuai filter.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>;
}

function Stat({icon,label,value}:{icon:React.ReactNode;label:string;value:number}) {
  return <div className="rounded-2xl border bg-white p-4 shadow-sm"><div className="text-slate-400">{icon}</div><div className="mt-3 text-2xl font-bold">{value}</div><div className="text-sm text-slate-500">{label}</div></div>;
}
