import type { FastifyInstance } from "fastify";
import { prisma } from "../prisma.js";

const TOP_TRENDS_LIMIT = 5;
const TOP_OPPORTUNITIES_LIMIT = 5;

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/api/dashboard", { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.sub;

    const [
      trendsCount,
      opportunitiesCount,
      contentProjectsCount,
      publishedVideosCount,
      analyzedVideos,
      topTrends,
      topOpportunities,
    ] = await Promise.all([
      prisma.trend.count({ where: { userId } }),
      prisma.opportunity.count({ where: { userId } }),
      // Sempre 0 até a Fase 12 (Content Projects) existir — a query já é a
      // certa, só não tem registro que bata com o where ainda.
      prisma.contentProject.count({ where: { userId } }),
      // Idem, até a Fase 17 (Upload pro YouTube). PublishedVideo não tem
      // userId direto — passa por youtubeAccount.
      prisma.publishedVideo.count({ where: { youtubeAccount: { userId } } }),
      // "Vídeos analisados" = vídeos distintos que apareceram em alguma
      // busca do usuário — Video é uma tabela de cache global (sem userId),
      // então a contagem por usuário passa pelo SearchVideo.
      prisma.searchVideo.findMany({
        where: { search: { userId } },
        select: { videoId: true },
        distinct: ["videoId"],
      }),
      prisma.trend.findMany({
        where: { userId },
        orderBy: { trendScore: "desc" },
        take: TOP_TRENDS_LIMIT,
      }),
      prisma.opportunity.findMany({
        where: { userId, status: "NEW" },
        orderBy: { score: "desc" },
        take: TOP_OPPORTUNITIES_LIMIT,
        include: { trend: true },
      }),
    ]);

    return reply.send({
      counts: {
        videosAnalyzed: analyzedVideos.length,
        trends: trendsCount,
        opportunities: opportunitiesCount,
        contentProjects: contentProjectsCount,
        publishedVideos: publishedVideosCount,
      },
      topTrends: topTrends.map((trend) => ({
        id: trend.id,
        topic: trend.topic,
        regionCode: trend.regionCode,
        trendScore: trend.trendScore,
        classification: trend.classification,
      })),
      topOpportunities: topOpportunities.map((opportunity) => ({
        id: opportunity.id,
        trendId: opportunity.trendId,
        score: opportunity.score,
        status: opportunity.status,
        topic: opportunity.trend.topic,
        regionCode: opportunity.trend.regionCode,
        classification: opportunity.trend.classification,
      })),
    });
  });
}
