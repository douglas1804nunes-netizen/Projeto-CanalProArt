import { callAnthropicMessages } from "./client.js";
import { parseJsonStringArray } from "./parser.js";
import {
  buildDescriptionPrompt,
  buildIdeasPrompt,
  buildScriptPrompt,
  buildTitlesPrompt,
} from "./prompts.js";
import type { AIProvider } from "./provider.js";

const DEFAULT_IDEAS_COUNT = 5;
const DEFAULT_TITLES_COUNT = 5;
// Roteiro/descrição são textos livres mais longos que ideias/títulos (que
// são só um array curto de strings) — precisam de mais tokens de saída.
const LONG_TEXT_MAX_TOKENS = 2048;

export type AnthropicProviderConfig = {
  apiKey: string;
};

export function createAnthropicProvider({ apiKey }: AnthropicProviderConfig): AIProvider {
  return {
    async generateIdeas({ topic, count = DEFAULT_IDEAS_COUNT }) {
      const { system, prompt } = buildIdeasPrompt(topic, count);
      const text = await callAnthropicMessages(apiKey, { system, prompt });
      return parseJsonStringArray(text);
    },

    async generateScript({ idea, durationSeconds }) {
      const { system, prompt } = buildScriptPrompt(idea, durationSeconds);
      return callAnthropicMessages(apiKey, { system, prompt, maxTokens: LONG_TEXT_MAX_TOKENS });
    },

    async generateTitles({ topic, script, count = DEFAULT_TITLES_COUNT }) {
      const { system, prompt } = buildTitlesPrompt(topic, script, count);
      const text = await callAnthropicMessages(apiKey, { system, prompt });
      return parseJsonStringArray(text);
    },

    async generateDescription({ title, script }) {
      const { system, prompt } = buildDescriptionPrompt(title, script);
      return callAnthropicMessages(apiKey, { system, prompt, maxTokens: LONG_TEXT_MAX_TOKENS });
    },
  };
}
