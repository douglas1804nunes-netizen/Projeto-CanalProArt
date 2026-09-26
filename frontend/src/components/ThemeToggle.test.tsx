import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "./ThemeToggle";

let meta: HTMLMetaElement;

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
  window.localStorage.clear();
  meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = "#060818";
  document.head.appendChild(meta);
});

afterEach(() => {
  meta.remove();
  vi.restoreAllMocks();
});

describe("ThemeToggle", () => {
  it("começa no tema escuro e oferece ativar o claro", () => {
    render(<ThemeToggle />);

    expect(screen.getByRole("button", { name: "Ativar tema claro" })).toBeInTheDocument();
  });

  it("alterna pro claro: aplica em <html>, salva a escolha e atualiza a cor da barra do navegador", () => {
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole("button", { name: "Ativar tema claro" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(window.localStorage.getItem("canalproart:theme")).toBe("light");
    expect(meta.content).toBe("#ebe4ff");
    expect(screen.getByRole("button", { name: "Ativar tema escuro" })).toBeInTheDocument();
  });

  it("volta pro escuro no segundo clique", () => {
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole("button", { name: "Ativar tema claro" }));
    fireEvent.click(screen.getByRole("button", { name: "Ativar tema escuro" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem("canalproart:theme")).toBe("dark");
    expect(meta.content).toBe("#060818");
  });

  it("respeita o tema que o /theme-init.js já aplicou antes do React", () => {
    document.documentElement.setAttribute("data-theme", "light");

    render(<ThemeToggle />);

    expect(screen.getByRole("button", { name: "Ativar tema escuro" })).toBeInTheDocument();
  });

  it("continua funcionando (só não persiste) se o localStorage estiver bloqueado", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole("button", { name: "Ativar tema claro" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
