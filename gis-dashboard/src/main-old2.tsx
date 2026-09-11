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

// ======================================================
// GIS
// ======================================================

import GisCommandCenter from "./views/gis/GisCommandCenter";
import LayerOverlay from "./views/gis/LayerOverlay";

// ======================================================
// PUBLIC FRONTEND
// ======================================================

// ======================================================
// PUBLIC FRONTEND
// ======================================================

import Kerawanan from "./kerawanan";
import DetailKejadian from "./detailKejadian";

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
                LAYER & OVERLAY
            ================================================== */}

            <Route path="/layeroverlay" element={<LayerOverlay />} />

            {/* ==================================================
                SYSTEM
            ================================================== */}

            {/* USER MANAGEMENT */}
            <Route path="/system/users" element={<UserIndex />} />

            {/* ROLE & PERMISSION */}
            <Route path="/system/roles" element={<RoleIndex />} />
          </Route>
        </Route>

        {/* ==================================================
            404 / FALLBACK
        ================================================== */}

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
