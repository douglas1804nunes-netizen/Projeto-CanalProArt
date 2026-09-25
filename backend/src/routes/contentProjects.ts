import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createAIProvider } from "@canalproart/services";
import { env } from "../env.js";
import { removeProjectUploads } from "../media/storage.js";
import { prisma } from "../prisma.js";

// Mesmo custo por chamada dos endpoints de /api/ai/* (Fase 11) — as rotas
// de geração aqui chamam o mesmo AIProvider, só que persistindo o
// resultado num ContentProject em vez de devolver solto.
const AI_RATE_LIMIT = { rateLimit: { max: 10, timeWindow: "1 minute" } };

const createProjectSchema = z.object({
  title: z.string().trim().min(1, "title é obrigatório").max(200),
  opportunityId: z.string().trim().min(1).optional(),
});

const updateProjectSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    status: z.enum(["DRAFT", "IN_PROGRESS", "READY", "PUBLISHED", "ARCHIVED"]).optional(),
  })
  .refine((value) => value.title !== undefined || value.status !== undefined, {
    message: "Informe pelo menos title ou status",
  });

const generateScriptSchema = z.object({
  idea: z.string().trim().max(500).optional(),
  durationSeconds: z.number().int().positive().optional(),
});

const generateTitlesSchema = z.object({
  count: z.number().int().min(1).max(10).optional(),
});

async function loadOwnedProject(userId: string, id: string) {
  return prisma.contentProject.findFirst({ where: { id, userId } });
}

