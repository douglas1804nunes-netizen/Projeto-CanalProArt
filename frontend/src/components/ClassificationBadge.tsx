export type TrendClassification = "RISING" | "HOT" | "STABLE" | "DECLINING";

const LABELS: Record<TrendClassification, string> = {
  HOT: "🔥 Em alta",
  RISING: "📈 Subindo",
  STABLE: "➡️ Estável",
  DECLINING: "📉 Caindo",
};

// Selos "neon": fundo translúcido, texto na cor do estado e um contorno fino
// da mesma cor. O "Em alta" pulsa um brilho suave pra chamar a atenção.
const STYLES: Record<TrendClassification, string> = {
  HOT: "bg-danger/15 text-danger animate-glow",
  RISING: "bg-ok/15 text-ok",
  STABLE: "bg-surface-2 text-fg-soft",
  DECLINING: "bg-warn/15 text-warn",
};

type ClassificationBadgeProps = {
  classification: TrendClassification;
  // Quando informado, aparece depois do rótulo: "🔥 Em alta · 92".
  score?: number;
};

export function ClassificationBadge({ classification, score }: ClassificationBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-current/25 ring-inset ${STYLES[classification]}`}
    >
      {LABELS[classification]}
      {score !== undefined && ` · ${score}`}
    </span>
  );
}
