import type { PrismaClient, Video } from "@prisma/client";
import type { MappedYoutubeVideo } from "./mapper.js";

// Cacheia no banco (fetchedAt) em vez de só devolver os dados da API — ver
// "Retenção e atualização de dados" em docs/YOUTUBE.md. Separado de
// service.ts pra dar pra testar direto, sem precisar de uma chamada de
// verdade à YouTube Data API.
export async function persistVideos(
  prisma: PrismaClient,
  items: MappedYoutubeVideo[],
): Promise<Video[]> {
  const fetchedAt = new Date();
  const saved: Video[] = [];

  for (const { video, metric } of items) {
    const savedVideo = await prisma.video.upsert({
      where: { youtubeVideoId: video.youtubeVideoId },
      create: { ...video, fetchedAt },
      update: { ...video, fetchedAt },
    });

    await prisma.videoMetric.create({
      data: { videoId: savedVideo.id, ...metric, fetchedAt },
    });

    saved.push(savedVideo);
  }

  return saved;
}
