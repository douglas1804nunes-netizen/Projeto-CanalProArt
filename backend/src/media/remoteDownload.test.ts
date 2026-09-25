import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  downloadVideoFromUrl,
  ImportUrlError,
  isPublicAddress,
  validateImportUrl,
} from "./remoteDownload.js";

// Sem rede externa: as regras de segurança são testadas com funções puras e
// o download de verdade contra um servidor HTTP local (por isso o
// allowLocalNetwork, que só os testes usam).

describe("isPublicAddress", () => {
  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111"])(
    "aceita o endereço público %s",
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );

  it.each([
    "127.0.0.1",
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // metadata da nuvem
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "::ffff:127.0.0.1", // IPv4 mapeado
    "::ffff:10.0.0.1",
    "::ffff:a9fe:a9fe", // 169.254.169.254 mapeado
    "não-é-ip",
    "",
  ])("recusa o endereço interno/inválido %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it("não confunde 172.32.x.x (público) com a faixa privada 172.16/12", () => {
    expect(isPublicAddress("172.32.0.1")).toBe(true);
  });
});

describe("validateImportUrl", () => {
  it("aceita um link https público", () => {
    expect(validateImportUrl("https://cdn.exemplo.com/videos/clip.mp4?x=1").hostname).toBe(
      "cdn.exemplo.com",
    );
  });

  it.each([
    "",
    "nao-e-url",
    "ftp://exemplo.com/a.mp4",
    "file:///etc/passwd",
    "javascript:alert(1)",
  ])("recusa link inválido ou de protocolo não permitido: %s", (raw) => {
    expect(() => validateImportUrl(raw)).toThrow(ImportUrlError);
  });

  it.each([
    "https://www.youtube.com/watch?v=abc",
    "https://youtube.com/watch?v=abc",
    "https://m.youtube.com/watch?v=abc",
    "https://music.youtube.com/watch?v=abc",
    "https://youtu.be/abc",
    "https://www.youtube-nocookie.com/embed/abc",
    "https://rr1---sn-abc.googlevideo.com/videoplayback?x=1",
    "https://WWW.YOUTUBE.COM./watch?v=abc",
  ])("recusa links do YouTube com mensagem clara: %s", (raw) => {
    expect(() => validateImportUrl(raw)).toThrow(/não baixa vídeos do YouTube/);
  });

  it("não bloqueia domínios que só parecem com o do YouTube", () => {
    expect(() => validateImportUrl("https://notyoutube.com/a.mp4")).not.toThrow();
    expect(() => validateImportUrl("https://meuyoutu.be.exemplo.com/a.mp4")).not.toThrow();
  });

  it("recusa usuário e senha embutidos na URL", () => {
    expect(() => validateImportUrl("https://user:pass@exemplo.com/a.mp4")).toThrow(/usuário/);
  });

  it("recusa portas não padrão", () => {
    expect(() => validateImportUrl("https://exemplo.com:8443/a.mp4")).toThrow(/portas padrão/);
    expect(() => validateImportUrl("http://exemplo.com:22/a.mp4")).toThrow(/portas padrão/);
    // porta padrão explícita é normalizada pelo URL e continua valendo
    expect(() => validateImportUrl("https://exemplo.com:443/a.mp4")).not.toThrow();
  });

  it.each([
    "http://127.0.0.1/a.mp4",
    "http://10.0.0.1/a.mp4",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/a.mp4",
    "http://[::ffff:127.0.0.1]/a.mp4",
    "http://2130706433/a.mp4", // 127.0.0.1 em decimal
    "http://0x7f.1/a.mp4", // 127.0.0.1 em hexa
    "http://0177.0.0.1/a.mp4", // 127.0.0.1 em octal
  ])("recusa IP literal interno, inclusive disfarçado: %s", (raw) => {
    expect(() => validateImportUrl(raw)).toThrow(/não é público/);
  });
});

