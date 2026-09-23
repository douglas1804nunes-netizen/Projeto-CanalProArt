// Claude às vezes envolve JSON em ```json ... ``` mesmo quando instruído a
// não usar markdown — remove a cerca antes de fazer o parse em vez de
// tentar reforçar o prompt indefinidamente (mais robusto que confiar 100%
// que o modelo sempre obedece o formato pedido).
const CODE_FENCE = /^```(?:json)?\s*([\s\S]*?)\s*```$/;

export function parseJsonStringArray(text: string): string[] {
  const fenceMatch = CODE_FENCE.exec(text.trim());
  const jsonText = fenceMatch ? fenceMatch[1] : text.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Resposta da IA não é um JSON válido");
  }

  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    throw new Error("Resposta da IA não é um array de strings");
  }

  return parsed;
}
