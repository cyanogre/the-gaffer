import { expressionOf, type Expression, type Kit, type Look } from '../../content/look';
import { Rng } from '../../sim/rng';
import { EXPRESSIONS, EXPRESSIVE, PN, PORTRAIT_LAYERS, type PortraitLayer } from './portraitArt';
import { bodyKey, outline, recolorMap, sexOf, sheetStore } from './sheets';

/**
 * Retratos pixel art de 48×48 para diálogos, fichas y banquillo. El arte son las PNG por capas de
 * assets/retratos/<hombre|mujer>/ (ver su README): aquí solo se apilan, se repintan con la piel,
 * el pelo y la camiseta de cada uno, se contornean y se ponen sobre un fondo con los colores del equipo.
 */
const N = PN;
function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dither = (x: number, y: number, t: number) => t * 16 > BAYER[(y & 3) * 4 + (x & 3)] + 0.5;

export interface PortraitSpec {
  look: Look;
  kit: Kit;
  traits: readonly string[];
  num: number;
  seed: number;
  /** Gesto forzado (novela visual); si no, sale de la personalidad. */
  expr?: Expression;
}

/** Qué variante de cada capa lleva esta persona (null = esa capa no la lleva). */
function variantOf(layer: PortraitLayer, look: Look, kit: Kit, seed: number): string | null {
  switch (layer) {
    case 'pelo_detras':
    case 'pelo':
      return look.hair;
    case 'camiseta':
      return kit.pattern;
    case 'cabeza':
      return bodyKey(look);
    case 'ojos':
    case 'boca':
      return 'base';
    case 'cejas':
      return look.brows;
    case 'nariz':
      return look.nose;
    case 'barba':
      return look.gender === 'f' || look.facial === 'none' ? null : look.facial;
    case 'accesorio':
      return look.accessory === 'glasses' || look.accessory === 'headband' ? look.accessory : null;
    case 'pendientes':
      return look.gender === 'f' && new Rng(seed).chance(0.5) ? 'aros' : null;
  }
}

export function pixelPortrait(spec: PortraitSpec): HTMLCanvasElement {
  const { look, kit } = spec;
  const expr = spec.expr ?? expressionOf(spec.traits);
  const sex = sexOf(look);
  const map = recolorMap(look, kit);
  const cell = new Uint32Array(N * N);
  for (const layer of PORTRAIT_LAYERS) {
    const v = variantOf(layer, look, kit, spec.seed);
    const sheet = v ? sheetStore.get(`retratos/${sex}/${layer}/${v}`) : undefined;
    if (!sheet) continue;
    const col = EXPRESSIVE.includes(layer) ? Math.max(0, EXPRESSIONS.indexOf(expr)) : 0;
    if ((col + 1) * N > sheet.width) continue;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const i = (y * sheet.width + col * N + x) * 4;
        if (sheet.data[i + 3] < 128) continue;
        const c = ((sheet.data[i] << 16) | (sheet.data[i + 1] << 8) | sheet.data[i + 2]) >>> 0;
        cell[y * N + x] = ((map.get(c) ?? c) | 0x1000000) >>> 0;
      }
  }
  outline(cell, N, N);

  // fondo con los colores del equipo
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  const bgA = mix(kit.shirt, '#1d1530', 0.55);
  const bgB = mix(kit.shirt, '#1d1530', 0.75);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let n = cell[y * N + x] & 0xffffff;
      if (!cell[y * N + x]) n = parseInt(((x + y) % 12 < 2 ? mix(bgA, '#ffffff', 0.08) : dither(x, y, y / N) ? bgB : bgA).slice(1), 16);
      const i = (y * N + x) * 4;
      img.data[i] = (n >> 16) & 255;
      img.data[i + 1] = (n >> 8) & 255;
      img.data[i + 2] = n & 255;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return cv;
}
