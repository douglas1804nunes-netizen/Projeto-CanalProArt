import { describe, expect, it } from "vitest";
import {
  calculateEngagementRate,
  calculateRecencyScore,
  calculateVelocity,
  calculateVolumeScore,
} from "./metrics.js";

describe("calculateVelocity", () => {
  it("devolve null com menos de 2 snapshots", () => {
    expect(calculateVelocity([])).toBeNull();
    expect(calculateVelocity([{ viewCount: 100n, fetchedAt: new Date() }])).toBeNull();
  });

  it("calcula views por hora entre o snapshot mais antigo e o mais novo", () => {
    const now = new Date("2026-01-02T00:00:00Z");
    const twoHoursAgo = new Date("2026-01-01T22:00:00Z");

    const velocity = calculateVelocity([
      { viewCount: 1000n, fetchedAt: twoHoursAgo },
      { viewCount: 1500n, fetchedAt: now },
    ]);

    expect(velocity).toBe(250); // 500 views / 2 horas
  });

  it("ignora a ordem de entrada (ordena por fetchedAt antes de calcular)", () => {
    const now = new Date("2026-01-02T00:00:00Z");
    const twoHoursAgo = new Date("2026-01-01T22:00:00Z");

    const velocity = calculateVelocity([
      { viewCount: 1500n, fetchedAt: now },
      { viewCount: 1000n, fetchedAt: twoHoursAgo },
    ]);

    expect(velocity).toBe(250);
  });

  it("usa só o snapshot mais antigo e o mais novo quando há 3+", () => {
    const t0 = new Date("2026-01-01T00:00:00Z");
    const t1 = new Date("2026-01-01T12:00:00Z");
    const t2 = new Date("2026-01-02T00:00:00Z");

    const velocity = calculateVelocity([
      { viewCount: 1000n, fetchedAt: t0 },
      { viewCount: 999_999n, fetchedAt: t1 }, // outlier no meio, não deve afetar o resultado
      { viewCount: 2200n, fetchedAt: t2 },
    ]);

    expect(velocity).toBe(50); // (2200 - 1000) / 24 horas
  });
});

describe("calculateEngagementRate", () => {
  it("calcula (likes + comentários) / views", () => {
    const rate = calculateEngagementRate({ viewCount: 1000n, likeCount: 80n, commentCount: 20n });
    expect(rate).toBeCloseTo(0.1);
  });

  it("devolve 0 quando não há views (evita divisão por zero)", () => {
    const rate = calculateEngagementRate({ viewCount: 0n, likeCount: 5n, commentCount: 1n });
    expect(rate).toBe(0);
  });
});

describe("calculateRecencyScore", () => {
  it("devolve 1 pra um vídeo publicado agora", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(calculateRecencyScore(now, now)).toBe(1);
  });

  it("devolve 0.5 depois de uma meia-vida (7 dias)", () => {
    const now = new Date("2026-01-08T00:00:00Z");
    const publishedAt = new Date("2026-01-01T00:00:00Z");
    expect(calculateRecencyScore(publishedAt, now)).toBeCloseTo(0.5);
  });

  it("tende a 0 pra vídeos bem antigos, nunca fica negativo", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const publishedAt = new Date("2020-01-01T00:00:00Z");
    const score = calculateRecencyScore(publishedAt, now);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThan(0.01);
  });

  it("nunca passa de 1 mesmo com publishedAt no futuro (relógio/API inconsistente)", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const publishedAt = new Date("2026-01-05T00:00:00Z");
    expect(calculateRecencyScore(publishedAt, now)).toBe(1);
  });
});

describe("calculateVolumeScore", () => {
  it("escala linearmente até o teto", () => {
    expect(calculateVolumeScore(0)).toBe(0);
    expect(calculateVolumeScore(25)).toBe(1);
    expect(calculateVolumeScore(12.5)).toBeCloseTo(0.5);
  });

  it("não passa de 1 mesmo acima do teto", () => {
    expect(calculateVolumeScore(100)).toBe(1);
  });
});
