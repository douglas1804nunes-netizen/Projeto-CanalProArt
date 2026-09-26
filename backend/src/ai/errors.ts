import { AnthropicApiError } from "@canalproart/services";

// Traduz uma falha da IA no que o usuário precisa ouvir. Sem isso, "sem
// créditos" e "chave errada" chegavam à tela como o mesmo "Falha ao gerar…" e
// não havia como saber o que consertar.
export function aiFailure(
  error: unknown,
  fallbackMessage: string,
): { status: 402 | 429 | 502; message: string } {
  if (error instanceof AnthropicApiError) {
    switch (error.kind) {
      case "no_credits":
        return {
          status: 402,
          message:
            "A conta da Anthropic está sem créditos. Adicione créditos em console.anthropic.com " +
            "(Plans & Billing) e tente de novo.",
        };
      case "invalid_key":
        return {
          status: 502,
          message: "A chave da Anthropic foi recusada — confira ANTHROPIC_API_KEY no servidor.",
        };
      case "rate_limited":
        return {
          status: 429,
          message: "O limite de uso da IA foi atingido. Aguarde um pouco e tente de novo.",
        };
    }
  }
  return { status: 502, message: fallbackMessage };
}
