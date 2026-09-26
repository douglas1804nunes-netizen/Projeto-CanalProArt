import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Logo } from "../components/Logo";
import { useAuth } from "./AuthContext";

export function RequireAuth() {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5">
        <div className="relative">
          <span className="absolute inset-0 animate-[pulse-ring_1.8s_ease-out_infinite] rounded-2xl bg-neon-violet/60" />
          <Logo className="animate-float relative h-14 w-14 drop-shadow-[0_10px_24px_rgba(139,92,246,0.6)]" />
        </div>
        <p className="animate-pulse text-sm text-muted">Carregando…</p>
      </div>
    );
  }

  if (state.status === "unauthenticated") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
