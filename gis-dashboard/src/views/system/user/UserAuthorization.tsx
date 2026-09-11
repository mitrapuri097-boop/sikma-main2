import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  Filter,
  Layers3,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";

type PermissionKey =
  | "can_view"
  | "can_query"
  | "can_export"
  | "can_download"
  | "can_manage";

type PermissionState = Record<PermissionKey, boolean>;

type Layer = {
  id: number;
  table_name: string;
  section: string;
  original_files?: string[] | null;
  created_at?: string;
  updated_at?: string;
};

type User = {
  id: number;
  username: string;
  email?: string;
  full_name?: string;
  role_id?: number | null;
  role_name?: string;
  organization_id?: number | null;
  unit_id?: number | null;
  status?: string;
};

type AuthorizationRow = PermissionState & {
  id?: number;
  user_id: number;
  layer_id: number;
};

type CatalogResponse = {
  success: boolean;
  data?: {
    layers: Layer[];
    users: User[];
    statistics?: Record<string, number>;
  };
  message?: string;
};

const API_BASE =
  (import.meta as ImportMeta & { env?: Record<string, string> }).env
    ?.VITE_API_URL || "http://localhost:3001";

const EMPTY_PERMISSIONS: PermissionState = {
  can_view: false,
  can_query: false,
  can_export: false,
  can_download: false,
  can_manage: false,
};

const PERMISSIONS: Array<{
  key: PermissionKey;
  label: string;
  description: string;
}> = [
  { key: "can_view", label: "View", description: "Melihat layer" },
  { key: "can_query", label: "Query", description: "Spatial/data query" },
  { key: "can_export", label: "Export", description: "Export hasil data" },
  { key: "can_download", label: "Download", description: "Unduh data" },
  { key: "can_manage", label: "Manage", description: "Kelola data layer" },
];


