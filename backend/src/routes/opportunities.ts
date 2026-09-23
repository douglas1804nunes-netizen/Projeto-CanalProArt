import type { FastifyInstance } from "fastify";
import { prisma } from "../prisma.js";

export async function opportunityRoutes(app: FastifyInstance) {
  app.get("/api/opportunities", { preHandler: [app.authenticate] }, async (request, reply) => {
    const opportunities = await prisma.opportunity.findMany({
      where: { userId: request.user.sub },
      orderBy: { score: "desc" },
      include: { trend: true },
    });

    return reply.send(
      opportunities.map((opportunity) => ({
        id: opportunity.id,
        score: opportunity.score,
        status: opportunity.status,
        createdAt: opportunity.createdAt,
        topic: opportunity.trend.topic,
        regionCode: opportunity.trend.regionCode,
        classification: opportunity.trend.classification,
      })),
    );
  });

  // Não modela IN_PROGRESS/CONVERTED ainda — esses dois só fazem sentido
  // quando existir um ContentProject de verdade pra ligar (Fase 12).
  // Dismiss é a única ação que já é 100% independente de fases futuras.
  app.post(
    "/api/opportunities/:id/dismiss",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const opportunity = await prisma.opportunity.findUnique({ where: { id } });
      if (!opportunity || opportunity.userId !== request.user.sub) {
        return reply.status(404).send({ error: "Oportunidade não encontrada" });
      }

      const updated = await prisma.opportunity.update({
        where: { id },
        data: { status: "DISMISSED" },
      });

      return reply.send({ id: updated.id, status: updated.status });
    },
  );
}
