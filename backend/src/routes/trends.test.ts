import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { prisma } from "../prisma.js";
import { maybeCreateOpportunity } from "./trends.js";

// Requer Postgres real — sem mocks. O caminho que chama a YouTube Data API
// de verdade (busca sem cache) não dá pra testar sem credenciais reais do
// Google — ver docs/ARCHITECTURE.md. Aqui cobre o que é nosso: guarda de
// autenticação, validação, cache-hit (dados fabricados) e isolamento por
// usuário no histórico.
describe("Rotas de tendências (Fases 6-8)", () => {
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
    await prisma.videoMetric.deleteMany({ where: { videoId: { in: createdVideoIds } } });
    await prisma.video.deleteMany({ where: { id: { in: createdVideoIds } } });
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  async function registerUser(label: string) {
    const email = `trends-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

  async function seedVideo(youtubeVideoId: string, viewCount: bigint) {
    const video = await prisma.video.create({
      data: {
        youtubeVideoId,
        channelId: "channel-1",
        channelTitle: "Canal Teste",
        title: `Vídeo ${youtubeVideoId}`,
        description: "Descrição",
        publishedAt: new Date("2026-01-01T00:00:00Z"),
        thumbnailUrl: "https://example.com/thumb.jpg",
        durationSeconds: 120,
        tags: [],
        fetchedAt: new Date(),
      },
    });
    createdVideoIds.push(video.id);

    await prisma.videoMetric.create({
      data: {
        videoId: video.id,
        viewCount,
        likeCount: 10n,
        commentCount: 1n,
        fetchedAt: new Date(),
      },
    });

    return video;
  }

  it("POST /api/trends/search exige autenticação", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/trends/search",
      payload: { regionCode: "BR" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("GET /api/trends/searches exige autenticação", async () => {
    const response = await app.inject({ method: "GET", url: "/api/trends/searches" });
    expect(response.statusCode).toBe(401);
  });

  it("rejeita regionCode inválido", async () => {
    const { token } = await registerUser("invalid-region");

    const response = await app.inject({
      method: "POST",
      url: "/api/trends/search",
      cookies: { token },
      payload: { regionCode: "brasil" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("serve do cache uma busca recente (mesmo userId/query/regionCode), sem chamar a API", async () => {
    const { token, userId } = await registerUser("cache-hit");

    const videoA = await seedVideo(`cache-a-${Date.now()}`, 1000n);
    const videoB = await seedVideo(`cache-b-${Date.now()}`, 2000n);

    const search = await prisma.search.create({
      data: {
        userId,
        query: "gatos",
        regionCode: "BR",
        resultCount: 2,
        fetchedAt: new Date(),
      },
    });
    createdSearchIds.push(search.id);

    await prisma.searchVideo.createMany({
      data: [
        { searchId: search.id, videoId: videoA.id, rank: 0 },
        { searchId: search.id, videoId: videoB.id, rank: 1 },
      ],
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/trends/search",
      cookies: { token },
      payload: { query: "gatos", regionCode: "BR" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      searchId: string;
      cached: boolean;
      trend: { score: number; classification: string } | null;
      videos: Array<{ id: string; viewCount: string }>;
    };

    expect(body.cached).toBe(true);
    expect(body.searchId).toBe(search.id);
    expect(body.videos).toHaveLength(2);
    // preserva o rank (videoA antes de videoB)
    expect(body.videos[0]).toMatchObject({ id: videoA.id, viewCount: "1000" });
    expect(body.videos[1]).toMatchObject({ id: videoB.id, viewCount: "2000" });
    // nenhum Trend foi criado pra esse tópico — cache-hit não calcula na hora
    expect(body.trend).toBeNull();
  });

  it("cache-hit inclui o Trend já calculado quando existe um pro mesmo tópico/região", async () => {
    const { token, userId } = await registerUser("cache-hit-with-trend");

    const video = await seedVideo(`cache-trend-${Date.now()}`, 5000n);

    const search = await prisma.search.create({
      data: {
        userId,
        query: "cachorros-fofos",
        regionCode: "BR",
        resultCount: 1,
        fetchedAt: new Date(),
      },
    });
    createdSearchIds.push(search.id);
    await prisma.searchVideo.create({ data: { searchId: search.id, videoId: video.id, rank: 0 } });

    const trend = await prisma.trend.create({
      data: {
        userId,
        topic: "cachorros-fofos",
        regionCode: "BR",
        trendScore: 42,
        classification: "RISING",
        fetchedAt: new Date(),
      },
    });
    createdTrendIds.push(trend.id);
    await prisma.trendVideo.create({ data: { trendId: trend.id, videoId: video.id, rank: 0 } });

    const response = await app.inject({
      method: "POST",
      url: "/api/trends/search",
      cookies: { token },
      payload: { query: "cachorros-fofos", regionCode: "BR" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      trend: { id: string; score: number; classification: string } | null;
    };
    expect(body.trend).toEqual({ id: trend.id, score: 42, classification: "RISING" });
  });

  it("GET /api/trends exige autenticação", async () => {
    const response = await app.inject({ method: "GET", url: "/api/trends" });
    expect(response.statusCode).toBe(401);
  });

  it("GET /api/trends devolve só os trends do próprio usuário", async () => {
    const { token: tokenA, userId: userIdA } = await registerUser("trends-list-a");
    const { token: tokenB } = await registerUser("trends-list-b");

    const trend = await prisma.trend.create({
      data: {
        userId: userIdA,
        topic: "topico-exclusivo",
        regionCode: "BR",
        trendScore: 55,
        classification: "HOT",
        fetchedAt: new Date(),
      },
    });
    createdTrendIds.push(trend.id);

    const responseA = await app.inject({
      method: "GET",
      url: "/api/trends",
      cookies: { token: tokenA },
    });
    const responseB = await app.inject({
      method: "GET",
      url: "/api/trends",
      cookies: { token: tokenB },
    });

    const trendsA = responseA.json() as Array<{ id: string }>;
    const trendsB = responseB.json() as Array<{ id: string }>;

    expect(trendsA.some((t) => t.id === trend.id)).toBe(true);
    expect(trendsB.some((t) => t.id === trend.id)).toBe(false);
  });

  it("GET /api/trends/searches devolve só o histórico do próprio usuário", async () => {
    const { token: tokenA, userId: userIdA } = await registerUser("history-a");
    const { token: tokenB } = await registerUser("history-b");

    const search = await prisma.search.create({
      data: {
        userId: userIdA,
        query: "cachorros",
        regionCode: "BR",
        resultCount: 0,
        fetchedAt: new Date(),
      },
    });
    createdSearchIds.push(search.id);

    const responseA = await app.inject({
      method: "GET",
      url: "/api/trends/searches",
      cookies: { token: tokenA },
    });
    const responseB = await app.inject({
      method: "GET",
      url: "/api/trends/searches",
      cookies: { token: tokenB },
    });

    const searchesA = responseA.json() as Array<{ id: string }>;
    const searchesB = responseB.json() as Array<{ id: string }>;

    expect(searchesA.some((s) => s.id === search.id)).toBe(true);
    expect(searchesB.some((s) => s.id === search.id)).toBe(false);
  });

  // Fase 10: página de análise — GET /api/trends/:id.
  describe("GET /api/trends/:id", () => {
    it("exige autenticação", async () => {
      const response = await app.inject({ method: "GET", url: "/api/trends/algum-id" });
      expect(response.statusCode).toBe(401);
    });

    it("devolve 404 pra id inexistente", async () => {
      const { token } = await registerUser("detail-missing");

      const response = await app.inject({
        method: "GET",
        url: "/api/trends/id-que-nao-existe",
        cookies: { token },
      });

      expect(response.statusCode).toBe(404);
    });

    it("devolve 404 pra trend de outro usuário", async () => {
      const { userId: userIdA } = await registerUser("detail-other-a");
      const { token: tokenB } = await registerUser("detail-other-b");

      const trend = await prisma.trend.create({
        data: {
          userId: userIdA,
          topic: "so-do-usuario-a",
          regionCode: "BR",
          trendScore: 60,
          classification: "STABLE",
          fetchedAt: new Date(),
        },
      });
      createdTrendIds.push(trend.id);

      const response = await app.inject({
        method: "GET",
        url: `/api/trends/${trend.id}`,
        cookies: { token: tokenB },
      });

      expect(response.statusCode).toBe(404);
    });

    it("devolve o trend com o score de cada vídeo e o histórico do tópico/região", async () => {
      const { token, userId } = await registerUser("detail-full");

      const videoA = await seedVideo(`detail-a-${Date.now()}`, 10000n);
      const videoB = await seedVideo(`detail-b-${Date.now()}`, 20000n);

      const olderTrend = await prisma.trend.create({
        data: {
          userId,
          topic: "analise-completa",
          regionCode: "BR",
          trendScore: 30,
          classification: "STABLE",
          fetchedAt: new Date("2026-01-01T00:00:00Z"),
        },
      });
      createdTrendIds.push(olderTrend.id);

      const trend = await prisma.trend.create({
        data: {
          userId,
          topic: "analise-completa",
          regionCode: "BR",
          trendScore: 75,
          classification: "RISING",
          fetchedAt: new Date("2026-02-01T00:00:00Z"),
        },
      });
      createdTrendIds.push(trend.id);
      await prisma.trendVideo.createMany({
        data: [
          { trendId: trend.id, videoId: videoA.id, rank: 0 },
          { trendId: trend.id, videoId: videoB.id, rank: 1 },
        ],
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trends/${trend.id}`,
        cookies: { token },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        id: string;
        topic: string;
        trendScore: number;
        classification: string;
        videos: Array<{ id: string; videoScore: number }>;
        history: Array<{ id: string; trendScore: number }>;
      };

      expect(body.id).toBe(trend.id);
      expect(body.topic).toBe("analise-completa");
      expect(body.trendScore).toBe(75);
      // preserva o rank (videoA antes de videoB) e cada vídeo tem seu score
      expect(body.videos).toHaveLength(2);
      expect(body.videos[0].id).toBe(videoA.id);
      expect(body.videos[1].id).toBe(videoB.id);
      expect(typeof body.videos[0].videoScore).toBe("number");
      // histórico em ordem cronológica, incluindo o trend atual
      expect(body.history.map((h) => h.id)).toEqual([olderTrend.id, trend.id]);
      expect(body.history[0].trendScore).toBe(30);
      expect(body.history[1].trendScore).toBe(75);
    });
  });

  // Fase 9: testa maybeCreateOpportunity diretamente, sem passar pelo
  // caminho de busca nova (que depende de rede) — ver comentário na função.
  describe("maybeCreateOpportunity", () => {
    async function seedTrend(userId: string, classification: string, trendScore = 75) {
      const trend = await prisma.trend.create({
        data: {
          userId,
          topic: `topico-${classification}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          regionCode: "BR",
          trendScore,
          classification,
          fetchedAt: new Date(),
        },
      });
      createdTrendIds.push(trend.id);
      return trend;
    }

    it("cria uma Opportunity quando o Trend é HOT", async () => {
      const { userId } = await registerUser("opp-hot");
      const trend = await seedTrend(userId, "HOT", 80);

      await maybeCreateOpportunity(trend);

      const opportunity = await prisma.opportunity.findFirst({ where: { trendId: trend.id } });
      expect(opportunity).not.toBeNull();
      expect(opportunity).toMatchObject({ userId, score: 80, status: "NEW" });
      if (opportunity) createdOpportunityIds.push(opportunity.id);
    });

    it("cria uma Opportunity quando o Trend é RISING", async () => {
      const { userId } = await registerUser("opp-rising");
      const trend = await seedTrend(userId, "RISING", 60);

      await maybeCreateOpportunity(trend);

      const opportunity = await prisma.opportunity.findFirst({ where: { trendId: trend.id } });
      expect(opportunity).not.toBeNull();
      if (opportunity) createdOpportunityIds.push(opportunity.id);
    });

    it("não cria Opportunity quando o Trend é STABLE", async () => {
      const { userId } = await registerUser("opp-stable");
      const trend = await seedTrend(userId, "STABLE", 40);

      await maybeCreateOpportunity(trend);

      const opportunity = await prisma.opportunity.findFirst({ where: { trendId: trend.id } });
      expect(opportunity).toBeNull();
    });

    it("não cria Opportunity quando o Trend é DECLINING", async () => {
      const { userId } = await registerUser("opp-declining");
      const trend = await seedTrend(userId, "DECLINING", 30);

      await maybeCreateOpportunity(trend);

      const opportunity = await prisma.opportunity.findFirst({ where: { trendId: trend.id } });
      expect(opportunity).toBeNull();
    });

    it("não duplica Opportunity se já existe uma pro mesmo trendId", async () => {
      const { userId } = await registerUser("opp-no-dup");
      const trend = await seedTrend(userId, "HOT", 90);

      await maybeCreateOpportunity(trend);
      await maybeCreateOpportunity(trend);

      const opportunities = await prisma.opportunity.findMany({ where: { trendId: trend.id } });
      expect(opportunities).toHaveLength(1);
      createdOpportunityIds.push(...opportunities.map((o) => o.id));
    });
  });
});
