import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type TrendClassification = "RISING" | "HOT" | "STABLE" | "DECLINING";

type DashboardCounts = {
  videosAnalyzed: number;
  trends: number;
  opportunities: number;
  contentProjects: number;
  publishedVideos: number;
};

type TopTrend = {
  id: string;
  topic: string;
  regionCode: string;
  trendScore: number;
  classification: TrendClassification;
};

type TopOpportunity = {
  id: string;
  score: number;
  status: string;
  topic: string;
  regionCode: string;
  classification: TrendClassification;
};

type DashboardData = {
  counts: DashboardCounts;
  topTrends: TopTrend[];
  topOpportunities: TopOpportunity[];
};

type DashboardState =
  | { status: "loading" }
  | { status: "success"; data: DashboardData }
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

const CARDS: Array<{ key: keyof DashboardCounts; label: string }> = [
  { key: "videosAnalyzed", label: "Vídeos analisados" },
  { key: "trends", label: "Tendências" },
  { key: "opportunities", label: "Oportunidades" },
  { key: "contentProjects", label: "Conteúdos" },
  { key: "publishedVideos", label: "Publicações" },
];

export function Dashboard() {
  const [state, setState] = useState<DashboardState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/dashboard", { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          setState({
            status: "error",
            message: `Não foi possível carregar o dashboard (HTTP ${response.status}).`,
          });
          return;
        }
        const data = (await response.json()) as DashboardData;
        setState({ status: "success", data });
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
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">
        Visão geral das tendências e oportunidades identificadas até agora.
      </p>

      {state.status === "loading" && <p className="mt-6 text-sm text-slate-500">Carregando…</p>}

      {state.status === "error" && <p className="mt-6 text-sm text-red-600">{state.message}</p>}

      {state.status === "success" && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {CARDS.map((card) => (
              <div
                key={card.key}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              >
                <p className="text-xs font-medium text-slate-500">{card.label}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  {state.data.counts[card.key]}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-medium text-slate-700">Top tendências por score</h2>
            {state.data.topTrends.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Nenhuma tendência calculada ainda — faça uma busca em Tendências.
              </p>
            ) : (
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={state.data.topTrends} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} />
                    <YAxis type="category" dataKey="topic" width={120} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value: number) => [value, "Score"]}
                      labelFormatter={(label: string) => label}
                    />
                    <Bar dataKey="trendScore" fill="#0f172a" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="mt-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-medium text-slate-700">Top oportunidades</h2>
            {state.data.topOpportunities.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Nenhuma oportunidade nova no momento — tendências HOT/RISING geram oportunidades
                automaticamente.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {state.data.topOpportunities.map((opportunity) => (
                  <li key={opportunity.id} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{opportunity.topic}</p>
                      <p className="text-xs text-slate-500">{opportunity.regionCode}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${CLASSIFICATION_STYLES[opportunity.classification]}`}
                      >
                        {CLASSIFICATION_LABELS[opportunity.classification]}
                      </span>
                      <span className="text-sm font-semibold text-slate-700">
                        {opportunity.score}
                      </span>
                    </div>
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
