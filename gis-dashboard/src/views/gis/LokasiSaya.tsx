import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Circle, MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";

import L from "leaflet";

import "leaflet/dist/leaflet.css";

const API_URL = String(import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

/** Fetch yang tidak boleh menggantung UI terlalu lama. */
async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

const mitigationRouteCache = new Map<string, [number, number][]>();

// ============================================================
// SIMITI LOCAL RISK TABLES
// Mengikuti source layer risiko yang dipakai Kerawanan.tsx.
// Tidak lagi mengambil Analisis Ancaman dari BNPB InaRISK.
// ============================================================
const LOCAL_RISK_TABLES = [
  { key: "longsor", label: "Longsor", table: "risiko_longsor" },
  { key: "banjir", label: "Banjir", table: "risiko_banjir" },
  {
    key: "banjir_bandang",
    label: "Banjir Bandang",
    table: "risiko_banjir_bandang",
  },
  { key: "kekeringan", label: "Kekeringan", table: "risiko_kekeringan" },
  { key: "karhutla", label: "Karhutla", table: "risiko_karhutla" },
] as const;

function getAuthToken() {
  return (
    localStorage.getItem("smiti_token") ||
    sessionStorage.getItem("smiti_token") ||
    localStorage.getItem("adminToken") ||
    sessionStorage.getItem("adminToken") ||
    localStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    localStorage.getItem("authToken") ||
    ""
  );
}

function normalizeRiskLevel(value: unknown) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized.includes("tinggi")) return "Tinggi";
  if (normalized.includes("sedang")) return "Sedang";
  if (normalized.includes("rendah")) return "Rendah";
  return String(value || "").trim();
}

function riskScoreFromClass(value: unknown) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized.includes("tinggi")) return 3;
  if (normalized.includes("sedang")) return 2;
  if (normalized.includes("rendah")) return 1;
  return null;
}

async function fetchLocalRiskFactors(latitude: number, longitude: number) {
  // Sama seperti Kerawanan.tsx: source utama adalah /api/layers/:table/geojson.
  // Bbox dibuat kecil di sekitar titik GPS agar response hanya mengambil
  // polygon risiko di sekitar lokasi, tanpa mengubah endpoint/backend lama.
  const delta = 0.01;
  const bounds = [
    latitude - delta,
    longitude - delta,
    latitude + delta,
    longitude + delta,
  ].join(",");
  const token = getAuthToken();

  const results = await Promise.all(
    LOCAL_RISK_TABLES.map(async ({ key, label, table }) => {
      try {
        const url =
          `${API_URL}/api/layers/${table}/geojson` +
          `?bounds=${encodeURIComponent(bounds)}&zoom=16`;

        const response = await fetch(url, {
          headers: token
            ? { Authorization: `Bearer ${token}`, Accept: "application/json" }
            : { Accept: "application/json" },
        });

        const json = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(json?.message || `HTTP ${response.status}`);
        }

        const features = Array.isArray(json?.features) ? json.features : [];
        const feature =
          features.find((item: any) => item?.properties?.kelas) || features[0];
        const kelas = feature?.properties?.kelas ?? null;
        const normalizedClass = normalizeRiskLevel(kelas);
        const score = riskScoreFromClass(normalizedClass);

        return {
          key,
          label,
          level: score,
          status: normalizedClass || "",
          class: normalizedClass || null,
          source: `SIMITI PostgreSQL/PostGIS • ${table}`,
          available: Boolean(feature && score != null),
        } as RiskFactor;
      } catch (error) {
        console.warn(`Gagal membaca layer risiko lokal ${table}:`, error);
        return {
          key,
          label,
          level: null,
          status: "",
          class: null,
          source: `SIMITI PostgreSQL/PostGIS • ${table}`,
          available: false,
        } as RiskFactor;
      }
    }),
  );

  const complete = results.every((item) => item.available);
  const score = complete
    ? results.reduce((total, item) => total + Number(item.level || 0), 0)
    : null;

  let status = null;
  if (score != null) {
    if (score <= 7) status = "Aman";
    else if (score <= 10) status = "Siaga";
    else if (score <= 13) status = "Waspada";
    else status = "Bahaya";
  }

  return {
    success: true,
    source: "SIMITI PostgreSQL/PostGIS",
    analysisType: "local-risk-tables",
    risk: {
      status,
      score,
      index: score,
      minimum: 5,
      maximum: 15,
      complete,
      factors: results,
      methodology:
        "Membaca tabel risiko lokal melalui endpoint layer SIMITI seperti Kerawanan.tsx.",
    },
  } as BnpbLocationAssessment;
}

const LOCATION_STORAGE_KEY = "smiti.my-location.coordinates";

type RiskFactor = {
  key: string;
  label: string;
  status: string;
  level: number | null;
  class?: string | null;
  source?: string;
  available?: boolean;
};

