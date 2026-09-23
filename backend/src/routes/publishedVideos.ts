import type { FastifyInstance } from "fastify";
import { prisma } from "../prisma.js";

// Fase 17: histórico de tentativas de publicação (sucesso e falha) — cada
// linha já existe desde a Fase 16 (POST .../publish cria um PublishedVideo
// em qualquer um dos dois casos). PublishedVideo não tem userId direto —
// passa por ContentProject, igual o resto do app faz pra outras tabelas
// sem userId próprio (ver dashboard.ts, Fase 9).
export async function publishedVideoRoutes(app: FastifyInstance) {
  app.get("/api/published-videos", { preHandler: [app.authenticate] }, async (request, reply) => {
    const publishedVideos = await prisma.publishedVideo.findMany({
      where: { contentProject: { userId: request.user.sub } },
      orderBy: { createdAt: "desc" },
      include: { contentProject: { select: { title: true } }, youtubeAccount: true },
    });

    return reply.send(
      publishedVideos.map((video) => ({
        id: video.id,
        contentProjectId: video.contentProjectId,
        contentProjectTitle: video.contentProject.title,
        channelTitle: video.youtubeAccount.channelTitle,
        youtubeVideoId: video.youtubeVideoId,
        status: video.status,
        rightsStatus: video.rightsStatus,
        containsSyntheticMedia: video.containsSyntheticMedia,
        publishedAt: video.publishedAt,
        createdAt: video.createdAt,
      })),
    );
  });
}
