// Contrato desacoplado da implementação — quem chama (backend/, workers/ a
// partir da Fase 21+) depende só desta interface, nunca de um provider
// concreto. Trocar de provider (ex.: adicionar OpenAI) não deve exigir mudar
// nenhum código que já usa AIProvider, só o factory em ./index.ts.
export type AIProvider = {
  generateIdeas(input: GenerateIdeasInput): Promise<string[]>;
  generateScript(input: GenerateScriptInput): Promise<string>;
  generateTitles(input: GenerateTitlesInput): Promise<string[]>;
  generateDescription(input: GenerateDescriptionInput): Promise<string>;
};

export type GenerateIdeasInput = {
  topic: string;
  count?: number;
};

export type GenerateScriptInput = {
  idea: string;
  durationSeconds?: number;
};

export type GenerateTitlesInput = {
  topic: string;
  script?: string;
  count?: number;
};

export type GenerateDescriptionInput = {
  title: string;
  script: string;
};
