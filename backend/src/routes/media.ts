import type { FastifyInstance } from "fastify";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { rootDir } from "../env.js";
import { prisma } from "../prisma.js";

const RIGHTS_STATUS_VALUES = ["ORIGINAL", "AUTHORIZED", "LICENSED", "PUBLIC_DOMAIN"] as const;

const rightsSchema = z.object({
  rightsStatus: z.enum(RIGHTS_STATUS_VALUES),
  containsSyntheticMedia: z.boolean(),
});

// Fase 13: armazenamento em disco local (backend/uploads/, gitignored) —
// decisão deliberada pra não depender de uma conta de object storage que o
// usuário ainda não tem (mesma situação do YouTube/Anthropic). Não
// sobrevive a um redeploy no Render (filesystem efêmero) — ver
// docs/ARCHITECTURE.md, pendência registrada pra Fase 20.
const UPLOADS_DIR = path.join(rootDir, "backend", "uploads");

async function loadOwnedProject(userId: string, id: string) {
  return prisma.contentProject.findFirst({ where: { id, userId } });
}

// Nunca confia no filename enviado pelo cliente como parte do caminho no
// disco (path traversal) — troca qualquer caractere fora de um allowlist
// simples.
function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-150);
}

async function deleteFileIfExists(absolutePath: string) {
  await rm(absolutePath, { force: true });
}

function absolutePathFor(relativePath: string): string {
  return path.join(rootDir, "backend", relativePath);
}

export async function mediaRoutes(app: FastifyInstance) {
  app.post(
    "/api/content-projects/:id/media",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const project = await loadOwnedProject(request.user.sub, id);
      if (!project) {
        return reply.status(404).send({ error: "Projeto não encontrado" });
      }

      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ error: "Nenhum arquivo enviado" });
      }
      if (!file.mimetype.startsWith("video/")) {
        return reply.status(400).send({ error: "Só são aceitos arquivos de vídeo" });
      }

      const projectDir = path.join(UPLOADS_DIR, id);
      await mkdir(projectDir, { recursive: true });

      // Um projeto só guarda o upload mais recente — apaga o arquivo
      // antigo do disco antes de gravar o novo (ver comentário no schema,
      // MediaUpload). Se a gravação do novo arquivo falhar no meio, o
      // antigo já terá sido perdido — aceitável pra um upload local de
      // dev; um storage de verdade (Fase 20) resolveria isso com
      // multipart/versionamento.
      const existing = await prisma.mediaUpload.findUnique({
        where: { contentProjectId: id },
      });
      if (existing) {
        await deleteFileIfExists(absolutePathFor(existing.filePath));
      }

      const storedFileName = `${randomUUID()}-${sanitizeFileName(file.filename)}`;
      const absolutePath = path.join(projectDir, storedFileName);
      const relativePath = path.join("uploads", id, storedFileName);

      await pipeline(file.file, createWriteStream(absolutePath));

      // @fastify/multipart trunca o stream (sem lançar) quando o arquivo
      // passa do limite configurado em app.ts — só dá pra saber depois que
      // o pipeline terminou.
      if (file.file.truncated) {
        await deleteFileIfExists(absolutePath);
        return reply.status(413).send({ error: "Arquivo excede o limite de 500MB" });
      }

      const { size } = await stat(absolutePath);

      // Um novo arquivo é conteúdo diferente do que foi declarado antes —
      // reseta a declaração de direitos (Fase 14) em vez de manter a
      // declaração antiga colada num arquivo novo.
      const mediaUpload = await prisma.mediaUpload.upsert({
        where: { contentProjectId: id },
        create: {
          contentProjectId: id,
          fileName: file.filename,
          filePath: relativePath,
          mimeType: file.mimetype,
          sizeBytes: BigInt(size),
        },
        update: {
          fileName: file.filename,
          filePath: relativePath,
          mimeType: file.mimetype,
          sizeBytes: BigInt(size),
          rightsStatus: null,
          containsSyntheticMedia: false,
        },
      });

      return reply.status(201).send({
        id: mediaUpload.id,
        fileName: mediaUpload.fileName,
        mimeType: mediaUpload.mimeType,
        sizeBytes: mediaUpload.sizeBytes.toString(),
        rightsStatus: mediaUpload.rightsStatus,
        containsSyntheticMedia: mediaUpload.containsSyntheticMedia,
        createdAt: mediaUpload.createdAt,
      });
    },
  );

  app.delete(
    "/api/content-projects/:id/media",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const project = await loadOwnedProject(request.user.sub, id);
      if (!project) {
        return reply.status(404).send({ error: "Projeto não encontrado" });
      }

      const mediaUpload = await prisma.mediaUpload.findUnique({
        where: { contentProjectId: id },
      });
      if (!mediaUpload) {
        return reply.status(404).send({ error: "Nenhum vídeo enviado pra esse projeto" });
      }

      await deleteFileIfExists(absolutePathFor(mediaUpload.filePath));
      await prisma.mediaUpload.delete({ where: { contentProjectId: id } });

      return reply.status(204).send();
    },
  );

  // Fase 14: declaração de direitos do vídeo já enviado — feita como um
  // passo separado do upload (ver comentário no schema, MediaUpload).
  app.patch(
    "/api/content-projects/:id/media/rights",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = rightsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "Parâmetros inválidos", details: parsed.error.flatten().fieldErrors });
      }

      const project = await loadOwnedProject(request.user.sub, id);
      if (!project) {
        return reply.status(404).send({ error: "Projeto não encontrado" });
      }

      const existing = await prisma.mediaUpload.findUnique({ where: { contentProjectId: id } });
      if (!existing) {
        return reply.status(404).send({ error: "Envie um vídeo antes de declarar os direitos" });
      }

      const mediaUpload = await prisma.mediaUpload.update({
        where: { contentProjectId: id },
        data: parsed.data,
      });

      return reply.send({
        rightsStatus: mediaUpload.rightsStatus,
        containsSyntheticMedia: mediaUpload.containsSyntheticMedia,
      });
    },
  );

  // Servida atrás de autenticação (não é uma URL pública/assinada) — usada
  // pelo <video> da página de detalhe do projeto; o navegador manda o
  // cookie httpOnly normalmente numa requisição de mesma origem.
  app.get(
    "/api/content-projects/:id/media/file",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const project = await loadOwnedProject(request.user.sub, id);
      if (!project) {
        return reply.status(404).send({ error: "Projeto não encontrado" });
      }

      const mediaUpload = await prisma.mediaUpload.findUnique({
        where: { contentProjectId: id },
      });
      if (!mediaUpload) {
        return reply.status(404).send({ error: "Nenhum vídeo enviado pra esse projeto" });
      }

      reply.header("Content-Type", mediaUpload.mimeType);
      reply.header("Content-Length", mediaUpload.sizeBytes.toString());
      return reply.send(createReadStream(absolutePathFor(mediaUpload.filePath)));
    },
  );
}
