import React, { useMemo, useState } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./LaporanKejadianBencana.css";

type DisasterKind = "Banjir" | "Longsor" | "Karhutla" | "Abrasi" | "Kekeringan";
type Incident = {
  id: number;
  type: DisasterKind;
  location: string;
  province: string;
  date: string;
  status: "Tanggap Darurat" | "Pemantauan" | "Selesai";
  lat: number;
  lng: number;
};

const COLORS: Record<DisasterKind, string> = {
  Banjir: "#2878d0",
  Longsor: "#e58a25",
  Karhutla: "#e5484d",
  Abrasi: "#8b5cf6",
  Kekeringan: "#d5a21d",
};

const INCIDENTS: Incident[] = [
  { id: 1, type: "Banjir", location: "Kab. Demak", province: "Jawa Tengah", date: "08 Okt 2026", status: "Tanggap Darurat", lat: -6.89, lng: 110.64 },
  { id: 2, type: "Longsor", location: "Kab. Bandung Barat", province: "Jawa Barat", date: "08 Okt 2026", status: "Pemantauan", lat: -6.82, lng: 107.48 },
  { id: 3, type: "Karhutla", location: "Kab. Ketapang", province: "Kalimantan Barat", date: "07 Okt 2026", status: "Tanggap Darurat", lat: -1.85, lng: 109.97 },
  { id: 4, type: "Banjir", location: "Kota Banjarmasin", province: "Kalimantan Selatan", date: "07 Okt 2026", status: "Pemantauan", lat: -3.32, lng: 114.59 },
  { id: 5, type: "Kekeringan", location: "Kab. Lombok Timur", province: "Nusa Tenggara Barat", date: "06 Okt 2026", status: "Pemantauan", lat: -8.65, lng: 116.53 },
  { id: 6, type: "Abrasi", location: "Kab. Indramayu", province: "Jawa Barat", date: "06 Okt 2026", status: "Selesai", lat: -6.33, lng: 108.32 },
  { id: 7, type: "Longsor", location: "Kab. Agam", province: "Sumatera Barat", date: "05 Okt 2026", status: "Tanggap Darurat", lat: -0.28, lng: 100.17 },
  { id: 8, type: "Karhutla", location: "Kab. Kapuas", province: "Kalimantan Tengah", date: "04 Okt 2026", status: "Pemantauan", lat: -2.0, lng: 114.38 },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const TREND = [
  { month: "Jan", banjir: 68, longsor: 35, karhutla: 19 },
  { month: "Feb", banjir: 54, longsor: 28, karhutla: 15 },
  { month: "Mar", banjir: 72, longsor: 40, karhutla: 20 },
  { month: "Apr", banjir: 49, longsor: 31, karhutla: 23 },
  { month: "Mei", banjir: 43, longsor: 25, karhutla: 35 },
  { month: "Jun", banjir: 31, longsor: 19, karhutla: 51 },
  { month: "Jul", banjir: 28, longsor: 17, karhutla: 67 },
  { month: "Agu", banjir: 35, longsor: 21, karhutla: 78 },
  { month: "Sep", banjir: 42, longsor: 25, karhutla: 61 },
  { month: "Okt", banjir: 48, longsor: 30, karhutla: 42 },
  { month: "Nov", banjir: 0, longsor: 0, karhutla: 0 },
  { month: "Des", banjir: 0, longsor: 0, karhutla: 0 },
];

const fmt = (n: number) => new Intl.NumberFormat("id-ID").format(n);

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const paths: Record<string, React.ReactNode> = {
    shield: <><path d="M12 3 20 6v5c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6z" /><path d="m9 12 2 2 4-4" /></>,
    flood: <><path d="M3 7h18L12 3 3 7Z" /><path d="M5 11h14M3 15h18M5 19h14" /></>,
    mountain: <><path d="m3 20 7-13 4 7 2-3 5 9H3Z" /><path d="m8 11 2 2 2-2" /></>,
    fire: <><path d="M12 22c4 0 7-3 7-7 0-3-2-5-4-7 0 3-2 4-2 4 0-5-3-8-5-10 1 5-4 8-4 13 0 4 3 7 8 7Z" /><path d="M12 22c-2 0-3-2-3-4 0-1 1-3 2-4 0 2 3 2 3 5 0 2-1 3-2 3Z" /></>,
    waves: <><path d="M2 8c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" /><path d="M2 14c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" /><path d="M2 20c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    chart: <><path d="M3 3v18h18" /><path d="m7 14 4-4 4 3 5-7" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    refresh: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M5.5 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.5-3" /></>,
  };
  return <svg {...common}>{paths[name] ?? <circle cx="12" cy="12" r="8" />}</svg>;
}

