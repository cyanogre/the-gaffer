import { Rng } from '../sim/rng';
import type { Attributes, PlayerProfile, Role, TeamProfile, TraitId } from '../sim/types';
import { randomLook, type Gender, type Kit, type Look } from './look';

/**
 * Plantillas del prototipo. El Barriobajo está escrito a mano (masculino y femenino) con los
 * personajes del brief; el Polígono se genera con el mismo sistema que poblará las ligas.
 */
function attrs(base: number, rng: Rng, over: Partial<Attributes> = {}): Attributes {
  const r = () => Math.max(1, Math.min(20, Math.round(base + rng.gauss() * 2.5)));
  return {
    pace: r(),
    stamina: r(),
    passing: r(),
    shooting: r(),
    dribbling: r(),
    tackling: r(),
    vision: r(),
    positioning: r(),
    keeping: 3,
    aggression: r(),
    composure: r(),
    workRate: r(),
    ...over,
  };
}

interface Seed {
  name: string;
  nick?: string;
  num: number;
  role: Role;
  traits: TraitId[];
  quirk: string;
  look: Partial<Look>;
  attrs: Partial<Attributes>;
  drought?: number;
}

/** Mismos puestos y mismas personalidades en las dos plantillas: cambia la gente, no el sistema. */
const ROLES = {
  gk: { keeping: 13, pace: 5, positioning: 12, passing: 8 },
  rb: { stamina: 18, pace: 14, workRate: 17, tackling: 10 },
  cb1: { tackling: 15, aggression: 19, pace: 8, passing: 6 },
  cb2: { positioning: 15, tackling: 13, composure: 14, passing: 11 },
  lb: { pace: 18, stamina: 13, tackling: 10, positioning: 8 },
  cm1: { vision: 18, passing: 16, dribbling: 14, pace: 7, workRate: 8 },
  dm: { passing: 14, workRate: 4, stamina: 9, dribbling: 12 },
  cm2: { passing: 15, dribbling: 15, composure: 5, vision: 14 },
  rw: { dribbling: 17, pace: 15, passing: 7, shooting: 11 },
  st: { shooting: 7, composure: 8, pace: 12, dribbling: 9, positioning: 7 },
  lw: { dribbling: 13, pace: 14, shooting: 12, composure: 12 },
} satisfies Record<string, Partial<Attributes>>;

