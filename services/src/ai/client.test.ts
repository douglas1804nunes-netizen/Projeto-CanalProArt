import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicApiError, callAnthropicMessages, pingAnthropic } from "./client.js";

// Sem rede: o fetch global é substituído por respostas fabricadas.
afterEach(() => {
  vi.unstubAllGlobals();
});

function stubResponse(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const NO_CREDITS = {
  type: "error",
  error: {
    type: "invalid_request_error",
    message:
      "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
  },
};

describe("callAnthropicMessages — classificação das falhas", () => {
  const params = { system: "s", prompt: "p" };

  it("devolve o texto quando dá certo", async () => {
    stubResponse(200, { content: [{ type: "text", text: "olá" }] });

    await expect(callAnthropicMessages("chave", params)).resolves.toBe("olá");
  });

  it("reconhece conta sem créditos (400 com a frase da API), não como pedido malformado", async () => {
    stubResponse(400, NO_CREDITS);

    const error = await callAnthropicMessages("chave", params).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AnthropicApiError);
    expect(error).toMatchObject({ status: 400, kind: "no_credits" });
    // a mensagem crua fica em apiMessage; a `message` do Error segue sem detalhes
    expect((error as AnthropicApiError).message).toBe("Falha ao chamar a Anthropic API (HTTP 400)");
    expect((error as AnthropicApiError).apiMessage).toContain("credit balance");
  });

  it("um 400 de outro tipo continua sendo 'other'", async () => {
    stubResponse(400, { error: { type: "invalid_request_error", message: "max_tokens inválido" } });

    await expect(callAnthropicMessages("chave", params)).rejects.toMatchObject({ kind: "other" });
  });

  it.each([401, 403])("%s vira chave recusada", async (status) => {
    stubResponse(status, { error: { type: "authentication_error", message: "invalid x-api-key" } });

    await expect(callAnthropicMessages("chave", params)).rejects.toMatchObject({
      status,
      kind: "invalid_key",
    });
  });

  it("429 vira limite de uso", async () => {
    stubResponse(429, { error: { type: "rate_limit_error", message: "slow down" } });

    await expect(callAnthropicMessages("chave", params)).rejects.toMatchObject({
      kind: "rate_limited",
    });
  });

  it("aguenta resposta de erro que não é JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>Bad Gateway</html>", { status: 502 })),
    );

    await expect(callAnthropicMessages("chave", params)).rejects.toMatchObject({
      status: 502,
      kind: "other",
      apiMessage: undefined,
    });
  });
});

describe("pingAnthropic", () => {
  it("pede só 1 token de saída (custo mínimo) e não lê o corpo quando dá certo", async () => {
    const fetchMock = stubResponse(200, { content: [] });

    await expect(pingAnthropic("chave")).resolves.toBeUndefined();

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ max_tokens: 1 });
  });

  it("falha com o motivo quando a conta está sem créditos", async () => {
    stubResponse(400, NO_CREDITS);

    await expect(pingAnthropic("chave")).rejects.toMatchObject({ kind: "no_credits" });
  });
});
