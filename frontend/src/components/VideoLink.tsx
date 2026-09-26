import { useState } from "react";

type VideoLinkProps = {
  url: string;
};

type CopyState = "idle" | "copied" | "failed";

// document.execCommand("copy") é legado, mas segue suportado em todo
// navegador e não depende da permissão do Clipboard API.
function copyBySelection(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

// O link do vídeo já visível na descrição do card — clicável (nova aba) e com
// botão de copiar. Se o navegador negar o clipboard (contexto não seguro,
// permissão), o texto continua ali pra ser selecionado à mão.
export function VideoLink({ url }: VideoLinkProps) {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  async function handleCopy() {
    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {
      // Clipboard API negada (permissão, iframe, contexto não seguro) —
      // tenta o método antigo por seleção de texto, que só exige o clique.
      copied = copyBySelection(url);
    }
    setCopyState(copied ? "copied" : "failed");
    window.setTimeout(() => setCopyState("idle"), 2000);
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={url}
        className="min-w-0 flex-1 truncate rounded bg-surface-2 px-2 py-1 font-mono text-[11px] text-fg-soft hover:text-fg"
      >
        {url.replace(/^https?:\/\//, "")}
      </a>
      <button
        type="button"
        onClick={() => void handleCopy()}
        className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium btn-ghost"
      >
        {copyState === "copied"
          ? "Copiado!"
          : copyState === "failed"
            ? "Não copiou"
            : "Copiar link"}
      </button>
    </div>
  );
}
