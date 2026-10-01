import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:3001";

function getOrCreateVisitorId() {
  const key = "simiti_visitor_id";

  let visitorId = localStorage.getItem(key);

  if (!visitorId) {
    visitorId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    localStorage.setItem(key, visitorId);
  }

  return visitorId;
}

function getOrCreateSessionId() {
  const key = "simiti_access_session_id";

  let sessionId = sessionStorage.getItem(key);

  if (!sessionId) {
    sessionId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    sessionStorage.setItem(key, sessionId);
  }

  return sessionId;
}

function getModuleFromPath(pathname: string) {
  if (pathname === "/login") return "Authentication";
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  if (pathname.startsWith("/gis")) return "GIS";
  if (pathname.startsWith("/kerawanan")) return "Kerawanan";
  if (pathname.startsWith("/kebencanaan")) return "Kebencanaan";
  if (pathname.startsWith("/kejadian")) return "Kejadian";
  if (pathname.startsWith("/ews")) return "EWS";
  if (pathname.startsWith("/tma")) return "TMA";
  if (pathname.startsWith("/lokasi")) return "Lokasi";
  if (pathname.startsWith("/rekomendasi")) return "Rekomendasi";
  if (pathname.startsWith("/interoperabilitas")) return "Interoperabilitas";
  if (pathname.startsWith("/system")) return "Administrasi";
  if (pathname.startsWith("/laporan")) return "Laporan";

  return "Other";
}

export default function AccessTracker() {
  const location = useLocation();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    /*
     * React StrictMode dapat menjalankan effect dua kali
     * pada development. Jangan kirim PAGE_VIEW dua kali
     * untuk pathname yang sama.
     */
    if (lastTrackedPath.current === location.pathname) {
      return;
    }

    lastTrackedPath.current = location.pathname;

    const visitorId = getOrCreateVisitorId();
    const sessionId = getOrCreateSessionId();

    const payload = {
      visitorId,
      sessionId,
      path: location.pathname,
      module: getModuleFromPath(location.pathname),
      action: "PAGE_VIEW",
    };

    const token =
      localStorage.getItem("smiti_token") ||
      sessionStorage.getItem("smiti_token");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    fetch(`${API_BASE}/api/access/track`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      /*
       * Tracking tidak boleh mengganggu aplikasi utama.
       */
    });
  }, [location.pathname]);

  return null;
}
