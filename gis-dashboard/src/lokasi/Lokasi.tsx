import React, { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import {
  Activity,
  AlertCircle,
  ArrowUpDown,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Database,
  Download,
  Edit3,
  Eye,
  FileCheck2,
  FileImage,
  Filter,
  Grid2X2,
  List,
  MapPinned,
  Navigation,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Target,
  Trees,
  X,
} from "lucide-react";

/* ============================================================
   CONFIG
============================================================ */

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:3001"
).replace(/\/+$/, "");

const API_ENDPOINTS = {
  locations: `${API_URL}/api/lokasi`,
  statistics: `${API_URL}/api/lokasi/statistics`,
  export: `${API_URL}/api/lokasi/export`,
};

/* ============================================================
   TYPES
============================================================ */

type ActivityStatus =
  | "Selesai"
  | "Berjalan"
  | "Direncanakan"
  | "Ditunda"
  | "Draft"
  | "Menunggu Verifikasi"
  | string;

interface ActivityRecord {
  id: string | number;

  name: string;
  activityType: string;

  year: number | null;

  fundingSource?: string | null;
  implementingAgency?: string | null;

  province?: string | null;
  district?: string | null;
  subdistrict?: string | null;
  village?: string | null;
  das?: string | null;

  area?: number | null;

  status: ActivityStatus;

  latitude?: number | null;
  longitude?: number | null;

  verificationStatus?: string | null;

  photoBeforeCount?: number;
  photoProgressCount?: number;
  photoAfterCount?: number;
  documentCount?: number;

  createdAt?: string | null;
  updatedAt?: string | null;
}

interface Statistics {
  totalLocations: number;
  totalArea: number;
  activeLocations: number;
  completedLocations: number;
  pendingVerification: number;
  documentedLocations: number;
}

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  total?: number;
  page?: number;
  limit?: number;
  message?: string;
}

interface FilterState {
  search: string;
  activityType: string;
  status: string;
  year: string;
  province: string;
  das: string;
}

/* ============================================================
   CONSTANTS
============================================================ */

const DEFAULT_STATISTICS: Statistics = {
  totalLocations: 0,
  totalArea: 0,
  activeLocations: 0,
  completedLocations: 0,
  pendingVerification: 0,
  documentedLocations: 0,
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  activityType: "",
  status: "",
  year: "",
  province: "",
  das: "",
};

/* ============================================================
   ENTERPRISE LIGHT THEME
============================================================ */

const THEME = {
  page: "#F5F7FA",
  header: "#FFFFFF",
  panel: "#FFFFFF",
  card: "#FFFFFF",
  surface2: "#F8FAFC",
  input: "#F8FAFC",

  border: "#E2E8F0",
  borderStrong: "#CBD5E1",

  primary: "#0F766E",
  primaryHover: "#115E59",
  primaryBg: "#F0FDFA",

  text: "#1E293B",
  textSecondary: "#475569",
  muted: "#64748B",

  success: "#15803D",
  warning: "#B45309",
  danger: "#BE123C",
  info: "#0369A1",
} as const;

/* ============================================================
   HELPERS
============================================================ */

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "0";
  }

  return new Intl.NumberFormat("id-ID").format(value);
}

