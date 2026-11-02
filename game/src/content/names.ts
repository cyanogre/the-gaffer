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

/**
 * Cómo se le llama en la crónica y en los rótulos: por el apellido. El apodo (si se lo ha ganado)
 * va aparte y en color, para que se vea que es un apodo (ver `nickTag` en la interfaz).
 */
export function shortName(p: Pick<PlayerProfile, 'name'>) {
  const parts = p.name.split(' ');
  return parts[parts.length - 1];
}
