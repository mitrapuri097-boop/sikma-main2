import React, { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import {
  Bot,
  X,
} from "lucide-react";

import Header from "./Header";
import Sidebar from "./Sidebar";
import Footer from "./Footer";
import Breadcrumb from "./Breadcrumb";
import IdleTimeout from "./IdleTimeout";

/* ============================================================
   ENTERPRISE LAYOUT
   SIMITI Enterprise GIS

   Responsibility:
   - Global application shell
   - Header
   - Sidebar
   - Responsive mobile navigation
   - Page content container
   - GIS full-workspace mode
   - Optional AI assistant for non-GIS pages
   - Automatic idle session timeout

   NOTE:
   GisCommandCenter sudah memiliki:
   - GIS toolbar
   - layer control
   - info panel
   - fullscreen
   - mobile bottom navigation

   Karena itu layout GLOBAL tidak membuat toolbar GIS
   tambahan agar tidak terjadi duplicate UI.
============================================================ */

export default function EnterpriseLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  /* ==========================================================
     ROUTE DETECTION
  ========================================================== */

  const isWebGIS =
    location.pathname === "/gis" ||
    location.pathname.startsWith("/gis/");

  const isLocationPage =
    location.pathname === "/gis/lokasi-saya" ||
    location.pathname === "/lokasi-saya";

  const isWebGISCanvas = isWebGIS && !isLocationPage;

  const isRecommendation = location.pathname === "/rekomendasi";

  /* ==========================================================
     SIDEBAR STATE
  ========================================================== */

  // Desktop
  // false = expanded
  // true  = collapsed
  const [sidebarCollapsed, setSidebarCollapsed] =
    useState(false);

  // Mobile
  // false = closed
  // true  = open
  const [mobileSidebar, setMobileSidebar] =
    useState(false);

  /* ==========================================================
     AI ASSISTANT
  ========================================================== */

  /*
   * AI panel sengaja TIDAK ditampilkan di GIS.
   *
   * GisCommandCenter nantinya menjadi owner untuk:
   * - AI analysis
   * - location analysis
   * - recommendation
   * - risk analysis
   *
   * Untuk halaman enterprise biasa, floating assistant
   * tetap tersedia.
   */
  const [showAI, setShowAI] = useState(false);

  /* ==========================================================
     SIDEBAR ACTIONS
  ========================================================== */

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => !current);
  };

  const toggleMobileSidebar = () => {
    setMobileSidebar((current) => !current);
  };

  const closeMobileSidebar = () => {
    setMobileSidebar(false);
  };

  /* ==========================================================
     AI ACTION
  ========================================================== */

  const toggleAI = () => {
    setShowAI((current) => !current);
  };

  /* ==========================================================
     RESPONSIVE BEHAVIOR
  ========================================================== */

  useEffect(() => {
    const handleResize = () => {
      /*
       * Mobile breakpoint:
       * < 768px
       */
      if (window.innerWidth < 768) {
        setMobileSidebar(false);
      }
    };

    handleResize();

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  /* ==========================================================
     CLOSE MOBILE SIDEBAR WHEN ROUTE CHANGES
  ========================================================== */

  useEffect(() => {
    setMobileSidebar(false);
  }, [location.pathname]);

  /* ==========================================================
     AI BEHAVIOR
  ========================================================== */

  useEffect(() => {
    /*
     * GIS tidak menggunakan AI panel global.
     * GisCommandCenter menangani AI sendiri.
     */
    if (isWebGIS) {
      setShowAI(false);
    }
  }, [isWebGIS]);

  /* ==========================================================
     RENDER
  ========================================================== */

  return (
    <>
      {/* ======================================================
          GLOBAL IDLE TIMEOUT

          Default:
          15 menit tanpa aktivitas → logout → /login

          Komponen ini tidak menghasilkan UI.
          Hanya menangani session timeout.
      ====================================================== */}

      <IdleTimeout />

      {/* ======================================================
          GLOBAL APPLICATION SHELL
      ====================================================== */}

      <div
        className="
          flex
          h-screen
          w-full
          overflow-hidden
          bg-[#F4F7FB]
          text-slate-900
        "
      >
        {/* ======================================================
            SIDEBAR
            Penuh tinggi layar, di atas header, tidak ikut scroll.
            Di mobile komponen Sidebar menjadi drawer sendiri.
        ====================================================== */}

        <aside
          className={`
            max-md:contents
            md:relative
            md:z-[95]
            md:block
            md:h-full
            md:shrink-0
            md:transition-[width]
            md:duration-300
            md:ease-out
            ${sidebarCollapsed ? "md:w-[80px]" : "md:w-[288px]"}
          `}
        >
          <Sidebar
            collapsed={sidebarCollapsed}
            mobileOpen={mobileSidebar}
            onCloseMobile={closeMobileSidebar}
          />
        </aside>

        {/* ======================================================
            KOLOM KANAN: HEADER (tetap) + KONTEN (scroll)
        ====================================================== */}

        <div className="flex h-full min-w-0 flex-1 flex-col">
          <header className="relative z-[100] shrink-0">
            <Header
              onMenuClick={toggleMobileSidebar}
              onToggleSidebar={toggleSidebar}
              sidebarCollapsed={sidebarCollapsed}
            />
          </header>

          <main
            className={`
              relative
              min-h-0
              min-w-0
              flex-1
              ${
                isWebGISCanvas
                  ? "overflow-hidden bg-[#07101D]"
                  : "overflow-y-auto overflow-x-hidden bg-[#F4F7FB]"
              }
            `}
          >
            {isWebGISCanvas ? (
              <div className="relative h-full min-h-0 w-full overflow-hidden">
                <Outlet />
              </div>
            ) : isRecommendation ? (
              /* Halaman Rekomendasi mengatur kartu & jarak sendiri. */
              <div className="flex min-h-full w-full flex-col">
                <div className="mx-auto w-full max-w-[1680px] flex-1 px-4 pb-6 pt-4 sm:px-6 lg:px-8">
                  <div className="mb-4">
                    <Breadcrumb />
                  </div>
                  <Outlet />
                </div>
                <Footer />
              </div>
            ) : (
              <div className="flex min-h-full w-full flex-col">
                <div className="mx-auto w-full max-w-[1680px] flex-1 px-4 pb-6 pt-4 sm:px-6 lg:px-8">
                  <div className="mb-4">
                    <Breadcrumb />
                  </div>
                  <section className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
                    <div className="min-h-[calc(100vh-230px)] w-full">
                      <Outlet />
                    </div>
                  </section>
                </div>
                <Footer />
              </div>
            )}
          </main>
        </div>

        {/* ======================================================
            GLOBAL AI ASSISTANT

            HANYA untuk halaman non-GIS.

            GIS:
            AI akan ditangani oleh GisCommandCenter.
        ====================================================== */}

        {!isWebGIS && showAI && (
          <aside
            className="
              fixed

              right-0
              top-[70px]

              z-[80]

              h-[calc(100vh-70px)]

              w-[360px]
              max-w-[calc(100vw-24px)]

              overflow-hidden

              border-l
              border-slate-200

              bg-white

              shadow-2xl

              max-md:w-[calc(100vw-24px)]
            "
          >

            {/* ================================================
                AI HEADER
            ================================================ */}

            <div
              className="
                flex
                items-center
                justify-between

                border-b
                border-slate-200

                px-5
                py-4
              "
            >

              <div className="flex items-center gap-3">

                <div
                  className="
                    flex
                    h-9
                    w-9
                    items-center
                    justify-center

                    rounded-xl

                    bg-emerald-50
                    text-emerald-600
                  "
                >
                  <Bot size={18} />
                </div>

                <div>

                  <p
                    className="
                      text-sm
                      font-bold
                      text-slate-900
                    "
                  >
                    AI Assistant
                  </p>

                  <p
                    className="
                      mt-0.5
                      text-[11px]
                      text-slate-500
                    "
                  >
                    SIMITI Decision Support
                  </p>

                </div>

              </div>

              <button
                type="button"
                onClick={toggleAI}
                aria-label="Tutup AI Assistant"
                className="
                  flex
                  h-8
                  w-8
                  items-center
                  justify-center

                  rounded-lg

                  text-slate-400

                  transition

                  hover:bg-slate-100
                  hover:text-slate-700
                "
              >
                <X size={17} />
              </button>

            </div>

            {/* ================================================
                AI BODY
            ================================================ */}

            <div
              className="
                h-full
                overflow-y-auto
                p-5
              "
            >

              {/* ==============================================
                  STATUS
              ============================================== */}

              <div
                className="
                  mb-5

                  flex
                  items-center
                  gap-2

                  rounded-xl

                  border
                  border-emerald-100

                  bg-emerald-50

                  px-3
                  py-2.5
                "
              >

                <span
                  className="
                    h-2
                    w-2
                    rounded-full
                    bg-emerald-500
                  "
                />

                <span
                  className="
                    text-[11px]
                    font-semibold
                    text-emerald-700
                  "
                >
                  AI Service Ready
                </span>

              </div>

              {/* ==============================================
                  ANALYSIS CARD
              ============================================== */}

              <div
                className="
                  rounded-2xl

                  border
                  border-slate-200

                  bg-gradient-to-br
                  from-slate-50
                  to-white

                  p-5
                "
              >

                <div
                  className="
                    flex
                    h-11
                    w-11
                    items-center
                    justify-center

                    rounded-xl

                    bg-emerald-100
                    text-emerald-700
                  "
                >
                  <Bot size={20} />
                </div>

                <h3
                  className="
                    mt-4
                    text-base
                    font-bold
                    text-slate-900
                  "
                >
                  Analisis & Rekomendasi
                </h3>

                <p
                  className="
                    mt-2
                    text-sm
                    leading-6
                    text-slate-600
                  "
                >
                  Gunakan fitur analisis SIMITI untuk
                  mendapatkan informasi risiko,
                  rekomendasi mitigasi, dan dukungan
                  pengambilan keputusan berbasis data.
                </p>

              </div>

              {/* ==============================================
                  QUICK ACTION
              ============================================== */}

              <div className="mt-4 grid grid-cols-2 gap-3">

                <button
                  type="button"
                  onClick={() => { setShowAI(false); navigate("/kerawanan"); }}
                  className="
                    rounded-xl
                    border
                    border-slate-200

                    bg-white

                    px-3
                    py-3

                    text-left

                    transition

                    hover:border-emerald-200
                    hover:bg-emerald-50/50
                  "
                >

                  <div
                    className="
                      text-[11px]
                      font-bold
                      text-slate-800
                    "
                  >
                    Analisis Risiko
                  </div>

                  <div
                    className="
                      mt-1
                      text-[9px]
                      text-slate-500
                    "
                  >
                    Analisis lokasi
                  </div>

                </button>

                <button
                  type="button"
                  onClick={() => { setShowAI(false); navigate("/rekomendasi"); }}
                  className="
                    rounded-xl
                    border
                    border-slate-200

                    bg-white

                    px-3
                    py-3

                    text-left

                    transition

                    hover:border-emerald-200
                    hover:bg-emerald-50/50
                  "
                >

                  <div
                    className="
                      text-[11px]
                      font-bold
                      text-slate-800
                    "
                  >
                    Rekomendasi
                  </div>

                  <div
                    className="
                      mt-1
                      text-[9px]
                      text-slate-500
                    "
                  >
                    Model mitigasi
                  </div>

                </button>

              </div>

            </div>

          </aside>
        )}

        {/* ======================================================
            AI FLOATING BUTTON

            Non-GIS only.
        ====================================================== */}

        {!isWebGIS && !isRecommendation && !showAI && (
          <button
            type="button"
            onClick={toggleAI}
            title="Buka AI Assistant"
            aria-label="Buka AI Assistant"
            className="
              fixed
              bottom-6
              right-6

              z-[100]

              flex
              h-14
              w-14

              items-center
              justify-center

              rounded-2xl

              bg-gradient-to-br
              from-emerald-500
              to-emerald-700

              text-white

              shadow-xl
              shadow-emerald-900/20

              transition

              hover:scale-105
              hover:shadow-2xl
            "
          >
            <Bot size={23} />
          </button>
        )}

      </div>
    </>
  );
}