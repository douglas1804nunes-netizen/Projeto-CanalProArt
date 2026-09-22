import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Página não encontrada</h1>
      <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
        A rota acessada não existe.{" "}
        <Link to="/" className="font-medium text-slate-900 underline underline-offset-2">
          Voltar ao Dashboard
        </Link>
        .
      </div>
    </div>
  );
}
