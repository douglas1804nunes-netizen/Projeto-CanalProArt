import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createYoutubeService } from "@canalproart/services";
import { env } from "../env.js";
import { prisma } from "../prisma.js";

const popularQuerySchema = z.object({
  regionCode: z.string().length(2, "regionCode precisa ter 2 letras (ex.: BR)").default("BR"),
});

export async function videoRoutes(app: FastifyInstance) {
  const youtubeService = createYoutubeService({ apiKey: env.YOUTUBE_API_KEY, prisma });

  // videos.list?chart=mostPopular (1 unidade de cota) — ver docs/YOUTUBE.md.
  // Ainda não é a Fase 6 ("/trends"): essa rota só expõe o YouTubeService
  // (Fase 5) pra ser chamada/testada; a UI de busca de tendências é depois.
  app.get("/api/videos/popular", { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = popularQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Parâmetros inválidos", details: parsed.error.flatten().fieldErrors });
    }

    try {
      const videos = await youtubeService.getPopularVideos(parsed.data.regionCode);
      return reply.send(videos);
    } catch (error) {
      app.log.error({ err: error }, "Falha ao buscar vídeos populares do YouTube");
      return reply.status(502).send({ error: "Falha ao buscar vídeos do YouTube" });
    }
  });
}
