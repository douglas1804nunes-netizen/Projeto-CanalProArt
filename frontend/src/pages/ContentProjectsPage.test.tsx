import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentProjectsPage } from "./ContentProjectsPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <ContentProjectsPage />
    </MemoryRouter>,
  );
}

const sampleProject = {
  id: "project-1",
  title: "Vídeo sobre gatos",
  status: "DRAFT" as const,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("ContentProjectsPage", () => {
  it("mostra mensagem quando não há projetos", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    renderPage();

    expect(await screen.findByText("Nenhum projeto de conteúdo ainda.")).toBeInTheDocument();
  });

  it("lista os projetos vindos da API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [sampleProject] }),
    );

    renderPage();

    expect(await screen.findByText("Vídeo sobre gatos")).toBeInTheDocument();
    expect(screen.getByText("Rascunho")).toBeInTheDocument();
  });

  it("mostra erro quando a API falha", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );

    renderPage();

    expect(await screen.findByText(/Não foi possível carregar os projetos/)).toBeInTheDocument();
  });

  it("cria um novo projeto a partir do formulário", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/content-projects" && (!init || init.method === undefined)) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url === "/api/content-projects" && init?.method === "POST") {
        expect(init.body).toBe(JSON.stringify({ title: "Novo vídeo" }));
        return Promise.resolve({ ok: true, json: async () => ({ id: "project-2" }) });
      }
      return Promise.reject(new Error(`fetch não mockado para ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    const input = await screen.findByPlaceholderText(/receitas fitness/);
    fireEvent.change(input, { target: { value: "Novo vídeo" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/content-projects",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
