const API_URL = "https://api.anthropic.com/v1/messages";
// Versão fixada do protocolo da Messages API — não confundir com a versão
// do modelo. Ver https://docs.anthropic.com/en/api/versioning.
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 1024;

// Modelo atual mais capaz da Anthropic no momento em que o AIProvider foi
// implementado (Fase 11) — trocar aqui se um modelo mais novo/barato passar
// a ser preferível; não há necessidade de configurar via env var por
// enquanto (YAGNI, mesma lógica do resto do services/).
export const ANTHROPIC_MODEL = "claude-sonnet-5";

// Por que a Anthropic recusou a chamada — o que o usuário precisa saber pra
// resolver (a mensagem crua da API vem em apiMessage, só pra log).
export type AnthropicFailureKind = "no_credits" | "invalid_key" | "rate_limited" | "other";

export class AnthropicApiError extends Error {
  readonly status: number;
  readonly kind: AnthropicFailureKind;
  readonly apiMessage: string | undefined;

  constructor(status: number, apiMessage: string | undefined) {
    super(`Falha ao chamar a Anthropic API (HTTP ${status})`);
    this.name = "AnthropicApiError";
    this.status = status;
    this.apiMessage = apiMessage;
    this.kind = classifyFailure(status, apiMessage);
  }
}

// Sem crédito a API responde 400 (invalid_request_error) com essa frase — não
// é um status próprio, então só a mensagem distingue de um pedido malformado.
function classifyFailure(status: number, apiMessage: string | undefined): AnthropicFailureKind {
  if (apiMessage && /credit balance/i.test(apiMessage)) return "no_credits";
  if (status === 401 || status === 403) return "invalid_key";
  if (status === 429) return "rate_limited";
  return "other";
}

async function toApiError(response: Response): Promise<AnthropicApiError> {
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return new AnthropicApiError(response.status, body?.error?.message);
}

type AnthropicContentBlock = { type: string; text?: string };
type AnthropicMessageResponse = { content: AnthropicContentBlock[] };

export type CallAnthropicParams = {
  system: string;
  prompt: string;
  maxTokens?: number;
};

// Chamada crua à Messages API — sem parsing de domínio (isso fica em
// prompts.ts/anthropicProvider.ts, que são testáveis sem rede).
export async function callAnthropicMessages(
  apiKey: string,
  { system, prompt, maxTokens = DEFAULT_MAX_TOKENS }: CallAnthropicParams,
): Promise<string> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  const body = (await response.json()) as AnthropicMessageResponse;
  const text = body.content.find((block) => block.type === "text")?.text;
  if (text === undefined) {
    throw new Error("Resposta da Anthropic API não trouxe um bloco de texto");
  }
  return text;
}

// Chamada mínima (1 token de saída) pra confirmar que a chave, o modelo E o
// saldo funcionam — listar modelos responde 200 mesmo sem crédito, então não
// prova que a geração vai funcionar. Custa uma fração de centavo.
export async function pingAnthropic(apiKey: string, signal?: AbortSignal): Promise<void> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1,
      messages: [{ role: "user", content: "ok" }],
    }),
    signal,
  });
  if (!response.ok) {
    throw await toApiError(response);
  }
}
