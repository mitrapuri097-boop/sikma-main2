import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowDownToLine,
  BadgeCheck,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Database,
  Download,
  Edit3,
  Eye,
  FileClock,
  Filter,
  KeyRound,
  MoreVertical,
  UserRoundCog,
  ShieldAlert,
  CircleDot,
  Layers3,
  Lock,
  Mail,
  MoreHorizontal,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
  X,
  XCircle,
  Zap,
} from "lucide-react";

// ============================================================
// API
// ============================================================

const API_BASE =
  (import.meta.env.VITE_API_URL || "http://localhost:3001")
    .replace(/\/$/, "")
    .replace(/\/api$/, "") + "/api";

// ============================================================
// TYPES
// ============================================================

type UserStatus = "pending" | "active" | "suspended" | "expired" | "inactive";

type AccessStatus = "active" | "expired" | "revoked" | "none";

type DataClassification =
  | "public"
  | "public_registered"
  | "restricted"
  | "internal"
  | "not_configured";

type TabKey = "overview" | "permissions" | "access" | "security" | "activity";

interface ApiUser {
  id: number;
  username: string;
  email: string;
  password_hash?: string;
  full_name: string;
  phone?: string | null;

  role_id?: number | null;
  role_name?: string | null;

  organization_id?: number | null;
  unit_id?: number | null;

  status: UserStatus;

  avatar?: string | null;

  last_login?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface RoleRecord {
  id: number;
  name: string;
  label: string;
  key: string;
  description?: string;
  status?: string;
  level: number | null;
  documentRole: boolean;
  legacy: boolean;
}

interface UserRecord {
  id: number;
  username: string;
  email: string;
  fullName: string;
  phone: string;

  roleId: number | null;
  role: string;
  roleLevel: number | null;

  institution: string;
  organizationId: number | null;
  unit: string;
  unitId: number | null;

  status: UserStatus;

  access: AccessStatus;
  accessLabel: string;

  mfa: boolean | null;
  apiAccess: boolean | null;

  scopeCount: number | null;
  region: string | null;

  classification: DataClassification;

  permissions: string[];

  lastLogin: string | null;
  createdAt: string | null;
  updatedAt: string | null;

  raw: ApiUser;
}

interface ApiResponse<T = any> {
  success?: boolean;
  message?: string;
  data?: T;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================================
// DOCUMENT ROLE DEFINITION
// ============================================================

const DOCUMENT_ROLES = [
  {
    level: 0,
    key: "public_guest",
    name: "Public / Guest",
    short: "Guest",
    description: "Melihat informasi dan peta publik tanpa akun.",
  },
  {
    level: 1,
    key: "public_downloader",
    name: "Public Registered / Downloader",
    short: "Downloader",
    description: "Mengunduh data publik terdaftar setelah identifikasi.",
  },
  {
    level: 2,
    key: "admin_data",
    name: "Admin Data",
    short: "Admin Data",
    description: "Mengelola dataset, metadata, layer, dan pembaruan data.",
  },
  {
    level: 3,
    key: "institutional_user",
    name: "User Instansi",
    short: "Instansi",
    description: "Mengakses data kerja sama sesuai hak dan ruang lingkup.",
  },
  {
    level: 4,
    key: "internal_user",
    name: "User Internal",
    short: "Internal",
    description: "Monitoring, analisis, laporan, dan kebutuhan internal.",
  },
  {
    level: 5,
    key: "administrator",
    name: "Administrator",
    short: "Administrator",
    description: "Mengelola user, role, permission, keamanan, dan konfigurasi.",
  },
] as const;

// ============================================================
// HELPERS
// ============================================================

function safeText(value: unknown, fallback = "—") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return String(value);
}

function formatDate(value?: string | null) {
  if (!value) return "Belum tersedia";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatShortDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
  }).format(date);
}

