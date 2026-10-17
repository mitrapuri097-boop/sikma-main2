import React, { useMemo, useState } from "react";

/* ============================================================
   LAPORAN PENGGUNA - SIMITI PRO ENTERPRISE
   ============================================================ */

type Period = "2024" | "2025" | "2026";

type Activity = {
  date: string;
  user: string;
  institution: string;
  activity: string;
  module: string;
  location: string;
};

const activities: Activity[] = [
  {
    date: "02 Okt 2024 14:32",
    user: "admin1",
    institution: "Kementerian Kehutanan",
    activity: "Melakukan pencarian data",
    module: "WebGIS",
    location: "Jakarta",
  },
  {
    date: "02 Okt 2024 14:21",
    user: "sinta",
    institution: "BMKG",
    activity: "Mengunduh data curah hujan",
    module: "Data GIS",
    location: "Jakarta",
  },
  {
    date: "02 Okt 2024 14:08",
    user: "budi",
    institution: "BNPB",
    activity: "Melihat peta kerawanan",
    module: "WebGIS",
    location: "Jakarta",
  },
  {
    date: "02 Okt 2024 13:54",
    user: "andi",
    institution: "Kementerian ESDM",
    activity: "Mengakses laporan",
    module: "Pelaporan",
    location: "Bandung",
  },
  {
    date: "01 Okt 2024 15:43",
    user: "naufal",
    institution: "Kementerian PUPR",
    activity: "Mengunduh data DAS",
    module: "Data GIS",
    location: "Jakarta",
  },
];

