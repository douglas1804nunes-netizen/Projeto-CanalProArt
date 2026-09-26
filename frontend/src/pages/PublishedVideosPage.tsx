import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type PublishedVideoStatus = "PENDING" | "PUBLISHED" | "FAILED";

type PublishedVideo = {
  id: string;
  contentProjectId: string;
  contentProjectTitle: string;
  channelTitle: string;
  youtubeVideoId: string | null;
  status: PublishedVideoStatus;
  publishedAt: string | null;
  createdAt: string;
};

type ListState =
  | { status: "loading" }
  | { status: "success"; videos: PublishedVideo[] }
  | { status: "error"; message: string };

const STATUS_LABELS: Record<PublishedVideoStatus, string> = {
  PENDING: "Pendente",
  PUBLISHED: "Publicado",
  FAILED: "Falhou",
};

const STATUS_STYLES: Record<PublishedVideoStatus, string> = {
  PENDING: "bg-warn/15 text-warn",
  PUBLISHED: "bg-ok/15 text-ok",
  FAILED: "bg-danger/15 text-danger",
};

export function PublishedVideosPage() {
  const [state, setState] = useState<ListState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/published-videos", { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          setState({
            status: "error",
            message: `Não foi possível carregar o histórico (HTTP ${response.status}).`,
          });
          return;
        }
        const videos = (await response.json()) as PublishedVideo[];
        setState({ status: "success", videos });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", message: "Não foi possível conectar ao backend." });
      });

    return () => {
      controller.abort();
    };
  }, []);

  return (
    <div className="max-w-3xl">
      <h1 className="page-title text-2xl font-semibold tracking-tight">Vídeos</h1>
      <p className="mt-1 text-sm text-muted">
        Histórico de tentativas de publicação — sucessos e falhas.
      </p>

      <div className="mt-6">
        {state.status === "loading" && <p className="text-sm text-muted">Carregando…</p>}
        {state.status === "error" && <p className="text-sm text-danger">{state.message}</p>}

        {state.status === "success" && state.videos.length === 0 && (
          <p className="text-sm text-muted">Nenhuma publicação ainda.</p>
        )}

        {state.status === "success" && state.videos.length > 0 && (
          <ul className="divide-y divide-line glass rounded-2xl">
            {state.videos.map((video) => (
              <li key={video.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <Link
                    to={`/content/${video.contentProjectId}`}
                    className="text-sm font-medium text-fg hover:underline"
                  >
                    {video.contentProjectTitle}
                  </Link>
                  <p className="text-xs text-muted">
                    {video.channelTitle} · {new Date(video.createdAt).toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {video.status === "PUBLISHED" && video.youtubeVideoId && (
                    <a
                      href={`https://youtube.com/watch?v=${video.youtubeVideoId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-muted underline hover:text-fg"
                    >
                      Ver no YouTube
                    </a>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[video.status]}`}
                  >
                    {STATUS_LABELS[video.status]}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
