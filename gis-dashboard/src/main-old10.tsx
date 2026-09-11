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
// DASHBOARD
// ======================================================

import Dashboard from "./views/dashboard/Dashboard";

// ======================================================
// SYSTEM
// ======================================================

import UserIndex from "./views/system/user/index";
import RoleIndex from "./views/system/role/index";
import UserAuthorization from "./views/system/user/UserAuthorization";

// ======================================================
// GIS
// ======================================================

import GisCommandCenter from "./views/gis/GisCommandCenter";
import LayerOverlay from "./views/gis/LayerOverlay";

// ======================================================
// PUBLIC FRONTEND
// ======================================================

import Kerawanan from "./kerawanan";
import Kebencanaan from "./kejadian";
import DetailKejadian from "./detailKejadian";
import TambahDataSpasial from "./TambahDataSpasial";

// ======================================================
// INVENTARISASI LOKASI KEGIATAN
// ======================================================

import LokasiKegiatan from "./LokasiKegiatan";
import LokasiSaya from "./views/gis/LokasiSaya";
import AIRecommendationEnterprise from "./views/rekomendasi/AIRecommendationEnterprise";
// ======================================================
// ROOT ELEMENT
// ======================================================

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

        {/* LOGIN */}
        <Route path="/login" element={<Login />} />

        {/* PUBLIC KERAWANAN */}
        <Route path="/kerawanan" element={<Kerawanan />} />

        {/* PUBLIC KEBENCANAAN */}
        <Route path="/kebencanaan" element={<Kebencanaan />} />

        {/* GIS PUBLISHER / TAMBAH DATA SPASIAL */}
        <Route path="/tambah-data-spasial" element={<TambahDataSpasial />} />

        {/* ADMINISTRATOR LOGIN */}
        <Route path="/administrator-sign-in" element={<Login />} />

        {/* ==================================================
            DEFAULT ROUTE
        ================================================== */}

        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* ==================================================
            PROTECTED ENTERPRISE APPLICATION
        ================================================== */}

        <Route element={<AuthGuard />}>
          {/* ==================================================
              ENTERPRISE LAYOUT
          ================================================== */}

          <Route element={<EnterpriseLayout />}>
            {/* ==================================================
                DASHBOARD
            ================================================== */}

            <Route path="/dashboard" element={<Dashboard />} />

            {/* ==================================================
                WEBGIS COMMAND CENTER
            ================================================== */}

            <Route path="/gis" element={<GisCommandCenter />} />

            {/* ==================================================
                AI RECOMMENDATION - MODUL 3.2
                Penentuan Rekomendasi Lokasi Mitigasi & Adaptasi
            ================================================== */}

            <Route
              path="/rekomendasi"
              element={<AIRecommendationEnterprise />}
            />

            {/* ==================================================
                LAYER & OVERLAY
            ================================================== */}

            <Route path="/layeroverlay" element={<LayerOverlay />} />

            {/* ==================================================
                INVENTARISASI LOKASI KEGIATAN
            ================================================== */}

            <Route path="/lokasikegiatan" element={<LokasiKegiatan />} />
            {/* ==================================================
        DETEKSI & ANALISIS KERAWANAN
    ================================================== */}
            <Route path="/lokasi-saya" element={<LokasiSaya />} />

            {/* ==================================================
                SYSTEM
            ================================================== */}

            {/* USER MANAGEMENT */}
            <Route path="/system/users" element={<UserIndex />} />

            {/* ROLE & PERMISSION */}
            <Route path="/system/roles" element={<RoleIndex />} />

            {/* USER AUTHORIZATION */}
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
