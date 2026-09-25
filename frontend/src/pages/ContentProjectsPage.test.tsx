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

  describe("excluir conteúdo", () => {
    const otherProject = { ...sampleProject, id: "project-2", title: "Receitas fitness" };

    function mockApi(deleteResponse: { ok: boolean; status?: number; body?: unknown }) {
      const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/content-projects" && !init?.method) {
          return Promise.resolve({ ok: true, json: async () => [sampleProject, otherProject] });
        }
        if (url.startsWith("/api/content-projects/") && init?.method === "DELETE") {
          return Promise.resolve({
            ok: deleteResponse.ok,
            status: deleteResponse.status ?? 204,
            json: async () => deleteResponse.body ?? {},
          });
        }
        return Promise.reject(new Error(`fetch não mockado para ${url}`));
      });
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    it("exclui depois de confirmar e tira o item da lista", async () => {
      const confirmMock = vi.fn(() => true);
      vi.stubGlobal("confirm", confirmMock);
      const fetchMock = mockApi({ ok: true });
      renderPage();

      fireEvent.click(
        await screen.findByRole("button", { name: "Excluir conteúdo Vídeo sobre gatos" }),
      );

      await waitFor(() => expect(screen.queryByText("Vídeo sobre gatos")).not.toBeInTheDocument());
      expect(confirmMock).toHaveBeenCalledWith(expect.stringContaining("Vídeo sobre gatos"));
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/content-projects/project-1",
        expect.objectContaining({ method: "DELETE" }),
      );
      // o outro conteúdo continua na lista
      expect(screen.getByText("Receitas fitness")).toBeInTheDocument();
    });

    it("não exclui nada se o usuário cancelar a confirmação", async () => {
      vi.stubGlobal(
        "confirm",
        vi.fn(() => false),
      );
      const fetchMock = mockApi({ ok: true });
      renderPage();

      fireEvent.click(
        await screen.findByRole("button", { name: "Excluir conteúdo Vídeo sobre gatos" }),
      );

      expect(screen.getByText("Vídeo sobre gatos")).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalledWith(
        expect.stringContaining("project-1"),
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    it("mostra a explicação do servidor (já publicado) e mantém o conteúdo na lista", async () => {
      vi.stubGlobal(
        "confirm",
        vi.fn(() => true),
      );
      mockApi({
        ok: false,
        status: 409,
        body: { error: "Este conteúdo já foi publicado no YouTube — arquive-o em vez de excluir." },
      });
      renderPage();

      fireEvent.click(
        await screen.findByRole("button", { name: "Excluir conteúdo Vídeo sobre gatos" }),
      );

      expect(await screen.findByText(/arquive-o em vez de excluir/)).toBeInTheDocument();
      expect(screen.getByText("Vídeo sobre gatos")).toBeInTheDocument();
    });
  });
});
