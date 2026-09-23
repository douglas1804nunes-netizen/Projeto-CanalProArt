import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { prisma } from "../prisma.js";

// Requer Postgres real rodando (docker compose up -d postgres) — sem mocks,
// conforme a regra do projeto de não simular integrações críticas.
describe("Rotas de autenticação", () => {
  const app = buildApp();
  const createdEmails: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  function uniqueEmail(label: string) {
    const email = `auth-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    createdEmails.push(email);
    return email;
  }

  it("cadastra um usuário novo e devolve o cookie de sessão", async () => {
    const email = uniqueEmail("register");

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password: "senha-forte-123", name: "Fulano" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id: expect.any(String), email, name: "Fulano" });
    expect(response.cookies.some((c) => c.name === "token")).toBe(true);
  });

  it("rejeita cadastro com e-mail já usado", async () => {
    const email = uniqueEmail("dup");
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password: "senha-forte-123", name: "Um" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password: "outra-senha-123", name: "Dois" },
    });

    expect(response.statusCode).toBe(409);
  });

  it("rejeita cadastro com senha curta demais", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: uniqueEmail("weak"), password: "123", name: "Fraco" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("faz login com credenciais corretas e devolve o cookie de sessão", async () => {
    const email = uniqueEmail("login-ok");
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password: "senha-forte-123", name: "Login OK" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password: "senha-forte-123" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.cookies.some((c) => c.name === "token")).toBe(true);
  });

  it("rejeita login com senha errada", async () => {
    const email = uniqueEmail("login-bad-pass");
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password: "senha-forte-123", name: "Teste" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password: "senha-errada" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejeita login com e-mail inexistente", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "nao-existe-ninguem@example.com", password: "qualquer-coisa" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("GET /api/auth/me exige autenticação", async () => {
    const response = await app.inject({ method: "GET", url: "/api/auth/me" });
    expect(response.statusCode).toBe(401);
  });

  it("GET /api/auth/me retorna o usuário logado quando o cookie é válido", async () => {
    const email = uniqueEmail("me");
    const registerResponse = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password: "senha-forte-123", name: "Eu Mesmo" },
    });
    const token = registerResponse.cookies.find((c) => c.name === "token")?.value;

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: { token: token ?? "" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: expect.any(String), email, name: "Eu Mesmo" });
  });

  it("POST /api/auth/logout limpa o cookie de sessão", async () => {
    const response = await app.inject({ method: "POST", url: "/api/auth/logout" });

    expect(response.statusCode).toBe(200);
    const tokenCookie = response.cookies.find((c) => c.name === "token");
    expect(tokenCookie?.value).toBe("");
  });
});
