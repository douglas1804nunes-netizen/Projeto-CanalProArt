import { createWriteStream } from "node:fs";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

// Importação de vídeo por link direto de arquivo (ex.: .mp4 hospedado pelo
// próprio usuário, CDN, S3, Dropbox com ?dl=1). O servidor busca uma URL
// escolhida pelo usuário — o risco clássico é SSRF (usar o backend pra
// alcançar localhost, a rede interna do Render ou o endpoint de metadados da
// nuvem). Por isso: só http/https nas portas padrão, nada de usuário/senha na
// URL, o IP de CADA conexão é validado no momento de conectar (protege contra
// DNS rebinding) e cada redirecionamento passa pela mesma validação.
//
// Links do YouTube são recusados de propósito: o projeto não baixa vídeos do
// YouTube (ver README/docs/YOUTUBE.md).

export class ImportUrlError extends Error {
  readonly statusCode: 400 | 413 | 502;

  constructor(message: string, statusCode: 400 | 413 | 502 = 400) {
    super(message);
    this.name = "ImportUrlError";
    this.statusCode = statusCode;
  }
}

const MAX_REDIRECTS = 3;
const IDLE_TIMEOUT_MS = 30_000;
const TOTAL_TIMEOUT_MS = 20 * 60 * 1000;

const YOUTUBE_MESSAGE =
  "Links do YouTube não podem ser importados — o CanalProArt não baixa vídeos do YouTube. " +
  "Se o vídeo é seu, baixe o original no YouTube Studio (Conteúdo → ⋮ → Baixar) e envie o " +
  "arquivo aqui. Se é de outra pessoa, peça o arquivo e a autorização a ela ou use um vídeo " +
  "de banco livre (Pexels, Pixabay, Archive.org…) pelo link direto do arquivo.";

const BLOCKED_PLATFORM_DOMAINS = [
  "youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "googlevideo.com",
];

// Faixas que nunca são "a internet pública": loopback, redes privadas,
// link-local (inclui o metadata da nuvem, 169.254.169.254), CGNAT,
// multicast, documentação etc.
const privateRanges = new net.BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  privateRanges.addSubnet(address, prefix, "ipv4");
}
for (const [address, prefix] of [
  ["::", 96], // não especificado, loopback e IPv4-compatível
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  privateRanges.addSubnet(address, prefix, "ipv6");
}

// IPv4 mapeado em IPv6 (::ffff:10.0.0.1) cai nas regras de IPv4 — o
// net.BlockList já trata isso.
export function isPublicAddress(address: string): boolean {
  const bare = address.split("%")[0] ?? address;
  const version = net.isIP(bare);
  if (version === 0) return false;
  return !privateRanges.check(bare, version === 6 ? "ipv6" : "ipv4");
}

function isBlockedPlatformHost(hostname: string): boolean {
  return BLOCKED_PLATFORM_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
}

export function validateImportUrl(raw: string, options: { allowLocalNetwork?: boolean } = {}): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ImportUrlError("Link inválido. Cole o endereço completo, começando com https://");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ImportUrlError("Só links http:// ou https:// são aceitos.");
  }
  if (url.username || url.password) {
    throw new ImportUrlError("Links com usuário e senha embutidos não são aceitos.");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (isBlockedPlatformHost(hostname)) {
    throw new ImportUrlError(YOUTUBE_MESSAGE);
  }

  if (options.allowLocalNetwork) return url;

  // URL normaliza a porta padrão pra "" — qualquer outra é recusada (evita
  // usar o servidor pra sondar portas de serviços).
  if (url.port !== "") {
    throw new ImportUrlError("Só são aceitos links nas portas padrão (80 e 443).");
  }

  // IP literal não passa pelo lookup de DNS, então precisa ser checado aqui.
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(bare) !== 0 && !isPublicAddress(bare)) {
    throw new ImportUrlError("Esse endereço não é público — só links da internet são aceitos.");
  }

  return url;
}

const EXTENSION_MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
};

const GENERIC_BINARY_TYPES = new Set(["application/octet-stream", "binary/octet-stream"]);

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

// Aceita `video/*` declarado pelo servidor; ou tipo binário genérico (comum
// em Dropbox/S3) quando a extensão do arquivo é de vídeo conhecida.
function resolveVideoMimeType(contentType: string, fileName: string): string | null {
  if (/^video\/[a-z0-9.+-]+$/.test(contentType)) return contentType;
  if (GENERIC_BINARY_TYPES.has(contentType)) {
    return EXTENSION_MIME_TYPES[extensionOf(fileName)] ?? null;
  }
  return null;
}

function pickFileName(url: URL, contentDisposition: string | undefined): string {
  const fromHeader = contentDisposition
    ? /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(contentDisposition)?.[1]
    : undefined;
  const raw = fromHeader ?? url.pathname.split("/").filter(Boolean).pop() ?? "";
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // mantém o valor cru — o chamador sanitiza antes de gravar em disco
  }
  return decoded || "video";
}

