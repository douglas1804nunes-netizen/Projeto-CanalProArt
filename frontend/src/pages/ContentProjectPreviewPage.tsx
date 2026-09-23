import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

type ContentProjectStatus = "DRAFT" | "IN_PROGRESS" | "READY" | "PUBLISHED" | "ARCHIVED";

type Script = {
  id: string;
  content: string;
  version: number;
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
  fileName: string;
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

type PreviewState =
  | { status: "loading" }
  | { status: "success"; project: ContentProjectDetail }
  | { status: "not-found" }
  | { status: "error"; message: string };

const RIGHTS_STATUS_LABELS: Record<RightsStatus, string> = {
  ORIGINAL: "Original (produzido pelo usuário)",
  AUTHORIZED: "Autorizado pelo titular",
  LICENSED: "Licenciado",
  PUBLIC_DOMAIN: "Domínio público",
};

type ChecklistItem = { label: string; done: boolean };

function buildChecklist(project: ContentProjectDetail): ChecklistItem[] {
  const selectedTitle = project.generatedTitles.find((t) => t.selected);
  const selectedDescription = project.generatedDescriptions.find((d) => d.selected);

  return [
    { label: "Vídeo enviado", done: project.mediaUpload !== null },
    { label: "Direitos do vídeo declarados", done: project.mediaUpload?.rightsStatus != null },
    { label: "Roteiro gerado", done: project.scripts.length > 0 },
    { label: "Título selecionado", done: selectedTitle !== undefined },
    { label: "Descrição selecionada", done: selectedDescription !== undefined },
    { label: "Projeto marcado como Pronto", done: project.status === "READY" },
  ];
}

type YoutubeAccount = {
  id: string;
  channelTitle: string;
};

type PublishState =
  | { status: "idle" }
  | { status: "publishing" }
  | { status: "success"; youtubeVideoId: string | null }
  | { status: "error"; message: string };

export function ContentProjectPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const [accounts, setAccounts] = useState<YoutubeAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [publishState, setPublishState] = useState<PublishState>({ status: "idle" });

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();

    fetch(`/api/content-projects/${id}`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 404) {
          setState({ status: "not-found" });
          return;
        }
        if (!response.ok) {
          setState({
            status: "error",
            message: `Não foi possível carregar a prévia (HTTP ${response.status}).`,
          });
          return;
        }
        const project = (await response.json()) as ContentProjectDetail;
        setState({ status: "success", project });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", message: "Não foi possível conectar ao backend." });
      });

    return () => {
      controller.abort();
    };
  }, [id]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/youtube/accounts", { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const list = (await response.json()) as YoutubeAccount[];
        setAccounts(list);
        const firstAccount = list[0];
        if (firstAccount) setSelectedAccountId((current) => current || firstAccount.id);
      })
      .catch(() => {
        // não bloqueia a prévia — só desabilita a publicação se falhar
      });
    return () => controller.abort();
  }, []);

  async function handlePublish() {
    if (!selectedAccountId) return;
    setPublishState({ status: "publishing" });
    try {
      const response = await fetch(`/api/content-projects/${id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ youtubeAccountId: selectedAccountId }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        youtubeVideoId?: string | null;
      };
      if (!response.ok) {
        setPublishState({
          status: "error",
          message: body.error ?? `Falha ao publicar (HTTP ${response.status}).`,
        });
        return;
      }
      setPublishState({ status: "success", youtubeVideoId: body.youtubeVideoId ?? null });
      if (state.status === "success") {
        setState({ status: "success", project: { ...state.project, status: "PUBLISHED" } });
      }
    } catch {
      setPublishState({ status: "error", message: "Não foi possível conectar ao backend." });
    }
  }

  return (
    <div className="max-w-3xl">
      <Link to={`/content/${id}`} className="text-sm text-slate-500 hover:text-slate-700">
        ← Voltar ao projeto
      </Link>

      {state.status === "loading" && <p className="mt-6 text-sm text-slate-500">Carregando…</p>}
      {state.status === "not-found" && (
        <p className="mt-6 text-sm text-slate-500">Projeto não encontrado.</p>
      )}
      {state.status === "error" && <p className="mt-6 text-sm text-red-600">{state.message}</p>}

      {state.status === "success" && (
        <>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Prévia de publicação</h1>
          <p className="mt-1 text-sm text-slate-500">
            Isso é o que será enviado ao YouTube. O vídeo é publicado como <strong>privado</strong>{" "}
            — você pode alterar a visibilidade depois no YouTube Studio.
          </p>

          <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-medium text-slate-700">Checklist</h2>
            <ul className="mt-3 flex flex-col gap-1.5">
              {buildChecklist(state.project).map((item) => (
                <li key={item.label} className="flex items-center gap-2 text-sm">
                  <span className={item.done ? "text-emerald-600" : "text-slate-300"}>
                    {item.done ? "✓" : "○"}
                  </span>
                  <span className={item.done ? "text-slate-700" : "text-slate-400"}>
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {state.project.mediaUpload ? (
            <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <video
                controls
                src={`/api/content-projects/${id}/media/file`}
                className="w-full rounded-md bg-black"
              />
              {state.project.mediaUpload.rightsStatus && (
                <p className="mt-2 text-xs text-slate-500">
                  Direitos: {RIGHTS_STATUS_LABELS[state.project.mediaUpload.rightsStatus]}
                  {state.project.mediaUpload.containsSyntheticMedia && " · contém mídia sintética"}
                </p>
              )}
            </div>
          ) : (
            <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
              Nenhum vídeo enviado ainda.
            </div>
          )}

          <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-medium text-slate-700">Título</h2>
            {(() => {
              const selectedTitle = state.project.generatedTitles.find((t) => t.selected);
              return selectedTitle ? (
                <p className="mt-2 text-lg font-medium text-slate-900">{selectedTitle.title}</p>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Nenhum título selecionado.</p>
              );
            })()}
          </div>

          <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-medium text-slate-700">Descrição</h2>
            {(() => {
              const selectedDescription = state.project.generatedDescriptions.find(
                (d) => d.selected,
              );
              return selectedDescription ? (
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                  {selectedDescription.description}
                </p>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Nenhuma descrição selecionada.</p>
              );
            })()}
          </div>

          <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-medium text-slate-700">Publicar</h2>

            {state.project.status === "PUBLISHED" && publishState.status !== "success" && (
              <p className="mt-2 text-sm text-emerald-700">Este projeto já foi publicado.</p>
            )}

            {state.project.status !== "PUBLISHED" && publishState.status !== "success" && (
              <>
                {state.project.status !== "READY" ? (
                  <p className="mt-2 text-sm text-slate-500">
                    Marque o projeto como pronto (na página do projeto) antes de publicar.
                  </p>
                ) : accounts.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">
                    <Link to="/youtube" className="underline">
                      Conecte um canal do YouTube
                    </Link>{" "}
                    antes de publicar.
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <select
                      value={selectedAccountId}
                      onChange={(event) => setSelectedAccountId(event.target.value)}
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                    >
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.channelTitle}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void handlePublish()}
                      disabled={publishState.status === "publishing"}
                      className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
                    >
                      {publishState.status === "publishing" ? "Publicando…" : "Publicar no YouTube"}
                    </button>
                  </div>
                )}
              </>
            )}

            {publishState.status === "error" && (
              <p className="mt-2 text-sm text-red-600">{publishState.message}</p>
            )}

            {publishState.status === "success" && (
              <div className="mt-2 text-sm text-emerald-700">
                <p>Publicado com sucesso!</p>
                {publishState.youtubeVideoId && (
                  <a
                    href={`https://youtube.com/watch?v=${publishState.youtubeVideoId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    Ver no YouTube
                  </a>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
