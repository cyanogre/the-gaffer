import { Rng } from '../sim/rng';
import type { Attributes, PlayerProfile, Role, TeamProfile, TraitId } from '../sim/types';
import { randomLook, type Kit, type Look } from './look';

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

const BARRIO: Seed[] = [
  {
    name: 'Paco Gordillo', nick: 'El Muro', num: 1, role: 'POR', traits: [],
    quirk: 'Lleva 19 temporadas en el club. Dice que la barriga le da inercia en las estiradas.',
    look: { body: 'belly', hair: 'combover', hairColor: '#bfb9b0', facial: 'mustache', nose: 'big', celebration: 'arms' },
    attrs: { keeping: 13, pace: 5, positioning: 12, passing: 8 },
  },
  {
    name: 'Iker Sanz', nick: 'Bocadillo', num: 2, role: 'DEF', traits: ['pulmon'],
    quirk: 'Sube y baja la banda 40 veces por partido. Centra bien unas tres.',
    look: { body: 'slim', hair: 'buzz', accessory: 'socksDown' },
    attrs: { stamina: 18, pace: 14, workRate: 17, tackling: 10 },
  },
  {
    name: 'Rufo Barrios', nick: 'Hormigonera', num: 4, role: 'DEF', traits: ['lenero'],
    quirk: 'Tiene una tarjeta amarilla tatuada. Dice que es de la suerte.',
    look: { body: 'stocky', hair: 'buzz', facial: 'beard', brows: 'uni', nose: 'hook', celebration: 'ear' },
    attrs: { tackling: 15, aggression: 19, pace: 8, passing: 6 },
  },
  {
    name: 'Jacinto Ferrer', num: 5, role: 'DEF', traits: [],
    quirk: 'Juega con gafas deportivas. Las otras se le rompieron en un córner en 2019.',
    look: { accessory: 'glasses', hair: 'short', body: 'normal' },
    attrs: { positioning: 15, tackling: 13, composure: 14, passing: 11 },
  },
  {
    name: 'Toni Cano', nick: 'Turbo', num: 3, role: 'DEF', traits: [],
    quirk: 'El más rápido del barrio. Frena peor de lo que acelera.',
    look: { hair: 'afro', body: 'slim', celebration: 'dance' },
    attrs: { pace: 18, stamina: 13, tackling: 10, positioning: 8 },
  },
  {
    name: 'Blas Medina', nick: 'El Profesor', num: 6, role: 'MED', traits: ['artista'],
    quirk: 'Ve pases que no existen. A veces, por desgracia, los intenta.',
    look: { hair: 'long', facial: 'goatee', accessory: 'headband', accColor: '#ffffff', celebration: 'plane' },
    attrs: { vision: 18, passing: 16, dribbling: 14, pace: 7, workRate: 8 },
  },
  {
    name: 'Quique Rodríguez', nick: 'Pádel', num: 8, role: 'MED', traits: ['padel'],
    quirk: 'Se ha comprado dos palas de carbono. Al entrenamiento llega con muñequeras.',
    look: { hair: 'mullet', facial: 'stubble', celebration: 'dance' },
    attrs: { passing: 14, workRate: 4, stamina: 9, dribbling: 12 },
  },
  {
    name: 'Dani Ortega', num: 10, role: 'MED', traits: ['nervioso'],
    quirk: 'En los entrenamientos es Zidane. Con público, un flan con botas.',
    look: { hair: 'curly', body: 'slim', brows: 'thin' },
    attrs: { passing: 15, dribbling: 15, composure: 5, vision: 14 },
  },
  {
    name: 'Yeray Mendoza', nick: 'Firuletas', num: 7, role: 'DEL', traits: ['egoista'],
    quirk: 'Tiene 40.000 seguidores. Ninguno le ha visto dar un pase.',
    look: { hair: 'ponytail', hairColor: '#d8b25c', boots: '#ff4fa3', celebration: 'ear' },
    attrs: { dribbling: 17, pace: 15, passing: 7, shooting: 11 },
  },
  {
    name: 'Rubén Peralta', nick: 'Goleador Nato', num: 9, role: 'DEL', traits: ['goleadorNato'], drought: 14,
    quirk: 'Asegura ser un goleador nato. Lleva 14 partidos sin marcar.',
    look: { hair: 'mohawk', hairColor: '#8a2f1c', facial: 'none', body: 'stocky', celebration: 'knees', boots: '#ffb000' },
    attrs: { shooting: 7, composure: 8, pace: 12, dribbling: 9, positioning: 7 },
  },
  {
    name: 'Manu Castillo', num: 11, role: 'DEL', traits: ['piscinero'],
    quirk: 'Ha estudiado teatro. Se nota en cada contacto.',
    look: { hair: 'short', hairColor: '#1f1a17', facial: 'mustache', celebration: 'plane' },
    attrs: { dribbling: 13, pace: 14, shooting: 12, composure: 12 },
  },
];

