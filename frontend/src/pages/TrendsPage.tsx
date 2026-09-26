import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Cover } from "../components/Cover";
import { VideoLink } from "../components/VideoLink";
import { getDefaultRegion } from "../preferences";
import { ClassificationBadge, type TrendClassification } from "../components/ClassificationBadge";

type TrendVideo = {
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
  // Fase 7 — ver services/src/youtube/metrics.ts
  velocity: number | null;
  engagementRate: number;
  recencyScore: number;
};

type SearchResult = {
  searchId: string;
  cached: boolean;
  fetchedAt: string;
  // Fase 8 — ver services/src/youtube/trendScore.ts. null quando ainda não
  // existe um Trend calculado pra esse tópico/região (busca antiga, de
  // antes da Fase 8, servida do cache).
  trend: { id: string; score: number; classification: TrendClassification } | null;
  videos: TrendVideo[];
};

type RecentSearch = {
  id: string;
  query: string | null;
  regionCode: string;
  resultCount: number;
  fetchedAt: string;
  // Miniatura do vídeo #1 da pesquisa (null se a pesquisa ficou sem vídeos).
  coverUrl: string | null;
};

type ResultState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: SearchResult }
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

function formatVelocity(value: number | null): string | null {
  if (value === null) return null;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}mil views/h`;
  return `${Math.round(value)} views/h`;
}

export function TrendsPage() {
  const [query, setQuery] = useState("");
  const [regionCode, setRegionCode] = useState(getDefaultRegion);
  const [state, setState] = useState<ResultState>({ status: "idle" });
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadRecentSearches = useCallback(async () => {
    try {
      const response = await fetch("/api/trends/searches", { credentials: "include" });
      if (!response.ok) return;
      setRecentSearches((await response.json()) as RecentSearch[]);
    } catch {
      // histórico é só um atalho de UX — não bloqueia a busca principal se falhar
    }
  }, []);

  useEffect(() => {
    void loadRecentSearches();
  }, [loadRecentSearches]);

  async function runSearch(searchQuery: string, searchRegion: string) {
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/trends/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ query: searchQuery || undefined, regionCode: searchRegion }),
      });

      if (!response.ok) {
        setState({
          status: "error",
          message: `Não foi possível buscar (HTTP ${response.status}).`,
        });
        return;
      }

      const result = (await response.json()) as SearchResult;
      setState({ status: "success", result });
      void loadRecentSearches();
    } catch {
      setState({ status: "error", message: "Não foi possível conectar ao backend." });
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void runSearch(query, regionCode);
  }

  function handleRecentSearchClick(search: RecentSearch) {
    setQuery(search.query ?? "");
    setRegionCode(search.regionCode);
    void runSearch(search.query ?? "", search.regionCode);
  }

  async function handleDeleteSearch(search: RecentSearch) {
    setHistoryError(null);
    try {
      const response = await fetch(`/api/trends/searches/${search.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      // 404 = já foi removida (outra aba, por exemplo) — some da lista igual.
      if (!response.ok && response.status !== 404) {
        setHistoryError("Não foi possível excluir a pesquisa.");
        return;
      }
      setRecentSearches((current) => current.filter((item) => item.id !== search.id));
    } catch {
      setHistoryError("Não foi possível conectar ao backend.");
    }
  }

  async function handleClearHistory() {
    // O histórico também é o cache das buscas — repetir uma busca apagada
    // gasta cota do YouTube de novo, então vale confirmar.
    const confirmed = window.confirm(
      "Excluir todo o histórico de pesquisas? Repetir uma busca depois vai gastar cota do YouTube de novo.",
    );
    if (!confirmed) return;

    setHistoryError(null);
    try {
      const response = await fetch("/api/trends/searches", {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        setHistoryError("Não foi possível limpar o histórico.");
        return;
      }
      setRecentSearches([]);
    } catch {
      setHistoryError("Não foi possível conectar ao backend.");
    }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="page-title text-2xl font-semibold tracking-tight">Tendências</h1>
      <p className="mt-1 text-sm text-muted">
        Descubra vídeos em alta no YouTube por região, ou busque por palavra-chave.
      </p>

      <form
        onSubmit={handleSubmit}
        className="glass mt-6 flex flex-wrap items-end gap-3 rounded-2xl p-4"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-fg-soft">Palavra-chave (opcional)</span>
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ex.: inteligência artificial"
            className="w-64 max-w-full rounded-xl border border-line-strong px-3.5 py-2.5 text-sm outline-none focus:border-neon-cyan"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-fg-soft">Região</span>
          <input
            type="text"
            value={regionCode}
            onChange={(event) => setRegionCode(event.target.value.toUpperCase())}
            maxLength={2}
            className="w-20 rounded-xl border border-line-strong px-3.5 py-2.5 text-sm uppercase outline-none focus:border-neon-cyan"
          />
        </label>

        <button
          type="submit"
          disabled={state.status === "loading"}
          className="btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
        >
          {state.status === "loading" ? "Buscando…" : "Buscar"}
        </button>
      </form>

      {recentSearches.length > 0 && (
        <section className="mt-4" aria-label="Pesquisas recentes">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-medium text-muted">Pesquisas recentes</h2>
            <button
              type="button"
              onClick={() => void handleClearHistory()}
              className="px-1 text-xs text-faint underline transition-colors hover:text-danger"
            >
              Limpar histórico
            </button>
          </div>
          <ul className="stagger mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {recentSearches.map((search) => {
              const label = `${search.query ?? "populares"} · ${search.regionCode}`;
              return (
                <li
                  key={search.id}
                  className="glass glass-hover relative overflow-hidden rounded-xl"
                >
                  <button
                    type="button"
                    onClick={() => handleRecentSearchClick(search)}
                    className="block w-full text-left transition-colors hover:bg-surface"
                  >
                    <Cover url={search.coverUrl} className="aspect-video w-full object-cover" />
                    <span className="block truncate px-2 pt-1.5 text-xs font-medium text-fg-soft">
                      {label}
                    </span>
                  </button>
                  <p className="px-2 pb-1.5 text-[11px] text-faint">
                    {search.resultCount} {search.resultCount === 1 ? "vídeo" : "vídeos"}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleDeleteSearch(search)}
                    aria-label={`Excluir pesquisa ${label}`}
                    title="Excluir pesquisa"
                    className="absolute top-1 right-1 rounded-full bg-surface-solid/90 px-1.5 py-0.5 text-xs text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {historyError && <p className="mt-2 text-xs text-danger">{historyError}</p>}

      <div className="mt-6">
        {state.status === "error" && <p className="text-sm text-danger">{state.message}</p>}

        {state.status === "success" && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <p className="text-xs text-faint">
                {state.result.cached ? "Resultado do cache" : "Buscado agora"} ·{" "}
                {new Date(state.result.fetchedAt).toLocaleString("pt-BR")}
              </p>
              {state.result.trend && (
                <ClassificationBadge
                  classification={state.result.trend.classification}
                  score={state.result.trend.score}
                />
              )}
              {state.result.trend && (
                <Link
                  to={`/trends/${state.result.trend.id}`}
                  className="text-xs text-muted underline hover:text-fg"
                >
                  Ver análise completa
                </Link>
              )}
            </div>
            {state.result.videos.length === 0 ? (
              <p className="text-sm text-muted">Nenhum vídeo encontrado.</p>
            ) : (
              <ul className="stagger grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {state.result.videos.map((video, index) => (
                  <li
                    key={video.id}
                    className="glass glass-hover group overflow-hidden rounded-2xl"
                  >
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Abrir "${video.title}" no YouTube`}
                      className="relative block overflow-hidden"
                    >
                      <Cover
                        url={video.thumbnailUrl}
                        className="aspect-video w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent"
                      />
                      <span
                        aria-hidden="true"
                        className="absolute top-2.5 left-2.5 rounded-full bg-black/60 px-2.5 py-0.5 text-[11px] font-bold text-white ring-1 ring-white/25 backdrop-blur"
                      >
                        #{index + 1}
                      </span>
                    </a>
                    <div className="p-3">
                      <p className="line-clamp-2 text-sm font-medium text-fg">{video.title}</p>
                      <p className="mt-1 text-xs text-muted">{video.channelTitle}</p>
                      <p className="mt-2 text-xs text-faint">
                        {formatViewCount(video.viewCount)} visualizações ·{" "}
                        {formatDuration(video.durationSeconds)}
                      </p>
                      <p className="mt-1 text-xs text-faint">
                        {(video.engagementRate * 100).toFixed(1)}% engajamento
                        {formatVelocity(video.velocity) && ` · ${formatVelocity(video.velocity)}`}
                      </p>
                      <a
                        href={video.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-block text-xs font-medium text-fg-soft underline hover:text-fg"
                      >
                        Abrir no YouTube ↗
                      </a>
                      <VideoLink url={video.url} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
