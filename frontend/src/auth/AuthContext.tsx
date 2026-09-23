import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type User = { id: string; email: string; name: string };

type AuthState =
  { status: "loading" } | { status: "authenticated"; user: User } | { status: "unauthenticated" };

type AuthResult = { ok: true } | { ok: false; message: string };

type AuthContextValue = {
  state: AuthState;
  login: (email: string, password: string) => Promise<AuthResult>;
  register: (email: string, password: string, name: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/auth/me", { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          setState({ status: "unauthenticated" });
          return;
        }
        const user = (await response.json()) as User;
        setState({ status: "authenticated", user });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "unauthenticated" });
      });

    return () => {
      controller.abort();
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      return { ok: false, message: await errorMessage(response, "Não foi possível entrar.") };
    }

    const user = (await response.json()) as User;
    setState({ status: "authenticated", user });
    return { ok: true };
  }, []);

  const register = useCallback(
    async (email: string, password: string, name: string): Promise<AuthResult> => {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, name }),
      });

      if (!response.ok) {
        return {
          ok: false,
          message: await errorMessage(response, "Não foi possível criar a conta."),
        };
      }

      const user = (await response.json()) as User;
      setState({ status: "authenticated", user });
      return { ok: true };
    },
    [],
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setState({ status: "unauthenticated" });
  }, []);

  return (
    <AuthContext.Provider value={{ state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth precisa ser usado dentro de um AuthProvider");
  }
  return context;
}
