import type { Attributes, TraitId } from '../sim/types';
import type { Career, SquadPlayer } from './career';

/**
 * Moral de los jugadores, al estilo de un mánager de fútbol: un estado visible, con sus motivos,
 * que sube y baja por lo que pasa (resultados, notas, minutos, promesas, charlas, arenga) y que
 * cambia cómo juegan con una fórmula fija y documentada (ver `moraleMods`).
 */
export const MORALE_LEVELS = [
  { min: 82, label: 'Por las nubes' },
  { min: 65, label: 'Buena' },
  { min: 45, label: 'Normal' },
  { min: 25, label: 'Baja' },
  { min: 0, label: 'Por los suelos' },
];
export const moraleLabel = (m: number) => MORALE_LEVELS.find((l) => m >= l.min)!.label;

/** Con la moral alta juegan sueltos y corren más; hundidos, se precipitan y se esconden. */
export function moraleMods(m: number): Partial<Attributes> {
  return { composure: Math.round((m - 55) / 10), workRate: Math.round((m - 55) / 14) };
}

export function changeMorale(c: Career, id: string, delta: number, reason: string) {
  const p = c.squad.find((x) => x.id === id);
  if (!p || !delta) return;
  const d = Math.round(delta);
  p.morale = Math.max(5, Math.min(95, p.morale + d));
  p.moraleLog.unshift({ week: c.week, delta: d, reason });
  if (p.moraleLog.length > 8) p.moraleLog.length = 8;
}

const has = (p: SquadPlayer, t: TraitId) => p.traits.includes(t);

// ───────────────────────── nota del partido ─────────────────────────
export interface PlayerMatchStats {
  goals: number;
  shots: number;
  onTarget: number;
  passes: number;
  tackles: number;
  saves: number;
  fouls: number;
  yellows: number;
  red: boolean;
  conceded: number;
  minutes: number;
}
export const emptyStats = (): PlayerMatchStats => ({ goals: 0, shots: 0, onTarget: 0, passes: 0, tackles: 0, saves: 0, fouls: 0, yellows: 0, red: false, conceded: 0, minutes: 0 });

/** Nota de 1 a 10 a partir de lo que ha hecho en el campo (y del resultado). */
export function rating(s: PlayerMatchStats, gk: boolean, result: 'win' | 'draw' | 'loss') {
  let r = 6 + s.goals * 1.1 + s.onTarget * 0.15 + s.passes * 0.025 + s.tackles * 0.18 + s.saves * 0.35 - s.fouls * 0.12 - s.yellows * 0.3 - (s.red ? 1.5 : 0);
  if (gk) r -= Math.max(0, s.conceded - 1) * 0.35;
  r += result === 'win' ? 0.3 : result === 'loss' ? -0.3 : 0;
  return Math.max(3, Math.min(10, Math.round(r * 10) / 10));
}

// ───────────────────────── charlas (desde su ficha) ─────────────────────────
export type Talk = 'elogiar' | 'exigir' | 'minutos' | 'interesarse';
/**
 * Lo que puede decirle el míster. Sin avisar de qué pasará: elogiar funciona si de verdad está
 * jugando bien; pedirle más pica a unos y hunde a otros; prometer minutos alegra ahora y se paga
 * si el domingo no juega; preguntarle cómo está le hace contar qué le preocupa.
 */
export const TALK_OPTIONS: Record<Talk, { label: string }> = {
  elogiar: { label: 'Elogiar su forma' },
  exigir: { label: 'Pedirle más' },
  minutos: { label: 'Prometerle minutos' },
  interesarse: { label: 'Preguntarle cómo está' },
};

export interface TalkResult {
  lines: string[];
  tone: 'good' | 'bad' | 'info';
}

/** Charla con un jugador. El efecto depende de su forma real, de su carácter y de tu labia. */
export function talkTo(c: Career, p: SquadPlayer, t: Talk): TalkResult {
  c.weekDone[`charla:${p.id}`] = 1;
  const labia = 0.8 + 0.1 * c.coach.stats.labia.lv;
  const form = p.form[0];
  const name = p.nick ?? p.name.split(' ')[0];
  const f = p.look.gender === 'f';
  switch (t) {
    case 'elogiar': {
      if (form === undefined) return { lines: [`${name} aún no ha jugado. «¿Elogiarme por qué, míster?»`], tone: 'info' };
      if (form >= 6.8) {
        changeMorale(c, p.id, 7 * labia, `Le elogiaste tras un buen partido (${form.toFixed(1)})`);
        return { lines: [`«¡Gracias, míster!» Se le nota ${f ? 'contenta' : 'contento'}.`, `Moral: ${moraleLabel(p.morale)}.`], tone: 'good' };
      }
      const d = has(p, 'nervioso') ? 2 : -3;
      changeMorale(c, p.id, d, d > 0 ? 'Le diste ánimos aunque no estuvo bien' : `Elogio que no se cree (jugó mal: ${form.toFixed(1)})`);
      return { lines: [d > 0 ? 'No se lo cree mucho, pero le viene bien oírlo.' : '«¿Bien? Si estuve fatal...» Le suena a cumplido vacío.', `Moral: ${moraleLabel(p.morale)}.`], tone: d > 0 ? 'info' : 'bad' };
    }
    case 'exigir': {
      if (has(p, 'nervioso')) {
        changeMorale(c, p.id, -9, 'Le apretaste y se ha venido abajo');
        return { lines: ['Se queda blanco. Asiente sin decir nada.', `Moral: ${moraleLabel(p.morale)}.`], tone: 'bad' };
      }
      const thick = has(p, 'lenero') || has(p, 'pulmon') || has(p, 'goleadorNato');
      if (form !== undefined && form <= 6.2 && thick) {
        changeMorale(c, p.id, 4 * labia, 'Le pediste más y se ha picado para bien');
        return { lines: ['«Vale, míster. El domingo lo vas a ver.»', `Moral: ${moraleLabel(p.morale)}.`], tone: 'good' };
      }
      changeMorale(c, p.id, form !== undefined && form >= 7 ? -7 : -4, form !== undefined && form >= 7 ? 'Le exigiste más tras jugar bien' : 'Le pediste más');
      return { lines: [form !== undefined && form >= 7 ? '«¿Más? Si fui de lo mejor...» No lo entiende.' : 'Lo encaja regular.', `Moral: ${moraleLabel(p.morale)}.`], tone: 'bad' };
    }
    case 'minutos': {
      if (!c.promises.some((x) => x.id === p.id)) c.promises.push({ id: p.id, kind: 'minutes', week: c.week });
      changeMorale(c, p.id, 5 * labia, 'Le prometiste minutos');
      return { lines: [`«¿En serio? ¡Gracias!» Ahora le debes minutos el domingo.`, `Moral: ${moraleLabel(p.morale)}.`], tone: 'good' };
    }
    case 'interesarse': {
      const worst = p.moraleLog.filter((e) => e.delta < 0)[0];
      const best = p.moraleLog.filter((e) => e.delta > 0)[0];
      const lines = [worst ? `Lo que le ronda: «${worst.reason.toLowerCase()}».` : 'Dice que está bien. Y parece verdad.'];
      if (best) lines.push(`Lo que le animó: «${best.reason.toLowerCase()}».`);
      if (c.coach.stats.labia.lv >= 2) changeMorale(c, p.id, 2, 'El míster se interesó por cómo estaba');
      lines.push(`Moral: ${moraleLabel(p.morale)}.`);
      return { lines, tone: 'info' };
    }
  }
}
