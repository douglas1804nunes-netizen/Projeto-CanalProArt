import { rm } from "node:fs/promises";
import path from "node:path";
import { rootDir } from "../env.js";

// Fase 13: armazenamento em disco local (backend/uploads/, gitignored) —
// decisão deliberada pra não depender de uma conta de object storage que o
// usuário ainda não tem (mesma situação do YouTube/Anthropic). Não
// sobrevive a um redeploy no Render (filesystem efêmero) — ver
// docs/ARCHITECTURE.md, pendência registrada pra Fase 20.
export const UPLOADS_DIR = path.join(rootDir, "backend", "uploads");

// Apaga todos os arquivos de um projeto (vídeo enviado/importado e restos de
// .part). O id vem do banco (cuid), nunca direto do cliente.
export async function removeProjectUploads(projectId: string) {
  await rm(path.join(UPLOADS_DIR, projectId), { recursive: true, force: true });
}
