import React, { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CloudRain,
  Database,
  Download,
  Droplets,
  Gauge,
  Layers3,
  Map,
  MapPin,
  Maximize2,
  Menu,
  Navigation,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Siren,
  Target,
  TrendingUp,
  Waves,
  Wind,
  X,
  Zap,
} from "lucide-react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Polygon,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

type RiskLevel = "Rendah" | "Sedang" | "Tinggi" | "Sangat Tinggi";
type Status = "Terpantau" | "Waspada" | "Siaga";

type RiskArea = {
  name: string;
  risk: RiskLevel;
  probability: number;
  area: string;
  depth: string;
  incidents: number;
  confidence: number;
  status: Status;
  trend: number;
  response: string;
  center: [number, number];
};

const riskAreas: RiskArea[] = [
  { name: "Pancoran", risk: "Sangat Tinggi", probability: 86, area: "0,84 km²", depth: "30–80 cm", incidents: 7, confidence: 84, status: "Siaga", trend: 17, response: "Aktifkan monitoring lapangan", center: [-6.2535, 106.8446] },
  { name: "Tebet", risk: "Tinggi", probability: 72, area: "1,12 km²", depth: "20–60 cm", incidents: 5, confidence: 81, status: "Waspada", trend: 9, response: "Siapkan jalur evakuasi", center: [-6.2267, 106.8583] },
  { name: "Mampang Prapatan", risk: "Tinggi", probability: 68, area: "0,76 km²", depth: "20–50 cm", incidents: 4, confidence: 79, status: "Waspada", trend: 2, response: "Perketat pemantauan", center: [-6.2518, 106.8140] },
  { name: "Pasar Minggu", risk: "Sedang", probability: 49, area: "1,35 km²", depth: "10–30 cm", incidents: 3, confidence: 74, status: "Terpantau", trend: -3, response: "Monitoring rutin", center: [-6.2850, 106.8440] },
  { name: "Jagakarsa", risk: "Sedang", probability: 43, area: "0,91 km²", depth: "10–25 cm", incidents: 2, confidence: 71, status: "Terpantau", trend: -5, response: "Monitoring rutin", center: [-6.3260, 106.8310] },
];

const monthlyRainfall = [360, 254, 188, 162, 118, 70, 56, 92, 118, 170, 220, 225];
const prediction = [210, 225, 190, 92, 88, 55, 42, 72, 98, 150, 205, 194];
const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const riskColors: Record<RiskLevel, string> = {
  Rendah: "#f6c744",
  Sedang: "#f59e0b",
  Tinggi: "#f97316",
  "Sangat Tinggi": "#dc2626",
};

const riskBadge: Record<RiskLevel, string> = {
  Rendah: "bg-amber-50 text-amber-700",
  Sedang: "bg-amber-50 text-amber-700",
  Tinggi: "bg-orange-50 text-orange-700",
  "Sangat Tinggi": "bg-red-50 text-red-700",
};

function Recenter({ center }: { center: [number, number] }) {
  const map = useMap();
  React.useEffect(() => {
    map.flyTo(center, 12.7, { duration: 0.7 });
  }, [center, map]);
  return null;
}

