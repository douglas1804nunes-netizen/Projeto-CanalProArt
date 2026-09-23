import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

function mockFetch({ authenticated }: { authenticated: boolean }) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/auth/me") {
        return authenticated
          ? Promise.resolve({
              ok: true,
              json: async () => ({ id: "1", email: "teste@example.com", name: "Usuário Teste" }),
            })
          : Promise.resolve({
              ok: false,
              status: 401,
              json: async () => ({ error: "Não autenticado" }),
            });
      }

      if (url === "/api/health") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: "ok", database: "connected" }),
        });
      }

      return Promise.reject(new Error(`fetch não mockado para ${url}`));
    }),
  );
}

describe("App shell", () => {
  it("renderiza o menu de navegação e o dashboard quando autenticado", async () => {
    mockFetch({ authenticated: true });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    // "CanalProArt" aparece 2x: na sidebar (sempre no DOM) e no header mobile
    // (visível só em telas pequenas via CSS — jsdom não filtra por media query).
    expect(await screen.findAllByText("CanalProArt")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Tendências" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();

    expect(await screen.findByText(/Backend online/)).toBeInTheDocument();
  });

  it("renderiza a página 404 para rotas desconhecidas quando autenticado", async () => {
    mockFetch({ authenticated: true });

    render(
      <MemoryRouter initialEntries={["/rota-que-nao-existe"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Página não encontrada" }),
    ).toBeInTheDocument();
  });

  it("redireciona para /login quando não autenticado", async () => {
    mockFetch({ authenticated: false });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Entrar" })).toBeInTheDocument();
  });
});
