import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { axisLineStroke, axisTick, gridStroke, tooltipProps } from "../components/chartTheme";
import { Cover } from "../components/Cover";
import { VideoLink } from "../components/VideoLink";
import { ClassificationBadge, type TrendClassification } from "../components/ClassificationBadge";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type AnalysisVideo = {
  id: string;
  youtubeVideoId: string;
  // Link pronto do vídeo no YouTube (montado pelo backend).
  url: string;
  channelTitle: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
  durationSeconds: number;
  viewCount: string | null;
  likeCount: string | null;
  commentCount: string | null;
  velocity: number | null;
  engagementRate: number;
  recencyScore: number;
  videoScore: number;
};

type HistoryPoint = {
  id: string;
  fetchedAt: string;
  trendScore: number;
  classification: TrendClassification;
};

type TrendAnalysis = {
  id: string;
  topic: string;
  regionCode: string;
  trendScore: number;
  classification: TrendClassification;
  fetchedAt: string;
  videos: AnalysisVideo[];
  history: HistoryPoint[];
};

type AnalysisState =
  | { status: "loading" }
  | { status: "success"; data: TrendAnalysis }
  | { status: "not-found" }
  | { status: "error"; message: string };

function formatViewCount(value: string | null): string {
  if (value === null) return "—";
  const count = Number(value);
  if (!Number.isFinite(count)) return value;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}mil`;
  return String(count);
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function TrendAnalysisPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<AnalysisState>({ status: "loading" });

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setState({ status: "loading" });

    fetch(`/api/trends/${id}`, { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) {
          setState({ status: "not-found" });
          return;
        }
        if (!response.ok) {
          setState({
            status: "error",
            message: `Não foi possível carregar a análise (HTTP ${response.status}).`,
          });
          return;
        }
        const data = (await response.json()) as TrendAnalysis;
        setState({ status: "success", data });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", message: "Não foi possível conectar ao backend." });
      });

    return () => {
      controller.abort();
    };
  }, [id]);

  return (
    <div className="max-w-4xl">
      <Link to="/" className="text-sm text-muted hover:text-fg">
        ← Voltar ao dashboard
      </Link>

      {state.status === "loading" && <p className="mt-6 text-sm text-muted">Carregando…</p>}

      {state.status === "not-found" && (
        <p className="mt-6 text-sm text-muted">Tendência não encontrada.</p>
      )}

      {state.status === "error" && <p className="mt-6 text-sm text-danger">{state.message}</p>}

      {state.status === "success" && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <h1 className="page-title text-2xl font-semibold tracking-tight">{state.data.topic}</h1>
            <ClassificationBadge
              classification={state.data.classification}
              score={state.data.trendScore}
            />
          </div>
          <p className="mt-1 text-sm text-muted">
            {state.data.regionCode} · {new Date(state.data.fetchedAt).toLocaleString("pt-BR")}
          </p>

          <div className="glass mt-8 rounded-2xl p-5">
            <h2 className="text-sm font-medium text-fg-soft">Histórico de score</h2>
            {state.data.history.length < 2 ? (
              <p className="mt-3 text-sm text-muted">
                Ainda não há histórico suficiente — o score muda conforme novas buscas para esse
                tópico/região forem feitas.
              </p>
            ) : (
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={state.data.history}>
                    <defs>
                      <linearGradient id="analysis-line" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" style={{ stopColor: "var(--grad-bar-a)" }} />
                        <stop offset="100%" style={{ stopColor: "var(--grad-bar-b)" }} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="fetchedAt"
                      tickFormatter={(value: string) => new Date(value).toLocaleDateString("pt-BR")}
                      tick={axisTick}
                      stroke={axisLineStroke}
                    />
                    <YAxis domain={[0, 100]} tick={axisTick} stroke={axisLineStroke} />
                    <Tooltip
                      {...tooltipProps}
                      labelFormatter={(value: string) => new Date(value).toLocaleString("pt-BR")}
                      formatter={(value: number) => [value, "Score"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="trendScore"
                      stroke="url(#analysis-line)"
                      strokeWidth={3}
                      dot={{
                        r: 4,
                        fill: "var(--c1)",
                        stroke: "var(--surface-solid)",
                        strokeWidth: 2,
                      }}
                      activeDot={{ r: 6 }}
                      animationDuration={1200}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="mt-8">
            <h2 className="text-sm font-medium text-fg-soft">
              Composição do score ({state.data.videos.length}{" "}
              {state.data.videos.length === 1 ? "vídeo" : "vídeos"})
            </h2>
            {state.data.videos.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Nenhum vídeo associado.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {state.data.videos.map((video) => (
                  <li key={video.id} className="flex gap-4 glass rounded-2xl p-3">
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Abrir "${video.title}" no YouTube`}
                      className="shrink-0"
                    >
                      <Cover url={video.thumbnailUrl} className="h-20 w-32 rounded object-cover" />
                    </a>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm font-medium text-fg">{video.title}</p>
                      <p className="text-xs text-muted">{video.channelTitle}</p>
                      <p className="mt-1 text-xs text-faint">
                        {formatViewCount(video.viewCount)} visualizações ·{" "}
                        {formatDuration(video.durationSeconds)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                        <span>Score do vídeo: {video.videoScore.toFixed(2)}</span>
                        <span>Engajamento: {(video.engagementRate * 100).toFixed(1)}%</span>
                        <span>Recência: {(video.recencyScore * 100).toFixed(0)}%</span>
                        {video.velocity !== null && (
                          <span>Velocidade: {Math.round(video.velocity)} views/h</span>
                        )}
                        <a
                          href={video.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-fg-soft underline hover:text-fg"
                        >
                          Abrir no YouTube ↗
                        </a>
                      </div>

                      <VideoLink url={video.url} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
