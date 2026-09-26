import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { prisma } from "../prisma.js";

// Fase 11 — assim como a busca de tendências (Fase 6) contra a YouTube Data
// API, a chamada de verdade à Anthropic API não dá pra testar sem uma
// ANTHROPIC_API_KEY real (ver docs/ENVIRONMENT.md). Aqui cobre o que é
// nosso: guarda de autenticação e validação de parâmetros em cada rota.
describe("Rotas de IA (Fase 11)", () => {
  const app = buildApp();
  const createdEmails: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  async function registerUser(label: string) {
    const email = `ai-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    createdEmails.push(email);

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password: "senha-forte-123", name: "Teste" },
    });

    const token = response.cookies.find((c) => c.name === "token")?.value ?? "";
    return { token };
  }

  const routes: Array<{ url: string; validBody: unknown; invalidBody: unknown }> = [
    { url: "/api/ai/ideas", validBody: { topic: "gatos" }, invalidBody: { topic: "" } },
    { url: "/api/ai/script", validBody: { idea: "vídeo sobre gatos" }, invalidBody: { idea: "" } },
    { url: "/api/ai/titles", validBody: { topic: "gatos" }, invalidBody: { topic: "" } },
    {
      url: "/api/ai/description",
      validBody: { title: "10 dicas", script: "roteiro" },
      invalidBody: { title: "10 dicas" },
    },
  ];

  for (const route of routes) {
    it(`POST ${route.url} exige autenticação`, async () => {
      const response = await app.inject({
        method: "POST",
        url: route.url,
        payload: route.validBody,
      });
      expect(response.statusCode).toBe(401);
    });

    it(`POST ${route.url} rejeita parâmetros inválidos`, async () => {
      const { token } = await registerUser(route.url.replace(/\W/g, "-"));

      const response = await app.inject({
        method: "POST",
        url: route.url,
        cookies: { token },
        payload: route.invalidBody,
      });

      expect(response.statusCode).toBe(400);
    });
  }

  // A IA falha por motivos diferentes — cada um precisa chegar à tela com a
  // explicação certa, senão vira um "Falha ao gerar" que ninguém sabe consertar.
  describe("quando a Anthropic recusa a chamada", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function stubAnthropic(status: number, error: { type: string; message: string }) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify({ type: "error", error }), { status })),
      );
    }

    it("conta sem créditos -> 402 explicando como resolver", async () => {
      const { token } = await registerUser("no-credits");
      stubAnthropic(400, {
        type: "invalid_request_error",
        message: "Your credit balance is too low to access the Anthropic API.",
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/ai/script",
        cookies: { token },
        payload: { idea: "vídeo sobre gatos" },
      });

      expect(response.statusCode).toBe(402);
      expect((response.json() as { error: string }).error).toMatch(
        /sem créditos.*console.anthropic.com/,
      );
    });

    it("chave recusada -> 502 pedindo pra conferir ANTHROPIC_API_KEY", async () => {
      const { token } = await registerUser("bad-key");
      stubAnthropic(401, { type: "authentication_error", message: "invalid x-api-key" });

      const response = await app.inject({
        method: "POST",
        url: "/api/ai/titles",
        cookies: { token },
        payload: { topic: "gatos" },
      });

      expect(response.statusCode).toBe(502);
      expect((response.json() as { error: string }).error).toContain("ANTHROPIC_API_KEY");
    });

    it("limite de uso -> 429", async () => {
      const { token } = await registerUser("rate");
      stubAnthropic(429, { type: "rate_limit_error", message: "slow down" });

      const response = await app.inject({
        method: "POST",
        url: "/api/ai/ideas",
        cookies: { token },
        payload: { topic: "gatos" },
      });

      expect(response.statusCode).toBe(429);
    });

    it("falha desconhecida -> 502 genérico, sem vazar detalhes da API", async () => {
      const { token } = await registerUser("other");
      stubAnthropic(500, { type: "api_error", message: "detalhe interno da API" });

      const response = await app.inject({
        method: "POST",
        url: "/api/ai/description",
        cookies: { token },
        payload: { title: "10 dicas", script: "roteiro" },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toEqual({ error: "Falha ao gerar descrição com IA" });
    });
  });
});
