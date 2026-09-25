import { useState } from "react";

type CoverProps = {
  url: string | null | undefined;
  className?: string;
};

// Capa de vídeo com fallback: sem URL, ou se a imagem falhar ao carregar (link
// expirado, bloqueio de rede/CSP), mostra um bloco neutro no mesmo tamanho em
// vez do ícone de imagem quebrada. A capa é decorativa — o texto ao lado é
// quem descreve o conteúdo (por isso alt vazio).
export function Cover({ url, className = "" }: CoverProps) {
  // Guarda QUAL url falhou (não um booleano) pra a capa voltar a aparecer se a
  // url mudar sem o componente ser remontado.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!url || failedUrl === url) {
    return (
      <div
        aria-hidden="true"
        className={`flex items-center justify-center bg-slate-100 text-slate-300 ${className}`}
      >
        ▶
      </div>
    );
  }

  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      onError={() => setFailedUrl(url)}
      className={`bg-slate-100 ${className}`}
    />
  );
}
