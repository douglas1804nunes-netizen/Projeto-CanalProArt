import type { CSSProperties } from "react";

// Visual compartilhado dos gráficos (Recharts). As cores vêm das variáveis do
// tema, então os gráficos acompanham o tema claro/escuro sozinhos.
export const axisTick = { fill: "var(--muted)", fontSize: 12 };
export const axisLineStroke = "var(--line-strong)";
export const gridStroke = "var(--line)";

export const tooltipProps = {
  cursor: { fill: "var(--surface-2)" },
  contentStyle: {
    background: "var(--surface-solid)",
    border: "1px solid var(--line-strong)",
    borderRadius: 12,
    boxShadow: "0 12px 40px -12px rgb(0 0 0 / 0.6)",
    color: "var(--fg)",
  } satisfies CSSProperties,
  labelStyle: { color: "var(--fg)", fontWeight: 600 } satisfies CSSProperties,
  itemStyle: { color: "var(--fg-soft)" } satisfies CSSProperties,
};
