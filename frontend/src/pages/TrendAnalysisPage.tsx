import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type TrendClassification = "RISING" | "HOT" | "STABLE" | "DECLINING";

type AnalysisVideo = {
  id: string;
  youtubeVideoId: string;
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

const CLASSIFICATION_LABELS: Record<TrendClassification, string> = {
  HOT: "🔥 Em alta",
  RISING: "📈 Subindo",
  STABLE: "➡️ Estável",
  DECLINING: "📉 Caindo",
};

const CLASSIFICATION_STYLES: Record<TrendClassification, string> = {
  HOT: "bg-red-100 text-red-700",
  RISING: "bg-emerald-100 text-emerald-700",
  STABLE: "bg-slate-100 text-slate-600",
  DECLINING: "bg-amber-100 text-amber-700",
};

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
      <Link to="/" className="text-sm text-slate-500 hover:text-slate-700">
        ← Voltar ao dashboard
      </Link>

      {state.status === "loading" && <p className="mt-6 text-sm text-slate-500">Carregando…</p>}

      {state.status === "not-found" && (
        <p className="mt-6 text-sm text-slate-500">Tendência não encontrada.</p>
      )}

      {state.status === "error" && <p className="mt-6 text-sm text-red-600">{state.message}</p>}

      {state.status === "success" && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{state.data.topic}</h1>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${CLASSIFICATION_STYLES[state.data.classification]}`}
            >
              {CLASSIFICATION_LABELS[state.data.classification]} · {state.data.trendScore}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {state.data.regionCode} · {new Date(state.data.fetchedAt).toLocaleString("pt-BR")}
          </p>

          <div className="mt-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-medium text-slate-700">Histórico de score</h2>
            {state.data.history.length < 2 ? (
              <p className="mt-3 text-sm text-slate-500">
                Ainda não há histórico suficiente — o score muda conforme novas buscas para esse
                tópico/região forem feitas.
              </p>
            ) : (
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={state.data.history}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="fetchedAt"
                      tickFormatter={(value: string) => new Date(value).toLocaleDateString("pt-BR")}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis domain={[0, 100]} />
                    <Tooltip
                      labelFormatter={(value: string) => new Date(value).toLocaleString("pt-BR")}
                      formatter={(value: number) => [value, "Score"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="trendScore"
                      stroke="#0f172a"
                      strokeWidth={2}
                      dot
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="mt-8">
            <h2 className="text-sm font-medium text-slate-700">
              Composição do score ({state.data.videos.length}{" "}
              {state.data.videos.length === 1 ? "vídeo" : "vídeos"})
            </h2>
            {state.data.videos.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Nenhum vídeo associado.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {state.data.videos.map((video) => (
                  <li
                    key={video.id}
                    className="flex gap-4 rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    {video.thumbnailUrl && (
                      <a
                        href={`https://youtube.com/watch?v=${video.youtubeVideoId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Abrir "${video.title}" no YouTube`}
                        className="shrink-0"
                      >
                        <img
                          src={video.thumbnailUrl}
                          alt=""
                          className="h-20 w-32 rounded object-cover"
                        />
                      </a>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm font-medium text-slate-900">
                        {video.title}
                      </p>
                      <p className="text-xs text-slate-500">{video.channelTitle}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {formatViewCount(video.viewCount)} visualizações ·{" "}
                        {formatDuration(video.durationSeconds)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>Score do vídeo: {video.videoScore.toFixed(2)}</span>
                        <span>Engajamento: {(video.engagementRate * 100).toFixed(1)}%</span>
                        <span>Recência: {(video.recencyScore * 100).toFixed(0)}%</span>
                        {video.velocity !== null && (
                          <span>Velocidade: {Math.round(video.velocity)} views/h</span>
                        )}
                        <a
                          href={`https://youtube.com/watch?v=${video.youtubeVideoId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-slate-600 underline hover:text-slate-900"
                        >
                          Abrir no YouTube ↗
                        </a>
                      </div>
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
