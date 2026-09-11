import {
  Bell,
  ChevronDown,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  User,
  LogOut,
  CircleHelp,
} from "lucide-react";

import { useEffect, useState } from "react";

interface HeaderProps {
  onMenuClick?: () => void;
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

export default function Header({ onMenuClick }: HeaderProps) {
  const [dark, setDark] = useState(false);
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

      console.log("Current SIMITI User:", user);

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
            HELP
        ======================================================= */}

        <button
          type="button"
          aria-label="Help"
          className="
            hidden
            lg:flex
            w-10
            h-10
            items-center
            justify-center
            rounded-xl
            text-slate-500
            hover:text-slate-900
            hover:bg-slate-100
            transition
          "
        >
          <CircleHelp size={20} />
        </button>

        {/* =======================================================
            THEME
        ======================================================= */}

        <button
          type="button"
          onClick={() => setDark(!dark)}
          aria-label="Toggle theme"
          className="
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
          {dark ? <Sun size={20} /> : <Moon size={20} />}
        </button>

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

            <span
              className="
                absolute
                top-[8px]
                right-[8px]
                w-2
                h-2
                rounded-full
                bg-red-500
                ring-2
                ring-white
              "
            />
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

                <span
                  className="
                    text-xs
                    font-medium
                    text-emerald-600
                  "
                >
                  1 baru
                </span>
              </div>

              <div className="p-4">
                <div
                  className="
                    flex
                    gap-3
                    p-3
                    rounded-xl
                    bg-slate-50
                  "
                >
                  <div
                    className="
                      w-9
                      h-9
                      rounded-lg
                      bg-emerald-100
                      text-emerald-600
                      flex
                      items-center
                      justify-center
                      shrink-0
                    "
                  >
                    <Bell size={17} />
                  </div>

                  <div>
                    <div className="text-sm font-medium text-slate-800">
                      Sistem siap digunakan
                    </div>

                    <div className="text-xs text-slate-500 mt-1">
                      Selamat datang di SIMITI Enterprise GIS.
                    </div>
                  </div>
                </div>
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
                  className="
                    w-full
                    flex
                    items-center
                    gap-3
                    px-3
                    py-2.5
                    rounded-xl
                    text-sm
                    text-slate-600
                    hover:bg-slate-100
                    hover:text-slate-900
                    transition
                  "
                >
                  <User size={17} />

                  <span>Profil Saya</span>
                </button>

                <button
                  type="button"
                  className="
                    w-full
                    flex
                    items-center
                    gap-3
                    px-3
                    py-2.5
                    rounded-xl
                    text-sm
                    text-slate-600
                    hover:bg-slate-100
                    hover:text-slate-900
                    transition
                  "
                >
                  <Settings size={17} />

                  <span>Pengaturan</span>
                </button>

                <div className="my-2 border-t border-slate-100" />

                {/* LOGOUT */}

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
