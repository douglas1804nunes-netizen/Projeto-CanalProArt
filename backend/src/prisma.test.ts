import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "./prisma.js";

// Requer Postgres real rodando (docker compose up -d postgres) — sem mocks,
// conforme a regra do projeto de não simular integrações críticas.
describe("Prisma schema (Fase 2)", () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  it("cria um usuário com id cuid e timestamps automáticos", async () => {
    const user = await prisma.user.create({
      data: {
        email: `schema-test-${Date.now()}@example.com`,
        passwordHash: "hash",
        name: "Teste",
      },
    });
    createdUserIds.push(user.id);

    expect(user.id).toMatch(/^c[a-z0-9]{20,}$/);
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });

  it("rejeita e-mail duplicado (unique constraint)", async () => {
    const email = `schema-test-dup-${Date.now()}@example.com`;
    const user = await prisma.user.create({
      data: { email, passwordHash: "hash", name: "A" },
    });
    createdUserIds.push(user.id);

    await expect(
      prisma.user.create({ data: { email, passwordHash: "hash", name: "B" } }),
    ).rejects.toThrow();
  });

  it("apagar o usuário faz cascade em trend/opportunity/content_project relacionados", async () => {
    const user = await prisma.user.create({
      data: {
        email: `schema-test-cascade-${Date.now()}@example.com`,
        passwordHash: "hash",
        name: "Cascade",
      },
    });

    const trend = await prisma.trend.create({
      data: {
        userId: user.id,
        topic: "teste",
        regionCode: "BR",
        trendScore: 42,
        classification: "RISING",
        fetchedAt: new Date(),
      },
    });

    const opportunity = await prisma.opportunity.create({
      data: { userId: user.id, trendId: trend.id, score: 10 },
    });

    await prisma.contentProject.create({
      data: { userId: user.id, opportunityId: opportunity.id, title: "Projeto teste" },
    });

    await prisma.user.delete({ where: { id: user.id } });

    expect(await prisma.trend.findUnique({ where: { id: trend.id } })).toBeNull();
    expect(await prisma.opportunity.findUnique({ where: { id: opportunity.id } })).toBeNull();
    expect(await prisma.contentProject.count({ where: { userId: user.id } })).toBe(0);
  });
});
