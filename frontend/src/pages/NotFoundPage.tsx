import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="page-title text-2xl font-semibold tracking-tight">Página não encontrada</h1>
      <div className="glass mt-6 flex items-center gap-6 rounded-2xl p-6">
        <p
          aria-hidden="true"
          className="text-gradient animate-float text-6xl font-black tracking-tighter"
        >
          404
        </p>
        <p className="text-sm text-muted">
          A rota acessada não existe.{" "}
          <Link to="/" className="font-semibold text-neon-cyan underline-offset-4 hover:underline">
            Voltar ao Dashboard
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
