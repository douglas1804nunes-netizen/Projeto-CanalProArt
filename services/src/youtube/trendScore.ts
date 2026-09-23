import type { TrendClassification } from "@prisma/client";

export type VideoScoreInput = {
  velocity: number | null;
  engagementRate: number;
  recencyScore: number;
};

// Normaliza velocidade (views/hora, sem teto natural) numa escala 0-1 via
// log10 — a diferença entre 1k e 10k views/h importa mais que entre 100k e
// 1M (ambos "muito rápido"). MAX_VELOCITY_LOG10 é só o teto de
// normalização (10^6 views/h), não um limite real de negócio.
const MAX_VELOCITY_LOG10 = 6;

function normalizeVelocity(velocity: number | null): number {
  if (velocity === null || velocity <= 0) return 0;
  return Math.min(1, Math.log10(velocity + 1) / MAX_VELOCITY_LOG10);
}

// ~5% de engajamento já é excelente pro YouTube — normaliza pra 1.0 nesse
// ponto em vez de exigir 100% (que não acontece na prática).
const ENGAGEMENT_CEILING = 0.05;

function normalizeEngagement(engagementRate: number): number {
  return Math.min(1, engagementRate / ENGAGEMENT_CEILING);
}

// Velocidade pesa mais — é o que diferencia "em alta" de "só popular".
// Engajamento e recência complementam. Pesos/tetos aqui são estimativas
// iniciais documentadas, não números validados com dado real de uso.
const WEIGHTS = { velocity: 0.5, engagement: 0.3, recency: 0.2 };

export function calculateVideoScore(input: VideoScoreInput): number {
  return (
    normalizeVelocity(input.velocity) * WEIGHTS.velocity +
    normalizeEngagement(input.engagementRate) * WEIGHTS.engagement +
    input.recencyScore * WEIGHTS.recency
  );
}

// Score do trend (0-100, mais legível que 0-1): média dos scores
// individuais dos vídeos, com um peso pequeno pro volume (mais vídeos
// sustentando o trend = mais confiança no sinal, não só um vídeo isolado
// bombando).
export function calculateTrendScore(videoScores: number[], volumeScore: number): number {
  if (videoScores.length === 0) return 0;
  const avgVideoScore = videoScores.reduce((sum, score) => sum + score, 0) / videoScores.length;
  return Math.round((avgVideoScore * 0.85 + volumeScore * 0.15) * 100);
}

// Score alto o suficiente já classifica HOT independente de histórico.
// Sem trend anterior pra comparar (1ª busca desse tópico/região), não dá
// pra saber trajetória — cai em STABLE por padrão. Com histórico, RISING/
// DECLINING dependem da variação passar de STABLE_DELTA pontos.
const HOT_THRESHOLD = 70;
const STABLE_DELTA = 5;

export function classifyTrend(score: number, previousScore: number | null): TrendClassification {
  if (score >= HOT_THRESHOLD) return "HOT";
  if (previousScore === null) return "STABLE";

  const delta = score - previousScore;
  if (delta > STABLE_DELTA) return "RISING";
  if (delta < -STABLE_DELTA) return "DECLINING";
  return "STABLE";
}