function Panel({ title, subtitle, action, children, className = "" }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`lb-panel ${className}`}><header className="lb-panel-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</header><div className="lb-panel-body">{children}</div></section>;
}

function TrendChart() {
  const max = 90;
  const makePoints = (key: "banjir" | "longsor" | "karhutla") =>
    TREND.map((d, i) => `${20 + i * 58},${112 - (d[key] / max) * 92}`).join(" ");
  return <div className="lb-trend-wrap">
    <svg className="lb-trend-svg" viewBox="0 0 670 132" preserveAspectRatio="none" role="img" aria-label="Grafik tren kejadian per bulan">
      {[20, 48, 76, 104].map(y => <line key={y} x1="20" x2="660" y1={y} y2={y} stroke="#edf1f5" strokeDasharray="3 5" />)}
      <polyline points={makePoints("banjir")} fill="none" stroke={COLORS.Banjir} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={makePoints("longsor")} fill="none" stroke={COLORS.Longsor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={makePoints("karhutla")} fill="none" stroke={COLORS.Karhutla} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {(["banjir", "longsor", "karhutla"] as const).map((key, j) => TREND.map((d, i) => <circle key={`${key}-${i}`} cx={20 + i * 58} cy={112 - (d[key] / max) * 92} r="2.8" fill={[COLORS.Banjir, COLORS.Longsor, COLORS.Karhutla][j]} />))}
    </svg>
    <div className="lb-month-labels">{MONTHS.map(m => <span key={m}>{m}</span>)}</div>
  </div>;
}

export default function LaporanKejadianBencana() {
  const [year, setYear] = useState("2026");
  const [kind, setKind] = useState("Semua jenis");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Semua status");
  const [mapType, setMapType] = useState<"street" | "satellite">("street");

  const filteredIncidents = useMemo(() => INCIDENTS.filter(item =>
    (kind === "Semua jenis" || item.type === kind) &&
    (status === "Semua status" || item.status === status) &&
    `${item.location} ${item.province} ${item.type}`.toLowerCase().includes(search.toLowerCase())
  ), [kind, status, search]);

  const stats = [
    { label: "Total Kejadian", value: "1.326", change: "+14,5%", icon: "shield", color: "#07966a", bg: "#e5f7ef" },
    { label: "Banjir", value: "428", change: "+8,2%", icon: "flood", color: COLORS.Banjir, bg: "#e9f2ff" },
    { label: "Longsor", value: "214", change: "+6,4%", icon: "mountain", color: COLORS.Longsor, bg: "#fff3e5" },
    { label: "Karhutla", value: "356", change: "+27,0%", icon: "fire", color: COLORS.Karhutla, bg: "#fff0ef" },
    { label: "Abrasi", value: "98", change: "+3,8%", icon: "waves", color: COLORS.Abrasi, bg: "#f2edff" },
    { label: "Kekeringan", value: "230", change: "+12,1%", icon: "sun", color: COLORS.Kekeringan, bg: "#fff8df" },
  ];

  const byType = [
    { name: "Banjir", value: 428, color: COLORS.Banjir },
    { name: "Karhutla", value: 356, color: COLORS.Karhutla },
    { name: "Kekeringan", value: 230, color: COLORS.Kekeringan },
    { name: "Longsor", value: 214, color: COLORS.Longsor },
    { name: "Abrasi", value: 98, color: COLORS.Abrasi },
  ];
  const regions = [
    ["Jawa Tengah", 186], ["Jawa Barat", 142], ["Kalimantan Barat", 128], ["Jawa Timur", 116], ["NTB", 94],
  ] as const;
  const maxRegion = Math.max(...regions.map(r => r[1]));

  return <main className="lb-page">
    <div className="lb-topline"><div className="lb-breadcrumb">Data Kebencanaan <span>/</span> <strong>Laporan Kejadian Bencana</strong></div><div className="lb-live"><span /> DATA MONITORING <b>TERKINI</b></div></div>
    <header className="lb-hero">
      <div className="lb-title-icon"><Icon name="shield" size={24} /></div>
      <div className="lb-heading"><div className="lb-eyebrow">SIMITI · DISASTER INTELLIGENCE</div><h1>Laporan Kejadian Bencana</h1><p>Visualisasi kejadian bencana, tren temporal, dan sebaran wilayah Indonesia.</p></div>
      <div className="lb-toolbar">
        <label className="lb-select"><Icon name="calendar" size={15} /><select value={year} onChange={e => setYear(e.target.value)} aria-label="Pilih tahun"><option>2026</option><option>2025</option><option>2024</option><option>2023</option></select></label>
        <button className="lb-btn lb-btn-primary" onClick={() => window.print()}><Icon name="download" size={15} /> Ekspor Laporan</button>
      </div>
    </header>

    <div className="lb-filterbar">
      <div className="lb-filter-caption"><Icon name="search" size={15} /><span>FILTER DATA</span></div>
      <label><span>Jenis Bencana</span><select value={kind} onChange={e => setKind(e.target.value)}><option>Semua jenis</option>{Object.keys(COLORS).map(k => <option key={k}>{k}</option>)}</select></label>
      <label><span>Status Penanganan</span><select value={status} onChange={e => setStatus(e.target.value)}><option>Semua status</option><option>Tanggap Darurat</option><option>Pemantauan</option><option>Selesai</option></select></label>
      <label className="lb-search"><span>Cari lokasi</span><div><Icon name="search" size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nama kabupaten / provinsi..." /></div></label>
      <button className="lb-btn lb-btn-quiet" onClick={() => { setKind("Semua jenis"); setStatus("Semua status"); setSearch(""); }}><Icon name="refresh" size={14} /> Reset</button>
    </div>

    <section className="lb-kpi-grid">{stats.map(s => <article className="lb-kpi" key={s.label}><div className="lb-kpi-top"><span>{s.label}</span><i style={{ color: s.color, background: s.bg }}><Icon name={s.icon} size={17} /></i></div><div className="lb-kpi-bottom"><strong>{s.value}</strong><span className="lb-change">{s.change} <small>vs periode lalu</small></span></div></article>)}</section>

    <div className="lb-main-grid">
      <Panel title="Peta Sebaran Kejadian Bencana" subtitle="Distribusi titik kejadian di seluruh Indonesia" className="lb-map-panel" action={<div className="lb-map-actions"><button className={mapType === "street" ? "active" : ""} onClick={() => setMapType("street")}>Peta Jalan</button><button className={mapType === "satellite" ? "active" : ""} onClick={() => setMapType("satellite")}>Satelit</button></div>}>
        <div className="lb-map">
          <MapContainer center={[-2.4, 117.2]} zoom={4} minZoom={3} maxZoom={12} scrollWheelZoom className="lb-leaflet" zoomControl>
            {mapType === "street" ? <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /> : <TileLayer attribution='Tiles &copy; Esri' url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />}
            {filteredIncidents.map(item => <CircleMarker key={item.id} center={[item.lat, item.lng]} radius={7} pathOptions={{ color: "#fff", weight: 2, fillColor: COLORS[item.type], fillOpacity: .92 }}><Tooltip direction="top"><strong>{item.type}</strong><br />{item.location}, {item.province}<br />{item.date}</Tooltip></CircleMarker>)}
          </MapContainer>
          <div className="lb-map-legend"><strong>Jenis Kejadian</strong>{Object.entries(COLORS).map(([label, color]) => <span key={label}><i style={{ background: color }} />{label}</span>)}</div>
          <div className="lb-map-counter"><span>TERPILIH</span><strong>{filteredIncidents.length} <small>titik</small></strong></div>
        </div>
      </Panel>

      <Panel title="Jumlah Kejadian per Jenis" subtitle={`Ringkasan kategori · ${year}`}>
        <div className="lb-type-chart">{byType.map(item => <div className="lb-type-row" key={item.name}><div className="lb-type-label"><span><i style={{ background: item.color }} />{item.name}</span><b>{fmt(item.value)}</b></div><div className="lb-track"><i style={{ width: `${item.value / 428 * 100}%`, background: item.color }} /></div></div>)}</div>
        <div className="lb-chart-foot"><span><i /> Total tercatat</span><strong>1.326 kejadian</strong></div>
      </Panel>

      <Panel title="Sebaran per Provinsi" subtitle="5 wilayah dengan kejadian terbanyak">
        <div className="lb-region-list">{regions.map(([name, value], i) => <div className="lb-region" key={name}><div className="lb-region-line"><span><b>{String(i + 1).padStart(2, "0")}</b>{name}</span><strong>{fmt(value)}</strong></div><div className="lb-track"><i style={{ width: `${value / maxRegion * 100}%` }} /></div></div>)}</div>
        <div className="lb-insight"><span className="lb-insight-icon"><Icon name="chart" size={17} /></span><div><strong>Fokus pemantauan</strong><p>Prioritaskan pemantauan pada wilayah dengan frekuensi kejadian tinggi.</p></div></div>
      </Panel>

      <Panel title="Tren Kejadian Bencana" subtitle={`Perkembangan bulanan · ${year}`} className="lb-trend-panel" action={<span className="lb-period-tag">JAN — DES</span>}>
        <TrendChart />
        <div className="lb-trend-legend"><span><i style={{ background: COLORS.Banjir }} />Banjir</span><span><i style={{ background: COLORS.Longsor }} />Longsor</span><span><i style={{ background: COLORS.Karhutla }} />Karhutla</span></div>
      </Panel>

      <Panel title="Kejadian Terbaru" subtitle={`${filteredIncidents.length} kejadian dalam daftar`} className="lb-table-panel" action={<button className="lb-text-btn" onClick={() => { setKind("Semua jenis"); setStatus("Semua status"); setSearch(""); }}>Lihat semua <span>→</span></button>}>
        <div className="lb-table-scroll"><table className="lb-table"><thead><tr><th>JENIS</th><th>LOKASI</th><th>TANGGAL</th><th>STATUS</th></tr></thead><tbody>{filteredIncidents.slice(0, 6).map(item => <tr key={item.id}><td><span className="lb-type-pill"><i style={{ background: COLORS[item.type] }} />{item.type}</span></td><td><strong>{item.location}</strong><small>{item.province}</small></td><td>{item.date}</td><td><span className={`lb-status ${item.status === "Tanggap Darurat" ? "urgent" : item.status === "Selesai" ? "done" : "watch"}`}>{item.status}</span></td></tr>)}</tbody></table>{filteredIncidents.length === 0 && <div className="lb-empty">Tidak ada kejadian yang cocok dengan filter.</div>}</div>
      </Panel>
    </div>
    <footer className="lb-footer"><span><i /> SIMITI Disaster Intelligence Platform</span><span>Periode laporan: 1 Jan – 31 Des {year} <b>·</b> Data pada tampilan ini merupakan contoh UI</span></footer>
  </main>;
}
