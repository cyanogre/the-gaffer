import type { Kit, Look } from '../../content/look';
import { DIGITS, FIXED, FRAMES, KEY, LAYER_ORDER, SH, SW, VIEWS, cellUsed, torsoTop, type FrameId, type LayerId, type SheetFrame, type View } from './sprites';

/**
 * Carga las hojas de sprites editables (assets/sprites/**.png) y compone el muñeco de cada
 * jugador: capa a capa, repintando los colores clave con su piel, su pelo y su equipación.
 * Editar una PNG cambia el juego sin tocar código.
 */
const FILES = import.meta.glob('../../../assets/sprites/**/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export type FrameSet = Record<View, Partial<Record<FrameId, HTMLCanvasElement>>>;
/**
 * Lo que sale de componer a una persona: sus fotogramas, el mapa de partes (blanco = brazo o lo que
 * lleva en la mano; sirve para que el brazo pase por encima de un mueble y el cuerpo no) y su
 * cabeza dormida (de perfil, ojos cerrados) para tumbarla en una cama.
 */
export type SpriteSet = FrameSet & { parts: FrameSet; sleepHead?: HTMLCanvasElement };

/** Bits de cada píxel compuesto: 0xRRGGBB, opaco y «es brazo». */
const SOLID = 0x1000000;
const ARM = 0x2000000;

const COOL = '#2a1840';
const WARM = '#fff1d0';
function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return ((ch(16) << 16) | (ch(8) << 8) | ch(0)) >>> 0;
}
const hex = (c: string) => parseInt(c.slice(1), 16) >>> 0;

export class SheetStore {
  private sheets = new Map<string, ImageData>();
  ready = false;

  async load() {
    if (this.ready) return;
    await Promise.all(
      Object.entries(FILES).map(async ([path, url]) => {
        const m = path.match(/sprites\/([^/]+)\/([^/]+)\.png$/);
        if (!m) return;
        const img = new Image();
        img.src = url;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext('2d')!;
        g.drawImage(img, 0, 0);
        this.sheets.set(`${m[1]}/${m[2]}`, g.getImageData(0, 0, img.width, img.height));
      }),
    );
    this.ready = true;
  }

  get(layer: LayerId, variant: string) {
    return this.sheets.get(`${layer}/${variant}`);
  }

  get count() {
    return this.sheets.size;
  }
}

/** Las mujeres usan las hojas femeninas (cintura, cadera y pecho); «barriga» pasa a robusta. */
export const bodyKey = (look: Look) => (look.gender === 'f' ? `f${look.body === 'belly' ? 'stocky' : look.body}` : look.body);

export function variantFor(layer: LayerId, look: Look, kit: Kit, civil = false): string | null {
  switch (layer) {
    case 'arm_back':
    case 'arm_front':
    case 'shorts':
      return bodyKey(look);
    case 'torso':
      return `${bodyKey(look)}_${kit.pattern}`;
    case 'legs':
      return civil ? 'trousers' : look.accessory === 'socksDown' ? 'socksdown' : 'socks';
    case 'head':
      return look.nose;
    case 'facial':
      return look.facial === 'none' ? null : look.facial;
    case 'hair_back':
    case 'hair_front':
      return look.hair;
    case 'acc':
      return look.accessory === 'glasses' || look.accessory === 'headband' ? look.accessory : null;
  }
}

function recolorMap(look: Look, kit: Kit) {
  const m = new Map<number, number>();
  const ramp = (key: { l: string; b: string; s: string; d: string }, c: string) => {
    m.set(hex(key.l), mix(c, WARM, 0.32));
    m.set(hex(key.b), hex(c));
    m.set(hex(key.s), mix(c, COOL, 0.34));
    m.set(hex(key.d), mix(c, COOL, 0.58));
  };
  ramp(KEY.skin, look.skin);
  ramp(KEY.hair, look.hairColor);
  ramp(KEY.shirt, kit.shirt);
  ramp(KEY.shirt2, kit.shirt2);
  ramp(KEY.shorts, kit.shorts);
  ramp(KEY.socks, kit.socks);
  ramp(KEY.boots, look.boots);
  m.set(hex(KEY.trim), hex(kit.trim));
  m.set(hex(KEY.acc), hex(look.accColor));
  m.set(hex(KEY.lip), look.gender === 'f' ? mix(look.skin, '#b8344a', 0.5) : mix(look.skin, COOL, 0.58));
  m.set(hex(KEY.stubble), mix(look.skin, look.hairColor, 0.5));
  return m;
}

