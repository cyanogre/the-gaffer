import { Rng } from '../sim/rng';
import type { Formation } from '../sim/types';
import type { Kit, KitPattern } from './look';

/**
 * Clubes inventados para poblar cualquier división. Hoy todos son ficticios; los clubes reales
 * de las divisiones altas llegarán en paquetes de datos aparte (ver content/names.ts).
 */
export interface TeamDef {
  id: string;
  name: string;
  short: string;
  letter: string;
  kit: Kit;
  gkKit: Kit;
  motto: string;
  formation: Formation;
  level: number;
}

const PREFIX = ['CD', 'UD', 'Atlético', 'Racing', 'Deportivo', 'Club', 'Unión', 'Sporting', 'Real Unión', 'CF', 'SD', 'Juventud'];
const PLACE = [
  'Villarrasa', 'Torrequemada', 'Los Molinos', 'Puente Viejo', 'San Ginés', 'Valdeolmos', 'La Cañada', 'Fuentesauco', 'El Pinar', 'Castilnuevo',
  'Robledal', 'Navalcarbón', 'Huerta Alta', 'Peñaflor', 'Riosalado', 'Villaverde Bajo', 'Almenara', 'Montecillo', 'Santa Olalla', 'Valdepeñuelas',
  'Arroyoseco', 'La Ermita', 'Torrealba', 'Campohermoso', 'Monteagudo', 'Los Arcos', 'Puerto Lápice', 'Alcorlo', 'Sierra Chica', 'Vegallana',
];
const MOTTO = [
  'Su estadio tiene una higuera dentro del campo. Está protegida.',
  'El presidente es también el utillero, el conductor del autobús y el pregonero.',
  'Llevan cuarenta años con la misma camiseta. Literalmente: la misma.',
  'Su afición canta un himno que nadie entiende. Ni ellos.',
  'Entrenan al lado de una granja. Los rivales dicen que se nota.',
  'Tienen una cantera excelente y una cafetería mejor.',
  'Juegan siempre al contraataque. Incluso en la rueda de prensa.',
  'Su portero es el alcalde. Nadie le pita penaltis.',
];
const COLORS = ['#c8102e', '#1f4fd1', '#f2c94c', '#1d1d22', '#f4f4f0', '#25a55f', '#7d55d9', '#f0822a', '#5bb7e8', '#8a1c3a', '#0f6b4f', '#d93b3b'];
const PATTERNS: KitPattern[] = ['plain', 'plain', 'stripes', 'hoops', 'half', 'sash'];

export function generateClub(rng: Rng, id: string, level: number, taken: Set<string>): TeamDef {
  let name = '';
  let place = '';
  for (let i = 0; i < 50; i++) {
    place = rng.pick(PLACE);
    name = `${rng.pick(PREFIX)} ${place}`;
    if (!taken.has(place)) break;
  }
  taken.add(place);
  const a = rng.pick(COLORS);
  let b = rng.pick(COLORS);
  if (b === a) b = a === '#f4f4f0' ? '#1d1d22' : '#f4f4f0';
  const pattern = rng.pick(PATTERNS);
  const short = place
    .replace(/^(La|El|Los|Las|San|Santa) /, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .slice(0, 3)
    .toUpperCase();
  return {
    id,
    name,
    short,
    letter: short[0],
    kit: { shirt: a, shirt2: b, pattern, shorts: rng.chance(0.5) ? b : '#1d1d22', socks: a, trim: b },
    gkKit: { shirt: '#e9d23c', shirt2: '#c9a91a', pattern: 'plain', shorts: '#1d1d22', socks: '#e9d23c', trim: '#1d1d22' },
    motto: rng.pick(MOTTO),
    formation: rng.pick<Formation>(['4-3-3', '4-4-2', '4-4-2', '5-3-2']),
    level,
  };
}
