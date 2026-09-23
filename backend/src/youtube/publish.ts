import { randomUUID } from "node:crypto";

const UPLOAD_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status";

export type PublishVideoParams = {
  accessToken: string;
  videoBuffer: Buffer;
  mimeType: string;
  title: string;
  description: string;
  containsSyntheticMedia: boolean;
};

export type PublishVideoResult = { youtubeVideoId: string };

// Upload multipart simples (metadata JSON + bytes do vídeo numa única
// requisição) em vez de upload resumível — mais simples de implementar
// corretamente e suficiente pro teto de 500MB já imposto na Fase 13;
// resumível (com retomada em caso de falha de rede) fica pra quando a
// escala justificar (Fase 21+). Ver
// https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
export async function publishVideoToYoutube(
  params: PublishVideoParams,
): Promise<PublishVideoResult> {
  const boundary = `canalproart-${randomUUID()}`;

  // status.privacyStatus sempre "private": nunca publica publicamente sem
  // uma ação explícita do usuário fora do CanalProArt — o vídeo fica
  // acessível só pelo dono no YouTube Studio, que pode trocar a
  // visibilidade manualmente quando quiser. containsSyntheticMedia é a
  // declaração oficial exigida pelo YouTube pra conteúdo sintético/alterado
  // por IA (ver docs/YOUTUBE.md), independente do rightsStatus.
  const metadata = {
    snippet: { title: params.title, description: params.description },
    status: { privacyStatus: "private", containsSyntheticMedia: params.containsSyntheticMedia },
  };

  const preamble = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${params.mimeType}\r\n\r\n`,
  );
  const epilogue = Buffer.from(`\r\n--${boundary}--`);
  const body = Buffer.concat([preamble, params.videoBuffer, epilogue]);

  const response = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(body.length),
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `Falha ao publicar vídeo no YouTube (HTTP ${response.status}): ${errorBody.slice(0, 500)}`,
    );
  }

  const result = (await response.json()) as { id: string };
  return { youtubeVideoId: result.id };
}
