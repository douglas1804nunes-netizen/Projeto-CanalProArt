import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrendsPage } from "./TrendsPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <TrendsPage />
    </MemoryRouter>,
  );
}

const sampleVideo = {
  id: "video-1",
  youtubeVideoId: "yt-1",
  url: "https://www.youtube.com/watch?v=yt-1",
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

    renderPage();

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

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));

    expect(await screen.findByText("Um vídeo em alta")).toBeInTheDocument();
    expect(screen.getByText("Canal Teste")).toBeInTheDocument();
    expect(screen.getByText(/1\.5M visualizações/)).toBeInTheDocument();
    expect(screen.getByText(/3\.2% engajamento/)).toBeInTheDocument();
    expect(screen.getByText(/2\.5mil views\/h/)).toBeInTheDocument();
  });

  it("mostra o badge de classificação do trend quando presente", async () => {
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
            trend: { id: "trend-1", score: 82, classification: "HOT" },
            videos: [sampleVideo],
          }),
        });
      }
      return Promise.reject(new Error(`fetch não mockado para ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));

    expect(await screen.findByText(/Em alta · 82/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver análise completa" })).toHaveAttribute(
      "href",
      "/trends/trend-1",
    );
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

    renderPage();

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

    renderPage();

    const chip = await screen.findByRole("button", { name: /^gatos · BR$/ });
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

  it("cada vídeo tem um link pra abrir no YouTube em outra aba", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/trends/searches") {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          searchId: "search-1",
          cached: false,
          fetchedAt: new Date().toISOString(),
          videos: [sampleVideo],
        }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));

    const link = await screen.findByRole("link", { name: /Abrir no YouTube/ });
    expect(link).toHaveAttribute("href", "https://www.youtube.com/watch?v=yt-1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("mostra o link de cada vídeo na descrição e copia com um clique", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const secondVideo = {
      ...sampleVideo,
      id: "video-2",
      youtubeVideoId: "yt-2",
      url: "https://www.youtube.com/watch?v=yt-2",
      title: "Outro vídeo",
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === "/api/trends/searches") {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          searchId: "search-1",
          cached: false,
          fetchedAt: new Date().toISOString(),
          videos: [sampleVideo, secondVideo],
        }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));

    // um link visível por vídeo, sem precisar abrir nada pra descobrir
    expect(
      await screen.findByRole("link", { name: "www.youtube.com/watch?v=yt-1" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "www.youtube.com/watch?v=yt-2" })).toBeInTheDocument();

    const copyButtons = screen.getAllByRole("button", { name: "Copiar link" });
    expect(copyButtons).toHaveLength(2);
    fireEvent.click(copyButtons[1] as HTMLElement);

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("https://www.youtube.com/watch?v=yt-2"),
    );
    expect(await screen.findByRole("button", { name: "Copiado!" })).toBeInTheDocument();
  });

  describe("capas das pesquisas recentes", () => {
    const COVER = "https://i.ytimg.com/vi/abc/hqdefault.jpg";

    function mockSearches() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => [
            {
              id: "s1",
              query: "gatos",
              regionCode: "BR",
              resultCount: 2,
              fetchedAt: "2026-01-01",
              coverUrl: COVER,
            },
            {
              id: "s2",
              query: "vazia",
              regionCode: "BR",
              resultCount: 1,
              fetchedAt: "2026-01-02",
              coverUrl: null,
            },
          ],
        }),
      );
    }

    it("mostra a capa de cada pesquisa e a quantidade de vídeos", async () => {
      mockSearches();
      const { container } = renderPage();

      await screen.findByRole("button", { name: /^gatos · BR$/ });

      expect(container.querySelector(`img[src="${COVER}"]`)).not.toBeNull();
      expect(screen.getByText("2 vídeos")).toBeInTheDocument();
      expect(screen.getByText("1 vídeo")).toBeInTheDocument();
      // sem capa: um bloco neutro no lugar (não uma imagem quebrada)
      expect(container.querySelectorAll("img")).toHaveLength(1);
      expect(screen.getAllByText("▶")).toHaveLength(1);
    });

    it("troca a capa por um bloco neutro quando a imagem falha ao carregar", async () => {
      mockSearches();
      const { container } = renderPage();
      await screen.findByRole("button", { name: /^gatos · BR$/ });

      const image = container.querySelector(`img[src="${COVER}"]`);
      expect(image).not.toBeNull();
      fireEvent.error(image as Element);

      await waitFor(() => expect(container.querySelector(`img[src="${COVER}"]`)).toBeNull());
      expect(screen.getAllByText("▶")).toHaveLength(2);
    });
  });

  describe("exclusão de pesquisas", () => {
    const searches = [
      {
        id: "s1",
        query: "gatos",
        regionCode: "BR",
        resultCount: 1,
        fetchedAt: "2026-01-01",
        coverUrl: null,
      },
      {
        id: "s2",
        query: null,
        regionCode: "US",
        resultCount: 1,
        fetchedAt: "2026-01-02",
        coverUrl: null,
      },
    ];

    function mockHistory(deleteResponse: { ok: boolean; status?: number }) {
      const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/trends/searches" && init?.method === "DELETE") {
          return Promise.resolve({ ...deleteResponse, json: async () => ({ deleted: 2 }) });
        }
        if (url.startsWith("/api/trends/searches/") && init?.method === "DELETE") {
          return Promise.resolve(deleteResponse);
        }
        if (url === "/api/trends/searches") {
          return Promise.resolve({ ok: true, json: async () => searches });
        }
        return Promise.reject(new Error(`fetch não mockado para ${url}`));
      });
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    it("exclui uma pesquisa do histórico e some da lista", async () => {
      const fetchMock = mockHistory({ ok: true, status: 204 });
      renderPage();

      fireEvent.click(await screen.findByRole("button", { name: "Excluir pesquisa gatos · BR" }));

      await waitFor(() =>
        expect(screen.queryByRole("button", { name: /^gatos · BR$/ })).not.toBeInTheDocument(),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trends/searches/s1",
        expect.objectContaining({ method: "DELETE" }),
      );
      // a outra pesquisa continua lá
      expect(screen.getByRole("button", { name: /^populares · US$/ })).toBeInTheDocument();
    });

    it("mostra erro e mantém a pesquisa se a exclusão falha", async () => {
      mockHistory({ ok: false, status: 500 });
      renderPage();

      fireEvent.click(await screen.findByRole("button", { name: "Excluir pesquisa gatos · BR" }));

      expect(await screen.findByText("Não foi possível excluir a pesquisa.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^gatos · BR$/ })).toBeInTheDocument();
    });

    it("limpa todo o histórico depois de confirmar", async () => {
      vi.stubGlobal(
        "confirm",
        vi.fn(() => true),
      );
      const fetchMock = mockHistory({ ok: true, status: 200 });
      renderPage();

      fireEvent.click(await screen.findByRole("button", { name: "Limpar histórico" }));

      await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Limpar histórico" })).not.toBeInTheDocument(),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trends/searches",
        expect.objectContaining({ method: "DELETE" }),
      );
      expect(screen.queryByRole("button", { name: /gatos/ })).not.toBeInTheDocument();
    });

    it("não apaga nada se o usuário cancelar a confirmação", async () => {
      vi.stubGlobal(
        "confirm",
        vi.fn(() => false),
      );
      const fetchMock = mockHistory({ ok: true, status: 200 });
      renderPage();

      fireEvent.click(await screen.findByRole("button", { name: "Limpar histórico" }));

      expect(screen.getByRole("button", { name: /^gatos · BR$/ })).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalledWith(
        "/api/trends/searches",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });
});
