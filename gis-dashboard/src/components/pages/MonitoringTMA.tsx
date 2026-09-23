import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  Activity,
  Battery,
  CloudRain,
  Droplets,
  Leaf,
  MapPin,
  Thermometer,
  Waves,
  Wifi,
  Zap,
} from "lucide-react";

import "./monitoringTMA.css";

type RawStation = Record<string, any>;

type Station = {
  id: string;
  name: string;
  code: string;
  tma: number | null;
  temperature: number | null;
  humidity: number | null;
  ph: number | null;
  ec: number | null;
  potassium: number | null;
  rainfall: number | null;
  battery: number | null;
  status: string;
  updatedAt: string;
  location: string;
  province: string;
  raw: RawStation;
};

const API_URL = String(
  import.meta.env.VITE_SIPEAT_API_URL || "https://sipeat-2026.web.app/api",
).replace(/\/+$/, "");

const API_TOKEN = String(import.meta.env.VITE_SIPEAT_API_KEY || "");

const SIPEAT_ID = String(import.meta.env.VITE_SIPEAT_ID || "all").trim();

const REFRESH_MS = Number(import.meta.env.VITE_KHDTK_REFRESH_MS || 600000);

/* =========================================================
   HELPERS
========================================================= */

const numberValue = (...values: any[]): number | null => {
  for (const value of values) {
    if (value === null || value === undefined || value === "") {
      continue;
    }

    const n = Number(String(value).replace(",", "."));

    if (Number.isFinite(n)) {
      return n;
    }
  }

  return null;
};

const textValue = (...values: any[]): string => {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value);
    }
  }

  return "";
};

/* =========================================================
   EXTRACT API ROWS
========================================================= */

function extractRows(payload: any): RawStation[] {
  if (!payload) {
    return [];
  }

  /*
   * RESPONSE:
   * {
   *   success: true,
   *   ID: "all",
   *   data: {
   *     "station1": {...},
   *     "station2": {...}
   *   }
   * }
   */

  if (
    payload?.success &&
    String(payload?.ID).toLowerCase() === "all" &&
    payload?.data &&
    typeof payload.data === "object" &&
    !Array.isArray(payload.data)
  ) {
    return Object.entries(payload.data).map(([key, value]: [string, any]) => ({
      ...(value || {}),
      id: key,
      station_id: key,
    }));
  }

  /*
   * RESPONSE:
   * {
   *   success: true,
   *   ID: "xxx",
   *   data: {...}
   * }
   */

  if (
    payload?.success &&
    payload?.data &&
    typeof payload.data === "object" &&
    !Array.isArray(payload.data)
  ) {
    return [
      {
        ...payload.data,
        id: payload.ID,
        station_id: payload.ID,
      },
    ];
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.stations)) {
    return payload.stations;
  }

  if (Array.isArray(payload?.results)) {
    return payload.results;
  }

  if (Array.isArray(payload?.data?.items)) {
    return payload.data.items;
  }

  if (Array.isArray(payload?.data?.stations)) {
    return payload.data.stations;
  }

  return [];
}

/* =========================================================
   SIPEAT DATE
========================================================= */

function sipeatDate(tanggal: any, jam: any) {
  if (!tanggal) {
    return "";
  }

  const rawDate = String(tanggal).trim();
  const time = String(jam || "00:00:00").trim();

  const parts = rawDate.split("-");

  if (parts.length === 3 && parts[0].length === 2) {
    const [dd, mm, yyyy] = parts;

    return `${yyyy}-${mm}-${dd}T${time}`;
  }

  return `${rawDate}${time ? `T${time}` : ""}`;
}

/* =========================================================
   NORMALIZE STATION
========================================================= */

