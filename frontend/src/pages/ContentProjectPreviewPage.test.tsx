import { render, screen } from "@testing-library/react";
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

describe("ContentProjectPreviewPage", () => {
  it("mostra o checklist todo pendente quando nada foi feito ainda", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => emptyProject }));

    renderPage();

    expect(await screen.findByText("Prévia de publicação")).toBeInTheDocument();
    expect(screen.getByText("Nenhum vídeo enviado ainda.")).toBeInTheDocument();
    expect(screen.getByText("Nenhum título selecionado.")).toBeInTheDocument();
    expect(screen.getByText("Nenhuma descrição selecionada.")).toBeInTheDocument();
  });

  it("mostra o vídeo, título e descrição selecionados quando tudo está pronto", async () => {
    const readyProject = {
      ...emptyProject,
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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => readyProject }));

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
});
