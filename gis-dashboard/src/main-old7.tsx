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
import RegistrasiInstansi from "./RegistrasiInstansi";

// ======================================================
// DASHBOARD
// ======================================================
import Dashboard from "./views/dashboard/Dashboard";

// ======================================================
// SYSTEM
// ======================================================
import UserIndex from "./views/system/user/index";
import RoleIndex from "./views/system/role/index";

// ======================================================
// GIS
// ======================================================
import GisCommandCenter from "./views/gis/GisCommandCenter";
import LayerOverlay from "./views/gis/LayerOverlay";

// ======================================================
// FRONTEND / GIS PUBLIC
// ======================================================
import Kerawanan from "./Kerawanan";
import DetailKejadian from "./detailKejadian";
import TambahDataSpasial from "./TambahDataSpasial";
import MitigasiAdaptasi from "./MitigasiAdaptasi";
import Kejadian from "./kejadian";

// ======================================================
// INVENTARISASI LOKASI KEGIATAN
// ======================================================
import LokasiKegiatan from "./LokasiKegiatan";

// ======================================================
// DETEKSI & ANALISIS KERAWANAN
// ======================================================
import LokasiSaya from "./views/gis/LokasiSaya";

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
            Tidak membutuhkan login
        ================================================== */}

        {/* LOGIN */}
        <Route
          path="/login"
          element={<Login />}
        />

        {/* REGISTRASI MEMBER INSTANSI */}
        <Route
          path="/registrasi-instansi"
          element={<RegistrasiInstansi />}
        />

        {/* PUBLIC KERAWANAN */}
        <Route
          path="/kerawanan"
          element={<Kerawanan />}
        />

        {/* ==================================================
            DATA KEBENCANAAN
            Public: tidak melalui AuthGuard
        ================================================== */}

        <Route
          path="/kebencanaan"
          element={<Kejadian />}
        />

        <Route
          path="/kejadian"
          element={<Kejadian />}
        />

        <Route
          path="/kejadian/:id"
          element={<DetailKejadian />}
        />

        {/* ==================================================
            GIS PUBLISHER / TAMBAH DATA SPASIAL
        ================================================== */}

        <Route
          path="/tambah-data-spasial"
          element={<TambahDataSpasial />}
        />

        {/* ==================================================
            ADMINISTRATOR SIGN-IN
        ================================================== */}

        <Route
          path="/administrator-sign-in"
          element={<Login />}
        />

        {/* ==================================================
            DEFAULT ROOT
            /dashboard akan melewati AuthGuard
        ================================================== */}

        <Route
          path="/"
          element={<Navigate to="/dashboard" replace />}
        />

        {/* ==================================================
            PROTECTED ENTERPRISE APPLICATION

            Semua route di dalam blok ini:
            AuthGuard
                ↓
            EnterpriseLayout
                ↓
            IdleTimeout
                ↓
            Halaman Enterprise
        ================================================== */}

        <Route element={<AuthGuard />}>

          <Route element={<EnterpriseLayout />}>

            {/* ==================================================
                DASHBOARD
            ================================================== */}

            <Route
              path="/dashboard"
              element={<Dashboard />}
            />

            {/* ==================================================
                WEBGIS COMMAND CENTER
            ================================================== */}

            <Route
              path="/gis"
              element={<GisCommandCenter />}
            />

            {/* ==================================================
                LAYER & OVERLAY
            ================================================== */}

            <Route
              path="/layeroverlay"
              element={<LayerOverlay />}
            />

            {/* ==================================================
                MITIGASI & ADAPTASI
            ================================================== */}

            <Route
              path="/mitigasi-adaptasi"
              element={<MitigasiAdaptasi />}
            />

            {/* ==================================================
                DETEKSI & ANALISIS KERAWANAN
                KAK 3.4
            ================================================== */}

            {/* Cek Lokasi Saya */}
            <Route
              path="/lokasi-saya"
              element={<LokasiSaya />}
            />

            {/* ==================================================
                INVENTARISASI LOKASI KEGIATAN
                KAK 3.3
            ================================================== */}

            {/* Data Lokasi Kegiatan */}
            <Route
              path="/lokasi"
              element={<LokasiKegiatan />}
            />

            {/* Tambah Lokasi */}
            <Route
              path="/lokasi/tambah"
              element={<LokasiKegiatan />}
            />

            {/* Pemetaan Lokasi */}
            <Route
              path="/lokasi/peta"
              element={<LokasiKegiatan />}
            />

            {/* Verifikasi Lokasi */}
            <Route
              path="/lokasi/verifikasi"
              element={<LokasiKegiatan />}
            />

            {/* Dokumentasi Kegiatan */}
            <Route
              path="/lokasi/dokumentasi"
              element={<LokasiKegiatan />}
            />

            {/* Import Data */}
            <Route
              path="/lokasi/import"
              element={<LokasiKegiatan />}
            />

            {/* ==================================================
                SYSTEM ADMINISTRATION
            ================================================== */}

            {/* USER MANAGEMENT */}
            <Route
              path="/system/users"
              element={<UserIndex />}
            />

            {/* ROLE & PERMISSION */}
            <Route
              path="/system/roles"
              element={<RoleIndex />}
            />

          </Route>
        </Route>

        {/* ==================================================
            404 / FALLBACK
            Harus berada paling akhir
        ================================================== */}

        <Route
          path="*"
          element={<Navigate to="/login" replace />}
        />

      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);