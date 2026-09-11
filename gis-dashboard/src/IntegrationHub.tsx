import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CloudSun,
  Database,
  FileWarning,
  Globe2,
  History,
  Layers3,
  Network,
  RefreshCw,
  Server,
  Shield,
  Timer,
  TrendingUp,
  Wifi,
  XCircle,
  Zap,
} from "lucide-react";

import { API_URL } from "./api";

/* =========================================================
   TYPES
========================================================= */

type SourceStatus = "online" | "warning" | "offline" | "syncing" | "unknown";

type SyncStatus = "success" | "running" | "failed" | "warning" | "unknown";

interface IntegrationSource {
  id: string;
  name: string;
  description?: string;
  category?: string;
  protocol?: string;
  status: SourceStatus;
  lastSync?: string | null;
  nextSync?: string | null;
  records?: number | null;
  latency?: number | null;
  syncMode?: string | null;
}

interface SyncActivity {
  id: string;
  sourceId?: string;
  sourceName: string;
  startedAt?: string | null;
  completedAt?: string | null;
  status: SyncStatus;
  records?: number | null;
  duration?: number | null;
  message?: string | null;
}

interface IntegrationLog {
  id: string;
  timestamp?: string | null;
  sourceName?: string | null;
  level: "info" | "warning" | "error" | "success";
  event?: string | null;
  message: string;
}

interface IntegrationMetrics {
  connectedSources?: number | null;
  syncToday?: number | null;
  failedSync?: number | null;
  recordsUpdated?: number | null;
  apiRequests?: number | null;
  avgLatency?: number | null;
}

interface IntegrationOverviewResponse {
  success?: boolean;
  generatedAt?: string;
  metrics?: IntegrationMetrics;
  sources?: IntegrationSource[];
  syncActivity?: SyncActivity[];
  logs?: IntegrationLog[];
}

interface SourceDefinition {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  type: string;

  /*
   * Blue-family identity.
   * Tetap menggunakan soft background agar tidak menyilaukan.
   */
  theme: "blue" | "sky" | "indigo" | "cyan";
}

/* =========================================================
   CONFIG
========================================================= */

const OVERVIEW_ENDPOINT =
  import.meta.env.VITE_INTEROPERABILITY_OVERVIEW_ENDPOINT ||
  "/api/interoperability/overview";

const SYNC_ENDPOINT =
  import.meta.env.VITE_INTEROPERABILITY_SYNC_ENDPOINT ||
  "/api/interoperability/sync";

/*
 * Source definition adalah konfigurasi UI,
 * bukan data statistik/dummy dari backend.
 */
const SOURCE_DEFINITIONS: SourceDefinition[] = [
  {
    id: "bmkg",
    name: "BMKG",
    description: "Cuaca, curah hujan, gempa dan peringatan dini",
    icon: CloudSun,
    type: "Meteorologi",
    theme: "blue",
  },
  {
    id: "bnpb",
    name: "BNPB",
    description: "Informasi kejadian dan data kebencanaan",
    icon: Shield,
    type: "Kebencanaan",
    theme: "sky",
  },
  {
    id: "sigap",
    name: "SIGAP Kehutanan",
    description: "Data spasial dan informasi kehutanan",
    icon: Globe2,
    type: "Kehutanan",
    theme: "indigo",
  },
  {
    id: "tma",
    name: "TMA Tumbang Nusa",
    description: "Monitoring tinggi muka air dan hidrologi",
    icon: Database,
    type: "Hidrologi",
    theme: "cyan",
  },
];

/* =========================================================
   HELPERS
========================================================= */

