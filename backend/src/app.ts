import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { env, rootDir } from "./env.js";
import { prisma } from "./prisma.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { youtubeRoutes } from "./routes/youtube.js";
import { videoRoutes } from "./routes/videos.js";
import { trendRoutes } from "./routes/trends.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { opportunityRoutes } from "./routes/opportunities.js";

// O callback OAuth do YouTube (Fase 4) recebe "code"/"state" na query string,
// que o serializer padrão do Fastify logaria em texto puro em "req.url" (pino
// redact não alcança substrings dentro de um campo — só o campo inteiro).
const SENSITIVE_QUERY_PARAMS = ["code", "state", "access_token", "refresh_token", "token"];

function redactSensitiveQueryParams(rawUrl: string): string {
  const [path, query] = rawUrl.split("?");
  if (!query) return rawUrl;

  const params = new URLSearchParams(query);
  for (const key of SENSITIVE_QUERY_PARAMS) {
    if (params.has(key)) {
      params.set(key, "[REDACTED]");
    }
  }
  return `${path}?${params.toString()}`;
}

export function buildApp() {
  const app = Fastify({
    logger: {
      redact: {
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
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: redactSensitiveQueryParams(request.url),
            host: request.host,
            remoteAddress: request.ip,
            remotePort: request.socket ? request.socket.remotePort : undefined,
          };
        },
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
    credentials: true,
  });

  app.register(helmet);
  app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  app.register(cookie);
  app.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: {
      cookieName: "token",
      signed: false,
    },
  });

  app.decorate("authenticate", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.status(401).send({ error: "Não autenticado" });
    }
  });

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(youtubeRoutes);
  app.register(videoRoutes);
  app.register(trendRoutes);
  app.register(dashboardRoutes);
  app.register(opportunityRoutes);

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
