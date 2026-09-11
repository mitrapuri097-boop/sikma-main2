import React, { useEffect, useMemo, useState } from "react";

import {
  MapContainer,
  TileLayer,
  WMSTileLayer,
  GeoJSON,
  Popup,
  Pane,
  useMap,
  useMapEvents,
} from "react-leaflet";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.vectorgrid";

import {
  Activity,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CloudSun,
  Crosshair,
  Database,
  Eye,
  EyeOff,
  Flame,
  Info,
  Layers3,
  LocateFixed,
  Map as MapIcon,
  MapPinned,
  Maximize2,
  Minimize2,
  Minus,
  Mountain,
  MousePointer2,
  Navigation,
  Pencil,
  Plus,
  RotateCcw,
  Ruler,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Trees,
  Waves,
  X,
  Zap,
  GripVertical,
  ChevronUp,
  ChevronDown as ChevronDownIcon,
  Loader2,
  AlertCircle,
} from "lucide-react";

/* ============================================================
   TYPES
============================================================ */

type LayerGroupKey =
  | "basemap"
  | "administrasi"
  | "spasial"
  | "risiko"
  | "kegiatan";

type ToolKey = "select" | "identify" | "gps" | "measure" | "draw";

type RiskType = "safe" | "warning" | "danger";

type GISLayerType = "raster" | "wms" | "geojson" | "vector-tile";

interface MapCoordinate {
  latitude: number;
  longitude: number;
}

interface GisFeature {
  id: string;
  name: string;
  type?: string;
  wilayah?: string;
  kecamatan?: string;
  desa?: string;
  latitude: number;
  longitude: number;
  riskLevel?: string;
  confidence?: number;
  properties?: Record<string, unknown>;
}

/* ============================================================
   GIS LAYER SOURCE
============================================================ */

interface GISLayerSource {
  type: GISLayerType;

  /*
   * Raster XYZ:
   * https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
   */
  url?: string;

  /*
   * WMS:
   * https://server/geoserver/wms
   */
  wmsUrl?: string;

  /*
   * WMS layer name.
   */
  layers?: string;

  /*
   * WMS parameters.
   */
  params?: Record<string, string | number | boolean>;

  /*
   * GeoJSON:
   * Bisa URL atau inline object.
   */
  geojsonUrl?: string;

  geojsonData?: GeoJSON.GeoJsonObject;

  /*
   * Vector Tile / MVT:
   *
   * https://server/tiles/{z}/{x}/{y}.pbf
   */
  vectorTileUrl?: string;

  /*
   * Nama layer vector di dalam tile.
   *
   * Jika kosong, semua layer vector akan menggunakan style default.
   */
  vectorLayerName?: string;

  /*
   * attribution source.
   */
  attribution?: string;

  /*
   * Subdomains untuk XYZ.
   */
  subdomains?: string[];

  /*
   * max native zoom.
   */
  maxNativeZoom?: number;

  /*
   * max zoom.
   */
  maxZoom?: number;
}

/* ============================================================
   GIS LAYER STYLE
============================================================ */

interface GISLayerStyle {
  color?: string;
  weight?: number;
  opacity?: number;
  fillColor?: string;
  fillOpacity?: number;

  /*
   * Marker/icon bisa dikembangkan kemudian.
   */
  pointRadius?: number;
}

/* ============================================================
   GIS LAYER DEFINITION
============================================================ */

interface GISLayerDefinition {
  id: string;

  group: LayerGroupKey;

  label: string;

  description: string;

  icon: React.ElementType;

  source: GISLayerSource;

  visible: boolean;

  opacity: number;

  /*
   * Order global.
   *
   * Semakin besar = semakin atas.
   */
  order: number;

  minZoom?: number;

  maxZoom?: number;

  interactive?: boolean;

  popup?: boolean;

  style?: GISLayerStyle;

  /*
   * Metadata untuk enterprise GIS.
   */
  metadata?: {
    owner?: string;
    service?: string;
    version?: string;
    updatedAt?: string;
    srid?: string;
    category?: string;
  };
}

/* ============================================================
   LAYER GROUP
============================================================ */

interface LayerGroupDefinition {
  id: LayerGroupKey;

  label: string;

  description: string;

  icon: React.ElementType;
}

/* ============================================================
   RISK SUMMARY
============================================================ */

interface RiskSummaryData {
  aman: number;
  waspada: number;
  rawan: number;
}

/* ============================================================
   MAP CONFIG
============================================================ */

const DEFAULT_MAP_CENTER: [number, number] = [-2.5, 118.0];
const DEFAULT_ZOOM = 5;

const MIN_ZOOM = 3;
const MAX_ZOOM = 20;

const INDONESIA_BOUNDS: [[number, number], [number, number]] = [
  [-11.5, 94.5],
  [6.5, 141.5],
];

/* ============================================================
   ENVIRONMENT HELPERS
============================================================ */

/*
 * Semua endpoint GIS sengaja diambil dari environment.
 *
 * Dengan Vite:
 *
 * VITE_GIS_GEOSERVER_WMS=https://...
 * VITE_GIS_ADMIN_PROVINCE=https://...
 * VITE_GIS_VECTOR_TILE=https://.../{z}/{x}/{y}.pbf
 */

const env = import.meta.env;

const GIS_ENDPOINTS = {
  province: env.VITE_GIS_ADMIN_PROVINCE ?? "",

  regency: env.VITE_GIS_ADMIN_REGENCY ?? "",

  district: env.VITE_GIS_ADMIN_DISTRICT ?? "",

  village: env.VITE_GIS_ADMIN_VILLAGE ?? "",

  river: env.VITE_GIS_RIVER ?? "",

  watershed: env.VITE_GIS_WATERSHED ?? "",

  forest: env.VITE_GIS_FOREST ?? "",

  landCover: env.VITE_GIS_LAND_COVER ?? "",

  flood: env.VITE_GIS_FLOOD ?? "",

  landslide: env.VITE_GIS_LANDSLIDE ?? "",

  wildfire: env.VITE_GIS_WILDFIRE ?? "",

  drought: env.VITE_GIS_DROUGHT ?? "",

  mitigation: env.VITE_GIS_MITIGATION ?? "",

  adaptation: env.VITE_GIS_ADAPTATION ?? "",

  recommendation: env.VITE_GIS_RECOMMENDATION ?? "",

  vectorTile: env.VITE_GIS_VECTOR_TILE ?? "",

  geoserverWms: env.VITE_GIS_GEOSERVER_WMS ?? "",
};

/* ============================================================
   LAYER GROUP CONFIG
============================================================ */

const GIS_LAYER_GROUPS: LayerGroupDefinition[] = [
  {
    id: "basemap",
    label: "Basemap",
    description: "Peta dasar",
    icon: MapIcon,
  },

  {
    id: "administrasi",
    label: "Administrasi",
    description: "Batas wilayah",
    icon: Database,
  },

  {
    id: "spasial",
    label: "Data Spasial",
    description: "Data tematik",
    icon: Layers3,
  },

  {
    id: "risiko",
    label: "Risiko Bencana",
    description: "Data tingkat risiko",
    icon: AlertTriangle,
  },

  {
    id: "kegiatan",
    label: "Kegiatan Mitigasi & Adaptasi",
    description: "Lokasi kegiatan",
    icon: Trees,
  },
];

/* ============================================================
   LAYER CONFIGURATION
============================================================ */

/*
 * IMPORTANT
 *
 * Tidak ada feature dummy.
 *
 * Jika endpoint kosong:
 * layer tidak dirender.
 *
 * Jadi UI sudah siap, tetapi data tetap berasal dari GIS service.
 */

