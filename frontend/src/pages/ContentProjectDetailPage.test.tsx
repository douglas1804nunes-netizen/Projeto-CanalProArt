import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentProjectDetailPage } from "./ContentProjectDetailPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage(id = "project-1") {
  return render(
    <MemoryRouter initialEntries={[`/content/${id}`]}>
      <Routes>
        <Route path="/content/:id" element={<ContentProjectDetailPage />} />
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

describe("ContentProjectDetailPage", () => {
  it("mostra o título e o status do projeto", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => emptyProject }));

    renderPage();

    expect(await screen.findByText("Vídeo sobre gatos")).toBeInTheDocument();
    expect(screen.getByText("Nenhum vídeo enviado ainda.")).toBeInTheDocument();
    expect(screen.getByText("Nenhum roteiro gerado ainda.")).toBeInTheDocument();
    expect(screen.getByText("Gere um roteiro antes da descrição.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver prévia" })).toHaveAttribute(
      "href",
      "/content/project-1/preview",
    );
  });

  it("mostra 404 quando o projeto não existe", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    renderPage();

    expect(await screen.findByText("Projeto não encontrado.")).toBeInTheDocument();
  });

  it("mostra o roteiro mais recente e permite gerar título/descrição depois", async () => {
    const projectWithScript = {
      ...emptyProject,
      scripts: [{ id: "script-1", content: "Roteiro completo", version: 1, createdAt: "" }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => projectWithScript }),
    );

    renderPage();

    expect(await screen.findByText("Roteiro completo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gerar descrição" })).not.toBeDisabled();
  });

  it("seleciona um título gerado", async () => {
    const projectWithTitles = {
      ...emptyProject,
      generatedTitles: [
        { id: "title-1", title: "Opção A", selected: true },
        { id: "title-2", title: "Opção B", selected: false },
      ],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/content-projects/project-1" && !init?.method) {
        return Promise.resolve({ ok: true, json: async () => projectWithTitles });
      }
      if (url === "/api/content-projects/project-1/titles/title-2/select") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: "title-2", selected: true }),
        });
      }
      return Promise.reject(new Error(`fetch não mockado para ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    const optionB = await screen.findByRole("button", { name: "Opção B" });
    fireEvent.click(optionB);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/content-projects/project-1/titles/title-2/select",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("mostra o player e os dados do vídeo enviado", async () => {
    const projectWithMedia = {
      ...emptyProject,
      mediaUpload: {
        id: "media-1",
        fileName: "video.mp4",
        mimeType: "video/mp4",
        sizeBytes: "2500000",
        rightsStatus: null,
        containsSyntheticMedia: false,
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => projectWithMedia }),
    );

    renderPage();

    expect(await screen.findByText(/video\.mp4/)).toBeInTheDocument();
    expect(screen.getByText(/2\.5MB/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Substituir vídeo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remover" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar declaração" })).toBeInTheDocument();
  });

  it("mostra a declaração de direitos já salva", async () => {
    const projectWithRights = {
      ...emptyProject,
      mediaUpload: {
        id: "media-1",
        fileName: "video.mp4",
        mimeType: "video/mp4",
        sizeBytes: "2500000",
        rightsStatus: "ORIGINAL" as const,
        containsSyntheticMedia: true,
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => projectWithRights }),
    );

    renderPage();

    expect(await screen.findByText(/Declarado: Original/)).toBeInTheDocument();
    expect(screen.getByText(/contém mídia sintética/)).toBeInTheDocument();
  });

  it("salva a declaração de direitos", async () => {
    const projectWithMedia = {
      ...emptyProject,
      mediaUpload: {
        id: "media-1",
        fileName: "video.mp4",
        mimeType: "video/mp4",
        sizeBytes: "2500000",
        rightsStatus: null,
        containsSyntheticMedia: false,
      },
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/content-projects/project-1" && !init?.method) {
        return Promise.resolve({ ok: true, json: async () => projectWithMedia });
      }
      if (url === "/api/content-projects/project-1/media/rights" && init?.method === "PATCH") {
        expect(init.body).toBe(
          JSON.stringify({ rightsStatus: "ORIGINAL", containsSyntheticMedia: false }),
        );
        return Promise.resolve({
          ok: true,
          json: async () => ({ rightsStatus: "ORIGINAL", containsSyntheticMedia: false }),
        });
      }
      return Promise.reject(new Error(`fetch não mockado para ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    const select = await screen.findByRole("combobox", { name: "Status de direitos" });
    fireEvent.change(select, { target: { value: "ORIGINAL" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar declaração" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/content-projects/project-1/media/rights",
        expect.objectContaining({ method: "PATCH" }),
      );
    });
  });

  it("remove o vídeo enviado", async () => {
    const projectWithMedia = {
      ...emptyProject,
      mediaUpload: {
        id: "media-1",
        fileName: "video.mp4",
        mimeType: "video/mp4",
        sizeBytes: "2500000",
        rightsStatus: null,
        containsSyntheticMedia: false,
      },
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/content-projects/project-1" && !init?.method) {
        return Promise.resolve({ ok: true, json: async () => projectWithMedia });
      }
      if (url === "/api/content-projects/project-1/media" && init?.method === "DELETE") {
        return Promise.resolve({ ok: true });
      }
      return Promise.reject(new Error(`fetch não mockado para ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    const removeButton = await screen.findByRole("button", { name: "Remover" });
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/content-projects/project-1/media",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });
});
