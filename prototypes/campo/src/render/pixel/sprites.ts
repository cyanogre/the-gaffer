import type { Accessory, Body, Facial, HairStyle, KitPattern, Nose } from '../../content/look';

/**
 * Generador ("bake") de las hojas de sprites por capas. No toca el DOM: produce píxeles
 * en COLORES CLAVE que el juego repinta en tiempo real (piel, pelo, equipación...).
 * Las hojas resultantes viven en assets/sprites/ y son el arte editable del juego:
 * el motor carga esas PNG, no este código.
 *
 * Rejilla de cada hoja: columnas = FRAMES (14), filas = VIEWS (3), celda 24×30, pies en la fila 29.
 */
export const SW = 24;
export const SH = 30;
export const VIEWS = ['front', 'back', 'side'] as const;
export type View = (typeof VIEWS)[number];
export const FRAMES = ['idle0', 'idle1', 'run0', 'run1', 'run2', 'run3', 'kick', 'up0', 'up1', 'out', 'ear', 'slideU', 'fallU', 'diveU'] as const;
export type SheetFrame = (typeof FRAMES)[number];
export type FrameId = Exclude<SheetFrame, 'slideU' | 'fallU' | 'diveU'> | 'slide' | 'fall' | 'dive';

/** Colores clave: rampas de 4 tonos (luz, base, sombra, oscuro) que se sustituyen al componer. */
export const KEY = {
  skin: { l: '#ffe0c0', b: '#ffc090', s: '#e09060', d: '#b06040' },
  hair: { l: '#c8a8ff', b: '#9070e0', s: '#6040b0', d: '#402080' },
  shirt: { l: '#ff8080', b: '#ff0000', s: '#c00000', d: '#800000' },
  shirt2: { l: '#80ff80', b: '#00ff00', s: '#00c000', d: '#008000' },
  shorts: { l: '#8080ff', b: '#0000ff', s: '#0000c0', d: '#000080' },
  socks: { l: '#80ffff', b: '#00ffff', s: '#00c0c0', d: '#008080' },
  boots: { l: '#ff80ff', b: '#ff00ff', s: '#c000c0', d: '#800080' },
  trim: '#ffff00',
  acc: '#ff8000',
  lip: '#ff0080',
  stubble: '#c06080',
} as const;
type Ramp = { l: string; b: string; s: string; d: string };

/** Colores fijos que NO se repintan. */
export const FIXED = { outline: '#1a1226', eye: '#1a1226', mouth: '#5a1820', frame: '#20232a', lens: '#8fd3ff' };

export type LayerId = 'arm_back' | 'hair_back' | 'legs' | 'shorts' | 'torso' | 'head' | 'facial' | 'hair_front' | 'acc' | 'arm_front';
/** Orden de pintado (de atrás adelante). */
export const LAYER_ORDER: LayerId[] = ['arm_back', 'hair_back', 'legs', 'shorts', 'torso', 'head', 'facial', 'hair_front', 'acc', 'arm_front'];

export const BODIES: Body[] = ['slim', 'normal', 'stocky', 'belly'];
export const PATTERNS: KitPattern[] = ['plain', 'stripes', 'hoops', 'half', 'sash'];
export const HAIRS: HairStyle[] = ['bald', 'buzz', 'short', 'afro', 'mohawk', 'long', 'ponytail', 'mullet', 'curly', 'combover', 'bun', 'braids', 'pixie'];
export const FACIALS: Exclude<Facial, 'none'>[] = ['mustache', 'beard', 'goatee', 'stubble'];
export const NOSES: Nose[] = ['small', 'big', 'hook'];
export const ACCS: Exclude<Accessory, 'none' | 'socksDown'>[] = ['glasses', 'headband'];

