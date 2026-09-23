import { describe, expect, it } from "vitest";
import type { YoutubeApiVideoItem } from "./client.js";
import { mapYoutubeVideoItem, parseIso8601Duration } from "./mapper.js";

describe("parseIso8601Duration", () => {
  it("converte horas, minutos e segundos combinados", () => {
    expect(parseIso8601Duration("PT1H2M3S")).toBe(3723);
  });

  it("converte só minutos e segundos", () => {
    expect(parseIso8601Duration("PT4M13S")).toBe(253);
  });

  it("converte só segundos", () => {
    expect(parseIso8601Duration("PT30S")).toBe(30);
  });

  it("devolve 0 para formato inválido", () => {
    expect(parseIso8601Duration("não é duração")).toBe(0);
  });
});

describe("mapYoutubeVideoItem", () => {
  function buildItem(overrides: Partial<YoutubeApiVideoItem> = {}): YoutubeApiVideoItem {
    return {
      id: "abc123",
      snippet: {
        channelId: "channel-1",
        channelTitle: "Canal Teste",
        title: "Título do vídeo",
        description: "Descrição do vídeo",
        publishedAt: "2026-01-15T10:00:00Z",
        thumbnails: { high: { url: "https://example.com/high.jpg" } },
        tags: ["tag1", "tag2"],
        categoryId: "22",
      },
      contentDetails: { duration: "PT10M5S" },
      statistics: { viewCount: "1000", likeCount: "50", commentCount: "5" },
      ...overrides,
    };
  }

  it("mapeia os campos do vídeo corretamente", () => {
    const { video } = mapYoutubeVideoItem(buildItem());

    expect(video).toEqual({
      youtubeVideoId: "abc123",
      channelId: "channel-1",
      channelTitle: "Canal Teste",
      title: "Título do vídeo",
      description: "Descrição do vídeo",
      publishedAt: new Date("2026-01-15T10:00:00Z"),
      thumbnailUrl: "https://example.com/high.jpg",
      durationSeconds: 605,
      categoryId: "22",
      tags: ["tag1", "tag2"],
    });
  });

  it("mapeia as métricas como bigint", () => {
    const { metric } = mapYoutubeVideoItem(buildItem());

    expect(metric).toEqual({ viewCount: 1000n, likeCount: 50n, commentCount: 5n });
  });

  it("usa thumbnail medium/default quando high não existe", () => {
    const { video } = mapYoutubeVideoItem(
      buildItem({
        snippet: {
          ...buildItem().snippet,
          thumbnails: { default: { url: "https://example.com/default.jpg" } },
        },
      }),
    );

    expect(video.thumbnailUrl).toBe("https://example.com/default.jpg");
  });

  it("trata tags/categoryId ausentes e estatísticas ausentes", () => {
    const item = buildItem({
      snippet: {
        ...buildItem().snippet,
        tags: undefined,
        categoryId: undefined,
      },
      statistics: {},
    });

    const { video, metric } = mapYoutubeVideoItem(item);

    expect(video.tags).toEqual([]);
    expect(video.categoryId).toBeNull();
    expect(metric).toEqual({ viewCount: 0n, likeCount: 0n, commentCount: 0n });
  });
});
