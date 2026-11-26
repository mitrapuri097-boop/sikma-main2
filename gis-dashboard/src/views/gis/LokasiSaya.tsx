import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, BellRing, Building2, CalendarDays, CheckCircle2,
  ChevronRight, CloudSun, Compass, Crosshair, Droplets, Flame, Globe2,
  Info, LocateFixed, MapPin, Navigation, ShieldAlert, ShieldCheck,
  Sun, Thermometer, Wind, Waves, Mountain, LoaderCircle, RefreshCw
} from "lucide-react";
import L from "leaflet";
import { Circle, CircleMarker, MapContainer, Polyline, TileLayer, Marker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./LokasiSaya.css";

type RiskItem = { key: string; label: string; status: string; value: number; color: string };
type Incident = { id: number; title: string; type: string; distanceKm: number; image: string; coordinates: [number, number] };
type Mitigation = { name: string; address: string; type: string; distanceKm: number; etaMinutes: number; coordinates: [number, number] };
type AdminArea = { provinsi?: string | null; kabupaten?: string | null; kecamatan?: string | null; kelurahan?: string | null; desa?: string | null; das?: string | null };
type NearbyThreat = { key: string; label: string; status: string | null; level: number | null; distanceMeters: number | null; inside: boolean; source?: string };
type LocationProximity = { success: boolean; threats?: NearbyThreat[]; incidents?: Array<{ id: number | string; title?: string | null; category?: string | null; distanceMeters?: number | null; location?: string | null }>; source?: string };
type DashboardData = {
  demo: boolean;
  location: { latitude: number; longitude: number; accuracy: number; das: string; area: string };
  risk: { status: string; score: number; description: string; items: RiskItem[] };
  weather: { temperature: number; humidity: number; windSpeed: number; condition: string };
  incidents: Incident[];
  mitigation: Mitigation;
};

const API_BASE = String((import.meta as any).env?.VITE_API_URL || "").replace(/\/$/, "");
const INITIAL_POSITION: [number, number] = [-6.48752, 106.83521];

function MapFocus({ position }: { position: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(position, 14, { animate: true });
  }, [map, position]);
  useEffect(() => {
    const handleZoom = (event: Event) => {
      const step = (event as CustomEvent<number>).detail;
      if (step > 0) map.zoomIn();
      else map.zoomOut();
    };
    window.addEventListener("simiti-map-zoom", handleZoom);
    return () => window.removeEventListener("simiti-map-zoom", handleZoom);
  }, [map]);
  return null;
}

const fallbackData: DashboardData = {
  demo: true,
  location: { latitude: INITIAL_POSITION[0], longitude: INITIAL_POSITION[1], accuracy: 200, das: "Ciliwung", area: "Karadenan â€¢ Cibinong â€¢ Bogor â€¢ Jawa Barat" },
  risk: {
    status: "Waspada", score: 11, description: "Terdapat potensi risiko bencana di lokasi Anda.",
    items: [
      { key: "longsor", label: "Longsor", status: "Tinggi", value: 46, color: "#f97316" },
      { key: "banjir", label: "Banjir", status: "Sedang", value: 61, color: "#fbbf24" },
      { key: "banjir_bandang", label: "Banjir Bandang", status: "Rendah", value: 45, color: "#22c55e" },
      { key: "kekeringan", label: "Kekeringan", status: "Rendah", value: 45, color: "#84cc16" },
      { key: "karhutla", label: "Karhutla", status: "Sedang", value: 61, color: "#fbbf24" },
    ],
  },
  weather: { temperature: 29, humidity: 75, windSpeed: 10, condition: "Cerah berawan" },
  incidents: [
    { id: 1, title: "Banjir di wilayah permukiman", type: "Banjir", distanceKm: 1.9, image: "https://images.unsplash.com/photo-1547683905-f686c993aae5?w=240&q=75", coordinates: [-6.475, 106.842] },
    { id: 2, title: "Longsor pada akses jalan", type: "Longsor", distanceKm: 4.2, image: "https://images.unsplash.com/photo-1516937941344-00b4e0337589?w=240&q=75", coordinates: [-6.512, 106.819] },
  ],
  mitigation: { name: "Posko Siaga Bencana", address: "Jl. Raya Cibinong No. 123, Bogor", type: "Posko Siaga", distanceKm: 2.8, etaMinutes: 7, coordinates: [-6.469, 106.842] },
};

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

