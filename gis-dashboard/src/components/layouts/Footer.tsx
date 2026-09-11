import React from "react";
import { Link } from "react-router-dom";
import {
  Github,
  Globe,
  Mail,
  ShieldCheck,
} from "lucide-react";

export default function Footer() {
  return (
    <footer className="mt-8 border-t border-slate-200 bg-white">

      <div className="px-8 py-6">

        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">

          {/* =====================================================
              BRAND
          ===================================================== */}

          <div className="flex items-center gap-3">

            <div
              className="
                flex
                h-10
                w-10
                items-center
                justify-center
                rounded-xl
                bg-blue-600
                text-white
              "
            >
              <ShieldCheck size={22} />
            </div>

            <div>

              <div className="font-semibold text-slate-800">
                SIMITI
              </div>

              <div className="text-xs text-slate-500">
                Sistem Informasi Mitigasi dan Adaptasi
              </div>

            </div>

          </div>

          {/* =====================================================
              LINKS
          ===================================================== */}

          <div className="flex flex-wrap items-center gap-5 text-sm">

            <Link
              to="/dashboard"
              className="
                text-slate-500
                hover:text-blue-600
                transition
              "
            >
              Dashboard
            </Link>

            <Link
              to="/system/users"
              className="
                text-slate-500
                hover:text-blue-600
                transition
              "
            >
              Users
            </Link>

            <Link
              to="/kerawanan"
              className="
                text-slate-500
                hover:text-blue-600
                transition
              "
            >
              Kerawanan
            </Link>

          </div>

          {/* =====================================================
              CONTACT / SOCIAL
          ===================================================== */}

          <div className="flex items-center gap-3">

            <a
              href="mailto:info@simitigasi.id"
              className="
                flex
                h-9
                w-9
                items-center
                justify-center
                rounded-lg
                border
                border-slate-200
                text-slate-500
                hover:bg-blue-600
                hover:text-white
                transition
              "
              title="Email"
            >
              <Mail size={17} />
            </a>

            <a
              href="#"
              className="
                flex
                h-9
                w-9
                items-center
                justify-center
                rounded-lg
                border
                border-slate-200
                text-slate-500
                hover:bg-blue-600
                hover:text-white
                transition
              "
              title="Website"
            >
              <Globe size={17} />
            </a>

            <a
              href="#"
              className="
                flex
                h-9
                w-9
                items-center
                justify-center
                rounded-lg
                border
                border-slate-200
                text-slate-500
                hover:bg-blue-600
                hover:text-white
                transition
              "
              title="GitHub"
            >
              <Github size={17} />
            </a>

          </div>

        </div>

        {/* =====================================================
            COPYRIGHT
        ===================================================== */}

        <div
          className="
            mt-6
            border-t
            border-slate-100
            pt-4
            text-center
            text-xs
            text-slate-400
          "
        >
          © {new Date().getFullYear()} SIMITI. All rights reserved.
        </div>

      </div>

    </footer>
  );
}