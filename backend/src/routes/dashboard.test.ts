import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { prisma } from "../prisma.js";

describe("GET /api/dashboard", () => {
  const app = buildApp();
  const createdEmails: string[] = [];
  const createdVideoIds: string[] = [];
  const createdSearchIds: string[] = [];
  const createdTrendIds: string[] = [];
  const createdOpportunityIds: string[] = [];

  afterAll(async () => {
    await prisma.opportunity.deleteMany({ where: { id: { in: createdOpportunityIds } } });
    await prisma.trendVideo.deleteMany({ where: { trendId: { in: createdTrendIds } } });
    await prisma.trend.deleteMany({ where: { id: { in: createdTrendIds } } });
    await prisma.searchVideo.deleteMany({ where: { searchId: { in: createdSearchIds } } });
    await prisma.search.deleteMany({ where: { id: { in: createdSearchIds } } });
    await prisma.video.deleteMany({ where: { id: { in: createdVideoIds } } });
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  async function registerUser(label: string) {
    const email = `dashboard-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    createdEmails.push(email);

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password: "senha-forte-123", name: "Teste" },
    });

    const token = response.cookies.find((c) => c.name === "token")?.value ?? "";
    const userId = (response.json() as { id: string }).id;
    return { token, userId };
  }

  it("exige autenticação", async () => {
    const response = await app.inject({ method: "GET", url: "/api/dashboard" });
    expect(response.statusCode).toBe(401);
  });

  it("devolve contagens zeradas e listas vazias pra um usuário novo", async () => {
    const { token } = await registerUser("empty");

    const response = await app.inject({ method: "GET", url: "/api/dashboard", cookies: { token } });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      counts: Record<string, number>;
      topTrends: unknown[];
      topOpportunities: unknown[];
    };
    expect(body.counts).toEqual({
      videosAnalyzed: 0,
      trends: 0,
      opportunities: 0,
      contentProjects: 0,
      publishedVideos: 0,
    });
    expect(body.topTrends).toEqual([]);
    expect(body.topOpportunities).toEqual([]);
  });

  it("agrega vídeos/tendências/oportunidades de verdade e isola por usuário", async () => {
    const { token: tokenA, userId: userIdA } = await registerUser("full-a");
    const { token: tokenB } = await registerUser("full-b");

    const video = await prisma.video.create({
      data: {
        youtubeVideoId: `dashboard-test-${Date.now()}`,
        channelId: "channel-1",
        channelTitle: "Canal Teste",
        title: "Vídeo teste",
        description: "Descrição",
        publishedAt: new Date(),
        thumbnailUrl: "https://example.com/thumb.jpg",
        durationSeconds: 120,
        tags: [],
        fetchedAt: new Date(),
      },
    });
    createdVideoIds.push(video.id);

    const search = await prisma.search.create({
      data: { userId: userIdA, query: "gatos", regionCode: "BR", resultCount: 1, fetchedAt: new Date() },
    });
    createdSearchIds.push(search.id);
    await prisma.searchVideo.create({ data: { searchId: search.id, videoId: video.id, rank: 0 } });

    const trend = await prisma.trend.create({
      data: {
        userId: userIdA,
        topic: "gatos",
        regionCode: "BR",
        trendScore: 80,
        classification: "HOT",
        fetchedAt: new Date(),
      },
    });
    createdTrendIds.push(trend.id);

    const opportunity = await prisma.opportunity.create({
      data: { userId: userIdA, trendId: trend.id, score: 80, status: "NEW" },
    });
    createdOpportunityIds.push(opportunity.id);

    const responseA = await app.inject({
      method: "GET",
      url: "/api/dashboard",
      cookies: { token: tokenA },
    });
    const responseB = await app.inject({
      method: "GET",
      url: "/api/dashboard",
      cookies: { token: tokenB },
    });

    const bodyA = responseA.json() as {
      counts: Record<string, number>;
      topTrends: Array<{ id: string }>;
      topOpportunities: Array<{ id: string; topic: string }>;
    };
    const bodyB = responseB.json() as { counts: Record<string, number> };

    expect(bodyA.counts).toMatchObject({ videosAnalyzed: 1, trends: 1, opportunities: 1 });
    expect(bodyA.topTrends.some((t) => t.id === trend.id)).toBe(true);
    expect(bodyA.topOpportunities).toEqual([
      expect.objectContaining({ id: opportunity.id, topic: "gatos" }),
    ]);

    // usuário B não vê nada do usuário A
    expect(bodyB.counts).toEqual({
      videosAnalyzed: 0,
      trends: 0,
      opportunities: 0,
      contentProjects: 0,
      publishedVideos: 0,
    });
  });
});
