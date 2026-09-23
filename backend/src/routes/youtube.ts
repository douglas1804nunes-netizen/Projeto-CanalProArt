import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { env } from "../env.js";
import { prisma } from "../prisma.js";
import { encryptToken } from "../youtube/crypto.js";
import { buildAuthorizationUrl, exchangeCodeForTokens, fetchOwnChannel } from "../youtube/oauth.js";

const STATE_COOKIE = "youtube_oauth_state";
const STATE_COOKIE_MAX_AGE_SECONDS = 60 * 10; // 10 minutos — só precisa sobreviver ao round-trip até o Google e de volta

export async function youtubeRoutes(app: FastifyInstance) {
  app.get("/api/youtube/accounts", { preHandler: [app.authenticate] }, async (request, reply) => {
    const accounts = await prisma.youtubeAccount.findMany({
      where: { userId: request.user.sub },
      select: { id: true, channelId: true, channelTitle: true, connectedAt: true },
      orderBy: { connectedAt: "desc" },
    });
    return reply.send(accounts);
  });

  app.get("/api/youtube/connect", { preHandler: [app.authenticate] }, async (_request, reply) => {
    const state = randomBytes(24).toString("hex");

    reply.setCookie(STATE_COOKIE, state, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
    });

    return reply.redirect(buildAuthorizationUrl(state));
  });

  app.get("/api/youtube/callback", { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = request.query as { code?: string; state?: string; error?: string };
    const expectedState = request.cookies[STATE_COOKIE];
    reply.clearCookie(STATE_COOKIE, { path: "/" });

    if (query.error) {
      return reply.status(400).send({ error: `Autorização negada pelo Google: ${query.error}` });
    }
    if (!query.code || !query.state || !expectedState || query.state !== expectedState) {
      return reply.status(400).send({ error: "Estado OAuth inválido ou ausente" });
    }

    let tokens;
    try {
      tokens = await exchangeCodeForTokens(query.code);
    } catch (error) {
      app.log.error({ err: error }, "Falha ao trocar código OAuth por tokens");
      return reply.status(502).send({ error: "Falha ao concluir a autorização com o Google" });
    }

    if (!tokens.refresh_token) {
      return reply.status(502).send({
        error:
          "O Google não devolveu um refresh_token. Revogue o acesso em " +
          "myaccount.google.com/permissions e tente conectar de novo.",
      });
    }

    let channel;
    try {
      channel = await fetchOwnChannel(tokens.access_token);
    } catch (error) {
      app.log.error({ err: error }, "Falha ao buscar canal do YouTube");
      return reply.status(502).send({ error: "Falha ao buscar o canal do YouTube" });
    }

    const existing = await prisma.youtubeAccount.findUnique({
      where: { channelId: channel.channelId },
    });

    if (existing && existing.userId !== request.user.sub) {
      return reply
        .status(409)
        .send({ error: "Este canal do YouTube já está conectado a outra conta CanalProArt." });
    }

    const accountData = {
      userId: request.user.sub,
      channelTitle: channel.channelTitle,
      accessToken: encryptToken(tokens.access_token),
      refreshToken: encryptToken(tokens.refresh_token),
      scopes: tokens.scope.split(" "),
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    };

    if (existing) {
      await prisma.youtubeAccount.update({
        where: { id: existing.id },
        data: { ...accountData, connectedAt: new Date() },
      });
    } else {
      await prisma.youtubeAccount.create({
        data: { ...accountData, channelId: channel.channelId },
      });
    }

    return reply.redirect(`${env.FRONTEND_URL}/youtube?connected=1`);
  });

  app.delete(
    "/api/youtube/accounts/:id",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const account = await prisma.youtubeAccount.findUnique({ where: { id } });
      if (!account || account.userId !== request.user.sub) {
        return reply.status(404).send({ error: "Conta do YouTube não encontrada" });
      }

      await prisma.youtubeAccount.delete({ where: { id } });
      return reply.send({ ok: true });
    },
  );
}
