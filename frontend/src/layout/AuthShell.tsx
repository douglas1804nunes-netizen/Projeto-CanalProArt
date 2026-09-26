import type { CSSProperties, ReactNode } from "react";
import { Brand } from "../components/Logo";
import { Icon, type IconName } from "../components/Icon";
import { ThemeToggle } from "../components/ThemeToggle";

const FEATURES: Array<{ icon: IconName; title: string; text: string; color: string }> = [
  {
    icon: "trending",
    title: "Tendências com score",
    text: "Veja o que está subindo agora, por região, com velocidade e engajamento.",
    color: "var(--c1)",
  },
  {
    icon: "bot",
    title: "Roteiro, título e descrição por IA",
    text: "Transforme cada oportunidade em um projeto de conteúdo original.",
    color: "var(--c2)",
  },
  {
    icon: "rocket",
    title: "Publicação direta no seu canal",
    text: "Envie o vídeo com os direitos declarados, sem sair da plataforma.",
    color: "var(--c3)",
  },
];

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
};

// Moldura das telas de entrada: à esquerda (só em telas largas) a vitrine do
// produto; à direita o formulário num cartão de vidro com borda de gradiente.
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center gap-14 px-5 py-14 lg:px-10">
      <div className="absolute top-5 right-5 z-10">
        <ThemeToggle />
      </div>

      <section className="page-enter relative hidden flex-1 lg:block">
        <Brand />
        <h2 className="mt-8 max-w-xl text-4xl leading-[1.1] font-bold tracking-tight xl:text-5xl">
          Descubra o que está em alta.{" "}
          <span className="text-gradient">Publique antes de todo mundo.</span>
        </h2>
        <p className="mt-5 max-w-lg text-lg text-muted">
          Analise tendências do YouTube em tempo real, gere roteiros com IA e publique no seu canal
          — tudo em um só lugar.
        </p>

        <ul className="stagger mt-9 flex max-w-lg flex-col gap-3">
          {FEATURES.map((feature) => (
            <li
              key={feature.title}
              className="glass flex items-start gap-4 rounded-2xl p-4 transition-transform duration-300 hover:translate-x-1.5"
            >
              <span
                aria-hidden="true"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--fc)] bg-[color-mix(in_oklab,var(--fc)_18%,transparent)]"
                style={{ "--fc": feature.color } as CSSProperties}
              >
                <Icon name={feature.icon} className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold text-fg">{feature.title}</p>
                <p className="mt-0.5 text-sm text-muted">{feature.text}</p>
              </div>
            </li>
          ))}
        </ul>

        {/* Cartões decorativos flutuando — sugerem o produto em uso */}
        <div
          aria-hidden="true"
          className="pointer-events-none mt-8 flex flex-wrap items-start gap-4"
        >
          <div className="animate-float glass w-56 rounded-2xl p-3.5">
            <p className="text-[11px] font-medium text-muted">inteligência artificial · BR</p>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger">
                🔥 Em alta
              </span>
              <span className="text-gradient text-2xl font-bold">92</span>
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="gradient-ring h-full w-[92%] rounded-full" />
            </div>
          </div>
          <div className="animate-float-slow glass mt-4 w-44 rounded-2xl p-3.5">
            <p className="text-[11px] font-medium text-muted">velocidade</p>
            <p className="mt-1 text-2xl font-bold text-ok">+340%</p>
            <p className="text-xs text-faint">views por hora</p>
          </div>
        </div>
      </section>

      <div className="page-enter mx-auto w-full max-w-md lg:mx-0 lg:w-[26rem] lg:shrink-0">
        <div className="gradient-ring rounded-3xl p-px shadow-[0_0_70px_-18px_rgb(178_92_245/0.7)]">
          <div className="rounded-[calc(1.5rem-1px)] bg-surface-solid/85 p-7 backdrop-blur-2xl sm:p-8">
            <div className="lg:hidden">
              <Brand />
            </div>
            <h1 className="text-gradient mt-5 text-3xl font-bold tracking-tight lg:mt-0">
              {title}
            </h1>
            <p className="mt-1 text-sm text-muted">{subtitle}</p>

            {children}

            <p className="mt-6 text-center text-sm text-muted">{footer}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
