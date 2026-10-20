import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Database,
  FilePlus2,
  Layers3,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { API_URL } from "./api";

type Section = "kerawanan" | "mitigasiAdaptasi" | "lainnya" | "kejadian";
type LayerStatus = "draft" | "published";

type SpatialLayer = {
  id: string;
  name: string;
  section: Section;
  status: LayerStatus;
  createdAt?: string;
};

const SECTION_LABELS: Record<Section, string> = {
  kerawanan: "Kerawanan",
  mitigasiAdaptasi: "Mitigasi & Adaptasi",
  lainnya: "Lainnya",
  kejadian: "Kejadian",
};

const SECTION_OPTIONS: Section[] = [
  "kerawanan",
  "mitigasiAdaptasi",
  "lainnya",
  "kejadian",
];

const statusLabel = (status: LayerStatus) =>
  status === "published" ? "Published" : "Draft";

const formatDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const readError = async (response: Response) => {
  try {
    const body = await response.json();
    return body.message || body.error || `Permintaan gagal (${response.status})`;
  } catch {
    return `Permintaan gagal (${response.status})`;
  }
};

const IndexDataSpasial: React.FC = () => {
  const navigate = useNavigate();
  const [layers, setLayers] = useState<SpatialLayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | LayerStatus>("all");
  const [sectionFilter, setSectionFilter] = useState<"all" | Section>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const getToken = () =>
    localStorage.getItem("smiti_token") ||
    sessionStorage.getItem("smiti_token") ||
    localStorage.getItem("adminToken") ||
    sessionStorage.getItem("adminToken") ||
    localStorage.getItem("token") ||
    sessionStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token") ||
    localStorage.getItem("authToken") ||
    sessionStorage.getItem("authToken");

  const loadLayers = useCallback(async () => {
    setLoading(true);
    setError("");

    const token = getToken();
    if (!token) {
      setLayers([]);
      setError("Sesi login tidak ditemukan. Silakan login ulang.");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/layers?includeDrafts=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error(await readError(response));

      const payload = await response.json();
      const flattened: SpatialLayer[] = [];

      for (const section of SECTION_OPTIONS) {
        const rows = Array.isArray(payload?.[section]) ? payload[section] : [];

        for (const row of rows) {
          // Abaikan entri agregat/otomatis yang bukan metadata layer terkelola.
          const id = String(row?.id ?? "");
          const status = String(row?.status ?? "").toLowerCase();

          if (!/^\d+$/.test(id)) continue;
          if (status !== "draft" && status !== "published") continue;

          flattened.push({
            id,
            name: String(row?.name || row?.tableName || "Tanpa nama"),
            section,
            status: status as LayerStatus,
            createdAt: row?.createdAt || row?.created_at || undefined,
          });
        }
      }

      // ID metadata menjadi kunci unik; hasil tetap berasal dari API.
      const unique = Array.from(
        new Map(flattened.map((layer) => [layer.id, layer])).values(),
      );
      setLayers(unique);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal memuat katalog data spasial.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLayers();
  }, [loadLayers]);

  const stats = useMemo(
    () => ({
      total: layers.length,
      draft: layers.filter((layer) => layer.status === "draft").length,
      published: layers.filter((layer) => layer.status === "published").length,
      categories: new Set(layers.map((layer) => layer.section)).size,
    }),
    [layers],
  );

  const filteredLayers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return layers
      .filter((layer) => {
        const matchesSearch =
          !query ||
          layer.name.toLowerCase().includes(query) ||
          layer.id.toLowerCase().includes(query);
        const matchesStatus =
          statusFilter === "all" || layer.status === statusFilter;
        const matchesSection =
          sectionFilter === "all" || layer.section === sectionFilter;

        return matchesSearch && matchesStatus && matchesSection;
      })
      .sort((a, b) => a.name.localeCompare(b.name, "id"));
  }, [layers, search, statusFilter, sectionFilter]);

  const updateLayer = async (
    layer: SpatialLayer,
    patch: { status?: LayerStatus; section?: Section },
  ) => {
    const token = getToken();
    if (!token) {
      setError("Sesi login tidak ditemukan. Silakan login ulang.");
      return;
    }

    setBusyId(layer.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `${API_URL}/api/layers/${encodeURIComponent(layer.id)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(patch),
        },
      );

      if (!response.ok) throw new Error(await readError(response));

      if (patch.status === "published") {
        // Setelah status tersimpan di backend, langsung buka peta.
        navigate("/kerawanan", {
          state: { refreshLayers: true, publishedLayer: layer.name },
        });
        return;
      }

      setNotice(`Perubahan data "${layer.name}" berhasil disimpan.`);
      await loadLayers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan perubahan.");
    } finally {
      setBusyId(null);
    }
  };

  const deleteLayer = async (layer: SpatialLayer) => {
    if (
      !window.confirm(
        `Hapus layer "${layer.name}" beserta tabel spasial dan metadata-nya?\n\nTindakan ini tidak dapat dibatalkan.`,
      )
    ) {
      return;
    }

    const token = getToken();
    if (!token) {
      setError("Sesi login tidak ditemukan. Silakan login ulang.");
      return;
    }

    setBusyId(layer.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `${API_URL}/api/layers/${encodeURIComponent(layer.id)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!response.ok) throw new Error(await readError(response));

      setNotice(`Layer "${layer.name}" berhasil dihapus.`);
      await loadLayers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus layer.");
    } finally {
      setBusyId(null);
    }
  };

  const cardClass =
    "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
  const buttonClass =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 text-slate-800 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
              <Database size={15} />
              SIMITI · Data Management
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Indeks Data Spasial
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Kelola katalog layer, status publikasi, dan kategori data spasial
              yang tersimpan di sistem.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void loadLayers()}
              disabled={loading}
              className={`${buttonClass} border border-slate-200 bg-white text-slate-700 hover:bg-slate-100`}
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              Muat Ulang
            </button>
            <button
              type="button"
              onClick={() => navigate("/gis/add-data")}
              className={`${buttonClass} bg-emerald-600 text-white shadow-sm hover:bg-emerald-700`}
            >
              <FilePlus2 size={17} />
              Tambah Data Spasial
              <ArrowRight size={16} />
            </button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            <AlertCircle size={19} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Permintaan belum berhasil</p>
              <p className="mt-1 break-words">{error}</p>
            </div>
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
          >
            <CheckCircle2 size={19} />
            {notice}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className={cardClass}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Total Layer</p>
                <p className="mt-3 text-3xl font-bold text-slate-900">
                  {loading ? "—" : stats.total.toLocaleString("id-ID")}
                </p>
                <p className="mt-2 text-xs text-slate-500">Metadata terkelola</p>
              </div>
              <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
                <Layers3 size={22} />
              </div>
            </div>
          </div>

          <div className={cardClass}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Draft</p>
                <p className="mt-3 text-3xl font-bold text-amber-600">
                  {loading ? "—" : stats.draft.toLocaleString("id-ID")}
                </p>
                <p className="mt-2 text-xs text-slate-500">Menunggu publikasi</p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3 text-amber-700">
                <Activity size={22} />
              </div>
            </div>
          </div>

          <div className={cardClass}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Published</p>
                <p className="mt-3 text-3xl font-bold text-emerald-600">
                  {loading ? "—" : stats.published.toLocaleString("id-ID")}
                </p>
                <p className="mt-2 text-xs text-slate-500">Layer berstatus terbit</p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
                <ShieldCheck size={22} />
              </div>
            </div>
          </div>

          <div className={cardClass}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Kategori Aktif</p>
                <p className="mt-3 text-3xl font-bold text-slate-900">
                  {loading ? "—" : stats.categories.toLocaleString("id-ID")}
                </p>
                <p className="mt-2 text-xs text-slate-500">Dari katalog saat ini</p>
              </div>
              <div className="rounded-xl bg-violet-50 p-3 text-violet-700">
                <Database size={22} />
              </div>
            </div>
          </div>
        </div>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5 sm:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Katalog Layer
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Data ditampilkan berdasarkan metadata yang dikembalikan API.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="relative sm:col-span-1">
                  <Search
                    size={17}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Cari nama layer..."
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>

                <select
                  aria-label="Filter status"
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as "all" | LayerStatus)
                  }
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                >
                  <option value="all">Semua Status</option>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>

                <select
                  aria-label="Filter kategori"
                  value={sectionFilter}
                  onChange={(event) =>
                    setSectionFilter(event.target.value as "all" | Section)
                  }
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                >
                  <option value="all">Semua Kategori</option>
                  {SECTION_OPTIONS.map((section) => (
                    <option key={section} value={section}>
                      {SECTION_LABELS[section]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-semibold">Nama Layer</th>
                  <th className="px-5 py-4 font-semibold">Kategori</th>
                  <th className="px-5 py-4 font-semibold">Dibuat</th>
                  <th className="px-5 py-4 font-semibold">Status</th>
                  <th className="px-5 py-4 text-right font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-16 text-center text-slate-500">
                      <span className="inline-flex items-center gap-2">
                        <LoaderCircle size={18} className="animate-spin" />
                        Memuat katalog dari API...
                      </span>
                    </td>
                  </tr>
                ) : filteredLayers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-16 text-center">
                      <Database size={30} className="mx-auto text-slate-300" />
                      <p className="mt-3 font-semibold text-slate-700">
                        {layers.length === 0
                          ? "Belum ada metadata layer yang dapat ditampilkan"
                          : "Tidak ada layer yang sesuai filter"}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {layers.length === 0
                          ? "Periksa akses API atau tambahkan data spasial."
                          : "Ubah kata kunci atau filter pencarian."}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredLayers.map((layer) => {
                    const busy = busyId === layer.id;

                    return (
                      <tr key={layer.id} className="transition hover:bg-slate-50/80">
                        <td className="px-5 py-4">
                          <div className="font-semibold text-slate-900">
                            {layer.name}
                          </div>
                          <div className="mt-1 text-xs text-slate-400">
                            Metadata ID: {layer.id}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <select
                            aria-label={`Kategori ${layer.name}`}
                            value={layer.section}
                            disabled={busy}
                            onChange={(event) =>
                              void updateLayer(layer, {
                                section: event.target.value as Section,
                              })
                            }
                            className="max-w-[220px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-50"
                          >
                            {SECTION_OPTIONS.map((section) => (
                              <option key={section} value={section}>
                                {SECTION_LABELS[section]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-5 py-4 text-slate-500">
                          {formatDate(layer.createdAt)}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                              layer.status === "published"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                layer.status === "published"
                                  ? "bg-emerald-500"
                                  : "bg-amber-500"
                              }`}
                            />
                            {statusLabel(layer.status)}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-2">
                            {layer.status === "draft" ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void updateLayer(layer, { status: "published" })
                                }
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                              >
                                {busy ? (
                                  <LoaderCircle size={14} className="animate-spin" />
                                ) : (
                                  <Upload size={14} />
                                )}
                                Publikasikan
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void updateLayer(layer, { status: "draft" })
                                }
                                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                              >
                                Jadikan Draft
                              </button>
                            )}
                            <button
                              type="button"
                              title={`Hapus ${layer.name}`}
                              aria-label={`Hapus ${layer.name}`}
                              disabled={busy}
                              onClick={() => void deleteLayer(layer)}
                              className="inline-flex items-center justify-center rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Menampilkan {loading ? "—" : filteredLayers.length} dari{" "}
              {loading ? "—" : layers.length} layer
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck size={14} />
              Perubahan status dan kategori disimpan melalui API
            </span>
          </div>
        </section>
      </div>
    </div>
  );
};

export default IndexDataSpasial;