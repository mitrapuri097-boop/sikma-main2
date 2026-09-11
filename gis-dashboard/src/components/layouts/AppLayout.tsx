import React, { useEffect, useState } from "react";
import type { ReactNode } from "react";

import Sidebar from "./Sidebar";
import Header from "./Header";
import Footer from "./Footer";

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  // ============================================================
  // DESKTOP SIDEBAR
  // ============================================================

  /**
   * false = sidebar expanded
   * true  = sidebar collapsed
   */
  const [collapsed, setCollapsed] = useState(false);

  // ============================================================
  // MOBILE SIDEBAR
  // ============================================================

  /**
   * false = sidebar tertutup
   * true  = sidebar terbuka
   */
  const [mobileOpen, setMobileOpen] = useState(false);

  // ============================================================
  // DESKTOP SIDEBAR TOGGLE
  // ============================================================

  const toggleSidebar = () => {
    setCollapsed((prev) => !prev);
  };

  // ============================================================
  // MOBILE SIDEBAR TOGGLE
  // ============================================================

  const toggleMobileSidebar = () => {
    setMobileOpen((prev) => !prev);
  };

  // ============================================================
  // CLOSE MOBILE SIDEBAR
  // ============================================================

  const closeMobileSidebar = () => {
    setMobileOpen(false);
  };

  // ============================================================
  // RESPONSIVE
  // ============================================================

  useEffect(() => {
    const handleResize = () => {
      /*
       * Saat kembali ke desktop,
       * tutup mobile sidebar.
       */
      if (window.innerWidth >= 768) {
        setMobileOpen(false);
      }
    };

    handleResize();

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="min-h-screen w-full bg-slate-100">
      {/* ======================================================
          HEADER
      ====================================================== */}

      <Header onMenuClick={toggleMobileSidebar} />

      {/* ======================================================
          APPLICATION BODY
      ====================================================== */}

      <div className="flex min-h-[calc(100vh-70px)] w-full">
        {/* ====================================================
            SIDEBAR
        ==================================================== */}

        <Sidebar
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          onCloseMobile={closeMobileSidebar}
          onToggle={toggleSidebar}
        />

        {/* ====================================================
            CONTENT AREA
        ==================================================== */}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* ==================================================
              MAIN
          ================================================== */}

          <main
            className="
              min-w-0
              flex-1
              overflow-y-auto
              bg-[#F4F7FB]
            "
          >
            <div
              className="
                w-full
                px-3
                py-4
                sm:px-5
                sm:py-5
                lg:px-8
                lg:py-6
              "
            >
              {children}
            </div>
          </main>

          {/* ==================================================
              FOOTER
          ================================================== */}

          <Footer />
        </div>
      </div>
    </div>
  );
}