const buildApiUrl = (path: string) => {
  const baseUrl = API_URL.replace(/\/$/, "");
  const cleanPath = path.replace(/^\//, "");

  return `${baseUrl}/${cleanPath}`;
};

const formatNumber = (value?: number | null, fallback = "—") => {
  if (value === null || value === undefined) {
    return fallback;
  }

  return new Intl.NumberFormat("id-ID").format(value);
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const formatDuration = (value?: number | null) => {
  if (value === null || value === undefined) {
    return "—";
  }

  if (value < 1000) {
    return `${value} ms`;
  }

  return `${(value / 1000).toFixed(1)} s`;
};

/* =========================================================
   THEME HELPERS
========================================================= */

const getSourceTheme = (theme: SourceDefinition["theme"]) => {
  switch (theme) {
    case "sky":
      return {
        icon: "bg-sky-50 text-sky-600 border-sky-200",
        badge: "bg-sky-50 text-sky-700 border-sky-200",
        border: "border-sky-200",
        accent: "bg-sky-500",
        soft: "bg-sky-50/60",
      };

    case "indigo":
      return {
        icon: "bg-indigo-50 text-indigo-600 border-indigo-200",
        badge: "bg-indigo-50 text-indigo-700 border-indigo-200",
        border: "border-indigo-200",
        accent: "bg-indigo-500",
        soft: "bg-indigo-50/60",
      };

    case "cyan":
      return {
        icon: "bg-cyan-50 text-cyan-600 border-cyan-200",
        badge: "bg-cyan-50 text-cyan-700 border-cyan-200",
        border: "border-cyan-200",
        accent: "bg-cyan-500",
        soft: "bg-cyan-50/60",
      };

    case "blue":
    default:
      return {
        icon: "bg-blue-50 text-blue-600 border-blue-200",
        badge: "bg-blue-50 text-blue-700 border-blue-200",
        border: "border-blue-200",
        accent: "bg-blue-500",
        soft: "bg-blue-50/60",
      };
  }
};

const getStatusMeta = (status: SourceStatus) => {
  switch (status) {
    case "online":
      return {
        label: "Online",
        dot: "bg-emerald-500",
        text: "text-emerald-700",
        bg: "bg-emerald-50",
        border: "border-emerald-200",
      };

    case "warning":
      return {
        label: "Warning",
        dot: "bg-amber-500",
        text: "text-amber-700",
        bg: "bg-amber-50",
        border: "border-amber-200",
      };

    case "offline":
      return {
        label: "Offline",
        dot: "bg-red-500",
        text: "text-red-700",
        bg: "bg-red-50",
        border: "border-red-200",
      };

    case "syncing":
      return {
        label: "Syncing",
        dot: "bg-blue-500 animate-pulse",
        text: "text-blue-700",
        bg: "bg-blue-50",
        border: "border-blue-200",
      };

    default:
      return {
        label: "Unknown",
        dot: "bg-slate-400",
        text: "text-slate-600",
        bg: "bg-slate-50",
        border: "border-slate-200",
      };
  }
};

const getSyncStatusMeta = (status: SyncStatus) => {
  switch (status) {
    case "success":
      return {
        label: "Success",
        icon: CheckCircle2,
        text: "text-emerald-700",
        bg: "bg-emerald-50",
        border: "border-emerald-200",
      };

    case "running":
      return {
        label: "Running",
        icon: RefreshCw,
        text: "text-blue-700",
        bg: "bg-blue-50",
        border: "border-blue-200",
      };

    case "failed":
      return {
        label: "Failed",
        icon: XCircle,
        text: "text-red-700",
        bg: "bg-red-50",
        border: "border-red-200",
      };

    case "warning":
      return {
        label: "Warning",
        icon: AlertCircle,
        text: "text-amber-700",
        bg: "bg-amber-50",
        border: "border-amber-200",
      };

    default:
      return {
        label: "Unknown",
        icon: FileWarning,
        text: "text-slate-600",
        bg: "bg-slate-50",
        border: "border-slate-200",
      };
  }
};

/* =========================================================
   COMPONENT
========================================================= */

const IntegrationHub: React.FC = () => {
  const [data, setData] = useState<IntegrationOverviewResponse | null>(null);

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [syncingSourceId, setSyncingSourceId] = useState<string | null>(null);

  /* =======================================================
     FETCH OVERVIEW
  ======================================================= */

  const fetchOverview = useCallback(async (silent = false) => {
    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      const response = await fetch(buildApiUrl(OVERVIEW_ENDPOINT), {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = (await response.json()) as IntegrationOverviewResponse;

      setData(result);
    } catch (err) {
      console.error("Failed to load integration overview:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Gagal mengambil data interoperabilitas.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  /* =======================================================
     SYNC SOURCE
  ======================================================= */

  const handleSync = async (sourceId: string) => {
    try {
      setSyncingSourceId(sourceId);
      setError(null);

      const response = await fetch(buildApiUrl(SYNC_ENDPOINT), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          sourceId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      await fetchOverview(true);
    } catch (err) {
      console.error("Failed to sync integration source:", err);

      setError(
        err instanceof Error ? err.message : "Gagal menjalankan sinkronisasi.",
      );
    } finally {
      setSyncingSourceId(null);
    }
  };

  /* =======================================================
     MERGE SOURCE CONFIG + BACKEND
  ======================================================= */

  const sources = useMemo(() => {
    const backendSources = data?.sources ?? [];

    return SOURCE_DEFINITIONS.map((definition) => {
      const backendSource = backendSources.find(
        (source) => source.id === definition.id,
      );

      return {
        definition,
        source: backendSource,
      };
    });
  }, [data?.sources]);

  /* =======================================================
     METRICS
  ======================================================= */

  const metrics = data?.metrics;

  const connectedSources =
    metrics?.connectedSources ??
    (data?.sources
      ? data.sources.filter((source) => source.status === "online").length
      : null);

  const healthPercentage = useMemo(() => {
    if (!data?.sources?.length) {
      return 0;
    }

    const online = data.sources.filter(
      (source) => source.status === "online",
    ).length;

    return Math.round((online / data.sources.length) * 100);
  }, [data?.sources]);

  const systemStatus = useMemo(() => {
    if (!data?.sources?.length) {
      return "unknown";
    }

    const hasOffline = data.sources.some(
      (source) => source.status === "offline",
    );

    const hasWarning = data.sources.some(
      (source) => source.status === "warning",
    );

    const hasSyncing = data.sources.some(
      (source) => source.status === "syncing",
    );

    if (hasOffline) {
      return "critical";
    }

    if (hasWarning) {
      return "warning";
    }

    if (hasSyncing) {
      return "syncing";
    }

    return "healthy";
  }, [data?.sources]);

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* =====================================================
          PAGE HEADER
      ===================================================== */}

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1800px] px-6 py-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-blue-600">
                <Network className="h-6 w-6" />
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                    Integration Hub
                  </h1>

                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-blue-700">
                    Enterprise
                  </span>
                </div>

                <p className="mt-1 text-sm text-slate-500">
                  Centralized interoperability, integration and data exchange
                  monitoring.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    systemStatus === "healthy"
                      ? "bg-emerald-500"
                      : systemStatus === "warning"
                        ? "bg-amber-500"
                        : systemStatus === "critical"
                          ? "bg-red-500"
                          : systemStatus === "syncing"
                            ? "bg-blue-500"
                            : "bg-slate-400"
                  }`}
                />

                <span className="text-xs font-medium text-slate-600">
                  {systemStatus === "healthy"
                    ? "All systems operational"
                    : systemStatus === "warning"
                      ? "System warning"
                      : systemStatus === "critical"
                        ? "System critical"
                        : systemStatus === "syncing"
                          ? "Synchronization active"
                          : "System status unavailable"}
                </span>
              </div>

              <button
                type="button"
                onClick={() => fetchOverview(true)}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw
                  className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] space-y-6 px-6 py-6">
        {/* ===================================================
            ERROR
        =================================================== */}

        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />

            <div className="min-w-0">
              <p className="text-sm font-semibold">
                Integration service unavailable
              </p>

              <p className="mt-0.5 text-xs text-red-600">{error}</p>
            </div>
          </div>
        )}

        {/* ===================================================
            KPI CARDS
        =================================================== */}

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {/* Connected Sources */}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Connected Sources
                </p>

                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {loading ? "—" : formatNumber(connectedSources)}
                </div>
              </div>

              <div className="rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-blue-600">
                <Database className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
              <Server className="h-3.5 w-3.5" />
              <span>External data providers</span>
            </div>
          </div>

          {/* Sync Today */}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Sync Today
                </p>

                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {loading ? "—" : formatNumber(metrics?.syncToday)}
                </div>
              </div>

              <div className="rounded-xl border border-sky-200 bg-sky-50 p-2.5 text-sky-600">
                <RefreshCw className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
              <Activity className="h-3.5 w-3.5" />
              <span>Synchronization executions</span>
            </div>
          </div>

          {/* Failed Sync */}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Failed Sync
                </p>

                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {loading ? "—" : formatNumber(metrics?.failedSync)}
                </div>
              </div>

              <div className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-red-600">
                <XCircle className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
              <FileWarning className="h-3.5 w-3.5" />
              <span>Failed integration jobs</span>
            </div>
          </div>

          {/* Records Updated */}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Records Updated
                </p>

                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {loading ? "—" : formatNumber(metrics?.recordsUpdated)}
                </div>
              </div>

              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-2.5 text-indigo-600">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
              <Layers3 className="h-3.5 w-3.5" />
              <span>Updated integration records</span>
            </div>
          </div>

          {/* API Requests */}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  API Requests
                </p>

                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {loading ? "—" : formatNumber(metrics?.apiRequests)}
                </div>
              </div>

              <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-2.5 text-cyan-600">
                <Zap className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
              <Network className="h-3.5 w-3.5" />
              <span>API traffic</span>
            </div>
          </div>
        </section>

        {/* ===================================================
            SYSTEM HEALTH + PIPELINE
        =================================================== */}

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* System Health */}

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">
                  Integration Health
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Current external connectivity
                </p>
              </div>

              <Activity className="h-5 w-5 text-blue-500" />
            </div>

            <div className="mt-7 flex items-end justify-between">
              <div>
                <div className="text-4xl font-bold tracking-tight text-slate-900">
                  {loading ? "—" : `${healthPercentage}%`}
                </div>

                <p className="mt-1 text-xs text-slate-500">
                  Healthy connections
                </p>
              </div>

              <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />

                <span className="text-xs font-semibold text-emerald-700">
                  Live
                </span>
              </div>
            </div>

            <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{
                  width: `${healthPercentage}%`,
                }}
              />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-sm font-bold text-slate-900">
                  {data?.sources
                    ? data.sources.filter(
                        (source) => source.status === "online",
                      ).length
                    : "—"}
                </div>

                <div className="mt-1 text-[10px] text-slate-500">Online</div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-sm font-bold text-slate-900">
                  {data?.sources
                    ? data.sources.filter(
                        (source) => source.status === "warning",
                      ).length
                    : "—"}
                </div>

                <div className="mt-1 text-[10px] text-slate-500">Warning</div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-sm font-bold text-slate-900">
                  {data?.sources
                    ? data.sources.filter(
                        (source) => source.status === "offline",
                      ).length
                    : "—"}
                </div>

                <div className="mt-1 text-[10px] text-slate-500">Offline</div>
              </div>
            </div>
          </div>

          {/* Pipeline */}

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">
                  Data Integration Pipeline
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  External sources → SIMITI
                </p>
              </div>

              <div className="rounded-xl border border-blue-200 bg-blue-50 p-2 text-blue-600">
                <Network className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-8 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-3">
              {/* Source */}

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-blue-600">
                    <Globe2 className="h-5 w-5" />
                  </div>

                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      External Sources
                    </div>

                    <div className="mt-1 text-xs text-slate-500">
                      BMKG · BNPB · SIGAP · TMA
                    </div>
                  </div>
                </div>
              </div>

              <ArrowRight className="h-5 w-5 text-blue-400" />

              {/* Gateway */}

              <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl border border-blue-200 bg-white p-2.5 text-blue-600 shadow-sm">
                    <Network className="h-5 w-5" />
                  </div>

                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Integration Layer
                    </div>

                    <div className="mt-1 text-xs text-slate-500">
                      API · ETL · Validation
                    </div>
                  </div>
                </div>
              </div>

              <ArrowRight className="h-5 w-5 text-blue-400" />

              {/* SIMITI */}

              <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl border border-indigo-200 bg-white p-2.5 text-indigo-600 shadow-sm">
                    <Database className="h-5 w-5" />
                  </div>

                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      SIMITI
                    </div>

                    <div className="mt-1 text-xs text-slate-500">
                      Spatial Data Platform
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-medium text-blue-700">
                REST API
              </span>

              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-medium text-sky-700">
                JSON
              </span>

              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-medium text-indigo-700">
                GeoJSON
              </span>

              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-medium text-cyan-700">
                Spatial Data
              </span>
            </div>
          </div>
        </section>

        {/* ===================================================
            DATA SOURCES
        =================================================== */}

        <section>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Data Sources
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Integrated external data providers
              </p>
            </div>

            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-blue-600 transition hover:bg-blue-50"
            >
              Manage Sources
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {sources.map(({ definition, source }) => {
              const Icon = definition.icon;

              const theme = getSourceTheme(definition.theme);

              const status = source?.status ?? "unknown";

              const statusMeta = getStatusMeta(status);

              const isSyncing = syncingSourceId === definition.id;

              return (
                <div
                  key={definition.id}
                  className={`group relative overflow-hidden rounded-2xl border ${theme.border} bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`}
                >
                  {/* Top accent */}

                  <div
                    className={`absolute inset-x-0 top-0 h-1 ${theme.accent}`}
                  />

                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl border ${theme.icon}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>

                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusMeta.bg} ${statusMeta.text} ${statusMeta.border}`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${statusMeta.dot}`}
                      />

                      {statusMeta.label}
                    </span>
                  </div>

                  <div className="mt-5">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">
                        {definition.name}
                      </h3>

                      <CheckCircle2
                        className={`h-4 w-4 ${
                          status === "online"
                            ? "text-emerald-500"
                            : "text-slate-300"
                        }`}
                      />
                    </div>

                    <p className="mt-1 text-xs font-medium text-slate-400">
                      {definition.type}
                    </p>

                    <p className="mt-3 min-h-[40px] text-xs leading-5 text-slate-500">
                      {definition.description}
                    </p>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400">
                        <Database className="h-3 w-3" />
                        Records
                      </div>

                      <div className="mt-1 text-sm font-semibold text-slate-800">
                        {formatNumber(source?.records)}
                      </div>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400">
                        <Timer className="h-3 w-3" />
                        Latency
                      </div>

                      <div className="mt-1 text-sm font-semibold text-slate-800">
                        {source?.latency !== null &&
                        source?.latency !== undefined
                          ? `${source.latency} ms`
                          : "—"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Last sync</span>

                      <span className="font-medium text-slate-600">
                        {formatDateTime(source?.lastSync)}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Protocol</span>

                      <span className="font-medium text-slate-600">
                        {source?.protocol ?? "—"}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSync(definition.id)}
                    disabled={
                      isSyncing || status === "offline" || status === "unknown"
                    }
                    className={`mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${theme.badge}`}
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${
                        isSyncing ? "animate-spin" : ""
                      }`}
                    />

                    {isSyncing ? "Synchronizing..." : "Sync Source"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* ===================================================
            LOWER GRID
        =================================================== */}

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {/* =================================================
              SYNC ACTIVITY
          ================================================= */}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="font-semibold text-slate-900">
                  Recent Synchronization
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Latest integration activity
                </p>
              </div>

              <RefreshCw className="h-5 w-5 text-blue-500" />
            </div>

            <div className="divide-y divide-slate-100">
              {loading ? (
                Array.from({
                  length: 4,
                }).map((_, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-4 px-5 py-4"
                  >
                    <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-200" />

                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-3 w-32 animate-pulse rounded bg-slate-200" />
                      <div className="h-2.5 w-48 animate-pulse rounded bg-slate-100" />
                    </div>
                  </div>
                ))
              ) : data?.syncActivity?.length ? (
                data.syncActivity.map((activity) => {
                  const meta = getSyncStatusMeta(activity.status);

                  const StatusIcon = meta.icon;

                  return (
                    <div
                      key={activity.id}
                      className="flex items-center gap-4 px-5 py-4 transition hover:bg-slate-50"
                    >
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${meta.bg} ${meta.text} ${meta.border}`}
                      >
                        <StatusIcon className="h-4 w-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-semibold text-slate-800">
                            {activity.sourceName}
                          </p>

                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold ${meta.bg} ${meta.text} ${meta.border}`}
                          >
                            {meta.label}
                          </span>
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                          <span>
                            {formatDateTime(
                              activity.completedAt ?? activity.startedAt,
                            )}
                          </span>

                          <span>Records: {formatNumber(activity.records)}</span>

                          <span>
                            Duration: {formatDuration(activity.duration)}
                          </span>
                        </div>

                        {activity.message && (
                          <p className="mt-2 truncate text-[11px] text-slate-500">
                            {activity.message}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="px-5 py-12 text-center">
                  <RefreshCw className="mx-auto h-7 w-7 text-slate-300" />

                  <p className="mt-3 text-sm font-medium text-slate-500">
                    No synchronization activity
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    Activity will appear here when available from the
                    integration service.
                  </p>
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                View all synchronization activity
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* =================================================
              INTEGRATION LOGS
          ================================================= */}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="font-semibold text-slate-900">
                  Integration Logs
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Recent integration events
                </p>
              </div>

              <History className="h-5 w-5 text-blue-500" />
            </div>

            <div className="divide-y divide-slate-100">
              {loading ? (
                Array.from({
                  length: 4,
                }).map((_, index) => (
                  <div key={index} className="space-y-2 px-5 py-4">
                    <div className="h-3 w-36 animate-pulse rounded bg-slate-200" />
                    <div className="h-2.5 w-full animate-pulse rounded bg-slate-100" />
                  </div>
                ))
              ) : data?.logs?.length ? (
                data.logs.map((log) => {
                  const levelStyles =
                    log.level === "success"
                      ? {
                          dot: "bg-emerald-500",
                          text: "text-emerald-700",
                        }
                      : log.level === "warning"
                        ? {
                            dot: "bg-amber-500",
                            text: "text-amber-700",
                          }
                        : log.level === "error"
                          ? {
                              dot: "bg-red-500",
                              text: "text-red-700",
                            }
                          : {
                              dot: "bg-blue-500",
                              text: "text-blue-700",
                            };

                  return (
                    <div
                      key={log.id}
                      className="flex gap-3 px-5 py-4 transition hover:bg-slate-50"
                    >
                      <div className="pt-1.5">
                        <span
                          className={`block h-2 w-2 rounded-full ${levelStyles.dot}`}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            {log.sourceName && (
                              <span className="truncate text-xs font-semibold text-slate-700">
                                {log.sourceName}
                              </span>
                            )}

                            {log.event && (
                              <>
                                <span className="text-slate-300">/</span>

                                <span
                                  className={`truncate text-xs font-medium ${levelStyles.text}`}
                                >
                                  {log.event}
                                </span>
                              </>
                            )}
                          </div>

                          <span className="shrink-0 text-[10px] text-slate-400">
                            {formatDateTime(log.timestamp)}
                          </span>
                        </div>

                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {log.message}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="px-5 py-12 text-center">
                  <History className="mx-auto h-7 w-7 text-slate-300" />

                  <p className="mt-3 text-sm font-medium text-slate-500">
                    No integration logs
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    Logs will appear here when provided by the backend service.
                  </p>
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                Open integration logs
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </section>

        {/* ===================================================
            SYSTEM INFO
        =================================================== */}

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-1 divide-y divide-slate-100 md:grid-cols-3 md:divide-x md:divide-y-0">
            <div className="flex items-center gap-4 p-5">
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-blue-600">
                <Server className="h-5 w-5" />
              </div>

              <div>
                <p className="text-xs text-slate-400">Integration Layer</p>

                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {data ? "Connected" : "—"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-5">
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-2.5 text-indigo-600">
                <Database className="h-5 w-5" />
              </div>

              <div>
                <p className="text-xs text-slate-400">Data Pipeline</p>

                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {data?.sources ? "Registered" : "—"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-5">
              <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-2.5 text-cyan-600">
                <Wifi className="h-5 w-5" />
              </div>

              <div>
                <p className="text-xs text-slate-400">Average Latency</p>

                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {metrics?.avgLatency !== null &&
                  metrics?.avgLatency !== undefined
                    ? `${metrics.avgLatency} ms`
                    : "—"}
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default IntegrationHub;
