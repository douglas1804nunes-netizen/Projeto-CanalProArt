import type { VideoMetric } from "@prisma/client";

// Views por hora, entre o snapshot mais antigo e o mais novo disponíveis.
// Precisa de pelo menos 2 snapshots com fetchedAt diferentes — com só 1
// (o caso mais comum logo depois de a Fase 6 buscar um vídeo pela primeira
// vez, antes de existir histórico), devolve null em vez de um número
// enganoso.
export function calculateVelocity(
  metrics: Pick<VideoMetric, "viewCount" | "fetchedAt">[],
): number | null {
  if (metrics.length < 2) return null;

  const sorted = [...metrics].sort((a, b) => a.fetchedAt.getTime() - b.fetchedAt.getTime());
  const oldest = sorted[0]!;
  const newest = sorted[sorted.length - 1]!;

  const hoursElapsed = (newest.fetchedAt.getTime() - oldest.fetchedAt.getTime()) / (1000 * 60 * 60);
  if (hoursElapsed <= 0) return null;

  const viewsDelta = Number(newest.viewCount - oldest.viewCount);
  return viewsDelta / hoursElapsed;
}

// (likes + comentários) / views — proxy de quanto engajamento o vídeo gera
// em relação ao alcance que já teve. 0 se não tiver views (evita divisão
// por zero em vez de lançar).
export function calculateEngagementRate(
  metric: Pick<VideoMetric, "viewCount" | "likeCount" | "commentCount">,
): number {
  if (metric.viewCount === 0n) return 0;
  const engagement = Number(metric.likeCount + metric.commentCount);
  return engagement / Number(metric.viewCount);
}

// Decaimento exponencial: 1 = publicado agora, 0.5 depois de
// RECENCY_HALF_LIFE_DAYS, tende a 0 conforme envelhece. 7 dias é uma
// estimativa inicial pro ritmo do YouTube (uma semana já não é mais
// "novidade") — candidato a ajustar com dado real de uso, não uma
// constante definitiva.
const RECENCY_HALF_LIFE_DAYS = 7;

export function calculateRecencyScore(publishedAt: Date, now: Date = new Date()): number {
  const ageDays = Math.max(0, (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60 * 24));
  return Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
}

// Quantos vídeos sustentam um trend, normalizado em 0-1 com um teto
// (MAX_VOLUME_VIDEOS) — a partir daí, mais vídeo não aumenta mais o score,
// pra um trend com muitos vídeos genéricos não "ganhar" só por volume.
const MAX_VOLUME_VIDEOS = 25;

export function calculateVolumeScore(videoCount: number): number {
  return Math.min(1, videoCount / MAX_VOLUME_VIDEOS);
}
