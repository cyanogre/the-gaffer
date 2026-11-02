import { FORMATIONS } from '../sim/formations';
import { rivalProfile } from '../content/teams';
import type { Attributes, Role } from '../sim/types';
import { DAYS, MATCH_DAY, decayStats, gainXp, maxEnergy, rivalOf, rngFor, type Career, type LocationId, type StatId } from './career';
import { changeMorale, moraleLabel } from './morale';
import { FOCUS, attrLabel, isTrainingSlot, recover, train, type Focus } from './squad';

/**
 * Lo que el míster puede hacer en cada sitio. Cada acción gasta una franja (salvo las que dicen
 * lo contrario), cuesta energía y a veces dinero, y cambia algo que otro sistema usa.
 */
export interface ActionResult {
  title: string;
  lines: string[];
  tone?: 'good' | 'bad' | 'info';
}

export interface ActionDef {
  id: string;
  where: LocationId;
  hotspot: string;
  label: string;
  hint: string;
  energy: number;
  wallet?: number;
  slots: number[];
  days?: number[];
  usesSlot?: boolean;
  once?: 'day' | 'week';
  needs?: 'focus' | 'player';
  /** Estadística que entrena (para la etiqueta). */
  trains?: StatId;
  check?: (c: Career) => string | null;
  run: (c: Career, arg?: string) => ActionResult;
}

const WORKDAYS = [0, 1, 2, 3, 4, 5];
const lvl = (c: Career, s: StatId) => c.coach.stats[s].lv;
const firstName = (c: Career, id: string) => {
  const p = c.squad.find((x) => x.id === id)!;
  return p.nick ?? p.name.split(' ')[0];
};
function xp(c: Career, r: ActionResult, s: StatId, n: number) {
  const up = gainXp(c, s, n);
  if (up) {
    r.lines.push(up);
    r.tone = 'good';
  }
}

/** Un café a solas: cada carácter se gana (o no) a su manera. Si sale bien, le sube la moral. */
const CHATS: Record<string, { ok: string; ko: string }> = {
  goleadorNato: { ok: 'Le convences de que la sequía es pura estadística. Se va a casa silbando.', ko: 'Te enseña cuarenta vídeos de sus goles en alevines. Pagas tú.' },
  egoista: { ok: 'Le prometes grabarle un vídeo si da tres pases. Acepta el reto.', ko: 'Se pasa la tarde contestando comentarios en el móvil.' },
  lenero: { ok: 'Le pides que el domingo no se haga expulsar. Promete intentarlo.', ko: 'Dice que el árbitro le tiene manía desde hace años. No hay forma.' },
  padel: { ok: 'Una hora hablando de pádel. Se siente escuchado.', ko: 'Te ha apuntado a un torneo de pádel. Sin preguntar.' },
  pulmon: { ok: 'Te propone correr juntos el sábado. Le dices que sí por educación.', ko: 'Pide agua del grifo y se va a las nueve a dormir.' },
  artista: { ok: 'Te explica su jugada soñada. La escuchas entera. Le encanta.', ko: 'Te explica una jugada con servilletas. Ocupa toda la barra.' },
  piscinero: { ok: 'Le pides que no se tire. Jura por su profesora de teatro.', ko: 'Se cae del taburete para enseñarte su técnica. Manolo no se ríe.' },
  nervioso: { ok: 'Le das confianza. Por primera vez en semanas, no tiembla al coger el vaso.', ko: 'Le has puesto más nervioso hablándole del domingo.' },
  none: { ok: 'Charla de fútbol y de la vida. Sale con ganas de que llegue el domingo.', ko: 'Habláis del tiempo. Del tiempo atmosférico. Una hora.' },
};

