import type { FastifyInstance } from "fastify";
import { AnthropicApiError, pingAnthropic } from "@canalproart/services";
import { env } from "../env.js";
import { prisma } from "../prisma.js";

const CHECK_TIMEOUT_MS = 8000;

type CheckResult = { ok: boolean; message: string };

// O boot já garante que as variáveis existem (env.ts falha se estiverem
// vazias), mas "não vazia" não é "válida" — o erro mais comum de configuração
// é colar uma chave errada/sem a API habilitada e só descobrir na primeira
// busca. Estas checagens fazem uma chamada barata de verdade pra confirmar.

// videos.list custa 1 unidade de cota (ver docs/YOUTUBE.md).
async function checkYoutubeApiKey(): Promise<CheckResult> {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "id");
  url.searchParams.set("chart", "mostPopular");
  url.searchParams.set("regionCode", "BR");
  url.searchParams.set("maxResults", "1");
  url.searchParams.set("key", env.YOUTUBE_API_KEY);

  const response = await fetch(url, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
  if (response.ok) return { ok: true, message: "Chave válida — YouTube Data API respondeu." };

  const body = (await response.json().catch(() => null)) as {
    error?: { errors?: Array<{ reason?: string }> };
  } | null;
  const reason = body?.error?.errors?.[0]?.reason;

  if (reason === "keyInvalid" || response.status === 400) {
    return {
      ok: false,
      message: "Chave recusada pelo Google — confira o valor de YOUTUBE_API_KEY.",
    };
  }
  if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
    return { ok: false, message: "A chave é válida, mas a cota diária do YouTube acabou." };
  }
  if (response.status === 403) {
    return {
      ok: false,
      message:
        "Acesso negado — habilite a YouTube Data API v3 no projeto do Google Cloud e revise as restrições da chave.",
    };
  }
  return { ok: false, message: `O Google respondeu HTTP ${response.status}.` };
}

// Chamada mínima de verdade (1 token): listar modelos responde 200 mesmo com a
// conta sem crédito e enganava — a geração de roteiro/título/descrição
// falhava depois. Custa uma fração de centavo.
async function checkAnthropicApiKey(): Promise<CheckResult> {
  try {
    await pingAnthropic(env.ANTHROPIC_API_KEY, AbortSignal.timeout(CHECK_TIMEOUT_MS));
    return { ok: true, message: "Chave válida e com saldo — a IA respondeu." };
  } catch (error) {
    if (error instanceof AnthropicApiError) {
      switch (error.kind) {
        case "no_credits":
          return {
            ok: false,
            message:
              "A chave é válida, mas a conta da Anthropic está sem créditos — adicione em " +
              "console.anthropic.com (Plans & Billing) para a IA voltar a gerar textos.",
          };
        case "invalid_key":
          return {
            ok: false,
            message: "Chave recusada pela Anthropic — confira o valor de ANTHROPIC_API_KEY.",
          };
        case "rate_limited":
          return {
            ok: false,
            message: "A chave é válida, mas o limite de uso da IA foi atingido.",
          };
        default:
          return { ok: false, message: `A Anthropic respondeu HTTP ${error.status}.` };
      }
    }
    throw error;
  }
}

async function safely(check: () => Promise<CheckResult>): Promise<CheckResult> {
  try {
    return await check();
  } catch {
    return { ok: false, message: "Não foi possível conectar ao serviço (rede ou tempo esgotado)." };
  }
}

function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

// Avisos de configuração que não dá pra pegar só olhando "está preenchido".
// Só valem em produção: em dev o Vite (:5173) e o backend (:3000) têm origens
// diferentes por design (o Vite faz proxy de /api) e isso funciona normalmente.
export function buildConfigWarnings(config: {
  nodeEnv: string;
  redirectUri: string;
  frontendUrl?: string;
}): string[] {
  if (config.nodeEnv !== "production") return [];

  const warnings: string[] = [];
  const redirectOrigin = originOf(config.redirectUri);
  const frontendOrigin = config.frontendUrl ? originOf(config.frontendUrl) : null;

  if (redirectOrigin && new URL(redirectOrigin).hostname === "localhost") {
    warnings.push(
      "YOUTUBE_REDIRECT_URI aponta pra localhost em produção — o Google vai recusar o retorno do login do YouTube.",
    );
  }
  if (redirectOrigin && frontendOrigin && redirectOrigin !== frontendOrigin) {
    warnings.push(
      "YOUTUBE_REDIRECT_URI e FRONTEND_URL têm origens diferentes — em produção o app roda em uma origem só, então o login do YouTube não vai voltar pra sessão certa.",
    );
  }
  return warnings;
}

export async function settingsRoutes(app: FastifyInstance) {
  // Nunca devolve segredo: só o que o usuário precisa copiar pra outro painel
  // (redirect URI pro Google Cloud Console) e o estado geral do ambiente.
  app.get("/api/settings", { preHandler: [app.authenticate] }, async (request, reply) => {
    const youtubeChannels = await prisma.youtubeAccount.count({
      where: { userId: request.user.sub },
    });

    return reply.send({
      environment: env.NODE_ENV,
      aiProvider: env.AI_PROVIDER,
      youtubeRedirectUri: env.YOUTUBE_REDIRECT_URI,
      youtubeChannels,
      warnings: buildConfigWarnings({
        nodeEnv: env.NODE_ENV,
        redirectUri: env.YOUTUBE_REDIRECT_URI,
        frontendUrl: env.FRONTEND_URL,
      }),
    });
  });

  app.post(
    "/api/settings/check",
    {
      preHandler: [app.authenticate],
      // Cada chamada gasta 1 unidade de cota do YouTube — não é pra ser
      // clicada em loop.
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    },
    async (_request, reply) => {
      const [youtubeApiKey, anthropicApiKey] = await Promise.all([
        safely(checkYoutubeApiKey),
        safely(checkAnthropicApiKey),
      ]);
      return reply.send({ youtubeApiKey, anthropicApiKey });
    },
  );
}
