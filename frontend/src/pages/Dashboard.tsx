import { useEffect, useState } from "react";

type HealthState =
  | { status: "loading" }
  | { status: "success"; database: string }
  | { status: "error"; message: string };

export function Dashboard() {
  const [health, setHealth] = useState<HealthState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/health", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          // Evita tentar fazer JSON.parse de um corpo de erro que pode nem
          // ser JSON (ex.: página HTML de um 502 de proxy/load balancer).
          setHealth({
            status: "error",
            message: `Backend respondeu com erro (HTTP ${response.status}).`,
          });
          return;
        }

        const body = (await response.json()) as { status: string; database: string };
        if (body.status !== "ok") {
          setHealth({ status: "error", message: "Backend respondeu, mas reportou um problema." });
          return;
        }
        setHealth({ status: "success", database: body.database });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setHealth({ status: "error", message: "Não foi possível conectar ao backend em /api/health." });
      });

    return () => {
      controller.abort();
    };
  }, []);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">
        Fase 1 — Arquitetura. Os cards de métricas (vídeos analisados, tendências,
        oportunidades, conteúdos, publicações) chegam nas próximas fases.
      </p>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-medium text-slate-500">Status do sistema</h2>

        {health.status === "loading" && (
          <p className="mt-2 text-sm text-slate-500">Verificando conexão com o backend…</p>
        )}

        {health.status === "success" && (
          <div className="mt-2 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <p className="text-sm text-slate-700">
              Backend online · banco de dados <strong>{health.database}</strong>
            </p>
          </div>
        )}

        {health.status === "error" && (
          <div className="mt-2 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            <p className="text-sm text-red-600">{health.message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
