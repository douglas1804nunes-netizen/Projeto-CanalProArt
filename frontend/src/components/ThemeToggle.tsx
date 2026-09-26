import { useState } from "react";
import { Icon } from "./Icon";

type Theme = "dark" | "light";

const STORAGE_KEY = "canalproart:theme";
const THEME_COLORS: Record<Theme, string> = { dark: "#060818", light: "#ebe4ff" };

// /theme-init.js já aplicou o tema salvo em <html data-theme> antes do React.
function currentTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const isDark = theme === "dark";

  function handleToggle() {
    const next: Theme = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[next]);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // sem localStorage: o tema vale só até recarregar
    }
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
      title={isDark ? "Tema claro" : "Tema escuro"}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-line-strong bg-surface text-fg-soft transition-all hover:-translate-y-0.5 hover:border-neon-cyan hover:text-fg hover:shadow-[0_8px_24px_-10px_var(--c1)] ${className}`}
    >
      <Icon name={isDark ? "sun" : "moon"} className="h-[18px] w-[18px]" />
    </button>
  );
}