export default function EwsBanjir() {
  const [selectedLocation, setSelectedLocation] = useState("Kecamatan Pancoran");
  const [mapMode, setMapMode] = useState<"prediction" | "history">("prediction");
  const [refreshing, setRefreshing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showLayers, setShowLayers] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const selectedRisk = useMemo(() => {
    const name = selectedLocation.replace("Kecamatan ", "");
    return riskAreas.find((item) => item.name === name) ?? riskAreas[0];
  }, [selectedLocation]);

  const highRiskCount = riskAreas.filter((item) => item.risk === "Tinggi" || item.risk === "Sangat Tinggi").length;

  const handleRefresh = () => {
    setRefreshing(true);
    window.setTimeout(() => setRefreshing(false), 900);
  };

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-[#10233f]">
      <Topbar onRefresh={handleRefresh} refreshing={refreshing} onMenu={() => setSidebarOpen((v) => !v)} />
      <Sidebar open={sidebarOpen} />

      <main className="ml-0 min-h-[calc(100vh-68px)] pt-[68px] lg:ml-[224px]">
        <div className="px-3 py-3 sm:px-4 lg:px-5">
          <PageHeader />

          <div className="mt-3 grid gap-3 xl:grid-cols-[275px_minmax(0,1fr)_320px]">
            <LeftInformation selectedRisk={selectedRisk} selectedLocation={selectedLocation} setSelectedLocation={setSelectedLocation} />

            <section className={`overflow-hidden rounded-lg border border-[#dfe7f0] bg-white shadow-[0_2px_12px_rgba(25,55,90,.06)] ${fullscreen ? "fixed inset-3 z-[100]" : ""}`}>
              <div className="relative h-[520px] overflow-hidden sm:h-[570px]">
                <MapContainer center={selectedRisk.center} zoom={12.7} zoomControl={false} className="h-full w-full">
                  <TileLayer
                    attribution="© Esri"
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  />
                  <Recenter center={selectedRisk.center} />
                  <Polyline positions={[[ -6.205, 106.77 ], [ -6.235, 106.82 ], [ -6.27, 106.85 ], [ -6.32, 106.87 ]]} pathOptions={{ color: "#1688ff", weight: 4, opacity: 0.9 }} />
                  <Polygon positions={[[ -6.242,106.828 ],[-6.225,106.847],[-6.237,106.875],[-6.274,106.878],[-6.289,106.853],[-6.276,106.828 ]] as [number,number][]} pathOptions={{ color: "#ef4444", weight: 2, fillColor: "#ef4444", fillOpacity: mapMode === "prediction" ? 0.42 : 0.20 }} />
                  <Polygon positions={[[ -6.218,106.786 ],[-6.204,106.807],[-6.218,106.831],[-6.245,106.827],[-6.252,106.801],[-6.24,106.78 ]] as [number,number][]} pathOptions={{ color: "#f97316", weight: 1.5, fillColor: "#f97316", fillOpacity: 0.36 }} />
                  <Polygon positions={[[ -6.277,106.815 ],[-6.266,106.841],[-6.285,106.861],[-6.315,106.853],[-6.321,106.826],[-6.307,106.808 ]] as [number,number][]} pathOptions={{ color: "#f59e0b", weight: 1.5, fillColor: "#f59e0b", fillOpacity: 0.30 }} />
                  {riskAreas.map((area) => (
                    <Circle key={area.name} center={area.center} radius={mapMode === "prediction" ? 650 : 450} pathOptions={{ color: riskColors[area.risk], fillColor: riskColors[area.risk], fillOpacity: area.name === selectedRisk.name ? 0.28 : 0.13, weight: area.name === selectedRisk.name ? 3 : 1 }}>
                      <Tooltip direction="top" offset={[0, -8]} permanent={area.name === selectedRisk.name}>{area.name}</Tooltip>
                    </Circle>
                  ))}
                  <CircleMarker center={selectedRisk.center} radius={9} pathOptions={{ color: "white", weight: 4, fillColor: "#ef4444", fillOpacity: 1 }} />
                </MapContainer>

                <div className="absolute left-3 top-3 z-[500] flex max-w-[calc(100%-24px)] flex-wrap items-center gap-4 rounded-lg border border-white/70 bg-white/95 px-4 py-2 text-[10px] font-medium shadow-lg backdrop-blur">
                  <LegendItem color="bg-red-500" label="Area Rawan Banjir (Prediksi)" />
                  <LegendItem color="bg-blue-500" label="Area Banjir Historis" />
                  <LegendLine color="bg-blue-500" label="Sungai" />
                  <LegendDashed label="Batas Wilayah" />
                </div>

                {showLayers && (
                  <div className="absolute right-3 top-3 z-[500] w-[170px] rounded-lg border border-white/70 bg-white/95 p-3 shadow-lg backdrop-blur">
                    <div className="mb-2 text-[11px] font-extrabold">Lapisan Peta</div>
                    <LayerToggle label="Prediksi Banjir (Thn Depan)" checked />
                    <LayerToggle label="Area Banjir Historis" checked />
                    <LayerToggle label="Curah Hujan" />
                    <LayerToggle label="Batas Administrasi" checked />
                    <LayerToggle label="Sungai" checked />
                  </div>
                )}

                <div className="absolute left-3 top-[86px] z-[500] flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                  <button className="grid h-9 w-9 place-items-center border-b border-slate-200 text-lg hover:bg-slate-50">+</button>
                  <button className="grid h-9 w-9 place-items-center text-lg hover:bg-slate-50">−</button>
                  <button className="grid h-9 w-9 place-items-center border-t border-slate-200 hover:bg-slate-50"><Navigation size={14} /></button>
                </div>

                <div className="absolute bottom-4 left-4 z-[500] rounded-lg bg-white/95 p-3 shadow-lg backdrop-blur">
                  <div className="text-[10px] font-extrabold">{selectedRisk.name}</div>
                  <div className="mt-1 text-[9px] text-slate-500">Peluang terjadinya banjir: <b className="text-slate-800">{selectedRisk.probability}%</b></div>
                  <div className="text-[9px] text-slate-500">Estimasi kedalaman: <b className="text-slate-800">{selectedRisk.depth}</b></div>
                  <div className="text-[9px] text-slate-500">Periode: <b className="text-slate-800">Des 2026 – Feb 2027</b></div>
                </div>

                <div className="absolute bottom-3 right-3 z-[500] flex items-center gap-2 rounded-md bg-white/90 px-2 py-1 text-[8px] text-slate-600 shadow">
                  <span className="font-semibold">Map source</span><span>Esri World Imagery</span>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 bg-white px-3 py-2">
                <div className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
                  <MapModeButton active={mapMode === "prediction"} onClick={() => setMapMode("prediction")}>Prediksi</MapModeButton>
                  <MapModeButton active={mapMode === "history"} onClick={() => setMapMode("history")}>Historis</MapModeButton>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowLayers((v) => !v)} className="rounded-md border border-slate-200 px-2 py-1.5 text-[9px] font-bold text-slate-600"><Layers3 size={13} /></button>
                  <button onClick={() => setFullscreen((v) => !v)} className="rounded-md border border-slate-200 px-2 py-1.5 text-[9px] font-bold text-slate-600">{fullscreen ? <X size={13} /> : <Maximize2 size={13} />}</button>
                </div>
              </div>
            </section>

            <PredictionPanel selectedRisk={selectedRisk} />
          </div>

          <div className="mt-3 grid gap-3 xl:grid-cols-3">
            <ChartCard title="Data Curah Hujan" icon={CloudRain} badge="Historis">
              <BarChart values={monthlyRainfall} />
            </ChartCard>
            <ChartCard title="Prediksi Curah Hujan (Tahun Depan)" icon={CloudRain} badge="Prediksi">
              <LineChart values={prediction} dashed />
            </ChartCard>
            <RiskMapCard selectedRisk={selectedRisk} />
          </div>
        </div>
      </main>
    </div>
  );
}

