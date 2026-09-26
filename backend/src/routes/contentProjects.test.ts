import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildApp } from "../app.js";
import { UPLOADS_DIR } from "../media/storage.js";
import { prisma } from "../prisma.js";

// Fase 12 — assim como a Fase 11, a chamada de verdade ao AIProvider não dá
// pra testar sem uma ANTHROPIC_API_KEY real. Aqui cobre o que é nosso:
// persistência (CRUD do projeto, seleção de título/descrição, transição de
// status da Opportunity), autenticação, validação e isolamento por usuário.
//
// POST /api/auth/register tem rate limit de 20/min (Fase 3, contra força
// bruta) — esse arquivo reaproveita um único "mainUser" pra todo teste que
// não precisa de isolamento entre dois usuários, e só registra pares novos
// quando o próprio teste é sobre isolamento. Sem isso, o número de testes
// aqui estoura o limite e os últimos registros falham com 429.
describe("Rotas de content projects (Fase 12)", () => {
  const app = buildApp();
  const createdEmails: string[] = [];
  const createdProjectIds: string[] = [];
  const createdTrendIds: string[] = [];
  const createdOpportunityIds: string[] = [];
  const createdYoutubeAccountIds: string[] = [];
  let mainToken: string;
  let mainUserId: string;

  beforeAll(async () => {
    const main = await registerUser("main");
    mainToken = main.token;
    mainUserId = main.userId;
  });

  afterAll(async () => {
    // PublishedVideo → ContentProject é Restrict: as publicações precisam sair antes.
    await prisma.publishedVideo.deleteMany({
      where: { contentProjectId: { in: createdProjectIds } },
    });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: createdProjectIds } } });
    await prisma.generatedDescription.deleteMany({
      where: { contentProjectId: { in: createdProjectIds } },
    });
    await prisma.generatedTitle.deleteMany({
      where: { contentProjectId: { in: createdProjectIds } },
    });
    await prisma.script.deleteMany({ where: { contentProjectId: { in: createdProjectIds } } });
    await prisma.contentProject.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.youtubeAccount.deleteMany({ where: { id: { in: createdYoutubeAccountIds } } });
    await Promise.all(
      createdProjectIds.map((id) =>
        rm(path.join(UPLOADS_DIR, id), { recursive: true, force: true }),
      ),
    );
    await prisma.opportunity.deleteMany({ where: { id: { in: createdOpportunityIds } } });
    await prisma.trend.deleteMany({ where: { id: { in: createdTrendIds } } });
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  async function registerUser(label: string) {
    const email = `content-project-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

  async function seedOpportunity(userId: string, status: "NEW" | "DISMISSED" = "NEW") {
    const trend = await prisma.trend.create({
      data: {
        userId,
        topic: `topico-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        regionCode: "BR",
        trendScore: 80,
        classification: "HOT",
        fetchedAt: new Date(),
      },
    });
    createdTrendIds.push(trend.id);

    const opportunity = await prisma.opportunity.create({
      data: { userId, trendId: trend.id, score: 80, status },
    });
    createdOpportunityIds.push(opportunity.id);
    return opportunity;
  }

  async function createProject(token: string, title = "Meu projeto") {
    const response = await app.inject({
      method: "POST",
      url: "/api/content-projects",
      cookies: { token },
      payload: { title },
    });
    const project = response.json() as { id: string };
    createdProjectIds.push(project.id);
    return project;
  }

  it("POST /api/content-projects exige autenticação", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/content-projects",
      payload: { title: "Teste" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("POST /api/content-projects rejeita título vazio", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/content-projects",
      cookies: { token: mainToken },
      payload: { title: "" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("POST /api/content-projects cria um projeto sem oportunidade", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/content-projects",
      cookies: { token: mainToken },
      payload: { title: "Vídeo sobre gatos" },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as { id: string; title: string; status: string };
    createdProjectIds.push(body.id);
    expect(body.title).toBe("Vídeo sobre gatos");
    expect(body.status).toBe("DRAFT");
  });

  it("POST /api/content-projects devolve 404 pra opportunityId inexistente ou de outro usuário", async () => {
    const { userId: userIdB } = await registerUser("opp-other-b");
    const opportunityB = await seedOpportunity(userIdB);

    const response = await app.inject({
      method: "POST",
      url: "/api/content-projects",
      cookies: { token: mainToken },
      payload: { title: "Teste", opportunityId: opportunityB.id },
    });
    expect(response.statusCode).toBe(404);
  });

  it("POST /api/content-projects vincula a oportunidade e marca como IN_PROGRESS", async () => {
    const opportunity = await seedOpportunity(mainUserId, "NEW");

    const response = await app.inject({
      method: "POST",
      url: "/api/content-projects",
      cookies: { token: mainToken },
      payload: { title: "Vídeo sobre a tendência", opportunityId: opportunity.id },
    });
    expect(response.statusCode).toBe(201);
    const project = response.json() as { id: string; opportunityId: string };
    createdProjectIds.push(project.id);
    expect(project.opportunityId).toBe(opportunity.id);

    const updatedOpportunity = await prisma.opportunity.findUnique({
      where: { id: opportunity.id },
    });
    expect(updatedOpportunity?.status).toBe("IN_PROGRESS");
  });

  it("GET /api/content-projects exige autenticação", async () => {
    const response = await app.inject({ method: "GET", url: "/api/content-projects" });
    expect(response.statusCode).toBe(401);
  });

  it("GET /api/content-projects devolve só os projetos do próprio usuário", async () => {
    const { token: tokenB } = await registerUser("list-b");
    const projectA = await createProject(mainToken, "Projeto A");

    const responseA = await app.inject({
      method: "GET",
      url: "/api/content-projects",
      cookies: { token: mainToken },
    });
    const responseB = await app.inject({
      method: "GET",
      url: "/api/content-projects",
      cookies: { token: tokenB },
    });

    const projectsA = responseA.json() as Array<{ id: string }>;
    const projectsB = responseB.json() as Array<{ id: string }>;
    expect(projectsA.some((p) => p.id === projectA.id)).toBe(true);
    expect(projectsB.some((p) => p.id === projectA.id)).toBe(false);
  });

  it("GET /api/content-projects/:id devolve 404 pra projeto de outro usuário", async () => {
    const { token: tokenB } = await registerUser("detail-b");
    const project = await createProject(mainToken);

    const response = await app.inject({
      method: "GET",
      url: `/api/content-projects/${project.id}`,
      cookies: { token: tokenB },
    });
    expect(response.statusCode).toBe(404);
  });

  it("GET /api/content-projects/:id devolve scripts/títulos/descrições", async () => {
    const project = await createProject(mainToken, "Projeto completo");

    const script = await prisma.script.create({
      data: {
        contentProjectId: project.id,
        content: "roteiro",
        version: 1,
        aiProvider: "anthropic",
      },
    });
    const title = await prisma.generatedTitle.create({
      data: { contentProjectId: project.id, title: "Título gerado" },
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/content-projects/${project.id}`,
      cookies: { token: mainToken },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      scripts: Array<{ id: string }>;
      generatedTitles: Array<{ id: string }>;
    };
    expect(body.scripts.map((s) => s.id)).toContain(script.id);
    expect(body.generatedTitles.map((t) => t.id)).toContain(title.id);
  });

  it("PATCH /api/content-projects/:id exige pelo menos title ou status", async () => {
    const project = await createProject(mainToken);

    const response = await app.inject({
      method: "PATCH",
      url: `/api/content-projects/${project.id}`,
      cookies: { token: mainToken },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it("PATCH /api/content-projects/:id devolve 404 pra projeto de outro usuário", async () => {
    const { token: tokenB } = await registerUser("patch-other-b");
    const project = await createProject(mainToken);

    const response = await app.inject({
      method: "PATCH",
      url: `/api/content-projects/${project.id}`,
      cookies: { token: tokenB },
      payload: { status: "READY" },
    });
    expect(response.statusCode).toBe(404);
  });

  it("PATCH /api/content-projects/:id atualiza status e título", async () => {
    const project = await createProject(mainToken, "Título original");

    // IN_PROGRESS não exige vídeo/direitos declarados (ao contrário de
    // READY, ver Fase 14) — usado aqui só pra testar a atualização em si.
    const response = await app.inject({
      method: "PATCH",
      url: `/api/content-projects/${project.id}`,
      cookies: { token: mainToken },
      payload: { status: "IN_PROGRESS", title: "Título atualizado" },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { status: string; title: string };
    expect(body.status).toBe("IN_PROGRESS");
    expect(body.title).toBe("Título atualizado");
  });

  it("POST .../generate-script exige autenticação", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/content-projects/algum-id/generate-script",
    });
    expect(response.statusCode).toBe(401);
  });

  it("POST .../generate-script devolve 404 pra projeto de outro usuário", async () => {
    const { token: tokenB } = await registerUser("script-other-b");
    const project = await createProject(mainToken);

    const response = await app.inject({
      method: "POST",
      url: `/api/content-projects/${project.id}/generate-script`,
      cookies: { token: tokenB },
      payload: {},
    });
    expect(response.statusCode).toBe(404);
  });

  it("POST .../generate-script com a conta da IA sem créditos devolve 402 e não grava roteiro", async () => {
    const project = await createProject(mainToken);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              type: "error",
              error: {
                type: "invalid_request_error",
                message: "Your credit balance is too low to access the Anthropic API.",
              },
            }),
            { status: 400 },
          ),
      ),
    );

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/content-projects/${project.id}/generate-script`,
        cookies: { token: mainToken },
        payload: {},
      });

      expect(response.statusCode).toBe(402);
      expect((response.json() as { error: string }).error).toContain("sem créditos");
      expect(await prisma.script.count({ where: { contentProjectId: project.id } })).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("POST .../generate-description devolve 400 se ainda não existe roteiro", async () => {
    const project = await createProject(mainToken);

    const response = await app.inject({
      method: "POST",
      url: `/api/content-projects/${project.id}/generate-description`,
      cookies: { token: mainToken },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it("POST .../titles/:titleId/select marca um título e desmarca os outros", async () => {
    const project = await createProject(mainToken);
    const titleA = await prisma.generatedTitle.create({
      data: { contentProjectId: project.id, title: "A", selected: true },
    });
    const titleB = await prisma.generatedTitle.create({
      data: { contentProjectId: project.id, title: "B" },
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/content-projects/${project.id}/titles/${titleB.id}/select`,
      cookies: { token: mainToken },
    });
    expect(response.statusCode).toBe(200);

    const refreshedA = await prisma.generatedTitle.findUnique({ where: { id: titleA.id } });
    const refreshedB = await prisma.generatedTitle.findUnique({ where: { id: titleB.id } });
    expect(refreshedA?.selected).toBe(false);
    expect(refreshedB?.selected).toBe(true);
  });

  it("POST .../titles/:titleId/select devolve 404 pra título de outro projeto", async () => {
    const { token: tokenB } = await registerUser("select-cross-b");
    const projectA = await createProject(mainToken);
    const projectB = await createProject(tokenB);
    const titleFromA = await prisma.generatedTitle.create({
      data: { contentProjectId: projectA.id, title: "A" },
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/content-projects/${projectB.id}/titles/${titleFromA.id}/select`,
      cookies: { token: tokenB },
    });
    expect(response.statusCode).toBe(404);
  });

  it("POST .../descriptions/:descriptionId/select marca uma descrição e desmarca as outras", async () => {
    const project = await createProject(mainToken);
    const descA = await prisma.generatedDescription.create({
      data: { contentProjectId: project.id, description: "A", selected: true },
    });
    const descB = await prisma.generatedDescription.create({
      data: { contentProjectId: project.id, description: "B" },
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/content-projects/${project.id}/descriptions/${descB.id}/select`,
      cookies: { token: mainToken },
    });
    expect(response.statusCode).toBe(200);

    const refreshedA = await prisma.generatedDescription.findUnique({ where: { id: descA.id } });
    const refreshedB = await prisma.generatedDescription.findUnique({ where: { id: descB.id } });
    expect(refreshedA?.selected).toBe(false);
    expect(refreshedB?.selected).toBe(true);
  });

  describe("DELETE /api/content-projects/:id", () => {
    function deleteProject(token: string, id: string) {
      return app.inject({
        method: "DELETE",
        url: `/api/content-projects/${id}`,
        cookies: { token },
      });
    }

    async function createProjectForOpportunity(opportunityId: string) {
      const response = await app.inject({
        method: "POST",
        url: "/api/content-projects",
        cookies: { token: mainToken },
        payload: { title: "Da oportunidade", opportunityId },
      });
      const project = response.json() as { id: string };
      createdProjectIds.push(project.id);
      return project;
    }

    async function seedPublication(projectId: string, status: "PUBLISHED" | "FAILED") {
      const youtubeAccount = await prisma.youtubeAccount.create({
        data: {
          userId: mainUserId,
          channelId: `channel-del-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          channelTitle: "Canal Teste",
          accessToken: "fake",
          refreshToken: "fake",
          scopes: [],
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });
      createdYoutubeAccountIds.push(youtubeAccount.id);
      return prisma.publishedVideo.create({
        data: {
          contentProjectId: projectId,
          youtubeAccountId: youtubeAccount.id,
          youtubeVideoId: status === "PUBLISHED" ? "yt-abc" : undefined,
          rightsStatus: "ORIGINAL",
          status,
          publishedAt: status === "PUBLISHED" ? new Date() : null,
        },
      });
    }

    async function opportunityStatus(id: string) {
      return (await prisma.opportunity.findUniqueOrThrow({ where: { id } })).status;
    }

    it("exige autenticação", async () => {
      const response = await app.inject({ method: "DELETE", url: "/api/content-projects/x" });
      expect(response.statusCode).toBe(401);
    });

    it("devolve 404 pra projeto inexistente", async () => {
      expect((await deleteProject(mainToken, "id-que-nao-existe")).statusCode).toBe(404);
    });

    it("devolve 404 (e não exclui) pra projeto de outro usuário", async () => {
      const { token: otherToken } = await registerUser("delete-other");
      const project = await createProject(mainToken);

      expect((await deleteProject(otherToken, project.id)).statusCode).toBe(404);
      expect(await prisma.contentProject.findUnique({ where: { id: project.id } })).not.toBeNull();
    });

    it("exclui o projeto com roteiro, títulos, descrição, vídeo e arquivos do disco", async () => {
      const project = await createProject(mainToken, "Para excluir");
      await prisma.script.create({
        data: { contentProjectId: project.id, content: "roteiro", aiProvider: "anthropic" },
      });
      await prisma.generatedTitle.create({ data: { contentProjectId: project.id, title: "T" } });
      await prisma.generatedDescription.create({
        data: { contentProjectId: project.id, description: "D" },
      });
      await prisma.mediaUpload.create({
        data: {
          contentProjectId: project.id,
          fileName: "v.mp4",
          filePath: `uploads/${project.id}/v.mp4`,
          mimeType: "video/mp4",
          sizeBytes: 5n,
        },
      });
      await mkdir(path.join(UPLOADS_DIR, project.id), { recursive: true });
      await writeFile(path.join(UPLOADS_DIR, project.id, "v.mp4"), "bytes");

      const response = await deleteProject(mainToken, project.id);

      expect(response.statusCode).toBe(204);
      expect(await prisma.contentProject.findUnique({ where: { id: project.id } })).toBeNull();
      const where = { contentProjectId: project.id };
      expect(await prisma.script.count({ where })).toBe(0);
      expect(await prisma.generatedTitle.count({ where })).toBe(0);
      expect(await prisma.generatedDescription.count({ where })).toBe(0);
      expect(await prisma.mediaUpload.count({ where })).toBe(0);
      await expect(readdir(path.join(UPLOADS_DIR, project.id))).rejects.toThrow(/ENOENT/);

      const log = await prisma.auditLog.findFirst({ where: { entityId: project.id } });
      expect(log).toMatchObject({
        userId: mainUserId,
        action: "CONTENT_PROJECT_DELETED",
        metadata: { title: "Para excluir", status: "DRAFT" },
      });
    });

    it("a oportunidade que estava IN_PROGRESS volta pra NEW quando nenhum outro conteúdo a usa", async () => {
      const opportunity = await seedOpportunity(mainUserId, "NEW");
      const project = await createProjectForOpportunity(opportunity.id);
      expect(await opportunityStatus(opportunity.id)).toBe("IN_PROGRESS");

      await deleteProject(mainToken, project.id);

      expect(await opportunityStatus(opportunity.id)).toBe("NEW");
    });

    it("a oportunidade continua IN_PROGRESS enquanto outro conteúdo ainda a usa", async () => {
      const opportunity = await seedOpportunity(mainUserId, "NEW");
      const first = await createProjectForOpportunity(opportunity.id);
      const second = await createProjectForOpportunity(opportunity.id);

      await deleteProject(mainToken, first.id);
      expect(await opportunityStatus(opportunity.id)).toBe("IN_PROGRESS");

      await deleteProject(mainToken, second.id);
      expect(await opportunityStatus(opportunity.id)).toBe("NEW");
    });

    it("não mexe numa oportunidade que já foi CONVERTED", async () => {
      const opportunity = await seedOpportunity(mainUserId, "NEW");
      const project = await createProjectForOpportunity(opportunity.id);
      await prisma.opportunity.update({
        where: { id: opportunity.id },
        data: { status: "CONVERTED" },
      });

      await deleteProject(mainToken, project.id);

      expect(await opportunityStatus(opportunity.id)).toBe("CONVERTED");
    });

    it("recusa (409) excluir um conteúdo já publicado no YouTube e preserva o histórico", async () => {
      const project = await createProject(mainToken, "Já publicado");
      const publication = await seedPublication(project.id, "PUBLISHED");

      const response = await deleteProject(mainToken, project.id);

      expect(response.statusCode).toBe(409);
      expect((response.json() as { error: string }).error).toMatch(/arquive/);
      expect(await prisma.contentProject.findUnique({ where: { id: project.id } })).not.toBeNull();
      expect(
        await prisma.publishedVideo.findUnique({ where: { id: publication.id } }),
      ).not.toBeNull();
    });

    it("exclui um conteúdo cujas tentativas de publicação só falharam (levando as tentativas junto)", async () => {
      const project = await createProject(mainToken, "Só falhas");
      const attempt = await seedPublication(project.id, "FAILED");

      const response = await deleteProject(mainToken, project.id);

      expect(response.statusCode).toBe(204);
      expect(await prisma.contentProject.findUnique({ where: { id: project.id } })).toBeNull();
      expect(await prisma.publishedVideo.findUnique({ where: { id: attempt.id } })).toBeNull();
    });
  });
});
