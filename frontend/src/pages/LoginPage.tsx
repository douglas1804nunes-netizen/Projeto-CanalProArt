import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AuthShell } from "../layout/AuthShell";

const FIELD =
  "rounded-xl border border-line-strong px-3.5 py-2.5 text-sm outline-none focus:border-neon-cyan";

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
    <AuthShell
      title="Entrar"
      subtitle="Bem-vindo de volta ao CanalProArt"
      footer={
        <>
          Não tem conta?{" "}
          <Link
            to="/register"
            className="font-semibold text-neon-cyan underline-offset-4 hover:underline"
          >
            Cadastre-se
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-fg-soft">E-mail</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={FIELD}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-fg-soft">Senha</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={FIELD}
          />
        </label>

        {error && (
          <p className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary mt-2 rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-60"
        >
          {submitting ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </AuthShell>
  );
}
