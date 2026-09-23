import { useCallback, useEffect, useState, type FormEvent } from "react";

type TrendVideo = {
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
};

type SearchResult = { searchId: string; cached: boolean; fetchedAt: string; videos: TrendVideo[] };

type RecentSearch = {
  id: string;
  query: string | null;
  regionCode: string;
  resultCount: number;
  fetchedAt: string;
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

export function TrendsPage() {
  const [query, setQuery] = useState("");
  const [regionCode, setRegionCode] = useState("BR");
  const [state, setState] = useState<ResultState>({ status: "idle" });
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);

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

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Tendências</h1>
      <p className="mt-1 text-sm text-slate-500">
        Descubra vídeos em alta no YouTube por região, ou busque por palavra-chave.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Palavra-chave (opcional)</span>
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ex.: inteligência artificial"
            className="w-64 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Região</span>
          <input
            type="text"
            value={regionCode}
            onChange={(event) => setRegionCode(event.target.value.toUpperCase())}
            maxLength={2}
            className="w-20 rounded-md border border-slate-300 px-3 py-2 text-sm uppercase outline-none focus:border-slate-500"
          />
        </label>

        <button
          type="submit"
          disabled={state.status === "loading"}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
        >
          {state.status === "loading" ? "Buscando…" : "Buscar"}
        </button>
      </form>

      {recentSearches.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {recentSearches.map((search) => (
            <button
              key={search.id}
              type="button"
              onClick={() => handleRecentSearchClick(search)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-100"
            >
              {search.query ?? "populares"} · {search.regionCode}
            </button>
          ))}
        </div>
      )}

      <div className="mt-6">
        {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}

        {state.status === "success" && (
          <>
            <p className="mb-3 text-xs text-slate-400">
              {state.result.cached ? "Resultado do cache" : "Buscado agora"} ·{" "}
              {new Date(state.result.fetchedAt).toLocaleString("pt-BR")}
            </p>
            {state.result.videos.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum vídeo encontrado.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {state.result.videos.map((video) => (
                  <li
                    key={video.id}
                    className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
                  >
                    {video.thumbnailUrl && (
                      <img
                        src={video.thumbnailUrl}
                        alt={video.title}
                        className="aspect-video w-full object-cover"
                      />
                    )}
                    <div className="p-3">
                      <p className="line-clamp-2 text-sm font-medium text-slate-900">
                        {video.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{video.channelTitle}</p>
                      <p className="mt-2 text-xs text-slate-400">
                        {formatViewCount(video.viewCount)} visualizações ·{" "}
                        {formatDuration(video.durationSeconds)}
                      </p>
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
