import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { prisma } from "../prisma.js";

// Fase 16 — publicar de verdade no YouTube (videos.insert) exige um
// access_token OAuth real, que não temos (mesma situação das Fases 4/5).
// Aqui cobre tudo que é nosso: guarda de autenticação, validação, e todos
// os pré-requisitos (status READY, título/descrição selecionados, conta do
// YouTube existir e pertencer ao usuário) — nenhum desses caminhos chega
// perto de rede de verdade.
describe("POST /api/content-projects/:id/publish (Fase 16)", () => {
  const app = buildApp();
  const createdEmails: string[] = [];
  const createdProjectIds: string[] = [];
  const createdYoutubeAccountIds: string[] = [];
  let mainToken: string;
  let mainUserId: string;

  beforeAll(async () => {
    const main = await registerUser("main");
    mainToken = main.token;
    mainUserId = main.userId;
  });

  afterAll(async () => {
    await prisma.publishedVideo.deleteMany({
      where: { contentProjectId: { in: createdProjectIds } },
    });
    await prisma.mediaUpload.deleteMany({
      where: { contentProjectId: { in: createdProjectIds } },
    });
    await prisma.generatedTitle.deleteMany({
      where: { contentProjectId: { in: createdProjectIds } },
    });
    await prisma.generatedDescription.deleteMany({
      where: { contentProjectId: { in: createdProjectIds } },
    });
    await prisma.contentProject.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.youtubeAccount.deleteMany({ where: { id: { in: createdYoutubeAccountIds } } });
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  async function registerUser(label: string) {
    const email = `publish-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

  async function createFakeYoutubeAccount(userId: string) {
    const account = await prisma.youtubeAccount.create({
      data: {
        userId,
        channelId: `channel-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        channelTitle: "Canal Teste",
        accessToken: "fake-encrypted-access",
        refreshToken: "fake-encrypted-refresh",
        scopes: ["https://www.googleapis.com/auth/youtube.upload"],
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    createdYoutubeAccountIds.push(account.id);
    return account;
  }

  // status/mediaUpload/títulos/descrição controláveis por teste, pra cada
  // cenário de pré-requisito faltando.
  async function createProject(params: {
    userId: string;
    status?: "DRAFT" | "IN_PROGRESS" | "READY" | "PUBLISHED" | "ARCHIVED";
    withMedia?: boolean;
    withTitle?: boolean;
    withDescription?: boolean;
  }) {
    const project = await prisma.contentProject.create({
      data: { userId: params.userId, title: "Projeto de teste", status: params.status ?? "DRAFT" },
    });
    createdProjectIds.push(project.id);

    if (params.withMedia) {
      await prisma.mediaUpload.create({
        data: {
          contentProjectId: project.id,
          fileName: "video.mp4",
          filePath: "uploads/nao-existe/fake.mp4",
          mimeType: "video/mp4",
          sizeBytes: 1000n,
          rightsStatus: "ORIGINAL",
          containsSyntheticMedia: false,
        },
      });
    }
    if (params.withTitle) {
      await prisma.generatedTitle.create({
        data: { contentProjectId: project.id, title: "Título de teste", selected: true },
      });
    }
    if (params.withDescription) {
      await prisma.generatedDescription.create({
        data: { contentProjectId: project.id, description: "Descrição de teste", selected: true },
      });
    }

    return project;
  }

  it("exige autenticação", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/content-projects/algum-id/publish",
      payload: { youtubeAccountId: "algum-id" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejeita corpo sem youtubeAccountId", async () => {
    const project = await createProject({ userId: mainUserId });

    const response = await app.inject({
      method: "POST",
      url: `/api/content-projects/${project.id}/publish`,
      cookies: { token: mainToken },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it("devolve 404 pra projeto de outro usuário", async () => {
    const { token: tokenB } = await registerUser("other-b");
    const project = await createProject({ userId: mainUserId });

    const response = await app.inject({
      method: "POST",
      url: `/api/content-projects/${project.id}/publish`,
      cookies: { token: tokenB },
      payload: { youtubeAccountId: "algum-id" },
    });
    expect(response.statusCode).toBe(404);
  });

  it("devolve 400 se o projeto não está READY", async () => {
    const project = await createProject({ userId: mainUserId, status: "DRAFT" });

    const response = await app.inject({
      method: "POST",
      url: `/api/content-projects/${project.id}/publish`,
      cookies: { token: mainToken },
      payload: { youtubeAccountId: "algum-id" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: expect.stringContaining("pronto") });
  });

  it("devolve 400 se o projeto já foi publicado", async () => {
    const project = await createProject({ userId: mainUserId, status: "PUBLISHED" });

    const response = await app.inject({
      method: "POST",
      url: `/api/content-projects/${project.id}/publish`,
      cookies: { token: mainToken },
      payload: { youtubeAccountId: "algum-id" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: expect.stringContaining("já foi publicado") });
  });

  it("devolve 400 se não há título selecionado", async () => {
    const project = await createProject({
      userId: mainUserId,
      status: "READY",
      withMedia: true,
      withDescription: true,
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/content-projects/${project.id}/publish`,
      cookies: { token: mainToken },
      payload: { youtubeAccountId: "algum-id" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: expect.stringContaining("título") });
  });

  it("devolve 400 se não há descrição selecionada", async () => {
    const project = await createProject({
      userId: mainUserId,
      status: "READY",
      withMedia: true,
      withTitle: true,
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/content-projects/${project.id}/publish`,
      cookies: { token: mainToken },
      payload: { youtubeAccountId: "algum-id" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: expect.stringContaining("descrição") });
  });

  it("devolve 404 se a conta do YouTube não existe ou não pertence ao usuário", async () => {
    const { userId: userIdB } = await registerUser("account-owner-b");
    const accountB = await createFakeYoutubeAccount(userIdB);
    const project = await createProject({
      userId: mainUserId,
      status: "READY",
      withMedia: true,
      withTitle: true,
      withDescription: true,
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/content-projects/${project.id}/publish`,
      cookies: { token: mainToken },
      payload: { youtubeAccountId: accountB.id },
    });
    expect(response.statusCode).toBe(404);
  });
});