function Topbar({ onRefresh, refreshing, onMenu }: { onRefresh: () => void; refreshing: boolean; onMenu: () => void }) {
  return <header className="fixed left-0 right-0 top-0 z-[900] h-[68px] bg-[#09213b] text-white shadow-lg">
    <div className="flex h-full items-center">
      <div className="flex h-full w-[224px] shrink-0 items-center gap-3 border-r border-white/10 px-5">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-lg"><span className="text-xl font-black">◇</span></div>
        <div><div className="text-[17px] font-black tracking-tight">SIMITI GIS</div><div className="text-[9px] text-slate-300">Sistem Informasi Manajemen Risiko Bencana</div></div>
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-between px-3 sm:px-5">
        <button onClick={onMenu} className="mr-2 grid h-9 w-9 place-items-center rounded-md bg-white/10 lg:hidden"><Menu size={18} /></button>
        <div className="hidden h-9 w-[390px] items-center gap-2 rounded-md bg-white/10 px-3 text-[10px] text-slate-300 md:flex"><Search size={15} />Cari lokasi, kecamatan, atau koordinat...</div>
        <div className="ml-auto flex items-center gap-4">
          <button className="relative"><Bell size={18} /><span className="absolute -right-2 -top-2 grid h-4 w-4 place-items-center rounded-full bg-red-500 text-[8px] font-black">3</span></button>
          <Settings size={18} className="hidden sm:block" />
          <div className="hidden items-center gap-2 sm:flex"><div className="grid h-9 w-9 place-items-center rounded-full bg-slate-200 text-slate-500">●</div><div className="leading-tight"><div className="text-[10px] font-bold">Administrator</div><div className="text-[8px] text-slate-300">Operator Pusdalops</div></div><ChevronDown size={13} /></div>
        </div>
      </div>
    </div>
  </header>;
}

