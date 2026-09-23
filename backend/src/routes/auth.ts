import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { env } from "../env.js";
import { prisma } from "../prisma.js";
import { hashPassword, verifyPassword } from "../auth/password.js";

const COOKIE_NAME = "token";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 dias

// Hash "de mentira" (mesmo formato salt:key de hashPassword) usado quando o
// e-mail não existe, pra rodar o mesmo scrypt de qualquer forma — sem isso,
// login com e-mail inexistente responde bem mais rápido que com e-mail
// existente e senha errada, um jeito de descobrir por timing quais e-mails
// estão cadastrados.
const DUMMY_PASSWORD_HASH = `${"0".repeat(32)}:${"0".repeat(128)}`;

const registerSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres"),
  name: z.string().min(1, "Nome é obrigatório"),
});

const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
});

function toPublicUser(user: { id: string; email: string; name: string }) {
  return { id: user.id, email: user.email, name: user.name };
}

function setAuthCookie(reply: FastifyReply, token: string) {
  reply.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

export async function authRoutes(app: FastifyInstance) {
  app.post(
    "/api/auth/register",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = registerSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
      }
      const { email, password, name } = parsed.data;

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return reply.status(409).send({ error: "E-mail já cadastrado" });
      }

      const passwordHash = await hashPassword(password);
      const user = await prisma.user.create({ data: { email, passwordHash, name } });

      const token = app.jwt.sign({ sub: user.id, email: user.email });
      setAuthCookie(reply, token);

      return reply.status(201).send(toPublicUser(user));
    },
  );

  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Dados inválidos" });
      }
      const { email, password } = parsed.data;

      const user = await prisma.user.findUnique({ where: { email } });
      const passwordMatches = await verifyPassword(
        password,
        user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      );

      if (!user || !passwordMatches) {
        return reply.status(401).send({ error: "E-mail ou senha inválidos" });
      }

      const token = app.jwt.sign({ sub: user.id, email: user.email });
      setAuthCookie(reply, token);

      return reply.send(toPublicUser(user));
    },
  );

  app.post("/api/auth/logout", async (_request, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: "/" });
    return reply.send({ ok: true });
  });

  app.get("/api/auth/me", { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
    if (!user) {
      return reply.status(404).send({ error: "Usuário não encontrado" });
    }
    return reply.send(toPublicUser(user));
  });
}
