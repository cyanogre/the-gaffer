import { ARM_POSES, LEG_POSES, project } from './skeleton';
import type { Accessory, Body, Facial, HairStyle, KitPattern, Nose } from '../../content/look';

/**
 * Generador ("bake") de las hojas de sprites por capas. No toca el DOM: produce píxeles
 * en COLORES CLAVE que el juego repinta en tiempo real (piel, pelo, equipación...).
 * Las hojas resultantes viven en assets/sprites/ y son el arte editable del juego:
 * el motor carga esas PNG, no este código.
 *
 * Rejilla de cada hoja: columnas = FRAMES, filas = VIEWS (3), celda 48×48, pies en la fila 47.
 */
export const SW = 48;
export const SH = 48;
export const VIEWS = ['front', 'back', 'side'] as const;
export type View = (typeof VIEWS)[number];
export const FRAMES = ['idle0', 'idle1', 'run0', 'run1', 'run2', 'run3', 'kick', 'up0', 'up1', 'out', 'ear', 'slideU', 'fallU', 'diveU', 'poke', 'head', 'push', 'kneel', 'throw', 'catch', 'sit', 'point', 'talk', 'sleepU', 'wipe0', 'wipe1', 'eat', 'table', 'play', 'eatSit'] as const;
export type SheetFrame = (typeof FRAMES)[number];
export type FrameId = Exclude<SheetFrame, 'slideU' | 'fallU' | 'diveU' | 'sleepU'> | 'slide' | 'fall' | 'dive' | 'sleep';

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
  blush: '#ff4060',
} as const;
type Ramp = { l: string; b: string; s: string; d: string };

/** Colores fijos que NO se repintan. */
export const FIXED = {
  outline: '#1a1226',
  eye: '#1a1226',
  mouth: '#5a1820',
  frame: '#20232a',
  lens: '#8fd3ff',
  // lo que llevan en la mano: trapo de la barra, bocadillo y ficha de dominó
  cloth: '#eef2f4',
  clothShade: '#9fb4c2',
  bread: '#e3a95c',
  crust: '#a8642a',
  filling: '#c8402a',
  tile: '#f6f4ee',
  pip: '#1a1226',
  // retratos: blanco del ojo, brillo, pupila, gota de sudor y pendientes
  eyeWhite: '#f4f0ea',
  shine: '#ffffff',
  pupil: '#3c3546',
  sweat: '#9fd8ff',
  gold: '#f2c230',
  goldShade: '#d8a21a',
};

/** Carpeta de cada sexo: todo el arte (cuerpo y retratos) va separado para hombres y para mujeres. */
export type SexFolder = 'hombre' | 'mujer';
export const SEXES: SexFolder[] = ['hombre', 'mujer'];

export type LayerId = 'arm_back' | 'hair_back' | 'legs' | 'shorts' | 'torso' | 'head' | 'facial' | 'hair_front' | 'acc' | 'arm_front';
/** Orden de pintado (de atrás adelante). */
export const LAYER_ORDER: LayerId[] = ['arm_back', 'hair_back', 'legs', 'shorts', 'torso', 'head', 'facial', 'hair_front', 'acc', 'arm_front'];

/** Complexiones de las hojas: las masculinas y las femeninas (cintura, cadera y pecho). */
export type SpriteBody = Body | 'fslim' | 'fnormal' | 'fstocky';
export const PATTERNS: KitPattern[] = ['plain', 'stripes', 'hoops', 'half', 'sash'];
export const HAIRS: HairStyle[] = ['bald', 'buzz', 'short', 'afro', 'mohawk', 'long', 'ponytail', 'mullet', 'curly', 'combover', 'bun', 'braids', 'pixie', 'bob', 'pigtails', 'fade', 'quiff'];
export const FACIALS: Exclude<Facial, 'none'>[] = ['mustache', 'beard', 'goatee', 'stubble'];
export const NOSES: Nose[] = ['small', 'big', 'hook'];
export const ACCS: Exclude<Accessory, 'none' | 'socksDown'>[] = ['glasses', 'headband'];

/** Complexiones de cada sexo (las de mujer, con cintura, cadera y pecho). */
export const SEX_BODIES: Record<SexFolder, string[]> = { hombre: ['slim', 'normal', 'stocky', 'belly'], mujer: ['slim', 'normal', 'stocky'] };

/** Variantes que existen de cada capa y sexo: una PNG por variante. */
export function layerVariants(layer: LayerId, sex: SexFolder): string[] {
  switch (layer) {
    case 'arm_back':
    case 'arm_front':
    case 'shorts':
      return SEX_BODIES[sex];
    case 'torso':
      return SEX_BODIES[sex].flatMap((b) => PATTERNS.map((p) => `${b}_${p}`));
    case 'legs':
      return ['socks', 'socksdown', 'trousers'];
    case 'head':
      return NOSES;
    case 'facial':
      return sex === 'hombre' ? FACIALS : [];
    case 'hair_back':
    case 'hair_front':
      return HAIRS;
    case 'acc':
      return ACCS;
  }
}

interface VariantSet {
  trousers?: boolean;
  body: SpriteBody;
  pattern: KitPattern;
  hair: HairStyle;
  facial: Facial;
  nose: Nose;
  accessory: Accessory;
}

