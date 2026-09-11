import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  ZoomControl,
  useMap,
} from "react-leaflet";
import type { Layer as LeafletLayer, PathOptions } from "leaflet";
import {
  Layers3,
  GitMerge,
  Search,
  Ruler,
  Download,
  Save,
  Filter,
  Columns3,
  MoreVertical,
  ChevronDown,
  ChevronRight,
  X,
  Info,
  Database,
  MapPinned,
  Activity,
  ShieldAlert,
  Waves,
  Mountain,
  Flame,
  CloudSun,
  Trees,
  Eye,
  EyeOff,
  Settings2,
  Maximize,
  Crosshair,
  Table2,
  Clock3,
  SlidersHorizontal,
  Check,
  Plus,
  RefreshCw,
  FileJson,
  FileSpreadsheet,
  Map as MapIcon,
  AlertTriangle,
  Loader2,
} from "lucide-react";

import "leaflet/dist/leaflet.css";

/* ============================================================
   TYPES
============================================================ */

type GeoJsonCollection = GeoJSON.FeatureCollection;

type ApiLayer = {
  id: string;
  tableName?: string;
  table?: string;
  title: string;
  icon?: string;
  color?: string;
  featureCount?: number;
  category?: string;
  schema?: string;
  checked?: boolean;
  sourceType?: "table" | "risk" | string;
  riskCategory?: string | null;
  updatedAt?: string;
};

type LayerItem = ApiLayer & {
  id: string;
  title: string;
  icon: React.ElementType;
  checked: boolean;
  category: string;
};

type LayerCategory = {
  id: string;
  title: string;
  children: LayerItem[];
};

type CatalogStatistics = {
  totalLayers: number;
  totalFeatures: number;
  categories: number;
};

type CatalogPayload = {
  success: boolean;
  message?: string;
  error?: string;

  /*
   * CURRENT server.js:
   * data: {
   *   categories,
   *   statistics,
   *   source,
   *   generatedAt
   * }
   *
   * Older server.js:
   * data: ApiLayer[]
   * categories: LayerCategory[]
   */
  data?:
    | {
        categories?: LayerCategory[];
        statistics?: CatalogStatistics;
        source?: string;
        generatedAt?: string;
      }
    | ApiLayer[];

  categories?: LayerCategory[];
  generatedAt?: string;
};

type LayerDataPayload = {
  success: boolean;
  message?: string;
  error?: string;
  layer?: ApiLayer;
  data?: unknown;
};

type AttributeRow = {
  id: number;
  wilayah: string;
  risiko: string;
  luas: string;
  provinsi: string;
  sumber: string;
  update: string;
};

type ColumnVisibility = {
  wilayah: boolean;
  risiko: boolean;
  luas: boolean;
  provinsi: boolean;
  sumber: boolean;
  update: boolean;
};

type MapActionsProps = {
  onLocate?: () => void;
};

/* ============================================================
   API CONFIG
============================================================ */

const API_ROOT = String(import.meta.env.VITE_API_URL ?? "/api").replace(
  /\/$/,
  "",
);

const API_BASE =
  API_ROOT === "/api" || API_ROOT.endsWith("/api")
    ? API_ROOT
    : `${API_ROOT}/api`;

const CATALOG_URL = `${API_BASE}/layer-overlay/catalog`;
const DATA_URL = (layerId: string) =>
  `${API_BASE}/layer-overlay/data/${encodeURIComponent(layerId)}`;

/* ============================================================
   HELPERS
============================================================ */

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeString(value: unknown, fallback = "-"): string {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }

  return String(value);
}

function formatNumber(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";

  const numeric = Number(value);

  if (Number.isFinite(numeric)) {
    return numeric.toLocaleString("id-ID");
  }

  return safeString(value);
}

