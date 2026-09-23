import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

type YoutubeAccount = {
  id: string;
  channelId: string;
  channelTitle: string;
  connectedAt: string;
};

type AccountsState =
  | { status: "loading" }
  | { status: "success"; accounts: YoutubeAccount[] }
  | { status: "error"; message: string };

export function YoutubePage() {
  const [state, setState] = useState<AccountsState>({ status: "loading" });
  const [searchParams, setSearchParams] = useSearchParams();
  // Capturado uma única vez (não recalculado a cada render) — senão, ao
  // limpar "connected" da URL logo abaixo, o banner desapareceria no
  // instante em que aparece.
  const [showConnectedBanner] = useState(() => searchParams.get("connected") === "1");

  const loadAccounts = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/youtube/accounts", {
        credentials: "include",
        signal,
      });
      if (!response.ok) {
        setState({
          status: "error",
          message: `Não foi possível carregar (HTTP ${response.status}).`,
        });
        return;
      }
      const accounts = (await response.json()) as YoutubeAccount[];
      setState({ status: "success", accounts });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState({ status: "error", message: "Não foi possível conectar ao backend." });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadAccounts(controller.signal);
    return () => controller.abort();
  }, [loadAccounts]);

  useEffect(() => {
    if (!showConnectedBanner) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("connected");
        return next;
      },
      { replace: true },
    );
  }, [showConnectedBanner, setSearchParams]);

  async function handleDisconnect(accountId: string) {
    const response = await fetch(`/api/youtube/accounts/${accountId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (response.ok) {
      void loadAccounts();
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">YouTube</h1>
      <p className="mt-1 text-sm text-slate-500">
        Conecte um canal do YouTube para publicar vídeos a partir da Fase 16.
      </p>

      {showConnectedBanner && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          Canal conectado com sucesso.
        </div>
      )}

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-medium text-slate-500">Canais conectados</h2>

        {state.status === "loading" && <p className="mt-2 text-sm text-slate-500">Carregando…</p>}

        {state.status === "error" && <p className="mt-2 text-sm text-red-600">{state.message}</p>}

        {state.status === "success" && state.accounts.length === 0 && (
          <p className="mt-2 text-sm text-slate-500">Nenhum canal conectado ainda.</p>
        )}

        {state.status === "success" && state.accounts.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {state.accounts.map((account) => (
              <li
                key={account.id}
                className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{account.channelTitle}</p>
                  <p className="text-xs text-slate-400">
                    Conectado em {new Date(account.connectedAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDisconnect(account.id)}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                >
                  Desconectar
                </button>
              </li>
            ))}
          </ul>
        )}

        <a
          href="/api/youtube/connect"
          className="mt-4 inline-block rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
        >
          Conectar YouTube
        </a>
      </div>
    </div>
  );
}
