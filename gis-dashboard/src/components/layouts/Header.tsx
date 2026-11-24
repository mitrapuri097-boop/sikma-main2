import {
  Bell,
  ChevronDown,
  Menu,
  User,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

import { useEffect, useState } from "react";

interface HeaderProps {
  /** Mobile: buka drawer navigasi. */
  onMenuClick?: () => void;
  /** Desktop: ciutkan/buka sidebar. */
  onToggleSidebar?: () => void;
  sidebarCollapsed?: boolean;
  hideMenu?: boolean;
}

interface CurrentUser {
  id?: number;
  username?: string;
  email?: string;
  full_name?: string;
  phone?: string;

  role_id?: number | null;
  role_name?: string | null;
  role_description?: string | null;

  organization_id?: number | null;
  unit_id?: number | null;

  status?: string;
  avatar?: string | null;
  last_login?: string;
}

export default function Header({
  onMenuClick,
  onToggleSidebar,
  sidebarCollapsed = false,
  hideMenu = false,
}: HeaderProps) {
  const [showProfile, setShowProfile] = useState(false);
  const [showNotification, setShowNotification] = useState(false);

  // =========================================================
  // CURRENT USER
  // =========================================================

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    const storedUser =
      localStorage.getItem("smiti_user") ||
      sessionStorage.getItem("smiti_user");

    if (!storedUser) {
      setCurrentUser(null);
      return;
    }

    try {
      const user = JSON.parse(storedUser);

      setCurrentUser(user);
    } catch (error) {
      console.error("Gagal membaca smiti_user:", error);
      setCurrentUser(null);
    }
  }, []);

  // =========================================================
  // DISPLAY USER
  // =========================================================

  const displayName = currentUser?.full_name || currentUser?.username || "User";

  const displayRole = currentUser?.role_name || "User";

  // =========================================================
  // LOGOUT
  // =========================================================

  const handleLogout = () => {
    localStorage.removeItem("smiti_token");
    localStorage.removeItem("smiti_user");

    sessionStorage.removeItem("smiti_token");
    sessionStorage.removeItem("smiti_user");

    setCurrentUser(null);
    setShowProfile(false);

    window.location.href = "/login";
  };

  return (
    <header
      className="
        h-[70px]
        min-h-[70px]
        w-full
        bg-white
        border-b
        border-slate-200
        flex
        items-center
        justify-between
        px-4
        lg:px-6
        relative
        z-[100]
      "
    >
      {/* =========================================================
          LEFT SECTION
      ========================================================= */}

      <div className="flex items-center min-w-0">
        {/* SIDEBAR TOGGLE */}
        {!hideMenu && (

        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Buka menu navigasi"
          title="Buka menu navigasi"
          className="
    flex
    h-10
    w-10
    shrink-0
    items-center
    justify-center
    rounded-lg
    text-slate-600
    transition
    hover:bg-slate-100
    hover:text-slate-900
    md:hidden
  "
        >
          <Menu size={22} />
        </button>
        )}

        {/* DESKTOP SIDEBAR TOGGLE (satu-satunya tombol ciut/buka sidebar) */}
        {!hideMenu && onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={sidebarCollapsed ? "Buka sidebar" : "Ciutkan sidebar"}
            title={sidebarCollapsed ? "Buka sidebar" : "Ciutkan sidebar"}
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 md:flex"
          >
            {sidebarCollapsed ? <PanelLeftOpen size={21} /> : <PanelLeftClose size={21} />}
          </button>
        )}

        {/* SEARCH */}

        <div
          className="
            hidden
            md:flex
            items-center
            ml-4
            w-[280px]
            lg:w-[360px]
            xl:w-[420px]
          "
        >
        </div>
      </div>

      {/* =========================================================
          RIGHT SECTION
      ========================================================= */}

      <div
        className="
          flex
          items-center
          gap-1
          sm:gap-2
        "
      >
        {/* =======================================================
            NOTIFICATION
        ======================================================= */}

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowNotification(!showNotification)}
            aria-label="Notifications"
            className="
              relative
              w-10
              h-10
              flex
              items-center
              justify-center
              rounded-xl
              text-slate-500
              hover:text-slate-900
              hover:bg-slate-100
              transition
            "
          >
            <Bell size={20} />

          </button>

          {/* NOTIFICATION DROPDOWN */}

          {showNotification && (
            <div
              className="
                absolute
                right-0
                top-12
                w-[calc(100vw-24px)]
                max-w-[320px]
                bg-white
                border
                border-slate-200
                rounded-2xl
                shadow-xl
                overflow-hidden
              "
            >
              <div
                className="
                  px-5
                  py-4
                  border-b
                  border-slate-100
                  flex
                  items-center
                  justify-between
                "
              >
                <div className="font-semibold text-slate-800">Notifikasi</div>

              </div>

              <div className="px-5 py-8 text-center text-sm text-slate-500">
                Belum ada notifikasi.
              </div>
            </div>
          )}
        </div>

        {/* =======================================================
            DIVIDER
        ======================================================= */}

        <div
          className="
            hidden
            sm:block
            h-8
            w-px
            bg-slate-200
            mx-2
          "
        />

        {/* =======================================================
            PROFILE
        ======================================================= */}

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowProfile(!showProfile)}
            className="
              flex
              items-center
              gap-3
              rounded-xl
              px-2
              py-1.5
              hover:bg-slate-50
              transition
            "
          >
            {/* AVATAR */}

            <div
              className="
                w-10
                h-10
                rounded-full
                bg-emerald-600
                text-white
                flex
                items-center
                justify-center
                shadow-sm
                shrink-0
              "
            >
              <User size={19} />
            </div>

            {/* USER INFO */}

            <div
              className="
                hidden
                sm:block
                text-left
                min-w-[100px]
              "
            >
              <div className="text-sm font-semibold text-slate-800">
                {displayName}
              </div>

              <div className="text-xs text-slate-500 mt-1">{displayRole}</div>
            </div>

            <ChevronDown
              size={16}
              className="
                hidden
                sm:block
                text-slate-400
              "
            />
          </button>

          {/* =====================================================
              PROFILE DROPDOWN
          ===================================================== */}

          {showProfile && (
            <div
              className="
                absolute
                right-0
                top-14
                w-[min(260px,calc(100vw-24px))]
                bg-white
                border
                border-slate-200
                rounded-2xl
                shadow-xl
                overflow-hidden
              "
            >
              {/* PROFILE HEADER */}

              <div
                className="
                  px-4
                  py-4
                  bg-slate-50
                  border-b
                  border-slate-200
                "
              >
                <div
                  className="
                    text-sm
                    font-semibold
                    text-slate-800
                    leading-5
                  "
                >
                  {displayName}
                </div>

                <div className="text-[11px] text-slate-500 leading-4">
                  {displayRole}
                </div>

                {currentUser?.email && (
                  <div className="text-[11px] text-slate-400 mt-1 truncate">
                    {currentUser.email}
                  </div>
                )}
              </div>

              {/* MENU */}

              <div className="p-2">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="
                    w-full
                    flex
                    items-center
                    gap-3
                    px-3
                    py-2.5
                    rounded-xl
                    text-sm
                    text-red-600
                    hover:bg-red-50
                    transition
                  "
                >
                  <LogOut size={17} />

                  <span>Keluar</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