const BARRIO_M: Seed[] = [
  { name: 'Paco Gordillo', nick: 'El Muro', num: 1, role: 'POR', traits: [], quirk: 'Lleva 19 temporadas en el club. Dice que la barriga le da inercia en las estiradas.', look: { body: 'belly', hair: 'combover', hairColor: '#bfb9b0', facial: 'mustache', nose: 'big', celebration: 'arms' }, attrs: ROLES.gk },
  { name: 'Iker Sanz', nick: 'Bocadillo', num: 2, role: 'DEF', traits: ['pulmon'], quirk: 'Sube y baja la banda 40 veces por partido. Centra bien unas tres.', look: { body: 'slim', hair: 'buzz', accessory: 'socksDown' }, attrs: ROLES.rb },
  { name: 'Rufo Barrios', nick: 'Hormigonera', num: 4, role: 'DEF', traits: ['lenero'], quirk: 'Tiene una tarjeta amarilla tatuada. Dice que es de la suerte.', look: { body: 'stocky', hair: 'buzz', facial: 'beard', brows: 'uni', nose: 'hook', celebration: 'ear' }, attrs: ROLES.cb1 },
  { name: 'Jacinto Ferrer', num: 5, role: 'DEF', traits: [], quirk: 'Juega con gafas deportivas. Las otras se le rompieron en un córner en 2019.', look: { accessory: 'glasses', hair: 'short', body: 'normal' }, attrs: ROLES.cb2 },
  { name: 'Toni Cano', nick: 'Turbo', num: 3, role: 'DEF', traits: [], quirk: 'El más rápido del barrio. Frena peor de lo que acelera.', look: { hair: 'afro', body: 'slim', celebration: 'dance' }, attrs: ROLES.lb },
  { name: 'Blas Medina', nick: 'El Profesor', num: 6, role: 'MED', traits: ['artista'], quirk: 'Ve pases que no existen. A veces, por desgracia, los intenta.', look: { hair: 'long', facial: 'goatee', accessory: 'headband', accColor: '#ffffff', celebration: 'plane' }, attrs: ROLES.cm1 },
  { name: 'Quique Rodríguez', nick: 'Pádel', num: 8, role: 'MED', traits: ['padel'], quirk: 'Se ha comprado dos palas de carbono. Al entrenamiento llega con muñequeras.', look: { hair: 'mullet', facial: 'stubble', celebration: 'dance' }, attrs: ROLES.dm },
  { name: 'Dani Ortega', num: 10, role: 'MED', traits: ['nervioso'], quirk: 'En los entrenamientos es Zidane. Con público, un flan con botas.', look: { hair: 'curly', body: 'slim', brows: 'thin' }, attrs: ROLES.cm2 },
  { name: 'Yeray Mendoza', nick: 'Firuletas', num: 7, role: 'DEL', traits: ['egoista'], quirk: 'Tiene 40.000 seguidores. Ninguno le ha visto dar un pase.', look: { hair: 'ponytail', hairColor: '#d8b25c', boots: '#ff4fa3', celebration: 'ear' }, attrs: ROLES.rw },
  { name: 'Rubén Peralta', nick: 'Goleador Nato', num: 9, role: 'DEL', traits: ['goleadorNato'], drought: 14, quirk: 'Asegura ser un goleador nato. Lleva 14 partidos sin marcar.', look: { hair: 'mohawk', hairColor: '#8a2f1c', facial: 'none', body: 'stocky', celebration: 'knees', boots: '#ffb000' }, attrs: ROLES.st },
  { name: 'Manu Castillo', num: 11, role: 'DEL', traits: ['piscinero'], quirk: 'Ha estudiado teatro. Se nota en cada contacto.', look: { hair: 'short', hairColor: '#1f1a17', facial: 'mustache', celebration: 'plane' }, attrs: ROLES.lw },
];

