import { describe, expect, it } from "vitest";
import { calculateTrendScore, calculateVideoScore, classifyTrend } from "./trendScore.js";

describe("calculateVideoScore", () => {
  it("velocity null contribui 0 (sem histórico de snapshots ainda)", () => {
    const score = calculateVideoScore({ velocity: null, engagementRate: 0, recencyScore: 0 });
    expect(score).toBe(0);
  });

  it("recencyScore 1 sozinho (sem velocity/engagement) vale o peso da recência (0.2)", () => {
    const score = calculateVideoScore({ velocity: null, engagementRate: 0, recencyScore: 1 });
    expect(score).toBeCloseTo(0.2);
  });

  it("engagementRate no teto (5%) vale o peso do engajamento (0.3)", () => {
    const score = calculateVideoScore({ velocity: null, engagementRate: 0.05, recencyScore: 0 });
    expect(score).toBeCloseTo(0.3);
  });

  it("engagementRate acima do teto não passa do peso máximo (fica em 0.3)", () => {
    const score = calculateVideoScore({ velocity: null, engagementRate: 0.5, recencyScore: 0 });
    expect(score).toBeCloseTo(0.3);
  });

  it("velocity muito alta não passa do peso máximo (fica em 0.5)", () => {
    const score = calculateVideoScore({ velocity: 10_000_000, engagementRate: 0, recencyScore: 0 });
    expect(score).toBeCloseTo(0.5, 1);
  });

  it("combina os três fatores quando todos presentes", () => {
    const score = calculateVideoScore({ velocity: 1000, engagementRate: 0.025, recencyScore: 1 });
    // velocity: log10(1001)/6 ≈ 0.5 * peso 0.5 ≈ 0.25
    // engagement: 0.025/0.05 = 0.5 * peso 0.3 = 0.15
    // recency: 1 * peso 0.2 = 0.2
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe("calculateTrendScore", () => {
  it("devolve 0 pra lista vazia de vídeos", () => {
    expect(calculateTrendScore([], 0)).toBe(0);
  });

  it("escala a média dos scores pra 0-100", () => {
    const score = calculateTrendScore([1, 1, 1], 1);
    expect(score).toBe(100); // média 1 * 0.85 + volume 1 * 0.15 = 1 -> 100
  });

  it("volume mais alto aumenta o score final com o mesmo videoScore médio", () => {
    const withLowVolume = calculateTrendScore([0.5, 0.5], 0);
    const withHighVolume = calculateTrendScore([0.5, 0.5], 1);
    expect(withHighVolume).toBeGreaterThan(withLowVolume);
  });
});

describe("classifyTrend", () => {
  it("score >= 70 é sempre HOT, mesmo sem histórico", () => {
    expect(classifyTrend(70, null)).toBe("HOT");
    expect(classifyTrend(95, 40)).toBe("HOT");
  });

  it("sem trend anterior (1ª busca do tópico) e score baixo, classifica STABLE", () => {
    expect(classifyTrend(40, null)).toBe("STABLE");
  });

  it("score subiu mais que STABLE_DELTA em relação ao anterior -> RISING", () => {
    expect(classifyTrend(50, 40)).toBe("RISING");
  });

  it("score caiu mais que STABLE_DELTA em relação ao anterior -> DECLINING", () => {
    expect(classifyTrend(30, 40)).toBe("DECLINING");
  });

  it("variação pequena (dentro de STABLE_DELTA) -> STABLE", () => {
    expect(classifyTrend(42, 40)).toBe("STABLE");
    expect(classifyTrend(38, 40)).toBe("STABLE");
  });
});
