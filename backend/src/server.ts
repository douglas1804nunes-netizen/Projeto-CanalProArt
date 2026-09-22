import { buildApp } from "./app.js";
import { env } from "./env.js";

const app = buildApp();

app.listen({ port: env.PORT, host: "0.0.0.0" }).catch((error) => {
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
