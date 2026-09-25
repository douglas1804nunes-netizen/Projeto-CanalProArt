import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

type ContentProjectStatus = "DRAFT" | "IN_PROGRESS" | "READY" | "PUBLISHED" | "ARCHIVED";

type ContentProject = {
  id: string;
  title: string;
  status: ContentProjectStatus;
  createdAt: string;
  updatedAt: string;
};

type ListState =
  | { status: "loading" }
  | { status: "success"; projects: ContentProject[] }
  | { status: "error"; message: string };

const STATUS_LABELS: Record<ContentProjectStatus, string> = {
  DRAFT: "Rascunho",
  IN_PROGRESS: "Em andamento",
  READY: "Pronto",
  PUBLISHED: "Publicado",
  ARCHIVED: "Arquivado",
};

const STATUS_STYLES: Record<ContentProjectStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  READY: "bg-emerald-100 text-emerald-700",
  PUBLISHED: "bg-blue-100 text-blue-700",
  ARCHIVED: "bg-slate-100 text-slate-400",
};

export function ContentProjectsPage() {
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const navigate = useNavigate();

  const loadProjects = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/content-projects", { credentials: "include" });
      if (!response.ok) {
        setState({
          status: "error",
          message: `Não foi possível carregar os projetos (HTTP ${response.status}).`,
        });
        return;
      }
      const projects = (await response.json()) as ContentProject[];
      setState({ status: "success", projects });
    } catch {
      setState({ status: "error", message: "Não foi possível conectar ao backend." });
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  async function handleDelete(project: ContentProject) {
    const confirmed = window.confirm(
      `Excluir "${project.title}"? Isso apaga o roteiro, os títulos, a descrição e o vídeo ` +
        "enviado deste conteúdo. Não dá para desfazer.",
    );
    if (!confirmed) return;

    setDeleteError(null);
    setDeletingId(project.id);
    try {
      const response = await fetch(`/api/content-projects/${project.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      // 404 = já não existe (outra aba, por exemplo) — some da lista igual.
      if (!response.ok && response.status !== 404) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setDeleteError(body.error ?? `Não foi possível excluir (HTTP ${response.status}).`);
        return;
      }
      setState((current) =>
        current.status === "success"
          ? { status: "success", projects: current.projects.filter((p) => p.id !== project.id) }
          : current,
      );
    } catch {
      setDeleteError("Não foi possível conectar ao backend.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;

    setCreating(true);
    setCreateError(null);
    try {
      const response = await fetch("/api/content-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title }),
      });
      if (!response.ok) {
        setCreateError(`Não foi possível criar o projeto (HTTP ${response.status}).`);
        return;
      }
      const project = (await response.json()) as ContentProject;
      navigate(`/content/${project.id}`);
    } catch {
      setCreateError("Não foi possível conectar ao backend.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Conteúdos</h1>
      <p className="mt-1 text-sm text-slate-500">
        Projetos de conteúdo — cada um vira roteiro, títulos e descrição gerados por IA.
      </p>

      <form onSubmit={handleCreate} className="mt-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Novo projeto</span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="ex.: 10 receitas fitness rápidas"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
          />
        </label>
        <button
          type="submit"
          disabled={creating || !title.trim()}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
        >
          {creating ? "Criando…" : "Criar"}
        </button>
      </form>
      {createError && <p className="mt-2 text-sm text-red-600">{createError}</p>}

      {deleteError && <p className="mt-4 text-sm text-red-600">{deleteError}</p>}

      <div className="mt-6">
        {state.status === "loading" && <p className="text-sm text-slate-500">Carregando…</p>}
        {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}

        {state.status === "success" && state.projects.length === 0 && (
          <p className="text-sm text-slate-500">Nenhum projeto de conteúdo ainda.</p>
        )}

        {state.status === "success" && state.projects.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white shadow-sm">
            {state.projects.map((project) => (
              <li key={project.id} className="flex items-center hover:bg-slate-50">
                <Link
                  to={`/content/${project.id}`}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{project.title}</p>
                    <p className="text-xs text-slate-500">
                      Atualizado em {new Date(project.updatedAt).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[project.status]}`}
                  >
                    {STATUS_LABELS[project.status]}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => void handleDelete(project)}
                  disabled={deletingId === project.id}
                  aria-label={`Excluir conteúdo ${project.title}`}
                  className="mr-3 shrink-0 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  {deletingId === project.id ? "Excluindo…" : "Excluir"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
