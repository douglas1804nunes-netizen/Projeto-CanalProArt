import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { env, rootDir } from "./env.js";
import { prisma } from "./prisma.js";
import { healthRoutes } from "./routes/health.js";

export function buildApp() {
  const app = Fastify({
    logger: true,
  });

  app.register(cors, {
    origin: env.FRONTEND_URL,
  });

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  app.register(healthRoutes);

  // Produção: o backend serve o build do frontend (mesma origem, sem CORS
  // entre front e back). Em dev, o Vite roda separado e faz proxy de /api
  // (ver frontend/vite.config.ts) — não há frontend/dist para servir.
  if (env.NODE_ENV === "production") {
    const frontendDistDir = path.join(rootDir, "frontend", "dist");

    app.register(fastifyStatic, {
      root: frontendDistDir,
    });

    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith("/api/")) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      reply.sendFile("index.html");
    });
  }

  return app;
}
