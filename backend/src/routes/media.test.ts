import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";
import { buildApp } from "../app.js";
import { rootDir } from "../env.js";
import { prisma } from "../prisma.js";

const UPLOADS_DIR = path.join(rootDir, "backend", "uploads");

function buildMultipartBody(params: {
  boundary: string;
  fieldName: string;
  fileName: string;
  contentType: string;
  content: string;
}) {
  const { boundary, fieldName, fileName, contentType, content } = params;
  return [
    `--${boundary}`,
    `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"`,
    `Content-Type: ${contentType}`,
    "",
    content,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

// Fases 13/14 — upload de mídia em disco local + declaração de direitos
// (ver docs/ARCHITECTURE.md). Testa o CRUD completo (upload/substituição/
// download/remoção/direitos) com um arquivo fabricado pequeno — não
// precisa de credencial nenhuma, ao contrário das Fases 5/11 (rede
// externa).
describe("Rotas de mídia (Fases 13-14)", () => {
  const app = buildApp();
  const createdEmails: string[] = [];
  const createdProjectIds: string[] = [];
  let mainToken: string;

  beforeAll(async () => {
    const main = await registerUser("main");
    mainToken = main.token;
  });

  afterAll(async () => {
    await prisma.mediaUpload.deleteMany({
      where: { contentProjectId: { in: createdProjectIds } },
    });
    await prisma.contentProject.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await Promise.all(
      createdProjectIds.map((id) =>
        rm(path.join(UPLOADS_DIR, id), { recursive: true, force: true }),
      ),
    );
    await app.close();
  });

  async function registerUser(label: string) {
    const email = `media-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    createdEmails.push(email);

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password: "senha-forte-123", name: "Teste" },
    });

    const token = response.cookies.find((c) => c.name === "token")?.value ?? "";
    return { token };
  }

  async function createProject(token: string, title = "Projeto com mídia") {
    const response = await app.inject({
      method: "POST",
      url: "/api/content-projects",
      cookies: { token },
      payload: { title },
    });
    const project = response.json() as { id: string };
    createdProjectIds.push(project.id);
    return project;
  }

  it("POST .../media exige autenticação", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/content-projects/algum-id/media",
    });
    expect(response.statusCode).toBe(401);
  });

  it("POST .../media devolve 404 pra projeto de outro usuário", async () => {
    const { token: tokenB } = await registerUser("upload-other-b");
    const project = await createProject(mainToken);
    const boundary = "----test-boundary-1";

    const response = await app.inject({
      method: "POST",
      url: `/api/content-projects/${project.id}/media`,
      cookies: { token: tokenB },
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: buildMultipartBody({
        boundary,
        fieldName: "file",
        fileName: "video.mp4",
        contentType: "video/mp4",
        content: "conteudo-fake",
      }),
    });
    expect(response.statusCode).toBe(404);
  });

  it("POST .../media rejeita arquivo que não é vídeo", async () => {
    const project = await createProject(mainToken);
    const boundary = "----test-boundary-2";

    const response = await app.inject({
      method: "POST",
      url: `/api/content-projects/${project.id}/media`,
      cookies: { token: mainToken },
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: buildMultipartBody({
        boundary,
        fieldName: "file",
        fileName: "documento.txt",
        contentType: "text/plain",
        content: "não é vídeo",
      }),
    });
    expect(response.statusCode).toBe(400);
  });

  it("faz upload, sobrescreve, baixa e remove o vídeo", async () => {
    const project = await createProject(mainToken);
    const boundary = "----test-boundary-3";

    const uploadResponse = await app.inject({
      method: "POST",
      url: `/api/content-projects/${project.id}/media`,
      cookies: { token: mainToken },
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: buildMultipartBody({
        boundary,
        fieldName: "file",
        fileName: "video-v1.mp4",
        contentType: "video/mp4",
        content: "conteudo-v1",
      }),
    });
    expect(uploadResponse.statusCode).toBe(201);
    const uploaded = uploadResponse.json() as { fileName: string; sizeBytes: string };
    expect(uploaded.fileName).toBe("video-v1.mp4");
    expect(Number(uploaded.sizeBytes)).toBeGreaterThan(0);

    const detailResponse = await app.inject({
      method: "GET",
      url: `/api/content-projects/${project.id}`,
      cookies: { token: mainToken },
    });
    const detail = detailResponse.json() as { mediaUpload: { fileName: string } | null };
    expect(detail.mediaUpload?.fileName).toBe("video-v1.mp4");

    // sobrescreve com um segundo upload — só um MediaUpload por projeto
    const boundary2 = "----test-boundary-4";
    const secondUploadResponse = await app.inject({
      method: "POST",
      url: `/api/content-projects/${project.id}/media`,
      cookies: { token: mainToken },
      headers: { "content-type": `multipart/form-data; boundary=${boundary2}` },
      payload: buildMultipartBody({
        boundary: boundary2,
        fieldName: "file",
        fileName: "video-v2.mp4",
        contentType: "video/mp4",
        content: "conteudo-v2-mais-longo",
      }),
    });
    expect(secondUploadResponse.statusCode).toBe(201);

    const countAfterOverwrite = await prisma.mediaUpload.count({
      where: { contentProjectId: project.id },
    });
    expect(countAfterOverwrite).toBe(1);

    const downloadResponse = await app.inject({
      method: "GET",
      url: `/api/content-projects/${project.id}/media/file`,
      cookies: { token: mainToken },
    });
    expect(downloadResponse.statusCode).toBe(200);
    expect(downloadResponse.body).toBe("conteudo-v2-mais-longo");

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/content-projects/${project.id}/media`,
      cookies: { token: mainToken },
    });
    expect(deleteResponse.statusCode).toBe(204);

    const afterDelete = await prisma.mediaUpload.findUnique({
      where: { contentProjectId: project.id },
    });
    expect(afterDelete).toBeNull();
  });

  it("DELETE .../media devolve 404 quando não há vídeo enviado", async () => {
    const project = await createProject(mainToken);

    const response = await app.inject({
      method: "DELETE",
      url: `/api/content-projects/${project.id}/media`,
      cookies: { token: mainToken },
    });
    expect(response.statusCode).toBe(404);
  });

  it("GET .../media/file devolve 404 quando não há vídeo enviado", async () => {
    const project = await createProject(mainToken);

    const response = await app.inject({
      method: "GET",
      url: `/api/content-projects/${project.id}/media/file`,
      cookies: { token: mainToken },
    });
    expect(response.statusCode).toBe(404);
  });

  async function uploadVideo(token: string, projectId: string, fileName: string, content: string) {
    const boundary = `----test-boundary-${Math.random().toString(36).slice(2)}`;
    return app.inject({
      method: "POST",
      url: `/api/content-projects/${projectId}/media`,
      cookies: { token },
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: buildMultipartBody({
        boundary,
        fieldName: "file",
        fileName,
        contentType: "video/mp4",
        content,
      }),
    });
  }

  it("PATCH .../media/rights exige autenticação", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/content-projects/algum-id/media/rights",
      payload: { rightsStatus: "ORIGINAL", containsSyntheticMedia: false },
    });
    expect(response.statusCode).toBe(401);
  });

  it("PATCH .../media/rights devolve 404 se ainda não existe upload", async () => {
    const project = await createProject(mainToken);

    const response = await app.inject({
      method: "PATCH",
      url: `/api/content-projects/${project.id}/media/rights`,
      cookies: { token: mainToken },
      payload: { rightsStatus: "ORIGINAL", containsSyntheticMedia: false },
    });
    expect(response.statusCode).toBe(404);
  });

  it("PATCH .../media/rights rejeita rightsStatus inválido", async () => {
    const project = await createProject(mainToken);
    await uploadVideo(mainToken, project.id, "video.mp4", "conteudo");

    const response = await app.inject({
      method: "PATCH",
      url: `/api/content-projects/${project.id}/media/rights`,
      cookies: { token: mainToken },
      payload: { rightsStatus: "ROUBADO", containsSyntheticMedia: false },
    });
    expect(response.statusCode).toBe(400);
  });

  it("PATCH .../media/rights salva a declaração e libera o status READY", async () => {
    const project = await createProject(mainToken);
    await uploadVideo(mainToken, project.id, "video.mp4", "conteudo");

    const readyBeforeRights = await app.inject({
      method: "PATCH",
      url: `/api/content-projects/${project.id}`,
      cookies: { token: mainToken },
      payload: { status: "READY" },
    });
    expect(readyBeforeRights.statusCode).toBe(400);

    const rightsResponse = await app.inject({
      method: "PATCH",
      url: `/api/content-projects/${project.id}/media/rights`,
      cookies: { token: mainToken },
      payload: { rightsStatus: "ORIGINAL", containsSyntheticMedia: true },
    });
    expect(rightsResponse.statusCode).toBe(200);
    expect(rightsResponse.json()).toEqual({
      rightsStatus: "ORIGINAL",
      containsSyntheticMedia: true,
    });

    const readyAfterRights = await app.inject({
      method: "PATCH",
      url: `/api/content-projects/${project.id}`,
      cookies: { token: mainToken },
      payload: { status: "READY" },
    });
    expect(readyAfterRights.statusCode).toBe(200);
  });

  it("um novo upload reseta a declaração de direitos do upload anterior", async () => {
    const project = await createProject(mainToken);
    await uploadVideo(mainToken, project.id, "video-v1.mp4", "conteudo-v1");
    await app.inject({
      method: "PATCH",
      url: `/api/content-projects/${project.id}/media/rights`,
      cookies: { token: mainToken },
      payload: { rightsStatus: "ORIGINAL", containsSyntheticMedia: false },
    });

    await uploadVideo(mainToken, project.id, "video-v2.mp4", "conteudo-v2");

    const mediaUpload = await prisma.mediaUpload.findUnique({
      where: { contentProjectId: project.id },
    });
    expect(mediaUpload?.rightsStatus).toBeNull();
  });

  it("PATCH /api/content-projects/:id devolve 400 pra READY sem vídeo enviado", async () => {
    const project = await createProject(mainToken);

    const response = await app.inject({
      method: "PATCH",
      url: `/api/content-projects/${project.id}`,
      cookies: { token: mainToken },
      payload: { status: "READY" },
    });
    expect(response.statusCode).toBe(400);
  });

  // Importação por URL — as travas de segurança rodam antes de qualquer
  // conexão, então dá pra testar sem rede. O caminho de sucesso está em
  // mediaImport.test.ts (com o download substituído).
  describe("POST .../media/import (travas antes de baixar)", () => {
    // Instância nova por teste: a rota tem rate limit (5/min) em memória.
    let importApp: ReturnType<typeof buildApp>;

    beforeEach(() => {
      importApp = buildApp();
    });

    afterEach(async () => {
      await importApp.close();
    });

    function importUrl(token: string, projectId: string, url: unknown) {
      return importApp.inject({
        method: "POST",
        url: `/api/content-projects/${projectId}/media/import`,
        cookies: { token },
        payload: { url },
      });
    }

    it("exige autenticação", async () => {
      const response = await importApp.inject({
        method: "POST",
        url: "/api/content-projects/algum-id/media/import",
        payload: { url: "https://exemplo.com/a.mp4" },
      });
      expect(response.statusCode).toBe(401);
    });

    it("devolve 404 pra projeto de outro usuário", async () => {
      const { token: otherToken } = await registerUser("import-other");
      const project = await createProject(mainToken);

      const response = await importUrl(otherToken, project.id, "https://exemplo.com/a.mp4");
      expect(response.statusCode).toBe(404);
    });

    it("devolve 400 sem link", async () => {
      const project = await createProject(mainToken);

      expect((await importUrl(mainToken, project.id, undefined)).statusCode).toBe(400);
      expect((await importUrl(mainToken, project.id, "   ")).statusCode).toBe(400);
    });

    it("recusa link do YouTube com a explicação", async () => {
      const project = await createProject(mainToken);

      const response = await importUrl(
        mainToken,
        project.id,
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      );

      expect(response.statusCode).toBe(400);
      expect((response.json() as { error: string }).error).toMatch(/não baixa vídeos do YouTube/);
      expect(await prisma.mediaUpload.count({ where: { contentProjectId: project.id } })).toBe(0);
    });

    it.each([
      "http://127.0.0.1/video.mp4",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/video.mp4",
      "file:///etc/passwd",
    ])("recusa alvo interno ou protocolo não permitido (SSRF): %s", async (url) => {
      const project = await createProject(mainToken);

      const response = await importUrl(mainToken, project.id, url);

      expect(response.statusCode).toBe(400);
      expect(await prisma.mediaUpload.count({ where: { contentProjectId: project.id } })).toBe(0);
    });
  });
});
