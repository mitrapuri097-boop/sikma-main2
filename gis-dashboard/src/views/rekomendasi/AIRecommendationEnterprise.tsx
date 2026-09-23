import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { booleanPointInPolygon, point, centroid } from "@turf/turf";
const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  Crosshair,
  Download,
  Droplets,
  Flame,
  Layers3,
  MapPinned,
  Mountain,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Wind,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Navigation,
} from "lucide-react";
import "leaflet/dist/leaflet.css";
import "./AIRecommendationEnterprise.css";

type Hazard = "Banjir" | "Longsor" | "Karhutla" | "Kekeringan";

const getSmitiToken = (): string | null => {
  // Keep this page aligned with the authentication storage used by
  // other SIMITI GIS pages. Prefer a non-expired JWT when several keys exist.
  const keys = ["smiti_token", "adminToken", "token", "access_token", "authToken"];
  const tokens: string[] = [];

  for (const key of keys) {
    const local = localStorage.getItem(key);
    const session = sessionStorage.getItem(key);
    if (local) tokens.push(local);
    if (session && session !== local) tokens.push(session);
  }

  const getExp = (token: string): number | null => {
    try {
      const part = token.split(".")[1];
      if (!part) return null;
      const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(normalized));
      return Number.isFinite(Number(payload?.exp)) ? Number(payload.exp) : null;
    } catch {
      return null;
    }
  };

  const now = Math.floor(Date.now() / 1000);
  return (
    tokens.find((token) => {
      const exp = getExp(token);
      return exp === null || exp > now + 15;
    }) ||
    tokens[0] ||
    null
  );
};

const smitiFetch = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> => {
  const token = getSmitiToken();
  const headers = new Headers(init.headers || {});

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
};

const hazardMeta: Record<
  Hazard,
  { icon: typeof Droplets; markerClass: string; label: string }
> = {
  Banjir: { icon: Droplets, markerClass: "hazard-flood", label: "Banjir" },
  Longsor: {
    icon: Mountain,
    markerClass: "hazard-landslide",
    label: "Longsor",
  },
  Karhutla: { icon: Flame, markerClass: "hazard-fire", label: "Karhutla" },
  Kekeringan: {
    icon: Wind,
    markerClass: "hazard-drought",
    label: "Kekeringan",
  },
};

type Incident = {
  id: number | string;
  title?: string;
  category?: string;
  date?: string;
  location?: string;
  das?: string;
  das_id?: number | string;
  das_name?: string;
  das_area_km2?: number | string;
  longitude?: number | string;
  latitude?: number | string;
  curah_hujan?: number | string | null;
  description?: string;
};

type Candidate = Incident & {
  hazard: Hazard;
  lat: number;
  lng: number;
  area: string;
};

type AdminLevel = "provinsi" | "kabupaten" | "kecamatan";
type AdminBoundary = {
  id: string;
  level: AdminLevel;
  label: string;
  provinsi?: string;
  kab_kota?: string;
  kecamatan?: string;
  feature: any;
};

type BnpbFloodEvidence = {
  available: boolean;
  value: number | null;
  rawValue?: string | null;
  service: string;
  queriedAt?: string;
  geometryType?: "point" | "polygon";
  catalogItemCount?: number;
  coverageNote?: string;
  error?: string;
};

const ADMIN_ZOOM_LEVELS: Array<{ min: number; level: AdminLevel }> = [
  { min: 10, level: "kecamatan" },
  { min: 7, level: "kabupaten" },
  { min: 0, level: "provinsi" },
];

const adminLevelForZoom = (zoom: number): AdminLevel =>
  ADMIN_ZOOM_LEVELS.find((item) => zoom >= item.min)?.level || "provinsi";

const adminLabel = (level: AdminLevel, props: any) => {
  if (level === "provinsi") return props?.provinsi || props?.name || "Provinsi";
  if (level === "kabupaten")
    return (
      props?.kab_kota || props?.kabupaten || props?.name || "Kabupaten/Kota"
    );
  return props?.kecamatan || props?.name || "Kecamatan";
};

const hazardMarkerColor = (hazard: Hazard | null) => {
  if (hazard === "Banjir") return "#2563eb";
  if (hazard === "Longsor") return "#7c3aed";
  if (hazard === "Karhutla") return "#ef4444";
  if (hazard === "Kekeringan") return "#eab308";
  return "#f97316";
};

const hazardMarkerGlyph = (hazard: Hazard | null) => {
  if (hazard === "Banjir") return "💧";
  if (hazard === "Longsor") return "⛰";
  if (hazard === "Karhutla") return "🔥";
  if (hazard === "Kekeringan") return "〽";
  return "◆";
};

type AiRecommendation = {
  diagnosis?: string;
  risk_level?: string;
  primary_drivers?: string[];
  confidence?: number;
  verification_needed?: boolean;
  verification_reason?: string;
  recommendations?: Array<{
    rank: number;
    intervention_id: string;
    intervention: string;
    priority_score: number;
    urgency: string;
    expected_effect: string;
    why: string;
    evidence: string[];
    implementation_notes: string;
  }>;
  meta?: { model?: string; source?: string; generated_at?: string };
};

const normalizeHazard = (category = ""): Hazard | null => {
  const value = category.toLowerCase();
  if (value.includes("banjir")) return "Banjir";
  if (value.includes("longsor") || value.includes("erosi")) return "Longsor";
  if (value.includes("kebakaran") || value.includes("karhutla"))
    return "Karhutla";
  if (value.includes("kekeringan")) return "Kekeringan";
  return null;
};

const toNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const riskClass = (value = "") => {
  const v = value.toLowerCase();
  if (v.includes("tinggi") || v.includes("high")) return "risk-high";
  if (v.includes("sedang") || v.includes("medium")) return "risk-medium";
  return "risk-low";
};

function Brand() {
  return (
    <div className="simiti-map-brand">
      <div className="simiti-brand-logo">
        <ShieldCheck size={22} />
      </div>
      <div>
        <strong>Sistem Informasi Mitigasi dan Adaptasi</strong>
        <span>Bencana Hidrometeorologi</span>
      </div>
    </div>
  );
}

