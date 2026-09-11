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
  const [authorization, setAuthorization] = useState<
    Record<string, PermissionState>
  >({});
  const [savedAuthorization, setSavedAuthorization] = useState<
    Record<string, PermissionState>
  >({});
  const [layerSearch, setLayerSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({});

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const result = await apiFetch<CatalogResponse>(
        "/api/user-authorizations/catalog",
      );

      const nextLayers = result.data?.layers || [];
      const nextUsers = result.data?.users || [];

      setLayers(nextLayers);
      setUsers(nextUsers);

      if (
        selectedLayerId === null ||
        !nextLayers.some((item) => item.id === selectedLayerId)
      ) {
        setSelectedLayerId(nextLayers[0]?.id ?? null);
      }

      if (
        selectedUserId === null ||
        !nextUsers.some((item) => item.id === selectedUserId)
      ) {
        setSelectedUserId(nextUsers[0]?.id ?? null);
      }

      const sections = Array.from(
        new Set(nextLayers.map((item) => item.section || "lainnya")),
      );
      setExpandedSections(
        Object.fromEntries(sections.map((section) => [section, true])),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal mengambil catalog.",
      );
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
      setError(
        err instanceof Error
          ? err.message
          : "Gagal mengambil authorization user.",
      );
    }
  }, [selectedUserId]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    void loadUserAuthorization();
  }, [loadUserAuthorization]);

  const selectedLayer = useMemo(
    () => layers.find((item) => item.id === selectedLayerId) || null,
    [layers, selectedLayerId],
  );

  const selectedUser = useMemo(
    () => users.find((item) => item.id === selectedUserId) || null,
    [users, selectedUserId],
  );

  const sections = useMemo(() => {
    const result = new Set(
      layers.map((item) => item.section || "lainnya"),
    );
    return ["all", ...Array.from(result)];
  }, [layers]);

  const filteredLayers = useMemo(() => {
    const keyword = layerSearch.trim().toLowerCase();

    return layers.filter((layer) => {
      const sectionOk =
        sectionFilter === "all" ||
        (layer.section || "lainnya") === sectionFilter;

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
      return [
        user.username,
        user.full_name,
        user.email,
        user.role_name,
      ]
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
    const allKeys = new Set([
      ...Object.keys(authorization),
      ...Object.keys(savedAuthorization),
    ]);

    for (const key of allKeys) {
      const current = authorization[key] || emptyPermissions();
      const saved = savedAuthorization[key] || emptyPermissions();

      if (PERMISSIONS.some(({ key: permission }) => current[permission] !== saved[permission])) {
        return true;
      }
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
      setError(
        err instanceof Error
          ? err.message
          : "Gagal menyimpan authorization.",
      );
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
      await apiFetch(
        `/api/user-authorizations/${selectedUserId}/${selectedLayerId}`,
        { method: "DELETE" },
      );

      const next = { ...authorization };
      delete next[makeKey(selectedLayerId)];

      setAuthorization(next);
      setSavedAuthorization(structuredClone(next));
      setNotice("Authorization layer berhasil dicabut.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Authorization belum ada atau gagal dicabut.",
      );
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
    <div className="w-full space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                User Authorization
              </h1>
              <p className="text-sm text-slate-500">
                Kelola hak akses user terhadap layer data SIMITI.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={resetChanges}
            disabled={!isDirty || saving}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={16} />
            Reset
          </button>

          <button
            type="button"
            onClick={() => void loadCatalog()}
            disabled={loading || saving}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>

          <button
            type="button"
            onClick={() => void saveAll()}
            disabled={!selectedUserId || saving || loading}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? "Menyimpan..." : "Simpan Authorization"}
          </button>
        </div>
      </div>

      {(error || notice) && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {error || notice}
        </div>
      )}

      {/* 3-panel workspace */}
      <div className="grid min-h-[620px] grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:grid-cols-[1.05fr_1.05fr_1.7fr]">
        {/* PANEL 1 */}
        <section className="min-w-0 border-b border-slate-200 xl:border-b-0 xl:border-r">
          <div className="border-b border-slate-200 bg-slate-50/80 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Layers3 size={17} />
                  LAYER METADATA
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {layers.length} layer terdaftar
                </p>
              </div>
              <Database size={18} className="text-slate-400" />
            </div>

            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={layerSearch}
                onChange={(event) => setLayerSearch(event.target.value)}
                placeholder="Cari layer..."
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
              />
            </div>

            <div className="mt-2 flex items-center gap-2">
              <Filter size={14} className="text-slate-400" />
              <select
                value={sectionFilter}
                onChange={(event) => setSectionFilter(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium outline-none focus:border-slate-500"
              >
                {sections.map((section) => (
                  <option key={section} value={section}>
                    {section === "all" ? "Semua section" : formatSection(section)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="max-h-[540px] overflow-y-auto p-2">
            {groupedLayers.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-slate-400">
                Layer tidak ditemukan.
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
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                  >
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      {formatSection(section)}
                    </span>
                    {expanded ? (
                      <ChevronDown size={15} className="text-slate-400" />
                    ) : (
                      <ChevronRight size={15} className="text-slate-400" />
                    )}
                  </button>

                  {expanded &&
                    sectionLayers.map((layer) => {
                      const active = selectedLayerId === layer.id;
                      const permissions =
                        authorization[makeKey(layer.id)] || emptyPermissions();
                      const hasAccess = Object.values(permissions).some(Boolean);

                      return (
                        <button
                          key={layer.id}
                          type="button"
                          onClick={() => selectLayer(layer.id)}
                          className={`mb-1 flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
                            active
                              ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                              : "border-transparent bg-white text-slate-700 hover:border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                              active
                                ? "bg-white/10 text-white"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            <Layers3 size={17} />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold">
                              {layer.table_name}
                            </div>
                            <div
                              className={`mt-0.5 text-[11px] ${
                                active ? "text-slate-300" : "text-slate-400"
                              }`}
                            >
                              ID {layer.id}
                            </div>
                          </div>

                          <span
                            className={`h-2.5 w-2.5 rounded-full ${
                              hasAccess
                                ? active
                                  ? "bg-emerald-300"
                                  : "bg-emerald-500"
                                : active
                                  ? "bg-white/30"
                                  : "bg-slate-300"
                            }`}
                            title={hasAccess ? "Ada permission" : "Belum ada permission"}
                          />
                        </button>
                      );
                    })}
                </div>
              );
            })}
          </div>
        </section>

        {/* PANEL 2 */}
        <section className="min-w-0 border-b border-slate-200 xl:border-b-0 xl:border-r">
          <div className="border-b border-slate-200 bg-slate-50/80 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <UserRound size={17} />
                  USER
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {users.length} user tersedia
                </p>
              </div>
            </div>

            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
                placeholder="Cari username / nama / role..."
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
              />
            </div>
          </div>

          <div className="max-h-[540px] overflow-y-auto p-2">
            {filteredUsers.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-slate-400">
                User tidak ditemukan.
              </div>
            )}

            {filteredUsers.map((user) => {
              const active = selectedUserId === user.id;

              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => selectUser(user.id)}
                  className={`mb-2 flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
                    active
                      ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      active
                        ? "bg-white/10 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {(user.full_name || user.username || "?")
                      .slice(0, 1)
                      .toUpperCase()}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">
                      {user.full_name || user.username}
                    </div>
                    <div
                      className={`truncate text-xs ${
                        active ? "text-slate-300" : "text-slate-500"
                      }`}
                    >
                      @{user.username}
                    </div>
                    <div
                      className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        active
                          ? "bg-white/10 text-slate-200"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {user.role_name || "Tanpa Role"}
                    </div>
                  </div>

                  <span
                    className={`mt-1 h-2.5 w-2.5 rounded-full ${
                      user.status === "active"
                        ? active
                          ? "bg-emerald-300"
                          : "bg-emerald-500"
                        : active
                          ? "bg-slate-400"
                          : "bg-slate-300"
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </section>

        {/* PANEL 3 */}
        <section className="min-w-0">
          <div className="border-b border-slate-200 bg-slate-50/80 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <ShieldCheck size={17} />
                  DATA ACCESS
                </div>
                <p className="mt-1 truncate text-sm font-semibold text-slate-700">
                  {selectedLayer?.table_name || "Pilih layer"}
                </p>
                <p className="text-xs text-slate-500">
                  User: {selectedUser?.full_name || selectedUser?.username || "Pilih user"}
                </p>
              </div>

              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => setAllPermissions(true)}
                  disabled={!selectedLayerId || !selectedUserId}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Allow All
                </button>

                <button
                  type="button"
                  onClick={() => setAllPermissions(false)}
                  disabled={!selectedLayerId || !selectedUserId}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Deny All
                </button>
              </div>
            </div>
          </div>

          <div className="p-5">
            {!selectedLayer || !selectedUser ? (
              <div className="flex min-h-[460px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-center">
                <div>
                  <ShieldCheck size={40} className="mx-auto text-slate-300" />
                  <p className="mt-3 text-sm font-semibold text-slate-600">
                    Pilih layer dan user
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Permission matrix akan tampil setelah keduanya dipilih.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Layer
                    </div>
                    <div className="mt-1 truncate text-sm font-bold text-slate-800">
                      {selectedLayer.table_name}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Section
                    </div>
                    <div className="mt-1 text-sm font-bold text-slate-800">
                      {formatSection(selectedLayer.section || "lainnya")}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Role User
                    </div>
                    <div className="mt-1 text-sm font-bold text-slate-800">
                      {selectedUser.role_name || "Tanpa Role"}
                    </div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <div className="grid grid-cols-[1.3fr_0.7fr] border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <span>Permission</span>
                    <span className="text-center">Access</span>
                  </div>

                  {PERMISSIONS.map(({ key, label, description }) => {
                    const checked = Boolean(currentPermissions[key]);

                    return (
                      <label
                        key={key}
                        className="grid cursor-pointer grid-cols-[1.3fr_0.7fr] items-center border-b border-slate-100 px-4 py-4 last:border-b-0 hover:bg-slate-50"
                      >
                        <span>
                          <span className="block text-sm font-bold text-slate-800">
                            {label}
                          </span>
                          <span className="mt-0.5 block text-xs text-slate-400">
                            {description}
                          </span>
                        </span>

                        <span className="flex justify-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              setPermission(key, event.target.checked)
                            }
                            className="h-5 w-5 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                          />
                        </span>
                      </label>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-bold text-slate-800">
                      Status perubahan
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {isDirty
                        ? "Ada perubahan permission yang belum disimpan."
                        : "Semua permission sudah sinkron dengan database."}
                    </div>
                  </div>

                  <div
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${
                      isDirty
                        ? "bg-amber-100 text-amber-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    <Check size={14} />
                    {isDirty ? "UNSAVED" : "SYNCED"}
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => void revokeSelected()}
                    disabled={saving}
                    className="rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Cabut Authorization Layer
                  </button>

                  <button
                    type="button"
                    onClick={() => void saveAll()}
                    disabled={!isDirty || saving}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Save size={16} />
                    Simpan Perubahan
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
