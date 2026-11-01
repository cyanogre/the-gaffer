import type { PlayerProfile } from '../sim/types';

/**
 * Política de nombres en un solo sitio. Hoy todos los jugadores son inventados.
 * Cuando lleguen los paquetes de datos de divisiones altas (jugadores reales),
 * la ficha guardará la identidad separada y la UI siempre pasará por aquí, de modo que
 * "Lionel Messi" se mostrará como "L. Messi" sin tocar el motor ni las partidas guardadas.
 */
export type NamePolicy = 'full' | 'initial-surname';

export function displayName(p: Pick<PlayerProfile, 'name'>, policy: NamePolicy = 'full') {
  if (policy === 'full') return p.name;
  const [first, ...rest] = p.name.split(' ');
  return rest.length ? `${first[0]}. ${rest.join(' ')}` : first;
}

/** Cómo se le llama en la crónica: por su apodo si lo tiene, si no por el apellido. */
export function shortName(p: Pick<PlayerProfile, 'name' | 'nick'>) {
  if (p.nick) return p.nick;
  const parts = p.name.split(' ');
  return parts[parts.length - 1];
}
