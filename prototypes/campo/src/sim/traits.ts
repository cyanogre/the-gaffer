import type { Freedom, SimPlayer, TraitId } from './types';

/**
 * Los rasgos de personalidad NO suman puntos: cambian los pesos con los que la IA
 * elige entre opciones (tirar, pasar, regatear, presionar, entrar...). Un "goleador nato"
 * no tiene mejor puntería, simplemente tira mucho más, y de ahí sale el humor.
 */
export interface TraitMods {
  shootBias: number;
  shootRange: number;
  passBias: number;
  dribbleBias: number;
  pressBias: number;
  foulMult: number;
  slideMult: number;
  staminaMult: number;
  diveChance: number;
  composure: number;
  riskyPass: number;
}

const NEUTRAL: TraitMods = {
  shootBias: 1,
  shootRange: 1,
  passBias: 1,
  dribbleBias: 1,
  pressBias: 1,
  foulMult: 1,
  slideMult: 1,
  staminaMult: 1,
  diveChance: 0,
  composure: 1,
  riskyPass: 1,
};

export interface TraitInfo {
  label: string;
  desc: string;
  mods: Partial<TraitMods>;
}

export const TRAITS: Record<TraitId, TraitInfo> = {
  goleadorNato: {
    label: 'Goleador nato (según él)',
    desc: 'Tira desde cualquier sitio. Su puntería no ha leído el informe.',
    mods: { shootBias: 2.4, shootRange: 1.45 },
  },
  egoista: {
    label: 'Chupón',
    desc: 'Pasar el balón le parece una forma de rendirse.',
    mods: { passBias: 0.6, dribbleBias: 1.6 },
  },
  lenero: {
    label: 'Leñero',
    desc: 'Entra a todo. A veces, incluso al balón.',
    mods: { foulMult: 2.6, slideMult: 3, pressBias: 1.25 },
  },
  padel: {
    label: 'Ha descubierto el pádel',
    desc: 'Tiene la cabeza en la pista de cristal. Presiona lo justo.',
    mods: { pressBias: 0.3 },
  },
  pulmon: {
    label: 'Pulmón',
    desc: 'Corre por tres. Nadie sabe muy bien hacia dónde.',
    mods: { staminaMult: 0.5, pressBias: 1.6 },
  },
  artista: {
    label: 'Artista',
    desc: 'Prefiere un caño a un pase de gol.',
    mods: { dribbleBias: 1.3, riskyPass: 1.7 },
  },
  piscinero: {
    label: 'Piscinero',
    desc: 'Se tira. Mucho. Con estilo.',
    mods: { diveChance: 0.4 },
  },
  nervioso: {
    label: 'Nervioso',
    desc: 'Con un rival cerca, sus pies olvidan cómo funcionan.',
    mods: { composure: 0.55 },
  },
};

const FREEDOM_MODS: Record<Freedom, Partial<TraitMods>> = {
  [-1]: { dribbleBias: 0.55, riskyPass: 0.6, shootBias: 0.75, passBias: 1.15 },
  [0]: {},
  [1]: { dribbleBias: 1.45, riskyPass: 1.35, shootBias: 1.2 },
};

export function modsOf(p: SimPlayer): TraitMods {
  const m: TraitMods = { ...NEUTRAL };
  const apply = (part: Partial<TraitMods>) => {
    for (const k of Object.keys(part) as (keyof TraitMods)[]) {
      if (k === 'diveChance') m[k] = Math.max(m[k], part[k] ?? 0);
      else m[k] *= part[k] ?? 1;
    }
  };
  for (const t of p.profile.traits) apply(TRAITS[t].mods);
  apply(FREEDOM_MODS[p.freedom]);
  return m;
}
