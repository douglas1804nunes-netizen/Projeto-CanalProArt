import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VideoLink } from "./VideoLink";

afterEach(() => {
  vi.unstubAllGlobals();
});

const URL = "https://www.youtube.com/watch?v=abc123";

describe("VideoLink", () => {
  it("mostra o link (sem o protocolo) apontando pro vídeo, em nova aba", () => {
    render(<VideoLink url={URL} />);

    const link = screen.getByRole("link", { name: "www.youtube.com/watch?v=abc123" });
    expect(link).toHaveAttribute("href", URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("copia o link completo e confirma", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<VideoLink url={URL} />);

    fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL));
    expect(await screen.findByRole("button", { name: "Copiado!" })).toBeInTheDocument();
  });

  it("copia pelo método de seleção quando o Clipboard API é negado", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("negado")) },
    });
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true });
    render(<VideoLink url={URL} />);

    fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));

    expect(await screen.findByRole("button", { name: "Copiado!" })).toBeInTheDocument();
    expect(execCommand).toHaveBeenCalledWith("copy");
    // o textarea temporário não fica no DOM
    expect(document.querySelector("textarea")).toBeNull();
    Reflect.deleteProperty(document, "execCommand");
  });

  it("avisa quando o navegador não deixa copiar (o link continua visível pra copiar à mão)", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("negado")) },
    });
    render(<VideoLink url={URL} />);

    fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));

    expect(await screen.findByRole("button", { name: "Não copiou" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "www.youtube.com/watch?v=abc123" }),
    ).toBeInTheDocument();
  });
});
