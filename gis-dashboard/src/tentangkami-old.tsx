import React from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Building2,
  CheckCircle2,
  Database,
  FileCheck2,
  Globe2,
  Layers3,
  Map,
  Network,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

type DataSource = {
  no: number;
  mapType: string;
  source: string;
  year?: string;
  category: "Kehutanan" | "Pemerintah" | "Olahan";
};

const DATA_SOURCES: DataSource[] = [
  {
    no: 1,
    mapType: "Tutupan lahan",
    source: "Kementerian Kehutanan",
    year: "2024",
    category: "Kehutanan",
  },
  {
    no: 2,
    mapType: "Lahan Kritis",
    source: "Kementerian Kehutanan",
    year: "2022",
    category: "Kehutanan",
  },
  {
    no: 3,
    mapType: "DAS",
    source: "Kementerian Kehutanan",
    year: "2018",
    category: "Kehutanan",
  },
  {
    no: 4,
    mapType: "Limpasan air",
    source: "Kementerian Kehutanan",
    year: "2015",
    category: "Kehutanan",
  },
  {
    no: 5,
    mapType: "Rawan Erosi",
    source: "Kementerian Kehutanan",
    year: "2018",
    category: "Kehutanan",
  },
  {
    no: 6,
    mapType: "Areal Karhutla",
    source: "Kementerian Kehutanan",
    year: "2021–2024",
    category: "Kehutanan",
  },
  {
    no: 7,
    mapType: "Rawan Karhutla",
    source: "Kementerian Kehutanan",
    year: "2024",
    category: "Kehutanan",
  },
  {
    no: 8,
    mapType: "Rehabilitasi hutan dan lahan",
    source: "Kementerian Kehutanan",
    year: "2019",
    category: "Kehutanan",
  },
  {
    no: 9,
    mapType: "Penerapan Teknik TKA",
    source: "Kementerian Kehutanan",
    year: "2022",
    category: "Kehutanan",
  },
  {
    no: 10,
    mapType: "Jenis Tanah",
    source: "Portal KSP",
    category: "Pemerintah",
  },
  {
    no: 11,
    mapType: "Rehabilitasi DAS",
    source: "Kementerian Kehutanan",
    year: "2024",
    category: "Kehutanan",
  },
  {
    no: 12,
    mapType: "Gerakan Tanah / Longsor",
    source: "Kementerian ESDM",
    category: "Pemerintah",
  },
  {
    no: 13,
    mapType: "Geologi",
    source: "Portal KSP",
    category: "Pemerintah",
  },
  {
    no: 14,
    mapType: "Infrastruktur restorasi gambut",
    source: "Portal KSP",
    year: "2023",
    category: "Pemerintah",
  },
  {
    no: 15,
    mapType: "Reforestasi",
    source: "Kementerian Kehutanan",
    year: "2024",
    category: "Kehutanan",
  },
  {
    no: 16,
    mapType: "Historis Banjir",
    source: "Olahan dari BNPB",
    category: "Olahan",
  },
  {
    no: 17,
    mapType: "Historis Longsor",
    source: "Olahan dari BNPB",
    category: "Olahan",
  },
  {
    no: 18,
    mapType: "DTA Danau",
    source: "Kementerian Kehutanan",
    year: "2020",
    category: "Kehutanan",
  },
];