/** Variantes que existen de cada capa: una PNG por variante. */
export function layerVariants(layer: LayerId): string[] {
  switch (layer) {
    case 'arm_back':
    case 'arm_front':
    case 'shorts':
      return BODIES;
    case 'torso':
      return BODIES.flatMap((b) => PATTERNS.map((p) => `${b}_${p}`));
    case 'legs':
      return ['socks', 'socksdown'];
    case 'head':
      return NOSES;
    case 'facial':
      return FACIALS;
    case 'hair_back':
    case 'hair_front':
      return HAIRS;
    case 'acc':
      return ACCS;
  }
}

interface VariantSet {
  body: Body;
  pattern: KitPattern;
  hair: HairStyle;
  facial: Facial;
  nose: Nose;
  accessory: Accessory;
}

type Legs = 'stand' | 'liftL' | 'liftR' | 'runA' | 'runB' | 'runC' | 'runD' | 'kick';
type Arms = 'down' | 'swingL' | 'swingR' | 'up' | 'up2' | 'out' | 'ear';
interface Spec {
  view: View;
  legs: Legs;
  arms: Arms;
  bob: number;
  shout: boolean;
}

/** Qué pose corresponde a cada celda de la rejilla (las celdas sin pose quedan vacías). */
const SPECS: Partial<Record<View, Partial<Record<SheetFrame, Omit<Spec, 'view'>>>>> = {
  front: {
    idle0: { legs: 'stand', arms: 'down', bob: 0, shout: false },
    idle1: { legs: 'stand', arms: 'down', bob: 1, shout: false },
    run0: { legs: 'liftL', arms: 'swingL', bob: 0, shout: false },
    run1: { legs: 'stand', arms: 'down', bob: 1, shout: false },
    run2: { legs: 'liftR', arms: 'swingR', bob: 0, shout: false },
    run3: { legs: 'stand', arms: 'down', bob: 1, shout: false },
    up0: { legs: 'stand', arms: 'up', bob: 0, shout: true },
    up1: { legs: 'stand', arms: 'up2', bob: 1, shout: true },
    out: { legs: 'stand', arms: 'out', bob: 0, shout: true },
    ear: { legs: 'stand', arms: 'ear', bob: 0, shout: true },
  },
  back: {
    idle0: { legs: 'stand', arms: 'down', bob: 0, shout: false },
    idle1: { legs: 'stand', arms: 'down', bob: 1, shout: false },
    run0: { legs: 'liftL', arms: 'swingL', bob: 0, shout: false },
    run1: { legs: 'stand', arms: 'down', bob: 1, shout: false },
    run2: { legs: 'liftR', arms: 'swingR', bob: 0, shout: false },
    run3: { legs: 'stand', arms: 'down', bob: 1, shout: false },
  },
  side: {
    idle0: { legs: 'stand', arms: 'down', bob: 0, shout: false },
    idle1: { legs: 'stand', arms: 'down', bob: 1, shout: false },
    run0: { legs: 'runA', arms: 'swingR', bob: 0, shout: false },
    run1: { legs: 'runB', arms: 'down', bob: 1, shout: false },
    run2: { legs: 'runC', arms: 'swingL', bob: 0, shout: false },
    run3: { legs: 'runD', arms: 'down', bob: 1, shout: false },
    kick: { legs: 'kick', arms: 'out', bob: 0, shout: false },
    slideU: { legs: 'kick', arms: 'up', bob: 0, shout: false },
    fallU: { legs: 'runA', arms: 'up2', bob: 0, shout: true },
    diveU: { legs: 'stand', arms: 'up', bob: 0, shout: false },
  },
};

export function cellUsed(view: View, frame: SheetFrame) {
  return !!SPECS[view]?.[frame];
}
/** Fila donde empieza el torso en la celda: ahí se estampa el dorsal. */
export function torsoTop(view: View, frame: SheetFrame) {
  return 11 + (SPECS[view]?.[frame]?.bob ?? 0);
}

