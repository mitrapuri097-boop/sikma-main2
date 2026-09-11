import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  X,
  XCircle,
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

type RoleStatus = "active" | "inactive";

interface Role {
  id: number;
  name: string;
  description: string | null;
  status: RoleStatus;
  created_at: string;
  updated_at: string;
}

interface RoleForm {
  name: string;
  description: string;
  status: RoleStatus;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ApiResponse<T = unknown> {
  success?: boolean;
  message?: string;
  data?: T;
  pagination?: Pagination;
}

const EMPTY_FORM: RoleForm = {
  name: "",
  description: "",
  status: "active",
};

const PAGE_SIZE = 10;

export default function RoleIndex() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RoleStatus>("all");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [modal, setModal] = useState<
    "create" | "edit" | "view" | "delete" | null
  >(null);

  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  const [form, setForm] = useState<RoleForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  /*
   * ==========================================================
   * AUTH HEADER
   * ==========================================================
   */

  const getAuthHeaders = (): HeadersInit => {
    const token =
      localStorage.getItem("smiti_token") ||
      sessionStorage.getItem("smiti_token");

    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  /*
   * ==========================================================
   * TOAST
   * ==========================================================
   */

  const showToast = (type: "success" | "error", message: string) => {
    setToast({
      type,
      message,
    });

    window.setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  /*
   * ==========================================================
   * LOAD ROLES
   * ==========================================================
   */

  const loadRoles = async (page = pagination.page, showRefresh = false) => {
    try {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const params = new URLSearchParams();

      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));

      if (search.trim()) {
        params.set("search", search.trim());
      }

      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }

      const response = await fetch(
        `${API_URL}/api/roles?${params.toString()}`,
        {
          method: "GET",
          headers: getAuthHeaders(),
        },
      );

      const result: ApiResponse<Role[]> = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(result.message || "Gagal mengambil data role.");
      }

      setRoles(result.data || []);