type Legs = 'stand' | 'sit' | 'pass' | 'liftL' | 'liftR' | 'runA' | 'runB' | 'runC' | 'runD' | 'kick' | 'jump' | 'lunge' | 'brace' | 'kneel' | 'slide' | 'fall';
type Arms = 'down' | 'lap' | 'point' | 'talk' | 'wipeA' | 'wipeB' | 'eat' | 'table' | 'play' | 'mid' | 'swingL' | 'swingR' | 'up' | 'up2' | 'out' | 'ear' | 'jump' | 'shove' | 'throw' | 'catch' | 'slide' | 'kneel' | 'balance';
interface Spec {
  view: View;
  legs: Legs;
  arms: Arms;
  bob: number;
  shout: boolean;
  /** Ojos cerrados (durmiendo). */
  closed?: boolean;
  /** Lo que lleva en la mano cercana (capa del brazo delantero: se tapa y destapa con él). */
  tool?: 'cloth' | 'bread' | 'tile';
}

/** Qué pose corresponde a cada celda de la rejilla (las celdas sin pose quedan vacías). */
const SPECS: Partial<Record<View, Partial<Record<SheetFrame, Omit<Spec, 'view'>>>>> = {
  front: {
    idle0: { legs: 'stand', arms: 'down', bob: 0, shout: false },
    idle1: { legs: 'stand', arms: 'down', bob: 1, shout: false },
    // al correr, cada brazo va al revés que su pierna; en el paso, rodillas y codos doblados
    run0: { legs: 'liftL', arms: 'swingR', bob: 0, shout: false },
    run1: { legs: 'pass', arms: 'mid', bob: 1, shout: false },
    run2: { legs: 'liftR', arms: 'swingL', bob: 0, shout: false },
    run3: { legs: 'pass', arms: 'mid', bob: 1, shout: false },
    up0: { legs: 'stand', arms: 'up', bob: 0, shout: true },
    up1: { legs: 'stand', arms: 'up2', bob: 1, shout: true },
    out: { legs: 'stand', arms: 'out', bob: 0, shout: true },
    ear: { legs: 'stand', arms: 'ear', bob: 0, shout: true },
    head: { legs: 'jump', arms: 'jump', bob: 0, shout: false },
    kneel: { legs: 'kneel', arms: 'kneel', bob: 7, shout: false },
    throw: { legs: 'stand', arms: 'throw', bob: 0, shout: false },
    catch: { legs: 'stand', arms: 'catch', bob: 0, shout: false },
    // actividades del míster (se ven mientras pasan, como en Punch Club o Los Sims)
    sit: { legs: 'sit', arms: 'lap', bob: 6, shout: false },
    point: { legs: 'stand', arms: 'point', bob: 0, shout: true },
    talk: { legs: 'stand', arms: 'talk', bob: 0, shout: true },
    // usando los muebles: limpiar la barra con el trapo, comer, sentado a la mesa (y jugando)
    wipe0: { legs: 'stand', arms: 'wipeA', bob: 1, shout: false, tool: 'cloth' },
    wipe1: { legs: 'stand', arms: 'wipeB', bob: 1, shout: false, tool: 'cloth' },
    eat: { legs: 'stand', arms: 'eat', bob: 0, shout: false, tool: 'bread' },
    table: { legs: 'sit', arms: 'table', bob: 6, shout: false },
    play: { legs: 'sit', arms: 'play', bob: 6, shout: true, tool: 'tile' },
    eatSit: { legs: 'sit', arms: 'eat', bob: 6, shout: false, tool: 'bread' },
  },
  back: {
    idle0: { legs: 'stand', arms: 'down', bob: 0, shout: false },
    idle1: { legs: 'stand', arms: 'down', bob: 1, shout: false },
    // al correr, cada brazo va al revés que su pierna; en el paso, rodillas y codos doblados
    run0: { legs: 'liftL', arms: 'swingR', bob: 0, shout: false },
    run1: { legs: 'pass', arms: 'mid', bob: 1, shout: false },
    run2: { legs: 'liftR', arms: 'swingL', bob: 0, shout: false },
    run3: { legs: 'pass', arms: 'mid', bob: 1, shout: false },
    head: { legs: 'jump', arms: 'jump', bob: 0, shout: false },
    kneel: { legs: 'kneel', arms: 'kneel', bob: 7, shout: false },
    throw: { legs: 'stand', arms: 'throw', bob: 0, shout: false },
    sit: { legs: 'sit', arms: 'lap', bob: 6, shout: false },
    point: { legs: 'stand', arms: 'point', bob: 0, shout: false },
    talk: { legs: 'stand', arms: 'talk', bob: 0, shout: false },
    table: { legs: 'sit', arms: 'table', bob: 6, shout: false },
    play: { legs: 'sit', arms: 'play', bob: 6, shout: false },
  },
  side: {
    idle0: { legs: 'stand', arms: 'down', bob: 0, shout: false },
    idle1: { legs: 'stand', arms: 'down', bob: 1, shout: false },
    run0: { legs: 'runA', arms: 'swingL', bob: 0, shout: false },
    run1: { legs: 'runB', arms: 'mid', bob: 1, shout: false },
    run2: { legs: 'runC', arms: 'swingR', bob: 0, shout: false },
    run3: { legs: 'runD', arms: 'mid', bob: 1, shout: false },
    kick: { legs: 'kick', arms: 'balance', bob: 0, shout: false },
    // se dibujan de pie y el juego las tumba 90º al componer
    slideU: { legs: 'slide', arms: 'slide', bob: 0, shout: false },
    fallU: { legs: 'fall', arms: 'up2', bob: 0, shout: true },
    diveU: { legs: 'stand', arms: 'up', bob: 0, shout: false },
    poke: { legs: 'lunge', arms: 'balance', bob: 1, shout: false },
    head: { legs: 'jump', arms: 'jump', bob: 0, shout: false },
    push: { legs: 'brace', arms: 'shove', bob: 1, shout: true },
    kneel: { legs: 'kneel', arms: 'kneel', bob: 7, shout: false },
    throw: { legs: 'stand', arms: 'throw', bob: 0, shout: false },
    catch: { legs: 'stand', arms: 'catch', bob: 0, shout: false },
    sit: { legs: 'sit', arms: 'lap', bob: 6, shout: false },
    point: { legs: 'stand', arms: 'point', bob: 0, shout: false },
    talk: { legs: 'stand', arms: 'talk', bob: 0, shout: true },
    // durmiendo boca arriba: se dibuja de pie y el juego la tumba (con almohada y manta)
    sleepU: { legs: 'stand', arms: 'down', bob: 0, shout: false, closed: true },
    wipe0: { legs: 'stand', arms: 'wipeA', bob: 1, shout: false, tool: 'cloth' },
    wipe1: { legs: 'stand', arms: 'wipeB', bob: 1, shout: false, tool: 'cloth' },
    eat: { legs: 'stand', arms: 'eat', bob: 0, shout: false, tool: 'bread' },
    table: { legs: 'sit', arms: 'table', bob: 6, shout: false },
    play: { legs: 'sit', arms: 'play', bob: 6, shout: true, tool: 'tile' },
    eatSit: { legs: 'sit', arms: 'eat', bob: 6, shout: false, tool: 'bread' },
  },
};

