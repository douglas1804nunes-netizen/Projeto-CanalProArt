import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrendsPage } from "./TrendsPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

const sampleVideo = {
  id: "video-1",
  youtubeVideoId: "yt-1",
  channelTitle: "Canal Teste",
  title: "Um vídeo em alta",
  thumbnailUrl: "https://example.com/thumb.jpg",
  publishedAt: new Date().toISOString(),
  durationSeconds: 125,
  viewCount: "1500000",
  likeCount: "1000",
  commentCount: "50",
  velocity: 2500,
  engagementRate: 0.032,
  recencyScore: 0.8,
};

describe("TrendsPage", () => {
  it("renderiza o formulário de busca sem resultados inicialmente", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    render(<TrendsPage />);

    expect(screen.getByRole("heading", { name: "Tendências" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buscar" })).toBeInTheDocument();
    expect(screen.queryByText(/vídeo em alta/)).not.toBeInTheDocument();
  });

  it("mostra os resultados depois de buscar", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/trends/searches") {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url === "/api/trends/search") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            searchId: "search-1",
            cached: false,
            fetchedAt: new Date().toISOString(),
            videos: [sampleVideo],
          }),
        });
      }
      return Promise.reject(new Error(`fetch não mockado para ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TrendsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));

    expect(await screen.findByText("Um vídeo em alta")).toBeInTheDocument();
    expect(screen.getByText("Canal Teste")).toBeInTheDocument();
    expect(screen.getByText(/1\.5M visualizações/)).toBeInTheDocument();
    expect(screen.getByText(/3\.2% engajamento/)).toBeInTheDocument();
    expect(screen.getByText(/2\.5mil views\/h/)).toBeInTheDocument();
  });

  it("mostra erro quando a busca falha", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/trends/searches") {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return Promise.resolve({ ok: false, status: 502, json: async () => ({ error: "Falha" }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TrendsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));

    expect(await screen.findByText(/Não foi possível buscar/)).toBeInTheDocument();
  });

  it("renderiza buscas recentes e permite clicar pra rebuscar", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/trends/searches") {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              id: "search-1",
              query: "gatos",
              regionCode: "BR",
              resultCount: 1,
              fetchedAt: new Date().toISOString(),
            },
          ],
        });
      }
      if (url === "/api/trends/search") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            searchId: "search-1",
            cached: true,
            fetchedAt: new Date().toISOString(),
            videos: [sampleVideo],
          }),
        });
      }
      return Promise.reject(new Error(`fetch não mockado para ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TrendsPage />);

    const chip = await screen.findByRole("button", { name: /gatos · BR/ });
    fireEvent.click(chip);

    expect(await screen.findByText("Um vídeo em alta")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trends/search",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ query: "gatos", regionCode: "BR" }),
      }),
    );
  });
});