type Assessment = {
  success: boolean;
  generatedAt?: string;
  source?: string;
  analysisType?: string;
  location?: {
    latitude: number;
    longitude: number;
    administrative?: {
      provinsi?: string | null;
      kabupaten?: string | null;
      kecamatan?: string | null;
      kelurahan?: string | null;
      desa?: string | null;
      das?: string | null;
      [key: string]: unknown;
    };
  };
  risk?: {
    status: string;
    index: number | null;
    scale?: string;
    factors?: RiskFactor[];
    [key: string]: unknown;
  };
  recommendations?: Array<{
    title: string;
    detail: string;
    priority: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

type Weather = {
  success: boolean;
  source?: string;
  generatedAt?: string;
  current?: Record<string, number | null> | null;
  current_units?: Record<string, string>;
  [key: string]: unknown;
};

type NearbyThreat = {
  key: string;
  label: string;
  status: string | null;
  level: number | null;
  distanceMeters: number | null;
  inside: boolean;
  source?: string;
};

type NearbyMitigation = {
  id: number | string;
  kode?: string | null;
  nama_kegiatan: string;
  jenis_kegiatan?: string | null;
  status?: string | null;
  instansi_pelaksana?: string | null;
  provinsi?: string | null;
  kabupaten_kota?: string | null;
  kecamatan?: string | null;
  desa_kelurahan?: string | null;
  latitude: number;
  longitude: number;
  distanceMeters: number | null;
};

type NearbyIncident = {
  id: number | string;
  disaster_type?: string | null;
  event_date?: string | null;
  latitude: number;
  longitude: number;
  distanceMeters: number | null;
};

type LocationProximity = {
  success: boolean;
  generatedAt?: string;
  source?: string;
  threats?: NearbyThreat[];
  mitigations?: NearbyMitigation[];
  incidents?: NearbyIncident[];
  summary?: {
    nearestThreatDistanceMeters?: number | null;
    nearestMitigationDistanceMeters?: number | null;
  };
  [key: string]: unknown;
};

type BnpbDisasterLayer = {
  key: string;
  label: string;
  category: string;
  inside: boolean;
  available: boolean;
  class: string | null;
  level?: string | null;
  value?: string | null;
  score?: number | null;
  field?: string | null;
  source?: string;
  error?: string | null;
};

type BnpbSafeLocation = {
  latitude: number;
  longitude: number;
  distanceMeters: number | null;
  bearingDegrees?: number | null;
  safe: boolean;
  verified: boolean;
  layers?: Array<{
    key: string;
    label: string;
    class: string | null;
    score: number | null;
    source?: string;
  }>;
};

type BnpbLocationAssessment = {
  success: boolean;
  generatedAt?: string;
  source?: string;
  analysisType?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  risk?: {
    status: string | null;
    score: number | null;
    index: number | null;
    minimum: number;
    maximum: number;
    complete: boolean;
    factors: RiskFactor[];
    methodology?: string;
  };
  disasters?: Array<{
    key: string;
    label: string;
    category: string;
    class: string | null;
    field?: string | null;
    source?: string;
  }>;
  layers?: BnpbDisasterLayer[];
  safeLocation?: BnpbSafeLocation | null;
  nearestCandidate?:
    | (BnpbSafeLocation & {
        recommendation?: string;
      })
    | null;
  summary?: {
    disasterCount?: number;
    layerCount?: number;
    availableLayerCount?: number;
    safeCandidateCount?: number;
    candidateCheckedCount?: number;
  };
};

type SavedLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  savedAt: string;
};

const gpsIcon = L.divIcon({
  className: "smiti-gps-marker",
  html: `
    <div style="
      width:42px;
      height:42px;
      border-radius:50%;
      background:rgba(14,165,233,.16);
      border:1px solid rgba(56,189,248,.65);
      display:flex;
      align-items:center;
      justify-content:center;
      box-shadow:
        0 0 0 9px rgba(14,165,233,.06),
        0 0 24px rgba(34,211,238,.35)
    ">
      <div style="
        width:16px;
        height:16px;
        border-radius:50%;
        background:#22d3ee;
        border:3px solid #08233e
      "></div>
    </div>
  `,
  iconSize: [42, 42],
  iconAnchor: [21, 21],
});

const mitigationIcon = L.divIcon({
  className: "smiti-mitigation-marker",
  html: `
    <div style="
      width:38px;
      height:38px;
      border-radius:12px;
      background:linear-gradient(145deg,#10b981,#047857);
      border:2px solid rgba(255,255,255,.92);
      display:flex;
      align-items:center;
      justify-content:center;
      color:#ecfdf5;
      font-size:17px;
      font-weight:900;
      box-shadow:0 7px 20px rgba(4,120,87,.38),0 0 0 5px rgba(16,185,129,.12);
    ">⌖</div>
  `,
  iconSize: [38, 38],
  iconAnchor: [19, 19],
});

const safeLocationIcon = L.divIcon({
  className: "smiti-safe-location-marker",
  html: `
    <div style="
      width:36px;
      height:36px;
      border-radius:50%;
      background:rgba(16,185,129,.18);
      border:2px solid rgba(52,211,153,.9);
      display:flex;
      align-items:center;
      justify-content:center;
      color:#6ee7b7;
      font-weight:900;
      font-size:18px;
      box-shadow:0 0 0 7px rgba(16,185,129,.07),0 0 20px rgba(16,185,129,.25);
    ">✓</div>
  `,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

function statusMeta(status?: string) {
  const value = String(status || "").toLowerCase();

  /*
   * API lama masih mungkin mengirim "Bahaya".
   * UI resmi SIMITI menggunakan "Rawan".
   */
  if (value.includes("bahaya") || value.includes("rawan")) {
    return {
      color: "text-red-300",
      bg: "bg-red-500/10",
      border: "border-red-500/30",
      dot: "bg-red-400",
      icon: "!",
    };
  }

  if (value.includes("waspada")) {
    return {
      color: "text-orange-300",
      bg: "bg-orange-500/10",
      border: "border-orange-500/30",
      dot: "bg-orange-400",
      icon: "!",
    };
  }

  if (value.includes("siaga")) {
    return {
      color: "text-amber-300",
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
      dot: "bg-amber-400",
      icon: "⚠",
    };
  }

  if (value.includes("aman")) {
    return {
      color: "text-emerald-300",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
      dot: "bg-emerald-400",
      icon: "✓",
    };
  }

  // Level faktor individual:
  // Tinggi = 3, Sedang = 2, Rendah = 1.
  if (value.includes("tinggi")) {
    return {
      color: "text-red-300",
      bg: "bg-red-500/10",
      border: "border-red-500/30",
      dot: "bg-red-400",
      icon: "!",
    };
  }

  if (value.includes("sedang")) {
    return {
      color: "text-amber-300",
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
      dot: "bg-amber-400",
      icon: "⚠",
    };
  }

  if (value.includes("rendah")) {
    return {
      color: "text-emerald-300",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
      dot: "bg-emerald-400",
      icon: "✓",
    };
  }

  return {
    color: "text-slate-300",
    bg: "bg-slate-500/10",
    border: "border-slate-700",
    dot: "bg-slate-400",
    icon: "•",
  };
}

function getRiskPercent(level: number | null) {
  if (level == null || !Number.isFinite(level)) {
    return null;
  }

  return Math.min(100, Math.max(0, (level / 3) * 100));
}

function MapResize() {
  const map = useMap();

  useEffect(() => {
    const timers = [
      window.setTimeout(() => map.invalidateSize(), 0),
      window.setTimeout(() => map.invalidateSize(), 150),
      window.setTimeout(() => map.invalidateSize(), 500),
    ];

    const handleResize = () => {
      map.invalidateSize();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));

      window.removeEventListener("resize", handleResize);
    };
  }, [map]);

  return null;
}

function RecenterMap({
  position,
  zoom,
}: {
  position: [number, number] | null;
  zoom: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!position) return;

    map.setView(position, zoom, {
      animate: true,
    });
  }, [map, position, zoom]);

  return null;
}

