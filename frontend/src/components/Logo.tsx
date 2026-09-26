import { useId } from "react";

type LogoProps = {
  className?: string;
};

// Mesma marca dos ícones do PWA: play sobre gradiente + ponto de "trend".
export function Logo({ className = "h-9 w-9" }: LogoProps) {
  // useId devolve ":r1:" — os dois pontos atrapalham a referência url(#…).
  const gradientId = `logo-${useId().replace(/:/g, "")}`;

  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6d5dfc" />
          <stop offset="0.55" stopColor="#c05cf0" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill={`url(#${gradientId})`} />
      <path d="M19 14.5v19l16-9.5z" fill="#fff" />
      <circle cx="37" cy="11" r="3.4" fill="#fbbf24" />
    </svg>
  );
}

// Marca + nome, usada na barra lateral, no cabeçalho mobile e no login.
export function Brand({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className="relative inline-flex">
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-neon-amber"
        >
          <span className="absolute inset-0 animate-[pulse-ring_2.2s_ease-out_infinite] rounded-full bg-neon-amber" />
        </span>
        <Logo className="h-9 w-9 drop-shadow-[0_6px_16px_rgba(139,92,246,0.55)]" />
      </span>
      <span className="text-gradient text-lg font-bold tracking-tight">CanalProArt</span>
    </span>
  );
}
