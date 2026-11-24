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
  Eye,
  EyeOff,
  Navigation,
} from "lucide-react";
import "leaflet/dist/leaflet.css";
import "./AIRecommendationEnterprise.css";
import "./AIRecommendationEnterprise.pro.css";
import "./AIRecommendationEnterprise.redesign.css";

type Hazard = "Banjir" | "Longsor" | "Karhutla" | "Kekeringan" | "Abrasi";

const getSmitiToken = (): string | null => {
  // Keep this page aligned with the authentication storage used by
  // other SIMITI GIS pages. Prefer a non-expired JWT when several keys exist.
  const keys = [
    "smiti_token",
    "adminToken",
    "token",
    "access_token",
    "authToken",
  ];
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
  Abrasi: {
    icon: Activity,
    markerClass: "hazard-abrasion",
    label: "Abrasi",
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

type AdminLevel = "provinsi" | "kabupaten" | "kecamatan" | "kelurahan";
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
  if (level === "kecamatan")
    return props?.kecamatan || props?.name || "Kecamatan";
  return props?.kelurahan || props?.desa || props?.name || "Kelurahan/Desa";
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
  if (hazard === "Longsor") return "⛰️";
  if (hazard === "Karhutla") return "🔥";
  if (hazard === "Kekeringan") return "☀️";
  return "◆";
};

type PriorityLocation = {
  rank: number;
  lat: number;
  lng: number;
  kelas: string;
  luas_ha: number;
  source?: string;
  basis?: string;
};

type HazardScreeningRow = {
  hazard: string;
  features: number;
  events: number | null;
  score: number;
  high_risk_percent: number;
};

type MapLayers = {
  risk_zones?: any | null;
  critical_land?: any | null;
  existing_mitigation?: any | null;
  omitted?: string[];
};

const RISK_ZONE_COLORS: Record<string, string> = {
  "sangat tinggi": "#991b1b",
  tinggi: "#dc2626",
  sedang: "#f59e0b",
  rendah: "#eab308",
};
const riskZoneColor = (kelas?: string) =>
  RISK_ZONE_COLORS[String(kelas || "").trim().toLowerCase()] || "#94a3b8";
const MITIGATION_LABELS: Record<string, string> = {
  sekat_kanal: "Sekat kanal",
  sumur_bor: "Sumur bor",
  bendung: "Bendung",
  bendungan: "Bendungan",
  embung: "Embung",
  danau: "Danau",
  situ: "Situ",
  pengaman_pantai: "Pengaman pantai",
  pompa_air: "Pompa air",
  pengendali_sedimen: "Pengendali sedimen",
  reforestasi_20232024: "Reforestasi 2023–2024",
  dta_danau: "DTA danau",
  rehabilitasi_das: "Rehabilitasi DAS",
  rehabilitasi_hutan: "Rehabilitasi hutan",
  restorasi_gambut: "Restorasi gambut",
  penerapan_teknik_kta: "Teknik KTA",
};

type AiRecommendation = {
  area?: string;
  map_layers?: MapLayers | null;
  hazard?: string | null;
  hazard_source?: "auto" | "user";
  hazard_screening?: HazardScreeningRow[] | null;
  ai_used?: boolean;
  no_mapped_risk?: boolean;
  priority_locations?: PriorityLocation[];
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
  if (
    value.includes("abrasi") ||
    value.includes("pantai") ||
    value.includes("gelombang pasang") ||
    value.includes("rob")
  )
    return "Abrasi";
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

export default function AIRecommendationEnterprise() {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const recommendationLayerRef = useRef<L.LayerGroup | null>(null);
  const boundaryLayerRef = useRef<L.LayerGroup | null>(null);
  const riskZoneLayerRef = useRef<L.LayerGroup | null>(null);
  const criticalLayerRef = useRef<L.LayerGroup | null>(null);
  const mitigationLayerRef = useRef<L.LayerGroup | null>(null);
  const [incidentLayerVisible, setIncidentLayerVisible] = useState(true);
  const [boundaryLayerVisible, setBoundaryLayerVisible] = useState(true);
  const [riskZoneVisible, setRiskZoneVisible] = useState(true);
  const [criticalVisible, setCriticalVisible] = useState(true);
  const [mitigationVisible, setMitigationVisible] = useState(true);
  // Lapisan peta tetap ditampilkan walau langkah AI gagal (mis. key belum ada).
  const [aiFallbackLayers, setAiFallbackLayers] = useState<MapLayers | null>(
    null,
  );
  const thematicLayerGroupsRef = useRef<Map<string, L.Layer>>(new Map());
  const thematicRequestSeqRef = useRef(0);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const areaSearchRequestRef = useRef(0);
  // Boundary administratif memakai geometry dari /api/areas/search.
  // Layer tematik mengikuti pola WebGIS Kerawanan: katalog dari /api/layers,
  // WMS GeoServer untuk layer nasional yang sudah dipetakan, dan GeoJSON
  // dengan token + filter administrasi untuk layer yang dipilih pengguna.
  // Endpoint GeoJSON tetap menerapkan otorisasi can_view dari backend.
  const [adminLevel, setAdminLevel] = useState<AdminLevel>("provinsi");
  const [adminBoundaries, setAdminBoundaries] = useState<AdminBoundary[]>([]);

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedId, setSelectedId] = useState<number | string | null>(null);
  const [hazards, setHazards] = useState<Set<Hazard>>(
    new Set(["Banjir", "Longsor", "Karhutla", "Kekeringan", "Abrasi"]),
  );
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showLayers, setShowLayers] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [layersCount, setLayersCount] = useState<number | null>(null);
  const [layerCatalog, setLayerCatalog] = useState<Array<{
    id: string | number;
    name: string;
    section: "kerawanan" | "mitigasiAdaptasi" | "lainnya" | "kejadian";
    year?: number;
    category?: string;
  }>>([]);
  const [activeSpatialLayers, setActiveSpatialLayers] = useState<Set<string>>(
    new Set(),
  );
  const [spatialLayerLoading, setSpatialLayerLoading] = useState<Set<string>>(
    new Set(),
  );
  const [spatialLayerError, setSpatialLayerError] = useState("");
  const [aiResult, setAiResult] = useState<AiRecommendation | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [recommendationLayerVisible, setRecommendationLayerVisible] =
    useState(false);
  const [recommendationLimit, setRecommendationLimit] = useState(10);
  const [areaSearchQuery, setAreaSearchQuery] = useState("");
  const [areaSearchResults, setAreaSearchResults] = useState<any[]>([]);
  const [showAreaResults, setShowAreaResults] = useState(false);
  const [areaSearchLoading, setAreaSearchLoading] = useState(false);
  const [areaSearchError, setAreaSearchError] = useState("");
  const [selectedAreaBoundary, setSelectedAreaBoundary] =
    useState<AdminBoundary | null>(null);
  const cascadeLevels = [
    "provinsi",
    "kabupaten",
    "kecamatan",
    "kelurahan",
  ] as const;
  type CascadeLevel = (typeof cascadeLevels)[number];
  const [cascadeSelected, setCascadeSelected] = useState<
    Record<CascadeLevel, any | null>
  >({ provinsi: null, kabupaten: null, kecamatan: null, kelurahan: null });
  const [cascadeQueries, setCascadeQueries] = useState<
    Record<CascadeLevel, string>
  >({ provinsi: "", kabupaten: "", kecamatan: "", kelurahan: "" });
  const [cascadeResults, setCascadeResults] = useState<
    Record<CascadeLevel, any[]>
  >({ provinsi: [], kabupaten: [], kecamatan: [], kelurahan: [] });
  const [cascadeOpen, setCascadeOpen] = useState<CascadeLevel | null>(null);
  const [cascadeLoading, setCascadeLoading] = useState<CascadeLevel | null>(
    null,
  );

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

  const fetchBnpbFloodForArea = useCallback(
    async (area: AdminBoundary | null) => {
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
        const catalogItemCount = Array.isArray(payload?.catalogItems?.features)
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
          error: Number.isFinite(value)
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
    },
    [],
  );

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

  const selectedAreaFilteredCandidates = useMemo(() => {
    if (!selectedAreaBoundary?.feature) return [];

    return filteredCandidates.filter((candidate) => {
      try {
        return booleanPointInPolygon(
          point([candidate.lng, candidate.lat]),
          selectedAreaBoundary.feature as any,
        );
      } catch {
        return false;
      }
    });
  }, [filteredCandidates, selectedAreaBoundary]);

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

    const recommendations: Array<{
      title: string;
      status: string;
      text: string;
      source: string;
    }> = [];
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
  }, [selectedDas, selectedAreaIncidents, floodEvidence, bnpbFlood.value]);

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

    const visibleCandidates = selectedAreaFilteredCandidates;

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
    selectedAreaFilteredCandidates,
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
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const sections = [
        "kerawanan",
        "mitigasiAdaptasi",
        "lainnya",
        "kejadian",
      ] as const;
      const catalog = sections.flatMap((section) =>
        (Array.isArray(data?.[section]) ? data[section] : []).map((item: any) => ({
          id: item?.id ?? item?.name,
          name: String(item?.name ?? item?.table_name ?? item?.id ?? "").trim(),
          section,
          year: item?.year ? Number(item.year) : undefined,
          category: item?.category,
        })),
      ).filter((item) => item.name);

      setLayerCatalog(catalog);
      setLayersCount(catalog.length);
      setSpatialLayerError("");
    } catch (error: any) {
      setLayersCount(null);
      setSpatialLayerError(
        error?.message || "Katalog layer WebGIS gagal dimuat.",
      );
    }
  }, []);

  const spatialRecommendations = useMemo(() => {
    const source = groupCandidatesByBoundary
      .filter((group) => group.center?.every(Number.isFinite))
      .map((group) => {
        const candidatesInGroup = group.candidates;
        const count = candidatesInGroup.length;
        const rainfallValues = candidatesInGroup
          .map((item) => toNumber(item.curah_hujan))
          .filter((value): value is number => value !== null);
        const rainfallMax = rainfallValues.length
          ? Math.max(...rainfallValues)
          : 0;
        const hazardSet = group.hazards;
        const dominantHazard =
          Array.from(hazardSet).sort(
            (a, b) =>
              candidatesInGroup.filter((x) => x.hazard === b).length -
              candidatesInGroup.filter((x) => x.hazard === a).length,
          )[0] || null;

        const densityScore = Math.min(40, count * 8);
        const rainfallScore =
          dominantHazard === "Banjir" ? Math.min(25, rainfallMax / 8) : 10;
        const multiHazardScore = Math.min(
          20,
          Math.max(0, hazardSet.size - 1) * 10,
        );
        const recencyScore = Math.min(
          15,
          candidatesInGroup.some((item) => {
            if (!item.date) return false;
            const d = new Date(item.date);
            return (
              Number.isFinite(d.getTime()) &&
              Date.now() - d.getTime() <= 365 * 24 * 60 * 60 * 1000
            );
          })
            ? 15
            : 7,
        );

        const score = Math.round(
          Math.min(
            100,
            densityScore + rainfallScore + multiHazardScore + recencyScore,
          ),
        );

        return {
          key: group.key,
          label: group.label,
          center: group.center,
          count,
          hazards: Array.from(hazardSet),
          dominantHazard,
          rainfallMax,
          score,
          representative: candidatesInGroup[0],
          boundary: group.boundary,
        };
      })
      .sort((a, b) => b.score - a.score || b.count - a.count);

    return source.slice(0, Math.max(1, recommendationLimit));
  }, [groupCandidatesByBoundary, recommendationLimit]);

  const requestAi = useCallback(
    async (candidate: Candidate | null, hazardOverride?: string) => {
      // Tanpa kandidat (wilayah tanpa titik kejadian) analisis tetap jalan
      // untuk wilayah terpilih; hazard dari chip filter atau "auto".
      if (!candidate && !selectedAreaBoundary?.feature) {
        setAiResult(null);
        return;
      }
      setAiLoading(true);
      setAiError("");
      setAiFallbackMcda(null);
      setAiFallbackLayers(null);
      try {
        let areaForAi: {
          label: string;
          level?: string;
          geom: any;
          source: "selected_area" | "incident_administration";
        } | null = null;

        const selectedGeometry = selectedAreaBoundary?.feature?.geometry;

        if (
          selectedGeometry &&
          ["Polygon", "MultiPolygon"].includes(selectedGeometry.type)
        ) {
          areaForAi = {
            label: selectedAreaBoundary!.label,
            level: selectedAreaBoundary!.level,
            geom: selectedGeometry,
            source: "selected_area",
          };
        } else if (!candidate) {
          throw new Error("Pilih wilayah (provinsi sampai kecamatan) terlebih dahulu.");
        } else {
          const boundaryResponse = await smitiFetch(
            `${API_URL}/api/spatial/area-boundary`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({
                latitude: candidate.lat,
                longitude: candidate.lng,
              }),
            },
          );

          const boundaryData = await boundaryResponse.json().catch(() => null);

          if (
            !boundaryResponse.ok ||
            !boundaryData?.success ||
            !boundaryData?.data?.geom
          ) {
            throw new Error(
              boundaryData?.message ||
                "Poligon administrasi lokasi kejadian tidak ditemukan. Pilih wilayah atau periksa koordinat kejadian.",
            );
          }

          areaForAi = {
            label: boundaryData.data.label || candidate.area,
            level: boundaryData.data.level,
            geom: boundaryData.data.geom,
            source: "incident_administration",
          };
        }

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
                selected_region: areaForAi.label,
                area: {
                  label: areaForAi.label,
                  level: areaForAi.level,
                  geom: areaForAi.geom,
                },
                area_source: areaForAi.source,
                hazard: candidate
                  ? candidate.hazard.toLowerCase()
                  : hazardOverride || "auto",
                incident_id: candidate?.id ?? null,
                incident_title: candidate?.title ?? null,
                category_source: candidate?.category ?? null,
                event_date: candidate?.date ?? null,
                das:
                  candidate?.das ||
                  selectedDas?.nama_das ||
                  selectedDas?.name ||
                  selectedDas?.das_name ||
                  null,
                das_id: selectedDas?.id ?? candidate?.das_id ?? null,
                bnpb_flood_risk_index: bnpbFlood.value,
                bnpb_flood_risk_source: bnpbFlood.service,
                rainfall_average: floodEvidence.avgRainfall,
                rainfall_maximum: floodEvidence.maxRainfall,
                flood_event_count: floodEvidence.count,
                latitude: candidate?.lat ?? null,
                longitude: candidate?.lng ?? null,
                curah_hujan: candidate?.curah_hujan ?? null,
                description: candidate?.description ?? null,
                source: "SIMITI live spatial evidence",
              },
            }),
          },
        );
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.success) {
          if (data?.mcda) setAiFallbackMcda(data.mcda);
          if (data?.map_layers) setAiFallbackLayers(data.map_layers);
          throw new Error(
            data?.message ||
              (response.status === 401
                ? "Sesi login berakhir. Silakan login ulang."
                : `HTTP ${response.status}`),
          );
        }
        setAiResult(data);
      } catch (error: any) {
        setAiResult(null);
        setAiError(error?.message || "AI recommendation gagal.");
      } finally {
        setAiLoading(false);
      }
    },
    [selectedDas, bnpbFlood, floodEvidence, selectedAreaBoundary],
  );

  useEffect(() => {
    void fetchIncidents();
    void fetchLayerCount();
  }, [fetchIncidents, fetchLayerCount]);

  // Ref ke versi terbaru requestAi: efek seleksi hanya memicu AI saat lokasi
  // yang dipilih berubah, bukan setiap kali data wilayah/evidence ikut berubah.
  const requestAiRef = useRef(requestAi);
  useEffect(() => {
    requestAiRef.current = requestAi;
  }, [requestAi]);
  // Sinkronkan layer tematik dengan katalog WebGIS.
  // Pola mengikuti Kerawanan.tsx: katalog dari /api/layers, data vektor
  // dari endpoint GeoJSON; layer nasional yang sudah terverifikasi memakai WMS GeoServer.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const requestSeq = ++thematicRequestSeqRef.current;
    let cancelled = false;

    thematicLayerGroupsRef.current.forEach((layer) => {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    });
    thematicLayerGroupsRef.current.clear();

    if (!activeSpatialLayers.size) {
      setSpatialLayerLoading(new Set());
      setSpatialLayerError("");
      return;
    }

    const wmsLayerNames: Record<string, string> = {
      risiko_banjir_bandang: "simiti:vw_risiko_banjir_bandang_wms",
      risiko_abrasi: "simiti:vw_risiko_abrasi_wms",
      risiko_longsor: "simiti:vw_risiko_longsor_wms",
      risiko_karhutla: "simiti:vw_risiko_karhutla_repaired_wms",
      bahaya_abrasi_dan_gelombang_ekstrim: "simiti:bahaya_abrasi_dan_gelombang_ekstrim",
      bahaya_banjir_bandang: "simiti:bahaya_banjir_bandang",
      bahaya_banjir: "simiti:bahaya_banjir",
      bahaya_kekeringan: "simiti:bahaya_kekeringan",
      rawan_longsor: "simiti:rawan_longsor",
      rawan_limpasan: "simiti:vw_rawan_limpasan_wms",
      rawan_karhutla: "simiti:vw_rawan_karhutla_wms",
      rawan_erosi: "simiti:rawan_erosi",
    };

    const loadLayers = async () => {
      const pending = new Set(activeSpatialLayers);
      setSpatialLayerLoading(pending);
      setSpatialLayerError("");

      for (const layerName of activeSpatialLayers) {
        if (cancelled || requestSeq !== thematicRequestSeqRef.current) return;
        const catalogItem = layerCatalog.find(
          (item) => item.name === layerName || String(item.id) === layerName,
        );
        if (!catalogItem) continue;

        try {
          const selectedGeometry = selectedAreaBoundary?.feature?.geometry;
          const hasSelectedArea = Boolean(selectedGeometry);
          const mapBounds = hasSelectedArea
            ? L.geoJSON(selectedAreaBoundary!.feature as any).getBounds()
            : map.getBounds();
          if (!mapBounds.isValid()) continue;

          const [[south, west], [north, east]] = [
            [mapBounds.getSouth(), mapBounds.getWest()],
            [mapBounds.getNorth(), mapBounds.getEast()],
          ];
          const bounds = `${south},${west},${north},${east}`;
          const zoom = map.getZoom();

          // Untuk layer risiko/bahaya yang sudah dipetakan di GeoServer,
          // tampilkan WMS nasional saat belum ada wilayah spesifik dipilih.
          if (!hasSelectedArea && wmsLayerNames[layerName]) {
            const wmsUrl = String(
              import.meta.env.VITE_GEOSERVER_WMS_URL || "/geoserver/simiti/wms",
            ).trim();
            const wmsLayer = L.tileLayer.wms(wmsUrl, {
              layers: wmsLayerNames[layerName],
              format: "image/png",
              transparent: true,
              version: "1.1.1",
              srs: "EPSG:4326",
              tiled: false,
            });
            wmsLayer.on("tileerror", () => {
              if (!cancelled) {
                setSpatialLayerError(
                  `GeoServer WMS gagal memuat layer ${layerName}. Periksa publikasi layer di workspace simiti.`,
                );
              }
            });
            if (cancelled || requestSeq !== thematicRequestSeqRef.current) return;
            thematicLayerGroupsRef.current.set(layerName, wmsLayer);
            wmsLayer.addTo(map);
            pending.delete(layerName);
            setSpatialLayerLoading(new Set(pending));
            continue;
          }

          const params = new URLSearchParams({
            bounds,
            zoom: String(zoom),
          });
          const props = selectedAreaBoundary?.feature?.properties || {};
          const codeByLevel: Record<AdminLevel, string[]> = {
            provinsi: ["kode_prov", "kode_provinsi", "kdprov", "kode"],
            kabupaten: ["kode_kk", "kode_kab", "kode_kabupaten", "kdkab"],
            kecamatan: ["kode_kec", "kdkec"],
            kelurahan: ["kode_kd", "kode_desa", "kddesa"],
          };
          if (hasSelectedArea) {
            const code = codeByLevel[selectedAreaBoundary!.level]
              .map((key) => props?.[key])
              .find((value) => value !== undefined && value !== null && String(value).trim());
            if (code !== undefined) {
              params.set("adminCodes", JSON.stringify([String(code)]));
              params.set("adminLevel", selectedAreaBoundary!.level);
            }
          }

          const safeName = encodeURIComponent(layerName);
          const response = await smitiFetch(
            `${API_URL}/api/layers/${safeName}/geojson?${params.toString()}`,
            { headers: { Accept: "application/geo+json, application/json" } },
          );
          const payload = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(
              payload?.message || payload?.error || `HTTP ${response.status}`,
            );
          }

          const geojson =
            payload?.type === "FeatureCollection"
              ? payload
              : payload?.geojson?.type === "FeatureCollection"
                ? payload.geojson
                : payload?.data?.type === "FeatureCollection"
                  ? payload.data
                  : null;
          if (!geojson || !Array.isArray(geojson.features)) {
            throw new Error("Respons layer bukan FeatureCollection GeoJSON.");
          }
          if (cancelled || requestSeq !== thematicRequestSeqRef.current) return;

          const vectorLayer = L.geoJSON(geojson as any, {
            style: (feature) => {
              const geometryType = feature?.geometry?.type;
              const isRisk = /risiko|bahaya|rawan/i.test(layerName);
              return {
                color: isRisk ? "#b45309" : "#2563eb",
                weight: 1,
                opacity: 0.85,
                fillColor: isRisk ? "#f59e0b" : "#60a5fa",
                fillOpacity: geometryType === "Polygon" || geometryType === "MultiPolygon" ? 0.32 : 0.15,
              };
            },
            pointToLayer: (_feature, latlng) =>
              L.circleMarker(latlng, {
                radius: 5,
                color: "#1d4ed8",
                weight: 1,
                fillColor: "#60a5fa",
                fillOpacity: 0.85,
              }),
            onEachFeature: (feature, featureLayer) => {
              const props = feature?.properties || {};
              const title =
                props.nama || props.namobj || props.name || props.label || layerName;
              featureLayer.bindTooltip(escapeHtml(String(title)), {
                sticky: true,
                className: "simiti-tooltip",
              });
            },
          });
          thematicLayerGroupsRef.current.set(layerName, vectorLayer);
          vectorLayer.addTo(map);
        } catch (error: any) {
          console.error("SIMITI AI: gagal memuat layer tematik", layerName, error);
          if (!cancelled) {
            setSpatialLayerError(
              `${layerName}: ${error?.message || "gagal dimuat"}`,
            );
          }
        } finally {
          pending.delete(layerName);
          if (!cancelled && requestSeq === thematicRequestSeqRef.current) {
            setSpatialLayerLoading(new Set(pending));
          }
        }
      }
    };

    void loadLayers();

    return () => {
      cancelled = true;
    };
  }, [activeSpatialLayers, layerCatalog, selectedAreaBoundary]);

  useEffect(() => {
    if (!selected) return;
    void requestAiRef.current(selected);
    setDrawerOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Lapisan "dasar keputusan AI": data yang sama yang dibaca backend untuk AI.
  const mapLayers: MapLayers | null = aiResult?.map_layers || aiFallbackLayers;
  useEffect(() => {
    const map = mapInstanceRef.current;
    const zoneLayer = riskZoneLayerRef.current;
    const criticalLayer = criticalLayerRef.current;
    const mitigationLayer = mitigationLayerRef.current;
    if (!map) return;
    zoneLayer?.clearLayers();
    criticalLayer?.clearLayers();
    mitigationLayer?.clearLayers();

    if (zoneLayer && riskZoneVisible && mapLayers?.risk_zones?.features?.length) {
      L.geoJSON(mapLayers.risk_zones, {
        pane: "simitiZonePane",
        style: (feature: any) => {
          const color = riskZoneColor(feature?.properties?.kelas);
          return { color, weight: 1, fillColor: color, fillOpacity: 0.32 };
        },
        onEachFeature: (feature: any, layer) => {
          const p = feature?.properties || {};
          layer.bindTooltip(
            `Risiko ${p.kelas} · ±${p.luas_ha} ha${
              p.persen_wilayah != null ? ` (${p.persen_wilayah}% wilayah)` : ""
            }`,
            { sticky: true },
          );
        },
      }).addTo(zoneLayer);
    }

    if (criticalLayer && criticalVisible && mapLayers?.critical_land?.features?.length) {
      L.geoJSON(mapLayers.critical_land, {
        pane: "simitiCriticalPane",
        style: () => ({
          color: "#7c3aed",
          weight: 1.2,
          dashArray: "4 3",
          fillColor: "#7c3aed",
          fillOpacity: 0.14,
        }),
        onEachFeature: (feature: any, layer) => {
          const p = feature?.properties || {};
          layer.bindTooltip(`Lahan ${p.kelas} · ±${p.luas_ha} ha`, { sticky: true });
        },
      }).addTo(criticalLayer);
    }

    if (mitigationLayer && mitigationVisible && mapLayers?.existing_mitigation?.features?.length) {
      L.geoJSON(mapLayers.existing_mitigation, {
        pointToLayer: (feature: any, latlng) =>
          L.circleMarker(latlng, {
            radius: 6,
            color: "#1d4ed8",
            weight: 2,
            fillColor: feature?.properties?.relevan ? "#3b82f6" : "#bfdbfe",
            fillOpacity: 0.95,
          }),
        onEachFeature: (feature: any, layer) => {
          const p = feature?.properties || {};
          const jenis = MITIGATION_LABELS[p.jenis] || p.jenis;
          layer.bindTooltip(
            `${jenis}${p.nama ? `: ${p.nama}` : ""}${
              p.relevan ? " · relevan untuk bencana ini" : ""
            }`,
          );
        },
      }).addTo(mitigationLayer);
    }
  }, [mapLayers, riskZoneVisible, criticalVisible, mitigationVisible]);

  // Sembunyikan/tampilkan layer peta yang benar-benar digambar halaman ini.
  useEffect(() => {
    const map = mapInstanceRef.current;
    const pairs: Array<[L.LayerGroup | null, boolean]> = [
      [markerLayerRef.current, incidentLayerVisible],
      [boundaryLayerRef.current, boundaryLayerVisible],
    ];
    if (!map) return;
    pairs.forEach(([layer, visible]) => {
      if (!layer) return;
      if (visible && !map.hasLayer(layer)) layer.addTo(map);
      if (!visible && map.hasLayer(layer)) map.removeLayer(layer);
    });
  }, [incidentLayerVisible, boundaryLayerVisible]);

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
    recommendationLayerRef.current = L.layerGroup().addTo(map);
    // Zona di bawah garis batas dan titik (overlayPane = 400).
    map.createPane("simitiZonePane").style.zIndex = "350";
    map.createPane("simitiCriticalPane").style.zIndex = "360";
    riskZoneLayerRef.current = L.layerGroup().addTo(map);
    criticalLayerRef.current = L.layerGroup().addTo(map);
    boundaryLayerRef.current = L.layerGroup().addTo(map);
    mitigationLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    const syncAdminLevel = () => {
      const nextLevel = adminLevelForZoom(map.getZoom());
      setAdminLevel((current) => (current === nextLevel ? current : nextLevel));
    };
    map.on("zoomend", syncAdminLevel);

    const resize = () => map.invalidateSize(false);
    window.addEventListener("resize", resize);

    // EnterpriseLayout/route transitions can mount this map before the
    // content column has its final dimensions. Force Leaflet to recalculate
    // after the layout settles so tiles are painted immediately.
    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(mapRef.current);
    const resizeTimer = window.setTimeout(() => resize(), 80);
    const resizeTimer2 = window.setTimeout(() => resize(), 350);

    return () => {
      window.removeEventListener("resize", resize);
      resizeObserver.disconnect();
      window.clearTimeout(resizeTimer);
      window.clearTimeout(resizeTimer2);
      map.off("zoomend", syncAdminLevel);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      map.remove();
      mapInstanceRef.current = null;
      markerLayerRef.current = null;
      recommendationLayerRef.current = null;
      boundaryLayerRef.current = null;
      riskZoneLayerRef.current = null;
      criticalLayerRef.current = null;
      mitigationLayerRef.current = null;
      thematicLayerGroupsRef.current.clear();
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
    const map = mapInstanceRef.current;
    const layer = recommendationLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    if (!selectedAreaBoundary || !recommendationLayerVisible) return;

    spatialRecommendations.forEach((item, index) => {
      const hazard = item.dominantHazard;
      const color =
        item.score >= 75 ? "#dc2626" : item.score >= 55 ? "#f97316" : "#16a34a";

      const icon = L.divIcon({
        className: "simiti-ai-recommendation-marker-wrap",
        html: `
          <div style="
            width:42px;height:42px;border-radius:50%;
            background:${color};border:3px solid rgba(255,255,255,.98);
            box-shadow:0 5px 16px rgba(15,23,42,.35);
            display:flex;flex-direction:column;align-items:center;justify-content:center;
            color:#fff;font-family:Inter,ui-sans-serif,system-ui,sans-serif;
            cursor:pointer;box-sizing:border-box;
          ">
            <span style="font-size:11px;line-height:1">${index + 1}</span>
            <strong style="font-size:11px;line-height:1.1">${item.score}</strong>
          </div>
        `,
        iconSize: [42, 42],
        iconAnchor: [21, 21],
      });

      const marker = L.marker(item.center, { icon });
      marker.bindTooltip(
        `<strong>${escapeHtml(item.label)}</strong><br/>Prioritas #${index + 1} · ${item.score}/100<br/>${escapeHtml(
          hazard || "Multi-risiko",
        )} · ${item.count} kejadian`,
        {
          direction: "top",
          offset: [0, -21],
          className: "simiti-tooltip",
        },
      );

      marker.on("click", () => {
        const candidate = item.representative;
        setSelectedId(candidate.id);
        setDrawerOpen(true);
        map.flyTo(item.center, Math.max(map.getZoom(), 11), { duration: 0.8 });
      });

      marker.addTo(layer);
    });
  }, [
    spatialRecommendations,
    recommendationLayerVisible,
    selectedAreaBoundary,
  ]);

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

  const cascadeParentFor = (level: CascadeLevel) => {
    if (level === "provinsi") return null;
    if (level === "kabupaten") return cascadeSelected.provinsi;
    if (level === "kecamatan") return cascadeSelected.kabupaten;
    return cascadeSelected.kecamatan;
  };

  const searchCascadeLevel = async (level: CascadeLevel, value: string) => {
    const q = value.trim();
    setCascadeQueries((old) => ({ ...old, [level]: value }));
    setCascadeOpen(level);
    if (q.length < 2) {
      setCascadeResults((old) => ({ ...old, [level]: [] }));
      setCascadeLoading(null);
      return;
    }
    setCascadeLoading(level);
    try {
      const params = new URLSearchParams({
        query: q,
        level,
      });
      const selectedParent = cascadeParentFor(level);

      if (selectedParent && level !== "provinsi") {
        const provinsi = selectedParent.provinsi || "";
        const kabKota =
          selectedParent.kab_kota || selectedParent.kabupaten || "";
        const kecamatan = selectedParent.kecamatan || "";

        if (provinsi) params.set("provinsi", provinsi);
        if (level === "kecamatan" || level === "kelurahan") {
          if (kabKota) params.set("kab_kota", kabKota);
        }
        if (level === "kelurahan" && kecamatan) {
          params.set("kecamatan", kecamatan);
        }
      }

      const response = await smitiFetch(
        `${API_URL}/api/areas/search?${params.toString()}`,
        { headers: { Accept: "application/json" } },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const rows = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.results)
          ? payload.results
          : Array.isArray(payload?.data)
            ? payload.data
            : [];
      const parent = cascadeParentFor(level);
      const parentName = (item: any) =>
        level === "kabupaten"
          ? item?.provinsi || ""
          : level === "kecamatan"
            ? item?.kab_kota || item?.kabupaten || ""
            : level === "kelurahan"
              ? item?.kecamatan || ""
              : "";
      const filtered = rows
        .filter((item: any) => {
          if (!parent) return true;
          const expected =
            level === "kabupaten"
              ? parent.provinsi || parent.label || parent.name
              : level === "kecamatan"
                ? parent.kab_kota ||
                  parent.kabupaten ||
                  parent.label ||
                  parent.name
                : parent.kecamatan || parent.label || parent.name;
          const actual = parentName(item);
          return (
            !actual ||
            !expected ||
            normalizeSearchText(actual) === normalizeSearchText(expected)
          );
        })
        .filter(
          (item: any) =>
            item &&
            (item.label ||
              item.name ||
              item[level] ||
              item.kelurahan ||
              item.desa ||
              item.kecamatan ||
              item.kab_kota ||
              item.kabupaten ||
              item.provinsi),
        )
        .slice(0, 12);
      setCascadeResults((old) => ({ ...old, [level]: filtered }));
    } catch {
      setCascadeResults((old) => ({ ...old, [level]: [] }));
    } finally {
      setCascadeLoading((old) => (old === level ? null : old));
    }
  };

  const chooseCascadeArea = (level: CascadeLevel, area: any) => {
    const index = cascadeLevels.indexOf(level);
    const nextSelected = { ...cascadeSelected, [level]: area };
    const nextQueries = {
      ...cascadeQueries,
      [level]: String(
        area?.label ||
          area?.name ||
          area?.[level] ||
          area?.kelurahan ||
          area?.desa ||
          area?.kecamatan ||
          area?.kab_kota ||
          area?.kabupaten ||
          area?.provinsi ||
          "",
      ),
    };
    const nextResults = { ...cascadeResults };
    cascadeLevels.slice(index + 1).forEach((child) => {
      nextSelected[child] = null;
      nextQueries[child] = "";
      nextResults[child] = [];
    });
    setCascadeSelected(nextSelected);
    setCascadeQueries(nextQueries);
    setCascadeResults(nextResults);
    setCascadeOpen(null);
    selectArea({ ...area, level });
  };

  const normalizeSearchText = (value: unknown) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("id-ID")
      .trim();

  const searchAreas = async (value: string) => {
    const q = value.trim();
    const requestId = ++areaSearchRequestRef.current;
    if (q.length < 2) {
      setAreaSearchResults([]);
      setShowAreaResults(false);
      setAreaSearchError("");
      setAreaSearchLoading(false);
      return;
    }

    setAreaSearchLoading(true);
    setAreaSearchError("");
    setShowAreaResults(true);
    try {
      const levels = ["provinsi", "kabupaten", "kecamatan", "kelurahan"];
      const responses = await Promise.all(
        levels.map(async (level) => {
          try {
            const response = await smitiFetch(
              `${API_URL}/api/areas/search?query=${encodeURIComponent(q)}&level=${level}`,
              { headers: { Accept: "application/json" } },
            );
            if (!response.ok) return { ok: false, rows: [] as any[] };
            const payload = await response.json();
            const rows = Array.isArray(payload)
              ? payload
              : Array.isArray(payload?.results)
                ? payload.results
                : Array.isArray(payload?.data)
                  ? payload.data
                  : [];
            return { ok: true, rows };
          } catch {
            return { ok: false, rows: [] as any[] };
          }
        }),
      );
      if (requestId !== areaSearchRequestRef.current) return;

      const normalizedQuery = normalizeSearchText(q);
      const seen = new Set<string>();
      const merged = responses
        .flatMap((response) => response.rows)
        .filter((area: any) => {
          const label =
            area?.label ||
            area?.name ||
            area?.kelurahan ||
            area?.kecamatan ||
            area?.kab_kota ||
            area?.kabupaten ||
            area?.provinsi ||
            "";
          const key = `${normalizeSearchText(area?.level)}:${normalizeSearchText(label)}:${normalizeSearchText(area?.provinsi)}:${normalizeSearchText(area?.kab_kota || area?.kabupaten)}`;
          if (!label || seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a: any, b: any) => {
          const labelA = normalizeSearchText(
            a?.label ||
              a?.name ||
              a?.kelurahan ||
              a?.kecamatan ||
              a?.kab_kota ||
              a?.kabupaten ||
              a?.provinsi,
          );
          const labelB = normalizeSearchText(
            b?.label ||
              b?.name ||
              b?.kelurahan ||
              b?.kecamatan ||
              b?.kab_kota ||
              b?.kabupaten ||
              b?.provinsi,
          );
          const score = (label: string) =>
            label === normalizedQuery
              ? 0
              : label.startsWith(normalizedQuery)
                ? 1
                : label.includes(normalizedQuery)
                  ? 2
                  : 3;
          return (
            score(labelA) - score(labelB) || labelA.localeCompare(labelB, "id")
          );
        })
        .slice(0, 10);

      setAreaSearchResults(merged);
      if (!merged.length && responses.every((response) => !response.ok)) {
        setAreaSearchError(
          "Pencarian wilayah gagal terhubung ke layanan SIMITI. Coba lagi.",
        );
      } else if (!merged.length) {
        setAreaSearchError(
          "Wilayah tidak ditemukan. Coba nama kabupaten atau provinsi.",
        );
      }
    } finally {
      if (requestId === areaSearchRequestRef.current)
        setAreaSearchLoading(false);
    }
  };

  const handleAreaSearch = (value: string) => {
    setAreaSearchQuery(value);
    setAreaSearchError("");
    setShowAreaResults(value.trim().length >= 2);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (value.trim().length < 2) {
      areaSearchRequestRef.current += 1;
      setAreaSearchResults([]);
      setShowAreaResults(false);
      setAreaSearchLoading(false);
      return;
    }
    searchTimerRef.current = setTimeout(() => void searchAreas(value), 320);
  };

  const selectArea = (area: any) => {
    const map = mapInstanceRef.current;
    setShowAreaResults(false);
    const selectedLabel =
      area?.label ||
      area?.name ||
      area?.kelurahan ||
      area?.desa ||
      area?.kecamatan ||
      area?.kab_kota ||
      area?.provinsi ||
      "";
    setAreaSearchQuery(selectedLabel);
    const selectedSearchLevel: AdminLevel =
      area?.level === "kelurahan" || area?.level === "desa"
        ? "kelurahan"
        : area?.level === "kabupaten"
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
        area?.level === "kelurahan" || area?.level === "desa"
          ? "kelurahan"
          : area?.level === "kabupaten"
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
          level: (area?.level === "kelurahan" || area?.level === "desa"
            ? "kelurahan"
            : area?.level === "kabupaten"
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
    const exportSource = selectedAreaBoundary?.feature
      ? visibleLocations
      : filteredCandidates;
    const priorityFeatures = (aiResult?.priority_locations || []).map((loc) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [loc.lng, loc.lat] },
      properties: {
        type: "priority_location",
        rank: loc.rank,
        kelas_risiko: loc.kelas,
        luas_ha: loc.luas_ha,
        hazard: aiResult?.hazard ?? null,
        source: loc.source ?? null,
        basis: loc.basis ?? null,
      },
    }));
    const layerFeatures = [
      ...(mapLayers?.risk_zones?.features || []),
      ...(mapLayers?.critical_land?.features || []),
      ...(mapLayers?.existing_mitigation?.features || []),
    ];
    const data = {
      type: "FeatureCollection",
      features: [...priorityFeatures, ...layerFeatures, ...exportSource.map((item) => ({
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
      }))],
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

  const runAnalysis = () => {
    const topSpatial = spatialRecommendations[0];
    const candidate =
      topSpatial?.representative || selectedAreaFilteredCandidates[0] || null;
    setDrawerOpen(true);
    if (!candidate) {
      if (!selectedAreaBoundary?.feature) {
        setAiError(
          "Pilih wilayah (provinsi sampai kecamatan) terlebih dahulu untuk menjalankan analisis AI.",
        );
        return;
      }
      // Wilayah tanpa titik kejadian: tetap dianalisis dari data risiko,
      // lingkungan dan sarana. Satu chip bencana aktif = hazard itu; "Semua" = auto.
      const hazardChoice =
        hazards.size === 1 ? Array.from(hazards)[0].toLowerCase() : "auto";
      setSelectedId(null);
      void requestAi(null, hazardChoice);
      return;
    }
    setRecommendationLayerVisible(true);
    if (String(selectedId) === String(candidate.id)) {
      void requestAi(candidate);
    } else {
      setSelectedId(candidate.id); // efek seleksi yang memanggil AI (sekali)
    }
  };

  const openBestLocation = () => {
    if (visibleLocations[0]) {
      setSelectedId(visibleLocations[0].id);
      return;
    }
    const best = aiResult?.priority_locations?.[0];
    if (best) {
      mapInstanceRef.current?.flyTo([best.lat, best.lng], 13, { duration: 0.8 });
    }
  };

  const recommendationScore = topRecommendation
    ? Math.round(Number(topRecommendation.priority_score) || 0)
    : null;
  const selectedSpatialScore = selected
    ? (spatialRecommendations.find(
        (item) => String(item.representative.id) === String(selected.id),
      )?.score ?? null)
    : null;
  const visibleLocations = spatialRecommendations.map(
    (item) => item.representative,
  );

  return (
    <div className="simiti-enterprise-page simiti-ai-module">
      <div className="simiti-enterprise-body">
        <main className="simiti-enterprise-main">
          <header className="ai-module-header">
            <div className="ai-module-title">
              <div className="ai-title-icon">
                <BrainCircuit size={22} />
              </div>
              <div>
                <div className="ai-eyebrow">
                  SIMITI • DECISION SUPPORT SYSTEM
                </div>
                <h1>
                  Rekomendasi Lokasi Mitigasi &amp; Adaptasi{" "}
                  <span>Berbasis AI</span>
                </h1>
                <p>
                  Analisis spasial untuk menentukan lokasi prioritas dan model
                  intervensi berdasarkan risiko bencana serta evidence SIMITI.
                </p>
              </div>
            </div>
            <div className="ai-header-actions">
              <div className="ai-live-status">
                <i /> <span>DATA ENGINE</span>
                <b>LIVE</b>
              </div>
              <button
                type="button"
                className="ai-refresh"
                onClick={async () => {
                  setRefreshing(true);
                  await fetchIncidents();
                  await fetchLayerCount();
                  setRefreshing(false);
                }}
                disabled={refreshing}
              >
                <RefreshCw size={15} className={refreshing ? "spin" : ""} />{" "}
                {refreshing ? "Memuat..." : "Refresh Data"}
              </button>
              <button
                type="button"
                className="ai-primary-action"
                onClick={runAnalysis}
              >
                <Sparkles size={16} /> Analisis AI
              </button>
            </div>
          </header>

          <section className="ai-kpi-strip">
            <div className="ai-kpi-card">
              <span className="kpi-icon blue">
                <MapPinned size={17} />
              </span>
              <div>
                <small>
                  {selectedAreaBoundary ? "TITIK KEJADIAN DI WILAYAH" : "LOKASI DIANALISIS"}
                </small>
                <strong>
                  {selectedAreaBoundary
                    ? selectedAreaFilteredCandidates.length
                    : candidates.length}
                </strong>
                <em>{selectedAreaBoundary?.label || "Seluruh data SIMITI"}</em>
              </div>
            </div>
            <div className="ai-kpi-card">
              <span className="kpi-icon emerald">
                <Target size={17} />
              </span>
              <div>
                <small>LOKASI PRIORITAS</small>
                <strong>
                  {aiResult?.priority_locations?.length
                    ? aiResult.priority_locations.length
                    : visibleLocations.length}
                </strong>
                <em>
                  {aiResult?.priority_locations?.length
                    ? `Zona risiko ${aiResult.priority_locations[0].kelas} (GIS)`
                    : "Hasil spatial scoring"}
                </em>
              </div>
            </div>
            <div className="ai-kpi-card">
              <span className="kpi-icon amber">
                <AlertTriangle size={17} />
              </span>
              <div>
                <small>RISIKO DOMINAN</small>
                <strong>
                  {aiResult?.hazard
                    ? aiResult.hazard.replace("_", " ").replace(/^./, (c) => c.toUpperCase())
                    : spatialRecommendations[0]?.dominantHazard || "—"}
                </strong>
                <em>
                  {aiResult?.hazard
                    ? (() => {
                        const top = aiResult.hazard_screening?.find(
                          (h) => h.hazard === aiResult.hazard,
                        );
                        const pct = aiResult.map_layers?.risk_zones?.features
                          ?.filter((f: any) => /tinggi/i.test(String(f.properties?.kelas)))
                          .reduce((sum: number, f: any) => sum + (Number(f.properties?.persen_wilayah) || 0), 0);
                        const share = top?.high_risk_percent ?? pct;
                        return `${share ? `${Math.round(share * 10) / 10}% wilayah risiko tinggi` : "Risiko terpetakan"}${
                          aiResult.hazard_source === "auto" ? " · dipilih otomatis" : ""
                        }`;
                      })()
                    : spatialRecommendations[0]
                      ? `${spatialRecommendations[0].count} evidence kejadian`
                      : "Pilih wilayah"}
                </em>
              </div>
            </div>
            <div className="ai-kpi-card">
              <span className="kpi-icon violet">
                <ShieldCheck size={17} />
              </span>
              <div>
                <small>CONFIDENCE AI</small>
                <strong>
                  {aiResult?.confidence != null
                    ? `${Math.round(Number(aiResult.confidence))}%`
                    : "—"}
                </strong>
                <em>{aiResult?.meta?.model || "Menunggu analisis"}</em>
              </div>
            </div>
          </section>

          <section className="ai-workspace">
            <div className="ai-map-column">
              <div className="ai-map-toolbar">
                <div
                  className="ai-admin-cascade"
                  role="search"
                  aria-label="Pencarian wilayah administratif bertingkat"
                >
                  {cascadeLevels.map((level, idx) => {
                    const titles: Record<CascadeLevel, string> = {
                      provinsi: "Provinsi",
                      kabupaten: "Kabupaten/Kota",
                      kecamatan: "Kecamatan",
                      kelurahan: "Kelurahan/Desa",
                    };
                    const parentReady =
                      idx === 0 ||
                      Boolean(cascadeSelected[cascadeLevels[idx - 1]]);
                    const chosen = cascadeSelected[level];
                    return (
                      <div
                        className={`ai-cascade-field ${!parentReady ? "is-disabled" : ""}`}
                        key={level}
                      >
                        <label htmlFor={`ai-cascade-${level}`}>
                          {idx + 1}. {titles[level]}
                        </label>
                        <div className="ai-cascade-input-wrap">
                          <input
                            id={`ai-cascade-${level}`}
                            value={
                              chosen
                                ? String(
                                    chosen.label ||
                                      chosen.name ||
                                      chosen[level] ||
                                      chosen.kelurahan ||
                                      chosen.desa ||
                                      chosen.kecamatan ||
                                      chosen.kab_kota ||
                                      chosen.kabupaten ||
                                      chosen.provinsi ||
                                      "",
                                  )
                                : cascadeQueries[level]
                            }
                            disabled={!parentReady}
                            autoComplete="off"
                            placeholder={
                              parentReady
                                ? `Cari ${titles[level].toLowerCase()}…`
                                : `Pilih ${titles[cascadeLevels[idx - 1]].toLowerCase()} dulu`
                            }
                            onFocus={() => {
                              if (parentReady) setCascadeOpen(level);
                            }}
                            onChange={(e) => {
                              setCascadeSelected((old) => ({
                                ...old,
                                [level]: null,
                              }));
                              void searchCascadeLevel(level, e.target.value);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") setCascadeOpen(null);
                              if (
                                e.key === "Enter" &&
                                cascadeResults[level][0]
                              ) {
                                e.preventDefault();
                                chooseCascadeArea(
                                  level,
                                  cascadeResults[level][0],
                                );
                              }
                            }}
                          />
                          {cascadeLoading === level && (
                            <RefreshCw size={13} className="spin" />
                          )}
                          {chosen && (
                            <button
                              type="button"
                              aria-label={`Ubah ${titles[level]}`}
                              onClick={() => {
                                setCascadeSelected(
                                  (old) =>
                                    ({
                                      ...old,
                                      [level]: null,
                                      ...Object.fromEntries(
                                        cascadeLevels
                                          .slice(idx + 1)
                                          .map((child) => [child, null]),
                                      ),
                                    }) as Record<CascadeLevel, any | null>,
                                );
                                setCascadeQueries(
                                  (old) =>
                                    ({
                                      ...old,
                                      [level]: "",
                                      ...Object.fromEntries(
                                        cascadeLevels
                                          .slice(idx + 1)
                                          .map((child) => [child, ""]),
                                      ),
                                    }) as Record<CascadeLevel, string>,
                                );
                                setCascadeOpen(level);
                              }}
                            >
                              {" "}
                              <X size={12} />{" "}
                            </button>
                          )}
                        </div>
                        {cascadeOpen === level &&
                          parentReady &&
                          cascadeQueries[level].trim().length >= 2 && (
                            <div
                              className="ai-cascade-results"
                              role="listbox"
                              aria-label={`Hasil ${titles[level]}`}
                            >
                              {cascadeResults[level].length ? (
                                cascadeResults[level].map((area, i) => {
                                  const label =
                                    area.label ||
                                    area.name ||
                                    area[level] ||
                                    area.kelurahan ||
                                    area.desa ||
                                    area.kecamatan ||
                                    area.kab_kota ||
                                    area.kabupaten ||
                                    area.provinsi ||
                                    "Wilayah";
                                  const detail = [
                                    area.kecamatan,
                                    area.kab_kota || area.kabupaten,
                                    area.provinsi,
                                  ]
                                    .filter(
                                      (v) =>
                                        v &&
                                        normalizeSearchText(v) !==
                                          normalizeSearchText(label),
                                    )
                                    .join(" · ");
                                  return (
                                    <button
                                      type="button"
                                      role="option"
                                      key={`${area.id || level}:${label}:${i}`}
                                      onClick={() =>
                                        chooseCascadeArea(level, area)
                                      }
                                    >
                                      <strong>{label}</strong>
                                      {detail && <small>{detail}</small>}
                                    </button>
                                  );
                                })
                              ) : (
                                <div className="ai-cascade-empty">
                                  {cascadeLoading === level
                                    ? "Mencari wilayah…"
                                    : "Tidak ada hasil. Periksa ejaan atau coba nama lebih lengkap."}
                                </div>
                              )}
                            </div>
                          )}
                      </div>
                    );
                  })}
                </div>
                <div className="ai-map-scope">
                  <span>Wilayah aktif</span>
                  <strong>
                    {selectedAreaBoundary?.label || "Belum dipilih"}
                  </strong>
                </div>
                <button
                  type="button"
                  className="ai-map-tool"
                  onClick={() =>
                    mapInstanceRef.current?.setView([-2.5, 118], 5)
                  }
                  title="Kembali ke Indonesia"
                >
                  <Navigation size={16} />
                </button>
                <button
                  type="button"
                  className="ai-map-tool"
                  onClick={() => setShowLayers((v) => !v)}
                  title="Layer"
                >
                  <Layers3 size={16} />
                </button>
              </div>

              <div className="simiti-map-stage ai-map-stage">
                <div ref={mapRef} className="simiti-map" />

                {showLayers && (
                  <div className="simiti-map-layer-card ai-layer-card">
                    <div className="layer-card-head">
                      <div>
                        <small>LAYER PETA</small>
                        <h3>Tematik</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowLayers(false)}
                      >
                        <X size={15} />
                      </button>
                    </div>
                    <p className="layer-group-title">Dasar keputusan AI</p>
                    {!mapLayers && (
                      <p className="layer-note">
                        Pilih wilayah lalu jalankan analisis AI untuk menampilkan
                        data yang dibaca AI.
                      </p>
                    )}
                    {(
                      [
                        [
                          `Zona risiko ${aiResult?.hazard ? aiResult.hazard.replace("_", " ") : ""}`.trim(),
                          mapLayers?.risk_zones?.features?.length ?? 0,
                          "kelas",
                          riskZoneVisible,
                          setRiskZoneVisible,
                        ],
                        [
                          "Lahan kritis",
                          mapLayers?.critical_land?.features?.length ?? 0,
                          "kelas",
                          criticalVisible,
                          setCriticalVisible,
                        ],
                        [
                          "Sarana mitigasi eksisting",
                          mapLayers?.existing_mitigation?.features?.length ?? 0,
                          "titik",
                          mitigationVisible,
                          setMitigationVisible,
                        ],
                      ] as Array<[string, number, string, boolean, (fn: (v: boolean) => boolean) => void]>
                    )
                      .filter(() => Boolean(mapLayers))
                      .map(([label, count, unit, visible, setVisible]) => (
                        <button
                          type="button"
                          key={label}
                          className={`layer-check ${visible && count ? "active" : ""}`}
                          aria-pressed={visible}
                          disabled={!count}
                          onClick={() => setVisible((v) => !v)}
                        >
                          <span>{count ? (visible ? "✓" : "□") : "–"}</span>
                          <b>{label}</b>
                          <em>{count ? `${count} ${unit}` : "tidak ada"}</em>
                        </button>
                      ))}
                    {(mapLayers?.omitted?.length ?? 0) > 0 && (
                      <p className="layer-note">
                        Sebagian lapisan terlalu besar untuk ditampilkan; pilih
                        wilayah yang lebih kecil.
                      </p>
                    )}

                    <p className="layer-group-title">Data pendukung</p>
                    {(
                      [
                        ["Batas wilayah terpilih", boundaryLayerVisible, setBoundaryLayerVisible],
                        ["Titik kejadian SIMITI", incidentLayerVisible, setIncidentLayerVisible],
                        ["Kandidat dari kejadian", recommendationLayerVisible, setRecommendationLayerVisible],
                      ] as Array<[string, boolean, (fn: (v: boolean) => boolean) => void]>
                    ).map(([label, visible, setVisible]) => (
                      <button
                        type="button"
                        key={label}
                        className={`layer-check ${visible ? "active" : ""}`}
                        aria-pressed={visible}
                        onClick={() => setVisible((v) => !v)}
                      >
                        <span>{visible ? "✓" : "□"}</span>
                        <b>{label}</b>
                      </button>
                    ))}

                    <div className="layer-check active" aria-label="Batas Administrasi aktif">
                      <span>✓</span>
                      <b>Batas Administrasi</b>
                      <small>Referensi wilayah</small>
                    </div>
                    {([
                      ["kerawanan", "Kerawanan"],
                      ["mitigasiAdaptasi", "Mitigasi & Adaptasi"],
                      ["lainnya", "Layer Lainnya"],
                      ["kejadian", "Kejadian"],
                    ] as const).map(([section, title]) => {
                      const items = layerCatalog.filter((item) => item.section === section);
                      if (!items.length) return null;
                      return (
                        <div className="ai-layer-section" key={section}>
                          <div className="ai-layer-section-title">
                            <b>{title}</b>
                            <small>{items.length} layer</small>
                          </div>
                          {items.map((item) => {
                            const key = item.name;
                            const active = activeSpatialLayers.has(key);
                            const isLoading = spatialLayerLoading.has(key);
                            return (
                              <button
                                type="button"
                                className={`layer-check ${active ? "active" : ""}`}
                                key={`${section}:${item.id}:${key}`}
                                aria-pressed={active}
                                disabled={isLoading}
                                title={key}
                                onClick={() => {
                                  setSpatialLayerError("");
                                  setActiveSpatialLayers((current) => {
                                    const next = new Set(current);
                                    if (next.has(key)) next.delete(key);
                                    else next.add(key);
                                    return next;
                                  });
                                }}
                              >
                                <span>{isLoading ? "…" : active ? "✓" : "□"}</span>
                                <b>{key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</b>
                                <ChevronRight size={13} />
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                    {spatialLayerError && (
                      <div className="ai-layer-error" role="status">
                        {spatialLayerError}
                      </div>
                    )}
                    {!layerCatalog.length && (
                      <div className="ai-layer-empty">
                        {spatialLayerError || "Memuat katalog layer WebGIS…"}
                      </div>
                    )}
                    <div
                      className={`layer-ai-title ${recommendationLayerVisible ? "active" : ""}`}
                      onClick={() => setRecommendationLayerVisible((v) => !v)}
                      role="button"
                      tabIndex={0}
                    >
                      <span>{recommendationLayerVisible ? "✓" : "□"}</span>
                      <b>Titik Rekomendasi AI</b>
                      <ChevronRight size={13} />
                    </div>
                    <div className="layer-legend">
                      {riskZoneVisible && (mapLayers?.risk_zones?.features?.length ?? 0) > 0 &&
                        mapLayers!.risk_zones.features.map((f: any) => (
                          <span key={`z-${f.properties.kelas}`}>
                            <i
                              className="swatch"
                              style={{ background: riskZoneColor(f.properties.kelas) }}
                            />
                            Risiko {f.properties.kelas}
                          </span>
                        ))}
                      {criticalVisible && (mapLayers?.critical_land?.features?.length ?? 0) > 0 && (
                        <span>
                          <i className="swatch critical" /> Lahan kritis
                        </span>
                      )}
                      {mitigationVisible && (mapLayers?.existing_mitigation?.features?.length ?? 0) > 0 && (
                        <span>
                          <i className="swatch dot-blue" /> Sarana mitigasi
                        </span>
                      )}
                      {recommendationLayerVisible && visibleLocations.length > 0 && (
                        <>
                          <span><span className="dot red" /> Skor kejadian tinggi</span>
                          <span><span className="dot orange" /> Sedang</span>
                          <span><span className="dot green" /> Rendah</span>
                        </>
                      )}
                    </div>
                    <p className="layer-note">
                      Layer tematik lengkap (DAS, tutupan lahan, dll.) ada di menu
                      GIS.
                    </p>
                  </div>
                )}

                <div className="ai-map-status">
                  <span>
                    <i /> DATA SPASIAL LIVE
                  </span>
                  <span>
                    {filteredCandidates.length.toLocaleString("id-ID")} kandidat
                  </span>
                  <span>{layersCount ?? "—"} layer</span>
                  {activeSpatialLayers.size > 0 && (
                    <span>{activeSpatialLayers.size} aktif</span>
                  )}
                </div>
              </div>

              <div className="ai-workflow">
                <div className="workflow-step done">
                  <span>01</span>
                  <div>
                    <b>Integrasi Data Peta</b>
                    <small>PostGIS · layer risiko · DAS · kejadian</small>
                  </div>
                </div>
                <i>→</i>
                <div className="workflow-step done">
                  <span>02</span>
                  <div>
                    <b>Analisis Spasial</b>
                    <small>Overlay · evidence · spatial scoring</small>
                  </div>
                </div>
                <i>→</i>
                <div className="workflow-step active">
                  <span>03</span>
                  <div>
                    <b>AI Recommendation</b>
                    <small>Model mitigasi &amp; adaptasi</small>
                  </div>
                </div>
                <i>→</i>
                <div className="workflow-step">
                  <span>04</span>
                  <div>
                    <b>Visualisasi</b>
                    <small>Titik / layer rekomendasi</small>
                  </div>
                </div>
                <i>→</i>
                <div className="workflow-step">
                  <span>05</span>
                  <div>
                    <b>Output</b>
                    <small>GeoJSON · laporan · evidence</small>
                  </div>
                </div>
              </div>
            </div>

            <aside className="ai-recommendation-panel">
              <div className="ai-panel-head">
                <div>
                  <div className="ai-eyebrow">AI DECISION SUPPORT</div>
                  <h2>Panel Rekomendasi AI</h2>
                  <p>Pilih risiko untuk memfilter kandidat lokasi.</p>
                </div>
                <span className="ai-badge">
                  <Sparkles size={13} /> AI
                </span>
              </div>

              {aiLoading && (
                <div
                  role="status"
                  style={{
                    padding: "10px 12px",
                    marginBottom: 10,
                    borderRadius: 8,
                    background: "#EFF6FF",
                    color: "#1D4ED8",
                    fontSize: 12,
                  }}
                >
                  AI sedang membaca evidence spasial dan menyusun rekomendasi...
                </div>
              )}
              {!aiLoading && aiError && (
                <div
                  role="alert"
                  style={{
                    padding: "10px 12px",
                    marginBottom: 10,
                    borderRadius: 8,
                    background: "#FEF2F2",
                    color: "#B91C1C",
                    fontSize: 12,
                  }}
                >
                  Analisis AI gagal: {aiError}
                </div>
              )}
              {!aiLoading && !aiError && aiResult?.verification_needed && (
                <div
                  role="status"
                  style={{
                    padding: "10px 12px",
                    marginBottom: 10,
                    borderRadius: 8,
                    background: "#FFFBEB",
                    color: "#92400E",
                    fontSize: 12,
                  }}
                >
                  Perlu verifikasi lapangan:{" "}
                  {aiResult.verification_reason ||
                    "Bukti spasial belum cukup untuk memastikan rekomendasi."}
                </div>
              )}
              {!aiLoading &&
                !aiError &&
                aiResult &&
                !aiResult.verification_needed && (
                  <div
                    role="status"
                    style={{
                      padding: "10px 12px",
                      marginBottom: 10,
                      borderRadius: 8,
                      background: "#ECFDF5",
                      color: "#065F46",
                      fontSize: 12,
                    }}
                  >
                    Analisis AI selesai. Tetap verifikasi rekomendasi terhadap
                    kondisi lapangan.
                  </div>
                )}
              <div className="ai-candidate-search" role="search">
                <Search size={16} aria-hidden="true" />
                <input
                  aria-label="Cari kandidat lokasi"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cari lokasi, kejadian, atau DAS…"
                />
                {query && (
                  <button
                    type="button"
                    aria-label="Bersihkan pencarian kandidat"
                    onClick={() => setQuery("")}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <div
                className="ai-search-summary"
                role="status"
                aria-live="polite"
              >
                Menampilkan{" "}
                <strong>
                  {filteredCandidates.length.toLocaleString("id-ID")}
                </strong>{" "}
                kandidat dari {candidates.length.toLocaleString("id-ID")} data
                berkoordinat
                {query.trim() && (
                  <button type="button" onClick={() => setQuery("")}>
                    Hapus kata kunci
                  </button>
                )}
              </div>

              <div className="hazard-tabs">
                <button
                  type="button"
                  className={hazards.size === 5 ? "active" : ""}
                  onClick={() =>
                    setHazards(
                      new Set([
                        "Banjir",
                        "Longsor",
                        "Karhutla",
                        "Kekeringan",
                        "Abrasi",
                      ]),
                    )
                  }
                >
                  Semua
                </button>
                {(Object.keys(hazardMeta) as Hazard[]).map((hazard) => {
                  const Icon = hazardMeta[hazard].icon;
                  return (
                    <button
                      type="button"
                      key={hazard}
                      className={
                        hazards.size === 1 && hazards.has(hazard)
                          ? "active"
                          : ""
                      }
                      onClick={() => setHazards(new Set([hazard]))}
                    >
                      <Icon size={14} /> {hazard}
                    </button>
                  );
                })}
              </div>

              <div className="hazard-kpi-grid">
                {(Object.keys(hazardMeta) as Hazard[]).map((hazard) => {
                  const Icon = hazardMeta[hazard].icon;
                  return (
                    <button
                      type="button"
                      key={hazard}
                      className={`hazard-kpi ${hazardMeta[hazard].markerClass}`}
                      onClick={() => setHazards(new Set([hazard]))}
                    >
                      <span>
                        <Icon size={14} />
                      </span>
                      <strong>{hazardCounts[hazard]}</strong>
                      <small>lokasi {hazard}</small>
                    </button>
                  );
                })}
              </div>

              <div className="ai-panel-section-title">
                <div>
                  <small>PRIORITY RANKING</small>
                  <h3>Daftar Rekomendasi Lokasi</h3>
                </div>
                <span>{visibleLocations.length} lokasi</span>
              </div>
              <div className="ai-ranking-list">
                {visibleLocations.slice(0, 8).map((item, index) => {
                  const score = Math.round(
                    Number(spatialRecommendations[index]?.score) || 0,
                  );
                  const Icon = hazardMeta[item.hazard].icon;
                  return (
                    <button
                      type="button"
                      className={`ai-ranking-item ${String(selected?.id) === String(item.id) ? "selected" : ""}`}
                      key={item.id}
                      onClick={() => {
                        setSelectedId(item.id);
                        setRecommendationLayerVisible(true);
                        setDrawerOpen(true);
                      }}
                    >
                      <span
                        className={`rank-marker ${hazardMeta[item.hazard].markerClass}`}
                      >
                        <Icon size={14} />
                      </span>
                      <span className="rank-content">
                        <strong>{item.title || item.area}</strong>
                        <small>{item.area}</small>
                        <em>
                          <b>{item.hazard}</b> ·{" "}
                          {item.das || "DAS belum teridentifikasi"}
                        </em>
                      </span>
                      <span className="rank-score">
                        <b>{score}</b>
                        <small>/100</small>
                        <i>Detail</i>
                      </span>
                    </button>
                  );
                })}
                {!visibleLocations.length && (
                  <div className="ai-empty">
                    <MapPinned size={24} />
                    <strong>Pilih wilayah untuk memunculkan kandidat</strong>
                    <span>
                      Analisis spasial akan menggunakan evidence kejadian SIMITI
                      pada wilayah aktif.
                    </span>
                  </div>
                )}
              </div>

              <div className="ai-panel-footer">
                <button
                  type="button"
                  className="ai-primary-action full"
                  onClick={runAnalysis}
                >
                  <Sparkles size={15} /> Jalankan Analisis AI
                </button>
                <span>
                  <ShieldCheck size={13} /> Output AI menggunakan evidence
                  spasial SIMITI.
                </span>
              </div>
            </aside>
          </section>

          <section className="ai-results-grid">
            <article className="dash-card ranking-card ai-result-card">
              <div className="dash-title">
                <div>
                  <small>SPATIAL ANALYSIS OUTPUT</small>
                  <h3>Hasil Rekomendasi Lokasi</h3>
                </div>
                <div className="result-actions">
                  <span>{visibleLocations.length} lokasi</span>
                  <button type="button" onClick={exportGeoJson}>
                    <Download size={14} /> GeoJSON
                  </button>
                </div>
              </div>
              <div className="rank-table">
                <div className="rank-row rank-head">
                  <span>No</span>
                  <span>Lokasi</span>
                  <span>Hazard</span>
                  <span>Score</span>
                  <span>Aksi</span>
                </div>
                {visibleLocations.map((item, index) => (
                  <div className="rank-row" key={item.id}>
                    <span className="rank-no">{index + 1}</span>
                    <span>
                      <strong>{item.title || item.area}</strong>
                      <small>{item.area}</small>
                    </span>
                    <span
                      className={`hazard-pill ${hazardMeta[item.hazard].markerClass}`}
                    >
                      {item.hazard}
                    </span>
                    <b>
                      {Math.round(
                        Number(spatialRecommendations[index]?.score) || 0,
                      )}
                      /100
                    </b>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(item.id);
                        setDrawerOpen(true);
                        setRecommendationLayerVisible(true);
                      }}
                    >
                      <Eye size={14} /> Detail
                    </button>
                  </div>
                ))}
                {!visibleLocations.length && (
                  <div className="dash-empty">
                    Belum ada hasil. Pilih wilayah lalu jalankan analisis.
                  </div>
                )}
              </div>
            </article>

            <article className="dash-card detail-card ai-detail-enterprise">
              <div className="dash-title">
                <div>
                  <small>AI INSIGHT</small>
                  <h3>Detail Rekomendasi #{selected || aiResult ? "01" : "—"}</h3>
                </div>
                {recommendationScore !== null && (
                  <span className="score-badge">{recommendationScore}/100</span>
                )}
              </div>
              {selected || aiResult ? (
                <>
                  <div className="enterprise-location-head">
                    <div className="enterprise-location-icon">
                      <MapPinned size={20} />
                    </div>
                    <div>
                      <small>
                        {(selected?.hazard || aiResult?.hazard || "").toUpperCase()}
                        {!selected && aiResult?.hazard_source === "auto"
                          ? " · DIPILIH OTOMATIS"
                          : ""}
                      </small>
                      <h4>{selected?.title || selected?.area || aiResult?.area || "Wilayah terpilih"}</h4>
                      <p>
                        {selected
                          ? `${selected.area} · ${selected.date || "Tanggal tidak tersedia"}`
                          : "Analisis wilayah · tidak ada titik kejadian tercatat"}
                      </p>
                    </div>
                    <div className="confidence-box">
                      <small>CONFIDENCE</small>
                      <strong>
                        {aiResult?.confidence != null
                          ? `${Math.round(Number(aiResult.confidence))}%`
                          : "—"}
                      </strong>
                    </div>
                  </div>
                  {selected && (
                  <div className="enterprise-factors">
                    <div>
                      <span>Skor Spasial {selected.hazard}</span>
                      <i>
                        <b style={{ width: `${selectedSpatialScore ?? 0}%` }} />
                      </i>
                      <strong>{selectedSpatialScore ?? "—"}</strong>
                    </div>
                    <div>
                      <span>Curah Hujan</span>
                      <i>
                        <b
                          style={{
                            width: `${Math.min(100, Number(selected.curah_hujan) || 0)}%`,
                          }}
                        />
                      </i>
                      <strong>{selected.curah_hujan ?? "—"}</strong>
                    </div>
                    <div>
                      <span>Evidence Kejadian</span>
                      <i>
                        <b
                          style={{
                            width: `${Math.min(100, selectedAreaIncidents.length * 10)}%`,
                          }}
                        />
                      </i>
                      <strong>{selectedAreaIncidents.length}</strong>
                    </div>
                  </div>
                  )}
                  <div className="enterprise-model-columns">
                    <div>
                      <small>MODEL MITIGASI</small>
                      {topRecommendations.slice(0, 3).map((r, i) => (
                        <span key={r.intervention_id || i}>
                          <ShieldCheck size={13} />
                          {r.intervention}
                        </span>
                      ))}
                    </div>
                    <div>
                      <small>MODEL ADAPTASI</small>
                      <span>
                        <ShieldCheck size={13} />
                        Early Warning System
                      </span>
                      <span>
                        <ShieldCheck size={13} />
                        Peningkatan kesiapsiagaan
                      </span>
                      <span>
                        <ShieldCheck size={13} />
                        Jalur evakuasi
                      </span>
                    </div>
                  </div>
                  {mcdaInfo && (
                    <div className="enterprise-mcda">
                      <div className="enterprise-mcda-head">
                        <strong>Skor Prioritas Wilayah (MCDA)</strong>
                        <span>
                          {mcdaInfo.score ?? "—"}
                          {mcdaInfo.score != null ? "/100" : ""} ·{" "}
                          {mcdaInfo.category}
                        </span>
                      </div>
                      <small
                        className={
                          mcdaInfo.low_coverage ? "mcda-coverage low" : "mcda-coverage"
                        }
                      >
                        Kelengkapan data indikator: {mcdaInfo.coverage_percent}%
                        {mcdaInfo.low_coverage
                          ? " — skor perlu dikonfirmasi data/survei tambahan"
                          : ""}
                      </small>
                      {mcdaInfo.indicators.map((indicator) => (
                        <div
                          key={indicator.key}
                          className={
                            indicator.available ? "mcda-row" : "mcda-row missing"
                          }
                          title={indicator.basis}
                        >
                          <span>
                            {indicator.label} <em>({indicator.weight}%)</em>
                          </span>
                          <i>
                            <b style={{ width: `${indicator.value ?? 0}%` }} />
                          </i>
                          <strong>
                            {indicator.available
                              ? Math.round(Number(indicator.value))
                              : "n/a"}
                          </strong>
                        </div>
                      ))}
                    </div>
                  )}
                  {topRecommendations.length > 0 && (
                    <div className="enterprise-reco-list">
                      <strong>Rekomendasi Intervensi</strong>
                      <ol>
                        {topRecommendations.map((r) => (
                          <li key={r.intervention_id}>
                            <div>
                              <b>{r.intervention}</b>
                              <span>
                                {Math.round(Number(r.priority_score) || 0)}/100 ·
                                urgensi {r.urgency}
                              </span>
                            </div>
                            <p>{r.why}</p>
                            {r.evidence?.length > 0 && (
                              <small>Bukti: {r.evidence.join("; ")}</small>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {(aiResult?.priority_locations?.length ?? 0) > 0 && (
                    <div className="enterprise-reco-list">
                      <strong>Zona Prioritas (ditentukan GIS)</strong>
                      <ol>
                        {aiResult!.priority_locations!.map((loc) => (
                          <li key={`${loc.lat},${loc.lng}`}>
                            <div>
                              <b>
                                Zona risiko {loc.kelas} · ±
                                {loc.luas_ha.toLocaleString("id-ID")} ha
                              </b>
                              <button
                                type="button"
                                className="priority-go"
                                onClick={() => {
                                  setRiskZoneVisible(true);
                                  mapInstanceRef.current?.flyTo(
                                    [loc.lat, loc.lng],
                                    14,
                                    { duration: 0.8 },
                                  );
                                }}
                              >
                                Lihat di peta
                              </button>
                            </div>
                          </li>
                        ))}
                      </ol>
                      <small>
                        Zona diambil dari poligon {aiResult?.hazard ? `risiko_${aiResult.hazard}` : "risiko"} kelas
                        tertinggi di wilayah ini. Lokasi tepat penerapan butuh
                        survei lapangan.
                      </small>
                    </div>
                  )}
                  <div className="enterprise-reason">
                    <strong>Alasan Rekomendasi</strong>
                    <p>
                      {topRecommendation?.why ||
                        aiResult?.diagnosis ||
                        "Jalankan analisis AI untuk mendapatkan alasan rekomendasi berbasis evidence SIMITI."}
                    </p>
                  </div>
                </>
              ) : (
                <div className="dash-empty large">
                  <Target size={28} />
                  <strong>Belum ada lokasi terpilih</strong>
                  <p>
                    Klik kandidat pada panel kanan atau jalankan analisis AI.
                  </p>
                </div>
              )}
            </article>
          </section>

          <section className="ai-audit-grid">
            <article className="dash-card process-card">
              <div className="dash-title">
                <div>
                  <small>TRANSPARENCY</small>
                  <h3>Alur Keputusan Sistem</h3>
                </div>
              </div>
              <div className="process-flow enterprise-flow">
                <div>
                  <span>01</span>
                  <b>PostGIS</b>
                  <small>Data spasial &amp; layer risiko</small>
                </div>
                <i>→</i>
                <div>
                  <span>02</span>
                  <b>Spatial Engine</b>
                  <small>Overlay, evidence, scoring</small>
                </div>
                <i>→</i>
                <div>
                  <span>03</span>
                  <b>AI Engine</b>
                  <small>Reasoning &amp; model rekomendasi</small>
                </div>
                <i>→</i>
                <div>
                  <span>04</span>
                  <b>SIMITI UI</b>
                  <small>Peta, ranking &amp; output</small>
                </div>
              </div>
            </article>
            <article className="dash-card json-card">
              <div className="dash-title">
                <div>
                  <small>AUDIT TRAIL</small>
                  <h3>AI Response</h3>
                </div>
                <span>LIVE</span>
              </div>
              <pre>
                {JSON.stringify(
                  aiResult || {
                    status: "waiting",
                    wilayah: selectedAreaBoundary?.label || null,
                    kandidat: visibleLocations.length,
                  },
                  null,
                  2,
                )}
              </pre>
              <button
                type="button"
                onClick={() =>
                  navigator.clipboard?.writeText(
                    JSON.stringify(aiResult || {}, null, 2),
                  )
                }
              >
                Salin JSON
              </button>
            </article>
          </section>
        </main>

        <aside className={`simiti-assistant-panel ${drawerOpen ? "open" : ""}`}>
          <div className="assistant-head">
            <div className="assistant-avatar">
              <Sparkles size={16} />
            </div>
            <div>
              <strong>AI Assistant — DSS Mitigasi</strong>
              <small>Evidence SIMITI</small>
            </div>
            <button type="button" onClick={() => setDrawerOpen(false)}>
              <X size={16} />
            </button>
          </div>
          <div className="assistant-body">
            <div className="chat-bubble bot">
              Saya dapat membantu membaca hasil spatial scoring dan menjelaskan
              alasan rekomendasi.
            </div>
            {!selected && aiResult && (
              <div className="chat-bubble bot">
                Wilayah aktif: <b>{aiResult.area}</b>
                {aiResult.hazard ? ` · ${aiResult.hazard}` : ""}.{" "}
                {aiResult.ai_used === false
                  ? "Tidak ada risiko terpetakan, AI tidak dipanggil."
                  : `${aiResult.recommendations?.length || 0} rekomendasi, ${aiResult.priority_locations?.length || 0} titik prioritas.`}
              </div>
            )}
            {selected && (
              <div className="chat-bubble bot">
                Lokasi aktif: <b>{selected.area}</b>.{" "}
                {recommendationScore
                  ? `Prioritas ${recommendationScore}/100.`
                  : "Skor belum tersedia."}
              </div>
            )}
            <button type="button" className="chat-action" onClick={runAnalysis}>
              <Sparkles size={13} /> Tampilkan rekomendasi
            </button>
            <button
              type="button"
              className="chat-action secondary"
              onClick={openBestLocation}
            >
              Buka lokasi terbaik
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
