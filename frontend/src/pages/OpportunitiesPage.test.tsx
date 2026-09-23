import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpportunitiesPage } from "./OpportunitiesPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <OpportunitiesPage />
    </MemoryRouter>,
  );
}

const sampleOpportunity = {
  id: "opp-1",
  trendId: "trend-1",
  score: 78,
  status: "NEW",
  createdAt: new Date().toISOString(),
  topic: "gatos",
  regionCode: "BR",
  classification: "HOT" as const,
};

describe("OpportunitiesPage", () => {
  it("mostra mensagem quando não há oportunidades", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    renderPage();

    expect(await screen.findByText("Nenhuma oportunidade ativa no momento.")).toBeInTheDocument();
  });

  it("lista as oportunidades vindas da API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [sampleOpportunity] }),
    );

    renderPage();

    expect(await screen.findByText("gatos")).toBeInTheDocument();
    expect(screen.getByText(/Em alta · 78/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dispensar" })).toBeInTheDocument();
  });

  it("mostra erro quando a API falha", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );

    renderPage();

    expect(
      await screen.findByText(/Não foi possível carregar as oportunidades/),
    ).toBeInTheDocument();
  });

  it("remove a oportunidade da lista depois de dispensar", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/opportunities") {
        return Promise.resolve({ ok: true, json: async () => [sampleOpportunity] });
      }
      if (url === "/api/opportunities/opp-1/dismiss" && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: "opp-1", status: "DISMISSED" }),
        });
      }
      return Promise.reject(new Error(`fetch não mockado para ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    const dismissButton = await screen.findByRole("button", { name: "Dispensar" });
    fireEvent.click(dismissButton);

    await waitFor(() => {
      expect(screen.getByText("Nenhuma oportunidade ativa no momento.")).toBeInTheDocument();
    });
  });

  it("cria um projeto de conteúdo a partir da oportunidade", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/opportunities") {
        return Promise.resolve({ ok: true, json: async () => [sampleOpportunity] });
      }
      if (url === "/api/content-projects" && init?.method === "POST") {
        expect(init.body).toBe(
          JSON.stringify({ title: sampleOpportunity.topic, opportunityId: sampleOpportunity.id }),
        );
        return Promise.resolve({ ok: true, json: async () => ({ id: "project-1" }) });
      }
      return Promise.reject(new Error(`fetch não mockado para ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    const createButton = await screen.findByRole("button", { name: "Criar conteúdo" });
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/content-projects",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
