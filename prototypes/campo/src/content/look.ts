import type { Rng } from '../sim/rng';

/**
 * "ADN visual" de un futbolista. Es un conjunto pequeño de rasgos que cada renderizador
 * interpreta a su manera (píxeles, mallas 3D o recortables). Generar un jugador nuevo
 * es generar este objeto: no hace falta dibujar ni modelar nada a mano.
 */
export type HairStyle =
  | 'bald'
  | 'buzz'
  | 'short'
  | 'afro'
  | 'mohawk'
  | 'long'
  | 'ponytail'
  | 'mullet'
  | 'curly'
  | 'combover';
export type Facial = 'none' | 'mustache' | 'beard' | 'goatee' | 'stubble';
export type Body = 'slim' | 'normal' | 'stocky' | 'belly';
export type Accessory = 'none' | 'headband' | 'glasses' | 'socksDown';
export type Celebration = 'arms' | 'plane' | 'knees' | 'dance' | 'ear';
export type Nose = 'small' | 'big' | 'hook';
export type Brows = 'thin' | 'thick' | 'uni';

export interface Look {
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

export function randomLook(rng: Rng, overrides: Partial<Look> = {}): Look {
  const hair = rng.pick<HairStyle>(['bald', 'buzz', 'short', 'short', 'afro', 'mohawk', 'long', 'ponytail', 'mullet', 'curly', 'combover']);
  return {
    skin: rng.pick(SKINS),
    hair,
    hairColor: rng.pick(HAIR_COLORS),
    facial: rng.pick<Facial>(['none', 'none', 'mustache', 'beard', 'goatee', 'stubble']),
    body: rng.pick<Body>(['slim', 'normal', 'normal', 'stocky', 'belly']),
    height: rng.range(0.93, 1.07),
    accessory: rng.pick<Accessory>(['none', 'none', 'none', 'headband', 'glasses', 'socksDown']),
    accColor: rng.pick(ACC),
    celebration: rng.pick<Celebration>(['arms', 'plane', 'knees', 'dance', 'ear']),
    boots: rng.pick(BOOTS),
    nose: rng.pick<Nose>(['small', 'small', 'big', 'hook']),
    brows: rng.pick<Brows>(['thin', 'thick', 'thick', 'uni']),
    ...overrides,
  };
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