const INITIAL_GIS_LAYERS: GISLayerDefinition[] = [
  /* ==========================================================
     BASEMAP
  ========================================================== */

  {
    id: "basemap-street",
    group: "basemap",
    label: "Street Map",
    description: "OpenStreetMap street basemap",
    icon: MapIcon,

    source: {
      type: "raster",
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: "&copy; OpenStreetMap contributors",
      subdomains: ["a", "b", "c"],
      maxNativeZoom: 19,
      maxZoom: 20,
    },

    visible: true,
    opacity: 1,
    order: 0,

    metadata: {
      service: "OpenStreetMap",
      version: "1.0",
      category: "basemap",
    },
  },

  {
    id: "basemap-satellite",
    group: "basemap",
    label: "Satellite",
    description: "Satellite imagery",
    icon: MapPinned,

    source: {
      type: "raster",
      url: "",
      attribution: "",
    },

    visible: false,
    opacity: 1,
    order: 1,

    metadata: {
      category: "basemap",
    },
  },

  {
    id: "basemap-terrain",
    group: "basemap",
    label: "Terrain",
    description: "Terrain and relief",
    icon: Mountain,

    source: {
      type: "raster",
      url: "",
      attribution: "",
    },

    visible: false,
    opacity: 1,
    order: 2,

    metadata: {
      category: "basemap",
    },
  },

  /* ==========================================================
     ADMINISTRASI
  ========================================================== */

  {
    id: "administrasi-provinsi",
    group: "administrasi",
    label: "Provinsi",
    description: "Batas administrasi provinsi",
    icon: Database,

    source: {
      type: "geojson",
      geojsonUrl: GIS_ENDPOINTS.province,
    },

    visible: true,
    opacity: 0.85,
    order: 10,

    interactive: true,
    popup: true,

    style: {
      color: "#10b981",
      weight: 1.5,
      opacity: 0.9,
      fillOpacity: 0.02,
    },

    metadata: {
      category: "administrasi",
      srid: "EPSG:4326",
    },
  },

  {
    id: "administrasi-kabupaten",
    group: "administrasi",
    label: "Kabupaten / Kota",
    description: "Batas kabupaten dan kota",
    icon: Database,

    source: {
      type: "geojson",
      geojsonUrl: GIS_ENDPOINTS.regency,
    },

    visible: true,
    opacity: 0.8,
    order: 11,

    interactive: true,
    popup: true,

    style: {
      color: "#38bdf8",
      weight: 1,
      opacity: 0.8,
      fillOpacity: 0,
    },

    metadata: {
      category: "administrasi",
      srid: "EPSG:4326",
    },
  },

  {
    id: "administrasi-kecamatan",
    group: "administrasi",
    label: "Kecamatan",
    description: "Batas kecamatan",
    icon: Database,

    source: {
      type: "geojson",
      geojsonUrl: GIS_ENDPOINTS.district,
    },

    visible: false,
    opacity: 0.7,
    order: 12,

    interactive: true,
    popup: true,

    style: {
      color: "#a78bfa",
      weight: 0.8,
      opacity: 0.7,
      fillOpacity: 0,
    },

    metadata: {
      category: "administrasi",
      srid: "EPSG:4326",
    },
  },

  {
    id: "administrasi-desa",
    group: "administrasi",
    label: "Desa / Kelurahan",
    description: "Batas desa dan kelurahan",
    icon: Database,

    source: {
      type: "geojson",
      geojsonUrl: GIS_ENDPOINTS.village,
    },

    visible: false,
    opacity: 0.6,
    order: 13,

    interactive: true,
    popup: true,

    style: {
      color: "#f59e0b",
      weight: 0.6,
      opacity: 0.6,
      fillOpacity: 0,
    },

    metadata: {
      category: "administrasi",
      srid: "EPSG:4326",
    },
  },

  /* ==========================================================
     SPASIAL
  ========================================================== */

  {
    id: "spasial-das",
    group: "spasial",
    label: "Daerah Aliran Sungai",
    description: "Layer DAS",
    icon: Waves,

    source: {
      type: "geojson",
      geojsonUrl: GIS_ENDPOINTS.watershed,
    },

    visible: false,
    opacity: 0.65,
    order: 20,

    interactive: true,
    popup: true,

    style: {
      color: "#06b6d4",
      weight: 1,
      opacity: 0.7,
      fillColor: "#06b6d4",
      fillOpacity: 0.06,
    },

    metadata: {
      category: "spasial",
    },
  },

  {
    id: "spasial-sungai",
    group: "spasial",
    label: "Sungai",
    description: "Jaringan sungai",
    icon: Waves,

    source: {
      type: "vector-tile",
      vectorTileUrl: GIS_ENDPOINTS.vectorTile,
      vectorLayerName: "sungai",
    },

    visible: false,
    opacity: 0.85,
    order: 21,

    interactive: true,
    popup: true,

    style: {
      color: "#38bdf8",
      weight: 1.5,
      opacity: 0.9,
    },

    metadata: {
      category: "spasial",
      service: "MVT",
    },
  },

  {
    id: "spasial-kawasan-hutan",
    group: "spasial",
    label: "Kawasan Hutan",
    description: "Data kawasan hutan",
    icon: Trees,

    source: {
      type: "wms",
      wmsUrl: GIS_ENDPOINTS.geoserverWms,
      layers: "simiti:kawasan_hutan",
      params: {
        format: "image/png",
        transparent: true,
        version: "1.3.0",
      },
    },

    visible: false,
    opacity: 0.55,
    order: 22,

    metadata: {
      category: "spasial",
      service: "GeoServer WMS",
    },
  },

  {
    id: "spasial-tutupan-lahan",
    group: "spasial",
    label: "Tutupan Lahan",
    description: "Data tutupan lahan",
    icon: Trees,

    source: {
      type: "wms",
      wmsUrl: GIS_ENDPOINTS.geoserverWms,
      layers: "simiti:tutupan_lahan",
      params: {
        format: "image/png",
        transparent: true,
        version: "1.3.0",
      },
    },

    visible: false,
    opacity: 0.6,
    order: 23,

    metadata: {
      category: "spasial",
      service: "GeoServer WMS",
    },
  },

  /* ==========================================================
     RISIKO
  ========================================================== */

  {
    id: "risiko-banjir",
    group: "risiko",
    label: "Risiko Banjir",
    description: "Peta risiko banjir",
    icon: Waves,

    source: {
      type: "wms",
      wmsUrl: GIS_ENDPOINTS.geoserverWms,
      layers: "simiti:risiko_banjir",
      params: {
        format: "image/png",
        transparent: true,
        version: "1.3.0",
      },
    },

    visible: false,
    opacity: 0.65,
    order: 30,

    interactive: true,
    popup: false,

    metadata: {
      category: "risiko",
      service: "GeoServer WMS",
    },
  },

  {
    id: "risiko-longsor",
    group: "risiko",
    label: "Risiko Longsor",
    description: "Peta risiko longsor",
    icon: Mountain,

    source: {
      type: "wms",
      wmsUrl: GIS_ENDPOINTS.geoserverWms,
      layers: "simiti:risiko_longsor",
      params: {
        format: "image/png",
        transparent: true,
        version: "1.3.0",
      },
    },

    visible: false,
    opacity: 0.65,
    order: 31,

    metadata: {
      category: "risiko",
      service: "GeoServer WMS",
    },
  },

  {
    id: "risiko-karhutla",
    group: "risiko",
    label: "Risiko Karhutla",
    description: "Peta risiko kebakaran hutan/lahan",
    icon: Flame,

    source: {
      type: "wms",
      wmsUrl: GIS_ENDPOINTS.geoserverWms,
      layers: "simiti:risiko_karhutla",
      params: {
        format: "image/png",
        transparent: true,
        version: "1.3.0",
      },
    },

    visible: false,
    opacity: 0.65,
    order: 32,

    metadata: {
      category: "risiko",
      service: "GeoServer WMS",
    },
  },

  {
    id: "risiko-kekeringan",
    group: "risiko",
    label: "Risiko Kekeringan",
    description: "Peta risiko kekeringan",
    icon: CloudSun,

    source: {
      type: "wms",
      wmsUrl: GIS_ENDPOINTS.geoserverWms,
      layers: "simiti:risiko_kekeringan",
      params: {
        format: "image/png",
        transparent: true,
        version: "1.3.0",
      },
    },

    visible: false,
    opacity: 0.65,
    order: 33,

    metadata: {
      category: "risiko",
      service: "GeoServer WMS",
    },
  },

  /* ==========================================================
     KEGIATAN
  ========================================================== */

  {
    id: "kegiatan-mitigasi",
    group: "kegiatan",
    label: "Lokasi Mitigasi",
    description: "Lokasi kegiatan mitigasi",
    icon: ShieldCheck,

    source: {
      type: "geojson",
      geojsonUrl: GIS_ENDPOINTS.mitigation,
    },

    visible: false,
    opacity: 1,
    order: 40,

    interactive: true,
    popup: true,

    style: {
      color: "#10b981",
      weight: 2,
      opacity: 0.9,
      fillColor: "#10b981",
      fillOpacity: 0.15,
    },

    metadata: {
      category: "kegiatan",
    },
  },

  {
    id: "kegiatan-adaptasi",
    group: "kegiatan",
    label: "Lokasi Adaptasi",
    description: "Lokasi kegiatan adaptasi",
    icon: Trees,

    source: {
      type: "geojson",
      geojsonUrl: GIS_ENDPOINTS.adaptation,
    },

    visible: false,
    opacity: 1,
    order: 41,

    interactive: true,
    popup: true,

    style: {
      color: "#22c55e",
      weight: 2,
      opacity: 0.9,
      fillColor: "#22c55e",
      fillOpacity: 0.15,
    },

    metadata: {
      category: "kegiatan",
    },
  },

  {
    id: "kegiatan-rekomendasi",
    group: "kegiatan",
    label: "Rekomendasi AI",
    description: "Hasil rekomendasi lokasi",
    icon: Activity,

    source: {
      type: "geojson",
      geojsonUrl: GIS_ENDPOINTS.recommendation,
    },

    visible: false,
    opacity: 1,
    order: 42,

    interactive: true,
    popup: true,

    style: {
      color: "#f59e0b",
      weight: 2,
      opacity: 1,
      fillColor: "#f59e0b",
      fillOpacity: 0.2,
    },

    metadata: {
      category: "kegiatan",
      service: "AI Recommendation",
    },
  },
];