const monthLabels = [
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

const userTrend = [180, 260, 310, 355, 330, 380, 395, 470, 510, 620, 720, 892];

const provinceData = [
  { name: "DKI Jakarta", value: 24 },
  { name: "Jawa Barat", value: 19 },
  { name: "Jawa Timur", value: 13 },
  { name: "Jawa Tengah", value: 11 },
  { name: "Sumatera Utara", value: 8 },
];

const institutionData = [
  { name: "Kementerian Kehutanan", value: 286 },
  { name: "BMKG", value: 165 },
  { name: "BNPB", value: 134 },
  { name: "Kementerian ESDM", value: 96 },
  { name: "Kementerian PUPR", value: 82 },
];

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

  .kpi-meta {
    margin-top: 6px;
    font-size: 10px;
    color: #8390a1;
  }

  .kpi-up {
    color: #12a36f;
    font-weight: 700;
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
  }

  .panel-action {
    border: 1px solid #e3e8ef;
    background: white;
    color: #718096;
    border-radius: 7px;
    font-size: 9px;
    padding: 5px 8px;
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

  .chart-label {
    font-size: 9px;
    fill: #95a0b0;
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
    min-width: 700px;
  }

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

  .map-panel {
    min-height: 238px;
  }

  .map-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 150px;
    gap: 13px;
    min-height: 185px;
  }

  .map-box {
    position: relative;
    min-height: 180px;
    overflow: hidden;
    border-radius: 9px;
    background:
      linear-gradient(125deg, transparent 0 28%, rgba(17, 135, 91, .09) 29% 39%, transparent 40%),
      linear-gradient(35deg, transparent 0 48%, rgba(17, 135, 91, .10) 49% 61%, transparent 62%),
      #edf6ef;
    border: 1px solid #dfeae2;
  }

  .map-grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(91, 122, 105, .08) 1px, transparent 1px),
      linear-gradient(90deg, rgba(91, 122, 105, .08) 1px, transparent 1px);
    background-size: 28px 28px;
  }

  .island {
    position: absolute;
    border-radius: 45% 55% 50% 48%;
    background: #9dd8b7;
    opacity: .72;
    transform: rotate(-12deg);
  }

  .island.one {
    width: 150px;
    height: 34px;
    left: 8%;
    top: 48%;
  }

  .island.two {
    width: 105px;
    height: 28px;
    left: 42%;
    top: 57%;
    transform: rotate(8deg);
  }

  .island.three {
    width: 75px;
    height: 22px;
    right: 10%;
    top: 42%;
    transform: rotate(-8deg);
  }

  .map-marker {
    position: absolute;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #0b9f70;
    border: 2px solid white;
    box-shadow: 0 2px 6px rgba(0,0,0,.18);
  }

  .province-list {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding-top: 3px;
  }

  .province-row {
    display: grid;
    grid-template-columns: 18px 1fr 33px;
    gap: 5px;
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

  .summary-change {
    margin-top: 4px;
    font-size: 8px;
    color: #0a9b6d;
    font-weight: 700;
  }

  .empty-note {
    color: #98a2b1;
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

    .map-body {
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
  }
`;

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

const DonutChart = ({
  values,
  total,
}: {
  values: number[];
  total: number;
}) => {
  const colors = ["#08a875", "#4388df", "#7d61d8", "#f0a52b", "#d5dbe3"];

  const gradient = useMemo(() => {
    let current = 0;

    return values
      .map((value, index) => {
        const start = current;
        current += (value / total) * 100;
        return `${colors[index]} ${start}% ${current}%`;
      })
      .join(", ");
  }, [values, total]);

  return (
    <div
      className="donut"
      style={{
        background: `conic-gradient(${gradient})`,
      }}
    >
      <div className="donut-hole">
        <div className="donut-total">
          {total.toLocaleString("id-ID")}
        </div>
        <div className="donut-caption">Total Pengguna</div>
      </div>
    </div>
  );
};

const LaporanPengguna: React.FC = () => {
  const [period, setPeriod] = useState<Period>("2024");

  const maxTrend = Math.max(...userTrend);

  const points = userTrend
    .map((value, index) => {
      const x = 8 + (index * 84) / (userTrend.length - 1);
      const y = 92 - (value / maxTrend) * 72;
      return `${x},${y}`;
    })
    .join(" ");

  const areaPoints = `8,96 ${points} 92,96`;

  const downloadReport = () => {
    window.print();
  };

  return (
    <>
      <style>{css}</style>

      <div className="laporan-page">
        {/* ======================================================
            HEADER
        ====================================================== */}
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
                Informasi statistik dan aktivitas pengguna SIMITI
              </p>
            </div>
          </div>

          <div className="laporan-actions">
            <select
              className="period-select"
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              aria-label="Periode laporan"
            >
              <option value="2024">Tahun 2024</option>
              <option value="2025">Tahun 2025</option>
              <option value="2026">Tahun 2026</option>
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

        {/* ======================================================
            KPI
        ====================================================== */}
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-top">
              <span className="kpi-label">Total Pengguna</span>
              <span
                className="kpi-icon"
                style={{
                  color: "#087f5b",
                  background: "#e8f7f1",
                }}
              >
                <Icon size={16}>
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </Icon>
              </span>
            </div>

            <div className="kpi-value">1.248</div>
            <div className="kpi-meta">
              <span className="kpi-up">↑ 12%</span> dari periode sebelumnya
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-top">
              <span className="kpi-label">Pengguna Aktif</span>
              <span
                className="kpi-icon"
                style={{
                  color: "#0a9b6d",
                  background: "#e9f8f3",
                }}
              >
                <Icon size={16}>
                  <circle cx="12" cy="8" r="3.5" />
                  <path d="M5 20c.7-3.4 3-5 7-5s6.3 1.6 7 5" />
                </Icon>
              </span>
            </div>

            <div className="kpi-value">892</div>
            <div className="kpi-meta">
              <span className="kpi-up">↑ 18%</span> dari periode sebelumnya
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-top">
              <span className="kpi-label">Instansi Terdaftar</span>
              <span
                className="kpi-icon"
                style={{
                  color: "#e58d12",
                  background: "#fff5e4",
                }}
              >
                <Icon size={16}>
                  <path d="M3 21h18" />
                  <path d="M5 21V8l7-5 7 5v13" />
                  <path d="M9 21v-5h6v5" />
                  <path d="M9 10h.01M12 10h.01M15 10h.01" />
                </Icon>
              </span>
            </div>

            <div className="kpi-value">64</div>
            <div className="kpi-meta">
              <span className="kpi-up">↑ 9%</span> dari periode sebelumnya
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-top">
              <span className="kpi-label">Total Akses Sistem</span>
              <span
                className="kpi-icon"
                style={{
                  color: "#7655d8",
                  background: "#f0ecff",
                }}
              >
                <Icon size={16}>
                  <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="2.5" />
                </Icon>
              </span>
            </div>

            <div className="kpi-value">36.548</div>
            <div className="kpi-meta">
              <span className="kpi-up">↑ 26%</span> dari periode sebelumnya
            </div>
          </div>
        </div>

        {/* ======================================================
            ROW 1 - TREND / DISTRIBUTION / TOP INSTITUTION
        ====================================================== */}
        <div className="dashboard-grid">
          <section className="panel">
            <div className="panel-header">
              <div className="panel-title">
                <span className="panel-title-dot" />
                Tren Jumlah Pengguna
              </div>

              <select className="period-select" defaultValue={period}>
                <option>{period}</option>
              </select>
            </div>

            <div className="panel-body">
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
                    points={points}
                    fill="none"
                    stroke="#10a87b"
                    strokeWidth="1.6"
                    vectorEffect="non-scaling-stroke"
                  />

                  {userTrend.map((value, index) => {
                    const x = 8 + (index * 84) / (userTrend.length - 1);
                    const y = 92 - (value / maxTrend) * 72;

                    return (
                      <circle
                        key={`${value}-${index}`}
                        cx={x}
                        cy={y}
                        r="1.7"
                        fill="#10a87b"
                        stroke="white"
                        strokeWidth="1"
                      />
                    );
                  })}

                  {monthLabels.map((month, index) => {
                    const x = 8 + (index * 84) / 11;

                    return (
                      <text
                        key={month}
                        x={x}
                        y="105"
                        textAnchor="middle"
                        className="chart-label"
                      >
                        {month}
                      </text>
                    );
                  })}
                </svg>
              </div>

              <div className="chart-legend">
                <span>
                  <i
                    className="legend-dot"
                    style={{ background: "#10a87b" }}
                  />
                  Pengguna Aktif
                </span>

                <span>
                  <i
                    className="legend-dot"
                    style={{ background: "#79b9ff" }}
                  />
                  Pengguna Baru
                </span>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="panel-title">
                <span
                  className="panel-title-dot"
                  style={{ background: "#4388df" }}
                />
                Distribusi Pengguna
              </div>

              <select className="period-select" defaultValue={period}>
                <option>{period}</option>
              </select>
            </div>

            <div className="panel-body">
              <div className="donut-area">
                <DonutChart
                  values={[38, 26, 19, 12, 5]}
                  total={1248}
                />

                <div className="donut-legend">
                  {[
                    ["Publik", "38%", "#08a875"],
                    ["Pusat", "26%", "#4388df"],
                    ["Instansi", "19%", "#7d61d8"],
                    ["Internal", "12%", "#f0a52b"],
                    ["Lainnya", "5%", "#d5dbe3"],
                  ].map(([name, value, color]) => (
                    <div className="donut-item" key={name}>
                      <span
                        className="legend-dot"
                        style={{ background: color }}
                      />
                      <span>
                        {name} <strong>{value}</strong>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="panel-title">
                <span
                  className="panel-title-dot"
                  style={{ background: "#e59b28" }}
                />
                Top 5 Instansi Pengguna
              </div>

              <select className="period-select" defaultValue={period}>
                <option>{period}</option>
              </select>
            </div>

            <div className="panel-body">
              <div className="rank-list">
                {institutionData.map((item) => (
                  <div className="rank-item" key={item.name}>
                    <div>
                      <div className="rank-label">
                        <span>{item.name}</span>
                        <strong>{item.value}</strong>
                      </div>

                      <div className="progress">
                        <div
                          className="progress-bar"
                          style={{
                            width: `${(item.value / 286) * 100}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="rank-number">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* ======================================================
            ROW 2 - ACTIVITY / DEVICE
        ====================================================== */}
        <div className="dashboard-grid-two">
          <section className="panel">
            <div className="panel-header">
              <div className="panel-title">
                <span
                  className="panel-title-dot"
                  style={{ background: "#1484a7" }}
                />
                Aktivitas Pengguna
              </div>

              <button type="button" className="panel-action">
                Lihat Semua Aktivitas
              </button>
            </div>

            <div className="table-wrap">
              <table className="activity-table">
                <thead>
                  <tr>
                    <th>Waktu</th>
                    <th>Nama Pengguna</th>
                    <th>Instansi</th>
                    <th>Aktivitas</th>
                    <th>Modul</th>
                    <th>Lokasi IP</th>
                  </tr>
                </thead>

                <tbody>
                  {activities.map((item, index) => (
                    <tr key={`${item.user}-${index}`}>
                      <td>{item.date}</td>
                      <td>
                        <span className="activity-user">{item.user}</span>
                      </td>
                      <td>{item.institution}</td>
                      <td>{item.activity}</td>
                      <td>
                        <span className="activity-module">
                          {item.module}
                        </span>
                      </td>
                      <td>{item.location}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="panel-title">
                <span
                  className="panel-title-dot"
                  style={{ background: "#4388df" }}
                />
                Perangkat yang Digunakan
              </div>
            </div>

            <div className="panel-body">
              <div className="donut-area">
                <DonutChart
                  values={[68, 27, 5]}
                  total={1248}
                />

                <div className="donut-legend">
                  {[
                    ["Desktop", "68%", "#4388df"],
                    ["Mobile", "27%", "#08a875"],
                    ["Tablet", "5%", "#f0a52b"],
                  ].map(([name, value, color]) => (
                    <div className="donut-item" key={name}>
                      <span
                        className="legend-dot"
                        style={{ background: color }}
                      />
                      <span>
                        {name} <strong>{value}</strong>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ======================================================
            ROW 3 - MAP / SUMMARY
        ====================================================== */}
        <div className="dashboard-grid-bottom">
          <section className="panel map-panel">
            <div className="panel-header">
              <div className="panel-title">
                <span
                  className="panel-title-dot"
                  style={{ background: "#20a56f" }}
                />
                Sebaran Pengguna berdasarkan Wilayah
              </div>

              <select className="period-select" defaultValue={period}>
                <option>{period}</option>
              </select>
            </div>

            <div className="panel-body">
              <div className="map-body">
                <div className="map-box">
                  <div className="map-grid" />

                  <div className="island one" />
                  <div className="island two" />
                  <div className="island three" />

                  <span
                    className="map-marker"
                    style={{ left: "19%", top: "48%" }}
                  />
                  <span
                    className="map-marker"
                    style={{ left: "29%", top: "56%" }}
                  />
                  <span
                    className="map-marker"
                    style={{ left: "47%", top: "60%" }}
                  />
                  <span
                    className="map-marker"
                    style={{ left: "66%", top: "53%" }}
                  />
                  <span
                    className="map-marker"
                    style={{ left: "77%", top: "44%" }}
                  />
                </div>

                <div className="province-list">
                  {provinceData.map((item, index) => (
                    <div className="province-row" key={item.name}>
                      <span className="province-rank">{index + 1}</span>
                      <span>{item.name}</span>
                      <span className="province-value">
                        {item.value}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="panel-title">
                <span
                  className="panel-title-dot"
                  style={{ background: "#7655d8" }}
                />
                Ringkasan Laporan
              </div>

              <select className="period-select" defaultValue={period}>
                <option>{period}</option>
              </select>
            </div>

            <div className="panel-body">
              <div className="summary-grid">
                <div
                  className="summary-card"
                  style={{ background: "#f0fbf7" }}
                >
                  <div className="summary-label">Pengguna Baru</div>
                  <div className="summary-value">312</div>
                  <div className="summary-change">↑ 22%</div>
                </div>

                <div
                  className="summary-card"
                  style={{ background: "#f1f6ff" }}
                >
                  <div className="summary-label">Rata-rata Login / Hari</div>
                  <div className="summary-value">102</div>
                  <div className="summary-change">↑ 10%</div>
                </div>

                <div
                  className="summary-card"
                  style={{ background: "#fff8ee" }}
                >
                  <div className="summary-label">Total Aktivitas</div>
                  <div className="summary-value">18.642</div>
                  <div className="summary-change">↑ 28%</div>
                </div>

                <div
                  className="summary-card"
                  style={{ background: "#f4f0ff" }}
                >
                  <div className="summary-label">Total Unduhan Data</div>
                  <div className="summary-value">4.891</div>
                  <div className="summary-change">↑ 17%</div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div
          style={{
            marginTop: 13,
            textAlign: "right",
            color: "#a0a9b6",
            fontSize: 9,
          }}
        >
          Periode laporan: {period} · SIMITI Enterprise
        </div>
      </div>
    </>
  );
};

export default LaporanPengguna;
