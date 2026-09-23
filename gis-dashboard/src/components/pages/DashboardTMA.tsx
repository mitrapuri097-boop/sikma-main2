import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Clock3,
  Droplets,
  Gauge,
  Map,
  RefreshCw,
  ShieldAlert,
  Waves,
} from "lucide-react";

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const TMA_API = import.meta.env.VITE_TMA_API_URL || `${API_BASE}/api/tma`;

type Station = {
  id: string | number;
  code?: string;
  name?: string;
  station_name?: string;

  river?: string;
  das?: string;
  province?: string;
  kabupaten?: string;

  latitude?: number | null;
  longitude?: number | null;

  tma?: number | null;
  water_level?: number | null;
  value?: number | null;

  status?: string;
  statusled?: string;

  updated_at?: string;
  timestamp?: string;

  hari?: string;
  tanggal?: string;
  jam?: string;

  kedalaman?: number | null;
  suhu?: number | null;
  kelembaban?: number | null;
  ph?: number | null;
  ec?: number | null;
  Rain?: number | null;
  RainDate?: string;
  RainTime?: string;
  Elevation?: number | null;
  tegangan?: number | null;
  arus?: number | null;
  power?: number | null;
  persen?: number | null;

  [key: string]: unknown;
};

const STATUS_META: Record<string, { label: string; tone: string }> = {
  normal: {
    label: "Normal",
    tone: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  waspada: {
    label: "Waspada",
    tone: "bg-amber-50 text-amber-700 border-amber-200",
  },
  siaga: {
    label: "Siaga",
    tone: "bg-orange-50 text-orange-700 border-orange-200",
  },
  awas: {
    label: "Awas",
    tone: "bg-red-50 text-red-700 border-red-200",
  },
};

function normalizeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const numeric = Number(String(value).trim().replace(",", "."));

  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeStatus(value?: string) {
  const s = String(value || "")
    .toLowerCase()
    .trim();

  if (
    s.includes("bahaya") ||
    s.includes("awas")
  ) {
    return "awas";
  }

  if (s.includes("siaga")) {
    return "siaga";
  }

  if (s.includes("waspada")) {
    return "waspada";
  }

  return "normal";
}

function stationValue(s: Station) {
  const value =
    s.tma ??
    s.water_level ??
    s.value ??
    s.kedalaman ??
    null;

  return normalizeNumber(value) ?? 0;
}

/**
 * Mengubah tanggal SIPEAT:
 *
 * 17-09-2026 + 08:04:41
 *
 * menjadi timestamp yang bisa dibandingkan secara aman.
 */
function parseSipeatDate(
  tanggal?: string,
  jam?: string,
): number {
  if (!tanggal) return 0;

  const dateMatch = String(tanggal).match(
    /^(\d{2})-(\d{2})-(\d{4})$/,
  );

  if (!dateMatch) {
    const fallback = new Date(
      `${tanggal}${jam ? ` ${jam}` : ""}`,
    ).getTime();

    return Number.isFinite(fallback) ? fallback : 0;
  }

  const [, day, month, year] = dateMatch;

  const time = jam || "00:00:00";

  const parsed = new Date(
    `${year}-${month}-${day}T${time}`,
  );

  const timestamp = parsed.getTime();

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatDate(value?: string) {
  if (!value) return "-";

  const d = new Date(value);

  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString("id-ID");
}

/**
 * Format waktu yang berasal langsung dari SIPEAT.
 */
function formatSipeatDate(
  tanggal?: string,
  jam?: string,
) {
  if (!tanggal && !jam) return "-";

  if (tanggal && jam) {
    return `${tanggal} ${jam}`;
  }

  return tanggal || jam || "-";
}

/**
 * Normalisasi SATU record SIPEAT.
 *
 * Data asli SIPEAT:
 *
 * {
 *   idname,
 *   latitude,
 *   longitude,
 *   hari,
 *   tanggal,
 *   jam,
 *   kedalaman,
 *   statusled,
 *   suhu,
 *   kelembaban,
 *   ph,
 *   ec,
 *   Rain,
 *   RainDate,
 *   RainTime,
 *   Elevation,
 *   tegangan,
 *   arus,
 *   power,
 *   persen
 * }
 */
function normalizeSipeatStation(
  sensorId: string,
  raw: Record<string, unknown>,
): Station {
  const tanggal =
    typeof raw.tanggal === "string"
      ? raw.tanggal
      : undefined;

  const jam =
    typeof raw.jam === "string"
      ? raw.jam
      : undefined;

  const updatedTimestamp = parseSipeatDate(
    tanggal,
    jam,
  );

  const updatedAt =
    updatedTimestamp > 0
      ? new Date(updatedTimestamp).toISOString()
      : undefined;

  const tma =
    normalizeNumber(raw.kedalaman) ??
    normalizeNumber(raw.tma) ??
    normalizeNumber(raw.water_level) ??
    normalizeNumber(raw.value);

  return {
    id: sensorId,

    code: sensorId,

    name:
      typeof raw.idname === "string"
        ? raw.idname
        : sensorId,

    station_name:
      typeof raw.idname === "string"
        ? raw.idname
        : sensorId,

    river: undefined,
    das: undefined,
    province: undefined,
    kabupaten: undefined,

    latitude: normalizeNumber(raw.latitude),
    longitude: normalizeNumber(raw.longitude),

    tma,
    water_level: tma,
    value: tma,

    status:
      typeof raw.statusled === "string"
        ? raw.statusled
        : undefined,

    statusled:
      typeof raw.statusled === "string"
        ? raw.statusled
        : undefined,

    updated_at: updatedAt,
    timestamp: updatedAt,

    hari:
      typeof raw.hari === "string"
        ? raw.hari
        : undefined,

    tanggal,
    jam,

    kedalaman: normalizeNumber(raw.kedalaman),

    suhu: normalizeNumber(raw.suhu),

    kelembaban: normalizeNumber(
      raw.kelembaban,
    ),

    ph: normalizeNumber(raw.ph),

    ec: normalizeNumber(raw.ec),

    Rain: normalizeNumber(raw.Rain),

    RainDate:
      typeof raw.RainDate === "string"
        ? raw.RainDate
        : undefined,

    RainTime:
      typeof raw.RainTime === "string"
        ? raw.RainTime
        : undefined,

    Elevation: normalizeNumber(
      raw.Elevation,
    ),

    tegangan: normalizeNumber(
      raw.tegangan,
    ),

    arus: normalizeNumber(raw.arus),

    power: normalizeNumber(raw.power),

    persen: normalizeNumber(raw.persen),
  };
}

/**
 * Normalisasi response /api/tma.
 *
 * Response nyata SIPEAT:
 *
 * {
 *   success: true,
 *   companyId: "PT001",
 *   companyName: "...",
 *   ID: "all",
 *   data: {
 *     line9: {...},
 *     line12: {...},
 *     line13: {...}
 *   }
 * }
 *
 * Fungsi ini juga tetap mendukung response array
 * atau wrapper lain agar frontend lama tidak rusak.
 */
function extractStationRows(
  payload: unknown,
): Station[] {
  if (Array.isArray(payload)) {
    return payload.map((item, index) => {
      if (
        item &&
        typeof item === "object" &&
        !Array.isArray(item)
      ) {
        return normalizeSipeatStation(
          String(
            (item as Record<string, unknown>).id ??
              (item as Record<string, unknown>).code ??
              index,
          ),
          item as Record<string, unknown>,
        );
      }

      return {
        id: index,
        name: `Stasiun ${index + 1}`,
      };
    });
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const obj =
    payload as Record<string, unknown>;

  /**
   * Struktur utama SIPEAT:
   *
   * data: {
   *   line9: {...},
   *   line12: {...}
   * }
   */
  if (
    obj.data &&
    typeof obj.data === "object" &&
    !Array.isArray(obj.data)
  ) {
    const data =
      obj.data as Record<string, unknown>;

    const rows: Station[] = [];

    Object.entries(data).forEach(
      ([sensorId, value]) => {
        if (
          value &&
          typeof value === "object" &&
          !Array.isArray(value)
        ) {
          rows.push(
            normalizeSipeatStation(
              sensorId,
              value as Record<string, unknown>,
            ),
          );
        }
      },
    );

    if (rows.length > 0) {
      return rows;
    }
  }

  /**
   * Compatibility untuk response lama/alternatif.
   */
  const candidates = [
    obj.items,
    obj.stations,
    obj.result,
    obj.results,
    obj.rows,
    obj.records,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return extractStationRows(candidate);
    }

    if (
      candidate &&
      typeof candidate === "object"
    ) {
      const nested =
        extractStationRows(candidate);

      if (nested.length > 0) {
        return nested;
      }
    }
  }

  /**
   * Jika payload sendiri adalah satu record sensor.
   */
  const hasSensorField =
    "idname" in obj ||
    "kedalaman" in obj ||
    "statusled" in obj ||
    "latitude" in obj ||
    "longitude" in obj;

  if (hasSensorField) {
    return [
      normalizeSipeatStation(
        String(obj.id ?? obj.idname ?? "sensor-1"),
        obj,
      ),
    ];
  }

  return [];
}

async function fetchStations(
  signal: AbortSignal,
): Promise<Station[]> {
  const res = await fetch(TMA_API, {
    signal,
    headers: {
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const payload: unknown =
    await res.json();

  const rows =
    extractStationRows(payload);

  console.log(
    "[TMA] Endpoint:",
    TMA_API,
  );

  console.log(
    "[TMA] Jumlah stasiun:",
    rows.length,
  );

  console.log(
    "[TMA] Data stasiun:",
    rows,
  );

  return rows;
}

export default function DashboardTMA() {
  const [stations, setStations] =
    useState<Station[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [lastUpdate, setLastUpdate] =
    useState<string>();

  const load = async () => {
    const controller =
      new AbortController();

    setLoading(true);
    setError("");

    try {
      const rows =
        await fetchStations(
          controller.signal,
        );

      setStations(
        Array.isArray(rows)
          ? rows
          : [],
      );

      setLastUpdate(
        new Date().toISOString(),
      );
    } catch (e) {
      if (
        e instanceof DOMException &&
        e.name === "AbortError"
      ) {
        return;
      }

      setError(
        e instanceof Error
          ? e.message
          : "Gagal mengambil data TMA",
      );

      setStations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const summary = useMemo(() => {
    const count = {
      normal: 0,
      waspada: 0,
      siaga: 0,
      awas: 0,
    };

    const safeStations =
      Array.isArray(stations)
        ? stations
        : [];

    safeStations.forEach((s) => {
      const status =
        normalizeStatus(
          s.status ||
            s.statusled,
        ) as keyof typeof count;

      count[status]++;
    });

    const values =
      safeStations
        .map(stationValue)
        .filter(Number.isFinite);

    return {
      total: safeStations.length,

      ...count,

      average: values.length
        ? values.reduce(
            (a, b) => a + b,
            0,
          ) / values.length
        : 0,

      max: values.length
        ? Math.max(...values)
        : 0,
    };
  }, [stations]);

  const latest = useMemo(() => {
    const safeStations =
      Array.isArray(stations)
        ? stations
        : [];

    return [...safeStations]
      .sort(
        (a, b) =>
          parseSipeatDate(
            b.tanggal,
            b.jam,
          ) -
          parseSipeatDate(
            a.tanggal,
            a.jam,
          ),
      )
      .slice(0, 6);
  }, [stations]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
              <Waves className="h-4 w-4" />

              Hidrologi & Risiko Banjir
            </div>

            <h1 className="text-2xl font-bold text-slate-900">
              Dashboard Tinggi Muka Air (TMA)
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Ringkasan kondisi stasiun
              pemantauan TMA secara
              terintegrasi.
            </p>
          </div>

          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${
                loading
                  ? "animate-spin"
                  : ""
              }`}
            />

            Refresh
          </button>
        </header>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Data TMA belum dapat dimuat:{" "}
            {error}. Pastikan endpoint TMA
            sudah tersedia.
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <Kpi
            icon={<Gauge />}
            label="Total Stasiun"
            value={summary.total}
          />

          <Kpi
            icon={<Droplets />}
            label="Rata-rata TMA"
            value={`${summary.average.toFixed(
              2,
            )} m`}
          />

          <Kpi
            icon={<ArrowUp />}
            label="TMA Tertinggi"
            value={`${summary.max.toFixed(
              2,
            )} m`}
          />

          <Kpi
            icon={<ShieldAlert />}
            label="Waspada"
            value={summary.waspada}
          />

          <Kpi
            icon={<AlertTriangle />}
            label="Siaga"
            value={summary.siaga}
          />

          <Kpi
            icon={<AlertTriangle />}
            label="Awas"
            value={summary.awas}
          />
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
          <section className="rounded-2xl border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b p-5">
              <div>
                <h2 className="font-bold text-slate-900">
                  Stasiun Terbaru
                </h2>

                <p className="text-sm text-slate-500">
                  Status dan pembacaan
                  terakhir yang tersedia.
                </p>
              </div>

              <Activity className="h-5 w-5 text-slate-400" />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">
                      Stasiun
                    </th>

                    <th className="px-5 py-3">
                      Sungai
                    </th>

                    <th className="px-5 py-3">
                      TMA
                    </th>

                    <th className="px-5 py-3">
                      Status
                    </th>

                    <th className="px-5 py-3">
                      Update
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {latest.map(
                    (s, i) => {
                      const status =
                        normalizeStatus(
                          s.status ||
                            s.statusled,
                        );

                      return (
                        <tr
                          key={
                            s.id ?? i
                          }
                          className="border-t"
                        >
                          <td className="px-5 py-3 font-semibold text-slate-800">
                            {s.station_name ||
                              s.name ||
                              s.code ||
                              `Stasiun ${
                                i + 1
                              }`}
                          </td>

                          <td className="px-5 py-3 text-slate-600">
                            {s.river || "-"}
                          </td>

                          <td className="px-5 py-3 font-semibold">
                            {stationValue(
                              s,
                            ).toFixed(
                              2,
                            )}{" "}
                            m
                          </td>

                          <td className="px-5 py-3">
                            <span
                              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                                STATUS_META[
                                  status
                                ].tone
                              }`}
                            >
                              {
                                STATUS_META[
                                  status
                                ].label
                              }
                            </span>
                          </td>

                          <td className="px-5 py-3 text-slate-500">
                            {formatSipeatDate(
                              s.tanggal,
                              s.jam,
                            )}
                          </td>
                        </tr>
                      );
                    },
                  )}

                  {!loading &&
                    latest.length ===
                      0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-5 py-10 text-center text-slate-500"
                        >
                          Belum ada data
                          stasiun TMA.
                        </td>
                      </tr>
                    )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900">
                  Distribusi Status
                </h2>

                <p className="text-sm text-slate-500">
                  Komposisi status
                  stasiun saat ini.
                </p>
              </div>

              <Waves className="h-5 w-5 text-slate-400" />
            </div>

            <div className="mt-6 space-y-4">
              {(
                [
                  "normal",
                  "waspada",
                  "siaga",
                  "awas",
                ] as const
              ).map((key) => {
                const pct =
                  summary.total
                    ? (summary[key] /
                        summary.total) *
                      100
                    : 0;

                return (
                  <div key={key}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium">
                        {
                          STATUS_META[
                            key
                          ].label
                        }
                      </span>

                      <span className="text-slate-500">
                        {summary[key]}
                      </span>
                    </div>

                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-slate-500"
                        style={{
                          width: `${pct}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 flex items-center gap-2 text-xs text-slate-500">
              <Clock3 className="h-4 w-4" />

              Sinkron terakhir:{" "}
              {formatDate(
                lastUpdate,
              )}
            </div>
          </section>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          <InfoCard
            icon={<Map />}
            title="Peta TMA"
            text="Visualisasi spasial stasiun, sungai, DAS, administrasi, dan indikator risiko banjir."
            href="/tma/peta"
          />

          <InfoCard
            icon={<Activity />}
            title="Monitoring TMA"
            text="Pantau stasiun secara operasional dengan filter, status sensor, dan detail pembacaan."
            href="/tma/monitoring"
          />

          <InfoCard
            icon={<ArrowDown />}
            title="Historis TMA"
            text="Analisis tren, ambang batas, durasi kejadian, dan ekspor data historis."
            href="/tma/historis"
          />
        </section>
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-slate-400">
          {icon}
        </span>

        <span className="text-xs font-medium text-slate-400">
          LIVE
        </span>
      </div>

      <div className="mt-4 text-2xl font-bold text-slate-900">
        {value}
      </div>

      <div className="mt-1 text-sm text-slate-500">
        {label}
      </div>
    </div>
  );
}

function InfoCard({
  icon,
  title,
  text,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
        {icon}
      </div>

      <h3 className="font-bold text-slate-900">
        {title}
      </h3>

      <p className="mt-1 text-sm leading-6 text-slate-500">
        {text}
      </p>
    </a>
  );
}
