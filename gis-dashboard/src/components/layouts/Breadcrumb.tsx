import React from "react";
import {
  Link,
  useLocation,
} from "react-router-dom";

import {
  ChevronRight,
  Home,
} from "lucide-react";


// ============================================================
// LABEL ROUTE
// ============================================================

const routeLabels: Record<string, string> = {
  dashboard: "Dashboard",
  system: "System",
  users: "Users",
  kerawanan: "Kerawanan",
  bencana: "Bencana",
  mitigasi: "Mitigasi",
  adaptasi: "Adaptasi",
  gis: "GIS",
  polygon: "Polygon",
};


// ============================================================
// BREADCRUMB
// ============================================================

export default function Breadcrumb() {

  const location = useLocation();

  const pathname = location.pathname;

  const segments = pathname
    .split("/")
    .filter(Boolean);


  return (

    <nav
      className="
        flex
        items-center
        gap-2
        text-sm
        text-slate-500
      "
      aria-label="Breadcrumb"
    >

      {/* ======================================================
          HOME
      ====================================================== */}

      <Link
        to="/dashboard"
        className="
          flex
          items-center
          gap-1.5
          text-slate-500
          hover:text-blue-600
          transition
        "
      >

        <Home size={16} />

        <span>
          Home
        </span>

      </Link>


      {/* ======================================================
          SEGMENTS
      ====================================================== */}

      {segments.map((segment, index) => {

        const path =
          "/" +
          segments
            .slice(0, index + 1)
            .join("/");


        const label =
          routeLabels[segment] ||
          segment
            .replace(/-/g, " ")
            .replace(/\b\w/g, (char) =>
              char.toUpperCase()
            );


        const isLast =
          index === segments.length - 1;


        return (

          <React.Fragment
            key={path}
          >

            {/* separator */}

            <ChevronRight
              size={15}
              className="text-slate-400"
            />


            {/* breadcrumb item */}

            {isLast ? (

              <span
                className="
                  font-medium
                  text-slate-800
                "
              >
                {label}
              </span>

            ) : (

              <Link
                to={path}
                className="
                  text-slate-500
                  hover:text-blue-600
                  transition
                "
              >
                {label}
              </Link>

            )}

          </React.Fragment>

        );

      })}

    </nav>

  );

}