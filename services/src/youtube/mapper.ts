import type { YoutubeApiVideoItem } from "./client.js";

// "PT#H#M#S" (ISO 8601) -> segundos. Formato usado por contentDetails.duration.
export function parseIso8601Duration(duration: string): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(duration);
  if (!match) return 0;

  const [, hours, minutes, seconds] = match;
  return Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0);
}

export type MappedVideo = {
  youtubeVideoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  description: string;
  publishedAt: Date;
  thumbnailUrl: string;
  durationSeconds: number;
  categoryId: string | null;
  tags: string[];
};

export type MappedMetric = {
  viewCount: bigint;
  likeCount: bigint;
  commentCount: bigint;
};

export type MappedYoutubeVideo = { video: MappedVideo; metric: MappedMetric };

export function mapYoutubeVideoItem(item: YoutubeApiVideoItem): MappedYoutubeVideo {
  const thumbnailUrl =
    item.snippet.thumbnails.high?.url ??
    item.snippet.thumbnails.medium?.url ??
    item.snippet.thumbnails.default?.url ??
    "";

  return {
    video: {
      youtubeVideoId: item.id,
      channelId: item.snippet.channelId,
      channelTitle: item.snippet.channelTitle,
      title: item.snippet.title,
      description: item.snippet.description,
      publishedAt: new Date(item.snippet.publishedAt),
      thumbnailUrl,
      durationSeconds: parseIso8601Duration(item.contentDetails.duration),
      categoryId: item.snippet.categoryId ?? null,
      tags: item.snippet.tags ?? [],
    },
    metric: {
      viewCount: BigInt(item.statistics.viewCount ?? "0"),
      likeCount: BigInt(item.statistics.likeCount ?? "0"),
      commentCount: BigInt(item.statistics.commentCount ?? "0"),
    },
  };
}