function getToken() {
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    localStorage.getItem("authToken") ||
    ""
  );
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);

  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload?.message
        ? payload.message
        : `HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

function makeKey(layerId: number) {
  return String(layerId);
}

function emptyPermissions(): PermissionState {
  return { ...EMPTY_PERMISSIONS };
}

export default function UserAuthorization() {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<number | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [authorization, setAuthorization] = useState<Record<string, PermissionState>>({});
  const [savedAuthorization, setSavedAuthorization] = useState<Record<string, PermissionState>>({});
  const [layerSearch, setLayerSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const result = await apiFetch<CatalogResponse>("/api/user-authorizations/catalog");
      const nextLayers = result.data?.layers || [];
      const nextUsers = result.data?.users || [];
      setLayers(nextLayers);
      setUsers(nextUsers);

      if (selectedLayerId === null || !nextLayers.some((item) => item.id === selectedLayerId)) {
        setSelectedLayerId(nextLayers[0]?.id ?? null);
      }
      if (selectedUserId === null || !nextUsers.some((item) => item.id === selectedUserId)) {
        setSelectedUserId(nextUsers[0]?.id ?? null);
      }

      const sections = Array.from(new Set(nextLayers.map((item) => item.section || "lainnya")));
      setExpandedSections(Object.fromEntries(sections.map((section) => [section, true])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengambil catalog.");
    } finally {
      setLoading(false);
    }
  }, [selectedLayerId, selectedUserId]);

  const loadUserAuthorization = useCallback(async () => {
    if (!selectedUserId) {
      setAuthorization({});
      setSavedAuthorization({});
      return;
    }
    try {
      const result = await apiFetch<{
        success: boolean;
        data?: AuthorizationRow[];
        message?: string;
      }>(`/api/user-authorizations/user/${selectedUserId}`);

      const map: Record<string, PermissionState> = {};
      (result.data || []).forEach((row) => {
        map[makeKey(row.layer_id)] = {
          can_view: Boolean(row.can_view),
          can_query: Boolean(row.can_query),
          can_export: Boolean(row.can_export),
          can_download: Boolean(row.can_download),
          can_manage: Boolean(row.can_manage),
        };
      });
      setAuthorization(map);
      setSavedAuthorization(structuredClone(map));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengambil authorization user.");
    }
  }, [selectedUserId]);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);
  useEffect(() => { void loadUserAuthorization(); }, [loadUserAuthorization]);

  const selectedLayer = useMemo(
    () => layers.find((item) => item.id === selectedLayerId) || null,
    [layers, selectedLayerId],
  );
  const selectedUser = useMemo(
    () => users.find((item) => item.id === selectedUserId) || null,
    [users, selectedUserId],
  );
  const sections = useMemo(() => {
    const result = new Set(layers.map((item) => item.section || "lainnya"));
    return ["all", ...Array.from(result)];
  }, [layers]);

  const filteredLayers = useMemo(() => {
    const keyword = layerSearch.trim().toLowerCase();
    return layers.filter((layer) => {
      const sectionOk = sectionFilter === "all" || (layer.section || "lainnya") === sectionFilter;
      const keywordOk =
        !keyword ||
        layer.table_name.toLowerCase().includes(keyword) ||
        (layer.section || "").toLowerCase().includes(keyword);
      return sectionOk && keywordOk;
    });
  }, [layers, layerSearch, sectionFilter]);

  const filteredUsers = useMemo(() => {
    const keyword = userSearch.trim().toLowerCase();
    return users.filter((user) => {
      if (!keyword) return true;
      return [user.username, user.full_name, user.email, user.role_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    });
  }, [users, userSearch]);

  const groupedLayers = useMemo(() => {
    const groups = new Map<string, Layer[]>();
    filteredLayers.forEach((layer) => {
      const section = layer.section || "lainnya";
      const list = groups.get(section) || [];
      list.push(layer);
      groups.set(section, list);
    });
    return Array.from(groups.entries());
  }, [filteredLayers]);

  const currentPermissions = selectedLayerId
    ? authorization[makeKey(selectedLayerId)] || emptyPermissions()
    : emptyPermissions();

  const setPermission = (key: PermissionKey, value: boolean) => {
    if (!selectedLayerId) return;
    setAuthorization((current) => ({
      ...current,
      [makeKey(selectedLayerId)]: {
        ...(current[makeKey(selectedLayerId)] || emptyPermissions()),
        [key]: value,
      },
    }));
    setNotice("");
  };

  const setAllPermissions = (value: boolean) => {
    if (!selectedLayerId) return;
    setAuthorization((current) => ({
      ...current,
      [makeKey(selectedLayerId)]: {
        can_view: value,
        can_query: value,
        can_export: value,
        can_download: value,
        can_manage: value,
      },
    }));
    setNotice("");
  };

  const selectLayer = (layerId: number) => {
    setSelectedLayerId(layerId);
    setNotice("");
  };
  const selectUser = (userId: number) => {
    setSelectedUserId(userId);
    setNotice("");
  };

  const isDirty = useMemo(() => {
    const allKeys = new Set([...Object.keys(authorization), ...Object.keys(savedAuthorization)]);
    for (const key of allKeys) {
      const current = authorization[key] || emptyPermissions();
      const saved = savedAuthorization[key] || emptyPermissions();
      if (PERMISSIONS.some(({ key: permission }) => current[permission] !== saved[permission])) return true;
    }
    return false;
  }, [authorization, savedAuthorization]);

  const saveAll = async () => {
    if (!selectedUserId) {
      setError("Pilih user terlebih dahulu.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const assignments = layers.map((layer) => ({
        layer_id: layer.id,
        ...(authorization[makeKey(layer.id)] || emptyPermissions()),
      }));
      await apiFetch(`/api/user-authorizations/user/${selectedUserId}/bulk`, {
        method: "PUT",
        body: JSON.stringify({ assignments }),
      });
      setSavedAuthorization(structuredClone(authorization));
      setNotice("Seluruh authorization user berhasil disimpan.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan authorization.");
    } finally {
      setSaving(false);
    }
  };

  const resetChanges = () => {
    setAuthorization(structuredClone(savedAuthorization));
    setNotice("Perubahan yang belum disimpan dibatalkan.");
    setError("");
  };

  const revokeSelected = async () => {
    if (!selectedUserId || !selectedLayerId) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await apiFetch(`/api/user-authorizations/${selectedUserId}/${selectedLayerId}`, { method: "DELETE" });
      const next = { ...authorization };
      delete next[makeKey(selectedLayerId)];
      setAuthorization(next);
      setSavedAuthorization(structuredClone(next));
      setNotice("Authorization layer berhasil dicabut.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authorization belum ada atau gagal dicabut.");
    } finally {
      setSaving(false);
    }
  };

  const formatSection = (value: string) =>
    value
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());

  return (
    <div className="min-h-full w-full bg-slate-50/60 p-1 text-slate-900">
      {/* Enterprise page header */}
      <div className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col gap-5 px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-900/10">
              <ShieldCheck size={23} strokeWidth={2} />
              <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
            </div>
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  SYSTEM / ACCESS CONTROL
                </span>
                {isDirty && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 ring-1 ring-inset ring-amber-200">
                    Unsaved
                  </span>
                )}
              </div>
              <h1 className="truncate text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
                User Authorization
              </h1>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                Kelola hak akses pengguna terhadap layer data SIMITI secara terpusat.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={resetChanges}
              disabled={!isDirty || saving}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <X size={15} />
              Reset
            </button>
            <button
              type="button"
              onClick={() => void loadCatalog()}
              disabled={loading || saving}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-40"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void saveAll()}
              disabled={!selectedUserId || saving || loading}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white shadow-md shadow-slate-900/10 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save size={15} />
              {saving ? "Menyimpan..." : "Simpan Perubahan"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 border-t border-slate-100 bg-slate-50/70 sm:grid-cols-4">
          <div className="border-r border-slate-100 px-5 py-3">
            <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">Layers</div>
            <div className="mt-0.5 text-sm font-bold text-slate-800">{layers.length}</div>
          </div>
          <div className="border-r border-slate-100 px-5 py-3">
            <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">Users</div>
            <div className="mt-0.5 text-sm font-bold text-slate-800">{users.length}</div>
          </div>
          <div className="border-r border-slate-100 px-5 py-3">
            <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">Selected Layer</div>
            <div className="mt-0.5 truncate text-sm font-bold text-slate-800">{selectedLayer?.table_name || "—"}</div>
          </div>
          <div className="px-5 py-3">
            <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">Selected User</div>
            <div className="mt-0.5 truncate text-sm font-bold text-slate-800">{selectedUser?.username || "—"}</div>
          </div>
        </div>
      </div>

      {(error || notice) && (
        <div
          className={`mb-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-sm ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${error ? "bg-red-500" : "bg-emerald-500"}`} />
          <span>{error || notice}</span>
        </div>
      )}

      {/* Main enterprise workspace */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
        <div className="grid min-h-[650px] grid-cols-1 xl:grid-cols-[300px_320px_minmax(0,1fr)]">
          {/* Layers */}
          <section className="min-w-0 border-b border-slate-200 xl:border-b-0 xl:border-r">
            <div className="border-b border-slate-200 bg-white px-4 py-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                    <Layers3 size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-extrabold uppercase tracking-wider text-slate-800">Layer Catalog</div>
                    <div className="mt-0.5 text-[10px] text-slate-400">{filteredLayers.length} dari {layers.length} layer</div>
                  </div>
                </div>
                <Database size={16} className="text-slate-300" />
              </div>

              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={layerSearch}
                  onChange={(event) => setLayerSearch(event.target.value)}
                  placeholder="Cari nama layer..."
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-100"
                />
              </div>

              <div className="mt-2 flex items-center gap-2">
                <Filter size={13} className="shrink-0 text-slate-400" />
                <select
                  value={sectionFilter}
                  onChange={(event) => setSectionFilter(event.target.value)}
                  className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-semibold text-slate-600 outline-none focus:border-slate-400 focus:bg-white"
                >
                  {sections.map((section) => (
                    <option key={section} value={section}>
                      {section === "all" ? "Semua section" : formatSection(section)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="max-h-[550px] overflow-y-auto p-2.5">
              {groupedLayers.length === 0 && (
                <div className="px-4 py-12 text-center">
                  <Layers3 size={28} className="mx-auto text-slate-200" />
                  <p className="mt-3 text-xs font-semibold text-slate-500">Layer tidak ditemukan</p>
                  <p className="mt-1 text-[10px] text-slate-400">Coba ubah kata kunci pencarian.</p>
                </div>
              )}

              {groupedLayers.map(([section, sectionLayers]) => {
                const expanded = expandedSections[section] !== false;

                return (
                  <div key={section} className="mb-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedSections((current) => ({
                          ...current,
                          [section]: !expanded,
                        }))
                      }
                      className="group flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition hover:bg-slate-50"
                    >
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-300 group-hover:bg-slate-500" />
                        <span className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
                          {formatSection(section)}
                        </span>
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-400">
                          {sectionLayers.length}
                        </span>
                      </span>
                      {expanded ? <ChevronDown size={14} className="text-slate-300" /> : <ChevronRight size={14} className="text-slate-300" />}
                    </button>

                    {expanded &&
                      sectionLayers.map((layer) => {
                        const active = selectedLayerId === layer.id;
                        const permissions = authorization[makeKey(layer.id)] || emptyPermissions();
                        const hasAccess = Object.values(permissions).some(Boolean);

                        return (
                          <button
                            key={layer.id}
                            type="button"
                            onClick={() => selectLayer(layer.id)}
                            className={`group mb-1 flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2.5 text-left transition ${
                              active
                                ? "border-slate-900 bg-slate-950 text-white shadow-md shadow-slate-900/10"
                                : "border-transparent bg-white text-slate-700 hover:border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                              active ? "bg-white/10 text-white" : "bg-slate-100 text-slate-500"
                            }`}>
                              <Layers3 size={15} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[11px] font-bold">{layer.table_name}</div>
                              <div className={`mt-0.5 text-[9px] ${active ? "text-slate-400" : "text-slate-400"}`}>Layer ID · {layer.id}</div>
                            </div>
                            <span className={`h-2 w-2 shrink-0 rounded-full ${
                              hasAccess
                                ? active ? "bg-emerald-300" : "bg-emerald-500"
                                : active ? "bg-white/20" : "bg-slate-200"
                            }`} />
                          </button>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Users */}
          <section className="min-w-0 border-b border-slate-200 xl:border-b-0 xl:border-r">
            <div className="border-b border-slate-200 bg-white px-4 py-4">
              <div className="mb-3 flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                  <UserRound size={16} />
                </div>
                <div>
                  <div className="text-xs font-extrabold uppercase tracking-wider text-slate-800">User Directory</div>
                  <div className="mt-0.5 text-[10px] text-slate-400">{filteredUsers.length} dari {users.length} user</div>
                </div>
              </div>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  placeholder="Cari user, nama, atau role..."
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-100"
                />
              </div>
            </div>

            <div className="max-h-[550px] overflow-y-auto p-2.5">
              {filteredUsers.length === 0 && (
                <div className="px-4 py-12 text-center">
                  <UserRound size={28} className="mx-auto text-slate-200" />
                  <p className="mt-3 text-xs font-semibold text-slate-500">User tidak ditemukan</p>
                </div>
              )}

              {filteredUsers.map((user) => {
                const active = selectedUserId === user.id;

                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => selectUser(user.id)}
                    className={`group mb-1.5 flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                      active
                        ? "border-slate-900 bg-slate-950 text-white shadow-md shadow-slate-900/10"
                        : "border-transparent bg-white hover:border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                      active ? "bg-white/10 text-white" : "bg-slate-100 text-slate-600"
                    }`}>
                      {(user.full_name || user.username || "?").slice(0, 1).toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-bold">{user.full_name || user.username}</div>
                      <div className={`truncate text-[10px] ${active ? "text-slate-400" : "text-slate-500"}`}>
                        @{user.username}
                      </div>
                      <div className={`mt-1 inline-flex rounded-md px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wide ${
                        active ? "bg-white/10 text-slate-300" : "bg-slate-100 text-slate-500"
                      }`}>
                        {user.role_name || "Tanpa Role"}
                      </div>
                    </div>

                    <span className={`h-2 w-2 shrink-0 rounded-full ${
                      user.status === "active"
                        ? active ? "bg-emerald-300" : "bg-emerald-500"
                        : active ? "bg-slate-400" : "bg-slate-200"
                    }`} />
                  </button>
                );
              })}
            </div>
          </section>

          {/* Authorization detail */}
          <section className="min-w-0 bg-slate-50/50">
            <div className="border-b border-slate-200 bg-white px-5 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">
                    <ShieldCheck size={17} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-slate-400">Permission Matrix</div>
                    <div className="mt-0.5 truncate text-sm font-bold text-slate-900">
                      {selectedLayer?.table_name || "Pilih layer"}
                    </div>
                    <div className="truncate text-[10px] text-slate-500">
                      User · {selectedUser?.full_name || selectedUser?.username || "Pilih user"}
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAllPermissions(true)}
                    disabled={!selectedLayerId || !selectedUserId}
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-40"
                  >
                    Allow All
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllPermissions(false)}
                    disabled={!selectedLayerId || !selectedUserId}
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-40"
                  >
                    Deny All
                  </button>
                </div>
              </div>
            </div>

            <div className="p-5">
              {!selectedLayer || !selectedUser ? (
                <div className="flex min-h-[500px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white">
                  <div className="max-w-xs text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-300">
                      <ShieldCheck size={27} />
                    </div>
                    <p className="mt-4 text-sm font-bold text-slate-600">Pilih layer dan user</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      Permission matrix akan tampil setelah objek akses dipilih.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Selection context */}
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
                      <div className="text-[8px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Layer</div>
                      <div className="mt-1 truncate text-xs font-bold text-slate-800">{selectedLayer.table_name}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
                      <div className="text-[8px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Section</div>
                      <div className="mt-1 truncate text-xs font-bold text-slate-800">{formatSection(selectedLayer.section || "lainnya")}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
                      <div className="text-[8px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Role</div>
                      <div className="mt-1 truncate text-xs font-bold text-slate-800">{selectedUser.role_name || "Tanpa Role"}</div>
                    </div>
                  </div>

                  {/* Permission table */}
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="grid grid-cols-[1fr_90px] border-b border-slate-200 bg-slate-50/80 px-4 py-3">
                      <span className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Permission</span>
                      <span className="text-center text-[9px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Access</span>
                    </div>

                    {PERMISSIONS.map(({ key, label, description }) => {
                      const checked = Boolean(currentPermissions[key]);

                      return (
                        <label
                          key={key}
                          className="grid cursor-pointer grid-cols-[1fr_90px] items-center border-b border-slate-100 px-4 py-4 transition last:border-b-0 hover:bg-slate-50/80"
                        >
                          <span className="min-w-0">
                            <span className="block text-xs font-bold text-slate-800">{label}</span>
                            <span className="mt-0.5 block text-[10px] text-slate-400">{description}</span>
                          </span>
                          <span className="flex justify-center">
                            <span className={`flex h-9 w-9 items-center justify-center rounded-xl border transition ${
                              checked
                                ? "border-emerald-200 bg-emerald-50"
                                : "border-slate-200 bg-slate-50"
                            }`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) => setPermission(key, event.target.checked)}
                                className="h-4 w-4 cursor-pointer rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                              />
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  {/* Sync status */}
                  <div className={`flex flex-col gap-3 rounded-xl border p-3.5 sm:flex-row sm:items-center sm:justify-between ${
                    isDirty ? "border-amber-200 bg-amber-50/60" : "border-emerald-200 bg-emerald-50/60"
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                        isDirty ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                      }`}>
                        <Check size={15} />
                      </div>
                      <div>
                        <div className={`text-xs font-bold ${isDirty ? "text-amber-800" : "text-emerald-800"}`}>
                          {isDirty ? "Perubahan belum disimpan" : "Authorization tersinkron"}
                        </div>
                        <div className={`mt-0.5 text-[10px] ${isDirty ? "text-amber-600" : "text-emerald-600"}`}>
                          {isDirty
                            ? "Simpan perubahan untuk menerapkan konfigurasi ke database."
                            : "Konfigurasi permission saat ini sesuai dengan database."}
                        </div>
                      </div>
                    </div>
                    <span className={`self-start rounded-full px-2.5 py-1 text-[9px] font-extrabold tracking-wide sm:self-auto ${
                      isDirty ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                    }`}>
                      {isDirty ? "UNSAVED" : "SYNCED"}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={() => void revokeSelected()}
                      disabled={saving}
                      className="h-9 rounded-lg border border-red-200 bg-white px-3.5 text-[10px] font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-40"
                    >
                      Cabut Authorization Layer
                    </button>

                    <button
                      type="button"
                      onClick={() => void saveAll()}
                      disabled={!isDirty || saving}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-[10px] font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Save size={14} />
                      Simpan Perubahan
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>

  );
}