// Valida o IP no momento da conexão (não só o hostname antes): se o DNS
// responder um endereço interno — inclusive num "DNS rebinding" — a conexão
// nunca é aberta.
const guardedLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "", 0);
    if (addresses.length === 0 || addresses.some((entry) => !isPublicAddress(entry.address))) {
      return callback(
        new ImportUrlError("Esse endereço não é público — só links da internet são aceitos."),
        "",
        0,
      );
    }
    if (options.all) {
      return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, addresses);
    }
    const first = addresses[0];
    return callback(null, first?.address ?? "", first?.family ?? 4);
  });
};

function requestOnce(
  url: URL,
  signal: AbortSignal,
  options: { allowLocalNetwork?: boolean },
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const request = client.request(
      url,
      {
        method: "GET",
        headers: {
          // Sem compressão: os bytes gravados têm que ser os do arquivo.
          "Accept-Encoding": "identity",
          Accept: "video/*,application/octet-stream;q=0.8",
          "User-Agent": "CanalProArt-Importer/1.0",
        },
        signal,
        timeout: IDLE_TIMEOUT_MS,
        ...(options.allowLocalNetwork ? {} : { lookup: guardedLookup }),
      },
      resolve,
    );
    request.on("timeout", () => {
      request.destroy(
        new ImportUrlError("O servidor do vídeo demorou demais para responder.", 502),
      );
    });
    request.on("error", reject);
    request.end();
  });
}

export type DownloadedVideo = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  finalUrl: URL;
};

export type DownloadOptions = {
  maxBytes: number;
  // Só para testes (o servidor de teste roda em localhost): nunca é exposto
  // pela rota.
  allowLocalNetwork?: boolean;
};

// Baixa o arquivo pra `destPath`. Em qualquer falha o chamador é quem apaga
// o arquivo parcial. Só lança ImportUrlError (mensagem já pronta pro
// usuário) — erros de rede/DNS/timeout viram 502.
export async function downloadVideoFromUrl(
  rawUrl: string,
  destPath: string,
  { maxBytes, allowLocalNetwork }: DownloadOptions,
): Promise<DownloadedVideo> {
  const signal = AbortSignal.timeout(TOTAL_TIMEOUT_MS);

  try {
    let current = validateImportUrl(rawUrl, { allowLocalNetwork });

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const response = await requestOnce(current, signal, { allowLocalNetwork });
      const status = response.statusCode ?? 0;

      if ([301, 302, 303, 307, 308].includes(status)) {
        response.resume();
        const location = response.headers.location;
        if (!location) {
          throw new ImportUrlError("O servidor redirecionou sem informar o destino.", 502);
        }
        let next: string;
        try {
          next = new URL(location, current).toString();
        } catch {
          throw new ImportUrlError("O servidor redirecionou para um endereço inválido.", 502);
        }
        current = validateImportUrl(next, { allowLocalNetwork });
        continue;
      }

      if (status !== 200) {
        response.resume();
        throw new ImportUrlError(`O servidor do vídeo respondeu HTTP ${status}.`, 502);
      }

      const contentType =
        (response.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
      const fileName = pickFileName(current, response.headers["content-disposition"]);
      const mimeType = resolveVideoMimeType(contentType, fileName);
      if (!mimeType) {
        response.resume();
        throw new ImportUrlError(
          "O link não aponta para um arquivo de vídeo (tipo recebido: " +
            `${contentType || "desconhecido"}). Use o link direto do arquivo — páginas de ` +
            "players e de redes sociais não funcionam.",
        );
      }

      const declaredLength = Number(response.headers["content-length"]);
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        response.resume();
        throw new ImportUrlError("O vídeo excede o limite de 500MB.", 413);
      }

      let received = 0;
      const limiter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          received += chunk.length;
          if (received > maxBytes) {
            callback(new ImportUrlError("O vídeo excede o limite de 500MB.", 413));
            return;
          }
          callback(null, chunk);
        },
      });
      await pipeline(response, limiter, createWriteStream(destPath));

      if (received === 0) {
        throw new ImportUrlError("O link devolveu um arquivo vazio.", 502);
      }
      return { fileName, mimeType, sizeBytes: received, finalUrl: current };
    }

    throw new ImportUrlError("O link redireciona vezes demais.", 502);
  } catch (error) {
    if (error instanceof ImportUrlError) throw error;
    if (signal.aborted) {
      throw new ImportUrlError("A importação demorou demais e foi cancelada.", 502);
    }
    // Erros crus de rede podem carregar o IP/host interno — não vazam pro cliente.
    throw new ImportUrlError("Não foi possível baixar o vídeo desse link.", 502);
  }
}
