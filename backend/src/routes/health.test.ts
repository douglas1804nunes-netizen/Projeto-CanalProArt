import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";

// Requer Postgres real rodando (docker compose up -d postgres) — sem mocks,
// conforme a regra do projeto de não simular integrações críticas.
describe("GET /api/health", () => {
  it("retorna status ok e confirma conexão com o banco", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", database: "connected" });

    await app.close();
  });
});
