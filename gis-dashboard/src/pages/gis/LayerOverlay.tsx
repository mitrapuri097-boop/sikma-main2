import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L, { Layer as LeafletLayer, PathOptions } from "leaflet";
import {
  Layers3,
  MapPinned,
  Database,
  Waves,
  Mountain,
  Flame,
  CloudSun,
  Trees,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  X,
  Info,
  Table2,
  Map as MapIcon,
  Satellite,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Copy,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
} from "lucide-react";
import "leaflet/dist/leaflet.css";

/* ============================================================
   TYPES
============================================================ */

type LayerCategory = {
  id: string;
  title: string;
  children: GisLayer[];
};

type GisLayer = {
  id: string;
  tableName: string;
  title: string;
  icon?: string;
  checked?: boolean;
  featureCount?: number;
  category?: string;
  schema?: string;
};

type CatalogStatistics = {
  totalLayers: number;
  totalFeatures: number;
  categories: number;
};

type CatalogResponse = {
  success: boolean;
  data?: {
    categories?: LayerCategory[];
    statistics?: CatalogStatistics;
    source?: string;
    generatedAt?: string;
  };
  message?: string;
  error?: string;
};

type GeoJSONFeature = {
  type: "Feature";
  id?: string | number;
  properties?: Record<string, unknown> | null;
  geometry?: GeoJSON.Geometry | null;
};

type GeoJSONFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
  limitReached?: boolean;
};

type LayerDataResponse = {
  success?: boolean;
  data?: GeoJSONFeatureCollection | Record<string, unknown>;
  layer?: Record<string, unknown>;
  message?: string;
  error?: string;
  metadata?: Record<string, unknown>;
};

type LoadedLayer = {
  layerId: string;
  geojson: GeoJSONFeatureCollection;
  loadedAt: string;
};

type BasemapMode = "street" | "satellite";

/* ============================================================
   API
============================================================ */

/*
 * Bisa langsung jalan dengan Vite:
 *
 * .env
 * VITE_API_URL=http://localhost:3001/api
 *
 * Production:
 * VITE_API_URL=https://api.demo.datasolusindo.com/api
 *
 * Kalau VITE_API_URL tidak ada, default ke /api.
 */
const API_BASE = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");

const CATALOG_URL = `${API_BASE}/layer-overlay/catalog`;

const DATA_URL = (layerId: string) =>
  `${API_BASE}/layer-overlay/data/${encodeURIComponent(layerId)}`;

/* ============================================================
   MAP CONFIG
============================================================ */

const INDONESIA_CENTER: [number, number] = [-2.5, 118];

const STREET_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

const STREET_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const SATELLITE_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const SATELLITE_ATTRIBUTION = "Tiles &copy; Esri";

/* ============================================================
   HELPERS
============================================================ */

const formatNumber = (value: unknown) => {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0";
  }

  return new Intl.NumberFormat("id-ID").format(number);
};