function MitigationRoute({
  position,
  destination,
}: {
  position: [number, number] | null;
  destination: [number, number] | null;
}) {
  const [route, setRoute] = useState<[number, number][]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const map = useMap();

  useEffect(() => {
    let cancelled = false;
    let idleId: number | null = null;
    let delayId: number | null = null;

    if (!position || !destination) {
      setRoute([]);
      setState("idle");
      return;
    }

    const cacheKey = `${position[0].toFixed(5)},${position[1].toFixed(5)}>${destination[0].toFixed(5)},${destination[1].toFixed(5)}`;
    const cached = mitigationRouteCache.get(cacheKey);
    if (cached?.length) {
      setRoute(cached);
      setState("ready");
      const bounds = L.latLngBounds(cached);
      bounds.extend(position);
      bounds.extend(destination);
      window.setTimeout(() => {
        if (!cancelled) map.fitBounds(bounds, { padding: [42, 42], maxZoom: 16 });
      }, 40);
      return () => { cancelled = true; };
    }

    const loadRoute = async () => {
      setState("loading");
      try {
        const coordinates = `${position[1]},${position[0]};${destination[1]},${destination[0]}`;
        const response = await fetchWithTimeout(
          `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`,
          { headers: { Accept: "application/json" } },
          8000,
        );

        const json = await response.json().catch(() => null);
        const coordinatesResult = json?.routes?.[0]?.geometry?.coordinates;

        if (!response.ok || !Array.isArray(coordinatesResult) || !coordinatesResult.length) {
          throw new Error("Rute jalan tidak tersedia.");
        }

        const latLngs = coordinatesResult
          .filter(
            (point: unknown) =>
              Array.isArray(point) &&
              Number.isFinite(Number(point[0])) &&
              Number.isFinite(Number(point[1])),
          )
          .map((point: [number, number]) => [Number(point[1]), Number(point[0])] as [number, number]);

        if (cancelled || !latLngs.length) return;

        mitigationRouteCache.set(cacheKey, latLngs);
        // Batasi cache agar tidak tumbuh tanpa batas selama sesi panjang.
        if (mitigationRouteCache.size > 20) {
          const firstKey = mitigationRouteCache.keys().next().value;
          if (firstKey) mitigationRouteCache.delete(firstKey);
        }

        setRoute(latLngs);
        setState("ready");

        const bounds = L.latLngBounds(latLngs);
        bounds.extend(position);
        bounds.extend(destination);
        window.setTimeout(() => {
          if (!cancelled) map.fitBounds(bounds, { padding: [42, 42], maxZoom: 16 });
        }, 80);
      } catch (error) {
        if (cancelled) return;
        console.warn("Gagal mengambil rute mitigasi terdekat:", error);
        setRoute([]);
        setState("error");
      }
    };

    // Jangan rebut bandwidth saat halaman baru selesai render.
    // Route adalah enhancement visual, bukan dependency analisis utama.
    delayId = window.setTimeout(() => {
      if ("requestIdleCallback" in window) {
        idleId = window.requestIdleCallback(() => void loadRoute(), { timeout: 1200 });
      } else {
        void loadRoute();
      }
    }, 180);

    return () => {
      cancelled = true;
      if (delayId != null) window.clearTimeout(delayId);
      if (idleId != null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [map, position, destination]);

  return (
    <>
      {route.length > 1 && (
        <>
          <Polyline
            positions={route}
            pathOptions={{
              color: "#064e3b",
              weight: 8,
              opacity: 0.34,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
          <Polyline
            positions={route}
            pathOptions={{
              color: "#10b981",
              weight: 4,
              opacity: 0.96,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        </>
      )}

      {position && <Marker position={position} icon={gpsIcon} />}
      {destination && <Marker position={destination} icon={mitigationIcon} />}

      <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-[500] flex items-end justify-between gap-2">
        <div className="rounded-xl border border-slate-700/80 bg-[#071426]/92 px-3 py-2 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-200">
            <span className="h-2 w-2 rounded-full bg-cyan-400" />
            Posisi Anda
            <span className="mx-0.5 text-slate-600">→</span>
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Mitigasi
          </div>
          <div className="mt-0.5 text-[9px] text-slate-500">
            {state === "loading"
              ? "Menghitung rute jalan…"
              : state === "ready"
                ? "Rute jalan tersedia"
                : state === "error"
                  ? "Rute jalan belum tersedia"
                  : "Menunggu titik lokasi"}
          </div>
        </div>
      </div>
    </>
  );
}

function RiskBar({ value }: { value: number | null }) {
  const safeValue =
    value == null || !Number.isFinite(value)
      ? null
      : Math.min(100, Math.max(0, value));

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
      <div
        className="h-full rounded-full bg-cyan-400 transition-all duration-500"
        style={{
          width: safeValue == null ? "0%" : `${safeValue}%`,
        }}
      />
    </div>
  );
}

function displayKey(key: string) {
  return String(key)
    .replace(/[\_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatNumber(value: number | null | undefined, decimals = 1) {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatDistance(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value < 1000) return `${Math.round(value)} m`;
  return `${new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(value / 1000)} km`;
}

function mitigationDistanceMeters(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number,
) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(latitude2 - latitude1);
  const dLon = toRad(longitude2 - longitude1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(latitude1)) *
      Math.cos(toRad(latitude2)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchMitigationFallback(
  latitude: number,
  longitude: number,
): Promise<NearbyMitigation[]> {
  const response = await fetchWithTimeout(
    `${API_URL}/api/lokasi-kegiatan`,
    {},
    8000,
  );

  if (!response.ok) {
    throw new Error(`Fallback lokasi kegiatan HTTP ${response.status}`);
  }

  const json = await response.json();
  const rows = Array.isArray(json)
    ? json
    : Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json?.rows)
        ? json.rows
        : [];

  return rows
    .map((row: any) => {
      const itemLat = Number(row.latitude);
      const itemLng = Number(row.longitude);

      if (!Number.isFinite(itemLat) || !Number.isFinite(itemLng)) return null;

      return {
        ...row,
        id: row.id ?? row.kode ?? `${itemLat}-${itemLng}`,
        nama_kegiatan: row.nama_kegiatan || "Lokasi mitigasi",
        latitude: itemLat,
        longitude: itemLng,
        distanceMeters: Math.round(
          mitigationDistanceMeters(latitude, longitude, itemLat, itemLng),
        ),
      } as NearbyMitigation;
    })
    .filter(Boolean)
    .sort(
      (a: NearbyMitigation, b: NearbyMitigation) =>
        Number(a.distanceMeters ?? Infinity) - Number(b.distanceMeters ?? Infinity),
    )
    .slice(0, 5);
}

function mitigationAddress(item: NearbyMitigation) {
  return [
    item.desa_kelurahan,
    item.kecamatan,
    item.kabupaten_kota,
    item.provinsi,
  ]
    .filter(Boolean)
    .join(" • ");
}

function statusDescription(status?: string) {
  const value = String(status || "").toLowerCase();

  if (value.includes("bahaya") || value.includes("rawan")) {
    return "Kondisi risiko sangat tinggi. Diperlukan kewaspadaan dan tindakan mitigasi segera.";
  }

  if (value.includes("waspada")) {
    return "Kondisi menunjukkan tingkat risiko yang perlu dipantau dan diantisipasi.";
  }

  if (value.includes("siaga")) {
    return "Kondisi memerlukan kesiapsiagaan terhadap potensi peningkatan risiko.";
  }

  if (value.includes("aman")) {
    return "Kondisi risiko relatif aman berdasarkan hasil analisis pada lokasi ini.";
  }

  return "Status risiko belum tersedia atau belum dapat ditentukan dari data analisis.";
}

/**
 * Persistence koordinat GPS.
 */
function saveLocation(
  latitude: number,
  longitude: number,
  accuracy: number | null,
) {
  try {
    const payload: SavedLocation = {
      latitude,
      longitude,
      accuracy,
      savedAt: new Date().toISOString(),
    };

    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Gagal menyimpan koordinat GPS:", error);
  }
}

function loadSavedLocation(): SavedLocation | null {
  try {
    const raw = localStorage.getItem(LOCATION_STORAGE_KEY);

    if (!raw) return null;

    const parsed = JSON.parse(raw);

    const latitude = Number(parsed?.latitude);

    const longitude = Number(parsed?.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    const accuracyValue = Number(parsed?.accuracy);

    return {
      latitude,
      longitude,
      accuracy: Number.isFinite(accuracyValue) ? accuracyValue : null,
      savedAt: typeof parsed?.savedAt === "string" ? parsed.savedAt : "",
    };
  } catch (error) {
    console.warn("Gagal membaca koordinat GPS tersimpan:", error);

    return null;
  }
}

export default function LokasiSaya() {
  const [position, setPosition] = useState<[number, number] | null>(null);

  const [accuracy, setAccuracy] = useState<number | null>(null);

  const [gpsState, setGpsState] = useState<
    "idle" | "requesting" | "ready" | "error"
  >("idle");

  const [gpsMessage, setGpsMessage] = useState(
    "Menunggu izin lokasi perangkat…",
  );

  const [assessment, setAssessment] = useState<Assessment | null>(null);

  const [weather, setWeather] = useState<Weather | null>(null);
  const [proximity, setProximity] = useState<LocationProximity | null>(null);
  const [bnpbLocation, setBnpbLocation] =
    useState<BnpbLocationAssessment | null>(null);

  const [assessmentState, setAssessmentState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");

  const [weatherState, setWeatherState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [proximityState, setProximityState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [bnpbState, setBnpbState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");

  const [errorMessage, setErrorMessage] = useState("");

  const [activePanel, setActivePanel] = useState<"risk" | "recommendation">(
    "risk",
  );

  const [mapZoom, setMapZoom] = useState(16);

  /**
   * Pulihkan koordinat terakhir terlebih dahulu.
   *
   * Ini membuat koordinat tidak hilang
   * ketika halaman di-refresh.
   */
  useEffect(() => {
    const saved = loadSavedLocation();

    if (!saved) return;

    setPosition([saved.latitude, saved.longitude]);

    setAccuracy(saved.accuracy);
    setMapZoom(16);

    setGpsState("ready");

    setGpsMessage(
      saved.savedAt
        ? `Lokasi tersimpan • ${new Date(saved.savedAt).toLocaleString(
            "id-ID",
          )}`
        : "Menggunakan koordinat GPS tersimpan",
    );
  }, []);

  const requestGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsState("error");
      setGpsMessage("Browser tidak mendukung Geolocation API.");
      return;
    }

    setGpsState("requesting");

    setGpsMessage("Mengambil koordinat GPS dengan akurasi tinggi…");

    setErrorMessage("");

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (
          !Number.isFinite(coords.latitude) ||
          !Number.isFinite(coords.longitude)
        ) {
          setGpsState("error");

          setGpsMessage("Koordinat GPS tidak valid.");

          return;
        }

        const latitude = coords.latitude;

        const longitude = coords.longitude;

        const gpsAccuracy = Number.isFinite(coords.accuracy)
          ? coords.accuracy
          : null;

        setPosition([latitude, longitude]);

        setAccuracy(gpsAccuracy);

        setMapZoom(16);

        /**
         * Persistence koordinat:
         *
         * Latitude
         * Longitude
         * Accuracy
         * Timestamp
         */
        saveLocation(latitude, longitude, gpsAccuracy);

        setGpsState("ready");

        setGpsMessage(
          gpsAccuracy != null
            ? `GPS aktif • akurasi ±${Math.round(gpsAccuracy)} m • tersimpan`
            : "GPS aktif • koordinat tersimpan",
        );
      },
      (error) => {
        setGpsState("error");

        setGpsMessage(
          error.code === 1
            ? "Izin lokasi ditolak. Aktifkan Location untuk situs ini."
            : error.code === 2
              ? "Lokasi perangkat tidak tersedia."
              : "Pengambilan GPS timeout. Coba lagi.",
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 5000,
      },
    );
  }, []);

  const analyzeLocation = useCallback(async (lat: number, lng: number) => {
    setAssessmentState("loading");

    setWeatherState("loading");
    setProximityState("loading");

    setErrorMessage("");

    const assessmentUrl =
      `${API_URL}/api/location-assessment?latitude=${encodeURIComponent(lat)}` +
      `&longitude=${encodeURIComponent(lng)}`;

    const weatherUrl =
      `${API_URL}/api/weather/current?latitude=${encodeURIComponent(lat)}` +
      `&longitude=${encodeURIComponent(lng)}`;
    const proximityUrl =
      `${API_URL}/api/location-proximity?latitude=${encodeURIComponent(lat)}` +
      `&longitude=${encodeURIComponent(lng)}&threatLimit=5&mitigationLimit=5&incidentLimit=5`;
    setBnpbState("loading");

    const [assessmentResult, weatherResult, proximityResult, bnpbResult] =
      await Promise.allSettled([
        fetchWithTimeout(assessmentUrl, {}, 12000),
        fetchWithTimeout(weatherUrl, {}, 10000),
        fetchWithTimeout(proximityUrl, {}, 12000),
        fetchLocalRiskFactors(lat, lng),
      ]);

    let assessmentFailed = false;

    if (assessmentResult.status === "fulfilled") {
      try {
        const response = assessmentResult.value;

        const json = await response.json();

        if (!response.ok || !json?.success) {
          throw new Error(json?.message || "Analisis lokasi gagal.");
        }

        setAssessment(json);

        setAssessmentState("ready");
      } catch (error) {
        assessmentFailed = true;

        setAssessmentState("error");

        setErrorMessage(
          error instanceof Error ? error.message : "Analisis lokasi gagal.",
        );
      }
    } else {
      assessmentFailed = true;

      setAssessmentState("error");

      setErrorMessage("Tidak dapat terhubung ke API analisis lokasi.");
    }

    if (weatherResult.status === "fulfilled") {
      try {
        const response = weatherResult.value;

        if (!response.ok) {
          throw new Error("API cuaca tidak tersedia.");
        }

        const json = await response.json();

        if (!json?.success) {
          throw new Error(json?.message || "Data cuaca tidak tersedia.");
        }

        setWeather(json);

        setWeatherState("ready");
      } catch {
        setWeatherState("error");
      }
    } else {
      setWeatherState("error");
    }

    if (proximityResult.status === "fulfilled") {
      try {
        const response = proximityResult.value;
        const json = await response.json();
        if (!response.ok || !json?.success) {
          throw new Error(
            json?.message || "Analisis kedekatan tidak tersedia.",
          );
        }

        // /api/location-proximity memang mengambil mitigasi dari
        // public.lokasi_kegiatan dengan syarat geom IS NOT NULL.
        // Jika data lama hanya memiliki latitude/longitude tetapi geom
        // belum terisi, gunakan endpoint CRUD lokasi kegiatan sebagai
        // fallback tanpa mengubah backend/GPS existing.
        let nextProximity = json as LocationProximity;

        if (!Array.isArray(nextProximity.mitigations) || !nextProximity.mitigations.length) {
          try {
            const fallbackMitigations = await fetchMitigationFallback(
              lat,
              lng,
            );

            if (fallbackMitigations.length) {
              nextProximity = {
                ...nextProximity,
                mitigations: fallbackMitigations,
                summary: {
                  ...(nextProximity.summary || {}),
                  mitigationCount: fallbackMitigations.length,
                  nearestMitigationDistanceMeters:
                    fallbackMitigations[0]?.distanceMeters ?? null,
                },
              };
              console.info(
                `LokasiSaya: fallback lokasi kegiatan menemukan ${fallbackMitigations.length} lokasi mitigasi.`,
              );
            }
          } catch (fallbackError) {
            console.warn(
              "LokasiSaya: fallback lokasi kegiatan gagal:",
              fallbackError,
            );
          }
        }

        setProximity(nextProximity);
        setProximityState("ready");
      } catch {
        // Jika endpoint proximity gagal total, tetap coba endpoint
        // lokasi kegiatan secara langsung.
        try {
          const fallbackMitigations = await fetchMitigationFallback(lat, lng);
          if (fallbackMitigations.length) {
            setProximity({
              success: true,
              source: "SIMITI /api/lokasi-kegiatan fallback",
              location: { latitude: lat, longitude: lng },
              threats: [],
              incidents: [],
              mitigations: fallbackMitigations,
              summary: {
                mitigationCount: fallbackMitigations.length,
                nearestMitigationDistanceMeters:
                  fallbackMitigations[0]?.distanceMeters ?? null,
              },
            });
            setProximityState("ready");
          } else {
            setProximity(null);
            setProximityState("error");
          }
        } catch {
          setProximity(null);
          setProximityState("error");
        }
      }
    } else {
      try {
        const fallbackMitigations = await fetchMitigationFallback(lat, lng);
        if (fallbackMitigations.length) {
          setProximity({
            success: true,
            source: "SIMITI /api/lokasi-kegiatan fallback",
            location: { latitude: lat, longitude: lng },
            threats: [],
            incidents: [],
            mitigations: fallbackMitigations,
            summary: {
              mitigationCount: fallbackMitigations.length,
              nearestMitigationDistanceMeters:
                fallbackMitigations[0]?.distanceMeters ?? null,
            },
          });
          setProximityState("ready");
        } else {
          setProximity(null);
          setProximityState("error");
        }
      } catch {
        setProximity(null);
        setProximityState("error");
      }
    }

    if (bnpbResult.status === "fulfilled") {
      try {
        // Data ancaman sekarang berasal dari tabel risiko lokal SIMITI,
        // dengan endpoint layer yang sama seperti Kerawanan.tsx.
        const json = bnpbResult.value;

        if (!json?.success) {
          throw new Error("Data risiko lokal SIMITI tidak tersedia.");
        }

        setBnpbLocation(json);
        setBnpbState("ready");
      } catch (error) {
        setBnpbLocation(null);
        setBnpbState("error");
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Pembacaan tabel risiko lokal gagal.",
        );
      }
    } else {
      setBnpbLocation(null);
      setBnpbState("error");
    }

    void assessmentFailed;
  }, []);

  /**
   * Tetap otomatis meminta GPS terbaru.
   *
   * Koordinat tersimpan sudah dipulihkan
   * lebih dahulu sehingga halaman tetap
   * memiliki titik ketika request GPS
   * sedang berjalan.
   */
  useEffect(() => {
    requestGps();
  }, [requestGps]);

  useEffect(() => {
    if (!position) return;

    analyzeLocation(position[0], position[1]);
  }, [position, analyzeLocation]);

  // MY LOKASI wajib menggunakan hasil BNPB InaRISK sebagai sumber utama.
  // API assessment lama hanya menjadi data tambahan, bukan sumber scoring.
  const factors = bnpbLocation?.risk?.factors || [];

  const recommendations = assessment?.recommendations || [];
  const nearbyThreats = proximity?.threats || [];
  const nearbyMitigations = proximity?.mitigations || [];
  const nearbyIncidents = proximity?.incidents || [];
  const nearestMitigation = nearbyMitigations[0] || null;
  const nearestSafeLocation = bnpbLocation?.safeLocation || null;

  /**
   * Analisis MY Lokasi:
   *
   * Seluruh input berasal dari faktor
   * risiko aktual yang dikembalikan API.
   *
   * Jika salah satu parameter belum tersedia,
   * skor/status rumus tidak dibuat-buat.
   */
  const apiRiskStatus = bnpbLocation?.risk?.status || "";
  const apiRiskIndex = bnpbLocation?.risk?.index ?? null;

  /**
   * MY LOKASI — SCORING RESMI
   *
   * Tepat 5 parameter:
   * 1. Longsor
   * 2. Banjir
   * 3. Banjir Bandang
   * 4. Kekeringan
   * 5. Karhutla
   *
   * Bobot: Tinggi = 3, Sedang = 2, Rendah = 1.
   * Total minimum = 5, maksimum = 15.
   * Status: 5–7 Aman, 8–10 Siaga, 11–13 Waspada, 14–15 Bahaya.
   *
   * Scoring dilakukan dari faktor tabel risiko lokal SIMITI yang sudah diterima.
   * Fungsi GPS, API, peta, weather, proximity, dan endpoint lain tetap.
   */
  const myLokasiRisk = useMemo(() => {
    const parameterDefinitions = [
      { key: "longsor", label: "Longsor" },
      { key: "banjir", label: "Banjir" },
      { key: "banjir_bandang", label: "Banjir Bandang" },
      { key: "kekeringan", label: "Kekeringan" },
      { key: "karhutla", label: "Karhutla" },
    ] as const;

    const normalizeKey = (value: unknown) =>
      String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");

    const scoreFromLevel = (value: unknown) => {
      const normalized = String(value || "")
        .toLowerCase()
        .trim();
      if (normalized.includes("tinggi")) return 3;
      if (normalized.includes("sedang")) return 2;
      if (normalized.includes("rendah")) return 1;
      return null;
    };

    const factorByKey = new Map<string, RiskFactor>();

    for (const factor of factors) {
      const key = normalizeKey(factor.key);
      const labelKey = normalizeKey(factor.label);

      if (key === "longsor" || labelKey === "longsor")
        factorByKey.set("longsor", factor);
      else if (key === "banjir" || labelKey === "banjir")
        factorByKey.set("banjir", factor);
      else if (
        key === "banjir_bandang" ||
        labelKey === "banjir_bandang" ||
        labelKey.includes("banjir_bandang")
      ) {
        factorByKey.set("banjir_bandang", factor);
      } else if (key === "kekeringan" || labelKey === "kekeringan") {
        factorByKey.set("kekeringan", factor);
      } else if (key === "karhutla" || labelKey === "karhutla") {
        factorByKey.set("karhutla", factor);
      }
    }

    const items = parameterDefinitions.map(({ key, label }) => {
      const factor = factorByKey.get(key) || null;
      const level = factor?.status || factor?.class || null;
      const score = scoreFromLevel(level);

      return {
        parameter: label,
        factor,
        level,
        value: factor?.level ?? null,
        score,
        available: Boolean(
          factor && factor.available !== false && score != null,
        ),
      };
    });

    const complete = items.every((item) => item.available);
    const score = complete
      ? items.reduce((total, item) => total + Number(item.score), 0)
      : null;

    let status: string | null = null;
    if (score != null) {
      if (score <= 7) status = "Aman";
      else if (score <= 10) status = "Siaga";
      else if (score <= 13) status = "Waspada";
      else status = "Bahaya";
    }

    return {
      complete,
      score,
      minimum: 5,
      maximum: 15,
      status,
      items,
      missing: items
        .filter((item) => !item.available)
        .map((item) => item.parameter),
    };
  }, [factors]);

  /**
   * Status utama:
   *
   * 1. Prioritas hasil rumus MY Lokasi
   *    jika 5 parameter lengkap.
   *
   * 2. Fallback ke status API.
   *
   * 3. Bahaya dari API dinormalisasi
   *    menjadi Rawan.
   */
  const overall =
    myLokasiRisk.complete && myLokasiRisk.status
      ? myLokasiRisk.status
      : apiRiskStatus;

  const meta = statusMeta(overall);

  const index = apiRiskIndex;

  const admin = assessment?.location?.administrative || {};

  const address = useMemo(
    () =>
      [
        admin.kelurahan || admin.desa,
        admin.kecamatan,
        admin.kabupaten,
        admin.provinsi,
      ]
        .filter(Boolean)
        .join(" • ") || "Administrasi belum terpetakan",
    [admin],
  );

  const weatherItems = useMemo(() => {
    const current = weather?.current || {};

    return Object.keys(current)
      .filter((key) => current[key] !== null && current[key] !== undefined)
      .map((key) => ({
        key,
        label: displayKey(key),
        value: current[key],
        unit: weather?.current_units?.[key] || "",
      }));
  }, [weather]);

  const myLokasiScore = myLokasiRisk.score;
  const myLokasiMaximum = 15;
  const myLokasiPercent =
    myLokasiScore == null
      ? 0
      : Math.min(100, Math.max(0, ((myLokasiScore - 5) / 10) * 100));

  const dynamicRiskDetails = useMemo(() => {
    if (!assessment?.risk) return [];

    return Object.entries(assessment.risk)
      .filter(([key]) => !["status", "index", "scale", "factors"].includes(key))
      .filter(([, value]) =>
        ["string", "number", "boolean"].includes(typeof value),
      )
      .map(([key, value]) => ({
        key,
        label: displayKey(key),
        value: String(value),
      }));
  }, [assessment]);

  return (
    <div className="min-h-screen bg-[#06111f] text-slate-100">
      <header className="sticky top-0 z-[1000] border-b border-slate-800/80 bg-[#071426]/95 px-4 py-3 backdrop-blur-xl md:px-6">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-xl">
              ◎
            </div>

            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">
                SIMITI • Spatial Decision Support
              </div>

              <h1 className="truncate text-lg font-semibold tracking-tight">
                Cek Lokasi Saya
              </h1>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] space-y-4 p-4 md:p-5">
        {errorMessage && (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-xs text-red-200">
            <span>⚠ {errorMessage}</span>

            {position && (
              <button
                onClick={() => analyzeLocation(position[0], position[1])}
                className="rounded-md border border-red-400/20 px-2 py-1 font-semibold hover:bg-red-400/10"
              >
                Coba lagi
              </button>
            )}
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#08172a] shadow-2xl">
            <div className="relative h-[540px]">
              <MapContainer
                center={position || [0, 0]}
                zoom={position ? mapZoom : 2}
                minZoom={2}
                scrollWheelZoom
                className="h-full w-full"
              >
                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <MapResize />

                <RecenterMap position={position} zoom={mapZoom} />

                {position && accuracy != null && (
                  <Circle
                    center={position}
                    radius={accuracy}
                    pathOptions={{
                      color: "#22d3ee",
                      fillColor: "#0ea5e9",
                      fillOpacity: 0.08,
                      weight: 1,
                    }}
                  />
                )}

                {position && <Marker position={position} icon={gpsIcon} />}
                {nearestSafeLocation && (
                  <Marker
                    position={[
                      nearestSafeLocation.latitude,
                      nearestSafeLocation.longitude,
                    ]}
                    icon={safeLocationIcon}
                  />
                )}
              </MapContainer>

              <div className="pointer-events-none absolute left-4 top-4 z-[500] rounded-xl border border-slate-700 bg-[#071426]/90 px-3 py-2 shadow-xl backdrop-blur-md">
                <div className="text-xs font-semibold">Lokasi GPS Anda</div>

                <div className="mt-0.5 text-[10px] text-slate-400">
                  {position
                    ? `${position[0].toFixed(6)}, ${position[1].toFixed(
                        6,
                      )} • EPSG:4326`
                    : "Menunggu koordinat…"}
                </div>
              </div>

              {position && (
                <div className="pointer-events-none absolute bottom-4 left-4 z-[500] rounded-xl border border-slate-700 bg-[#071426]/90 px-3 py-2 text-[10px] text-slate-300 backdrop-blur-md">
                  ● Titik GPS
                  {accuracy != null && (
                    <span className="ml-4">
                      ○ Radius ±{Math.round(accuracy)} m
                    </span>
                  )}
                </div>
              )}

              {position && (nearbyThreats.length > 0 || nearestMitigation) && (
                <div className="pointer-events-none absolute right-4 top-4 z-[500] w-[280px] space-y-2">
                  {nearbyThreats.slice(0, 2).map((threat) => {
                    const tm = statusMeta(threat.status || "");
                    return (
                      <div
                        key={threat.key}
                        className={`rounded-xl border ${tm.border} ${tm.bg} px-3 py-2 shadow-xl backdrop-blur-md`}
                      >
                        <div className="text-[9px] uppercase tracking-wider text-slate-500">
                          Ancaman terdekat
                        </div>
                        <div className={`mt-1 text-xs font-bold ${tm.color}`}>
                          {threat.label}
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-300">
                          {threat.inside
                            ? "Posisi berada pada area ancaman"
                            : formatDistance(threat.distanceMeters)}
                        </div>
                      </div>
                    );
                  })}
                  {nearestMitigation && (
                    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 shadow-xl backdrop-blur-md">
                      <div className="text-[9px] uppercase tracking-wider text-slate-500">
                        Mitigasi terdekat
                      </div>
                      <div className="mt-1 text-xs font-bold text-emerald-200">
                        {nearestMitigation.nama_kegiatan}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-300">
                        {formatDistance(nearestMitigation.distanceMeters)}
                      </div>
                    </div>
                  )}
                  {nearestSafeLocation && (
                    <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 shadow-xl backdrop-blur-md">
                      <div className="text-[9px] uppercase tracking-wider text-emerald-300">
                        Lokasi aman terdekat
                      </div>
                      <div className="mt-1 text-xs font-bold text-emerald-100">
                        {nearestSafeLocation.nama_kegiatan}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-300">
                        {formatDistance(nearestSafeLocation.distanceMeters)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!position && (
                <div className="absolute inset-0 z-[600] flex items-center justify-center bg-[#06111f]/70 backdrop-blur-[2px]">
                  <div className="max-w-sm rounded-2xl border border-slate-700 bg-[#08172a]/95 p-6 text-center shadow-2xl">
                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400/10 text-2xl text-cyan-300">
                      ⌖
                    </div>

                    <h2 className="font-semibold">
                      Lokasi perangkat diperlukan
                    </h2>

                    <p className="mt-2 text-xs leading-5 text-slate-400">
                      Titik GPS menjadi input analisis spasial.
                    </p>

                    <button
                      onClick={requestGps}
                      className="mt-4 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400"
                    >
                      Izinkan & Ambil Lokasi
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-[#08172a] p-4 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold">Status Risiko</div>

                <span className="rounded-full border border-slate-700 px-2 py-1 text-[10px] text-slate-400">
                  {assessment?.risk?.scale || "API"}
                </span>
              </div>

              <div
                className={`rounded-xl border ${meta.border} ${meta.bg} p-4`}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${meta.border} text-2xl ${meta.color}`}
                  >
                    {bnpbState === "loading" || assessmentState === "loading"
                      ? "…"
                      : meta.icon}
                  </div>

                  <div>
                    <div className={`text-2xl font-black ${meta.color}`}>
                      {overall || "—"}
                    </div>

                    <div className="mt-1 text-[11px] leading-4 text-slate-400">
                      {statusDescription(overall)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-[#08172a] p-4 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">
                    Analisis Ancaman BNPB
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">
                    Nilai dan klasifikasi dibaca langsung dari layer BNPB yang
                    aktif.
                  </div>
                </div>
                <span className="rounded-full border border-slate-700 px-2 py-1 text-[9px] text-slate-500">
                  SUMBER BNPB
                </span>
              </div>

              <div className="mt-3 space-y-1.5">
                {myLokasiRisk.items.map((item) => (
                  <div
                    key={item.parameter}
                    className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/20 px-2.5 py-2"
                  >
                    <span className="text-[10px] text-slate-400">
                      {item.parameter}
                    </span>
                    <span className="text-[10px] font-bold text-slate-200">
                      <span className="flex items-center gap-2">
                        <span>{item.level || "Belum tersedia"}</span>
                        <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[9px] font-black text-cyan-200">
                          {item.score != null ? item.score : "—"}
                        </span>
                      </span>
                    </span>
                  </div>
                ))}
                {!myLokasiRisk.items.length && (
                  <div className="rounded-lg border border-dashed border-slate-700 p-3 text-center text-[10px] text-slate-500">
                    Menunggu data ancaman BNPB…
                  </div>
                )}
              </div>

              <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/30 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">
                    Skor MY Lokasi
                  </span>
                  <span className="text-sm font-black text-slate-100">
                    {myLokasiRisk.score == null
                      ? "Belum lengkap"
                      : `${myLokasiRisk.score} / 15`}
                  </span>
                </div>
                {myLokasiRisk.status && (
                  <div
                    className={`mt-1 text-[10px] font-bold ${statusMeta(myLokasiRisk.status).color}`}
                  >
                    {myLokasiRisk.status}
                  </div>
                )}
              </div>

              {myLokasiRisk.missing.length > 0 && (
                <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-[9px] leading-4 text-amber-200">
                  Layer BNPB belum tersedia: {myLokasiRisk.missing.join(", ")}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-800 bg-[#08172a] p-4 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold">
                  Faktor Risiko di Lokasi
                </div>

                <span className="text-[10px] text-slate-500">
                  {factors.length} faktor
                </span>
              </div>

              <div className="max-h-[350px] space-y-2 overflow-auto pr-1">
                {factors.map((factor) => {
                  const fm = statusMeta(factor.status);

                  const percent = getRiskPercent(factor.level);

                  return (
                    <div
                      key={factor.key}
                      className="rounded-xl border border-slate-800/80 bg-slate-950/20 p-3"
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${fm.dot}`}
                        />

                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-slate-200">
                            {factor.label || factor.key}
                          </div>

                          {factor.class && (
                            <div className="mt-1 text-[10px] text-slate-500">
                              {factor.class}
                            </div>
                          )}

                          {percent != null && (
                            <div className="mt-2">
                              <RiskBar value={percent} />
                            </div>
                          )}

                          {factor.source && (
                            <div className="mt-1 text-[9px] text-slate-600">
                              {factor.source}
                            </div>
                          )}
                        </div>

                        <span
                          className={`rounded-md px-2 py-1 text-[10px] font-bold ${fm.bg} ${fm.color}`}
                        >
                          {factor.status || "—"}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {!factors.length && (
                  <div className="rounded-xl border border-dashed border-slate-700 p-5 text-center text-xs text-slate-500">
                    Tidak ada faktor risiko yang dikembalikan API.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-[#08172a] p-4 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold">Cuaca Saat Ini</div>

                <span className="text-[10px] text-slate-500">
                  {weather?.source || "API"}
                </span>
              </div>

              {weatherItems.length ? (
                <div className="grid grid-cols-2 gap-2">
                  {weatherItems.map((item) => (
                    <div
                      key={item.key}
                      className="rounded-xl bg-slate-950/30 p-3"
                    >
                      <div className="truncate text-[10px] text-slate-500">
                        {item.label}
                      </div>

                      <div className="mt-1 text-lg font-bold">
                        {formatNumber(item.value, 1)}

                        <span className="ml-1 text-[10px] font-normal text-slate-500">
                          {item.unit}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-700 p-4 text-center text-xs text-slate-500">
                  {weatherState === "loading"
                    ? "Mengambil data cuaca…"
                    : "Data cuaca tidak tersedia."}
                </div>
              )}
            </div>
          </aside>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.05fr_.95fr]">
          <div className="rounded-2xl border border-slate-800 bg-[#08172a] p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[.16em] text-cyan-300">
                  Spatial context
                </div>

                <div className="mt-1 text-sm font-semibold">
                  Koordinat & Administrasi
                </div>
              </div>

              <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-300">
                {gpsState === "ready" ? "GPS ACTIVE" : gpsState.toUpperCase()}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {[
                ["Latitude", position?.[0]?.toFixed(7) || "—"],
                ["Longitude", position?.[1]?.toFixed(7) || "—"],
                [
                  "Akurasi GPS",
                  accuracy != null ? `±${Math.round(accuracy)} meter` : "—",
                ],
                ["DAS", admin.das || "Belum terpetakan"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-slate-800 bg-slate-950/20 p-3"
                >
                  <div className="text-[10px] text-slate-500">{label}</div>

                  <div className="mt-1 text-xs font-semibold">{value}</div>
                </div>
              ))}

              <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-3 md:col-span-2">
                <div className="text-[10px] text-slate-500">
                  Wilayah Administratif
                </div>

                <div className="mt-1 text-xs leading-5 text-slate-200">
                  {address}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#08172a] p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[.16em] text-cyan-300">
                  Risk intelligence
                </div>

                <div className="mt-1 text-sm font-semibold">
                  Indeks Risiko Lokasi
                </div>
              </div>

              <span className="text-[10px] text-slate-500">
                {assessment?.risk?.scale || "Scale dari API"}
              </span>
            </div>

            <div className="flex items-center gap-5 rounded-xl border border-slate-800 bg-slate-950/20 p-4">
              <div
                className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: `conic-gradient(#22d3ee ${
                    myLokasiPercent * 3.6
                  }deg, #14253a 0deg)`,
                }}
              >
                <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-[#08172a]">
                  <div className="text-2xl font-black">
                    {index == null ? "—" : formatNumber(index, 1)}
                  </div>

                  <div className="text-[9px] text-slate-500">
                    {assessment?.risk?.scale || "API INDEX"}
                  </div>
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className={`text-lg font-bold ${meta.color}`}>
                  {overall || "Belum tersedia"}
                </div>

                <div className="mt-2">
                  <div className="mb-1 flex items-center justify-between text-[9px] text-slate-500">
                    <span>API Risk Index</span>

                    <span>{index == null ? "—" : formatNumber(index, 1)}</span>
                  </div>

                  <RiskBar
                    value={
                      index == null
                        ? null
                        : Math.min(100, Math.max(0, Number(index)))
                    }
                  />
                </div>

                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-2">
                  <div className="text-[9px] uppercase tracking-wider text-slate-500">
                    MY Lokasi • data BNPB
                  </div>

                  <div className="mt-1 flex items-center justify-between gap-3">
                    <span className="text-[10px] text-slate-400">
                      {myLokasiRisk.complete
                        ? "5 parameter • Tinggi 3 • Sedang 2 • Rendah 1"
                        : "Menunggu 5 parameter risiko lengkap"}
                    </span>

                    <span
                      className={`text-sm font-black ${
                        statusMeta(myLokasiRisk.status || "").color
                      }`}
                    >
                      {myLokasiScore == null
                        ? "—"
                        : `${myLokasiScore}/${myLokasiMaximum}`}
                    </span>
                  </div>
                </div>

                {dynamicRiskDetails.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {dynamicRiskDetails.map((item) => (
                      <div
                        key={item.key}
                        className="rounded-lg bg-slate-950/30 px-2.5 py-2"
                      >
                        <div className="text-[9px] text-slate-500">
                          {item.label}
                        </div>

                        <div className="mt-0.5 truncate text-[10px] font-semibold text-slate-200">
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 text-[10px] text-slate-500">
                  Analysis type: {assessment?.analysisType || "—"} • Source:{" "}
                  {assessment?.source || "—"}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_.8fr]">
          <div className="rounded-2xl border border-slate-800 bg-[#08172a] p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[.16em] text-red-300">
                  BNPB InaRISK • GPS Identify
                </div>
                <div className="mt-1 text-sm font-semibold">
                  Bencana di Lokasi Saya
                </div>
              </div>
              <span className="text-[10px] text-slate-500">
                {bnpbState.toUpperCase()}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {(bnpbLocation?.layers || []).map((layer) => {
                const layerMeta = statusMeta(layer.class || "");
                return (
                  <div
                    key={layer.key}
                    className={`rounded-xl border ${layer.inside ? layerMeta.border : "border-slate-800"} ${
                      layer.inside ? layerMeta.bg : "bg-slate-950/20"
                    } p-3`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold">
                          {layer.label}
                        </div>
                        <div className="mt-1 text-[9px] text-slate-500">
                          BNPB • {layer.category}
                        </div>
                      </div>
                      <span
                        className={`rounded-md px-2 py-1 text-[9px] font-bold ${
                          layer.inside
                            ? `${layerMeta.bg} ${layerMeta.color}`
                            : "bg-emerald-400/10 text-emerald-300"
                        }`}
                      >
                        {layer.inside
                          ? layer.class || "TERPETAKAN"
                          : "TIDAK TERPETAKAN"}
                      </span>
                    </div>
                    {layer.error && (
                      <div className="mt-2 text-[9px] text-amber-300">
                        Layer tidak dapat di-query.
                      </div>
                    )}
                  </div>
                );
              })}

              {!bnpbLocation?.layers?.length && (
                <div className="rounded-xl border border-dashed border-slate-700 p-5 text-center text-xs text-slate-500 md:col-span-2">
                  {bnpbState === "loading"
                    ? "Mengidentifikasi lokasi terhadap layer BNPB…"
                    : "Belum ada hasil identifikasi BNPB."}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 shadow-xl">
            <div className="text-[10px] font-bold uppercase tracking-[.16em] text-emerald-300">
              Safe location intelligence
            </div>
            <div className="mt-1 text-sm font-semibold">
              Lokasi Terdekat yang Aman
            </div>

            {nearestSafeLocation ? (
              <div className="mt-4 rounded-xl border border-emerald-500/20 bg-slate-950/20 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-lg text-emerald-300">
                    ✓
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-emerald-200">
                      Titik aman terdekat dari BNPB
                    </div>
                    <div className="mt-1 text-[10px] text-slate-400">
                      Koordinat hasil pencarian spasial pada layer BNPB
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                      <div className="rounded-lg bg-slate-950/30 p-2">
                        <div className="text-slate-500">Latitude</div>
                        <div className="mt-1 font-bold text-slate-100">
                          {nearestSafeLocation.latitude.toFixed(7)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-slate-950/30 p-2">
                        <div className="text-slate-500">Longitude</div>
                        <div className="mt-1 font-bold text-slate-100">
                          {nearestSafeLocation.longitude.toFixed(7)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 text-lg font-black text-slate-100">
                      {formatDistance(nearestSafeLocation.distanceMeters)}
                    </div>
                    {nearestSafeLocation.bearingDegrees != null && (
                      <div className="mt-1 text-[10px] text-slate-400">
                        Arah dari GPS:{" "}
                        {Math.round(nearestSafeLocation.bearingDegrees)}°
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-3 rounded-lg border border-emerald-500/10 bg-emerald-500/5 px-3 py-2 text-[9px] leading-4 text-emerald-200">
                  Titik dipilih dari pencarian spasial dan diverifikasi ulang
                  terhadap seluruh layer BNPB yang dikonfigurasi.
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-slate-700 p-5 text-center text-xs text-slate-500">
                {bnpbState === "loading"
                  ? "Mencari kandidat lokasi aman terdekat…"
                  : "Belum ditemukan lokasi yang dapat diverifikasi aman."}
              </div>
            )}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-800 bg-[#08172a] p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[.16em] text-red-300">
                  Spatial threat proximity
                </div>
                <div className="mt-1 text-sm font-semibold">
                  Ancaman di Sekitar Lokasi
                </div>
              </div>
              <span className="text-[10px] text-slate-500">
                {proximityState.toUpperCase()}
              </span>
            </div>
            <div className="space-y-2">
              {nearbyThreats.map((item) => {
                const tm = statusMeta(item.status || "");
                return (
                  <div
                    key={item.key}
                    className="rounded-xl border border-slate-800 bg-slate-950/20 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold">
                          {item.label}
                        </div>
                        <div className="mt-1 text-[10px] text-slate-500">
                          {item.source || "Risk layer PostGIS"}
                        </div>
                      </div>
                      <span
                        className={`rounded-md px-2 py-1 text-[10px] font-bold ${tm.bg} ${tm.color}`}
                      >
                        {item.status || "—"}
                      </span>
                    </div>
                    <div className="mt-2 text-sm font-black text-slate-200">
                      {item.inside
                        ? "DI AREA RISIKO"
                        : formatDistance(item.distanceMeters)}
                    </div>
                  </div>
                );
              })}
              {!nearbyThreats.length && (
                <div className="rounded-xl border border-dashed border-slate-700 p-5 text-center text-xs text-slate-500">
                  {proximityState === "loading"
                    ? "Menganalisis kedekatan ancaman…"
                    : "Tidak ada data ancaman terdekat yang dapat dipetakan."}
                </div>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-[#08172a] shadow-xl shadow-emerald-950/10">
            <div className="border-b border-slate-800/80 px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-[.16em] text-emerald-300">
                    Mitigation proximity
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-100">
                    Mitigasi Terdekat
                  </div>
                  <div className="mt-1 text-[10px] leading-4 text-slate-500">
                    Jalur dari posisi GPS Anda menuju lokasi mitigasi terdekat.
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-bold text-emerald-300">
                  {nearbyMitigations.length} lokasi
                </span>
              </div>
            </div>

            {nearestMitigation && position ? (
              <>
                <div className="relative h-[310px] overflow-hidden border-b border-slate-800/80 bg-slate-950">
                  <MapContainer
                    center={[
                      nearestMitigation.latitude,
                      nearestMitigation.longitude,
                    ]}
                    zoom={15}
                    minZoom={11}
                    scrollWheelZoom={false}
                    dragging
                    className="h-full w-full"
                  >
                    <TileLayer
                      attribution="&copy; OpenStreetMap contributors"
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <MapResize />
                    <MitigationRoute
                      position={position}
                      destination={[
                        nearestMitigation.latitude,
                        nearestMitigation.longitude,
                      ]}
                    />
                  </MapContainer>

                  <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-xl border border-slate-700/80 bg-[#071426]/94 px-3 py-2 shadow-xl backdrop-blur-md">
                    <div className="text-[9px] font-bold uppercase tracking-[.14em] text-slate-500">
                      Rute mitigasi
                    </div>
                    <div className="mt-0.5 text-[11px] font-semibold text-slate-100">
                      GPS Anda → Tujuan
                    </div>
                  </div>

                  <div className="pointer-events-none absolute right-3 top-3 z-[500] rounded-xl border border-emerald-500/20 bg-emerald-950/80 px-3 py-2 text-right shadow-xl backdrop-blur-md">
                    <div className="text-[9px] uppercase tracking-wider text-emerald-300/80">
                      Jarak
                    </div>
                    <div className="mt-0.5 text-sm font-black text-emerald-200">
                      {formatDistance(nearestMitigation.distanceMeters)}
                    </div>
                  </div>
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[9px] font-bold uppercase tracking-[.14em] text-slate-500">
                        Tujuan mitigasi
                      </div>
                      <div className="mt-1 text-sm font-bold leading-5 text-slate-100">
                        {nearestMitigation.nama_kegiatan}
                      </div>
                    </div>
                    <div className="shrink-0 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-center">
                      <div className="text-[9px] uppercase tracking-wider text-emerald-300/70">
                        Status
                      </div>
                      <div className="mt-0.5 text-[10px] font-bold text-emerald-200">
                        {nearestMitigation.status || "Tersedia"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/25 p-3">
                      <div className="text-[9px] uppercase tracking-wider text-slate-500">
                        Jenis kegiatan
                      </div>
                      <div className="mt-1 text-[11px] font-semibold text-slate-200">
                        {nearestMitigation.jenis_kegiatan || "Kegiatan mitigasi"}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/25 p-3">
                      <div className="text-[9px] uppercase tracking-wider text-slate-500">
                        Jarak dari GPS
                      </div>
                      <div className="mt-1 text-[11px] font-semibold text-emerald-300">
                        {formatDistance(nearestMitigation.distanceMeters)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 rounded-xl border border-slate-800 bg-slate-950/25 p-3">
                    <div className="text-[9px] uppercase tracking-wider text-slate-500">
                      Area
                    </div>
                    <div className="mt-1 text-[10px] leading-4 text-slate-300">
                      {mitigationAddress(nearestMitigation) ||
                        "Lokasi administratif belum tersedia"}
                    </div>
                  </div>

                  {nearbyMitigations.length > 1 && (
                    <div className="mt-4 border-t border-slate-800/80 pt-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[9px] font-bold uppercase tracking-[.14em] text-slate-500">
                          Lokasi lainnya
                        </span>
                        <span className="text-[9px] text-slate-600">
                          {nearbyMitigations.length - 1} lokasi
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {nearbyMitigations.slice(1, 4).map((item) => (
                          <div
                            key={String(item.id)}
                            className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/20 px-3 py-2.5"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-[10px] font-semibold text-slate-300">
                                {item.nama_kegiatan}
                              </div>
                              <div className="mt-0.5 truncate text-[9px] text-slate-600">
                                {item.jenis_kegiatan || "Kegiatan mitigasi"}
                              </div>
                            </div>
                            <div className="shrink-0 text-[10px] font-bold text-emerald-300">
                              {formatDistance(item.distanceMeters)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="p-4">
                <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/20 p-6 text-center">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-lg text-emerald-300">
                    ⌖
                  </div>
                  <div className="mt-3 text-xs font-semibold text-slate-300">
                    {proximityState === "loading"
                      ? "Mencari lokasi mitigasi terdekat…"
                      : "Belum ada lokasi mitigasi terdekat."}
                  </div>
                  <div className="mt-1 text-[10px] leading-4 text-slate-600">
                    Peta dan jalur akan tampil otomatis setelah koordinat GPS
                    serta data mitigasi tersedia.
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {nearestSafeLocation && (
          <section className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4 shadow-xl">
            <div className="text-[10px] font-bold uppercase tracking-[.16em] text-emerald-300">
              Rekomendasi keselamatan
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-100">
              Dari titik GPS Anda, lokasi aman terdekat adalah{" "}
              <span className="text-emerald-200">
                {nearestSafeLocation.nama_kegiatan}
              </span>{" "}
              ({formatDistance(nearestSafeLocation.distanceMeters)}).
            </div>
            <div className="mt-1 text-xs text-slate-400">
              Titik rekomendasi sudah diverifikasi terhadap layer BNPB yang
              digunakan.
            </div>
          </section>
        )}

        {nearestMitigation && (
          <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 shadow-xl">
            <div className="text-[10px] font-bold uppercase tracking-[.16em] text-emerald-300">
              Nearest mitigation recommendation
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-100">
              {nearestMitigation.nama_kegiatan} berada{" "}
              {formatDistance(nearestMitigation.distanceMeters)} dari posisi
              Anda.
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {mitigationAddress(nearestMitigation) ||
                "Lokasi administratif belum tersedia"}
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-slate-800 bg-[#08172a] p-4 shadow-xl">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[.16em] text-cyan-300">
                Enterprise decision support
              </div>

              <div className="mt-1 text-sm font-semibold">
                Risk & Recommendation
              </div>
            </div>

            <div className="flex rounded-lg border border-slate-800 bg-slate-950/30 p-1">
              <button
                onClick={() => setActivePanel("risk")}
                className={`rounded-md px-3 py-1.5 text-[10px] font-semibold ${
                  activePanel === "risk"
                    ? "bg-cyan-400/10 text-cyan-200"
                    : "text-slate-500"
                }`}
              >
                Risk
              </button>

              <button
                onClick={() => setActivePanel("recommendation")}
                className={`rounded-md px-3 py-1.5 text-[10px] font-semibold ${
                  activePanel === "recommendation"
                    ? "bg-cyan-400/10 text-cyan-200"
                    : "text-slate-500"
                }`}
              >
                Recommendation
              </button>
            </div>
          </div>

          {activePanel === "risk" ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {factors.map((factor) => (
                <div
                  key={factor.key}
                  className="rounded-xl border border-slate-800 bg-slate-950/20 p-3"
                >
                  <div className="text-[10px] text-slate-500">
                    {factor.label || factor.key}
                  </div>

                  <div className="mt-2 text-sm font-bold">
                    {factor.class || factor.status || "—"}
                  </div>

                  <div className="mt-2">
                    <RiskBar value={getRiskPercent(factor.level)} />
                  </div>

                  {factor.source && (
                    <div className="mt-2 text-[9px] text-slate-600">
                      {factor.source}
                    </div>
                  )}
                </div>
              ))}

              {!factors.length && (
                <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-xs text-slate-500 md:col-span-2 xl:col-span-4">
                  Tidak ada detail risiko dari API.
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {recommendations.map((item, idx) => (
                <div
                  key={`${item.title}-${idx}`}
                  className="rounded-xl border border-slate-800 bg-slate-950/20 p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300">
                      ✓
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold">
                          {item.title}
                        </div>

                        <span className="rounded-md bg-amber-400/10 px-2 py-1 text-[9px] font-bold text-amber-300">
                          {item.priority || "—"}
                        </span>
                      </div>

                      <p className="mt-1 text-xs leading-5 text-slate-400">
                        {item.detail}
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              {!recommendations.length && (
                <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-xs text-slate-500 md:col-span-2">
                  Tidak ada rekomendasi yang dikembalikan API untuk titik ini.
                </div>
              )}
            </div>
          )}
        </section>

        <footer className="flex flex-col gap-1 border-t border-slate-800/80 pt-3 text-[10px] text-slate-500 md:flex-row md:items-center md:justify-between">
          <span>
            {position
              ? `GPS ${position[0].toFixed(6)}, ${position[1].toFixed(6)}`
              : "GPS belum tersedia"}

            {" • "}

            {assessment?.source || "SIMITI API"}
          </span>

          <span>
            {assessment?.generatedAt
              ? `Risk diperbarui ${new Date(
                  assessment.generatedAt,
                ).toLocaleString("id-ID")}`
              : "Menunggu data analisis"}
          </span>
        </footer>
      </main>
    </div>
  );
}