const OUT = hex(FIXED.outline);
const ROT: Partial<Record<SheetFrame, [FrameId, 1 | -1]>> = { slideU: ['slide', -1], fallU: ['fall', -1], diveU: ['dive', 1], sleepU: ['sleep', -1] };

/** `num` < 0: sin dorsal. `civil`: pantalón largo y zapatos (público, míster, personajes). */
export function composeSprites(store: SheetStore, look: Look, kit: Kit, num: number, civil = false): SpriteSet {
  const out: SpriteSet = { front: {}, back: {}, side: {}, parts: { front: {}, back: {}, side: {} } };
  const map = recolorMap(look, kit);
  const layers = LAYER_ORDER.map((l) => {
    const v = variantFor(l, look, kit, civil);
    const sheet = v ? store.get(l, v) : undefined;
    return sheet && { sheet, arm: l === 'arm_front' || l === 'arm_back' ? ARM : 0 };
  }).filter((x): x is { sheet: ImageData; arm: number } => !!x);
  const trim = hex(kit.trim === kit.shirt ? '#ffffff' : kit.trim);
  VIEWS.forEach((view, row) => {
    FRAMES.forEach((frame, col) => {
      if (!cellUsed(view, frame)) return;
      let cell: Uint32Array<ArrayBuffer> = new Uint32Array(SW * SH); // 0 = transparente, si no 0xRRGGBB | SOLID (| ARM)
      for (const { sheet, arm } of layers) {
        // hojas retocadas a mano de antes de un fotograma nuevo: más estrechas, sin esa columna
        if ((col + 1) * SW > sheet.width) continue;
        for (let y = 0; y < SH; y++)
          for (let x = 0; x < SW; x++) {
            const i = ((row * SH + y) * sheet.width + col * SW + x) * 4;
            if (sheet.data[i + 3] < 128) continue;
            const c = ((sheet.data[i] << 16) | (sheet.data[i + 1] << 8) | sheet.data[i + 2]) >>> 0;
            cell[y * SW + x] = ((map.get(c) ?? c) | SOLID | arm) >>> 0;
          }
      }
      if (view === 'back' && num >= 0) {
        const digits = String(num).split('');
        let x0 = SW / 2 - Math.floor((digits.length * 4 - 1) / 2);
        const y0 = torsoTop(view, frame) + 1;
        for (const d of digits) {
          DIGITS[d].forEach((r, ry) => r.split('').forEach((b, rx) => b === '1' && (cell[(y0 + ry) * SW + x0 + rx] = (trim | SOLID) >>> 0)));
          x0 += 4;
        }
      }
      // la altura se hace con filas (nunca escalando): críos, más bajos; adultos, ±2 filas
      let neck = NECK_ROW;
      if (look.youth) {
        cell = squash(cell, look.youth);
        neck += Math.round(Math.min(1, look.youth) * DROP_ROWS.length);
      } else if (look.height < 0.985) {
        const n = Math.min(2, Math.round((1 - look.height) * 28));
        cell = squash(cell, n / DROP_ROWS.length);
        neck += n;
      } else if (look.height > 1.015) {
        const n = Math.min(2, Math.round((look.height - 1) * 28));
        cell = stretch(cell, n);
        neck -= n;
      }
      if (frame === 'sleepU' && view === 'side') out.sleepHead = toCanvas(headOf(cell, neck));
      const rot = ROT[frame];
      if (rot) cell = rotate(cell, rot[1]);
      outline(cell);
      const id = (rot ? rot[0] : frame) as FrameId;
      out[view][id] = toCanvas(cell);
      out.parts[view][id] = partsCanvas(cell);
    });
  });
  return out;
}

/**
 * Proporciones de crío: misma cabeza, menos torso y menos pierna. Se quitan filas del abdomen y de
 * las espinillas y lo de arriba baja, así los pies siguen en el suelo.
 */
const DROP_ROWS = [23, 38, 21, 34, 41, 36, 31];
function squash(cell: Uint32Array, youth: number): Uint32Array<ArrayBuffer> {
  const n = Math.round(Math.min(1, youth) * DROP_ROWS.length);
  if (!n) return cell as Uint32Array<ArrayBuffer>;
  const drop = new Set(DROP_ROWS.slice(0, n));
  const out = new Uint32Array(SW * SH);
  let dst = SH - 1;
  for (let y = SH - 1; y >= 0; y--) {
    if (drop.has(y)) continue;
    out.set(cell.subarray(y * SW, y * SW + SW), dst * SW);
    dst--;
  }
  return out;
}

