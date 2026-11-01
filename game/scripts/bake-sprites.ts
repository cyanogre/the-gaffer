/**
 * Hornea las hojas de sprites por capas en assets/sprites/<capa>/<variante>.png
 * a partir del generador procedimental. Úsalo para regenerar la base; después,
 * cualquier PNG se puede retocar a mano y el juego usará la versión retocada.
 *
 *   npm run bake:sprites            → solo crea las hojas que no existen
 *   npm run bake:sprites -- --force → regenera las que siguen tal cual las dejó el generador;
 *                                     las retocadas a mano se respetan (y se avisa)
 *   npm run bake:sprites -- --force --pisar-retoques → regenera todas, también las retocadas
 *
 * Para saber si una PNG está retocada se guarda la huella (sha1) de lo que generó el script
 * en assets/sprites/generadas.json.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { FIXED, FRAMES, KEY, LAYER_ORDER, SH, SW, VIEWS, bakeSheet, layerVariants } from '../src/render/pixel/sprites';

const OUT = join(process.cwd(), 'assets', 'sprites');
const force = process.argv.includes('--force');
const overwriteEdits = process.argv.includes('--pisar-retoques');
const HASHES = join(OUT, 'generadas.json');
const hashes: Record<string, string> = existsSync(HASHES) ? JSON.parse(readFileSync(HASHES, 'utf8')) : {};
const sha1 = (b: Buffer) => createHash('sha1').update(b).digest('hex');

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w: number, h: number, rgba: Uint8Array) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function toRgba(data: (string | null)[], w: number, h: number) {
  const out = new Uint8Array(w * h * 4);
  data.forEach((c, i) => {
    if (!c) return;
    const n = parseInt(c.slice(1), 16);
    out[i * 4] = (n >> 16) & 255;
    out[i * 4 + 1] = (n >> 8) & 255;
    out[i * 4 + 2] = n & 255;
    out[i * 4 + 3] = 255;
  });
  return out;
}
function write(path: string, buf: Buffer | string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
}

let made = 0;
let kept = 0;
const protectedEdits: string[] = [];
const manifest: Record<string, string[]> = {};
for (const layer of LAYER_ORDER) {
  manifest[layer] = layerVariants(layer);
  for (const variant of layerVariants(layer)) {
    const key = `${layer}/${variant}`;
    const path = join(OUT, layer, `${variant}.png`);
    if (existsSync(path)) {
      if (!force) {
        kept++;
        continue;
      }
      const current = sha1(readFileSync(path));
      if (hashes[key] !== current && !overwriteEdits) {
        // retocada a mano (o de antes de que existiera el registro): no se toca
        protectedEdits.push(key);
        kept++;
        continue;
      }
    }
    const sheet = bakeSheet(layer, variant);
    const buf = png(sheet.w, sheet.h, toRgba(sheet.data, sheet.w, sheet.h));
    write(path, buf);
    hashes[key] = sha1(buf);
    made++;
  }
}
write(HASHES, JSON.stringify(hashes, null, 1));
if (protectedEdits.length) {
  console.log(`Retocadas a mano (no se han tocado): ${protectedEdits.join(', ')}`);
  console.log('Si el generador ha añadido fotogramas nuevos, esas hojas no los tendrán: pásales los retoques a mano o usa --pisar-retoques.');
}

// Muestrario de colores clave (para pintar con la paleta correcta).
const swatches: [string, string][] = [];
for (const [name, v] of Object.entries(KEY)) {
  if (typeof v === 'string') swatches.push([name, v]);
  else for (const [t, c] of Object.entries(v)) swatches.push([`${name}.${t}`, c]);
}
for (const [name, c] of Object.entries(FIXED)) swatches.push([`fijo.${name}`, c]);
const sw = 8;
const pal = new Uint8Array(swatches.length * sw * sw * 4);
const palW = swatches.length * sw;
swatches.forEach(([, c], i) => {
  const n = parseInt(c.slice(1), 16);
  for (let y = 0; y < sw; y++)
    for (let x = 0; x < sw; x++) {
      const p = (y * palW + i * sw + x) * 4;
      pal[p] = (n >> 16) & 255;
      pal[p + 1] = (n >> 8) & 255;
      pal[p + 2] = n & 255;
      pal[p + 3] = 255;
    }
});
write(join(OUT, 'paleta-clave.png'), png(palW, sw, pal));
write(
  join(OUT, 'manifest.json'),
  JSON.stringify({ cell: { w: SW, h: SH, feetRow: SH - 1 }, columns: FRAMES, rows: VIEWS, layerOrder: LAYER_ORDER, layers: manifest, keyColors: Object.fromEntries(swatches) }, null, 2),
);
console.log(`Hojas creadas: ${made} · conservadas (ya existían): ${kept}`);
