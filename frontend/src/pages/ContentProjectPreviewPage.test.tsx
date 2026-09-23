import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentProjectPreviewPage } from "./ContentProjectPreviewPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage(id = "project-1") {
  return render(
    <MemoryRouter initialEntries={[`/content/${id}/preview`]}>
      <Routes>
        <Route path="/content/:id/preview" element={<ContentProjectPreviewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const emptyProject = {
  id: "project-1",
  title: "Vídeo sobre gatos",
  status: "DRAFT" as const,
  scripts: [],
  generatedTitles: [],
  generatedDescriptions: [],
  mediaUpload: null,
};

const readyProject = {
  ...emptyProject,
  status: "READY" as const,
  scripts: [{ id: "script-1", content: "Roteiro", version: 1 }],
  generatedTitles: [
    { id: "title-1", title: "Título escolhido", selected: true },
    { id: "title-2", title: "Título não escolhido", selected: false },
  ],
  generatedDescriptions: [{ id: "desc-1", description: "Descrição escolhida", selected: true }],
  mediaUpload: {
    fileName: "video.mp4",
    rightsStatus: "ORIGINAL" as const,
    containsSyntheticMedia: false,
  },
};

function mockFetch(handlers: {
  project?: unknown;
  accounts?: unknown[];
  publish?: { ok: boolean; status?: number; body: unknown };
}) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/content-projects/project-1" && !init?.method) {
      return Promise.resolve({ ok: true, json: async () => handlers.project ?? emptyProject });
    }
    if (url === "/api/youtube/accounts") {
      return Promise.resolve({ ok: true, json: async () => handlers.accounts ?? [] });
    }
    if (url === "/api/content-projects/project-1/publish" && init?.method === "POST") {
      const publish = handlers.publish ?? { ok: true, body: { youtubeVideoId: "abc123" } };
      return Promise.resolve({
        ok: publish.ok,
        status: publish.status ?? (publish.ok ? 201 : 502),
        json: async () => publish.body,
      });
    }
    return Promise.reject(new Error(`fetch não mockado para ${url}`));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("ContentProjectPreviewPage", () => {
  it("mostra o checklist todo pendente quando nada foi feito ainda", async () => {
    mockFetch({});

    renderPage();

    expect(await screen.findByText("Prévia de publicação")).toBeInTheDocument();
    expect(screen.getByText("Nenhum vídeo enviado ainda.")).toBeInTheDocument();
    expect(screen.getByText("Nenhum título selecionado.")).toBeInTheDocument();
    expect(screen.getByText("Nenhuma descrição selecionada.")).toBeInTheDocument();
    expect(
      screen.getByText(/Marque o projeto como pronto \(na página do projeto\)/),
    ).toBeInTheDocument();
  });

  it("mostra o vídeo, título e descrição selecionados quando tudo está pronto", async () => {
    mockFetch({ project: readyProject });

    renderPage();

    expect(await screen.findByText("Título escolhido")).toBeInTheDocument();
    expect(screen.queryByText("Título não escolhido")).not.toBeInTheDocument();
    expect(screen.getByText("Descrição escolhida")).toBeInTheDocument();
    expect(screen.getByText(/Direitos: Original/)).toBeInTheDocument();
  });

  it("mostra 404 quando o projeto não existe", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    renderPage();

    expect(await screen.findByText("Projeto não encontrado.")).toBeInTheDocument();
  });

  it("pede pra conectar um canal quando READY mas sem contas do YouTube", async () => {
    mockFetch({ project: readyProject, accounts: [] });

    renderPage();

    expect(await screen.findByText("Conecte um canal do YouTube")).toBeInTheDocument();
  });

  it("publica com sucesso e mostra o link do vídeo", async () => {
    const fetchMock = mockFetch({
      project: readyProject,
      accounts: [{ id: "account-1", channelTitle: "Meu Canal" }],
      publish: { ok: true, body: { id: "pub-1", youtubeVideoId: "abc123", status: "PUBLISHED" } },
    });

    renderPage();

    const publishButton = await screen.findByRole("button", { name: "Publicar no YouTube" });
    fireEvent.click(publishButton);

    await waitFor(() => {
      expect(screen.getByText("Publicado com sucesso!")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Ver no YouTube" })).toHaveAttribute(
      "href",
      "https://youtube.com/watch?v=abc123",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/content-projects/project-1/publish",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ youtubeAccountId: "account-1" }),
      }),
    );
  });

  it("mostra o erro quando a publicação falha", async () => {
    mockFetch({
      project: readyProject,
      accounts: [{ id: "account-1", channelTitle: "Meu Canal" }],
      publish: { ok: false, status: 502, body: { error: "Falha ao publicar vídeo no YouTube" } },
    });

    renderPage();

    const publishButton = await screen.findByRole("button", { name: "Publicar no YouTube" });
    fireEvent.click(publishButton);

    expect(await screen.findByText("Falha ao publicar vídeo no YouTube")).toBeInTheDocument();
  });

  it("mostra que o projeto já foi publicado", async () => {
    mockFetch({ project: { ...readyProject, status: "PUBLISHED" as const } });

    renderPage();

    expect(await screen.findByText("Este projeto já foi publicado.")).toBeInTheDocument();
  });
});
