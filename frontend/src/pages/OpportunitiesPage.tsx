import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ClassificationBadge, type TrendClassification } from "../components/ClassificationBadge";

type Opportunity = {
  id: string;
  trendId: string;
  score: number;
  status: string;
  createdAt: string;
  topic: string;
  regionCode: string;
  classification: TrendClassification;
};

type ListState =
  | { status: "loading" }
  | { status: "success"; opportunities: Opportunity[] }
  | { status: "error"; message: string };

export function OpportunitiesPage() {
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const navigate = useNavigate();

  const loadOpportunities = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/opportunities", { credentials: "include" });
      if (!response.ok) {
        setState({
          status: "error",
          message: `Não foi possível carregar as oportunidades (HTTP ${response.status}).`,
        });
        return;
      }
      const opportunities = (await response.json()) as Opportunity[];
      setState({ status: "success", opportunities });
    } catch {
      setState({ status: "error", message: "Não foi possível conectar ao backend." });
    }
  }, []);

  useEffect(() => {
    void loadOpportunities();
  }, [loadOpportunities]);

  async function handleDismiss(id: string) {
    setDismissingId(id);
    try {
      const response = await fetch(`/api/opportunities/${id}/dismiss`, {
        method: "POST",
        credentials: "include",
      });
      if (response.ok && state.status === "success") {
        setState({
          status: "success",
          opportunities: state.opportunities.filter((opportunity) => opportunity.id !== id),
        });
      }
    } finally {
      setDismissingId(null);
    }
  }

  async function handleCreateContent(opportunity: Opportunity) {
    setCreatingId(opportunity.id);
    setCreateError(null);
    try {
      const response = await fetch("/api/content-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: opportunity.topic, opportunityId: opportunity.id }),
      });
      if (!response.ok) {
        setCreateError(`Não foi possível criar o projeto (HTTP ${response.status}).`);
        return;
      }
      const project = (await response.json()) as { id: string };
      navigate(`/content/${project.id}`);
    } catch {
      setCreateError("Não foi possível conectar ao backend.");
    } finally {
      setCreatingId(null);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="page-title text-2xl font-semibold tracking-tight">Oportunidades</h1>
      <p className="mt-1 text-sm text-muted">
        Tendências em alta (HOT) ou subindo (RISING) viram oportunidades automaticamente — vale a
        pena produzir conteúdo sobre elas.
      </p>

      <div className="mt-6">
        {state.status === "loading" && <p className="text-sm text-muted">Carregando…</p>}

        {state.status === "error" && <p className="text-sm text-danger">{state.message}</p>}

        {createError && <p className="mb-3 text-sm text-danger">{createError}</p>}

        {state.status === "success" && state.opportunities.length === 0 && (
          <p className="text-sm text-muted">Nenhuma oportunidade ativa no momento.</p>
        )}

        {state.status === "success" && state.opportunities.length > 0 && (
          <ul className="divide-y divide-line glass rounded-2xl">
            {state.opportunities.map((opportunity) => (
              <li key={opportunity.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <Link
                    to={`/trends/${opportunity.trendId}`}
                    className="text-sm font-medium text-fg hover:underline"
                  >
                    {opportunity.topic}
                  </Link>
                  <p className="text-xs text-muted">
                    {opportunity.regionCode} ·{" "}
                    {new Date(opportunity.createdAt).toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <ClassificationBadge
                    classification={opportunity.classification}
                    score={opportunity.score}
                  />
                  {opportunity.status !== "DISMISSED" && (
                    <button
                      type="button"
                      onClick={() => void handleCreateContent(opportunity)}
                      disabled={creatingId === opportunity.id}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 btn-ghost"
                    >
                      {creatingId === opportunity.id ? "Criando…" : "Criar conteúdo"}
                    </button>
                  )}
                  {opportunity.status === "NEW" ? (
                    <button
                      type="button"
                      onClick={() => void handleDismiss(opportunity.id)}
                      disabled={dismissingId === opportunity.id}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 btn-ghost"
                    >
                      {dismissingId === opportunity.id ? "Dispensando…" : "Dispensar"}
                    </button>
                  ) : (
                    <span className="text-xs text-faint">{opportunity.status}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