/** Fila del cuello en la celda de pie (cabeza en las filas 4-11, cuello en la 12). */
const NECK_ROW = 12;

/**
 * La cabeza sola (con el cuello), recortada a su caja: es lo que asoma de la manta en la cama.
 * Sin contorno: se le pone después de girarla al ángulo de la cama.
 */
function headOf(cell: Uint32Array, neck: number) {
  let minX = SW;
  let maxX = -1;
  let minY = SH;
  for (let y = 0; y <= neck; y++)
    for (let x = 0; x < SW; x++)
      if (cell[y * SW + x]) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
      }
  const w = Math.max(1, maxX - minX + 1);
  const h = Math.max(1, neck - minY + 1);
  const out = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = cell[(minY + y) * SW + minX + x];
  return { data: out, w, h };
}

/** Más alto: se repiten filas de espinilla y de torso y lo de arriba sube. */
const DUP_ROWS = [36, 20];
function stretch(cell: Uint32Array, n: number): Uint32Array<ArrayBuffer> {
  const dup = new Set(DUP_ROWS.slice(0, n));
  const rows: Uint32Array[] = [];
  for (let y = SH - 1; y >= 0; y--) {
    const r = cell.subarray(y * SW, y * SW + SW);
    rows.push(r);
    if (dup.has(y)) rows.push(r);
  }
  const out = new Uint32Array(SW * SH);
  for (let i = 0; i < SH; i++) out.set(rows[i], (SH - 1 - i) * SW);
  return out;
}

/** Contorno oscuro por fuera de la silueta; el contorno de un brazo es brazo (va con él por encima). */
export function outline(cell: Uint32Array, w = SW, h = SH) {
  const add: [number, number][] = [];
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : cell[y * w + x]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (cell[y * w + x]) continue;
      const n = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
      if (n.some(Boolean)) add.push([y * w + x, n.some((v) => v & ARM) ? ARM : 0]);
    }
  for (const [i, arm] of add) cell[i] = (OUT | SOLID | arm) >>> 0;
}

/** Giro de 90º exacto y apoyado en el suelo (entradas, caídas y estiradas). */
function rotate(cell: Uint32Array, dir: 1 | -1) {
  const pts: [number, number, number][] = [];
  let maxY = 0;
  let minX = SW;
  let maxX = 0;
  for (let y = 0; y < SH; y++)
    for (let x = 0; x < SW; x++) {
      const c = cell[y * SW + x];
      if (!c) continue;
      const nx = dir === 1 ? SH - 1 - y : y;
      const ny = dir === 1 ? x : SW - 1 - x;
      maxY = Math.max(maxY, ny);
      minX = Math.min(minX, nx);
      maxX = Math.max(maxX, nx);
      pts.push([nx, ny, c]);
    }
  const out = new Uint32Array(SW * SH);
  const sy = SH - 2 - maxY;
  const sx = Math.round(SW / 2 - (minX + maxX) / 2);
  for (const [x, y, c] of pts) {
    const X = x + sx;
    const Y = y + sy;
    if (X >= 0 && Y >= 0 && X < SW && Y < SH) out[Y * SW + X] = c;
  }
  return out;
}

export function toCanvas(cell: Uint32Array | { data: Uint32Array; w: number; h: number }) {
  const { data, w, h } = cell instanceof Uint32Array ? { data: cell, w: SW, h: SH } : cell;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (!v) continue;
    img.data[i * 4] = (v >> 16) & 255;
    img.data[i * 4 + 1] = (v >> 8) & 255;
    img.data[i * 4 + 2] = v & 255;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Mapa de partes de un fotograma: blanco donde hay brazo (o lo que lleva en la mano). */
function partsCanvas(cell: Uint32Array) {
  const c = document.createElement('canvas');
  c.width = SW;
  c.height = SH;
  const g = c.getContext('2d')!;
  const img = g.createImageData(SW, SH);
  for (let i = 0; i < cell.length; i++) {
    const v = cell[i] & ARM ? 255 : 0;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Píxeles de un lienzo como celda compuesta (0 = transparente). */
export function cellOf(c: HTMLCanvasElement) {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  const out = new Uint32Array(c.width * c.height);
  for (let i = 0; i < out.length; i++) if (d[i * 4 + 3] > 127) out[i] = ((d[i * 4] << 16) | (d[i * 4 + 1] << 8) | d[i * 4 + 2] | SOLID) >>> 0;
  return out;
}
