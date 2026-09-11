import React, { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

import {
  LayoutDashboard,
  Map,
  Layers3,
  MapPinned,
  Database,
  BrainCircuit,
  Bot,
  Waves,
  Mountain,
  Flame,
  CloudSun,
  Trees,
  ClipboardList,
  PlusCircle,
  CheckCircle2,
  FileImage,
  Navigation,
  AlertTriangle,
  ShieldCheck,
  History,
  FileBarChart,
  Users,
  Shield,
  ScrollText,
  Settings,
  Activity,
  Wrench,
  HelpCircle,
  Network,
  Code2,
  Globe2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Menu,
  X,
  Circle,
} from "lucide-react";

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onToggle?: () => void;
}

interface SubMenuItem {
  title: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
}

interface MenuItem {
  title: string;
  description?: string;
  icon: React.ElementType;
  href?: string;
  badge?: string;
  children?: SubMenuItem[];
}

/* ============================================================
   MAIN NAVIGATION
============================================================ */

const mainMenus: MenuItem[] = [
  /* ============================================================
     DASHBOARD
  ============================================================ */

  {
    title: "Dashboard Utama",
    description: "Ringkasan sistem & risiko",
    href: "/dashboard",
    icon: LayoutDashboard,
  },

  /* ============================================================
     WEBGIS & DATA SPASIAL
     Pendukung KAK 3.2, 3.3, 3.4 dan 3.7
  ============================================================ */

  {
    title: "WebGIS & Data Spasial",
    description: "Peta dan data spasial",
    icon: Map,
    children: [
      {
        title: "Peta Interaktif",
        href: "/gis",
        icon: Map,
      },
      {
        title: "Layer & Overlay",
        href: "/layeroverlay", // <-- UBAH DI SINI (Sebelumnya: "/gis/layers")
        icon: Layers3,
      },
      {
        title: "Data Administrasi",
        href: "/gis/administrasi",
        icon: Database,
      },

      {
        title: "Data DAS",
        href: "/gis/das",
        icon: Waves,
      },
      {
        title: "Peta Risiko",
        href: "/gis/risk-map",
        icon: AlertTriangle,
      },
      {
        title: "Manajemen Layer",
        href: "/gis/layer-management",
        icon: Layers3,
      },
      {
        title: "Publikasi Data Spasial",
        href: "/tambah-data-spasial",
        icon: PlusCircle,
        badge: "ADMIN",
      },
    ],
  },

  /* ============================================================
     KAK 3.2
     REKOMENDASI MITIGASI & ADAPTASI BERBASIS AI
  ============================================================ */

  {
    title: "Rekomendasi Mitigasi & Adaptasi",
    description: "Analisis spasial berbasis AI",
    icon: BrainCircuit,
    children: [
      {
        title: "Analisis Berbasis AI",
        href: "/rekomendasi",
        icon: Bot,
        badge: "AI",
      },
      {
        title: "Analisis Banjir",
        href: "/rekomendasi/banjir",
        icon: Waves,
      },
      {
        title: "Analisis Longsor",
        href: "/rekomendasi/longsor",
        icon: Mountain,
      },
      {
        title: "Analisis Karhutla",
        href: "/rekomendasi/karhutla",
        icon: Flame,
      },
      {
        title: "Analisis Kekeringan",
        href: "/rekomendasi/kekeringan",
        icon: CloudSun,
      },
      {
        title: "Analisis Spasial",
        href: "/rekomendasi/spasial",
        icon: MapPinned,
      },
      {
        title: "Peta Rekomendasi",
        href: "/rekomendasi/peta",
        icon: MapPinned,
      },
    ],
  },

  /* ============================================================
     KAK 3.3
     INVENTARISASI & PEMETAAN LOKASI KEGIATAN
  ============================================================ */

  {
    title: "Inventarisasi Lokasi Kegiatan",
    description: "Data kegiatan mitigasi & adaptasi",
    icon: Trees,
    children: [
      {
        title: "Data Lokasi Kegiatan",
        href: "/lokasi",
        icon: ClipboardList,
      },
      {
        title: "Tambah Lokasi",
        href: "/lokasi/tambah",
        icon: PlusCircle,
      },
      {
        title: "Pemetaan Lokasi",
        href: "/lokasi/peta",
        icon: MapPinned,
      },
      {
        title: "Verifikasi Lokasi",
        href: "/lokasi/verifikasi",
        icon: CheckCircle2,
      },
      {
        title: "Dokumentasi Kegiatan",
        href: "/lokasi/dokumentasi",
        icon: FileImage,
      },
      {
        title: "Import Data",
        href: "/lokasi/import",
        icon: Database,
      },
    ],
  },

  /* ============================================================
     KAK 3.4
     GPS & ANALISIS KERAWANAN
  ============================================================ */

  {
    title: "Deteksi & Analisis Kerawanan",
    description: "GPS dan status risiko lokasi",
    icon: AlertTriangle,
    children: [
      {
        title: "Cek Lokasi Saya",
        href: "/kerawanan",
        icon: Navigation,
        badge: "GPS",
      },
      {
        title: "Deteksi GPS",
        href: "/kerawanan/gps",
        icon: MapPinned,
      },
      {
        title: "Status Kerawanan",
        href: "/kerawanan/status",
        icon: ShieldCheck,
      },
      {
        title: "Analisis Risiko",
        href: "/kerawanan/analisis",
        icon: Activity,
      },
      {
        title: "Peta Kerawanan",
        href: "/kerawanan/peta",
        icon: AlertTriangle,
      },
      {
        title: "Historis Kerawanan",
        href: "/kerawanan/historis",
        icon: History,
      },
    ],
  },

  /* ============================================================
     KAK 3.5
     PELAPORAN DATA SIMITI
  ============================================================ */

  {
    title: "Pelaporan",
    description: "Laporan dan ekspor data",
    icon: FileBarChart,
    children: [
      {
        title: "Dashboard Laporan",
        href: "/laporan",
        icon: FileBarChart,
      },
      {
        title: "Laporan Pengguna",
        href: "/laporan/pengguna",
        icon: Users,
      },
      {
        title: "Laporan Lokasi Rawan",
        href: "/laporan/kerawanan",
        icon: AlertTriangle,
      },
      {
        title: "Laporan Mitigasi & Adaptasi",
        href: "/laporan/mitigasi",
        icon: Trees,
      },
      {
        title: "Laporan Kejadian Bencana",
        href: "/laporan/kejadian",
        icon: Activity,
      },
      {
        title: "Export PDF / Excel",
        href: "/laporan/export",
        icon: FileBarChart,
      },
    ],
  },

  /* ============================================================
     KAK 3.6
     INTEROPERABILITAS DATA
  ============================================================ */

  {
    title: "Interoperabilitas Data",
    description: "Integrasi dan pertukaran data",
    icon: Network,
    children: [
      {
        title: "API & REST",
        href: "/interoperabilitas/api",
        icon: Code2,
      },
      {
        title: "GeoJSON",
        href: "/interoperabilitas/geojson",
        icon: Globe2,
      },
      {
        title: "WMS",
        href: "/interoperabilitas/wms",
        icon: Layers3,
      },
      {
        title: "WFS",
        href: "/interoperabilitas/wfs",
        icon: Layers3,
      },
      {
        title: "Integrasi BMKG",
        href: "/interoperabilitas/bmkg",
        icon: CloudSun,
      },
      {
        title: "Integrasi BNPB",
        href: "/interoperabilitas/bnpb",
        icon: Shield,
      },
      {
        title: "Integrasi SIGAP",
        href: "/interoperabilitas/sigap",
        icon: Network,
      },
      {
        title: "Integrasi TMA",
        href: "/interoperabilitas/tma",
        icon: Database,
      },
      {
        title: "Log Sinkronisasi",
        href: "/interoperabilitas/log",
        icon: RefreshCw,
      },
    ],
  },
];

