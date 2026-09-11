import React, { useMemo, useState } from "react";
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

type RiskClass = "Tinggi" | "Sedang" | "Rendah";

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
   MOCK LAYER DATA
============================================================ */

const initialLayerCategories: LayerCategory[] = [
  {
    id: "administrasi",
    title: "ADMINISTRASI",
    children: [
      {
        id: "provinsi",
        title: "Provinsi",
        icon: MapPinned,
        checked: true,
        category: "Administrasi",
      },
      {
        id: "kabupaten",
        title: "Kabupaten/Kota",
        icon: MapPinned,
        checked: true,
        category: "Administrasi",
      },
      {
        id: "kecamatan",
        title: "Kecamatan",
        icon: MapPinned,
        checked: false,
        category: "Administrasi",
      },
      {
        id: "desa",
        title: "Desa/Kelurahan",
        icon: MapPinned,
        checked: false,
        category: "Administrasi",
      },
    ],
  },

  {
    id: "risiko",
    title: "RISIKO BENCANA",
    children: [
      {
        id: "banjir",
        title: "Banjir",
        icon: Waves,
        checked: true,
        color: "#ef4444",
        featureCount: 635,
        category: "Risiko Bencana",
      },
      {
        id: "longsor",
        title: "Longsor",
        icon: Mountain,
        checked: true,
        color: "#f97316",
        featureCount: 428,
        category: "Risiko Bencana",
      },
      {
        id: "karhutla",
        title: "Karhutla",
        icon: Flame,
        checked: false,
        color: "#dc2626",
        featureCount: 192,
        category: "Risiko Bencana",
      },
      {
        id: "kekeringan",
        title: "Kekeringan",
        icon: CloudSun,
        checked: false,
        color: "#eab308",
        featureCount: 311,
        category: "Risiko Bencana",
      },
    ],
  },

  {
    id: "lingkungan",
    title: "LINGKUNGAN",
    children: [
      {
        id: "das",
        title: "DAS",
        icon: Database,
        checked: false,
        category: "Lingkungan",
      },
      {
        id: "tutupan",
        title: "Tutupan Lahan",
        icon: Trees,
        checked: false,
        category: "Lingkungan",
      },
      {
        id: "gambut",
        title: "Gambut",
        icon: Trees,
        checked: false,
        category: "Lingkungan",
      },
    ],
  },

  {
    id: "mitigasi",
    title: "MITIGASI & ADAPTASI",
    children: [
      {
        id: "lokasi-kegiatan",
        title: "Lokasi Kegiatan",
        icon: MapPinned,
        checked: true,
        category: "Mitigasi & Adaptasi",
      },
      {
        id: "rekomendasi",
        title: "Rekomendasi Model",
        icon: Activity,
        checked: true,
        category: "Mitigasi & Adaptasi",
      },
    ],
  },
];

/* ============================================================
   ATTRIBUTE DATA
============================================================ */

const attributeData: AttributeRow[] = [
  {
    id: 1,
    wilayah: "Kab. Sintang",
    risiko: "Tinggi",
    luas: "12.456,78",
    provinsi: "Kalimantan Barat",
    sumber: "Analisis Hidrologi 2024",
    update: "15/05/2025",
  },
  {
    id: 2,
    wilayah: "Kab. Melawi",
    risiko: "Sedang",
    luas: "8.932,11",
    provinsi: "Kalimantan Barat",
    sumber: "Analisis Hidrologi 2024",
    update: "15/05/2025",
  },
  {
    id: 3,
    wilayah: "Kab. Kapuas Hulu",
    risiko: "Rendah",
    luas: "5.120,45",
    provinsi: "Kalimantan Barat",
    sumber: "Analisis Hidrologi 2024",
    update: "15/05/2025",
  },
  {
    id: 4,
    wilayah: "Kab. Sanggau",
    risiko: "Tinggi",
    luas: "9.875,60",
    provinsi: "Kalimantan Barat",
    sumber: "Analisis Hidrologi 2024",
    update: "15/05/2025",
  },
  {
    id: 5,
    wilayah: "Kab. Sekadau",
    risiko: "Sedang",
    luas: "6.450,21",
    provinsi: "Kalimantan Barat",
    sumber: "Analisis Hidrologi 2024",
    update: "15/05/2025",
  },
];

/* ============================================================
   SAMPLE GEOJSON
   Demo polygon agar halaman langsung terlihat hidup.
============================================================ */

