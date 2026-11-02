import type { Brows, Expression, HairStyle, KitPattern, Nose } from '../../content/look';
import { ACCS, FACIALS, FIXED, HAIRS, KEY, NOSES, PATTERNS, Px, SEX_BODIES, type SexFolder } from './sprites';

/**
 * Generador ("bake") de los retratos grandes (diálogos, fichas, banquillo) por capas, en COLORES
 * CLAVE, igual que los sprites del cuerpo. No toca el DOM. Las PNG resultantes viven en
 * assets/retratos/<hombre|mujer>/<capa>/<variante>.png y son el arte editable: el juego las apila
 * y repinta piel, pelo y camiseta de cada personaje.
 *
 * Celda de 48×48. Las capas con gesto (ojos, cejas, boca) tienen una columna por gesto, en el orden
 * de EXPRESSIONS; las demás, una sola celda.
 */
export const PN = 48;
export const EXPRESSIONS: Expression[] = ['neutral', 'smug', 'angry', 'sleepy', 'nervous', 'happy', 'dreamy', 'dramatic'];

export type PortraitLayer = 'pelo_detras' | 'camiseta' | 'cabeza' | 'ojos' | 'cejas' | 'nariz' | 'boca' | 'barba' | 'pelo' | 'accesorio' | 'pendientes';
/** Orden de pintado (de atrás adelante). */
export const PORTRAIT_LAYERS: PortraitLayer[] = ['pelo_detras', 'camiseta', 'cabeza', 'ojos', 'cejas', 'nariz', 'boca', 'barba', 'pelo', 'accesorio', 'pendientes'];
/** Capas que cambian con el gesto (una columna por gesto). */
export const EXPRESSIVE: PortraitLayer[] = ['ojos', 'cejas', 'boca'];

export function portraitVariants(layer: PortraitLayer, sex: SexFolder): string[] {
  switch (layer) {
    case 'pelo_detras':
    case 'pelo':
      return HAIRS;
    case 'camiseta':
      return PATTERNS;
    case 'cabeza':
      return SEX_BODIES[sex];
    case 'ojos':
    case 'boca':
      return ['base'];
    case 'cejas':
      return ['thin', 'thick', 'uni'];
    case 'nariz':
      return NOSES;
    case 'barba':
      return sex === 'hombre' ? FACIALS : [];
    case 'accesorio':
      return ACCS;
    case 'pendientes':
      return sex === 'mujer' ? ['aros'] : [];
  }
}

const OUT = FIXED.outline;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dither = (x: number, y: number, t: number) => t * 16 > BAYER[(y & 3) * 4 + (x & 3)] + 0.5;

class Grid extends Px {
  constructor() {
    super(PN, PN);
  }
  ell(cx: number, cy: number, rx: number, ry: number, col: (x: number, y: number) => string | null) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.02) {
          const c = col(x, y);
          if (c) this.set(x, y, c);
        }
  }
  fill(x0: number, y0: number, w: number, h: number, col: string | ((x: number, y: number) => string | null)) {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        const c = typeof col === 'string' ? col : col(x, y);
        if (c) this.set(x, y, c);
      }
  }
}

