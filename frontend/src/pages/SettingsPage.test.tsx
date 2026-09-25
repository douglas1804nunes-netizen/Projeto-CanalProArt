import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/AuthContext";
import { SettingsPage } from "./SettingsPage";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const info = {
  environment: "production",
  aiProvider: "anthropic",
  youtubeRedirectUri: "https://canalproart.onrender.com/api/youtube/callback",
  youtubeChannels: 0,
  warnings: [] as string[],
};

type Route = { ok?: boolean; status?: number; body: unknown };

function mockApi(routes: Record<string, Route>) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${String(input)}`;
    const route = routes[key];
    if (!route) return Promise.reject(new Error(`fetch não mockado para ${key}`));
    return Promise.resolve({
      ok: route.ok ?? true,
      status: route.status ?? 200,
      json: async () => route.body,
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const baseRoutes: Record<string, Route> = {
  "GET /api/auth/me": { body: { id: "u1", email: "eu@example.com", name: "Douglas" } },
  "GET /api/settings": { body: info },
};

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <SettingsPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("SettingsPage", () => {
  it("mostra conta, redirect URI e canais conectados", async () => {
    mockApi({ ...baseRoutes, "GET /api/settings": { body: { ...info, youtubeChannels: 2 } } });
    renderPage();

    expect(await screen.findByText("eu@example.com")).toBeInTheDocument();
    expect(screen.getByText(info.youtubeRedirectUri)).toBeInTheDocument();
    expect(await screen.findByText(/2 canais conectados/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gerenciar canais" })).toHaveAttribute(
      "href",
      "/youtube",
    );
  });

  it("avisa quando nenhum canal está conectado e mostra os avisos de configuração", async () => {
    mockApi({
      ...baseRoutes,
      "GET /api/settings": {
        body: { ...info, warnings: ["YOUTUBE_REDIRECT_URI aponta pra localhost em produção."] },
      },
    });
    renderPage();

    expect(await screen.findByText(/Nenhum canal conectado ainda/)).toBeInTheDocument();
    expect(screen.getByText(/aponta pra localhost em produção/)).toBeInTheDocument();
  });

  it("mostra erro quando não consegue carregar as configurações", async () => {
    mockApi({ ...baseRoutes, "GET /api/settings": { ok: false, status: 500, body: {} } });
    renderPage();

    expect(await screen.findByText(/Não foi possível carregar \(HTTP 500\)/)).toBeInTheDocument();
  });

  it("testa as conexões e mostra o resultado de cada integração", async () => {
    mockApi({
      ...baseRoutes,
      "POST /api/settings/check": {
        body: {
          youtubeApiKey: { ok: true, message: "Chave válida." },
          anthropicApiKey: { ok: false, message: "Chave recusada pela Anthropic." },
        },
      },
    });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Testar conexões" }));

    expect(await screen.findByText(/Chave válida\./)).toBeInTheDocument();
    expect(screen.getByText(/Chave recusada pela Anthropic\./)).toBeInTheDocument();
  });

  it("explica o limite quando o teste é bloqueado por rate limit", async () => {
    mockApi({ ...baseRoutes, "POST /api/settings/check": { ok: false, status: 429, body: {} } });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Testar conexões" }));

    expect(await screen.findByText(/Muitos testes seguidos/)).toBeInTheDocument();
  });

  it("salva a região padrão em maiúsculas e recusa valor inválido", async () => {
    mockApi(baseRoutes);
    renderPage();

    const input = await screen.findByLabelText("Região padrão das tendências");
    fireEvent.change(input, { target: { value: "u" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(screen.getByText(/código de 2 letras/)).toBeInTheDocument();
    expect(window.localStorage.getItem("canalproart:defaultRegion")).toBeNull();

    fireEvent.change(input, { target: { value: "us" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(screen.getByText("Região padrão salva.")).toBeInTheDocument();
    expect(window.localStorage.getItem("canalproart:defaultRegion")).toBe("US");
  });

  it("limpa o histórico de pesquisas depois de confirmar e informa quantas foram excluídas", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    const fetchMock = mockApi({
      ...baseRoutes,
      "DELETE /api/trends/searches": { body: { deleted: 3 } },
    });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Limpar histórico de pesquisas" }));

    expect(await screen.findByText("3 pesquisas excluídas.")).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trends/searches",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });
});
