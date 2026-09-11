import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL } from './api';
import Header from './header';

interface LayerItem {
  id: string;
  name: string;
  year?: number;
}

interface LayerResponse {
  kerawanan?: LayerItem[];
  mitigasiAdaptasi?: LayerItem[];
  lainnya?: LayerItem[];
  kejadian?: LayerItem[];
}

const menu = [
  { label: 'Beranda', icon: '⌂', path: '/' },
  { label: 'Peta Interaktif', icon: '⌖', path: '/kerawanan' },
  { label: 'Kejadian Bencana', icon: '⚠', path: '/kebencanaan' },
  { label: 'Mitigasi & Adaptasi', icon: '✦', path: '/mitigasi-adaptasi' },
  { label: 'Cek Lokasi', icon: '📍', path: '/cek-lokasi' },
  { label: 'Statistik & Analisis', icon: '▦', path: '/statistik' },
  { label: 'Laporan', icon: '▤', path: '/laporan' },
  { label: 'Layer Data', icon: '◫', path: '/kerawanan' },
  { label: 'API Services', icon: '⇄', path: '/api-services' },
  { label: 'Administrasi', icon: '⚙', path: '/admin' },
];

const Beranda: React.FC = () => {
  const navigate = useNavigate();
  const [layers, setLayers] = useState<LayerResponse>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch(`${API_URL}/api/layers`);
        if (!response.ok) throw new Error('Gagal mengambil layer');
        const data = await response.json();
        if (alive) setLayers(data || {});
      } catch (error) {
        console.warn('Dashboard layer summary:', error);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => { alive = false; };
  }, []);

  const stats = useMemo(() => ({
    kerawanan: layers.kerawanan?.length || 0,
    mitigasi: layers.mitigasiAdaptasi?.length || 0,
    lainnya: layers.lainnya?.length || 0,
    kejadian: layers.kejadian?.length || 0,
  }), [layers]);

  const go = (path: string) => navigate(path);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex">
      <aside className="w-[248px] shrink-0 bg-[#075b45] text-white min-h-screen flex flex-col shadow-xl">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white text-[#075b45] flex items-center justify-center font-black text-lg">S</div>
            <div>
              <div className="font-extrabold tracking-wide text-lg">SIMITI</div>
              <div className="text-[9px] leading-tight text-emerald-100">Sistem Informasi Mitigasi dan Adaptasi<br />Bencana Hidrometeorologi Kehutanan</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="text-[9px] uppercase tracking-[0.18em] text-emerald-200 px-3 mb-2">Menu Utama</div>
          {menu.map((item, index) => (
            <button
              key={item.label}
              onClick={() => go(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs mb-1 transition ${index === 0 ? 'bg-white text-[#075b45] font-bold shadow-sm' : 'text-emerald-50/90 hover:bg-white/10'}`}
            >
              <span className="w-5 text-center text-sm">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-white/10">
          <button onClick={() => go('/cek-lokasi')} className="w-full rounded-xl bg-white/10 hover:bg-white/15 p-3 text-left">
            <div className="text-[9px] uppercase tracking-wider text-emerald-200">Lokasi Saya</div>
            <div className="text-xs font-semibold mt-1">Cek tingkat kerawanan lokasi</div>
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <Header currentPage="beranda" />

        <div className="p-5 lg:p-6 space-y-5">
          <section className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
            <div>
              <div className="text-xs text-emerald-700 font-semibold mb-1">SISTEM INFORMASI MITIGASI & ADAPTASI</div>
              <h1 className="text-2xl lg:text-3xl font-black text-slate-900">Dashboard SIMITI</h1>
              <p className="text-sm text-slate-500 mt-1">Ringkasan informasi kebencanaan, kerawanan, serta kegiatan mitigasi dan adaptasi.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => go('/kerawanan')} className="px-4 py-2.5 rounded-xl bg-[#075b45] text-white text-xs font-bold hover:bg-[#064c3b]">Buka Peta</button>
              <button onClick={() => go('/cek-lokasi')} className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50">Cek Lokasi</button>
            </div>
          </section>

          <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <StatCard title="Layer Kerawanan" value={stats.kerawanan} subtitle="data kerawanan tersedia" icon="◈" loading={loading} />
            <StatCard title="Mitigasi & Adaptasi" value={stats.mitigasi} subtitle="layer kegiatan" icon="✦" loading={loading} />
            <StatCard title="Kejadian Bencana" value={stats.kejadian} subtitle="layer kejadian" icon="⚠" loading={loading} />
            <StatCard title="Layer Lainnya" value={stats.lainnya} subtitle="data pendukung" icon="◫" loading={loading} />
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">Peta & Informasi</div>
                  <h2 className="font-extrabold text-lg">Peta Interaktif</h2>
                </div>
                <button onClick={() => go('/kerawanan')} className="text-xs font-bold text-emerald-700">Lihat peta →</button>
              </div>
              <div className="h-[330px] bg-slate-100 relative overflow-hidden">
                <div className="absolute inset-0 opacity-60" style={{ backgroundImage: 'linear-gradient(rgba(15,23,42,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,.07) 1px, transparent 1px)', backgroundSize: '36px 36px' }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto w-14 h-14 rounded-2xl bg-white shadow-md flex items-center justify-center text-2xl">🗺️</div>
                    <div className="font-bold mt-3">Peta Interaktif SIMITI</div>
                    <div className="text-xs text-slate-500 mt-1 max-w-sm">Buka Peta Interaktif untuk melihat administrasi, DAS, kerawanan, kejadian, serta layer mitigasi dan adaptasi.</div>
                    <button onClick={() => go('/kerawanan')} className="mt-4 px-4 py-2 rounded-lg bg-[#075b45] text-white text-xs font-bold">Buka Peta Interaktif</button>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Akses Cepat</div>
              <h2 className="font-extrabold text-lg mt-1">Fitur SIMITI</h2>
              <div className="mt-4 space-y-2">
                <QuickAction icon="📍" title="Cek Lokasi" desc="Analisis lokasi berdasarkan koordinat GPS" onClick={() => go('/cek-lokasi')} />
                <QuickAction icon="🛡️" title="Mitigasi & Adaptasi" desc="Lihat kegiatan dan rekomendasi lokasi" onClick={() => go('/mitigasi-adaptasi')} />
                <QuickAction icon="📊" title="Statistik & Analisis" desc="Ringkasan dan analisis data" onClick={() => go('/statistik')} />
                <QuickAction icon="📑" title="Laporan" desc="Laporan data dan export" onClick={() => go('/laporan')} />
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <InfoCard title="Kerawanan" count={stats.kerawanan} description="Data kawasan rawan yang tersedia di sistem." action="Buka Kawasan Rawan" onClick={() => go('/kerawanan')} />
            <InfoCard title="Mitigasi & Adaptasi" count={stats.mitigasi} description="Data kegiatan mitigasi dan adaptasi sektor kehutanan." action="Lihat Kegiatan" onClick={() => go('/mitigasi-adaptasi')} />
            <InfoCard title="Kejadian Bencana" count={stats.kejadian} description="Data kejadian bencana yang tersedia untuk analisis." action="Lihat Kejadian" onClick={() => go('/kebencanaan')} />
          </section>
        </div>
      </main>
    </div>
  );
};

const StatCard = ({ title, value, subtitle, icon, loading }: { title: string; value: number; subtitle: string; icon: string; loading: boolean }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
    <div className="flex justify-between items-start">
      <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">{icon}</div>
      <span className="text-[9px] uppercase tracking-wider text-slate-400">Data</span>
    </div>
    <div className="mt-4 text-2xl font-black text-slate-900">{loading ? '—' : value}</div>
    <div className="text-xs font-bold text-slate-700 mt-1">{title}</div>
    <div className="text-[10px] text-slate-400 mt-1">{subtitle}</div>
  </div>
);

const QuickAction = ({ icon, title, desc, onClick }: { icon: string; title: string; desc: string; onClick: () => void }) => (
  <button onClick={onClick} className="w-full text-left flex gap-3 p-3 rounded-xl border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/50 transition">
    <div className="w-9 h-9 shrink-0 rounded-lg bg-slate-50 flex items-center justify-center">{icon}</div>
    <div className="min-w-0"><div className="text-xs font-bold text-slate-800">{title}</div><div className="text-[10px] text-slate-500 mt-0.5">{desc}</div></div>
  </button>
);

const InfoCard = ({ title, count, description, action, onClick }: { title: string; count: number; description: string; action: string; onClick: () => void }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
    <div className="flex items-center justify-between"><h3 className="font-extrabold">{title}</h3><span className="text-xl font-black text-emerald-700">{count}</span></div>
    <p className="text-xs text-slate-500 mt-3 leading-relaxed">{description}</p>
    <button onClick={onClick} className="mt-4 text-xs font-bold text-emerald-700">{action} →</button>
  </div>
);

export default Beranda;
