import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublishedVideosPage } from "./PublishedVideosPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <PublishedVideosPage />
    </MemoryRouter>,
  );
}

describe("PublishedVideosPage", () => {
  it("mostra mensagem quando não há publicações", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    renderPage();

    expect(await screen.findByText("Nenhuma publicação ainda.")).toBeInTheDocument();
  });

  it("lista publicações com sucesso e falha", async () => {
    const videos = [
      {
        id: "pub-1",
        contentProjectId: "project-1",
        contentProjectTitle: "Projeto publicado",
        channelTitle: "Meu Canal",
        youtubeVideoId: "abc123",
        status: "PUBLISHED" as const,
        publishedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      {
        id: "pub-2",
        contentProjectId: "project-2",
        contentProjectTitle: "Projeto que falhou",
        channelTitle: "Meu Canal",
        youtubeVideoId: null,
        status: "FAILED" as const,
        publishedAt: null,
        createdAt: new Date().toISOString(),
      },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => videos }));

    renderPage();

    expect(await screen.findByText("Projeto publicado")).toBeInTheDocument();
    expect(screen.getByText("Publicado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver no YouTube" })).toHaveAttribute(
      "href",
      "https://youtube.com/watch?v=abc123",
    );

    expect(screen.getByText("Projeto que falhou")).toBeInTheDocument();
    expect(screen.getByText("Falhou")).toBeInTheDocument();
  });

  it("mostra erro quando a API falha", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );

    renderPage();

    expect(await screen.findByText(/Não foi possível carregar o histórico/)).toBeInTheDocument();
  });
});