function formatArea(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return `${new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 2,
  }).format(value)} ha`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function normalizeActivity(item: any): ActivityRecord {
  return {
    id: item.id ?? item.id_lokasi ?? item.location_id,

    name:
      item.name ??
      item.nama_kegiatan ??
      item.nama_lokasi ??
      item.activity_name ??
      "Tanpa Nama",

    activityType:
      item.activityType ?? item.jenis_kegiatan ?? item.activity_type ?? "—",

    year: item.year ?? item.tahun_pelaksanaan ?? item.activity_year ?? null,

    fundingSource:
      item.fundingSource ??
      item.sumber_pendanaan ??
      item.funding_source ??
      null,

    implementingAgency:
      item.implementingAgency ??
      item.instansi_pelaksana ??
      item.implementing_agency ??
      null,

    province: item.province ?? item.provinsi ?? null,

    district: item.district ?? item.kabupaten ?? item.kabupaten_kota ?? null,

    subdistrict: item.subdistrict ?? item.kecamatan ?? null,

    village: item.village ?? item.desa ?? item.kelurahan ?? null,

    das: item.das ?? item.nama_das ?? item.das_name ?? null,

    area: item.area ?? item.luas_area ?? item.luas ?? null,

    status: item.status ?? item.status_pelaksanaan ?? "Draft",

    latitude: item.latitude ?? item.lat ?? null,

    longitude: item.longitude ?? item.lng ?? item.lon ?? null,

    verificationStatus:
      item.verificationStatus ??
      item.verification_status ??
      item.status_verifikasi ??
      null,

    photoBeforeCount:
      item.photoBeforeCount ??
      item.foto_sebelum_count ??
      item.photo_before_count ??
      0,

    photoProgressCount:
      item.photoProgressCount ??
      item.foto_pelaksanaan_count ??
      item.photo_progress_count ??
      0,

    photoAfterCount:
      item.photoAfterCount ??
      item.foto_setelah_count ??
      item.photo_after_count ??
      0,

    documentCount: item.documentCount ?? item.dokumen_count ?? 0,

    createdAt: item.createdAt ?? item.created_at ?? null,

    updatedAt: item.updatedAt ?? item.updated_at ?? null,
  };
}

function getStatusClass(status: ActivityStatus) {
  const normalized = String(status || "").toLowerCase();

  if (
    normalized.includes("selesai") ||
    normalized.includes("verified") ||
    normalized.includes("terverifikasi")
  ) {
    return {
      wrapper: "border-emerald-200 bg-emerald-50 text-emerald-700",
      dot: "bg-emerald-600",
    };
  }

  if (normalized.includes("berjalan") || normalized.includes("proses")) {
    return {
      wrapper: "border-sky-200 bg-sky-50 text-sky-700",
      dot: "bg-sky-600",
    };
  }

  if (normalized.includes("menunggu") || normalized.includes("verifikasi")) {
    return {
      wrapper: "border-amber-200 bg-amber-50 text-amber-700",
      dot: "bg-amber-600",
    };
  }

  if (normalized.includes("tunda") || normalized.includes("ditolak")) {
    return {
      wrapper: "border-rose-200 bg-rose-50 text-rose-700",
      dot: "bg-rose-600",
    };
  }

  if (normalized.includes("direncanakan")) {
    return {
      wrapper: "border-indigo-200 bg-indigo-50 text-indigo-700",
      dot: "bg-indigo-600",
    };
  }

  return {
    wrapper: "border-slate-200 bg-slate-50 text-slate-600",
    dot: "bg-slate-400",
  };
}

/* ============================================================
   KPI CARD
============================================================ */

interface KpiCardProps {
  title: string;
  value: string;
  description: string;
  icon: React.ElementType;
  loading?: boolean;
}

function KpiCard({
  title,
  value,
  description,
  icon: Icon,
  loading,
}: KpiCardProps) {
  return (
    <div
      className="
        group
        relative
        overflow-hidden
        rounded-2xl
        border
        bg-white
        p-4
        shadow-[0_4px_18px_rgba(15,23,42,0.04)]
        transition-all
        duration-200
        hover:-translate-y-[1px]
        hover:shadow-[0_8px_28px_rgba(15,23,42,0.07)]
      "
      style={{ borderColor: THEME.border }}
    >
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            {title}
          </div>

          {loading ? (
            <div className="mt-2 h-8 w-24 animate-pulse rounded-lg bg-slate-100" />
          ) : (
            <div className="mt-1 text-2xl font-extrabold tracking-tight text-slate-800">
              {value}
            </div>
          )}

          <div className="mt-1 truncate text-[10px] font-medium text-slate-500">
            {description}
          </div>
        </div>

        <div
          className="
            flex
            h-10
            w-10
            shrink-0
            items-center
            justify-center
            rounded-xl
            border
            text-teal-700
            transition
            group-hover:bg-teal-100
          "
          style={{
            backgroundColor: THEME.primaryBg,
            borderColor: "#CCFBF1",
          }}
        >
          <Icon size={18} strokeWidth={1.8} />
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   STATUS BADGE
============================================================ */

function StatusBadge({ status }: { status: ActivityStatus }) {
  const style = getStatusClass(status);

  return (
    <span
      className={`
        inline-flex
        items-center
        gap-1.5
        rounded-md
        border
        px-2
        py-1
        text-[9px]
        font-bold
        uppercase
        tracking-wide
        ${style.wrapper}
      `}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />

      {status || "—"}
    </span>
  );
}

/* ============================================================
   PAGE
============================================================ */

export default function Lokasi() {
  const navigate = useNavigate();

  const [records, setRecords] = useState<ActivityRecord[]>([]);
  const [statistics, setStatistics] = useState<Statistics>(DEFAULT_STATISTICS);

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const [activityTypes, setActivityTypes] = useState<string[]>([]);

  const [provinces, setProvinces] = useState<string[]>([]);

  const [dasOptions, setDasOptions] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [statisticsLoading, setStatisticsLoading] = useState(true);

  const [error, setError] = useState("");

  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);

  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  const [showFilters, setShowFilters] = useState(false);

  const [sortBy, setSortBy] = useState<"updatedAt" | "name" | "year" | "area">(
    "updatedAt",
  );

  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const [selectedIds, setSelectedIds] = useState<Array<string | number>>([]);

  const [refreshing, setRefreshing] = useState(false);

  /* ==========================================================
     FETCH STATISTICS
  ========================================================== */

  const fetchStatistics = useCallback(async () => {
    setStatisticsLoading(true);

    try {
      const response = await fetch(API_ENDPOINTS.statistics);

      if (!response.ok) {
        throw new Error("Gagal mengambil statistik lokasi.");
      }

      const result: ApiResponse<Statistics> = await response.json();

      const source = result.data ?? (result as any);

      setStatistics({
        totalLocations: Number(source.totalLocations ?? 0),
        totalArea: Number(source.totalArea ?? 0),
        activeLocations: Number(source.activeLocations ?? 0),
        completedLocations: Number(source.completedLocations ?? 0),
        pendingVerification: Number(source.pendingVerification ?? 0),
        documentedLocations: Number(source.documentedLocations ?? 0),
      });
    } catch (err) {
      console.error(err);
      setStatistics(DEFAULT_STATISTICS);
    } finally {
      setStatisticsLoading(false);
    }
  }, []);

  /* ==========================================================
     FETCH LOCATIONS
  ========================================================== */

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();

      params.set("page", String(page));
      params.set("limit", String(limit));

      if (filters.search.trim()) {
        params.set("search", filters.search.trim());
      }

      if (filters.activityType) {
        params.set("activity_type", filters.activityType);
      }

      if (filters.status) {
        params.set("status", filters.status);
      }

      if (filters.year) {
        params.set("year", filters.year);
      }

      if (filters.province) {
        params.set("province", filters.province);
      }

      if (filters.das) {
        params.set("das", filters.das);
      }

      params.set("sort_by", sortBy);
      params.set("sort_direction", sortDirection);

      const response = await fetch(
        `${API_ENDPOINTS.locations}?${params.toString()}`,
      );

      if (!response.ok) {
        throw new Error(`Server mengembalikan status ${response.status}`);
      }

      const result: ApiResponse<any[]> = await response.json();

      const rawData = result.data ?? (Array.isArray(result) ? result : []);

      const normalized = rawData.map(normalizeActivity);

      setRecords(normalized);

      setTotal(Number(result.total ?? normalized.length));
    } catch (err) {
      console.error(err);

      setRecords([]);
      setTotal(0);

      setError(
        err instanceof Error ? err.message : "Gagal mengambil data lokasi.",
      );
    } finally {
      setLoading(false);
    }
  }, [filters, limit, page, sortBy, sortDirection]);

  /* ==========================================================
     FETCH MASTER FILTER OPTIONS
  ========================================================== */

  const fetchFilterOptions = useCallback(async () => {
    try {
      const response = await fetch(`${API_ENDPOINTS.locations}/filters`);

      if (!response.ok) return;

      const result = await response.json();

      setActivityTypes(
        Array.isArray(result.activityTypes) ? result.activityTypes : [],
      );

      setProvinces(Array.isArray(result.provinces) ? result.provinces : []);

      setDasOptions(Array.isArray(result.das) ? result.das : []);
    } catch (err) {
      console.debug("Filter master belum tersedia:", err);
    }
  }, []);

  /* ==========================================================
     INITIAL LOAD
  ========================================================== */

  useEffect(() => {
    fetchStatistics();
    fetchFilterOptions();
  }, [fetchStatistics, fetchFilterOptions]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  /* ==========================================================
     REFRESH
  ========================================================== */

  const handleRefresh = async () => {
    setRefreshing(true);

    try {
      await Promise.all([
        fetchLocations(),
        fetchStatistics(),
        fetchFilterOptions(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  /* ==========================================================
     FILTER
  ========================================================== */

  const updateFilter = (key: keyof FilterState, value: string) => {
    setPage(1);

    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const resetFilters = () => {
    setPage(1);
    setFilters(DEFAULT_FILTERS);
  };

  const hasActiveFilters = Object.values(filters).some(Boolean);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  /* ==========================================================
     SORT
  ========================================================== */

  const handleSort = (field: "updatedAt" | "name" | "year" | "area") => {
    if (sortBy === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));

      return;
    }

    setSortBy(field);
    setSortDirection("desc");
  };

  /* ==========================================================
     SELECTION
  ========================================================== */

  const allVisibleSelected =
    records.length > 0 &&
    records.every((item) => selectedIds.includes(item.id));

  const toggleSelection = (id: string | number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) =>
        prev.filter((id) => !records.some((item) => item.id === id)),
      );

      return;
    }

    setSelectedIds((prev) => [
      ...prev,
      ...records.map((item) => item.id).filter((id) => !prev.includes(id)),
    ]);
  };

  /* ==========================================================
     PAGINATION
  ========================================================== */

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const pageStart = total === 0 ? 0 : (page - 1) * limit + 1;

  const pageEnd = total === 0 ? 0 : Math.min(page * limit, total);

  /* ==========================================================
     GRID SORT FALLBACK
  ========================================================== */

  const visibleRecords = useMemo(() => {
    return [...records].sort((a, b) => {
      if (sortBy === "name") {
        return sortDirection === "asc"
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name);
      }

      if (sortBy === "year") {
        return sortDirection === "asc"
          ? Number(a.year ?? 0) - Number(b.year ?? 0)
          : Number(b.year ?? 0) - Number(a.year ?? 0);
      }

      if (sortBy === "area") {
        return sortDirection === "asc"
          ? Number(a.area ?? 0) - Number(b.area ?? 0)
          : Number(b.area ?? 0) - Number(a.area ?? 0);
      }

      return sortDirection === "asc"
        ? String(a.updatedAt ?? "").localeCompare(String(b.updatedAt ?? ""))
        : String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""));
    });
  }, [records, sortBy, sortDirection]);

  /* ==========================================================
     EXPORT
  ========================================================== */

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();

      selectedIds.forEach((id) => {
        params.append("ids[]", String(id));
      });

      if (filters.search) {
        params.set("search", filters.search);
      }

      if (filters.activityType) {
        params.set("activity_type", filters.activityType);
      }

      if (filters.status) {
        params.set("status", filters.status);
      }

      if (filters.year) {
        params.set("year", filters.year);
      }

      if (filters.province) {
        params.set("province", filters.province);
      }

      if (filters.das) {
        params.set("das", filters.das);
      }

      window.open(`${API_ENDPOINTS.export}?${params.toString()}`, "_blank");
    } catch (err) {
      console.error("Export gagal:", err);
    }
  };

  /* ==========================================================
     RENDER
  ========================================================== */

  return (
    <div
      className="min-h-screen text-slate-800"
      style={{
        backgroundColor: THEME.page,
      }}
    >
      {/* ======================================================
          HEADER
      ====================================================== */}

      <header
        className="border-b bg-white"
        style={{
          borderColor: THEME.border,
        }}
      >
        <div className="mx-auto max-w-[1800px] px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700">
                <Trees size={13} />

                <span>KAK 3.3 • Activity Spatial Registry</span>
              </div>

              <h1 className="text-xl font-extrabold tracking-tight text-slate-800 sm:text-2xl">
                Inventarisasi & Pemetaan Lokasi Kegiatan
              </h1>

              <p className="mt-1 max-w-3xl text-[11px] font-medium leading-relaxed text-slate-500">
                Registri spasial terintegrasi untuk kegiatan mitigasi dan
                adaptasi sektor kehutanan.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                aria-label="Refresh data lokasi"
                className="
                  inline-flex
                  h-10
                  items-center
                  gap-2
                  rounded-xl
                  border
                  bg-white
                  px-3.5
                  text-[11px]
                  font-bold
                  text-slate-600
                  shadow-sm
                  transition
                  hover:bg-slate-50
                  hover:text-slate-800
                  focus:outline-none
                  focus:ring-2
                  focus:ring-teal-500/20
                  disabled:cursor-not-allowed
                  disabled:opacity-50
                "
                style={{
                  borderColor: THEME.border,
                }}
              >
                <RefreshCw
                  size={15}
                  className={refreshing ? "animate-spin" : ""}
                />
                Refresh
              </button>

              <button
                type="button"
                onClick={handleExport}
                aria-label="Export data lokasi"
                className="
                  inline-flex
                  h-10
                  items-center
                  gap-2
                  rounded-xl
                  border
                  bg-white
                  px-3.5
                  text-[11px]
                  font-bold
                  text-slate-600
                  shadow-sm
                  transition
                  hover:bg-slate-50
                  hover:text-slate-800
                  focus:outline-none
                  focus:ring-2
                  focus:ring-teal-500/20
                "
                style={{
                  borderColor: THEME.border,
                }}
              >
                <Download size={15} />
                Export
              </button>

              <NavLink
                to="/lokasi/tambah"
                className="
                  inline-flex
                  h-10
                  items-center
                  gap-2
                  rounded-xl
                  px-4
                  text-[11px]
                  font-extrabold
                  text-white
                  shadow-sm
                  no-underline
                  transition
                  hover:-translate-y-[1px]
                  focus:outline-none
                  focus:ring-2
                  focus:ring-teal-500/30
                "
                style={{
                  backgroundColor: THEME.primary,
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.backgroundColor =
                    THEME.primaryHover;
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.backgroundColor = THEME.primary;
                }}
              >
                <Plus size={16} strokeWidth={2.4} />
                Tambah Lokasi
              </NavLink>
            </div>
          </div>
        </div>
      </header>

      {/* ======================================================
          CONTENT
      ====================================================== */}

      <main className="mx-auto max-w-[1800px] px-4 py-5 sm:px-6 lg:px-8">
        {/* ====================================================
            KPI
        ==================================================== */}

        <section className="grid grid-cols-2 gap-3 xl:grid-cols-6">
          <KpiCard
            title="Total Lokasi"
            value={formatNumber(statistics.totalLocations)}
            description="Seluruh registri kegiatan"
            icon={Database}
            loading={statisticsLoading}
          />

          <KpiCard
            title="Total Luas"
            value={formatArea(statistics.totalArea)}
            description="Akumulasi area kegiatan"
            icon={Target}
            loading={statisticsLoading}
          />

          <KpiCard
            title="Berjalan"
            value={formatNumber(statistics.activeLocations)}
            description="Kegiatan aktif"
            icon={Activity}
            loading={statisticsLoading}
          />

          <KpiCard
            title="Selesai"
            value={formatNumber(statistics.completedLocations)}
            description="Kegiatan selesai"
            icon={CheckCircle2}
            loading={statisticsLoading}
          />

          <KpiCard
            title="Verifikasi"
            value={formatNumber(statistics.pendingVerification)}
            description="Menunggu verifikasi"
            icon={ClipboardCheck}
            loading={statisticsLoading}
          />

          <KpiCard
            title="Terdokumentasi"
            value={formatNumber(statistics.documentedLocations)}
            description="Memiliki dokumentasi"
            icon={FileCheck2}
            loading={statisticsLoading}
          />
        </section>

        {/* ====================================================
            REGISTRY PANEL
        ==================================================== */}

        <section
          className="
            mt-5
            overflow-hidden
            rounded-2xl
            border
            bg-white
            shadow-[0_8px_30px_rgba(15,23,42,0.05)]
          "
          style={{
            borderColor: THEME.border,
          }}
        >
          {/* TOOLBAR */}

          <div
            className="border-b p-3.5 sm:p-4"
            style={{
              borderColor: THEME.border,
            }}
          >
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="relative min-w-0 flex-1 xl:max-w-xl">
                <Search
                  size={16}
                  className="
                    pointer-events-none
                    absolute
                    left-3
                    top-1/2
                    -translate-y-1/2
                    text-slate-400
                  "
                />

                <input
                  type="search"
                  value={filters.search}
                  onChange={(event) =>
                    updateFilter("search", event.target.value)
                  }
                  placeholder="Cari nama kegiatan, instansi, lokasi, DAS..."
                  aria-label="Cari lokasi kegiatan"
                  className="
                    h-10
                    w-full
                    rounded-xl
                    border
                    pl-9
                    pr-9
                    text-[11px]
                    font-medium
                    text-slate-700
                    outline-none
                    transition
                    placeholder:text-slate-400
                    focus:bg-white
                    focus:ring-2
                    focus:ring-teal-500/10
                  "
                  style={{
                    backgroundColor: THEME.input,
                    borderColor: THEME.border,
                  }}
                />

                {filters.search && (
                  <button
                    type="button"
                    onClick={() => updateFilter("search", "")}
                    aria-label="Hapus pencarian"
                    className="
                      absolute
                      right-2
                      top-1/2
                      flex
                      h-6
                      w-6
                      -translate-y-1/2
                      items-center
                      justify-center
                      rounded-md
                      text-slate-400
                      transition
                      hover:bg-slate-100
                      hover:text-slate-700
                    "
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowFilters((prev) => !prev)}
                  aria-expanded={showFilters}
                  className={`
                    inline-flex
                    h-10
                    items-center
                    gap-2
                    rounded-xl
                    border
                    px-3
                    text-[10px]
                    font-bold
                    transition
                    focus:outline-none
                    focus:ring-2
                    focus:ring-teal-500/10
                    ${
                      showFilters || hasActiveFilters
                        ? "border-teal-200 bg-teal-50 text-teal-700"
                        : "bg-white text-slate-600 hover:bg-slate-50"
                    }
                  `}
                  style={
                    !(showFilters || hasActiveFilters)
                      ? {
                          borderColor: THEME.border,
                        }
                      : undefined
                  }
                >
                  <Filter size={14} />
                  Filter
                  {hasActiveFilters && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-700 px-1 text-[8px] font-extrabold text-white">
                      {activeFilterCount}
                    </span>
                  )}
                  <ChevronDown
                    size={13}
                    className={`transition-transform ${
                      showFilters ? "rotate-180" : ""
                    }`}
                  />
                </button>

                <div
                  className="
                    flex
                    h-10
                    items-center
                    rounded-xl
                    border
                    bg-slate-50
                    p-1
                  "
                  style={{
                    borderColor: THEME.border,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    title="Tampilan tabel"
                    aria-label="Tampilan tabel"
                    aria-pressed={viewMode === "table"}
                    className={`
                      flex
                      h-8
                      w-8
                      items-center
                      justify-center
                      rounded-lg
                      transition
                      ${
                        viewMode === "table"
                          ? "bg-white text-teal-700 shadow-sm"
                          : "text-slate-400 hover:text-slate-700"
                      }
                    `}
                  >
                    <List size={15} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    title="Tampilan grid"
                    aria-label="Tampilan grid"
                    aria-pressed={viewMode === "grid"}
                    className={`
                      flex
                      h-8
                      w-8
                      items-center
                      justify-center
                      rounded-lg
                      transition
                      ${
                        viewMode === "grid"
                          ? "bg-white text-teal-700 shadow-sm"
                          : "text-slate-400 hover:text-slate-700"
                      }
                    `}
                  >
                    <Grid2X2 size={15} />
                  </button>
                </div>

                <NavLink
                  to="/lokasi/peta"
                  className="
                    inline-flex
                    h-10
                    items-center
                    gap-2
                    rounded-xl
                    border
                    bg-white
                    px-3
                    text-[10px]
                    font-bold
                    text-slate-600
                    no-underline
                    shadow-sm
                    transition
                    hover:bg-slate-50
                    hover:text-slate-800
                    focus:outline-none
                    focus:ring-2
                    focus:ring-teal-500/10
                  "
                  style={{
                    borderColor: THEME.border,
                  }}
                >
                  <MapPinned size={14} />
                  Peta
                </NavLink>
              </div>
            </div>

            {/* ACTIVE FILTER SUMMARY */}

            {hasActiveFilters && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  Filter aktif:
                </span>

                {filters.activityType && (
                  <FilterChip
                    label={`Jenis: ${filters.activityType}`}
                    onRemove={() => updateFilter("activityType", "")}
                  />
                )}

                {filters.status && (
                  <FilterChip
                    label={`Status: ${filters.status}`}
                    onRemove={() => updateFilter("status", "")}
                  />
                )}

                {filters.year && (
                  <FilterChip
                    label={`Tahun: ${filters.year}`}
                    onRemove={() => updateFilter("year", "")}
                  />
                )}

                {filters.province && (
                  <FilterChip
                    label={`Provinsi: ${filters.province}`}
                    onRemove={() => updateFilter("province", "")}
                  />
                )}

                {filters.das && (
                  <FilterChip
                    label={`DAS: ${filters.das}`}
                    onRemove={() => updateFilter("das", "")}
                  />
                )}

                {filters.search && (
                  <FilterChip
                    label={`Pencarian: ${filters.search}`}
                    onRemove={() => updateFilter("search", "")}
                  />
                )}

                <button
                  type="button"
                  onClick={resetFilters}
                  className="
                    ml-1
                    inline-flex
                    items-center
                    gap-1
                    text-[9px]
                    font-bold
                    text-teal-700
                    transition
                    hover:text-teal-900
                  "
                >
                  <X size={11} />
                  Reset semua
                </button>
              </div>
            )}

            {/* FILTER PANEL */}

            {showFilters && (
              <div
                className="
                  mt-3
                  rounded-xl
                  border
                  bg-slate-50
                  p-3
                "
                style={{
                  borderColor: THEME.border,
                }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-bold text-slate-700">
                      Filter Registry
                    </div>

                    <div className="mt-0.5 text-[9px] text-slate-500">
                      Persempit data berdasarkan klasifikasi, wilayah, dan
                      status.
                    </div>
                  </div>

                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="
                        inline-flex
                        items-center
                        gap-1
                        text-[9px]
                        font-bold
                        text-teal-700
                        hover:text-teal-900
                      "
                    >
                      <X size={11} />
                      Reset
                    </button>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <FilterSelect
                    label="Jenis Kegiatan"
                    value={filters.activityType}
                    onChange={(value) => updateFilter("activityType", value)}
                    options={activityTypes}
                    placeholder="Semua jenis"
                  />

                  <FilterSelect
                    label="Status"
                    value={filters.status}
                    onChange={(value) => updateFilter("status", value)}
                    options={[
                      "Draft",
                      "Direncanakan",
                      "Berjalan",
                      "Selesai",
                      "Ditunda",
                      "Menunggu Verifikasi",
                    ]}
                    placeholder="Semua status"
                  />

                  <FilterSelect
                    label="Tahun"
                    value={filters.year}
                    onChange={(value) => updateFilter("year", value)}
                    options={getYearOptions()}
                    placeholder="Semua tahun"
                  />

                  <FilterSelect
                    label="Provinsi"
                    value={filters.province}
                    onChange={(value) => updateFilter("province", value)}
                    options={provinces}
                    placeholder="Semua provinsi"
                  />

                  <FilterSelect
                    label="DAS"
                    value={filters.das}
                    onChange={(value) => updateFilter("das", value)}
                    options={dasOptions}
                    placeholder="Semua DAS"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ERROR */}

          {error && (
            <div
              className="
                border-b
                border-rose-200
                bg-rose-50
                px-4
                py-3
              "
            >
              <div className="flex items-start gap-3">
                <AlertCircle
                  size={16}
                  className="mt-0.5 shrink-0 text-rose-600"
                />

                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-rose-800">
                    Data lokasi tidak dapat dimuat
                  </div>

                  <div className="mt-0.5 text-[10px] text-rose-600">
                    {error}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={fetchLocations}
                  className="
                    ml-auto
                    shrink-0
                    rounded-lg
                    border
                    border-rose-200
                    bg-white
                    px-2.5
                    py-1.5
                    text-[9px]
                    font-bold
                    text-rose-700
                    transition
                    hover:bg-rose-100
                  "
                >
                  Coba lagi
                </button>
              </div>
            </div>
          )}

          {/* RESULT SUMMARY */}

          <div
            className="
              flex
              flex-col
              gap-2
              border-b
              px-4
              py-2.5
              sm:flex-row
              sm:items-center
              sm:justify-between
            "
            style={{
              borderColor: THEME.border,
              backgroundColor: THEME.surface2,
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-700">
                Registry Lokasi
              </span>

              <span className="h-1 w-1 rounded-full bg-slate-300" />

              <span className="text-[9px] font-medium text-slate-500">
                {formatNumber(total)} data
              </span>

              {selectedIds.length > 0 && (
                <>
                  <span className="h-1 w-1 rounded-full bg-slate-300" />

                  <span className="text-[9px] font-bold text-teal-700">
                    {selectedIds.length} dipilih
                  </span>
                </>
              )}
            </div>

            <div className="text-[9px] font-medium text-slate-400">
              Sinkronisasi data melalui API SIMITI
            </div>
          </div>

          {/* TABLE */}

          {viewMode === "table" ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1250px] border-collapse">
                <thead>
                  <tr
                    className="
                      border-b
                      bg-slate-50
                    "
                    style={{
                      borderColor: THEME.border,
                    }}
                  >
                    <th className="w-10 px-4 py-3 text-left">
                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        aria-label="Pilih semua lokasi"
                        className={`
                          flex
                          h-4
                          w-4
                          items-center
                          justify-center
                          rounded
                          border
                          transition
                          ${
                            allVisibleSelected
                              ? "border-teal-700 bg-teal-700 text-white"
                              : "border-slate-300 bg-white"
                          }
                        `}
                      >
                        {allVisibleSelected && (
                          <Check size={11} strokeWidth={3} />
                        )}
                      </button>
                    </th>

                    <SortableHeader
                      label="Kegiatan"
                      field="name"
                      currentField={sortBy}
                      direction={sortDirection}
                      onSort={handleSort}
                    />

                    <th className="px-3 py-3 text-left text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
                      Klasifikasi
                    </th>

                    <SortableHeader
                      label="Tahun"
                      field="year"
                      currentField={sortBy}
                      direction={sortDirection}
                      onSort={handleSort}
                    />

                    <th className="px-3 py-3 text-left text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
                      Lokasi Administrasi
                    </th>

                    <th className="px-3 py-3 text-left text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
                      DAS
                    </th>

                    <SortableHeader
                      label="Luas"
                      field="area"
                      currentField={sortBy}
                      direction={sortDirection}
                      onSort={handleSort}
                    />

                    <th className="px-3 py-3 text-left text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
                      Status
                    </th>

                    <th className="px-3 py-3 text-left text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
                      Dokumen
                    </th>

                    <SortableHeader
                      label="Update"
                      field="updatedAt"
                      currentField={sortBy}
                      direction={sortDirection}
                      onSort={handleSort}
                    />

                    <th className="w-24 px-4 py-3 text-right text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
                      Aksi
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <TableLoading />
                  ) : visibleRecords.length === 0 ? (
                    <EmptyState />
                  ) : (
                    visibleRecords.map((item) => {
                      const selected = selectedIds.includes(item.id);

                      const documentationCount =
                        Number(item.photoBeforeCount ?? 0) +
                        Number(item.photoProgressCount ?? 0) +
                        Number(item.photoAfterCount ?? 0) +
                        Number(item.documentCount ?? 0);

                      return (
                        <tr
                          key={String(item.id)}
                          className={`
                              group
                              border-b
                              transition
                              ${selected ? "bg-teal-50" : "bg-white"}
                              hover:bg-slate-50
                            `}
                          style={{
                            borderColor: THEME.border,
                          }}
                        >
                          <td className="px-4 py-3 align-top">
                            <button
                              type="button"
                              onClick={() => toggleSelection(item.id)}
                              aria-label={
                                selected ? "Batalkan pilihan" : "Pilih lokasi"
                              }
                              className={`
                                  flex
                                  h-4
                                  w-4
                                  items-center
                                  justify-center
                                  rounded
                                  border
                                  transition
                                  ${
                                    selected
                                      ? "border-teal-700 bg-teal-700 text-white"
                                      : "border-slate-300 bg-white"
                                  }
                                `}
                            >
                              {selected && <Check size={11} strokeWidth={3} />}
                            </button>
                          </td>

                          <td className="max-w-[290px] px-3 py-3 align-top">
                            <button
                              type="button"
                              onClick={() => navigate(`/lokasi/${item.id}`)}
                              className="block max-w-full text-left"
                            >
                              <div className="truncate text-[11px] font-bold text-slate-800 transition group-hover:text-teal-700">
                                {item.name}
                              </div>

                              <div className="mt-1 flex items-center gap-1.5 text-[9px] font-medium text-slate-400">
                                <span>ID {item.id}</span>

                                {item.implementingAgency && (
                                  <>
                                    <span>•</span>

                                    <span className="truncate">
                                      {item.implementingAgency}
                                    </span>
                                  </>
                                )}
                              </div>
                            </button>
                          </td>

                          <td className="max-w-[220px] px-3 py-3 align-top">
                            <div className="text-[10px] font-semibold text-slate-600">
                              {item.activityType}
                            </div>

                            {item.fundingSource && (
                              <div className="mt-1 truncate text-[9px] text-slate-400">
                                {item.fundingSource}
                              </div>
                            )}
                          </td>

                          <td className="px-3 py-3 align-top">
                            <div
                              className="
                                  inline-flex
                                  items-center
                                  gap-1.5
                                  rounded-md
                                  border
                                  bg-slate-50
                                  px-2
                                  py-1
                                  text-[10px]
                                  font-bold
                                  text-slate-600
                                "
                              style={{
                                borderColor: THEME.border,
                              }}
                            >
                              <CalendarDays
                                size={11}
                                className="text-slate-400"
                              />

                              {item.year ?? "—"}
                            </div>
                          </td>

                          <td className="max-w-[220px] px-3 py-3 align-top">
                            <div className="flex items-start gap-2">
                              <Navigation
                                size={13}
                                className="mt-0.5 shrink-0 text-teal-700"
                              />

                              <div className="min-w-0">
                                <div className="truncate text-[10px] font-semibold text-slate-700">
                                  {item.village || item.subdistrict || "—"}
                                </div>

                                <div className="mt-1 truncate text-[9px] text-slate-400">
                                  {[item.district, item.province]
                                    .filter(Boolean)
                                    .join(", ") || "—"}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="max-w-[170px] px-3 py-3 align-top">
                            <div className="truncate text-[10px] font-semibold text-slate-700">
                              {item.das || "—"}
                            </div>

                            {item.latitude !== null &&
                              item.latitude !== undefined &&
                              item.longitude !== null &&
                              item.longitude !== undefined && (
                                <div className="mt-1 font-mono text-[8px] text-slate-400">
                                  {Number(item.latitude).toFixed(5)},{" "}
                                  {Number(item.longitude).toFixed(5)}
                                </div>
                              )}
                          </td>

                          <td className="px-3 py-3 align-top">
                            <span className="whitespace-nowrap text-[10px] font-bold text-slate-700">
                              {formatArea(item.area)}
                            </span>
                          </td>

                          <td className="px-3 py-3 align-top">
                            <StatusBadge status={item.status} />

                            {item.verificationStatus && (
                              <div className="mt-1 text-[8px] font-medium text-slate-400">
                                {item.verificationStatus}
                              </div>
                            )}
                          </td>

                          <td className="px-3 py-3 align-top">
                            <div
                              className="
                                  flex
                                  h-7
                                  min-w-7
                                  items-center
                                  justify-center
                                  gap-1
                                  rounded-lg
                                  border
                                  bg-slate-50
                                  px-1.5
                                  text-[9px]
                                  font-bold
                                  text-slate-500
                                "
                              style={{
                                borderColor: THEME.border,
                              }}
                              title="Jumlah dokumentasi"
                            >
                              <FileImage size={11} />

                              {documentationCount}
                            </div>
                          </td>

                          <td className="whitespace-nowrap px-3 py-3 align-top">
                            <div className="text-[9px] font-semibold text-slate-500">
                              {formatDate(item.updatedAt)}
                            </div>
                          </td>

                          <td className="px-4 py-3 align-top">
                            <div className="flex items-center justify-end gap-1">
                              <ActionButton
                                title="Lihat detail"
                                onClick={() => navigate(`/lokasi/${item.id}`)}
                              >
                                <Eye size={14} />
                              </ActionButton>

                              <ActionButton
                                title="Edit"
                                onClick={() =>
                                  navigate(`/lokasi/${item.id}/edit`)
                                }
                              >
                                <Edit3 size={14} />
                              </ActionButton>

                              <ActionButton
                                title="Buka peta"
                                onClick={() =>
                                  navigate(`/lokasi/peta?id=${item.id}`)
                                }
                              >
                                <MapPinned size={14} />
                              </ActionButton>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {loading ? (
                <GridLoading />
              ) : visibleRecords.length === 0 ? (
                <div className="md:col-span-2 xl:col-span-3 2xl:col-span-4">
                  <EmptyStateCard />
                </div>
              ) : (
                visibleRecords.map((item) => (
                  <LocationCard
                    key={String(item.id)}
                    item={item}
                    selected={selectedIds.includes(item.id)}
                    onSelect={() => toggleSelection(item.id)}
                    onView={() => navigate(`/lokasi/${item.id}`)}
                    onEdit={() => navigate(`/lokasi/${item.id}/edit`)}
                  />
                ))
              )}
            </div>
          )}

          {/* FOOTER / PAGINATION */}

          <div
            className="
              flex
              flex-col
              gap-3
              border-t
              px-4
              py-3
              sm:flex-row
              sm:items-center
              sm:justify-between
            "
            style={{
              borderColor: THEME.border,
              backgroundColor: THEME.surface2,
            }}
          >
            <div className="text-[10px] font-medium text-slate-500">
              Menampilkan{" "}
              <span className="font-bold text-slate-700">{pageStart}</span> —{" "}
              <span className="font-bold text-slate-700">{pageEnd}</span> dari{" "}
              <span className="font-bold text-slate-700">
                {formatNumber(total)}
              </span>{" "}
              lokasi
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                aria-label="Halaman sebelumnya"
                className="
                  flex
                  h-8
                  w-8
                  items-center
                  justify-center
                  rounded-lg
                  border
                  bg-white
                  text-slate-500
                  shadow-sm
                  transition
                  hover:bg-slate-50
                  hover:text-slate-800
                  disabled:cursor-not-allowed
                  disabled:opacity-30
                "
                style={{
                  borderColor: THEME.border,
                }}
              >
                <ChevronLeft size={14} />
              </button>

              <div className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-teal-700 px-2 text-[10px] font-extrabold text-white">
                {page}
              </div>

              <span className="px-1 text-[10px] text-slate-400">
                / {totalPages}
              </span>

              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() =>
                  setPage((prev) => Math.min(totalPages, prev + 1))
                }
                aria-label="Halaman berikutnya"
                className="
                  flex
                  h-8
                  w-8
                  items-center
                  justify-center
                  rounded-lg
                  border
                  bg-white
                  text-slate-500
                  shadow-sm
                  transition
                  hover:bg-slate-50
                  hover:text-slate-800
                  disabled:cursor-not-allowed
                  disabled:opacity-30
                "
                style={{
                  borderColor: THEME.border,
                }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </section>

        {/* ====================================================
            ENTERPRISE QUICK MODULES
        ==================================================== */}

        <section className="mt-5">
          <div className="mb-3">
            <div className="text-[11px] font-bold text-slate-700">
              Workspace Lokasi
            </div>

            <div className="mt-0.5 text-[9px] font-medium text-slate-500">
              Akses cepat untuk pengelolaan dan validasi registri spasial.
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <QuickModule
              icon={Plus}
              title="Input Lokasi"
              description="Tambah kegiatan dengan koordinat dan atribut lengkap."
              href="/lokasi/tambah"
            />

            <QuickModule
              icon={MapPinned}
              title="Pemetaan Spasial"
              description="Visualisasikan seluruh lokasi pada peta interaktif."
              href="/lokasi/peta"
            />

            <QuickModule
              icon={ClipboardCheck}
              title="Verifikasi"
              description="Review dan validasi data lokasi kegiatan."
              href="/lokasi/verifikasi"
            />

            <QuickModule
              icon={FileImage}
              title="Dokumentasi"
              description="Kelola foto dan dokumen pendukung kegiatan."
              href="/lokasi/dokumentasi"
            />
          </div>
        </section>

        {/* ====================================================
            DATA GOVERNANCE
        ==================================================== */}

        <section
          className="
            mt-5
            rounded-2xl
            border
            bg-white
            p-4
            shadow-[0_4px_18px_rgba(15,23,42,0.03)]
          "
          style={{
            borderColor: THEME.border,
          }}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div
                className="
                  flex
                  h-9
                  w-9
                  shrink-0
                  items-center
                  justify-center
                  rounded-xl
                  border
                  text-teal-700
                "
                style={{
                  backgroundColor: THEME.primaryBg,
                  borderColor: "#CCFBF1",
                }}
              >
                <ShieldCheck size={17} />
              </div>

              <div>
                <div className="text-[11px] font-bold text-slate-700">
                  Spatial Data Governance
                </div>

                <div className="mt-1 max-w-3xl text-[9px] leading-relaxed text-slate-500">
                  Data lokasi dirancang untuk mendukung validasi koordinat,
                  metadata kegiatan, dokumentasi, verifikasi, dan
                  interoperabilitas data spasial SIMITI.
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <GovernanceBadge icon={Database} label="PostGIS Ready" />

              <GovernanceBadge
                icon={Navigation}
                label="Coordinate Validation"
              />

              <GovernanceBadge icon={FileCheck2} label="Metadata" />

              <GovernanceBadge
                icon={ShieldCheck}
                label="Verification Workflow"
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

/* ============================================================
   FILTER CHIP
============================================================ */

function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span
      className="
        inline-flex
        max-w-[260px]
        items-center
        gap-1.5
        rounded-lg
        border
        bg-teal-50
        px-2
        py-1
        text-[9px]
        font-semibold
        text-teal-700
      "
      style={{
        borderColor: "#CCFBF1",
      }}
    >
      <span className="truncate">{label}</span>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Hapus ${label}`}
        className="
          shrink-0
          rounded
          p-0.5
          text-teal-600
          transition
          hover:bg-teal-100
          hover:text-teal-900
        "
      >
        <X size={10} />
      </button>
    </span>
  );
}

/* ============================================================
   FILTER SELECT
============================================================ */

function FilterSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </span>

      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="
            h-9
            w-full
            appearance-none
            rounded-lg
            border
            bg-white
            px-3
            pr-8
            text-[10px]
            font-semibold
            text-slate-700
            outline-none
            transition
            focus:ring-2
            focus:ring-teal-500/10
          "
          style={{
            borderColor: THEME.border,
          }}
        >
          <option value="">{placeholder}</option>

          {options.filter(Boolean).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <ChevronDown
          size={13}
          className="
            pointer-events-none
            absolute
            right-2.5
            top-1/2
            -translate-y-1/2
            text-slate-400
          "
        />
      </div>
    </label>
  );
}

/* ============================================================
   SORTABLE HEADER
============================================================ */

function SortableHeader({
  label,
  field,
  currentField,
  direction,
  onSort,
}: {
  label: string;
  field: "updatedAt" | "name" | "year" | "area";
  currentField: string;
  direction: "asc" | "desc";
  onSort: (field: "updatedAt" | "name" | "year" | "area") => void;
}) {
  const active = currentField === field;

  return (
    <th className="px-3 py-3 text-left">
      <button
        type="button"
        onClick={() => onSort(field)}
        className="
          inline-flex
          items-center
          gap-1.5
          text-[9px]
          font-bold
          uppercase
          tracking-[0.12em]
          text-slate-500
          transition
          hover:text-slate-800
        "
      >
        {label}

        <ArrowUpDown
          size={11}
          className={active ? "text-teal-700" : "text-slate-300"}
        />

        {active && (
          <span className="text-[8px] text-teal-700">
            {direction === "asc" ? "↑" : "↓"}
          </span>
        )}
      </button>
    </th>
  );
}

/* ============================================================
   ACTION BUTTON
============================================================ */

function ActionButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="
        flex
        h-7
        w-7
        items-center
        justify-center
        rounded-lg
        border
        border-transparent
        text-slate-400
        transition
        hover:border-teal-100
        hover:bg-teal-50
        hover:text-teal-700
        focus:outline-none
        focus:ring-2
        focus:ring-teal-500/10
      "
    >
      {children}
    </button>
  );
}

/* ============================================================
   TABLE LOADING
============================================================ */

function TableLoading() {
  return (
    <>
      {Array.from({
        length: 7,
      }).map((_, index) => (
        <tr key={index} className="border-b border-slate-100">
          <td colSpan={11} className="px-4 py-3">
            <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
          </td>
        </tr>
      ))}
    </>
  );
}

/* ============================================================
   EMPTY TABLE
============================================================ */

function EmptyState() {
  return (
    <tr>
      <td colSpan={11} className="px-6 py-16 text-center">
        <div className="mx-auto flex max-w-md flex-col items-center">
          <div
            className="
              flex
              h-12
              w-12
              items-center
              justify-center
              rounded-2xl
              border
              bg-slate-50
              text-slate-400
            "
            style={{
              borderColor: THEME.border,
            }}
          >
            <Database size={21} />
          </div>

          <div className="mt-3 text-[12px] font-bold text-slate-700">
            Tidak ada data lokasi
          </div>

          <div className="mt-1 text-[10px] leading-relaxed text-slate-500">
            Belum ada registri yang sesuai dengan filter atau data belum
            tersedia dari API.
          </div>
        </div>
      </td>
    </tr>
  );
}

/* ============================================================
   GRID LOADING
============================================================ */

function GridLoading() {
  return (
    <>
      {Array.from({
        length: 8,
      }).map((_, index) => (
        <div
          key={index}
          className="
            h-52
            animate-pulse
            rounded-2xl
            border
            bg-slate-100
          "
          style={{
            borderColor: THEME.border,
          }}
        />
      ))}
    </>
  );
}

/* ============================================================
   EMPTY CARD
============================================================ */

function EmptyStateCard() {
  return (
    <div
      className="
        flex
        min-h-[360px]
        flex-col
        items-center
        justify-center
        rounded-2xl
        border
        bg-slate-50
        text-center
      "
      style={{
        borderColor: THEME.border,
      }}
    >
      <div
        className="
          flex
          h-12
          w-12
          items-center
          justify-center
          rounded-2xl
          border
          bg-white
          text-slate-400
        "
        style={{
          borderColor: THEME.border,
        }}
      >
        <Database size={21} />
      </div>

      <div className="mt-3 text-[12px] font-bold text-slate-700">
        Belum ada lokasi
      </div>

      <div className="mt-1 max-w-sm text-[10px] text-slate-500">
        Data kegiatan akan tampil setelah tersedia pada backend SIMITI.
      </div>
    </div>
  );
}

/* ============================================================
   LOCATION CARD
============================================================ */

function LocationCard({
  item,
  selected,
  onSelect,
  onView,
  onEdit,
}: {
  item: ActivityRecord;
  selected: boolean;
  onSelect: () => void;
  onView: () => void;
  onEdit: () => void;
}) {
  return (
    <div
      className={`
        group
        rounded-2xl
        border
        bg-white
        p-4
        shadow-[0_4px_18px_rgba(15,23,42,0.035)]
        transition-all
        duration-200
        hover:-translate-y-[1px]
        hover:shadow-[0_8px_24px_rgba(15,23,42,0.07)]
        ${selected ? "border-teal-200 bg-teal-50/40" : "border-slate-200"}
      `}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={onSelect}
          aria-label={selected ? "Batalkan pilihan lokasi" : "Pilih lokasi"}
          className={`
            flex
            h-5
            w-5
            shrink-0
            items-center
            justify-center
            rounded
            border
            transition
            ${
              selected
                ? "border-teal-700 bg-teal-700 text-white"
                : "border-slate-300 bg-white"
            }
          `}
        >
          {selected && <Check size={12} strokeWidth={3} />}
        </button>

        <StatusBadge status={item.status} />
      </div>

      <button
        type="button"
        onClick={onView}
        className="mt-4 block w-full text-left"
      >
        <div className="line-clamp-2 text-[12px] font-extrabold leading-relaxed text-slate-800 transition group-hover:text-teal-700">
          {item.name}
        </div>

        <div className="mt-1 text-[9px] font-medium text-slate-400">
          ID {item.id}
        </div>
      </button>

      <div
        className="
          mt-4
          space-y-2
          border-t
          pt-3
        "
        style={{
          borderColor: THEME.border,
        }}
      >
        <InfoRow icon={Trees} label="Jenis" value={item.activityType} />

        <InfoRow icon={CalendarDays} label="Tahun" value={item.year ?? "—"} />

        <InfoRow
          icon={MapPinned}
          label="Lokasi"
          value={
            [item.village, item.district, item.province]
              .filter(Boolean)
              .join(", ") || "—"
          }
        />

        <InfoRow icon={Target} label="Luas" value={formatArea(item.area)} />

        <InfoRow icon={Database} label="DAS" value={item.das || "—"} />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onView}
          className="
            inline-flex
            h-8
            flex-1
            items-center
            justify-center
            gap-1.5
            rounded-lg
            border
            bg-white
            text-[9px]
            font-bold
            text-slate-600
            shadow-sm
            transition
            hover:bg-slate-50
            hover:text-slate-800
            focus:outline-none
            focus:ring-2
            focus:ring-teal-500/10
          "
          style={{
            borderColor: THEME.border,
          }}
        >
          <Eye size={13} />
          Detail
        </button>

        <button
          type="button"
          onClick={onEdit}
          className="
            inline-flex
            h-8
            flex-1
            items-center
            justify-center
            gap-1.5
            rounded-lg
            bg-teal-700
            text-[9px]
            font-extrabold
            text-white
            transition
            hover:bg-teal-800
            focus:outline-none
            focus:ring-2
            focus:ring-teal-500/20
          "
        >
          <Edit3 size={13} />
          Edit
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   INFO ROW
============================================================ */

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={12} className="mt-0.5 shrink-0 text-slate-400" />

      <div className="min-w-0 flex-1">
        <div className="text-[8px] font-bold uppercase tracking-wide text-slate-400">
          {label}
        </div>

        <div className="mt-0.5 truncate text-[9px] font-semibold text-slate-600">
          {value}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   QUICK MODULE
============================================================ */

function QuickModule({
  icon: Icon,
  title,
  description,
  href,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <NavLink
      to={href}
      className="
        group
        rounded-2xl
        border
        bg-white
        p-4
        no-underline
        shadow-[0_4px_18px_rgba(15,23,42,0.035)]
        transition-all
        duration-200
        hover:-translate-y-[1px]
        hover:shadow-[0_8px_24px_rgba(15,23,42,0.07)]
      "
      style={{
        borderColor: THEME.border,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="
            flex
            h-9
            w-9
            shrink-0
            items-center
            justify-center
            rounded-xl
            border
            text-teal-700
            transition
            group-hover:bg-teal-700
            group-hover:text-white
          "
          style={{
            backgroundColor: THEME.primaryBg,
            borderColor: "#CCFBF1",
          }}
        >
          <Icon size={16} />
        </div>

        <div className="min-w-0">
          <div className="text-[11px] font-bold text-slate-700 transition group-hover:text-teal-700">
            {title}
          </div>

          <div className="mt-1 text-[9px] leading-relaxed text-slate-500">
            {description}
          </div>
        </div>
      </div>
    </NavLink>
  );
}

/* ============================================================
   GOVERNANCE BADGE
============================================================ */

function GovernanceBadge({
  icon: Icon,
  label,
}: {
  icon: React.ElementType;
  label: string;
}) {
  return (
    <div
      className="
        inline-flex
        items-center
        gap-1.5
        rounded-lg
        border
        bg-slate-50
        px-2.5
        py-1.5
        text-[8px]
        font-bold
        text-slate-500
      "
      style={{
        borderColor: THEME.border,
      }}
    >
      <Icon size={11} />

      {label}
    </div>
  );
}

/* ============================================================
   YEAR OPTIONS
============================================================ */

function getYearOptions() {
  const currentYear = new Date().getFullYear();

  return Array.from(
    {
      length: 15,
    },
    (_, index) => String(currentYear - index),
  );
}