function formatDate(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";

  const text = String(value);

  if (/^\d{4}$/.test(text)) return text;

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return text;
  }

  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function escapeHtml(value: unknown): string {
  return safeString(value, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeIcon(icon?: string): React.ElementType {
  switch (String(icon ?? "").toLowerCase()) {
    case "waves":
    case "banjir":
      return Waves;

    case "mountain":
    case "longsor":
      return Mountain;

    case "flame":
    case "karhutla":
      return Flame;

    case "cloudsun":
    case "kekeringan":
      return CloudSun;

    case "trees":
    case "lingkungan":
      return Trees;

    case "database":
      return Database;

    case "mappinned":
      return MapPinned;

    case "layers3":
      return Layers3;

    default:
      return MapPinned;
  }
}

function defaultLayerColor(layer: ApiLayer): string {
  const name = `${layer.id} ${layer.title}`.toLowerCase();

  if (name.includes("banjir") || name.includes("limpasan")) {
    return "#2563eb";
  }

  if (name.includes("longsor") || name.includes("erosi")) {
    return "#ea580c";
  }

  if (name.includes("karhutla") || name.includes("kebakaran")) {
    return "#dc2626";
  }

  if (name.includes("kekeringan")) {
    return "#d97706";
  }

  if (
    name.includes("provinsi") ||
    name.includes("kab") ||
    name.includes("kecamatan") ||
    name.includes("kelurahan") ||
    name.includes("kel_desa") ||
    name.includes("desa")
  ) {
    return "#059669";
  }

  if (
    name.includes("tutupan") ||
    name.includes("lahan") ||
    name.includes("hutan") ||
    name.includes("gambut")
  ) {
    return "#16a34a";
  }

  return "#0f766e";
}

function riskColor(value: unknown, fallback: string): string {
  const text = safeString(value, "").toLowerCase();

  if (
    text.includes("sangat tinggi") ||
    text === "tinggi" ||
    text.includes("high")
  ) {
    return "#dc2626";
  }

  if (
    text.includes("sedang") ||
    text.includes("menengah") ||
    text.includes("medium")
  ) {
    return "#f59e0b";
  }

  if (
    text.includes("sangat rendah") ||
    text === "rendah" ||
    text.includes("low")
  ) {
    return "#10b981";
  }

  return fallback;
}

function normalizeFeatureCollection(value: unknown): GeoJsonCollection {
  if (
    isObject(value) &&
    value.type === "FeatureCollection" &&
    Array.isArray(value.features)
  ) {
    return value as unknown as GeoJsonCollection;
  }

  if (Array.isArray(value)) {
    return {
      type: "FeatureCollection",
      features: value.filter(
        (item): item is GeoJSON.Feature =>
          isObject(item) && item.type === "Feature",
      ),
    };
  }

  if (isObject(value)) {
    if (
      isObject(value.data) &&
      value.data.type === "FeatureCollection" &&
      Array.isArray(value.data.features)
    ) {
      return value.data as unknown as GeoJsonCollection;
    }

    if (
      Array.isArray(value.features) &&
      value.type === "FeatureCollection"
    ) {
      return value as unknown as GeoJsonCollection;
    }

    /*
     * Defensive compatibility:
     * Some backend responses may return:
     * { featureCollection: {...} }
     * or
     * { geojson: {...} }
     */
    const possible = [
      value.geojson,
      value.geoJSON,
      value.featureCollection,
      value.feature_collection,
    ];

    for (const candidate of possible) {
      if (
        isObject(candidate) &&
        candidate.type === "FeatureCollection" &&
        Array.isArray(candidate.features)
      ) {
        return candidate as unknown as GeoJsonCollection;
      }
    }
  }

  return {
    type: "FeatureCollection",
    features: [],
  };
}

function flattenCategories(categories: LayerCategory[]): ApiLayer[] {
  return categories.flatMap((category) =>
    (category.children ?? []).map((child) => ({
      ...child,
      category: child.category || category.title,
      tableName: child.tableName || child.table,
      icon:
        typeof child.icon === "string"
          ? child.icon
          : undefined,
    })),
  );
}

/*
 * IMPORTANT:
 * server.js terbaru mengembalikan:
 *
 * {
 *   success: true,
 *   data: {
 *     categories: [...],
 *     statistics: {...},
 *     source: "PostgreSQL/PostGIS",
 *     generatedAt: "..."
 *   }
 * }
 *
 * Komponen lama menganggap payload.data adalah array lalu melakukan
 * apiLayers.slice(...). Itu yang menyebabkan:
 *
 *   apiLayers.slice is not a function
 *
 * Fungsi ini menerima CURRENT dan LEGACY response tanpa hardcode layer.
 */
function normalizeCatalogPayload(payload: CatalogPayload): {
  categories: LayerCategory[];
  layers: ApiLayer[];
  statistics: CatalogStatistics;
} {
  const rawData = payload.data;

  if (Array.isArray(rawData)) {
    const legacyLayers = rawData.map((layer) => ({
      ...layer,
      id: String(layer.id),
      title: layer.title || layer.tableName || layer.table || String(layer.id),
    }));

    const legacyCategories =
      payload.categories?.map((category) => ({
        ...category,
        children: (category.children ?? []).map((child) => {
          const source = legacyLayers.find(
            (item) => String(item.id) === String(child.id),
          );

          return {
            ...child,
            id: String(child.id),
            title:
              child.title ||
              source?.title ||
              child.tableName ||
              child.table ||
              String(child.id),
            icon: normalizeIcon(
              typeof child.icon === "string"
                ? child.icon
                : source?.icon,
            ),
            checked: false,
            color: child.color || source?.color || defaultLayerColor(source ?? child),
            featureCount:
              child.featureCount ??
              source?.featureCount ??
              0,
            category: child.category || category.title,
          };
        }),
      })) ?? [];

    const categories =
      legacyCategories.length > 0
        ? legacyCategories
        : [
            {
              id: "layers",
              title: "LAYERS",
              children: legacyLayers.map((layer) => ({
                ...layer,
                icon: normalizeIcon(layer.icon),
                checked: false,
                color: layer.color || defaultLayerColor(layer),
                featureCount: layer.featureCount ?? 0,
                category: layer.category || "Layers",
              })),
            },
          ];

    return {
      categories,
      layers: legacyLayers,
      statistics: {
        totalLayers: legacyLayers.length,
        totalFeatures: legacyLayers.reduce(
          (sum, layer) => sum + Number(layer.featureCount || 0),
          0,
        ),
        categories: categories.length,
      },
    };
  }

  const currentCategories = rawData?.categories ?? payload.categories ?? [];

  const normalizedCategories: LayerCategory[] = currentCategories.map(
    (category) => ({
      ...category,
      id: String(category.id),
      title: category.title || String(category.id),
      children: (category.children ?? []).map((child) => ({
        ...child,
        id: String(child.id),
        title:
          child.title ||
          child.tableName ||
          child.table ||
          String(child.id),
        icon: normalizeIcon(
          typeof child.icon === "string" ? child.icon : undefined,
        ),
        checked: false,
        color:
          child.color ||
          defaultLayerColor({
            ...child,
            id: String(child.id),
            title:
              child.title ||
              child.tableName ||
              child.table ||
              String(child.id),
          }),
        featureCount: Number(child.featureCount ?? 0),
        category: child.category || category.title,
      })),
    }),
  );

  const currentLayers = flattenCategories(normalizedCategories).map(
    (layer) => ({
      ...layer,
      id: String(layer.id),
      title:
        layer.title ||
        layer.tableName ||
        layer.table ||
        String(layer.id),
      icon:
        typeof layer.icon === "string"
          ? layer.icon
          : undefined,
    }),
  );

  return {
    categories: normalizedCategories,
    layers: currentLayers,
    statistics: {
      totalLayers:
        rawData?.statistics?.totalLayers ??
        currentLayers.length,
      totalFeatures:
        rawData?.statistics?.totalFeatures ??
        currentLayers.reduce(
          (sum, layer) => sum + Number(layer.featureCount || 0),
          0,
        ),
      categories:
        rawData?.statistics?.categories ??
        normalizedCategories.length,
    },
  };
}

function getFeatureName(
  properties: Record<string, unknown>,
  fallback = "Feature",
): string {
  const candidates = [
    "_layer_name",
    "nama",
    "name",
    "namobj",
    "provinsi",
    "kab_kota",
    "kabupaten",
    "kecamatan",
    "kel_desa",
    "kelurahan",
    "desa",
    "title",
  ];

  for (const key of candidates) {
    if (
      properties[key] !== null &&
      properties[key] !== undefined &&
      String(properties[key]).trim() !== ""
    ) {
      return String(properties[key]);
    }
  }

  return fallback;
}

function getRiskValue(properties: Record<string, unknown>): unknown {
  return (
    properties.tingkat ??
    properties.risk ??
    properties.kerawanan ??
    properties.kelas ??
    properties.unsur ??
    properties.limpasan ??
    properties.keterangan ??
    "-"
  );
}

/* ============================================================
   MAP CONTROLLER
============================================================ */

function MapActions({ onLocate }: MapActionsProps) {
  const map = useMap();

  const locateUser = () => {
    if (onLocate) {
      onLocate();
      return;
    }

    map.locate({
      setView: true,
      maxZoom: 12,
      enableHighAccuracy: true,
    });
  };

  const fullscreen = () => {
    const container = map.getContainer();

    if (!document.fullscreenElement) {
      void container.requestFullscreen?.();
    } else {
      void document.exitFullscreen?.();
    }
  };

  return (
    <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-2">
      <button
        type="button"
        onClick={fullscreen}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-lg transition hover:bg-slate-50"
        title="Fullscreen"
      >
        <Maximize size={17} />
      </button>

      <button
        type="button"
        onClick={locateUser}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-lg transition hover:bg-slate-50"
        title="Lokasi saya"
      >
        <Crosshair size={17} />
      </button>
    </div>
  );
}

function FitBoundsFromLayer({
  data,
  enabled,
}: {
  data?: GeoJsonCollection;
  enabled: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!enabled || !data || !data.features?.length) return;

    let mounted = true;

    const run = async () => {
      try {
        const leaflet = await import("leaflet");

        if (!mounted) return;

        const layer = leaflet.geoJSON(data as never);
        const bounds = layer.getBounds();

        if (bounds.isValid()) {
          map.fitBounds(bounds, {
            padding: [24, 24],
            maxZoom: 11,
          });
        }
      } catch {
        // Ignore fit failures.
      }
    };

    void run();

    return () => {
      mounted = false;
    };
  }, [data, enabled, map]);

  return null;
}

/* ============================================================
   SMALL UI COMPONENTS
============================================================ */

function LegendItem({
  color,
  label,
}: {
  color: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="h-2.5 w-2.5 rounded-sm"
        style={{ backgroundColor: color }}
      />
      <span className="text-[9px] font-medium text-slate-600">
        {label}
      </span>
    </div>
  );
}

function TableTab({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[9px] font-bold transition ${
        active
          ? "border-emerald-500 text-emerald-600"
          : "border-transparent text-slate-400 hover:text-slate-700"
      }`}
    >
      <Icon size={12} />
      {children}
    </button>
  );
}

function RiskBadge({ risk }: { risk: string }) {
  const color = riskColor(risk, "#64748b");
  const text = safeString(risk, "-");

  let classes =
    "border-slate-200 bg-slate-50 text-slate-600";

  if (color === "#dc2626") {
    classes = "border-red-200 bg-red-50 text-red-700";
  } else if (color === "#f59e0b") {
    classes = "border-amber-200 bg-amber-50 text-amber-700";
  } else if (color === "#10b981") {
    classes = "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold ${classes}`}
    >
      {text}
    </span>
  );
}

function StatusCard({
  value,
  label,
  icon: Icon,
}: {
  value: string;
  label: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
      <div className="mb-1 flex items-center justify-between">
        <Icon size={13} className="text-slate-400" />
        <span className="text-[14px] font-bold text-slate-700">
          {value}
        </span>
      </div>
      <div className="text-[8px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
    </div>
  );
}

