import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { prisma } from "../prisma.js";

// Requer Postgres real rodando — sem mocks (mesma regra do projeto). O
// hand-off de verdade com o Google (troca de code por tokens) não dá pra
// testar sem credenciais OAuth reais; aqui cobre tudo que é nosso: guarda de
// autenticação, validação de state (CSRF), e isolamento por usuário.
describe("Rotas do YouTube (Fase 4)", () => {
  const app = buildApp();
  const createdEmails: string[] = [];
  const createdYoutubeAccountIds: string[] = [];

  afterAll(async () => {
    await prisma.youtubeAccount.deleteMany({ where: { id: { in: createdYoutubeAccountIds } } });
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  async function registerUser(label: string) {
    const email = `youtube-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    createdEmails.push(email);

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password: "senha-forte-123", name: "Teste" },
    });

    const token = response.cookies.find((c) => c.name === "token")?.value ?? "";
    const userId = (response.json() as { id: string }).id;
    return { token, userId };
  }

  async function createFakeYoutubeAccount(userId: string, channelTitle: string) {
    const account = await prisma.youtubeAccount.create({
      data: {
        userId,
        channelId: `channel-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        channelTitle,
        accessToken: "fake-encrypted-access",
        refreshToken: "fake-encrypted-refresh",
        scopes: ["https://www.googleapis.com/auth/youtube.readonly"],
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    createdYoutubeAccountIds.push(account.id);
    return account;
  }

  it("GET /api/youtube/accounts exige autenticação", async () => {
    const response = await app.inject({ method: "GET", url: "/api/youtube/accounts" });
    expect(response.statusCode).toBe(401);
  });

  it("GET /api/youtube/connect exige autenticação", async () => {
    const response = await app.inject({ method: "GET", url: "/api/youtube/connect" });
    expect(response.statusCode).toBe(401);
  });

  it("GET /api/youtube/callback exige autenticação", async () => {
    const response = await app.inject({ method: "GET", url: "/api/youtube/callback" });
    expect(response.statusCode).toBe(401);
  });

  it("DELETE /api/youtube/accounts/:id exige autenticação", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/youtube/accounts/algum-id",
    });
    expect(response.statusCode).toBe(401);
  });

  it("GET /api/youtube/connect redireciona pro Google com state e seta o cookie de state", async () => {
    const { token } = await registerUser("connect");

    const response = await app.inject({
      method: "GET",
      url: "/api/youtube/connect",
      cookies: { token },
    });

    expect(response.statusCode).toBe(302);
    const location = new URL(response.headers.location as string);
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.searchParams.get("access_type")).toBe("offline");
    expect(location.searchParams.get("prompt")).toBe("consent");

    const stateCookie = response.cookies.find((c) => c.name === "youtube_oauth_state");
    expect(stateCookie?.value).toBeTruthy();
    expect(location.searchParams.get("state")).toBe(stateCookie?.value);
  });

  it("GET /api/youtube/callback rejeita quando falta code/state", async () => {
    const { token } = await registerUser("callback-missing");

    const response = await app.inject({
      method: "GET",
      url: "/api/youtube/callback",
      cookies: { token },
    });

    expect(response.statusCode).toBe(400);
  });

  it("GET /api/youtube/callback rejeita state que não bate com o cookie (CSRF)", async () => {
    const { token } = await registerUser("callback-state-mismatch");

    const response = await app.inject({
      method: "GET",
      url: "/api/youtube/callback?code=fake-code&state=state-errado",
      cookies: { token, youtube_oauth_state: "state-certo" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("GET /api/youtube/callback repassa o erro quando o Google nega a autorização", async () => {
    const { token } = await registerUser("callback-denied");

    const response = await app.inject({
      method: "GET",
      url: "/api/youtube/callback?error=access_denied",
      cookies: { token },
    });

    expect(response.statusCode).toBe(400);
  });

  it("GET /api/youtube/accounts lista só as contas do usuário logado, sem os tokens", async () => {
    const { token, userId } = await registerUser("list");
    const account = await createFakeYoutubeAccount(userId, "Canal Listado");

    const response = await app.inject({
      method: "GET",
      url: "/api/youtube/accounts",
      cookies: { token },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: account.id, channelTitle: "Canal Listado" });
    expect(body[0]).not.toHaveProperty("accessToken");
    expect(body[0]).not.toHaveProperty("refreshToken");
  });

  it("DELETE /api/youtube/accounts/:id devolve 404 para conta de outro usuário", async () => {
    const { userId: ownerId } = await registerUser("owner");
    const { token: otherUserToken } = await registerUser("intruder");
    const account = await createFakeYoutubeAccount(ownerId, "Canal Protegido");

    const response = await app.inject({
      method: "DELETE",
      url: `/api/youtube/accounts/${account.id}`,
      cookies: { token: otherUserToken },
    });

    expect(response.statusCode).toBe(404);
  });

  it("DELETE /api/youtube/accounts/:id remove a conta do próprio usuário", async () => {
    const { token, userId } = await registerUser("delete-own");
    const account = await createFakeYoutubeAccount(userId, "Canal a Remover");

    const response = await app.inject({
      method: "DELETE",
      url: `/api/youtube/accounts/${account.id}`,
      cookies: { token },
    });

    expect(response.statusCode).toBe(200);
    expect(await prisma.youtubeAccount.findUnique({ where: { id: account.id } })).toBeNull();
  });
});
