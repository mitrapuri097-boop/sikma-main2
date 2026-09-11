import { Navigate, Outlet, useLocation } from "react-router-dom";

export default function AuthGuard() {
  const location = useLocation();

  const token =
    localStorage.getItem("smiti_token") ||
    sessionStorage.getItem("smiti_token");

  // User belum login
  if (!token) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: location.pathname + location.search,
        }}
      />
    );
  }

  // User sudah login
  return <Outlet />;
}
