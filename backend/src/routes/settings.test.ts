import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { prisma } from "../prisma.js";
import { buildConfigWarnings } from "./settings.js";

describe("buildConfigWarnings", () => {
  const productionUrl = "https://canalproart.onrender.com";

  it("não avisa nada fora de produção (dev tem origens diferentes por design)", () => {
    expect(
      buildConfigWarnings({
        nodeEnv: "development",
        redirectUri: "http://localhost:3000/api/youtube/callback",
        frontendUrl: "http://localhost:5173",
      }),
    ).toEqual([]);
  });

  it("não avisa quando a produção está consistente", () => {
    expect(
      buildConfigWarnings({
        nodeEnv: "production",
        redirectUri: `${productionUrl}/api/youtube/callback`,
        frontendUrl: productionUrl,
      }),
    ).toEqual([]);
  });

  it("avisa quando a redirect URI aponta pra localhost em produção", () => {
    const warnings = buildConfigWarnings({
      nodeEnv: "production",
      redirectUri: "http://localhost:3000/api/youtube/callback",
      frontendUrl: "http://localhost:3000",
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("localhost");
  });

  it("avisa quando redirect URI e FRONTEND_URL têm origens diferentes em produção", () => {
    const warnings = buildConfigWarnings({
      nodeEnv: "production",
      redirectUri: "https://outro-dominio.com/api/youtube/callback",
      frontendUrl: productionUrl,
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("origens diferentes");
  });
});

// Não chama Google/Anthropic de verdade: as checagens de chave usam o fetch
// global, que é substituído por respostas fabricadas.
describe("Rotas de configurações", () => {
  // Instância nova a cada teste: /api/settings/check tem rate limit (5/min) em
  // memória, e são mais que 5 chamadas no arquivo.
  let app = buildApp();
  const createdEmails: string[] = [];

  beforeEach(async () => {
    await app.close();
    app = buildApp();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  async function registerToken(label: string) {
    const email = `settings-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    createdEmails.push(email);
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password: "senha-forte-123", name: "Teste" },
    });
    return response.cookies.find((c) => c.name === "token")?.value ?? "";
  }

  function stubFetch(handler: (url: string) => { status: number; body?: unknown }) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const { status, body } = handler(String(input));
        return new Response(JSON.stringify(body ?? {}), { status });
      }),
    );
  }

  it("GET /api/settings exige autenticação", async () => {
    const response = await app.inject({ method: "GET", url: "/api/settings" });
    expect(response.statusCode).toBe(401);
  });

  it("POST /api/settings/check exige autenticação", async () => {
    const response = await app.inject({ method: "POST", url: "/api/settings/check" });
    expect(response.statusCode).toBe(401);
  });

  it("GET /api/settings devolve o estado do ambiente sem expor nenhum segredo", async () => {
    const token = await registerToken("info");

    const response = await app.inject({
      method: "GET",
      url: "/api/settings",
      cookies: { token },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body).toMatchObject({
      aiProvider: expect.any(String),
      youtubeRedirectUri: expect.stringContaining("/api/youtube/callback"),
      youtubeChannels: 0,
      warnings: expect.any(Array),
    });
    const serialized = JSON.stringify(body);
    for (const secret of [
      process.env.JWT_SECRET,
      process.env.TOKEN_ENCRYPTION_KEY,
      process.env.YOUTUBE_API_KEY,
      process.env.YOUTUBE_CLIENT_SECRET,
      process.env.ANTHROPIC_API_KEY,
    ]) {
      if (secret) expect(serialized).not.toContain(secret);
    }
  });

  it("POST /api/settings/check confirma as duas chaves quando os serviços respondem 200", async () => {
    const token = await registerToken("check-ok");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.inject({
      method: "POST",
      url: "/api/settings/check",
      cookies: { token },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      youtubeApiKey: { ok: true },
      anthropicApiKey: { ok: true },
    });

    // A IA é testada com uma geração mínima (POST /v1/messages), não só listando
    // modelos — listar responde 200 até com a conta sem crédito.
    const anthropicCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("anthropic.com"),
    ) as unknown as [string, RequestInit] | undefined;
    expect(anthropicCall?.[0]).toContain("/v1/messages");
    expect(anthropicCall?.[1].method).toBe("POST");
  });

  it("POST /api/settings/check aponta qual chave foi recusada", async () => {
    const token = await registerToken("check-invalid");
    stubFetch((url) =>
      url.includes("googleapis.com")
        ? { status: 400, body: { error: { errors: [{ reason: "keyInvalid" }] } } }
        : { status: 401 },
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/settings/check",
      cookies: { token },
    });

    const body = response.json() as {
      youtubeApiKey: { ok: boolean; message: string };
      anthropicApiKey: { ok: boolean; message: string };
    };
    expect(body.youtubeApiKey.ok).toBe(false);
    expect(body.youtubeApiKey.message).toContain("YOUTUBE_API_KEY");
    expect(body.anthropicApiKey.ok).toBe(false);
    expect(body.anthropicApiKey.message).toContain("ANTHROPIC_API_KEY");
  });

  it("POST /api/settings/check avisa que a IA está sem créditos mesmo com a chave válida", async () => {
    const token = await registerToken("check-credits");
    stubFetch((url) =>
      url.includes("anthropic.com")
        ? {
            status: 400,
            body: {
              error: {
                type: "invalid_request_error",
                message: "Your credit balance is too low to access the Anthropic API.",
              },
            },
          }
        : { status: 200 },
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/settings/check",
      cookies: { token },
    });

    const body = response.json() as {
      youtubeApiKey: { ok: boolean };
      anthropicApiKey: { ok: boolean; message: string };
    };
    expect(body.youtubeApiKey.ok).toBe(true);
    expect(body.anthropicApiKey.ok).toBe(false);
    expect(body.anthropicApiKey.message).toContain("sem créditos");
    expect(body.anthropicApiKey.message).toContain("console.anthropic.com");
  });

  it("POST /api/settings/check diferencia cota esgotada de chave inválida", async () => {
    const token = await registerToken("check-quota");
    stubFetch((url) =>
      url.includes("googleapis.com")
        ? { status: 403, body: { error: { errors: [{ reason: "quotaExceeded" }] } } }
        : { status: 200 },
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/settings/check",
      cookies: { token },
    });

    const body = response.json() as { youtubeApiKey: { ok: boolean; message: string } };
    expect(body.youtubeApiKey.ok).toBe(false);
    expect(body.youtubeApiKey.message).toContain("cota");
  });

  it("POST /api/settings/check responde 200 mesmo quando a rede falha", async () => {
    const token = await registerToken("check-network");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/settings/check",
      cookies: { token },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      youtubeApiKey: { ok: false },
      anthropicApiKey: { ok: false },
    });
  });
});
