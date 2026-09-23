import type { FastifyInstance } from "fastify";
import type { Video, VideoMetric } from "@prisma/client";
import { z } from "zod";
import { createYoutubeService } from "@canalproart/services";
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

function serializeVideo(video: Video, metric: VideoMetric | undefined) {
  return {
    id: video.id,
    youtubeVideoId: video.youtubeVideoId,
    channelTitle: video.channelTitle,
    title: video.title,
    thumbnailUrl: video.thumbnailUrl,
    publishedAt: video.publishedAt,
    durationSeconds: video.durationSeconds,
    // BigInt não serializa em JSON — vira string.
    viewCount: metric ? metric.viewCount.toString() : null,
    likeCount: metric ? metric.likeCount.toString() : null,
    commentCount: metric ? metric.commentCount.toString() : null,
  };
}

async function attachLatestMetrics(videos: Video[]) {
  if (videos.length === 0) return [];

  const metrics = await prisma.videoMetric.findMany({
    where: { videoId: { in: videos.map((v) => v.id) } },
    orderBy: { fetchedAt: "desc" },
  });

  const latestByVideoId = new Map<string, VideoMetric>();
  for (const metric of metrics) {
    if (!latestByVideoId.has(metric.videoId)) {
      latestByVideoId.set(metric.videoId, metric);
    }
  }

  return videos.map((video) => serializeVideo(video, latestByVideoId.get(video.id)));
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
        const videos = await attachLatestMetrics(cached.searchVideos.map((sv) => sv.video));
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

      const serializedVideos = await attachLatestMetrics(videos);
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
