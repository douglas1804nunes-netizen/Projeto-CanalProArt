// Diagnóstico de conexão com o banco: testa a DATABASE_URL com o mesmo Prisma
// Client do app (é o que o /api/health faz), sem subir o servidor.
//
// Uso (PowerShell):  $env:DATABASE_URL = "<uri>"; node scripts/check-db.mjs
// Uso (bash):        DATABASE_URL="<uri>" node scripts/check-db.mjs
//
// Nunca imprime a senha — só o tamanho dela, para achar espaço/quebra de linha
// colados junto ou senha diferente da esperada.
import { PrismaClient } from "@prisma/client";

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error("DATABASE_URL não está definida neste terminal.");
  process.exit(2);
}

let url;
try {
  url = new URL(raw.trim());
} catch {
  console.error("DATABASE_URL não é uma URL válida (confira aspas, colchetes e espaços).");
  process.exit(2);
}

const user = decodeURIComponent(url.username);
const password = decodeURIComponent(url.password);
const host = url.hostname;

console.log("Protocolo:", url.protocol);
console.log("Usuário:  ", user || "(vazio)");
console.log("Host:     ", host);
console.log("Porta:    ", url.port || "(padrão)");
console.log("Banco:    ", url.pathname.slice(1) || "(vazio)");
console.log("Senha:    ", password ? `${password.length} caracteres` : "(vazia)");

const problems = [];
if (raw !== raw.trim()) {
  problems.push("há espaço ou quebra de linha antes/depois da URI colada");
}
if (host === "localhost" || host === "127.0.0.1") {
  problems.push("o host é local — o Render não enxerga o localhost do seu computador");
}
if (/^db\.[a-z0-9]+\.supabase\.co$/.test(host)) {
  problems.push("é a Direct connection do Supabase (só IPv6) — use o Session pooler");
}
if (host.endsWith(".pooler.supabase.com") && !user.includes(".")) {
  problems.push('no pooler o usuário precisa ser "postgres.<código-do-projeto>"');
}
if (/[[\]]/.test(url.username + url.password)) {
  problems.push("a senha ou o usuário tem colchetes [ ] — tire os colchetes");
}
for (const problem of problems) {
  console.log("ATENÇÃO:  ", problem);
}

const prisma = new PrismaClient({ datasources: { db: { url: raw.trim() } } });
try {
  await Promise.race([
    prisma.$queryRaw`SELECT 1`,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout de 15s")), 15000)),
  ]);
  console.log("\nRESULTADO: OK — conectou e consultou o banco.");
} catch (error) {
  const lines = String(error.message)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  console.log(`\nRESULTADO: ERRO ${error.code ?? ""}`.trim());
  console.log(lines.slice(-2).join(" "));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