function WorkspaceItem({
  title,
  active,
  onClick,
}: {
  title: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition ${
        active
          ? "bg-emerald-50 text-emerald-700"
          : "hover:bg-slate-50"
      }`}
    >
      <Layers3 size={13} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate text-[10px] font-semibold">
        {title}
      </span>
    </button>
  );
}

/* ============================================================
   COMPONENT
============================================================ */

export default function LayerOverlay() {
  const [layers, setLayers] = useState<LayerCategory[]>([]);
  const [apiLayers, setApiLayers] = useState<ApiLayer[]>([]);
  const [catalogStats, setCatalogStats] =
    useState<CatalogStatistics | null>(null);

  const [geoJsonByLayer, setGeoJsonByLayer] = useState<
    Record<string, GeoJsonCollection>
  >({});

  const [activeLayer, setActiveLayer] = useState("");
  const [loadingLayers, setLoadingLayers] = useState(true);
  const [loadingGeoJson, setLoadingGeoJson] = useState(false);
  const [loadingLayerId, setLoadingLayerId] = useState("");
  const [apiError, setApiError] = useState("");

  const [openCategories, setOpenCategories] =
    useState<Record<string, boolean>>({});

  const [basemap, setBasemap] =
    useState<"map" | "satellite">("map");

  const [activeTab, setActiveTab] = useState<
    "attributes" | "overlay" | "history"
  >("attributes");

  const [searchLayer, setSearchLayer] = useState("");
  const [opacity, setOpacity] = useState(65);
  const [showInfo, setShowInfo] = useState(true);
  const [showBasemapMenu, setShowBasemapMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [workspaceName, setWorkspaceName] =
    useState("Workspace GIS SIMITI");

  const [columnVisibility, setColumnVisibility] =
    useState<ColumnVisibility>({
      wilayah: true,
      risiko: true,
      luas: true,
      provinsi: true,
      sumber: true,
      update: true,
    });

  const [overlayEnabled, setOverlayEnabled] = useState(false);
  const [spatialQueryEnabled, setSpatialQueryEnabled] =
    useState(false);
  const [measureEnabled, setMeasureEnabled] = useState(false);

  /* ==========================================================
     LOAD CATALOG
  ========================================================== */

  const loadCatalog = useCallback(async () => {
    setLoadingLayers(true);
    setApiError("");

    try {
      const response = await fetch(CATALOG_URL, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      const rawText = await response.text();

      let payload: CatalogPayload;

      try {
        payload = JSON.parse(rawText) as CatalogPayload;
      } catch {
        throw new Error(
          `Response catalog bukan JSON valid (HTTP ${response.status}).`,
        );
      }

      if (!response.ok) {
        throw new Error(
          payload.message ||
            payload.error ||
            `HTTP ${response.status}`,
        );
      }

      if (!payload.success) {
        throw new Error(
          payload.message ||
            payload.error ||
            "Backend tidak mengembalikan katalog layer.",
        );
      }

      const normalized = normalizeCatalogPayload(payload);

      setLayers(normalized.categories);
      setApiLayers(normalized.layers);
      setCatalogStats(normalized.statistics);

      const initialOpenState =
        normalized.categories.reduce<Record<string, boolean>>(
          (acc, category) => {
            acc[category.id] = true;
            return acc;
          },
          {},
        );

      setOpenCategories(initialOpenState);

      const firstLayer =
        normalized.layers.length > 0
          ? String(normalized.layers[0].id)
          : "";

      setActiveLayer((previous) =>
        previous &&
        normalized.layers.some(
          (layer) => String(layer.id) === previous,
        )
          ? previous
          : firstLayer,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Gagal memuat katalog layer.";

      setApiError(message);
      setLayers([]);
      setApiLayers([]);
      setCatalogStats(null);
    } finally {
      setLoadingLayers(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  /* ==========================================================
     LOAD GEOJSON
  ========================================================== */

  const loadLayerGeoJson = useCallback(
    async (layerId: string) => {
      if (!layerId) return;

      setLoadingGeoJson(true);
      setLoadingLayerId(layerId);
      setApiError("");

      try {
        const response = await fetch(DATA_URL(layerId), {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        });

        const rawText = await response.text();

        let payload: LayerDataPayload;

        try {
          payload = JSON.parse(rawText) as LayerDataPayload;
        } catch {
          throw new Error(
            `Response data layer bukan JSON valid (HTTP ${response.status}).`,
          );
        }

        if (!response.ok) {
          throw new Error(
            payload.message ||
              payload.error ||
              `HTTP ${response.status}`,
          );
        }

        if (!payload.success) {
          throw new Error(
            payload.message ||
              payload.error ||
              "Gagal memuat data spasial.",
          );
        }

        const featureCollection =
          normalizeFeatureCollection(payload.data);

        setGeoJsonByLayer((previous) => ({
          ...previous,
          [layerId]: featureCollection,
        }));

        if (payload.layer) {
          setApiLayers((previous) =>
            previous.map((layer) =>
              String(layer.id) === String(layerId)
                ? {
                    ...layer,
                    ...payload.layer,
                    id: String(
                      payload.layer?.id ?? layer.id,
                    ),
                  }
                : layer,
            ),
          );
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Gagal memuat data spasial.";

        setApiError(
          `${message} Layer: ${layerId}`,
        );
      } finally {
        setLoadingGeoJson(false);
        setLoadingLayerId("");
      }
    },
    [],
  );

  /* ==========================================================
     LAYER ACTIONS
  ========================================================== */

  const updateLayerChecked = (
    layerId: string,
    checked: boolean,
  ) => {
    setLayers((previous) =>
      previous.map((category) => ({
        ...category,
        children: category.children.map((layer) =>
          String(layer.id) === String(layerId)
            ? { ...layer, checked }
            : layer,
        ),
      })),
    );
  };

  const toggleLayer = (layerId: string) => {
    const currentLayer = apiLayers.find(
      (layer) => String(layer.id) === String(layerId),
    );

    let currentlyChecked = false;

    for (const category of layers) {
      const found = category.children.find(
        (layer) => String(layer.id) === String(layerId),
      );

      if (found) {
        currentlyChecked = found.checked;
        break;
      }
    }

    const nextChecked = !currentlyChecked;

    updateLayerChecked(layerId, nextChecked);

    setActiveLayer(String(layerId));

    if (nextChecked && !geoJsonByLayer[layerId]) {
      void loadLayerGeoJson(String(layerId));
    }

    if (currentLayer && !currentLayer.featureCount) {
      // Keep state driven by backend; no mock count is inserted.
    }
  };

  const selectLayer = (layerId: string) => {
    setActiveLayer(String(layerId));

    if (!geoJsonByLayer[layerId]) {
      void loadLayerGeoJson(String(layerId));
    }
  };

  const clearAllLayers = () => {
    setLayers((previous) =>
      previous.map((category) => ({
        ...category,
        children: category.children.map((layer) => ({
          ...layer,
          checked: false,
        })),
      })),
    );
  };

  const enableAllLayers = () => {
    setLayers((previous) =>
      previous.map((category) => ({
        ...category,
        children: category.children.map((layer) => ({
          ...layer,
          checked: true,
        })),
      })),
    );

    const missing = apiLayers.filter(
      (layer) => !geoJsonByLayer[String(layer.id)],
    );

    if (missing.length > 0) {
      void loadLayerGeoJson(String(missing[0].id));
    }
  };

  /* ==========================================================
     FILTER CATEGORIES
  ========================================================== */

  const filteredCategories = useMemo(() => {
    const keyword = searchLayer.trim().toLowerCase();

    if (!keyword) return layers;

    return layers
      .map((category) => ({
        ...category,
        children: category.children.filter((layer) => {
          return [
            layer.title,
            layer.id,
            layer.tableName,
            layer.table,
            layer.category,
          ]
            .filter(Boolean)
            .some((value) =>
              String(value).toLowerCase().includes(keyword),
            );
        }),
      }))
      .filter((category) => category.children.length > 0);
  }, [layers, searchLayer]);

  /* ==========================================================
     ACTIVE LAYER
  ========================================================== */

  const activeLayerObject = useMemo(() => {
    const fromApi = apiLayers.find(
      (layer) => String(layer.id) === String(activeLayer),
    );

    if (fromApi) {
      return {
        ...fromApi,
        id: String(fromApi.id),
        title:
          fromApi.title ||
          fromApi.tableName ||
          fromApi.table ||
          String(fromApi.id),
        color:
          fromApi.color || defaultLayerColor(fromApi),
        icon: normalizeIcon(fromApi.icon),
        checked: layers.some((category) =>
          category.children.some(
            (layer) =>
              String(layer.id) === String(activeLayer) &&
              layer.checked,
          ),
        ),
        category:
          fromApi.category ||
          "Layers",
      } as LayerItem;
    }

    for (const category of layers) {
      const found = category.children.find(
        (layer) => String(layer.id) === String(activeLayer),
      );

      if (found) return found;
    }

    return undefined;
  }, [apiLayers, activeLayer, layers]);

  const activeGeoJson = geoJsonByLayer[activeLayer];

  /* ==========================================================
     GEOJSON POPUP
  ========================================================== */

  const onEachFeature = (
    feature: GeoJSON.Feature,
    layer: LeafletLayer,
  ) => {
    if (!("bindPopup" in layer)) return;

    const properties =
      (feature.properties as Record<string, unknown> | null) ??
      {};

    const name = getFeatureName(properties);
    const risk = getRiskValue(properties);

    const safeName = escapeHtml(name);
    const safeRisk = escapeHtml(risk);

    const importantProperties = Object.entries(properties)
      .filter(([key]) => !key.startsWith("_"))
      .slice(0, 8);

    const propertyRows = importantProperties
      .map(
        ([key, value]) => `
          <div style="
            display:flex;
            justify-content:space-between;
            gap:12px;
            padding:4px 0;
            border-bottom:1px solid #eef2f7;
            font-size:11px;
          ">
            <span style="color:#64748b">${escapeHtml(key)}</span>
            <strong style="color:#334155;text-align:right">${escapeHtml(value)}</strong>
          </div>
        `,
      )
      .join("");

    layer.bindPopup(`
      <div style="
        min-width:240px;
        max-width:330px;
        font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      ">
        <div style="
          margin-bottom:8px;
          padding-bottom:8px;
          border-bottom:1px solid #e2e8f0;
        ">
          <div style="
            font-size:13px;
            font-weight:800;
            color:#0f172a;
          ">
            ${safeName}
          </div>

          <div style="
            margin-top:3px;
            font-size:10px;
            color:#64748b;
          ">
            Kelas / Risiko:
            <strong>${safeRisk}</strong>
          </div>
        </div>

        ${propertyRows}
      </div>
    `);
  };

  /* ==========================================================
     GEOJSON STYLE
  ========================================================== */

  const getLayerStyle = useCallback(
    (
      layer: LayerItem | undefined,
      feature?: GeoJSON.Feature,
    ): PathOptions => {
      const fallback =
        layer?.color ||
        (layer ? defaultLayerColor(layer) : "#0f766e");

      const properties =
        (feature?.properties as Record<string, unknown> | null) ??
        {};

      const color = riskColor(
        getRiskValue(properties),
        fallback,
      );

      const hasRisk =
        String(getRiskValue(properties))
          .toLowerCase()
          .trim() !== "-";

      return {
        color,
        weight: hasRisk ? 1.5 : 1.2,
        opacity: 0.9,
        fillColor: color,
        fillOpacity: opacity / 100,
      };
    },
    [opacity],
  );

  /* ==========================================================
     ATTRIBUTE TABLE
  ========================================================== */

  const filteredAttributes = useMemo<AttributeRow[]>(() => {
    const features = activeGeoJson?.features ?? [];
    const keyword = filterText.trim().toLowerCase();

    return features
      .map((feature, index) => {
        const props =
          (feature.properties as Record<string, unknown> | null) ??
          {};

        const luasValue =
          props.luas ??
          props.luas_total ??
          props.luas_ha ??
          props.shape_area ??
          props.area ??
          props.shape_leng ??
          "-";

        const dateValue =
          props.updated_at ??
          props.tanggal_update ??
          props.tahun_data ??
          props.year ??
          "-";

        const wilayahValue = getFeatureName(props);

        const risikoValue = getRiskValue(props);

        const provinsiValue =
          props.provinsi ??
          props.wil_kerja ??
          props.kab_kota ??
          "-";

        const sumberValue =
          props.sumber ??
          props.source ??
          props.sumber_layer ??
          activeLayerObject?.tableName ??
          activeLayerObject?.table ??
          activeLayerObject?.id ??
          "-";

        return {
          id: Number(feature.id ?? index + 1),
          wilayah: safeString(wilayahValue),
          risiko: safeString(risikoValue),
          luas:
            typeof luasValue === "number"
              ? formatNumber(luasValue)
              : safeString(luasValue),
          provinsi: safeString(provinsiValue),
          sumber: safeString(sumberValue),
          update: formatDate(dateValue),
        };
      })
      .filter((row) => {
        if (!keyword) return true;

        return [
          row.wilayah,
          row.risiko,
          row.provinsi,
          row.sumber,
          row.update,
        ].some((value) =>
          value.toLowerCase().includes(keyword),
        );
      });
  }, [
    activeGeoJson,
    activeLayerObject,
    filterText,
  ]);

  /* ==========================================================
     EXPORT GEOJSON
  ========================================================== */

  const exportGeoJson = () => {
    if (!activeGeoJson) return;

    const blob = new Blob(
      [JSON.stringify(activeGeoJson, null, 2)],
      {
        type: "application/geo+json;charset=utf-8",
      },
    );

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `${activeLayer || "layer"}.geojson`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  /* ==========================================================
     EXPORT CSV
  ========================================================== */

  const exportCsv = () => {
    if (!filteredAttributes.length) return;

    const header = [
      "ID",
      "Wilayah",
      "Risiko",
      "Luas",
      "Provinsi",
      "Sumber Data",
      "Tgl Update",
    ];

    const rows = filteredAttributes.map((row) =>
      [
        row.id,
        row.wilayah,
        row.risiko,
        row.luas,
        row.provinsi,
        row.sumber,
        row.update,
      ].map((value) =>
        `"${String(value).replaceAll('"', '""')}"`,
      ),
    );

    const csv = [header, ...rows]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob(["\ufeff", csv], {
      type: "text/csv;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `${activeLayer || "layer"}-attributes.csv`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  /* ==========================================================
     COLUMN VISIBILITY
  ========================================================== */

  const toggleColumn = (
    key: keyof ColumnVisibility,
  ) => {
    setColumnVisibility((previous) => ({
      ...previous,
      [key]: !previous[key],
    }));
  };

  /* ==========================================================
     RENDER
  ========================================================== */

  const allLayerItems = layers.flatMap(
    (category) => category.children,
  );

  const activeLayerCount = allLayerItems.filter(
    (layer) => layer.checked,
  ).length;

  const activeFeatureCount =
    activeLayerObject?.featureCount ??
    activeGeoJson?.features?.length ??
    0;

  return (
    <div className="min-h-screen bg-[#f4f7f9] text-slate-800">
      {/* ======================================================
          PAGE HEADER
      ====================================================== */}

      <div className="border-b border-slate-200 bg-white">
        <div className="px-5 py-4 lg:px-7">
          <div className="mb-3 flex items-center gap-2 text-[12px] font-medium text-slate-400">
            <span className="text-emerald-600">
              Home
            </span>

            <ChevronRight size={13} />

            <span className="text-emerald-600">
              WebGIS & Data Spasial
            </span>

            <ChevronRight size={13} />

            <span className="font-semibold text-slate-700">
              Layer & Overlay
            </span>
          </div>

          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <h1 className="text-[24px] font-bold tracking-tight text-slate-900">
                Layer & Overlay
              </h1>

              <p className="mt-1 text-[13px] text-slate-500">
                Kelola layer, overlay dan analisis data spasial
                berbasis database SIMITI
              </p>
            </div>

            <div
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${
                loadingLayers || loadingGeoJson
                  ? "border-amber-100 bg-amber-50 text-amber-700"
                  : apiError
                    ? "border-red-100 bg-red-50 text-red-700"
                    : "border-emerald-100 bg-emerald-50 text-emerald-700"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  loadingLayers || loadingGeoJson
                    ? "bg-amber-500"
                    : apiError
                      ? "bg-red-500"
                      : "bg-emerald-500"
                }`}
              />

              <span className="text-[11px] font-semibold">
                {loadingLayers
                  ? "Memuat Catalog..."
                  : loadingGeoJson
                    ? "Memuat Data GIS..."
                    : apiError
                      ? "API Bermasalah"
                      : "Database Connected"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================
          API ERROR
      ====================================================== */}

      {apiError && (
        <div className="mx-5 mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-medium text-red-700 lg:mx-7">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />

          <div className="min-w-0 flex-1">
            <div className="font-bold">
              Koneksi API Layer & Overlay
            </div>

            <div className="mt-0.5 break-words">
              {apiError}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setApiError("")}
            className="rounded p-1 hover:bg-red-100"
            title="Tutup"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* ======================================================
          TOOLBAR
      ====================================================== */}

      <div className="border-b border-slate-200 bg-white px-5 py-3 lg:px-7">
        <div className="flex flex-wrap items-center gap-2">
          {/* BASEMAP */}

          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setShowBasemapMenu(
                  (previous) => !previous,
                )
              }
              className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              <MapIcon size={15} />
              Basemap
              <ChevronDown size={14} />
            </button>

            {showBasemapMenu && (
              <div className="absolute left-0 top-11 z-[2000] w-40 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    setBasemap("map");
                    setShowBasemapMenu(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs ${
                    basemap === "map"
                      ? "bg-emerald-50 font-bold text-emerald-700"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <MapIcon size={14} />
                  Peta
                  {basemap === "map" && (
                    <Check
                      size={13}
                      className="ml-auto"
                    />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setBasemap("satellite");
                    setShowBasemapMenu(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs ${
                    basemap === "satellite"
                      ? "bg-emerald-50 font-bold text-emerald-700"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Layers3 size={14} />
                  Satelit
                  {basemap === "satellite" && (
                    <Check
                      size={13}
                      className="ml-auto"
                    />
                  )}
                </button>
              </div>
            )}
          </div>

          {/* OVERLAY */}

          <button
            type="button"
            onClick={() =>
              setOverlayEnabled(
                (previous) => !previous,
              )
            }
            className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-[12px] font-bold shadow-sm transition ${
              overlayEnabled
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <GitMerge size={15} />
            Overlay Analysis
          </button>

          {/* SPATIAL QUERY */}

          <button
            type="button"
            onClick={() =>
              setSpatialQueryEnabled(
                (previous) => !previous,
              )
            }
            className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-[12px] font-semibold shadow-sm transition ${
              spatialQueryEnabled
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Search size={15} />
            Spatial Query
          </button>

          {/* MEASURE */}

          <button
            type="button"
            onClick={() =>
              setMeasureEnabled(
                (previous) => !previous,
              )
            }
            className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-[12px] font-semibold shadow-sm transition ${
              measureEnabled
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Ruler size={15} />
            Measure
          </button>

          {/* EXPORT */}

          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setShowExportMenu(
                  (previous) => !previous,
                )
              }
              className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Download size={15} />
              Export Peta
              <ChevronDown size={14} />
            </button>

            {showExportMenu && (
              <div className="absolute left-0 top-11 z-[2000] w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                <button
                  type="button"
                  onClick={exportGeoJson}
                  disabled={!activeGeoJson}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <FileJson size={14} />
                  Export GeoJSON
                </button>

                <button
                  type="button"
                  onClick={exportCsv}
                  disabled={!filteredAttributes.length}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <FileSpreadsheet size={14} />
                  Export CSV
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setShowExportMenu(false)
                  }
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
                >
                  <MapIcon size={14} />
                  Export PNG
                  <span className="ml-auto text-[8px] text-slate-400">
                    UI
                  </span>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => void loadCatalog()}
            disabled={loadingLayers}
            className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            title="Refresh catalog"
          >
            <RefreshCw
              size={14}
              className={
                loadingLayers ? "animate-spin" : ""
              }
            />
            Refresh
          </button>

          <div className="flex-1" />

          {/* SAVE WORKSPACE */}

          <button
            type="button"
            className="flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-[12px] font-bold text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700"
          >
            <Save size={15} />
            Simpan Workspace
          </button>
        </div>
      </div>

      {/* ======================================================
          MAIN GIS AREA
      ====================================================== */}

      <div className="px-4 py-3 lg:px-7">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[215px_minmax(0,1fr)_295px]">
          {/* ==================================================
              LEFT - LAYER EXPLORER
          ================================================== */}

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-3 py-3">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-700">
                  Layer Explorer
                </h2>

                <button
                  type="button"
                  className="text-slate-400 hover:text-slate-700"
                  title="Pengaturan layer"
                >
                  <Settings2 size={15} />
                </button>
              </div>

              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  value={searchLayer}
                  onChange={(event) =>
                    setSearchLayer(event.target.value)
                  }
                  placeholder="Cari layer..."
                  className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-8 text-[11px] outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                />

                {searchLayer && (
                  <button
                    type="button"
                    onClick={() => setSearchLayer("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    <X size={13} />
                  </button>
                )}

                {!searchLayer && (
                  <Filter
                    size={13}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                )}
              </div>
            </div>

            {/* LAYER QUICK ACTIONS */}

            <div className="flex items-center gap-1 border-b border-slate-100 px-2 py-2">
              <button
                type="button"
                onClick={enableAllLayers}
                className="flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-[9px] font-bold text-slate-600 hover:bg-slate-50"
              >
                Semua
              </button>

              <button
                type="button"
                onClick={clearAllLayers}
                className="flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-[9px] font-bold text-slate-600 hover:bg-slate-50"
              >
                Clear
              </button>
            </div>

            {/* LAYERS */}

            <div className="max-h-[550px] overflow-y-auto px-2 py-2">
              {loadingLayers && (
                <div className="space-y-2 p-2">
                  {[1, 2, 3, 4, 5].map((item) => (
                    <div
                      key={item}
                      className="h-8 animate-pulse rounded-lg bg-slate-100"
                    />
                  ))}
                </div>
              )}

              {!loadingLayers &&
                filteredCategories.length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-200 px-3 py-5 text-center">
                    <Layers3
                      size={20}
                      className="mx-auto mb-2 text-slate-300"
                    />

                    <div className="text-[10px] font-semibold text-slate-500">
                      Tidak ada layer
                    </div>

                    <div className="mt-1 text-[9px] text-slate-400">
                      Catalog database tidak mengembalikan layer.
                    </div>
                  </div>
                )}

              {!loadingLayers &&
                filteredCategories.map((category) => {
                  const categoryOpen =
                    openCategories[category.id] ?? true;

                  return (
                    <div
                      key={category.id}
                      className="mb-2"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setOpenCategories(
                            (previous) => ({
                              ...previous,
                              [category.id]:
                                !previous[category.id],
                            }),
                          )
                        }
                        className="flex w-full items-center gap-1.5 px-1.5 py-1.5 text-left text-[10px] font-bold tracking-wide text-slate-700 hover:text-emerald-700"
                      >
                        {categoryOpen ? (
                          <ChevronDown size={12} />
                        ) : (
                          <ChevronRight size={12} />
                        )}

                        <span className="truncate">
                          {category.title}
                        </span>

                        <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[8px] font-semibold text-slate-400">
                          {category.children.length}
                        </span>
                      </button>

                      {categoryOpen && (
                        <div className="space-y-0.5">
                          {category.children.map(
                            (layer) => {
                              const Icon =
                                layer.icon ||
                                normalizeIcon();

                              const active =
                                String(activeLayer) ===
                                String(layer.id);

                              const loading =
                                loadingLayerId ===
                                String(layer.id);

                              return (
                                <div
                                  key={layer.id}
                                  onClick={() =>
                                    selectLayer(
                                      String(layer.id),
                                    )
                                  }
                                  className={`group flex min-h-[34px] cursor-pointer items-center gap-2 rounded-lg px-1.5 transition ${
                                    active
                                      ? "bg-emerald-50"
                                      : "hover:bg-slate-50"
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();

                                      toggleLayer(
                                        String(layer.id),
                                      );
                                    }}
                                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                                      layer.checked
                                        ? "border-emerald-500 bg-emerald-500 text-white"
                                        : "border-slate-300 bg-white"
                                    }`}
                                    title={
                                      layer.checked
                                        ? "Sembunyikan layer"
                                        : "Tampilkan layer"
                                    }
                                  >
                                    {loading ? (
                                      <Loader2
                                        size={10}
                                        className="animate-spin"
                                      />
                                    ) : layer.checked ? (
                                      <Check size={11} />
                                    ) : null}
                                  </button>

                                  <Icon
                                    size={13}
                                    className={
                                      active
                                        ? "text-emerald-600"
                                        : "text-slate-500"
                                    }
                                  />

                                  <span
                                    className={`min-w-0 flex-1 truncate text-[11px] ${
                                      active
                                        ? "font-semibold text-emerald-700"
                                        : "text-slate-600"
                                    }`}
                                  >
                                    {layer.title}
                                  </span>

                                  {layer.featureCount !==
                                    undefined && (
                                    <span className="rounded bg-slate-100 px-1 text-[8px] font-semibold text-slate-400">
                                      {Number(
                                        layer.featureCount,
                                      ).toLocaleString(
                                        "id-ID",
                                      )}
                                    </span>
                                  )}

                                  {layer.checked ? (
                                    <Eye
                                      size={12}
                                      className="text-emerald-500"
                                    />
                                  ) : (
                                    <EyeOff
                                      size={12}
                                      className="text-slate-300"
                                    />
                                  )}

                                  <MoreVertical
                                    size={13}
                                    className="text-slate-300 opacity-0 transition group-hover:opacity-100"
                                  />
                                </div>
                              );
                            },
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>

            {/* ADD LAYER */}

            <div className="border-t border-slate-100 p-2.5">
              <button
                type="button"
                className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-white text-[11px] font-bold text-emerald-600 transition hover:bg-emerald-50"
              >
                <Plus size={14} />
                Tambah Layer
              </button>
            </div>
          </section>

          {/* ==================================================
              CENTER
          ================================================== */}

          <div className="min-w-0">
            {/* MAP */}

            <section className="relative h-[480px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm">
              <MapContainer
                center={[-2.5, 118]}
                zoom={5}
                zoomControl={false}
                className="h-full w-full"
              >
                {basemap === "map" ? (
                  <TileLayer
                    attribution="&copy; OpenStreetMap contributors"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                ) : (
                  <TileLayer
                    attribution="Tiles &copy; Esri"
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  />
                )}

                {layers
                  .flatMap(
                    (category) => category.children,
                  )
                  .filter((layer) => layer.checked)
                  .map((layer) => {
                    const data =
                      geoJsonByLayer[
                        String(layer.id)
                      ];

                    if (!data) return null;

                    return (
                      <GeoJSON
                        key={`${layer.id}-${opacity}`}
                        data={data as never}
                        style={(feature) =>
                          getLayerStyle(
                            layer,
                            feature,
                          )
                        }
                        onEachFeature={
                          onEachFeature
                        }
                      />
                    );
                  })}

                <FitBoundsFromLayer
                  data={activeGeoJson}
                  enabled={
                    Boolean(activeGeoJson) &&
                    Boolean(activeLayerObject?.checked)
                  }
                />

                <ZoomControl position="bottomright" />

                <MapActions />
              </MapContainer>

              {/* MAP TYPE */}

              <div className="absolute left-3 top-3 z-[1000] flex overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                <button
                  type="button"
                  onClick={() => setBasemap("map")}
                  className={`px-3 py-2 text-[11px] font-semibold ${
                    basemap === "map"
                      ? "bg-white text-slate-800"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  Peta
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setBasemap("satellite")
                  }
                  className={`px-3 py-2 text-[11px] font-semibold ${
                    basemap === "satellite"
                      ? "bg-white text-slate-800"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  Satelit
                </button>
              </div>

              {/* LOADING MAP */}

              {loadingGeoJson && (
                <div className="absolute left-1/2 top-1/2 z-[1100] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-xl backdrop-blur">
                  <div className="flex items-center gap-2">
                    <Loader2
                      size={15}
                      className="animate-spin text-emerald-600"
                    />

                    <span className="text-[11px] font-semibold text-slate-700">
                      Memuat data spasial...
                    </span>
                  </div>
                </div>
              )}

              {/* MAP LEGEND */}

              <div className="absolute bottom-3 left-3 z-[1000] max-w-[calc(100%-90px)] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
                <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                  Legend
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <LegendItem
                    color="#dc2626"
                    label="Tinggi"
                  />

                  <LegendItem
                    color="#f59e0b"
                    label="Sedang"
                  />

                  <LegendItem
                    color="#10b981"
                    label="Rendah"
                  />

                  {activeLayerObject?.color && (
                    <LegendItem
                      color={
                        activeLayerObject.color
                      }
                      label={
                        activeLayerObject.title
                      }
                    />
                  )}
                </div>
              </div>

              {/* SCALE */}

              <div className="absolute bottom-3 right-16 z-[900] rounded bg-white/80 px-2 py-1 text-[9px] font-semibold text-slate-600">
                GIS SIMITI
              </div>
            </section>

            {/* OPACITY */}

            <section className="mt-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal
                    size={14}
                    className="text-slate-400"
                  />

                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Opacity
                  </span>

                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700">
                    {opacity}%
                  </span>
                </div>

                <input
                  type="range"
                  min="0"
                  max="100"
                  value={opacity}
                  onChange={(event) =>
                    setOpacity(
                      Number(event.target.value),
                    )
                  }
                  className="h-1.5 w-40 cursor-pointer accent-emerald-600"
                />

                <div className="ml-auto flex items-center gap-2">
                  <span className="text-[9px] text-slate-400">
                    Layer aktif:
                  </span>

                  <span className="max-w-[220px] truncate text-[10px] font-bold text-slate-700">
                    {activeLayerObject?.title ??
                      "Belum ada"}
                  </span>
                </div>
              </div>
            </section>

            {/* =================================================
                ATTRIBUTE TABLE
            ================================================= */}

            <section className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {/* TABS */}

              <div className="flex items-center overflow-x-auto border-b border-slate-100 px-3">
                <TableTab
                  active={
                    activeTab === "attributes"
                  }
                  onClick={() =>
                    setActiveTab("attributes")
                  }
                  icon={Table2}
                >
                  ATTRIBUTE TABLE
                </TableTab>

                <TableTab
                  active={
                    activeTab === "overlay"
                  }
                  onClick={() =>
                    setActiveTab("overlay")
                  }
                  icon={GitMerge}
                >
                  HASIL OVERLAY ANALYSIS
                </TableTab>

                <TableTab
                  active={
                    activeTab === "history"
                  }
                  onClick={() =>
                    setActiveTab("history")
                  }
                  icon={Clock3}
                >
                  RIWAYAT
                </TableTab>
              </div>

              {/* ATTRIBUTE TAB */}

              {activeTab === "attributes" && (
                <>
                  <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
                    <span className="text-[10px] text-slate-500">
                      Layer Aktif:
                    </span>

                    <span className="max-w-[220px] truncate text-[11px] font-bold text-slate-700">
                      {activeLayerObject?.title ??
                        "Belum ada layer aktif"}
                    </span>

                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-bold text-blue-600">
                      {Number(
                        activeFeatureCount,
                      ).toLocaleString("id-ID")}{" "}
                      Fitur
                    </span>

                    <div className="flex-1" />

                    <div className="relative">
                      <Search
                        size={13}
                        className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
                      />

                      <input
                        value={filterText}
                        onChange={(event) =>
                          setFilterText(
                            event.target.value,
                          )
                        }
                        placeholder="Filter data..."
                        className="h-7 w-36 rounded-md border border-slate-200 pl-7 pr-2 text-[10px] outline-none focus:border-emerald-400"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setFilterText("")
                      }
                      className="flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      <Filter size={12} />
                      Reset
                    </button>

                    <div className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setShowColumnMenu(
                            (previous) =>
                              !previous,
                          )
                        }
                        className="flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        <Columns3 size={12} />
                        Column
                      </button>

                      {showColumnMenu && (
                        <div className="absolute right-0 top-9 z-[100] w-40 rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
                          {(
                            [
                              [
                                "wilayah",
                                "Wilayah",
                              ],
                              [
                                "risiko",
                                "Risiko",
                              ],
                              ["luas", "Luas"],
                              [
                                "provinsi",
                                "Provinsi",
                              ],
                              [
                                "sumber",
                                "Sumber Data",
                              ],
                              [
                                "update",
                                "Tgl Update",
                              ],
                            ] as const
                          ).map(
                            ([key, label]) => (
                              <label
                                key={key}
                                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[10px] text-slate-600 hover:bg-slate-50"
                              >
                                <input
                                  type="checkbox"
                                  checked={
                                    columnVisibility[
                                      key
                                    ]
                                  }
                                  onChange={() =>
                                    toggleColumn(
                                      key,
                                    )
                                  }
                                  className="accent-emerald-600"
                                />

                                {label}
                              </label>
                            ),
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={exportCsv}
                      disabled={
                        !filteredAttributes.length
                      }
                      className="flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <Download size={12} />
                      CSV
                    </button>
                  </div>

                  {/* TABLE */}

                  <div className="max-h-[390px] overflow-auto">
                    <table className="w-full min-w-[760px] border-collapse">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-slate-50">
                          <th className="px-3 py-2 text-left text-[9px] font-bold uppercase text-slate-500">
                            ID
                          </th>

                          {columnVisibility.wilayah && (
                            <th className="px-3 py-2 text-left text-[9px] font-bold uppercase text-slate-500">
                              Wilayah
                            </th>
                          )}

                          {columnVisibility.risiko && (
                            <th className="px-3 py-2 text-left text-[9px] font-bold uppercase text-slate-500">
                              Kelas Risiko
                            </th>
                          )}

                          {columnVisibility.luas && (
                            <th className="px-3 py-2 text-left text-[9px] font-bold uppercase text-slate-500">
                              Luas / Nilai
                            </th>
                          )}

                          {columnVisibility.provinsi && (
                            <th className="px-3 py-2 text-left text-[9px] font-bold uppercase text-slate-500">
                              Provinsi
                            </th>
                          )}

                          {columnVisibility.sumber && (
                            <th className="px-3 py-2 text-left text-[9px] font-bold uppercase text-slate-500">
                              Sumber Data
                            </th>
                          )}

                          {columnVisibility.update && (
                            <th className="px-3 py-2 text-left text-[9px] font-bold uppercase text-slate-500">
                              Tgl Update
                            </th>
                          )}
                        </tr>
                      </thead>

                      <tbody>
                        {filteredAttributes.map(
                          (row) => (
                            <tr
                              key={row.id}
                              className="border-t border-slate-100 transition hover:bg-emerald-50/40"
                            >
                              <td className="px-3 py-2 text-[10px] text-slate-500">
                                {row.id}
                              </td>

                              {columnVisibility.wilayah && (
                                <td className="px-3 py-2 text-[10px] font-semibold text-slate-700">
                                  {row.wilayah}
                                </td>
                              )}

                              {columnVisibility.risiko && (
                                <td className="px-3 py-2">
                                  <RiskBadge
                                    risk={
                                      row.risiko
                                    }
                                  />
                                </td>
                              )}

                              {columnVisibility.luas && (
                                <td className="px-3 py-2 text-[10px] text-slate-600">
                                  {row.luas}
                                </td>
                              )}

                              {columnVisibility.provinsi && (
                                <td className="px-3 py-2 text-[10px] text-slate-600">
                                  {row.provinsi}
                                </td>
                              )}

                              {columnVisibility.sumber && (
                                <td className="px-3 py-2 text-[10px] text-slate-600">
                                  {row.sumber}
                                </td>
                              )}

                              {columnVisibility.update && (
                                <td className="px-3 py-2 text-[10px] text-slate-500">
                                  {row.update}
                                </td>
                              )}
                            </tr>
                          ),
                        )}

                        {!filteredAttributes.length && (
                          <tr>
                            <td
                              colSpan={
                                1 +
                                Object.values(
                                  columnVisibility,
                                ).filter(
                                  Boolean,
                                ).length
                              }
                              className="px-4 py-10 text-center"
                            >
                              <Table2
                                size={24}
                                className="mx-auto mb-2 text-slate-300"
                              />

                              <div className="text-[10px] font-semibold text-slate-500">
                                Belum ada attribute
                                data
                              </div>

                              <div className="mt-1 text-[9px] text-slate-400">
                                Aktifkan layer dan pastikan
                                endpoint data mengembalikan
                                GeoJSON.
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* OVERLAY TAB */}

              {activeTab === "overlay" && (
                <div className="p-4">
                  <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 p-5">
                    <div className="mb-2 flex items-center gap-2">
                      <GitMerge
                        size={18}
                        className="text-emerald-600"
                      />

                      <h3 className="text-[12px] font-bold text-slate-700">
                        Overlay Analysis
                      </h3>
                    </div>

                    <p className="max-w-xl text-[10px] leading-5 text-slate-500">
                      Mode workspace overlay disiapkan
                      untuk analisis antar-layer. Layer yang
                      aktif dan data GeoJSON dari API menjadi
                      sumber analisis.
                    </p>

                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <StatusCard
                        value={String(
                          activeLayerCount,
                        )}
                        label="Layer Aktif"
                        icon={Layers3}
                      />

                      <StatusCard
                        value={String(
                          activeFeatureCount,
                        )}
                        label="Fitur Aktif"
                        icon={Activity}
                      />

                      <StatusCard
                        value={
                          overlayEnabled
                            ? "ON"
                            : "OFF"
                        }
                        label="Overlay Mode"
                        icon={GitMerge}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* HISTORY TAB */}

              {activeTab === "history" && (
                <div className="p-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                    <div className="mb-2 flex items-center gap-2">
                      <Clock3
                        size={18}
                        className="text-slate-500"
                      />

                      <h3 className="text-[12px] font-bold text-slate-700">
                        Riwayat Workspace
                      </h3>
                    </div>

                    <p className="text-[10px] leading-5 text-slate-500">
                      Workspace tersimpan belum terhubung ke
                      endpoint persistence. Tampilan ini tidak
                      membuat data dummy.
                    </p>
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* ==================================================
              RIGHT - INFO
          ================================================== */}

          <div className="space-y-3">
            {/* ACTIVE LAYER INFO */}

            {showInfo ? (
              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-3">
                  <h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-700">
                    Informasi Layer
                  </h2>

                  <button
                    type="button"
                    onClick={() =>
                      setShowInfo(false)
                    }
                    className="text-slate-400 hover:text-slate-700"
                    title="Sembunyikan informasi"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="p-3">
                  {activeLayerObject ? (
                    <>
                      <div className="mb-3 flex items-start gap-3 rounded-lg bg-slate-50 p-3">
                        <div
                          className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg text-white"
                          style={{
                            backgroundColor:
                              activeLayerObject.color ||
                              defaultLayerColor(
                                activeLayerObject,
                              ),
                          }}
                        >
                          {React.createElement(
                            normalizeIcon(
                              typeof activeLayerObject.icon ===
                                "string"
                                ? activeLayerObject.icon
                                : undefined,
                            ),
                            { size: 17 },
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] font-bold text-slate-800">
                            {
                              activeLayerObject.title
                            }
                          </div>

                          <div className="mt-0.5 text-[9px] text-slate-400">
                            ID:{" "}
                            {
                              activeLayerObject.id
                            }
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <InfoRow
                          label="Kategori"
                          value={
                            activeLayerObject.category ||
                            "-"
                          }
                        />

                        <InfoRow
                          label="Tabel"
                          value={
                            activeLayerObject.tableName ||
                            activeLayerObject.table ||
                            activeLayerObject.id ||
                            "-"
                          }
                        />

                        <InfoRow
                          label="Schema"
                          value={
                            activeLayerObject.schema ||
                            "public"
                          }
                        />

                        <InfoRow
                          label="Feature Count"
                          value={Number(
                            activeLayerObject.featureCount ??
                              activeGeoJson?.features
                                ?.length ??
                              0,
                          ).toLocaleString(
                            "id-ID",
                          )}
                        />

                        <InfoRow
                          label="Source"
                          value={
                            activeLayerObject.sourceType ||
                            "table"
                          }
                        />

                        <InfoRow
                          label="Update"
                          value={formatDate(
                            activeLayerObject.updatedAt,
                          )}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="py-7 text-center">
                      <Info
                        size={22}
                        className="mx-auto mb-2 text-slate-300"
                      />

                      <div className="text-[10px] font-semibold text-slate-500">
                        Belum ada layer aktif
                      </div>
                    </div>
                  )}
                </div>
              </section>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setShowInfo(true)
                }
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-700"
              >
                <Info size={14} />
                Tampilkan Informasi Layer
              </button>
            )}

            {/* WORKSPACE */}

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-3">
                <h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-700">
                  Workspace
                </h2>

                <button
                  type="button"
                  className="text-[10px] font-semibold text-emerald-600 hover:text-emerald-700"
                >
                  Lihat Semua
                </button>
              </div>

              <div className="p-3">
                <div className="mb-3 rounded-lg bg-slate-50 p-3">
                  <div className="mb-1 text-[9px] font-semibold text-slate-400">
                    Workspace Saat Ini
                  </div>

                  <input
                    value={workspaceName}
                    onChange={(event) =>
                      setWorkspaceName(
                        event.target.value,
                      )
                    }
                    className="w-full bg-transparent text-[11px] font-bold text-slate-700 outline-none"
                  />

                  <div className="mt-1 text-[9px] text-slate-400">
                    Catalog:{" "}
                    {catalogStats?.totalLayers ??
                      0}{" "}
                    layer
                  </div>
                </div>

                <button
                  type="button"
                  className="flex h-8 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-[10px] font-bold text-white shadow-sm transition hover:bg-emerald-700"
                >
                  <Save size={13} />
                  Simpan Workspace
                </button>

                <div className="mt-4">
                  <div className="mb-2 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                    Layer Tersedia
                  </div>

                  <div className="space-y-1.5">
                    {apiLayers
                      .slice(0, 5)
                      .map((layer) => (
                        <WorkspaceItem
                          key={layer.id}
                          title={layer.title}
                          active={
                            String(
                              layer.id,
                            ) ===
                            String(activeLayer)
                          }
                          onClick={() =>
                            selectLayer(
                              String(layer.id),
                            )
                          }
                        />
                      ))}

                    {!apiLayers.length && (
                      <div className="rounded-lg border border-dashed border-slate-200 px-2.5 py-3 text-[10px] text-slate-400">
                        Belum ada layer tersedia
                        dari database.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* QUICK STATUS */}

            <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Layer Status
                </span>

                <RefreshCw
                  size={13}
                  className="text-slate-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <StatusCard
                  value={String(
                    activeLayerCount,
                  )}
                  label="Layer Aktif"
                  icon={Eye}
                />

                <StatusCard
                  value={String(
                    catalogStats?.totalLayers ??
                      apiLayers.length,
                  )}
                  label="Total Layer"
                  icon={Layers3}
                />

                <StatusCard
                  value={Number(
                    activeFeatureCount,
                  ).toLocaleString("id-ID")}
                  label="Fitur Aktif"
                  icon={Activity}
                />

                <StatusCard
                  value={
                    loadingLayers ||
                    loadingGeoJson
                      ? "..."
                      : apiError
                        ? "ERROR"
                        : "OK"
                  }
                  label="Data Health"
                  icon={ShieldAlert}
                />
              </div>
            </section>

            {/* API ENDPOINT STATUS */}

            <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Database
                  size={14}
                  className="text-emerald-600"
                />

                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  API Endpoint
                </span>
              </div>

              <div className="space-y-2">
                <EndpointRow
                  label="Catalog"
                  value="/api/layer-overlay/catalog"
                  ok={!loadingLayers && !apiError}
                />

                <EndpointRow
                  label="Layer Data"
                  value={
                    activeLayer
                      ? `/api/layer-overlay/data/${activeLayer}`
                      : "/api/layer-overlay/data/:layerId"
                  }
                  ok={
                    Boolean(
                      activeGeoJson ||
                        !activeLayer,
                    ) && !apiError
                  }
                />
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* ======================================================
          FEATURE STATUS FOOTER
      ====================================================== */}

      <div className="px-4 pb-5 lg:px-7">
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                apiError
                  ? "bg-red-500"
                  : "bg-emerald-500"
              }`}
            />

            <span className="text-[10px] font-semibold text-slate-600">
              SIMITI GIS Layer & Overlay
            </span>
          </div>

          <div className="hidden h-4 w-px bg-slate-200 sm:block" />

          <span className="text-[9px] text-slate-400">
            Catalog:
            {" "}
            {Number(
              catalogStats?.totalLayers ??
                apiLayers.length,
            ).toLocaleString("id-ID")}
            {" "}
            layer
          </span>

          <span className="text-[9px] text-slate-400">
            Total record:
            {" "}
            {Number(
              catalogStats?.totalFeatures ?? 0,
            ).toLocaleString("id-ID")}
          </span>

          <div className="flex-1" />

          <span className="text-[9px] text-slate-400">
            {overlayEnabled
              ? "Overlay mode ON"
              : "Overlay mode OFF"}
            {" • "}
            {spatialQueryEnabled
              ? "Spatial Query ON"
              : "Spatial Query OFF"}
            {" • "}
            {measureEnabled
              ? "Measure ON"
              : "Measure OFF"}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   INFO ROW
============================================================ */

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
      <span className="text-[9px] font-medium text-slate-400">
        {label}
      </span>

      <span className="max-w-[170px] truncate text-right text-[9px] font-semibold text-slate-600">
        {value}
      </span>
    </div>
  );
}

/* ============================================================
   ENDPOINT ROW
============================================================ */

function EndpointRow({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[9px] font-bold text-slate-600">
          {label}
        </span>

        <span
          className={`rounded-full px-1.5 py-0.5 text-[7px] font-bold ${
            ok
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {ok ? "READY" : "WAIT"}
        </span>
      </div>

      <div className="truncate font-mono text-[8px] text-slate-400">
        {value}
      </div>
    </div>
  );
}