const BARRIO_F: Seed[] = [
  { name: 'Maribel Gordillo', nick: 'La Muralla', num: 1, role: 'POR', traits: [], quirk: 'Lleva 19 temporadas en el club. Su método: gritar más fuerte que la delantera rival.', look: { body: 'stocky', hair: 'bun', hairColor: '#bfb9b0', nose: 'big', brows: 'thick', celebration: 'arms' }, attrs: ROLES.gk },
  { name: 'Ainhoa Sanz', nick: 'Bocadillo', num: 2, role: 'DEF', traits: ['pulmon'], quirk: 'Sube y baja la banda 40 veces por partido. Centra bien unas tres.', look: { body: 'slim', hair: 'ponytail', hairColor: '#3b2a1e', accessory: 'socksDown' }, attrs: ROLES.rb },
  { name: 'Rocío Barrios', nick: 'Hormigonera', num: 4, role: 'DEF', traits: ['lenero'], quirk: 'Tiene una tarjeta amarilla tatuada. Dice que es de la suerte.', look: { body: 'stocky', hair: 'pixie', hairColor: '#1f1a17', brows: 'uni', nose: 'hook', celebration: 'ear' }, attrs: ROLES.cb1 },
  { name: 'Celia Ferrer', num: 5, role: 'DEF', traits: [], quirk: 'Juega con gafas deportivas. Las otras acabaron en el córner en 2019.', look: { accessory: 'glasses', hair: 'braids', hairColor: '#6b4428', body: 'normal' }, attrs: ROLES.cb2 },
  { name: 'Antonia Cano', nick: 'Turbo', num: 3, role: 'DEF', traits: [], quirk: 'La más rápida del barrio. Frena peor de lo que acelera.', look: { hair: 'afro', body: 'slim', celebration: 'dance' }, attrs: ROLES.lb },
  { name: 'Blanca Medina', nick: 'La Profesora', num: 6, role: 'MED', traits: ['artista'], quirk: 'Ve pases que no existen. A veces, por desgracia, los intenta.', look: { hair: 'long', hairColor: '#a8743c', accessory: 'headband', accColor: '#ffffff', celebration: 'plane' }, attrs: ROLES.cm1 },
  { name: 'Quica Rodríguez', nick: 'Pádel', num: 8, role: 'MED', traits: ['padel'], quirk: 'Se ha apuntado a tres ligas de pádel. Al entrenamiento llega con la raqueta.', look: { hair: 'ponytail', hairColor: '#d8b25c', accessory: 'headband', accColor: '#25a55f', celebration: 'dance' }, attrs: ROLES.dm },
  { name: 'Daniela Ortega', num: 10, role: 'MED', traits: ['nervioso'], quirk: 'En los entrenamientos es una estrella. Con público, un flan con botas.', look: { hair: 'curly', hairColor: '#1f1a17', body: 'slim' }, attrs: ROLES.cm2 },
  { name: 'Yaiza Mendoza', nick: 'Firuletas', num: 7, role: 'DEL', traits: ['egoista'], quirk: 'Tiene 40.000 seguidoras. Ninguna le ha visto dar un pase.', look: { hair: 'long', hairColor: '#ece4cf', boots: '#ff4fa3', celebration: 'ear' }, attrs: ROLES.rw },
  { name: 'Vanesa Peralta', nick: 'Goleadora Nata', num: 9, role: 'DEL', traits: ['goleadorNato'], drought: 14, quirk: 'Asegura ser una goleadora nata. Lleva 14 partidos sin marcar.', look: { hair: 'mohawk', hairColor: '#8a2f1c', body: 'stocky', celebration: 'knees', boots: '#ffb000' }, attrs: ROLES.st },
  { name: 'Manuela Castillo', num: 11, role: 'DEL', traits: ['piscinero'], quirk: 'Ha estudiado teatro. Se nota en cada contacto.', look: { hair: 'bun', hairColor: '#3b2a1e', celebration: 'plane' }, attrs: ROLES.lw },
];

const BARRIO_KIT: Kit = { shirt: '#f0822a', shirt2: '#1d1d22', pattern: 'stripes', shorts: '#1d1d22', socks: '#f0822a', trim: '#1d1d22' };
const BARRIO_GK: Kit = { shirt: '#7d55d9', shirt2: '#5a3aa8', pattern: 'plain', shorts: '#2b1f4a', socks: '#7d55d9', trim: '#ffffff' };
const POLI_KIT: Kit = { shirt: '#5bb7e8', shirt2: '#ffffff', pattern: 'sash', shorts: '#ffffff', socks: '#5bb7e8', trim: '#ffffff' };
const POLI_GK: Kit = { shirt: '#e9d23c', shirt2: '#c9a91a', pattern: 'plain', shorts: '#1d1d22', socks: '#e9d23c', trim: '#1d1d22' };

