import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { env, rootDir } from "./env.js";
import { prisma } from "./prisma.js";
import { healthRoutes } from "./routes/health.js";

export function buildApp() {
  const app = Fastify({
    logger: {
      redact: {
        // Cobre os headers sensíveis de hoje; campos de token de request/response
        // (JWT da Fase 3, OAuth do YouTube da Fase 4) devem ser adicionados aqui
        // assim que existirem.
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          'req.headers["set-cookie"]',
          "req.body.password",
          "req.body.token",
          "req.body.accessToken",
          "req.body.refreshToken",
        ],
        censor: "[REDACTED]",
      },
      transport:
        env.NODE_ENV === "development"
          ? {
              target: "pino-pretty",
              options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" },
            }
          : undefined,
    },
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
