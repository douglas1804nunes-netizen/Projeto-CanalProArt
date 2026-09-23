import type { FastifyInstance } from "fastify";
import type { Video, VideoMetric } from "@prisma/client";
import { z } from "zod";
import {
  calculateEngagementRate,
  calculateRecencyScore,
  calculateVelocity,
  createYoutubeService,
} from "@canalproart/services";
import { env } from "../env.js";
import { prisma } from "../prisma.js";

// Quanto tempo uma busca (mesmo userId/query/regionCode) é servida do cache
// em vez de gastar cota de novo — ver "Retenção e atualização de dados" em
// docs/YOUTUBE.md. 6h é um meio-termo razoável pra "tendências": não é tão
// curto que gaste cota a cada refresh de página, nem tão longo que a lista
// fique visivelmente desatualizada num dia de uso.
const SEARCH_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const searchBodySchema = z.object({
  query: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  regionCode: z.string().length(2, "regionCode precisa ter 2 letras (ex.: BR)").default("BR"),
});

// metrics[0] é o mais recente (a query que preenche isso ordena por
// fetchedAt desc) — os demais (se houver) alimentam calculateVelocity.
function serializeVideo(video: Video, metrics: VideoMetric[]) {
  const latest = metrics[0];

  return {
    id: video.id,
    youtubeVideoId: video.youtubeVideoId,
    channelTitle: video.channelTitle,
    title: video.title,
    thumbnailUrl: video.thumbnailUrl,
    publishedAt: video.publishedAt,
    durationSeconds: video.durationSeconds,
    // BigInt não serializa em JSON — vira string.
    viewCount: latest ? latest.viewCount.toString() : null,
    likeCount: latest ? latest.likeCount.toString() : null,
    commentCount: latest ? latest.commentCount.toString() : null,
    // Fase 7: métricas derivadas — ver services/src/youtube/metrics.ts.
    velocity: calculateVelocity(metrics), // views/hora; null com só 1 snapshot
    engagementRate: latest ? calculateEngagementRate(latest) : 0,
    recencyScore: calculateRecencyScore(video.publishedAt),
  };
}

async function attachMetrics(videos: Video[]) {
  if (videos.length === 0) return [];

  const metrics = await prisma.videoMetric.findMany({
    where: { videoId: { in: videos.map((v) => v.id) } },
    orderBy: { fetchedAt: "desc" },
  });

  const metricsByVideoId = new Map<string, VideoMetric[]>();
  for (const metric of metrics) {
    const list = metricsByVideoId.get(metric.videoId);
    if (list) {
      list.push(metric);
    } else {
      metricsByVideoId.set(metric.videoId, [metric]);
    }
  }

  return videos.map((video) => serializeVideo(video, metricsByVideoId.get(video.id) ?? []));
}

export async function trendRoutes(app: FastifyInstance) {
  const youtubeService = createYoutubeService({ apiKey: env.YOUTUBE_API_KEY, prisma });

  app.post(
    "/api/trends/search",
    {
      preHandler: [app.authenticate],
      // Cada busca com palavra-chave custa até 101 unidades de cota (10.000/dia
      // no total) — limite mais apertado que o das rotas de auth.
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const parsed = searchBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "Parâmetros inválidos", details: parsed.error.flatten().fieldErrors });
      }
      const { query, regionCode } = parsed.data;

      const cached = await prisma.search.findFirst({
        where: {
          userId: request.user.sub,
          regionCode,
          query: query ?? null,
          fetchedAt: { gte: new Date(Date.now() - SEARCH_CACHE_TTL_MS) },
        },
        orderBy: { fetchedAt: "desc" },
        include: { searchVideos: { orderBy: { rank: "asc" }, include: { video: true } } },
      });

      if (cached) {
        const videos = await attachMetrics(cached.searchVideos.map((sv) => sv.video));
        return reply.send({
          searchId: cached.id,
          cached: true,
          fetchedAt: cached.fetchedAt,
          videos,
        });
      }

      let videos: Video[];
      try {
        videos = query
          ? await youtubeService.searchTrendingVideos(query, regionCode)
          : await youtubeService.getPopularVideos(regionCode);
      } catch (error) {
        app.log.error({ err: error }, "Falha ao buscar vídeos do YouTube");
        return reply.status(502).send({ error: "Falha ao buscar vídeos do YouTube" });
      }

      const fetchedAt = new Date();
      const search = await prisma.search.create({
        data: {
          userId: request.user.sub,
          query: query ?? null,
          regionCode,
          resultCount: videos.length,
          fetchedAt,
        },
      });

      if (videos.length > 0) {
        await prisma.searchVideo.createMany({
          data: videos.map((video, index) => ({
            searchId: search.id,
            videoId: video.id,
            rank: index,
          })),
        });
      }

      const serializedVideos = await attachMetrics(videos);
      return reply.send({
        searchId: search.id,
        cached: false,
        fetchedAt,
        videos: serializedVideos,
      });
    },
  );

  app.get("/api/trends/searches", { preHandler: [app.authenticate] }, async (request, reply) => {
    const searches = await prisma.search.findMany({
      where: { userId: request.user.sub },
      orderBy: { fetchedAt: "desc" },
      take: 10,
    });
    return reply.send(searches);
  });
}
