import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "./crypto.js";

describe("encryptToken / decryptToken", () => {
  it("faz round-trip preservando o texto original", () => {
    const plaintext = "um-access-token-bem-secreto";
    const encrypted = encryptToken(plaintext);

    expect(encrypted).not.toContain(plaintext);
    expect(decryptToken(encrypted)).toBe(plaintext);
  });

  it("gera ciphertexts diferentes para o mesmo texto (IV aleatório)", () => {
    const plaintext = "mesmo-texto-duas-vezes";
    expect(encryptToken(plaintext)).not.toBe(encryptToken(plaintext));
  });

  it("rejeita payload adulterado (auth tag do GCM detecta)", () => {
    const encrypted = encryptToken("texto original");
    const [iv, tag, data] = encrypted.split(":");
    const tampered = [iv, tag, `${data.slice(0, -2)}00`].join(":");

    expect(() => decryptToken(tampered)).toThrow();
  });

  it("rejeita payload em formato inválido", () => {
    expect(() => decryptToken("nao-e-um-payload-valido")).toThrow();
  });
});
