import { buildApp } from "./app.js";
import { env } from "./env.js";
import { prisma } from "./prisma.js";

const app = buildApp();

// Senha do banco errada não se corrige sozinha: se subíssemos assim, o health
// check do Render tentaria autenticar de novo a cada poucos segundos e o pooler
// do Supabase bloquearia novas conexões (ECIRCUITBREAKER) mesmo depois de a
// senha ser corrigida. Só o P1000 derruba o boot — erro de rede pode ser
// passageiro e continua tolerado (o /api/health responde 503 nesse caso).
async function failFastOnRejectedDatabaseCredentials() {
  try {
    await prisma.$connect();
  } catch (error) {
    if ((error as { errorCode?: string }).errorCode === "P1000") {
      app.log.fatal(
        "DATABASE_URL: o banco recusou a autenticação (P1000) — senha ou usuário errado. " +
          "Corrija a variável e teste com `node scripts/check-db.mjs` antes de subir de novo.",
      );
      process.exit(1);
    }
  }
}

async function start() {
  await failFastOnRejectedDatabaseCredentials();
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

start().catch((error) => {
  app.log.error(error);
  process.exit(1);
});

async function shutdown(signal: string) {
  app.log.info(`Recebido ${signal}, encerrando servidor...`);
  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error(error, "Erro ao encerrar o servidor");
    process.exit(1);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
