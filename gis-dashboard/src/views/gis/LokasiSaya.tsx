import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, BellRing, CalendarDays, ChevronRight, CloudSun,
  Crosshair, Flame, Globe2, Info, LocateFixed, MapPin, ShieldAlert,
  ShieldCheck, Sun, Waves, Mountain
} from "lucide-react";
import { Circle, CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./LokasiSaya.css";

type RiskItem = { key: string; label: string; status: string; value: number | null; color: string; source?: string };
type AdminArea = { provinsi?: string | null; kabupaten?: string | null; kecamatan?: string | null; kelurahan?: string | null; desa?: string | null; das?: string | null };
type GovernmentAlert = { id: string; event: string; headline: string; area: string; description: string; effective: string | null; expires: string | null; source: string; url?: string | null };
type MitigationItem = { title: string; detail: string; priority: string; source: string; hazard: string };
type NearbyThreat = { key?: string; label?: string; status?: string; score?: number | null; distanceMeters?: number | null; inside?: boolean; source?: string };
type NearbyMitigation = { id: string; layerId?: string; layerName: string; title: string; type?: string | null; latitude?: number | null; longitude?: number | null; distanceMeters?: number | null; source?: string };
type EvacuationRoute = { destination: NearbyMitigation; coordinates: [number, number][]; distanceMeters: number; durationSeconds: number; status: "loading" | "ready" | "error"; message?: string };
type DashboardData = {
  risk: { status: string; score: number | null; description: string; items: RiskItem[] };
};

const API_BASE = String((import.meta as any).env?.VITE_API_URL || "").replace(/\/$/, "");
const INITIAL_POSITION: [number, number] = [-2.5, 118];
const EMPTY_DASHBOARD: DashboardData = {
  risk: { status: "Belum tersedia", score: null, description: "Menunggu hasil identifikasi resmi BNPB InaRISK.", items: [] },
};

// Satu permintaan GPS bersama mencegah pembacaan berulang saat React memasang ulang komponen.
let sharedGpsFix: { position: GeolocationPosition; capturedAt: number } | null = null;
let sharedGpsRequest: Promise<GeolocationPosition> | null = null;

function getSharedGpsPosition(forceFresh = false): Promise<GeolocationPosition> {
  if (!forceFresh && sharedGpsFix && Date.now() - sharedGpsFix.capturedAt < 30_000) {
    return Promise.resolve(sharedGpsFix.position);
  }
  if (sharedGpsRequest) return sharedGpsRequest;
  sharedGpsRequest = new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => { sharedGpsFix = { position, capturedAt: Date.now() }; resolve(position); },
      reject,
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 },
    );
  }).finally(() => { sharedGpsRequest = null; });
  return sharedGpsRequest;
}

function MapFocus({ position, zoom }: { position: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => { map.setView(position, zoom, { animate: true }); }, [map, position, zoom]);
  useEffect(() => {
    const handleZoom = (event: Event) => {
      const step = (event as CustomEvent<number>).detail;
      if (step > 0) map.zoomIn(); else map.zoomOut();
    };
    window.addEventListener("simiti-map-zoom", handleZoom);
    return () => window.removeEventListener("simiti-map-zoom", handleZoom);
  }, [map]);
  return null;
}

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

function RouteMapFocus({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length >= 2) map.fitBounds(positions, { padding: [35, 35], maxZoom: 15, animate: true });
  }, [map, positions]);
  return null;
}

function distanceBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = (value: number) => value * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const LOCATION_TEST_PRESETS = [
  {
    name: "Kampung Melayu, Jakarta Timur",
    hazard: "Contoh titik kejadian banjir",
    latitude: -6.239089,
    longitude: 106.866134,
    reference: "Data titik rawan bencana Pemprov DKI Jakarta",
  },
  {
    name: "Cijedil, Cugenang, Cianjur",
    hazard: "Contoh titik kejadian longsor",
    latitude: -6.796389,
    longitude: 107.080639,
    reference: "Koordinat lokasi longsor yang dipublikasikan dalam kajian akademik",
  },
];


function buildMitigationRecommendations(factors: RiskItem[]): MitigationItem[] {
  const recommendations: MitigationItem[] = [];
  const add = (hazard: string, title: string, detail: string, priority: string, source: string) => {
    if (!recommendations.some((item) => item.title === title)) {
      recommendations.push({ hazard, title, detail, priority, source });
    }
  };

  for (const factor of factors) {
    if (factor.status === "Tidak tersedia" || factor.value == null) continue;
    const key = `${factor.key} ${factor.label}`.toLocaleLowerCase("id-ID");
    const score = factor.value / 100 * 3;
    const priority = score >= 2.5 ? "Tinggi" : score >= 1.5 ? "Sedang" : "Rendah";
    if (score < 1) continue;

    if (/banjir|genangan|flood/.test(key)) {
      add(factor.label, "Pengendalian banjir dan drainase",
        "Periksa kapasitas saluran, bersihkan drainase, jaga sempadan sungai, siapkan jalur evakuasi, dan evaluasi kebutuhan sumur resapan berdasarkan kondisi tanah setempat.",
        priority, factor.source || "BNPB InaRISK");
    } else if (/longsor|gerakan tanah|landslide/.test(key)) {
      add(factor.label, "Stabilisasi lereng dan konservasi tanah",
        "Pertahankan vegetasi berakar kuat, kendalikan aliran air di lereng, hindari pemotongan lereng tanpa kajian teknis, dan pantau retakan/pergerakan tanah.",
        priority, factor.source || "BNPB InaRISK");
    } else if (/kekeringan|drought/.test(key)) {
      add(factor.label, "Ketahanan dan konservasi sumber air",
        "Prioritaskan panen air hujan, tampungan/embung, perlindungan daerah resapan, dan penghematan air. Sumur bor hanya ditetapkan setelah kajian hidrogeologi, debit, kualitas air, dan perizinan.",
        priority, factor.source || "BNPB InaRISK");
    } else if (/karhutla|kebakaran hutan|fire/.test(key)) {
      add(factor.label, "Pencegahan kebakaran hutan dan lahan",
        "Lakukan patroli dan pemantauan titik panas, siapkan sumber air dan regu respons, cegah pembukaan lahan dengan membakar, serta kelola tinggi muka air gambut bila relevan.",
        priority, factor.source || "BNPB InaRISK");
    } else if (/tsunami/.test(key)) {
      add(factor.label, "Kesiapsiagaan tsunami",
        "Kenali jalur dan tempat evakuasi vertikal/dataran tinggi, pasang rambu, lakukan latihan evakuasi, dan ikuti peringatan resmi BMKG serta arahan BPBD.",
        priority, factor.source || "BNPB InaRISK");
    } else if (/gempa|earthquake/.test(key)) {
      add(factor.label, "Pengurangan risiko gempa bumi",
        "Periksa kesesuaian struktur bangunan dengan standar tahan gempa, amankan perabot berat, siapkan tas siaga, dan tetapkan titik kumpul.",
        priority, factor.source || "BNPB InaRISK");
    } else if (/gunung api|erupsi|volcano/.test(key)) {
      add(factor.label, "Kesiapsiagaan erupsi gunung api",
        "Pantau status resmi PVMBG, kenali zona bahaya dan jalur evakuasi, siapkan masker/kacamata pelindung, serta patuhi radius dan instruksi petugas.",
        priority, factor.source || "BNPB InaRISK");
    } else if (/gelombang|abrasi|rob|pesisir/.test(key)) {
      add(factor.label, "Perlindungan kawasan pesisir",
        "Pantau pasang dan gelombang, lindungi ekosistem pesisir, hindari pembangunan di zona berisiko, dan siapkan rute evakuasi ke area lebih tinggi.",
        priority, factor.source || "BNPB InaRISK");
    } else {
      add(factor.label, `Kesiapsiagaan ${factor.label}`,
        "Tindak lanjuti hasil kajian bahaya dengan BPBD setempat, siapkan prosedur evakuasi, dan lakukan pemantauan berkala berdasarkan pedoman instansi teknis terkait.",
        priority, factor.source || "BNPB InaRISK");
    }
  }

  const order = { Tinggi: 0, Sedang: 1, Rendah: 2 };
  return recommendations.sort((a, b) => order[a.priority as keyof typeof order] - order[b.priority as keyof typeof order]);
}

