import React, { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Menu,
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

  /* ==========================================================
     ROUTE DETECTION
  ========================================================== */

  const isWebGIS =
    location.pathname === "/gis" ||
    location.pathname.startsWith("/gis/");

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
          min-h-screen
          w-full
          flex-col
          overflow-hidden
          bg-[#F4F7FB]
          text-slate-900
        "
      >

        {/* ======================================================
            GLOBAL HEADER
        ====================================================== */}

        <header
          className="
            relative
            z-[100]
            shrink-0
          "
        >
          <Header
            onMenuClick={toggleMobileSidebar}
          />
        </header>

        {/* ======================================================
            APPLICATION BODY
        ====================================================== */}

        <div
          className="
            relative
            flex
            min-h-0
            flex-1
            overflow-hidden
          "
        >

          {/* ====================================================
              MOBILE SIDEBAR OVERLAY
          ==================================================== */}

          {mobileSidebar && (
            <button
              type="button"
              aria-label="Tutup menu navigasi"
              onClick={closeMobileSidebar}
              className="
                fixed
                inset-0
                z-[90]
                bg-slate-950/55
                backdrop-blur-[2px]
                md:hidden
              "
            />
          )}

          {/* ====================================================
              SIDEBAR
          ==================================================== */}

          <aside
            className={`
              relative
              z-[95]
              shrink-0

              transition-all
              duration-300
              ease-out

              max-md:fixed
              max-md:left-0
              max-md:top-0
              max-md:h-full
              max-md:w-[290px]
              max-md:-translate-x-full
              max-md:shadow-2xl

              md:block

              ${
                mobileSidebar
                  ? "max-md:translate-x-0"
                  : ""
              }

              ${
                sidebarCollapsed
                  ? "md:w-[76px]"
                  : "md:w-[292px]"
              }
            `}
          >
            <div className="relative h-full">

              {/* ================================================
                  MOBILE CLOSE BUTTON
              ================================================ */}

              <button
                type="button"
                onClick={closeMobileSidebar}
                aria-label="Tutup sidebar"
                className="
                  absolute
                  right-3
                  top-3
                  z-[110]

                  flex
                  h-9
                  w-9
                  items-center
                  justify-center

                  rounded-xl
                  border
                  border-white/10
                  bg-slate-900
                  text-slate-300

                  shadow-lg

                  transition
                  hover:bg-slate-800
                  hover:text-white

                  md:hidden
                "
              >
                <X size={17} />
              </button>

              {/* ================================================
                  SIDEBAR COMPONENT
              ================================================ */}

              <div className="h-full w-full overflow-hidden">
                <Sidebar
                  collapsed={sidebarCollapsed}
                  mobileOpen={mobileSidebar}
                  onCloseMobile={closeMobileSidebar}
                  onToggle={toggleSidebar}
                />
              </div>

            </div>
          </aside>

          {/* ====================================================
              MAIN APPLICATION AREA
          ==================================================== */}

          <main
            className={`
              relative
              min-w-0
              flex-1

              ${
                isWebGIS
                  ? "overflow-hidden bg-[#07101D]"
                  : "overflow-y-auto bg-[#F4F7FB]"
              }
            `}
          >

            {/* ==================================================
                GIS MODE
            ================================================== */}

            {isWebGIS ? (
              <div
                className="
                  relative
                  h-full
                  min-h-0
                  w-full
                  overflow-hidden
                "
              >
                <Outlet />
              </div>
            ) : (

              /* =================================================
                 STANDARD ENTERPRISE PAGE MODE
              ================================================= */

              <div
                className="
                  flex
                  min-h-full
                  w-full
                  flex-col
                "
              >

                {/* ==============================================
                    PAGE WRAPPER
                ============================================== */}

                <div
                  className="
                    flex-1

                    px-3
                    py-4

                    sm:px-5
                    sm:py-5

                    lg:px-7
                    lg:py-6

                    xl:px-8
                  "
                >

                  {/* ============================================
                      BREADCRUMB
                  ============================================ */}

                  <div
                    className="
                      mb-4

                      sm:mb-5

                      lg:mb-6
                    "
                  >
                    <Breadcrumb />
                  </div>

                  {/* ============================================
                      PAGE CONTENT
                  ============================================ */}

                  <section
                    className="
                      relative

                      min-h-[calc(100vh-190px)]

                      overflow-hidden

                      rounded-2xl
                      border
                      border-slate-200/80

                      bg-white

                      shadow-[0_8px_30px_rgba(15,23,42,0.04)]
                    "
                  >
                    <div
                      className="
                        min-h-[calc(100vh-190px)]
                        w-full
                      "
                    >
                      <Outlet />
                    </div>
                  </section>

                </div>

                {/* ==============================================
                    FOOTER
                ============================================== */}

                <Footer />

              </div>
            )}

          </main>

        </div>

        {/* ======================================================
            ENTERPRISE SIDEBAR COLLAPSE BUTTON

            Hanya desktop.
            Diposisikan mengikuti sidebar.
        ====================================================== */}

        <button
          type="button"
          onClick={toggleSidebar}
          title={
            sidebarCollapsed
              ? "Buka sidebar"
              : "Ciutkan sidebar"
          }
          aria-label={
            sidebarCollapsed
              ? "Buka sidebar"
              : "Ciutkan sidebar"
          }
          className={`
            fixed
            top-[84px]

            z-[120]

            hidden
            h-8
            w-8

            items-center
            justify-center

            rounded-full

            border
            border-slate-200

            bg-white

            text-slate-500

            shadow-md

            transition-all
            duration-300

            hover:border-emerald-300
            hover:bg-emerald-50
            hover:text-emerald-600

            md:flex

            ${
              sidebarCollapsed
                ? "left-[60px]"
                : "left-[276px]"
            }
          `}
        >
          {sidebarCollapsed ? (
            <ChevronRight size={15} />
          ) : (
            <ChevronLeft size={15} />
          )}
        </button>

        {/* ======================================================
            MOBILE MENU FALLBACK

            Jika Header memiliki tombol menu sendiri,
            tombol ini tidak wajib terlihat.

            Disediakan sebagai safety UI untuk mobile.
        ====================================================== */}

        {!mobileSidebar && (
          <button
            type="button"
            onClick={toggleMobileSidebar}
            aria-label="Buka menu navigasi"
            title="Menu"
            className="
              fixed
              bottom-4
              left-4
              z-[120]

              flex
              h-11
              w-11

              items-center
              justify-center

              rounded-xl

              border
              border-slate-200

              bg-white

              text-slate-600

              shadow-lg

              transition

              hover:border-emerald-300
              hover:bg-emerald-50
              hover:text-emerald-600

              md:hidden
            "
          >
            <Menu size={19} />
          </button>
        )}

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

        {!isWebGIS && !showAI && (
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