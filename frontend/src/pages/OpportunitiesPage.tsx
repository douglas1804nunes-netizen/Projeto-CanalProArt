import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

type TrendClassification = "RISING" | "HOT" | "STABLE" | "DECLINING";

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
      <h1 className="text-2xl font-semibold tracking-tight">Oportunidades</h1>
      <p className="mt-1 text-sm text-slate-500">
        Tendências em alta (HOT) ou subindo (RISING) viram oportunidades automaticamente — vale a
        pena produzir conteúdo sobre elas.
      </p>

      <div className="mt-6">
        {state.status === "loading" && <p className="text-sm text-slate-500">Carregando…</p>}

        {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}

        {createError && <p className="mb-3 text-sm text-red-600">{createError}</p>}

        {state.status === "success" && state.opportunities.length === 0 && (
          <p className="text-sm text-slate-500">Nenhuma oportunidade ativa no momento.</p>
        )}

        {state.status === "success" && state.opportunities.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white shadow-sm">
            {state.opportunities.map((opportunity) => (
              <li key={opportunity.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <Link
                    to={`/trends/${opportunity.trendId}`}
                    className="text-sm font-medium text-slate-900 hover:underline"
                  >
                    {opportunity.topic}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {opportunity.regionCode} ·{" "}
                    {new Date(opportunity.createdAt).toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${CLASSIFICATION_STYLES[opportunity.classification]}`}
                  >
                    {CLASSIFICATION_LABELS[opportunity.classification]} · {opportunity.score}
                  </span>
                  {opportunity.status !== "DISMISSED" && (
                    <button
                      type="button"
                      onClick={() => void handleCreateContent(opportunity)}
                      disabled={creatingId === opportunity.id}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
                    >
                      {creatingId === opportunity.id ? "Criando…" : "Criar conteúdo"}
                    </button>
                  )}
                  {opportunity.status === "NEW" ? (
                    <button
                      type="button"
                      onClick={() => void handleDismiss(opportunity.id)}
                      disabled={dismissingId === opportunity.id}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
                    >
                      {dismissingId === opportunity.id ? "Dispensando…" : "Dispensar"}
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">{opportunity.status}</span>
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