const LOCATION_STORAGE_KEY = "smiti.my-location.coordinates";

type SavedLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  savedAt: string;
};

function saveLocation(latitude: number, longitude: number, accuracy: number | null) {
  try {
    const payload: SavedLocation = {
      latitude, longitude, accuracy, savedAt: new Date().toISOString(),
    };
    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("[LokasiSaya] Gagal menyimpan koordinat GPS:", error);
  }
}

function loadSavedLocation(): SavedLocation | null {
  try {
    const raw = localStorage.getItem(LOCATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const latitude = Number(parsed?.latitude);
    const longitude = Number(parsed?.longitude);
    if (
      !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
    ) return null;
    const accuracyValue = Number(parsed?.accuracy);
    return {
      latitude, longitude,
      accuracy: Number.isFinite(accuracyValue) ? accuracyValue : null,
      savedAt: typeof parsed?.savedAt === "string" ? parsed.savedAt : "",
    };
  } catch (error) {
    console.warn("[LokasiSaya] Gagal membaca koordinat GPS tersimpan:", error);
    return null;
  }
}

export default function CekLokasiSaya() {
  const [data, setData] = useState<DashboardData>(fallbackData);
  const [position, setPosition] = useState<[number, number]>(() => {
    const saved = loadSavedLocation();
    return saved ? [saved.latitude, saved.longitude] : INITIAL_POSITION;
  });
  const [accuracy, setAccuracy] = useState<number | null>(() => loadSavedLocation()?.accuracy ?? null);
  const [loading, setLoading] = useState(false);
  const [gpsState, setGpsState] = useState<"idle" | "requesting" | "ready" | "error">(
    () => loadSavedLocation() ? "ready" : "idle"
  );
  const [gpsMessage, setGpsMessage] = useState(() => {
    const saved = loadSavedLocation();
    return saved
      ? `Koordinat GPS tersimpan${saved.savedAt ? ` • ${new Date(saved.savedAt).toLocaleString("id-ID")}` : ""}`
      : "Menunggu izin lokasi perangkat...";
  });
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [adminArea, setAdminArea] = useState<AdminArea | null>(null);
  const [nearbyThreats, setNearbyThreats] = useState<NearbyThreat[]>([]);
  const [proximityState, setProximityState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const loadDashboard = useCallback(async (lat: number, lng: number) => {
    setLoading(true);
    setProximityState("loading");
    const query = `latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}`;
    try {
      const [assessmentResponse, proximityResponse] = await Promise.all([
        fetch(`${API_BASE}/api/location-assessment?${query}`),
        fetch(`${API_BASE}/api/location-proximity?${query}&threatLimit=5&mitigationLimit=5&incidentLimit=5`),
      ]);

      if (assessmentResponse.ok) {
        const assessment = await assessmentResponse.json();
        if (assessment?.success) {
          const admin = assessment.location?.administrative || {};
          setAdminArea(admin);
          const risk = assessment.risk || {};
          setData((current) => ({
            ...current,
            location: {
              ...current.location, latitude: lat, longitude: lng,
              das: admin.das || current.location.das,
              area: [admin.kelurahan || admin.desa, admin.kecamatan, admin.kabupaten, admin.provinsi].filter(Boolean).join(" • ") || "Wilayah belum terpetakan",
            },
            risk: {
              ...current.risk,
              status: risk.status || current.risk.status,
              score: Number.isFinite(Number(risk.index)) ? Number(risk.index) : current.risk.score,
              description: assessment.recommendations?.[0]?.detail || current.risk.description,
            },
          }));
        }
      }

      if (!proximityResponse.ok) throw new Error(`API ancaman terdekat HTTP ${proximityResponse.status}`);
      const proximity: LocationProximity = await proximityResponse.json();
      if (!proximity?.success) throw new Error("Data ancaman terdekat tidak tersedia.");
      const threats = Array.isArray(proximity.threats) ? proximity.threats : [];
      setNearbyThreats(threats);
      setProximityState("ready");
      setData((current) => ({
        ...current,
        location: { ...current.location, latitude: lat, longitude: lng },
        incidents: (proximity.incidents || []).map((item, index) => ({
          id: Number(item.id) || index + 1,
          title: item.title || item.category || "Kejadian bencana",
          type: item.category || "Bencana",
          distanceKm: Number(item.distanceMeters || 0) / 1000,
          image: "",
          coordinates: [lat, lng],
        })),
      }));
      setLastUpdated(new Date());
    } catch (error) {
      setProximityState("error");
      setNearbyThreats([]);
      setGpsMessage(`GPS aktif, tetapi data wilayah/ancaman gagal dimuat: ${error instanceof Error ? error.message : "API tidak tersedia"}`);
      console.error("[LokasiSaya] Gagal memuat analisis koordinat:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = loadSavedLocation();
    if (saved) void loadDashboard(saved.latitude, saved.longitude);
  }, [loadDashboard]);

  const useCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsState("error");
      setGpsMessage("Browser tidak mendukung Geolocation API.");
      return;
    }

    setGpsState("requesting");
    setLoading(true);
    setGpsMessage("Mengambil koordinat GPS dengan akurasi tinggi...");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const latitude = Number(coords.latitude);
        const longitude = Number(coords.longitude);
        const gpsAccuracy = Number.isFinite(coords.accuracy) ? coords.accuracy : null;

        if (
          !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
          latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
        ) {
          setGpsState("error");
          setGpsMessage("Koordinat GPS tidak valid.");
          setLoading(false);
          return;
        }

        const next: [number, number] = [latitude, longitude];
        setPosition(next);
        setAccuracy(gpsAccuracy);
        setData((current) => ({
          ...current,
          location: {
            ...current.location,
            latitude,
            longitude,
            accuracy: gpsAccuracy ?? current.location.accuracy,
          },
        }));
        saveLocation(latitude, longitude, gpsAccuracy);
        setGpsState("ready");
        setGpsMessage(
          gpsAccuracy != null
            ? `GPS aktif • akurasi ±${Math.round(gpsAccuracy)} m • koordinat tersimpan`
            : "GPS aktif • koordinat tersimpan"
        );
        void loadDashboard(latitude, longitude);
      },
      (error) => {
        setGpsState("error");
        setLoading(false);
        setGpsMessage(
          error.code === 1
            ? "Izin lokasi ditolak. Aktifkan izin lokasi untuk situs ini."
            : error.code === 2
              ? "Lokasi perangkat tidak tersedia. Menggunakan koordinat tersimpan/contoh."
              : "Pengambilan GPS timeout. Silakan tekan Perbarui GPS."
        );
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
    );
  }, [loadDashboard]);

  // Pulihkan koordinat tersimpan melalui state awal, lalu minta GPS terbaru.
  useEffect(() => {
    useCurrentLocation();
  }, [useCurrentLocation]);

  const statusClass = data.risk.status.toLowerCase();
  const poskoIcon = useMemo(() => L.divIcon({
    className: "simiti-posko-marker",
    html: '<div class="simiti-posko-pin"><span>+</span></div>',
    iconSize: [34, 42],
    iconAnchor: [17, 38],
  }), []);

  return (
    <main className="simiti-location-page">
      <header className="simiti-location-topbar">
        <div className="simiti-brand">
          <div className="simiti-brand-globe"><Globe2 size={38} strokeWidth={1.6} /></div>
          <div><strong>SIMITI</strong><span>SPATIAL DECISION SUPPORT</span></div>
        </div>
        <div className="simiti-page-heading"><MapPin size={31} fill="currentColor" /><h1>Cek Lokasi Saya</h1></div>
        <div className="simiti-topbar-meta">
          <span className="simiti-online"><i /> Sistem Online</span>
          <span className="simiti-topbar-date"><CalendarDays size={18} /> {lastUpdated.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} WIB</span>
          <span className="simiti-user-avatar"><span>â—</span></span>
        </div>
      </header>

      <section className="simiti-location-grid">
        <article className="simiti-map-panel">
          <MapContainer center={position} zoom={14} zoomControl={false} scrollWheelZoom className="simiti-main-map">
            <TileLayer
              attribution='&copy; Esri'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
            <MapFocus position={position} />
            <Circle center={position} radius={200} pathOptions={{ color: "#31d9ff", fillColor: "#0ea5e9", fillOpacity: 0.22, weight: 2 }} />
            <CircleMarker center={position} radius={8} pathOptions={{ color: "#fff", weight: 3, fillColor: "#00d9ff", fillOpacity: 1 }} />
            <Marker position={data.mitigation.coordinates} icon={poskoIcon} />
            <Polyline positions={[position, data.mitigation.coordinates]} pathOptions={{ color: "#56ef36", weight: 5, opacity: .95 }} />
            {data.incidents.map((item) => <CircleMarker key={item.id} center={item.coordinates} radius={5} pathOptions={{ color: "#ff5b58", fillColor: "#ef4444", fillOpacity: .9 }} />)}
          </MapContainer>
          <div className="simiti-map-location-chip">
            <Crosshair size={24} /><div><b>{gpsState === "ready" ? "Lokasi GPS Anda" : "Koordinat Lokasi"}</b><span>{[adminArea?.kelurahan || adminArea?.desa, adminArea?.kecamatan, adminArea?.kabupaten, adminArea?.provinsi].filter(Boolean).join(" • ") || "Nama wilayah sedang dicari"}</span><span>{formatCoordinate(position[0])}, {formatCoordinate(position[1])} · EPSG:4326</span></div>
          </div>
          <div className="simiti-map-alerts">
            {nearbyThreats.length ? nearbyThreats.slice(0, 3).map((threat) => (
              <div className="simiti-map-alert danger" key={threat.key}>
                <AlertTriangle size={25} /><div><small>Ancaman terdekat · {threat.status || "Status belum tersedia"}</small><b>{threat.label} <em>{threat.inside ? "Titik berada di area ancaman" : threat.distanceMeters == null ? "Jarak tidak tersedia" : `${(threat.distanceMeters / 1000).toFixed(2).replace(".", ",")} km`}</em></b></div><ChevronRight />
              </div>
            )) : <div className="simiti-map-alert safe"><Info size={24} /><div><small>Ancaman terdekat</small><b>{proximityState === "loading" ? "Sedang menganalisis koordinat GPS..." : proximityState === "error" ? "Data ancaman belum dapat dimuat" : "Tidak ada ancaman terdekat yang dikembalikan API"}</b></div></div>}
          </div>
          <div className="simiti-map-zoom"><button onClick={() => window.dispatchEvent(new CustomEvent("simiti-map-zoom", { detail: 1 }))}>+</button><button onClick={() => window.dispatchEvent(new CustomEvent("simiti-map-zoom", { detail: -1 }))}>âˆ’</button><button title="Gunakan lokasi GPS" onClick={useCurrentLocation}><LocateFixed size={20} /></button></div>
          <div className="simiti-map-legend"><span><i className="gps-dot" /> Titik GPS</span><span><i className="radius-dot" /> Radius Â±200 m</span></div>
          <button className="simiti-gps-refresh" onClick={useCurrentLocation} disabled={loading}><LocateFixed size={16} /> {gpsState === "requesting" || loading ? "Mengambil GPS..." : "Perbarui GPS"}</button>
        </article>

        <article className="simiti-risk-panel">
          <div className="simiti-risk-summary">
            <div className="simiti-risk-emblem"><ShieldAlert size={68} /></div>
            <div className="simiti-risk-content"><h2>Status Risiko</h2><span>Sumber: SIMITI PostGIS</span><strong className={`simiti-risk-status ${statusClass}`}>{data.risk.status}</strong><p>{data.risk.description}</p></div>
          </div>
          <div className="simiti-risk-breakdown">
            <h3>Status per Jenis Risiko</h3>
            {data.risk.items.map((risk) => (
              <div className="simiti-risk-row" key={risk.key}>
                <span className={`simiti-risk-icon ${risk.key}`}>
                  {risk.key.includes("banjir") ? <Waves size={25} /> : risk.key === "longsor" ? <Mountain size={25} /> : risk.key === "karhutla" ? <Flame size={25} /> : <Sun size={25} />}
                </span>
                <span className="simiti-risk-label">{risk.label}</span>
                <span className="simiti-risk-track"><i style={{ width: `${risk.value}%`, background: risk.color }} /></span>
                <b className={`simiti-risk-pill ${risk.status.toLowerCase()}`}>{risk.status}</b>
              </div>
            ))}
            <div className="simiti-risk-note"><Info size={18} /> Status berdasarkan data dummy yang mencakup titik GPS.</div>
          </div>
        </article>
      </section>

      <section className="simiti-info-grid">
        <article className="simiti-info-card weather-card">
          <h3><CloudSun size={28} /> Cuaca Saat Ini</h3>
          <div className="simiti-weather-metrics">
            <div><Thermometer className="temperature" size={30} /><span>Suhu</span><b>{data.weather.temperature} Â°C</b></div>
            <div><Droplets size={30} /><span>Kelembapan</span><b>{data.weather.humidity} %</b></div>
            <div><Wind size={30} /><span>Kecepatan Angin</span><b>{data.weather.windSpeed} km/jam</b></div>
          </div>
        </article>
        <article className="simiti-info-card coordinate-card">
          <h3><MapPin size={27} fill="currentColor" /> Koordinat & Administrasi</h3>
          <dl>
            <div><dt>Latitude</dt><dd>: {formatCoordinate(position[0])}</dd></div>
            <div><dt>Longitude</dt><dd>: {formatCoordinate(position[1])}</dd></div>
            <div><dt>Akurasi GPS</dt><dd>: Â±{data.location.accuracy} meter</dd></div>
            <div><dt>Kelurahan/Desa</dt><dd>: {adminArea?.kelurahan || adminArea?.desa || "Belum tersedia"}</dd></div>
            <div><dt>Kecamatan</dt><dd>: {adminArea?.kecamatan || "Belum tersedia"}</dd></div>
            <div><dt>Kabupaten/Kota</dt><dd>: {adminArea?.kabupaten || "Belum tersedia"}</dd></div>
            <div><dt>Provinsi</dt><dd>: {adminArea?.provinsi || "Belum tersedia"}</dd></div>
            <div><dt>DAS</dt><dd>: {adminArea?.das || "Belum tersedia"}</dd></div>
          </dl>
          <small className="simiti-gps-message">{gpsMessage}</small>
        </article>
        <article className="simiti-info-card incident-card">
          <h3><BellRing size={27} /> Kejadian Terdekat</h3>
          <div className="simiti-incident-list">
            {data.incidents.map((item) => (
              <div className="simiti-incident-item" key={item.id}>
                {item.image ? <img src={item.image} alt="" /> : <span className="simiti-incident-placeholder"><AlertTriangle size={18} /></span>}<span>{item.title}</span><b>{item.distanceKm.toFixed(1).replace(".", ",")} km</b><ChevronRight size={20} />
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="simiti-mitigation-panel">
        <div className="simiti-mitigation-heading"><ShieldCheck size={31} /><h3>Mitigasi Terdekat</h3><span>REKOMENDASI</span></div>
        <div className="simiti-mitigation-body">
          <div className="simiti-mitigation-map">
            <div className="simiti-route-label"><Navigation size={20} /> Jarak: {data.mitigation.distanceKm.toFixed(1).replace(".", ",")} km <i /> Waktu: Â± {data.mitigation.etaMinutes} menit</div>
            <div className="simiti-route-mini"><span className="route-start" /><span className="route-line" /><span className="route-end"><MapPin size={27} fill="currentColor" /></span></div>
          </div>
          <div className="simiti-mitigation-detail">
            <Building2 size={48} />
            <div className="simiti-mitigation-text"><h4>{data.mitigation.name}</h4><p>Alamat <b>: {data.mitigation.address}</b></p><p>Koordinat <b>: {data.mitigation.coordinates.map(formatCoordinate).join(", ")}</b></p><p>Jenis <b>: {data.mitigation.type}</b></p></div>
            <button onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${data.mitigation.coordinates.join(",")}`, "_blank", "noopener,noreferrer")}><Navigation size={20} fill="currentColor" /> Lihat Rute</button>
          </div>
        </div>
      </section>
      <footer className="simiti-location-footer"><span><i /> GPS AKTIF Â· DATA API SIMITI</span><span>Terakhir diperbarui {lastUpdated.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} WIB</span></footer>
    </main>
  );
}

