import type { FastifyInstance } from "fastify";
import type { Video, VideoMetric } from "@prisma/client";
import { z } from "zod";
import {
  calculateEngagementRate,
  calculateRecencyScore,
  calculateTrendScore,
  calculateVelocity,
  calculateVideoScore,
  calculateVolumeScore,
  classifyTrend,
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

// "populares" é o topic usado pra buscas sem palavra-chave (query null) —
// Trend.topic é obrigatório no schema, diferente de Search.query (que pode
// ser null representando "sem filtro").
const DEFAULT_TOPIC = "populares";

const searchBodySchema = z.object({
  query: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  regionCode: z.string().length(2, "regionCode precisa ter 2 letras (ex.: BR)").default("BR"),
});

type SerializedVideo = ReturnType<typeof serializeVideo>;

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

async function attachMetrics(videos: Video[]): Promise<SerializedVideo[]> {
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

// Fase 8: agrega os scores individuais dos vídeos num trendScore único,
// classifica comparando com o Trend anterior do mesmo tópico/região (se
// existir) e persiste Trend + TrendVideo. Não roda em cache-hit (ver
// chamador) — só quando a busca é nova de verdade, senão cada reload de
// página criaria um Trend duplicado.
async function createTrend(params: {
  userId: string;
  topic: string;
  regionCode: string;
  videos: SerializedVideo[];
  fetchedAt: Date;
}) {
  const { userId, topic, regionCode, videos, fetchedAt } = params;

  const videoScores = videos.map((video) =>
    calculateVideoScore({
      velocity: video.velocity,
      engagementRate: video.engagementRate,
      recencyScore: video.recencyScore,
    }),
  );
  const volumeScore = calculateVolumeScore(videos.length);
  const trendScoreValue = calculateTrendScore(videoScores, volumeScore);

  const previousTrend = await prisma.trend.findFirst({
    where: { userId, topic, regionCode },
    orderBy: { fetchedAt: "desc" },
  });
  const classification = classifyTrend(trendScoreValue, previousTrend?.trendScore ?? null);

  const trend = await prisma.trend.create({
    data: { userId, topic, regionCode, trendScore: trendScoreValue, classification, fetchedAt },
  });

  if (videos.length > 0) {
    await prisma.trendVideo.createMany({
      data: videos.map((video, index) => ({ trendId: trend.id, videoId: video.id, rank: index })),
    });
  }

  await maybeCreateOpportunity(trend);

  return trend;
}

// Fase 9: todo Trend HOT/RISING vira uma Opportunity (score = trendScore,
// status NEW) — é o sinal de "vale a pena produzir conteúdo sobre isso".
// STABLE/DECLINING não geram oportunidade nova. Cada Trend só gera uma
// Opportunity (checa se já existe antes de criar).
export async function maybeCreateOpportunity(trend: {
  id: string;
  userId: string;
  trendScore: number;
  classification: string;
}) {
  if (trend.classification !== "HOT" && trend.classification !== "RISING") return;

  const existing = await prisma.opportunity.findFirst({ where: { trendId: trend.id } });
  if (existing) return;

  await prisma.opportunity.create({
    data: { userId: trend.userId, trendId: trend.id, score: trend.trendScore, status: "NEW" },
  });
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
      const topic = query ?? DEFAULT_TOPIC;
      const userId = request.user.sub;

      const cached = await prisma.search.findFirst({
        where: {
          userId,
          regionCode,
          query: query ?? null,
          fetchedAt: { gte: new Date(Date.now() - SEARCH_CACHE_TTL_MS) },
        },
        orderBy: { fetchedAt: "desc" },
        include: { searchVideos: { orderBy: { rank: "asc" }, include: { video: true } } },
      });

      if (cached) {
        const videos = await attachMetrics(cached.searchVideos.map((sv) => sv.video));
        // Só lê o Trend já calculado (se existir) — cache-hit não recalcula
        // nem persiste de novo.
        const trend = await prisma.trend.findFirst({
          where: { userId, topic, regionCode },
          orderBy: { fetchedAt: "desc" },
        });
        return reply.send({
          searchId: cached.id,
          cached: true,
          fetchedAt: cached.fetchedAt,
          trend: trend ? { score: trend.trendScore, classification: trend.classification } : null,
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
        data: { userId, query: query ?? null, regionCode, resultCount: videos.length, fetchedAt },
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
      const trend = await createTrend({
        userId,
        topic,
        regionCode,
        videos: serializedVideos,
        fetchedAt,
      });

      return reply.send({
        searchId: search.id,
        cached: false,
        fetchedAt,
        trend: { score: trend.trendScore, classification: trend.classification },
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

  // Fase 8: lista os trends já calculados do usuário, mais recentes primeiro
  // — visão geral do que foi classificado como HOT/RISING/etc. até agora.
  app.get("/api/trends", { preHandler: [app.authenticate] }, async (request, reply) => {
    const trends = await prisma.trend.findMany({
      where: { userId: request.user.sub },
      orderBy: { fetchedAt: "desc" },
      take: 20,
    });
    return reply.send(trends);
  });
}
