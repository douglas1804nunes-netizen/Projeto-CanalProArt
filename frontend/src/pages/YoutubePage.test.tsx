import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { YoutubePage } from "./YoutubePage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("YoutubePage", () => {
  it("mostra 'nenhum canal conectado' e o link pra conectar quando a lista está vazia", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    render(
      <MemoryRouter initialEntries={["/youtube"]}>
        <YoutubePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Nenhum canal conectado ainda.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Conectar YouTube" })).toHaveAttribute(
      "href",
      "/api/youtube/connect",
    );
  });

  it("lista os canais conectados com botão de desconectar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: "acc-1",
            channelId: "UC123",
            channelTitle: "Meu Canal",
            connectedAt: new Date().toISOString(),
          },
        ],
      }),
    );

    render(
      <MemoryRouter initialEntries={["/youtube"]}>
        <YoutubePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Meu Canal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desconectar" })).toBeInTheDocument();
  });

  it("mostra a mensagem de sucesso quando vem de ?connected=1", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    render(
      <MemoryRouter initialEntries={["/youtube?connected=1"]}>
        <YoutubePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Canal conectado com sucesso.")).toBeInTheDocument();
  });

  it("desconectar chama o DELETE e remove o canal da lista", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: "acc-1",
            channelId: "UC123",
            channelTitle: "Meu Canal",
            connectedAt: new Date().toISOString(),
          },
        ],
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/youtube"]}>
        <YoutubePage />
      </MemoryRouter>,
    );

    await screen.findByText("Meu Canal");
    fireEvent.click(screen.getByRole("button", { name: "Desconectar" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/youtube/accounts/acc-1",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
    expect(await screen.findByText("Nenhum canal conectado ainda.")).toBeInTheDocument();
  });
});
