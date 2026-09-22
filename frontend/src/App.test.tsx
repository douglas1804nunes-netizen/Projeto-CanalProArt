import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

describe("App shell", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "ok", database: "connected" }),
      }),
    );
  });

  it("renderiza o menu de navegação e o dashboard", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    // "CanalProArt" aparece 2x: na sidebar (sempre no DOM) e no header mobile
    // (visível só em telas pequenas via CSS — jsdom não filtra por media query).
    expect(screen.getAllByText("CanalProArt")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Tendências" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();

    expect(await screen.findByText(/Backend online/)).toBeInTheDocument();
  });

  it("renderiza a página 404 para rotas desconhecidas", () => {
    render(
      <MemoryRouter initialEntries={["/rota-que-nao-existe"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Página não encontrada" })).toBeInTheDocument();
  });
});
