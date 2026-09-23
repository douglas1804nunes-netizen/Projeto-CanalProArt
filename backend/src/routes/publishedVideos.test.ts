import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { prisma } from "../prisma.js";

// Fase 17 — nenhuma chamada de rede aqui, só leitura dos PublishedVideo já
// criados pela Fase 16. Cobre agregação, ordenação e isolamento por usuário.
describe("GET /api/published-videos (Fase 17)", () => {
  const app = buildApp();
  const createdEmails: string[] = [];
  const createdProjectIds: string[] = [];
  const createdYoutubeAccountIds: string[] = [];
  const createdPublishedVideoIds: string[] = [];

  afterAll(async () => {
    await prisma.publishedVideo.deleteMany({
      where: { id: { in: createdPublishedVideoIds } },
    });
    await prisma.contentProject.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.youtubeAccount.deleteMany({ where: { id: { in: createdYoutubeAccountIds } } });
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  async function registerUser(label: string) {
    const email = `published-videos-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

  async function seedPublishedVideo(params: {
    userId: string;
    status: "PENDING" | "PUBLISHED" | "FAILED";
    youtubeVideoId?: string;
  }) {
    const youtubeAccount = await prisma.youtubeAccount.create({
      data: {
        userId: params.userId,
        channelId: `channel-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        channelTitle: "Canal Teste",
        accessToken: "fake",
        refreshToken: "fake",
        scopes: [],
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    createdYoutubeAccountIds.push(youtubeAccount.id);

    const project = await prisma.contentProject.create({
      data: { userId: params.userId, title: "Projeto publicado", status: "PUBLISHED" },
    });
    createdProjectIds.push(project.id);

    const publishedVideo = await prisma.publishedVideo.create({
      data: {
        contentProjectId: project.id,
        youtubeAccountId: youtubeAccount.id,
        youtubeVideoId: params.youtubeVideoId,
        rightsStatus: "ORIGINAL",
        containsSyntheticMedia: false,
        status: params.status,
        publishedAt: params.status === "PUBLISHED" ? new Date() : null,
      },
    });
    createdPublishedVideoIds.push(publishedVideo.id);

    return { project, youtubeAccount, publishedVideo };
  }

  it("exige autenticação", async () => {
    const response = await app.inject({ method: "GET", url: "/api/published-videos" });
    expect(response.statusCode).toBe(401);
  });

  it("devolve só os vídeos publicados do próprio usuário, com dados do projeto/canal", async () => {
    const { token: tokenA, userId: userIdA } = await registerUser("list-a");
    const { userId: userIdB } = await registerUser("list-b");

    const { publishedVideo, project } = await seedPublishedVideo({
      userId: userIdA,
      status: "PUBLISHED",
      youtubeVideoId: "abc123",
    });
    await seedPublishedVideo({ userId: userIdB, status: "PUBLISHED", youtubeVideoId: "xyz789" });

    const response = await app.inject({
      method: "GET",
      url: "/api/published-videos",
      cookies: { token: tokenA },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Array<{
      id: string;
      contentProjectTitle: string;
      channelTitle: string;
      youtubeVideoId: string | null;
      status: string;
    }>;

    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: publishedVideo.id,
      contentProjectTitle: project.title,
      channelTitle: "Canal Teste",
      youtubeVideoId: "abc123",
      status: "PUBLISHED",
    });
  });

  it("inclui tentativas com falha, não só sucessos", async () => {
    const { token, userId } = await registerUser("with-failure");
    await seedPublishedVideo({ userId, status: "FAILED" });

    const response = await app.inject({
      method: "GET",
      url: "/api/published-videos",
      cookies: { token },
    });

    const body = response.json() as Array<{ status: string; youtubeVideoId: string | null }>;
    expect(body.some((v) => v.status === "FAILED" && v.youtubeVideoId === null)).toBe(true);
  });

  it("devolve lista vazia quando o usuário nunca publicou nada", async () => {
    const { token } = await registerUser("empty");

    const response = await app.inject({
      method: "GET",
      url: "/api/published-videos",
      cookies: { token },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });
});
