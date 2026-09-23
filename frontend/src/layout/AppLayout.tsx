import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const navItems = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/trends", label: "Tendências" },
  { to: "/opportunities", label: "Oportunidades" },
  { to: "/content", label: "Conteúdos" },
  { to: "/videos", label: "Vídeos" },
  { to: "/youtube", label: "YouTube" },
  { to: "/settings", label: "Configurações" },
];

export function AppLayout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { state, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {isMenuOpen && (
        <div
          className="fixed inset-0 z-20 bg-slate-900/40 md:hidden"
          onClick={() => setIsMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-30 w-60 shrink-0 transform border-r border-slate-200 bg-white px-4 py-6 transition-transform duration-200 ease-in-out md:static md:translate-x-0 ${
          isMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-8 flex items-center justify-between px-2">
          <span className="text-lg font-semibold tracking-tight">CanalProArt</span>
          <button
            type="button"
            onClick={() => setIsMenuOpen(false)}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 md:hidden"
            aria-label="Fechar menu"
          >
            ✕
          </button>
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setIsMenuOpen(false)}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {state.status === "authenticated" && (
          <div className="absolute inset-x-4 bottom-6 border-t border-slate-200 pt-4">
            <p className="truncate px-2 text-sm font-medium text-slate-700">{state.user.name}</p>
            <p className="truncate px-2 text-xs text-slate-400">{state.user.email}</p>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="mt-2 w-full rounded-md px-3 py-2 text-left text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              Sair
            </button>
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={() => setIsMenuOpen(true)}
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
            aria-label="Abrir menu"
          >
            ☰
          </button>
          <span className="text-base font-semibold tracking-tight">CanalProArt</span>
        </header>

        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
