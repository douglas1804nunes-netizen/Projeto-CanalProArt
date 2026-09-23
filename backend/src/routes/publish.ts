import type { FastifyInstance } from "fastify";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { rootDir } from "../env.js";
import { prisma } from "../prisma.js";
import { getValidAccessToken } from "../youtube/tokens.js";
import { publishVideoToYoutube } from "../youtube/publish.js";

const publishSchema = z.object({
  youtubeAccountId: z.string().trim().min(1, "youtubeAccountId é obrigatório"),
});

export async function publishRoutes(app: FastifyInstance) {
  app.post(
    "/api/content-projects/:id/publish",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = publishSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "Parâmetros inválidos", details: parsed.error.flatten().fieldErrors });
      }

      const project = await prisma.contentProject.findFirst({
        where: { id, userId: request.user.sub },
        include: { generatedTitles: true, generatedDescriptions: true, mediaUpload: true },
      });
      if (!project) {
        return reply.status(404).send({ error: "Projeto não encontrado" });
      }

      // Reforça em código os mesmos pré-requisitos do checklist da Fase 15
      // — status READY (Fase 14) já garante vídeo enviado + direitos
      // declarados, mas não garante título/descrição selecionados (esses
      // são opcionais até este ponto).
      if (project.status === "PUBLISHED") {
        return reply.status(400).send({ error: "Este projeto já foi publicado" });
      }
      if (project.status !== "READY") {
        return reply
          .status(400)
          .send({ error: "Marque o projeto como pronto (READY) antes de publicar" });
      }
      const selectedTitle = project.generatedTitles.find((t) => t.selected);
      if (!selectedTitle) {
        return reply.status(400).send({ error: "Selecione um título antes de publicar" });
      }
      const selectedDescription = project.generatedDescriptions.find((d) => d.selected);
      if (!selectedDescription) {
        return reply.status(400).send({ error: "Selecione uma descrição antes de publicar" });
      }
      // READY já garante isso, mas o TypeScript não sabe — e checar de novo
      // não custa nada.
      if (!project.mediaUpload || !project.mediaUpload.rightsStatus) {
        return reply
          .status(400)
          .send({ error: "Envie um vídeo e declare os direitos antes de publicar" });
      }
      // Capturados logo após o guard (antes de qualquer await) — o
      // TypeScript não preserva o narrowing de `project.mediaUpload.*` por
      // uma chamada assíncrona no meio.
      const mediaUpload = project.mediaUpload;
      const rightsStatus = project.mediaUpload.rightsStatus;

      const youtubeAccount = await prisma.youtubeAccount.findFirst({
        where: { id: parsed.data.youtubeAccountId, userId: request.user.sub },
      });
      if (!youtubeAccount) {
        return reply.status(404).send({ error: "Conta do YouTube não encontrada" });
      }

      try {
        const accessToken = await getValidAccessToken(youtubeAccount.id);
        const videoBuffer = await readFile(path.join(rootDir, "backend", mediaUpload.filePath));

        const { youtubeVideoId } = await publishVideoToYoutube({
          accessToken,
          videoBuffer,
          mimeType: mediaUpload.mimeType,
          title: selectedTitle.title,
          description: selectedDescription.description,
          containsSyntheticMedia: mediaUpload.containsSyntheticMedia,
        });

        const [publishedVideo] = await prisma.$transaction([
          prisma.publishedVideo.create({
            data: {
              contentProjectId: project.id,
              youtubeAccountId: youtubeAccount.id,
              youtubeVideoId,
              rightsStatus,
              containsSyntheticMedia: mediaUpload.containsSyntheticMedia,
              status: "PUBLISHED",
              publishedAt: new Date(),
            },
          }),
          prisma.contentProject.update({
            where: { id: project.id },
            data: { status: "PUBLISHED" },
          }),
          ...(project.opportunityId
            ? [
                prisma.opportunity.update({
                  where: { id: project.opportunityId },
                  data: { status: "CONVERTED" },
                }),
              ]
            : []),
        ]);

        return reply.status(201).send({
          id: publishedVideo.id,
          youtubeVideoId: publishedVideo.youtubeVideoId,
          status: publishedVideo.status,
        });
      } catch (error) {
        app.log.error({ err: error }, "Falha ao publicar vídeo no YouTube");
        await prisma.publishedVideo.create({
          data: {
            contentProjectId: project.id,
            youtubeAccountId: youtubeAccount.id,
            rightsStatus,
            containsSyntheticMedia: mediaUpload.containsSyntheticMedia,
            status: "FAILED",
          },
        });
        return reply.status(502).send({ error: "Falha ao publicar vídeo no YouTube" });
      }
    },
  );
}
