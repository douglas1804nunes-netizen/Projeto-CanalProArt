import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

type ContentProjectStatus = "DRAFT" | "IN_PROGRESS" | "READY" | "PUBLISHED" | "ARCHIVED";

type Script = {
  id: string;
  content: string;
  version: number;
  createdAt: string;
};

type GeneratedTitle = {
  id: string;
  title: string;
  selected: boolean;
};

type GeneratedDescription = {
  id: string;
  description: string;
  selected: boolean;
};

type MediaUpload = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: string;
};

type ContentProjectDetail = {
  id: string;
  title: string;
  status: ContentProjectStatus;
  scripts: Script[];
  generatedTitles: GeneratedTitle[];
  generatedDescriptions: GeneratedDescription[];
  mediaUpload: MediaUpload | null;
};

function formatFileSize(bytes: string): string {
  const value = Number(bytes);
  if (!Number.isFinite(value)) return bytes;
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}GB`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}MB`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}KB`;
  return `${value}B`;
}

type DetailState =
  | { status: "loading" }
  | { status: "success"; project: ContentProjectDetail }
  | { status: "not-found" }
  | { status: "error"; message: string };

const STATUS_LABELS: Record<ContentProjectStatus, string> = {
  DRAFT: "Rascunho",
  IN_PROGRESS: "Em andamento",
  READY: "Pronto",
  PUBLISHED: "Publicado",
  ARCHIVED: "Arquivado",
};

const STATUS_OPTIONS: ContentProjectStatus[] = [
  "DRAFT",
  "IN_PROGRESS",
  "READY",
  "PUBLISHED",
  "ARCHIVED",
];

export function ContentProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<DetailState>({ status: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadProject = useCallback(async () => {
    if (!id) return;
    try {
      const response = await fetch(`/api/content-projects/${id}`, { credentials: "include" });
      if (response.status === 404) {
        setState({ status: "not-found" });
        return;
      }
      if (!response.ok) {
        setState({
          status: "error",
          message: `Não foi possível carregar o projeto (HTTP ${response.status}).`,
        });
        return;
      }
      const project = (await response.json()) as ContentProjectDetail;
      setState({ status: "success", project });
    } catch {
      setState({ status: "error", message: "Não foi possível conectar ao backend." });
    }
  }, [id]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  async function runAction(key: string, request: () => Promise<Response>) {
    setBusy(key);
    setActionError(null);
    try {
      const response = await request();
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setActionError(body.error ?? `Ação falhou (HTTP ${response.status}).`);
        return;
      }
      await loadProject();
    } catch {
      setActionError("Não foi possível conectar ao backend.");
    } finally {
      setBusy(null);
    }
  }

  async function handleStatusChange(status: ContentProjectStatus) {
    await runAction("status", () =>
      fetch(`/api/content-projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      }),
    );
  }

  async function handleGenerateScript() {
    await runAction("script", () =>
      fetch(`/api/content-projects/${id}/generate-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      }),
    );
  }

  async function handleGenerateTitles() {
    await runAction("titles", () =>
      fetch(`/api/content-projects/${id}/generate-titles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      }),
    );
  }

  async function handleGenerateDescription() {
    await runAction("description", () =>
      fetch(`/api/content-projects/${id}/generate-description`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      }),
    );
  }

  async function handleSelectTitle(titleId: string) {
    await runAction(`title-${titleId}`, () =>
      fetch(`/api/content-projects/${id}/titles/${titleId}/select`, {
        method: "POST",
        credentials: "include",
      }),
    );
  }

  async function handleSelectDescription(descriptionId: string) {
    await runAction(`description-${descriptionId}`, () =>
      fetch(`/api/content-projects/${id}/descriptions/${descriptionId}/select`, {
        method: "POST",
        credentials: "include",
      }),
    );
  }

  async function handleUploadMedia() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    await runAction("media-upload", () =>
      fetch(`/api/content-projects/${id}/media`, {
        method: "POST",
        credentials: "include",
        body: formData,
      }),
    );
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleRemoveMedia() {
    await runAction("media-remove", () =>
      fetch(`/api/content-projects/${id}/media`, { method: "DELETE", credentials: "include" }),
    );
  }

  return (
    <div className="max-w-4xl">
      <Link to="/content" className="text-sm text-slate-500 hover:text-slate-700">
        ← Voltar aos conteúdos
      </Link>

      {state.status === "loading" && <p className="mt-6 text-sm text-slate-500">Carregando…</p>}
      {state.status === "not-found" && (
        <p className="mt-6 text-sm text-slate-500">Projeto não encontrado.</p>
      )}
      {state.status === "error" && <p className="mt-6 text-sm text-red-600">{state.message}</p>}

      {state.status === "success" && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{state.project.title}</h1>
            <select
              value={state.project.status}
              onChange={(event) =>
                void handleStatusChange(event.target.value as ContentProjectStatus)
              }
              disabled={busy === "status"}
              className="rounded-full border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-700"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {STATUS_LABELS[option]}
                </option>
              ))}
            </select>
          </div>

          {actionError && <p className="mt-3 text-sm text-red-600">{actionError}</p>}

          <div className="mt-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-medium text-slate-700">Vídeo</h2>
            {state.project.mediaUpload ? (
              <div className="mt-3">
                <video
                  controls
                  src={`/api/content-projects/${id}/media/file`}
                  className="w-full rounded-md bg-black"
                />
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    {state.project.mediaUpload.fileName} ·{" "}
                    {formatFileSize(state.project.mediaUpload.sizeBytes)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleRemoveMedia()}
                    disabled={busy === "media-remove"}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
                  >
                    {busy === "media-remove" ? "Removendo…" : "Remover"}
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Nenhum vídeo enviado ainda.</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <input ref={fileInputRef} type="file" accept="video/*" className="text-sm" />
              <button
                type="button"
                onClick={() => void handleUploadMedia()}
                disabled={busy === "media-upload"}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
              >
                {busy === "media-upload"
                  ? "Enviando…"
                  : state.project.mediaUpload
                    ? "Substituir vídeo"
                    : "Enviar vídeo"}
              </button>
            </div>
          </div>

          <div className="mt-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-700">Roteiro</h2>
              <button
                type="button"
                onClick={() => void handleGenerateScript()}
                disabled={busy === "script"}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
              >
                {busy === "script" ? "Gerando…" : "Gerar roteiro"}
              </button>
            </div>
            {state.project.scripts.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Nenhum roteiro gerado ainda.</p>
            ) : (
              <div className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                {state.project.scripts[0]?.content}
              </div>
            )}
          </div>

          <div className="mt-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-700">Títulos</h2>
              <button
                type="button"
                onClick={() => void handleGenerateTitles()}
                disabled={busy === "titles"}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
              >
                {busy === "titles" ? "Gerando…" : "Gerar títulos"}
              </button>
            </div>
            {state.project.generatedTitles.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Nenhum título gerado ainda.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {state.project.generatedTitles.map((title) => (
                  <li key={title.id}>
                    <button
                      type="button"
                      onClick={() => void handleSelectTitle(title.id)}
                      disabled={busy === `title-${title.id}`}
                      className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 ${
                        title.selected
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {title.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-700">Descrição</h2>
              <button
                type="button"
                onClick={() => void handleGenerateDescription()}
                disabled={busy === "description" || state.project.scripts.length === 0}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
              >
                {busy === "description" ? "Gerando…" : "Gerar descrição"}
              </button>
            </div>
            {state.project.scripts.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Gere um roteiro antes da descrição.</p>
            ) : state.project.generatedDescriptions.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Nenhuma descrição gerada ainda.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {state.project.generatedDescriptions.map((description) => (
                  <li key={description.id}>
                    <button
                      type="button"
                      onClick={() => void handleSelectDescription(description.id)}
                      disabled={busy === `description-${description.id}`}
                      className={`w-full whitespace-pre-wrap rounded-md border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 ${
                        description.selected
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {description.description}
                    </button>
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
