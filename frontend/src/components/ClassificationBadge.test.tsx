import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClassificationBadge, type TrendClassification } from "./ClassificationBadge";

describe("ClassificationBadge", () => {
  it.each<[TrendClassification, string]>([
    ["HOT", "🔥 Em alta"],
    ["RISING", "📈 Subindo"],
    ["STABLE", "➡️ Estável"],
    ["DECLINING", "📉 Caindo"],
  ])("mostra o rótulo de %s", (classification, label) => {
    render(<ClassificationBadge classification={classification} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("acrescenta o score depois do rótulo", () => {
    render(<ClassificationBadge classification="HOT" score={92} />);

    expect(screen.getByText("🔥 Em alta · 92")).toBeInTheDocument();
  });

  it("aceita score 0 (não confunde com ausente)", () => {
    render(<ClassificationBadge classification="DECLINING" score={0} />);

    expect(screen.getByText("📉 Caindo · 0")).toBeInTheDocument();
  });

  it("só o 'Em alta' pulsa o brilho", () => {
    const { rerender } = render(<ClassificationBadge classification="HOT" />);
    expect(screen.getByText("🔥 Em alta")).toHaveClass("animate-glow");

    rerender(<ClassificationBadge classification="STABLE" />);
    expect(screen.getByText("➡️ Estável")).not.toHaveClass("animate-glow");
  });
});
