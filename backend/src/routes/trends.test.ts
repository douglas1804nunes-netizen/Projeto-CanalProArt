import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { prisma } from "../prisma.js";

// Requer Postgres real — sem mocks. O caminho que chama a YouTube Data API
// de verdade (busca sem cache) não dá pra testar sem credenciais reais do
// Google — ver docs/ARCHITECTURE.md. Aqui cobre o que é nosso: guarda de
// autenticação, validação, cache-hit (dados fabricados) e isolamento por
// usuário no histórico.
describe("Rotas de tendências (Fase 6)", () => {
  const app = buildApp();
  const createdEmails: string[] = [];
  const createdVideoIds: string[] = [];
  const createdSearchIds: string[] = [];

  afterAll(async () => {
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
      videos: Array<{ id: string; viewCount: string }>;
    };

    expect(body.cached).toBe(true);
    expect(body.searchId).toBe(search.id);
    expect(body.videos).toHaveLength(2);
    // preserva o rank (videoA antes de videoB)
    expect(body.videos[0]).toMatchObject({ id: videoA.id, viewCount: "1000" });
    expect(body.videos[1]).toMatchObject({ id: videoB.id, viewCount: "2000" });
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
});
