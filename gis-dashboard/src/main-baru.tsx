import React from 'react'
import { createRoot } from 'react-dom/client'

import '@coreui/coreui/dist/css/coreui.min.css'

import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom'

import './index.css'

// ======================================================
// LAYOUT
// ======================================================

import EnterpriseLayout from './components/layouts/EnterpriseLayout'

// ======================================================
// BACKEND / ADMIN
// ======================================================

import Dashboard from './views/dashboard/Dashboard'
import UserIndex from './views/system/user/index'

// ======================================================
// FRONTEND PUBLIC
// ======================================================

import Kerawanan from './kerawanan'

// ======================================================
// ROOT
// ======================================================

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element #root tidak ditemukan.')
}

// ======================================================
// APPLICATION
// ======================================================

createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserRouter>

      <Routes>

        {/* ==================================================
            DEFAULT
        ================================================== */}

        <Route
          path="/"
          element={
            <Navigate
              to="/dashboard"
              replace
            />
          }
        />

        {/* ==================================================
            ENTERPRISE ADMIN LAYOUT
        ================================================== */}

        <Route element={<EnterpriseLayout />}>

          {/* Dashboard */}

          <Route
            path="/dashboard"
            element={<Dashboard />}
          />

          {/* User Management */}

          <Route
            path="/system/users"
            element={<UserIndex />}
          />

        </Route>

        {/* ==================================================
            PUBLIC / FRONTEND
        ================================================== */}

        <Route
          path="/kerawanan"
          element={<Kerawanan />}
        />

        {/* ==================================================
            404
        ================================================== */}

        <Route
          path="*"
          element={
            <Navigate
              to="/dashboard"
              replace
            />
          }
        />

      </Routes>

    </BrowserRouter>
  </React.StrictMode>,
)