/* ============================================================
   SYSTEM ADMINISTRATION
============================================================ */

const systemMenus: MenuItem[] = [
  {
    title: "Administrasi Sistem",
    description: "Hak akses, keamanan & konfigurasi",
    icon: Settings,
    children: [
      {
        title: "User Management",
        href: "/system/users",
        icon: Users,
      },
      {
        title: "Role & Permission",
        href: "/system/roles",
        icon: Shield,
      },
      {
        title: "Audit Log",
        href: "/system/audit-log",
        icon: ScrollText,
      },
      {
        title: "Master Data",
        href: "/master-data",
        icon: Database,
      },
      {
        title: "System Health",
        href: "/system/health",
        icon: Activity,
      },
      {
        title: "Maintenance",
        href: "/system/maintenance",
        icon: Wrench,
      },
      {
        title: "Bantuan & Panduan",
        href: "/bantuan",
        icon: HelpCircle,
      },
    ],
  },
];

/* ============================================================
   COMPONENT
============================================================ */

export default function Sidebar({
  collapsed,
  mobileOpen,
  onCloseMobile,
  onToggle,
}: SidebarProps) {
  const location = useLocation();

  /*
   * Desktop:
   * collapsed mengikuti state sidebar.
   *
   * Mobile:
   * sidebar selalu expanded ketika dibuka.
   */
  const effectiveCollapsed = mobileOpen ? false : collapsed;

  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  /* ==========================================================
     AUTO OPEN ACTIVE PARENT
  ========================================================== */

  useEffect(() => {
    const menus = [...mainMenus, ...systemMenus];

    const activeParents: Record<string, boolean> = {};

    menus.forEach((menu) => {
      if (
        menu.children?.some(
          (child) =>
            location.pathname === child.href ||
            location.pathname.startsWith(`${child.href}/`),
        )
      ) {
        activeParents[menu.title] = true;
      }
    });

    setOpenMenus((prev) => ({
      ...prev,
      ...activeParents,
    }));
  }, [location.pathname]);

  /* ==========================================================
     TOGGLE PARENT
  ========================================================== */

  const toggleMenu = (title: string) => {
    setOpenMenus((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  /* ==========================================================
     SUBMENU
  ========================================================== */

  const renderSubMenu = (parent: MenuItem, children: SubMenuItem[]) => {
    const isOpen = openMenus[parent.title];

    return (
      <div className="relative">
        {/* ==================================================
            PARENT MENU
        ================================================== */}

        <button
          type="button"
          onClick={() => toggleMenu(parent.title)}
          title={effectiveCollapsed ? parent.title : undefined}
          aria-expanded={isOpen}
          className={`
            group
            relative
            flex
            w-full
            items-center
            gap-3
            rounded-xl
            px-3
            py-2.5
            text-left
            transition-all
            duration-200
            outline-none

            ${
              isOpen
                ? `
                  bg-emerald-500/[0.09]
                  text-white
                  ring-1
                  ring-emerald-500/[0.12]
                `
                : `
                  text-slate-200
                  hover:bg-slate-800/80
                  hover:text-white
                `
            }

            ${effectiveCollapsed ? "justify-center" : ""}
          `}
        >
          {/* ACTIVE ACCENT */}

          {isOpen && !effectiveCollapsed && (
            <span
              className="
                absolute
                left-0
                top-1/2
                h-8
                w-1
                -translate-y-1/2
                rounded-r-full
                bg-emerald-400
                shadow-lg
                shadow-emerald-500/30
              "
            />
          )}

          {/* ICON */}

          <span
            className={`
              flex
              h-9
              w-9
              shrink-0
              items-center
              justify-center
              rounded-lg
              transition-all
              duration-200

              ${
                isOpen
                  ? `
                    bg-emerald-500
                    text-white
                    shadow-lg
                    shadow-emerald-900/40
                  `
                  : `
                    bg-slate-800/90
                    text-slate-300
                    group-hover:bg-emerald-600
                    group-hover:text-white
                  `
              }
            `}
          >
            <parent.icon size={18} strokeWidth={1.9} />
          </span>

          {!effectiveCollapsed && (
            <>
              {/* TEXT */}

              <span className="min-w-0 flex-1 pr-1">
                <span
                  className="
                    block
                    truncate
                    text-[13.5px]
                    font-semibold
                    leading-tight
                    tracking-[0.01em]
                    text-white
                  "
                >
                  {parent.title}
                </span>

                {parent.description && (
                  <span
                    className="
                      mt-1
                      block
                      truncate
                      text-[10.5px]
                      font-medium
                      leading-tight
                      text-slate-300
                    "
                  >
                    {parent.description}
                  </span>
                )}
              </span>

              {/* BADGE */}

              {parent.badge && (
                <span
                  className="
                    rounded-md
                    border
                    border-emerald-400/20
                    bg-emerald-500/15
                    px-1.5
                    py-0.5
                    text-[9px]
                    font-bold
                    text-emerald-300
                  "
                >
                  {parent.badge}
                </span>
              )}

              {/* CHEVRON */}

              <ChevronDown
                size={15}
                strokeWidth={2}
                className={`
                  shrink-0
                  text-slate-400
                  transition-transform
                  duration-200

                  ${
                    isOpen
                      ? "rotate-180 text-emerald-300"
                      : "group-hover:text-white"
                  }
                `}
              />
            </>
          )}

          {/* ==================================================
              COLLAPSED TOOLTIP
          ================================================== */}

          {effectiveCollapsed && (
            <span
              className="
                pointer-events-none
                absolute
                left-full
                top-1/2
                z-[100]
                ml-3
                -translate-y-1/2
                whitespace-nowrap
                rounded-lg
                border
                border-slate-700
                bg-slate-950
                px-3
                py-2
                text-xs
                font-semibold
                text-white
                opacity-0
                shadow-2xl
                transition-all
                duration-200
                group-hover:opacity-100
              "
            >
              {parent.title}
            </span>
          )}
        </button>

        {/* ==================================================
            CHILDREN
        ================================================== */}

        {!effectiveCollapsed && isOpen && (
          <div className="relative ml-[22px] mt-1 pl-7">
            {/* TREE LINE */}

            <div
              className="
                absolute
                bottom-3
                left-[10px]
                top-0
                w-px
                bg-slate-600/70
              "
            />

            <div className="space-y-0.5">
              {children.map((item) => {
                const Icon = item.icon;

                return (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    onClick={onCloseMobile}
                    className={({ isActive }) => `
  group
  relative
  flex
  min-h-[40px]
  items-center
  gap-3
  rounded-lg
  px-3
  text-[12.5px]
  font-medium
  no-underline
  transition-all
  duration-200
  outline-none

  ${
    isActive
      ? `
        bg-emerald-500/15
        font-semibold
        !text-emerald-300
        !no-underline
        shadow-sm
        ring-1
        ring-emerald-500/10
      `
      : `
        !text-slate-300
        !no-underline
        hover:bg-slate-800/80
        hover:!text-white
      `
  }
`}
                  >
                    {({ isActive }) => (
                      <>
                        {/* TREE NODE */}

                        <span
                          className={`
                            absolute
                            -left-[21px]
                            top-1/2
                            h-2
                            w-2
                            -translate-y-1/2
                            rounded-full
                            border-2
                            transition-all
                            duration-200

                            ${
                              isActive
                                ? `
                                  border-emerald-300
                                  bg-emerald-300
                                  shadow-md
                                  shadow-emerald-500/50
                                `
                                : `
                                  border-slate-500
                                  bg-[#0B1220]
                                  group-hover:border-emerald-400
                                  group-hover:bg-emerald-400
                                `
                            }
                          `}
                        />

                        {/* ICON */}

                        <Icon
                          size={16}
                          strokeWidth={1.8}
                          className={`
                            shrink-0
                            transition-colors
                            duration-200

                            ${
                              isActive
                                ? "text-emerald-300"
                                : "text-slate-300 group-hover:text-white"
                            }
                          `}
                        />

                        {/* LABEL */}

                        <span className="min-w-0 flex-1 truncate">
                          {item.title}
                        </span>

                        {/* BADGE */}

                        {item.badge && (
                          <span
                            className={`
                              rounded-md
                              border
                              px-1.5
                              py-0.5
                              text-[8px]
                              font-bold
                              tracking-wide

                              ${
                                item.badge === "AI"
                                  ? `
                                    border-violet-400/20
                                    bg-violet-500/15
                                    text-violet-300
                                  `
                                  : `
                                    border-amber-400/20
                                    bg-amber-500/15
                                    text-amber-300
                                  `
                              }
                            `}
                          >
                            {item.badge}
                          </span>
                        )}

                        {/* ACTIVE DOT */}

                        {isActive && (
                          <Circle
                            size={5}
                            fill="currentColor"
                            className="shrink-0 text-emerald-300"
                          />
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ==========================================================
     SINGLE MENU
  ========================================================== */

  const renderMenu = (menu: MenuItem) => {
    if (menu.children) {
      return (
        <React.Fragment key={menu.title}>
          {renderSubMenu(menu, menu.children)}
        </React.Fragment>
      );
    }

    const Icon = menu.icon;

    return (
      <NavLink
        key={menu.href}
        to={menu.href || "#"}
        onClick={onCloseMobile}
        title={effectiveCollapsed ? menu.title : undefined}
        className={({ isActive }) => `
          group
          relative
          flex
          min-h-[44px]
          items-center
          gap-3
          rounded-xl
          px-3
          text-[13px]
          font-semibold
          transition-all
          duration-200
          outline-none
          !no-underline
          ${
            isActive
              ? `
                bg-emerald-500/15
                text-white
                shadow-sm
                ring-1
                ring-emerald-500/10
              `
              : `
                text-slate-200
                hover:bg-slate-800/80
                hover:text-white
              `
          }

          ${effectiveCollapsed ? "justify-center" : ""}
        `}
      >
        {({ isActive }) => (
          <>
            {/* ACTIVE BAR */}

            {isActive && !effectiveCollapsed && (
              <span
                className="
                  absolute
                  left-0
                  top-1/2
                  h-7
                  w-1
                  -translate-y-1/2
                  rounded-r-full
                  bg-emerald-400
                  shadow-lg
                  shadow-emerald-500/30
                "
              />
            )}

            {/* ICON */}

            <span
              className={`
                flex
                h-9
                w-9
                shrink-0
                items-center
                justify-center
                rounded-lg
                transition-all
                duration-200

                ${
                  isActive
                    ? `
                      bg-emerald-500
                      text-white
                      shadow-lg
                      shadow-emerald-900/40
                    `
                    : `
                      bg-slate-800/90
                      text-slate-300
                      group-hover:bg-emerald-600
                      group-hover:text-white
                    `
                }
              `}
            >
              <Icon size={18} strokeWidth={1.9} />
            </span>

            {/* LABEL */}

            {!effectiveCollapsed && (
              <span className="min-w-0 flex-1 truncate text-left">
                {menu.title}
              </span>
            )}

            {/* COLLAPSED TOOLTIP */}

            {effectiveCollapsed && (
              <span
                className="
                  pointer-events-none
                  absolute
                  left-full
                  top-1/2
                  z-[100]
                  ml-3
                  -translate-y-1/2
                  whitespace-nowrap
                  rounded-lg
                  border
                  border-slate-700
                  bg-slate-950
                  px-3
                  py-2
                  text-xs
                  font-semibold
                  text-white
                  opacity-0
                  shadow-2xl
                  transition-all
                  duration-200
                  group-hover:opacity-100
                "
              >
                {menu.title}
              </span>
            )}
          </>
        )}
      </NavLink>
    );
  };

  /* ==========================================================
     RENDER
  ========================================================== */

  return (
    <>
      {/* ======================================================
          MOBILE OVERLAY
      ====================================================== */}

      {mobileOpen && (
        <div
          className="
            fixed
            inset-0
            z-40
            bg-slate-950/70
            backdrop-blur-[3px]
            md:hidden
          "
          onClick={onCloseMobile}
        />
      )}

      {/* ======================================================
          SIDEBAR
      ====================================================== */}

      <aside
        className={`
          fixed
          left-0
          top-0
          z-50
          flex
          h-screen
          flex-col
          overflow-hidden
          border-r
          border-slate-800
          bg-[#0B1220]
          text-white
          shadow-2xl
          transition-all
          duration-300
          ease-in-out

          md:relative

          ${collapsed ? "md:w-[82px]" : "md:w-[292px]"}

          ${mobileOpen ? "w-[292px]" : "-left-[292px] md:left-0"}
        `}
      >
        {/* ====================================================
            BRAND
        ==================================================== */}

        <div
          className={`
            relative
            flex
            h-[76px]
            shrink-0
            items-center
            border-b
            border-slate-800
            ${
              effectiveCollapsed
                ? "justify-center px-3"
                : "justify-between px-4"
            }
          `}
        >
          {/* BRAND */}

          <div
            className={`
              flex
              items-center
              ${effectiveCollapsed ? "justify-center" : "gap-3"}
            `}
          >
            {/* LOGO */}

            <div
              className="
                relative
                flex
                h-11
                w-11
                shrink-0
                items-center
                justify-center
                overflow-hidden
                rounded-xl
                bg-gradient-to-br
                from-emerald-400
                via-emerald-600
                to-emerald-800
                shadow-lg
                shadow-emerald-950/40
              "
            >
              <div
                className="
                  absolute
                  inset-0
                  bg-white/10
                "
              />

              <Trees
                size={23}
                strokeWidth={2}
                className="relative text-white"
              />
            </div>

            {!effectiveCollapsed && (
              <div className="min-w-0">
                <div
                  className="
                    truncate
                    text-[17px]
                    font-extrabold
                    tracking-[0.08em]
                    text-white
                  "
                >
                  SIMITI
                </div>

                <div
                  className="
                    mt-0.5
                    truncate
                    text-[9px]
                    font-semibold
                    uppercase
                    tracking-[0.22em]
                    text-slate-400
                  "
                >
                  Enterprise GIS
                </div>
              </div>
            )}
          </div>

          {/* MOBILE CLOSE */}

          {mobileOpen && (
            <button
              type="button"
              onClick={onCloseMobile}
              title="Tutup menu"
              className="
                flex
                h-8
                w-8
                items-center
                justify-center
                rounded-lg
                text-slate-400
                transition
                hover:bg-slate-800
                hover:text-white
                md:hidden
              "
            >
              <X size={17} />
            </button>
          )}

          {/* DESKTOP COLLAPSE */}

          {!collapsed && onToggle && (
            <button
              type="button"
              onClick={onToggle}
              title="Collapse Sidebar"
              className="
                hidden
                h-8
                w-8
                items-center
                justify-center
                rounded-lg
                text-slate-400
                transition-all
                hover:bg-slate-800
                hover:text-white
                md:flex
              "
            >
              <ChevronLeft size={17} />
            </button>
          )}

          {/* EXPAND */}

          {collapsed && onToggle && (
            <button
              type="button"
              onClick={onToggle}
              title="Expand Sidebar"
              className="
                absolute
                -right-3
                top-6
                z-50
                hidden
                h-7
                w-7
                items-center
                justify-center
                rounded-full
                border
                border-slate-700
                bg-slate-900
                text-slate-300
                shadow-xl
                transition
                hover:border-emerald-500/40
                hover:text-white
                md:flex
              "
            >
              <ChevronRight size={14} />
            </button>
          )}
        </div>

        {/* ====================================================
            NAVIGATION
        ==================================================== */}

        <nav
          className="
            flex-1
            overflow-y-auto
            overflow-x-hidden
            px-2.5
            py-4

            scrollbar-thin
            scrollbar-track-transparent
            scrollbar-thumb-slate-700
          "
        >
          {/* MAIN SECTION */}

          {!effectiveCollapsed && (
            <div
              className="
                mb-2
                px-3
                text-[9px]
                font-bold
                uppercase
                tracking-[0.22em]
                text-slate-400
              "
            >
              Main Navigation
            </div>
          )}

          <div className="space-y-1">{mainMenus.map(renderMenu)}</div>

          {/* SEPARATOR */}

          <div className="my-4 px-3">
            <div className="h-px bg-gradient-to-r from-slate-800 via-slate-700 to-transparent" />
          </div>

          {/* SYSTEM SECTION */}

          {!effectiveCollapsed && (
            <div
              className="
                mb-2
                px-3
                text-[9px]
                font-bold
                uppercase
                tracking-[0.22em]
                text-slate-400
              "
            >
              System Administration
            </div>
          )}

          <div className="space-y-1">{systemMenus.map(renderMenu)}</div>
        </nav>

        {/* ====================================================
            FOOTER STATUS
        ==================================================== */}

        <div
          className="
            shrink-0
            border-t
            border-slate-800
            p-2.5
          "
        >
          {!effectiveCollapsed ? (
            <div
              className="
                rounded-xl
                border
                border-slate-800
                bg-gradient-to-br
                from-slate-900
                to-slate-950
                px-3.5
                py-3
                shadow-inner
              "
            >
              <div className="flex items-center gap-3">
                {/* STATUS ICON */}

                <div
                  className="
                    flex
                    h-8
                    w-8
                    shrink-0
                    items-center
                    justify-center
                    rounded-lg
                    border
                    border-emerald-400/10
                    bg-emerald-500/10
                    text-emerald-300
                  "
                >
                  <ShieldCheck size={16} strokeWidth={2} />
                </div>

                {/* STATUS TEXT */}

                <div className="min-w-0 flex-1">
                  <div
                    className="
                      truncate
                      text-[11px]
                      font-semibold
                      text-slate-100
                    "
                  >
                    SIMITI Enterprise
                  </div>

                  <div
                    className="
                      mt-0.5
                      truncate
                      text-[9px]
                      font-medium
                      text-slate-400
                    "
                  >
                    Disaster Mitigation Platform
                  </div>
                </div>

                {/* ONLINE */}

                <div
                  className="
                    flex
                    items-center
                    gap-1.5
                  "
                  title="System Online"
                >
                  <span
                    className="
                      h-2
                      w-2
                      rounded-full
                      bg-emerald-400
                      shadow-md
                      shadow-emerald-400/50
                    "
                  />

                  <span
                    className="
                      text-[8px]
                      font-bold
                      uppercase
                      tracking-wide
                      text-emerald-400
                    "
                  >
                    Online
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div
              className="
                flex
                justify-center
                py-2
              "
              title="System Online"
            >
              <span
                className="
                  h-2.5
                  w-2.5
                  rounded-full
                  bg-emerald-400
                  shadow-md
                  shadow-emerald-400/50
                "
              />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
