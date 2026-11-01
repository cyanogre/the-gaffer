import type { Rng } from '../sim/rng';

/**
 * "ADN visual" de un futbolista. Es un conjunto pequeño de rasgos que cada renderizador
 * interpreta a su manera (píxeles, mallas 3D o recortables). Generar un jugador nuevo
 * es generar este objeto: no hace falta dibujar ni modelar nada a mano.
 */
export type Gender = 'm' | 'f';
export type HairStyle =
  | 'bun'
  | 'braids'
  | 'pixie'
  | 'bald'
  | 'buzz'
  | 'short'
  | 'afro'
  | 'mohawk'
  | 'long'
  | 'ponytail'
  | 'mullet'
  | 'curly'
  | 'combover'
  | 'bob'
  | 'pigtails';
export type Facial = 'none' | 'mustache' | 'beard' | 'goatee' | 'stubble';
export type Body = 'slim' | 'normal' | 'stocky' | 'belly';
export type Accessory = 'none' | 'headband' | 'glasses' | 'socksDown';
export type Celebration = 'arms' | 'plane' | 'knees' | 'dance' | 'ear';
export type Nose = 'small' | 'big' | 'hook';
export type Brows = 'thin' | 'thick' | 'uni';

export interface Look {
  gender: Gender;
  skin: string;
  hair: HairStyle;
  hairColor: string;
  facial: Facial;
  body: Body;
  height: number; // 0.92 – 1.08
  accessory: Accessory;
  accColor: string;
  celebration: Celebration;
  boots: string;
  nose: Nose;
  brows: Brows;
  /**
   * Cuánto de crío tiene (0 = adulto, 1 = 14 años): cabeza grande para el cuerpo, piernas y torso
   * más cortos. Baja cada temporada mientras crece.
   */
  youth?: number;
}

export type KitPattern = 'plain' | 'stripes' | 'hoops' | 'half' | 'sash';

export interface Kit {
  shirt: string;
  shirt2: string;
  pattern: KitPattern;
  shorts: string;
  socks: string;
  trim: string;
}

export const SKINS = ['#f6d3b3', '#eab68e', '#d39a6a', '#b07448', '#8a5530', '#5e3a22'];
export const HAIR_COLORS = ['#1f1a17', '#3b2a1e', '#6b4428', '#a8743c', '#d8b25c', '#bfb9b0', '#8a2f1c', '#ece4cf'];
const ACC = ['#e23b3b', '#ffffff', '#2f6fd6', '#f2c230', '#25a55f'];
const BOOTS = ['#1b1b1f', '#f4f4f4', '#ff4fa3', '#33d17a', '#ffb000', '#3a7bff'];

const HAIR_M: HairStyle[] = ['bald', 'buzz', 'short', 'short', 'afro', 'mohawk', 'long', 'ponytail', 'mullet', 'curly', 'combover'];
const HAIR_F: HairStyle[] = ['ponytail', 'ponytail', 'bun', 'braids', 'pixie', 'long', 'long', 'bob', 'bob', 'pigtails', 'afro', 'curly'];

export function randomLook(rng: Rng, gender: Gender, overrides: Partial<Look> = {}): Look {
  const f = gender === 'f';
  return {
    gender,
    skin: rng.pick(SKINS),
    hair: rng.pick(f ? HAIR_F : HAIR_M),
    hairColor: rng.pick(HAIR_COLORS),
    facial: f ? 'none' : rng.pick<Facial>(['none', 'none', 'mustache', 'beard', 'goatee', 'stubble']),
    body: rng.pick<Body>(['slim', 'normal', 'normal', 'stocky', 'belly']),
    height: rng.range(0.93, 1.07),
    accessory: rng.pick<Accessory>(['none', 'none', 'none', 'headband', 'glasses', 'socksDown']),
    accColor: rng.pick(ACC),
    celebration: rng.pick<Celebration>(['arms', 'plane', 'knees', 'dance', 'ear']),
    boots: rng.pick(BOOTS),
    nose: rng.pick<Nose>(['small', 'small', 'big', 'hook']),
    brows: rng.pick<Brows>(f ? ['thin', 'thin', 'thick', 'uni'] : ['thin', 'thick', 'thick', 'uni']),
    ...overrides,
  };
}

/** Gesto por defecto de la cara: la personalidad se ve antes de leer la ficha. */
export type Expression = 'neutral' | 'smug' | 'angry' | 'sleepy' | 'nervous' | 'happy' | 'dreamy' | 'dramatic';
const EXPRESSION_OF: Record<string, Expression> = {
  goleadorNato: 'smug',
  egoista: 'smug',
  lenero: 'angry',
  padel: 'sleepy',
  nervioso: 'nervous',
  pulmon: 'happy',
  artista: 'dreamy',
  piscinero: 'dramatic',
};
export function expressionOf(traits: readonly string[]): Expression {
  for (const t of traits) if (EXPRESSION_OF[t]) return EXPRESSION_OF[t];
  return 'neutral';
}

export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => {
    const out = f < 0 ? v * (1 + f) : v + (255 - v) * f;
    return Math.max(0, Math.min(255, Math.round(out)));
  };
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