export async function contentProjectRoutes(app: FastifyInstance) {
  const aiProvider = createAIProvider({ provider: env.AI_PROVIDER, apiKey: env.ANTHROPIC_API_KEY });

  app.post("/api/content-projects", { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = createProjectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Parâmetros inválidos", details: parsed.error.flatten().fieldErrors });
    }
    const userId = request.user.sub;
    const { title, opportunityId } = parsed.data;

    if (opportunityId) {
      const opportunity = await prisma.opportunity.findFirst({
        where: { id: opportunityId, userId },
      });
      if (!opportunity) {
        return reply.status(404).send({ error: "Oportunidade não encontrada" });
      }
      // Sinaliza que a oportunidade já virou trabalho em andamento — não é
      // mais "nova" (NEW), mas também não foi publicada ainda (CONVERTED
      // fica pra quando existir um PublishedVideo de verdade, Fase 17).
      if (opportunity.status === "NEW") {
        await prisma.opportunity.update({
          where: { id: opportunity.id },
          data: { status: "IN_PROGRESS" },
        });
      }
    }

    const project = await prisma.contentProject.create({
      data: { userId, title, opportunityId },
    });
    return reply.status(201).send(project);
  });

  app.get("/api/content-projects", { preHandler: [app.authenticate] }, async (request, reply) => {
    const projects = await prisma.contentProject.findMany({
      where: { userId: request.user.sub },
      orderBy: { updatedAt: "desc" },
    });
    return reply.send(projects);
  });

  app.get(
    "/api/content-projects/:id",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const project = await prisma.contentProject.findFirst({
        where: { id, userId: request.user.sub },
        include: {
          scripts: { orderBy: { version: "desc" } },
          generatedTitles: { orderBy: { createdAt: "desc" } },
          generatedDescriptions: { orderBy: { createdAt: "desc" } },
          mediaUpload: true,
        },
      });
      if (!project) {
        return reply.status(404).send({ error: "Projeto não encontrado" });
      }
      // BigInt não serializa em JSON — mesma questão de trends.ts (Fase 6).
      return reply.send({
        ...project,
        mediaUpload: project.mediaUpload
          ? { ...project.mediaUpload, sizeBytes: project.mediaUpload.sizeBytes.toString() }
          : null,
      });
    },
  );

  app.patch(
    "/api/content-projects/:id",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updateProjectSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "Parâmetros inválidos", details: parsed.error.flatten().fieldErrors });
      }

      const project = await loadOwnedProject(request.user.sub, id);
      if (!project) {
        return reply.status(404).send({ error: "Projeto não encontrado" });
      }

      // Fase 14: "Toda publicação exige um vídeo enviado pelo próprio
      // usuário com direitos declarados" (README) — reforçado aqui, não só
      // documentado. DRAFT/IN_PROGRESS/ARCHIVED não exigem nada; PUBLISHED
      // só existe de verdade a partir da Fase 16/17 (não bloqueado aqui
      // porque nada ainda seta esse status).
      if (parsed.data.status === "READY") {
        const mediaUpload = await prisma.mediaUpload.findUnique({
          where: { contentProjectId: id },
        });
        if (!mediaUpload) {
          return reply
            .status(400)
            .send({ error: "Envie um vídeo antes de marcar o projeto como pronto" });
        }
        if (!mediaUpload.rightsStatus) {
          return reply
            .status(400)
            .send({ error: "Declare os direitos do vídeo antes de marcar o projeto como pronto" });
        }
      }

      const updated = await prisma.contentProject.update({ where: { id }, data: parsed.data });
      return reply.send(updated);
    },
  );

  // Excluir um conteúdo apaga roteiros/títulos/descrições/mídia (cascata no
  // banco) e os arquivos do disco. Duas regras vêm do schema/fluxo:
  // - PublishedVideo → ContentProject é onDelete: Restrict (histórico de
  //   publicações não some por acidente). Um conteúdo já PUBLICADO no
  //   YouTube não pode ser excluído (409; a alternativa é arquivar, status
  //   ARCHIVED). Tentativas que FALHARAM não são histórico que valha
  //   preservar: saem junto.
  // - Se o conteúdo tinha "puxado" uma oportunidade pra IN_PROGRESS e mais
  //   nenhum outro conteúdo a usa, ela volta pra NEW (senão sumiria da
  //   lista de "novas" sem ter virado nada). CONVERTED/DISMISSED ficam.
  app.delete(
    "/api/content-projects/:id",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const project = await loadOwnedProject(request.user.sub, id);
      if (!project) {
        return reply.status(404).send({ error: "Projeto não encontrado" });
      }

      const published = await prisma.publishedVideo.count({
        where: { contentProjectId: id, status: "PUBLISHED" },
      });
      if (published > 0) {
        return reply.status(409).send({
          error:
            "Este conteúdo já foi publicado no YouTube e fica no histórico de vídeos — " +
            "arquive-o em vez de excluir.",
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.publishedVideo.deleteMany({ where: { contentProjectId: id } });
        await tx.contentProject.delete({ where: { id } });

        if (project.opportunityId) {
          const stillUsed = await tx.contentProject.count({
            where: { opportunityId: project.opportunityId },
          });
          if (stillUsed === 0) {
            await tx.opportunity.updateMany({
              where: { id: project.opportunityId, status: "IN_PROGRESS" },
              data: { status: "NEW" },
            });
          }
        }

        await tx.auditLog.create({
          data: {
            userId: request.user.sub,
            action: "CONTENT_PROJECT_DELETED",
            entityType: "ContentProject",
            entityId: id,
            metadata: { title: project.title, status: project.status },
          },
        });
      });

      // Depois do commit: se a limpeza do disco falhar, o registro já foi e
      // sobra só lixo em backend/uploads — não vale desfazer a exclusão.
      await removeProjectUploads(id).catch((error: unknown) => {
        app.log.warn({ err: error, projectId: id }, "Falha ao apagar os arquivos do projeto");
      });

      return reply.status(204).send();
    },
  );

  app.post(
    "/api/content-projects/:id/generate-script",
    { preHandler: [app.authenticate], config: AI_RATE_LIMIT },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = generateScriptSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "Parâmetros inválidos", details: parsed.error.flatten().fieldErrors });
      }

      const project = await loadOwnedProject(request.user.sub, id);
      if (!project) {
        return reply.status(404).send({ error: "Projeto não encontrado" });
      }

      try {
        const content = await aiProvider.generateScript({
          idea: parsed.data.idea ?? project.title,
          durationSeconds: parsed.data.durationSeconds,
        });
        const lastVersion = await prisma.script.findFirst({
          where: { contentProjectId: id },
          orderBy: { version: "desc" },
        });
        const script = await prisma.script.create({
          data: {
            contentProjectId: id,
            content,
            version: (lastVersion?.version ?? 0) + 1,
            aiProvider: env.AI_PROVIDER,
          },
        });
        return reply.status(201).send(script);
      } catch (error) {
        app.log.error({ err: error }, "Falha ao gerar roteiro com IA");
        return reply.status(502).send({ error: "Falha ao gerar roteiro com IA" });
      }
    },
  );

  app.post(
    "/api/content-projects/:id/generate-titles",
    { preHandler: [app.authenticate], config: AI_RATE_LIMIT },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = generateTitlesSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "Parâmetros inválidos", details: parsed.error.flatten().fieldErrors });
      }

      const project = await loadOwnedProject(request.user.sub, id);
      if (!project) {
        return reply.status(404).send({ error: "Projeto não encontrado" });
      }

      try {
        const latestScript = await prisma.script.findFirst({
          where: { contentProjectId: id },
          orderBy: { version: "desc" },
        });
        const titles = await aiProvider.generateTitles({
          topic: project.title,
          script: latestScript?.content,
          count: parsed.data.count,
        });
        const created = await prisma.$transaction(
          titles.map((title) =>
            prisma.generatedTitle.create({ data: { contentProjectId: id, title } }),
          ),
        );
        return reply.status(201).send(created);
      } catch (error) {
        app.log.error({ err: error }, "Falha ao gerar títulos com IA");
        return reply.status(502).send({ error: "Falha ao gerar títulos com IA" });
      }
    },
  );

  app.post(
    "/api/content-projects/:id/generate-description",
    { preHandler: [app.authenticate], config: AI_RATE_LIMIT },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const project = await loadOwnedProject(request.user.sub, id);
      if (!project) {
        return reply.status(404).send({ error: "Projeto não encontrado" });
      }

      const latestScript = await prisma.script.findFirst({
        where: { contentProjectId: id },
        orderBy: { version: "desc" },
      });
      if (!latestScript) {
        return reply.status(400).send({ error: "Gere um roteiro antes de gerar a descrição" });
      }

      const selectedTitle = await prisma.generatedTitle.findFirst({
        where: { contentProjectId: id, selected: true },
        orderBy: { createdAt: "desc" },
      });

      try {
        const description = await aiProvider.generateDescription({
          title: selectedTitle?.title ?? project.title,
          script: latestScript.content,
        });
        const created = await prisma.generatedDescription.create({
          data: { contentProjectId: id, description },
        });
        return reply.status(201).send(created);
      } catch (error) {
        app.log.error({ err: error }, "Falha ao gerar descrição com IA");
        return reply.status(502).send({ error: "Falha ao gerar descrição com IA" });
      }
    },
  );

  app.post(
    "/api/content-projects/:id/titles/:titleId/select",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id, titleId } = request.params as { id: string; titleId: string };

      const project = await loadOwnedProject(request.user.sub, id);
      if (!project) {
        return reply.status(404).send({ error: "Projeto não encontrado" });
      }
      const title = await prisma.generatedTitle.findFirst({
        where: { id: titleId, contentProjectId: id },
      });
      if (!title) {
        return reply.status(404).send({ error: "Título não encontrado" });
      }

      await prisma.$transaction([
        prisma.generatedTitle.updateMany({
          where: { contentProjectId: id },
          data: { selected: false },
        }),
        prisma.generatedTitle.update({ where: { id: titleId }, data: { selected: true } }),
      ]);

      return reply.send({ id: titleId, selected: true });
    },
  );

  app.post(
    "/api/content-projects/:id/descriptions/:descriptionId/select",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id, descriptionId } = request.params as { id: string; descriptionId: string };

      const project = await loadOwnedProject(request.user.sub, id);
      if (!project) {
        return reply.status(404).send({ error: "Projeto não encontrado" });
      }
      const description = await prisma.generatedDescription.findFirst({
        where: { id: descriptionId, contentProjectId: id },
      });
      if (!description) {
        return reply.status(404).send({ error: "Descrição não encontrada" });
      }

      await prisma.$transaction([
        prisma.generatedDescription.updateMany({
          where: { contentProjectId: id },
          data: { selected: false },
        }),
        prisma.generatedDescription.update({
          where: { id: descriptionId },
          data: { selected: true },
        }),
      ]);

      return reply.send({ id: descriptionId, selected: true });
    },
  );
}