export default function CekLokasiSaya() {
  const [data, setData] = useState<DashboardData>(EMPTY_DASHBOARD);
  const [mitigationItems, setMitigationItems] = useState<MitigationItem[]>([]);
  const [riskLayers, setRiskLayers] = useState<any[]>([]);
  const [nearbyThreats, setNearbyThreats] = useState<NearbyThreat[]>([]);
  const [nearbyMitigations, setNearbyMitigations] = useState<NearbyMitigation[]>([]);
  const [evacuationRoute, setEvacuationRoute] = useState<EvacuationRoute | null>(null);
  const [routeState, setRouteState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [routeMessage, setRouteMessage] = useState("");
  const routeRequest = useRef(0);
  const [nearbyThreatState, setNearbyThreatState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [nearbyThreatError, setNearbyThreatError] = useState("");
  const requestSequence = useRef(0);
  const gpsInitStarted = useRef(false);  const [position, setPosition] = useState<[number, number]>(INITIAL_POSITION);
  const [latitudeInput, setLatitudeInput] = useState(String(INITIAL_POSITION[0]));
  const [longitudeInput, setLongitudeInput] = useState(String(INITIAL_POSITION[1]));
  const [coordinateError, setCoordinateError] = useState("");
  const [coordinateMode, setCoordinateMode] = useState<"gps" | "manual">("gps");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [gpsState, setGpsState] = useState<"idle" | "requesting" | "ready" | "error">(
    () => "idle"
  );
  const [gpsMessage, setGpsMessage] = useState("Menunggu izin lokasi perangkat...");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [adminArea, setAdminArea] = useState<AdminArea | null>(null);
  const [governmentAlerts, setGovernmentAlerts] = useState<GovernmentAlert[]>([]);
  const [riskState, setRiskState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [alertState, setAlertState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [riskSourceTime, setRiskSourceTime] = useState<string | null>(null);
  const [alertFetchedAt, setAlertFetchedAt] = useState<string | null>(null);
  const [alertFeedUpdatedAt, setAlertFeedUpdatedAt] = useState<string | null>(null);

  const loadDashboard = useCallback(async (lat: number, lng: number) => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setRiskState("loading");
    setAlertState("loading");
    setData(EMPTY_DASHBOARD);
    setMitigationItems([]);
    setRiskLayers([]);
    setNearbyMitigations([]);
    setGovernmentAlerts([]);
    setAdminArea(null);
    setRiskSourceTime(null);
    setAlertFetchedAt(null);
    setAlertFeedUpdatedAt(null);

    const query = `latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}`;
    let province = "";
    let district = "";
    let regency = "";

    try {
      const adminResponse = await fetch(`${API_BASE}/api/location-assessment?${query}`, { cache: "no-store" });
      if (adminResponse.ok) {
        const adminPayload = await adminResponse.json();
        const admin = adminPayload?.location?.administrative || adminPayload?.data || {};
        if (requestId !== requestSequence.current) return;
        setAdminArea({
          provinsi: admin.provinsi || admin.province || null,
          kabupaten: admin.kabupaten || admin.kabupaten_kota || admin.kota || null,
          kecamatan: admin.kecamatan || null,
          kelurahan: admin.kelurahan || admin.desa_kelurahan || null,
          desa: admin.desa || null,
          das: admin.das || admin.nama_das || null,
        });
        province = String(admin.provinsi || admin.province || "");
        district = String(admin.kecamatan || "");
        regency = String(admin.kabupaten || admin.kabupaten_kota || admin.kota || "");
      } else {
        console.warn("[LokasiSaya] API administrasi HTTP", adminResponse.status);
      }
    } catch (error) {
      console.warn("[LokasiSaya] Identifikasi administrasi gagal:", error);
    }

    const riskTask = (async () => {
      try {
        const response = await fetch(`${API_BASE}/api/location-bnpb?${query}&includeSafeSearch=false&_=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`InaRISK BNPB HTTP ${response.status}`);
        const assessment = await response.json();
        if (!assessment?.success) throw new Error(assessment?.message || "Data InaRISK BNPB tidak tersedia.");
        if (requestId !== requestSequence.current) return;

        const factors = Array.isArray(assessment.risk?.factors) ? assessment.risk.factors : [];
        const mappedFactors: RiskItem[] = factors.map((item: any, index: number) => ({
          key: String(item.key || `risk-${index}`),
          label: String(item.label || item.key || "Jenis bahaya"),
          status: item.available ? String(item.status || item.class || "Terpetakan") : "Tidak tersedia",
          value: item.available && Number.isFinite(Number(item.score))
            ? Math.max(0, Math.min(100, Number(item.score) / 3 * 100))
            : null,
          color: Number(item.score) >= 3 ? "#ef4444" : Number(item.score) === 2 ? "#f59e0b" : "#22c55e",
          source: item.source,
        }));

        setRiskSourceTime(assessment.generatedAt || new Date().toISOString());
        setRiskLayers(Array.isArray(assessment.layers) ? assessment.layers : []);
        setData({
          risk: {
            status: assessment.risk?.status || (assessment.risk?.complete ? "Teridentifikasi" : "Data parsial"),
            score: Number.isFinite(Number(assessment.risk?.index)) ? Number(assessment.risk.index) : null,
            description: assessment.risk?.complete
              ? `Hasil identifikasi InaRISK untuk titik ${lat.toFixed(6)}, ${lng.toFixed(6)}. Status mengikuti kelas bahaya yang dikembalikan layanan BNPB.`
              : "Data InaRISK hanya tersedia sebagian. Layer yang gagal dibaca ditandai Tidak tersedia dan tidak dianggap aman.",
            items: mappedFactors,
          },
        });
        setMitigationItems(buildMitigationRecommendations(mappedFactors));
        setRiskState("ready");
      } catch (error) {
        if (requestId !== requestSequence.current) return;
        setRiskState("error");
        setData(EMPTY_DASHBOARD);
        setMitigationItems([]);
        setGpsMessage(`Data risiko BNPB tidak tersedia: ${error instanceof Error ? error.message : "API tidak tersedia"}`);
        console.error("[LokasiSaya] InaRISK gagal:", error);
      }
    })();

    const alertTask = (async () => {
      try {
        if (!province) throw new Error("Wilayah administrasi belum berhasil diidentifikasi untuk pencocokan BMKG.");
        const params = new URLSearchParams({ province, district, regency, latitude: String(lat), longitude: String(lng), _: String(Date.now()) });
        const response = await fetch(`${API_BASE}/api/government/bmkg-alerts?${params.toString()}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Feed peringatan BMKG HTTP ${response.status}`);
        const payload = await response.json();
        if (requestId !== requestSequence.current) return;
        setGovernmentAlerts(Array.isArray(payload?.data) ? payload.data : []);
        setAlertFetchedAt(payload?.fetchedAt || new Date().toISOString());
        setAlertFeedUpdatedAt(payload?.feedUpdatedAt || null);
        setAlertState("ready");
      } catch (error) {
        if (requestId !== requestSequence.current) return;
        setAlertState("error");
        setGovernmentAlerts([]);
        console.warn("[LokasiSaya] Feed BMKG tidak tersedia:", error);
      }
    })();

    const nearbyThreatTask = (async () => {
      setNearbyThreatState("loading");
      setNearbyThreatError("");
      try {
        const proximityParams = new URLSearchParams({
          latitude: String(lat),
          longitude: String(lng),
          radiusMeters: "5000",
          threatLimit: "20",
          mitigationLimit: "20",
          incidentLimit: "1",
          _: String(Date.now()),
        });
        const proximityResponse = await fetch(`${API_BASE}/api/location-proximity?${proximityParams.toString()}`, { cache: "no-store" });
        if (!proximityResponse.ok) throw new Error(`API risiko sekitar HTTP ${proximityResponse.status}`);
        const proximityPayload = await proximityResponse.json();
        if (requestId !== requestSequence.current) return;
        if (!proximityPayload?.success) throw new Error(proximityPayload?.message || "Analisis risiko sekitar gagal.");
        setNearbyThreats(Array.isArray(proximityPayload.threats) ? proximityPayload.threats : []);
        const rawMitigations = Array.isArray(proximityPayload.mitigations) ? proximityPayload.mitigations : [];
        const normalizedMitigations: NearbyMitigation[] = rawMitigations.map((item: any, index: number) => {
          const latitude = Number(item.latitude ?? item.lat ?? item.y ?? item.geometry?.coordinates?.[1]);
          const longitude = Number(item.longitude ?? item.lng ?? item.lon ?? item.x ?? item.geometry?.coordinates?.[0]);
          const layerName = String(item.layerName ?? item.layer_name ?? item.tableName ?? item.table_name ?? item.layer ?? "");
          const type = item.type ?? item.category ?? item.jenis ?? item.objectType ?? null;
          const title = String(item.title ?? item.name ?? item.nama ?? item.label ?? item.nama_objek ?? item.objectName ?? "").trim();
          return {
            ...item,
            id: String(item.id ?? item.featureId ?? item.feature_id ?? `${layerName || "mitigasi"}-${index}`),
            layerName,
            type: type == null ? null : String(type),
            title: title || String(type || layerName || `Objek mitigasi ${index + 1}`),
            latitude: Number.isFinite(latitude) ? latitude : null,
            longitude: Number.isFinite(longitude) ? longitude : null,
            distanceMeters: item.distanceMeters == null ? (item.distance_m == null ? null : Number(item.distance_m)) : Number(item.distanceMeters),
          };
        });
        setNearbyMitigations(normalizedMitigations);
        setNearbyThreatState("ready");
      } catch (error) {
        if (requestId !== requestSequence.current) return;
        setNearbyThreats([]);
        setNearbyMitigations([]);
        setNearbyThreatState("error");
        setNearbyThreatError(error instanceof Error ? error.message : "Risiko sekitar tidak dapat dimuat.");
        console.warn("[LokasiSaya] Risiko sekitar gagal:", error);
      }
    })();

    await Promise.all([riskTask, alertTask, nearbyThreatTask]);
    if (requestId !== requestSequence.current) return;
    setLastUpdated(new Date());
    setLoading(false);
  }, []);

  const applyManualCoordinates = useCallback(() => {
    const latitude = Number(latitudeInput.trim());
    const longitude = Number(longitudeInput.trim());

    if (
      !latitudeInput.trim() ||
      !longitudeInput.trim() ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      setCoordinateError("Masukkan latitude (-90 s.d. 90) dan longitude (-180 s.d. 180) yang valid.");
      return;
    }

    setCoordinateError("");
    setCoordinateMode("manual");
    setPosition([latitude, longitude]);
    setAccuracy(null);
    setGpsState("ready");
    setGpsMessage("Mode uji koordinat manual aktif. Hasil berasal dari koordinat yang dimasukkan, bukan GPS perangkat.");
    void loadDashboard(latitude, longitude);
  }, [latitudeInput, longitudeInput, loadDashboard]);

  const useTestPreset = useCallback((preset: typeof LOCATION_TEST_PRESETS[number]) => {
    setLatitudeInput(String(preset.latitude));
    setLongitudeInput(String(preset.longitude));
    setCoordinateError("");
    setCoordinateMode("manual");
    setPosition([preset.latitude, preset.longitude]);
    setAccuracy(null);
    setGpsState("ready");
    setGpsMessage(`Mode uji koordinat manual: ${preset.name}. Ini titik contoh pengujian, bukan posisi GPS perangkat.`);
    void loadDashboard(preset.latitude, preset.longitude);
  }, [loadDashboard]);

  const useCurrentLocation = useCallback((forceFresh = true) => {
    if (!navigator.geolocation) {
      setGpsState("error");
      setGpsMessage("Browser tidak mendukung Geolocation API.");
      return;
    }
    setGpsState("requesting");
    setLoading(true);
    setGpsMessage("Mengambil koordinat GPS perangkat...");
    getSharedGpsPosition(forceFresh)
      .then(({ coords }) => {
        const latitude = Number(coords.latitude);
        const longitude = Number(coords.longitude);
        const gpsAccuracy = Number.isFinite(coords.accuracy) ? coords.accuracy : null;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
          setGpsState("error"); setGpsMessage("Koordinat GPS tidak valid."); setLoading(false); return;
        }
        setPosition([latitude, longitude]);
        setLatitudeInput(String(latitude));
        setLongitudeInput(String(longitude));
        setCoordinateError("");
        setCoordinateMode("gps");
        setAccuracy(gpsAccuracy);
        setGpsState("ready");
        setGpsMessage(gpsAccuracy != null ? `GPS diperoleh • akurasi ±${Math.round(gpsAccuracy)} m` : "GPS berhasil diperoleh");
        void loadDashboard(latitude, longitude);
      })
      .catch((error: GeolocationPositionError) => {
        setGpsState("error");
        setLoading(false);
        setGpsMessage(error.code === 1
          ? "Izin lokasi ditolak. Aktifkan izin lokasi untuk situs ini."
          : error.code === 2
            ? "Lokasi perangkat tidak tersedia. Data risiko tidak akan ditampilkan tanpa koordinat GPS."
            : "Pengambilan GPS timeout. Silakan tekan Perbarui GPS.");
      });
  }, [loadDashboard]);

  // Ambil GPS perangkat terlebih dahulu; data API tidak dipanggil sebelum koordinat valid.
  useEffect(() => {
    if (gpsInitStarted.current) return;
    gpsInitStarted.current = true;
    useCurrentLocation(false);
  }, [useCurrentLocation]);

  useEffect(() => {
    if (gpsState !== "ready") return;
    const refreshId = window.setInterval(() => {
      void loadDashboard(position[0], position[1]);
    }, 5 * 60 * 1000);
    return () => window.clearInterval(refreshId);
  }, [gpsState, loadDashboard, position]);

  useEffect(() => {
    const requestId = ++routeRequest.current;
    const isKarhutla = data.risk.items.some((factor) => factor.value != null && factor.status !== "Tidak tersedia" && /karhutla|kebakaran hutan|fire/i.test(`${factor.key} ${factor.label}`));
    const candidates = nearbyMitigations.filter((item) =>
      Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)) &&
      item.latitude != null && item.longitude != null &&
      Math.abs(Number(item.latitude)) <= 90 && Math.abs(Number(item.longitude)) <= 180
    );
    const waterCandidates = candidates.filter((item) => /bendungan|waduk|situ|embung|kolam|tandon|sumber air|water/i.test(`${item.title} ${item.type || ""} ${item.layerName}`));
    const eligible = isKarhutla && waterCandidates.length ? waterCandidates : candidates;
    const distance = (item: NearbyMitigation) => item.distanceMeters != null && Number.isFinite(Number(item.distanceMeters))
      ? Number(item.distanceMeters)
      : distanceBetween(position[0], position[1], Number(item.latitude), Number(item.longitude));
    const destination = [...eligible].sort((a, b) => distance(a) - distance(b))[0];

    setEvacuationRoute(null);
    if (!destination) {
      setRouteState("idle");
      setRouteMessage(nearbyThreatState === "loading" ? "Menunggu data objek mitigasi terdekat..." : "Belum ada objek mitigasi dengan koordinat yang dapat dijadikan tujuan rute dalam radius pencarian.");
      return;
    }

    const destinationLat = Number(destination.latitude);
    const destinationLng = Number(destination.longitude);
    setRouteState("loading");
    setRouteMessage(`Menghitung rute menuju ${destination.title}...`);
    const controller = new AbortController();
    const url = `https://router.project-osrm.org/route/v1/driving/${position[1]},${position[0]};${destinationLng},${destinationLat}?overview=full&geometries=geojson`;
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Layanan rute HTTP ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        if (requestId !== routeRequest.current) return;
        const route = payload?.routes?.[0];
        const coordinates = Array.isArray(route?.geometry?.coordinates)
          ? route.geometry.coordinates.map((point: number[]) => [Number(point[1]), Number(point[0])] as [number, number])
          : [];
        if (payload?.code !== "Ok" || coordinates.length < 2) throw new Error("Jaringan jalan tidak menemukan rute yang tersambung ke objek mitigasi.");
        setEvacuationRoute({ destination, coordinates, distanceMeters: Number(route.distance) || distance(destination), durationSeconds: Number(route.duration) || 0, status: "ready" });
        setRouteState("ready");
        setRouteMessage(isKarhutla && waterCandidates.length ? "Tujuan diprioritaskan ke sumber air terdekat untuk dukungan penanganan Karhutla." : "Rute dihitung dari jaringan jalan yang tersedia.");
      })
      .catch((error) => {
        if (controller.signal.aborted || requestId !== routeRequest.current) return;
        setRouteState("error");
        setRouteMessage(error instanceof Error ? error.message : "Rute tidak dapat dihitung.");
      });
    return () => controller.abort();
  }, [nearbyMitigations, position, data.risk.items, nearbyThreatState]);

  // Kesimpulan utama mengikuti hasil "Risiko Sekitar Kita", bukan status kelengkapan layer InaRISK.
  const nearbyConclusion = (() => {
    if (nearbyThreatState === "loading" || nearbyThreatState === "idle") {
      return {
        label: "MEMERIKSA RISIKO",
        className: "memeriksa",
        description: "Kesimpulan akan ditampilkan setelah analisis risiko sekitar selesai.",
      };
    }
    if (nearbyThreatState === "error") {
      return {
        label: "BELUM DAPAT DISIMPULKAN",
        className: "belum-diketahui",
        description: "Pemeriksaan Risiko Sekitar Kita gagal dimuat. Lokasi tidak dapat dinyatakan aman.",
      };
    }

    const statuses = nearbyThreats.map((item) =>
      `${item.status || ""} ${item.key || ""} ${item.label || ""}`.toLocaleLowerCase("id-ID")
    );
    const hasSiaga = nearbyThreats.some((item, index) =>
      Boolean(item.inside) || /bahaya|tinggi|siaga|tingkat tinggi|high|severe|very high/.test(statuses[index])
    );
    const hasWaspada = nearbyThreats.some((item, index) =>
      /waspada|sedang|menengah|moderate|medium/.test(statuses[index])
    );
    const allKnownLow = nearbyThreats.length > 0 && nearbyThreats.every((item, index) =>
      /aman|rendah|low/.test(statuses[index]) && !item.inside
    );

    if (hasSiaga) {
      return {
        label: "SIAGA",
        className: "siaga",
        description: "Ditemukan ancaman berkelas tinggi atau fitur risiko yang mencakup titik koordinat Anda. Tingkatkan kesiapsiagaan dan ikuti arahan BPBD.",
      };
    }
    if (hasWaspada) {
      return {
        label: "WASPADA",
        className: "waspada",
        description: "Ditemukan ancaman berkelas sedang di sekitar titik Anda. Pantau kondisi dan siapkan langkah antisipasi.",
      };
    }
    if (nearbyThreats.length === 0 || allKnownLow) {
      return {
        label: "AMAN",
        className: "aman",
        description: "Tidak ditemukan ancaman selain kelas rendah pada pemeriksaan radius 5 km. Status ini terbatas pada data dan cakupan analisis yang tersedia, bukan jaminan bebas bencana.",
      };
    }
    return {
      label: "BELUM DAPAT DISIMPULKAN",
      className: "belum-diketahui",
      description: "Fitur risiko ditemukan, tetapi kelas ancamannya belum cukup jelas untuk menetapkan status Aman, Waspada, atau Siaga.",
    };
  })();

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
          <span className="simiti-topbar-date"><CalendarDays size={18} /> {lastUpdated ? `${lastUpdated.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} WIB` : "Menunggu data"}</span>
          <span className="simiti-user-avatar"><span>â—</span></span>
        </div>
      </header>

      <section className="simiti-location-grid">
        <article className="simiti-map-panel">
          <MapContainer center={position} zoom={gpsState === "ready" ? 14 : 5} zoomControl={false} scrollWheelZoom className="simiti-main-map">
            <TileLayer
              attribution='&copy; Esri'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
            <MapFocus position={position} zoom={gpsState === "ready" ? 14 : 5} />
            {gpsState === "ready" && <>
              <Circle center={position} radius={200} pathOptions={{ color: "#31d9ff", fillColor: "#0ea5e9", fillOpacity: 0.22, weight: 2 }} />
              <CircleMarker center={position} radius={8} pathOptions={{ color: "#fff", weight: 3, fillColor: "#00d9ff", fillOpacity: 1 }} />
            </>}
          </MapContainer>
          <div className="simiti-map-location-chip">
            <Crosshair size={24} /><div><b>{gpsState === "ready" ? (coordinateMode === "manual" ? "Lokasi Uji Manual" : "Lokasi GPS Anda") : "Menunggu GPS"}</b><span>{[adminArea?.kelurahan || adminArea?.desa, adminArea?.kecamatan, adminArea?.kabupaten, adminArea?.provinsi].filter(Boolean).join(" • ") || "Nama wilayah sedang dicari"}</span><span>{gpsState === "ready" ? `${formatCoordinate(position[0])}, ${formatCoordinate(position[1])} · EPSG:4326` : "Koordinat akan ditampilkan setelah GPS berhasil"}</span></div>
          </div>
          <div className="simiti-map-alerts">
            <div className="simiti-map-alert safe"><Info size={24} /><div><small>Identifikasi risiko BNPB</small><b>{riskState === "loading" ? "Mengambil layer InaRISK pada koordinat terpilih..." : riskState === "error" ? "Data InaRISK belum dapat dimuat" : data.risk.items.length ? `${data.risk.items.filter((item) => item.status !== "Tidak tersedia").length} layer berhasil diperiksa` : "Belum ada hasil identifikasi"}</b></div></div>
            {governmentAlerts.slice(0, 2).map((alert) => <div className="simiti-map-alert danger" key={alert.id}><AlertTriangle size={24} /><div><small>Peringatan aktif BMKG</small><b>{alert.event || alert.headline}</b></div><ChevronRight /></div>)}
          </div>
          <div className="simiti-map-zoom"><button onClick={() => window.dispatchEvent(new CustomEvent("simiti-map-zoom", { detail: 1 }))}>+</button><button onClick={() => window.dispatchEvent(new CustomEvent("simiti-map-zoom", { detail: -1 }))}>âˆ’</button><button title="Gunakan lokasi GPS" onClick={useCurrentLocation}><LocateFixed size={20} /></button></div>
          <div className="simiti-map-legend"><span><i className="gps-dot" /> Titik GPS</span><span><i className="radius-dot" /> Radius Â±200 m</span></div>
          <button className="simiti-gps-refresh" onClick={useCurrentLocation} disabled={loading}><LocateFixed size={16} /> {gpsState === "requesting" || loading ? "Mengambil GPS..." : "Perbarui GPS"}</button>
        </article>

        <article className="simiti-risk-panel">
          <div className="simiti-risk-summary">
            <div className="simiti-risk-emblem"><ShieldAlert size={68} /></div>
            <div className="simiti-risk-content"><h2>Status Risiko</h2><span>Sumber: BNPB InaRISK REST Services (kajian spasial)</span>{data.risk.score != null && <small>Indeks SIMITI: {data.risk.score}/100</small>}<strong className={`simiti-risk-status ${nearbyConclusion.className}`}>{nearbyConclusion.label}</strong><p>{nearbyConclusion.description}</p></div>
          </div>
          <div className="simiti-risk-breakdown">
            <h3>Status per Jenis Risiko</h3>
            {data.risk.items.length ? data.risk.items.map((risk) => (
              <div className="simiti-risk-row" key={risk.key}>
                <span className={`simiti-risk-icon ${risk.key}`}>
                  {risk.key.toLowerCase().includes("banjir") ? <Waves size={25} /> : risk.key.toLowerCase().includes("longsor") ? <Mountain size={25} /> : risk.key.toLowerCase().includes("karhutla") ? <Flame size={25} /> : <Sun size={25} />}
                </span>
                <span className="simiti-risk-label">{risk.label}</span>
                <span className="simiti-risk-track"><i style={{ width: `${risk.value ?? 0}%`, background: risk.color }} /></span>
                <b className={`simiti-risk-pill ${risk.status.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`}>{risk.status}</b>
              </div>
            )) : <p>{riskState === "loading" ? "Mengambil data resmi BNPB..." : riskState === "error" ? "Data risiko pemerintah tidak tersedia saat ini." : "Belum ada data risiko untuk koordinat ini."}</p>}
            <div className="simiti-risk-note"><Info size={18} /> Kelas bahaya berasal dari layer InaRISK BNPB. Indeks gabungan, jika tersedia, merupakan perhitungan SIMITI.</div>
            {riskLayers.some((layer) => !layer.available) && (
              <div style={{ marginTop: 10, padding: 10, borderRadius: 9, background: "#fff7ed", border: "1px solid #fed7aa" }}>
                <b style={{ color: "#9a3412", fontSize: 12 }}>Layer InaRISK yang belum berhasil dibaca</b>
                {riskLayers.filter((layer) => !layer.available).map((layer) => (
                  <div key={layer.key} style={{ marginTop: 5, fontSize: 11, color: "#7c2d12" }}>
                    <b>{layer.label || layer.key}:</b> {layer.error || "Tidak ada hasil identify pada titik ini"}
                  </div>
                ))}
              </div>
            )}
            {riskSourceTime && <small>Respons layanan diterima: {new Date(riskSourceTime).toLocaleString("id-ID")}</small>}
          </div>
        </article>
      </section>

      <section
        className="simiti-coordinate-test-panel"
        style={{
          margin: "18px 0",
          padding: "20px",
          border: "1px solid #dbe5ef",
          borderRadius: "16px",
          background: "#ffffff",
          boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: 0, color: "#10243e", fontSize: 18 }}>Uji Risiko dengan Koordinat Manual</h3>
            <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
              Masukkan latitude dan longitude lain untuk menguji identifikasi bahaya InaRISK pada titik tersebut.
            </p>
          </div>
          <span style={{ padding: "6px 10px", borderRadius: 20, background: coordinateMode === "manual" ? "#fff7ed" : "#eff6ff", color: coordinateMode === "manual" ? "#c2410c" : "#1d4ed8", fontSize: 11, fontWeight: 700 }}>
            {coordinateMode === "manual" ? "MODE UJI MANUAL" : "MODE GPS"}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 16 }}>
          <label style={{ display: "grid", gap: 6, color: "#334155", fontSize: 13, fontWeight: 700 }}>
            Latitude
            <input
              type="number"
              step="any"
              value={latitudeInput}
              onChange={(event) => setLatitudeInput(event.target.value)}
              placeholder="-6.239089"
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", border: "1px solid #cbd5e1", borderRadius: 9, fontSize: 14, color: "#0f172a" }}
            />
          </label>
          <label style={{ display: "grid", gap: 6, color: "#334155", fontSize: 13, fontWeight: 700 }}>
            Longitude
            <input
              type="number"
              step="any"
              value={longitudeInput}
              onChange={(event) => setLongitudeInput(event.target.value)}
              placeholder="106.866134"
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", border: "1px solid #cbd5e1", borderRadius: 9, fontSize: 14, color: "#0f172a" }}
            />
          </label>
        </div>

        {coordinateError && <p role="alert" style={{ margin: "9px 0 0", color: "#b91c1c", fontSize: 12 }}>{coordinateError}</p>}

        <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 14 }}>
          <button
            type="button"
            onClick={applyManualCoordinates}
            disabled={loading}
            style={{ border: 0, borderRadius: 9, padding: "10px 16px", background: "#075985", color: "#fff", fontWeight: 700, cursor: loading ? "wait" : "pointer" }}
          >
            {loading ? "Memeriksa koordinat..." : "Uji Lokasi Ini"}
          </button>
          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={loading}
            style={{ border: "1px solid #cbd5e1", borderRadius: 9, padding: "10px 14px", background: "#fff", color: "#334155", fontWeight: 700, cursor: loading ? "wait" : "pointer" }}
          >
            <LocateFixed size={14} style={{ verticalAlign: "middle", marginRight: 6 }} /> Kembali ke GPS Saya
          </button>
        </div>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
          <h4 style={{ margin: 0, color: "#10243e", fontSize: 14 }}>Contoh koordinat untuk pengujian</h4>
          <p style={{ margin: "5px 0 12px", color: "#64748b", fontSize: 12 }}>
            Titik berikut dipilih dari lokasi yang pernah dilaporkan mengalami kejadian bencana. Kelas bahaya aktual tetap harus dibaca dari respons InaRISK, bukan diasumsikan dari nama lokasi.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 10 }}>
            {LOCATION_TEST_PRESETS.map((preset) => (
              <div key={preset.name} style={{ border: "1px solid #e2e8f0", borderRadius: 11, padding: 13, background: "#f8fafc" }}>
                <b style={{ display: "block", color: "#1e293b", fontSize: 13 }}>{preset.name}</b>
                <span style={{ display: "block", marginTop: 4, color: "#b45309", fontSize: 12, fontWeight: 700 }}>{preset.hazard}</span>
                <code style={{ display: "block", marginTop: 8, color: "#334155", fontSize: 12, whiteSpace: "normal" }}>
                  Lat {formatCoordinate(preset.latitude)}<br />
                  Long {formatCoordinate(preset.longitude)}
                </code>
                <small style={{ display: "block", marginTop: 6, color: "#64748b", lineHeight: 1.4 }}>{preset.reference}</small>
                <button
                  type="button"
                  onClick={() => useTestPreset(preset)}
                  disabled={loading}
                  style={{ marginTop: 10, border: "1px solid #0e7490", borderRadius: 8, padding: "8px 11px", background: "#ecfeff", color: "#155e75", fontSize: 12, fontWeight: 700, cursor: loading ? "wait" : "pointer" }}
                >
                  Gunakan & Uji Titik Ini
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="simiti-info-grid" style={{ marginTop: 16 }}>
        <article className="simiti-info-card" style={{ gridColumn: "1 / -1" }}>
          <h3><ShieldAlert size={27} /> Risiko Sekitar Kita <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Radius 5 km</span></h3>
          <p style={{ color: "#64748b", fontSize: 12, marginTop: -4 }}>Analisis spasial PostGIS berdasarkan koordinat GPS/manual saat ini. Risiko yang memuat titik ditandai sebagai “Di titik”; lainnya menampilkan jarak.</p>
          {nearbyThreatState === "loading" ? (
            <p>Memeriksa layer risiko di sekitar koordinat...</p>
          ) : nearbyThreatState === "error" ? (
            <p style={{ color: "#b91c1c" }}>Risiko sekitar gagal dimuat: {nearbyThreatError}</p>
          ) : nearbyThreats.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
              {nearbyThreats.map((item, index) => (
                <div key={`${item.key || item.source || item.label}-${index}`} style={{ border: "1px solid #dbe5ef", borderRadius: 12, padding: 13, background: "#f8fafc" }}>
                  <b style={{ display: "block", color: "#10243e" }}>{item.label || item.key || "Risiko teridentifikasi"}</b>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
                    <span style={{ background: item.inside ? "#fee2e2" : "#e0f2fe", color: item.inside ? "#991b1b" : "#075985", borderRadius: 20, padding: "4px 8px", fontSize: 11, fontWeight: 800 }}>{item.inside ? "Di titik GPS" : item.distanceMeters != null ? `${Math.round(Number(item.distanceMeters)).toLocaleString("id-ID")} m` : "Dalam radius"}</span>
                    {item.status && <span style={{ background: "#fef3c7", color: "#92400e", borderRadius: 20, padding: "4px 8px", fontSize: 11, fontWeight: 800 }}>{item.status}</span>}
                    {item.score != null && <span style={{ background: "#e2e8f0", color: "#334155", borderRadius: 20, padding: "4px 8px", fontSize: 11, fontWeight: 800 }}>Skor {item.score}</span>}
                  </div>
                  <small style={{ display: "block", color: "#64748b", marginTop: 8 }}>Sumber layer: {item.source || item.key || "-"}</small>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: 12, border: "1px solid #dbe5ef", borderRadius: 10, color: "#64748b" }}>Tidak ada fitur risiko yang terdeteksi dalam radius 5 km dari koordinat ini. Ini bukan berarti lokasi pasti aman.</div>
          )}
        </article>
      </section>

      <section className="simiti-info-grid">
        <article className="simiti-info-card weather-card" style={{ gridColumn: "1 / -1", minWidth: 0, padding: 22, border: "1px solid #dbe5ef", borderRadius: 18, boxShadow: "0 12px 32px rgba(15, 23, 42, .07)", background: "linear-gradient(145deg, #ffffff 0%, #f8fbff 100%)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
            <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 10, color: "#10243e", fontSize: 19, fontWeight: 800 }}><MapPin size={25} color="#0e7490" /> Peta Rute ke Lokasi Mitigasi Terdekat</h3>
            <span style={{ padding: "6px 11px", borderRadius: 999, background: routeState === "ready" ? "#dcfce7" : routeState === "error" ? "#fee2e2" : "#e0f2fe", color: routeState === "ready" ? "#166534" : routeState === "error" ? "#991b1b" : "#075985", fontSize: 11, fontWeight: 800, letterSpacing: ".04em" }}>{routeState === "ready" ? "RUTE TERSEDIA" : routeState === "error" ? "RUTE PERLU DIPERIKSA" : routeState === "loading" ? "MENGHITUNG RUTE" : "MENUNGGU DATA TUJUAN"}</span>
          </div>
          <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: 13, lineHeight: 1.6 }}>Titik awal menggunakan koordinat GPS atau input manual. Tujuan hanya diambil dari objek spasial Mitigasi & Adaptasi yang sudah dipublikasikan.</p>
          {routeState === "loading" ? (
            <div style={{ minHeight: 260, display: "grid", placeItems: "center", borderRadius: 12, background: "#f8fafc", color: "#475569" }}>{routeMessage}</div>
          ) : evacuationRoute ? (
            <>
              <div style={{ height: 390, width: "100%", overflow: "hidden", borderRadius: 14, border: "1px solid #cbd5e1", boxShadow: "0 6px 18px rgba(15, 23, 42, .08)" }}>
                <MapContainer center={position} zoom={13} zoomControl scrollWheelZoom className="simiti-main-map" style={{ height: "100%", width: "100%" }}>
                  <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <RouteMapFocus positions={evacuationRoute.coordinates} />
                  <Polyline positions={evacuationRoute.coordinates} pathOptions={{ color: "#0e7490", weight: 6, opacity: 0.9 }}>
                    <Tooltip sticky>Rute akses menuju lokasi mitigasi</Tooltip>
                  </Polyline>
                  <CircleMarker center={position} radius={9} pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }}>
                    <Tooltip permanent direction="top">Titik Anda</Tooltip>
                  </CircleMarker>
                  <CircleMarker center={[Number(evacuationRoute.destination.latitude), Number(evacuationRoute.destination.longitude)]} radius={9} pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#16a34a", fillOpacity: 1 }}>
                    <Tooltip permanent direction="top">Tujuan mitigasi</Tooltip>
                  </CircleMarker>
                </MapContainer>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 11, marginTop: 14 }}>
                <div style={{ padding: 11, borderRadius: 10, background: "#eff6ff" }}><small style={{ color: "#1d4ed8" }}>TITIK AWAL</small><b style={{ display: "block", color: "#1e3a8a", fontSize: 13 }}>Lokasi GPS / manual</b></div>
                <div style={{ padding: 11, borderRadius: 10, background: "#f0fdf4" }}><small style={{ color: "#15803d" }}>TUJUAN MITIGASI</small><b style={{ display: "block", color: "#14532d", fontSize: 13 }}>{evacuationRoute.destination.title || evacuationRoute.destination.type || evacuationRoute.destination.layerName || "Objek mitigasi terdekat"}</b><small>{evacuationRoute.destination.type || evacuationRoute.destination.layerName || "Objek spasial terpublikasi"}</small></div>
                <div style={{ padding: 11, borderRadius: 10, background: "#f8fafc" }}><small style={{ color: "#64748b" }}>JARAK RUTE</small><b style={{ display: "block", color: "#10243e", fontSize: 17 }}>{evacuationRoute.distanceMeters >= 1000 ? `${(evacuationRoute.distanceMeters / 1000).toFixed(2)} km` : `${Math.round(evacuationRoute.distanceMeters)} m`}</b><small>Estimasi jaringan jalan</small></div>
                <div style={{ padding: 11, borderRadius: 10, background: "#f8fafc" }}><small style={{ color: "#64748b" }}>ESTIMASI WAKTU</small><b style={{ display: "block", color: "#10243e", fontSize: 17 }}>{evacuationRoute.durationSeconds > 0 ? `${Math.max(1, Math.round(evacuationRoute.durationSeconds / 60))} menit` : "Tidak tersedia"}</b><small>Profil kendaraan</small></div>
              </div>
              <p style={{ margin: "10px 0 0", color: "#64748b", fontSize: 11 }}>{routeMessage} · Rute ini estimasi akses jalan, bukan jalur evakuasi resmi yang telah disahkan BPBD. Periksa kondisi lapangan dan arahan petugas.</p>
            </>
          ) : (
            <div style={{ minHeight: 230, padding: 24, display: "grid", alignContent: "center", justifyItems: "center", textAlign: "center", border: "1px dashed #94a3b8", borderRadius: 14, background: "linear-gradient(135deg, #f8fafc, #eff6ff)" }}>
              <MapPin size={36} color="#64748b" />
              <b style={{ marginTop: 8, color: "#10243e" }}>{routeState === "error" ? "Rute belum dapat dihitung" : nearbyMitigations.length ? "Koordinat tujuan belum valid" : "Lokasi mitigasi belum tersedia"}</b>
              <p style={{ maxWidth: 460, margin: "6px 0 0", color: "#64748b", fontSize: 12 }}>{routeMessage || (nearbyThreatState === "loading" ? "Menunggu hasil pencarian objek mitigasi..." : nearbyMitigations.length ? "Objek ditemukan, tetapi API belum mengirim latitude dan longitude yang valid." : "Tidak ada objek mitigasi berkoordinat yang ditemukan. SIMITI tidak membuat tujuan atau jalur buatan.")}</p>
            </div>
          )}
          <small style={{ display: "block", marginTop: 9, color: "#64748b" }}>Sumber tujuan: layer Mitigasi & Adaptasi yang dipublikasikan di SIMITI · Peta dasar: OpenStreetMap · Perhitungan rute: OSRM</small>
        </article>
        <article className="simiti-info-card coordinate-card">
          <h3><MapPin size={27} fill="currentColor" /> Koordinat & Administrasi</h3>
          <dl>
            <div><dt>Latitude</dt><dd>: {formatCoordinate(position[0])}</dd></div>
            <div><dt>Longitude</dt><dd>: {formatCoordinate(position[1])}</dd></div>
            <div><dt>Akurasi GPS</dt><dd>: {accuracy != null ? `±${Math.round(accuracy)} meter` : "Belum tersedia"}</dd></div>
            <div><dt>Kelurahan/Desa</dt><dd>: {adminArea?.kelurahan || adminArea?.desa || "Belum tersedia"}</dd></div>
            <div><dt>Kecamatan</dt><dd>: {adminArea?.kecamatan || "Belum tersedia"}</dd></div>
            <div><dt>Kabupaten/Kota</dt><dd>: {adminArea?.kabupaten || "Belum tersedia"}</dd></div>
            <div><dt>Provinsi</dt><dd>: {adminArea?.provinsi || "Belum tersedia"}</dd></div>
            <div><dt>DAS</dt><dd>: {adminArea?.das || "Belum tersedia"}</dd></div>
          </dl>
          <small className="simiti-gps-message">{gpsMessage}</small>
        </article>
        <article className="simiti-info-card incident-card">
          <h3><BellRing size={27} /> Status Data Pemerintah</h3>
          <div className="simiti-incident-list">
            <div className="simiti-incident-item"><span className="simiti-incident-placeholder"><ShieldCheck size={18} /></span><span><b>BNPB InaRISK</b><small>Layer bahaya spasial pada koordinat terpilih</small></span><b>{riskState === "ready" ? "Diperiksa" : riskState === "loading" ? "Memuat" : "Tidak tersedia"}</b></div>
            <div className="simiti-incident-item"><span className="simiti-incident-placeholder"><CloudSun size={18} /></span><span><b>BMKG CAP</b><small>Peringatan dini cuaca tingkat provinsi/kecamatan</small></span><b>{alertState === "ready" ? "Diperiksa" : alertState === "loading" ? "Memuat" : "Tidak tersedia"}</b></div>
          </div>
        </article>
      </section>

      <section className="simiti-mitigation-panel">
        <div className="simiti-mitigation-heading"><ShieldCheck size={31} /><h3>Rekomendasi & Tindak Lanjut</h3><span>SUMBER RESMI</span></div>
        <div className="simiti-mitigation-body">
          {riskState === "loading" ? (
            <p>Menyiapkan rekomendasi berdasarkan hasil identifikasi bahaya untuk koordinat terpilih...</p>
          ) : mitigationItems.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, width: "100%" }}>
              {mitigationItems.map((item, index) => (
                <article key={`${item.title}-${index}`} style={{ border: "1px solid #dbe5ef", borderRadius: 12, padding: 15, background: "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <b style={{ color: "#10243e" }}>{item.title}</b>
                    <span style={{ whiteSpace: "nowrap", borderRadius: 20, padding: "4px 8px", fontSize: 11, fontWeight: 800, background: item.priority === "Tinggi" ? "#fee2e2" : item.priority === "Sedang" ? "#fef3c7" : "#dcfce7", color: item.priority === "Tinggi" ? "#991b1b" : item.priority === "Sedang" ? "#92400e" : "#166534" }}>{item.priority}</span>
                  </div>
                  <small style={{ display: "block", color: "#64748b", marginTop: 5 }}>Ancaman teridentifikasi: {item.hazard}</small>
                  <p style={{ margin: "9px 0", color: "#475569", lineHeight: 1.55, fontSize: 13 }}>{item.detail}</p>
                  <small style={{ color: "#64748b" }}>Dasar identifikasi: {item.source}</small>
                </article>
              ))}
            </div>
          ) : (
            <div className="simiti-mitigation-detail">
              <Info size={42} />
              <div className="simiti-mitigation-text">
                <h4>{riskState === "error" ? "Rekomendasi belum dapat disusun" : "Belum ada ancaman terverifikasi untuk titik ini"}</h4>
                <p>{riskState === "error" ? "Layanan identifikasi InaRISK gagal diakses. Periksa status API dan konfigurasi layer; SIMITI tidak akan membuat rekomendasi berdasarkan data yang tidak tersedia." : "Tidak ada kelas bahaya dengan data terukur yang dapat dijadikan dasar rekomendasi pada titik ini. Ini bukan pernyataan bahwa lokasi pasti aman."}</p>
              </div>
            </div>
          )}
          <div style={{ width: "100%", marginTop: 16, paddingTop: 14, borderTop: "1px solid #dbe5ef" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <b style={{ color: "#10243e" }}>Objek Mitigasi & Adaptasi Terdekat</b>
              <small style={{ color: "#64748b" }}>Katalog layer Kerawanan · radius 5 km</small>
            </div>
            {nearbyThreatState === "loading" ? (
              <p style={{ color: "#64748b", fontSize: 13 }}>Mencari fitur spasial mitigasi dan adaptasi di sekitar titik...</p>
            ) : nearbyThreatState === "error" ? (
              <p style={{ color: "#b45309", fontSize: 13 }}>Data objek mitigasi belum dapat dimuat dari layanan spasial.</p>
            ) : nearbyMitigations.length ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 10 }}>
                {nearbyMitigations
                  .filter((item) => {
                    const hazardText = data.risk.items.filter((factor) => factor.value != null && factor.status !== "Tidak tersedia").map((factor) => `${factor.key} ${factor.label}`).join(" ").toLowerCase();
                    const isKarhutla = /karhutla|kebakaran hutan|fire/.test(hazardText);
                    if (!isKarhutla) return true;
                    return /bendungan|waduk|situ|embung|kolam|tandon|sumber air|water/.test(`${item.title} ${item.type} ${item.layerName}`.toLowerCase());
                  })
                  .map((item) => (
                    <article key={item.id} style={{ border: "1px solid #dbe5ef", borderRadius: 10, padding: 12, background: "#f8fafc" }}>
                      <b style={{ display: "block", color: "#10243e", fontSize: 13 }}>{item.title}</b>
                      <small style={{ display: "block", color: "#64748b", marginTop: 4 }}>{item.type || item.layerName}</small>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 9, fontSize: 12 }}>
                        <span style={{ color: "#475569" }}>{item.distanceMeters == null ? "Jarak tidak tersedia" : item.distanceMeters < 1000 ? `${Math.round(item.distanceMeters)} m dari titik` : `${(item.distanceMeters / 1000).toFixed(2)} km dari titik`}</span>
                        <span style={{ color: "#64748b" }}>Layer: {item.layerName}</span>
                      </div>
                    </article>
                  ))}
              </div>
            ) : (
              <p style={{ color: "#64748b", fontSize: 13, marginTop: 8 }}>Belum ditemukan objek mitigasi dan adaptasi terpublikasi dalam radius pencarian pada koordinat ini.</p>
            )}
          </div>
          <div style={{ width: "100%", marginTop: 12, paddingTop: 12, borderTop: "1px solid #e2e8f0" }}>
            <p style={{ margin: "0 0 6px", color: "#475569", fontSize: 12 }}>Rekomendasi SIMITI merupakan arahan awal berdasarkan kelas bahaya teridentifikasi, bukan pengganti kajian teknis dan arahan BPBD/instansi berwenang.</p>
            <p style={{ margin: 0, fontSize: 12 }}><b>BNPB InaRISK:</b> <a href="https://inarisk.bnpb.go.id/" target="_blank" rel="noreferrer">Portal resmi</a> · <b>BMKG:</b> <a href="https://www.bmkg.go.id/alerts/nowcast/id" target="_blank" rel="noreferrer">Peringatan dini cuaca</a></p>
          </div>
        </div>
      </section>
      <footer className="simiti-location-footer"><span><i /> {coordinateMode === "manual" ? "UJI KOORDINAT MANUAL" : "GPS AKTIF"} Â· DATA PEMERINTAH</span><span>Terakhir diperbarui {lastUpdated ? `${lastUpdated.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} WIB` : "Belum tersedia"}</span></footer>
    </main>
  );
}

