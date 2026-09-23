import { describe, expect, it } from "vitest";
import { parseJsonStringArray } from "./parser.js";

describe("parseJsonStringArray", () => {
  it("faz parse de um array JSON limpo", () => {
    expect(parseJsonStringArray('["ideia 1", "ideia 2"]')).toEqual(["ideia 1", "ideia 2"]);
  });

  it("remove cerca de código com a linguagem (```json)", () => {
    expect(parseJsonStringArray('```json\n["a", "b"]\n```')).toEqual(["a", "b"]);
  });

  it("remove cerca de código sem a linguagem (```)", () => {
    expect(parseJsonStringArray('```\n["a", "b"]\n```')).toEqual(["a", "b"]);
  });

  it("lida com espaços extras ao redor", () => {
    expect(parseJsonStringArray('  \n ["a"]  \n')).toEqual(["a"]);
  });

  it("lança erro para JSON inválido", () => {
    expect(() => parseJsonStringArray("isso não é json")).toThrow("não é um JSON válido");
  });

  it("lança erro para um objeto JSON válido que não é array", () => {
    expect(() => parseJsonStringArray('{"a": 1}')).toThrow("não é um array de strings");
  });

  it("lança erro para um array com itens que não são strings", () => {
    expect(() => parseJsonStringArray("[1, 2, 3]")).toThrow("não é um array de strings");
  });
});
