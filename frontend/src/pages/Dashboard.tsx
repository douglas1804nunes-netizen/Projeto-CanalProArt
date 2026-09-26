import { useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisLineStroke, axisTick, gridStroke, tooltipProps } from "../components/chartTheme";
import { ClassificationBadge, type TrendClassification } from "../components/ClassificationBadge";
import { Icon, type IconName } from "../components/Icon";

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
  trendId: string;
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

// Cada indicador tem a sua cor: ela pinta a faixa do topo, o ícone e o brilho.
const CARDS: Array<{ key: keyof DashboardCounts; label: string; icon: IconName; color: string }> = [
  { key: "videosAnalyzed", label: "Vídeos analisados", icon: "play", color: "var(--c1)" },
  { key: "trends", label: "Tendências", icon: "trending", color: "var(--c2)" },
  { key: "opportunities", label: "Oportunidades", icon: "bulb", color: "var(--c4)" },
  { key: "contentProjects", label: "Conteúdos", icon: "file", color: "var(--c3)" },
  { key: "publishedVideos", label: "Publicações", icon: "rocket", color: "var(--c5)" },
];

export function Dashboard() {
  const [state, setState] = useState<DashboardState>({ status: "loading" });
  const navigate = useNavigate();

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
      <h1 className="page-title text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-sm text-muted">
        Visão geral das tendências e oportunidades identificadas até agora.
      </p>

      {state.status === "loading" && <p className="mt-6 text-sm text-muted">Carregando…</p>}

      {state.status === "error" && <p className="mt-6 text-sm text-danger">{state.message}</p>}

      {state.status === "success" && (
        <>
          <div className="stagger mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {CARDS.map((card, index) => (
              <div
                key={card.key}
                style={{ "--card-c": card.color } as CSSProperties}
                className={`glass glass-hover group relative overflow-hidden rounded-2xl p-4 ${
                  index === CARDS.length - 1 ? "col-span-2 sm:col-span-1" : ""
                }`}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-1 bg-[var(--card-c)] shadow-[0_0_20px_var(--card-c)]"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-3 -bottom-4 text-[var(--card-c)] opacity-[0.13] transition-all duration-500 group-hover:scale-125 group-hover:opacity-30"
                >
                  <Icon name={card.icon} className="h-24 w-24" />
                </span>
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--card-c)_18%,transparent)] text-[var(--card-c)]"
                  >
                    <Icon name={card.icon} className="h-[18px] w-[18px]" />
                  </span>
                  <p className="text-xs font-medium text-muted">{card.label}</p>
                </div>
                <p className="relative mt-4 text-4xl font-bold tracking-tight text-fg">
                  {state.data.counts[card.key]}
                </p>
              </div>
            ))}
          </div>

          <div className="glass mt-8 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-fg">Top tendências por score</h2>
            {state.data.topTrends.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                Nenhuma tendência calculada ainda — faça uma busca em Tendências.
              </p>
            ) : (
              <>
                <p className="mt-1 text-xs text-faint">
                  Clique numa barra para ver a análise completa.
                </p>
                <div className="mt-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={state.data.topTrends} layout="vertical" margin={{ right: 16 }}>
                      <defs>
                        <linearGradient id="dashboard-bar" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" style={{ stopColor: "var(--grad-bar-a)" }} />
                          <stop offset="100%" style={{ stopColor: "var(--grad-bar-b)" }} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" horizontal={false} />
                      <XAxis
                        type="number"
                        domain={[0, 100]}
                        tick={axisTick}
                        stroke={axisLineStroke}
                      />
                      <YAxis
                        type="category"
                        dataKey="topic"
                        width={120}
                        tick={{ ...axisTick, fill: "var(--fg-soft)" }}
                        stroke={axisLineStroke}
                        tickLine={false}
                      />
                      <Tooltip
                        {...tooltipProps}
                        formatter={(value: number) => [value, "Score"]}
                        labelFormatter={(label: string) => label}
                      />
                      <Bar
                        dataKey="trendScore"
                        fill="url(#dashboard-bar)"
                        radius={[0, 10, 10, 0]}
                        background={{ fill: "var(--surface)", radius: 10 }}
                        animationDuration={1100}
                        style={{ cursor: "pointer" }}
                        onClick={(barData: { payload?: TopTrend }) => {
                          if (barData.payload) navigate(`/trends/${barData.payload.id}`);
                        }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>

          <div className="glass mt-8 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-fg">Top oportunidades</h2>
            {state.data.topOpportunities.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                Nenhuma oportunidade nova no momento — tendências HOT/RISING geram oportunidades
                automaticamente.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {state.data.topOpportunities.map((opportunity) => (
                  <li key={opportunity.id}>
                    <Link
                      to={`/trends/${opportunity.trendId}`}
                      className="-mx-2 flex items-center justify-between gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-surface-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-fg">{opportunity.topic}</p>
                        <p className="text-xs text-muted">{opportunity.regionCode}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <ClassificationBadge classification={opportunity.classification} />
                        <span className="text-sm font-semibold text-fg-soft">
                          {opportunity.score}
                        </span>
                      </div>
                    </Link>
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