      setPagination(
        result.pagination || {
          page,
          limit: PAGE_SIZE,
          total: result.data?.length || 0,
          totalPages: 1,
        },
      );
    } catch (err) {
      console.error("LOAD ROLES ERROR:", err);

      const message =
        err instanceof Error ? err.message : "Gagal mengambil data role.";

      setError(message);

      showToast("error", message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  /*
   * ==========================================================
   * INITIAL LOAD
   * ==========================================================
   */

  useEffect(() => {
    loadRoles(1);
  }, []);

  /*
   * ==========================================================
   * SEARCH / FILTER
   * ==========================================================
   */

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadRoles(1);
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [search, statusFilter]);

  /*
   * ==========================================================
   * STATISTICS
   * ==========================================================
   */

  const statistics = useMemo(() => {
    const total = pagination.total;

    const active = roles.filter((role) => role.status === "active").length;

    const inactive = roles.filter((role) => role.status === "inactive").length;

    return {
      total,
      active,
      inactive,
    };
  }, [roles, pagination.total]);

  /*
   * ==========================================================
   * OPEN CREATE
   * ==========================================================
   */

  const openCreate = () => {
    setSelectedRole(null);
    setForm(EMPTY_FORM);
    setModal("create");
  };

  /*
   * ==========================================================
   * OPEN EDIT
   * ==========================================================
   */

  const openEdit = (role: Role) => {
    setSelectedRole(role);

    setForm({
      name: role.name,
      description: role.description || "",
      status: role.status,
    });

    setModal("edit");
  };

  /*
   * ==========================================================
   * OPEN VIEW
   * ==========================================================
   */

  const openView = (role: Role) => {
    setSelectedRole(role);
    setModal("view");
  };

  /*
   * ==========================================================
   * OPEN DELETE
   * ==========================================================
   */

  const openDelete = (role: Role) => {
    setSelectedRole(role);
    setModal("delete");
  };

  /*
   * ==========================================================
   * CLOSE MODAL
   * ==========================================================
   */

  const closeModal = () => {
    if (saving) return;

    setModal(null);
    setSelectedRole(null);
    setForm(EMPTY_FORM);
  };

  /*
   * ==========================================================
   * CREATE / UPDATE
   * ==========================================================
   */

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const cleanName = form.name.trim();
    const cleanDescription = form.description.trim();

    if (!cleanName) {
      showToast("error", "Nama role wajib diisi.");
      return;
    }

    if (cleanName.length < 2) {
      showToast("error", "Nama role minimal 2 karakter.");
      return;
    }

    try {
      setSaving(true);

      const isEdit = modal === "edit";

      const endpoint = isEdit
        ? `${API_URL}/api/roles/${selectedRole?.id}`
        : `${API_URL}/api/roles`;

      const response = await fetch(endpoint, {
        method: isEdit ? "PUT" : "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: cleanName,
          description: cleanDescription || null,
          status: form.status,
        }),
      });

      const result: ApiResponse<Role> = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(
          result.message ||
            (isEdit ? "Gagal memperbarui role." : "Gagal menambahkan role."),
        );
      }

      closeModal();

      showToast(
        "success",
        isEdit ? "Role berhasil diperbarui." : "Role berhasil ditambahkan.",
      );

      await loadRoles(isEdit ? pagination.page : 1, true);
    } catch (err) {
      console.error("SAVE ROLE ERROR:", err);

      showToast(
        "error",
        err instanceof Error ? err.message : "Gagal menyimpan role.",
      );
    } finally {
      setSaving(false);
    }
  };

  /*
   * ==========================================================
   * DELETE
   * ==========================================================
   */

  const handleDelete = async () => {
    if (!selectedRole) return;

    try {
      setSaving(true);

      const response = await fetch(`${API_URL}/api/roles/${selectedRole.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      const result: ApiResponse = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(result.message || "Gagal menghapus role.");
      }

      closeModal();

      showToast("success", "Role berhasil dihapus.");

      const targetPage =
        roles.length === 1 && pagination.page > 1
          ? pagination.page - 1
          : pagination.page;

      await loadRoles(targetPage, true);
    } catch (err) {
      console.error("DELETE ROLE ERROR:", err);

      showToast(
        "error",
        err instanceof Error ? err.message : "Gagal menghapus role.",
      );
    } finally {
      setSaving(false);
    }
  };

  /*
   * ==========================================================
   * DATE FORMAT
   * ==========================================================
   */

  const formatDate = (value: string) => {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  /*
   * ==========================================================
   * STATUS BADGE
   * ==========================================================
   */

  const StatusBadge = ({ status }: { status: RoleStatus }) => {
    const active = status === "active";

    return (
      <span
        className={`
          inline-flex
          items-center
          gap-1.5
          rounded-full
          border
          px-2.5
          py-1
          text-[11px]
          font-bold
          uppercase
          tracking-wide
          ${
            active
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-slate-200 bg-slate-100 text-slate-600"
          }
        `}
      >
        {active ? <CheckCircle2 size={12} /> : <XCircle size={12} />}

        {active ? "Active" : "Inactive"}
      </span>
    );
  };

  /*
   * ==========================================================
   * RENDER
   * ==========================================================
   */

  return (
    <div className="min-h-screen bg-slate-50">
      {/* TOAST */}

      {toast && (
        <div className="fixed right-6 top-6 z-[100]">
          <div
            className={`
              flex
              max-w-sm
              items-center
              gap-3
              rounded-2xl
              border
              bg-white
              px-4
              py-3
              shadow-2xl
              ${
                toast.type === "success"
                  ? "border-emerald-200"
                  : "border-red-200"
              }
            `}
          >
            {toast.type === "success" ? (
              <CheckCircle2 size={20} className="text-emerald-600" />
            ) : (
              <XCircle size={20} className="text-red-600" />
            )}

            <span className="text-sm font-semibold text-slate-700">
              {toast.message}
            </span>

            <button
              type="button"
              onClick={() => setToast(null)}
              className="ml-2 text-slate-400 hover:text-slate-700"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* PAGE */}

      <div className="mx-auto max-w-[1600px] p-5 sm:p-7 lg:p-8">
        {/* HEADER */}

        <div className="mb-7 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">
              <Shield size={15} />
              System Administration
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Role Management
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Kelola role dan status akses pengguna pada SIMITI Enterprise GIS.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => loadRoles(pagination.page, true)}
              disabled={refreshing}
              className="
                inline-flex
                h-11
                items-center
                justify-center
                gap-2
                rounded-xl
                border
                border-slate-200
                bg-white
                px-4
                text-sm
                font-bold
                text-slate-700
                shadow-sm
                transition
                hover:border-slate-300
                hover:bg-slate-50
                disabled:cursor-not-allowed
                disabled:opacity-60
              "
            >
              <RefreshCw
                size={16}
                className={refreshing ? "animate-spin" : ""}
              />
              Refresh
            </button>

            <button
              type="button"
              onClick={openCreate}
              className="
                inline-flex
                h-11
                items-center
                justify-center
                gap-2
                rounded-xl
                bg-emerald-600
                px-5
                text-sm
                font-bold
                text-white
                shadow-lg
                shadow-emerald-600/20
                transition
                hover:bg-emerald-700
              "
            >
              <Plus size={17} />
              Tambah Role
            </button>
          </div>
        </div>

        {/* STATISTICS */}

        <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Total Role
                </p>

                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {statistics.total}
                </p>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                <Shield size={20} />
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-400">
              Seluruh role terdaftar
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-600">
                  Active
                </p>

                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {statistics.active}
                </p>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 size={20} />
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-400">
              Role aktif pada halaman ini
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Inactive
                </p>

                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {statistics.inactive}
                </p>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                <Activity size={20} />
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-400">
              Role tidak aktif pada halaman ini
            </p>
          </div>
        </div>

        {/* MAIN CARD */}

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* TOOLBAR */}

          <div className="border-b border-slate-100 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full lg:max-w-md">
                <Search
                  size={17}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cari nama atau deskripsi role..."
                  className="
                    h-11
                    w-full
                    rounded-xl
                    border
                    border-slate-200
                    bg-slate-50
                    pl-11
                    pr-4
                    text-sm
                    text-slate-900
                    outline-none
                    transition
                    placeholder:text-slate-400
                    focus:border-emerald-500
                    focus:bg-white
                    focus:ring-4
                    focus:ring-emerald-500/10
                  "
                />
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as "all" | RoleStatus)
                  }
                  className="
                    h-11
                    rounded-xl
                    border
                    border-slate-200
                    bg-white
                    px-4
                    text-sm
                    font-semibold
                    text-slate-700
                    outline-none
                    focus:border-emerald-500
                    focus:ring-4
                    focus:ring-emerald-500/10
                  "
                >
                  <option value="all">Semua Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>

          {/* ERROR */}

          {error && !loading && (
            <div className="m-5 flex items-center justify-between gap-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
              <div className="flex items-center gap-3">
                <XCircle size={18} className="shrink-0 text-red-600" />

                <p className="text-sm font-semibold text-red-700">{error}</p>
              </div>

              <button
                type="button"
                onClick={() => loadRoles(pagination.page, true)}
                className="text-sm font-bold text-red-700 hover:text-red-900"
              >
                Coba lagi
              </button>
            </div>
          )}

          {/* TABLE */}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <th className="px-5 py-4 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Role
                  </th>

                  <th className="px-5 py-4 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Deskripsi
                  </th>

                  <th className="px-5 py-4 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Status
                  </th>

                  <th className="px-5 py-4 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Updated
                  </th>

                  <th className="px-5 py-4 text-right text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Aksi
                  </th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <tr key={index} className="border-b border-slate-100">
                      <td colSpan={5} className="px-5 py-5">
                        <div className="h-5 animate-pulse rounded-lg bg-slate-100" />
                      </td>
                    </tr>
                  ))
                ) : roles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-16 text-center">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                        <Shield size={25} />
                      </div>

                      <h3 className="mt-4 text-sm font-bold text-slate-700">
                        Belum ada role
                      </h3>

                      <p className="mt-1 text-sm text-slate-400">
                        Tidak ada data yang sesuai dengan pencarian.
                      </p>

                      <button
                        type="button"
                        onClick={openCreate}
                        className="mt-5 text-sm font-bold text-emerald-600 hover:text-emerald-700"
                      >
                        + Tambah role baru
                      </button>
                    </td>
                  </tr>
                ) : (
                  roles.map((role) => (
                    <tr
                      key={role.id}
                      className="border-b border-slate-100 transition hover:bg-slate-50/70"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                            <Shield size={18} />
                          </div>

                          <div>
                            <div className="font-bold text-slate-800">
                              {role.name}
                            </div>

                            <div className="mt-0.5 text-xs text-slate-400">
                              ID #{role.id}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="max-w-md px-5 py-4">
                        <p className="truncate text-sm text-slate-600">
                          {role.description || "Tidak ada deskripsi"}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <StatusBadge status={role.status} />
                      </td>

                      <td className="px-5 py-4 text-sm text-slate-500">
                        {formatDate(role.updated_at)}
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openView(role)}
                            title="Lihat detail"
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                          >
                            <Eye size={17} />
                          </button>

                          <button
                            type="button"
                            onClick={() => openEdit(role)}
                            title="Edit role"
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600"
                          >
                            <Edit3 size={17} />
                          </button>

                          <button
                            type="button"
                            onClick={() => openDelete(role)}
                            title="Hapus role"
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* PAGINATION */}

          {!loading && roles.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-medium text-slate-500">
                Menampilkan{" "}
                <span className="font-bold text-slate-700">
                  {(pagination.page - 1) * pagination.limit + 1}
                </span>{" "}
                -{" "}
                <span className="font-bold text-slate-700">
                  {Math.min(
                    pagination.page * pagination.limit,
                    pagination.total,
                  )}
                </span>{" "}
                dari{" "}
                <span className="font-bold text-slate-700">
                  {pagination.total}
                </span>{" "}
                role
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pagination.page <= 1}
                  onClick={() => loadRoles(pagination.page - 1)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={17} />
                </button>

                <div className="min-w-[90px] text-center text-xs font-bold text-slate-600">
                  Page {pagination.page} / {pagination.totalPages}
                </div>

                <button
                  type="button"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => loadRoles(pagination.page + 1)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CREATE / EDIT MODAL */}

      {(modal === "create" || modal === "edit") && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {modal === "create" ? "Tambah Role" : "Edit Role"}
                </h2>

                <p className="mt-1 text-xs text-slate-400">
                  Kelola informasi dasar role sistem.
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 p-6">
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Nama Role
                </label>

                <input
                  type="text"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Contoh: Administrator"
                  autoFocus
                  className="
                    h-12
                    w-full
                    rounded-xl
                    border
                    border-slate-200
                    bg-slate-50
                    px-4
                    text-sm
                    text-slate-900
                    outline-none
                    focus:border-emerald-500
                    focus:bg-white
                    focus:ring-4
                    focus:ring-emerald-500/10
                  "
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Deskripsi
                </label>

                <textarea
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Jelaskan fungsi dan cakupan role..."
                  rows={4}
                  className="
                    w-full
                    resize-none
                    rounded-xl
                    border
                    border-slate-200
                    bg-slate-50
                    px-4
                    py-3
                    text-sm
                    text-slate-900
                    outline-none
                    focus:border-emerald-500
                    focus:bg-white
                    focus:ring-4
                    focus:ring-emerald-500/10
                  "
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Status
                </label>

                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as RoleStatus,
                    }))
                  }
                  className="
                    h-12
                    w-full
                    rounded-xl
                    border
                    border-slate-200
                    bg-slate-50
                    px-4
                    text-sm
                    font-semibold
                    text-slate-700
                    outline-none
                    focus:border-emerald-500
                    focus:bg-white
                    focus:ring-4
                    focus:ring-emerald-500/10
                  "
                >
                  <option value="active">Active</option>

                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving && <RefreshCw size={16} className="animate-spin" />}

                  {saving
                    ? "Menyimpan..."
                    : modal === "create"
                      ? "Simpan Role"
                      : "Simpan Perubahan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW MODAL */}

      {modal === "view" && selectedRole && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Detail Role
                </h2>

                <p className="mt-1 text-xs text-slate-400">
                  Informasi lengkap role.
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 p-6">
              <div className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                  <Shield size={22} />
                </div>

                <div>
                  <div className="text-lg font-bold text-slate-900">
                    {selectedRole.name}
                  </div>

                  <div className="text-xs text-slate-400">
                    Role ID #{selectedRole.id}
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Deskripsi
                </p>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {selectedRole.description || "Tidak ada deskripsi."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Status
                  </p>

                  <div className="mt-2">
                    <StatusBadge status={selectedRole.status} />
                  </div>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Dibuat
                  </p>

                  <p className="mt-2 text-sm font-semibold text-slate-700">
                    {formatDate(selectedRole.created_at)}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Terakhir Diubah
                </p>

                <p className="mt-2 text-sm font-semibold text-slate-700">
                  {formatDate(selectedRole.updated_at)}
                </p>
              </div>

              <div className="flex justify-end border-t border-slate-100 pt-5">
                <button
                  type="button"
                  onClick={closeModal}
                  className="h-11 rounded-xl bg-slate-900 px-6 text-sm font-bold text-white hover:bg-slate-800"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE MODAL */}

      {modal === "delete" && selectedRole && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                <Trash2 size={22} />
              </div>

              <h2 className="mt-5 text-lg font-bold text-slate-900">
                Hapus Role?
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Role{" "}
                <span className="font-bold text-slate-800">
                  {selectedRole.name}
                </span>{" "}
                akan dihapus secara permanen.
              </p>

              <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs leading-5 text-amber-700">
                Pastikan role ini tidak sedang digunakan oleh user sebelum
                menghapusnya.
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>

                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving && <RefreshCw size={16} className="animate-spin" />}

                  {saving ? "Menghapus..." : "Ya, Hapus Role"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