function normalizeStation(row: RawStation, index: number): Station {
  const latest =
    row.latest ?? row.latest_data ?? row.last_reading ?? row.reading ?? {};

  /*
   * latest data menimpa data utama
   */
  const source = {
    ...row,
    ...latest,
  };

  /*
   * STATUS DARI API
   *
   * Tidak menentukan status berdasarkan:
   * - lokasi
   * - TMA
   * - suhu
   * - hardcode station
   *
   * Status murni dibaca dari data SIPEAT.
   */

  const statusRaw = textValue(
    source.status,
    source.statusled,
    source.condition,
    source.alert_status,
    "normal",
  ).toLowerCase();

  const status = statusRaw.includes("awas")
    ? "Awas"
    : statusRaw.includes("siaga")
      ? "Siaga"
      : statusRaw.includes("waspada")
        ? "Waspada"
        : "Normal";

  return {
    id: textValue(source.id, source.station_id, source.code, index),

    name: textValue(
      source.idname,
      source.station_name,
      source.stationName,
      source.location_name,
      source.site_name,
      source.name,
      `Lokasi ${index + 1}`,
    ),

    code: textValue(
      source.code,
      source.station_code,
      source.station_id,
      `KHDTK-${index + 1}`,
    ),

    tma: numberValue(
      source.tma,
      source.kedalaman,
      source.water_level,
      source.waterLevel,
      source.water_level_cm,
    ),

    temperature: numberValue(source.temperature, source.temp, source.suhu),

    humidity: numberValue(
      source.humidity,
      source.humidity_percent,
      source.kelembaban,
    ),

    ph: numberValue(source.ph, source.pH),

    ec: numberValue(source.ec, source.ec_us_cm, source.conductivity),

    potassium: numberValue(
      source.potassium,
      source.Potassium,
      source.kalium,
      source.k,
    ),

    rainfall: numberValue(
      source.rainfall,
      source.Rain,
      source.rain,
      source.curah_hujan,
      source.rainfall_mm,
    ),

    battery: numberValue(
      source.battery,
      source.persen,
      source.battery_percent,
      source.battery_level,
    ),

    status,

    updatedAt: textValue(
      source.updated_at,
      source.updatedAt,
      source.timestamp,
      source.time,
      sipeatDate(source.tanggal, source.jam),
      "-",
    ),

    location: textValue(
      source.location,
      source.site,
      source.kecamatan,
      source.kabupaten,
      "-",
    ),

    province: textValue(source.province, source.provinsi, "-"),

    raw: row,
  };
}

/* =========================================================
   FORMAT
========================================================= */