describe("downloadVideoFromUrl", () => {
  let server: http.Server;
  let baseUrl: string;
  let workDir: string;
  let counter = 0;

  const bigBody = Buffer.alloc(4096, 1);

  beforeAll(async () => {
    workDir = await mkdtemp(path.join(os.tmpdir(), "canalproart-import-"));

    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://local");
      switch (url.pathname) {
        case "/video.mp4":
          res.writeHead(200, { "content-type": "video/mp4" });
          res.end("conteudo-do-video");
          break;
        case "/bin/clip.mov":
          res.writeHead(200, { "content-type": "application/octet-stream" });
          res.end("bytes-mov");
          break;
        case "/bin/dados.bin":
          res.writeHead(200, { "content-type": "application/octet-stream" });
          res.end("nao-e-video");
          break;
        case "/pagina":
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          res.end("<html>player</html>");
          break;
        case "/disposition":
          res.writeHead(200, {
            "content-type": "video/webm",
            "content-disposition": 'attachment; filename="nome-do-servidor.webm"',
          });
          res.end("webm-bytes");
          break;
        case "/missing":
          res.writeHead(404).end("nada");
          break;
        case "/empty":
          res.writeHead(200, { "content-type": "video/mp4" });
          res.end();
          break;
        case "/big-declared":
          res.writeHead(200, { "content-type": "video/mp4", "content-length": bigBody.length });
          res.end(bigBody);
          break;
        case "/big-chunked":
          // sem content-length: só dá pra barrar contando os bytes
          res.writeHead(200, { "content-type": "video/mp4" });
          res.write(bigBody.subarray(0, 2048));
          res.write(bigBody.subarray(2048));
          res.end();
          break;
        case "/redirect":
          res.writeHead(302, { location: "/video.mp4" }).end();
          break;
        case "/redirect-youtube":
          res.writeHead(302, { location: "https://www.youtube.com/watch?v=abc" }).end();
          break;
        case "/redirect-no-location":
          res.writeHead(302).end();
          break;
        case "/loop":
          res.writeHead(302, { location: "/loop" }).end();
          break;
        default:
          res.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(workDir, { recursive: true, force: true });
  });

  function dest() {
    counter += 1;
    return path.join(workDir, `download-${counter}.part`);
  }

  function download(pathname: string, maxBytes = 1024 * 1024) {
    const destPath = dest();
    return {
      destPath,
      result: downloadVideoFromUrl(`${baseUrl}${pathname}`, destPath, {
        maxBytes,
        allowLocalNetwork: true,
      }),
    };
  }

  it("baixa um vídeo e grava o conteúdo no destino", async () => {
    const { destPath, result } = download("/video.mp4");
    const video = await result;

    expect(video).toMatchObject({
      fileName: "video.mp4",
      mimeType: "video/mp4",
      sizeBytes: "conteudo-do-video".length,
    });
    expect(await readFile(destPath, "utf8")).toBe("conteudo-do-video");
  });

  it("aceita tipo binário genérico quando a extensão é de vídeo", async () => {
    const { result } = download("/bin/clip.mov");
    await expect(result).resolves.toMatchObject({
      fileName: "clip.mov",
      mimeType: "video/quicktime",
    });
  });

  it("recusa tipo binário genérico sem extensão de vídeo", async () => {
    const { result } = download("/bin/dados.bin");
    await expect(result).rejects.toThrow(/não aponta para um arquivo de vídeo/);
  });

  it("recusa página HTML (player/rede social) explicando o motivo", async () => {
    const { result } = download("/pagina");
    await expect(result).rejects.toThrow(/link direto do arquivo/);
  });

  it("usa o nome do Content-Disposition quando existe", async () => {
    const { result } = download("/disposition");
    await expect(result).resolves.toMatchObject({
      fileName: "nome-do-servidor.webm",
      mimeType: "video/webm",
    });
  });

  it("devolve erro 502 quando o servidor responde 404", async () => {
    const { result } = download("/missing");
    await expect(result).rejects.toMatchObject({ statusCode: 502, message: /HTTP 404/ });
  });

  it("recusa arquivo vazio", async () => {
    const { result } = download("/empty");
    await expect(result).rejects.toThrow(/vazio/);
  });

  it("barra pelo Content-Length quando o vídeo passa do limite (413)", async () => {
    const { result } = download("/big-declared", 1000);
    await expect(result).rejects.toMatchObject({ statusCode: 413 });
  });

  it("barra contando os bytes quando o servidor não informa o tamanho (413)", async () => {
    const { result } = download("/big-chunked", 1000);
    await expect(result).rejects.toMatchObject({ statusCode: 413 });
  });

  it("segue redirecionamento", async () => {
    const { result } = download("/redirect");
    await expect(result).resolves.toMatchObject({ fileName: "video.mp4" });
  });

  it("valida o destino de cada redirecionamento (não escapa pro YouTube)", async () => {
    const { result } = download("/redirect-youtube");
    await expect(result).rejects.toThrow(/não baixa vídeos do YouTube/);
  });

  it("recusa redirecionamento sem destino e laço de redirecionamentos", async () => {
    await expect(download("/redirect-no-location").result).rejects.toThrow(
      /sem informar o destino/,
    );
    await expect(download("/loop").result).rejects.toThrow(/vezes demais/);
  });

  it("sem allowLocalNetwork, recusa conectar em localhost (o DNS resolve pra um IP interno)", async () => {
    // porta 80 padrão: passa pela validação da URL e cai na trava de IP no
    // momento da conexão — nenhuma conexão é aberta.
    await expect(
      downloadVideoFromUrl("http://localhost/video.mp4", dest(), { maxBytes: 1024 }),
    ).rejects.toThrow(/não é público/);
  });

  it("não vaza detalhes de erro de rede pro usuário", async () => {
    // porta 9 (discard) em 127.0.0.1 recusa a conexão
    const error = await downloadVideoFromUrl("http://127.0.0.1:9/a.mp4", dest(), {
      maxBytes: 1024,
      allowLocalNetwork: true,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ImportUrlError);
    expect((error as ImportUrlError).message).toBe("Não foi possível baixar o vídeo desse link.");
    expect((error as ImportUrlError).message).not.toContain("127.0.0.1");
  });
});
