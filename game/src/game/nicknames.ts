import type { Career } from './career';
import { changeMorale, type PlayerMatchStats } from './morale';

/**
 * Apodos que se ganan en el campo. Nadie empieza con apodo: el barrio se lo pone a quien hace algo
 * gordo en un partido (y se queda para siempre). Umbrales calibrados con partidos simulados para que
 * sean raros: un portero que para 7 tiros y encaja como mucho uno, un póker de goles o un defensa
 * que recupera 12 balones. Un apodo no se repite en la plantilla. La interfaz lo pinta en color.
 */
export interface EarnedNick {
  id: string;
  name: string;
  nick: string;
  why: string;
}

export function earnNicknames(c: Career, played: string[], stats: Record<string, PlayerMatchStats>): EarnedNick[] {
  const out: EarnedNick[] = [];
  for (const id of played) {
    const p = c.squad.find((x) => x.id === id);
    const s = stats[id];
    if (!p || !s || p.nick) continue;
    const first = p.name.split(' ')[0];
    const f = p.look.gender === 'f';
    let nick: string | null = null;
    let why = '';
    if (p.role === 'POR' && s.saves >= 7 && s.conceded <= 1) {
      // como «San Iker»: la portera que lo para todo
      nick = `${f ? 'Santa' : 'San'} ${first}`;
      why = `paró ${s.saves} tiros y solo le marcaron ${s.conceded}`;
    } else if (s.goals >= 4) {
      nick = 'Pichichi';
      why = `${s.goals} goles en un partido`;
    } else if (p.role === 'DEF' && s.tackles >= 12) {
      nick = 'Candado';
      why = `recuperó ${s.tackles} balones`;
    }
    if (!nick || c.squad.some((q) => q.nick === nick)) continue;
    p.nick = nick;
    changeMorale(c, id, 4, `El barrio le ha puesto apodo: «${nick}»`);
    out.push({ id, name: first, nick, why });
  }
  return out;
}