function formatNumber(value: number | null, digits = 1) {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  return value.toLocaleString("id-ID", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatDate(value: string) {
  if (!value || value === "-") {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/* =========================================================
   METRICS
========================================================= */

type MetricKey =
  | "tma"
  | "temperature"
  | "humidity"
  | "ph"
  | "ec"
  | "potassium"
  | "rainfall"
  | "battery";

type Metric = {
  key: MetricKey;
  title: string;
  unit: string;
  icon: React.ReactNode;
  className: string;
  min: number;
  max: number;
};

const metrics: Metric[] = [
  {
    key: "tma",
    title: "Tinggi Muka Air",
    unit: "cm",
    icon: <Waves />,
    className: "blue",
    min: -150,
    max: 20,
  },

  {
    key: "temperature",
    title: "Suhu",
    unit: "°C",
    icon: <Thermometer />,
    className: "red",
    min: 0,
    max: 40,
  },

  {
    key: "humidity",
    title: "Kelembaban",
    unit: "%",
    icon: <Droplets />,
    className: "cyan",
    min: 0,
    max: 100,
  },

  {
    key: "ph",
    title: "pH",
    unit: "pH",
    icon: <Droplets />,
    className: "green",
    min: 0,
    max: 14,
  },

  {
    key: "ec",
    title: "EC",
    unit: "µS/cm",
    icon: <Activity />,
    className: "purple",
    min: 0,
    max: 250,
  },

  {
    key: "potassium",
    title: "Kalium",
    unit: "mg/L",
    icon: <Zap />,
    className: "orange",
    min: -3,
    max: 1,
  },

  {
    key: "rainfall",
    title: "Curah Hujan",
    unit: "mm",
    icon: <CloudRain />,
    className: "slate",
    min: 0,
    max: 40,
  },

  {
    key: "battery",
    title: "Battery",
    unit: "%",
    icon: <Battery />,
    className: "yellow",
    min: 0,
    max: 100,
  },
];

function metricValue(station: Station, key: MetricKey) {
  return station[key];
}

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function MonitoringKHDTK() {
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  /* =======================================================
     LOAD SIPEAT
  ======================================================= */

  const load = useCallback(async () => {
    if (!API_URL) {
      setError("VITE_KHDTK_API_URL belum diisi.");

      setLoading(false);

      return;
    }

    setError("");

    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
      };

      if (!API_TOKEN) {
        throw new Error("VITE_SIPEAT_API_KEY belum diisi.");
      }

      const params = new URLSearchParams({
        key: API_TOKEN,
        ID: SIPEAT_ID,
        lastdata: "",
      });

      const response = await fetch(`${API_URL}?${params.toString()}`, {
        method: "GET",
        headers,
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const payload = await response.json();

      const normalized = extractRows(payload).map(normalizeStation);

      setStations(normalized);

      setSelectedId((current) =>
        current && normalized.some((station) => station.id === current)
          ? current
          : normalized[0]?.id || "",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal mengambil data API.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  /* =======================================================
     AUTO REFRESH
  ======================================================= */

  useEffect(() => {
    void load();

    const timer = window.setInterval(() => void load(), REFRESH_MS);

    return () => window.clearInterval(timer);
  }, [load]);

  /* =======================================================
     SELECTED STATION
  ======================================================= */

  const selectedStation = useMemo(
    () =>
      stations.find((station) => station.id === selectedId) ||
      stations[0] ||
      null,
    [stations, selectedId],
  );

  /* =======================================================
     STATION YANG DITAMPILKAN
  ======================================================= */

  const visibleStations = useMemo(() => {
    return stations.filter((station) => {
      const name = station.name.trim().toLowerCase();

      const code = station.code.trim().toLowerCase();

      return (
        !name.includes("tumbang nusa") &&
        !name.match(/^titik\s\*[1-3]$/i) &&
        !code.match(/^titik[-\s]\*[1-3]$/i)
      );
    });
  }, [stations]);

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="khdtk-monitoring">
      <div className="khdtk-shell">
        {/* =================================================
            HEADER
        ================================================= */}

        <header className="khdtk-header">
          <div className="khdtk-brand">
            <div className="khdtk-leaf">
              <Leaf />
            </div>

            <div>
              <h1>MONITORING DATA TMA</h1>

              <p>
                {stations.length || 0} Lokasi <span>|</span> Pemantauan
                Lingkungan Secara Real-time
              </p>
            </div>
          </div>
        </header>

        {/* =================================================
            STATUS OVERVIEW
            PALING ATAS
        ================================================= */}

        {stations.length > 0 && <StatusOverview stations={stations} />}

        {/* =================================================
            STATION NAVIGATION
        ================================================= */}

        {visibleStations.length > 0 && (
          <div className="khdtk-stations">
            {visibleStations.map((station) => (
              <button
                key={station.id}
                className={`khdtk-station-tab ${
                  station.id === selectedStation?.id ? "active" : ""
                }`}
                onClick={() => setSelectedId(station.id)}
              >
                <MapPin />

                <span>{station.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* =================================================
            ERROR
        ================================================= */}

        {error && (
          <div className="khdtk-error">
            <strong>API KHDTK:</strong> {error}
            <div className="khdtk-error-help">
              Pastikan URL API, token, CORS, dan format respons sesuai
              konfigurasi SIPEAT.
            </div>
          </div>
        )}

        {/* =================================================
            LOADING / EMPTY
        ================================================= */}

        {loading && !stations.length ? (
          <div className="khdtk-loading">Mengambil data monitoring...</div>
        ) : !stations.length ? (
          <div className="khdtk-empty">Belum ada data stasiun dari API.</div>
        ) : (
          <>
            {/* =============================================
                METRIC GRID
            ============================================= */}

            <section className="khdtk-grid">
              {metrics.map((metric) => (
                <MetricCard
                  key={metric.key}
                  metric={metric}
                  stations={stations}
                />
              ))}
            </section>

            {/* =============================================
                STATION CARDS
            ============================================= */}

            <section className="khdtk-bottom">
              {visibleStations.map((station) => (
                <StationCard
                  key={station.id}
                  station={station}
                  active={station.id === selectedStation?.id}
                  onClick={() => setSelectedId(station.id)}
                />
              ))}

              {/* ===========================================
                  INFO CARD
              =========================================== */}

              <div className="khdtk-info-card">
                <div className="khdtk-info-icon">
                  <Leaf />
                </div>

                <h3>
                  Data Akurat.
                  <br />
                  Keputusan Tepat
                  <br />
                  untuk Kelestarian Hutan
                </h3>

                <div className="khdtk-info-box">
                  <Wifi />

                  <div>
                    <strong>{stations.length} Lokasi KHDTK</strong>

                    <p>
                      Pemantauan lingkungan secara real-time untuk mendukung
                      pengelolaan kawasan dan mitigasi bencana hidrometeorologi.
                    </p>
                  </div>
                </div>

                <div className="khdtk-forest" aria-hidden="true">
                  <span>▲</span>
                  <span>▲</span>
                  <span>▲</span>
                  <span>▲</span>
                  <span>▲</span>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   STATUS OVERVIEW
   ========================================================= */

function StatusOverview({ stations }: { stations: Station[] }) {
  const statusItems = [
    {
      key: "Normal",
      label: "NORMAL",
      description: "Kondisi monitoring normal",
    },

    {
      key: "Waspada",
      label: "WASPADA",
      description: "Terdapat indikasi perubahan",
    },

    {
      key: "Siaga",
      label: "SIAGA",
      description: "Kondisi perlu dipantau",
    },

    {
      key: "Awas",
      label: "AWAS",
      description: "Perlu perhatian segera",
    },
  ];

  return (
    <section className="status-overview">
      {/* =================================================
          HEADER
      ================================================= */}

      <div className="status-overview-header">
        <div className="status-overview-heading">
          <div className="status-overview-icon">
            <Activity />
          </div>

          <div>
            <span className="status-overview-eyebrow">
              ENTERPRISE MONITORING
            </span>

            <h2>STATUS MONITORING</h2>

            <p>
              Distribusi status seluruh lokasi KHDTK berdasarkan data terkini
              dari SIPEAT
            </p>
          </div>
        </div>

        <div className="status-overview-total">
          <span>TOTAL LOKASI</span>

          <strong>{stations.length}</strong>
        </div>
      </div>

      {/* =================================================
          STATUS CARDS
      ================================================= */}

      <div className="status-overview-grid">
        {statusItems.map((item) => {
          const count = stations.filter(
            (station) => station.status === item.key,
          ).length;

          const percentage = stations.length
            ? Math.round((count / stations.length) * 100)
            : 0;

          return (
            <div
              key={item.key}
              className={`status-overview-item ${item.key.toLowerCase()}`}
            >
              <div className="status-overview-item-top">
                <span className="status-overview-dot">
                  <span />
                </span>

                <span className="status-overview-label">{item.label}</span>
              </div>

              <div className="status-overview-value">
                <strong>{count}</strong>

                <span>lokasi</span>
              </div>

              <div className="status-overview-description">
                {item.description}
              </div>

              <div className="status-overview-progress">
                <span
                  style={{
                    width: `${percentage}%`,
                  }}
                />
              </div>

              <div className="status-overview-percent">{percentage}%</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* =========================================================
   METRIC CARD
========================================================= */

function MetricCard({
  metric,
  stations,
}: {
  metric: Metric;
  stations: Station[];
}) {
  const values = stations.map((station) => metricValue(station, metric.key));

  return (
    <article className="metric-card">
      <div className={`metric-icon ${metric.className}`}>{metric.icon}</div>

      <div className="metric-heading">
        <h2>{metric.title}</h2>

        <span>({metric.unit})</span>
      </div>

      <div className="mini-chart">
        <div className="chart-grid-lines">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>

        <div className="bars">
          {stations.map((station, index) => {
            const value = values[index];

            /*
             * TMA:
             * semakin kecil / semakin minus
             * = bar semakin panjang
             *
             * Parameter lain:
             * semakin besar
             * = bar semakin panjang
             */

            let normalized = 0;

            if (value !== null) {
              if (metric.key === "tma") {
                normalized =
                  1 - (value - metric.min) / (metric.max - metric.min);
              } else {
                normalized = (value - metric.min) / (metric.max - metric.min);
              }

              normalized = Math.max(0.06, Math.min(1, normalized));
            }

            const barHeight = value === null ? 0 : Math.round(normalized * 100);

            return (
              <div className="bar-wrap" key={station.id}>
                <strong>
                  {value === null
                    ? "—"
                    : formatNumber(value, metric.key === "battery" ? 0 : 1)}
                </strong>

                <div className="bar-track">
                  <div
                    className={`bar ${metric.className}`}
                    style={{
                      height: `${barHeight}%`,
                    }}
                    title={`${station.name}: ${value ?? "—"} ${metric.unit}`}
                  />
                </div>

                <span>{shortName(station.name)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </article>
  );
}

/* =========================================================
   STATION CARD
========================================================= */

function StationCard({
  station,
  active,
  onClick,
}: {
  station: Station;
  active: boolean;
  onClick: () => void;
}) {
  const statusClass = station.status.toLowerCase().replace(/\s+/g, "-");

  const statusDescription =
    station.status === "Awas"
      ? "Perlu perhatian segera"
      : station.status === "Siaga"
        ? "Kondisi perlu dipantau"
        : station.status === "Waspada"
          ? "Terdapat indikasi perubahan"
          : "Kondisi monitoring stabil";

  return (
    <button
      className={`station-card ${active ? "active" : ""}`}
      onClick={onClick}
    >
      {/* ===============================================
          STATION TITLE
      =============================================== */}

      <div className="station-card-title">
        <MapPin />

        <div>
          <strong>{station.name}</strong>

          <span className="station-code">{station.code}</span>
        </div>
      </div>

      {/* ===============================================
          ENTERPRISE STATUS
      =============================================== */}

      <div className={`enterprise-status ${statusClass}`}>
        <div className="enterprise-status-top">
          <span className="status-indicator">
            <span className="status-pulse" />
          </span>

          <span className="status-label">STATUS MONITORING</span>
        </div>

        <div className="enterprise-status-main">
          <strong>{station.status}</strong>
        </div>

        <div className="enterprise-status-description">{statusDescription}</div>
      </div>

      {/* ===============================================
          LAST UPDATE
      =============================================== */}

      <div className="station-update">
        <span>◷</span>

        <span>Data terakhir</span>

        <strong>{formatDate(station.updatedAt)}</strong>
      </div>
    </button>
  );
}

/* =========================================================
   VALUE ROW
========================================================= */

function ValueRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="value-row">
      <span className="value-icon">{icon}</span>

      <span>{label}</span>

      <strong>{value}</strong>
    </div>
  );
}

/* =========================================================
   SHORT STATION NAME
========================================================= */

function shortName(name: string) {
  const clean = name.replace(/^KHDTK\s\*/i, "").trim();

  if (clean.length <= 11) {
    return clean;
  }

  const parts = clean.split(/\s+/);

  if (parts.length > 1) {
    return `${parts[0]}\n${parts.slice(1).join(" ")}`;
  }

  return `${clean.slice(0, 10)}…`;
}