export class Px {
  data: (string | null)[];
  constructor(
    readonly w = SW,
    readonly h = SH,
  ) {
    this.data = new Array(w * h).fill(null);
  }
  set(x: number, y: number, c: string) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data[y * this.w + x] = c;
  }
  get(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.data[y * this.w + x];
  }
  rect(x0: number, y0: number, w: number, h: number, c: string) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c);
  }
  disc(cx: number, cy: number, r: number, c: string, shadeC?: string) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d = (x - cx) ** 2 + (y - cy) ** 2;
        if (d <= r * r + 0.4) this.set(x, y, shadeC && x - cx + (y - cy) > r * 0.5 ? shadeC : c);
      }
  }
  line(x0: number, y0: number, x1: number, y1: number, w: number, color: (t: number, k: number) => string) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = Math.round(x0 + (x1 - x0) * t);
      const y = Math.round(y0 + (y1 - y0) * t);
      for (let k = 0; k < w; k++) this.set(x + k, y, color(t, k));
    }
  }
}

/**
 * Dibuja una pose. Con `layer` solo pinta las partes de esa capa. Todo en colores clave.
 * Las secciones siguen el orden de LAYER_ORDER. Proporciones humanas: cabeza ≈ 1/4,5 de la
 * altura y hombros del doble de ancho que la cabeza.
 */
