import React, { useEffect, useMemo, useState } from "react";
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
  Upload,
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
} from "lucide-react";

import "leaflet/dist/leaflet.css";

/* ============================================================
   TYPES
============================================================ */

type LayerCategory = {
  id: string;
  title: string;
  children: LayerItem[];
};

type LayerItem = {
  id: string;
  title: string;
  icon: React.ElementType;
  checked: boolean;
  color?: string;
  featureCount?: number;
  category: string;
};

type AttributeRow = {
  id: number;
  wilayah: string;
  risiko: RiskClass;
  luas: string;
  provinsi: string;
  sumber: string;
  update: string;
};

/* ============================================================
   REAL API TYPES
============================================================ */

type GeoJsonCollection = GeoJSON.FeatureCollection;

type ApiLayer = {
  id: string;
  title: string;
  category: string;
  icon?: string;
  color?: string;
  featureCount?: number;
  sourceType: "table" | "risk";
  riskCategory?: string | null;
  table?: string;
  updatedAt?: string;
};

type LayerApiResponse = {
  success: boolean;
  data: ApiLayer[];
  categories: LayerCategory[];
  generatedAt?: string;
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

const API_ROOT = String(import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "");
const API_BASE = API_ROOT === "/api" || API_ROOT.endsWith("/api") ? API_ROOT : `${API_ROOT}/api`;

const iconForLayer = (icon?: string): React.ElementType => {
  switch (icon) {
    case "banjir":
      return Waves;
    case "longsor":
      return Mountain;
    case "karhutla":
      return Flame;
    case "lingkungan":
      return Trees;
    default:
      return MapPinned;
  }
};

const normalizeLayerCategories = (categories: LayerCategory[], layers: ApiLayer[]) =>
  categories.map((category) => ({
    ...category,
    children: category.children.map((child) => {
      const apiLayer = layers.find((item) => item.id === child.id);
      return {
        ...child,
        icon: iconForLayer(apiLayer?.icon),
        checked: false,
        color: apiLayer?.color,
        featureCount: apiLayer?.featureCount,
      };
    }),
  }));

/* ============================================================
   MAP CONTROLLER
============================================================ */

function MapActions() {
  const map = useMap();

  const locateUser = () => {
    map.locate({
      setView: true,
      maxZoom: 10,
    });
  };

  const fullscreen = () => {
    const container = map.getContainer();

    if (!document.fullscreenElement) {
      container.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  return (
    <>
      <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-2">
        <button
          onClick={fullscreen}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-lg transition hover:bg-slate-50"
          title="Fullscreen"
        >
          <Maximize size={17} />
        </button>

        <button
          onClick={locateUser}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-lg transition hover:bg-slate-50"
          title="Lokasi saya"
        >
          <Crosshair size={17} />
        </button>
      </div>
    </>
  );
}

/* ============================================================
   COMPONENT
============================================================ */

export default function LayerOverlay() {
  const [layers, setLayers] = useState<LayerCategory[]>([]);
  const [apiLayers, setApiLayers] = useState<ApiLayer[]>([]);
  const [geoJsonByLayer, setGeoJsonByLayer] = useState<Record<string, GeoJsonCollection>>({});
  const [activeLayer, setActiveLayer] = useState("");
  const [loadingLayers, setLoadingLayers] = useState(true);
  const [loadingGeoJson, setLoadingGeoJson] = useState(false);
  const [apiError, setApiError] = useState("");

  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  const [basemap, setBasemap] = useState<"map" | "satellite">("map");

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

  const [workspaceName, setWorkspaceName] = useState("");

  /* ==========================================================
     LOAD REAL LAYER CATALOG
  ========================================================== */

  useEffect(() => {
    let cancelled = false;

    const loadCatalog = async () => {
      setLoadingLayers(true);
      setApiError("");

      try {
        const response = await fetch(`${API_BASE}/layer-overlay/catalog`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const payload = (await response.json()) as LayerApiResponse;
        if (!payload.success) throw new Error("Backend tidak mengembalikan katalog layer.");
        if (cancelled) return;

        setApiLayers(payload.data ?? []);
        setLayers(normalizeLayerCategories(payload.categories ?? [], payload.data ?? []));

        const firstLayer = payload.data?.[0]?.id ?? "";
        setActiveLayer(firstLayer);
        setOpenCategories(
          (payload.categories ?? []).reduce<Record<string, boolean>>((acc, category) => {
            acc[category.id] = true;
            return acc;
          }, {}),
        );
      } catch (error) {
        if (!cancelled) setApiError(error instanceof Error ? error.message : "Gagal memuat layer.");
      } finally {
        if (!cancelled) setLoadingLayers(false);
      }
    };

    void loadCatalog();
    return () => { cancelled = true; };
  }, []);

  /* ==========================================================
     LOAD REAL GEOJSON WHEN A LAYER IS ENABLED
  ========================================================== */

  const loadLayerGeoJson = async (layerId: string) => {
    setLoadingGeoJson(true);
    setApiError("");

    try {
      const response = await fetch(`${API_BASE}/layer-overlay/data/${encodeURIComponent(layerId)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload = await response.json();
      if (!payload.success) throw new Error(payload.error || "Gagal memuat GeoJSON layer.");

      setGeoJsonByLayer((previous) => ({ ...previous, [layerId]: payload.data }));
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Gagal memuat data spasial.");
    } finally {
      setLoadingGeoJson(false);
    }
  };

  /* ==========================================================
     TOGGLE LAYER
  ========================================================== */

  const toggleLayer = (layerId: string) => {
    let willEnable = false;

    setLayers((previous) =>
      previous.map((category) => ({
        ...category,
        children: category.children.map((layer) => {
          if (layer.id !== layerId) return layer;
          willEnable = !layer.checked;
          return { ...layer, checked: !layer.checked };
        }),
      })),
    );

    if (willEnable && !geoJsonByLayer[layerId]) void loadLayerGeoJson(layerId);
  };

  /* ==========================================================
     FILTER LAYERS
  ========================================================== */

  const filteredCategories = useMemo(() => {
    if (!searchLayer.trim()) {
      return layers;
    }

    const keyword = searchLayer.toLowerCase();

    return layers
      .map((category) => ({
        ...category,
        children: category.children.filter((layer) =>
          layer.title.toLowerCase().includes(keyword),
        ),
      }))
      .filter((category) => category.children.length > 0);
  }, [layers, searchLayer]);

  /* ==========================================================
     ACTIVE LAYER
  ========================================================== */

  const activeLayerObject = useMemo(() => {
    for (const category of layers) {
      const found = category.children.find((layer) => layer.id === activeLayer);

      if (found) return found;
    }

    return undefined;
  }, [layers, activeLayer]);

  /* ==========================================================
     GEOJSON EVENTS
  ========================================================== */

  const onEachFeature = (feature: GeoJSON.Feature, layer: LeafletLayer) => {
    if ("bindPopup" in layer) {
      const name = feature.properties?._layer_name ?? feature.properties?.name ?? feature.properties?.provinsi ?? feature.properties?.kab_kota ?? feature.properties?.kecamatan ?? feature.properties?.kel_desa ?? "Wilayah";
      const risk = feature.properties?.tingkat ?? feature.properties?.risk ?? "-";

      layer.bindPopup(`
        <div style="min-width:180px">
          <strong>${name}</strong>
          <br/>
          <span>Risiko: <b>${risk}</b></span>
        </div>
      `);
    }
  };

  /* ==========================================================
     FILTER ATTRIBUTE
  ========================================================== */

  const activeGeoJson = geoJsonByLayer[activeLayer];

  const filteredAttributes = useMemo<AttributeRow[]>(() => {
    const features = activeGeoJson?.features ?? [];

    return features
      .map((feature, index) => {
        const props = feature.properties ?? {};
        const luasValue = props.luas ?? props.luas_total ?? props.shape_area ?? props.area ?? "-";
        const dateValue = props.updated_at ?? props.tanggal_update ?? props.tahun_data ?? "-";
        const wilayahValue = props._layer_name ?? props.nama ?? props.name ?? props.provinsi ?? props.kab_kota ?? props.kecamatan ?? props.kel_desa ?? "-";
        const risikoValue = props.tingkat ?? props.risk ?? props.kerawanan ?? "-";
        const provinsiValue = props.provinsi ?? props.wil_kerja ?? "-";
        const sumberValue = props.sumber ?? props.source ?? activeLayerObject?.table ?? "-";

        return {
          id: Number(feature.id ?? index),
          wilayah: String(wilayahValue),
          risiko: String(risikoValue),
          luas: typeof luasValue === "number" ? luasValue.toLocaleString("id-ID") : String(luasValue),
          provinsi: String(provinsiValue),
          sumber: String(sumberValue),
          update: String(dateValue),
        };
      })
      .filter((row) => {
        const value = filterText.toLowerCase().trim();
        if (!value) return true;
        return [row.wilayah, row.risiko, row.provinsi, row.sumber]
          .some((item) => item.toLowerCase().includes(value));
      });
  }, [activeGeoJson, activeLayerObject, filterText]);

  /* ==========================================================
     RENDER
  ========================================================== */

  return (
    <div className="min-h-screen bg-[#f4f7f9] text-slate-800">
      {/* ======================================================
          PAGE HEADER
      ====================================================== */}

      <div className="border-b border-slate-200 bg-white">
        <div className="px-5 py-4 lg:px-7">
          {/* BREADCRUMB */}

          <div className="mb-3 flex items-center gap-2 text-[12px] font-medium text-slate-400">
            <span className="text-emerald-600">Home</span>
            <ChevronRight size={13} />
            <span className="text-emerald-600">WebGIS & Data Spasial</span>
            <ChevronRight size={13} />
            <span className="font-semibold text-slate-700">
              Layer & Overlay
            </span>
          </div>

          {/* TITLE */}

          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <h1 className="text-[24px] font-bold tracking-tight text-slate-900">
                Layer & Overlay
              </h1>

              <p className="mt-1 text-[13px] text-slate-500">
                Kelola layer, overlay dan analisis data spasial
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-400" />
              <span className="text-[11px] font-semibold text-emerald-700">
                {loadingLayers ? "Memuat Data..." : apiError ? "API Bermasalah" : "Data Real-Time"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {apiError && (
        <div className="mx-5 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-medium text-red-700 lg:mx-7">
          Gagal mengambil data spasial: {apiError}
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
              onClick={() => setShowBasemapMenu(!showBasemapMenu)}
              className="
                flex
                h-9
                items-center
                gap-2
                rounded-lg
                border
                border-slate-200
                bg-white
                px-3
                text-[12px]
                font-semibold
                text-slate-700
                shadow-sm
                transition
                hover:border-slate-300
                hover:bg-slate-50
              "
            >
              <MapIcon size={15} />
              Basemap
              <ChevronDown size={14} />
            </button>

            {showBasemapMenu && (
              <div className="absolute left-0 top-11 z-[2000] w-40 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                <button
                  onClick={() => {
                    setBasemap("map");
                    setShowBasemapMenu(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs ${
                    basemap === "map"
                      ? "bg-emerald-50 font-semibold text-emerald-700"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Peta
                  {basemap === "map" && <Check size={14} />}
                </button>

                <button
                  onClick={() => {
                    setBasemap("satellite");
                    setShowBasemapMenu(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs ${
                    basemap === "satellite"
                      ? "bg-emerald-50 font-semibold text-emerald-700"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Satelit
                  {basemap === "satellite" && <Check size={14} />}
                </button>
              </div>
            )}
          </div>

          {/* UPLOAD */}

          <button
            className="
              flex
              h-9
              items-center
              gap-2
              rounded-lg
              border
              border-slate-200
              bg-white
              px-3
              text-[12px]
              font-semibold
              text-slate-700
              shadow-sm
              transition
              hover:border-slate-300
              hover:bg-slate-50
            "
          >
            <Upload size={15} />
            Upload Data
          </button>

          {/* OVERLAY */}

          <button
            className="
              flex
              h-9
              items-center
              gap-2
              rounded-lg
              border
              border-emerald-200
              bg-emerald-50
              px-3
              text-[12px]
              font-bold
              text-emerald-700
              shadow-sm
              transition
              hover:bg-emerald-100
            "
          >
            <GitMerge size={15} />
            Overlay Analysis
          </button>

          {/* SPATIAL QUERY */}

          <button
            className="
              flex
              h-9
              items-center
              gap-2
              rounded-lg
              border
              border-slate-200
              bg-white
              px-3
              text-[12px]
              font-semibold
              text-slate-700
              shadow-sm
              transition
              hover:bg-slate-50
            "
          >
            <Search size={15} />
            Spatial Query
          </button>

          {/* MEASURE */}

          <button
            className="
              flex
              h-9
              items-center
              gap-2
              rounded-lg
              border
              border-slate-200
              bg-white
              px-3
              text-[12px]
              font-semibold
              text-slate-700
              shadow-sm
              transition
              hover:bg-slate-50
            "
          >
            <Ruler size={15} />
            Measure
          </button>

          {/* EXPORT */}

          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="
                flex
                h-9
                items-center
                gap-2
                rounded-lg
                border
                border-slate-200
                bg-white
                px-3
                text-[12px]
                font-semibold
                text-slate-700
                shadow-sm
                transition
                hover:bg-slate-50
              "
            >
              <Download size={15} />
              Export Peta
              <ChevronDown size={14} />
            </button>

            {showExportMenu && (
              <div className="absolute left-0 top-11 z-[2000] w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-600 hover:bg-slate-50">
                  <FileJson size={14} />
                  Export GeoJSON
                </button>

                <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-600 hover:bg-slate-50">
                  <FileSpreadsheet size={14} />
                  Export CSV
                </button>

                <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-600 hover:bg-slate-50">
                  <MapIcon size={14} />
                  Export PNG
                </button>
              </div>
            )}
          </div>

          <div className="flex-1" />

          {/* SAVE WORKSPACE */}

          <button
            className="
              flex
              h-9
              items-center
              gap-2
              rounded-lg
              bg-emerald-600
              px-4
              text-[12px]
              font-bold
              text-white
              shadow-sm
              shadow-emerald-600/20
              transition
              hover:bg-emerald-700
            "
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

                <button className="text-slate-400 hover:text-slate-700">
                  <Settings2 size={15} />
                </button>
              </div>

              {/* SEARCH */}

              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  value={searchLayer}
                  onChange={(e) => setSearchLayer(e.target.value)}
                  placeholder="Cari layer..."
                  className="
                    h-8
                    w-full
                    rounded-lg
                    border
                    border-slate-200
                    bg-slate-50
                    pl-8
                    pr-8
                    text-[11px]
                    outline-none
                    transition
                    focus:border-emerald-400
                    focus:bg-white
                    focus:ring-2
                    focus:ring-emerald-100
                  "
                />

                <button className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
                  <Filter size={13} />
                </button>
              </div>
            </div>

            {/* LAYERS */}

            <div className="max-h-[550px] overflow-y-auto px-2 py-2">
              {filteredCategories.map((category) => {
                const categoryOpen = openCategories[category.id];

                return (
                  <div key={category.id} className="mb-2">
                    <button
                      onClick={() =>
                        setOpenCategories((prev) => ({
                          ...prev,
                          [category.id]: !prev[category.id],
                        }))
                      }
                      className="
                        flex
                        w-full
                        items-center
                        gap-1.5
                        px-1.5
                        py-1.5
                        text-left
                        text-[10px]
                        font-bold
                        tracking-wide
                        text-slate-700
                        hover:text-emerald-700
                      "
                    >
                      {categoryOpen ? (
                        <ChevronDown size={12} />
                      ) : (
                        <ChevronRight size={12} />
                      )}

                      {category.title}
                    </button>

                    {categoryOpen && (
                      <div className="space-y-0.5">
                        {category.children.map((layer) => {
                          const Icon = layer.icon;
                          const active = activeLayer === layer.id;

                          return (
                            <div
                              key={layer.id}
                              onClick={() => setActiveLayer(layer.id)}
                              className={`
                                group
                                flex
                                min-h-[34px]
                                cursor-pointer
                                items-center
                                gap-2
                                rounded-lg
                                px-1.5
                                transition
                                ${
                                  active ? "bg-emerald-50" : "hover:bg-slate-50"
                                }
                              `}
                            >
                              {/* CHECK */}

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleLayer(layer.id);
                                }}
                                className={`
                                  flex
                                  h-4
                                  w-4
                                  shrink-0
                                  items-center
                                  justify-center
                                  rounded
                                  border
                                  transition
                                  ${
                                    layer.checked
                                      ? "border-emerald-500 bg-emerald-500 text-white"
                                      : "border-slate-300 bg-white"
                                  }
                                `}
                              >
                                {layer.checked && <Check size={11} />}
                              </button>

                              {/* ICON */}

                              <Icon
                                size={13}
                                className={
                                  active ? "text-emerald-600" : "text-slate-500"
                                }
                              />

                              {/* LABEL */}

                              <span
                                className={`
                                  min-w-0
                                  flex-1
                                  truncate
                                  text-[11px]
                                  ${
                                    active
                                      ? "font-semibold text-emerald-700"
                                      : "text-slate-600"
                                  }
                                `}
                              >
                                {layer.title}
                              </span>

                              {/* FEATURE COUNT */}

                              {layer.featureCount && (
                                <span className="rounded bg-slate-100 px-1 text-[8px] font-semibold text-slate-400">
                                  {layer.featureCount}
                                </span>
                              )}

                              <MoreVertical
                                size={13}
                                className="text-slate-300 opacity-0 transition group-hover:opacity-100"
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ADD LAYER */}

            <div className="border-t border-slate-100 p-2.5">
              <button
                className="
                  flex
                  h-8
                  w-full
                  items-center
                  justify-center
                  gap-1.5
                  rounded-lg
                  border
                  border-emerald-300
                  bg-white
                  text-[11px]
                  font-bold
                  text-emerald-600
                  transition
                  hover:bg-emerald-50
                "
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
                center={[0.5, 110.8]}
                zoom={6}
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

                {layers.flatMap((category) => category.children).filter((layer) => layer.checked).map((layer) => {
                  const data = geoJsonByLayer[layer.id];
                  if (!data) return null;
                  return (
                    <GeoJSON
                      key={`${layer.id}-${opacity}`}
                      data={data as any}
                      style={(feature) => {
                        const currentColor = layer.color || "#059669";
                        const tingkat = String(feature?.properties?.tingkat ?? "").toLowerCase();
                        const color = tingkat.includes("tinggi") ? "#dc2626" : tingkat.includes("sedang") || tingkat.includes("menengah") ? "#f59e0b" : tingkat.includes("rendah") ? "#10b981" : currentColor;
                        return { color, weight: 1.5, fillColor: color, fillOpacity: opacity / 100 };
                      }}
                      onEachFeature={onEachFeature}
                    />
                  );
                })}

                <ZoomControl position="bottomright" />

                <MapActions />
              </MapContainer>

              {/* MAP TYPE */}

              <div className="absolute left-3 top-3 z-[1000] flex overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                <button
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
                  onClick={() => setBasemap("satellite")}
                  className={`px-3 py-2 text-[11px] font-semibold ${
                    basemap === "satellite"
                      ? "bg-white text-slate-800"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  Satelit
                </button>
              </div>

              {/* MAP LEGEND */}

              <div className="absolute bottom-3 left-3 z-[1000] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
                <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                  Kelas Risiko
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <LegendItem color="#dc2626" label="Tinggi" />
                  <LegendItem color="#f59e0b" label="Sedang" />
                  <LegendItem color="#10b981" label="Rendah" />
                  {activeLayerObject?.color && (
                    <LegendItem color={activeLayerObject.color} label={activeLayerObject.title} />
                  )}
                </div>
              </div>

              {/* SCALE */}

              <div className="absolute bottom-3 right-16 z-[900] rounded bg-white/80 px-2 py-1 text-[9px] font-semibold text-slate-600">
                0 &nbsp;&nbsp; 50 &nbsp;&nbsp; 100 &nbsp;&nbsp; 150 km
              </div>
            </section>

            {/* =================================================
                ATTRIBUTE TABLE
            ================================================= */}

            <section className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {/* TABS */}

              <div className="flex items-center border-b border-slate-100 px-3">
                <TableTab
                  active={activeTab === "attributes"}
                  onClick={() => setActiveTab("attributes")}
                  icon={Table2}
                >
                  ATTRIBUTE TABLE
                </TableTab>

                <TableTab
                  active={activeTab === "overlay"}
                  onClick={() => setActiveTab("overlay")}
                  icon={GitMerge}
                >
                  HASIL OVERLAY ANALYSIS
                </TableTab>

                <TableTab
                  active={activeTab === "history"}
                  onClick={() => setActiveTab("history")}
                  icon={Clock3}
                >
                  RIWAYAT
                </TableTab>
              </div>

              {/* TAB CONTENT */}

              {activeTab === "attributes" && (
                <>
                  {/* TABLE TOOLBAR */}

                  <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
                    <span className="text-[10px] text-slate-500">
                      Layer Aktif:
                    </span>

                    <span className="text-[11px] font-bold text-slate-700">
                      {activeLayerObject?.title ?? "Belum ada layer aktif"}
                    </span>

                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-bold text-blue-600">
                      {activeLayerObject?.featureCount ?? 0} Fitur
                    </span>

                    <div className="flex-1" />

                    <div className="relative">
                      <Search
                        size={13}
                        className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
                      />

                      <input
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        placeholder="Filter data..."
                        className="h-7 w-32 rounded-md border border-slate-200 pl-7 pr-2 text-[10px] outline-none focus:border-emerald-400"
                      />
                    </div>

                    <button className="flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-50">
                      <Filter size={12} />
                      Filter
                    </button>

                    <div className="relative">
                      <button
                        onClick={() => setShowColumnMenu(!showColumnMenu)}
                        className="flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        <Columns3 size={12} />
                        Column
                      </button>

                      {showColumnMenu && (
                        <div className="absolute right-0 top-9 z-[100] w-36 rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
                          {[
                            "Wilayah",
                            "Risiko",
                            "Luas",
                            "Provinsi",
                            "Sumber Data",
                            "Tgl Update",
                          ].map((column) => (
                            <label
                              key={column}
                              className="flex items-center gap-2 rounded px-2 py-1.5 text-[10px] hover:bg-slate-50"
                            >
                              <input
                                type="checkbox"
                                defaultChecked
                                className="accent-emerald-600"
                              />
                              {column}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    <button className="flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-50">
                      <Download size={12} />
                      Export CSV
                    </button>

                    <button className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50">
                      <MoreVertical size={13} />
                    </button>
                  </div>

                  {/* TABLE */}

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] border-collapse">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="px-3 py-2 text-left text-[9px] font-bold uppercase text-slate-500">
                            ID
                          </th>

                          <th className="px-3 py-2 text-left text-[9px] font-bold uppercase text-slate-500">
                            Wilayah
                          </th>

                          <th className="px-3 py-2 text-left text-[9px] font-bold uppercase text-slate-500">
                            Kelas Risiko
                          </th>

                          <th className="px-3 py-2 text-left text-[9px] font-bold uppercase text-slate-500">
                            Luas (Ha)
                          </th>

                          <th className="px-3 py-2 text-left text-[9px] font-bold uppercase text-slate-500">
                            Provinsi
                          </th>

                          <th className="px-3 py-2 text-left text-[9px] font-bold uppercase text-slate-500">
                            Sumber Data
                          </th>

                          <th className="px-3 py-2 text-left text-[9px] font-bold uppercase text-slate-500">
                            Tgl Update
                          </th>

                          <th />
                        </tr>
                      </thead>

                      <tbody>
                        {filteredAttributes.map((row) => (
                          <tr
                            key={row.id}
                            className="border-t border-slate-100 transition hover:bg-emerald-50/40"
                          >
                            <td className="px-3 py-2 text-[10px] text-slate-500">
                              {row.id}
                            </td>

                            <td className="px-3 py-2 text-[10px] font-semibold text-slate-700">
                              {row.wilayah}
                            </td>

                            <td className="px-3 py-2">
                              <RiskBadge risk={row.risiko} />
                            </td>

                            <td className="px-3 py-2 text-[10px] text-slate-600">
                              {row.luas}
                            </td>

                            <td className="px-3 py-2 text-[10px] text-slate-600">
                              {row.provinsi}
                            </td>

                            <td className="px-3 py-2 text-[10px] text-slate-500">
                              {row.sumber}
                            </td>

                            <td className="px-3 py-2 text-[10px] text-slate-500">
                              {row.update}
                            </td>

                            <td className="px-2">
                              <button className="text-slate-400 hover:text-slate-700">
                                <MoreVertical size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* PAGINATION */}

                  <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2.5">
                    <span className="text-[9px] text-slate-400">
                      Menampilkan {filteredAttributes.length} dari 635 fitur
                    </span>

                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-slate-500">
                        Rows per page:
                      </span>

                      <select className="h-6 rounded border border-slate-200 bg-white px-1 text-[9px]">
                        <option>10</option>
                        <option>25</option>
                        <option>50</option>
                        <option>100</option>
                      </select>

                      <span className="text-[9px] text-slate-500">
                        1–10 of 635
                      </span>

                      <button className="px-1 text-slate-400 hover:text-slate-700">
                        ‹
                      </button>

                      <button className="px-1 text-slate-400 hover:text-slate-700">
                        ›
                      </button>
                    </div>
                  </div>
                </>
              )}

              {activeTab === "overlay" && (
                <div className="p-6">
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-5">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-emerald-500 p-2 text-white">
                        <GitMerge size={18} />
                      </div>

                      <div>
                        <h3 className="text-sm font-bold text-emerald-900">
                          Overlay Analysis
                        </h3>

                        <p className="mt-1 text-xs text-emerald-700">
                          Hasil analisis overlay antar layer spasial akan
                          ditampilkan di area ini.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "history" && (
                <div className="p-6">
                  <div className="space-y-3">
                    {[
                      "Analisis Risiko Banjir 2025",
                      "Overlay DAS + Risiko Banjir",
                      "Update Layer Administrasi",
                    ].map((history, index) => (
                      <div
                        key={history}
                        className="flex items-center gap-3 rounded-lg border border-slate-100 p-3"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                          <Clock3 size={15} className="text-slate-500" />
                        </div>

                        <div className="flex-1">
                          <div className="text-xs font-semibold text-slate-700">
                            {history}
                          </div>

                          <div className="mt-0.5 text-[9px] text-slate-400">
                            {index + 1} hari yang lalu · Operator
                          </div>
                        </div>

                        <button className="text-slate-400">
                          <MoreVertical size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* ==================================================
              RIGHT - LAYER INFORMATION
          ================================================== */}

          <div className="space-y-3">
            {/* LAYER INFO */}

            {showInfo && (
              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                      <Layers3 size={17} />
                    </div>

                    <div>
                      <div className="text-[12px] font-bold text-slate-800">
                        {activeLayerObject?.title ?? "Belum ada layer aktif"}
                      </div>

                      <div className="mt-0.5 text-[9px] font-medium text-emerald-600">
                        Aktif
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowInfo(false)}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* INFO TABS */}

                <div className="flex border-b border-slate-100 px-2">
                  <button className="border-b-2 border-emerald-500 px-2.5 py-2 text-[10px] font-bold text-emerald-600">
                    Informasi
                  </button>

                  <button className="px-2.5 py-2 text-[10px] font-medium text-slate-400 hover:text-slate-700">
                    Simbologi
                  </button>

                  <button className="px-2.5 py-2 text-[10px] font-medium text-slate-400 hover:text-slate-700">
                    Metadata
                  </button>
                </div>

                {/* INFO BODY */}

                <div className="space-y-3 p-3">
                  <InfoItem
                    title="Deskripsi"
                    value={activeLayerObject ? `Layer ${activeLayerObject.title} yang tersedia pada database SIMITI.` : "Belum ada layer aktif."}
                  />

                  <InfoItem
                    title="Sumber Data"
                    value={activeLayerObject?.table ?? "-"}
                  />

                  <InfoItem title="Tipe Data" value="Vector - Polygon" />

                  <InfoItem title="Tanggal Pembaruan" value={activeLayerObject?.updatedAt ? new Date(activeLayerObject.updatedAt).toLocaleString("id-ID") : "-"} />

                  <InfoItem
                    title="Skala Disarankan"
                    value="Mengikuti resolusi data sumber"
                  />

                  {/* OPACITY */}

                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-slate-600">
                        Transparansi
                      </span>

                      <span className="text-[10px] font-bold text-emerald-600">
                        {opacity}%
                      </span>
                    </div>

                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={opacity}
                      onChange={(e) => setOpacity(Number(e.target.value))}
                      className="w-full accent-emerald-600"
                    />
                  </div>

                  {/* ACTION GRID */}

                  <div className="grid grid-cols-2 gap-1.5">
                    <InfoAction icon={Search} label="Zoom ke Layer" />
                    <InfoAction icon={Table2} label="Attribute Table" />
                    <InfoAction icon={Filter} label="Filter / Query" />
                    <InfoAction icon={Settings2} label="Ubah Simbologi" />
                    <InfoAction icon={Download} label="Export Data" />
                    <InfoAction icon={Check} label="Set as Active" active />
                  </div>
                </div>
              </section>
            )}

            {!showInfo && (
              <button
                onClick={() => setShowInfo(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
              >
                <Info size={15} />
                Tampilkan Informasi Layer
              </button>
            )}

            {/* =================================================
                WORKSPACE
            ================================================= */}

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-3">
                <h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-700">
                  Workspace
                </h2>

                <button className="text-[10px] font-semibold text-emerald-600 hover:text-emerald-700">
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
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    className="w-full bg-transparent text-[11px] font-bold text-slate-700 outline-none"
                  />

                  <div className="mt-1 text-[9px] text-slate-400">
                    {activeLayerObject?.updatedAt ? `Sinkronisasi: ${new Date(activeLayerObject.updatedAt).toLocaleString("id-ID")}` : "Belum ada data workspace"}
                  </div>
                </div>

                <button className="flex h-8 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-[10px] font-bold text-white shadow-sm transition hover:bg-emerald-700">
                  <Save size={13} />
                  Simpan Workspace
                </button>

                <div className="mt-4">
                  <div className="mb-2 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                    Workspace Tersimpan
                  </div>

                  <div className="space-y-1.5">
                    {apiLayers.slice(0, 5).map((layer) => (
                      <WorkspaceItem key={layer.id} title={layer.title} />
                    ))}
                    {!apiLayers.length && (
                      <div className="rounded-lg border border-dashed border-slate-200 px-2.5 py-3 text-[10px] text-slate-400">
                        Belum ada layer tersedia dari database.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* =================================================
                QUICK STATUS
            ================================================= */}

            <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Layer Status
                </span>

                <RefreshCw size={13} className="text-slate-400" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <StatusCard value={String(layers.flatMap((category) => category.children).filter((layer) => layer.checked).length)} label="Layer Aktif" icon={Eye} />

                <StatusCard value={String(apiLayers.length)} label="Total Layer" icon={Layers3} />

                <StatusCard value={String(activeLayerObject?.featureCount ?? activeGeoJson?.features.length ?? 0)} label="Fitur Aktif" icon={Activity} />

                <StatusCard
                  value={loadingLayers || loadingGeoJson ? "..." : apiError ? "ERROR" : "OK"}
                  label="Data Health"
                  icon={ShieldAlert}
                />
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   SMALL COMPONENTS
============================================================ */

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="h-2.5 w-2.5 rounded-sm"
        style={{ backgroundColor: color }}
      />

      <span className="text-[9px] font-medium text-slate-600">{label}</span>
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
      onClick={onClick}
      className={`
        flex
        items-center
        gap-1.5
        border-b-2
        px-3
        py-2.5
        text-[9px]
        font-bold
        transition
        ${
          active
            ? "border-emerald-500 text-emerald-600"
            : "border-transparent text-slate-400 hover:text-slate-700"
        }
      `}
    >
      <Icon size={12} />
      {children}
    </button>
  );
}

function RiskBadge({ risk }: { risk: string }) {
  const normalized = risk.toLowerCase();
  const style = normalized.includes("tinggi")
    ? "bg-red-50 text-red-600 border-red-100"
    : normalized.includes("sedang") || normalized.includes("menengah")
      ? "bg-amber-50 text-amber-600 border-amber-100"
      : normalized.includes("rendah")
        ? "bg-emerald-50 text-emerald-600 border-emerald-100"
        : "bg-slate-50 text-slate-600 border-slate-100";

  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-[9px] font-bold ${style}`}
    >
      {risk}
    </span>
  );
}

function InfoItem({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <div className="mb-0.5 text-[9px] font-bold text-slate-700">{title}</div>

      <div className="text-[10px] leading-relaxed text-slate-500">{value}</div>
    </div>
  );
}

function InfoAction({
  icon: Icon,
  label,
  active = false,
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      className={`
        flex
        min-h-[30px]
        items-center
        justify-center
        gap-1.5
        rounded-md
        border
        px-1
        text-[9px]
        font-semibold
        transition
        ${
          active
            ? "border-emerald-200 bg-emerald-50 text-emerald-600"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
        }
      `}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}

function WorkspaceItem({ title }: { title: string }) {
  return (
    <button className="group flex w-full items-center gap-2 rounded-lg border border-slate-100 px-2.5 py-2 text-left transition hover:border-emerald-100 hover:bg-emerald-50/40">
      <div className="h-1.5 w-1.5 rounded-full bg-slate-300 group-hover:bg-emerald-500" />

      <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-slate-600">
        {title}
      </span>

      <MoreVertical size={13} className="text-slate-300" />
    </button>
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
        <span className="text-[15px] font-bold text-slate-800">{value}</span>

        <Icon size={13} className="text-emerald-500" />
      </div>

      <div className="text-[8px] font-medium text-slate-400">{label}</div>
    </div>
  );
}
