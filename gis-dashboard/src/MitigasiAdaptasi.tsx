import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  Eye,
  FileArchive,
  FileText,
  Filter,
  FolderOpen,
  Layers3,
  Map,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { API_URL } from "./api";

type SectionName = "mitigasiAdaptasi";

type Layer = {
  id: string;
  name: string;
  createdAt?: string;
  section?: string;
  isManual?: boolean;
  isShapefile?: boolean;
  featureCount?: number;
};

type GeoFeature = {
  type?: string;
  properties?: Record<string, unknown> | null;
  geometry?: unknown;
};

type GeoJsonResponse = {
  type?: string;
  features?: GeoFeature[];
};

type FormState = {
  tableName: string;
  description: string;
  category: string;
  year: string;
};

const EMPTY_FORM: FormState = {
  tableName: "",
  description: "",
  category: "Mitigasi",
  year: new Date().getFullYear().toString(),
};

const formatTableName = (value: string) =>
  String(value || "")
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const formatDate = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const sanitizeTableName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/^_+|_+$/g, "");

const getErrorMessage = async (response: Response) => {
  try {
    const json = await response.json();
    return json?.error || json?.message || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
};

const MitigasiAdaptasi: React.FC = () => {
  const navigate = useNavigate();

  const [layers, setLayers] = useState<Layer[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState("");

  const [activeTab, setActiveTab] = useState<
    "overview" | "layers" | "data" | "map"
  >("overview");

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Semua");
  const [selectedLayer, setSelectedLayer] = useState<Layer | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [insertProgress, setInsertProgress] = useState(0);
  const [insertStatus, setInsertStatus] = useState("");

  const [geojsonLoading, setGeojsonLoading] = useState(false);
  const [geojsonError, setGeojsonError] = useState("");
  const [features, setFeatures] = useState<GeoFeature[]>([]);
  const [dataPage, setDataPage] = useState(1);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const fetchLayers = useCallback(async () => {
    setPageError("");
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/layers`);
      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      const data = await response.json();
      const source = Array.isArray(data?.mitigasiAdaptasi)
        ? data.mitigasiAdaptasi
        : [];

      setLayers(
        source.map((item: Layer) => ({
          ...item,
          section: "mitigasiAdaptasi",
        })),
      );
    } catch (error: any) {
      console.error("GET /api/layers failed:", error);
      setPageError(error?.message || "Gagal memuat data mitigasi & adaptasi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLayers();
  }, [fetchLayers]);

  const filteredLayers = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return layers.filter((layer) => {
      const name = formatTableName(layer.name).toLowerCase();

      const category = name.includes("adaptasi")
        ? "Adaptasi"
        : name.includes("mitigasi")
          ? "Mitigasi"
          : "Lainnya";

      const matchSearch =
        !keyword ||
        name.includes(keyword) ||
        layer.name.toLowerCase().includes(keyword);

      const matchCategory =
        categoryFilter === "Semua" || category === categoryFilter;

      return matchSearch && matchCategory;
    });
  }, [layers, search, categoryFilter]);

  const stats = useMemo(() => {
    const mitigasi = layers.filter((l) =>
      formatTableName(l.name).toLowerCase().includes("mitigasi"),
    ).length;

    const adaptasi = layers.filter((l) =>
      formatTableName(l.name).toLowerCase().includes("adaptasi"),
    ).length;

    const other = Math.max(layers.length - mitigasi - adaptasi, 0);

    return {
      total: layers.length,
      mitigasi,
      adaptasi,
      other,
    };
  }, [layers]);

  const openAddModal = () => {
    setForm(EMPTY_FORM);
    setUploadedFiles([]);
    setUploadProgress(0);
    setInsertProgress(0);
    setInsertStatus("");
    setShowAddModal(true);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;
    setUploadedFiles(Array.from(files));
  };

  const handleCreateLayer = async () => {
    const sanitizedName = sanitizeTableName(form.tableName);

    if (!sanitizedName) {
      alert("Nama tabel/layer wajib diisi.");
      return;
    }

    if (uploadedFiles.length === 0) {
      alert("Upload file Shapefile terlebih dahulu.");
      return;
    }

    const hasShp = uploadedFiles.some((file) =>
      file.name.toLowerCase().endsWith(".shp"),
    );
    const hasDbf = uploadedFiles.some((file) =>
      file.name.toLowerCase().endsWith(".dbf"),
    );

    if (!hasShp || !hasDbf) {
      alert("File .shp dan .dbf wajib diupload.");
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setInsertProgress(0);
    setInsertStatus("Menyiapkan import...");

    try {
      const formData = new FormData();
      formData.append("tableName", sanitizedName);
      formData.append("section", "mitigasiAdaptasi");

      uploadedFiles.forEach((file) => {
        formData.append("files", file);
      });

      /*
       * API sekarang:
       * POST /api/layers
       * multipart:
       *   tableName
       *   section
       *   files[]
       *
       * Progress import dibaca dari:
       * GET /api/layers/progress/:tableName
       */
      const eventSource = new EventSource(
        `${API_URL}/api/layers/progress/${encodeURIComponent(sanitizedName)}`,
      );

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (typeof data.progress === "number") {
            setInsertProgress(Math.max(0, Math.min(100, data.progress)));
          }

          if (data.status) {
            setInsertStatus(String(data.status));
          }

          if (data.done) {
            eventSource.close();
          }
        } catch (error) {
          console.error("SSE progress parse error:", error);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
      };

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          setUploadProgress(Math.round((event.loaded / event.total) * 100));
        }
      });

      const responsePromise = new Promise<{
        ok: boolean;
        status: number;
        text: string;
      }>((resolve, reject) => {
        xhr.addEventListener("load", () => {
          resolve({
            ok: xhr.status >= 200 && xhr.status < 300,
            status: xhr.status,
            text: xhr.responseText,
          });
        });

        xhr.addEventListener("error", () => {
          reject(new Error("Network error saat upload dataset."));
        });

        xhr.addEventListener("abort", () => {
          reject(new Error("Upload dibatalkan."));
        });
      });

      xhr.open("POST", `${API_URL}/api/layers`);
      xhr.send(formData);

      const result = await responsePromise;

      if (!result.ok) {
        let message = `Upload gagal (HTTP ${result.status})`;
        try {
          const json = JSON.parse(result.text);
          message = json?.error || json?.message || message;
        } catch {
          // keep default
        }
        throw new Error(message);
      }

      setUploadProgress(100);
      setInsertProgress(100);
      setInsertStatus("Selesai");

      await fetchLayers();

      eventSource.close();

      window.setTimeout(() => {
        setShowAddModal(false);
        setUploading(false);
        setUploadProgress(0);
        setInsertProgress(0);
        setInsertStatus("");
        setForm(EMPTY_FORM);
        setUploadedFiles([]);
      }, 700);
    } catch (error: any) {
      console.error("POST /api/layers failed:", error);
      alert(error?.message || "Gagal membuat layer.");
      setUploading(false);
      setUploadProgress(0);
      setInsertProgress(0);
      setInsertStatus("");
    }
  };

  const openDetail = async (layer: Layer) => {
    setSelectedLayer(layer);
    setShowDetailModal(true);
    setGeojsonError("");
    setFeatures([]);
    setDataPage(1);
    setGeojsonLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/api/layers/${encodeURIComponent(layer.name)}/geojson`,
      );

      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      const data: GeoJsonResponse = await response.json();
      setFeatures(Array.isArray(data?.features) ? data.features : []);
    } catch (error: any) {
      console.error("GeoJSON detail failed:", error);
      setGeojsonError(
        error?.message ||
          "Data atribut belum dapat dibaca dari endpoint GeoJSON.",
      );
    } finally {
      setGeojsonLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!selectedLayer) return;


    try {
      const response = await fetch(
        `${API_URL}/api/layers/${encodeURIComponent(selectedLayer.id)}`,
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      setShowDeleteModal(false);
      setShowDetailModal(false);
      setSelectedLayer(null);
      await fetchLayers();
      alert("Layer berhasil dihapus.");
    } catch (error: any) {
      console.error("DELETE /api/layers failed:", error);
      alert(error?.message || "Gagal menghapus layer.");
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await fetchLayers();
    setRefreshing(false);
  };


  const visibleFeatureRows = useMemo(() => {
    const pageSize = 12;
    const start = (dataPage - 1) * pageSize;
    return features.slice(start, start + pageSize);
  }, [features, dataPage]);

  const totalDataPages = Math.max(1, Math.ceil(features.length / 12));

  const propertyColumns = useMemo(() => {
    const set = new Set<string>();

    features.slice(0, 50).forEach((feature) => {
      Object.keys(feature.properties || {}).forEach((key) => set.add(key));
    });

    return Array.from(set).slice(0, 10);
  }, [features]);

  return (
    <div className="min-h-screen bg-[#f4f7f6] text-slate-800">
      <style>{`
        .enterprise-scroll::-webkit-scrollbar {
          width: 7px;
          height: 7px;
        }
        .enterprise-scroll::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 999px;
        }
        .enterprise-grid {
          background-image:
            linear-gradient(rgba(148,163,184,.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148,163,184,.07) 1px, transparent 1px);
          background-size: 24px 24px;
        }
      `}</style>

      {/* HEADER */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex min-h-[68px] items-center justify-between gap-4 px-4 md:px-6 xl:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 xl:hidden"
              title="Menu"
            >
              <Layers3 size={18} />
            </button>

            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#064238] text-white shadow-sm">
              <ShieldCheck size={21} />
            </div>

            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[.18em] text-emerald-700">
                SIMITIGASI • Enterprise GIS
              </div>
              <h1 className="truncate text-base font-extrabold text-slate-900 md:text-lg">
                Pusat Data Mitigasi & Adaptasi
              </h1>
            </div>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <button
              onClick={refresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw
                size={14}
                className={refreshing ? "animate-spin" : ""}
              />
              Refresh
            </button>

          </div>
        </div>

        {/* TABS */}
        <div className="overflow-x-auto border-t border-slate-100">
          <div className="flex min-w-max gap-1 px-4 md:px-6 xl:px-8">
            {[
              ["overview", "Overview", BarChart3],
              ["layers", "Layer Registry", Layers3],
              ["data", "Data Explorer", Database],
              ["map", "Peta", Map],
            ].map(([key, label, Icon]) => (
              <button
                key={String(key)}
                onClick={() =>
                  setActiveTab(key as "overview" | "layers" | "data" | "map")
                }
                className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition ${
                  activeTab === key
                    ? "border-emerald-600 text-emerald-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {React.createElement(Icon as React.ElementType, {
                  size: 14,
                })}
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* MOBILE ACTION */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 xl:hidden">
          <div className="absolute left-0 top-0 h-full w-[280px] bg-[#064238] p-5 text-white shadow-2xl">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[.2em] text-emerald-200">
                  SIMITIGASI
                </div>
                <div className="text-lg font-extrabold">
                  Mitigasi & Adaptasi
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg p-2 hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>

            <button
              onClick={() => {
                setMobileMenuOpen(false);
                openAddModal();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-extrabold text-[#064238]"
            >
              <Plus size={16} />
              Tambah Dataset
            </button>
          </div>
        </div>
      )}

      <main className="enterprise-scroll mx-auto max-w-[1700px] overflow-x-hidden px-4 py-5 md:px-6 xl:px-8">
        {/* PAGE INTRO */}
        <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[9px] font-extrabold uppercase tracking-wider text-emerald-700">
                <Activity size={12} />
                Data Management Center
              </div>
              <h2 className="text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
                Mitigasi & Adaptasi
              </h2>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500 md:text-sm">
                Kelola registry layer spasial, dataset kegiatan, dan informasi
                mitigasi/adaptasi dalam satu workspace enterprise.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={openAddModal}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#064238] px-4 py-3 text-xs font-extrabold text-white shadow-sm hover:bg-[#075447]"
              >
                <Plus size={16} />
                Tambah Data
              </button>
              <button
                onClick={() => setActiveTab("data")}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                <Database size={16} />
                Data Explorer
              </button>
            </div>
          </div>
        </section>

        {pageError && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            <AlertCircle className="mt-0.5 shrink-0" size={17} />
            <div>
              <div className="text-xs font-extrabold">Gagal memuat data</div>
              <div className="mt-1 text-xs">{pageError}</div>
            </div>
          </div>
        )}

        {/* KPI */}
        <section className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            {
              label: "Total Layer",
              value: stats.total,
              icon: Layers3,
              note: "Registry aktif",
            },
            {
              label: "Mitigasi",
              value: stats.mitigasi,
              icon: ShieldCheck,
              note: "Dataset mitigasi",
            },
            {
              label: "Adaptasi",
              value: stats.adaptasi,
              icon: Activity,
              note: "Dataset adaptasi",
            },
            {
              label: "Lainnya",
              value: stats.other,
              icon: FolderOpen,
              note: "Dataset pendukung",
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {item.label}
                  </div>
                  <div className="mt-2 text-3xl font-black text-slate-900">
                    {loading ? "—" : item.value}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-400">
                    {item.note}
                  </div>
                </div>
                <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700">
                  <item.icon size={19} />
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* OVERVIEW */}
        {activeTab === "overview" && (
          <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(330px,.7fr)]">
            <div className="enterprise-grid min-h-[390px] rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Registry Overview
                  </div>
                  <h3 className="mt-1 text-base font-extrabold text-slate-900">
                    Komposisi Layer Mitigasi & Adaptasi
                  </h3>
                </div>
                <Layers3 size={20} className="text-slate-300" />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  {
                    title: "Mitigasi",
                    count: stats.mitigasi,
                    desc: "Pengurangan risiko dan dampak",
                  },
                  {
                    title: "Adaptasi",
                    count: stats.adaptasi,
                    desc: "Penyesuaian terhadap perubahan",
                  },
                  {
                    title: "Pendukung",
                    count: stats.other,
                    desc: "Dataset penunjang analisis",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="rounded-xl border border-slate-200 bg-white/90 p-4"
                  >
                    <div className="text-xs font-bold text-slate-500">
                      {item.title}
                    </div>
                    <div className="mt-2 text-3xl font-black text-[#064238]">
                      {item.count}
                    </div>
                    <div className="mt-1 text-[10px] leading-relaxed text-slate-400">
                      {item.desc}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2
                    size={18}
                    className="mt-0.5 shrink-0 text-emerald-600"
                  />
                  <div>
                    <div className="text-xs font-extrabold text-emerald-900">
                      Terintegrasi dengan Layer Registry
                    </div>
                    <p className="mt-1 text-[10px] leading-relaxed text-emerald-800">
                      Halaman ini membaca registry dari endpoint
                      <code className="mx-1 rounded bg-white px-1">
                        GET /api/layers
                      </code>
                      dan hanya menampilkan layer dengan section
                      <code className="mx-1 rounded bg-white px-1">
                        mitigasiAdaptasi
                      </code>
                      .
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Quick Actions
                </div>
                <h3 className="mt-1 text-base font-extrabold">
                  Operasional Data
                </h3>
              </div>

              <div className="space-y-2">
                <button
                  onClick={openAddModal}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-emerald-200 hover:bg-emerald-50"
                >
                  <div className="rounded-lg bg-emerald-100 p-2 text-emerald-700">
                    <Upload size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-bold">Import Shapefile</div>
                    <div className="text-[10px] text-slate-400">
                      .shp + .dbf ke layer GIS
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab("layers")}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"
                >
                  <div className="rounded-lg bg-slate-100 p-2 text-slate-700">
                    <Layers3 size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-bold">Layer Registry</div>
                    <div className="text-[10px] text-slate-400">
                      Lihat semua dataset
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab("data")}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"
                >
                  <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
                    <Database size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-bold">Data Explorer</div>
                    <div className="text-[10px] text-slate-400">
                      Baca atribut feature
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* LAYER REGISTRY */}
        {(activeTab === "layers" || activeTab === "data") && (
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4 md:p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {activeTab === "layers"
                      ? "Layer Registry"
                      : "Data Explorer"}
                  </div>
                  <h3 className="mt-1 text-base font-extrabold text-slate-900">
                    Dataset Mitigasi & Adaptasi
                  </h3>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Cari layer..."
                      className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none focus:border-emerald-400 focus:bg-white sm:w-[230px]"
                    />
                  </div>

                  <div className="relative">
                    <Filter
                      size={13}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="h-9 rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-8 text-xs outline-none focus:border-emerald-400"
                    >
                      <option>Semua</option>
                      <option>Mitigasi</option>
                      <option>Adaptasi</option>
                      <option>Lainnya</option>
                    </select>
                  </div>

                  <button
                    onClick={openAddModal}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#064238] px-3 text-xs font-bold text-white"
                  >
                    <Plus size={14} />
                    Tambah
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-200">
                    {[
                      "Layer / Dataset",
                      "Kategori",
                      "ID Registry",
                      "Dibuat",
                      "Status",
                      "Aksi",
                    ].map((head) => (
                      <th
                        key={head}
                        className="whitespace-nowrap px-4 py-3 text-[9px] font-black uppercase tracking-wider text-slate-400"
                      >
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredLayers.map((layer) => {
                    const displayName = formatTableName(layer.name);
                    const category = displayName
                      .toLowerCase()
                      .includes("adaptasi")
                      ? "Adaptasi"
                      : displayName.toLowerCase().includes("mitigasi")
                        ? "Mitigasi"
                        : "Lainnya";

                    return (
                      <tr
                        key={layer.id}
                        className="border-b border-slate-100 transition hover:bg-slate-50/80"
                      >
                        <td className="px-4 py-3">
                          <div className="flex min-w-[250px] items-center gap-3">
                            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                              <Layers3 size={15} />
                            </div>
                            <div>
                              <div className="text-xs font-extrabold text-slate-800">
                                {displayName}
                              </div>
                              <div className="mt-0.5 font-mono text-[9px] text-slate-400">
                                {layer.name}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-bold text-slate-600">
                            {category}
                          </span>
                        </td>

                        <td className="px-4 py-3 font-mono text-[10px] text-slate-500">
                          #{layer.id}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 text-[10px] text-slate-500">
                          {formatDate(layer.createdAt)}
                        </td>

                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-bold text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            ACTIVE
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openDetail(layer)}
                              className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700"
                              title="Detail & data"
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedLayer(layer);
                                setShowDetailModal(true);
                              }}
                              className="rounded-lg p-2 text-slate-500 hover:bg-amber-50 hover:text-amber-700"
                              title="Edit"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedLayer(layer);
                                setShowDeleteModal(true);
                              }}
                              className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700"
                              title="Hapus"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {!loading && filteredLayers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-14 text-center">
                        <Layers3 size={28} className="mx-auto text-slate-300" />
                        <div className="mt-3 text-xs font-bold text-slate-500">
                          Belum ada layer Mitigasi & Adaptasi
                        </div>
                        <div className="mt-1 text-[10px] text-slate-400">
                          Upload dataset pertama melalui tombol Tambah Data.
                        </div>
                      </td>
                    </tr>
                  )}

                  {loading && (
                    <tr>
                      <td colSpan={6} className="px-4 py-14 text-center">
                        <RefreshCw
                          size={22}
                          className="mx-auto animate-spin text-emerald-600"
                        />
                        <div className="mt-2 text-xs text-slate-500">
                          Memuat registry...
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* MAP */}
        {activeTab === "map" && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col justify-between gap-3 border-b border-slate-200 p-5 md:flex-row md:items-center">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Spatial Workspace
                </div>
                <h3 className="mt-1 text-base font-extrabold">
                  Peta Mitigasi & Adaptasi
                </h3>
              </div>
              <button
                onClick={() => navigate("/kerawanan")}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                <Map size={14} />
                Buka GIS Command Center
              </button>
            </div>

            <div className="enterprise-grid flex min-h-[500px] items-center justify-center bg-slate-50 p-6">
              <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                  <Map size={26} />
                </div>
                <h4 className="mt-4 text-base font-extrabold">
                  Spatial View Terintegrasi
                </h4>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  Layer Mitigasi & Adaptasi tetap dikelola oleh GIS Command
                  Center yang sekarang. Halaman enterprise ini berfungsi sebagai
                  pusat administrasi dan eksplorasi datanya.
                </p>
                <button
                  onClick={() => navigate("/kerawanan")}
                  className="mt-5 rounded-xl bg-[#064238] px-4 py-2.5 text-xs font-bold text-white"
                >
                  Buka Peta GIS
                </button>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* ADD MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 p-5">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[.18em] text-emerald-700">
                  Dataset Ingestion
                </div>
                <h3 className="mt-1 text-lg font-black text-slate-900">
                  Tambah Layer Mitigasi & Adaptasi
                </h3>
                <p className="mt-1 text-[10px] text-slate-400">
                  Import Shapefile menggunakan API layer yang sudah ada.
                </p>
              </div>
              {!uploading && (
                <button
                  onClick={() => setShowAddModal(false)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            <div className="enterprise-scroll max-h-[calc(92vh-150px)] overflow-y-auto p-5">
              {!uploading ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-[10px] font-bold text-slate-600">
                        Nama Layer / Tabel *
                      </label>
                      <input
                        value={form.tableName}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            tableName: e.target.value,
                          }))
                        }
                        placeholder="contoh: rehabilitasi_das"
                        className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-emerald-500"
                      />
                      <div className="mt-1 text-[9px] text-slate-400">
                        Akan disanitasi menjadi identifier database.
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-[10px] font-bold text-slate-600">
                        Kategori
                      </label>
                      <select
                        value={form.category}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            category: e.target.value,
                          }))
                        }
                        className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-emerald-500"
                      >
                        <option>Mitigasi</option>
                        <option>Adaptasi</option>
                        <option>Pendukung</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-[10px] font-bold text-slate-600">
                        Tahun
                      </label>
                      <input
                        value={form.year}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            year: e.target.value,
                          }))
                        }
                        className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-[10px] font-bold text-slate-600">
                        Deskripsi
                      </label>
                      <input
                        value={form.description}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            description: e.target.value,
                          }))
                        }
                        placeholder="Keterangan dataset"
                        className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-[10px] font-bold text-slate-600">
                        Shapefile Dataset *
                      </label>
                      <span className="text-[9px] text-slate-400">
                        .shp + .dbf wajib
                      </span>
                    </div>

                    <label className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center transition hover:border-emerald-400 hover:bg-emerald-50/30">
                      <input
                        type="file"
                        multiple
                        accept=".shp,.dbf,.shx,.prj,.cpg,.qpj"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <div className="rounded-2xl bg-white p-3 text-emerald-700 shadow-sm">
                        <FileArchive size={25} />
                      </div>
                      <div className="mt-3 text-xs font-extrabold text-slate-700">
                        Pilih file Shapefile
                      </div>
                      <div className="mt-1 text-[10px] text-slate-400">
                        Pilih semua file pendamping dari satu dataset.
                      </div>
                    </label>

                    {uploadedFiles.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {uploadedFiles.map((file) => (
                          <div
                            key={`${file.name}-${file.size}`}
                            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <FileText
                                size={14}
                                className="shrink-0 text-slate-400"
                              />
                              <span className="truncate text-[10px] font-semibold text-slate-700">
                                {file.name}
                              </span>
                            </div>
                            <span className="ml-3 text-[9px] text-slate-400">
                              {(file.size / 1024 / 1024).toFixed(2)} MB
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                    <div className="flex items-start gap-2">
                      <Database
                        size={15}
                        className="mt-0.5 shrink-0 text-blue-600"
                      />
                      <div className="text-[10px] leading-relaxed text-blue-800">
                        Dataset akan dikirim ke
                        <code className="mx-1 rounded bg-white px-1 font-bold">
                          POST /api/layers
                        </code>
                        dengan
                        <code className="mx-1 rounded bg-white px-1">
                          section=mitigasiAdaptasi
                        </code>
                        sesuai implementasi GIS yang sekarang.
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                    <button
                      onClick={() => setShowAddModal(false)}
                      className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                    >
                      Batal
                    </button>
                    <button
                      onClick={handleCreateLayer}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#064238] px-5 py-2.5 text-xs font-extrabold text-white hover:bg-[#075447]"
                    >
                      <Upload size={14} />
                      Import Dataset
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5">
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-white p-2.5 text-emerald-700 shadow-sm">
                        <Activity size={19} />
                      </div>
                      <div>
                        <div className="text-xs font-extrabold text-emerald-900">
                          Import dataset sedang berjalan
                        </div>
                        <div className="text-[10px] text-emerald-700">
                          {sanitizeTableName(form.tableName)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {[
                    {
                      label: "Upload Dataset",
                      progress: uploadProgress,
                      status:
                        uploadProgress >= 100
                          ? "Selesai"
                          : "Mengirim dataset ke server...",
                    },
                    {
                      label: "Import Features",
                      progress: insertProgress,
                      status:
                        insertStatus ||
                        "Memasukkan feature spasial ke database...",
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-xl border border-slate-200 p-4"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700">
                          {item.label}
                        </span>
                        <span className="text-xs font-black text-slate-600">
                          {item.progress}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-emerald-600 transition-all duration-300"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                      <div className="mt-2 text-[9px] text-slate-400">
                        {item.status}
                      </div>
                    </div>
                  ))}

                  <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-[10px] leading-relaxed text-amber-800">
                    <strong>Jangan tutup halaman.</strong> Backend sedang
                    membuat tabel spasial dan memasukkan feature satu per satu.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DETAIL / DATA MODAL */}
      {showDetailModal && selectedLayer && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 p-5">
              <div className="min-w-0">
                <div className="text-[9px] font-bold uppercase tracking-[.18em] text-emerald-700">
                  Layer Detail
                </div>
                <h3 className="mt-1 truncate text-lg font-black text-slate-900">
                  {formatTableName(selectedLayer.name)}
                </h3>
                <div className="mt-1 font-mono text-[9px] text-slate-400">
                  {selectedLayer.name} • registry #{selectedLayer.id}
                </div>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="enterprise-scroll max-h-[calc(92vh-125px)] overflow-auto p-5">
              <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  ["Registry ID", `#${selectedLayer.id}`],
                  ["Section", "mitigasiAdaptasi"],
                  ["Created", formatDate(selectedLayer.createdAt)],
                  ["Features", features.length || "—"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                      {label}
                    </div>
                    <div className="mt-1 truncate text-xs font-extrabold text-slate-800">
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900">
                    Feature Attributes
                  </h4>
                  <p className="mt-0.5 text-[9px] text-slate-400">
                    Dibaca dari endpoint GeoJSON layer yang tersedia.
                  </p>
                </div>

                <button
                  onClick={() => openDetail(selectedLayer)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
                >
                  <RefreshCw size={13} />
                  Reload
                </button>
              </div>

              {geojsonLoading && (
                <div className="rounded-xl border border-slate-200 p-10 text-center">
                  <RefreshCw
                    size={22}
                    className="mx-auto animate-spin text-emerald-600"
                  />
                  <div className="mt-2 text-xs text-slate-500">
                    Membaca data spasial...
                  </div>
                </div>
              )}

              {!geojsonLoading && geojsonError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start gap-2 text-amber-800">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs font-bold">
                        Data atribut belum tersedia
                      </div>
                      <div className="mt-1 text-[10px] leading-relaxed">
                        {geojsonError}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!geojsonLoading && !geojsonError && features.length === 0 && (
                <div className="rounded-xl border border-slate-200 p-10 text-center">
                  <Database size={24} className="mx-auto text-slate-300" />
                  <div className="mt-2 text-xs font-bold text-slate-500">
                    Belum ada feature yang dikembalikan.
                  </div>
                </div>
              )}

              {!geojsonLoading &&
                !geojsonError &&
                features.length > 0 &&
                propertyColumns.length > 0 && (
                  <>
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="min-w-full text-left">
                        <thead className="bg-slate-50">
                          <tr className="border-b border-slate-200">
                            <th className="px-3 py-2 text-[9px] font-black uppercase text-slate-400">
                              #
                            </th>
                            {propertyColumns.map((column) => (
                              <th
                                key={column}
                                className="whitespace-nowrap px-3 py-2 text-[9px] font-black uppercase text-slate-400"
                              >
                                {formatTableName(column)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {visibleFeatureRows.map((feature, index) => (
                            <tr
                              key={`${dataPage}-${index}`}
                              className="border-b border-slate-100 hover:bg-slate-50"
                            >
                              <td className="px-3 py-2 font-mono text-[9px] text-slate-400">
                                {(dataPage - 1) * 12 + index + 1}
                              </td>
                              {propertyColumns.map((column) => (
                                <td
                                  key={column}
                                  className="max-w-[260px] truncate px-3 py-2 text-[10px] text-slate-600"
                                  title={String(
                                    feature.properties?.[column] ?? "",
                                  )}
                                >
                                  {String(feature.properties?.[column] ?? "—")}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <div className="text-[9px] text-slate-400">
                        Menampilkan{" "}
                        {Math.min((dataPage - 1) * 12 + 1, features.length)}–
                        {Math.min(dataPage * 12, features.length)} dari{" "}
                        {features.length} feature.
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          disabled={dataPage <= 1}
                          onClick={() => setDataPage((p) => Math.max(1, p - 1))}
                          className="rounded-lg border border-slate-200 p-2 text-slate-600 disabled:opacity-40"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <span className="px-2 text-[10px] font-bold text-slate-600">
                          {dataPage} / {totalDataPages}
                        </span>
                        <button
                          disabled={dataPage >= totalDataPages}
                          onClick={() =>
                            setDataPage((p) => Math.min(totalDataPages, p + 1))
                          }
                          className="rounded-lg border border-slate-200 p-2 text-slate-600 disabled:opacity-40"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  </>
                )}

              <div className="mt-5 flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-4">
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowDetailModal(false);
                      setShowDeleteModal(true);
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-[10px] font-bold text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={13} />
                    Hapus Layer
                  </button>
                </div>

                <button
                  onClick={() => setShowDetailModal(false)}
                  className="rounded-lg bg-[#064238] px-4 py-2 text-[10px] font-bold text-white"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE MODAL */}
      {showDeleteModal && selectedLayer && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-red-50 p-3 text-red-600">
                <Trash2 size={19} />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  Hapus Layer?
                </h3>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                  Tindakan ini akan menghapus metadata layer dan tabel spasial
                  yang terkait dari database.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3">
              <div className="text-[9px] font-bold uppercase tracking-wide text-red-500">
                Layer
              </div>
              <div className="mt-1 text-xs font-extrabold text-red-900">
                {formatTableName(selectedLayer.name)}
              </div>
              <div className="mt-0.5 font-mono text-[9px] text-red-700">
                {selectedLayer.name}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600"
              >
                Batal
              </button>
              <button
                onClick={confirmDelete}
                className="rounded-lg bg-red-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-red-700"
              >
                Ya, Hapus Layer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MitigasiAdaptasi;
