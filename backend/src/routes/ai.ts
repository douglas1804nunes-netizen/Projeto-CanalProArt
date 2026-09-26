import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createAIProvider } from "@canalproart/services";
import { aiFailure } from "../ai/errors.js";
import { env } from "../env.js";

// Cada geração custa tokens de verdade (dinheiro) — limite mais apertado
// que rotas "de leitura", no mesmo espírito do rate limit de
// /api/trends/search (Fase 6).
const AI_RATE_LIMIT = { rateLimit: { max: 10, timeWindow: "1 minute" } };

const ideasBodySchema = z.object({
  topic: z.string().trim().min(1, "topic é obrigatório").max(200),
  count: z.number().int().min(1).max(10).optional(),
});

const scriptBodySchema = z.object({
  idea: z.string().trim().min(1, "idea é obrigatório").max(500),
});

const titlesBodySchema = z.object({
  topic: z.string().trim().min(1, "topic é obrigatório").max(200),
  script: z.string().trim().max(10_000).optional(),
  count: z.number().int().min(1).max(10).optional(),
});

const descriptionBodySchema = z.object({
  title: z.string().trim().min(1, "title é obrigatório").max(200),
  script: z.string().trim().min(1, "script é obrigatório").max(10_000),
});

export async function aiRoutes(app: FastifyInstance) {
  const aiProvider = createAIProvider({ provider: env.AI_PROVIDER, apiKey: env.ANTHROPIC_API_KEY });

  app.post(
    "/api/ai/ideas",
    { preHandler: [app.authenticate], config: AI_RATE_LIMIT },
    async (request, reply) => {
      const parsed = ideasBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "Parâmetros inválidos", details: parsed.error.flatten().fieldErrors });
      }
      try {
        const ideas = await aiProvider.generateIdeas(parsed.data);
        return reply.send({ ideas });
      } catch (error) {
        app.log.error({ err: error }, "Falha ao gerar ideias com IA");
        const failure = aiFailure(error, "Falha ao gerar ideias com IA");
        return reply.status(failure.status).send({ error: failure.message });
      }
    },
  );

  app.post(
    "/api/ai/script",
    { preHandler: [app.authenticate], config: AI_RATE_LIMIT },
    async (request, reply) => {
      const parsed = scriptBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "Parâmetros inválidos", details: parsed.error.flatten().fieldErrors });
      }
      try {
        const script = await aiProvider.generateScript(parsed.data);
        return reply.send({ script });
      } catch (error) {
        app.log.error({ err: error }, "Falha ao gerar roteiro com IA");
        const failure = aiFailure(error, "Falha ao gerar roteiro com IA");
        return reply.status(failure.status).send({ error: failure.message });
      }
    },
  );

  app.post(
    "/api/ai/titles",
    { preHandler: [app.authenticate], config: AI_RATE_LIMIT },
    async (request, reply) => {
      const parsed = titlesBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "Parâmetros inválidos", details: parsed.error.flatten().fieldErrors });
      }
      try {
        const titles = await aiProvider.generateTitles(parsed.data);
        return reply.send({ titles });
      } catch (error) {
        app.log.error({ err: error }, "Falha ao gerar títulos com IA");
        const failure = aiFailure(error, "Falha ao gerar títulos com IA");
        return reply.status(failure.status).send({ error: failure.message });
      }
    },
  );

  app.post(
    "/api/ai/description",
    { preHandler: [app.authenticate], config: AI_RATE_LIMIT },
    async (request, reply) => {
      const parsed = descriptionBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "Parâmetros inválidos", details: parsed.error.flatten().fieldErrors });
      }
      try {
        const description = await aiProvider.generateDescription(parsed.data);
        return reply.send({ description });
      } catch (error) {
        app.log.error({ err: error }, "Falha ao gerar descrição com IA");
        const failure = aiFailure(error, "Falha ao gerar descrição com IA");
        return reply.status(failure.status).send({ error: failure.message });
      }
    },
  );
}
