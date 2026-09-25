import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrendAnalysisPage } from "./TrendAnalysisPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage(id = "trend-1") {
  return render(
    <MemoryRouter initialEntries={[`/trends/${id}`]}>
      <Routes>
        <Route path="/trends/:id" element={<TrendAnalysisPage />} />
      </Routes>
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
  videoScore: 0.75,
};

describe("TrendAnalysisPage", () => {
  it("mostra o cabeçalho e os vídeos da tendência", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "trend-1",
          topic: "gatos",
          regionCode: "BR",
          trendScore: 82,
          classification: "HOT",
          fetchedAt: new Date().toISOString(),
          videos: [sampleVideo],
          history: [],
        }),
      }),
    );

    renderPage();

    expect(await screen.findByText("gatos")).toBeInTheDocument();
    expect(screen.getByText(/Em alta · 82/)).toBeInTheDocument();
    expect(screen.getByText("Um vídeo em alta")).toBeInTheDocument();
    expect(screen.getByText(/Score do vídeo: 0\.75/)).toBeInTheDocument();
    // o link de cada vídeo já aparece na descrição, com o botão de copiar
    expect(screen.getByRole("link", { name: "www.youtube.com/watch?v=yt-1" })).toHaveAttribute(
      "href",
      "https://www.youtube.com/watch?v=yt-1",
    );
    expect(screen.getByRole("button", { name: "Copiar link" })).toBeInTheDocument();
  });

  it("mostra mensagem quando não há histórico suficiente", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "trend-1",
          topic: "gatos",
          regionCode: "BR",
          trendScore: 82,
          classification: "HOT",
          fetchedAt: new Date().toISOString(),
          videos: [],
          history: [
            {
              id: "trend-1",
              fetchedAt: new Date().toISOString(),
              trendScore: 82,
              classification: "HOT",
            },
          ],
        }),
      }),
    );

    renderPage();

    expect(await screen.findByText(/Ainda não há histórico suficiente/)).toBeInTheDocument();
    expect(screen.getByText("Nenhum vídeo associado.")).toBeInTheDocument();
  });

  it("mostra 404 quando a tendência não existe", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    renderPage();

    expect(await screen.findByText("Tendência não encontrada.")).toBeInTheDocument();
  });

  it("mostra erro quando a API falha", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );

    renderPage();

    expect(await screen.findByText(/Não foi possível carregar a análise/)).toBeInTheDocument();
  });
});
