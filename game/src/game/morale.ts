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
/**
 * Hablar con un jugador (una vez por semana). No hay un menú de frases sueltas: te cuenta lo que de
 * verdad le pasa (no juega, jugó muy bien, jugó mal, está de bajón...) y tú eliges entre dos
 * respuestas que encajan con eso. Lo que pasa después depende de su carácter y de tu labia; no se
 * anuncia (se ve en su moral, con el motivo).
 */
export type TalkMood = 'neutral' | 'happy' | 'angry' | 'sleepy' | 'nervous' | 'smug';
export interface TalkReply {
  text: string;
  /** Aplica la consecuencia y devuelve lo que contesta (y con qué cara). */
  pick: (c: Career) => { text: string; expr: TalkMood };
}
export interface TalkTopic {
  id: 'banquillo' | 'buenPartido' | 'malPartido' | 'bajon' | 'charla';
  opener: string;
  expr: TalkMood;
  replies: [TalkReply, TalkReply];
}

/** Los que se crecen cuando les aprietan. */
const competitive = (p: SquadPlayer) => has(p, 'lenero') || has(p, 'pulmon') || has(p, 'goleadorNato') || has(p, 'egoista');

export function talkTopic(c: Career, p: SquadPlayer): TalkTopic {
  const labia = 0.8 + 0.1 * c.coach.stats.labia.lv;
  const f = p.look.gender === 'f';
  const o = (m: string, fem: string) => (f ? fem : m);
  const done = () => (c.weekDone[`charla:${p.id}`] = 1);
  const form = p.form[0];
  const starter = c.lineup.includes(p.id);
  const say = (d: number, reason: string, text: string, expr: TalkMood) => {
    done();
    changeMorale(c, p.id, d, reason);
    return { text, expr };
  };
  // 1. no juega y le pesa
  if (!starter && p.morale < 62)
    return {
      id: 'banquillo',
      opener: 'Míster, ¿por qué no juego? Entreno como el que más.',
      expr: 'angry',
      replies: [
        {
          text: 'Te lo has ganado: el domingo juegas.',
          pick: (cc) => {
            if (!cc.promises.some((x) => x.id === p.id)) cc.promises.push({ id: p.id, kind: 'minutes', week: cc.week });
            return say(6 * labia, 'Le prometiste que jugará el domingo', '¿En serio? ¡No te vas a arrepentir!', 'happy');
          },
        },
        {
          text: 'Gánatelo en los entrenos.',
          pick: () =>
            has(p, 'nervioso')
              ? say(-6, 'Sigue sin saber qué hace mal para no jugar', 'Vale... Lo intentaré.', 'nervous')
              : competitive(p)
                ? say(3, 'El míster le retó a ganarse el puesto', 'Pues el martes me vas a ver.', 'smug')
                : say(-3, 'Sigue en el banquillo sin explicación', 'Ya. Vale.', 'neutral'),
        },
      ],
    };
  // 2. tras un gran partido
  if (form !== undefined && form >= 7.2)
    return {
      id: 'buenPartido',
      opener: `¿Qué tal estuve el domingo, míster? Sé sincer${o('o', 'a')}.`,
      expr: 'happy',
      replies: [
        { text: 'De lo mejor del equipo. Sigue así.', pick: () => say(6 * labia, `Le felicitaste por su partido (${form.toFixed(1)})`, '¡Gracias! Mi madre lo grabó entero.', 'happy') },
        {
          text: 'Bien, pero puedes dar más.',
          pick: () =>
            competitive(p)
              ? say(3, 'Le pediste más tras jugar bien (y se ha picado)', 'Más. Vale. Te vas a enterar.', 'smug')
              : has(p, 'nervioso') || has(p, 'artista')
                ? say(-6, `Le pediste más tras jugar bien (${form.toFixed(1)})`, '¿Más? Si fue mi mejor partido...', 'sleepy')
                : say(-2, 'Le pediste más tras jugar bien', 'Vale, míster.', 'neutral'),
        },
      ],
    };
  // 3. tras un mal partido
  if (form !== undefined && form <= 5.8)
    return {
      id: 'malPartido',
      opener: 'Lo siento por lo del domingo, míster. No me salía nada.',
      expr: 'sleepy',
      replies: [
        {
          text: 'Tranquil' + o('o', 'a') + ', un mal día lo tiene cualquiera.',
          pick: () => say((has(p, 'nervioso') ? 8 : 4) * labia, 'Le arropaste tras un mal partido', 'Gracias. El próximo, mejor.', 'happy'),
        },
        {
          text: 'Eso no se puede repetir.',
          pick: () =>
            has(p, 'nervioso')
              ? say(-9, 'Le apretaste tras un mal partido y se ha hundido', '...', 'nervous')
              : competitive(p)
                ? say(3, 'Le apretaste tras un mal partido (y se ha picado)', 'No se repetirá. Palabra.', 'angry')
                : say(-4, 'Le apretaste tras un mal partido', 'Ya lo sé, míster.', 'sleepy'),
        },
      ],
    };
  // 4. de bajón por algo concreto
  const worst = p.moraleLog.find((e) => e.delta < 0);
  if (p.morale < 40 && worst)
    return {
      id: 'bajon',
      opener: `Estoy un poco de bajón, míster. ${worst.reason}.`,
      expr: 'sleepy',
      replies: [
        { text: 'Cuenta conmigo para lo que sea.', pick: () => say(5 * labia, 'El míster le escuchó cuando estaba de bajón', 'Gracias, de verdad.', 'happy') },
        {
          text: 'Aquí se viene a jugar, no a llorar.',
          pick: () => (competitive(p) ? say(1, 'Le dijiste que espabile', 'Vale. Espabilo.', 'angry') : say(-6, 'Le contaste lo que le pasa y no le escuchaste', 'Vale. Ya me callo.', 'angry')),
        },
      ],
    };
  // 5. todo en orden
  return {
    id: 'charla',
    opener: `Todo bien, míster. ¿Querías algo?`,
    expr: 'neutral',
    replies: [
      { text: 'Solo saber cómo estás. Sigue así.', pick: () => say(2 * labia, 'El míster se interesó por cómo estaba', 'Pues muy bien, la verdad.', 'happy') },
      {
        text: 'Quiero verte más metid' + o('o', 'a') + ' en los entrenos.',
        pick: () => (has(p, 'nervioso') ? say(-4, 'Le pediste más sin motivo y le ha agobiado', 'Ah... vale.', 'nervous') : competitive(p) ? say(2, 'Le pediste más en los entrenos', 'Hecho.', 'smug') : say(-1, 'Le pediste más en los entrenos', 'Vale.', 'neutral')),
      },
    ],
  };
}
