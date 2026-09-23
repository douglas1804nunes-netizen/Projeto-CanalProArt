import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = await login(email, password);

    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    navigate("/", { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Entrar</h1>
        <p className="mt-1 text-sm text-slate-500">CanalProArt</p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">E-mail</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Senha</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          Não tem conta?{" "}
          <Link to="/register" className="font-medium text-slate-900 underline underline-offset-2">
            Cadastre-se
          </Link>
        </p>
      </div>
    </div>
  );
}