export const ACTIONS: ActionDef[] = [
  // ── casa
  {
    id: 'estudiar',
    where: 'casa',
    hotspot: 'board',
    label: 'Estudiar táctica',
    hint: 'Táctica + · la formación entra mejor',
    energy: 15,
    slots: [0, 1, 2],
    trains: 'tactica',
    run: (c) => {
      const fm = c.planned.formation;
      const before = c.familiarity[fm];
      c.familiarity[fm] = Math.min(1, before + 0.03 * (1 + 0.1 * (lvl(c, 'tactica') - 1)));
      const r: ActionResult = { title: 'Horas de pizarra', lines: [`Repasas el ${fm} con chinchetas y un rotulador que pinta a ratos. Familiaridad ${Math.round(before * 100)} → ${Math.round(c.familiarity[fm] * 100)} %.`] };
      xp(c, r, 'tactica', 4);
      return r;
    },
  },
  {
    id: 'videos',
    where: 'casa',
    hotspot: 'laptop',
    label: 'Ver partidos',
    hint: 'Ojo + · vídeos de la liga',
    energy: 10,
    slots: [0, 1, 2],
    trains: 'ojo',
    run: (c) => {
      const r: ActionResult = { title: 'Vídeos de la liga', lines: ['Grabados con móvil desde la valla. Se ve el 60 % del campo y el 100 % de un señor con boina.'] };
      xp(c, r, 'ojo', 3);
      xp(c, r, 'tactica', 1);
      return r;
    },
  },
  {
    id: 'descansar',
    where: 'casa',
    hotspot: 'sofa',
    label: 'Descansar',
    hint: 'Recupera energía',
    energy: -35,
    slots: [0, 1],
    run: () => ({ title: 'Sofá', lines: ['Siesta con la tele de fondo. Sale un documental de pingüinos. Te emociona más de lo que admitirías.'] }),
  },
  {
    id: 'dormir',
    where: 'casa',
    hotspot: 'bed',
    label: 'Dormir',
    hint: 'Termina el día · energía al máximo',
    energy: 0,
    slots: [0, 1, 2],
    run: () => ({ title: 'A dormir', lines: ['Te acuestas pronto. Mañana será otro día (literalmente).'] }),
  },
  // ── campo
  {
    id: 'entrenar',
    where: 'campo',
    hotspot: 'pitch',
    label: 'Entrenamiento',
    hint: 'Martes y jueves por la tarde',
    energy: 28,
    slots: [1],
    days: [1, 3],
    needs: 'focus',
    trains: 'tactica',
    run: (c, arg) => {
      const focus = (arg ?? 'partidillo') as Focus;
      const rep = train(c, focus);
      return { title: `Entrenamiento: ${FOCUS[focus].label}`, lines: rep.lines, tone: rep.gains.length ? 'good' : 'info' };
    },
  },
  {
    id: 'correr',
    where: 'campo',
    hotspot: 'track',
    label: 'Salir a correr',
    hint: 'Forma + · solo por la mañana',
    energy: 22,
    slots: [0],
    trains: 'forma',
    run: (c) => {
      const r: ActionResult = { title: 'Vueltas al Barrizal', lines: [rngFor(c, 'correr').pick(['Doce vueltas. El perro del barrio hace catorce y te mira con superioridad.', 'Corres junto a la valla. Un vecino te grita «¡ánimo, míster!» desde un balcón.', 'Pisas el único charco del campo. Dos veces.'])] };
      xp(c, r, 'forma', 5);
      return r;
    },
  },
  {
    id: 'ojear',
    where: 'campo',
    hotspot: 'fence',
    label: 'Ojear al rival',
    hint: 'Sábado · descubre cómo juega',
    energy: 15,
    slots: [0, 1],
    days: [5],
    once: 'week',
    trains: 'ojo',
    run: (c) => {
      c.scouted = Math.max(c.scouted, lvl(c, 'ojo'));
      const r: ActionResult = { title: `Ojeando al ${rivalOf(c).name}`, lines: ['Entrenan en el descampado de al lado. Te escondes detrás de una furgoneta.', ...scoutReport(c)] };
      xp(c, r, 'ojo', 5);
      c.scouted = Math.max(c.scouted, lvl(c, 'ojo'));
      return r;
    },
  },
  // ── bar
  {
    id: 'parroquia',
    where: 'bar',
    hotspot: 'barra',
    label: 'Charlar en la barra',
    hint: 'Labia + · puede traer aficionados',
    energy: 12,
    wallet: 4,
    slots: [1, 2],
    trains: 'labia',
    run: (c) => {
      const rng = rngFor(c, 'parroquia');
      const r: ActionResult = { title: 'En la barra de Manolo', lines: [] };
      if (rng.chance(0.25 + 0.07 * lvl(c, 'labia'))) {
        const n = rng.int(1, 2);
        c.fans += n;
        r.lines.push(rng.pick(['Convences a los del dominó de que vengan el domingo.', 'Un camionero promete traer a su cuñado. Y a su perro.', 'La peña de los jubilados se apunta. Traen bocadillos.']) + ` (+${n} aficionados)`);
        r.tone = 'good';
      } else r.lines.push(rng.pick(['Debate de una hora sobre si el VAR existe en el barrio. No existe.', 'Te cuentan tres veces la final de 1982. Cada vez con un resultado distinto.']));
      xp(c, r, 'labia', 4);
      return r;
    },
  },
  {
    id: 'invitar',
    where: 'bar',
    hotspot: 'mesa',
    label: 'Invitar a alguien',
    hint: 'Charla a solas · le sube la moral si sale bien',
    energy: 10,
    wallet: 8,
    slots: [1, 2],
    needs: 'player',
    trains: 'labia',
    run: (c, id) => {
      const p = c.squad.find((x) => x.id === id)!;
      c.weekDone[`invitar:${p.id}`] = 1;
      const chat = CHATS[p.traits[0] ?? 'none'];
      const hard = p.traits.includes('egoista') || p.traits.includes('lenero') ? 0.12 : 0;
      const ok = rngFor(c, `invitar:${p.id}`).chance(0.45 + 0.08 * lvl(c, 'labia') - hard);
      const r: ActionResult = { title: `Un café con ${firstName(c, p.id)}`, lines: [ok ? chat.ok : chat.ko], tone: ok ? 'good' : 'info' };
      if (ok) {
        changeMorale(c, p.id, 6 + lvl(c, 'labia'), 'Un café con el míster');
        r.lines.push(`Su moral: ${moraleLabel(p.morale)}.`);
      }
      xp(c, r, 'labia', 2);
      return r;
    },
  },
  {
    id: 'bocata',
    where: 'bar',
    hotspot: 'cocina',
    label: 'Bocadillo de calamares',
    hint: 'Energía + · no gasta franja',
    energy: -22,
    wallet: 5,
    slots: [0, 1, 2],
    usesSlot: false,
    once: 'day',
    run: (c) => ({ title: 'Bocata de calamares', lines: [c.flags.manoloEnfadado ? 'Manolo te lo cobra a precio de turista. Pero está bueno.' : 'Manolo te pone doble de alioli «por lo del domingo».'] }),
  },
  // ── ferretería
  {
    id: 'turno',
    where: 'ferreteria',
    hotspot: 'mostrador',
    label: 'Echar un turno',
    hint: 'Cartera + · a Don Ramón le gusta',
    energy: 30,
    slots: [0, 1],
    trains: 'labia',
    run: (c) => {
      let pay = 22 + 4 * lvl(c, 'labia');
      const owed = c.flags.adelanto ? Math.min(30, pay) : 0;
      if (owed) {
        pay -= owed;
        delete c.flags.adelanto;
      }
      c.coach.wallet += pay;
      c.boardTrust = Math.min(100, c.boardTrust + 1);
      const rng = rngFor(c, 'turno');
      const r: ActionResult = {
        title: 'Turno en la ferretería',
        lines: [rng.pick(['Vendes 200 tornillos de uno en uno. Una señora pide «el de siempre». No sabes cuál es.', 'Un cliente quiere devolver un martillo «porque no clava solo».', 'Don Ramón te enseña a hacer copias de llaves. Te equivocas con la del bar.']), `+${pay} € en tu cartera${owed ? ` (te descuenta ${owed} € del adelanto)` : ''} · Don Ramón, contento (+1 confianza).`],
        tone: 'good',
      };
      xp(c, r, 'labia', 1);
      return r;
    },
  },
  {
    id: 'ramon',
    where: 'ferreteria',
    hotspot: 'despacho',
    label: 'Hablar con Don Ramón',
    hint: 'Una vez por semana · confianza',
    energy: 8,
    slots: [0, 1],
    once: 'week',
    trains: 'labia',
    run: (c) => {
      const ok = rngFor(c, 'ramon').chance(0.4 + 0.1 * lvl(c, 'labia'));
      const mood = c.boardTrust >= 65 ? 'Está encantado contigo. Habla de renovarte «de palabra, que es lo que vale».' : c.boardTrust >= 35 ? 'Te mira por encima de las gafas. Espera resultados.' : 'Dice que su cuñado «también entiende de fútbol». Mala señal.';
      const r: ActionResult = { title: 'El despacho de Don Ramón', lines: [mood] };
      if (ok) {
        c.boardTrust = Math.min(100, c.boardTrust + 3);
        r.lines.push('Le explicas el plan con un tornillo y dos tuercas. Lo entiende. +3 de confianza.');
        r.tone = 'good';
      } else r.lines.push('Te pasa el catálogo de bisagras. No es momento de hablar de fútbol.');
      xp(c, r, 'labia', 2);
      return r;
    },
  },
];