const FIRST_M = ['Álex', 'Borja', 'Chema', 'Dani', 'Edu', 'Fermín', 'Gonzalo', 'Héctor', 'Isma', 'Jonás', 'Kike', 'Lolo', 'Mario', 'Nacho', 'Óscar', 'Pablo', 'Raúl', 'Sergio', 'Txema', 'Vicente', 'Wilson', 'Xabi'];
const FIRST_F = ['Alba', 'Bea', 'Carla', 'Desirée', 'Elena', 'Fátima', 'Gema', 'Irene', 'Jessica', 'Lucía', 'Mar', 'Nerea', 'Olga', 'Paula', 'Raquel', 'Sandra', 'Tania', 'Uxue', 'Vero', 'Yolanda', 'Zaira', 'Noemí'];
const LAST = ['Alcántara', 'Bermejo', 'Cifuentes', 'Domínguez', 'Escudero', 'Fuentes', 'Garrido', 'Herrero', 'Iglesias', 'Jurado', 'Lozano', 'Montero', 'Navarro', 'Pastor', 'Quintana', 'Robles', 'Salcedo', 'Toledo', 'Urrutia', 'Vidal'];
const NICKS_M = ['El Grúa', 'Tractor', 'Chispas', 'Bombilla', 'Lavadora', 'El Notario', 'Pirata', 'Cuchara', 'Pelusa', 'Turrón', 'El Fontanero'];
const NICKS_F = ['La Grúa', 'Tractora', 'Chispas', 'Bombilla', 'Lavadora', 'La Notaria', 'Pirata', 'Cuchara', 'Pelusa', 'Turrón', 'La Fontanera'];
const QUIRKS: Record<Gender, Record<TraitId | 'none', string[]>> = {
  m: {
    none: ['Trabaja de lunes a viernes en el polígono. El domingo, también.', 'Su madre viene a todos los partidos con una pancarta.', 'Nadie recuerda cuándo fichó. Él tampoco.'],
    goleadorNato: ['Se autoproclama "killer del área". El área no opina lo mismo.'],
    egoista: ['Celebra los goles de sus compañeros mirando el móvil.'],
    lenero: ['El árbitro ya le saluda por su nombre.'],
    padel: ['Ha cambiado las botas por zapatillas de pádel. En el césped resbala.'],
    pulmon: ['Corre la media maratón los sábados para relajarse.'],
    artista: ['Intentó una chilena en un saque de banda.'],
    piscinero: ['Tiene un 9,5 en caídas según un jurado imaginario.'],
    nervioso: ['Vomita antes de cada partido. Y después, por si acaso.'],
  },
  f: {
    none: ['Trabaja de lunes a viernes en el polígono. El domingo, también.', 'Su abuela viene a todos los partidos con una pancarta.', 'Nadie recuerda cuándo fichó. Ella tampoco.'],
    goleadorNato: ['Se autoproclama "killer del área". El área no opina lo mismo.'],
    egoista: ['Celebra los goles de sus compañeras mirando el móvil.'],
    lenero: ['La árbitra ya la saluda por su nombre.'],
    padel: ['Ha cambiado las botas por zapatillas de pádel. En el césped resbala.'],
    pulmon: ['Corre la media maratón los sábados para relajarse.'],
    artista: ['Intentó una chilena en un saque de banda.'],
    piscinero: ['Tiene un 9,5 en caídas según un jurado imaginario.'],
    nervioso: ['Vomita antes de cada partido. Y después, por si acaso.'],
  },
};

function polygono(rng: Rng, gender: Gender, rival: RivalDef): PlayerProfile[] {
  const roles: Role[] = ['POR', 'DEF', 'DEF', 'DEF', 'DEF', 'MED', 'MED', 'MED', 'DEL', 'DEL', 'MED'];
  const traitsPool: TraitId[] = ['goleadorNato', 'egoista', 'lenero', 'padel', 'pulmon', 'artista', 'piscinero', 'nervioso'];
  const first = gender === 'f' ? FIRST_F : FIRST_M;
  const nicks = gender === 'f' ? NICKS_F : NICKS_M;
  return roles.map((role, i) => {
    const traits: TraitId[] = i > 0 && rng.chance(0.4) ? [rng.pick(traitsPool)] : [];
    const over: Partial<Attributes> = role === 'POR' ? { keeping: rng.int(10, 15), pace: rng.int(5, 9) } : {};
    return {
      id: `${rival.id}-${gender}-${i}`,
      name: `${rng.pick(first)} ${rng.pick(LAST)}`,
      nick: rng.chance(0.45) ? rng.pick(nicks) : undefined,
      num: i + 1,
      role,
      traits,
      quirk: rng.pick(QUIRKS[gender][traits[0] ?? 'none']),
      look: randomLook(rng, gender),
      attrs: attrs(rival.level, rng, over),
    };
  });
}

