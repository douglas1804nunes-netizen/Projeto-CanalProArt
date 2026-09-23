import { describe, expect, it } from "vitest";
import {
  buildDescriptionPrompt,
  buildIdeasPrompt,
  buildScriptPrompt,
  buildTitlesPrompt,
} from "./prompts.js";

describe("buildIdeasPrompt", () => {
  it("inclui o tópico e a quantidade pedida", () => {
    const { prompt, system } = buildIdeasPrompt("receitas fitness", 3);
    expect(prompt).toContain("receitas fitness");
    expect(prompt).toContain("3 ideias");
    expect(system).toContain("array JSON");
  });
});

describe("buildScriptPrompt", () => {
  it("inclui a ideia", () => {
    const { prompt } = buildScriptPrompt("vídeo sobre café");
    expect(prompt).toContain("vídeo sobre café");
  });

  it("inclui a duração aproximada em minutos quando informada", () => {
    const { prompt } = buildScriptPrompt("vídeo sobre café", 600);
    expect(prompt).toContain("10 minutos");
  });

  it("não menciona duração quando não informada", () => {
    const { prompt } = buildScriptPrompt("vídeo sobre café");
    expect(prompt).not.toContain("minutos");
  });
});

describe("buildTitlesPrompt", () => {
  it("inclui o tópico e a quantidade pedida", () => {
    const { prompt } = buildTitlesPrompt("gatos", undefined, 4);
    expect(prompt).toContain("gatos");
    expect(prompt).toContain("4 opções");
  });

  it("inclui o roteiro como contexto quando informado", () => {
    const { prompt } = buildTitlesPrompt("gatos", "roteiro completo aqui", 4);
    expect(prompt).toContain("roteiro completo aqui");
  });
});

describe("buildDescriptionPrompt", () => {
  it("inclui o título e o roteiro", () => {
    const { prompt } = buildDescriptionPrompt("10 dicas de café", "roteiro completo aqui");
    expect(prompt).toContain("10 dicas de café");
    expect(prompt).toContain("roteiro completo aqui");
  });
});