function Sidebar({ open }: { open: boolean }) {
  const items = [
    { icon: Map, label: "Beranda" },
    { icon: Map, label: "Peta Interaktif", chevron: true },
    { icon: Siren, label: "EWS - Banjir", active: true, chevron: true },
    { icon: ShieldAlert, label: "Kerawanan", chevron: true },
    { icon: AlertTriangle, label: "Kejadian", chevron: true },
    { icon: Layers3, label: "Data & Layer", chevron: true },
    { icon: Download, label: "Laporan", chevron: true },
    { icon: Settings, label: "Pengaturan", chevron: true },
  ];
  return <aside className={`fixed bottom-0 left-0 top-[68px] z-[850] w-[224px] bg-[#061d34] text-white shadow-xl transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
    <nav className="px-2 py-3">
      {items.map((item) => <div key={item.label}>
        <div className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-[12px] font-semibold ${item.active ? "bg-[#0878ee] shadow-lg" : "text-slate-200 hover:bg-white/5"}`}>
          <item.icon size={17} /><span className="flex-1">{item.label}</span>{item.chevron && <ChevronDown size={14} />}
        </div>
        {item.active && <div className="ml-4 border-l border-white/10 py-1.5 pl-3"><SubItem label="Monitoring" /><SubItem label="Prediksi Banjir" badge="Baru" /><SubItem label="Riwayat Banjir" /></div>}
      </div>)}
    </nav>
    <div className="absolute bottom-[124px] left-4 right-4 rounded-lg border border-white/5 bg-[#0b2a49] p-3">
      <div className="flex items-center gap-2 text-[10px] font-bold"><span className="h-2 w-2 rounded-full bg-emerald-400" />Sistem Online</div>
      <div className="mt-2 text-[8px] text-slate-300">Terakhir diperbarui</div><div className="mt-0.5 text-[9px] font-bold">4 Sep 2026, 13:45 WIB</div>
    </div>
    <div className="absolute bottom-5 left-4 text-[9px] text-slate-300"><b className="text-white">SIMITI GIS v2.0</b><br />© 2026. Semua hak dilindungi.</div>
  </aside>;
}

