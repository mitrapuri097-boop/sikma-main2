import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

// ======================================================
// CORE UI
// ======================================================

import "@coreui/coreui/dist/css/coreui.min.css";
import "./index.css";

// ======================================================
// LAYOUT
// ======================================================

import EnterpriseLayout from "./components/layouts/EnterpriseLayout";

// ======================================================
// AUTH
// ======================================================

import Login from "./views/auth/Login";
import AuthGuard from "./components/auth/AuthGuard";

// ======================================================
// REKOMENDASI AI
// ======================================================

import AIRecommendationEnterprise from "./views/rekomendasi/AIRecommendationEnterprise";

// ======================================================
// DASHBOARD
// ======================================================

import Dashboard from "./views/dashboard/Dashboard";

// ======================================================
// SYSTEM
// ======================================================

import UserIndex from "./views/system/user/index";
import UserManagement from "./views/system/user/UserManagement";
import RoleIndex from "./views/system/role/index";
import UserAuthorization from "./views/system/user/UserAuthorization";

// ======================================================
// EWS
// ======================================================

import EwsBanjir from "./views/ews/EwsBanjir";

// ======================================================
// GIS
// ======================================================

import GisCommandCenter from "./views/gis/GisCommandCenter";
import LayerOverlay from "./views/gis/LayerOverlay";
import LokasiSaya from "./views/gis/LokasiSaya";

// ======================================================
// PUBLIC
// ======================================================

import Kerawanan from "./kerawanan";
import Kebencanaan from "./kejadian";
import DetailKejadian from "./detailKejadian";

// ======================================================
// SPATIAL DATA
// ======================================================

import TambahDataSpasial from "./TambahDataSpasial";

// ======================================================
// INVENTARISASI LOKASI KEGIATAN
// ======================================================

import Kejadian from "./Kejadian";
import Lokasi from "./lokasi/Lokasi";
import TambahLokasi from "./lokasi/TambahLokasi";

// ======================================================
// ROOT ELEMENT
// ======================================================

import IntegrationHub from "./IntegrationHub";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root tidak ditemukan.");
}

// ======================================================
// APPLICATION
// ======================================================

createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* ==================================================
            PUBLIC ROUTES
        ================================================== */}

        <Route path="/login" element={<Login />} />

        <Route path="/kerawanan" element={<Kerawanan />} />

        <Route path="/ews/banjir" element={<EwsBanjir />} />

        <Route path="/administrator-sign-in" element={<Login />} />

        {/* ==================================================
            DEFAULT
        ================================================== */}

        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* ==================================================
            PROTECTED ENTERPRISE APPLICATION
        ================================================== */}

        <Route element={<AuthGuard />}>
          <Route element={<EnterpriseLayout />}>
            {/* ==================================================
                DASHBOARD
            ================================================== */}

            <Route path="/dashboard" element={<Dashboard />} />

            {/* ==================================================
                DATA KEBENCANAAN
            ================================================== */}

            <Route path="/kebencanaan" element={<Kebencanaan />} />
            <Route path="/kejadian" element={<Kejadian />} />

            {/* ==================================================
                WEBGIS COMMAND CENTER
            ================================================== */}

            <Route path="/gis" element={<GisCommandCenter />} />

            {/* ==================================================
                LAYER & OVERLAY
            ================================================== */}

            <Route path="/gis/layeroverlay" element={<LayerOverlay />} />

            <Route path="/layeroverlay" element={<LayerOverlay />} />

            {/* ==================================================
                LOKASI SAYA / GPS
            ================================================== */}

            <Route path="/gis/lokasi-saya" element={<LokasiSaya />} />

            <Route path="/lokasi-saya" element={<LokasiSaya />} />

            <Route path="/lokasi/tambah" element={<TambahLokasi />} />

            {/* ==================================================
                TAMBAH DATA DI PETA
            ================================================== */}

            <Route path="/gis/add-data" element={<TambahDataSpasial />} />

            <Route
              path="/tambah-data-spasial"
              element={<TambahDataSpasial />}
            />

            {/* ==================================================
                INVENTARISASI LOKASI KEGIATAN
            ================================================== */}

            {/* Dashboard / daftar lokasi */}
            <Route path="/lokasi" element={<Lokasi />} />

            {/* Tambah lokasi */}
            <Route path="/lokasi/tambah" element={<Lokasi />} />

            {/* Pemetaan lokasi */}
            <Route path="/lokasi/peta" element={<Lokasi />} />

            {/* Verifikasi lokasi */}
            <Route path="/lokasi/verifikasi" element={<Lokasi />} />

            {/* Dokumentasi kegiatan */}
            <Route path="/lokasi/dokumentasi" element={<Lokasi />} />

            {/* Import data */}
            <Route path="/lokasi/import" element={<Lokasi />} />

            {/* Backward compatibility */}
            <Route path="/lokasikegiatan" element={<Lokasi />} />

            {/* ==================================================
                REKOMENDASI MITIGASI & ADAPTASI
            ================================================== */}

            <Route
              path="/rekomendasi"
              element={<AIRecommendationEnterprise />}
            />

            <Route path="/interoperabilitas" element={<IntegrationHub />} />

            {/* ==================================================
                SYSTEM ADMINISTRATION
            ================================================== */}

            <Route path="/system/users" element={<UserManagement />} />

            <Route path="/system/users/directory" element={<UserIndex />} />

            <Route path="/system/roles" element={<RoleIndex />} />

            <Route
              path="/system/user-authorization"
              element={<UserAuthorization />}
            />
          </Route>
        </Route>

        {/* ==================================================
            DETAIL KEJADIAN
        ================================================== */}

        <Route path="/detail-kejadian/:id" element={<DetailKejadian />} />

        {/* ==================================================
            404 / FALLBACK
        ================================================== */}

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