function normalizeRoleName(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function resolveDocumentRole(roleName?: string | null): {
  level: number | null;
  documentRole: boolean;
  legacy: boolean;
} {
  const normalized = normalizeRoleName(roleName);

  if (
    normalized === "public / guest" ||
    normalized === "guest" ||
    normalized === "public"
  ) {
    return {
      level: 0,
      documentRole: true,
      legacy: false,
    };
  }

  if (
    normalized.includes("public registered") ||
    normalized.includes("downloader") ||
    normalized.includes("publik terdaftar")
  ) {
    return {
      level: 1,
      documentRole: true,
      legacy: false,
    };
  }

  if (normalized === "admin data" || normalized === "data administrator") {
    return {
      level: 2,
      documentRole: true,
      legacy: false,
    };
  }

  if (normalized === "user instansi" || normalized.includes("institutional")) {
    return {
      level: 3,
      documentRole: true,
      legacy: false,
    };
  }

  if (
    normalized === "user internal" ||
    normalized.includes("internal user") ||
    normalized.includes("internal viewer") ||
    normalized.includes("internal supervisor") ||
    normalized.includes("internal approver")
  ) {
    return {
      level: 4,
      documentRole: true,
      legacy: false,
    };
  }

  if (normalized === "administrator" || normalized === "system administrator") {
    return {
      level: 5,
      documentRole: true,
      legacy: false,
    };
  }

  return {
    level: null,
    documentRole: false,
    legacy:
      normalized === "super admin" ||
      normalized === "admin" ||
      normalized === "user",
  };
}

function getStatusMeta(status: UserStatus) {
  switch (status) {
    case "active":
      return {
        label: "Active",
        className: "bg-emerald-50 text-emerald-700 border-emerald-200",
        dot: "bg-emerald-500",
      };

    case "pending":
      return {
        label: "Pending",
        className: "bg-amber-50 text-amber-700 border-amber-200",
        dot: "bg-amber-500",
      };

    case "suspended":
      return {
        label: "Suspended",
        className: "bg-orange-50 text-orange-700 border-orange-200",
        dot: "bg-orange-500",
      };

    case "expired":
      return {
        label: "Expired",
        className: "bg-red-50 text-red-700 border-red-200",
        dot: "bg-red-500",
      };

    case "inactive":
      return {
        label: "Inactive",
        className: "bg-slate-100 text-slate-600 border-slate-200",
        dot: "bg-slate-400",
      };

    default:
      return {
        label: status,
        className: "bg-slate-100 text-slate-600 border-slate-200",
        dot: "bg-slate-400",
      };
  }
}

function getClassificationMeta(classification: DataClassification) {
  switch (classification) {
    case "public":
      return {
        label: "Data Publik",
        className: "bg-sky-50 text-sky-700 border-sky-200",
      };

    case "public_registered":
      return {
        label: "Publik Terdaftar",
        className: "bg-indigo-50 text-indigo-700 border-indigo-200",
      };

    case "restricted":
      return {
        label: "Terbatas / Mitra",
        className: "bg-amber-50 text-amber-700 border-amber-200",
      };

    case "internal":
      return {
        label: "Internal",
        className: "bg-purple-50 text-purple-700 border-purple-200",
      };

    default:
      return {
        label: "Not Configured",
        className: "bg-slate-100 text-slate-500 border-slate-200",
      };
  }
}

function roleLevelLabel(level: number | null) {
  if (level === null) return "Not mapped";
  return `Level ${level}`;
}

function normalizeUser(user: ApiUser): UserRecord {
  const roleInfo = resolveDocumentRole(user.role_name);

  let access: AccessStatus = "none";

  if (user.status === "active") {
    access = "active";
  } else if (user.status === "expired") {
    access = "expired";
  } else if (user.status === "suspended" || user.status === "inactive") {
    access = "revoked";
  }

  return {
    id: user.id,
    username: safeText(user.username, ""),
    email: safeText(user.email, ""),
    fullName: safeText(user.full_name, ""),
    phone: safeText(user.phone, "—"),

    roleId: user.role_id ?? null,
    role: safeText(user.role_name, "Role belum dipetakan"),
    roleLevel: roleInfo.level,

    institution:
      user.organization_id !== null && user.organization_id !== undefined
        ? `Organization #${user.organization_id}`
        : "Belum dikonfigurasi",

    organizationId: user.organization_id ?? null,

    unit:
      user.unit_id !== null && user.unit_id !== undefined
        ? `Unit #${user.unit_id}`
        : "Belum dikonfigurasi",

    unitId: user.unit_id ?? null,

    status: user.status,

    access,
    accessLabel:
      access === "active"
        ? "Access Active"
        : access === "expired"
          ? "Access Expired"
          : access === "revoked"
            ? "Access Revoked"
            : "No Access Scope",

    // Belum ada endpoint/database resmi untuk data ini.
    mfa: null,
    apiAccess: null,
    scopeCount: null,
    region: null,

    classification: "not_configured",
    permissions: [],

    lastLogin: user.last_login ?? null,
    createdAt: user.created_at ?? null,
    updatedAt: user.updated_at ?? null,

    raw: user,
  };
}

// ============================================================
// API HELPER
// ============================================================

async function apiRequest<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  let payload: ApiResponse<T>;

  try {
    payload = await response.json();
  } catch {
    throw new Error(
      `Server mengembalikan response tidak valid (${response.status})`,
    );
  }

  if (!response.ok || payload?.success === false) {
    throw new Error(
      payload?.message || `Request gagal dengan status ${response.status}`,
    );
  }

  return payload;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function UserManagement() {
  // ----------------------------------------------------------
  // DATA
  // ----------------------------------------------------------

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [error, setError] = useState("");

  // ----------------------------------------------------------
  // PAGINATION / FILTER
  // ----------------------------------------------------------

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const [totalUsers, setTotalUsers] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Enterprise KPI: global counters are loaded from server pagination totals,
  // never inferred from the current page.
  const [globalMetrics, setGlobalMetrics] = useState({
    active: 0,
    pending: 0,
    suspended: 0,
    expired: 0,
    inactive: 0,
  });
  const [metricsLoading, setMetricsLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const [statusFilter, setStatusFilter] = useState<UserStatus | "">("");

  const [roleFilter, setRoleFilter] = useState("");

  const [showFilters, setShowFilters] = useState(true);

  // ----------------------------------------------------------
  // UI
  // ----------------------------------------------------------

  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);

  const [actionMenuUserId, setActionMenuUserId] = useState<number | null>(null);
  const [passwordUser, setPasswordUser] = useState<UserRecord | null>(null);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<TabKey>("overview");

  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);

  const [confirmAction, setConfirmAction] = useState<{
    user: UserRecord;
    action: UserStatus;
  } | null>(null);

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // ----------------------------------------------------------
  // BULK
  // ----------------------------------------------------------

  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // ----------------------------------------------------------
  // FORM
  // ----------------------------------------------------------

  const emptyForm = {
    full_name: "",
    username: "",
    email: "",
    phone: "",
    role_id: "",
    status: "active" as UserStatus,
    password: "",
    organization_id: "",
    unit_id: "",
  };

  const [form, setForm] = useState(emptyForm);
  const [formSubmitting, setFormSubmitting] = useState(false);

  // ----------------------------------------------------------
  // LOAD ROLES
  // ----------------------------------------------------------

  const loadRoles = useCallback(async () => {
    setRolesLoading(true);

    try {
      const response = await apiRequest<ApiUser[] | RoleRecord[]>(
        "/roles?limit=100&status=active",
      );

      const data = Array.isArray(response.data) ? response.data : [];

      const normalized = data.map((role: any) => {
        const roleInfo = resolveDocumentRole(role.name);

        return {
          id: Number(role.id),
          name: safeText(role.name),
          label: safeText(role.name),
          key: String(role.name || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_"),
          description: role.description,
          status: role.status,
          level: roleInfo.level,
          documentRole: roleInfo.documentRole,
          legacy: roleInfo.legacy,
        };
      });

      setRoles(normalized);
    } catch (err: any) {
      setRoles([]);
      setToast({
        type: "error",
        message: err?.message || "Role gagal dimuat.",
      });
    } finally {
      setRolesLoading(false);
    }
  }, []);

  // ----------------------------------------------------------
  // LOAD USERS
  // ----------------------------------------------------------

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();

      params.set("page", String(page));
      params.set("limit", String(limit));

      if (search.trim()) {
        params.set("search", search.trim());
      }

      if (statusFilter) {
        params.set("status", statusFilter);
      }

      if (roleFilter) {
        params.set("role_id", roleFilter);
      }

      const response = await apiRequest<ApiUser[]>(
        `/users?${params.toString()}`,
      );

      const rawUsers = Array.isArray(response.data) ? response.data : [];

      setUsers(rawUsers.map(normalizeUser));

      const pagination = response.pagination;

      setTotalUsers(Number(pagination?.total ?? rawUsers.length));

      setTotalPages(
        Number(
          pagination?.totalPages ??
            Math.max(
              1,
              Math.ceil(
              Number(pagination?.total ?? rawUsers.length) / limit,
            ),
            ),
        ),
      );

      setSelectedIds([]);
    } catch (err: any) {
      setUsers([]);

      setError(err?.message || "Gagal mengambil data pengguna.");
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, statusFilter, roleFilter]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // ----------------------------------------------------------
  // GLOBAL KPI
  // ----------------------------------------------------------

  const loadGlobalMetrics = useCallback(async () => {
    setMetricsLoading(true);

    try {
      const statuses: UserStatus[] = [
        "active",
        "pending",
        "suspended",
        "expired",
        "inactive",
      ];

      const responses = await Promise.all(
        statuses.map((status) =>
          apiRequest<ApiUser[]>(
            `/users?status=${encodeURIComponent(status)}&page=1&limit=1`,
          ),
        ),
      );

      setGlobalMetrics({
        active: Number(responses[0]?.pagination?.total ?? 0),
        pending: Number(responses[1]?.pagination?.total ?? 0),
        suspended: Number(responses[2]?.pagination?.total ?? 0),
        expired: Number(responses[3]?.pagination?.total ?? 0),
        inactive: Number(responses[4]?.pagination?.total ?? 0),
      });
    } catch {
      // Keep the last known values; the directory itself remains usable.
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGlobalMetrics();
  }, [loadGlobalMetrics]);

  // ----------------------------------------------------------
  // SEARCH
  // ----------------------------------------------------------

  const submitSearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  // Debounced server-side search: the API remains the source of truth.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextSearch = searchInput.trim();
      setPage(1);
      setSearch((current) => (current === nextSearch ? current : nextSearch));
    }, 450);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setStatusFilter("");
    setRoleFilter("");
    setPage(1);
  };

  // ----------------------------------------------------------
  // KPI CURRENT PAGE
  // ----------------------------------------------------------

  const pageMetrics = useMemo(() => {
    return {
      active: users.filter((u) => u.status === "active").length,

      pending: users.filter((u) => u.status === "pending").length,

      suspended: users.filter((u) => u.status === "suspended").length,

      expired: users.filter((u) => u.status === "expired").length,

      inactive: users.filter((u) => u.status === "inactive").length,
    };
  }, [users]);

  // ----------------------------------------------------------
  // SELECTION
  // ----------------------------------------------------------

  const allVisibleSelected =
    users.length > 0 && users.every((user) => selectedIds.includes(user.id));

  const toggleSelect = (id: number) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(users.map((user) => user.id));
    }
  };

  // ----------------------------------------------------------
  // DETAIL
  // ----------------------------------------------------------

  const openDetail = (user: UserRecord, tab: TabKey = "overview") => {
    setActionMenuUserId(null);
    setSelectedUser(user);
    setDetailTab(tab);
    setDetailOpen(true);
  };

  // ----------------------------------------------------------
  // FORM
  // ----------------------------------------------------------

  const openCreate = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (user: UserRecord) => {
    setActionMenuUserId(null);
    setEditingUser(user);

    setForm({
      full_name: user.fullName,
      username: user.username,
      email: user.email,
      phone: user.phone === "—" ? "" : user.phone,
      role_id: user.roleId !== null ? String(user.roleId) : "",
      status: user.status,
      password: "",
      organization_id:
        user.organizationId !== null ? String(user.organizationId) : "",
      unit_id: user.unitId !== null ? String(user.unitId) : "",
    });

    setFormOpen(true);
  };

  const updateForm = (field: keyof typeof form, value: string) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  // ----------------------------------------------------------
  // CREATE / UPDATE
  // ----------------------------------------------------------

  const submitForm = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.full_name.trim()) {
      setToast({
        type: "error",
        message: "Nama lengkap wajib diisi.",
      });
      return;
    }

    if (!form.username.trim()) {
      setToast({
        type: "error",
        message: "Username wajib diisi.",
      });
      return;
    }

    if (!form.email.trim()) {
      setToast({
        type: "error",
        message: "Email wajib diisi.",
      });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setToast({
        type: "error",
        message: "Format email tidak valid.",
      });
      return;
    }

    if (!editingUser && form.password.trim().length < 8) {
      setToast({
        type: "error",
        message: "Password awal minimal 8 karakter.",
      });
      return;
    }

    setFormSubmitting(true);

    try {
      const payload: Record<string, any> = {
        username: form.username.trim(),
        email: form.email.trim(),
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
        role_id: form.role_id ? Number(form.role_id) : null,
        organization_id: form.organization_id
          ? Number(form.organization_id)
          : null,
        unit_id: form.unit_id ? Number(form.unit_id) : null,
        status: form.status,
      };

      if (form.password.trim()) {
        payload.password = form.password;
      }

      if (editingUser) {
        await apiRequest(`/users/${editingUser.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });

        setToast({
          type: "success",
          message: "Data pengguna berhasil diperbarui.",
        });
      } else {
        await apiRequest("/users", {
          method: "POST",
          body: JSON.stringify({
            ...payload,
            password: form.password,
            avatar: null,
          }),
        });

        setToast({
          type: "success",
          message: "Pengguna berhasil dibuat.",
        });
      }

      setFormOpen(false);
      setForm(emptyForm);

      await loadUsers();
      await loadRoles();
      await loadGlobalMetrics();
    } catch (err: any) {
      setToast({
        type: "error",
        message: err?.message || "Gagal menyimpan pengguna.",
      });
    } finally {
      setFormSubmitting(false);
    }
  };

  // ----------------------------------------------------------
  // PASSWORD UPDATE
  // ----------------------------------------------------------

  const executePasswordUpdate = async (password: string) => {
    if (!passwordUser) return;

    setPasswordSubmitting(true);

    try {
      await apiRequest(`/users/${passwordUser.id}`, {
        method: "PUT",
        body: JSON.stringify({
          password,
        }),
      });

      setToast({
        type: "success",
        message: `Password @${passwordUser.username} berhasil diperbarui.`,
      });

      setPasswordUser(null);
    } catch (err: any) {
      setToast({
        type: "error",
        message: err?.message || "Gagal memperbarui password.",
      });
    } finally {
      setPasswordSubmitting(false);
    }
  };

  // ----------------------------------------------------------
  // STATUS
  // ----------------------------------------------------------

  const requestStatusChange = (user: UserRecord, action: UserStatus) => {
    setConfirmAction({
      user,
      action,
    });
  };

  const executeStatusChange = async () => {
    if (!confirmAction) return;

    const { user, action } = confirmAction;

    try {
      await apiRequest(`/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({
          username: user.username,
          email: user.email,
          full_name: user.fullName,
          phone: user.phone === "—" ? null : user.phone,
          role_id: user.roleId,
          organization_id: user.organizationId,
          unit_id: user.unitId,
          status: action,
        }),
      });

      setToast({
        type: "success",
        message: `Status ${user.username} berhasil diubah menjadi ${getStatusMeta(action).label}.`,
      });

      setConfirmAction(null);

      if (selectedUser && selectedUser.id === user.id) {
        setSelectedUser({
          ...selectedUser,
          status: action,
        });
      }

      await loadUsers();
      await loadGlobalMetrics();
    } catch (err: any) {
      setToast({
        type: "error",
        message: err?.message || "Gagal mengubah status pengguna.",
      });
    }
  };

  // ----------------------------------------------------------
  // EXPORT CSV
  // ----------------------------------------------------------

  const exportCurrentPage = () => {
    if (!users.length) {
      setToast({
        type: "error",
        message: "Tidak ada data pengguna untuk diekspor.",
      });
      return;
    }

    const headers = [
      "ID",
      "Nama Lengkap",
      "Username",
      "Email",
      "Telepon",
      "Role",
      "Level",
      "Organization",
      "Unit",
      "Status",
      "Last Login",
      "Created At",
    ];

    const rows = users.map((user) => [
      user.id,
      user.fullName,
      user.username,
      user.email,
      user.phone,
      user.role,
      user.roleLevel === null ? "" : `Level ${user.roleLevel}`,
      user.institution,
      user.unit,
      user.status,
      user.lastLogin || "",
      user.createdAt || "",
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => {
            const value = String(cell ?? "").replace(/"/g, '""');

            return `"${value}"`;
          })
          .join(","),
      )
      .join("\n");

    const blob = new Blob(["\ufeff" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `simit-user-directory-page-${page}.csv`;
    anchor.click();

    URL.revokeObjectURL(url);

    setToast({
      type: "success",
      message: "Data halaman aktif berhasil diekspor.",
    });
  };

  // ----------------------------------------------------------
  // COPY
  // ----------------------------------------------------------

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);

      setToast({
        type: "success",
        message: "Berhasil disalin.",
      });
    } catch {
      setToast({
        type: "error",
        message: "Gagal menyalin.",
      });
    }
  };

  // ----------------------------------------------------------
  // ROLE OPTIONS
  // ----------------------------------------------------------

  const roleOptions = useMemo(() => {
    return roles.slice().sort((a, b) => {
      if (a.level !== null && b.level !== null) {
        return a.level - b.level;
      }

      if (a.level !== null) return -1;
      if (b.level !== null) return 1;

      return a.name.localeCompare(b.name);
    });
  }, [roles]);

  // ----------------------------------------------------------
  // AUTO TOAST DISMISS
  // ----------------------------------------------------------

  useEffect(() => {
    if (!toast) return;

    const timer = window.setTimeout(() => {
      setToast(null);
    }, 4500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [toast]);

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* ================================================== */}
      {/* HEADER */}
      {/* ================================================== */}

      <div className="border-b border-slate-200 bg-white">
        <div className="px-6 py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                <ShieldCheck className="h-4 w-4" />
                SIMITI Enterprise Administration
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-700 text-white shadow-sm">
                  <Users className="h-5 w-5" />
                </div>

                <div>
                  <h1 className="text-2xl font-bold tracking-tight">
                    User Management
                  </h1>

                  <p className="mt-0.5 text-sm text-slate-500">
                    Manajemen pengguna, role, lifecycle, akses data, dan
                    keamanan akun SIMITI.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  loadUsers();
                  loadRoles();
                  loadGlobalMetrics();
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                />
                Refresh
              </button>

              <button
                type="button"
                onClick={exportCurrentPage}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                Export
              </button>

              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800"
              >
                <UserPlus className="h-4 w-4" />
                Tambah User
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================== */}
      {/* DOCUMENT ROLE NOTICE */}
      {/* ================================================== */}

      <div className="mx-6 mt-5 rounded-xl border border-blue-100 bg-blue-50/70 p-4">
        <div className="flex gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
            <Shield className="h-4 w-4" />
          </div>

          <div className="min-w-0">
            <div className="text-sm font-semibold text-blue-900">
              RBAC SIMITI — Level 0 sampai Level 5
            </div>

            <p className="mt-1 text-xs leading-5 text-blue-800">
              Struktur role mengikuti dokumen Rancangan Manajemen Pengguna
              SIMITI. Role lama seperti
              <strong> Super Admin / Admin / User </strong>
              yang masih berada di database akan ditampilkan sebagai role legacy
              sampai master role diperbarui.
            </p>
          </div>
        </div>
      </div>

      {/* ================================================== */}
      {/* KPI */}
      {/* ================================================== */}

      <div className="grid grid-cols-1 gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <MetricCard
          icon={Users}
          label="Total User"
          value={totalUsers}
          helper="Global · server total"
          loading={loading}
        />

        <MetricCard
          icon={CheckCircle2}
          label="Active"
          value={pageMetrics.active}
          helper="Global · server total"
          iconClass="text-emerald-600"
          bgClass="bg-emerald-50"
          loading={metricsLoading}
        />

        <MetricCard
          icon={Clock3}
          label="Pending"
          value={pageMetrics.pending}
          helper="Global · server total"
          iconClass="text-amber-600"
          bgClass="bg-amber-50"
          loading={metricsLoading}
        />

        <MetricCard
          icon={Lock}
          label="Suspended"
          value={pageMetrics.suspended}
          helper="Global · server total"
          iconClass="text-orange-600"
          bgClass="bg-orange-50"
          loading={metricsLoading}
        />

        <MetricCard
          icon={FileClock}
          label="Expired"
          value={pageMetrics.expired}
          helper="Global · server total"
          iconClass="text-red-600"
          bgClass="bg-red-50"
          loading={metricsLoading}
        />

        <MetricCard
          icon={XCircle}
          label="Inactive"
          value={pageMetrics.inactive}
          helper="Global · server total"
          iconClass="text-slate-500"
          bgClass="bg-slate-100"
          loading={metricsLoading}
        />
      </div>

      <div className="px-6 -mt-3 pb-3">
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <CircleDot className="h-3 w-3 text-emerald-500" />
          KPI status dihitung dari total server per status, bukan hanya data halaman aktif.
        </div>
      </div>

      {/* ================================================== */}
      {/* MAIN CONTENT */}
      {/* ================================================== */}

      <div className="px-6 pb-8">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* TOOLBAR */}

          <div className="border-b border-slate-200 p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="relative min-w-0 flex-1 xl:max-w-xl">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      submitSearch();
                    }
                  }}
                  placeholder="Cari nama, username, email, atau nomor telepon..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                  autoComplete="off"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={submitSearch}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  <Search className="h-4 w-4" />
                  Cari
                </button>

                <button
                  type="button"
                  onClick={() => setShowFilters((current) => !current)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-medium ${
                    showFilters
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Filter
                </button>
              </div>
            </div>

            {showFilters && (
              <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 md:grid-cols-3">
                <FilterSelect
                  label="Status"
                  value={statusFilter}
                  onChange={(value) => {
                    setStatusFilter(value as UserStatus | "");
                    setPage(1);
                  }}
                  options={[
                    {
                      value: "",
                      label: "Semua status",
                    },
                    {
                      value: "pending",
                      label: "Pending",
                    },
                    {
                      value: "active",
                      label: "Active",
                    },
                    {
                      value: "suspended",
                      label: "Suspended",
                    },
                    {
                      value: "expired",
                      label: "Expired",
                    },
                    {
                      value: "inactive",
                      label: "Inactive",
                    },
                  ]}
                />

                <FilterSelect
                  label="Role"
                  value={roleFilter}
                  onChange={(value) => {
                    setRoleFilter(value);
                    setPage(1);
                  }}
                  options={[
                    {
                      value: "",
                      label: rolesLoading ? "Memuat role..." : "Semua role",
                    },
                    ...roleOptions.map((role) => ({
                      value: String(role.id),
                      label:
                        role.level !== null
                          ? `Level ${role.level} · ${role.name}`
                          : `${role.name} · Legacy / Not mapped`,
                    })),
                  ]}
                />

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <X className="h-4 w-4" />
                    Reset Filter
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ROLE MANAGEMENT */}
          <RoleManagementPanel
            roles={roleOptions}
            loading={rolesLoading}
          />

          {/* BULK BAR */}

          {selectedIds.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 bg-blue-50 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-blue-800">
                <CheckCircle2 className="h-4 w-4" />
                {selectedIds.length} user dipilih
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
                  Bulk lifecycle membutuhkan endpoint batch backend
                </span>

                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* ERROR */}

          {error && (
            <div className="m-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />

              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">
                  Gagal memuat User Directory
                </div>

                <div className="mt-1 text-xs">{error}</div>
              </div>

              <button
                type="button"
                onClick={loadUsers}
                className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-red-50"
              >
                Coba Lagi
              </button>
            </div>
          )}

          {/* TABLE */}

          <div className="overflow-x-auto">
            <table className="min-w-[1200px] w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="w-10 px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-500"
                    />
                  </th>

                  <TableHead>User</TableHead>

                  <TableHead>Role</TableHead>

                  <TableHead>Organization / Unit</TableHead>

                  <TableHead>Status</TableHead>

                  <TableHead>Access</TableHead>

                  <TableHead>Last Login</TableHead>

                  <TableHead align="right">Action</TableHead>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <LoadingRows />
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center">
                      <div className="mx-auto flex max-w-sm flex-col items-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                          <Users className="h-6 w-6" />
                        </div>

                        <div className="mt-4 text-sm font-semibold text-slate-800">
                          User tidak ditemukan
                        </div>

                        <div className="mt-1 text-xs leading-5 text-slate-500">
                          Coba ubah kata pencarian atau filter yang digunakan.
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <UserTableRow
                      key={user.id}
                      user={user}
                      selected={selectedIds.includes(user.id)}
                      onSelect={() => toggleSelect(user.id)}
                      onView={() => openDetail(user)}
                      onEdit={() => openEdit(user)}
                      onActivate={() => requestStatusChange(user, "active")}
                      onSuspend={() => requestStatusChange(user, "suspended")}
                      onDeactivate={() => requestStatusChange(user, "inactive")}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* FOOTER */}

          <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-slate-500">
              Menampilkan{" "}
              <strong className="text-slate-700">{users.length}</strong> user
              pada halaman <strong className="text-slate-700">{page}</strong>{" "}
              dari{" "}
              <strong className="text-slate-700">
                {Math.max(totalPages, 1)}
              </strong>
              .
            </div>

            <div className="flex items-center gap-2">
              <select
                value={limit}
                onChange={(event) => {
                  setLimit(Number(event.target.value));
                  setPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-600 outline-none"
              >
                <option value={10}>10 / halaman</option>
                <option value={25}>25 / halaman</option>
                <option value={50}>50 / halaman</option>
                <option value={100}>100 / halaman</option>
              </select>

              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="min-w-[72px] text-center text-xs font-semibold text-slate-700">
                {page} / {Math.max(totalPages, 1)}
              </div>

              <button
                type="button"
                disabled={page >= Math.max(totalPages, 1)}
                onClick={() =>
                  setPage((current) =>
                    Math.min(Math.max(totalPages, 1), current + 1),
                  )
                }
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================== */}
      {/* DETAIL DRAWER */}
      {/* ================================================== */}

      {detailOpen && selectedUser && (
        <UserDetailDrawer
          user={selectedUser}
          activeTab={detailTab}
          onTabChange={setDetailTab}
          onClose={() => {
            setDetailOpen(false);
            setSelectedUser(null);
          }}
          onEdit={() => openEdit(selectedUser)}
          onActivate={() => requestStatusChange(selectedUser, "active")}
          onSuspend={() => requestStatusChange(selectedUser, "suspended")}
          onDeactivate={() => requestStatusChange(selectedUser, "inactive")}
          onCopy={copyText}
        />
      )}

      {/* ================================================== */}
      {/* USER FORM */}
      {/* ================================================== */}

      {formOpen && (
        <UserFormModal
          form={form}
          editingUser={editingUser}
          roles={roleOptions}
          submitting={formSubmitting}
          onClose={() => {
            if (!formSubmitting) {
              setFormOpen(false);
            }
          }}
          onChange={updateForm}
          onSubmit={submitForm}
        />
      )}

      {passwordUser && (
        <PasswordUpdateModal
          user={passwordUser}
          submitting={passwordSubmitting}
          onClose={() => {
            if (!passwordSubmitting) {
              setPasswordUser(null);
            }
          }}
          onSubmit={executePasswordUpdate}
        />
      )}

      {/* ================================================== */}
      {/* CONFIRM */}
      {/* ================================================== */}

      {confirmAction && (
        <ConfirmStatusModal
          user={confirmAction.user}
          action={confirmAction.action}
          onCancel={() => setConfirmAction(null)}
          onConfirm={executeStatusChange}
        />
      )}

      {/* ================================================== */}
      {/* TOAST */}
      {/* ================================================== */}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[100] max-w-md">
          <div
            className={`flex items-start gap-3 rounded-xl border bg-white p-4 shadow-2xl ${
              toast.type === "success" ? "border-emerald-200" : "border-red-200"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
            ) : (
              <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
            )}

            <div className="flex-1 text-sm font-medium text-slate-700">
              {toast.message}
            </div>

            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-slate-400 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// METRIC CARD
// ============================================================

function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
  iconClass = "text-blue-600",
  bgClass = "bg-blue-50",
  loading = false,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  helper: string;
  iconClass?: string;
  bgClass?: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {label}
          </div>

          <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {loading ? (
              <span className="inline-block h-7 w-16 animate-pulse rounded-md bg-slate-100" />
            ) : (
              value.toLocaleString("id-ID")
            )}
          </div>

          <div className="mt-1 text-[11px] text-slate-400">{helper}</div>
        </div>

        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${bgClass} ${iconClass}`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TABLE HEAD
// ============================================================

function TableHead({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

// ============================================================
// ROLE MANAGEMENT PANEL
// ============================================================

function RoleManagementPanel({
  roles,
  loading,
}: {
  roles: RoleRecord[];
  loading: boolean;
}) {
  return (
    <details className="border-b border-slate-200 bg-slate-50/70 group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
            <UserRoundCog className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-800">Role Management</div>
            <div className="mt-0.5 text-[11px] text-slate-400">
              Backend-backed role catalog · read only
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="rounded-full border border-indigo-100 bg-white px-2.5 py-1 text-[10px] font-bold text-indigo-700">
            {loading ? "Loading…" : `${roles.length} role`}
          </span>
          <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" />
        </div>
      </summary>

      <div className="border-t border-slate-200 bg-white px-4 py-4">
        {loading ? (
          <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
        ) : roles.length === 0 ? (
          <NotConfigured
            title="Role catalog kosong"
            description="Endpoint /api/roles tidak mengembalikan role aktif."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {roles.map((role) => (
              <div
                key={role.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-slate-800">
                      {role.name}
                    </div>
                    <div className="mt-1 text-[10px] font-medium text-slate-400">
                      ID #{role.id}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-bold ${
                      role.level !== null
                        ? "border-blue-100 bg-blue-50 text-blue-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {role.level !== null ? `Level ${role.level}` : "Legacy"}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">
                    {role.documentRole ? "SIMITI role" : "DB role"}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500">
                    {role.status || "active"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5 text-[10px] leading-5 text-slate-500">
          Create / edit / delete master role sengaja tidak ditampilkan sebagai
          action karena endpoint CRUD role belum tersedia.
        </div>
      </div>
    </details>
  );
}

// ============================================================
// TABLE ROW
// ============================================================

function UserTableRow({
  user,
  selected,
  onSelect,
  onView,
  onEdit,
  onActivate,
  onSuspend,
  onDeactivate,
  onPassword,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
}: {
  user: UserRecord;
  selected: boolean;
  onSelect: () => void;
  onView: () => void;
  onEdit: () => void;
  onActivate: () => void;
  onSuspend: () => void;
  onDeactivate: () => void;
  onPassword: () => void;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
}) {
  const status = getStatusMeta(user.status);

  const roleInfo = resolveDocumentRole(user.role);

  return (
    <tr
      className={`group transition hover:bg-slate-50 ${
        selected ? "bg-blue-50/50" : "bg-white"
      }`}
    >
      <td className="px-4 py-4 align-top">
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-500"
        />
      </td>

      <td className="px-4 py-4 align-top">
        <div className="flex min-w-[250px] items-center gap-3">
          <Avatar name={user.fullName} status={user.status} />

          <div className="min-w-0">
            <button
              type="button"
              onClick={onView}
              className="block max-w-[250px] truncate text-left text-sm font-semibold text-slate-900 hover:text-blue-700"
            >
              {user.fullName}
            </button>

            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
              <span>@{user.username}</span>

              <span className="text-slate-300">•</span>

              <span className="max-w-[190px] truncate">{user.email}</span>
            </div>
          </div>
        </div>
      </td>

      <td className="px-4 py-4 align-top">
        <div className="min-w-[190px]">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-800">
              {user.role}
            </span>
          </div>

          <div className="mt-1 flex items-center gap-1.5">
            {roleInfo.level !== null ? (
              <span className="rounded-md border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                Level {roleInfo.level}
              </span>
            ) : (
              <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                Legacy / Not mapped
              </span>
            )}
          </div>
        </div>
      </td>

      <td className="px-4 py-4 align-top">
        <div className="min-w-[190px]">
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <Building2 className="h-4 w-4 text-slate-400" />
            <span>{user.institution}</span>
          </div>

          <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
            <Layers3 className="h-3.5 w-3.5" />
            {user.unit}
          </div>
        </div>
      </td>

      <td className="px-4 py-4 align-top">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${status.className}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
          {status.label}
        </span>
      </td>

      <td className="px-4 py-4 align-top">
        <div className="min-w-[130px]">
          <div
            className={`text-xs font-semibold ${
              user.access === "active" ? "text-emerald-700" : "text-slate-500"
            }`}
          >
            {user.accessLabel}
          </div>

          <div className="mt-1 text-[11px] text-slate-400">
            Scope:{" "}
            {user.scopeCount === null ? "Not configured" : user.scopeCount}
          </div>
        </div>
      </td>

      <td className="px-4 py-4 align-top">
        <div className="min-w-[150px]">
          <div className="text-xs font-medium text-slate-700">
            {formatShortDate(user.lastLogin)}
          </div>

          <div className="mt-1 text-[11px] text-slate-400">
            {user.lastLogin ? formatDate(user.lastLogin) : "Belum pernah login"}
          </div>
        </div>
      </td>

      <td className="px-4 py-4 text-right align-top">
        <div className="relative flex justify-end">
          <button
            type="button"
            onClick={onToggleMenu}
            title="More actions"
            aria-expanded={menuOpen}
            className={`flex h-9 w-9 items-center justify-center rounded-lg border transition ${
              menuOpen
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-800"
            }`}
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {menuOpen && (
            <>
              <button
                type="button"
                aria-label="Close action menu"
                onClick={onCloseMenu}
                className="fixed inset-0 z-40 cursor-default"
              />

              <div className="absolute right-0 top-10 z-50 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-xl">
                <div className="px-2.5 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  User commands
                </div>

                <ActionMenuItem icon={Eye} label="View detail" onClick={() => { onCloseMenu(); onView(); }} />
                <ActionMenuItem icon={Edit3} label="Edit profile" onClick={() => { onCloseMenu(); onEdit(); }} />
                <ActionMenuItem icon={KeyRound} label="Update password" onClick={() => { onCloseMenu(); onPassword(); }} />

                <div className="my-1 border-t border-slate-100" />

                {user.status === "active" ? (
                  <ActionMenuItem
                    icon={Lock}
                    label="Suspend account"
                    tone="warning"
                    onClick={() => { onCloseMenu(); onSuspend(); }}
                  />
                ) : (
                  <ActionMenuItem
                    icon={UserCheck}
                    label="Activate account"
                    tone="success"
                    onClick={() => { onCloseMenu(); onActivate(); }}
                  />
                )}

                {user.status !== "inactive" && (
                  <ActionMenuItem
                    icon={XCircle}
                    label="Deactivate account"
                    tone="danger"
                    onClick={() => { onCloseMenu(); onDeactivate(); }}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

// ============================================================
// ACTION MENU ITEM
// ============================================================

function ActionMenuItem({
  icon: Icon,
  label,
  onClick,
  tone = "default",
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-700 hover:bg-emerald-50"
      : tone === "warning"
        ? "text-orange-700 hover:bg-orange-50"
        : tone === "danger"
          ? "text-red-700 hover:bg-red-50"
          : "text-slate-700 hover:bg-slate-50";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition ${toneClass}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label}
    </button>
  );
}

// ============================================================
// AVATAR
// ============================================================

function Avatar({ name, status }: { name: string; status: UserStatus }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  const statusMeta = getStatusMeta(status);

  return (
    <div className="relative shrink-0">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-700 to-indigo-600 text-xs font-bold text-white">
        {initials || "U"}
      </div>

      <span
        className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${statusMeta.dot}`}
      />
    </div>
  );
}

// ============================================================
// FILTER SELECT
// ============================================================

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{
    value: string;
    label: string;
  }>;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-500">
        {label}
      </span>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// ============================================================
// DETAIL DRAWER
// ============================================================

function UserDetailDrawer({
  user,
  activeTab,
  onTabChange,
  onClose,
  onEdit,
  onActivate,
  onSuspend,
  onDeactivate,
  onCopy,
}: {
  user: UserRecord;
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  onClose: () => void;
  onEdit: () => void;
  onActivate: () => void;
  onSuspend: () => void;
  onDeactivate: () => void;
  onCopy: (value: string) => void;
}) {
  const status = getStatusMeta(user.status);

  const roleInfo = resolveDocumentRole(user.role);

  return (
    <div className="fixed inset-0 z-[80]">
      <div
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <aside className="absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        {/* HEADER */}

        <div className="border-b border-slate-200 bg-white px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={user.fullName} status={user.status} />

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-lg font-bold text-slate-900">
                    {user.fullName}
                  </h2>

                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold ${status.className}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${status.dot}`}
                    />
                    {status.label}
                  </span>
                </div>

                <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                  <span>@{user.username}</span>

                  <span>•</span>

                  <span className="truncate">{user.email}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <Edit3 className="h-3.5 w-3.5" />
              Edit User
            </button>

            {user.status === "active" ? (
              <button
                type="button"
                onClick={onSuspend}
                className="inline-flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 hover:bg-orange-100"
              >
                <Lock className="h-3.5 w-3.5" />
                Suspend
              </button>
            ) : (
              <button
                type="button"
                onClick={onActivate}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
              >
                <UserCheck className="h-3.5 w-3.5" />
                Activate
              </button>
            )}

            {user.status !== "inactive" && (
              <button
                type="button"
                onClick={onDeactivate}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                <XCircle className="h-3.5 w-3.5" />
                Deactivate
              </button>
            )}
          </div>
        </div>

        {/* TABS */}

        <div className="border-b border-slate-200 px-6">
          <div className="flex gap-1 overflow-x-auto">
            {[
              {
                key: "overview" as TabKey,
                label: "Overview",
                icon: UserCog,
              },
              {
                key: "permissions" as TabKey,
                label: "Role & Permission",
                icon: Shield,
              },
              {
                key: "access" as TabKey,
                label: "Data Access",
                icon: Database,
              },
              {
                key: "security" as TabKey,
                label: "Security",
                icon: Lock,
              },
              {
                key: "activity" as TabKey,
                label: "Activity",
                icon: Activity,
              },
            ].map((tab) => {
              const Icon = tab.icon;

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => onTabChange(tab.key)}
                  className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-xs font-semibold transition ${
                    activeTab === tab.key
                      ? "border-blue-700 text-blue-700"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* CONTENT */}

        <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
          {activeTab === "overview" && (
            <OverviewTab user={user} roleInfo={roleInfo} onCopy={onCopy} />
          )}

          {activeTab === "permissions" && (
            <PermissionsTab user={user} roleInfo={roleInfo} />
          )}

          {activeTab === "access" && <AccessTab user={user} />}

          {activeTab === "security" && <SecurityTab user={user} />}

          {activeTab === "activity" && <ActivityTab user={user} />}
        </div>
      </aside>
    </div>
  );
}

// ============================================================
// OVERVIEW TAB
// ============================================================

function OverviewTab({
  user,
  roleInfo,
  onCopy,
}: {
  user: UserRecord;
  roleInfo: {
    level: number | null;
    documentRole: boolean;
    legacy: boolean;
  };
  onCopy: (value: string) => void;
}) {
  return (
    <div className="space-y-5">
      <SectionCard
        icon={UserCog}
        title="Account Information"
        description="Informasi dasar akun pengguna."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InfoItem
            label="User ID"
            value={String(user.id)}
            copy
            onCopy={() => onCopy(String(user.id))}
          />

          <InfoItem
            label="Username"
            value={`@${user.username}`}
            copy
            onCopy={() => onCopy(user.username)}
          />

          <InfoItem
            label="Email"
            value={user.email}
            copy
            onCopy={() => onCopy(user.email)}
          />

          <InfoItem label="Phone" value={user.phone} />
        </div>
      </SectionCard>

      <SectionCard
        icon={ShieldCheck}
        title="Role & Organization"
        description="Pemetaan role sesuai RBAC SIMITI."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InfoItem label="Role" value={user.role} />

          <InfoItem
            label="RBAC Level"
            value={
              roleInfo.level === null ? "Not mapped" : `Level ${roleInfo.level}`
            }
          />

          <InfoItem label="Organization" value={user.institution} />

          <InfoItem label="Unit" value={user.unit} />
        </div>

        {roleInfo.legacy && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="flex gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />

              <div>
                <div className="text-xs font-bold text-amber-800">
                  Role legacy terdeteksi
                </div>

                <p className="mt-1 text-[11px] leading-5 text-amber-700">
                  Role database saat ini belum mengikuti struktur Level 0–5 pada
                  dokumen. Jangan melakukan mapping otomatis karena dapat
                  mengubah kewenangan pengguna.
                </p>
              </div>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard
        icon={Clock3}
        title="Account Lifecycle"
        description="Status akun yang tersedia dari backend users."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <InfoItem
            label="Current Status"
            value={getStatusMeta(user.status).label}
          />

          <InfoItem label="Created" value={formatDate(user.createdAt)} />

          <InfoItem label="Updated" value={formatDate(user.updatedAt)} />
        </div>

        <div className="mt-5">
          <LifecycleVisual currentStatus={user.status} />
        </div>
      </SectionCard>
    </div>
  );
}

// ============================================================
// PERMISSIONS TAB
// ============================================================

function PermissionsTab({
  user,
  roleInfo,
}: {
  user: UserRecord;
  roleInfo: {
    level: number | null;
    documentRole: boolean;
    legacy: boolean;
  };
}) {
  return (
    <div className="space-y-5">
      <SectionCard
        icon={Shield}
        title="Current Role"
        description="Role yang benar-benar dikembalikan oleh endpoint users."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <InfoItem label="Database Role" value={user.role} />
          <InfoItem
            label="Role Level"
            value={roleInfo.level === null ? "Not mapped" : `Level ${roleInfo.level}`}
          />
          <InfoItem
            label="Role Source"
            value={roleInfo.legacy ? "Legacy database role" : "SIMITI role definition"}
          />
        </div>
      </SectionCard>

      <SectionCard
        icon={ShieldAlert}
        title="Permission Matrix"
        description="Permission aktual belum dapat ditampilkan atau diubah tanpa endpoint RBAC permission."
      >
        <NotConfigured
          title="Permission Matrix — Not Configured"
          description="Backend yang terhubung saat ini belum menyediakan endpoint permission, assignment, revoke, atau permission audit. UI tidak mengarang hak akses berdasarkan Level 0–5."
        />
      </SectionCard>

      <SectionCard
        icon={UserRoundCog}
        title="Role Administration"
        description="Panel role menggunakan data dari GET /api/roles."
      >
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <div>
              <div className="text-xs font-bold text-slate-800">
                Role assignment tersedia melalui User Management
              </div>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">
                Perubahan role dilakukan melalui field Role pada form user.
                Master role dapat dibaca dari backend, tetapi create/edit/delete
                role belum diaktifkan karena endpoint tersebut belum dikonfirmasi.
              </p>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

// ============================================================
// ACCESS TAB
// ============================================================

function AccessTab({ user }: { user: UserRecord }) {
  const classification = getClassificationMeta(user.classification);

  return (
    <div className="space-y-5">
      <SectionCard
        icon={Database}
        title="Data Access Scope"
        description="Pembatasan akses berdasarkan dataset, wilayah, periode, dan instansi."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InfoItem label="Classification" value={classification.label} />

          <InfoItem label="Access Status" value={user.accessLabel} />

          <InfoItem
            label="Dataset Scope"
            value={
              user.scopeCount === null
                ? "Not configured"
                : String(user.scopeCount)
            }
          />

          <InfoItem
            label="Region Scope"
            value={user.region || "Not configured"}
          />

          <InfoItem label="Organization" value={user.institution} />

          <InfoItem label="Unit" value={user.unit} />
        </div>
      </SectionCard>

      <SectionCard
        icon={Layers3}
        title="Data Classification"
        description="Klasifikasi data menentukan tingkat keterbukaan."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            {
              key: "public",
              label: "Data Publik",
              desc: "Dapat dilihat pengunjung umum.",
            },
            {
              key: "public_registered",
              label: "Publik Terdaftar",
              desc: "Download setelah identifikasi.",
            },
            {
              key: "restricted",
              label: "Terbatas / Mitra",
              desc: "Akses berdasarkan kerja sama.",
            },
            {
              key: "internal",
              label: "Internal",
              desc: "Akses kebutuhan internal.",
            },
          ].map((item) => (
            <div
              key={item.key}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="text-xs font-bold text-slate-800">
                {item.label}
              </div>

              <div className="mt-1 text-[11px] leading-5 text-slate-400">
                {item.desc}
              </div>

              <div className="mt-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Not configured
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        icon={CalendarDays}
        title="Time-Bound Access"
        description="Masa berlaku akses berdasarkan penugasan atau kerja sama."
      >
        <NotConfigured
          title="Access expiration belum tersedia"
          description="Field masa berlaku akses belum tersedia pada public.users dan belum ada endpoint access scope."
        />
      </SectionCard>
    </div>
  );
}

// ============================================================
// SECURITY TAB
// ============================================================

function SecurityTab({ user }: { user: UserRecord }) {
  return (
    <div className="space-y-5">
      <SectionCard
        icon={Lock}
        title="Authentication"
        description="Informasi keamanan akun."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SecurityItem
            icon={KeyRound}
            title="Password"
            value="Password managed by backend"
            status="Backend managed"
            positive={true}
          />

          <SecurityItem
            icon={ShieldCheck}
            title="MFA"
            value="Not configured"
            status="Not configured"
            positive={false}
          />

          <SecurityItem
            icon={Zap}
            title="API Access"
            value="Not configured"
            status="Not configured"
            positive={false}
          />

          <SecurityItem
            icon={Clock3}
            title="Last Login"
            value={formatDate(user.lastLogin)}
            status={user.lastLogin ? "Available" : "No login record"}
            positive={Boolean(user.lastLogin)}
          />
        </div>
      </SectionCard>

      <SectionCard
        icon={Shield}
        title="Security Policy"
        description="Kontrol keamanan yang direkomendasikan dokumen."
      >
        <div className="space-y-2">
          {[
            "Password kuat",
            "Multi-Factor Authentication",
            "Session timeout",
            "Login attempt limit",
            "Account lockout",
            "Email verification",
            "Periodic permission review",
            "Audit perubahan role dan permission",
          ].map((item) => (
            <div
              key={item}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-slate-400" />

                <span className="text-xs font-medium text-slate-700">
                  {item}
                </span>
              </div>

              <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500">
                Backend Policy
              </span>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

// ============================================================
// ACTIVITY TAB
// ============================================================

function ActivityTab({ user }: { user: UserRecord }) {
  return (
    <div className="space-y-5">
      <SectionCard
        icon={Activity}
        title="Account Activity"
        description="Aktivitas dasar yang tersedia dari public.users."
      >
        <div className="space-y-0">
          <TimelineItem
            icon={UserPlus}
            title="Account Created"
            date={user.createdAt}
            description="Akun dibuat pada sistem."
          />

          <TimelineItem
            icon={Edit3}
            title="Last Profile Update"
            date={user.updatedAt}
            description="Informasi akun terakhir diperbarui."
          />

          <TimelineItem
            icon={CheckCircle2}
            title="Last Login"
            date={user.lastLogin}
            description={
              user.lastLogin
                ? "Login terakhir yang tercatat."
                : "Belum terdapat catatan login."
            }
            last
          />
        </div>
      </SectionCard>

      <SectionCard
        icon={FileClock}
        title="Audit Trail"
        description="Jejak audit aktivitas kritis pengguna."
      >
        <NotConfigured
          title="Audit trail belum terhubung"
          description="Backend saat ini belum menyediakan endpoint user audit atau tabel audit log yang telah dikonfirmasi."
        />
      </SectionCard>
    </div>
  );
}

// ============================================================
// LIFECYCLE
// ============================================================

function LifecycleVisual({ currentStatus }: { currentStatus: UserStatus }) {
  const statuses: UserStatus[] = [
    "pending",
    "active",
    "suspended",
    "expired",
    "inactive",
  ];

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[580px] items-center">
        {statuses.map((status, index) => {
          const meta = getStatusMeta(status);

          const active = status === currentStatus;

          return (
            <React.Fragment key={status}>
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 ${
                    active
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-200 bg-white text-slate-400"
                  }`}
                >
                  {active ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                  )}
                </div>

                <span
                  className={`mt-2 text-[10px] font-semibold ${
                    active ? "text-blue-700" : "text-slate-400"
                  }`}
                >
                  {meta.label}
                </span>
              </div>

              {index < statuses.length - 1 && (
                <div className="mx-2 h-px flex-1 bg-slate-200" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// SECTION CARD
// ============================================================

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
          <Icon className="h-4 w-4" />
        </div>

        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>

          <p className="mt-0.5 text-[11px] text-slate-400">{description}</p>
        </div>
      </div>

      <div className="mt-5">{children}</div>
    </section>
  );
}

// ============================================================
// INFO ITEM
// ============================================================

function InfoItem({
  label,
  value,
  copy = false,
  onCopy,
}: {
  label: string;
  value: string;
  copy?: boolean;
  onCopy?: () => void;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>

      <div className="mt-1 flex items-center gap-2 text-sm font-medium text-slate-800">
        <span className="break-words">{value}</span>

        {copy && onCopy && (
          <button
            type="button"
            onClick={onCopy}
            className="text-slate-400 hover:text-blue-700"
            title="Copy"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// SECURITY ITEM
// ============================================================

function SecurityItem({
  icon: Icon,
  title,
  value,
  status,
  positive,
}: {
  icon: React.ElementType;
  title: string;
  value: string;
  status: string;
  positive: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <Icon className="h-4 w-4" />
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-800">{title}</div>

          <div className="mt-0.5 text-[11px] text-slate-400">{value}</div>
        </div>
      </div>

      <div
        className={`mt-3 text-[10px] font-bold uppercase tracking-wide ${
          positive ? "text-emerald-600" : "text-slate-400"
        }`}
      >
        {status}
      </div>
    </div>
  );
}

// ============================================================
// TIMELINE
// ============================================================

function TimelineItem({
  icon: Icon,
  title,
  date,
  description,
  last = false,
}: {
  icon: React.ElementType;
  title: string;
  date?: string | null;
  description: string;
  last?: boolean;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
          <Icon className="h-4 w-4" />
        </div>

        {!last && <div className="mt-1 h-12 w-px bg-slate-200" />}
      </div>

      <div className="pb-5">
        <div className="text-xs font-bold text-slate-800">{title}</div>

        <div className="mt-1 text-[11px] font-medium text-blue-700">
          {formatDate(date)}
        </div>

        <div className="mt-1 text-[11px] text-slate-400">{description}</div>
      </div>
    </div>
  );
}

// ============================================================
// NOT CONFIGURED
// ============================================================

function NotConfigured({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5">
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-slate-500">
          <MoreHorizontal className="h-4 w-4" />
        </div>

        <div>
          <div className="text-xs font-bold text-slate-700">{title}</div>

          <p className="mt-1 text-[11px] leading-5 text-slate-400">
            {description}
          </p>

          <div className="mt-3 inline-flex rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Not Configured
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// USER FORM MODAL
// ============================================================

function UserFormModal({
  form,
  editingUser,
  roles,
  submitting,
  onClose,
  onChange,
  onSubmit,
}: {
  form: {
    full_name: string;
    username: string;
    email: string;
    phone: string;
    role_id: string;
    status: UserStatus;
    password: string;
    organization_id: string;
    unit_id: string;
  };
  editingUser: UserRecord | null;
  roles: RoleRecord[];
  submitting: boolean;
  onClose: () => void;
  onChange: (
    field:
      | "full_name"
      | "username"
      | "email"
      | "phone"
      | "role_id"
      | "status"
      | "password"
      | "organization_id"
      | "unit_id",
    value: string,
  ) => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
        onClick={() => {
          if (!submitting) {
            onClose();
          }
        }}
      />

      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
              <UserCog className="h-4 w-4" />
              {editingUser ? "Edit User" : "Create User"}
            </div>

            <h2 className="mt-1 text-lg font-bold text-slate-900">
              {editingUser ? "Edit User Account" : "Tambah User SIMITI"}
            </h2>

            <p className="mt-1 text-xs text-slate-400">
              Field mengikuti struktur public.users yang tersedia saat ini.
            </p>
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 gap-5 p-6 md:grid-cols-2">
            <FormField label="Nama Lengkap" required>
              <input
                value={form.full_name}
                onChange={(event) => onChange("full_name", event.target.value)}
                className={inputClass}
                placeholder="Nama lengkap pengguna"
                autoComplete="name"
              />
            </FormField>

            <FormField label="Username" required>
              <input
                value={form.username}
                onChange={(event) => onChange("username", event.target.value)}
                className={inputClass}
                placeholder="username"
                autoComplete="username"
              />
            </FormField>

            <FormField label="Email" required>
              <input
                type="email"
                value={form.email}
                onChange={(event) => onChange("email", event.target.value)}
                className={inputClass}
                placeholder="nama@instansi.go.id"
                autoComplete="email"
              />
            </FormField>

            <FormField label="Nomor Telepon">
              <input
                value={form.phone}
                onChange={(event) => onChange("phone", event.target.value)}
                className={inputClass}
                placeholder="08xxxxxxxxxx"
                autoComplete="tel"
              />
            </FormField>

            <FormField label="Role" required>
              <select
                value={form.role_id}
                onChange={(event) => onChange("role_id", event.target.value)}
                className={inputClass}
              >
                <option value="">Pilih role</option>

                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.level !== null
                      ? `Level ${role.level} · ${role.name}`
                      : `${role.name} · Legacy`}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Status" required>
              <select
                value={form.status}
                onChange={(event) => onChange("status", event.target.value)}
                className={inputClass}
              >
                <option value="pending">Pending</option>

                <option value="active">Active</option>

                <option value="suspended">Suspended</option>

                <option value="expired">Expired</option>

                <option value="inactive">Inactive</option>
              </select>
            </FormField>

            <FormField
              label={editingUser ? "Password Baru" : "Password"}
              required={!editingUser}
              description={
                editingUser
                  ? "Kosongkan jika password tidak diubah."
                  : "Minimal 8 karakter."
              }
            >
              <input
                type="password"
                value={form.password}
                onChange={(event) => onChange("password", event.target.value)}
                className={inputClass}
                placeholder={editingUser ? "••••••••" : "Minimal 8 karakter"}
                autoComplete={editingUser ? "new-password" : "new-password"}
              />
            </FormField>

            <FormField
              label="Organization ID"
              description="ID master organization. Nama instansi belum tersedia."
            >
              <input
                type="number"
                value={form.organization_id}
                onChange={(event) =>
                  onChange("organization_id", event.target.value)
                }
                className={inputClass}
                placeholder="Contoh: 1"
                inputMode="numeric"
              />
            </FormField>

            <FormField
              label="Unit ID"
              description="ID master unit. Nama unit belum tersedia."
            >
              <input
                type="number"
                value={form.unit_id}
                onChange={(event) => onChange("unit_id", event.target.value)}
                className={inputClass}
                placeholder="Contoh: 1"
                inputMode="numeric"
              />
            </FormField>
          </div>

          <div className="mx-6 mb-6 rounded-xl border border-blue-100 bg-blue-50 p-4">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />

              <div>
                <div className="text-xs font-bold text-blue-900">
                  Enterprise RBAC
                </div>

                <p className="mt-1 text-[11px] leading-5 text-blue-800">
                  Role dan permission aktual tetap dikontrol backend. Form ini
                  hanya mengelola field yang sudah tersedia pada endpoint users.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Batal
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}

              {submitting
                ? "Menyimpan..."
                : editingUser
                  ? "Simpan Perubahan"
                  : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// FORM FIELD
// ============================================================

function FormField({
  label,
  required = false,
  description,
  children,
}: {
  label: string;
  required?: boolean;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>

      {children}

      {description && (
        <span className="mt-1 block text-[10px] leading-4 text-slate-400">
          {description}
        </span>
      )}
    </label>
  );
}

// ============================================================
// INPUT CLASS
// ============================================================

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

// ============================================================
// PASSWORD UPDATE MODAL
// ============================================================

function PasswordUpdateModal({
  user,
  submitting,
  onClose,
  onSubmit,
}: {
  user: UserRecord;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (password: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const valid = password.length >= 8 && password === confirm;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
        onClick={() => !submitting && onClose()}
      />

      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 bg-gradient-to-r from-slate-950 to-slate-800 px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
                <KeyRound className="h-3.5 w-3.5" />
                Account Security
              </div>
              <h2 className="mt-1 text-lg font-bold">Update Password</h2>
              <p className="mt-1 text-xs text-slate-300">
                Password untuk @{user.username}
              </p>
            </div>

            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) onSubmit(password);
          }}
          className="p-6"
        >
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
              <div className="text-[11px] leading-5 text-blue-800">
                Password dikirim melalui endpoint user yang sudah tersedia.
                Nilai password tidak pernah ditampilkan di detail user.
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                Password Baru
              </span>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={`${inputClass} pr-11`}
                  placeholder="Minimal 8 karakter"
                  autoFocus
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  {showPassword ? <Eye className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                </button>
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                Konfirmasi Password
              </span>
              <input
                type={showPassword ? "text" : "password"}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className={inputClass}
                placeholder="Ulangi password baru"
                autoComplete="new-password"
              />
            </label>

            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className={`rounded-lg border px-3 py-2 ${password.length >= 8 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-400"}`}>
                {password.length >= 8 ? "✓" : "•"} Minimal 8 karakter
              </div>
              <div className={`rounded-lg border px-3 py-2 ${confirm && password === confirm ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-400"}`}>
                {confirm && password === confirm ? "✓" : "•"} Password cocok
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-5">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Batal
            </button>

            <button
              type="submit"
              disabled={!valid || submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              {submitting ? "Memperbarui..." : "Update Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// CONFIRM STATUS MODAL
// ============================================================

function ConfirmStatusModal({
  user,
  action,
  onCancel,
  onConfirm,
}: {
  user: UserRecord;
  action: UserStatus;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const meta = getStatusMeta(action);

  const actionText =
    action === "active"
      ? "mengaktifkan"
      : action === "suspended"
        ? "menangguhkan"
        : action === "inactive"
          ? "menonaktifkan"
          : action === "expired"
            ? "menandai sebagai expired"
            : "mengubah status";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
        onClick={onCancel}
      />

      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
          <AlertCircle className="h-5 w-5" />
        </div>

        <h2 className="mt-4 text-lg font-bold text-slate-900">
          Konfirmasi Perubahan Status
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          Yakin ingin <strong className="text-slate-800">{actionText}</strong>{" "}
          akun <strong className="text-slate-800">{user.fullName}</strong>?
        </p>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs text-slate-400">Status baru</div>

          <div className="mt-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.className}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
              {meta.label}
            </span>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Batal
          </button>

          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-white ${
              action === "inactive"
                ? "bg-red-600 hover:bg-red-700"
                : action === "suspended"
                  ? "bg-orange-600 hover:bg-orange-700"
                  : "bg-blue-700 hover:bg-blue-800"
            }`}
          >
            Ya, Lanjutkan
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// LOADING
// ============================================================

function LoadingRows() {
  return (
    <>
      {Array.from({
        length: 6,
      }).map((_, index) => (
        <tr key={index}>
          <td colSpan={8} className="px-4 py-4">
            <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
          </td>
        </tr>
      ))}
    </>
  );
}
