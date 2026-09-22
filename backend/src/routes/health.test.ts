import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";

// Requer Postgres real rodando (docker compose up -d postgres) — sem mocks,
// conforme a regra do projeto de não simular integrações críticas.
describe("GET /api/health", () => {
  const app = buildApp();

  afterAll(async () => {
    // app.close() dispara o hook "onClose" (src/app.ts), que desconecta o Prisma.
    await app.close();
  });

  it("retorna status ok e confirma conexão com o banco", async () => {
    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", database: "connected" });
  });
});
