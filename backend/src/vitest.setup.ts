// Rede de segurança dos testes: eles criam e apagam registros de verdade
// (cadastro, projetos, uploads...) e por isso nunca podem rodar contra um banco
// remoto — como o de produção no Supabase. Dev e CI usam localhost.
import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Mesma origem de configuração que o src/env.ts: o .env da raiz (variáveis já
// definidas no ambiente têm prioridade, como no app).
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
loadDotenv({ path: path.join(rootDir, ".env") });

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"]);

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl) {
  let host = "(URL inválida)";
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    // mantém o placeholder — a mensagem abaixo já cobre o caso
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Testes recusados: DATABASE_URL aponta para "${host}", que não é um banco local. ` +
        "Os testes gravam dados de verdade. Use o Postgres do docker-compose " +
        "(postgresql://canalproart:canalproart@localhost:5432/canalproart?schema=public).",
    );
  }
}