const sampleGeoJson = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        name: "Wilayah Risiko Tinggi",
        risk: "Tinggi",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [109.1, 0.2],
            [110.2, 0.3],
            [110.4, 1.0],
            [109.8, 1.4],
            [109.0, 1.0],
            [109.1, 0.2],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        name: "Wilayah Risiko Sedang",
        risk: "Sedang",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [110.3, -0.3],
            [111.5, -0.1],
            [111.3, 0.8],
            [110.4, 0.7],
            [110.3, -0.3],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        name: "Wilayah Risiko Rendah",
        risk: "Rendah",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [111.4, -1.0],
            [112.5, -0.8],
            [112.4, 0.0],
            [111.6, 0.3],
            [111.4, -1.0],
          ],
        ],
      },
    },
  ],
};

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
  const [layers, setLayers] = useState(initialLayerCategories);

  const [activeLayer, setActiveLayer] = useState("banjir");

  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(
    {
      administrasi: true,
      risiko: true,
      lingkungan: true,
      mitigasi: true,
    },
  );

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

  const [workspaceName, setWorkspaceName] = useState(
    "Analisis Risiko Banjir Kalimantan Barat",
  );

  /* ==========================================================
     TOGGLE LAYER
  ========================================================== */

  const toggleLayer = (layerId: string) => {
    setLayers((previous) =>
      previous.map((category) => ({
        ...category,
        children: category.children.map((layer) =>
          layer.id === layerId
            ? {
                ...layer,
                checked: !layer.checked,
              }
            : layer,
        ),
      })),
    );
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
     GEOJSON STYLE
  ========================================================== */

  const geoJsonStyle = (
    feature?: GeoJSON.Feature<GeoJSON.Geometry> | undefined,
  ): PathOptions => {
    const risk = feature?.properties?.risk;

    if (risk === "Tinggi") {
      return {
        color: "#dc2626",
        weight: 2,
        fillColor: "#ef4444",
        fillOpacity: opacity / 100,
      };
    }

    if (risk === "Sedang") {
      return {
        color: "#d97706",
        weight: 2,
        fillColor: "#f59e0b",
        fillOpacity: opacity / 100,
      };
    }

    return {
      color: "#059669",
      weight: 2,
      fillColor: "#10b981",
      fillOpacity: opacity / 100,
    };
  };

  /* ==========================================================
     GEOJSON EVENTS
  ========================================================== */

  const onEachFeature = (feature: GeoJSON.Feature, layer: LeafletLayer) => {
    if ("bindPopup" in layer) {
      const name = feature.properties?.name ?? "Wilayah";
      const risk = feature.properties?.risk ?? "-";

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

  const filteredAttributes = attributeData.filter((row) => {
    const value = filterText.toLowerCase();

    if (!value) return true;

    return (
      row.wilayah.toLowerCase().includes(value) ||
      row.risiko.toLowerCase().includes(value) ||
      row.provinsi.toLowerCase().includes(value)
    );
  });

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
                Sistem Online
              </span>
            </div>
          </div>
        </div>
      </div>

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

                <GeoJSON
                  key={opacity}
                  data={sampleGeoJson as any}
                  style={geoJsonStyle}
                  onEachFeature={onEachFeature}
                />

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

                <div className="flex items-center gap-3">
                  <LegendItem color="#ef4444" label="Tinggi" />
                  <LegendItem color="#f59e0b" label="Sedang" />
                  <LegendItem color="#10b981" label="Rendah" />
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
                      {activeLayerObject?.title ?? "Risiko Banjir"}
                    </span>

                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-bold text-blue-600">
                      {activeLayerObject?.featureCount ?? 635} Fitur
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
                        {activeLayerObject?.title ?? "Risiko Banjir"}
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
                    value="Peta risiko banjir berdasarkan analisis hidrologi dan curah hujan."
                  />

                  <InfoItem
                    title="Sumber Data"
                    value="Kementerian Kehutanan, BNPB"
                  />

                  <InfoItem title="Tipe Data" value="Vector - Polygon" />

                  <InfoItem title="Tanggal Pembaruan" value="15 Mei 2025" />

                  <InfoItem
                    title="Skala Disarankan"
                    value="1 : 25.000 - 1 : 1.000.000"
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
                    Diperbarui: 15 Mei 2025 10:20
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
                    <WorkspaceItem title="Analisis Karhutla 2025" />
                    <WorkspaceItem title="Mitigasi Longsor Kapuas Hulu" />
                    <WorkspaceItem title="Kekeringan Musim Kemarau" />
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
                <StatusCard value="12" label="Layer Aktif" icon={Eye} />

                <StatusCard value="27" label="Total Layer" icon={Layers3} />

                <StatusCard value="635" label="Fitur Aktif" icon={Activity} />

                <StatusCard
                  value="99.9%"
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

function RiskBadge({ risk }: { risk: RiskClass }) {
  const styles: Record<RiskClass, string> = {
    Tinggi: "bg-red-50 text-red-600 border-red-100",
    Sedang: "bg-amber-50 text-amber-600 border-amber-100",
    Rendah: "bg-emerald-50 text-emerald-600 border-emerald-100",
  };

  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-[9px] font-bold ${styles[risk]}`}
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