const BARRIO_KIT: Kit = { shirt: '#f0822a', shirt2: '#1d1d22', pattern: 'stripes', shorts: '#1d1d22', socks: '#f0822a', trim: '#1d1d22' };
const BARRIO_GK: Kit = { shirt: '#7d55d9', shirt2: '#5a3aa8', pattern: 'plain', shorts: '#2b1f4a', socks: '#7d55d9', trim: '#ffffff' };
const POLI_KIT: Kit = { shirt: '#5bb7e8', shirt2: '#ffffff', pattern: 'sash', shorts: '#ffffff', socks: '#5bb7e8', trim: '#ffffff' };
const POLI_GK: Kit = { shirt: '#e9d23c', shirt2: '#c9a91a', pattern: 'plain', shorts: '#1d1d22', socks: '#e9d23c', trim: '#1d1d22' };

const FIRST = ['Álex', 'Borja', 'Chema', 'Dani', 'Edu', 'Fermín', 'Gonzalo', 'Héctor', 'Isma', 'Jonás', 'Kike', 'Lolo', 'Mario', 'Nacho', 'Óscar', 'Pablo', 'Raúl', 'Sergio', 'Txema', 'Vicente', 'Wilson', 'Xabi'];
const LAST = ['Alcántara', 'Bermejo', 'Cifuentes', 'Domínguez', 'Escudero', 'Fuentes', 'Garrido', 'Herrero', 'Iglesias', 'Jurado', 'Lozano', 'Montero', 'Navarro', 'Pastor', 'Quintana', 'Robles', 'Salcedo', 'Toledo', 'Urrutia', 'Vidal'];
const NICKS = ['El Grúa', 'Tractor', 'Chispas', 'Bombilla', 'Lavadora', 'El Notario', 'Pirata', 'Cuchara', 'Pelusa', 'Turrón', 'El Fontanero'];
const QUIRKS: Record<TraitId | 'none', string[]> = {
  none: ['Trabaja de lunes a viernes en el polígono. El domingo, también.', 'Su madre viene a todos los partidos con una pancarta.', 'Nadie recuerda cuándo fichó. Él tampoco.'],
  goleadorNato: ['Se autoproclama "killer del área". El área no opina lo mismo.'],
  egoista: ['Celebra los goles de sus compañeros mirando el móvil.'],
  lenero: ['El árbitro ya le saluda por su nombre.'],
  padel: ['Ha cambiado las botas por zapatillas de pádel. En el césped resbala.'],
  pulmon: ['Corre la media maratón los sábados para relajarse.'],
  artista: ['Intentó una chilena en un saque de banda.'],
  piscinero: ['Tiene un 9,5 en caídas según un jurado imaginario.'],
  nervioso: ['Vomita antes de cada partido. Y después, por si acaso.'],
};

function polygono(rng: Rng): PlayerProfile[] {
  const roles: Role[] = ['POR', 'DEF', 'DEF', 'DEF', 'DEF', 'MED', 'MED', 'MED', 'DEL', 'DEL', 'MED'];
  const traitsPool: TraitId[] = ['goleadorNato', 'egoista', 'lenero', 'padel', 'pulmon', 'artista', 'piscinero', 'nervioso'];
  return roles.map((role, i) => {
    const traits: TraitId[] = i > 0 && rng.chance(0.4) ? [rng.pick(traitsPool)] : [];
    const quirkKey = traits[0] ?? 'none';
    const over: Partial<Attributes> = role === 'POR' ? { keeping: rng.int(10, 15), pace: rng.int(5, 9) } : {};
    return {
      id: `poli-${i}`,
      name: `${rng.pick(FIRST)} ${rng.pick(LAST)}`,
      nick: rng.chance(0.45) ? rng.pick(NICKS) : undefined,
      num: i + 1,
      role,
      traits,
      quirk: rng.pick(QUIRKS[quirkKey]),
      look: randomLook(rng),
      attrs: attrs(11, rng, over),
    };
  });
}

export function buildTeams(seed: number): [TeamProfile, TeamProfile] {
  const rng = new Rng(seed * 7919 + 13);
  const barrio: PlayerProfile[] = BARRIO.map((s, i) => ({
    id: `barrio-${i}`,
    name: s.name,
    nick: s.nick,
    num: s.num,
    role: s.role,
    traits: s.traits,
    quirk: s.quirk,
    drought: s.drought,
    look: randomLook(rng, s.look),
    attrs: attrs(11, rng, s.attrs),
  }));
  return [
    {
      id: 'barrio',
      name: 'Atlético Barriobajo',
      short: 'BAR',
      kit: BARRIO_KIT,
      gkKit: BARRIO_GK,
      players: barrio,
      tactics: { formation: '4-3-3', block: 1, style: 'mixed' },
      motto: 'Fundado en 1974 en la trastienda del Bar Manolo.',
    },
    {
      id: 'poligono',
      name: 'Deportivo Polígono',
      short: 'POL',
      kit: POLI_KIT,
      gkKit: POLI_GK,
      players: polygono(rng),
      tactics: { formation: '4-4-2', block: 1, style: 'mixed' },
      motto: 'Patrocinado por Talleres El Chispas desde que nadie recuerda.',
    },
  ];
}
