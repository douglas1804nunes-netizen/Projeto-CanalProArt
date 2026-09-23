import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "./Dashboard";

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

describe("Dashboard", () => {
  it("mostra os cards com as contagens vindas da API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          counts: {
            videosAnalyzed: 12,
            trends: 4,
            opportunities: 2,
            contentProjects: 0,
            publishedVideos: 0,
          },
          topTrends: [],
          topOpportunities: [],
        }),
      }),
    );

    renderDashboard();

    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByText("Vídeos analisados")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Tendências")).toBeInTheDocument();
  });

  it("mostra mensagem de erro quando a API falha", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );

    renderDashboard();

    expect(await screen.findByText(/Não foi possível carregar o dashboard/)).toBeInTheDocument();
  });

  it("mostra a lista de top oportunidades quando existem", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          counts: {
            videosAnalyzed: 1,
            trends: 1,
            opportunities: 1,
            contentProjects: 0,
            publishedVideos: 0,
          },
          topTrends: [
            {
              id: "trend-1",
              topic: "gatos",
              regionCode: "BR",
              trendScore: 80,
              classification: "HOT",
            },
          ],
          topOpportunities: [
            {
              id: "opp-1",
              trendId: "trend-1",
              score: 80,
              status: "NEW",
              topic: "gatos",
              regionCode: "BR",
              classification: "HOT",
            },
          ],
        }),
      }),
    );

    renderDashboard();

    expect(await screen.findByText("Top oportunidades")).toBeInTheDocument();
    expect(screen.getAllByText("gatos").length).toBeGreaterThan(0);
    expect(screen.getByText(/Em alta/)).toBeInTheDocument();
  });

  it("mostra mensagem quando não há tendências nem oportunidades", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          counts: {
            videosAnalyzed: 0,
            trends: 0,
            opportunities: 0,
            contentProjects: 0,
            publishedVideos: 0,
          },
          topTrends: [],
          topOpportunities: [],
        }),
      }),
    );

    renderDashboard();

    expect(await screen.findByText(/Nenhuma tendência calculada ainda/)).toBeInTheDocument();
    expect(screen.getByText(/Nenhuma oportunidade nova no momento/)).toBeInTheDocument();
  });
});
