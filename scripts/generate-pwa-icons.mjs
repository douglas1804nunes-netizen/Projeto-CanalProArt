// Gera os ícones PNG do PWA em frontend/public/icons sem dependências
// externas (só zlib do Node). Rode de novo se mudar o desenho:
//   node scripts/generate-pwa-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const outDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "frontend",
  "public",
  "icons",
);

// Fundo em gradiente diagonal (mesma marca do Logo do app): violeta -> magenta -> ciano.
const STOPS = [
  [0, [109, 93, 252]],
  [0.55, [192, 92, 240]],
  [1, [34, 211, 238]],
];
function background(x, y) {
  const t = (x + y) / 2;
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i];
    const [t0, c0] = STOPS[i - 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      return c0.map((v, n) => Math.round(v + (c1[n] - v) * k));
    }
  }
  return STOPS[STOPS.length - 1][1];
}
const FG = [255, 255, 255];
const ACCENT = [251, 191, 36]; // âmbar
const SUPERSAMPLE = 4;

// Coordenadas normalizadas (0..1). `scale` encolhe o desenho em direção ao
// centro — o ícone "maskable" precisa caber na zona segura de 80%.
function shade(x, y, { rounded, scale }) {
  if (rounded) {
    const r = 0.22;
    const cx = Math.min(Math.max(x, r), 1 - r);
    const cy = Math.min(Math.max(y, r), 1 - r);
    if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) return null; // fora: transparente
  }
  const u = 0.5 + (x - 0.5) / scale;
  const v = 0.5 + (y - 0.5) / scale;

  // Triângulo de "play".
  const ax = 0.36,
    ay = 0.28,
    bx = 0.36,
    by = 0.72,
    px = 0.74,
    py = 0.5;
  const sign = (x1, y1, x2, y2, x3, y3) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
  const d1 = sign(u, v, ax, ay, bx, by);
  const d2 = sign(u, v, bx, by, px, py);
  const d3 = sign(u, v, px, py, ax, ay);
  const inTriangle = !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  if (inTriangle) return FG;

  // Ponto de destaque ("trend") no canto superior direito.
  if ((u - 0.76) ** 2 + (v - 0.26) ** 2 < 0.07 ** 2) return ACCENT;
  return background(x, y);
}

function render(size, opts) {
  const rgba = Buffer.alloc(size * size * 4);
  const n = SUPERSAMPLE * SUPERSAMPLE;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const c = shade(
            (px + (sx + 0.5) / SUPERSAMPLE) / size,
            (py + (sy + 0.5) / SUPERSAMPLE) / size,
            opts,
          );
          if (c) {
            r += c[0];
            g += c[1];
            b += c[2];
            a++;
          }
        }
      }
      const i = (py * size + px) * 4;
      rgba[i] = a ? Math.round(r / a) : 0;
      rgba[i + 1] = a ? Math.round(g / a) : 0;
      rgba[i + 2] = a ? Math.round(b / a) : 0;
      rgba[i + 3] = Math.round((a / n) * 255);
    }
  }
  return encodePng(size, size, rgba);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filtro: nenhum
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(outDir, { recursive: true });
const icons = [
  ["icon-192.png", 192, { rounded: true, scale: 1 }],
  ["icon-512.png", 512, { rounded: true, scale: 1 }],
  ["maskable-512.png", 512, { rounded: false, scale: 0.8 }],
  ["apple-touch-icon.png", 180, { rounded: false, scale: 0.9 }],
  ["favicon-32.png", 32, { rounded: true, scale: 1 }],
];
for (const [name, size, opts] of icons) {
  writeFileSync(path.join(outDir, name), render(size, opts));
  console.log(`gerado ${name}`);
}
