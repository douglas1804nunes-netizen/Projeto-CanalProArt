import { createAnthropicProvider } from "./anthropicProvider.js";
import type { AIProvider } from "./provider.js";

export { AnthropicApiError, ANTHROPIC_MODEL, pingAnthropic } from "./client.js";
export type { AnthropicFailureKind } from "./client.js";

export type AIProviderFactoryConfig = {
  provider: string;
  apiKey: string;
};

// Ponto único de decisão de qual implementação concreta usar por trás da
// interface AIProvider (ver docs/ENVIRONMENT.md, AI_PROVIDER). Só
// "anthropic" existe por enquanto — o factory já deixa claro onde entraria
// um segundo provider (ex.: "openai") sem que backend/routes/ai.ts precise
// saber a diferença.
export function createAIProvider({ provider, apiKey }: AIProviderFactoryConfig): AIProvider {
  if (provider === "anthropic") {
    return createAnthropicProvider({ apiKey });
  }
  throw new Error(`AI_PROVIDER "${provider}" não é suportado (só "anthropic" por enquanto)`);
}

export type {
  AIProvider,
  GenerateDescriptionInput,
  GenerateIdeasInput,
  GenerateScriptInput,
  GenerateTitlesInput,
} from "./provider.js";
