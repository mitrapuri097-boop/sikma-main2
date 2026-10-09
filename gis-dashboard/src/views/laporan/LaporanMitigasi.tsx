import React, { useMemo, useState } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./LaporanMitigasi.css";

type DisasterKind = "Banjir" | "Longsor" | "Karhutla" | "Abrasi" | "Kekeringan";
type IncidentStatus = "Tanggap Darurat" | "Pemantauan" | "Selesai";
type Incident = { id: number; type: DisasterKind; location: string; province: string; date: string; status: IncidentStatus; lat: number; lng: number };

// Data di bawah adalah data contoh UI. Ganti sumber ini dengan respons API produksi bila endpoint tersedia.
const SAMPLE_INCIDENTS: Incident[] = [
  { id: 1, type: "Banjir", location: "Kab. Demak", province: "Jawa Tengah", date: "08 Okt 2026", status: "Tanggap Darurat", lat: -6.89, lng: 110.64 },
  { id: 2, type: "Longsor", location: "Kab. Bandung Barat", province: "Jawa Barat", date: "08 Okt 2026", status: "Pemantauan", lat: -6.82, lng: 107.48 },
  { id: 3, type: "Karhutla", location: "Kab. Ketapang", province: "Kalimantan Barat", date: "07 Okt 2026", status: "Tanggap Darurat", lat: -1.85, lng: 109.97 },
  { id: 4, type: "Banjir", location: "Kota Banjarmasin", province: "Kalimantan Selatan", date: "07 Okt 2026", status: "Pemantauan", lat: -3.32, lng: 114.59 },
  { id: 5, type: "Kekeringan", location: "Kab. Lombok Timur", province: "Nusa Tenggara Barat", date: "06 Okt 2026", status: "Pemantauan", lat: -8.65, lng: 116.53 },
  { id: 6, type: "Abrasi", location: "Kab. Indramayu", province: "Jawa Barat", date: "06 Okt 2026", status: "Selesai", lat: -6.33, lng: 108.32 },
  { id: 7, type: "Longsor", location: "Kab. Agam", province: "Sumatera Barat", date: "05 Okt 2026", status: "Tanggap Darurat", lat: -0.28, lng: 100.17 },
  { id: 8, type: "Karhutla", location: "Kab. Kapuas", province: "Kalimantan Tengah", date: "04 Okt 2026", status: "Pemantauan", lat: -2, lng: 114.38 },
];
const COLORS: Record<DisasterKind, string> = { Banjir: "#2583e8", Longsor: "#d97732", Karhutla: "#e34d59", Abrasi: "#8b5cf6", Kekeringan: "#d6a323" };
const ICONS: Record<DisasterKind, string> = { Banjir: "≋", Longsor: "△", Karhutla: "♨", Abrasi: "≈", Kekeringan: "☼" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const TREND = [
  { month: "Jan", banjir: 68, longsor: 35, karhutla: 19 }, { month: "Feb", banjir: 54, longsor: 28, karhutla: 15 },
  { month: "Mar", banjir: 72, longsor: 40, karhutla: 20 }, { month: "Apr", banjir: 49, longsor: 31, karhutla: 23 },
  { month: "Mei", banjir: 43, longsor: 25, karhutla: 35 }, { month: "Jun", banjir: 31, longsor: 19, karhutla: 51 },
  { month: "Jul", banjir: 28, longsor: 17, karhutla: 67 }, { month: "Agu", banjir: 35, longsor: 21, karhutla: 78 },
  { month: "Sep", banjir: 42, longsor: 25, karhutla: 61 }, { month: "Okt", banjir: 48, longsor: 30, karhutla: 42 },
  { month: "Nov", banjir: 0, longsor: 0, karhutla: 0 }, { month: "Des", banjir: 0, longsor: 0, karhutla: 0 },
];
const fmt = (n: number) => new Intl.NumberFormat("id-ID").format(n);
const totalFor = (items: Incident[]) => items.length;

function Glyph({ children }: { children: React.ReactNode }) { return <span className="lb-glyph" aria-hidden="true">{children}</span>; }
function Panel({ title, subtitle, action, children, className = "" }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`lb-panel ${className}`}><header className="lb-panel-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action && <div className="lb-panel-action">{action}</div>}</header><div className="lb-panel-body">{children}</div></section>;
}
function TrendChart() {
  const max = 90;
  const points = (key: "banjir" | "longsor" | "karhutla") => TREND.map((d, i) => `${18 + i * 57.5},${104 - (d[key] / max) * 83}`).join(" ");
  return <div className="lb-trend-wrap"><svg className="lb-trend-svg" viewBox="0 0 670 120" preserveAspectRatio="none" role="img" aria-label="Grafik tren kejadian bulanan">
    {[20, 46, 72, 98].map(y => <line key={y} x1="18" x2="660" y1={y} y2={y} stroke="#e9eff4" strokeDasharray="3 5" />)}
    {(["banjir", "longsor", "karhutla"] as const).map((key, i) => <g key={key}><polyline points={points(key)} fill="none" stroke={[COLORS.Banjir, COLORS.Longsor, COLORS.Karhutla][i]} strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round" />{TREND.map((d, j) => <circle key={j} cx={18 + j * 57.5} cy={104 - (d[key] / max) * 83} r="2.5" fill={[COLORS.Banjir, COLORS.Longsor, COLORS.Karhutla][i]} />)}</g>)}
  </svg><div className="lb-month-labels">{MONTHS.map(m => <span key={m}>{m}</span>)}</div></div>;
}

export default function LaporanKejadianBencana() {
  const [year, setYear] = useState("2026");
  const [kind, setKind] = useState("Semua jenis");
  const [status, setStatus] = useState("Semua status");
  const [province, setProvince] = useState("Semua provinsi");
  const [search, setSearch] = useState("");
  const [mapType, setMapType] = useState<"street" | "satellite">("satellite");
  const [showAll, setShowAll] = useState(false);

  const provinces = useMemo(() => [...new Set(SAMPLE_INCIDENTS.map(x => x.province))].sort(), []);
  const filtered = useMemo(() => SAMPLE_INCIDENTS.filter(x =>
    (kind === "Semua jenis" || x.type === kind) && (status === "Semua status" || x.status === status) &&
    (province === "Semua provinsi" || x.province === province) &&
    `${x.location} ${x.province} ${x.type} ${x.status}`.toLowerCase().includes(search.trim().toLowerCase())
  ), [kind, status, province, search]);
  const countByType = useMemo(() => (Object.keys(COLORS) as DisasterKind[]).map(type => ({ type, count: filtered.filter(x => x.type === type).length })), [filtered]);
  const countByProvince = useMemo(() => provinces.map(name => ({ name, count: filtered.filter(x => x.province === name).length })).filter(x => x.count > 0).sort((a, b) => b.count - a.count).slice(0, 5), [filtered, provinces]);
  const totalByType = (type: DisasterKind) => filtered.filter(x => x.type === type).length;
  const urgent = filtered.filter(x => x.status === "Tanggap Darurat").length;
  const watch = filtered.filter(x => x.status === "Pemantauan").length;
  const done = filtered.filter(x => x.status === "Selesai").length;
  const reset = () => { setKind("Semua jenis"); setStatus("Semua status"); setProvince("Semua provinsi"); setSearch(""); };
  const exportCsv = () => {
    const rows = [["Jenis Bencana", "Lokasi", "Provinsi", "Tanggal", "Status", "Latitude", "Longitude"], ...filtered.map(x => [x.type, x.location, x.province, x.date, x.status, x.lat, x.lng])];
    const csv = "\uFEFF" + rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a"); link.href = url; link.download = `laporan-kejadian-bencana-${year}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  const maxProvince = Math.max(1, ...countByProvince.map(x => x.count));
  const maxType = Math.max(1, ...countByType.map(x => x.count));

  return <main className="lb-page">
    <div className="lb-topline"><div className="lb-breadcrumb">Data Kebencanaan <span>/</span> <strong>Laporan Kejadian Bencana</strong></div><div className="lb-live"><i /> <span>MONITORING BENCANA</span><b>DEMO UI</b></div></div>
    <header className="lb-hero">
      <div className="lb-brand-mark"><Glyph>⌁</Glyph></div>
      <div className="lb-heading"><div className="lb-eyebrow">SIMITI ENTERPRISE GIS <span>•</span> DISASTER INTELLIGENCE</div><h1>Laporan Kejadian Bencana</h1><p>Pusat analitik spasial untuk pemantauan, evaluasi, dan pelaporan kejadian bencana.</p></div>
      <div className="lb-toolbar"><label className="lb-year"><span>PERIODE</span><select value={year} onChange={e => setYear(e.target.value)} aria-label="Pilih tahun"><option>2026</option><option>2025</option><option>2024</option><option>2023</option></select></label><button className="lb-btn lb-btn-primary" onClick={exportCsv}><Glyph>↓</Glyph> Ekspor CSV</button><button className="lb-btn lb-btn-outline" onClick={() => window.print()}><Glyph>▤</Glyph> Cetak</button></div>
    </header>

    <section className="lb-filterbar"><div className="lb-filter-caption"><Glyph>☷</Glyph><div><strong>Filter analisis</strong><small>Persempit data di peta dan seluruh panel</small></div></div>
      <label><span>Jenis bencana</span><select value={kind} onChange={e => setKind(e.target.value)}><option>Semua jenis</option>{Object.keys(COLORS).map(k => <option key={k}>{k}</option>)}</select></label>
      <label><span>Provinsi</span><select value={province} onChange={e => setProvince(e.target.value)}><option>Semua provinsi</option>{provinces.map(p => <option key={p}>{p}</option>)}</select></label>
      <label><span>Status penanganan</span><select value={status} onChange={e => setStatus(e.target.value)}><option>Semua status</option><option>Tanggap Darurat</option><option>Pemantauan</option><option>Selesai</option></select></label>
      <label className="lb-search"><span>Pencarian</span><div><Glyph>⌕</Glyph><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari lokasi atau kejadian…" /></div></label>
      <button className="lb-reset" onClick={reset}><Glyph>↻</Glyph> Reset</button>
    </section>

    <section className="lb-kpi-grid">
      <article className="lb-kpi lb-kpi-primary"><div className="lb-kpi-top"><span>Total kejadian terfilter</span><i className="lb-kpi-icon">⌁</i></div><div className="lb-kpi-bottom"><strong>{fmt(totalFor(filtered))}</strong><span className="lb-kpi-note">titik pada hasil filter</span></div><div className="lb-kpi-foot"><span>●</span> Terhubung dengan filter aktif</div></article>
      {(["Banjir", "Longsor", "Karhutla", "Abrasi", "Kekeringan"] as DisasterKind[]).map(type => <article className="lb-kpi" key={type} style={{ "--accent": COLORS[type] } as React.CSSProperties}><div className="lb-kpi-top"><span>{type}</span><i className="lb-kpi-icon">{ICONS[type]}</i></div><div className="lb-kpi-bottom"><strong>{fmt(totalByType(type))}</strong><span className="lb-kpi-note">kejadian</span></div><div className="lb-kpi-meter"><i style={{ width: `${totalByType(type) / Math.max(1, filtered.length) * 100}%` }} /></div></article>)}
    </section>

    <section className="lb-status-strip"><div><span className="lb-status-dot urgent"/><span>Tanggap darurat</span><strong>{urgent}</strong></div><div><span className="lb-status-dot watch"/><span>Dalam pemantauan</span><strong>{watch}</strong></div><div><span className="lb-status-dot done"/><span>Selesai ditangani</span><strong>{done}</strong></div><div className="lb-status-context">Ringkasan status dari data yang sedang ditampilkan</div></section>

    <div className="lb-main-grid">
      <Panel title="Peta Sebaran Kejadian" subtitle="Eksplorasi spasial kejadian berdasarkan lokasi" className="lb-map-panel" action={<div className="lb-map-actions"><button className={mapType === "satellite" ? "active" : ""} onClick={() => setMapType("satellite")}>Satelit</button><button className={mapType === "street" ? "active" : ""} onClick={() => setMapType("street")}>Peta jalan</button></div>}>
        <div className="lb-map"><MapContainer center={[-2.4, 117.2]} zoom={4} minZoom={3} maxZoom={12} scrollWheelZoom className="lb-leaflet" zoomControl>
          {mapType === "street" ? <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /> : <TileLayer attribution='Tiles &copy; Esri' url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />}
          {filtered.map(item => <CircleMarker key={item.id} center={[item.lat, item.lng]} radius={7} pathOptions={{ color: "#fff", weight: 2, fillColor: COLORS[item.type], fillOpacity: .96 }}><Tooltip direction="top"><strong>{item.type}</strong><br />{item.location}, {item.province}<br />{item.date}<br />Status: {item.status}</Tooltip></CircleMarker>)}
        </MapContainer><div className="lb-map-legend"><strong>Legenda kejadian</strong>{(Object.entries(COLORS) as [DisasterKind, string][]).map(([label, color]) => <span key={label}><i style={{ background: color }} />{label}</span>)}</div><div className="lb-map-counter"><small>HASIL PETA</small><strong>{filtered.length} <span>titik</span></strong></div><div className="lb-map-scale">INDONESIA <span>•</span> {year}</div></div>
      </Panel>

      <Panel title="Komposisi Jenis Bencana" subtitle="Perbandingan kategori pada hasil filter" className="lb-type-panel" action={<span className="lb-panel-tag">{filtered.length} data</span>}>
        <div className="lb-type-chart">{countByType.slice().sort((a, b) => b.count - a.count).map(({ type, count }) => <div className="lb-type-row" key={type}><div className="lb-type-label"><span><i style={{ background: COLORS[type] }} />{type}</span><b>{fmt(count)}</b></div><div className="lb-track"><i style={{ width: `${count / maxType * 100}%`, background: COLORS[type] }} /></div></div>)}</div>
        <div className="lb-chart-foot"><span>Total hasil filter</span><strong>{fmt(filtered.length)} kejadian</strong></div><p className="lb-chart-note">Grafik dihitung dari daftar kejadian yang sedang difilter.</p>
      </Panel>

      <Panel title="Sebaran Wilayah" subtitle="Provinsi dengan jumlah kejadian terbanyak" className="lb-region-panel"><div className="lb-region-list">{countByProvince.length ? countByProvince.map((item, i) => <div className="lb-region" key={item.name}><div className="lb-region-line"><span><b>{String(i + 1).padStart(2, "0")}</b>{item.name}</span><strong>{item.count}</strong></div><div className="lb-track"><i style={{ width: `${item.count / maxProvince * 100}%` }} /></div></div>) : <div className="lb-empty">Tidak ada wilayah yang cocok dengan filter.</div>}</div><div className="lb-insight"><span className="lb-insight-icon"><Glyph>↗</Glyph></span><div><strong>Catatan analisis</strong><p>Gunakan filter wilayah dan jenis untuk mempersempit fokus pemantauan.</p></div></div></Panel>

      <Panel title="Tren Kejadian Bulanan" subtitle={`Profil tren visual · ${year}`} className="lb-trend-panel" action={<span className="lb-panel-tag">JAN — DES</span>}><TrendChart /><div className="lb-trend-legend"><span><i style={{ background: COLORS.Banjir }} />Banjir</span><span><i style={{ background: COLORS.Longsor }} />Longsor</span><span><i style={{ background: COLORS.Karhutla }} />Karhutla</span></div><div className="lb-demo-note">Ilustrasi tren statis — belum terhubung ke agregasi historis API.</div></Panel>

      <Panel title="Daftar Kejadian Bencana" subtitle={`${filtered.length} kejadian sesuai filter`} className="lb-table-panel" action={<button className="lb-text-btn" onClick={() => setShowAll(v => !v)}>{showAll ? "Ringkas" : "Lihat semua"} <span>{showAll ? "↑" : "→"}</span></button>}>
        <div className="lb-table-toolbar"><span><i /> Data kejadian terpilih</span><span>{filtered.length} baris</span></div><div className="lb-table-scroll"><table className="lb-table"><thead><tr><th>JENIS</th><th>LOKASI</th><th>TANGGAL</th><th>STATUS PENANGANAN</th></tr></thead><tbody>{(showAll ? filtered : filtered.slice(0, 5)).map(item => <tr key={item.id}><td><span className="lb-type-pill"><i style={{ background: COLORS[item.type] }} />{item.type}</span></td><td><strong>{item.location}</strong><small>{item.province}</small></td><td className="lb-date-cell">{item.date}</td><td><span className={`lb-status ${item.status === "Tanggap Darurat" ? "urgent" : item.status === "Selesai" ? "done" : "watch"}`}>{item.status}</span></td></tr>)}</tbody></table>{filtered.length === 0 && <div className="lb-empty">Tidak ada kejadian yang cocok. Coba ubah filter pencarian.</div>}</div>
      </Panel>
    </div>
    <footer className="lb-footer"><span><i /> SIMITI <b>ENTERPRISE GIS</b></span><span>Periode laporan: 1 Jan – 31 Des {year} <b>·</b> Data kejadian dan tren pada tampilan ini masih berupa contoh UI</span></footer>
  </main>;
}