function SubItem({ label, badge }: { label: string; badge?: string }) { return <div className="flex items-center gap-2 py-2 text-[10px] text-slate-300"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" />{label}{badge && <span className="ml-auto rounded-full bg-emerald-400 px-2 py-0.5 text-[7px] font-black text-white">{badge}</span>}</div>; }

function PageHeader() { return <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
  <div className="flex items-start gap-3"><button className="mt-1 grid h-10 w-10 place-items-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm"><ChevronLeft size={18} /></button><div><h1 className="text-[22px] font-black tracking-tight text-[#10233f]">EWS - Banjir</h1><p className="text-[11px] text-slate-500">Analisis historis, data curah hujan, dan prediksi banjir berdasarkan analisis spasial dan temporal.</p></div></div>
  <div className="flex items-center gap-2"><div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-right shadow-sm"><div className="flex items-center gap-2 text-[9px] text-slate-500"><CalendarDays size={13} /><span>04 Sep 2026</span></div><div className="text-[9px] font-bold">13:45 WIB</div></div><button className="flex items-center gap-2 rounded-md bg-[#0878ee] px-4 py-2.5 text-[10px] font-black text-white shadow-sm"><Download size={14} />Unduh Laporan</button></div>
</div>; }

function LeftInformation({ selectedRisk, selectedLocation, setSelectedLocation }: { selectedRisk: RiskArea; selectedLocation: string; setSelectedLocation: (v: string) => void }) {
  return <div className="space-y-3">
    <InfoCard title="Lokasi Analisis" icon={MapPin} action="Ubah Lokasi">
      <select value={selectedLocation} onChange={(e) => setSelectedLocation(e.target.value)} className="w-full bg-transparent text-[12px] font-black outline-none"><option>Kecamatan Pancoran</option><option>Kecamatan Tebet</option><option>Kecamatan Mampang Prapatan</option><option>Kecamatan Pasar Minggu</option><option>Kecamatan Jagakarsa</option></select>
      <div className="mt-1 text-[10px] font-medium text-slate-500">Kota Administrasi Jakarta Selatan, DKI Jakarta</div><div className="mt-3 flex items-center gap-2 text-[10px] text-slate-600"><Navigation size={13} />-6.2367, 106.8246</div>
    </InfoCard>
    <InfoCard title="Data Historis Banjir" icon={Waves}><InfoRow label="Tahun Terakhir" value="3 kejadian" /><InfoRow label="Kejadian Tertinggi" value="12 Januari 2024" /><InfoRow label="Tinggi Muka Air Maks" value="120 cm" /><InfoRow label="Durasi Terlama" value="3 hari" /></InfoCard>
    <InfoCard title="Data Curah Hujan (Historis)" icon={CloudRain}><InfoRow label="Rata-rata (5 tahun terakhir)" value="182 mm/bulan" /><InfoRow label="Tertinggi (record)" value="384 mm (Jan 2020)" /></InfoCard>
    <InfoCard title="Prediksi Curah Hujan (Tahun Depan)" icon={CalendarDays}><InfoRow label="Total Prediksi Tahunan" value="2.340 mm" /><InfoRow label="Puncak Musim Hujan" value="Des 2026 – Feb 2027" /></InfoCard>
  </div>;
}

function PredictionPanel({ selectedRisk }: { selectedRisk: RiskArea }) {
  return <div className="space-y-3">
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_2px_12px_rgba(25,55,90,.06)]"><div className="flex items-center gap-2 text-[12px] font-black"><TrendingUp size={17} className="text-blue-600" />Ringkasan Prediksi</div>
      <div className="mt-4 rounded-lg bg-red-50 p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-full bg-red-100 text-red-600"><Siren size={22} /></div><div><div className="text-[25px] font-black leading-none text-red-600">{selectedRisk.probability}%</div><div className="mt-1 text-[10px] font-semibold text-red-600">Peluang Terjadi Banjir</div></div></div><span className="rounded-full bg-red-100 px-2 py-1 text-[9px] font-black text-red-600">{selectedRisk.risk === "Sangat Tinggi" ? "Sangat Tinggi" : selectedRisk.risk}</span></div></div>
      <div className="divide-y divide-slate-100"><Metric icon={Droplets} label="Perkiraan Kedalaman" value={selectedRisk.depth} /><Metric icon={CalendarDays} label="Perkiraan Waktu Kejadian" value="Des 2026 – Feb 2027" /><Metric icon={Map} label="Luas Area Terdampak (prediksi)" value="± 2,4 km²" /></div>
    </div>
    <div className="rounded-lg border border-blue-100 bg-[#eaf5ff] p-4"><div className="flex items-center gap-2 text-[12px] font-black text-[#16385d]"><Zap size={17} className="text-blue-600" />Rekomendasi</div><ul className="mt-3 space-y-2 pl-4 text-[10px] leading-relaxed text-[#284d72]"><li className="list-disc">Tingkatkan kesiapsiagaan infrastruktur drainase.</li><li className="list-disc">Siapkan posko dan jalur evakuasi di area rawan.</li><li className="list-disc">Monitoring curah hujan secara <u>real-time</u>.</li></ul></div>
  </div>;
}

function InfoCard({ title, icon: Icon, action, children }: { title: string; icon: React.ElementType; action?: string; children: React.ReactNode }) { return <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-[0_2px_12px_rgba(25,55,90,.05)]"><div className="mb-3 flex items-center gap-2"><Icon size={16} className="text-blue-600" /><span className="text-[11px] font-black">{title}</span>{action && <button className="ml-auto rounded-md border border-blue-200 px-2 py-1 text-[8px] font-bold text-blue-600">{action}</button>}<ChevronUp /></div>{children}</div>; }
function ChevronUp() { return <ChevronDown size={14} className="ml-auto rotate-180 text-slate-400" />; }
function InfoRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-3 py-1.5 text-[9px]"><span className="text-slate-500">{label}</span><b className="text-right text-slate-700">{value}</b></div>; }
function Metric({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) { return <div className="flex items-center gap-3 py-4"><Icon size={18} className="text-slate-400" /><div><div className="text-[9px] text-slate-500">{label}</div><div className="mt-1 text-[11px] font-black text-slate-800">{value}</div></div></div>; }
function LegendItem({ color, label }: { color: string; label: string }) { return <div className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${color}`} />{label}</div>; }
function LegendLine({ color, label }: { color: string; label: string }) { return <div className="flex items-center gap-1.5"><span className={`h-0.5 w-4 ${color}`} />{label}</div>; }
function LegendDashed({ label }: { label: string }) { return <div className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-slate-500" />{label}</div>; }
function LayerToggle({ label, checked }: { label: string; checked?: boolean }) { return <label className="mb-2 flex items-start gap-2 text-[8px] font-medium text-slate-700 last:mb-0"><input type="checkbox" defaultChecked={checked} className="mt-0.5 accent-blue-600" /><span>{label}</span></label>; }
function MapModeButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) { return <button onClick={onClick} className={`rounded px-3 py-1.5 text-[9px] font-black ${active ? "bg-blue-600 text-white shadow-sm" : "text-slate-500"}`}>{children}</button>; }

function ChartCard({ title, icon: Icon, badge, children }: { title: string; icon: React.ElementType; badge: string; children: React.ReactNode }) { return <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_2px_12px_rgba(25,55,90,.05)]"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Icon size={17} className="text-blue-600" /><h2 className="text-[12px] font-black">{title}</h2></div><span className="rounded-md border border-slate-200 px-2 py-1 text-[8px] font-bold text-slate-500">{badge}</span></div><div className="mt-3 h-[190px]">{children}</div></div>; }

function BarChart({ values }: { values: number[] }) { const max = 400; return <div className="relative h-full"><div className="absolute inset-0 flex flex-col justify-between text-[8px] text-slate-400"><span>400</span><span>300</span><span>200</span><span>100</span><span>0</span></div><div className="ml-7 h-[155px] border-b border-l border-slate-200"><div className="grid h-full grid-cols-12 items-end gap-2 px-2">{values.map((v, i) => <div key={i} className="relative flex h-full items-end"><div className="w-full rounded-t-sm bg-blue-500/80" style={{ height: `${(v / max) * 100}%` }} /></div>)}</div><div className="pointer-events-none absolute left-8 right-1 top-[76px] border-t border-dashed border-blue-700/70" /></div><div className="ml-7 mt-2 grid grid-cols-12 gap-2 px-2 text-[8px] font-bold text-slate-400">{months.map((m) => <span key={m} className="text-center">{m}</span>)}</div><div className="ml-7 mt-2 flex items-center justify-center gap-5 text-[8px] text-slate-500"><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-blue-500" />Curah Hujan (mm)</span><span className="flex items-center gap-1"><i className="w-4 border-t border-dashed border-blue-700" />Rata-rata 5 Tahun</span></div></div>; }

function LineChart({ values, dashed }: { values: number[]; dashed?: boolean }) { const width = 600, height = 145, max = 400; const points = values.map((v, i) => `${(i / 11) * width},${height - (v / max) * height}`).join(" "); return <div className="h-full"><svg viewBox={`0 0 ${width} ${height}`} className="h-[155px] w-full" preserveAspectRatio="none"><line x1="0" y1="0" x2={width} y2="0" stroke="#e8edf3" /><line x1="0" y1="48" x2={width} y2="48" stroke="#e8edf3" /><line x1="0" y1="96" x2={width} y2="96" stroke="#e8edf3" /><line x1="0" y1="145" x2={width} y2="145" stroke="#e8edf3" /><polyline points={points} fill="none" stroke="#0878ee" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dashed ? undefined : "7 6"} />{values.map((v,i)=><circle key={i} cx={(i/11)*width} cy={height-(v/max)*height} r="2.7" fill="#0878ee" />)}</svg><div className="grid grid-cols-12 text-[8px] font-bold text-slate-400">{months.map(m=><span key={m} className="text-center">{m}</span>)}</div><div className="mt-2 flex justify-center gap-5 text-[8px] text-slate-500"><span className="flex items-center gap-1"><i className="w-4 border-t-2 border-blue-600" />Prediksi 2026/2027</span><span className="flex items-center gap-1"><i className="w-4 border-t-2 border-dashed border-blue-600" />Rata-rata Historis</span></div></div>; }

function RiskMapCard({ selectedRisk }: { selectedRisk: RiskArea }) { return <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_2px_12px_rgba(25,55,90,.05)]"><div className="flex items-center gap-2"><Map size={17} className="text-blue-600" /><h2 className="text-[12px] font-black">Peta Prediksi Banjir (Tahun Depan)</h2></div><div className="mt-3 grid grid-cols-[1fr_118px] gap-3"><div className="relative h-[185px] overflow-hidden rounded-lg bg-slate-700"><div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(34,197,94,.45),transparent_25%),radial-gradient(circle_at_70%_65%,rgba(16,185,129,.35),transparent_30%),linear-gradient(135deg,#1f4d43,#426b59)]" /><div className="absolute left-[28%] top-[20%] h-24 w-24 rotate-12 rounded-[50%] bg-red-500/65" /><div className="absolute left-[48%] top-[42%] h-20 w-20 rounded-[45%] bg-orange-400/65" /><div className="absolute left-[58%] top-[18%] h-12 w-16 rounded-[45%] bg-amber-300/70" /><div className="absolute left-[42%] top-[53%] h-2 w-2 rounded-full bg-white ring-4 ring-red-500/50" /><span className="absolute left-[44%] top-[58%] rounded bg-white px-2 py-1 text-[8px] font-black shadow">{selectedRisk.name}</span></div><div className="rounded-lg border border-slate-200 p-3"><div className="text-[9px] font-black">Tingkat Risiko</div><div className="mt-3 space-y-3">{Object.keys(riskColors).map((r) => <div key={r} className="flex items-center gap-2 text-[8px] text-slate-600"><span className="h-3 w-3 rounded-sm" style={{ background: riskColors[r as RiskLevel] }} />{r}</div>)}</div><button className="mt-4 w-full rounded-md bg-blue-600 py-2 text-[8px] font-black text-white">Lihat Detail Peta →</button></div></div></div>; }
