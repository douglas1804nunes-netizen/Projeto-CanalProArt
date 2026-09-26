import { useState, type CSSProperties } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Icon, type IconName } from "../components/Icon";
import { Brand } from "../components/Logo";
import { ThemeToggle } from "../components/ThemeToggle";

// Cada item tem a sua cor de destaque (--nav-c): o ícone, a barra lateral e o
// brilho do item ativo usam ela.
const navItems: Array<{
  to: string;
  label: string;
  icon: IconName;
  color: string;
  end?: boolean;
}> = [
  { to: "/", label: "Dashboard", icon: "dashboard", color: "var(--c1)", end: true },
  { to: "/trends", label: "Tendências", icon: "trending", color: "var(--c2)" },
  { to: "/opportunities", label: "Oportunidades", icon: "bulb", color: "var(--c4)" },
  { to: "/content", label: "Conteúdos", icon: "file", color: "var(--c3)" },
  { to: "/videos", label: "Vídeos", icon: "play", color: "var(--c5)" },
  { to: "/youtube", label: "YouTube", icon: "youtube", color: "#fb7185" },
  { to: "/settings", label: "Configurações", icon: "sliders", color: "var(--c1)" },
];

export function AppLayout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { state, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  const userInitial = state.status === "authenticated" ? state.user.name.charAt(0) : "";

  return (
    <div className="flex min-h-screen text-fg">
      {isMenuOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setIsMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-64 shrink-0 transform flex-col border-r border-line bg-surface-solid/90 px-4 py-6 backdrop-blur-2xl transition-transform duration-300 ease-out md:sticky md:top-0 md:h-screen md:translate-x-0 md:bg-surface-solid/40 ${
          isMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-8 flex items-center justify-between px-2">
          <Brand />
          <button
            type="button"
            onClick={() => setIsMenuOpen(false)}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg md:hidden"
            aria-label="Fechar menu"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>

        <nav className="stagger flex flex-col gap-1.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setIsMenuOpen(false)}
              style={{ "--nav-c": item.color } as CSSProperties}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-surface-2 text-fg ring-1 ring-line-strong ring-inset before:absolute before:top-2 before:bottom-2 before:left-0 before:w-1 before:rounded-full before:bg-[var(--nav-c)] before:shadow-[0_0_14px_var(--nav-c)] before:content-['']"
                    : "text-muted hover:translate-x-1 hover:bg-surface hover:text-fg"
                }`
              }
            >
              <span
                aria-hidden="true"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--nav-c)_16%,transparent)] text-[var(--nav-c)] transition-transform duration-200 group-hover:scale-110"
              >
                <Icon name={item.icon} className="h-[18px] w-[18px]" />
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {state.status === "authenticated" && (
          <div className="mt-auto rounded-2xl border border-line bg-surface p-3">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="btn-primary inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold uppercase"
              >
                {userInitial}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-fg">{state.user.name}</p>
                <p className="truncate text-xs text-faint">{state.user.email}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line-strong px-3 py-2 text-sm font-medium text-fg-soft transition-all hover:border-danger/50 hover:bg-danger/10 hover:text-danger"
              >
                <Icon name="logout" className="h-4 w-4" />
                Sair
              </button>
              <ThemeToggle />
            </div>
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-surface-solid/70 px-4 py-3 backdrop-blur-xl md:hidden">
          <button
            type="button"
            onClick={() => setIsMenuOpen(true)}
            className="rounded-xl p-2 btn-ghost"
            aria-label="Abrir menu"
          >
            <Icon name="menu" className="h-5 w-5" />
          </button>
          <Brand className="flex-1" />
          <ThemeToggle />
        </header>

        <main className="flex-1 px-4 py-6 md:px-10 md:py-10">
          {/* key = rota: a cada navegação a página entra com a animação de novo */}
          <div key={location.pathname} className="page-enter">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