/** Informe del rival según tu ojo (y si lo has ojeado esta semana). */
export function scoutReport(c: Career): string[] {
  const rv = rivalOf(c);
  const lv = c.scouted;
  if (!lv) return [`${rv.name}: ${rv.motto}`, 'No lo has ojeado. El sábado entrenan en el descampado de al lado.'];
  const team = rivalProfile(c.seed, c.gender, rv);
  const out = [`Juegan con ${rv.formation}.`];
  if (lv >= 2) {
    const best = [...team.players].slice(1).sort((a, b) => b.attrs.shooting + b.attrs.dribbling - (a.attrs.shooting + a.attrs.dribbling))[0];
    const top = (Object.entries(best.attrs) as [keyof Attributes, number][]).filter(([k]) => k !== 'keeping').sort((a, b) => b[1] - a[1])[0];
    out.push(`Peligro: ${best.nick ? `«${best.nick}»` : best.name} (#${best.num}), destaca en ${attrLabel(top[0])} (${Math.floor(top[1])}).`);
  } else out.push('Con más ojo sabrías quién es el peligroso.');
  if (lv >= 3) {
    const roles: Role[] = ['DEF', 'MED', 'DEL'];
    const slots = FORMATIONS[rv.formation];
    const avg = (role: Role, k: keyof Attributes) => {
      const ps = team.players.filter((_, i) => slots[i].role === role);
      return ps.reduce((s, p) => s + p.attrs[k], 0) / ps.length;
    };
    const weak = roles.map((ro) => ({ ro, k: (ro === 'DEF' ? 'pace' : ro === 'MED' ? 'stamina' : 'composure') as keyof Attributes })).map((x) => ({ ...x, v: avg(x.ro, x.k) })).sort((a, b) => a.v - b.v)[0];
    const name = { DEF: 'defensa', MED: 'centro del campo', DEL: 'delantera' }[weak.ro as 'DEF' | 'MED' | 'DEL'];
    out.push(`Punto débil: su ${name} anda floja de ${attrLabel(weak.k)} (media ${weak.v.toFixed(0)}).`);
  } else out.push('Con más ojo verías su punto débil.');
  return out;
}

