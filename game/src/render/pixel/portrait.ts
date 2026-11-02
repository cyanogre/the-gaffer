import { expressionOf, type Expression, type Kit, type Look } from '../../content/look';
import { Rng } from '../../sim/rng';

/**
 * Retratos pixel art de 48×48 para fichas, banquillo y eventos. Busto frontal con sombreado
 * a varios tonos y trama ordenada; el gesto sale de la personalidad del jugador.
 */
const N = 48;
const OUT = '#1a1226';
const COOL = '#2a1840';
const WARM = '#fff1d0';

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dither = (x: number, y: number, t: number) => t * 16 > BAYER[(y & 3) * 4 + (x & 3)] + 0.5;

class Grid {
  d: (string | null)[] = new Array(N * N).fill(null);
  set(x: number, y: number, c: string) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < N && y < N) this.d[y * N + x] = c;
  }
  get(x: number, y: number) {
    return x >= 0 && y >= 0 && x < N && y < N ? this.d[y * N + x] : null;
  }
  ell(cx: number, cy: number, rx: number, ry: number, col: (x: number, y: number) => string | null) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.02) {
          const c = col(x, y);
          if (c) this.set(x, y, c);
        }
  }
  rect(x0: number, y0: number, w: number, h: number, col: string | ((x: number, y: number) => string | null)) {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        const c = typeof col === 'string' ? col : col(x, y);
        if (c) this.set(x, y, c);
      }
  }
  outline() {
    const add: number[] = [];
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        if (this.get(x, y)) continue;
        if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push(y * N + x);
      }
    for (const i of add) this.d[i] = OUT;
  }
}

export interface PortraitSpec {
  look: Look;
  kit: Kit;
  traits: readonly string[];
  num: number;
  seed: number;
  /** Gesto forzado (novela visual); si no, sale de la personalidad. */
  expr?: Expression;
}