function figure(v: VariantSet, s: Spec, layer?: LayerId): Px {
  const g = new Px();
  const on = (id: LayerId) => !layer || layer === id;
  const K = KEY;
  const ht = 4 + s.bob; // cabeza: 6 filas
  const tt = ht + 7; // torso: 7 filas
  const st = tt + 7; // pantalón: 3 filas
  const lt = st + 3; // piernas hasta la fila 27; botas 28-29
  const cx = 12;
  const side = s.view === 'side';
  const back = s.view === 'back';
  const half = { slim: 3, normal: 4, stocky: 5, belly: 4 }[v.body];
  const tx0 = side ? cx - 2 : cx - half;
  const tx1 = side ? cx + 2 + (v.body === 'stocky' ? 1 : 0) : cx + half;
  const H: Ramp = K.hair;
  const hx0 = cx - 2;
  const hx1 = side ? cx + 3 : cx + 2;

  const shirtAt = (x: number, y: number, edge: 'l' | 'r' | null) => {
    const ix = x - tx0;
    const iy = y - tt;
    let t: Ramp = K.shirt;
    if (v.pattern === 'stripes' && ix % 2 === 1) t = K.shirt2;
    if (v.pattern === 'hoops' && iy % 2 === 1) t = K.shirt2;
    if (v.pattern === 'half' && x < cx) t = K.shirt2;
    if (v.pattern === 'sash' && ix + iy === tx1 - tx0) t = K.shirt2;
    if (edge === 'r' || y === tt + 6) return t.s;
    if (edge === 'l' && y < tt + 3) return t.l;
    return t.b;
  };

  // ── brazos: 7 filas (manga 2, antebrazo 4, mano 1)
  const armCol = (t: number, lit: boolean) => {
    const row = t * 6;
    if (row < 1.6) return lit ? K.shirt.b : K.shirt.s;
    if (row > 5.4) return lit ? K.skin.l : K.skin.b;
    return lit ? K.skin.b : K.skin.s;
  };
  const drawArm = (x: number, lit: boolean, dir: number, swing: number) => {
    const y = tt + 1;
    switch (s.arms) {
      case 'up':
        g.line(x, y, x + dir, y - 7, 2, (t) => armCol(1 - t, lit));
        break;
      case 'up2':
        g.line(x, y, x + dir * 2, y - 6, 2, (t) => armCol(1 - t, lit));
        break;
      case 'out':
        for (let i = 0; i < 7; i++) g.rect(x + dir * i, y, 1, 2, i < 2 ? (lit ? K.shirt.b : K.shirt.s) : lit ? K.skin.b : K.skin.s);
        break;
      case 'ear':
        if (lit) g.line(x, y, x - dir, y - 7, 2, (t) => armCol(1 - t, lit));
        else g.line(x, y, x, y + 6, 2, (t) => armCol(t, lit));
        break;
      default:
        g.line(x, y, x + swing, y + 6, 2, (t) => armCol(t, lit));
    }
  };
  const swingA = s.arms === 'swingL' ? 2 : s.arms === 'swingR' ? -2 : 0;
  if (on('arm_back')) {
    if (side) drawArm(cx - 1, false, 1, -swingA);
    else drawArm(tx0 - 2, true, -1, 0);
  }

  // ── pelo trasero
  if (on('hair_back')) {
    if (v.hair === 'afro') g.disc(cx, ht + 1.5, 4.6, H.b, H.s);
    if (side) {
      if (v.hair === 'long') g.rect(hx0 - 1, ht + 1, 3, 9, H.s);
      if (v.hair === 'mullet') g.rect(hx0 - 1, ht + 2, 3, 6, H.s);
      if (v.hair === 'ponytail') {
        g.set(hx0 - 1, ht + 1, K.acc);
        g.rect(hx0 - 3, ht + 1, 2, 2, H.b);
        g.rect(hx0 - 3, ht + 3, 2, 3, H.s);
      }
      if (v.hair === 'braids') {
        g.line(hx0 - 1, ht + 3, hx0 - 1, ht + 10, 1, (t) => (Math.round(t * 7) % 2 ? H.b : H.s));
        g.set(hx0 - 1, ht + 11, K.acc);
      }
      if (v.hair === 'bun') g.disc(hx0, ht - 0.5, 1.6, H.b, H.s);
    } else if (!back) {
      if (v.hair === 'long') {
        g.rect(hx0 - 1, ht + 1, 1, 9, H.s);
        g.rect(hx1 + 1, ht + 1, 1, 9, H.d);
      }
      if (v.hair === 'braids')
        for (const x of [hx0 - 1, hx1 + 1]) {
          g.line(x, ht + 2, x, ht + 10, 1, (t) => (Math.round(t * 8) % 2 ? H.b : H.s));
          g.set(x, ht + 11, K.acc);
        }
    }
  }

  // ── piernas, medias y botas
  if (on('legs')) {
    const down = v.accessory === 'socksDown';
    const leg = (x0: number, x1: number, lift: number, lit: boolean) => {
      const sk = lit ? K.skin.b : K.skin.s;
      const so = lit ? K.socks.b : K.socks.s;
      const yEnd = 27 - lift;
      const len = yEnd - lt;
      g.line(x0, lt, x1, yEnd, 2, (t, k) => {
        const y = t * len;
        const c = y < 2.5 ? sk : down ? (y > len - 1.5 ? so : sk) : so;
        if (!side && k === 1) return c === sk ? K.skin.s : K.socks.s;
        if (!down && Math.abs(y - 2.6) < 0.5) return K.trim;
        return c;
      });
      const bx = side ? x1 : x1 + (x1 < cx ? -1 : 0);
      g.rect(bx, yEnd + 1, 3, 1, lit ? K.boots.b : K.boots.s);
      g.rect(bx, yEnd + 2, 3, 1, lit ? K.boots.s : K.boots.d);
      if (side) g.set(bx + 2, yEnd + 1, K.boots.l);
    };
    if (side) {
      switch (s.legs) {
        case 'runA':
          leg(cx - 1, cx - 4, 1, false);
          leg(cx, cx + 3, 0, true);
          break;
        case 'runB':
          leg(cx - 1, cx, 0, false);
          leg(cx, cx - 1, 2, true);
          break;
        case 'runC':
          leg(cx - 1, cx + 2, 0, false);
          leg(cx, cx - 3, 1, true);
          break;
        case 'runD':
          leg(cx - 1, cx - 2, 2, false);
          leg(cx, cx + 1, 0, true);
          break;
        case 'kick':
          leg(cx - 1, cx - 1, 0, false);
          g.line(cx, lt, cx + 6, lt + 4, 2, (t) => (t < 0.3 ? K.skin.b : K.socks.b));
          g.rect(cx + 7, lt + 4, 2, 2, K.boots.b);
          break;
        default:
          leg(cx - 1, cx - 1, 0, false);
          leg(cx, cx, 0, true);
      }
    } else {
      leg(cx - 2, cx - 2, s.legs === 'liftL' ? 2 : 0, true);
      leg(cx + 1, cx + 1, s.legs === 'liftR' ? 2 : 0, !back);
    }
  }

  // ── pantalón
  if (on('shorts')) {
    for (let y = st; y < st + 3; y++)
      for (let x = tx0; x <= tx1; x++) {
        if (!side && y === st + 2 && x === cx) continue;
        g.set(x, y, x === tx1 || y === st + 2 ? K.shorts.s : K.shorts.b);
      }
    if (!side) g.set(tx1, st + 1, K.trim);
  }

  // ── torso con hombros redondeados
  if (on('torso')) {
    for (let y = tt; y < tt + 7; y++) {
      const inset = y === tt ? 1 : 0;
      for (let x = tx0 + inset; x <= tx1 - inset; x++) g.set(x, y, shirtAt(x, y, x === tx0 + inset ? 'l' : x === tx1 - inset ? 'r' : null));
    }
    if (v.body === 'belly') {
      if (side) for (let y = tt + 3; y < tt + 7; y++) g.set(tx1 + 1, y, shirtAt(tx1, y, 'r'));
      else
        for (let y = tt + 3; y < tt + 7; y++) {
          g.set(tx0 - 1, y, shirtAt(tx0, y, 'l'));
          g.set(tx1 + 1, y, shirtAt(tx1, y, 'r'));
        }
    }
    if (s.view === 'front') {
      g.set(cx, tt, K.trim);
      g.set(cx, tt + 1, K.trim);
    }
  }

  // ── cuello y cabeza (5×6 de frente, 6×6 de perfil)
  if (on('head')) {
    g.set(cx, ht + 6, K.skin.s);
    g.set(side ? cx + 1 : cx - 1, ht + 6, K.skin.s);
    for (let y = 0; y < 6; y++)
      for (let x = hx0; x <= hx1; x++) {
        if ((y === 0 || y === 5) && (x === hx0 || x === hx1)) continue;
        const shadow = side ? x === hx0 || y === 5 : x === hx1 || y === 5;
        g.set(x, ht + y, shadow ? K.skin.s : K.skin.b);
      }
    const eyeY = ht + 2;
    if (s.view === 'front') {
      g.set(hx0 - 1, eyeY, K.skin.s);
      g.set(hx1 + 1, eyeY, K.skin.s);
      g.set(cx - 1, eyeY, FIXED.eye);
      g.set(cx + 1, eyeY, FIXED.eye);
      g.set(cx, eyeY + 1, K.skin.s);
      if (v.nose === 'big') g.set(cx, eyeY + 2, K.skin.s);
      if (s.shout) g.rect(cx - 1, eyeY + 2, 3, 2, FIXED.mouth);
      else g.rect(cx - 1, eyeY + 2 + (v.nose === 'big' ? 1 : 0), 3, 1, K.lip);
    } else if (side) {
      g.set(cx, eyeY, K.skin.s);
      g.set(cx, eyeY + 1, K.skin.s);
      g.set(cx + 2, eyeY, FIXED.eye);
      const nx = hx1 + 1;
      if (v.nose === 'small') g.set(nx, eyeY + 1, K.skin.b);
      else if (v.nose === 'big') {
        g.rect(nx, eyeY + 1, 2, 1, K.skin.b);
        g.set(nx, eyeY + 2, K.skin.s);
      } else {
        g.set(nx, eyeY, K.skin.b);
        g.set(nx + 1, eyeY + 1, K.skin.b);
      }
      if (s.shout) g.rect(cx + 2, eyeY + 2, 2, 2, FIXED.mouth);
      else g.rect(cx + 2, eyeY + 2, 2, 1, K.lip);
    }
  }

  // ── vello facial
  if (on('facial')) {
    const eyeY = ht + 2;
    const fh = H.d;
    if (s.view === 'front') {
      if (v.facial === 'mustache') g.rect(cx - 1, eyeY + 2, 3, 1, fh);
      if (v.facial === 'beard')
        for (let y = eyeY + 1; y <= ht + 6; y++)
          for (let x = hx0; x <= hx1; x++) if (!(y >= eyeY + 2 && y <= eyeY + 2 + (s.shout ? 1 : 0) && x === cx) && !(y === eyeY + 1 && x > hx0 && x < hx1)) g.set(x, y, fh);
      if (v.facial === 'goatee') g.rect(cx, ht + 5, 1, 2, fh);
      if (v.facial === 'stubble') {
        g.set(cx - 1, ht + 5, K.stubble);
        g.set(cx + 1, ht + 5, K.stubble);
      }
    } else if (side) {
      if (v.facial === 'mustache') g.rect(cx + 2, eyeY + 2, 3, 1, fh);
      if (v.facial === 'beard') for (let y = eyeY + 1; y <= ht + 6; y++) for (let x = cx; x <= hx1; x++) if (!(y >= eyeY + 2 && x >= cx + 2 && y <= eyeY + 2 + (s.shout ? 1 : 0))) g.set(x, y, fh);
      if (v.facial === 'goatee') g.rect(cx + 2, ht + 5, 2, 2, fh);
      if (v.facial === 'stubble') g.set(cx + 2, ht + 5, K.stubble);
    }
  }

  // ── pelo superior
  if (on('hair_front')) {
    const crown = (rows: number, sidesTo: number) => {
      for (let y = ht - 1; y < ht - 1 + rows; y++)
        for (let x = hx0 - 1; x <= hx1 + (side ? 0 : 1); x++) {
          if (y === ht - 1 && (x <= hx0 || x >= hx1)) continue;
          if (side && y > ht && x > cx + 1) continue;
          g.set(x, y, y === ht - 1 ? H.l : x >= hx1 && !side ? H.s : H.b);
        }
      for (let y = ht; y < sidesTo; y++) {
        g.set(hx0 - 1 + (side ? 1 : 0), y, H.s);
        if (!side) g.set(hx1 + 1, y, H.d);
      }
      if (side) for (let y = ht; y < ht + 4; y++) for (let x = hx0; x < cx; x++) g.set(x, y, x === hx0 ? H.s : H.b);
    };
    switch (v.hair) {
      case 'bald':
        g.set(cx - 1, ht, K.skin.l);
        break;
      case 'buzz':
        for (let x = hx0; x <= hx1; x++) g.set(x, ht, H.s);
        if (side || back) for (let y = ht; y < ht + 4; y++) for (let x = hx0; x <= (side ? cx : hx1); x++) if ((x + y) % 2 === 0) g.set(x, y, H.s);
        break;
      case 'combover':
        for (let x = hx0; x <= hx1; x += 2) g.set(x, ht, H.b);
        g.rect(hx0 - (side ? 0 : 1), ht + 1, 1, 3, H.b);
        if (!side) g.rect(hx1 + 1, ht + 1, 1, 3, H.s);
        break;
      case 'mohawk':
        if (side) for (let x = hx0 + 1; x <= hx1; x++) g.rect(x, ht - 2 - (x % 2), 1, 2 + (x % 2), x % 2 ? H.l : H.b);
        else {
          g.rect(cx, ht - 3, 1, 4, H.b);
          g.set(cx, ht - 3, H.l);
        }
        break;
      case 'curly':
        crown(2, ht + 3);
        for (let x = hx0 - 1; x <= hx1 + 1; x += 2) g.set(x, ht - 2, H.b);
        break;
      case 'bun':
        crown(2, ht + 2);
        if (!side) g.disc(cx, ht - 2, 1.6, H.b, H.s);
        break;
      case 'pixie':
        crown(2, ht + 2);
        if (s.view === 'front') g.rect(hx0, ht + 1, 3, 1, H.b);
        if (side) g.rect(cx + 1, ht + 1, 3, 1, H.b);
        break;
      default:
        crown(2, ht + 3);
    }
    if (back) {
      const rowsBack: Record<string, number> = { long: 10, mullet: 8, braids: 5, ponytail: 5, bun: 5, afro: 6, curly: 5, short: 5, pixie: 5 };
      const rb = rowsBack[v.hair];
      if (rb) for (let y = ht; y < ht + rb; y++) for (let x = hx0 - (y < ht + 5 ? 1 : 0); x <= hx1 + (y < ht + 5 ? 1 : 0); x++) g.set(x, y, x >= hx1 || y === ht + rb - 1 ? H.s : H.b);
      if (v.hair === 'ponytail') {
        g.set(cx, ht + 2, K.acc);
        g.rect(cx, ht + 3, 1, 5, H.s);
      }
      if (v.hair === 'braids') {
        g.line(cx - 1, ht + 4, cx - 1, ht + 10, 1, (t) => (Math.round(t * 6) % 2 ? H.b : H.s));
        g.line(cx + 1, ht + 4, cx + 1, ht + 10, 1, (t) => (Math.round(t * 6) % 2 ? H.b : H.s));
      }
      if (v.hair === 'bun') g.disc(cx, ht - 1, 1.6, H.b, H.s);
    }
  }

  // ── accesorios
  if (on('acc')) {
    const eyeY = ht + 2;
    if (v.accessory === 'headband') g.rect(hx0 - (side ? 0 : 1), ht + 1, hx1 - hx0 + (side ? 1 : 3), 1, K.acc);
    if (v.accessory === 'glasses') {
      if (s.view === 'front') {
        g.rect(hx0, eyeY, 5, 1, FIXED.frame);
        g.set(cx - 1, eyeY, FIXED.lens);
        g.set(cx + 1, eyeY, FIXED.lens);
      } else if (side) {
        g.rect(cx + 1, eyeY, 3, 1, FIXED.frame);
        g.set(cx + 2, eyeY, FIXED.lens);
      }
    }
  }

  // ── brazo delantero
  if (on('arm_front')) {
    if (side) drawArm(cx, true, 1, swingA);
    else drawArm(tx1 + 1, false, 1, 0);
  }
  return g;
}