function addMods(a: Attributes, m?: Partial<Attributes>): Partial<Attributes> {
  if (!m) return {};
  const out: Partial<Attributes> = {};
  for (const k of Object.keys(m) as (keyof Attributes)[]) out[k] = a[k] + (m[k] ?? 0);
  return out;
}
function clampAttrs(a: Attributes): Attributes {
  for (const k of Object.keys(a) as (keyof Attributes)[]) a[k] = Math.max(1, Math.min(20, a[k]));
  return a;
}

/** Rival de la jornada: nombre, colores y carácter. */
export interface RivalDef {
  id: string;
  name: string;
  short: string;
  letter: string;
  kit: Kit;
  gkKit: Kit;
  motto: string;
  formation: '4-3-3' | '4-4-2' | '5-3-2';
  level: number;
}

export const RIVALS: RivalDef[] = [
  { id: 'poligono', name: 'Deportivo Polígono', short: 'POL', letter: 'P', kit: POLI_KIT, gkKit: POLI_GK, motto: 'Patrocinado por Talleres El Chispas desde que nadie recuerda.', formation: '4-4-2', level: 10 },
  { id: 'rotonda', name: 'Unión Rotonda', short: 'ROT', letter: 'R', kit: { shirt: '#3fae5a', shirt2: '#f4f4f0', pattern: 'hoops', shorts: '#1d1d22', socks: '#3fae5a', trim: '#f4f4f0' }, gkKit: POLI_GK, motto: 'Juegan siempre en círculos. Literalmente.', formation: '4-3-3', level: 10 },
  { id: 'gasolinera', name: 'CD Gasolinera', short: 'GAS', letter: 'G', kit: { shirt: '#d93b3b', shirt2: '#f2c94c', pattern: 'half', shorts: '#d93b3b', socks: '#f2c94c', trim: '#f2c94c' }, gkKit: BARRIO_GK, motto: 'Su presidente vende boletos de lotería en el descanso.', formation: '5-3-2', level: 11 },
  { id: 'descampado', name: 'Racing Descampado', short: 'DES', letter: 'D', kit: { shirt: '#f4f4f0', shirt2: '#7a4fd6', pattern: 'sash', shorts: '#7a4fd6', socks: '#f4f4f0', trim: '#7a4fd6' }, gkKit: POLI_GK, motto: 'Entrenan en un solar. Se les nota en los controles.', formation: '4-4-2', level: 11 },
];

export function buildTeams(seed: number, gender: Gender = 'm', rival: RivalDef = RIVALS[0], mods: Record<number, Partial<Attributes>> = {}): [TeamProfile, TeamProfile] {
  const rng = new Rng(seed * 7919 + 13);
  const seeds = gender === 'f' ? BARRIO_F : BARRIO_M;
  const barrio: PlayerProfile[] = seeds.map((s, i) => {
    const look = randomLook(rng, gender, s.look);
    const base = attrs(11, rng, s.attrs);
    return {
    id: `barrio-${gender}-${i}`,
    name: s.name,
    nick: s.nick,
    num: s.num,
    role: s.role,
    traits: s.traits,
    quirk: s.quirk,
    drought: s.drought,
    look,
    attrs: clampAttrs({ ...base, ...addMods(base, mods[i]) }),
    };
  });
  return [
    {
      id: 'barrio',
      name: 'Atlético Barriobajo',
      short: 'BAR',
      gender,
      kit: BARRIO_KIT,
      gkKit: BARRIO_GK,
      players: barrio,
      tactics: { formation: '4-3-3', block: 1, style: 'mixed' },
      motto: 'Fundado en 1974 en la trastienda del Bar Manolo.',
    },
    {
      id: rival.id,
      name: rival.name,
      short: rival.short,
      gender,
      kit: rival.kit,
      gkKit: rival.gkKit,
      players: polygono(rng, gender, rival),
      tactics: { formation: rival.formation, block: 1, style: 'mixed' },
      motto: rival.motto,
    },
  ];
}