// ───────────────────────── disponibilidad y ejecución ─────────────────────────
export function actionsAt(where: LocationId) {
  return ACTIONS.filter((a) => a.where === where);
}

/** Por qué no se puede hacer ahora (o null si se puede). */
export function blocked(c: Career, a: ActionDef): string | null {
  if (c.day >= MATCH_DAY) return 'Hoy es día de partido';
  const days = a.days ?? WORKDAYS;
  if (!days.includes(c.day) || !a.slots.includes(c.slot)) {
    if (a.id === 'entrenar') return 'Martes y jueves por la tarde';
    if (a.id === 'ojear') return 'El sábado (mañana o tarde)';
    const s = a.slots.map((x) => ['mañana', 'tarde', 'noche'][x]).join(' o ');
    return `Solo por la ${s}`;
  }
  if (a.once === 'day' && c.dayDone[a.id]) return 'Ya lo has hecho hoy';
  if (a.once === 'week' && c.weekDone[a.id]) return 'Ya lo has hecho esta semana';
  if (a.energy > 0 && c.coach.energy < a.energy) return 'Te falta energía';
  if (a.wallet && c.coach.wallet < a.wallet) return 'No te llega la cartera';
  if (a.id === 'entrenar' && !isTrainingSlot(c)) return 'Martes y jueves por la tarde';
  return a.check?.(c) ?? null;
}

export interface Outcome extends ActionResult {
  dayEnded: boolean;
}

/** Ejecuta una acción: cobra, la resuelve y avanza el reloj. */
export function perform(c: Career, a: ActionDef, arg?: string): Outcome {
  const why = blocked(c, a);
  if (why) return { title: a.label, lines: [why], tone: 'bad', dayEnded: false };
  const max = maxEnergy(c);
  c.coach.energy = Math.max(0, Math.min(max, c.coach.energy - a.energy));
  if (a.wallet) c.coach.wallet -= a.wallet;
  if (a.once === 'day') c.dayDone[a.id] = true;
  if (a.once === 'week') c.weekDone[a.id] = 1;
  const res = a.run(c, arg);
  let dayEnded = false;
  if (a.id === 'dormir') {
    endDay(c, true);
    dayEnded = true;
  } else if (a.usesSlot !== false) dayEnded = advanceSlot(c);
  return { ...res, dayEnded };
}

/** Pasa a la siguiente franja. Devuelve true si se acaba el día. */
export function advanceSlot(c: Career): boolean {
  c.slot++;
  if (c.slot <= 2) return false;
  endDay(c, c.location === 'casa');
  return true;
}

/** Fin del día: se duerme. En casa y pronto, del tirón; si no, a medias. */
export function endDay(c: Career, restful: boolean) {
  // lo que no se ha trabajado hoy, baja (antes de reponer energía: la Forma decide el máximo)
  c.dayNotes = decayStats(c);
  const max = maxEnergy(c);
  c.coach.energy = Math.min(max, c.coach.energy + (restful ? max : Math.round(max * 0.6)));
  recover(c);
  c.day++;
  c.slot = 0;
  c.dayDone = {};
  c.location = 'casa';
}

export const dayLabel = (c: Career) => (c.day >= MATCH_DAY ? 'Domingo · partido' : `${DAYS[c.day]} · ${['Mañana', 'Tarde', 'Noche'][c.slot]}`);