/** Variante concreta de una capa → rasgos con los que se dibuja. */
function variantSet(layer: LayerId, variant: string): VariantSet {
  const v: VariantSet = { body: 'normal', pattern: 'plain', hair: 'bald', facial: 'none', nose: 'small', accessory: 'none' };
  switch (layer) {
    case 'arm_back':
    case 'arm_front':
    case 'shorts':
      v.body = variant as Body;
      break;
    case 'torso': {
      const [b, p] = variant.split('_');
      v.body = b as Body;
      v.pattern = p as KitPattern;
      break;
    }
    case 'legs':
      v.accessory = variant === 'socksdown' ? 'socksDown' : 'none';
      break;
    case 'head':
      v.nose = variant as Nose;
      break;
    case 'facial':
      v.facial = variant as Facial;
      break;
    case 'hair_back':
    case 'hair_front':
      v.hair = variant as HairStyle;
      break;
    case 'acc':
      v.accessory = variant as Accessory;
      break;
  }
  return v;
}

/** Hoja completa (14 columnas × 3 filas) de una capa y variante, en colores clave. */
export function bakeSheet(layer: LayerId, variant: string): Px {
  const sheet = new Px(SW * FRAMES.length, SH * VIEWS.length);
  const v = variantSet(layer, variant);
  VIEWS.forEach((view, row) => {
    FRAMES.forEach((frame, col) => {
      const spec = SPECS[view]?.[frame];
      if (!spec) return;
      const cell = figure(v, { view, ...spec }, layer);
      for (let y = 0; y < SH; y++)
        for (let x = 0; x < SW; x++) {
          const c = cell.get(x, y);
          if (c) sheet.set(col * SW + x, row * SH + y, c);
        }
    });
  });
  return sheet;
}

/** Cifras 3×5 del dorsal (se estampan al componer con el color del ribete). */
export const DIGITS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '011', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
};