/** Una celda de una capa. `body` (cabeza) y el resto de rasgos salen de la variante. */
export function drawPortraitLayer(layer: PortraitLayer, variant: string, sex: SexFolder, expr: Expression): Px {
  const g = new Grid();
  const f = sex === 'mujer';
  const sk = KEY.skin;
  const hr = KEY.hair;
  const cx = 24;
  const widthOf = (body: string) => ({ slim: 9.5, normal: 10.5, stocky: 11.5, belly: 11.5 })[body]! - (f ? 0.5 : 0);
  // pelo, barba y accesorios se dibujan para la cara normal (la cabeza cambia ±1 px)
  const wide = widthOf(layer === 'cabeza' ? variant : 'normal');
  const jawOf = (body: string) => (f ? wide * 0.72 : body === 'stocky' ? wide * 0.95 : wide * 0.82);
  const jawW = jawOf(layer === 'cabeza' ? variant : 'normal');
  const skinAt = (x: number, y: number) => {
    const t = (x - (cx + 2)) / wide;
    if (t > 0.55) return dither(x, y, (t - 0.55) * 3) ? sk.d : sk.s;
    if (t > 0.2) return dither(x, y, (t - 0.2) * 2.5) ? sk.s : sk.b;
    if (t < -0.6 && y < 20) return sk.l;
    return sk.b;
  };
  const my = 29;

  switch (layer) {
    case 'pelo_detras': {
      const hair = variant as HairStyle;
      if (hair === 'afro') g.ell(cx, 16, 17, 15, (x, y) => (x + y > cx + 24 ? hr.s : dither(x, y, 0.15) ? hr.l : hr.b));
      if (hair === 'long') {
        g.fill(cx - 15, 14, 6, 30, (x, y) => (dither(x, y, 0.3) ? hr.s : hr.b));
        g.fill(cx + 9, 14, 6, 30, (x, y) => (dither(x, y, 0.6) ? hr.d : hr.s));
      }
      if (hair === 'mullet') {
        g.fill(cx - 13, 18, 4, 18, hr.s);
        g.fill(cx + 9, 18, 4, 18, hr.d);
      }
      if (hair === 'ponytail') g.fill(cx + 11, 12, 4, 20, (x) => (x > cx + 12 ? hr.s : hr.b));
      if (hair === 'bob') {
        g.fill(cx - 15, 13, 6, 18, (x, y) => (dither(x, y, 0.3) ? hr.s : hr.b));
        g.fill(cx + 9, 13, 6, 18, (x, y) => (dither(x, y, 0.6) ? hr.d : hr.s));
      }
      if (hair === 'pigtails')
        for (const bx of [cx - 18, cx + 13]) {
          g.fill(bx, 16, 5, 16, (x, y) => (dither(x, y, 0.35) ? hr.s : x > bx + 2 ? hr.s : hr.b));
          g.fill(bx + (bx < cx ? 3 : 0), 15, 3, 2, KEY.acc);
        }
      break;
    }
    case 'camiseta': {
      const pattern = variant as KitPattern;
      const shTop = 37;
      for (let y = shTop; y < PN; y++) {
        const half = Math.min(23, 13 + (y - shTop) * 2.2);
        for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
          const ix = x - (cx - 23);
          let t: { l: string; b: string; s: string; d: string } = KEY.shirt;
          if (pattern === 'stripes' && Math.floor(ix / 4) % 2 === 1) t = KEY.shirt2;
          if (pattern === 'hoops' && Math.floor((y - shTop) / 3) % 2 === 1) t = KEY.shirt2;
          if (pattern === 'half' && x < cx) t = KEY.shirt2;
          if (pattern === 'sash' && Math.abs(x - cx - (y - shTop) + 8) < 3) t = KEY.shirt2;
          let c = t.b;
          if (x > cx + half - 5) c = dither(x, y, 0.6) ? t.d : t.s;
          else if (x < cx - half + 3) c = t.l;
          g.set(x, y, c);
        }
      }
      for (let i = 0; i < 5; i++) {
        g.set(cx - 5 + i, shTop + i, KEY.trim);
        g.set(cx + 5 - i, shTop + i, KEY.trim);
      }
      break;
    }
    case 'cabeza': {
      const shTop = 37;
      // cuello
      g.fill(cx - 4, 30, 9, 8, (x, y) => (y < 33 ? sk.d : x > cx + 1 ? sk.s : sk.b));
      for (let y = shTop; y < shTop + 4; y++) for (let x = cx - 4 + (y - shTop); x <= cx + 4 - (y - shTop); x++) g.set(x, y, x > cx + 1 ? sk.s : sk.b);
      // orejas, cabeza y mandíbula
      g.ell(cx - wide - 0.5, 22, 2.2, 3.4, () => sk.s);
      g.ell(cx + wide + 0.5, 22, 2.2, 3.4, () => sk.d);
      g.ell(cx, 19, wide, 12, skinAt);
      g.ell(cx, 26, jawW, 6.5, skinAt);
      if (variant === 'belly') g.ell(cx, 31, jawW * 0.8, 2.5, (x, y) => (dither(x, y, 0.5) ? sk.s : sk.b));
      // coloretes
      for (const [x, y] of [
        [cx - 7, 26],
        [cx - 6, 27],
        [cx + 6, 26],
        [cx + 7, 27],
      ])
        g.set(x, y, KEY.blush);
      break;
    }
    case 'ojos': {
      const eye = (ex: number) => {
        const ey = 21;
        g.fill(ex - 1, ey, 4, 2, FIXED.eyeWhite);
        let px = ex + (expr === 'dreamy' ? 1 : 0);
        const py = ey + (expr === 'dreamy' ? 0 : expr === 'sleepy' || expr === 'smug' ? 1 : 0);
        g.set(px, py, OUT);
        g.set(px + 1, py, OUT);
        if (expr !== 'nervous') {
          g.set(px, py + 1 - (py - ey), OUT);
          g.set(px + 1, py + 1 - (py - ey), FIXED.pupil);
        }
        g.set(px, py, FIXED.shine);
        if (expr === 'nervous') {
          px = ex + 1;
          g.fill(ex - 1, ey, 4, 2, FIXED.eyeWhite);
          g.set(px, ey, OUT);
        }
        // párpado
        if (expr === 'sleepy' || expr === 'smug') g.fill(ex - 1, ey, 4, 1, sk.s);
        if (expr === 'angry') {
          g.set(ex - 1, ey, sk.s);
          g.set(ex + 2, ey, sk.s);
        }
        g.fill(ex - 1, ey - 1, 4, 1, OUT);
        // pestañas
        if (f) {
          g.set(ex - 2, ey - 1, OUT);
          g.set(ex + 3, ey - 2, OUT);
        }
      };
      eye(cx - 5);
      eye(cx + 3);
      break;
    }
    case 'cejas': {
      const brows = variant as Brows;
      const browRow = { neutral: 17, smug: 16, angry: 18, sleepy: 18, nervous: 15, happy: 16, dreamy: 15, dramatic: 15 }[expr];
      const thick = brows === 'thick' || brows === 'uni' ? 2 : 1;
      const brow = (x0: number, inner: number) => {
        for (let i = 0; i < 5; i++) {
          const slope = expr === 'angry' ? (inner > 0 ? i : 4 - i) * 0.5 : expr === 'dramatic' || expr === 'nervous' ? (inner > 0 ? 4 - i : i) * 0.4 : 0;
          for (let k = 0; k < thick; k++) g.set(x0 + i, Math.round(browRow + slope) + k - (expr === 'smug' && inner < 0 ? 1 : 0), hr.d);
        }
      };
      brow(cx - 7, 1);
      brow(cx + 3, -1);
      if (brows === 'uni') g.fill(cx - 2, browRow, 5, thick, hr.d);
      break;
    }
    case 'nariz': {
      const nose = variant as Nose;
      const ny = 24;
      if (nose === 'small') {
        g.set(cx + 1, ny + 1, sk.s);
        g.set(cx, ny + 2, sk.d);
      } else if (nose === 'big') {
        g.fill(cx - 2, ny + 1, 5, 2, sk.l);
        g.fill(cx + 1, ny, 2, 3, sk.s);
        g.set(cx - 2, ny + 3, sk.d);
        g.set(cx + 2, ny + 3, sk.d);
      } else {
        for (let y = 21; y < ny + 2; y++) g.set(cx + 1, y, sk.s);
        g.set(cx + 2, ny + 1, sk.s);
        g.set(cx, ny + 3, sk.d);
        g.set(cx + 2, ny + 3, sk.d);
      }
      break;
    }
    case 'boca': {
      const lip = KEY.lip;
      switch (expr) {
        case 'smug':
          g.fill(cx - 3, my, 5, 1, lip);
          g.set(cx + 2, my - 1, lip);
          g.set(cx + 3, my - 2, lip);
          break;
        case 'angry':
          g.fill(cx - 3, my - 1, 7, 2, FIXED.eyeWhite);
          for (let x = cx - 3; x <= cx + 3; x += 2) g.set(x, my - 1, OUT);
          g.fill(cx - 3, my + 1, 7, 1, OUT);
          break;
        case 'sleepy':
          g.fill(cx - 2, my, 4, 1, lip);
          break;
        case 'nervous':
          for (let x = cx - 3; x <= cx + 3; x++) g.set(x, my - (x % 2), lip);
          g.ell(cx + 8, 12, 1.2, 2, () => FIXED.sweat);
          break;
        case 'happy':
          g.fill(cx - 4, my - 1, 9, 1, OUT);
          g.fill(cx - 3, my, 7, 2, FIXED.mouth);
          g.fill(cx - 3, my, 7, 1, FIXED.eyeWhite);
          break;
        case 'dramatic':
          g.ell(cx, my, 1.5, 1.6, () => FIXED.mouth);
          break;
        default:
          g.fill(cx - 3, my, 7, 1, lip);
          g.set(cx - 4, my - 1, lip);
          g.set(cx + 4, my - 1, lip);
      }
      break;
    }
    case 'barba': {
      if (variant === 'mustache') {
        g.fill(cx - 5, my - 2, 11, 2, (x) => (x > cx + 1 ? hr.s : hr.b));
        g.set(cx - 6, my, hr.s);
        g.set(cx + 6, my, hr.s);
      } else if (variant === 'beard') {
        g.ell(cx, 28, jawW + 1, 7, (x, y) => (y < 26 && Math.abs(x - cx) < jawW - 2 ? null : Math.abs(x - cx) <= 3 && y >= my - 1 && y <= my + 1 ? null : x > cx + 3 ? hr.s : hr.b));
      } else if (variant === 'goatee') g.ell(cx, my + 4, 2.5, 2.5, (x) => (x > cx ? hr.s : hr.b));
      else if (variant === 'stubble') g.ell(cx, 28, jawW, 6, (x, y) => (dither(x, y, 0.3) && (y > my + 1 || Math.abs(x - cx) > 4) ? KEY.stubble : null));
      break;
    }
    case 'pelo': {
      const cap = (y0: number, y1: number, sidesTo: number) => {
        g.ell(cx, 15, wide + 1.2, 11, (x, y) => (y > y1 ? null : y < y0 ? null : x > cx + 4 ? hr.s : y < y0 + 3 && dither(x, y, 0.4) ? hr.l : hr.b));
        g.fill(Math.round(cx - wide - 1), 12, 3, sidesTo - 12, hr.b);
        g.fill(Math.round(cx + wide - 1), 12, 3, sidesTo - 12, hr.s);
      };
      switch (variant as HairStyle) {
        case 'bald':
          g.fill(cx - 5, 9, 3, 1, sk.l);
          g.set(cx - 4, 10, sk.l);
          break;
        case 'buzz':
          g.ell(cx, 15, wide + 0.3, 11, (x, y) => (y > 12 ? null : dither(x, y, 0.55) ? hr.s : null));
          break;
        case 'fade':
          g.ell(cx, 15, wide + 0.4, 11, (x, y) => (y > 13 ? null : y > 10 && Math.abs(x - cx) > wide - 3 ? (dither(x, y, 0.5) ? hr.s : null) : x > cx + 4 ? hr.s : y < 7 && dither(x, y, 0.4) ? hr.l : hr.b));
          break;
        case 'quiff':
          g.ell(cx, 15, wide + 0.4, 11, (x, y) => (y > 12 ? null : x > cx + 4 ? hr.s : hr.b));
          g.ell(cx + 1, 6, 6.5, 3.5, (x, y) => (x > cx + 4 ? hr.s : dither(x, y, 0.35) ? hr.l : hr.b));
          for (const sx of [cx - wide - 1, cx + wide - 1]) g.fill(Math.round(sx), 13, 3, 4, (x, y) => (dither(x, y, 0.5) ? hr.s : null));
          break;
        case 'combover':
          for (let x = cx - 7; x <= cx + 7; x += 2) g.set(x, 9 + Math.round(Math.abs(x - cx) / 4), hr.b);
          g.fill(Math.round(cx - wide - 1), 15, 3, 7, hr.b);
          g.fill(Math.round(cx + wide - 1), 15, 3, 7, hr.s);
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
          g.fill(cx - 3, 7, 7, 1, KEY.acc);
          break;
        case 'braids':
          cap(6, 12, 18);
          for (let y = 6; y < 12; y++) g.set(cx, y, hr.d);
          for (const bx of [cx - wide - 1, cx + wide]) for (let y = 18; y < 44; y++) g.fill(Math.round(bx), y, 3, 1, (x) => ((y + Math.round(x)) % 3 === 0 ? hr.d : x > bx + 1 ? hr.s : hr.b));
          break;
        case 'pixie':
          cap(6, 13, 17);
          for (let i = 0; i < 12; i++) g.fill(cx - 8 + i, 13 + Math.round(i / 5), 1, 2 - Math.round(i / 8), i > 8 ? hr.s : hr.b);
          break;
        case 'ponytail':
          cap(6, 12, 16);
          g.fill(cx + 10, 11, 3, 2, KEY.acc);
          break;
        case 'bob':
          cap(5, 14, 30);
          for (let i = 0; i < 14; i++) g.fill(cx - 8 + i, 13, 1, 2 + (i % 3 === 0 ? 1 : 0), i > 9 ? hr.s : hr.b);
          break;
        case 'pigtails':
          cap(6, 13, 17);
          for (let i = 0; i < 12; i++) g.fill(cx - 7 + i, 13, 1, 1 + (i % 2), hr.b);
          break;
        default:
          cap(5, 13, 19);
          for (let x = cx - 8; x <= cx + 8; x += 3) g.set(x, 14, hr.b);
      }
      break;
    }
    case 'accesorio': {
      if (variant === 'headband') g.fill(Math.round(cx - wide - 1), 12, Math.round(wide * 2 + 3), 2, KEY.acc);
      if (variant === 'glasses') {
        for (const ex of [cx - 5, cx + 3]) {
          g.fill(ex - 2, 20, 6, 1, OUT);
          g.fill(ex - 2, 23, 6, 1, OUT);
          g.fill(ex - 2, 21, 1, 2, OUT);
          g.fill(ex + 3, 21, 1, 2, OUT);
          g.set(ex, 21, FIXED.lens);
        }
        g.fill(cx - 1, 21, 2, 1, OUT);
      }
      break;
    }
    case 'pendientes': {
      g.set(Math.round(cx - wide - 1), 26, FIXED.gold);
      g.set(Math.round(cx + wide + 1), 26, FIXED.goldShade);
      break;
    }
  }
  return g;
}

/** Hoja de una capa: una columna por gesto en las capas con gesto; una celda en las demás. */
export function bakePortraitSheet(layer: PortraitLayer, variant: string, sex: SexFolder): Px {
  const cols = EXPRESSIVE.includes(layer) ? EXPRESSIONS : (['neutral'] as Expression[]);
  const sheet = new Px(PN * cols.length, PN);
  cols.forEach((expr, col) => {
    const cell = drawPortraitLayer(layer, variant, sex, expr);
    for (let y = 0; y < PN; y++)
      for (let x = 0; x < PN; x++) {
        const c = cell.get(x, y);
        if (c) sheet.set(col * PN + x, y, c);
      }
  });
  return sheet;
}