export function pixelPortrait(spec: PortraitSpec): HTMLCanvasElement {
  const { look, kit } = spec;
  const g = new Grid();
  const rng = new Rng(spec.seed);
  const f = look.gender === 'f';
  const expr = spec.expr ?? expressionOf(spec.traits);
  const sk = { b: look.skin, s: mix(look.skin, COOL, 0.3), d: mix(look.skin, COOL, 0.5), l: mix(look.skin, WARM, 0.35) };
  const hr = { b: look.hairColor, s: mix(look.hairColor, COOL, 0.38), d: mix(look.hairColor, COOL, 0.6), l: mix(look.hairColor, WARM, 0.38) };
  const sh = { b: kit.shirt, s: mix(kit.shirt, COOL, 0.35), l: mix(kit.shirt, WARM, 0.3) };
  const cx = 24;
  const wide = { slim: 9.5, normal: 10.5, stocky: 11.5, belly: 11.5 }[look.body] - (f ? 0.5 : 0);
  const skinAt = (x: number, y: number) => {
    const t = (x - (cx + 2)) / wide;
    if (t > 0.55) return dither(x, y, (t - 0.55) * 3) ? sk.d : sk.s;
    if (t > 0.2) return dither(x, y, (t - 0.2) * 2.5) ? sk.s : sk.b;
    if (t < -0.6 && y < 20) return sk.l;
    return sk.b;
  };

  // ── pelo trasero
  if (look.hair === 'afro') g.ell(cx, 16, 17, 15, (x, y) => (x + y > cx + 24 ? hr.s : dither(x, y, 0.15) ? hr.l : hr.b));
  if (look.hair === 'long') {
    g.rect(cx - 15, 14, 6, 30, (x, y) => (dither(x, y, 0.3) ? hr.s : hr.b));
    g.rect(cx + 9, 14, 6, 30, (x, y) => (dither(x, y, 0.6) ? hr.d : hr.s));
  }
  if (look.hair === 'mullet') {
    g.rect(cx - 13, 18, 4, 18, hr.s);
    g.rect(cx + 9, 18, 4, 18, hr.d);
  }
  if (look.hair === 'ponytail') g.rect(cx + 11, 12, 4, 20, (x) => (x > cx + 12 ? hr.s : hr.b));
  if (look.hair === 'bob') {
    g.rect(cx - 15, 13, 6, 18, (x, y) => (dither(x, y, 0.3) ? hr.s : hr.b));
    g.rect(cx + 9, 13, 6, 18, (x, y) => (dither(x, y, 0.6) ? hr.d : hr.s));
  }
  if (look.hair === 'pigtails')
    for (const bx of [cx - 18, cx + 13]) {
      g.rect(bx, 16, 5, 16, (x, y) => (dither(x, y, 0.35) ? hr.s : x > bx + 2 ? hr.s : hr.b));
      g.rect(bx + (bx < cx ? 3 : 0), 15, 3, 2, look.accColor);
    }

  // ── hombros y camiseta
  const shTop = 37;
  for (let y = shTop; y < N; y++) {
    const half = Math.min(23, 13 + (y - shTop) * 2.2);
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      const ix = x - (cx - 23);
      let c = sh.b;
      if (kit.pattern === 'stripes' && Math.floor(ix / 4) % 2 === 1) c = kit.shirt2;
      if (kit.pattern === 'hoops' && Math.floor((y - shTop) / 3) % 2 === 1) c = kit.shirt2;
      if (kit.pattern === 'half' && x < cx) c = kit.shirt2;
      if (kit.pattern === 'sash' && Math.abs(x - cx - (y - shTop) + 8) < 3) c = kit.shirt2;
      if (x > cx + half - 5) c = dither(x, y, 0.6) ? mix(c, COOL, 0.4) : mix(c, COOL, 0.25);
      else if (x < cx - half + 3) c = mix(c, WARM, 0.2);
      g.set(x, y, c);
    }
  }
  // cuello de la camiseta
  for (let i = 0; i < 5; i++) {
    g.set(cx - 5 + i, shTop + i, kit.trim);
    g.set(cx + 5 - i, shTop + i, kit.trim);
  }
  // cuello
  g.rect(cx - 4, 30, 9, 8, (x, y) => (y < 33 ? sk.d : x > cx + 1 ? sk.s : sk.b));
  for (let y = shTop; y < shTop + 4; y++) for (let x = cx - 4 + (y - shTop); x <= cx + 4 - (y - shTop); x++) g.set(x, y, x > cx + 1 ? sk.s : sk.b);

  // ── orejas, cabeza y mandíbula
  g.ell(cx - wide - 0.5, 22, 2.2, 3.4, () => sk.s);
  g.ell(cx + wide + 0.5, 22, 2.2, 3.4, () => sk.d);
  g.ell(cx, 19, wide, 12, skinAt);
  const jawW = f ? wide * 0.72 : look.body === 'stocky' ? wide * 0.95 : wide * 0.82;
  g.ell(cx, 26, jawW, 6.5, skinAt);
  if (look.body === 'belly') g.ell(cx, 31, jawW * 0.8, 2.5, (x, y) => (dither(x, y, 0.5) ? sk.s : sk.b));
  // coloretes
  for (const [x, y] of [[cx - 7, 26], [cx - 6, 27], [cx + 6, 26], [cx + 7, 27]]) g.set(x, y, mix(look.skin, '#e0566a', 0.35));

  // ── ojos
  const eye = (ex: number) => {
    const ey = 21;
    g.rect(ex - 1, ey, 4, 2, '#f4f0ea');
    let px = ex + (expr === 'dreamy' ? 1 : 0);
    let py = ey + (expr === 'dreamy' ? 0 : expr === 'sleepy' || expr === 'smug' ? 1 : 0);
    g.set(px, py, OUT);
    g.set(px + 1, py, OUT);
    if (expr !== 'nervous') {
      g.set(px, py + 1 - (py - ey), OUT);
      g.set(px + 1, py + 1 - (py - ey), mix(OUT, '#ffffff', 0.15));
    }
    g.set(px, py, '#ffffff');
    if (expr === 'nervous') {
      px = ex + 1;
      g.rect(ex - 1, ey, 4, 2, '#f4f0ea');
      g.set(px, ey, OUT);
    }
    // párpado
    if (expr === 'sleepy' || expr === 'smug') g.rect(ex - 1, ey, 4, 1, sk.s);
    if (expr === 'angry') {
      g.set(ex - 1, ey, sk.s);
      g.set(ex + 2, ey, sk.s);
    }
    g.rect(ex - 1, ey - 1, 4, 1, OUT);
    if (f) {
      g.set(ex - 2, ey - 1, OUT);
      g.set(ex + 3, ey - 2, OUT);
    }
  };
  eye(cx - 5);
  eye(cx + 3);

  // ── cejas
  const browRow = { neutral: 17, smug: 16, angry: 18, sleepy: 18, nervous: 15, happy: 16, dreamy: 15, dramatic: 15 }[expr];
  const thick = look.brows === 'thick' || look.brows === 'uni' ? 2 : 1;
  const brow = (x0: number, inner: number) => {
    for (let i = 0; i < 5; i++) {
      const slope = expr === 'angry' ? (inner > 0 ? i : 4 - i) * 0.5 : expr === 'dramatic' || expr === 'nervous' ? (inner > 0 ? 4 - i : i) * 0.4 : 0;
      for (let k = 0; k < thick; k++) g.set(x0 + i, Math.round(browRow + slope) + k - (expr === 'smug' && inner < 0 ? 1 : 0), hr.d);
    }
  };
  brow(cx - 7, 1);
  brow(cx + 3, -1);
  if (look.brows === 'uni') g.rect(cx - 2, browRow, 5, thick, hr.d);

  // ── nariz
  const ny = 24;
  if (look.nose === 'small') {
    g.set(cx + 1, ny + 1, sk.s);
    g.set(cx, ny + 2, sk.d);
  } else if (look.nose === 'big') {
    g.rect(cx - 2, ny + 1, 5, 2, sk.l);
    g.rect(cx + 1, ny, 2, 3, sk.s);
    g.set(cx - 2, ny + 3, sk.d);
    g.set(cx + 2, ny + 3, sk.d);
  } else {
    for (let y = 21; y < ny + 2; y++) g.set(cx + 1, y, sk.s);
    g.set(cx + 2, ny + 1, sk.s);
    g.set(cx, ny + 3, sk.d);
    g.set(cx + 2, ny + 3, sk.d);
  }

  // ── boca según el gesto
  const my = 29;
  const lip = f ? mix(look.skin, '#b8344a', 0.55) : sk.d;
  switch (expr) {
    case 'smug':
      g.rect(cx - 3, my, 5, 1, lip);
      g.set(cx + 2, my - 1, lip);
      g.set(cx + 3, my - 2, lip);
      break;
    case 'angry':
      g.rect(cx - 3, my - 1, 7, 2, '#f4f0ea');
      for (let x = cx - 3; x <= cx + 3; x += 2) g.set(x, my - 1, OUT);
      g.rect(cx - 3, my + 1, 7, 1, OUT);
      break;
    case 'sleepy':
      g.rect(cx - 2, my, 4, 1, lip);
      break;
    case 'nervous':
      for (let x = cx - 3; x <= cx + 3; x++) g.set(x, my - (x % 2), lip);
      g.ell(cx + 8, 12, 1.2, 2, () => '#9fd8ff');
      break;
    case 'happy':
      g.rect(cx - 4, my - 1, 9, 1, OUT);
      g.rect(cx - 3, my, 7, 2, '#5a1820');
      g.rect(cx - 3, my, 7, 1, '#f4f0ea');
      break;
    case 'dramatic':
      g.ell(cx, my, 1.5, 1.6, () => '#5a1820');
      break;
    default:
      g.rect(cx - 3, my, 7, 1, lip);
      g.set(cx - 4, my - 1, lip);
      g.set(cx + 4, my - 1, lip);
  }

  // ── vello facial
  if (look.facial === 'mustache') {
    g.rect(cx - 5, my - 2, 11, 2, (x) => (x > cx + 1 ? hr.s : hr.b));
    g.set(cx - 6, my, hr.s);
    g.set(cx + 6, my, hr.s);
  } else if (look.facial === 'beard') {
    g.ell(cx, 28, jawW + 1, 7, (x, y) => (y < 26 && Math.abs(x - cx) < jawW - 2 ? null : Math.abs(x - cx) <= 3 && y >= my - 1 && y <= my + 1 ? null : x > cx + 3 ? hr.s : hr.b));
  } else if (look.facial === 'goatee') g.ell(cx, my + 4, 2.5, 2.5, (x) => (x > cx ? hr.s : hr.b));
  else if (look.facial === 'stubble') g.ell(cx, 28, jawW, 6, (x, y) => (dither(x, y, 0.3) && (y > my + 1 || Math.abs(x - cx) > 4) ? mix(look.skin, look.hairColor, 0.45) : null));

  // ── pelo superior
  const cap = (y0: number, y1: number, sidesTo: number) => {
    g.ell(cx, 15, wide + 1.2, 11, (x, y) => (y > y1 ? null : y < y0 ? null : x > cx + 4 ? hr.s : y < y0 + 3 && dither(x, y, 0.4) ? hr.l : hr.b));
    g.rect(Math.round(cx - wide - 1), 12, 3, sidesTo - 12, hr.b);
    g.rect(Math.round(cx + wide - 1), 12, 3, sidesTo - 12, hr.s);
  };
  switch (look.hair) {
    case 'bald':
      g.rect(cx - 5, 9, 3, 1, sk.l);
      g.set(cx - 4, 10, sk.l);
      break;
    case 'buzz':
      g.ell(cx, 15, wide + 0.3, 11, (x, y) => (y > 12 ? null : dither(x, y, 0.55) ? hr.s : null));
      break;
    case 'fade':
      // arriba corto, lados degradados
      g.ell(cx, 15, wide + 0.4, 11, (x, y) => (y > 13 ? null : y > 10 && Math.abs(x - cx) > wide - 3 ? (dither(x, y, 0.5) ? hr.s : null) : x > cx + 4 ? hr.s : y < 7 && dither(x, y, 0.4) ? hr.l : hr.b));
      break;
    case 'quiff':
      g.ell(cx, 15, wide + 0.4, 11, (x, y) => (y > 12 ? null : x > cx + 4 ? hr.s : hr.b));
      g.ell(cx + 1, 6, 6.5, 3.5, (x, y) => (x > cx + 4 ? hr.s : dither(x, y, 0.35) ? hr.l : hr.b));
      for (const sx of [cx - wide - 1, cx + wide - 1]) g.rect(Math.round(sx), 13, 3, 4, (x, y) => (dither(x, y, 0.5) ? hr.s : null));
      break;
    case 'combover':
      for (let x = cx - 7; x <= cx + 7; x += 2) g.set(x, 9 + Math.round(Math.abs(x - cx) / 4), hr.b);
      g.rect(Math.round(cx - wide - 1), 15, 3, 7, hr.b);
      g.rect(Math.round(cx + wide - 1), 15, 3, 7, hr.s);
      break;
    case 'mohawk':
      g.ell(cx, 15, wide + 0.3, 11, (x, y) => (y > 12 ? null : dither(x, y, 0.4) ? hr.d : null));
      for (let y = 1; y < 13; y++) for (let x = cx - 3; x <= cx + 3; x++) if (y > 6 - Math.abs(x - cx) * 1.5 - (x % 2) * 2) g.set(x, y, x > cx ? hr.s : y < 5 ? hr.l : hr.b);
      break;
    case 'afro':
      cap(3, 12, 18);
      break;
    case 'curly':
      cap(5, 12, 18);
      for (let i = 0; i < 9; i++) g.ell(cx - 10 + i * 2.5, 6 + (i % 2) * 1.5, 2.2, 2.2, (x) => (x > cx + 4 ? hr.s : hr.b));
      break;
    case 'bun':
      cap(6, 12, 16);
      g.ell(cx, 4, 4.5, 3.8, (x, y) => (x > cx + 1 ? hr.s : dither(x, y, 0.3) ? hr.l : hr.b));
      g.rect(cx - 3, 7, 7, 1, look.accColor);
      break;
    case 'braids':
      cap(6, 12, 18);
      for (let y = 6; y < 12; y++) g.set(cx, y, hr.d);
      for (const bx of [cx - wide - 1, cx + wide]) for (let y = 18; y < 44; y++) g.rect(Math.round(bx), y, 3, 1, (x) => ((y + Math.round(x)) % 3 === 0 ? hr.d : x > bx + 1 ? hr.s : hr.b));
      break;
    case 'pixie':
      cap(6, 13, 17);
      for (let i = 0; i < 12; i++) g.rect(cx - 8 + i, 13 + Math.round(i / 5), 1, 2 - Math.round(i / 8), i > 8 ? hr.s : hr.b);
      break;
    case 'ponytail':
      cap(6, 12, 16);
      g.rect(cx + 10, 11, 3, 2, look.accColor);
      break;
    case 'bob':
      cap(5, 14, 30);
      for (let i = 0; i < 14; i++) g.rect(cx - 8 + i, 13, 1, 2 + (i % 3 === 0 ? 1 : 0), i > 9 ? hr.s : hr.b);
      break;
    case 'pigtails':
      cap(6, 13, 17);
      for (let i = 0; i < 12; i++) g.rect(cx - 7 + i, 13, 1, 1 + (i % 2), hr.b);
      break;
    default:
      cap(5, 13, 19);
      for (let x = cx - 8; x <= cx + 8; x += 3) g.set(x, 14, hr.b);
  }

  // ── accesorios
  if (look.accessory === 'headband') g.rect(Math.round(cx - wide - 1), 12, Math.round(wide * 2 + 3), 2, (x) => (x > cx + 5 ? mix(look.accColor, COOL, 0.3) : look.accColor));
  if (look.accessory === 'glasses') {
    for (const ex of [cx - 5, cx + 3]) {
      g.rect(ex - 2, 20, 6, 1, OUT);
      g.rect(ex - 2, 23, 6, 1, OUT);
      g.rect(ex - 2, 21, 1, 2, OUT);
      g.rect(ex + 3, 21, 1, 2, OUT);
      g.set(ex, 21, '#bfe6ff');
    }
    g.rect(cx - 1, 21, 2, 1, OUT);
  }
  if (f && rng.chance(0.5)) {
    g.set(Math.round(cx - wide - 1), 26, '#f2c230');
    g.set(Math.round(cx + wide + 1), 26, '#d8a21a');
  }
  g.outline();

  // ── composición sobre fondo con los colores del equipo
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  const bgA = mix(kit.shirt, '#1d1530', 0.55);
  const bgB = mix(kit.shirt, '#1d1530', 0.75);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let c = g.get(x, y);
      if (!c) c = (x + y) % 12 < 2 ? mix(bgA, '#ffffff', 0.08) : dither(x, y, y / N) ? bgB : bgA;
      const n = parseInt(c.slice(1), 16);
      const i = (y * N + x) * 4;
      img.data[i] = (n >> 16) & 255;
      img.data[i + 1] = (n >> 8) & 255;
      img.data[i + 2] = n & 255;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return cv;
}
