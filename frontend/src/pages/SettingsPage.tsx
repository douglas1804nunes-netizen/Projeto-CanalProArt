import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { getDefaultRegion, isValidRegionCode, setDefaultRegion } from "../preferences";

type SettingsInfo = {
  environment: string;
  aiProvider: string;
  youtubeRedirectUri: string;
  youtubeChannels: number;
  warnings: string[];
};

type CheckResult = { ok: boolean; message: string };
type ChecksResponse = { youtubeApiKey: CheckResult; anthropicApiKey: CheckResult };

type InfoState =
  | { status: "loading" }
  | { status: "success"; info: SettingsInfo }
  | { status: "error"; message: string };

type ChecksState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; checks: ChecksResponse }
  | { status: "error"; message: string };

const CARD = "mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm";

function CheckRow({ label, result }: { label: string; result: CheckResult }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span aria-hidden="true">{result.ok ? "✅" : "❌"}</span>
      <span>
        <span className="font-medium text-slate-800">{label}</span>
        <span className="text-slate-500"> — {result.message}</span>
      </span>
    </li>
  );
}

export function SettingsPage() {
  const { state: authState } = useAuth();
  const [infoState, setInfoState] = useState<InfoState>({ status: "loading" });
  const [checksState, setChecksState] = useState<ChecksState>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  const [region, setRegion] = useState(getDefaultRegion);
  const [regionMessage, setRegionMessage] = useState<string | null>(null);
  const [historyMessage, setHistoryMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch("/api/settings", {
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) {
          setInfoState({
            status: "error",
            message: `Não foi possível carregar (HTTP ${response.status}).`,
          });
          return;
        }
        setInfoState({ status: "success", info: (await response.json()) as SettingsInfo });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setInfoState({ status: "error", message: "Não foi possível conectar ao backend." });
      }
    }

    void load();
    return () => controller.abort();
  }, []);

  async function handleRunChecks() {
    setChecksState({ status: "loading" });
    try {
      const response = await fetch("/api/settings/check", {
        method: "POST",
        credentials: "include",
      });
      if (response.status === 429) {
        setChecksState({
          status: "error",
          message: "Muitos testes seguidos — aguarde um minuto e tente de novo.",
        });
        return;
      }
      if (!response.ok) {
        setChecksState({
          status: "error",
          message: `Não foi possível testar (HTTP ${response.status}).`,
        });
        return;
      }
      setChecksState({ status: "success", checks: (await response.json()) as ChecksResponse });
    } catch {
      setChecksState({ status: "error", message: "Não foi possível conectar ao backend." });
    }
  }

  async function handleCopyRedirectUri(uri: string) {
    try {
      await navigator.clipboard.writeText(uri);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // sem permissão de clipboard: o valor continua selecionável na tela
    }
  }

  function handleSaveRegion(event: FormEvent) {
    event.preventDefault();
    if (!isValidRegionCode(region)) {
      setRegionMessage("Use o código de 2 letras do país (ex.: BR, US, PT).");
      return;
    }
    setDefaultRegion(region);
    setRegionMessage("Região padrão salva.");
  }

  async function handleClearHistory() {
    const confirmed = window.confirm(
      "Excluir todo o histórico de pesquisas? Repetir uma busca depois vai gastar cota do YouTube de novo.",
    );
    if (!confirmed) return;

    try {
      const response = await fetch("/api/trends/searches", {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        setHistoryMessage("Não foi possível limpar o histórico.");
        return;
      }
      const { deleted } = (await response.json()) as { deleted: number };
      setHistoryMessage(
        deleted === 0
          ? "Não havia pesquisas para excluir."
          : `${deleted} ${deleted === 1 ? "pesquisa excluída" : "pesquisas excluídas"}.`,
      );
    } catch {
      setHistoryMessage("Não foi possível conectar ao backend.");
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
      <p className="mt-1 text-sm text-slate-500">
        Confira se as integrações estão funcionando e ajuste suas preferências.
      </p>

      {authState.status === "authenticated" && (
        <section className={CARD}>
          <h2 className="text-sm font-semibold text-slate-800">Conta</h2>
          <p className="mt-2 text-sm text-slate-700">{authState.user.name}</p>
          <p className="text-sm text-slate-500">{authState.user.email}</p>
        </section>
      )}

      <section className={CARD}>
        <h2 className="text-sm font-semibold text-slate-800">Integrações</h2>
        <p className="mt-1 text-xs text-slate-500">
          Faz uma chamada real (barata) a cada serviço para confirmar que a chave colada no servidor
          funciona. A busca do YouTube gasta 1 unidade da cota diária.
        </p>

        <button
          type="button"
          onClick={() => void handleRunChecks()}
          disabled={checksState.status === "loading"}
          className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
        >
          {checksState.status === "loading" ? "Testando…" : "Testar conexões"}
        </button>

        {checksState.status === "error" && (
          <p className="mt-3 text-sm text-red-600">{checksState.message}</p>
        )}
        {checksState.status === "success" && (
          <ul className="mt-4 space-y-2">
            <CheckRow label="YouTube Data API" result={checksState.checks.youtubeApiKey} />
            <CheckRow label="Anthropic (IA)" result={checksState.checks.anthropicApiKey} />
          </ul>
        )}
      </section>

      <section className={CARD}>
        <h2 className="text-sm font-semibold text-slate-800">Canal do YouTube</h2>

        {infoState.status === "loading" && (
          <p className="mt-2 text-sm text-slate-500">Carregando…</p>
        )}
        {infoState.status === "error" && (
          <p className="mt-2 text-sm text-red-600">{infoState.message}</p>
        )}
        {infoState.status === "success" && (
          <>
            {infoState.info.warnings.length > 0 && (
              <ul className="mt-3 space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                {infoState.info.warnings.map((warning) => (
                  <li key={warning}>⚠️ {warning}</li>
                ))}
              </ul>
            )}

            <p className="mt-3 text-sm text-slate-700">
              {infoState.info.youtubeChannels === 0
                ? "Nenhum canal conectado ainda — sem isso não dá para publicar vídeos."
                : `${infoState.info.youtubeChannels} ${infoState.info.youtubeChannels === 1 ? "canal conectado" : "canais conectados"}.`}{" "}
              <Link to="/youtube" className="text-slate-900 underline">
                Gerenciar canais
              </Link>
            </p>

            <p className="mt-4 text-xs font-medium text-slate-700">
              URI de redirecionamento (cadastre exatamente esta no Google Cloud Console → OAuth
              Client → Authorized redirect URIs)
            </p>
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-slate-100 px-2 py-1.5 text-xs text-slate-800">
                {infoState.info.youtubeRedirectUri}
              </code>
              <button
                type="button"
                onClick={() => void handleCopyRedirectUri(infoState.info.youtubeRedirectUri)}
                className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
              >
                {copied ? "Copiado!" : "Copiar"}
              </button>
            </div>

            <p className="mt-4 text-xs text-slate-400">
              Ambiente: {infoState.info.environment} · IA: {infoState.info.aiProvider}
            </p>
          </>
        )}
      </section>

      <section className={CARD}>
        <h2 className="text-sm font-semibold text-slate-800">Preferências</h2>
        <form onSubmit={handleSaveRegion} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Região padrão das tendências</span>
            <input
              type="text"
              value={region}
              onChange={(event) => {
                setRegion(event.target.value.toUpperCase());
                setRegionMessage(null);
              }}
              maxLength={2}
              className="w-20 rounded-md border border-slate-300 px-3 py-2 text-sm uppercase outline-none focus:border-slate-500"
            />
          </label>
          <button
            type="submit"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            Salvar
          </button>
        </form>
        {regionMessage && <p className="mt-2 text-xs text-slate-500">{regionMessage}</p>}
      </section>

      <section className={CARD}>
        <h2 className="text-sm font-semibold text-slate-800">Dados</h2>
        <p className="mt-1 text-xs text-slate-500">
          Exclui o histórico de pesquisas de tendências. As tendências, oportunidades e conteúdos já
          gerados não são afetados.
        </p>
        <button
          type="button"
          onClick={() => void handleClearHistory()}
          className="mt-3 rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
        >
          Limpar histórico de pesquisas
        </button>
        {historyMessage && <p className="mt-2 text-xs text-slate-500">{historyMessage}</p>}
      </section>
    </div>
  );
}
