import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import type { MappedYoutubeVideo } from "./mapper.js";
import { persistVideos } from "./persist.js";

// Requer Postgres real rodando — sem mocks (mesma regra do projeto). Não
// depende da YouTube Data API de verdade: os dados aqui são fabricados como
// se já tivessem vindo do client/mapper (essa parte, sim, exige uma API key
// real do Google e não é testada — ver docs/ARCHITECTURE.md).
describe("persistVideos", () => {
  const prisma = new PrismaClient();
  const createdVideoIds: string[] = [];

  afterAll(async () => {
    await prisma.videoMetric.deleteMany({ where: { videoId: { in: createdVideoIds } } });
    await prisma.video.deleteMany({ where: { id: { in: createdVideoIds } } });
    await prisma.$disconnect();
  });

  function fakeItem(youtubeVideoId: string, overrides: Partial<MappedYoutubeVideo> = {}) {
    return {
      video: {
        youtubeVideoId,
        channelId: "channel-1",
        channelTitle: "Canal Teste",
        title: "Vídeo de teste",
        description: "Descrição",
        publishedAt: new Date("2026-01-01T00:00:00Z"),
        thumbnailUrl: "https://example.com/thumb.jpg",
        durationSeconds: 120,
        categoryId: "22",
        tags: ["teste"],
        ...overrides.video,
      },
      metric: { viewCount: 100n, likeCount: 10n, commentCount: 1n, ...overrides.metric },
    };
  }

  it("cria um vídeo novo e uma métrica com fetchedAt preenchido", async () => {
    const youtubeVideoId = `persist-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const [saved] = await persistVideos(prisma, [fakeItem(youtubeVideoId)]);
    createdVideoIds.push(saved.id);

    expect(saved.youtubeVideoId).toBe(youtubeVideoId);
    expect(saved.fetchedAt).toBeInstanceOf(Date);

    const metrics = await prisma.videoMetric.findMany({ where: { videoId: saved.id } });
    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({ viewCount: 100n, likeCount: 10n, commentCount: 1n });
  });

  it("upsert por youtubeVideoId: chamar de novo atualiza o vídeo e adiciona uma nova métrica (não duplica o vídeo)", async () => {
    const youtubeVideoId = `persist-test-upsert-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const [first] = await persistVideos(prisma, [fakeItem(youtubeVideoId)]);
    createdVideoIds.push(first.id);

    const [second] = await persistVideos(prisma, [
      fakeItem(youtubeVideoId, {
        video: { title: "Título atualizado" },
        metric: { viewCount: 200n },
      }),
    ]);

    expect(second.id).toBe(first.id);
    expect(second.title).toBe("Título atualizado");

    const videosWithThisId = await prisma.video.findMany({ where: { youtubeVideoId } });
    expect(videosWithThisId).toHaveLength(1);

    const metrics = await prisma.videoMetric.findMany({ where: { videoId: first.id } });
    expect(metrics).toHaveLength(2);
    expect(metrics.map((m) => m.viewCount).sort()).toEqual([100n, 200n].sort());
  });

  it("persiste múltiplos vídeos de uma vez", async () => {
    const idA = `persist-test-multi-a-${Date.now()}`;
    const idB = `persist-test-multi-b-${Date.now()}`;

    const saved = await persistVideos(prisma, [fakeItem(idA), fakeItem(idB)]);
    createdVideoIds.push(...saved.map((v) => v.id));

    expect(saved).toHaveLength(2);
    expect(saved.map((v) => v.youtubeVideoId).sort()).toEqual([idA, idB].sort());
  });
});