/* ============================================================
   LEAFLET ICON
============================================================ */

const defaultMarkerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",

  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",

  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",

  iconSize: [25, 41],

  iconAnchor: [12, 41],

  popupAnchor: [1, -34],
});

/* ============================================================
   VECTOR GRID TYPE
============================================================ */

/*
 * leaflet.vectorgrid tidak memiliki typings resmi yang
 * selalu konsisten.
 *
 * Kita deklarasikan interface minimal untuk engine.
 */

interface VectorGridFactory {
  protobuf: (url: string, options: Record<string, unknown>) => L.Layer;
}

type LeafletWithVectorGrid = typeof L & {
  vectorGrid?: VectorGridFactory;
};

/* ============================================================
   UTILITY
============================================================ */

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/* ============================================================
   MAP VIEWPORT CONTROLLER
============================================================ */

function MapViewportController({
  target,
  zoom,
}: {
  target: MapCoordinate | null;
  zoom: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!target) {
      return;
    }

    map.flyTo([target.latitude, target.longitude], zoom, {
      duration: 0.8,
      easeLinearity: 0.25,
    });
  }, [map, target, zoom]);

  useEffect(() => {
    if (Math.abs(map.getZoom() - zoom) > 0.01) {
      map.setZoom(zoom);
    }
  }, [map, zoom]);

  return null;
}

/* ============================================================
   INITIAL INDONESIA VIEW
============================================================ */

function IndonesiaInitialView() {
  const map = useMap();

  useEffect(() => {
    map.fitBounds(INDONESIA_BOUNDS, {
      paddingTopLeft: [40, 40],
      paddingBottomRight: [40, 40],
      animate: false,
    });
  }, [map]);

  return null;
}
/* ============================================================
   MAP ZOOM SYNC
============================================================ */

function MapZoomSync({
  onZoomChange,
}: {
  onZoomChange: (zoom: number) => void;
}) {
  useMapEvents({
    zoomend(event) {
      onZoomChange(event.target.getZoom());
    },
  });

  return null;
}

/* ============================================================
   MAP CLICK HANDLER
============================================================ */

function MapClickHandler({
  activeTool,
  onCoordinateChange,
}: {
  activeTool: ToolKey;

  onCoordinateChange: (latitude: number, longitude: number) => void;
}) {
  useMapEvents({
    click(event) {
      const latitude = event.latlng.lat;

      const longitude = event.latlng.lng;

      onCoordinateChange(latitude, longitude);

      if (activeTool === "measure" || activeTool === "draw") {
        return;
      }
    },
  });

  return null;
}

/* ============================================================
   GEOJSON LAYER
============================================================ */

interface GeoJSONLayerRendererProps {
  layer: GISLayerDefinition;

  onFeatureSelect?: (feature: GisFeature) => void;
}

function GeoJSONLayerRenderer({
  layer,
  onFeatureSelect,
}: GeoJSONLayerRendererProps) {
  const [data, setData] = useState<GeoJSON.GeoJsonObject | null>(
    layer.source.geojsonData ?? null,
  );

  const [loading, setLoading] = useState(Boolean(layer.source.geojsonUrl));

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const url = layer.source.geojsonUrl;

    if (!url) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    setLoading(true);
    setError(null);

    fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/geo+json, application/json",
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return response.json();
      })
      .then((json) => {
        if (cancelled) {
          return;
        }

        setData(json);
        setLoading(false);
      })
      .catch((fetchError) => {
        if (cancelled || fetchError?.name === "AbortError") {
          return;
        }

        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Failed loading GeoJSON",
        );

        setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [layer.source.geojsonUrl]);

  const style = layer.style;

  const featureStyle = () => ({
    color: style?.color ?? "#10b981",

    weight: style?.weight ?? 1,

    opacity: style?.opacity ?? 1,

    fillColor: style?.fillColor ?? style?.color ?? "#10b981",

    fillOpacity: style?.fillOpacity ?? 0.08,
  });

  const pointToLayer = (feature: GeoJSON.Feature, latlng: L.LatLng) => {
    return L.marker(latlng, {
      icon: defaultMarkerIcon,
      opacity: layer.opacity,
    });
  };

  const onEachFeature = (feature: GeoJSON.Feature, leafletLayer: L.Layer) => {
    if (!layer.interactive) {
      return;
    }

    leafletLayer.on("click", () => {
      if (!onFeatureSelect) {
        return;
      }

      const properties = (feature.properties ?? {}) as Record<string, unknown>;

      const coordinates = getFeatureCenter(feature);

      onFeatureSelect({
        id: String(
          properties.id ??
            properties.ID ??
            properties.gid ??
            properties.GID ??
            crypto.randomUUID(),
        ),

        name: String(
          properties.name ??
            properties.nama ??
            properties.NAMA ??
            properties.label ??
            layer.label,
        ),

        type: String(properties.type ?? properties.jenis ?? layer.label),

        wilayah: getStringProperty(properties, [
          "wilayah",
          "provinsi",
          "province",
          "kabupaten",
        ]),

        kecamatan: getStringProperty(properties, ["kecamatan", "district"]),

        desa: getStringProperty(properties, ["desa", "kelurahan", "village"]),

        latitude: coordinates.latitude,

        longitude: coordinates.longitude,

        riskLevel: getStringProperty(properties, [
          "riskLevel",
          "risk_level",
          "risiko",
          "risk",
        ]),

        confidence: getNumberProperty(properties, [
          "confidence",
          "confidence_score",
        ]),

        properties,
      });
    });

    if (layer.popup) {
      leafletLayer.bindPopup(createFeaturePopupHtml(layer, feature));
    }
  };

  if (loading || error || !data) {
    return <LayerRuntimeStatus loading={loading} error={error} layer={layer} />;
  }

  return (
    <GeoJSON
      key={`${layer.id}-${layer.source.geojsonUrl ?? "inline"}`}
      data={data}
      style={featureStyle}
      pointToLayer={pointToLayer}
      onEachFeature={onEachFeature}
    />
  );
}

/* ============================================================
   VECTOR TILE LAYER
============================================================ */

function VectorTileLayerRenderer({
  layer,
  onFeatureSelect,
}: GeoJSONLayerRendererProps) {
  const map = useMap();

  useEffect(() => {
    const vectorTileUrl = layer.source.vectorTileUrl;

    if (!vectorTileUrl) {
      return;
    }

    const leaflet = L as LeafletWithVectorGrid;

    if (!leaflet.vectorGrid) {
      console.error("[GIS Layer Engine] leaflet.vectorgrid belum terpasang.");

      return;
    }

    const color = layer.style?.color ?? "#10b981";

    const weight = layer.style?.weight ?? 1;

    const opacity = layer.style?.opacity ?? 1;

    const vectorLayerStyles: Record<string, unknown> = {};

    if (layer.source.vectorLayerName) {
      vectorLayerStyles[layer.source.vectorLayerName] = {
        color,
        weight,
        opacity,
        fillColor: layer.style?.fillColor ?? color,
        fillOpacity: layer.style?.fillOpacity ?? 0.15,
      };
    } else {
      vectorLayerStyles["*"] = {
        color,
        weight,
        opacity,
        fillColor: layer.style?.fillColor ?? color,
        fillOpacity: layer.style?.fillOpacity ?? 0.15,
      };
    }

    const vectorGrid = leaflet.vectorGrid.protobuf(vectorTileUrl, {
      rendererFactory: L.canvas.tile,

      vectorTileLayerStyles: vectorLayerStyles,

      interactive: Boolean(layer.interactive),

      pane: `gis-layer-${layer.id}`,

      maxZoom: layer.maxZoom ?? MAX_ZOOM,

      minZoom: layer.minZoom ?? MIN_ZOOM,

      getFeatureId: (feature: any) => {
        return feature?.properties?.id ?? feature?.properties?.gid;
      },
    });

    if (layer.interactive) {
      vectorGrid.on("click", (event: any) => {
        if (!onFeatureSelect) {
          return;
        }

        const properties = (event.layer?.properties ?? {}) as Record<
          string,
          unknown
        >;

        const latlng = event.latlng;

        onFeatureSelect({
          id: String(properties.id ?? properties.gid ?? crypto.randomUUID()),

          name: String(
            properties.name ??
              properties.nama ??
              properties.label ??
              layer.label,
          ),

          type: String(properties.type ?? layer.label),

          wilayah: getStringProperty(properties, [
            "wilayah",
            "provinsi",
            "kabupaten",
          ]),

          kecamatan: getStringProperty(properties, ["kecamatan"]),

          desa: getStringProperty(properties, ["desa", "kelurahan"]),

          latitude: latlng.lat,

          longitude: latlng.lng,

          riskLevel: getStringProperty(properties, [
            "risk",
            "risk_level",
            "risiko",
          ]),

          confidence: getNumberProperty(properties, ["confidence"]),

          properties,
        });
      });
    }

    vectorGrid.addTo(map);

    vectorGrid.setOpacity?.(layer.opacity);

    return () => {
      map.removeLayer(vectorGrid);
    };
  }, [
    map,
    layer.id,
    layer.opacity,
    layer.interactive,
    layer.maxZoom,
    layer.minZoom,
    layer.source.vectorTileUrl,
    layer.source.vectorLayerName,
    layer.style?.color,
    layer.style?.weight,
    layer.style?.opacity,
    layer.style?.fillColor,
    layer.style?.fillOpacity,
    onFeatureSelect,
  ]);

  return null;
}

