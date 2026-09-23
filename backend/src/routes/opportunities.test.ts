import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { prisma } from "../prisma.js";

describe("Rotas de oportunidades (Fase 9)", () => {
  const app = buildApp();
  const createdEmails: string[] = [];
  const createdTrendIds: string[] = [];
  const createdOpportunityIds: string[] = [];

  afterAll(async () => {
    await prisma.opportunity.deleteMany({ where: { id: { in: createdOpportunityIds } } });
    await prisma.trend.deleteMany({ where: { id: { in: createdTrendIds } } });
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  async function registerUser(label: string) {
    const email = `opportunities-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

  async function seedOpportunity(userId: string, params: { score?: number; status?: string } = {}) {
    const trend = await prisma.trend.create({
      data: {
        userId,
        topic: `topico-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        regionCode: "BR",
        trendScore: params.score ?? 70,
        classification: "HOT",
        fetchedAt: new Date(),
      },
    });
    createdTrendIds.push(trend.id);

    const opportunity = await prisma.opportunity.create({
      data: {
        userId,
        trendId: trend.id,
        score: params.score ?? 70,
        status: params.status ?? "NEW",
      },
    });
    createdOpportunityIds.push(opportunity.id);

    return { trend, opportunity };
  }

  it("GET /api/opportunities exige autenticação", async () => {
    const response = await app.inject({ method: "GET", url: "/api/opportunities" });
    expect(response.statusCode).toBe(401);
  });

  it("GET /api/opportunities devolve só as oportunidades do próprio usuário, ordenadas por score", async () => {
    const { token: tokenA, userId: userIdA } = await registerUser("list-a");
    const { userId: userIdB } = await registerUser("list-b");

    const { opportunity: lowScore } = await seedOpportunity(userIdA, { score: 30 });
    const { opportunity: highScore } = await seedOpportunity(userIdA, { score: 90 });
    await seedOpportunity(userIdB, { score: 99 });

    const response = await app.inject({
      method: "GET",
      url: "/api/opportunities",
      cookies: { token: tokenA },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Array<{ id: string; score: number; topic: string }>;
    const ids = body.map((o) => o.id);

    expect(ids).toContain(highScore.id);
    expect(ids).toContain(lowScore.id);
    expect(body.every((o) => o.id !== undefined)).toBe(true);
    // maior score primeiro
    expect(ids.indexOf(highScore.id)).toBeLessThan(ids.indexOf(lowScore.id));
  });

  it("POST /api/opportunities/:id/dismiss exige autenticação", async () => {
    const response = await app.inject({ method: "POST", url: "/api/opportunities/algum-id/dismiss" });
    expect(response.statusCode).toBe(401);
  });

  it("POST /api/opportunities/:id/dismiss devolve 404 pra oportunidade de outro usuário", async () => {
    const { token: tokenB } = await registerUser("dismiss-other-b");
    const { userId: userIdA } = await registerUser("dismiss-other-a");
    const { opportunity } = await seedOpportunity(userIdA);

    const response = await app.inject({
      method: "POST",
      url: `/api/opportunities/${opportunity.id}/dismiss`,
      cookies: { token: tokenB },
    });

    expect(response.statusCode).toBe(404);
  });

  it("POST /api/opportunities/:id/dismiss devolve 404 pra id inexistente", async () => {
    const { token } = await registerUser("dismiss-missing");

    const response = await app.inject({
      method: "POST",
      url: "/api/opportunities/id-que-nao-existe/dismiss",
      cookies: { token },
    });

    expect(response.statusCode).toBe(404);
  });

  it("POST /api/opportunities/:id/dismiss marca a oportunidade como DISMISSED", async () => {
    const { token, userId } = await registerUser("dismiss-ok");
    const { opportunity } = await seedOpportunity(userId, { status: "NEW" });

    const response = await app.inject({
      method: "POST",
      url: `/api/opportunities/${opportunity.id}/dismiss`,
      cookies: { token },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: opportunity.id, status: "DISMISSED" });

    const updated = await prisma.opportunity.findUnique({ where: { id: opportunity.id } });
    expect(updated?.status).toBe("DISMISSED");
  });
});
