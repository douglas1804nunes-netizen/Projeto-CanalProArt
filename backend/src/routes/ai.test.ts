import { afterAll, describe, expect, it } from "vitest";
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
});
