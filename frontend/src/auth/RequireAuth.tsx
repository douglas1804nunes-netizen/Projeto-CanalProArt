import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function RequireAuth() {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Carregando…
      </div>
    );
  }

  if (state.status === "unauthenticated") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