/* ============================================================
   LAYER RUNTIME STATUS
============================================================ */

function LayerRuntimeStatus({
  loading,
  error,
  layer,
}: {
  loading: boolean;

  error: string | null;

  layer: GISLayerDefinition;
}) {
  if (!loading && !error) {
    return null;
  }

  /*
   * Status sengaja tidak menghalangi peta.
   */
  return null;
}

/* ============================================================
   FEATURE PROPERTY HELPERS
============================================================ */

function getStringProperty(
  properties: Record<string, unknown>,
  keys: string[],
) {
  for (const key of keys) {
    const value = properties[key];

    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value);
    }
  }

  return undefined;
}

function getNumberProperty(
  properties: Record<string, unknown>,
  keys: string[],
) {
  for (const key of keys) {
    const value = properties[key];

    if (typeof value === "number") {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

/* ============================================================
   FEATURE CENTER
============================================================ */

function getFeatureCenter(feature: GeoJSON.Feature): MapCoordinate {
  const geometry = feature.geometry;

  if (geometry.type === "Point") {
    return {
      latitude: geometry.coordinates[1],

      longitude: geometry.coordinates[0],
    };
  }

  /*
   * Untuk geometry polygon / line,
   * kita gunakan bbox jika tersedia.
   */

  const bbox = feature.bbox;

  if (bbox && bbox.length >= 4) {
    return {
      latitude: (bbox[1] + bbox[3]) / 2,

      longitude: (bbox[0] + bbox[2]) / 2,
    };
  }

  /*
   * Fallback aman jika geometry
   * tidak punya bbox.
   */
  return {
    latitude: DEFAULT_MAP_CENTER[0],

    longitude: DEFAULT_MAP_CENTER[1],
  };
}

/* ============================================================
   POPUP HTML
============================================================ */

function createFeaturePopupHtml(
  layer: GISLayerDefinition,
  feature: GeoJSON.Feature,
) {
  const properties = (feature.properties ?? {}) as Record<string, unknown>;

  const entries = Object.entries(properties).slice(0, 8);

  const rows = entries
    .map(
      ([key, value]) => `
          <div style="
            display:flex;
            justify-content:space-between;
            gap:12px;
            padding:5px 0;
            border-bottom:1px solid #e5e7eb;
          ">
            <span style="
              color:#64748b;
              font-size:11px;
            ">
              ${escapeHtml(key)}
            </span>

            <span style="
              color:#0f172a;
              font-size:11px;
              font-weight:600;
              text-align:right;
            ">
              ${escapeHtml(String(value ?? ""))}
            </span>
          </div>
        `,
    )
    .join("");

  return `
    <div style="
      min-width:220px;
      max-width:320px;
      font-family:Inter,system-ui,sans-serif;
    ">
      <div style="
        font-size:13px;
        font-weight:700;
        color:#0f172a;
        margin-bottom:4px;
      ">
        ${escapeHtml(layer.label)}
      </div>

      <div style="
        font-size:10px;
        color:#64748b;
        margin-bottom:10px;
      ">
        ${escapeHtml(layer.description)}
      </div>

      ${rows}
    </div>
  `;
}

/* ============================================================
   ESCAPE HTML
============================================================ */

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ============================================================
   GIS LAYER RENDERER
============================================================ */

function GISLayerRenderer({
  layer,
  onFeatureSelect,
}: {
  layer: GISLayerDefinition;

  onFeatureSelect: (feature: GisFeature) => void;
}) {
  const source = layer.source;

  /*
   * Layer tanpa endpoint
   * tidak dirender.
   */
  if (source.type === "raster" && !source.url) {
    return null;
  }

  if (source.type === "wms" && !source.wmsUrl) {
    return null;
  }

  if (source.type === "geojson" && !source.geojsonUrl && !source.geojsonData) {
    return null;
  }

  if (source.type === "vector-tile" && !source.vectorTileUrl) {
    return null;
  }

  const paneName = `gis-layer-${layer.id}`;

  /*
   * Z-index:
   *
   * 100 + order
   *
   * Basemap:
   * 100
   *
   * Administrasi:
   * 110+
   *
   * Risiko:
   * 130+
   *
   * Kegiatan:
   * 140+
   */

  const zIndex = 100 + layer.order;

  return (
    <Pane
      name={paneName}
      style={{
        zIndex,
        opacity: layer.opacity,
      }}
    >
      {source.type === "raster" && (
        <TileLayer
          url={source.url!}
          attribution={source.attribution}
          subdomains={source.subdomains}
          maxNativeZoom={source.maxNativeZoom}
          maxZoom={source.maxZoom ?? MAX_ZOOM}
          opacity={layer.opacity}
        />
      )}

      {source.type === "wms" && (
        <WMSTileLayer
          url={source.wmsUrl!}
          layers={source.layers ?? ""}
          format={String(source.params?.format ?? "image/png")}
          transparent={Boolean(source.params?.transparent ?? true)}
          version={String(source.params?.version ?? "1.3.0")}
          opacity={layer.opacity}
          maxZoom={source.maxZoom ?? MAX_ZOOM}
        />
      )}

      {source.type === "geojson" && (
        <GeoJSONLayerRenderer layer={layer} onFeatureSelect={onFeatureSelect} />
      )}

      {source.type === "vector-tile" && (
        <VectorTileLayerRenderer
          layer={layer}
          onFeatureSelect={onFeatureSelect}
        />
      )}
    </Pane>
  );
}

/* ============================================================
   GIS LAYER ENGINE
============================================================ */

interface GISLayerEngineProps {
  layers: GISLayerDefinition[];

  activeTool: ToolKey;

  selectedFeatureId: string | null;

  onFeatureSelect: (feature: GisFeature) => void;

  onCoordinateChange: (latitude: number, longitude: number) => void;

  zoom: number;

  viewportTarget: MapCoordinate | null;

  onZoomChange: (zoom: number) => void;
}

function GISLayerEngine({
  layers,
  activeTool,
  onFeatureSelect,
  onCoordinateChange,
  zoom,
  viewportTarget,
  onZoomChange,
}: GISLayerEngineProps) {
  /*
   * Layer engine hanya concern
   * terhadap layer rendering.
   *
   * UI tidak tahu apakah source
   * itu WMS, GeoJSON atau MVT.
   */

  const visibleLayers = useMemo(
    () =>
      layers.filter((layer) => layer.visible).sort((a, b) => a.order - b.order),
    [layers],
  );

  return (
    <>
      <MapContainer
        center={DEFAULT_MAP_CENTER}
        zoom={DEFAULT_ZOOM}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        maxBounds={INDONESIA_BOUNDS}
        maxBoundsViscosity={0.65}
        zoomControl={false}
        className="absolute inset-0 h-full w-full"
      >
        <IndonesiaInitialView />

        <MapZoomSync onZoomChange={onZoomChange} />

        <MapViewportController target={viewportTarget} zoom={zoom} />

        <MapClickHandler
          activeTool={activeTool}
          onCoordinateChange={onCoordinateChange}
        />

        {visibleLayers.map((layer) => (
          <GISLayerRenderer
            key={`${layer.id}-${layer.order}`}
            layer={layer}
            onFeatureSelect={onFeatureSelect}
          />
        ))}
      </MapContainer>
    </>
  );
}

/* ============================================================
   MAP ENGINE
============================================================ */

interface MapEngineProps {
  layers: GISLayerDefinition[];

  zoom: number;

  activeTool: ToolKey;

  searchValue: string;

  selectedFeatureId: string | null;

  viewportTarget: MapCoordinate | null;

  onZoomChange: (zoom: number) => void;

  onFeatureSelect: (feature: GisFeature) => void;

  onCoordinateChange: (latitude: number, longitude: number) => void;
}

function MapEngine({
  layers,
  zoom,
  activeTool,
  searchValue,
  selectedFeatureId,
  viewportTarget,
  onZoomChange,
  onFeatureSelect,
  onCoordinateChange,
}: MapEngineProps) {
  const configuredLayers = layers.filter((layer) => {
    const source = layer.source;

    if (source.type === "raster") {
      return Boolean(source.url);
    }

    if (source.type === "wms") {
      return Boolean(source.wmsUrl);
    }

    if (source.type === "geojson") {
      return Boolean(source.geojsonUrl || source.geojsonData);
    }

    if (source.type === "vector-tile") {
      return Boolean(source.vectorTileUrl);
    }

    return false;
  });

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#172336]">
      <GISLayerEngine
        layers={layers}
        activeTool={activeTool}
        selectedFeatureId={selectedFeatureId}
        onFeatureSelect={onFeatureSelect}
        onCoordinateChange={onCoordinateChange}
        zoom={zoom}
        viewportTarget={viewportTarget}
        onZoomChange={onZoomChange}
      />

      {/* SEARCH STATUS */}

      {searchValue.trim() && (
        <div className="absolute left-4 top-4 z-[1000] max-w-[260px] rounded-xl border border-emerald-500/20 bg-slate-950/90 px-3 py-2 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <Search size={13} className="text-emerald-400" />

            <div className="min-w-0">
              <div className="text-[8px] font-bold uppercase tracking-wider text-slate-600">
                Search
              </div>

              <div className="truncate text-[10px] font-semibold text-white">
                {searchValue}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EMPTY STATE */}

      {configuredLayers.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[900] flex items-center justify-center">
          <div className="rounded-2xl border border-slate-700/60 bg-slate-950/60 px-5 py-4 text-center shadow-2xl backdrop-blur-md">
            <MapIcon size={28} className="mx-auto text-slate-600" />

            <div className="mt-3 text-xs font-bold text-slate-400">
              Belum ada GIS source
            </div>

            <div className="mt-1 max-w-[280px] text-[9px] leading-relaxed text-slate-600">
              Konfigurasikan endpoint WMS, GeoJSON atau Vector Tile pada GIS
              Layer Engine.
            </div>
          </div>
        </div>
      )}

      {/* CROSSHAIR */}

      <div className="pointer-events-none absolute left-1/2 top-1/2 z-[800] -translate-x-1/2 -translate-y-1/2 text-slate-500/20">
        <Crosshair size={36} strokeWidth={1} />
      </div>
    </div>
  );
}

/* ============================================================
   MAIN COMPONENT
============================================================ */

export default function GisCommandCenter() {
  /* ==========================================================
     STATE
  ========================================================== */

  const [layers, setLayers] =
    useState<GISLayerDefinition[]>(INITIAL_GIS_LAYERS);

  const [activeTool, setActiveTool] = useState<ToolKey>("select");

  const [searchValue, setSearchValue] = useState("");

  const [layerSearch, setLayerSearch] = useState("");

  const [leftPanelOpen, setLeftPanelOpen] = useState(true);

  const [rightPanelOpen, setRightPanelOpen] = useState(false);

  const [fullscreen, setFullscreen] = useState(false);

  const [mobilePanel, setMobilePanel] = useState<
    "layers" | "tools" | "info" | null
  >(null);

  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(
    null,
  );

  const [selectedFeature, setSelectedFeature] = useState<GisFeature | null>(
    null,
  );

  const [viewportTarget, setViewportTarget] = useState<MapCoordinate | null>(
    null,
  );

  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  const [latitude, setLatitude] = useState(DEFAULT_MAP_CENTER[0]);

  const [longitude, setLongitude] = useState(DEFAULT_MAP_CENTER[1]);

  const [showRiskSummary, setShowRiskSummary] = useState(true);

  const [riskSummary] = useState<RiskSummaryData>({
    aman: 0,
    waspada: 0,
    rawan: 0,
  });

  const [openGroups, setOpenGroups] = useState<Record<LayerGroupKey, boolean>>({
    basemap: true,
    administrasi: true,
    spasial: false,
    risiko: true,
    kegiatan: false,
  });

  /* ==========================================================
     DERIVED
  ========================================================== */

  const activeLayerCount = useMemo(
    () => layers.filter((layer) => layer.visible).length,
    [layers],
  );

  const configuredLayerCount = useMemo(
    () =>
      layers.filter((layer) => {
        const source = layer.source;

        if (source.type === "raster") {
          return Boolean(source.url);
        }

        if (source.type === "wms") {
          return Boolean(source.wmsUrl);
        }

        if (source.type === "geojson") {
          return Boolean(source.geojsonUrl || source.geojsonData);
        }

        if (source.type === "vector-tile") {
          return Boolean(source.vectorTileUrl);
        }

        return false;
      }).length,
    [layers],
  );

  const filteredLayers = useMemo(() => {
    const keyword = layerSearch.trim().toLowerCase();

    if (!keyword) {
      return layers;
    }

    return layers.filter(
      (layer) =>
        layer.label.toLowerCase().includes(keyword) ||
        layer.description.toLowerCase().includes(keyword) ||
        layer.source.type.toLowerCase().includes(keyword),
    );
  }, [layers, layerSearch]);

  const layersByGroup = useMemo(() => {
    const map = new Map<LayerGroupKey, GISLayerDefinition[]>();

    for (const group of GIS_LAYER_GROUPS) {
      map.set(group.id, []);
    }

    for (const layer of filteredLayers) {
      map.get(layer.group)?.push(layer);
    }

    return map;
  }, [filteredLayers]);

  /* ==========================================================
     LAYER ACTIONS
  ========================================================== */

  const toggleLayer = (layerId: string) => {
    setLayers((current) =>
      current.map((layer) =>
        layer.id === layerId
          ? {
              ...layer,
              visible: !layer.visible,
            }
          : layer,
      ),
    );
  };

  const setLayerOpacity = (layerId: string, opacity: number) => {
    setLayers((current) =>
      current.map((layer) =>
        layer.id === layerId
          ? {
              ...layer,
              opacity: clamp(opacity, 0, 1),
            }
          : layer,
      ),
    );
  };

  const moveLayer = (layerId: string, direction: "up" | "down") => {
    setLayers((current) => {
      const sorted = [...current].sort((a, b) => a.order - b.order);

      const index = sorted.findIndex((layer) => layer.id === layerId);

      if (index === -1) {
        return current;
      }

      const targetIndex = direction === "up" ? index + 1 : index - 1;

      if (targetIndex < 0 || targetIndex >= sorted.length) {
        return current;
      }

      const temp = sorted[index];

      sorted[index] = sorted[targetIndex];

      sorted[targetIndex] = temp;

      return sorted.map((layer, nextIndex) => ({
        ...layer,
        order: nextIndex,
      }));
    });
  };

  const toggleGroup = (groupId: LayerGroupKey) => {
    setOpenGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
  };

  /* ==========================================================
     FEATURE SELECT
  ========================================================== */

  const handleFeatureSelect = (feature: GisFeature) => {
    setSelectedFeatureId(feature.id);

    setSelectedFeature(feature);

    setLatitude(feature.latitude);

    setLongitude(feature.longitude);

    setViewportTarget({
      latitude: feature.latitude,

      longitude: feature.longitude,
    });

    setRightPanelOpen(true);
  };

  /* ==========================================================
     TOOL
  ========================================================== */

  const selectTool = (tool: ToolKey) => {
    setActiveTool(tool);

    if (tool === "gps") {
      if (typeof navigator !== "undefined" && "geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const nextLatitude = position.coords.latitude;

            const nextLongitude = position.coords.longitude;

            setLatitude(nextLatitude);

            setLongitude(nextLongitude);

            setViewportTarget({
              latitude: nextLatitude,

              longitude: nextLongitude,
            });
          },
          () => {
            /*
             * Tidak ada fallback
             * koordinat dummy.
             */
          },
        );
      }

      return;
    }

    if (tool === "measure" || tool === "draw") {
      setSelectedFeatureId(null);

      setSelectedFeature(null);
    }
  };

  /* ==========================================================
     RESET
  ========================================================== */

  const resetMapView = () => {
    setZoom(DEFAULT_ZOOM);

    setLatitude(DEFAULT_MAP_CENTER[0]);

    setLongitude(DEFAULT_MAP_CENTER[1]);

    setViewportTarget({
      latitude: DEFAULT_MAP_CENTER[0],

      longitude: DEFAULT_MAP_CENTER[1],
    });

    setActiveTool("select");

    setSelectedFeatureId(null);

    setSelectedFeature(null);

    setRightPanelOpen(false);

    setSearchValue("");
  };

  /* ==========================================================
     MOBILE
  ========================================================== */

  const openMobilePanel = (panel: "layers" | "tools" | "info") => {
    setMobilePanel(mobilePanel === panel ? null : panel);
  };

  /* ==========================================================
     TOOL BUTTON
  ========================================================== */

  const ToolButton = ({
    id,
    icon: Icon,
    label,
  }: {
    id: ToolKey;

    icon: React.ElementType;

    label: string;
  }) => {
    const active = activeTool === id;

    return (
      <button
        type="button"
        onClick={() => selectTool(id)}
        title={label}
        className={`
          group
          flex
          h-9
          items-center
          justify-center
          gap-2
          rounded-lg
          border
          px-3
          text-[11px]
          font-semibold
          transition-all
          duration-200
          ${
            active
              ? "border-emerald-400/40 bg-emerald-500 text-white shadow-lg shadow-emerald-950/30"
              : "border-slate-700/80 bg-slate-900/90 text-slate-300 hover:border-slate-600 hover:bg-slate-800 hover:text-white"
          }
        `}
      >
        <Icon size={15} strokeWidth={1.9} />

        <span>{label}</span>
      </button>
    );
  };

  /* ==========================================================
     LAYER TYPE BADGE
  ========================================================== */

  const LayerTypeBadge = ({ type }: { type: GISLayerType }) => {
    const labels: Record<GISLayerType, string> = {
      raster: "XYZ",
      wms: "WMS",
      geojson: "JSON",
      "vector-tile": "MVT",
    };

    return (
      <span className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-slate-500">
        {labels[type]}
      </span>
    );
  };

  /* ==========================================================
     LAYER PANEL
  ========================================================== */

  const LayerPanel = () => (
    <section className="flex h-full w-full flex-col bg-[#09111f]">
      <div className="shrink-0 border-b border-slate-800/90 bg-[#0b1424] px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/10">
              <Layers3 size={17} />
            </div>

            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold text-white">
                GIS Layer Engine
              </h2>

              <p className="mt-0.5 text-[10px] text-slate-500">
                WMS · GeoJSON · MVT · XYZ
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setLeftPanelOpen(false);

              setMobilePanel(null);
            }}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-white lg:hidden"
          >
            <X size={16} />
          </button>
        </div>

        <div className="relative mt-4">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />

          <input
            value={layerSearch}
            onChange={(event) => setLayerSearch(event.target.value)}
            type="text"
            placeholder="Cari layer..."
            className="
              h-9
              w-full
              rounded-lg
              border
              border-slate-700/80
              bg-[#080f1b]
              pl-9
              pr-3
              text-[11px]
              text-white
              outline-none
              placeholder:text-slate-600
              focus:border-emerald-500/50
              focus:ring-2
              focus:ring-emerald-500/10
            "
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
            <div className="text-[8px] uppercase tracking-wider text-slate-600">
              Visible
            </div>

            <div className="mt-1 text-xs font-bold text-emerald-400">
              {activeLayerCount}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
            <div className="text-[8px] uppercase tracking-wider text-slate-600">
              Configured
            </div>

            <div className="mt-1 text-xs font-bold text-slate-300">
              {configuredLayerCount}
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-2">
          {GIS_LAYER_GROUPS.map((group) => {
            const groupLayers = layersByGroup.get(group.id) ?? [];

            if (groupLayers.length === 0) {
              return null;
            }

            const GroupIcon = group.icon;

            const visibleCount = groupLayers.filter(
              (layer) => layer.visible,
            ).length;

            const isOpen = openGroups[group.id];

            return (
              <div
                key={group.id}
                className="overflow-hidden rounded-xl border border-slate-800/90 bg-[#0b1422]/70"
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-slate-800/50"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800/90 text-slate-400">
                    <GroupIcon size={14} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[10px] font-bold text-slate-200">
                      {group.label}
                    </div>

                    <div className="mt-0.5 truncate text-[9px] text-slate-600">
                      {group.description}
                    </div>
                  </div>

                  {visibleCount > 0 && (
                    <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-bold text-emerald-400">
                      {visibleCount}
                    </span>
                  )}

                  <ChevronDown
                    size={13}
                    className={`text-slate-600 transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="border-t border-slate-800/80 px-2 py-2">
                    <div className="space-y-1">
                      {groupLayers
                        .sort((a, b) => b.order - a.order)
                        .map((layer, index) => {
                          const ItemIcon = layer.icon;

                          const globalIndex = layers
                            .slice()
                            .sort((a, b) => a.order - b.order)
                            .findIndex((item) => item.id === layer.id);

                          const sortedAll = layers
                            .slice()
                            .sort((a, b) => a.order - b.order);

                          const canMoveDown = globalIndex > 0;

                          const canMoveUp = globalIndex < sortedAll.length - 1;

                          return (
                            <div
                              key={layer.id}
                              className={`rounded-lg border ${
                                layer.visible
                                  ? "border-emerald-500/10 bg-emerald-500/[0.035]"
                                  : "border-transparent"
                              }`}
                            >
                              <div className="flex items-center gap-2 px-2 py-2">
                                <GripVertical
                                  size={12}
                                  className="shrink-0 text-slate-700"
                                />

                                <button
                                  type="button"
                                  onClick={() => toggleLayer(layer.id)}
                                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                                    layer.visible
                                      ? "border-emerald-400 bg-emerald-500 text-white"
                                      : "border-slate-700 bg-slate-950 text-transparent"
                                  }`}
                                  title={
                                    layer.visible ? "Hide layer" : "Show layer"
                                  }
                                >
                                  {layer.visible && (
                                    <Check size={11} strokeWidth={3} />
                                  )}
                                </button>

                                <ItemIcon
                                  size={14}
                                  className={
                                    layer.visible
                                      ? "text-emerald-400"
                                      : "text-slate-600"
                                  }
                                />

                                <div className="min-w-0 flex-1">
                                  <div
                                    className={`truncate text-[10px] font-semibold ${
                                      layer.visible
                                        ? "text-slate-200"
                                        : "text-slate-400"
                                    }`}
                                  >
                                    {layer.label}
                                  </div>

                                  <div className="mt-0.5 flex items-center gap-1.5">
                                    <LayerTypeBadge type={layer.source.type} />

                                    <span className="truncate text-[8px] text-slate-600">
                                      {layer.description}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex shrink-0 items-center">
                                  <button
                                    type="button"
                                    disabled={!canMoveUp}
                                    onClick={() => moveLayer(layer.id, "up")}
                                    className="rounded p-1 text-slate-600 transition hover:bg-slate-800 hover:text-slate-200 disabled:opacity-20"
                                    title="Move layer up"
                                  >
                                    <ChevronUp size={12} />
                                  </button>

                                  <button
                                    type="button"
                                    disabled={!canMoveDown}
                                    onClick={() => moveLayer(layer.id, "down")}
                                    className="rounded p-1 text-slate-600 transition hover:bg-slate-800 hover:text-slate-200 disabled:opacity-20"
                                    title="Move layer down"
                                  >
                                    <ChevronDownIcon size={12} />
                                  </button>

                                  {layer.visible ? (
                                    <Eye
                                      size={13}
                                      className="ml-1 text-emerald-400/60"
                                    />
                                  ) : (
                                    <EyeOff
                                      size={13}
                                      className="ml-1 text-slate-700"
                                    />
                                  )}
                                </div>
                              </div>

                              {layer.visible && (
                                <div className="border-t border-slate-800/60 px-3 py-2">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-[8px] font-semibold uppercase tracking-wider text-slate-600">
                                      Opacity
                                    </span>

                                    <span className="font-mono text-[8px] text-slate-500">
                                      {Math.round(layer.opacity * 100)}%
                                    </span>
                                  </div>

                                  <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={layer.opacity}
                                    onChange={(event) =>
                                      setLayerOpacity(
                                        layer.id,
                                        Number(event.target.value),
                                      )
                                    }
                                    className="mt-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-slate-800 accent-emerald-500"
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 border-t border-slate-800 bg-[#0b1424] px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-slate-600">GIS Layer Engine</span>

          <span className="flex items-center gap-1.5 text-[9px] font-bold text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
            READY
          </span>
        </div>
      </div>
    </section>
  );

  /* ==========================================================
     INFO ROW
  ========================================================== */

  const InfoRow = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[9px] font-medium text-slate-600">{label}</span>

      <span className="max-w-[170px] truncate text-right text-[9px] font-semibold text-slate-300">
        {value}
      </span>
    </div>
  );

  /* ==========================================================
     METRIC CARD
  ========================================================== */

  const MetricCard = ({ label, value }: { label: string; value: string }) => (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
      <div className="text-[8px] text-slate-600">{label}</div>

      <div className="mt-1 text-[11px] font-bold text-slate-200">{value}</div>
    </div>
  );

  /* ==========================================================
     INFO PANEL
  ========================================================== */

  const InfoPanel = () => (
    <section className="flex h-full w-full flex-col bg-[#09111f]">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-[#0b1424] px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
            <Info size={16} />
          </div>

          <div>
            <h2 className="text-sm font-bold text-white">
              Feature Information
            </h2>

            <p className="mt-0.5 text-[10px] text-slate-500">
              Detail objek GIS
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setRightPanelOpen(false);

            setMobilePanel(null);
          }}
          className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>

      {selectedFeature ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-[#0d1728] to-[#080e18] p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                <MapPinned size={18} />
              </div>

              <div className="min-w-0">
                <div className="text-[8px] font-bold uppercase tracking-[0.16em] text-slate-600">
                  Selected Feature
                </div>

                <div className="mt-1 truncate text-sm font-bold text-white">
                  {selectedFeature.name}
                </div>

                {selectedFeature.type && (
                  <div className="mt-1 text-[9px] text-slate-500">
                    {selectedFeature.type}
                  </div>
                )}
              </div>
            </div>

            <div className="my-4 h-px bg-slate-800" />

            <div className="space-y-3">
              {selectedFeature.wilayah && (
                <InfoRow label="Wilayah" value={selectedFeature.wilayah} />
              )}

              {selectedFeature.kecamatan && (
                <InfoRow label="Kecamatan" value={selectedFeature.kecamatan} />
              )}

              {selectedFeature.desa && (
                <InfoRow label="Desa" value={selectedFeature.desa} />
              )}

              <InfoRow
                label="Latitude"
                value={selectedFeature.latitude.toFixed(6)}
              />

              <InfoRow
                label="Longitude"
                value={selectedFeature.longitude.toFixed(6)}
              />

              {selectedFeature.riskLevel && (
                <InfoRow label="Risiko" value={selectedFeature.riskLevel} />
              )}

              {typeof selectedFeature.confidence === "number" && (
                <InfoRow
                  label="Confidence"
                  value={`${selectedFeature.confidence}%`}
                />
              )}
            </div>
          </div>

          {selectedFeature.properties && (
            <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
              <div className="flex items-center gap-2">
                <Database size={13} className="text-blue-400" />

                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Properties
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {Object.entries(selectedFeature.properties)
                  .slice(0, 12)
                  .map(([key, value]) => (
                    <InfoRow
                      key={key}
                      label={key}
                      value={String(value ?? "")}
                    />
                  ))}
              </div>
            </div>
          )}

          {(selectedFeature.riskLevel ||
            typeof selectedFeature.confidence === "number") && (
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
              <div className="flex items-center gap-2">
                <Zap size={13} className="text-amber-400" />

                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Analysis
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {selectedFeature.riskLevel && (
                  <MetricCard
                    label="Risiko"
                    value={selectedFeature.riskLevel}
                  />
                )}

                {typeof selectedFeature.confidence === "number" && (
                  <MetricCard
                    label="Confidence"
                    value={`${selectedFeature.confidence}%`}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-slate-600">
            <MousePointer2 size={25} />
          </div>

          <h3 className="mt-4 text-sm font-bold text-slate-300">
            Belum ada objek dipilih
          </h3>

          <p className="mt-2 max-w-[220px] text-[10px] leading-relaxed text-slate-500">
            Klik feature GeoJSON atau Vector Tile untuk melihat informasi GIS.
          </p>

          <button
            type="button"
            onClick={() => selectTool("identify")}
            className="mt-5 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[9px] font-bold text-emerald-400 transition hover:bg-emerald-500/15"
          >
            <Crosshair size={13} />
            Aktifkan Identify
          </button>
        </div>
      )}
    </section>
  );

  /* ==========================================================
     RISK SUMMARY
  ========================================================== */

  const RiskItem = ({
    label,
    value,
    type,
  }: {
    label: string;
    value: number;
    type: RiskType;
  }) => {
    const styles = {
      safe: {
        text: "text-emerald-400",
        dot: "bg-emerald-400",
      },

      warning: {
        text: "text-amber-400",
        dot: "bg-amber-400",
      },

      danger: {
        text: "text-red-400",
        dot: "bg-red-400",
      },
    };

    return (
      <div className="px-2 py-3 text-center">
        <span
          className={`mx-auto mb-1 block h-1.5 w-1.5 rounded-full ${styles[type].dot}`}
        />

        <div className={`text-[12px] font-bold ${styles[type].text}`}>
          {value.toLocaleString()}
        </div>

        <div className="mt-0.5 text-[8px] font-medium text-slate-600">
          {label}
        </div>
      </div>
    );
  };

  const RiskSummary = () => {
    if (!showRiskSummary) {
      return (
        <button
          type="button"
          onClick={() => setShowRiskSummary(true)}
          className="absolute left-4 top-4 z-[1000] flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/90 text-slate-300 shadow-xl backdrop-blur-xl transition hover:border-emerald-500/30 hover:text-white"
          title="Tampilkan ringkasan risiko"
        >
          <AlertTriangle size={15} />
        </button>
      );
    }

    return (
      <div className="absolute left-4 top-4 z-[1000] w-[220px] overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/90 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-3.5 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-emerald-400" />

            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-300">
              Risk Summary
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowRiskSummary(false)}
            className="text-slate-600 transition hover:text-white"
          >
            <X size={13} />
          </button>
        </div>

        <div className="grid grid-cols-3 divide-x divide-slate-800">
          <RiskItem label="Aman" value={riskSummary.aman} type="safe" />

          <RiskItem
            label="Waspada"
            value={riskSummary.waspada}
            type="warning"
          />

          <RiskItem label="Rawan" value={riskSummary.rawan} type="danger" />
        </div>
      </div>
    );
  };

  /* ==========================================================
     MAP CONTROLS
  ========================================================== */

  const MapControlButton = ({
    icon: Icon,
    label,
    onClick,
    last = false,
  }: {
    icon: React.ElementType;

    label: string;

    onClick: () => void;

    last?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`
          flex
          h-9
          w-9
          items-center
          justify-center
          text-slate-300
          transition
          hover:bg-slate-800
          hover:text-white
          ${!last ? "border-b border-slate-800" : ""}
        `}
    >
      <Icon size={15} />
    </button>
  );

  const MapControls = () => (
    <div className="absolute bottom-16 right-4 z-[1000] flex flex-col overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950/90 shadow-2xl backdrop-blur-xl">
      <MapControlButton
        icon={Plus}
        label="Zoom in"
        onClick={() => setZoom((value) => Math.min(value + 1, MAX_ZOOM))}
      />

      <MapControlButton
        icon={Minus}
        label="Zoom out"
        onClick={() => setZoom((value) => Math.max(value - 1, MIN_ZOOM))}
      />

      <MapControlButton
        icon={LocateFixed}
        label="Lokasi saya"
        onClick={() => selectTool("gps")}
      />

      <MapControlButton
        icon={RotateCcw}
        label="Reset"
        onClick={resetMapView}
        last
      />
    </div>
  );

  /* ==========================================================
     MAP WORKSPACE
  ========================================================== */

  const MapWorkspace = () => {
    return (
      <main className="relative min-w-0 flex-1 overflow-hidden bg-[#111c2c]">
        <MapEngine
          layers={layers}
          zoom={zoom}
          activeTool={activeTool}
          searchValue={searchValue}
          selectedFeatureId={selectedFeatureId}
          viewportTarget={viewportTarget}
          onZoomChange={setZoom}
          onFeatureSelect={handleFeatureSelect}
          onCoordinateChange={(lat, lng) => {
            setLatitude(lat);

            setLongitude(lng);
          }}
        />

        <RiskSummary />

        {/* LEFT TOGGLE */}

        <button
          type="button"
          onClick={() => setLeftPanelOpen((value) => !value)}
          className="absolute left-4 top-1/2 z-[1000] hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/90 text-slate-300 shadow-xl backdrop-blur-xl transition hover:bg-slate-800 hover:text-white lg:flex"
          title="Toggle layer panel"
        >
          {leftPanelOpen ? (
            <ChevronLeft size={15} />
          ) : (
            <ChevronRight size={15} />
          )}
        </button>

        {/* RIGHT TOGGLE */}

        <button
          type="button"
          onClick={() => setRightPanelOpen((value) => !value)}
          className="absolute right-4 top-1/2 z-[1000] hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/90 text-slate-300 shadow-xl backdrop-blur-xl transition hover:bg-slate-800 hover:text-white lg:flex"
          title="Toggle information panel"
        >
          {rightPanelOpen ? (
            <ChevronRight size={15} />
          ) : (
            <ChevronLeft size={15} />
          )}
        </button>

        <MapControls />

        {/* DESKTOP TOOLBAR */}

        <div className="absolute bottom-4 left-1/2 z-[1000] hidden -translate-x-1/2 items-center gap-1.5 rounded-2xl border border-slate-700/80 bg-slate-950/90 p-1.5 shadow-2xl backdrop-blur-xl md:flex">
          <ToolButton id="select" icon={MousePointer2} label="Select" />

          <ToolButton id="identify" icon={Crosshair} label="Identify" />

          <ToolButton id="measure" icon={Ruler} label="Measure" />

          <ToolButton id="draw" icon={Pencil} label="Draw" />

          <div className="mx-1 h-6 w-px bg-slate-700" />

          <button
            type="button"
            onClick={() => {
              setSelectedFeatureId(null);

              setSelectedFeature(null);

              setRightPanelOpen(false);
            }}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-800 hover:text-white"
            title="Clear selection"
          >
            <X size={14} />
          </button>
        </div>

        {/* COORDINATE */}

        <div className="absolute bottom-4 left-4 z-[900] hidden items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-950/70 px-2.5 py-1.5 backdrop-blur-md sm:flex">
          <Crosshair size={11} className="text-slate-500" />

          <span className="text-[8px] font-semibold text-slate-500">
            {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </span>
        </div>
      </main>
    );
  };

  /* ==========================================================
     MOBILE TOOLS
  ========================================================== */

  const MobileToolsPanel = () => (
    <div className="p-4">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <Settings2 size={15} className="text-emerald-400" />

          <h3 className="text-sm font-bold text-white">Map Tools</h3>
        </div>

        <p className="mt-1 text-[10px] text-slate-500">
          Pilih alat untuk berinteraksi dengan peta
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ToolButton id="select" icon={MousePointer2} label="Select" />

        <ToolButton id="identify" icon={Crosshair} label="Identify" />

        <ToolButton id="measure" icon={Ruler} label="Measure" />

        <ToolButton id="draw" icon={Pencil} label="Draw" />

        <ToolButton id="gps" icon={Navigation} label="GPS" />
      </div>
    </div>
  );

  /* ==========================================================
     MOBILE PANEL
  ========================================================== */

  const MobilePanel = () => {
    if (!mobilePanel) {
      return null;
    }

    return (
      <>
        <button
          type="button"
          aria-label="Close panel"
          className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-[1px] lg:hidden"
          onClick={() => setMobilePanel(null)}
        />

        <div className="fixed inset-x-0 bottom-0 z-[10010] max-h-[78vh] overflow-hidden rounded-t-3xl border-t border-slate-700 bg-[#09111f] shadow-2xl lg:hidden">
          <div className="flex justify-center py-2.5">
            <span className="h-1 w-10 rounded-full bg-slate-700" />
          </div>

          {mobilePanel === "layers" && (
            <div className="h-[68vh]">
              <LayerPanel />
            </div>
          )}

          {mobilePanel === "tools" && <MobileToolsPanel />}

          {mobilePanel === "info" && (
            <div className="h-[60vh]">
              <InfoPanel />
            </div>
          )}
        </div>
      </>
    );
  };

  /* ==========================================================
     MOBILE BOTTOM BAR
  ========================================================== */

  const MobileAction = ({
    icon: Icon,
    label,
    active,
    onClick,
  }: {
    icon: React.ElementType;

    label: string;

    active: boolean;

    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={`
          flex
          min-w-[58px]
          flex-col
          items-center
          justify-center
          gap-1
          rounded-xl
          py-1.5
          transition
          ${active ? "text-emerald-400" : "text-slate-500 hover:text-slate-200"}
        `}
    >
      <Icon size={17} />

      <span className="text-[8px] font-semibold">{label}</span>
    </button>
  );

  const MobileBottomBar = () => (
    <nav className="fixed bottom-0 left-0 right-0 z-[9000] flex h-[64px] items-center justify-around border-t border-slate-800 bg-[#09111f]/95 px-2 shadow-2xl backdrop-blur-xl lg:hidden">
      <MobileAction
        icon={Layers3}
        label="Layers"
        active={mobilePanel === "layers"}
        onClick={() => openMobilePanel("layers")}
      />

      <MobileAction
        icon={SlidersHorizontal}
        label="Tools"
        active={mobilePanel === "tools"}
        onClick={() => openMobilePanel("tools")}
      />

      <MobileAction
        icon={Navigation}
        label="GPS"
        active={activeTool === "gps"}
        onClick={() => selectTool("gps")}
      />

      <MobileAction
        icon={Info}
        label="Info"
        active={mobilePanel === "info"}
        onClick={() => openMobilePanel("info")}
      />

      <MobileAction
        icon={fullscreen ? Minimize2 : Maximize2}
        label="Fullscreen"
        active={fullscreen}
        onClick={() => setFullscreen((value) => !value)}
      />
    </nav>
  );

  /* ==========================================================
     HEADER
  ========================================================== */

  const GisHeader = () => (
    <header className="relative z-[2000] flex min-h-[62px] shrink-0 items-center gap-3 border-b border-slate-800 bg-[#09111f]/95 px-3 shadow-xl backdrop-blur-xl sm:px-4 lg:px-5">
      <div className="flex shrink-0 items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-700 text-white shadow-lg shadow-emerald-950/40">
          <MapIcon size={18} />
        </div>

        <div className="hidden sm:block">
          <div className="text-[12px] font-extrabold tracking-[0.08em] text-white">
            SIMITI GIS
          </div>

          <div className="mt-0.5 text-[7px] font-bold uppercase tracking-[0.2em] text-slate-600">
            Enterprise GIS Command Center
          </div>
        </div>
      </div>

      <div className="relative mx-auto hidden w-full max-w-[560px] md:block">
        <Search
          size={15}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
        />

        <input
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          type="text"
          placeholder="Cari lokasi, desa, kecamatan, koordinat..."
          className="h-10 w-full rounded-xl border border-slate-700/80 bg-[#080f1b] pl-10 pr-16 text-[11px] font-medium text-white outline-none placeholder:text-slate-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10"
        />

        <div className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-slate-700 px-1.5 py-0.5 text-[7px] font-bold text-slate-600 lg:block">
          CTRL K
        </div>
      </div>

      <div className="ml-auto hidden items-center gap-1.5 lg:flex">
        <ToolButton id="gps" icon={Navigation} label="GPS" />

        <ToolButton id="measure" icon={Ruler} label="Measure" />

        <ToolButton id="draw" icon={Pencil} label="Draw" />

        <button
          type="button"
          onClick={() => setFullscreen((value) => !value)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-900/90 text-slate-300 transition hover:bg-slate-800 hover:text-white"
          title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      </div>

      <button
        type="button"
        onClick={() => openMobilePanel("tools")}
        className="ml-auto flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-400 md:hidden"
      >
        <Settings2 size={15} />
      </button>
    </header>
  );

  /* ==========================================================
     STATUS BAR
  ========================================================== */

  const StatusBar = () => (
    <footer className="relative z-[2000] hidden h-[28px] shrink-0 items-center justify-between border-t border-slate-800 bg-[#070e19] px-4 text-[8px] md:flex">
      <div className="flex items-center gap-5">
        <span className="flex items-center gap-1.5 text-slate-600">
          <Crosshair size={10} />
          EPSG:4326
        </span>

        <span className="text-slate-700">Lat: {latitude.toFixed(6)}</span>

        <span className="text-slate-700">Lng: {longitude.toFixed(6)}</span>

        <span className="text-slate-700">Zoom: {zoom}</span>
      </div>

      <div className="flex items-center gap-5">
        <span className="text-slate-700">Layers: {activeLayerCount}</span>

        <span className="text-slate-700">Sources: {configuredLayerCount}</span>

        <span className="flex items-center gap-1.5 font-bold text-emerald-500">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          GIS LAYER ENGINE READY
        </span>

        <button
          type="button"
          className="text-slate-600 transition hover:text-slate-300"
          title="GIS Help"
        >
          <CircleHelp size={11} />
        </button>
      </div>
    </footer>
  );

  /* ==========================================================
     MAIN
  ========================================================== */

  return (
    <div
      className={`
        ${fullscreen ? "fixed inset-0 z-[9999]" : "relative h-full min-h-0"}
        flex
        w-full
        flex-col
        overflow-hidden
        bg-[#07101d]
        text-white
      `}
    >
      <GisHeader />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* LEFT PANEL */}

        <aside
          className={`
            hidden
            shrink-0
            overflow-hidden
            border-r
            border-slate-800
            transition-all
            duration-300
            lg:block
            ${leftPanelOpen ? "w-[320px]" : "w-0"}
          `}
        >
          <div className="h-full w-[320px]">
            <LayerPanel />
          </div>
        </aside>

        {/* MAP */}

        <MapWorkspace />

        {/* RIGHT PANEL */}

        <aside
          className={`
            hidden
            shrink-0
            overflow-hidden
            border-l
            border-slate-800
            transition-all
            duration-300
            lg:block
            ${rightPanelOpen ? "w-[340px]" : "w-0"}
          `}
        >
          <div className="h-full w-[340px]">
            <InfoPanel />
          </div>
        </aside>
      </div>

      <StatusBar />

      <MobileBottomBar />

      <MobilePanel />
    </div>
  );
}
