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
    throw new Error(`Falha ao chamar a Anthropic API (HTTP ${response.status})`);
  }

  const body = (await response.json()) as AnthropicMessageResponse;
  const text = body.content.find((block) => block.type === "text")?.text;
  if (text === undefined) {
    throw new Error("Resposta da Anthropic API não trouxe um bloco de texto");
  }
  return text;
}
