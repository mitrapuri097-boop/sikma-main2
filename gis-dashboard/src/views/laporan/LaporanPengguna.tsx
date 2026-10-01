import React, { useEffect, useMemo, useState } from "react";
import { GeoJSON, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

/* ============================================================
   LAPORAN PENGGUNA - SIMITI PRO ENTERPRISE
   DATA SOURCE:
   GET /api/laporan-pengguna?year=YYYY

   Tidak ada business/demo data hardcoded.
   ============================================================ */

type ReportData = {
  kpi: {
    totalUsers: number;
    activeUsers: number;
    institutions: number;
    totalAccess: number;
  };

  trend: number[];

  institutions: Array<{
    name: string;
    value: number;
  }>;

  provinces: Array<{
    name: string;
    value: number;
  }>;
  provinceMap?: Array<{
    kodeProv: string | number | null;
    name: string;
    loggedInUsers: number;
    loggedInAccesses: number;
    anonymousVisitors: number;
    anonymousAccesses: number;
    total: number;
    geometry: Geometry | null;
  }>;

  visitorStats?: {
    uniqueAnonymousIps: number;
    geolocatedAnonymousIps: number;
    note: string;
  };
  devices: Array<{
    name: string;
    value: number;
  }>;

  activities: Array<{
    id: number;
    date: string;
    userId: number | null;
    user: string;
    username: string;
    organization: string;
    unit: string;
    role: string;
    accessType: string;
    module: string;
    action: string;
    path: string;
    device: string;
    ipAddress: string;
  }>;

  summary: {
    newUsers: number;
    successfulLogins: number;
    totalDownloads: number;
    totalUserActivities: number;
  };

  authorizations: {
    total: number;
    canView: number;
    canQuery: number;
    canExport: number;
    canDownload: number;
    canManage: number;
  };

  dataStatus: Record<string, string>;
};

type ReportResponse = {
  success: boolean;
  year: number;
  period: {
    start: string;
    end: string;
  };
  data: ReportData;
  generatedAt: string;
  message?: string;
};

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

const API_BASE = String(
  import.meta.env.VITE_API_URL || "http://localhost:3001",
).replace(/\/$/, "");

/* ============================================================
   FORMATTERS
   ============================================================ */

const numberFormatter = new Intl.NumberFormat("id-ID");

const formatNumber = (value: number | null | undefined) => {
  if (!Number.isFinite(Number(value))) return "0";
  return numberFormatter.format(Number(value));
};

const formatDateTime = (value: string) => {
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

const formatPercent = (value: number, total: number) => {
  if (!total || !Number.isFinite(total)) return "0%";

  return `${Math.round((value / total) * 100)}%`;
};


/* ============================================================
   PROVINCE MAP VIEWPORT
   ============================================================ */
const ProvinceMapViewport = ({ data }: { data: FeatureCollection }) => {
  const map = useMap();

  useEffect(() => {
    if (!data.features.length) return;

    try {
      const layer = L.geoJSON(data as any);
      const bounds = layer.getBounds();

      if (bounds.isValid()) {
        map.fitBounds(bounds, {
          padding: [18, 18],
          maxZoom: 5,
          animate: false,
        });
      }
    } catch (error) {
      console.warn("Gagal menyesuaikan viewport peta provinsi:", error);
    }

    const timer = window.setTimeout(() => {
      map.invalidateSize();
    }, 100);

    return () => window.clearTimeout(timer);
  }, [data, map]);

  return null;
};

/* ============================================================
   ICON
   ============================================================ */

const Icon = ({
  children,
  size = 18,
}: {
  children: React.ReactNode;
  size?: number;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

/* ============================================================
   DONUT
   ============================================================ */

const DonutChart = ({ values, total }: { values: number[]; total: number }) => {
  const colors = [
    "#08a875",
    "#4388df",
    "#7d61d8",
    "#f0a52b",
    "#d5dbe3",
    "#e76f51",
    "#20a4a8",
    "#6c757d",
  ];

  const safeValues = values.map((value) =>
    Number.isFinite(value) && value > 0 ? value : 0,
  );

  const safeTotal = safeValues.reduce((sum, value) => sum + value, 0);

  const gradient = useMemo(() => {
    if (safeTotal <= 0) {
      return "#edf1f4 0% 100%";
    }

    let current = 0;

    return safeValues
      .map((value, index) => {
        if (value <= 0) return null;

        const start = current;
        current += (value / safeTotal) * 100;

        return `${colors[index % colors.length]} ${start}% ${current}%`;
      })
      .filter(Boolean)
      .join(", ");
  }, [safeTotal, safeValues]);

  return (
    <div
      className="donut"
      style={{
        background: `conic-gradient(${gradient})`,
      }}
    >
      <div className="donut-hole">
        <div className="donut-total">{formatNumber(total)}</div>

        <div className="donut-caption">Total</div>
      </div>
    </div>
  );
};

/* ============================================================
   KPI CARD
   ============================================================ */

const KpiCard = ({
  label,
  value,
  color,
  background,
  children,
}: {
  label: string;
  value: number;
  color: string;
  background: string;
  children: React.ReactNode;
}) => (
  <div className="kpi-card">
    <div className="kpi-top">
      <span className="kpi-label">{label}</span>

      <span
        className="kpi-icon"
        style={{
          color,
          background,
        }}
      >
        {children}
      </span>
    </div>

    <div className="kpi-value">{formatNumber(value)}</div>
  </div>
);

/* ============================================================
   CSS
   ============================================================ */

const css = `
  .laporan-page {
    min-height: 100%;
    padding: 22px 24px 30px;
    background: #f6f8fb;
    color: #172033;
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    box-sizing: border-box;
  }

  .laporan-page *,
  .laporan-page *::before,
  .laporan-page *::after {
    box-sizing: border-box;
  }

  .laporan-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 18px;
  }

  .laporan-title-wrap {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .laporan-title-icon {
    width: 42px;
    height: 42px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #087f5b, #12a875);
    color: white;
    box-shadow: 0 5px 16px rgba(9, 128, 91, .20);
  }

  .laporan-title {
    margin: 0;
    font-size: 24px;
    line-height: 1.15;
    font-weight: 750;
    letter-spacing: -.4px;
  }

  .laporan-subtitle {
    margin: 5px 0 0;
    color: #7b8799;
    font-size: 12px;
  }

  .laporan-actions {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .period-select {
    height: 36px;
    border: 1px solid #dce3ec;
    border-radius: 9px;
    padding: 0 12px;
    background: white;
    color: #354052;
    font-size: 12px;
    outline: none;
  }

  .period-select:focus {
    border-color: #10a87b;
    box-shadow: 0 0 0 3px rgba(16, 168, 123, .08);
  }

  .download-btn {
    height: 36px;
    border: 0;
    border-radius: 9px;
    padding: 0 15px;
    background: #087f5b;
    color: white;
    font-size: 12px;
    font-weight: 650;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    box-shadow: 0 4px 12px rgba(8, 127, 91, .18);
  }

  .download-btn:hover {
    background: #076d4e;
  }

  .download-btn:disabled {
    opacity: .6;
    cursor: not-allowed;
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 13px;
    margin-bottom: 14px;
  }

  .kpi-card {
    position: relative;
    overflow: hidden;
    min-height: 92px;
    padding: 15px 16px;
    border: 1px solid #e5eaf0;
    border-radius: 12px;
    background: white;
    box-shadow: 0 2px 8px rgba(20, 35, 55, .035);
  }

  .kpi-card::after {
    content: "";
    position: absolute;
    width: 74px;
    height: 74px;
    right: -25px;
    bottom: -28px;
    border-radius: 50%;
    background: rgba(16, 185, 129, .06);
  }

  .kpi-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .kpi-label {
    color: #788497;
    font-size: 11px;
    font-weight: 550;
  }

  .kpi-icon {
    width: 29px;
    height: 29px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .kpi-value {
    margin-top: 7px;
    font-size: 22px;
    line-height: 1;
    font-weight: 750;
    letter-spacing: -.5px;
  }

  .dashboard-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(260px, .72fr) minmax(230px, .72fr);
    gap: 13px;
    margin-bottom: 13px;
  }

  .dashboard-grid-two {
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(0, .9fr);
    gap: 13px;
    margin-bottom: 13px;
  }

  .dashboard-grid-bottom {
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(0, .9fr);
    gap: 13px;
  }

  .panel {
    background: white;
    border: 1px solid #e5eaf0;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(20, 35, 55, .035);
    overflow: hidden;
  }

  .panel-header {
    min-height: 48px;
    padding: 12px 15px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px solid #edf0f4;
  }

  .panel-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 700;
    color: #253247;
  }

  .panel-title-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #08a875;
    flex: 0 0 auto;
  }

  .panel-action {
    border: 1px solid #e3e8ef;
    background: white;
    color: #718096;
    border-radius: 7px;
    font-size: 9px;
    padding: 5px 8px;
    cursor: pointer;
  }

  .panel-body {
    padding: 13px 15px;
  }

  .chart-wrap {
    position: relative;
    height: 190px;
  }

  .chart-svg {
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .chart-months {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    align-items: center;
    gap: 0;
    margin: 2px 0 0;
    padding: 0 2px;
  }

  .chart-month {
    min-width: 0;
    text-align: center;
    color: #8793a4;
    font-size: 10px;
    line-height: 1.4;
    font-weight: 600;
    letter-spacing: -.15px;
    white-space: nowrap;
  }

  @media (max-width: 520px) {
    .chart-month { font-size: 8px; letter-spacing: -.35px; }
  }

  .chart-value {
    font-size: 8px;
    fill: #526175;
    font-weight: 700;
  }

  .chart-legend {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 15px;
    margin-top: 2px;
    font-size: 9px;
    color: #778397;
  }

  .legend-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    margin-right: 5px;
    flex: 0 0 auto;
  }

  .donut-area {
    min-height: 218px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 17px;
  }

  .donut {
    width: 132px;
    height: 132px;
    border-radius: 50%;
    position: relative;
    flex: 0 0 auto;
  }

  .donut-hole {
    position: absolute;
    inset: 28px;
    background: white;
    border-radius: 50%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
  }

  .donut-total {
    font-size: 19px;
    font-weight: 750;
    line-height: 1;
  }

  .donut-caption {
    margin-top: 3px;
    color: #8a95a5;
    font-size: 8px;
  }

  .donut-legend {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 180px;
    overflow-y: auto;
  }

  .donut-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 9px;
    color: #667286;
    white-space: nowrap;
  }

  .donut-item strong {
    color: #263449;
  }

  .rank-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-top: 4px;
  }

  .rank-item {
    display: grid;
    grid-template-columns: 1fr 34px;
    gap: 8px;
  }

  .rank-label {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 5px;
    font-size: 9px;
    color: #667286;
  }

  .rank-label strong {
    color: #263449;
  }

  .progress {
    height: 6px;
    background: #edf2f4;
    border-radius: 99px;
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #10a87b, #39c89a);
    transition: width .25s ease;
  }

  .rank-number {
    font-size: 10px;
    font-weight: 750;
    text-align: right;
    color: #425066;
  }

  .table-wrap {
    overflow-x: auto;
  }

  .activity-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 980px;
  }

  .activity-pagination { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; padding:11px 14px; border-top:1px solid #edf0f4; background:#fff; }
  .activity-pagination-info { color:#7b8797; font-size:10px; font-weight:550; }
  .activity-pagination-controls { display:flex; align-items:center; gap:4px; }
  .activity-pagination-controls button { min-width:29px; height:29px; padding:0 7px; border:1px solid #e1e7ed; border-radius:7px; background:#fff; color:#526175; font-size:10px; font-weight:650; cursor:pointer; }
  .activity-pagination-controls button:hover:not(:disabled) { border-color:#10a87b; color:#087f5b; background:#f0faf6; }
  .activity-pagination-controls button.active { border-color:#087f5b; background:#087f5b; color:#fff; box-shadow:0 2px 6px rgba(8,127,91,.18); }
  .activity-pagination-controls button:disabled { opacity:.35; cursor:not-allowed; }

  .activity-table th {
    padding: 8px 10px;
    text-align: left;
    font-size: 9px;
    font-weight: 700;
    color: #8a95a5;
    background: #fafbfc;
    border-bottom: 1px solid #edf0f4;
  }

  .activity-table td {
    padding: 9px 10px;
    font-size: 9px;
    color: #536176;
    border-bottom: 1px solid #f0f2f5;
    white-space: nowrap;
  }

  .activity-table tr:last-child td {
    border-bottom: 0;
  }

  .activity-user {
    font-weight: 700;
    color: #263449;
  }

  .activity-module {
    display: inline-flex;
    padding: 4px 7px;
    border-radius: 5px;
    background: #eef8f5;
    color: #07805b;
    font-size: 8px;
    font-weight: 700;
  }

  .activity-action {
    display: inline-flex;
    padding: 3px 6px;
    border-radius: 5px;
    background: #f2f5f8;
    color: #5e6b7e;
    font-size: 8px;
    font-weight: 650;
  }

  .map-panel {
    min-height: 238px;
  }

  .province-list {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding-top: 3px;
  }

  .province-row {
    display: grid;
    grid-template-columns: 18px 1fr 55px;
    gap: 7px;
    align-items: center;
    font-size: 9px;
    color: #657185;
  }

  .province-rank {
    width: 17px;
    height: 17px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: #e6f6ef;
    color: #07805b;
    font-weight: 750;
    font-size: 8px;
  }

  .province-value {
    text-align: right;
    font-weight: 700;
    color: #364257;
  }

  .province-bar {
    grid-column: 2 / 4;
    height: 5px;
    background: #edf2f4;
    border-radius: 99px;
    overflow: hidden;
  }

  .province-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #10a87b, #56cda6);
    border-radius: inherit;
  }

  .data-map-state {
    min-height: 185px;
    border: 1px dashed #dce5e1;
    border-radius: 10px;
    background:
      radial-gradient(circle at 30% 35%, rgba(16, 168, 123, .06), transparent 30%),
      #f8fbfa;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 25px;
    color: #7b8797;
  }

  .data-map-icon {
    width: 42px;
    height: 42px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #e8f7f1;
    color: #087f5b;
    margin-bottom: 10px;
  }

  .data-map-title {
    color: #405066;
    font-size: 11px;
    font-weight: 700;
  }

  .data-map-description {
    max-width: 340px;
    margin-top: 5px;
    font-size: 9px;
    line-height: 1.5;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 9px;
  }

  .summary-card {
    min-height: 82px;
    padding: 12px;
    border-radius: 9px;
    border: 1px solid #e8edf1;
  }

  .summary-label {
    font-size: 9px;
    color: #778397;
  }

  .summary-value {
    margin-top: 7px;
    font-size: 18px;
    font-weight: 750;
    color: #263449;
  }

  .summary-caption {
    margin-top: 4px;
    font-size: 8px;
    color: #8b96a5;
  }

  .empty-note {
    color: #98a2b1;
    font-size: 9px;
    padding: 18px 5px;
    text-align: center;
  }

  .loading-state,
  .error-state {
    min-height: 420px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .state-card {
    max-width: 430px;
    padding: 30px;
    border: 1px solid #e5eaf0;
    border-radius: 14px;
    background: white;
    box-shadow: 0 2px 8px rgba(20, 35, 55, .035);
  }

  .state-icon {
    width: 46px;
    height: 46px;
    border-radius: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 12px;
  }

  .state-title {
    margin: 0;
    font-size: 14px;
    color: #263449;
    font-weight: 750;
  }

  .state-description {
    margin: 7px 0 0;
    color: #7b8799;
    font-size: 10px;
    line-height: 1.6;
  }

  .retry-btn {
    margin-top: 15px;
    height: 34px;
    border: 0;
    border-radius: 8px;
    padding: 0 14px;
    background: #087f5b;
    color: white;
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
  }

  .report-meta {
    margin-top: 13px;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    color: #a0a9b6;
    font-size: 9px;
  }

  @media (max-width: 1200px) {
    .dashboard-grid {
      grid-template-columns: minmax(0, 1.4fr) minmax(250px, .8fr);
    }

    .dashboard-grid > .panel:last-child {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 900px) {
    .kpi-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .dashboard-grid,
    .dashboard-grid-two,
    .dashboard-grid-bottom {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 600px) {
    .laporan-page {
      padding: 15px;
    }

    .laporan-header {
      flex-direction: column;
    }

    .laporan-actions {
      width: 100%;
    }

    .period-select,
    .download-btn {
      flex: 1;
    }

    .kpi-grid {
      grid-template-columns: 1fr;
    }

    .donut-area {
      flex-direction: column;
      padding: 12px 0;
    }

    .report-meta {
      flex-direction: column;
    }
  }

  @media print {
    .laporan-page {
      padding: 0;
      background: white;
    }

    .download-btn {
      display: none;
    }

    .panel,
    .kpi-card {
      box-shadow: none;
    }
  }

  /* ==========================================================
     ENTERPRISE PROVINCE MAP
     ========================================================== */
  .map-panel {
    min-height: 0;
  }

  .map-panel .panel-body {
    padding: 0;
  }

  .province-map-wrapper {
    position: relative;
    width: 100%;
    height: 390px;
    min-height: 390px;
    overflow: hidden;
    border-radius: 0 0 12px 12px;
    background: #eaf0f4;
  }

  .province-leaflet-map {
    position: absolute !important;
    inset: 0;
    width: 100% !important;
    height: 100% !important;
    min-height: 390px;
    z-index: 1;
    background: #dfe8ed;
  }

  .province-leaflet-map .leaflet-control-zoom {
    margin-top: 14px;
    margin-left: 14px;
    border: 1px solid rgba(218, 226, 235, .95);
    border-radius: 9px;
    overflow: hidden;
    box-shadow: 0 5px 16px rgba(24, 45, 70, .12);
  }

  .province-leaflet-map .leaflet-control-zoom a {
    width: 32px;
    height: 32px;
    line-height: 32px;
    color: #334155;
    background: rgba(255,255,255,.96);
    border: 0;
  }

  .province-leaflet-map .leaflet-control-zoom a:hover {
    background: #f4f8fb;
    color: #087f5b;
  }

  .province-leaflet-map .leaflet-control-attribution {
    margin: 0 8px 7px 0;
    padding: 2px 6px;
    border-radius: 5px;
    background: rgba(255,255,255,.88);
    font-size: 8px;
  }

  .province-map-overlay {
    position: absolute;
    z-index: 500;
    top: 14px;
    right: 14px;
    display: flex;
    gap: 8px;
    pointer-events: none;
  }

  .province-map-stat {
    min-width: 122px;
    padding: 9px 11px;
    border: 1px solid rgba(225, 232, 239, .95);
    border-radius: 10px;
    background: rgba(255,255,255,.94);
    box-shadow: 0 6px 18px rgba(24,45,70,.10);
    backdrop-filter: blur(8px);
  }

  .province-map-stat span {
    display: block;
    color: #7c8999;
    font-size: 8px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .35px;
  }

  .province-map-stat strong {
    display: block;
    margin-top: 3px;
    color: #243246;
    font-size: 17px;
    line-height: 1.1;
  }

  .province-map-legend {
    position: absolute;
    z-index: 500;
    left: 14px;
    bottom: 14px;
    width: 150px;
    padding: 10px 11px;
    border: 1px solid rgba(225,232,239,.95);
    border-radius: 10px;
    background: rgba(255,255,255,.94);
    box-shadow: 0 6px 18px rgba(24,45,70,.10);
    backdrop-filter: blur(8px);
    pointer-events: none;
  }

  .province-map-legend-title {
    margin-bottom: 7px;
    color: #344256;
    font-size: 9px;
    font-weight: 750;
  }

  .province-map-legend-scale {
    display: flex;
    height: 7px;
    overflow: hidden;
    border-radius: 99px;
  }

  .province-map-legend-scale span {
    flex: 1;
  }

  .province-map-legend-low { background: #b8ead8; }
  .province-map-legend-mid { background: #20a56f; }
  .province-map-legend-high { background: #087f5b; }

  .province-map-legend-labels {
    display: flex;
    justify-content: space-between;
    margin-top: 5px;
    color: #8793a2;
    font-size: 8px;
  }

  @media (max-width: 700px) {
    .province-map-wrapper,
    .province-leaflet-map {
      height: 330px;
      min-height: 330px;
    }

    .province-map-overlay {
      top: 10px;
      right: 10px;
      left: 10px;
      gap: 6px;
    }

    .province-map-stat {
      flex: 1;
      min-width: 0;
      padding: 8px 9px;
    }

    .province-map-stat strong {
      font-size: 14px;
    }

    .province-map-legend {
      left: 10px;
      bottom: 10px;
    }
  }
`;

/* ============================================================
   MAIN COMPONENT
   ============================================================ */

const LaporanPengguna: React.FC = () => {
  const currentYear = new Date().getFullYear();

  const availableYears = useMemo(() => {
    return Array.from({ length: 5 }, (_, index) => String(currentYear - index));
  }, [currentYear]);

  const [period, setPeriod] = useState<string>(String(currentYear));

  const [report, setReport] = useState<ReportResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activityPage, setActivityPage] = useState(1);

  const ACTIVITY_PAGE_SIZE = 10;
  /* ==========================================================
     LOAD API
     ========================================================== */

  const loadReport = async (year: string) => {
    try {
      setLoading(true);
      setError("");

      const token = localStorage.getItem("smiti_token");

      if (!token) {
        throw new Error("Access token tidak ditemukan.");
      }

      const response = await fetch(
        `${API_BASE}/api/laporan-pengguna?year=${encodeURIComponent(year)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
      );

      const payload = (await response.json()) as ReportResponse;

      if (!response.ok || !payload.success) {
        throw new Error(
          payload.message ||
            `Gagal mengambil laporan pengguna (${response.status}).`,
        );
      }

      setReport(payload);
    } catch (err) {
      console.error("Laporan Pengguna:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Gagal mengambil data laporan pengguna.",
      );

      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReport(period);
  }, [period]);

  useEffect(() => {
    setActivityPage(1);
  }, [period, report]);
  /* ==========================================================
     DERIVED DATA
     ========================================================== */

  const data = report?.data;

  const trend = data?.trend ?? [];

  const maxTrend = Math.max(...trend, 1);

  const trendPoints = trend
    .map((value, index) => {
      const x = trend.length <= 1 ? 50 : 8 + (index * 84) / (trend.length - 1);

      const y = 92 - (value / maxTrend) * 72;

      return `${x},${y}`;
    })
    .join(" ");

  const areaPoints =
    trend.length > 0 ? `8,96 ${trendPoints} 92,96` : "8,96 92,96";

  const institutionTotal = useMemo(() => {
    return (data?.institutions ?? []).reduce(
      (sum, item) => sum + Number(item.value || 0),
      0,
    );
  }, [data?.institutions]);

  const deviceTotal = useMemo(() => {
    return (data?.devices ?? []).reduce(
      (sum, item) => sum + Number(item.value || 0),
      0,
    );
  }, [data?.devices]);

  const provinceTotal = useMemo(() => {
    return (data?.provinces ?? []).reduce(
      (sum, item) => sum + Number(item.value || 0),
      0,
    );
  }, [data?.provinces]);

  const activities = data?.activities ?? [];

  const activityTotalPages = Math.max(
    1,
    Math.ceil(activities.length / ACTIVITY_PAGE_SIZE),
  );

  const safeActivityPage = Math.min(activityPage, activityTotalPages);

  const activityPageNumbers = Array.from(
    { length: Math.min(5, activityTotalPages) },
    (_, index) => {
      const start = Math.min(
        Math.max(1, safeActivityPage - 2),
        Math.max(1, activityTotalPages - 4),
      );
      return start + index;
    },
  );

  const paginatedActivities = useMemo(() => {
    const startIndex = (safeActivityPage - 1) * ACTIVITY_PAGE_SIZE;

    return activities.slice(startIndex, startIndex + ACTIVITY_PAGE_SIZE);
  }, [activities, safeActivityPage]);

  const provinceMapData = data?.provinceMap ?? [];

  const provinceMapTotal = useMemo(() => {
    return provinceMapData.reduce(
      (sum, item) => sum + Number(item.total || 0),
      0,
    );
  }, [provinceMapData]);

  const provinceMapMax = useMemo(() => {
    return Math.max(
      ...provinceMapData.map((item) => Number(item.total || 0)),
      1,
    );
  }, [provinceMapData]);

  const provinceGeoJson = useMemo<FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: provinceMapData
        .filter((item) => item.geometry)
        .map((item) => ({
          type: "Feature",
          properties: {
            kodeProv: item.kodeProv,
            name: item.name,
            loggedInUsers: Number(item.loggedInUsers || 0),
            loggedInAccesses: Number(item.loggedInAccesses || 0),
            anonymousVisitors: Number(item.anonymousVisitors || 0),
            anonymousAccesses: Number(item.anonymousAccesses || 0),
            total: Number(item.total || 0),
          },
          geometry: item.geometry as Geometry,
        })),
    }),
    [provinceMapData],
  );

  const getProvinceColor = (value: number) => {
    if (!value) return "#eef2f5";

    const ratio = Math.min(1, Math.max(0, value / provinceMapMax));

    if (ratio > 0.75) return "#087f5b";
    if (ratio > 0.5) return "#20a56f";
    if (ratio > 0.25) return "#56cda6";

    return "#b8ead8";
  };
  const institutionColors = [
    "#08a875",
    "#4388df",
    "#7d61d8",
    "#f0a52b",
    "#d5dbe3",
    "#e76f51",
    "#20a4a8",
    "#6c757d",
  ];

  const deviceColors = [
    "#4388df",
    "#08a875",
    "#f0a52b",
    "#7d61d8",
    "#e76f51",
    "#20a4a8",
  ];

  /* ==========================================================
     DOWNLOAD / PRINT
     ========================================================== */

  const downloadReport = () => {
    window.print();
  };

  /* ==========================================================
     LOADING
     ========================================================== */

  if (loading) {
    return (
      <>
        <style>{css}</style>

        <div className="laporan-page">
          <div className="loading-state">
            <div className="state-card">
              <div
                className="state-icon"
                style={{
                  background: "#e8f7f1",
                  color: "#087f5b",
                }}
              >
                <Icon size={22}>
                  <path d="M12 2v4" />
                  <path d="M12 18v4" />
                  <path d="m4.93 4.93 2.83 2.83" />
                  <path d="m16.24 16.24 2.83 2.83" />
                  <path d="M2 12h4" />
                  <path d="M18 12h4" />
                  <path d="m4.93 19.07 2.83-2.83" />
                  <path d="m16.24 7.76 2.83-2.83" />
                </Icon>
              </div>

              <h2 className="state-title">Memuat laporan pengguna</h2>

              <p className="state-description">
                SIMITI sedang mengambil statistik dan aktivitas pengguna dari
                database.
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  /* ==========================================================
     ERROR
     ========================================================== */

  if (error || !data) {
    return (
      <>
        <style>{css}</style>

        <div className="laporan-page">
          <div className="error-state">
            <div className="state-card">
              <div
                className="state-icon"
                style={{
                  background: "#fff1f1",
                  color: "#d64545",
                }}
              >
                <Icon size={22}>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v5" />
                  <path d="M12 16h.01" />
                </Icon>
              </div>

              <h2 className="state-title">Laporan tidak dapat dimuat</h2>

              <p className="state-description">
                {error || "Data laporan tidak tersedia dari server."}
              </p>

              <button
                type="button"
                className="retry-btn"
                onClick={() => void loadReport(period)}
              >
                Coba Lagi
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <>
      <style>{css}</style>

      <div className="laporan-page">
        {/* ====================================================
            HEADER
        ==================================================== */}

        <div className="laporan-header">
          <div className="laporan-title-wrap">
            <div className="laporan-title-icon">
              <Icon size={22}>
                <path d="M4 19V5" />
                <path d="M4 19h16" />
                <path d="M8 16v-5" />
                <path d="M12 16V8" />
                <path d="M16 16V4" />
              </Icon>
            </div>

            <div>
              <h1 className="laporan-title">Laporan Pengguna</h1>

              <p className="laporan-subtitle">
                Statistik pengguna, akses sistem, distribusi, perangkat, dan
                aktivitas SIMITI
              </p>
            </div>
          </div>

          <div className="laporan-actions">
            <select
              className="period-select"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              aria-label="Periode laporan"
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  Tahun {year}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="download-btn"
              onClick={downloadReport}
            >
              <Icon size={14}>
                <path d="M12 3v12" />
                <path d="m7 10 5 5 5-5" />
                <path d="M5 21h14" />
              </Icon>
              Download Laporan
            </button>
          </div>
        </div>

        {/* ====================================================
            KPI
        ==================================================== */}

        <div className="kpi-grid">
          <KpiCard
            label="Total Pengguna"
            value={data.kpi.totalUsers}
            color="#087f5b"
            background="#e8f7f1"
          >
            <Icon size={16}>
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </Icon>
          </KpiCard>

          <KpiCard
            label="Pengguna Aktif"
            value={data.kpi.activeUsers}
            color="#0a9b6d"
            background="#e9f8f3"
          >
            <Icon size={16}>
              <circle cx="12" cy="8" r="3.5" />
              <path d="M5 20c.7-3.4 3-5 7-5s6.3 1.6 7 5" />
            </Icon>
          </KpiCard>

          <KpiCard
            label="Instansi Terdaftar"
            value={data.kpi.institutions}
            color="#e58d12"
            background="#fff5e4"
          >
            <Icon size={16}>
              <path d="M3 21h18" />
              <path d="M5 21V8l7-5 7 5v13" />
              <path d="M9 21v-5h6v5" />
              <path d="M9 10h.01M12 10h.01M15 10h.01" />
            </Icon>
          </KpiCard>

          <KpiCard
            label="Total Akses Sistem"
            value={data.kpi.totalAccess}
            color="#7655d8"
            background="#f0ecff"
          >
            <Icon size={16}>
              <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
              <circle cx="12" cy="12" r="2.5" />
            </Icon>
          </KpiCard>
        </div>

        {/* ====================================================
            ROW 1
        ==================================================== */}

        <div className="dashboard-grid">
          {/* TREND */}

          <section className="panel">
            <div className="panel-header">
              <div className="panel-title">
                <span className="panel-title-dot" />
                Tren Pengguna Baru 
              </div>

              <select
                className="period-select"
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
              >
                <option value={period}>{period}</option>
              </select>
            </div>

            <div className="panel-body">
              {trend.length === 0 ? (
                <div className="empty-note">Belum ada data tren pengguna.</div>
              ) : (
                <>
                  <div className="chart-wrap">
                    <svg
                      className="chart-svg"
                      viewBox="0 0 100 110"
                      preserveAspectRatio="none"
                    >
                      {[20, 38, 56, 74, 92].map((y) => (
                        <line
                          key={y}
                          x1="8"
                          x2="92"
                          y1={y}
                          y2={y}
                          stroke="#edf1f4"
                          strokeWidth=".6"
                        />
                      ))}

                      <polygon
                        points={areaPoints}
                        fill="rgba(16,168,123,.10)"
                      />

                      <polyline
                        points={trendPoints}
                        fill="none"
                        stroke="#10a87b"
                        strokeWidth="1.6"
                        vectorEffect="non-scaling-stroke"
                      />

                      {trend.map((value, index) => {
                        const x =
                          trend.length <= 1
                            ? 50
                            : 8 + (index * 84) / (trend.length - 1);

                        const y = 92 - (value / maxTrend) * 72;

                        return (
                          <g key={`${index}-${value}`}>
                            <circle
                              cx={x}
                              cy={y}
                              r="1.7"
                              fill="#10a87b"
                              stroke="white"
                              strokeWidth="1"
                            />

                            {value > 0 && (
                              <text
                                x={x}
                                y={y - 4}
                                textAnchor="middle"
                                className="chart-value"
                              >
                                {value}
                              </text>
                            )}
                          </g>
                        );
                      })}

                    </svg>
                  </div>

                  <div className="chart-months" aria-label="Bulan">
                    {MONTH_LABELS.map((month) => (
                      <span className="chart-month" key={month}>{month}</span>
                    ))}
                  </div>

                  <div className="chart-legend">
                    <span>
                      <i
                        className="legend-dot"
                        style={{
                          background: "#10a87b",
                        }}
                      />
                      Pengguna Baru
                    </span>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* DISTRIBUSI INSTANSI */}

          <section className="panel">
            <div className="panel-header">
              <div className="panel-title">
                <span
                  className="panel-title-dot"
                  style={{
                    background: "#4388df",
                  }}
                />
                Distribusi Pengguna
              </div>

              <span className="empty-note">Berdasarkan instansi</span>
            </div>

            <div className="panel-body">
              {data.institutions.length === 0 ? (
                <div className="empty-note">Belum ada data instansi.</div>
              ) : (
                <div className="donut-area">
                  <DonutChart
                    values={data.institutions.map((item) => item.value)}
                    total={institutionTotal}
                  />

                  <div className="donut-legend">
                    {data.institutions.slice(0, 8).map((item, index) => (
                      <div className="donut-item" key={`${item.name}-${index}`}>
                        <span
                          className="legend-dot"
                          style={{
                            background:
                              institutionColors[
                                index % institutionColors.length
                              ],
                          }}
                        />

                        <span>
                          {item.name}{" "}
                          <strong>
                            {formatPercent(item.value, institutionTotal)}
                          </strong>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* TOP INSTITUTION */}

          <section className="panel">
            <div className="panel-header">
              <div className="panel-title">
                <span
                  className="panel-title-dot"
                  style={{
                    background: "#e59b28",
                  }}
                />
                Instansi Pengguna
              </div>

              <span className="empty-note">
                {data.institutions.length} instansi
              </span>
            </div>

            <div className="panel-body">
              {data.institutions.length === 0 ? (
                <div className="empty-note">Belum ada data instansi.</div>
              ) : (
                <div className="rank-list">
                  {data.institutions.slice(0, 5).map((item) => {
                    const maxValue = Math.max(
                      ...data.institutions.map((row) => row.value),
                      1,
                    );

                    return (
                      <div className="rank-item" key={item.name}>
                        <div>
                          <div className="rank-label">
                            <span>{item.name}</span>

                            <strong>{formatNumber(item.value)}</strong>
                          </div>

                          <div className="progress">
                            <div
                              className="progress-bar"
                              style={{
                                width: `${Math.min(
                                  100,
                                  (item.value / maxValue) * 100,
                                )}%`,
                              }}
                            />
                          </div>
                        </div>

                        <div className="rank-number">
                          {formatNumber(item.value)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* ====================================================
            ROW 2
        ==================================================== */}

        <div className="dashboard-grid-two">
          {/* ACTIVITY */}

          <section className="panel">
            <div className="panel-header">
              <div className="panel-title">
                <span
                  className="panel-title-dot"
                  style={{
                    background: "#1484a7",
                  }}
                />
                Aktivitas Pengguna
              </div>

              <span className="empty-note">
                {data.activities.length} aktivitas
              </span>
            </div>

            <div className="table-wrap">
              {data.activities.length === 0 ? (
                <div className="empty-note">
                  Belum ada aktivitas pengguna pada periode ini.
                </div>
              ) : (
                <table className="activity-table">
                  <thead>
                    <tr>
                      <th>Waktu</th>
                      <th>Nama Pengguna</th>
                      <th>Instansi</th>
                      <th>Aktivitas</th>
                      <th>Modul</th>
                      <th>Perangkat</th>
                      <th>IP</th>
                    </tr>
                  </thead>

                  <tbody>
                    {paginatedActivities.map((item) => (
                      <tr key={item.id}>
                        <td>{formatDateTime(item.date)}</td>

                        <td>
                          <span className="activity-user">
                            {item.user || item.username || "-"}
                          </span>
                        </td>

                        <td>{item.organization || "-"}</td>

                        <td>
                          <span className="activity-action">
                            {item.action || item.accessType || "-"}
                          </span>
                        </td>

                        <td>
                          <span className="activity-module">
                            {item.module || "-"}
                          </span>
                        </td>

                        <td>{item.device || "-"}</td>

                        <td>{item.ipAddress || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {activities.length > ACTIVITY_PAGE_SIZE && (
              <div className="activity-pagination" aria-label="Pagination aktivitas pengguna">
                <span className="activity-pagination-info">Halaman {safeActivityPage} dari {activityTotalPages} · {formatNumber(activities.length)} aktivitas</span>
                <div className="activity-pagination-controls">
                  <button type="button" aria-label="Halaman pertama" disabled={safeActivityPage === 1} onClick={() => setActivityPage(1)}>«</button>
                  <button type="button" aria-label="Halaman sebelumnya" disabled={safeActivityPage === 1} onClick={() => setActivityPage((page) => Math.max(1, page - 1))}>‹</button>
                  {activityPageNumbers.map((page) => (
                    <button key={page} type="button" className={page === safeActivityPage ? "active" : ""} aria-current={page === safeActivityPage ? "page" : undefined} onClick={() => setActivityPage(page)}>{page}</button>
                  ))}
                  <button type="button" aria-label="Halaman berikutnya" disabled={safeActivityPage === activityTotalPages} onClick={() => setActivityPage((page) => Math.min(activityTotalPages, page + 1))}>›</button>
                  <button type="button" aria-label="Halaman terakhir" disabled={safeActivityPage === activityTotalPages} onClick={() => setActivityPage(activityTotalPages)}>»</button>
                </div>
              </div>
            )}
          </section>

          {/* DEVICE */}

          <section className="panel">
            <div className="panel-header">
              <div className="panel-title">
                <span
                  className="panel-title-dot"
                  style={{
                    background: "#4388df",
                  }}
                />
                Perangkat yang Digunakan
              </div>

              <span className="empty-note">
                {formatNumber(deviceTotal)} akses
              </span>
            </div>

            <div className="panel-body">
              {data.devices.length === 0 ? (
                <div className="empty-note">Belum ada data perangkat.</div>
              ) : (
                <div className="donut-area">
                  <DonutChart
                    values={data.devices.map((item) => item.value)}
                    total={deviceTotal}
                  />

                  <div className="donut-legend">
                    {data.devices.map((item, index) => (
                      <div className="donut-item" key={item.name}>
                        <span
                          className="legend-dot"
                          style={{
                            background:
                              deviceColors[index % deviceColors.length],
                          }}
                        />

                        <span>
                          {item.name}{" "}
                          <strong>
                            {formatPercent(item.value, deviceTotal)}
                          </strong>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* ====================================================
            ROW 3
        ==================================================== */}

        <div className="dashboard-grid-bottom">
          {/* PROVINCE */}

          <section className="panel map-panel">
            <div className="panel-header">
              <div className="panel-title">
                <span
                  className="panel-title-dot"
                  style={{
                    background: "#20a56f",
                  }}
                />
                Sebaran Pengguna berdasarkan Provinsi
              </div>

              <span className="empty-note">
                {formatNumber(provinceMapTotal)} terdeteksi
              </span>
            </div>

            <div className="panel-body">
              {provinceGeoJson.features.length === 0 ? (
                <div className="data-map-state">
                  <div className="data-map-icon">
                    <Icon size={21}>
                      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
                      <circle cx="12" cy="10" r="2.5" />
                    </Icon>
                  </div>

                  <div className="data-map-title">Belum ada data wilayah</div>

                  <div className="data-map-description">
                    Database belum menyediakan distribusi pengguna berdasarkan
                    provinsi untuk periode ini.
                  </div>
                </div>
              ) : provinceGeoJson.features.length === 0 ? (
                <div className="data-map-state">
                  <div className="data-map-icon">
                    <Icon size={21}>
                      <path d="M3 6h18" />
                      <path d="M3 12h18" />
                      <path d="M3 18h18" />
                      <path d="M7 3v18" />
                      <path d="M17 3v18" />
                    </Icon>
                  </div>

                  <div className="data-map-title">
                    Geometri provinsi belum tersedia
                  </div>

                  <div className="data-map-description">
                    Data statistik tersedia, tetapi geometri provinsi belum
                    dikembalikan oleh database.
                  </div>
                </div>
              ) : (
                <div className="province-map-wrapper">
                  <MapContainer
                    center={[-2.5, 118]}
                    zoom={4}
                    minZoom={3}
                    maxZoom={8}
                    scrollWheelZoom={true}
                    className="province-leaflet-map"
                    zoomControl={true}
                    attributionControl={true}
                  >
                    <TileLayer
                      attribution="&copy; OpenStreetMap contributors"
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    <GeoJSON
                      key={`${report.year}-${provinceGeoJson.features.length}`}
                      data={provinceGeoJson}
                      style={(feature) => {
                        const properties = feature?.properties as
                          | {
                              total?: number;
                            }
                          | undefined;

                        const total = Number(properties?.total || 0);

                        return {
                          fillColor: getProvinceColor(total),
                          weight: 0.8,
                          opacity: 1,
                          color: "#ffffff",
                          fillOpacity: 0.72,
                        };
                      }}
                      onEachFeature={(feature, layer) => {
                        const properties = feature.properties as {
                          name?: string;
                          loggedInUsers?: number;
                          loggedInAccesses?: number;
                          anonymousVisitors?: number;
                          anonymousAccesses?: number;
                          total?: number;
                        };

                        layer.bindPopup(`
                          <div style="min-width:190px;font-family:Inter,Arial,sans-serif">
                            <div style="font-size:13px;font-weight:700;color:#263449;margin-bottom:8px">
                              ${String(properties.name || "Provinsi")}
                            </div>

                            <div style="display:flex;justify-content:space-between;gap:14px;font-size:11px;margin-bottom:5px">
                              <span>Pengguna login</span>
                              <strong>${formatNumber(
                                properties.loggedInUsers || 0,
                              )}</strong>
                            </div>

                            <div style="display:flex;justify-content:space-between;gap:14px;font-size:11px;margin-bottom:5px">
                              <span>Pengunjung anonim</span>
                              <strong>${formatNumber(
                                properties.anonymousVisitors || 0,
                              )}</strong>
                            </div>

                            <div style="display:flex;justify-content:space-between;gap:14px;font-size:11px;padding-top:6px;border-top:1px solid #edf0f4">
                              <span>Total</span>
                              <strong>${formatNumber(
                                properties.total || 0,
                              )}</strong>
                            </div>
                          </div>
                        `);

                        layer.bindTooltip(
                          String(properties.name || "Provinsi"),
                          {
                            sticky: true,
                            direction: "top",
                          },
                        );
                      }}
                    />
                  </MapContainer>

                  <div className="province-map-overlay">
                    <div className="province-map-stat">
                      <span>Pengguna terdeteksi</span>
                      <strong>{formatNumber(provinceMapTotal)}</strong>
                    </div>

                    <div className="province-map-stat">
                      <span>IP anonim terdeteksi</span>
                      <strong>
                        {formatNumber(
                          data.visitorStats?.geolocatedAnonymousIps || 0,
                        )}
                      </strong>
                    </div>
                  </div>

                  <div className="province-map-legend">
                    <div className="province-map-legend-title">
                      Intensitas sebaran
                    </div>

                    <div className="province-map-legend-scale">
                      <span className="province-map-legend-low" />
                      <span className="province-map-legend-mid" />
                      <span className="province-map-legend-high" />
                    </div>

                    <div className="province-map-legend-labels">
                      <span>Rendah</span>
                      <span>Tinggi</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* SUMMARY */}

          <section className="panel">
            <div className="panel-header">
              <div className="panel-title">
                <span
                  className="panel-title-dot"
                  style={{
                    background: "#7655d8",
                  }}
                />
                Ringkasan Laporan
              </div>

              <span className="empty-note">{period}</span>
            </div>

            <div className="panel-body">
              <div className="summary-grid">
                <div
                  className="summary-card"
                  style={{
                    background: "#f0fbf7",
                  }}
                >
                  <div className="summary-label">Pengguna Baru</div>

                  <div className="summary-value">
                    {formatNumber(data.summary.newUsers)}
                  </div>

                  <div className="summary-caption">
                    User dibuat pada periode laporan
                  </div>
                </div>

                <div
                  className="summary-card"
                  style={{
                    background: "#f1f6ff",
                  }}
                >
                  <div className="summary-label">Login Berhasil</div>

                  <div className="summary-value">
                    {formatNumber(data.summary.successfulLogins)}
                  </div>

                  <div className="summary-caption">
                    Berdasarkan user_login_logs
                  </div>
                </div>

                <div
                  className="summary-card"
                  style={{
                    background: "#fff8ee",
                  }}
                >
                  <div className="summary-label">Total Aktivitas</div>

                  <div className="summary-value">
                    {formatNumber(data.summary.totalUserActivities)}
                  </div>

                  <div className="summary-caption">
                    Berdasarkan user_activity_logs
                  </div>
                </div>

                <div
                  className="summary-card"
                  style={{
                    background: "#f4f0ff",
                  }}
                >
                  <div className="summary-label">Total Unduhan Data</div>

                  <div className="summary-value">
                    {formatNumber(data.summary.totalDownloads)}
                  </div>

                  <div className="summary-caption">
                    Berdasarkan user_download_logs
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ====================================================
            FOOTER META
        ==================================================== */}

        <div className="report-meta">
          <span>Periode laporan: {report.year}</span>

          <span>Sumber: PostgreSQL · simiti_local</span>

          <span>Generated: {formatDateTime(report.generatedAt)}</span>
        </div>
      </div>
    </>
  );
};

export default LaporanPengguna;