const formatDate = (value?: string) => {
  if (!value) return "-";

  try {
    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const humanizeKey = (key: string) => {
  return key
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const getCategoryColor = (categoryId: string) => {
  switch (categoryId) {
    case "administrasi":
      return "#2563eb";

    case "risiko":
      return "#dc2626";

    case "lingkungan":
      return "#059669";

    case "mitigasi":
      return "#d97706";

    default:
      return "#64748b";
  }
};

const getLayerColor = (layer: GisLayer) => {
  const name = `${layer.id} ${layer.title}`.toLowerCase();

  if (name.includes("banjir") || name.includes("limpasan")) {
    return "#2563eb";
  }

  if (name.includes("longsor") || name.includes("erosi")) {
    return "#92400e";
  }

  if (name.includes("karhutla") || name.includes("kebakaran")) {
    return "#dc2626";
  }

  if (name.includes("kekeringan")) {
    return "#f59e0b";
  }

  if (
    name.includes("tutupan") ||
    name.includes("lahan") ||
    name.includes("gambut")
  ) {
    return "#059669";
  }

  if (
    name.includes("provinsi") ||
    name.includes("kab") ||
    name.includes("kecamatan") ||
    name.includes("kel") ||
    name.includes("desa")
  ) {
    return "#2563eb";
  }

  if (name.includes("das")) {
    return "#7c3aed";
  }

  return "#0f766e";
};

const getIconComponent = (icon?: string, size = 16) => {
  switch (icon) {
    case "Waves":
      return <Waves size={size} />;

    case "Mountain":
      return <Mountain size={size} />;

    case "Flame":
      return <Flame size={size} />;

    case "CloudSun":
      return <CloudSun size={size} />;

    case "Trees":
      return <Trees size={size} />;

    case "MapPinned":
      return <MapPinned size={size} />;

    case "Database":
      return <Database size={size} />;

    case "Layers3":
    default:
      return <Layers3 size={size} />;
  }
};

const normalizeGeoJSON = (
  payload: unknown,
): GeoJSONFeatureCollection | null => {
  if (!payload) {
    return null;
  }

  /*
   * Response langsung:
   *
   * {
   *   type: "FeatureCollection",
   *   features: []
   * }
   */
  if (
    typeof payload === "object" &&
    (payload as any).type === "FeatureCollection" &&
    Array.isArray((payload as any).features)
  ) {
    return payload as GeoJSONFeatureCollection;
  }

  /*
   * Response:
   *
   * {
   *   success: true,
   *   data: {
   *      type: "FeatureCollection",
   *      features: []
   *   }
   * }
   */
  if (
    typeof payload === "object" &&
    (payload as any).data &&
    (payload as any).data.type === "FeatureCollection" &&
    Array.isArray((payload as any).data.features)
  ) {
    return (payload as any).data as GeoJSONFeatureCollection;
  }

  /*
   * Defensive:
   *
   * data:
   * {
   *   rawan_erosi: FeatureCollection,
   *   rawan_longsor: FeatureCollection
   * }
   *
   * Kita gabungkan menjadi satu FeatureCollection.
   */
  if (
    typeof payload === "object" &&
    (payload as any).data &&
    typeof (payload as any).data === "object"
  ) {
    const data = (payload as any).data;

    const collections = Object.values(data).filter(
      (item: any) =>
        item &&
        item.type === "FeatureCollection" &&
        Array.isArray(item.features),
    ) as GeoJSONFeatureCollection[];

    if (collections.length > 0) {
      return {
        type: "FeatureCollection",
        features: collections.flatMap((collection) => collection.features),
      };
    }
  }

  return null;
};

const buildPopupHtml = (feature: GeoJSONFeature, layerTitle: string) => {
  const properties = feature.properties || {};

  const entries = Object.entries(properties)
    .filter(([key]) => key !== "geometry")
    .slice(0, 30);

  const rows =
    entries.length > 0
      ? entries
          .map(([key, value]) => {
            let displayValue = "-";

            if (value !== null && value !== undefined && value !== "") {
              if (typeof value === "object") {
                try {
                  displayValue = JSON.stringify(value);
                } catch {
                  displayValue = String(value);
                }
              } else {
                displayValue = String(value);
              }
            }

            return `
              <tr>
                <td style="
                  padding:5px 8px;
                  font-weight:600;
                  color:#475569;
                  vertical-align:top;
                  border-bottom:1px solid #e2e8f0;
                ">
                  ${humanizeKey(key)}
                </td>
                <td style="
                  padding:5px 8px;
                  color:#0f172a;
                  border-bottom:1px solid #e2e8f0;
                ">
                  ${displayValue}
                </td>
              </tr>
            `;
          })
          .join("")
      : `
        <tr>
          <td colspan="2" style="
            padding:10px;
            color:#64748b;
          ">
            Tidak ada attribute.
          </td>
        </tr>
      `;

  return `
    <div style="
      min-width:260px;
      max-width:380px;
      font-family:Inter,Arial,sans-serif;
    ">
      <div style="
        font-size:14px;
        font-weight:800;
        color:#0f172a;
        margin-bottom:8px;
      ">
        ${layerTitle}
      </div>

      <table style="
        width:100%;
        border-collapse:collapse;
        font-size:12px;
      ">
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
};

/* ============================================================
   MAP AUTO FIT
============================================================ */

const FitBounds = ({
  geojson,
}: {
  geojson?: GeoJSONFeatureCollection | null;
}) => {
  const map = useMap();

  useEffect(() => {
    if (!geojson?.features?.length) {
      return;
    }

    try {
      const layer = L.geoJSON(geojson as any);

      const bounds = layer.getBounds();

      if (bounds.isValid()) {
        map.fitBounds(bounds, {
          padding: [40, 40],
          maxZoom: 12,
        });
      }
    } catch (error) {
      console.warn("Unable to fit map bounds:", error);
    }
  }, [geojson, map]);

  return null;
};

/* ============================================================
   MAP CLICK
============================================================ */

const MapCoordinateReporter = ({
  onCoordinate,
}: {
  onCoordinate?: (latitude: number, longitude: number) => void;
}) => {
  useMapEvents({
    click(event) {
      onCoordinate?.(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
};

/* ============================================================
   MAIN COMPONENT
============================================================ */

const LayerOverlay: React.FC = () => {
  /* ----------------------------------------------------------
     CATALOG
  ---------------------------------------------------------- */

  const [categories, setCategories] = useState<LayerCategory[]>([]);

  const [statistics, setStatistics] = useState<CatalogStatistics>({
    totalLayers: 0,
    totalFeatures: 0,
    categories: 0,
  });

  const [catalogSource, setCatalogSource] = useState("");

  const [generatedAt, setGeneratedAt] = useState("");

  const [catalogLoading, setCatalogLoading] = useState(true);

  const [catalogError, setCatalogError] = useState("");

  /* ----------------------------------------------------------
     LAYER STATE
  ---------------------------------------------------------- */

  const [activeLayers, setActiveLayers] = useState<string[]>([]);

  const [loadedLayers, setLoadedLayers] = useState<Record<string, LoadedLayer>>(
    {},
  );

  const [loadingLayers, setLoadingLayers] = useState<Record<string, boolean>>(
    {},
  );

  const [layerErrors, setLayerErrors] = useState<Record<string, string>>({});

  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);

  /* ----------------------------------------------------------
     UI
  ---------------------------------------------------------- */

  const [search, setSearch] = useState("");

  const [expandedCategories, setExpandedCategories] = useState<
    Record<string, boolean>
  >({});

  const [basemap, setBasemap] = useState<BasemapMode>("street");

  const [opacity, setOpacity] = useState(0.72);

  const [showTable, setShowTable] = useState(true);

  const [showMetadata, setShowMetadata] = useState(true);

  const [fullscreen, setFullscreen] = useState(false);

  const [lastCoordinate, setLastCoordinate] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  /* ----------------------------------------------------------
     MAP
  ---------------------------------------------------------- */

  const mapRef = useRef<L.Map | null>(null);

  /* ==========================================================
     LOAD CATALOG
  ========================================================== */

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError("");

    try {
      const response = await fetch(CATALOG_URL, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      const payload: CatalogResponse = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.message || payload.error || `HTTP ${response.status}`,
        );
      }

      if (!payload.success) {
        throw new Error(
          payload.message || payload.error || "Catalog layer gagal dimuat.",
        );
      }

      const incomingCategories = payload.data?.categories || [];

      const incomingStatistics = payload.data?.statistics;

      setCategories(incomingCategories);

      if (incomingStatistics) {
        setStatistics({
          totalLayers: Number(incomingStatistics.totalLayers) || 0,

          totalFeatures: Number(incomingStatistics.totalFeatures) || 0,

          categories: Number(incomingStatistics.categories) || 0,
        });
      }

      setCatalogSource(payload.data?.source || "");

      setGeneratedAt(payload.data?.generatedAt || "");

      /*
       * Default semua category expanded.
       */
      const expansion: Record<string, boolean> = {};

      incomingCategories.forEach((category) => {
        expansion[category.id] = true;
      });

      setExpandedCategories(expansion);
    } catch (error) {
      console.error("Layer catalog error:", error);

      setCatalogError(
        error instanceof Error
          ? error.message
          : "Gagal mengambil catalog layer.",
      );
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  /* ==========================================================
     FIND ACTIVE LAYER
  ========================================================== */

  const allLayers = useMemo(
    () => categories.flatMap((category) => category.children || []),
    [categories],
  );

  const layerById = useMemo(() => {
    const map = new Map<string, GisLayer>();

    allLayers.forEach((layer) => {
      map.set(layer.id, layer);
    });

    return map;
  }, [allLayers]);

  const selectedLayer = selectedLayerId
    ? layerById.get(selectedLayerId) || null
    : activeLayers.length > 0
      ? layerById.get(activeLayers[activeLayers.length - 1]) || null
      : null;

  /* ==========================================================
     FILTER CATALOG
  ========================================================== */

  const filteredCategories = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) {
      return categories;
    }

    return categories
      .map((category) => {
        const categoryMatch = category.title.toLowerCase().includes(keyword);

        const children = category.children.filter(
          (layer) =>
            categoryMatch ||
            layer.title.toLowerCase().includes(keyword) ||
            layer.id.toLowerCase().includes(keyword) ||
            layer.tableName.toLowerCase().includes(keyword),
        );

        return {
          ...category,
          children,
        };
      })
      .filter((category) => category.children.length > 0);
  }, [categories, search]);

  /* ==========================================================
     LOAD LAYER DATA
  ========================================================== */

  const loadLayer = useCallback(
    async (layer: GisLayer) => {
      if (loadingLayers[layer.id]) {
        return;
      }

      setLoadingLayers((prev) => ({
        ...prev,
        [layer.id]: true,
      }));

      setLayerErrors((prev) => {
        const next = { ...prev };
        delete next[layer.id];
        return next;
      });

      try {
        const response = await fetch(DATA_URL(layer.id), {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        });

        const payload: LayerDataResponse = await response.json();

        if (!response.ok) {
          throw new Error(
            payload.message || payload.error || `HTTP ${response.status}`,
          );
        }

        if (payload.success === false) {
          throw new Error(
            payload.message || payload.error || "Data layer gagal dimuat.",
          );
        }

        const geojson = normalizeGeoJSON(payload);

        if (!geojson) {
          throw new Error(
            "Response API tidak mengandung GeoJSON FeatureCollection yang valid.",
          );
        }

        setLoadedLayers((prev) => ({
          ...prev,
          [layer.id]: {
            layerId: layer.id,
            geojson,
            loadedAt: new Date().toISOString(),
          },
        }));

        setSelectedLayerId(layer.id);
      } catch (error) {
        console.error(`Layer ${layer.id} error:`, error);

        setLayerErrors((prev) => ({
          ...prev,
          [layer.id]:
            error instanceof Error ? error.message : "Gagal memuat data layer.",
        }));
      } finally {
        setLoadingLayers((prev) => ({
          ...prev,
          [layer.id]: false,
        }));
      }
    },
    [loadingLayers],
  );

  /* ==========================================================
     TOGGLE LAYER
  ========================================================== */

  const toggleLayer = useCallback(
    async (layer: GisLayer) => {
      const isActive = activeLayers.includes(layer.id);

      if (isActive) {
        setActiveLayers((prev) => prev.filter((id) => id !== layer.id));

        if (selectedLayerId === layer.id) {
          setSelectedLayerId(null);
        }

        return;
      }

      setActiveLayers((prev) => [...prev, layer.id]);

      setSelectedLayerId(layer.id);

      if (!loadedLayers[layer.id]) {
        await loadLayer(layer);
      }
    },
    [activeLayers, loadedLayers, loadLayer, selectedLayerId],
  );

  /* ==========================================================
     CATEGORY TOGGLE
  ========================================================== */

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }));
  };

  /* ==========================================================
     SELECT ALL CATEGORY
  ========================================================== */

  const toggleCategoryLayers = async (category: LayerCategory) => {
    const ids = category.children.map((layer) => layer.id);

    const allActive =
      ids.length > 0 && ids.every((id) => activeLayers.includes(id));

    if (allActive) {
      setActiveLayers((prev) => prev.filter((id) => !ids.includes(id)));

      if (selectedLayerId && ids.includes(selectedLayerId)) {
        setSelectedLayerId(null);
      }

      return;
    }

    const newIds = ids.filter((id) => !activeLayers.includes(id));

    setActiveLayers((prev) => [...prev, ...newIds]);

    /*
     * Load sequentially supaya
     * backend tidak dihantam request
     * terlalu banyak sekaligus.
     */
    for (const layer of category.children) {
      if (!loadedLayers[layer.id]) {
        await loadLayer(layer);
      }
    }

    if (category.children.length > 0) {
      setSelectedLayerId(category.children[category.children.length - 1].id);
    }
  };

  /* ==========================================================
     REMOVE ALL
  ========================================================== */

  const clearAllLayers = () => {
    setActiveLayers([]);
    setSelectedLayerId(null);
  };

  /* ==========================================================
     GEOJSON STYLE
  ========================================================== */

  const getGeoJsonStyle = (layer: GisLayer): PathOptions => {
    const color = getLayerColor(layer);

    return {
      color,
      weight: 1.5,
      opacity: 0.95,
      fillColor: color,
      fillOpacity: opacity,
    };
  };

  /* ==========================================================
     GEOJSON EVENTS
  ========================================================== */

  const onEachFeature = (
    feature: GeoJSONFeature,
    leafletLayer: LeafletLayer,
    layer: GisLayer,
  ) => {
    if ("bindPopup" in leafletLayer) {
      (
        leafletLayer as L.Layer & {
          bindPopup: (html: string) => void;
        }
      ).bindPopup(buildPopupHtml(feature, layer.title));
    }

    if ("on" in leafletLayer) {
      leafletLayer.on("click", () => {
        setSelectedLayerId(layer.id);
      });
    }
  };

  /* ==========================================================
     ATTRIBUTE DATA
  ========================================================== */

  const selectedGeoJson = selectedLayerId
    ? loadedLayers[selectedLayerId]?.geojson || null
    : null;

  const attributeRows = selectedGeoJson?.features || [];

  const attributeColumns = useMemo(() => {
    const keys = new Set<string>();

    attributeRows.forEach((feature) => {
      Object.keys(feature.properties || {}).forEach((key) => keys.add(key));
    });

    return Array.from(keys);
  }, [attributeRows]);

  /* ==========================================================
     REFRESH SELECTED
  ========================================================== */

  const refreshSelectedLayer = async () => {
    if (!selectedLayer) {
      return;
    }

    await loadLayer(selectedLayer);
  };

  /* ==========================================================
     COPY ATTRIBUTE
  ========================================================== */

  const copyValue = async (value: unknown) => {
    try {
      await navigator.clipboard.writeText(
        typeof value === "object" ? JSON.stringify(value) : String(value ?? ""),
      );
    } catch {
      console.warn("Clipboard unavailable");
    }
  };

  /* ==========================================================
     MAP COORDINATE
  ========================================================== */

  const handleCoordinate = (latitude: number, longitude: number) => {
    setLastCoordinate({
      latitude,
      longitude,
    });
  };

  /* ==========================================================
     RENDER
  ========================================================== */

  return (
    <div
      className={
        fullscreen
          ? "layer-overlay-page layer-overlay-fullscreen"
          : "layer-overlay-page"
      }
    >
      <style>{`
        .layer-overlay-page {
          position: relative;
          width: 100%;
          height: calc(100vh - 64px);
          min-height: 680px;
          background: #f8fafc;
          overflow: hidden;
          font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .layer-overlay-fullscreen {
          position: fixed;
          inset: 0;
          z-index: 9999;
          height: 100vh;
        }

        .lo-shell {
          display: grid;
          grid-template-columns: 340px minmax(0, 1fr) 330px;
          height: 100%;
          width: 100%;
        }

        .lo-sidebar,
        .lo-right-panel {
          background: rgba(255,255,255,.98);
          border-color: #e2e8f0;
          z-index: 1000;
          overflow: hidden;
        }

        .lo-sidebar {
          border-right: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
        }

        .lo-right-panel {
          border-left: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
        }

        .lo-header {
          min-height: 68px;
          padding: 12px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border-bottom: 1px solid #e2e8f0;
          background: #fff;
        }

        .lo-title {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .lo-title-icon {
          width: 38px;
          height: 38px;
          border-radius: 11px;
          display: grid;
          place-items: center;
          color: #fff;
          background: linear-gradient(135deg,#0f172a,#1d4ed8);
          flex: 0 0 auto;
        }

        .lo-title-text {
          min-width: 0;
        }

        .lo-title-text strong {
          display: block;
          color: #0f172a;
          font-size: 14px;
          font-weight: 800;
        }

        .lo-title-text span {
          display: block;
          color: #64748b;
          font-size: 11px;
          margin-top: 2px;
        }

        .lo-icon-button {
          width: 34px;
          height: 34px;
          border: 1px solid #e2e8f0;
          background: #fff;
          border-radius: 9px;
          display: grid;
          place-items: center;
          color: #475569;
          cursor: pointer;
          transition: .2s;
        }

        .lo-icon-button:hover {
          background: #f8fafc;
          color: #0f172a;
        }

        .lo-search {
          padding: 10px 12px;
          border-bottom: 1px solid #e2e8f0;
        }

        .lo-search-wrap {
          position: relative;
        }

        .lo-search-wrap svg {
          position: absolute;
          left: 11px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
        }

        .lo-search input {
          width: 100%;
          height: 38px;
          padding: 0 35px;
          border: 1px solid #e2e8f0;
          border-radius: 9px;
          outline: none;
          font-size: 12px;
          color: #0f172a;
          background: #f8fafc;
        }

        .lo-search input:focus {
          border-color: #2563eb;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(37,99,235,.08);
        }

        .lo-search-clear {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          border: 0;
          background: transparent;
          cursor: pointer;
          color: #94a3b8;
        }

        .lo-stats {
          display: grid;
          grid-template-columns: repeat(3,1fr);
          gap: 6px;
          padding: 10px 12px;
          border-bottom: 1px solid #e2e8f0;
        }

        .lo-stat {
          background: #f8fafc;
          border: 1px solid #eef2f7;
          border-radius: 9px;
          padding: 8px 6px;
          text-align: center;
        }

        .lo-stat strong {
          display: block;
          font-size: 14px;
          color: #0f172a;
          font-weight: 800;
        }

        .lo-stat span {
          display: block;
          font-size: 9px;
          color: #64748b;
          margin-top: 2px;
          text-transform: uppercase;
          letter-spacing: .04em;
        }

        .lo-catalog {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
        }

        .lo-category {
          margin-bottom: 7px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          overflow: hidden;
          background: #fff;
        }

        .lo-category-header {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 9px;
          cursor: pointer;
          background: #f8fafc;
          user-select: none;
        }

        .lo-category-header:hover {
          background: #f1f5f9;
        }

        .lo-category-color {
          width: 5px;
          height: 28px;
          border-radius: 99px;
          flex: 0 0 auto;
        }

        .lo-category-main {
          min-width: 0;
          flex: 1;
        }

        .lo-category-main strong {
          display: block;
          font-size: 11px;
          color: #0f172a;
          font-weight: 800;
        }

        .lo-category-main span {
          display: block;
          font-size: 9px;
          color: #64748b;
          margin-top: 2px;
        }

        .lo-category-actions {
          display: flex;
          gap: 3px;
        }

        .lo-mini-button {
          width: 26px;
          height: 26px;
          border: 0;
          background: transparent;
          color: #64748b;
          border-radius: 7px;
          cursor: pointer;
          display: grid;
          place-items: center;
        }

        .lo-mini-button:hover {
          background: #e2e8f0;
          color: #0f172a;
        }

        .lo-layer-list {
          padding: 4px 6px 7px;
        }

        .lo-layer {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 7px;
          border-radius: 8px;
          cursor: pointer;
          transition: .15s;
        }

        .lo-layer:hover {
          background: #f8fafc;
        }

        .lo-layer.active {
          background: #eff6ff;
        }

        .lo-checkbox {
          width: 16px;
          height: 16px;
          accent-color: #2563eb;
          flex: 0 0 auto;
          cursor: pointer;
        }

        .lo-layer-icon {
          width: 27px;
          height: 27px;
          border-radius: 7px;
          display: grid;
          place-items: center;
          color: #fff;
          flex: 0 0 auto;
        }

        .lo-layer-info {
          flex: 1;
          min-width: 0;
        }

        .lo-layer-info strong {
          display: block;
          font-size: 10px;
          color: #334155;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .lo-layer-info span {
          display: block;
          font-size: 9px;
          color: #94a3b8;
          margin-top: 2px;
        }

        .lo-layer-count {
          font-size: 9px;
          color: #64748b;
          background: #f1f5f9;
          border-radius: 99px;
          padding: 3px 6px;
          white-space: nowrap;
        }

        .lo-layer-loading {
          animation: lo-spin 1s linear infinite;
          color: #2563eb;
        }

        @keyframes lo-spin {
          to {
            transform: rotate(360deg);
          }
        }

        .lo-map {
          position: relative;
          min-width: 0;
          min-height: 0;
        }

        .lo-map .leaflet-container {
          width: 100%;
          height: 100%;
          background: #dbeafe;
        }

        .lo-map-toolbar {
          position: absolute;
          z-index: 900;
          top: 12px;
          right: 12px;
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .lo-map-control {
          height: 36px;
          padding: 0 10px;
          border: 1px solid rgba(255,255,255,.85);
          background: rgba(255,255,255,.96);
          backdrop-filter: blur(10px);
          border-radius: 9px;
          display: flex;
          align-items: center;
          gap: 6px;
          color: #334155;
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 5px 18px rgba(15,23,42,.12);
        }

        .lo-map-control:hover {
          background: #fff;
          color: #0f172a;
        }

        .lo-map-control.active {
          color: #2563eb;
          border-color: #bfdbfe;
          background: #eff6ff;
        }

        .lo-map-status {
          position: absolute;
          left: 12px;
          bottom: 12px;
          z-index: 900;
          max-width: calc(100% - 24px);
          background: rgba(255,255,255,.96);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(226,232,240,.95);
          border-radius: 10px;
          box-shadow: 0 5px 18px rgba(15,23,42,.10);
          padding: 8px 10px;
          font-size: 10px;
          color: #475569;
        }

        .lo-status-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .lo-map-empty {
          position: absolute;
          z-index: 800;
          left: 50%;
          top: 50%;
          transform: translate(-50%,-50%);
          background: rgba(255,255,255,.95);
          border: 1px solid #e2e8f0;
          box-shadow: 0 10px 35px rgba(15,23,42,.15);
          border-radius: 14px;
          padding: 20px;
          text-align: center;
          width: min(340px, calc(100% - 40px));
        }

        .lo-map-empty-icon {
          width: 48px;
          height: 48px;
          margin: 0 auto 10px;
          display: grid;
          place-items: center;
          border-radius: 13px;
          background: #eff6ff;
          color: #2563eb;
        }

        .lo-map-empty strong {
          display: block;
          font-size: 14px;
          color: #0f172a;
        }

        .lo-map-empty span {
          display: block;
          margin-top: 5px;
          font-size: 11px;
          line-height: 1.5;
          color: #64748b;
        }

        .lo-right-content {
          flex: 1;
          overflow-y: auto;
        }

        .lo-panel-section {
          border-bottom: 1px solid #e2e8f0;
        }

        .lo-panel-title {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 11px 12px;
          font-size: 11px;
          font-weight: 800;
          color: #0f172a;
        }

        .lo-panel-title svg {
          color: #2563eb;
        }

        .lo-metadata {
          padding: 0 12px 12px;
        }

        .lo-meta-main {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 10px;
          background: #f8fafc;
        }

        .lo-meta-name {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .lo-meta-name-icon {
          width: 32px;
          height: 32px;
          display: grid;
          place-items: center;
          border-radius: 8px;
          color: #fff;
          flex: 0 0 auto;
        }

        .lo-meta-name strong {
          display: block;
          font-size: 12px;
          color: #0f172a;
        }

        .lo-meta-name span {
          display: block;
          font-size: 9px;
          color: #64748b;
          margin-top: 2px;
        }

        .lo-meta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
          margin-top: 9px;
        }

        .lo-meta-item {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 7px;
        }

        .lo-meta-item span {
          display: block;
          font-size: 8px;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: .04em;
        }

        .lo-meta-item strong {
          display: block;
          margin-top: 3px;
          font-size: 10px;
          color: #334155;
          word-break: break-word;
        }

        .lo-slider {
          padding: 0 12px 12px;
        }

        .lo-slider-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }

        .lo-slider-row span {
          font-size: 10px;
          color: #64748b;
        }

        .lo-slider-row strong {
          font-size: 10px;
          color: #0f172a;
        }

        .lo-slider input {
          width: 100%;
          accent-color: #2563eb;
        }

        .lo-table-wrap {
          padding: 0 12px 12px;
          overflow-x: auto;
        }

        .lo-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 9px;
        }

        .lo-table th {
          position: sticky;
          top: 0;
          z-index: 2;
          background: #f1f5f9;
          color: #475569;
          font-weight: 800;
          padding: 7px;
          border-bottom: 1px solid #e2e8f0;
          text-align: left;
          white-space: nowrap;
        }

        .lo-table td {
          padding: 7px;
          border-bottom: 1px solid #f1f5f9;
          color: #334155;
          vertical-align: top;
          max-width: 180px;
        }

        .lo-table tr:hover td {
          background: #f8fafc;
        }

        .lo-copy {
          border: 0;
          background: transparent;
          cursor: pointer;
          color: #94a3b8;
          margin-left: 4px;
        }

        .lo-copy:hover {
          color: #2563eb;
        }

        .lo-empty {
          padding: 18px 12px;
          text-align: center;
          color: #94a3b8;
          font-size: 10px;
        }

        .lo-error {
          margin: 10px 12px;
          padding: 9px;
          border-radius: 9px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #991b1b;
          font-size: 10px;
          line-height: 1.45;
        }

        .lo-loading {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 16px;
          justify-content: center;
          color: #64748b;
          font-size: 10px;
        }

        .lo-bottom-bar {
          position: absolute;
          z-index: 950;
          left: 50%;
          bottom: 12px;
          transform: translateX(-50%);
          display: flex;
          gap: 6px;
          padding: 5px;
          background: rgba(255,255,255,.96);
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          box-shadow: 0 7px 22px rgba(15,23,42,.12);
        }

        .lo-bottom-button {
          height: 30px;
          padding: 0 9px;
          border: 0;
          background: transparent;
          border-radius: 7px;
          display: flex;
          align-items: center;
          gap: 5px;
          color: #475569;
          font-size: 9px;
          font-weight: 700;
          cursor: pointer;
        }

        .lo-bottom-button:hover {
          background: #f1f5f9;
          color: #0f172a;
        }

        .lo-bottom-button.danger {
          color: #dc2626;
        }

        @media (max-width: 1200px) {
          .lo-shell {
            grid-template-columns: 300px minmax(0, 1fr) 290px;
          }
        }

        @media (max-width: 980px) {
          .lo-shell {
            grid-template-columns: 300px minmax(0, 1fr);
          }

          .lo-right-panel {
            display: none;
          }
        }

        @media (max-width: 720px) {
          .lo-shell {
            grid-template-columns: 1fr;
          }

          .lo-sidebar {
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: min(340px, 88vw);
            box-shadow: 12px 0 35px rgba(15,23,42,.18);
          }

          .lo-map {
            width: 100%;
          }

          .lo-map-toolbar {
            top: 10px;
            right: 10px;
          }

          .lo-map-status {
            bottom: 10px;
          }

          .lo-bottom-bar {
            max-width: calc(100% - 20px);
            overflow-x: auto;
          }
        }
      `}</style>

      <div className="lo-shell">
        {/* =====================================================
            LEFT SIDEBAR
        ====================================================== */}

        <aside className="lo-sidebar">
          <div className="lo-header">
            <div className="lo-title">
              <div className="lo-title-icon">
                <Layers3 size={19} />
              </div>

              <div className="lo-title-text">
                <strong>Layer & Overlay</strong>

                <span>SIMITI Enterprise GIS</span>
              </div>
            </div>

            <button
              className="lo-icon-button"
              title="Refresh catalog"
              onClick={loadCatalog}
              disabled={catalogLoading}
            >
              <RefreshCw
                size={15}
                className={catalogLoading ? "lo-layer-loading" : ""}
              />
            </button>
          </div>

          <div className="lo-search">
            <div className="lo-search-wrap">
              <Search size={15} />

              <input
                type="text"
                placeholder="Cari layer..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />

              {search && (
                <button
                  className="lo-search-clear"
                  onClick={() => setSearch("")}
                  title="Clear"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="lo-stats">
            <div className="lo-stat">
              <strong>{formatNumber(statistics.totalLayers)}</strong>

              <span>Layers</span>
            </div>

            <div className="lo-stat">
              <strong>{formatNumber(statistics.totalFeatures)}</strong>

              <span>Features</span>
            </div>

            <div className="lo-stat">
              <strong>{formatNumber(statistics.categories)}</strong>

              <span>Groups</span>
            </div>
          </div>

          {catalogError && (
            <div className="lo-error">
              <strong>Catalog Error</strong>

              <div>{catalogError}</div>
            </div>
          )}

          {catalogLoading ? (
            <div className="lo-loading">
              <Loader2 size={15} className="lo-layer-loading" />
              Memuat katalog GIS...
            </div>
          ) : (
            <div className="lo-catalog">
              {filteredCategories.length === 0 ? (
                <div className="lo-empty">
                  <Search
                    size={24}
                    style={{
                      marginBottom: 8,
                    }}
                  />

                  <div>Layer tidak ditemukan.</div>
                </div>
              ) : (
                filteredCategories.map((category) => {
                  const isExpanded = expandedCategories[category.id] ?? true;

                  const categoryLayerIds = category.children.map(
                    (layer) => layer.id,
                  );

                  const activeCount = categoryLayerIds.filter((id) =>
                    activeLayers.includes(id),
                  ).length;

                  const allActive =
                    categoryLayerIds.length > 0 &&
                    activeCount === categoryLayerIds.length;

                  return (
                    <div className="lo-category" key={category.id}>
                      <div
                        className="lo-category-header"
                        onClick={() => toggleCategory(category.id)}
                      >
                        <div
                          className="lo-category-color"
                          style={{
                            background: getCategoryColor(category.id),
                          }}
                        />

                        {isExpanded ? (
                          <ChevronDown size={14} color="#64748b" />
                        ) : (
                          <ChevronRight size={14} color="#64748b" />
                        )}

                        <div className="lo-category-main">
                          <strong>{category.title}</strong>

                          <span>
                            {category.children.length} layer
                            {category.children.length !== 1 ? "s" : ""}
                            {activeCount > 0 && ` • ${activeCount} aktif`}
                          </span>
                        </div>

                        <div className="lo-category-actions">
                          <button
                            className="lo-mini-button"
                            title={
                              allActive ? "Matikan semua" : "Aktifkan semua"
                            }
                            onClick={(event) => {
                              event.stopPropagation();

                              toggleCategoryLayers(category);
                            }}
                          >
                            {allActive ? (
                              <EyeOff size={13} />
                            ) : (
                              <Eye size={13} />
                            )}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="lo-layer-list">
                          {category.children.map((layer) => {
                            const active = activeLayers.includes(layer.id);

                            const loading = !!loadingLayers[layer.id];

                            const error = layerErrors[layer.id];

                            return (
                              <div
                                className={`lo-layer ${active ? "active" : ""}`}
                                key={layer.id}
                                onClick={() => toggleLayer(layer)}
                              >
                                <input
                                  type="checkbox"
                                  className="lo-checkbox"
                                  checked={active}
                                  onChange={() => toggleLayer(layer)}
                                  onClick={(event) => event.stopPropagation()}
                                />

                                <div
                                  className="lo-layer-icon"
                                  style={{
                                    background: getLayerColor(layer),
                                  }}
                                >
                                  {getIconComponent(layer.icon, 13)}
                                </div>

                                <div className="lo-layer-info">
                                  <strong title={layer.title}>
                                    {layer.title}
                                  </strong>

                                  <span>{layer.tableName}</span>
                                </div>

                                {loading ? (
                                  <Loader2
                                    size={13}
                                    className="lo-layer-loading"
                                  />
                                ) : error ? (
                                  <AlertCircle size={13} color="#dc2626" />
                                ) : (
                                  <span className="lo-layer-count">
                                    {formatNumber(layer.featureCount)}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </aside>

        {/* =====================================================
            MAP
        ====================================================== */}

        <main className="lo-map">
          <MapContainer
            center={INDONESIA_CENTER}
            zoom={5}
            minZoom={3}
            maxZoom={19}
            scrollWheelZoom
            zoomControl
            ref={(instance) => {
              mapRef.current = instance;
            }}
          >
            {basemap === "street" ? (
              <TileLayer
                url={STREET_TILE_URL}
                attribution={STREET_ATTRIBUTION}
                maxZoom={19}
              />
            ) : (
              <TileLayer
                url={SATELLITE_TILE_URL}
                attribution={SATELLITE_ATTRIBUTION}
                maxZoom={19}
              />
            )}

            <MapCoordinateReporter onCoordinate={handleCoordinate} />

            {activeLayers.map((layerId) => {
              const layer = layerById.get(layerId);

              const loaded = loadedLayers[layerId];

              if (!layer || !loaded) {
                return null;
              }

              return (
                <GeoJSON
                  key={`${layerId}-${loaded.loadedAt}`}
                  data={loaded.geojson as any}
                  style={() => getGeoJsonStyle(layer)}
                  onEachFeature={(feature, leafletLayer) =>
                    onEachFeature(
                      feature as GeoJSONFeature,
                      leafletLayer,
                      layer,
                    )
                  }
                />
              );
            })}

            {selectedGeoJson && <FitBounds geojson={selectedGeoJson} />}
          </MapContainer>

          {/* MAP TOOLBAR */}

          <div className="lo-map-toolbar">
            <button
              className={`lo-map-control ${
                basemap === "street" ? "active" : ""
              }`}
              onClick={() => setBasemap("street")}
              title="Peta"
            >
              <MapIcon size={14} />
              Peta
            </button>

            <button
              className={`lo-map-control ${
                basemap === "satellite" ? "active" : ""
              }`}
              onClick={() => setBasemap("satellite")}
              title="Satelit"
            >
              <Satellite size={14} />
              Satelit
            </button>

            <button
              className="lo-map-control"
              onClick={() => setFullscreen((value) => !value)}
              title={fullscreen ? "Keluar fullscreen" : "Fullscreen"}
            >
              {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}

              {fullscreen ? "Keluar" : "Full"}
            </button>
          </div>

          {/* MAP STATUS */}

          <div className="lo-map-status">
            <div className="lo-status-row">
              <CheckCircle2 size={12} color="#16a34a" />

              <span>{activeLayers.length} layer aktif</span>

              {selectedLayer && (
                <>
                  <span>•</span>

                  <strong>{selectedLayer.title}</strong>
                </>
              )}
            </div>

            {lastCoordinate && (
              <div
                style={{
                  marginTop: 3,
                  color: "#94a3b8",
                }}
              >
                {lastCoordinate.latitude.toFixed(5)},{" "}
                {lastCoordinate.longitude.toFixed(5)}
              </div>
            )}
          </div>

          {/* EMPTY MAP */}

          {activeLayers.length === 0 && (
            <div className="lo-map-empty">
              <div className="lo-map-empty-icon">
                <Layers3 size={24} />
              </div>

              <strong>Belum ada layer aktif</strong>

              <span>
                Pilih layer dari Layer Explorer di sebelah kiri untuk
                menampilkan data spasial pada peta.
              </span>
            </div>
          )}

          {/* BOTTOM BAR */}

          <div className="lo-bottom-bar">
            <button
              className="lo-bottom-button"
              onClick={() => setShowTable((value) => !value)}
            >
              <Table2 size={13} />
              {showTable ? "Sembunyikan" : "Tampilkan"} Tabel
            </button>

            <button
              className="lo-bottom-button"
              onClick={() => setShowMetadata((value) => !value)}
            >
              <Info size={13} />
              Metadata
            </button>

            <button
              className="lo-bottom-button danger"
              onClick={clearAllLayers}
            >
              <X size={13} />
              Clear
            </button>
          </div>
        </main>

        {/* =====================================================
            RIGHT PANEL
        ====================================================== */}

        {showMetadata && (
          <aside className="lo-right-panel">
            <div className="lo-header">
              <div className="lo-title">
                <div
                  className="lo-title-icon"
                  style={{
                    background: "linear-gradient(135deg,#1e293b,#475569)",
                  }}
                >
                  <SlidersHorizontal size={18} />
                </div>

                <div className="lo-title-text">
                  <strong>Layer Inspector</strong>

                  <span>Metadata & attributes</span>
                </div>
              </div>

              {selectedLayer && (
                <button
                  className="lo-icon-button"
                  title="Refresh layer"
                  onClick={refreshSelectedLayer}
                  disabled={!!loadingLayers[selectedLayer.id]}
                >
                  <RefreshCw
                    size={14}
                    className={
                      loadingLayers[selectedLayer.id] ? "lo-layer-loading" : ""
                    }
                  />
                </button>
              )}
            </div>

            <div className="lo-right-content">
              {/* METADATA */}

              <section className="lo-panel-section">
                <div className="lo-panel-title">
                  <Info size={14} />
                  Layer Metadata
                </div>

                {selectedLayer ? (
                  <div className="lo-metadata">
                    <div className="lo-meta-main">
                      <div className="lo-meta-name">
                        <div
                          className="lo-meta-name-icon"
                          style={{
                            background: getLayerColor(selectedLayer),
                          }}
                        >
                          {getIconComponent(selectedLayer.icon, 16)}
                        </div>

                        <div>
                          <strong>{selectedLayer.title}</strong>

                          <span>{selectedLayer.tableName}</span>
                        </div>
                      </div>

                      <div className="lo-meta-grid">
                        <div className="lo-meta-item">
                          <span>Category</span>

                          <strong>{selectedLayer.category || "-"}</strong>
                        </div>

                        <div className="lo-meta-item">
                          <span>Schema</span>

                          <strong>{selectedLayer.schema || "-"}</strong>
                        </div>

                        <div className="lo-meta-item">
                          <span>DB Features</span>

                          <strong>
                            {formatNumber(selectedLayer.featureCount)}
                          </strong>
                        </div>

                        <div className="lo-meta-item">
                          <span>Loaded Features</span>

                          <strong>
                            {formatNumber(
                              selectedGeoJson?.features?.length || 0,
                            )}
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="lo-empty">
                    Pilih layer untuk melihat metadata.
                  </div>
                )}
              </section>

              {/* OPACITY */}

              <section className="lo-panel-section">
                <div className="lo-panel-title">
                  <SlidersHorizontal size={14} />
                  Layer Opacity
                </div>

                <div className="lo-slider">
                  <div className="lo-slider-row">
                    <span>Transparansi</span>

                    <strong>{Math.round(opacity * 100)}%</strong>
                  </div>

                  <input
                    type="range"
                    min="0.05"
                    max="1"
                    step="0.05"
                    value={opacity}
                    onChange={(event) => setOpacity(Number(event.target.value))}
                  />
                </div>
              </section>

              {/* API SOURCE */}

              <section className="lo-panel-section">
                <div className="lo-panel-title">
                  <Database size={14} />
                  Data Source
                </div>

                <div className="lo-metadata">
                  <div className="lo-meta-grid">
                    <div className="lo-meta-item">
                      <span>Source</span>

                      <strong>{catalogSource || "API GIS"}</strong>
                    </div>

                    <div className="lo-meta-item">
                      <span>Generated</span>

                      <strong>{formatDate(generatedAt)}</strong>
                    </div>
                  </div>
                </div>
              </section>

              {/* ATTRIBUTE TABLE */}

              {showTable && (
                <section className="lo-panel-section">
                  <div className="lo-panel-title">
                    <Table2 size={14} />
                    Attribute Table
                    {selectedGeoJson && (
                      <span
                        style={{
                          marginLeft: "auto",
                          fontSize: 9,
                          color: "#64748b",
                        }}
                      >
                        {attributeRows.length} records
                      </span>
                    )}
                  </div>

                  {!selectedLayer ? (
                    <div className="lo-empty">
                      Pilih layer untuk membuka tabel atribut.
                    </div>
                  ) : loadingLayers[selectedLayer.id] ? (
                    <div className="lo-loading">
                      <Loader2 size={14} className="lo-layer-loading" />
                      Memuat data layer...
                    </div>
                  ) : layerErrors[selectedLayer.id] ? (
                    <div className="lo-error">
                      {layerErrors[selectedLayer.id]}
                    </div>
                  ) : attributeRows.length === 0 ? (
                    <div className="lo-empty">
                      Layer tidak memiliki feature yang dapat ditampilkan.
                    </div>
                  ) : (
                    <div className="lo-table-wrap">
                      <table className="lo-table">
                        <thead>
                          <tr>
                            <th>#</th>

                            {attributeColumns.map((column) => (
                              <th key={column}>{humanizeKey(column)}</th>
                            ))}
                          </tr>
                        </thead>

                        <tbody>
                          {attributeRows.slice(0, 200).map((feature, index) => (
                            <tr
                              key={`${selectedLayer.id}-${feature.id ?? index}`}
                            >
                              <td>{index + 1}</td>

                              {attributeColumns.map((column) => {
                                const value = feature.properties?.[column];

                                let display = "-";

                                if (
                                  value !== null &&
                                  value !== undefined &&
                                  value !== ""
                                ) {
                                  if (typeof value === "object") {
                                    try {
                                      display = JSON.stringify(value);
                                    } catch {
                                      display = String(value);
                                    }
                                  } else {
                                    display = String(value);
                                  }
                                }

                                return (
                                  <td key={column} title={display}>
                                    <span>{display}</span>

                                    {display !== "-" && (
                                      <button
                                        className="lo-copy"
                                        title="Copy"
                                        onClick={() => copyValue(value)}
                                      >
                                        <Copy size={9} />
                                      </button>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {attributeRows.length > 200 && (
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 9,
                            color: "#94a3b8",
                          }}
                        >
                          Menampilkan 200 record pertama dari{" "}
                          {formatNumber(attributeRows.length)} feature.
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}

              {/* ACTIVE LAYERS */}

              <section className="lo-panel-section">
                <div className="lo-panel-title">
                  <Layers3 size={14} />
                  Active Layers
                </div>

                {activeLayers.length === 0 ? (
                  <div className="lo-empty">Tidak ada layer aktif.</div>
                ) : (
                  <div
                    style={{
                      padding: "0 12px 12px",
                    }}
                  >
                    {activeLayers.map((id) => {
                      const layer = layerById.get(id);

                      if (!layer) {
                        return null;
                      }

                      const loaded = loadedLayers[id];

                      return (
                        <div
                          key={id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 7,
                            padding: "7px 0",
                            borderBottom: "1px solid #f1f5f9",
                            cursor: "pointer",
                          }}
                          onClick={() => setSelectedLayerId(id)}
                        >
                          <div
                            style={{
                              width: 25,
                              height: 25,
                              borderRadius: 7,
                              background: getLayerColor(layer),
                              color: "#fff",
                              display: "grid",
                              placeItems: "center",
                            }}
                          >
                            {getIconComponent(layer.icon, 12)}
                          </div>

                          <div
                            style={{
                              flex: 1,
                              minWidth: 0,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: "#334155",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {layer.title}
                            </div>

                            <div
                              style={{
                                fontSize: 8,
                                color: "#94a3b8",
                                marginTop: 2,
                              }}
                            >
                              {loaded
                                ? `${formatNumber(
                                    loaded.geojson.features.length,
                                  )} feature loaded`
                                : "Loading..."}
                            </div>
                          </div>

                          <button
                            className="lo-mini-button"
                            title="Matikan layer"
                            onClick={(event) => {
                              event.stopPropagation();

                              toggleLayer(layer);
                            }}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};

export default LayerOverlay;