export default function AIRecommendationEnterprise() {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const boundaryLayerRef = useRef<L.LayerGroup | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Boundary administratif di halaman ini memakai geometry dari
  // /api/areas/search saat wilayah dipilih. Jangan memanggil endpoint
  // /api/layers/*/geojson karena endpoint tersebut membutuhkan can_view
  // per-layer dan dapat menghasilkan 403 untuk user biasa.
  const [adminLevel, setAdminLevel] = useState<AdminLevel>("provinsi");
  const [adminBoundaries, setAdminBoundaries] = useState<AdminBoundary[]>([]);

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedId, setSelectedId] = useState<number | string | null>(null);
  const [hazards, setHazards] = useState<Set<Hazard>>(
    new Set(["Banjir", "Longsor", "Karhutla", "Kekeringan"]),
  );
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showLayers, setShowLayers] = useState(true);
  const [leftOpen, setLeftOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [layersCount, setLayersCount] = useState<number | null>(null);
  const [aiResult, setAiResult] = useState<AiRecommendation | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [areaSearchQuery, setAreaSearchQuery] = useState("");
  const [areaSearchResults, setAreaSearchResults] = useState<any[]>([]);
  const [showAreaResults, setShowAreaResults] = useState(false);
  const [areaSearchLoading, setAreaSearchLoading] = useState(false);
  const [selectedAreaBoundary, setSelectedAreaBoundary] =
    useState<AdminBoundary | null>(null);

  const [selectedDas, setSelectedDas] = useState<any | null>(null);
  const [dasLoading, setDasLoading] = useState(false);
  const [dasError, setDasError] = useState("");
  const [bnpbFlood, setBnpbFlood] = useState<BnpbFloodEvidence>({
    available: false,
    value: null,
    service: "InaRISK BNPB — layer_risiko_banjir",
  });
  const [bnpbFloodLoading, setBnpbFloodLoading] = useState(false);

  const fetchDasForArea = useCallback(async (area: AdminBoundary | null) => {
    if (!area?.feature) {
      setSelectedDas(null);
      setDasError("");
      return;
    }

    setDasLoading(true);
    setDasError("");

    try {
      const props = area.feature?.properties || {};
      const params = new URLSearchParams();
      if (props?.provinsi) params.set("provinsi", String(props.provinsi));
      if (props?.kab_kota) params.set("kabupaten", String(props.kab_kota));
      if (props?.kecamatan) params.set("kecamatan", String(props.kecamatan));

      if (![props?.provinsi, props?.kab_kota, props?.kecamatan].some(Boolean)) {
        setSelectedDas(null);
        setDasError("Wilayah administratif belum lengkap untuk pencarian DAS.");
        return;
      }

      const response = await smitiFetch(
        `${API_URL}/api/das/by-location?${params.toString()}`,
        { headers: { Accept: "application/json" } },
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload = await response.json();
      const rows = Array.isArray(payload?.dasList) ? payload.dasList : [];

      setSelectedDas(rows[0] || null);
      if (!rows.length) {
        setDasError("DAS belum ditemukan untuk wilayah terpilih.");
      }
    } catch (error: any) {
      console.warn("Gagal mengambil DAS:", error);
      setSelectedDas(null);
      setDasError("Data DAS belum tersedia dari backend untuk wilayah ini.");
    } finally {
      setDasLoading(false);
    }
  }, []);

  const fetchBnpbFloodForArea = useCallback(async (area: AdminBoundary | null) => {
    if (!area?.feature?.geometry) {
      setBnpbFlood({
        available: false,
        value: null,
        service: "InaRISK BNPB — layer_risiko_banjir",
      });
      return;
    }

    setBnpbFloodLoading(true);
    setBnpbFlood({
      available: false,
      value: null,
      service: "InaRISK BNPB — layer_risiko_banjir",
    });

    try {
      const service =
        "https://gis.bnpb.go.id/server/rest/services/inarisk/layer_risiko_banjir/ImageServer/identify";
      const geometry = {
        ...area.feature.geometry,
        spatialReference: { wkid: 4326 },
      };
      const params = new URLSearchParams({
        f: "json",
        geometry: JSON.stringify(geometry),
        geometryType: "esriGeometryPolygon",
        sr: "4326",
        returnGeometry: "false",
        returnCatalogItems: "true",
      });

      // IMPORTANT: polygon geometry can be very large. Sending it in the URL
      // causes HTTP 414 (URI Too Long). ArcGIS REST accepts POST form data,
      // so keep the full geometry in the request body instead.
      const response = await fetch(service, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: params.toString(),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload = await response.json();
      const raw =
        payload?.value ??
        payload?.properties?.value ??
        payload?.catalogItems?.features?.[0]?.attributes?.PixelValue ??
        null;
      const value = raw === null || raw === "" ? null : Number(raw);
      const catalogItemCount = Array.isArray(
        payload?.catalogItems?.features,
      )
        ? payload.catalogItems.features.length
        : 0;

      setBnpbFlood({
        available: Number.isFinite(value),
        value: Number.isFinite(value) ? value : null,
        rawValue: raw == null ? null : String(raw),
        service: "InaRISK BNPB — layer_risiko_banjir",
        queriedAt: new Date().toISOString(),
        geometryType: "polygon",
        catalogItemCount,
        coverageNote:
          "Nilai raster yang dikembalikan ImageServer merupakan nilai representatif pada centroid geometri; catalog item menunjukkan raster yang beririsan dengan wilayah terpilih.",
        error:
          Number.isFinite(value)
            ? undefined
            : "Nilai raster BNPB tidak tersedia untuk wilayah terpilih.",
      });
    } catch (error: any) {
      console.warn("Gagal mengambil indeks risiko banjir BNPB:", error);
      setBnpbFlood({
        available: false,
        value: null,
        service: "InaRISK BNPB — layer_risiko_banjir",
        geometryType: "polygon",
        error: "Data risiko banjir BNPB gagal dibaca untuk wilayah terpilih.",
      });
    } finally {
      setBnpbFloodLoading(false);
    }
  }, []);

  const candidates = useMemo<Candidate[]>(
    () =>
      incidents
        .map((item) => {
          const lat = toNumber(item.latitude);
          const lng = toNumber(item.longitude);
          const hazard = normalizeHazard(item.category);
          if (lat === null || lng === null || !hazard) return null;
          return {
            ...item,
            lat,
            lng,
            hazard,
            area: item.location || item.das || "Lokasi kejadian",
          };
        })
        .filter(Boolean) as Candidate[],
    [incidents],
  );

  const selectedAreaIncidents = useMemo(() => {
    if (!selectedAreaBoundary?.feature) return [];
    return candidates.filter((candidate) => {
      try {
        return booleanPointInPolygon(
          point([candidate.lng, candidate.lat]),
          selectedAreaBoundary.feature as any,
        );
      } catch {
        return false;
      }
    });
  }, [candidates, selectedAreaBoundary]);


  const filteredCandidates = useMemo(
    () =>
      candidates.filter((item) => {
        const text = `${item.title || ""} ${item.area} ${item.category || ""} ${
          item.das || ""
        }`.toLowerCase();
        return hazards.has(item.hazard) && text.includes(query.toLowerCase());
      }),
    [candidates, hazards, query],
  );

  const selected =
    candidates.find((item) => String(item.id) === String(selectedId)) || null;

  const floodEvidence = useMemo(() => {
    const floodIncidents = selectedAreaIncidents.filter(
      (item) => item.hazard === "Banjir",
    );
    const rainfall = floodIncidents
      .map((item) => toNumber(item.curah_hujan))
      .filter((value): value is number => value !== null);

    return {
      count: floodIncidents.length,
      avgRainfall: rainfall.length
        ? rainfall.reduce((sum, value) => sum + value, 0) / rainfall.length
        : null,
      maxRainfall: rainfall.length ? Math.max(...rainfall) : null,
      locations: Array.from(
        new Set(
          floodIncidents
            .map((item) => item.area || item.location || item.title)
            .filter(Boolean),
        ),
      ).slice(0, 4),
    };
  }, [selectedAreaIncidents]);

  const floodRecommendations = useMemo(() => {
    const dasName =
      selectedDas?.nama_das ||
      selectedDas?.name ||
      selectedDas?.das_name ||
      selectedDas?.label ||
      selectedAreaIncidents.find((item) => item.das)?.das ||
      "DAS belum teridentifikasi";

    const recommendations: Array<{ title: string; status: string; text: string; source: string }> = [];
    const rain = floodEvidence.maxRainfall ?? floodEvidence.avgRainfall;
    const bnpb = bnpbFlood.value;

    if (bnpb != null) {
      recommendations.push({
        title: "Gunakan evidence BNPB",
        status: "DATA TERSEDIA",
        text: `Indeks risiko banjir BNPB terbaca (${bnpb.toFixed(3)}). Gunakan sebagai salah satu evidence untuk menentukan prioritas mitigasi wilayah terpilih.`,
        source: "BNPB / InaRISK",
      });
    } else {
      recommendations.push({
        title: "Verifikasi risiko BNPB",
        status: "VERIFIKASI",
        text: "Indeks risiko banjir BNPB belum terbaca pada titik tengah wilayah; jangan menjadikan nilai BNPB sebagai dasar tunggal sebelum data berhasil diverifikasi.",
        source: "BNPB / InaRISK — belum terbaca",
      });
    }

    if (selectedDas) {
      recommendations.push({
        title: "Mitigasi berbasis DAS",
        status: "EVIDENCE DAS",
        text: `Kelola banjir berbasis DAS ${dasName}: kurangi limpasan di hulu, tingkatkan retensi/infiltrasi, dan jaga kapasitas saluran menuju hilir.`,
        source: `DAS — ${dasName}`,
      });
    } else {
      recommendations.push({
        title: "Identifikasi DAS",
        status: "DATA BELUM TERSEDIA",
        text: "Identifikasi DAS terlebih dahulu agar intervensi tidak berhenti pada titik terdampak dan dapat mencakup sumber limpasan dari hulu.",
        source: "SIMITI DAS — belum teridentifikasi",
      });
    }

    if (rain !== null) {
      recommendations.push({
        title: "Monitoring curah hujan",
        status: "DATA TERSEDIA",
        text: `Curah hujan terdata mencapai ${rain.toFixed(1)} (satuan mengikuti sumber); tingkatkan pemantauan hujan dan tinggi muka air ketika hujan meningkat.`,
        source: "Data kejadian SIMITI",
      });
    } else {
      recommendations.push({
        title: "Integrasikan curah hujan",
        status: "DATA BELUM TERSEDIA",
        text: "Data curah hujan kejadian belum tersedia; hubungkan data hujan historis/real-time sebelum menetapkan ambang operasional lokal.",
        source: "Curah hujan — belum tersedia",
      });
    }

    if (floodEvidence.count > 0) {
      recommendations.push({
        title: "Validasi riwayat kejadian",
        status: "EVIDENCE KEJADIAN",
        text: `Terdapat ${floodEvidence.count} kejadian banjir pada data SIMITI di wilayah terpilih; verifikasi titik berulang untuk prioritas drainase, sungai, dan jalur evakuasi.`,
        source: "SIMITI / Data Kejadian",
      });
    }

    if (bnpb != null && rain !== null && selectedDas) {
      recommendations.push({
        title: "Gabungkan evidence",
        status: "MULTI-EVIDENCE",
        text: "Gabungkan risiko BNPB, karakter DAS, dan curah hujan dalam satu matriks prioritas; gunakan verifikasi lapangan untuk keputusan desain/intervensi fisik.",
        source: "BNPB + DAS + Curah Hujan",
      });
    }

    return recommendations;
  }, [
    selectedDas,
    selectedAreaIncidents,
    floodEvidence,
    bnpbFlood.value,
  ]);



  const locateCandidateAdmin = useCallback(
    (candidate: Candidate, boundaries: AdminBoundary[]) => {
      const pt = point([candidate.lng, candidate.lat]);
      const match = boundaries.find((boundary) => {
        try {
          return booleanPointInPolygon(pt, boundary.feature as any);
        } catch {
          return false;
        }
      });
      return match || null;
    },
    [],
  );

  const groupCandidatesByBoundary = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        label: string;
        level: AdminLevel;
        boundary: AdminBoundary | null;
        candidates: Candidate[];
        center: [number, number];
        hazards: Set<Hazard>;
      }
    >();

    const visibleCandidates = selectedAreaBoundary?.feature
      ? filteredCandidates.filter((candidate) => {
          try {
            return booleanPointInPolygon(
              point([candidate.lng, candidate.lat]),
              selectedAreaBoundary.feature as any,
            );
          } catch {
            return false;
          }
        })
      : [];

    visibleCandidates.forEach((candidate) => {
      const boundary = locateCandidateAdmin(candidate, adminBoundaries);
      const fallbackLabel = candidate.area || "Lokasi kejadian";
      const key =
        boundary?.id || `${adminLevel}:fallback:${fallbackLabel.toLowerCase()}`;
      const existing = groups.get(key);
      if (existing) {
        existing.candidates.push(candidate);
        existing.hazards.add(candidate.hazard);
        const [lat, lng] = existing.center;
        const n = existing.candidates.length;
        existing.center = [
          (lat * (n - 1) + candidate.lat) / n,
          (lng * (n - 1) + candidate.lng) / n,
        ];
        return;
      }
      groups.set(key, {
        key,
        label: boundary?.label || fallbackLabel,
        level: adminLevel,
        boundary: boundary || null,
        candidates: [candidate],
        center: [candidate.lat, candidate.lng],
        hazards: new Set([candidate.hazard]),
      });
    });

    return Array.from(groups.values());
  }, [
    filteredCandidates,
    adminBoundaries,
    adminLevel,
    locateCandidateAdmin,
    selectedAreaBoundary,
  ]);

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    try {
      const response = await smitiFetch(`${API_URL}/api/kejadian/list`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const rows = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
          ? payload.data
          : [];
      setIncidents(rows);
      // Initial state is map-only: do not auto-select an incident.
      setSelectedId(null);
      setAiResult(null);
      setDrawerOpen(false);
    } catch (error) {
      console.error("Gagal mengambil data kejadian:", error);
      setIncidents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLayerCount = useCallback(async () => {
    try {
      const response = await smitiFetch(`${API_URL}/api/layers`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return;
      const data = await response.json();
      const groups = ["kerawanan", "mitigasiAdaptasi", "lainnya", "kejadian"];
      setLayersCount(
        groups.reduce(
          (total, key) =>
            total + (Array.isArray(data?.[key]) ? data[key].length : 0),
          0,
        ),
      );
    } catch {
      setLayersCount(null);
    }
  }, []);

  const requestAi = useCallback(async (candidate: Candidate | null) => {
    if (!candidate) {
      setAiResult(null);
      return;
    }
    setAiLoading(true);
    setAiError("");
    try {
      const response = await smitiFetch(
        `${API_URL}/api/ai/mitigation-recommendation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            context: {
              selected_region: candidate.area,
              hazard: candidate.hazard.toLowerCase(),
              incident_id: candidate.id,
              incident_title: candidate.title,
              category_source: candidate.category,
              event_date: candidate.date,
              das:
                candidate.das ||
                selectedDas?.nama_das ||
                selectedDas?.name ||
                selectedDas?.das_name ||
                null,
              das_id: selectedDas?.id ?? candidate.das_id ?? null,
              bnpb_flood_risk_index: bnpbFlood.value,
              bnpb_flood_risk_source: bnpbFlood.service,
              rainfall_average: floodEvidence.avgRainfall,
              rainfall_maximum: floodEvidence.maxRainfall,
              flood_event_count: floodEvidence.count,
              latitude: candidate.lat,
              longitude: candidate.lng,
              curah_hujan: candidate.curah_hujan,
              description: candidate.description,
              source: "SIMITI live spatial evidence",
            },
          }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || `HTTP ${response.status}`);
      }
      setAiResult(data);
    } catch (error: any) {
      setAiResult(null);
      setAiError(error?.message || "AI recommendation gagal.");
    } finally {
      setAiLoading(false);
    }
  }, [selectedDas, bnpbFlood, floodEvidence]);

  useEffect(() => {
    void fetchIncidents();
    void fetchLayerCount();
  }, [fetchIncidents, fetchLayerCount]);

  useEffect(() => {
    if (!selected) return;
    void requestAi(selected);
    setDrawerOpen(true);
  }, [selectedId, requestAi]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
    }).setView([-2.5, 118], 5);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      minZoom: 3,
    }).addTo(map);

    L.control.zoom({ position: "topright" }).addTo(map);

    markerLayerRef.current = L.layerGroup().addTo(map);
    boundaryLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    const syncAdminLevel = () => {
      const nextLevel = adminLevelForZoom(map.getZoom());
      setAdminLevel((current) => (current === nextLevel ? current : nextLevel));
    };
    map.on("zoomend", syncAdminLevel);

    const resize = () => map.invalidateSize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      map.off("zoomend", syncAdminLevel);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      map.remove();
      mapInstanceRef.current = null;
      markerLayerRef.current = null;
      boundaryLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = markerLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    // First view is intentionally clean: hazards appear only after a
    // province / kabupaten / kecamatan is selected.
    if (!selectedAreaBoundary) return;

    groupCandidatesByBoundary.forEach((group) => {
      const first = group.candidates[0];
      if (!first) return;
      const isSelected = group.candidates.some(
        (item) => String(item.id) === String(selectedId),
      );
      const hazardList = Array.from(group.hazards);
      const dominantHazard = hazardList.length === 1 ? hazardList[0] : null;
      const meta = dominantHazard ? hazardMeta[dominantHazard] : null;
      const markerClass = meta?.markerClass || "hazard-mixed";
      const markerColor = hazardMarkerColor(dominantHazard);
      const count = group.candidates.length;
      const size = count >= 100 ? 58 : count >= 10 ? 52 : 46;
      const icon = L.divIcon({
        className: "simiti-admin-group-marker-wrap",
        html: `
          <div class="simiti-admin-group-marker ${markerClass} ${
            isSelected ? "selected" : ""
          }" style="
            width:${size}px;height:${size}px;border-radius:50%;
            background:${markerColor};border:3px solid rgba(255,255,255,.96);
            box-shadow:${isSelected ? "0 0 0 6px rgba(37,99,235,.18)," : ""} 0 5px 16px rgba(15,23,42,.34);
            display:flex;flex-direction:column;align-items:center;justify-content:center;
            color:#fff;font-family:Inter,ui-sans-serif,system-ui,sans-serif;
            cursor:pointer;box-sizing:border-box;
          ">
            <span style="font-size:${size >= 52 ? 15 : 13}px;line-height:1">${hazardMarkerGlyph(dominantHazard)}</span>
            <strong style="font-size:${size >= 52 ? 15 : 13}px;line-height:1.1;margin-top:2px;font-weight:900;text-shadow:0 1px 2px rgba(0,0,0,.25)">${count}</strong>
          </div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const marker = L.marker(group.center, { icon });
      const hazardText = hazardList.join(" · ");
      marker.bindTooltip(
        `<strong>${escapeHtml(group.label)}</strong><br/>${count} kejadian<br/>${escapeHtml(
          hazardText,
        )}`,
        {
          direction: "top",
          offset: [0, -(size / 2)],
          className: "simiti-tooltip",
        },
      );

      marker.on("click", () => {
        const selectedCandidate =
          group.candidates.find(
            (item) => String(item.id) === String(selectedId),
          ) || first;
        setSelectedId(selectedCandidate.id);
        setDrawerOpen(true);
        if (group.boundary?.feature) {
          try {
            const bounds = L.geoJSON(group.boundary.feature).getBounds();
            if (bounds.isValid()) {
              map.fitBounds(bounds, {
                padding: [90, 90],
                maxZoom: Math.max(map.getZoom(), 11),
              });
              return;
            }
          } catch {
            // fallback to the incident point below
          }
        }
        map.flyTo(group.center, Math.max(map.getZoom(), 10), { duration: 0.8 });
      });

      marker.addTo(layer);
    });
  }, [groupCandidatesByBoundary, selectedId, selectedAreaBoundary]);

  useEffect(() => {
    const layer = boundaryLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    const drawBoundary = (boundary: AdminBoundary, forceSelected = false) => {
      try {
        const isSelected =
          forceSelected || selectedAreaBoundary?.id === boundary.id;
        const boundaryLayer = L.geoJSON(boundary.feature, {
          interactive: true,
          style: {
            color: isSelected ? "#0f766e" : "#64748b",
            weight: isSelected ? 3 : adminLevel === "provinsi" ? 1.6 : 1,
            opacity: isSelected
              ? 0.95
              : adminLevel === "provinsi"
                ? 0.38
                : 0.22,
            fillColor: isSelected ? "#14b8a6" : "#94a3b8",
            fillOpacity: isSelected ? 0.12 : 0.02,
          },
          onEachFeature: (_feature, layerItem) => {
            layerItem.on({
              mouseover: () => {
                if (!isSelected) {
                  (layerItem as L.Path).setStyle({
                    weight: 2,
                    opacity: 0.6,
                    fillOpacity: 0.05,
                  });
                }
              },
              mouseout: () => {
                if (!isSelected) {
                  (layerItem as L.Path).setStyle({
                    weight: adminLevel === "provinsi" ? 1.6 : 1,
                    opacity: adminLevel === "provinsi" ? 0.38 : 0.22,
                    fillOpacity: 0.02,
                  });
                }
              },
              click: () => {
                setSelectedAreaBoundary(boundary);
                setSelectedId(null);
                setAiResult(null);
                setSelectedDas(null);
                setDasError("");
                setDrawerOpen(true);
                void fetchDasForArea(boundary);
                void fetchBnpbFloodForArea(boundary);
                setAreaSearchQuery(boundary.label);
                const bounds = boundaryLayer.getBounds();
                if (bounds.isValid()) {
                  mapInstanceRef.current?.fitBounds(bounds, {
                    padding: [90, 90],
                    maxZoom: adminLevel === "provinsi" ? 8 : 12,
                  });
                }
              },
            });
            layerItem.bindTooltip(escapeHtml(boundary.label), {
              sticky: true,
              className: "simiti-tooltip",
            });
          },
        }).addTo(layer);
      } catch {
        // Ignore malformed boundary geometry from legacy GIS layers.
      }
    };

    adminBoundaries.forEach((boundary) => drawBoundary(boundary));

    // Keep the selected parent area visible while the map zooms into its children.
    if (
      selectedAreaBoundary &&
      !adminBoundaries.some((item) => item.id === selectedAreaBoundary.id)
    ) {
      drawBoundary(selectedAreaBoundary, true);
    }
  }, [adminBoundaries, adminLevel, selectedAreaBoundary]);

  const fetchDasForSearchArea = async (area: any) => {
    const params = new URLSearchParams();
    if (area?.provinsi) params.set("provinsi", String(area.provinsi));
    if (area?.kab_kota) params.set("kabupaten", String(area.kab_kota));
    if (area?.kecamatan) params.set("kecamatan", String(area.kecamatan));

    if (!params.toString()) return null;

    try {
      const response = await smitiFetch(
        `${API_URL}/api/das/by-location?${params.toString()}`,
        { headers: { Accept: "application/json" } },
      );
      if (!response.ok) return null;

      const payload = await response.json();
      const rows = Array.isArray(payload?.dasList) ? payload.dasList : [];

      return rows[0] || null;
    } catch {
      return null;
    }
  };

  const searchAreas = async (value: string) => {
    const q = value.trim();
    if (q.length < 2) {
      setAreaSearchResults([]);
      setShowAreaResults(false);
      return;
    }

    setAreaSearchLoading(true);
    try {
      const levels = ["provinsi", "kabupaten", "kecamatan", "kelurahan"];
      const responses = await Promise.all(
        levels.map((level) =>
          smitiFetch(
            `${API_URL}/api/areas/search?query=${encodeURIComponent(
              q,
            )}&level=${level}`,
            { headers: { Accept: "application/json" } },
          )
            .then((r) => (r.ok ? r.json() : []))
            .catch(() => []),
        ),
      );

      const seen = new Set<string>();
      const merged = responses
        .flat()
        .filter((area: any) => {
          const key = `${area?.level || ""}:${
            area?.label ||
            area?.kab_kota ||
            area?.kecamatan ||
            area?.kelurahan ||
            ""
          }`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 12);

      const enriched = await Promise.all(
        merged.map(async (area: any) => {
          const das = await fetchDasForSearchArea(area);
          return {
            ...area,
            _das: das,
            _dasName:
              das?.nama_das ||
              das?.name ||
              das?.das_name ||
              das?.label ||
              null,
          };
        }),
      );

      setAreaSearchResults(enriched);
      setShowAreaResults(true);
    } finally {
      setAreaSearchLoading(false);
    }
  };

  const handleAreaSearch = (value: string) => {
    setAreaSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => void searchAreas(value), 280);
  };

  const selectArea = (area: any) => {
    const map = mapInstanceRef.current;
    setShowAreaResults(false);
    const selectedLabel =
      area?.label ||
      area?.kelurahan ||
      area?.kecamatan ||
      area?.kab_kota ||
      area?.provinsi ||
      "";
    setAreaSearchQuery(selectedLabel);
    const selectedSearchLevel: AdminLevel =
      area?.level === "kabupaten"
        ? "kabupaten"
        : area?.level === "kecamatan"
          ? "kecamatan"
          : "provinsi";
    setAdminLevel(selectedSearchLevel);
    setSelectedId(null);
    setAiResult(null);
    setDrawerOpen(true);
    setSelectedDas(null);
    setDasError("");

    if (area?.geom) {
      const level = (
        area?.level === "kabupaten"
          ? "kabupaten"
          : area?.level === "kecamatan"
            ? "kecamatan"
            : "provinsi"
      ) as AdminLevel;
      setSelectedAreaBoundary({
        id: `search:${level}:${selectedLabel}`,
        level,
        label: selectedLabel,
        provinsi: area?.provinsi,
        kab_kota: area?.kab_kota,
        kecamatan: area?.kecamatan,
        feature: { type: "Feature", geometry: area.geom, properties: area },
      });
    } else {
      setSelectedAreaBoundary(null);
    }

    const selectedBoundaryForDas: AdminBoundary | null = area?.geom
      ? {
          id: `search:${area?.level || "provinsi"}:${selectedLabel}`,
          level:
            (area?.level === "kabupaten"
              ? "kabupaten"
              : area?.level === "kecamatan"
                ? "kecamatan"
                : "provinsi") as AdminLevel,
          label: selectedLabel,
          provinsi: area?.provinsi,
          kab_kota: area?.kab_kota,
          kecamatan: area?.kecamatan,
          feature: { type: "Feature", geometry: area.geom, properties: area },
        }
      : null;

    void fetchDasForArea(selectedBoundaryForDas);
    void fetchBnpbFloodForArea(selectedBoundaryForDas);

    if (!map) return;

    boundaryLayerRef.current?.clearLayers();

    if (area?.geom) {
      const boundary = L.geoJSON(
        { type: "Feature", geometry: area.geom, properties: area },
        {
          style: {
            color: "#0f766e",
            weight: 3,
            opacity: 0.9,
            fillColor: "#14b8a6",
            fillOpacity: 0.1,
          },
        },
      ).addTo(boundaryLayerRef.current || map);

      map.fitBounds(boundary.getBounds(), {
        padding: [70, 70],
        maxZoom: 13,
      });
    } else {
      const lat = toNumber(area?.latitude ?? area?.lat);
      const lng = toNumber(area?.longitude ?? area?.lng ?? area?.lon);
      if (lat !== null && lng !== null) {
        map.flyTo([lat, lng], 11, { duration: 0.9 });
      }
    }
  };

  const fallbackGeocode = async () => {
    const q = areaSearchQuery.trim();
    const map = mapInstanceRef.current;
    if (!map || q.length < 3) return;

    try {
      const response = await smitiFetch(
        `${API_URL}/api/geocode/search?q=${encodeURIComponent(q)}`,
        { headers: { Accept: "application/json" } },
      );
      const results = await response.json().catch(() => []);
      const result = Array.isArray(results) ? results[0] : null;
      const lat = toNumber(result?.lat);
      const lng = toNumber(result?.lon);

      if (lat !== null && lng !== null) {
        map.flyTo([lat, lng], 12, { duration: 1 });
        L.marker([lat, lng])
          .addTo(map)
          .bindPopup(escapeHtml(result?.display_name || q))
          .openPopup();
      }
    } catch (error) {
      console.warn("Fallback geocoder gagal:", error);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchIncidents(), fetchLayerCount()]);
    setRefreshing(false);
  };

  const exportGeoJson = () => {
    const data = {
      type: "FeatureCollection",
      features: filteredCandidates.map((item) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [item.lng, item.lat] },
        properties: {
          id: item.id,
          title: item.title,
          category: item.category,
          date: item.date,
          location: item.location,
          das: item.das,
          curah_hujan: item.curah_hujan,
          description: item.description,
        },
      })),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/geo+json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "simiti-rekomendasi-lokasi.geojson";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const toggleHazard = (hazard: Hazard) => {
    setHazards((current) => {
      const next = new Set(current);
      if (next.has(hazard)) next.delete(hazard);
      else next.add(hazard);
      return next;
    });
  };

  const focusSelected = () => {
    if (!selected || !mapInstanceRef.current) return;
    mapInstanceRef.current.flyTo([selected.lat, selected.lng], 12, {
      duration: 0.8,
    });
    setDrawerOpen(true);
  };

  const risk = aiResult?.risk_level || "Belum dianalisis";
  const topRecommendation = aiResult?.recommendations?.[0];
  const SelectedIcon = selected ? hazardMeta[selected.hazard].icon : MapPinned;

  const hazardCounts = useMemo(() => {
    return (Object.keys(hazardMeta) as Hazard[]).reduce(
      (acc, hazard) => {
        acc[hazard] = candidates.filter(
          (item) => item.hazard === hazard,
        ).length;
        return acc;
      },
      {} as Record<Hazard, number>,
    );
  }, [candidates]);

  const topRecommendations = aiResult?.recommendations?.slice(0, 3) || [];

  return (
    <div className="simiti-map-page">
      <main className="simiti-map-shell">
        <div className="simiti-map-search">
          <Search size={17} />
          <input
            value={areaSearchQuery}
            onChange={(e) => handleAreaSearch(e.target.value)}
            onFocus={() => areaSearchResults.length && setShowAreaResults(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void fallbackGeocode();
              if (e.key === "Escape") setShowAreaResults(false);
            }}
            placeholder="Cari provinsi / kabupaten / kecamatan..."
          />
          {areaSearchLoading && <RefreshCw size={15} className="spin" />}
          {areaSearchQuery && (
            <button
              type="button"
              onClick={() => {
                setAreaSearchQuery("");
                setAreaSearchResults([]);
                setShowAreaResults(false);
              }}
            >
              <X size={14} />
            </button>
          )}

          {showAreaResults && areaSearchResults.length > 0 && (
            <div className="simiti-area-results">
              {areaSearchResults.map((area, index) => (
                <button
                  type="button"
                  key={`${area?.id || area?.label || "area"}-${index}`}
                  onClick={() => selectArea(area)}
                >
                  <MapPinned size={15} />
                  <span>
                    <strong>
                      {area?.label ||
                        area?.kelurahan ||
                        area?.kecamatan ||
                        area?.kab_kota ||
                        area?.provinsi ||
                        "Wilayah"}
                    </strong>
                    <small>
                      {area?.level || "wilayah"}
                      {area?.provinsi ? ` · ${area.provinsi}` : ""}
                    </small>
                    <small>
                      <Droplets size={11} style={{ verticalAlign: "-2px" }} />{" "}
                      DAS: {area?._dasName || "belum teridentifikasi"}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <aside
          className={`simiti-analysis-panel ${leftOpen ? "open" : "closed"}`}
        >
          <div className="simiti-analysis-head">
            <div>
              <span>SPATIAL ANALYSIS</span>
              <h2>Decision Center</h2>
            </div>
            <button
              type="button"
              onClick={() => setLeftOpen(false)}
              title="Tutup panel"
            >
              <X size={17} />
            </button>
          </div>

          <div className="simiti-analysis-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter lokasi / kejadian..."
            />
            {query && (
              <button type="button" onClick={() => setQuery("")}>
                <X size={13} />
              </button>
            )}
          </div>

          <section className="simiti-analysis-section">
            <div className="simiti-analysis-section-title">
              <span>HAZARD ANALYSIS</span>
              <small>
                {groupCandidatesByBoundary.length} {adminLevel} ·{" "}
                {filteredCandidates.length} kejadian
              </small>
            </div>
            <div className="simiti-hazard-list">
              {(Object.keys(hazardMeta) as Hazard[]).map((hazard) => {
                const Icon = hazardMeta[hazard].icon;
                const active = hazards.has(hazard);
                return (
                  <button
                    type="button"
                    key={hazard}
                    className={active ? "active" : ""}
                    onClick={() => toggleHazard(hazard)}
                  >
                    <span
                      className={`simiti-hazard-icon ${hazardMeta[hazard].markerClass}`}
                    >
                      <Icon size={14} />
                    </span>
                    <span className="simiti-hazard-name">{hazard}</span>
                    <b>{hazardCounts[hazard]}</b>
                    <i>{active ? "ON" : "OFF"}</i>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="simiti-analysis-section">
            <div className="simiti-analysis-section-title">
              <span>DATA LAYERS</span>
              <Layers3 size={14} />
            </div>
            <div className="simiti-layer-row">
              <button
                type="button"
                className="layer-toggle active"
                onClick={() => setShowLayers((v) => !v)}
              >
                {showLayers ? <Eye size={14} /> : <EyeOff size={14} />}
                <span>Risk &amp; kejadian</span>
                <b>{layersCount ?? "—"}</b>
              </button>
            </div>
            <div className="simiti-layer-info">
              <span>
                <ShieldCheck size={12} /> SIMITI live data
              </span>
              <span>
                {selectedAreaBoundary
                  ? `Boundary ${selectedAreaBoundary.level}`
                  : "Boundary via pencarian wilayah"}
              </span>
            </div>
          </section>

          <section className="simiti-analysis-section">
            <div className="simiti-analysis-section-title">
              <span>SELECTED LOCATION</span>
              <MapPinned size={14} />
            </div>

            {selected ? (
              <button
                type="button"
                className="simiti-selected-mini"
                onClick={() => {
                  setDrawerOpen(true);
                  mapInstanceRef.current?.flyTo(
                    [selected.lat, selected.lng],
                    12,
                    { duration: 0.8 },
                  );
                }}
              >
                <div>
                  <strong>{selected.title || selected.area}</strong>
                  <small>{selected.area}</small>
                </div>
                <span>{selected.hazard}</span>
              </button>
            ) : (
              <div className="simiti-analysis-empty">
                Pilih titik pada peta.
              </div>
            )}
          </section>

          <section className="simiti-analysis-section simiti-das-section">
            <div className="simiti-analysis-section-title">
              <span>DAS &amp; BANJIR</span>
              <Droplets size={14} />
            </div>

            {selectedAreaBoundary ? (
              <>
                <div className="simiti-das-card">
                  <div className="simiti-das-card-icon">
                    <Droplets size={15} />
                  </div>
                  <div>
                    <small>DAS WILAYAH TERPILIH</small>
                    <strong>
                      {dasLoading
                        ? "Mengidentifikasi DAS..."
                        : selectedDas?.nama_das ||
                          selectedDas?.name ||
                          selectedDas?.das_name ||
                          selectedDas?.label ||
                          selectedAreaIncidents.find((item) => item.das)?.das ||
                          "Belum teridentifikasi"}
                    </strong>
                  </div>
                </div>

                <div className="simiti-das-card" style={{ marginTop: 8 }}>
                  <div className="simiti-das-card-icon">
                    <ShieldCheck size={15} />
                  </div>
                  <div>
                    <small>RISIKO BANJIR BNPB / InaRISK</small>
                    <strong>
                      {bnpbFloodLoading
                        ? "Membaca indeks BNPB..."
                        : bnpbFlood.value == null
                          ? "Belum tersedia"
                          : bnpbFlood.value.toFixed(3)}
                    </strong>
                    {bnpbFlood.error && (
                      <small className="simiti-das-error">{bnpbFlood.error}</small>
                    )}
                  </div>
                </div>

                <div className="simiti-flood-kpi-grid">
                  <div>
                    <span>Kejadian banjir</span>
                    <b>{floodEvidence.count}</b>
                  </div>
                  <div>
                    <span>Avg. hujan</span>
                    <b>
                      {floodEvidence.avgRainfall == null
                        ? "—"
                        : floodEvidence.avgRainfall.toFixed(1)}
                    </b>
                  </div>
                  <div>
                    <span>Max. hujan</span>
                    <b>
                      {floodEvidence.maxRainfall == null
                        ? "—"
                        : floodEvidence.maxRainfall.toFixed(1)}
                    </b>
                  </div>
                </div>

                <div className="simiti-flood-recommendation">
                  <div className="simiti-mini-title">
                    <Sparkles size={13} /> REKOMENDASI BANJIR LOKASI
                  </div>
                  {floodRecommendations.slice(0, 3).map((item, index) => (
                    <div key={`${item.title}-${index}`} className="simiti-flood-rec-row">
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <p>{item.text}</p>
                    </div>
                  ))}
                </div>

                {dasError && (
                  <small className="simiti-das-error">{dasError}</small>
                )}
              </>
            ) : (
              <div className="simiti-analysis-empty">
                Pilih daerah untuk melihat DAS dan rekomendasi mitigasi banjir.
              </div>
            )}
          </section>

          <section className="simiti-analysis-section simiti-ranking-section">
            <div className="simiti-analysis-section-title">
              <span>AI PRIORITY</span>
              <Sparkles size={14} />
            </div>
            {aiLoading ? (
              <div className="simiti-mini-loading">
                <RefreshCw size={14} className="spin" /> Analyzing...
              </div>
            ) : topRecommendations.length ? (
              topRecommendations.map((rec) => (
                <div
                  className="simiti-priority-row"
                  key={`${rec.intervention_id}-${rec.rank}`}
                >
                  <span>{String(rec.rank).padStart(2, "0")}</span>
                  <div>
                    <strong>{rec.intervention}</strong>
                    <small>{rec.urgency || "AI priority"}</small>
                  </div>
                  <b>{Math.round(rec.priority_score)}</b>
                </div>
              ))
            ) : (
              <div className="simiti-analysis-empty">
                Analisis muncul setelah lokasi dipilih.
              </div>
            )}
          </section>

          <div className="simiti-analysis-footer">
            <button type="button" onClick={exportGeoJson}>
              <Download size={13} /> Export
            </button>
            <span>
              <Activity size={11} /> Live
            </span>
          </div>
        </aside>

        {!leftOpen && (
          <button
            type="button"
            className="simiti-left-reopen"
            onClick={() => setLeftOpen(true)}
            title="Buka analysis panel"
          >
            <ChevronRight size={17} />
          </button>
        )}

        <div className="simiti-map-status">
          <span>
            <Activity size={13} />{" "}
            {loading
              ? "Memuat data..."
              : `${groupCandidatesByBoundary.length} ${adminLevel} · ${filteredCandidates.length} kejadian`}
          </span>
          <span>
            <Layers3 size={13} /> {layersCount == null ? "—" : layersCount}{" "}
            layer
          </span>
        </div>

        <div ref={mapRef} className="simiti-map" />

        <div className="simiti-map-controls">
          <button
            type="button"
            onClick={() => {
              setSelectedAreaBoundary(null);
              setSelectedId(null);
              setAiResult(null);
              setDrawerOpen(false);
              setSelectedDas(null);
              setDasError("");
              mapInstanceRef.current?.setView([-2.5, 118], 5);
            }}
            title="Kembali ke Indonesia"
          >
            <Navigation size={17} />
          </button>
          <button
            type="button"
            className={showLayers ? "active" : ""}
            onClick={() => setShowLayers((value) => !value)}
            title="Tampilkan legend"
          >
            <Layers3 size={17} />
          </button>
        </div>

        {showLayers && (
          <div className="simiti-map-legend">
            <div className="simiti-legend-title">LAYER &amp; LOKASI</div>
            {(Object.keys(hazardMeta) as Hazard[]).map((hazard) => {
              const Icon = hazardMeta[hazard].icon;
              const active = hazards.has(hazard);
              return (
                <button
                  type="button"
                  key={hazard}
                  className={active ? "active" : ""}
                  onClick={() => toggleHazard(hazard)}
                >
                  <span
                    className={`legend-dot ${hazardMeta[hazard].markerClass}`}
                  >
                    <Icon size={12} />
                  </span>
                  <span>{hazard}</span>
                  <i>{active ? "✓" : ""}</i>
                </button>
              );
            })}
            <div className="simiti-legend-divider" />
            <div className="simiti-legend-note">
              <span className="legend-ai-dot">
                <Target size={11} />
              </span>
              Lokasi terpilih / analisis AI
            </div>
          </div>
        )}

        <div className="simiti-map-footer-left">
          <span>© SIMITI Spatial Engine</span>
          <span>© OpenStreetMap</span>
        </div>

        <div className="simiti-map-footer-right">
          <Crosshair size={12} /> EPSG:4326
        </div>

        <button
          type="button"
          className={`simiti-drawer-tab ${drawerOpen ? "open" : ""}`}
          onClick={() => setDrawerOpen((value) => !value)}
          title={drawerOpen ? "Tutup panel" : "Buka rekomendasi"}
        >
          {drawerOpen ? <ChevronRight size={21} /> : <ChevronLeft size={21} />}
        </button>

        <aside className={`simiti-ai-drawer ${drawerOpen ? "open" : ""}`}>
          <div className="simiti-drawer-head">
            <div>
              <span>AI DECISION SUPPORT</span>
              <h2>AI Decision Support</h2>
            </div>
            <button type="button" onClick={() => setDrawerOpen(false)}>
              <X size={18} />
            </button>
          </div>

          {!selected ? (
            selectedAreaBoundary ? (
              <div className="simiti-area-decision-card">
                <div className="simiti-selected-card">
                  <div className="simiti-selected-top">
                    <div className="simiti-selected-icon">
                      <Droplets size={19} />
                    </div>
                    <div className="simiti-selected-title">
                      <small>SELECTED AREA · FLOOD ANALYSIS</small>
                      <h3>{selectedAreaBoundary.label}</h3>
                      <p>
                        {selectedAreaBoundary.kecamatan ||
                          selectedAreaBoundary.kab_kota ||
                          selectedAreaBoundary.provinsi ||
                          "Wilayah terpilih"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="simiti-drawer-section">
                  <div className="simiti-section-title">
                    <span>DAS &amp; BANJIR</span>
                    <Droplets size={14} />
                  </div>

                  <div className="simiti-evidence-list">
                    <div>
                      <span>DAS</span>
                      <strong>
                        {dasLoading
                          ? "Mengidentifikasi..."
                          : selectedDas?.nama_das ||
                            selectedDas?.name ||
                            selectedDas?.das_name ||
                            selectedDas?.label ||
                            "Belum teridentifikasi"}
                      </strong>
                    </div>
                    <div>
                      <span>Indeks banjir BNPB</span>
                      <strong>
                        {bnpbFloodLoading
                          ? "Membaca..."
                          : bnpbFlood.value == null
                            ? "—"
                            : bnpbFlood.value.toFixed(3)}
                      </strong>
                    </div>
                    <div>
                      <span>Kejadian banjir</span>
                      <strong>{floodEvidence.count}</strong>
                    </div>
                    <div>
                      <span>Curah hujan maksimum</span>
                      <strong>
                        {floodEvidence.maxRainfall == null
                          ? "—"
                          : floodEvidence.maxRainfall.toFixed(1)}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="simiti-drawer-section">
                  <div className="simiti-section-title">
                    <span>REKOMENDASI OTOMATIS</span>
                    <Sparkles size={14} />
                  </div>
                  {floodRecommendations.slice(0, 4).map((item, index) => (
                    <div key={`${item.title}-${index}`} className="simiti-rec-row">
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <strong>{item.title}</strong>
                        <small>{item.text}</small>
                        <small className="simiti-rec-source">{item.status} · {item.source}</small>
                      </div>
                    </div>
                  ))}
                </div>

                {(dasError || bnpbFlood.error) && (
                  <div className="simiti-verification">
                    <AlertTriangle size={14} />
                    <span>{dasError || bnpbFlood.error}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="simiti-empty">
                <MapPinned size={30} />
                <strong>Belum ada lokasi</strong>
                <p>
                  Pilih daerah pada pencarian atau boundary peta untuk menjalankan analisis banjir dan DAS.
                </p>
              </div>
            )
          ) : (
            <>
              <div className="simiti-selected-card">
                <div className="simiti-selected-top">
                  <div className="simiti-selected-icon">
                    <SelectedIcon size={19} />
                  </div>
                  <div className="simiti-selected-title">
                    <small>LOKASI KEJADIAN #{selected.id}</small>
                    <h3>{selected.title || selected.area}</h3>
                    <p>{selected.area}</p>
                  </div>
                </div>

                <div className="simiti-selected-meta">
                  <span>{selected.category || selected.hazard}</span>
                  <span>{selected.date || "Tanggal tidak tersedia"}</span>
                </div>

                <button
                  type="button"
                  className="simiti-focus-btn"
                  onClick={focusSelected}
                >
                  <MapPinned size={14} /> Tampilkan di peta
                </button>
              </div>

              <div className="simiti-risk-box">
                <div>
                  <span>TINGKAT RISIKO AI</span>
                  <strong className={riskClass(risk)}>{risk}</strong>
                </div>
                <div className="simiti-confidence">
                  <span>CONFIDENCE</span>
                  <strong>
                    {aiResult?.confidence == null
                      ? "—"
                      : `${Math.round(aiResult.confidence)}%`}
                  </strong>
                </div>
              </div>

              {aiLoading && (
                <div className="simiti-ai-loading">
                  <RefreshCw size={16} className="spin" />
                  <span>AI sedang menganalisis evidence SIMITI...</span>
                </div>
              )}

              {!aiLoading && aiResult && (
                <>
                  {aiResult.diagnosis && (
                    <div className="simiti-diagnosis">
                      <div className="simiti-mini-title">
                        <BrainCircuit size={14} /> DIAGNOSIS
                      </div>
                      <p>{aiResult.diagnosis}</p>
                    </div>
                  )}

                  <div className="simiti-drawer-section">
                    <div className="simiti-section-title">
                      <span>REKOMENDASI UTAMA</span>
                      <Sparkles size={14} />
                    </div>

                    {topRecommendation && (
                      <div className="simiti-main-recommendation">
                        <div className="simiti-rec-rank">01</div>
                        <div>
                          <strong>{topRecommendation.intervention}</strong>
                          <p>{topRecommendation.why}</p>
                        </div>
                        <b>{Math.round(topRecommendation.priority_score)}</b>
                      </div>
                    )}

                    {aiResult.recommendations?.slice(1).map((rec) => (
                      <div
                        className="simiti-rec-row"
                        key={`${rec.intervention_id}-${rec.rank}`}
                      >
                        <span>{String(rec.rank).padStart(2, "0")}</span>
                        <div>
                          <strong>{rec.intervention}</strong>
                          <small>{rec.urgency || "Prioritas AI"}</small>
                        </div>
                        <b>{Math.round(rec.priority_score)}</b>
                      </div>
                    ))}
                  </div>

                  <div className="simiti-drawer-section">
                    <div className="simiti-section-title">
                      <span>EVIDENCE DATA</span>
                      <ShieldCheck size={14} />
                    </div>

                    <div className="simiti-evidence-list">
                      <div>
                        <span>Tanggal kejadian</span>
                        <strong>{selected.date || "—"}</strong>
                      </div>
                      <div>
                        <span>Curah hujan</span>
                        <strong>
                          {selected.curah_hujan == null
                            ? "—"
                            : String(selected.curah_hujan)}
                        </strong>
                      </div>
                      <div>
                        <span>DAS</span>
                        <strong>
                          {selected.das ||
                            selectedDas?.nama_das ||
                            selectedDas?.name ||
                            selectedDas?.das_name ||
                            "—"}
                        </strong>
                      </div>
                      <div>
                        <span>Koordinat</span>
                        <strong>
                          {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {aiResult.primary_drivers?.length ? (
                    <div className="simiti-driver-box">
                      <Sparkles size={14} />
                      <div>
                        <span>DRIVER UTAMA</span>
                        <p>{aiResult.primary_drivers.join(" · ")}</p>
                      </div>
                    </div>
                  ) : null}

                  {aiResult.verification_needed && (
                    <div className="simiti-verification">
                      <AlertTriangle size={14} />
                      <span>
                        {aiResult.verification_reason ||
                          "Output AI perlu diverifikasi dengan data lapangan."}
                      </span>
                    </div>
                  )}
                </>
              )}

              {!aiLoading && !aiResult && (
                <div className="simiti-ai-error">
                  <AlertTriangle size={15} />
                  <span>{aiError || "Analisis AI belum tersedia."}</span>
                </div>
              )}
            </>
          )}

          <div className="simiti-drawer-bottom">
            <button type="button" onClick={exportGeoJson}>
              <Download size={14} /> Export GeoJSON
            </button>
            <span>
              <Activity size={12} /> Live backend data
            </span>
          </div>
        </aside>

        <div className="simiti-enterprise-status">
          <div>
            <span className="status-dot" /> DATA ENGINE <strong>LIVE</strong>
          </div>
          <div>
            LOCATIONS <strong>{filteredCandidates.length}</strong>
          </div>
          <div>
            LAYERS <strong>{layersCount ?? "—"}</strong>
          </div>
          <div>
            AI ENGINE{" "}
            <strong>
              {aiLoading ? "ANALYZING" : aiResult ? "READY" : "IDLE"}
            </strong>
          </div>
          <div>
            RISK{" "}
            <strong
              className={`status-risk ${riskClass(aiResult?.risk_level || "")}`}
            >
              {aiResult?.risk_level || "—"}
            </strong>
          </div>
          <div className="status-time">
            <Activity size={11} /> SIMITI Spatial Decision Support
          </div>
        </div>

        <div className="simiti-mobile-hint">
          <span>
            <MapPinned size={13} /> Klik titik untuk analisis AI
          </span>
        </div>
      </main>
    </div>
  );
}
