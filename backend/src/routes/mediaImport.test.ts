import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildApp } from "../app.js";
import { rootDir } from "../env.js";
import { downloadVideoFromUrl, ImportUrlError } from "../media/remoteDownload.js";
import { prisma } from "../prisma.js";

// O download em si (rede, SSRF, limites) é testado em
// media/remoteDownload.test.ts. Aqui ele é substituído pra cobrir o que é da
// ROTA: gravar o arquivo, trocar o vídeo anterior só depois do novo chegar,
// resetar direitos, registrar a origem e limpar o temporário nas falhas.
vi.mock("../media/remoteDownload.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../media/remoteDownload.js")>();
  return { ...actual, downloadVideoFromUrl: vi.fn() };
});

const UPLOADS_DIR = path.join(rootDir, "backend", "uploads");
const downloadMock = vi.mocked(downloadVideoFromUrl);

describe("POST /api/content-projects/:id/media/import", () => {
  // Instância nova a cada teste: a rota tem rate limit (5/min) em memória, e
  // são mais que 5 importações no arquivo.
  let app = buildApp();
  const createdProjectIds: string[] = [];
  let email = "";
  let token = "";
  let userId = "";

  beforeAll(async () => {
    email = `media-import-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password: "senha-forte-123", name: "Teste" },
    });
    token = response.cookies.find((c) => c.name === "token")?.value ?? "";
    userId = (response.json() as { id: string }).id;
  });

  beforeEach(async () => {
    downloadMock.mockReset();
    await app.close();
    app = buildApp();
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: createdProjectIds } } });
    await prisma.mediaUpload.deleteMany({ where: { contentProjectId: { in: createdProjectIds } } });
    await prisma.contentProject.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.user.deleteMany({ where: { email } });
    await Promise.all(
      createdProjectIds.map((id) =>
        rm(path.join(UPLOADS_DIR, id), { recursive: true, force: true }),
      ),
    );
    await app.close();
  });

  async function createProject() {
    const response = await app.inject({
      method: "POST",
      url: "/api/content-projects",
      cookies: { token },
      payload: { title: "Projeto importado" },
    });
    const { id } = response.json() as { id: string };
    createdProjectIds.push(id);
    return id;
  }

  // Simula um download bem-sucedido: escreve `content` no destino que a rota
  // pediu, como o downloader de verdade faria.
  function mockSuccessfulDownload(content: string, fileName = "clip.mp4") {
    downloadMock.mockImplementation(async (_url, destPath) => {
      await writeFile(destPath, content);
      return {
        fileName,
        mimeType: "video/mp4",
        sizeBytes: Buffer.byteLength(content),
        finalUrl: new URL("https://cdn.exemplo.com/videos/clip.mp4?token=segredo"),
      };
    });
  }

  function importVideo(projectId: string, url = "https://cdn.exemplo.com/videos/clip.mp4") {
    return app.inject({
      method: "POST",
      url: `/api/content-projects/${projectId}/media/import`,
      cookies: { token },
      payload: { url },
    });
  }

  it("baixa, grava o arquivo e devolve o upload com direitos ainda não declarados", async () => {
    const projectId = await createProject();
    mockSuccessfulDownload("bytes-do-video");

    const response = await importVideo(projectId);

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      fileName: "clip.mp4",
      mimeType: "video/mp4",
      sizeBytes: String(Buffer.byteLength("bytes-do-video")),
      rightsStatus: null,
    });
    expect(downloadMock).toHaveBeenCalledWith(
      "https://cdn.exemplo.com/videos/clip.mp4",
      expect.stringContaining(projectId),
      expect.objectContaining({ maxBytes: 500 * 1024 * 1024 }),
    );

    // O vídeo baixado é servido pelo mesmo endpoint dos uploads.
    const file = await app.inject({
      method: "GET",
      url: `/api/content-projects/${projectId}/media/file`,
      cookies: { token },
    });
    expect(file.statusCode).toBe(200);
    expect(file.body).toBe("bytes-do-video");
    // nenhum .part sobra no disco
    expect(
      (await readdir(path.join(UPLOADS_DIR, projectId))).some((f) => f.endsWith(".part")),
    ).toBe(false);
  });

  it("registra a origem no log de auditoria, sem a query string do link", async () => {
    const projectId = await createProject();
    mockSuccessfulDownload("abc");

    await importVideo(projectId);

    const logs = await prisma.auditLog.findMany({ where: { entityId: projectId } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      userId,
      action: "MEDIA_IMPORTED_FROM_URL",
      entityType: "ContentProject",
      metadata: { sourceUrl: "https://cdn.exemplo.com/videos/clip.mp4", sizeBytes: 3 },
    });
    expect(JSON.stringify(logs[0]?.metadata)).not.toContain("segredo");
  });

  it("substitui o vídeo anterior, apaga o arquivo antigo e reseta a declaração de direitos", async () => {
    const projectId = await createProject();
    mockSuccessfulDownload("primeiro");
    await importVideo(projectId);
    const first = await prisma.mediaUpload.findUniqueOrThrow({
      where: { contentProjectId: projectId },
    });
    await app.inject({
      method: "PATCH",
      url: `/api/content-projects/${projectId}/media/rights`,
      cookies: { token },
      payload: { rightsStatus: "ORIGINAL", containsSyntheticMedia: false },
    });

    mockSuccessfulDownload("segundo-video");
    const response = await importVideo(projectId);

    expect(response.statusCode).toBe(201);
    const second = await prisma.mediaUpload.findUniqueOrThrow({
      where: { contentProjectId: projectId },
    });
    expect(second.filePath).not.toBe(first.filePath);
    expect(second.rightsStatus).toBeNull();
    const files = await readdir(path.join(UPLOADS_DIR, projectId));
    expect(files).toHaveLength(1);
    expect(await readFile(path.join(rootDir, "backend", second.filePath), "utf8")).toBe(
      "segundo-video",
    );
  });

  it("repassa o erro do downloader com o status certo e não grava nada", async () => {
    const projectId = await createProject();
    downloadMock.mockRejectedValue(new ImportUrlError("O vídeo excede o limite de 500MB.", 413));

    const response = await importVideo(projectId);

    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({ error: "O vídeo excede o limite de 500MB." });
    expect(await prisma.mediaUpload.count({ where: { contentProjectId: projectId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { entityId: projectId } })).toBe(0);
  });

  it("falha inesperada vira 502 genérico e o arquivo temporário é apagado", async () => {
    const projectId = await createProject();
    downloadMock.mockImplementation(async (_url, destPath) => {
      await writeFile(destPath, "meio-do-download");
      throw new Error("ECONNRESET 10.0.0.7:443");
    });

    const response = await importVideo(projectId);

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ error: "Não foi possível baixar o vídeo desse link." });
    expect(response.body).not.toContain("10.0.0.7");
    expect(await readdir(path.join(UPLOADS_DIR, projectId))).toEqual([]);
  });

  it("uma importação que falha não destrói o vídeo que já estava no projeto", async () => {
    const projectId = await createProject();
    mockSuccessfulDownload("video-original");
    await importVideo(projectId);
    const before = await prisma.mediaUpload.findUniqueOrThrow({
      where: { contentProjectId: projectId },
    });

    downloadMock.mockRejectedValue(
      new ImportUrlError("O servidor do vídeo respondeu HTTP 404.", 502),
    );
    const response = await importVideo(projectId);

    expect(response.statusCode).toBe(502);
    const after = await prisma.mediaUpload.findUniqueOrThrow({
      where: { contentProjectId: projectId },
    });
    expect(after.filePath).toBe(before.filePath);
    expect(await readFile(path.join(rootDir, "backend", after.filePath), "utf8")).toBe(
      "video-original",
    );
  });
});
