// Esferas de luz desfocadas que flutuam devagar atrás de tudo — dão
// profundidade ao fundo (a aurora e a grade ficam no CSS do <body>).
// Puramente decorativo: fora da árvore de acessibilidade e sem capturar cliques.
export function BackgroundFX() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <span className="orb orb-a" />
      <span className="orb orb-b" />
      <span className="orb orb-c" />
    </div>
  );
}