const categoryMeta = {
  Kehutanan: {
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  Pemerintah: {
    className: "border-blue-200 bg-blue-50 text-blue-700",
  },
  Olahan: {
    className: "border-violet-200 bg-violet-50 text-violet-700",
  },
};

const TentangKami: React.FC = () => {
  const navigate = useNavigate();

  const kehutananCount = DATA_SOURCES.filter(
    (item) => item.category === "Kehutanan",
  ).length;

  const governmentCount = DATA_SOURCES.filter(
    (item) => item.category === "Pemerintah",
  ).length;

  const processedCount = DATA_SOURCES.filter(
    (item) => item.category === "Olahan",
  ).length;

  return (
    <div className="min-h-full bg-[#F4F7FB] text-slate-900">
      {/* =====================================================
          PAGE HEADER
      ===================================================== */}

      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="
                flex h-9 items-center gap-2 rounded-xl
                border border-slate-200 bg-white
                px-3 text-[10px] font-black
                text-slate-600 shadow-sm
                transition hover:border-emerald-300
                hover:bg-emerald-50 hover:text-emerald-700
              "
            >
              <ArrowLeft size={14} />
              Kembali
            </button>

            <div className="hidden h-5 w-px bg-slate-200 sm:block" />

            <div>
              <div className="text-[8px] font-black uppercase tracking-[0.2em] text-emerald-600">
                SIMITI Enterprise
              </div>
              <div className="text-xs font-black text-slate-800">
                Tentang Sistem
              </div>
            </div>
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-[9px] font-bold text-slate-500">
              System Information
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1800px] px-3 py-4 sm:px-5 sm:py-5 lg:px-7 lg:py-6 xl:px-8">
        {/* =====================================================
            HERO
        ===================================================== */}

        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#06111F] via-[#0B1D2D] to-[#123A39] shadow-xl">
          <div className="absolute -right-28 -top-28 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-cyan-400/5 blur-3xl" />

          <div className="relative grid gap-8 px-6 py-8 md:px-9 md:py-10 lg:grid-cols-[1.5fr_.7fr] lg:items-center lg:px-12">
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.18em] text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  SIMITI Enterprise GIS
                </span>

                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[8px] font-bold text-slate-300">
                  INSTITUTIONAL INFORMATION
                </span>
              </div>

              <h1 className="max-w-4xl text-3xl font-black leading-tight tracking-tight text-white md:text-4xl lg:text-5xl">
                Pusat Pengembangan Mitigasi dan Adaptasi Bencana
                Hidrometeorologi Kehutanan
              </h1>

              <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 md:text-[15px]">
                SIMITI dikembangkan sebagai sistem informasi berbasis geospasial
                untuk mendukung pengelolaan data, pemantauan risiko, analisis
                spasial, serta pengembangan mitigasi dan adaptasi bencana
                hidrometeorologi kehutanan.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                  <ShieldCheck size={15} className="text-emerald-300" />
                  <span className="text-[9px] font-bold text-slate-200">
                    Data Driven
                  </span>
                </div>

                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                  <Globe2 size={15} className="text-cyan-300" />
                  <span className="text-[9px] font-bold text-slate-200">
                    Geospatial Intelligence
                  </span>
                </div>

                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                  <Network size={15} className="text-violet-300" />
                  <span className="text-[9px] font-bold text-slate-200">
                    Multi Source Data
                  </span>
                </div>
              </div>
            </div>

            {/* HERO SIDE CARD */}

            <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-300">
                  <Building2 size={24} />
                </div>

                <div>
                  <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">
                    Responsible Institution
                  </div>
                  <div className="mt-1 text-sm font-black text-white">
                    Pusbang Mitigasi
                  </div>
                </div>
              </div>

              <div className="my-5 h-px bg-white/10" />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-slate-400">Platform</span>
                  <span className="text-[9px] font-black text-emerald-300">
                    SIMITI GIS
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-slate-400">
                    Data Registry
                  </span>
                  <span className="text-[9px] font-black text-white">
                    {DATA_SOURCES.length} Dataset
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-slate-400">
                    Spatial Ready
                  </span>
                  <span className="flex items-center gap-1 text-[9px] font-black text-emerald-300">
                    <CheckCircle2 size={12} />
                    ACTIVE
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =====================================================
            EXECUTIVE SUMMARY
        ===================================================== */}

        <section className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_.6fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <FileCheck2 size={19} />
              </div>

              <div>
                <div className="text-[8px] font-black uppercase tracking-[0.18em] text-emerald-600">
                  Institutional Overview
                </div>
                <h2 className="text-lg font-black text-slate-900">
                  Tentang Pusbang Mitigasi
                </h2>
              </div>
            </div>

            <div className="mt-5 space-y-4 text-[12px] leading-7 text-slate-600">
              <p>
                Berdasarkan Permenhut No. 1 Tahun 2024, Pusat Pengembangan
                Mitigasi dan Adaptasi Bencana Hidrometeorologi Kehutanan
                (Pusbang Mitigasi) mempunyai tugas melaksanakan pengembangan
                mitigasi dan adaptasi bencana hidrometeorologi kehutanan.
              </p>

              <p>
                Pusbang Mitigasi merupakan unsur pendukung pelaksanaan tugas
                Kementerian yang berada di bawah dan bertanggung jawab kepada
                Menteri melalui Sekretaris Jenderal.
              </p>

              <p>
                Dalam pelaksanaan tugas tersebut, SIMITI dikembangkan sebagai
                sistem informasi geospasial yang mengintegrasikan data kejadian
                bencana historis, lokasi rawan bencana, kondisi lingkungan,
                serta informasi aksi mitigasi dan adaptasi.
              </p>
            </div>
          </div>

          {/* QUICK STATS */}

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Database size={18} />
                </div>

                <ArrowUpRight size={15} className="text-slate-300" />
              </div>

              <div className="mt-4 text-3xl font-black text-slate-900">
                {DATA_SOURCES.length}
              </div>

              <div className="mt-1 text-[9px] font-black uppercase tracking-wider text-slate-400">
                Dataset Terdaftar
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                  <Layers3 size={18} />
                </div>

                <ArrowUpRight size={15} className="text-slate-300" />
              </div>

              <div className="mt-4 text-3xl font-black text-slate-900">3</div>

              <div className="mt-1 text-[9px] font-black uppercase tracking-wider text-slate-400">
                Kelompok Sumber Data
              </div>
            </div>
          </div>
        </section>

        {/* =====================================================
            TUJUAN
        ===================================================== */}

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <Target size={19} />
              </div>

              <div>
                <div className="text-[8px] font-black uppercase tracking-[0.18em] text-amber-600">
                  Strategic Objective
                </div>

                <h2 className="text-lg font-black">
                  Tujuan Pengembangan Sistem
                </h2>
              </div>
            </div>

            <div className="rounded-full bg-slate-50 px-3 py-1.5 text-[8px] font-black text-slate-500">
              SYSTEM OBJECTIVES
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="group rounded-2xl border border-slate-200 bg-slate-50/60 p-5 transition hover:border-emerald-200 hover:bg-emerald-50/40">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm">
                <Database size={18} />
              </div>

              <div className="mt-4 text-sm font-black">
                Integrated Disaster Information
              </div>

              <p className="mt-2 text-[11px] leading-6 text-slate-500">
                Menyediakan sumber informasi bencana hidrometeorologi kehutanan
                yang berkesinambungan dan termutakhir, mencakup data historis,
                data kerawanan, serta aksi mitigasi dan adaptasi.
              </p>
            </div>

            <div className="group rounded-2xl border border-slate-200 bg-slate-50/60 p-5 transition hover:border-blue-200 hover:bg-blue-50/40">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
                <Map size={18} />
              </div>

              <div className="mt-4 text-sm font-black">
                Geospatial Visualization
              </div>

              <p className="mt-2 text-[11px] leading-6 text-slate-500">
                Menyediakan visualisasi berbasis peta untuk mendukung pemahaman
                spasial terhadap kejadian, kerawanan, kondisi lingkungan, dan
                berbagai informasi pendukung mitigasi.
              </p>
            </div>
          </div>
        </section>

        {/* =====================================================
            SYSTEM CAPABILITIES
        ===================================================== */}

        <section className="mt-5">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <div className="text-[8px] font-black uppercase tracking-[0.18em] text-emerald-600">
                Platform Capability
              </div>

              <h2 className="mt-1 text-lg font-black">Kapabilitas SIMITI</h2>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Map,
                title: "Spatial Intelligence",
                text: "Visualisasi dan eksplorasi data berbasis geospasial.",
              },
              {
                icon: BarChart3,
                title: "Risk Analysis",
                text: "Analisis kondisi risiko dan informasi kebencanaan.",
              },
              {
                icon: Database,
                title: "Data Integration",
                text: "Integrasi berbagai sumber data lintas instansi.",
              },
              {
                icon: Network,
                title: "Decision Support",
                text: "Mendukung pengambilan keputusan berbasis data.",
              },
            ].map((item) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.title}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
                    <Icon size={18} />
                  </div>

                  <h3 className="mt-4 text-sm font-black">{item.title}</h3>

                  <p className="mt-2 text-[10px] leading-5 text-slate-500">
                    {item.text}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* =====================================================
            DATA SOURCES
        ===================================================== */}

        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Database size={19} />
                </div>

                <div>
                  <div className="text-[8px] font-black uppercase tracking-[0.18em] text-blue-600">
                    Data Governance
                  </div>

                  <h2 className="text-lg font-black">
                    Sumber Data dan Informasi
                  </h2>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[8px] font-black text-emerald-700">
                  {kehutananCount} Kehutanan
                </span>

                <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[8px] font-black text-blue-700">
                  {governmentCount} Pemerintah
                </span>

                <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[8px] font-black text-violet-700">
                  {processedCount} Olahan
                </span>
              </div>
            </div>

            <p className="mt-4 max-w-4xl text-[11px] leading-6 text-slate-500">
              Sistem didukung oleh data yang bersumber dari Kementerian
              Kehutanan, BMKG, BNPB, Kementerian Pertanian, Kementerian ESDM,
              Portal KSP, serta berbagai data hasil pengolahan untuk kebutuhan
              analisis kebencanaan.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse">
              <thead>
                <tr className="bg-slate-950">
                  <th className="px-5 py-3 text-left text-[8px] font-black uppercase tracking-wider text-slate-400">
                    #
                  </th>

                  <th className="px-5 py-3 text-left text-[8px] font-black uppercase tracking-wider text-slate-400">
                    Dataset / Jenis Peta
                  </th>

                  <th className="px-5 py-3 text-left text-[8px] font-black uppercase tracking-wider text-slate-400">
                    Sumber Data
                  </th>

                  <th className="px-5 py-3 text-left text-[8px] font-black uppercase tracking-wider text-slate-400">
                    Tahun
                  </th>

                  <th className="px-5 py-3 text-left text-[8px] font-black uppercase tracking-wider text-slate-400">
                    Klasifikasi
                  </th>
                </tr>
              </thead>

              <tbody>
                {DATA_SOURCES.map((item) => (
                  <tr
                    key={item.no}
                    className="border-t border-slate-100 transition hover:bg-slate-50"
                  >
                    <td className="px-5 py-3 text-[9px] font-black text-slate-400">
                      {String(item.no).padStart(2, "0")}
                    </td>

                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                          <Layers3 size={14} />
                        </div>

                        <span className="text-[10px] font-black text-slate-800">
                          {item.mapType}
                        </span>
                      </div>
                    </td>

                    <td className="px-5 py-3 text-[10px] font-semibold text-slate-600">
                      {item.source}
                    </td>

                    <td className="px-5 py-3">
                      {item.year ? (
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-[8px] font-black text-slate-600">
                          {item.year}
                        </span>
                      ) : (
                        <span className="text-[9px] text-slate-300">—</span>
                      )}
                    </td>

                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[8px] font-black ${
                          categoryMeta[item.category].className
                        }`}
                      >
                        {item.category}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* TABLE FOOTER */}

          <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-500" />

              <span className="text-[9px] font-bold text-slate-500">
                Registry sumber data terdaftar dalam SIMITI
              </span>
            </div>

            <span className="text-[9px] font-black text-slate-400">
              TOTAL {DATA_SOURCES.length} DATASET
            </span>
          </div>
        </section>

        {/* =====================================================
            INSTITUTIONAL NOTE
        ===================================================== */}

        <section className="mt-5 overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-white">
          <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20">
                <Sparkles size={19} />
              </div>

              <div>
                <div className="text-[8px] font-black uppercase tracking-[0.18em] text-emerald-700">
                  Strategic Information System
                </div>

                <h3 className="mt-1 text-sm font-black text-slate-900">
                  Mendukung mitigasi dan adaptasi bencana hidrometeorologi
                  kehutanan
                </h3>

                <p className="mt-2 max-w-3xl text-[10px] leading-5 text-slate-500">
                  Diharapkan SIMITI dapat menjadi sumber data dan informasi yang
                  mendukung kegiatan mitigasi dan adaptasi bencana
                  hidrometeorologi kehutanan di lingkungan Kementerian
                  Kehutanan.
                </p>
              </div>
            </div>

            <div className="shrink-0 rounded-xl border border-emerald-200 bg-white px-4 py-3">
              <div className="text-[8px] font-black uppercase tracking-wider text-slate-400">
                Organization
              </div>

              <div className="mt-1 text-[10px] font-black text-slate-800">
                Kementerian Kehutanan
              </div>

              <div className="mt-1 text-[8px] font-semibold text-slate-400">
                Republik Indonesia
              </div>
            </div>
          </div>
        </section>

        {/* =====================================================
            FOOTER
        ===================================================== */}

        <footer className="py-7 text-center">
          <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">
            SIMITI Enterprise GIS
          </div>

          <div className="mt-2 text-[9px] text-slate-400">
            Pusat Pengembangan Mitigasi dan Adaptasi Bencana Hidrometeorologi
            Kehutanan
          </div>

          <div className="mt-1 text-[8px] text-slate-300">
            Kementerian Kehutanan Republik Indonesia
          </div>
        </footer>
      </div>
    </div>
  );
};

export default TentangKami;
