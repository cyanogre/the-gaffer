import type { Kit, Look } from '../../content/look';
import { DIGITS, FIXED, FRAMES, KEY, LAYER_ORDER, SH, SW, VIEWS, cellUsed, torsoTop, type FrameId, type LayerId, type SheetFrame, type View } from './sprites';

/**
 * Carga las hojas de sprites editables (assets/sprites/**.png) y compone el muñeco de cada
 * jugador: capa a capa, repintando los colores clave con su piel, su pelo y su equipación.
 * Editar una PNG cambia el juego sin tocar código.
 */
const FILES = import.meta.glob('../../../assets/sprites/**/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export type SpriteSet = Record<View, Partial<Record<FrameId, HTMLCanvasElement>>>;

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

/** La complexión "normal" femenina usa el patrón de hombros estrechos. */
export const bodyKey = (look: Look) => (look.gender === 'f' && look.body === 'normal' ? 'slim' : look.body);

export function variantFor(layer: LayerId, look: Look, kit: Kit): string | null {
  switch (layer) {
    case 'arm_back':
    case 'arm_front':
    case 'shorts':
      return bodyKey(look);
    case 'torso':
      return `${bodyKey(look)}_${kit.pattern}`;
    case 'legs':
      return look.accessory === 'socksDown' ? 'socksdown' : 'socks';
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
const ROT: Partial<Record<SheetFrame, [FrameId, 1 | -1]>> = { slideU: ['slide', -1], fallU: ['fall', -1], diveU: ['dive', 1] };

export function composeSprites(store: SheetStore, look: Look, kit: Kit, num: number): SpriteSet {
  const out: SpriteSet = { front: {}, back: {}, side: {} };
  const map = recolorMap(look, kit);
  const layers = LAYER_ORDER.map((l) => {
    const v = variantFor(l, look, kit);
    return v ? store.get(l, v) : undefined;
  }).filter((x): x is ImageData => !!x);
  const trim = hex(kit.trim === kit.shirt ? '#ffffff' : kit.trim);
  VIEWS.forEach((view, row) => {
    FRAMES.forEach((frame, col) => {
      if (!cellUsed(view, frame)) return;
      let cell = new Uint32Array(SW * SH); // 0 = transparente, si no 0xRRGGBB | 1<<24
      for (const sheet of layers) {
        for (let y = 0; y < SH; y++)
          for (let x = 0; x < SW; x++) {
            const i = ((row * SH + y) * sheet.width + col * SW + x) * 4;
            if (sheet.data[i + 3] < 128) continue;
            const c = ((sheet.data[i] << 16) | (sheet.data[i + 1] << 8) | sheet.data[i + 2]) >>> 0;
            cell[y * SW + x] = ((map.get(c) ?? c) | 0x1000000) >>> 0;
          }
      }
      if (view === 'back') {
        const digits = String(num).split('');
        let x0 = 12 - Math.floor((digits.length * 4 - 1) / 2);
        const y0 = torsoTop(view, frame) + 1;
        for (const d of digits) {
          DIGITS[d].forEach((r, ry) => r.split('').forEach((b, rx) => b === '1' && (cell[(y0 + ry) * SW + x0 + rx] = (trim | 0x1000000) >>> 0)));
          x0 += 4;
        }
      }
      const rot = ROT[frame];
      if (rot) cell = rotate(cell, rot[1]);
      outline(cell);
      const id = (rot ? rot[0] : frame) as FrameId;
      out[view][id] = toCanvas(cell);
    });
  });
  return out;
}

function outline(cell: Uint32Array) {
  const add: number[] = [];
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= SW || y >= SH ? 0 : cell[y * SW + x]);
  for (let y = 0; y < SH; y++)
    for (let x = 0; x < SW; x++) {
      if (cell[y * SW + x]) continue;
      if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) add.push(y * SW + x);
    }
  for (const i of add) cell[i] = (OUT | 0x1000000) >>> 0;
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

function toCanvas(cell: Uint32Array) {
  const c = document.createElement('canvas');
  c.width = SW;
  c.height = SH;
  const g = c.getContext('2d')!;
  const img = g.createImageData(SW, SH);
  for (let i = 0; i < cell.length; i++) {
    const v = cell[i];
    if (!v) continue;
    img.data[i * 4] = (v >> 16) & 255;
    img.data[i * 4 + 1] = (v >> 8) & 255;
    img.data[i * 4 + 2] = v & 255;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
