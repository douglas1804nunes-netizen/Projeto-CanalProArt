import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

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

type RightsStatus = "ORIGINAL" | "AUTHORIZED" | "LICENSED" | "PUBLIC_DOMAIN";

type MediaUpload = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: string;
  rightsStatus: RightsStatus | null;
  containsSyntheticMedia: boolean;
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

const RIGHTS_STATUS_LABELS: Record<RightsStatus, string> = {
  ORIGINAL: "Original (produzido por mim)",
  AUTHORIZED: "Autorizado pelo titular",
  LICENSED: "Licenciado",
  PUBLIC_DOMAIN: "Domínio público",
};

const RIGHTS_STATUS_OPTIONS: RightsStatus[] = [
  "ORIGINAL",
  "AUTHORIZED",
  "LICENSED",
  "PUBLIC_DOMAIN",
];

export function ContentProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<DetailState>({ status: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [importUrl, setImportUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rightsStatusRef = useRef<HTMLSelectElement>(null);
  const syntheticMediaRef = useRef<HTMLInputElement>(null);

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

  // Devolve se a ação deu certo — quem chama decide o que limpar (ex.: só
  // esvazia o campo de link quando a importação funcionou).
  async function runAction(key: string, request: () => Promise<Response>): Promise<boolean> {
    setBusy(key);
    setActionError(null);
    try {
      const response = await request();
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setActionError(body.error ?? `Ação falhou (HTTP ${response.status}).`);
        return false;
      }
      await loadProject();
      return true;
    } catch {
      setActionError("Não foi possível conectar ao backend.");
      return false;
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

  async function handleDeleteProject(title: string) {
    const confirmed = window.confirm(
      `Excluir "${title}"? Isso apaga o roteiro, os títulos, a descrição e o vídeo enviado ` +
        "deste conteúdo. Não dá para desfazer.",
    );
    if (!confirmed) return;

    setBusy("project-delete");
    setActionError(null);
    try {
      const response = await fetch(`/api/content-projects/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok && response.status !== 404) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setActionError(body.error ?? `Não foi possível excluir (HTTP ${response.status}).`);
        return;
      }
      // Não recarrega o projeto (ia dar 404): volta pra lista.
      navigate("/content", { replace: true });
    } catch {
      setActionError("Não foi possível conectar ao backend.");
    } finally {
      setBusy(null);
    }
  }

  async function handleImportMedia(event: FormEvent) {
    event.preventDefault();
    const url = importUrl.trim();
    if (!url) return;

    const imported = await runAction("media-import", () =>
      fetch(`/api/content-projects/${id}/media/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url }),
      }),
    );
    if (imported) setImportUrl("");
  }

  async function handleRemoveMedia() {
    await runAction("media-remove", () =>
      fetch(`/api/content-projects/${id}/media`, { method: "DELETE", credentials: "include" }),
    );
  }

  async function handleSaveRights() {
    const rightsStatus = rightsStatusRef.current?.value as RightsStatus | undefined;
    if (!rightsStatus) return;
    const containsSyntheticMedia = syntheticMediaRef.current?.checked ?? false;

    await runAction("rights", () =>
      fetch(`/api/content-projects/${id}/media/rights`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rightsStatus, containsSyntheticMedia }),
      }),
    );
  }

  return (
    <div className="max-w-4xl">
      <Link to="/content" className="text-sm text-muted hover:text-fg">
        ← Voltar aos conteúdos
      </Link>

      {state.status === "loading" && <p className="mt-6 text-sm text-muted">Carregando…</p>}
      {state.status === "not-found" && (
        <p className="mt-6 text-sm text-muted">Projeto não encontrado.</p>
      )}
      {state.status === "error" && <p className="mt-6 text-sm text-danger">{state.message}</p>}

      {state.status === "success" && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <h1 className="page-title text-2xl font-semibold tracking-tight">
              {state.project.title}
            </h1>
            <select
              value={state.project.status}
              onChange={(event) =>
                void handleStatusChange(event.target.value as ContentProjectStatus)
              }
              disabled={busy === "status"}
              className="rounded-full border border-line-strong px-2 py-0.5 text-xs font-medium text-fg-soft"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {STATUS_LABELS[option]}
                </option>
              ))}
            </select>
            <Link
              to={`/content/${id}/preview`}
              className="text-xs text-muted underline hover:text-fg"
            >
              Ver prévia
            </Link>
            <button
              type="button"
              onClick={() => void handleDeleteProject(state.project.title)}
              disabled={busy === "project-delete"}
              className="ml-auto rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-danger disabled:opacity-50"
            >
              {busy === "project-delete" ? "Excluindo…" : "Excluir conteúdo"}
            </button>
          </div>

          {actionError && <p className="mt-3 text-sm text-danger">{actionError}</p>}

          <div className="mt-8 glass rounded-2xl p-5">
            <h2 className="text-sm font-medium text-fg-soft">Vídeo</h2>
            {state.project.mediaUpload ? (
              <div className="mt-3">
                <video
                  controls
                  src={`/api/content-projects/${id}/media/file`}
                  className="w-full rounded-lg bg-black"
                />
                <div className="mt-2 flex items-center justify-between text-xs text-muted">
                  <span>
                    {state.project.mediaUpload.fileName} ·{" "}
                    {formatFileSize(state.project.mediaUpload.sizeBytes)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleRemoveMedia()}
                    disabled={busy === "media-remove"}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 btn-ghost"
                  >
                    {busy === "media-remove" ? "Removendo…" : "Remover"}
                  </button>
                </div>

                <div
                  key={`${state.project.mediaUpload.fileName}-${state.project.mediaUpload.sizeBytes}`}
                  className="mt-4 border-t border-line pt-4"
                >
                  <h3 className="text-xs font-medium text-fg-soft">Direitos do vídeo</h3>
                  {state.project.mediaUpload.rightsStatus && (
                    <p className="mt-1 text-xs text-ok">
                      Declarado: {RIGHTS_STATUS_LABELS[state.project.mediaUpload.rightsStatus]}
                      {state.project.mediaUpload.containsSyntheticMedia &&
                        " · contém mídia sintética"}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <select
                      ref={rightsStatusRef}
                      aria-label="Status de direitos"
                      defaultValue={state.project.mediaUpload.rightsStatus ?? ""}
                      className="rounded-lg border border-line-strong px-2 py-1.5 text-xs"
                    >
                      <option value="" disabled>
                        Selecione o status de direitos
                      </option>
                      {RIGHTS_STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {RIGHTS_STATUS_LABELS[option]}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1.5 text-xs text-fg-soft">
                      <input
                        ref={syntheticMediaRef}
                        type="checkbox"
                        defaultChecked={state.project.mediaUpload.containsSyntheticMedia}
                      />
                      Contém mídia sintética (gerada/alterada por IA)
                    </label>
                    <button
                      type="button"
                      onClick={() => void handleSaveRights()}
                      disabled={busy === "rights"}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 btn-ghost"
                    >
                      {busy === "rights" ? "Salvando…" : "Salvar declaração"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">Nenhum vídeo enviado ainda.</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <input ref={fileInputRef} type="file" accept="video/*" className="text-sm" />
              <button
                type="button"
                onClick={() => void handleUploadMedia()}
                disabled={busy === "media-upload"}
                className="rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 btn-ghost"
              >
                {busy === "media-upload"
                  ? "Enviando…"
                  : state.project.mediaUpload
                    ? "Substituir vídeo"
                    : "Enviar vídeo"}
              </button>
            </div>

            <form
              onSubmit={(event) => void handleImportMedia(event)}
              className="mt-4 border-t border-line pt-4"
            >
              <h3 className="text-xs font-medium text-fg-soft">Importar por link</h3>
              <p className="mt-1 text-xs text-muted">
                Cole o link direto de um arquivo de vídeo (.mp4, .mov, .webm…) que seja seu ou
                autorizado — depois é preciso declarar os direitos. Links do YouTube não funcionam:
                o CanalProArt não baixa vídeos do YouTube. É um vídeo seu do YouTube? Baixe o
                original no YouTube Studio (Conteúdo → ⋮ → Baixar) e use &quot;Enviar vídeo&quot;.
                No Dropbox, use <code>?dl=1</code> no fim do link.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="url"
                  value={importUrl}
                  onChange={(event) => setImportUrl(event.target.value)}
                  aria-label="Link do vídeo"
                  placeholder="https://exemplo.com/meu-video.mp4"
                  className="min-w-0 flex-1 rounded-lg border border-line-strong px-3 py-1.5 text-sm outline-none focus:border-neon-cyan"
                />
                <button
                  type="submit"
                  disabled={busy === "media-import" || importUrl.trim() === ""}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 btn-ghost"
                >
                  {busy === "media-import" ? "Baixando…" : "Importar"}
                </button>
              </div>
              {busy === "media-import" && (
                <p className="mt-2 text-xs text-muted">
                  Baixando o vídeo no servidor — arquivos grandes podem levar alguns minutos.
                  Mantenha esta página aberta.
                </p>
              )}
            </form>
          </div>

          <div className="mt-8 glass rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-fg-soft">Roteiro</h2>
              <button
                type="button"
                onClick={() => void handleGenerateScript()}
                disabled={busy === "script"}
                className="rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 btn-ghost"
              >
                {busy === "script" ? "Gerando…" : "Gerar roteiro"}
              </button>
            </div>
            {state.project.scripts.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Nenhum roteiro gerado ainda.</p>
            ) : (
              <div className="mt-3 whitespace-pre-wrap rounded-lg bg-surface p-3 text-sm text-fg-soft">
                {state.project.scripts[0]?.content}
              </div>
            )}
          </div>

          <div className="mt-8 glass rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-fg-soft">Títulos</h2>
              <button
                type="button"
                onClick={() => void handleGenerateTitles()}
                disabled={busy === "titles"}
                className="rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 btn-ghost"
              >
                {busy === "titles" ? "Gerando…" : "Gerar títulos"}
              </button>
            </div>
            {state.project.generatedTitles.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Nenhum título gerado ainda.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {state.project.generatedTitles.map((title) => (
                  <li key={title.id}>
                    <button
                      type="button"
                      onClick={() => void handleSelectTitle(title.id)}
                      disabled={busy === `title-${title.id}`}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 ${
                        title.selected
                          ? "border-neon-cyan bg-neon-cyan/10 text-fg shadow-[0_0_28px_-10px_var(--c1)]"
                          : "glass text-fg-soft hover:border-neon-violet/60 hover:text-fg"
                      }`}
                    >
                      {title.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-8 glass rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-fg-soft">Descrição</h2>
              <button
                type="button"
                onClick={() => void handleGenerateDescription()}
                disabled={busy === "description" || state.project.scripts.length === 0}
                className="rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 btn-ghost"
              >
                {busy === "description" ? "Gerando…" : "Gerar descrição"}
              </button>
            </div>
            {state.project.scripts.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Gere um roteiro antes da descrição.</p>
            ) : state.project.generatedDescriptions.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Nenhuma descrição gerada ainda.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {state.project.generatedDescriptions.map((description) => (
                  <li key={description.id}>
                    <button
                      type="button"
                      onClick={() => void handleSelectDescription(description.id)}
                      disabled={busy === `description-${description.id}`}
                      className={`w-full whitespace-pre-wrap rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 ${
                        description.selected
                          ? "border-neon-cyan bg-neon-cyan/10 text-fg shadow-[0_0_28px_-10px_var(--c1)]"
                          : "glass text-fg-soft hover:border-neon-violet/60 hover:text-fg"
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