export function cellUsed(view: View, frame: SheetFrame) {
  return !!SPECS[view]?.[frame];
}
/** Fila donde empieza el torso en la celda: ahí se estampa el dorsal. */
export function torsoTop(view: View, frame: SheetFrame) {
  return 14 + (SPECS[view]?.[frame]?.bob ?? 0);
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
  /** Segmento grueso centrado: el grosor va en horizontal si baja, en vertical si va de lado. */
  limb(x0: number, y0: number, x1: number, y1: number, w: number, color: (t: number, k: number) => string) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
    const steep = Math.abs(dy) >= Math.abs(dx);
    const off = Math.floor(w / 2);
    for (let i = 0; i <= Math.ceil(n); i++) {
      const t = Math.min(1, i / n);
      const x = Math.round(x0 + dx * t);
      const y = Math.round(y0 + dy * t);
      for (let k = 0; k < w; k++) {
        if (steep) this.set(x + k - off, y, color(t, k));
        else this.set(x, y + k - off, color(t, k));
      }
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
 * Las secciones siguen el orden de LAYER_ORDER.
 *
 * Anatomía (celda 48×48, pies en la fila 47, figura de ≈46 px): cabeza de 8 filas (≈1/6 de la
 * altura), cuello, hombros que se estrechan hacia la cintura, piernas largas de 3 px con rodilla,
 * manos de 2×2 y botas con suela. Luz desde arriba a la izquierda.
 */
function figure(v: VariantSet, s: Spec, layer?: LayerId): Px {
  const g = new Px();
  const on = (id: LayerId) => !layer || layer === id;
  const K = KEY;
  const H: Ramp = K.hair;
  const cx = 24;
  const ht = 4 + s.bob; // cabeza: filas ht..ht+7
  const tt = ht + 9; // torso: 12 filas
  const st = tt + 12; // pantalón: 5 filas
  const lt = st + 5; // piernas hasta la fila 44; botas 45-47
  const side = s.view === 'side';
  const back = s.view === 'back';
  const front = s.view === 'front';
  const B = {
    slim: { sh: 4, waist: 3, arm: 2, hip: 3 },
    normal: { sh: 5, waist: 4, arm: 2, hip: 4 },
    stocky: { sh: 6, waist: 5, arm: 3, hip: 5 },
    belly: { sh: 5, waist: 5, arm: 2, hip: 5 },
    fslim: { sh: 4, waist: 2, arm: 2, hip: 5 },
    fnormal: { sh: 4, waist: 2, arm: 2, hip: 5 },
    fstocky: { sh: 5, waist: 3, arm: 2, hip: 6 },
  }[v.body];
  const fem = v.body[0] === 'f';
  // cabeza
  const hx0 = side ? cx - 3 : cx - 3;
  const hx1 = side ? cx + 4 : cx + 3;
  // ancho del torso en cada fila (frente/espalda) o perfil
  const torsoSpan = (row: number): [number, number] => {
    if (fem) {
      // silueta femenina: hombros, pecho, cintura marcada y cadera
      if (side) {
        const chest = row === 2 || row === 6 ? 1 : row >= 3 && row <= 5 ? 2 : 0;
        if (row >= 7 && row <= 9) return [cx - 2, cx + 2];
        return [row >= 10 ? cx - 3 : cx - 3, cx + 3 + chest - (row >= 10 ? 1 : 0)];
      }
      if (row === 0) return [cx - B.sh + 1, cx + B.sh - 1];
      if (row <= 5) return [cx - B.sh, cx + B.sh];
      // cintura estrecha y cadera que se abre hacia el pantalón
      if (row === 6) return [cx - B.sh + 1, cx + B.sh - 1];
      if (row <= 8) return [cx - B.waist, cx + B.waist];
      if (row === 9) return [cx - B.waist - 1, cx + B.waist + 1];
      return [cx - B.hip + 1, cx + B.hip - 1];
    }
    if (side) {
      const chest = row >= 2 && row <= 6 ? 1 : 0;
      const belly = v.body === 'belly' && row >= 6 ? (row >= 8 ? 2 : 1) : 0;
      const back0 = v.body === 'stocky' ? cx - 4 : cx - 3;
      return [back0, cx + 3 + Math.max(chest, belly)];
    }
    if (row === 0) return [cx - B.sh + 1, cx + B.sh - 1];
    if (row <= 5) return [cx - B.sh, cx + B.sh];
    const k = (row - 5) / 6;
    let half = Math.round(B.sh + (B.waist - B.sh) * k);
    if (v.body === 'belly' && row >= 6) half = B.sh + (row >= 8 ? 1 : 0);
    return [cx - half, cx + half];
  };

  // ── brazos con codo (brazo 5 px + antebrazo y mano 5 px), posados con el esqueleto de referencia
  const ARM_U = 5;
  const ARM_F = 5;
  const armColor = (d: number, lit: boolean, k: number) => {
    if (v.trousers && d < 4.5) return lit ? K.shirt.b : K.shirt.s; // manga larga de calle
    if (d < 3.2) return lit ? (k === 0 ? K.shirt.l : K.shirt.b) : K.shirt.s;
    if (d < 4.2) return K.trim;
    if (d > 8.4) return lit ? K.skin.l : K.skin.b; // mano
    if (d > 4.6 && d < 5.6) return K.skin.s; // pliegue del codo
    return lit ? K.skin.b : K.skin.s;
  };
  const [sx0, sx1] = torsoSpan(1);
  const armPair = ARM_POSES[s.arms] ?? ARM_POSES.down;
  const drawArm = (i: 0 | 1, lit: boolean) => {
    const w = B.arm;
    const root = side ? { x: i === 0 ? cx - 1 : cx, y: tt + 1 } : { x: i === 0 ? sx0 - Math.ceil(w / 2) : sx1 + 1 + Math.floor(w / 2), y: tt + 1 };
    const sideSign = i === 0 ? -1 : 1;
    const { mid, end } = project(s.view, root, armPair[i], sideSign, ARM_U, ARM_F);
    g.limb(root.x, root.y, mid.x, mid.y, w, (t, k) => armColor(t * ARM_U, lit, k));
    g.limb(mid.x, mid.y, end.x, end.y, w, (t, k) => armColor(ARM_U + t * ARM_F, lit, k));
    // codo: sombra en la articulación (y su punta hacia fuera)
    g.set(mid.x, mid.y, lit ? K.skin.s : K.skin.d);
    if (!side) g.set(mid.x + (i === 0 ? -1 : 1) * (w > 2 ? 1 : 0), mid.y + 1, K.skin.d);
    if (i === 1 && s.tool) drawTool(Math.round(end.x), Math.round(end.y));
  };
  // lo que lleva en la mano, pegado a ella (va en la capa del brazo: pasa por encima de la barra con él)
  const drawTool = (x: number, y: number) => {
    const F = FIXED;
    if (s.tool === 'cloth') {
      // trapo arrugado bajo la mano, con su sombra
      g.rect(x - 2, y, 4, 2, F.cloth);
      g.rect(x - 2, y + 1, 4, 1, F.clothShade);
      g.set(x + 1, y - 1, F.cloth);
    } else if (s.tool === 'bread') {
      // bocadillo camino de la boca: pan, corteza y algo de relleno
      const x0 = side ? x - 1 : x - 3;
      g.rect(x0, y - 2, 4, 1, F.bread);
      g.rect(x0, y - 1, 4, 1, F.filling);
      g.rect(x0, y, 4, 1, F.crust);
    } else if (s.tool === 'tile') {
      g.rect(x - 1, y - 3, 2, 3, F.tile);
      g.set(x - 1, y - 2, F.pip);
    }
  };
  if (on('arm_back')) {
    if (side) drawArm(0, false);
    else drawArm(0, true);
  }

  // ── pelo trasero
  if (on('hair_back')) {
    if (v.hair === 'afro') g.disc(cx, ht + 2, 6.5, H.b, H.s);
    if (side) {
      if (v.hair === 'long') {
        g.rect(hx0 - 1, ht + 2, 4, 12, H.s);
        g.rect(hx0, ht + 3, 1, 9, H.b);
      }
      if (v.hair === 'mullet') g.rect(hx0 - 1, ht + 3, 4, 8, H.s);
      if (v.hair === 'ponytail') {
        g.set(hx0 - 1, ht + 2, K.acc);
        g.rect(hx0 - 4, ht + 1, 3, 3, H.b);
        g.rect(hx0 - 4, ht + 4, 2, 6, H.s);
        g.set(hx0 - 4, ht + 2, H.l);
      }
      if (v.hair === 'braids') {
        g.line(hx0 - 1, ht + 4, hx0 - 2, ht + 15, 2, (t) => (Math.round(t * 10) % 2 ? H.b : H.s));
        g.rect(hx0 - 2, ht + 16, 2, 1, K.acc);
      }
      if (v.hair === 'bun') g.disc(hx0, ht - 1, 2.4, H.b, H.s);
      if (v.hair === 'pigtails') {
        g.set(hx0 - 1, ht + 2, K.acc);
        g.rect(hx0 - 3, ht + 2, 2, 7, H.s);
        g.set(hx0 - 3, ht + 3, H.b);
      }
    } else if (front) {
      if (v.hair === 'pigtails')
        for (const x of [hx0 - 3, hx1 + 2]) {
          g.set(x + (x < cx ? 2 : -1), ht + 2, K.acc);
          g.rect(x, ht + 2, 2, 7, x < cx ? H.b : H.s);
          g.set(x + (x < cx ? 0 : 1), ht + 8, H.d);
        }
      if (v.hair === 'long') {
        g.rect(hx0 - 2, ht + 2, 2, 13, H.s);
        g.rect(hx1 + 1, ht + 2, 2, 13, H.d);
      }
      if (v.hair === 'braids')
        for (const x of [hx0 - 2, hx1 + 1]) {
          g.line(x, ht + 4, x, ht + 16, 2, (t) => (Math.round(t * 12) % 2 ? H.b : H.s));
          g.rect(x, ht + 17, 2, 1, K.acc);
        }
    }
  }

  // ── piernas con rodilla (muslo 7 px, espinilla 7 px), medias y botas
  if (on('legs')) {
    const down = v.accessory === 'socksDown';
    const T = 7;
    const legPair = LEG_POSES[s.legs] ?? LEG_POSES.stand;
    const roots = side ? [{ x: cx - 1, y: lt }, { x: cx + 1, y: lt }] : [{ x: cx - 3, y: lt }, { x: cx + 2, y: lt }];
    // la espinilla se estira o encoge un poco para que el pie de apoyo pise el suelo (fila 44)
    const base = [0, 1].map((i) => project(s.view, roots[i], legPair[i], i === 0 ? -1 : 1, T, 7));
    const lowest = base[0].end.y > base[1].end.y ? 0 : 1;
    const shinDy = (base[lowest].end.y - base[lowest].mid.y) / 7;
    const S = Math.max(5, Math.min(10, 7 + (44 - base[lowest].end.y) / Math.max(0.4, shinDy)));
    const legColor = (d: number, lit: boolean, k: number) => {
      const shade = k === 2 || !lit;
      if (v.trousers) return Math.abs(d - T) < 0.6 ? K.shorts.s : shade ? K.shorts.s : K.shorts.b;
      if (d < T - 0.6) return shade ? K.skin.s : K.skin.b; // muslo
      if (d < T + 0.6) return k < 2 ? K.skin.l : K.skin.b; // rótula
      if (d < T + 1.4) return K.skin.d; // sombra bajo la rótula
      if (down) {
        if (d > T + S - 3) return shade ? K.socks.s : K.socks.b;
        if (d > T + S - 3.8) return K.trim;
        return shade ? K.skin.s : K.skin.b;
      }
      if (d < T + 2.4) return K.trim; // borde de la media
      const c = shade ? K.socks.s : K.socks.b;
      return k === 0 && lit && c === K.socks.b ? K.socks.l : c;
    };
    const drawLeg = (i: 0 | 1, lit: boolean) => {
      const root = roots[i];
      const { mid, end } = project(s.view, root, legPair[i], i === 0 ? -1 : 1, T, S);
      g.limb(root.x, root.y, mid.x, mid.y, 3, (t, k) => legColor(t * T, lit, k));
      g.limb(mid.x, mid.y, end.x, end.y, 3, (t, k) => legColor(T + t * S, lit, k));
      // bota: de perfil, punta hacia delante (o hacia abajo si el pie va levantado detrás)
      const fx = Math.round(end.x);
      const fy = Math.round(end.y);
      if (side) {
        if (legPair[i].lower[0] < -45) {
          g.rect(fx - 2, fy, 3, 3, lit ? K.boots.b : K.boots.s);
          g.rect(fx - 3, fy, 1, 3, K.boots.d);
        } else {
          g.rect(fx - 1, fy + 1, 5, 2, lit ? K.boots.b : K.boots.s);
          g.rect(fx, fy + 1, 2, 1, K.boots.l);
          g.rect(fx - 1, fy + 3, 5, 1, K.boots.d);
        }
      } else {
        const bx = fx - 2 + (i === 0 ? 0 : 1);
        g.rect(bx, fy + 1, 4, 2, lit ? K.boots.b : K.boots.s);
        g.set(bx + 1, fy + 1, K.boots.l);
        g.rect(bx, fy + 3, 4, 1, K.boots.d);
      }
    };
    if (side) {
      drawLeg(0, false);
      drawLeg(1, true);
    } else {
      drawLeg(0, true);
      drawLeg(1, !back);
    }
  }

  // ── pantalón con franja lateral
  if (on('shorts')) {
    const [w0, w1] = torsoSpan(11);
    const x0 = side ? cx - 3 : fem ? cx - B.hip : w0;
    const x1 = side ? cx + 3 : fem ? cx + B.hip - 1 : w1;
    for (let y = st; y < st + 5; y++)
      // cadera: de frente se abre un píxel más a cada lado; de perfil, el glúteo
      for (let x = x0 - (fem && (side || y === st + 1 || y === st + 2) && y < st + 3 ? 1 : 0); x <= x1 + (fem && !side && (y === st + 1 || y === st + 2) ? 1 : 0); x++) {
        if (!side && y >= st + 3 && (x === cx || x === cx - 1)) continue;
        let c: string = x >= x1 - 1 || y === st + 4 ? K.shorts.s : K.shorts.b;
        if (x === x0 && y < st + 2) c = K.shorts.l;
        if (!side && (x === x0 || x === x1) && y < st + 4) c = K.trim;
        if (side && x === cx && y < st + 4) c = K.trim;
        g.set(x, y, c);
      }
  }

  // ── camiseta: cuello en pico, escudo, pliegues y sombreado
  if (on('torso')) {
    for (let r = 0; r < 12; r++) {
      const [a, b] = torsoSpan(r);
      const y = tt + r;
      for (let x = a; x <= b; x++) {
        const ix = x - a;
        let t: Ramp = K.shirt;
        if (v.pattern === 'stripes' && Math.floor((x - cx + 20) / 2) % 2 === 1) t = K.shirt2;
        if (v.pattern === 'hoops' && Math.floor(r / 2) % 2 === 1) t = K.shirt2;
        if (v.pattern === 'half' && x < cx) t = K.shirt2;
        if (v.pattern === 'sash' && Math.abs(x - cx - (r - 6)) <= 1) t = K.shirt2;
        let c: string = t.b;
        if (x >= b - 1 || r >= 10) c = t.s;
        if (x === b && r >= 10) c = t.d;
        if (ix === 0 && r < 5) c = t.l;
        g.set(x, y, c);
      }
    }
    // pecho: luz arriba y sombra debajo (frente); en perfil ya lo marca la silueta
    if (fem && front) {
      // dos volúmenes: brillo arriba, sombra debajo y en el canal
      for (const dx of [-3, -2, 2, 3]) g.set(cx + dx, tt + 3, K.shirt.l);
      for (const dx of [-3, -2, 2, 3]) g.set(cx + dx, tt + 4, K.shirt.b);
      for (const dx of [-3, -2, 2, 3]) g.set(cx + dx, tt + 5, K.shirt.d);
      g.set(cx, tt + 3, K.shirt.s);
      g.set(cx, tt + 4, K.shirt.s);
    }
    if (fem && back) {
      g.set(cx - B.waist, tt + 8, K.shirt.s);
      g.set(cx + B.waist, tt + 8, K.shirt.s);
    }
    if (fem && side) {
      g.set(cx + 4, tt + 3, K.shirt.l);
      g.rect(cx + 3, tt + 6, 2, 1, K.shirt.s);
    }
    // pliegue bajo el pecho
    if (!side && !fem) {
      g.set(cx - 2, tt + 7, K.shirt.s);
      g.set(cx - 1, tt + 8, K.shirt.s);
      g.set(cx + 2, tt + 7, K.shirt.s);
    }
    if (front) {
      g.set(cx - 1, tt, K.trim);
      g.set(cx + 1, tt, K.trim);
      g.set(cx, tt, K.skin.s);
      g.set(cx, tt + 1, K.trim);
      g.rect(cx + 2, tt + 3, 2, 2, K.trim); // escudo
    }
    if (back) g.rect(cx - 1, tt, 3, 1, K.trim);
    if (side) g.rect(cx + 1, tt, 2, 1, K.trim);
  }

  // ── cuello y cabeza
  if (on('head')) {
    g.rect(cx - 1, ht + 8, 3, 1, K.skin.s);
    for (let y = 0; y < 8; y++)
      for (let x = hx0; x <= hx1; x++) {
        const round = (y === 0 || y === 7) && (x === hx0 || x === hx1);
        const jaw = y === 7 && (x === hx0 + 1 || x === hx1 - 1) && !side;
        if (round || jaw) continue;
        const shade = side ? x === hx0 || y >= 6 : x === hx1 || y === 7;
        g.set(x, ht + y, shade ? K.skin.s : x === hx0 + 1 && y < 3 && !side ? K.skin.l : K.skin.b);
      }
    const ey = ht + 3;
    if (front) {
      g.rect(hx0 - 1, ey, 1, 2, K.skin.s);
      g.rect(hx1 + 1, ey, 1, 2, K.skin.d);
      g.set(cx - 2, ey, FIXED.eye);
      g.set(cx + 2, ey, FIXED.eye);
      g.set(cx - 1, ey, K.skin.l);
      g.set(cx, ey + 1, K.skin.s);
      if (v.nose === 'big') {
        g.set(cx, ey + 2, K.skin.s);
        g.set(cx + 1, ey + 2, K.skin.d);
      } else if (v.nose === 'hook') g.set(cx + 1, ey + 1, K.skin.d);
      if (s.shout) {
        g.rect(cx - 1, ey + 3, 3, 2, FIXED.mouth);
        g.rect(cx - 1, ey + 3, 3, 1, '#f4f0ea');
      } else g.rect(cx - 1, ey + 3, 3, 1, K.lip);
    } else if (side) {
      g.rect(cx, ey, 1, 2, K.skin.s);
      g.set(cx, ey + 1, K.skin.d);
      if (s.closed) g.rect(cx + 2, ey, 2, 1, K.skin.d);
      else g.set(cx + 3, ey, FIXED.eye);
      const nx = hx1 + 1;
      if (v.nose === 'small') g.set(nx, ey + 1, K.skin.b);
      else if (v.nose === 'big') {
        g.rect(nx, ey + 1, 2, 2, K.skin.b);
        g.set(nx + 1, ey + 2, K.skin.s);
      } else {
        g.set(nx, ey, K.skin.b);
        g.rect(nx, ey + 1, 2, 1, K.skin.b);
        g.set(nx, ey + 2, K.skin.s);
      }
      if (s.shout) g.rect(cx + 3, ey + 3, 2, 2, FIXED.mouth);
      else g.rect(cx + 3, ey + 3, 2, 1, K.lip);
    } else {
      g.rect(hx0 - 1, ey, 1, 2, K.skin.s);
      g.rect(hx1 + 1, ey, 1, 2, K.skin.s);
    }
  }

  // ── vello facial
  if (on('facial')) {
    const ey = ht + 3;
    const fh = H.d;
    if (front) {
      if (v.facial === 'mustache') {
        g.rect(cx - 2, ey + 2, 5, 1, fh);
        g.set(cx - 2, ey + 3, fh);
        g.set(cx + 2, ey + 3, fh);
      }
      if (v.facial === 'beard')
        for (let y = ey + 1; y <= ht + 8; y++)
          for (let x = hx0; x <= hx1; x++) {
            const mouth = y === ey + 3 && Math.abs(x - cx) <= 1;
            const cheek = y === ey + 1 && x > hx0 && x < hx1;
            if (!mouth && !cheek && !(y === ht + 8 && (x === hx0 || x === hx1))) g.set(x, y, x === hx1 ? H.d : fh);
          }
      if (v.facial === 'goatee') g.rect(cx - 1, ey + 4, 3, 2, fh);
      if (v.facial === 'stubble') for (let x = hx0 + 1; x <= hx1 - 1; x += 2) g.set(x, ey + 4, K.stubble);
    } else if (side) {
      if (v.facial === 'mustache') g.rect(cx + 3, ey + 2, 3, 1, fh);
      if (v.facial === 'beard') for (let y = ey + 1; y <= ht + 8; y++) for (let x = cx; x <= hx1; x++) if (!(y === ey + 3 && x >= cx + 3)) g.set(x, y, fh);
      if (v.facial === 'goatee') g.rect(cx + 3, ey + 4, 2, 2, fh);
      if (v.facial === 'stubble') g.set(cx + 2, ey + 4, K.stubble);
    }
  }

  // ── pelo superior (con volumen y brillo)
  if (on('hair_front')) {
    const crown = (sidesTo: number, fringe: boolean) => {
      for (let x = hx0; x <= hx1; x++) g.set(x, ht - 2, x === hx0 || x === hx1 ? H.s : H.l);
      for (let x = hx0 - 1; x <= hx1 + 1; x++) g.set(x, ht - 1, x === hx1 + 1 ? H.s : H.b);
      for (let x = hx0 - 1; x <= hx1 + 1; x++) {
        if (side && x > cx + 1) continue;
        g.set(x, ht, x >= hx1 ? H.s : H.b);
      }
      if (fringe && !back) for (let x = side ? cx - 1 : hx0; x <= (side ? cx + 3 : cx + 1); x++) g.set(x, ht + 1, H.b);
      for (let y = ht + 1; y < sidesTo; y++) {
        g.set(side ? hx0 : hx0 - 1, y, H.s);
        if (!side) g.set(hx1 + 1, y, H.d);
      }
      if (side) for (let y = ht; y < ht + 5; y++) for (let x = hx0; x < cx; x++) g.set(x, y, x === hx0 ? H.s : y === ht ? H.l : H.b);
    };
    switch (v.hair) {
      case 'bald':
        g.rect(hx0 + 1, ht, 2, 1, K.skin.l);
        break;
      case 'buzz':
        for (let x = hx0; x <= hx1; x++) {
          g.set(x, ht - 1, H.s);
          if ((x + ht) % 2) g.set(x, ht, H.s);
        }
        if (side || back) for (let y = ht; y < ht + 5; y++) for (let x = hx0; x <= (side ? cx : hx1); x++) if ((x + y) % 2 === 0) g.set(x, y, H.s);
        break;
      case 'combover':
        for (let x = hx0; x <= hx1; x += 2) g.set(x, ht - 1, H.b);
        for (let x = hx0 + 1; x <= hx1; x += 2) g.set(x, ht, H.b);
        g.rect(side ? hx0 : hx0 - 1, ht + 2, 1, 4, H.b);
        if (!side) g.rect(hx1 + 1, ht + 2, 1, 4, H.s);
        break;
      case 'mohawk':
        if (side) for (let x = hx0 + 1; x <= hx1; x++) g.rect(x, ht - 4 + (x % 2), 1, 4 - (x % 2), x % 2 ? H.b : H.l);
        else {
          g.rect(cx - 1, ht - 4, 3, 5, H.b);
          g.rect(cx, ht - 5, 1, 2, H.l);
        }
        for (let x = hx0; x <= hx1; x++) if (Math.abs(x - cx) > 1 && x % 2) g.set(x, ht, H.d);
        break;
      case 'curly':
        crown(ht + 4, false);
        for (let x = hx0 - 1; x <= hx1 + 1; x += 2) g.set(x, ht - 3, H.b);
        g.set(hx0 - 2, ht, H.b);
        if (!side) g.set(hx1 + 2, ht, H.s);
        break;
      case 'bun':
        crown(ht + 2, false);
        if (!side) {
          g.disc(cx, ht - 4, 2.4, H.b, H.s);
          g.rect(cx - 2, ht - 2, 5, 1, K.acc);
        }
        break;
      case 'pixie':
        crown(ht + 3, true);
        if (front) g.rect(hx0, ht + 2, 2, 1, H.b);
        break;
      case 'bob':
        // media melena a la altura de la mandíbula, con flequillo
        crown(ht + 7, true);
        if (front) {
          g.rect(hx0 - 1, ht + 1, 2, 7, H.b);
          g.rect(hx1, ht + 1, 2, 7, H.s);
          g.set(hx0 - 1, ht + 7, H.s);
          g.set(hx1 + 1, ht + 7, H.d);
        } else if (side) for (let y = ht; y < ht + 8; y++) for (let x = hx0 - 1; x < cx; x++) g.set(x, y, x === hx0 - 1 || y === ht + 7 ? H.s : y === ht ? H.l : H.b);
        break;
      case 'pigtails':
        crown(ht + 3, true);
        break;
      case 'short':
        crown(ht + 4, true);
        break;
      case 'fade':
        // degradado: arriba corto con algo de volumen, los lados casi al cero
        for (let x = hx0; x <= hx1; x++) g.set(x, ht - 2, x === hx1 ? H.s : H.l);
        for (let x = hx0; x <= hx1; x++) g.set(x, ht - 1, x === hx1 ? H.s : H.b);
        for (let x = hx0 + 1; x <= hx1 - (side ? 0 : 1); x++) g.set(x, ht, H.b);
        for (let y = ht; y < ht + 3; y++) {
          g.set(side ? hx0 : hx0 - 1, y, (y & 1) === 0 ? H.s : K.skin.s);
          if (!side) g.set(hx1 + 1, y, (y & 1) === 0 ? H.d : K.skin.d);
        }
        if (side) for (let y = ht; y < ht + 4; y++) for (let x = hx0; x < cx; x++) if ((x + y) % 2 === 0) g.set(x, y, H.s);
        break;
      case 'quiff':
        // tupé: volumen hacia arriba y hacia delante, lados cortos
        for (let x = hx0; x <= hx1; x++) g.set(x, ht - 1, x === hx1 ? H.s : H.b);
        for (let x = hx0; x <= hx1; x++) g.set(x, ht, x >= hx1 ? H.s : H.b);
        if (side) g.rect(cx, ht - 3, hx1 - cx + 2, 2, H.l);
        else {
          g.rect(cx - 2, ht - 3, 5, 2, H.b);
          g.rect(cx - 1, ht - 3, 2, 1, H.l);
        }
        for (let y = ht + 1; y < ht + 3; y++) {
          g.set(side ? hx0 : hx0 - 1, y, H.s);
          if (!side) g.set(hx1 + 1, y, H.d);
        }
        if (side) for (let y = ht; y < ht + 4; y++) for (let x = hx0; x < cx; x++) g.set(x, y, x === hx0 ? H.s : H.b);
        break;
      default:
        crown(ht + 4, false);
    }
    if (back) {
      const rowsBack: Record<string, number> = { long: 14, mullet: 11, braids: 7, ponytail: 7, bun: 7, afro: 8, curly: 7, short: 6, pixie: 6, bob: 8, pigtails: 6, fade: 4, quiff: 5 };
      const rb = rowsBack[v.hair];
      if (rb)
        for (let y = ht; y < ht + rb; y++)
          for (let x = hx0 - (y < ht + 7 ? 1 : 0); x <= hx1 + (y < ht + 7 ? 1 : 0); x++) g.set(x, y, x >= hx1 || y === ht + rb - 1 ? H.s : x === hx0 && y < ht + 4 ? H.l : H.b);
      if (v.hair === 'ponytail') {
        g.set(cx, ht + 3, K.acc);
        g.rect(cx - 1, ht + 4, 2, 8, H.s);
        g.set(cx - 1, ht + 5, H.b);
      }
      if (v.hair === 'braids') {
        g.line(cx - 2, ht + 6, cx - 2, ht + 15, 2, (t) => (Math.round(t * 9) % 2 ? H.b : H.s));
        g.line(cx + 1, ht + 6, cx + 1, ht + 15, 2, (t) => (Math.round(t * 9) % 2 ? H.b : H.s));
      }
      if (v.hair === 'bun') g.disc(cx, ht - 2, 2.4, H.b, H.s);
      if (v.hair === 'pigtails')
        for (const x of [hx0 - 3, hx1 + 2]) {
          g.rect(x, ht + 2, 2, 7, H.s);
          g.set(x + (x < cx ? 2 : -1), ht + 2, K.acc);
        }
    }
  }

  // ── accesorios
  if (on('acc')) {
    const ey = ht + 3;
    if (v.accessory === 'headband') g.rect(side ? hx0 : hx0 - 1, ht + 1, hx1 - hx0 + (side ? 1 : 3), 1, K.acc);
    if (v.accessory === 'glasses') {
      if (front) {
        g.rect(hx0, ey, 7, 1, FIXED.frame);
        g.set(cx - 2, ey, FIXED.lens);
        g.set(cx + 2, ey, FIXED.lens);
      } else if (side) {
        g.rect(cx + 1, ey, 4, 1, FIXED.frame);
        g.set(cx + 3, ey, FIXED.lens);
      }
    }
  }

  // ── brazo delantero
  if (on('arm_front')) drawArm(1, side ? true : false);
  return g;
}

/** Variante concreta de una capa → rasgos con los que se dibuja. */
function variantSet(layer: LayerId, variant: string, sex: SexFolder): VariantSet {
  const fb = (b: string) => (sex === 'mujer' ? `f${b}` : b) as SpriteBody;
  const v: VariantSet = { body: fb('normal'), pattern: 'plain', hair: 'bald', facial: 'none', nose: 'small', accessory: 'none' };
  switch (layer) {
    case 'arm_back':
    case 'arm_front':
    case 'shorts':
      v.body = fb(variant);
      break;
    case 'torso': {
      const [b, p] = variant.split('_');
      v.body = fb(b);
      v.pattern = p as KitPattern;
      break;
    }
    case 'legs':
      v.accessory = variant === 'socksdown' ? 'socksDown' : 'none';
      v.trousers = variant === 'trousers';
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

/** Hoja completa (una columna por FRAME × 3 filas) de una capa y variante, en colores clave. */
export function bakeSheet(layer: LayerId, variant: string, sex: SexFolder): Px {
  const sheet = new Px(SW * FRAMES.length, SH * VIEWS.length);
  const v = variantSet(layer, variant, sex);
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
