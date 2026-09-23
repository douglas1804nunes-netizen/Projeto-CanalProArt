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
  ];
}

export function ContentProjectPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<PreviewState>({ status: "loading" });

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
            Isso é o que seria enviado ao YouTube — a publicação de verdade chega numa fase futura.
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
        </>
      )}
    </div>
  );
}
