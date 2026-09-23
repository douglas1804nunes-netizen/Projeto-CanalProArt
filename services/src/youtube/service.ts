import type { PrismaClient, Video } from "@prisma/client";
import { fetchPopularVideos, fetchVideosByIds } from "./client.js";
import { mapYoutubeVideoItem } from "./mapper.js";
import { persistVideos } from "./persist.js";

export type YoutubeServiceConfig = {
  apiKey: string;
  prisma: PrismaClient;
};

// Consumido por backend/ (rotas HTTP) e, a partir da Fase 21+, por workers/
// (BullMQ) — por isso não guarda estado global nem lê process.env direto: a
// config (API key, PrismaClient) é injetada por quem chama.
export function createYoutubeService({ apiKey, prisma }: YoutubeServiceConfig) {
  return {
    // videos.list?chart=mostPopular (1 unidade) — forma preferida de
    // descobrir tendências, bem mais barata que search.list.
    async getPopularVideos(regionCode: string, maxResults = 25): Promise<Video[]> {
      const items = await fetchPopularVideos(apiKey, { regionCode, maxResults });
      return persistVideos(prisma, items.map(mapYoutubeVideoItem));
    },

    // Atualiza métricas de vídeos já conhecidos (1 unidade, até 50 ids).
    async refreshVideos(videoIds: string[]): Promise<Video[]> {
      const items = await fetchVideosByIds(apiKey, videoIds);
      return persistVideos(prisma, items.map(mapYoutubeVideoItem));
    },
  };
}

export type YoutubeService = ReturnType<typeof createYoutubeService>;
