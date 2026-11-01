import { generateClub, type TeamDef } from '../content/clubs';
import { DIVISIONS, divisionIndex } from '../content/divisions';
import { SQUAD_INDEX, clubSquad, youthLook } from '../content/teams';
import { Rng } from '../sim/rng';
import type { Attributes, MatchEventKind } from '../sim/types';
import { attendance, division, maxEnergy, rivalOf, seasonWeeks, type Career } from './career';
import { newLeague, playRound, positionOf } from './league';
import { attrLabel, bestEleven } from './squad';

/**
 * Domingo y cierre de semana: arenga, taquilla, liga, periódico del lunes, alquiler y despido.
 */

// ───────────────────────── arenga ─────────────────────────
export type Talk = 'calma' | 'piel' | 'exigir';
export const TALKS: Record<Talk, { label: string; line: string; base: Partial<Attributes>; likes: string[]; hates: string[] }> = {
  calma: { label: 'Tranquilidad: a disfrutar', line: '«Hoy no hay presión. Jugad como en el patio del colegio.»', base: { composure: 2, aggression: -1 }, likes: ['nervioso', 'artista'], hates: ['pulmon'] },
  piel: { label: '¡Hoy nos dejamos la piel!', line: '«¡El barrio nos mira! ¡Cada balón es el último!»', base: { workRate: 2, aggression: 1, composure: -1 }, likes: ['pulmon', 'lenero', 'padel'], hates: ['nervioso'] },
  exigir: { label: 'El que no corra, al banquillo', line: '«El que se esconda, el domingo que viene lo ve desde el bar.»', base: { workRate: 2, composure: -1 }, likes: ['goleadorNato'], hates: ['egoista', 'artista'] },
};

/** Aplica la arenga al once: la fuerza depende de tu labia y cada carácter reacciona a su manera. */
export function teamTalk(c: Career, kind: Talk): string[] {
  const t = TALKS[kind];
  const k = 0.6 + 0.15 * c.coach.stats.labia.lv;
  const lines = [t.line];
  const loved: string[] = [];
  const hated: string[] = [];
  for (const id of c.lineup) {
    const p = c.squad.find((x) => x.id === id)!;
    const m = (c.mods[id] ??= {});
    let f = k;
    if (p.traits.some((x) => t.likes.includes(x))) {
      f *= 1.6;
      loved.push(p.nick ?? p.name.split(' ')[0]);
    } else if (p.traits.some((x) => t.hates.includes(x))) {
      f *= -0.6;
      hated.push(p.nick ?? p.name.split(' ')[0]);
    }
    for (const [a, v] of Object.entries(t.base) as [keyof Attributes, number][]) m[a] = Math.round(((m[a] ?? 0) + v * f) * 10) / 10;
  }
  const eff = Object.entries(t.base).map(([a, v]) => `${attrLabel(a as keyof Attributes)} ${v > 0 ? '+' : '−'}${Math.abs(v * k).toFixed(1)}`).join(', ');
  lines.push(`Al once: ${eff}.`);
  if (loved.length) lines.push(`Les llega al alma: ${loved.join(', ')}.`);
  if (hated.length) lines.push(`Les sienta fatal: ${hated.join(', ')}.`);
  c.talkDone = true;
  return lines;
}

// ───────────────────────── resultado ─────────────────────────
/** Lo que la interfaz recoge del motor para cerrar la jornada (sin depender del motor). */
export interface MatchOutcome {
  score: [number, number];
  /** Ids de tus goleadores (uno por gol, en orden). */
  scorers: string[];
  /** Ids de quienes han jugado algún minuto. */
  played: string[];
  /** Recuento de eventos por equipo. */
  counts: [Partial<Record<MatchEventKind, number>>, Partial<Record<MatchEventKind, number>>];
  ownGoals: [number, number];
}

export interface Summary {
  lines: string[];
  fansDelta: number;
  moneyDelta: number;
  trustDelta: number;
  result: 'win' | 'draw' | 'loss';
  position: number;
  headline: string;
  sub: string;
}

/** Portada de «El Eco del Barrio»: sale de lo que ha pasado en el partido. */
export function headline(c: Career, o: MatchOutcome): { headline: string; sub: string } {
  const [g, a] = o.score;
  const rival = rivalOf(c);
  const name = (id: string) => {
    const p = c.squad.find((x) => x.id === id)!;
    return p.nick ?? p.name.split(' ').slice(-1)[0];
  };
  const goleador = c.club.id === 'barrio' ? c.squad[SQUAD_INDEX.goleador] : c.squad[9];
  const slips = (o.counts[0].slip ?? 0) + (o.counts[1].slip ?? 0);
  const reds = (o.counts[0].red ?? 0) + (o.counts[1].red ?? 0);
  const dives = o.counts[0].dive ?? 0;
  const byScorer = new Map<string, number>();
  for (const s of o.scorers) byScorer.set(s, (byScorer.get(s) ?? 0) + 1);
  const hat = [...byScorer].find(([, n]) => n >= 3);
  const sub = `${c.club.name} ${g} – ${a} ${rival.name}`;
  if (hat) return { headline: `${name(hat[0]).toUpperCase()} SE LLEVA EL BALÓN A CASA`, sub: `Triplete en El Barrizal. ${sub}.` };
  if (byScorer.has(goleador.id) && (goleador.drought ?? 0) >= 5) return { headline: `¡${name(goleador.id).toUpperCase()} MARCA! (POR FIN)`, sub: `Rompe una sequía de ${goleador.drought} partidos. Lo celebra como si fuera la final del mundo. ${sub}.` };
  if (o.ownGoals[0] > 0) return { headline: 'GOL EN PROPIA PUERTA Y SILENCIO EN LA BARRA', sub: `Nadie quiere hablar de ello. ${sub}.` };
  if (reds >= 2) return { headline: 'TARDE DE TARJETAS EN EL BARRIZAL', sub: `${reds} expulsiones. El árbitro pide escolta hasta el autobús. ${sub}.` };
  if (slips >= 6) return { headline: 'PATINAJE ARTÍSTICO EN EL BARRIZAL', sub: `${slips} resbalones contados por la abuela Mari. ${sub}.` };
  if (dives >= 2) return { headline: 'SE INVESTIGA UNA POSIBLE OBRA DE TEATRO', sub: `${dives} piscinazos de los tuyos. La escuela de interpretación del barrio, orgullosa. ${sub}.` };
  if (g + a >= 6) return { headline: 'NADIE DEFIENDE Y TODOS SE DIVIERTEN', sub: `${g + a} goles. Manolo agota las pipas. ${sub}.` };
  if (g === 0 && a === 0) return { headline: 'EMPATE SIN GOLES Y CON MUCHO BOSTEZO', sub: `Lo más emocionante fue el perro. ${sub}.` };
  if (g > a + 2) return { headline: `EL ${c.club.short} PASA POR ENCIMA`, sub: `Exhibición en casa. ${sub}.` };
  if (a > g + 2) return { headline: 'NOCHE PARA OLVIDAR', sub: `Don Ramón abandona el palco (una silla de plástico) antes del final. ${sub}.` };
  if (g > a) return { headline: 'VICTORIA DE BARRIO', sub: `Sufrida y celebrada. ${sub}.` };
  if (g === a) return { headline: 'REPARTO DE PUNTOS', sub: `Ni para ti ni para mí. ${sub}.` };
  return { headline: 'TROPIEZO EN CASA', sub: `El míster pide calma. ${sub}.` };
}

/** Cierra la jornada: dinero, aficionados, confianza, liga, periódico y semana nueva. */
export function closeWeek(c: Career, o: MatchOutcome): Summary {
  const [g, a] = o.score;
  const result = g > a ? 'win' : g === a ? 'draw' : 'loss';
  const lines: string[] = [];
  const rival = rivalOf(c);
  const crowd = attendance(c);
  // aficionados
  let fans = result === 'win' ? 3 : result === 'draw' ? 1 : -1;
  fans += Math.min(4, g);
  if (g + a >= 5) {
    fans += 2;
    lines.push('Partido loco: los vecinos lo comentan en la panadería (+2 aficionados).');
  }
  // caja del club
  let money = crowd * 3 - 45;
  lines.push(`Taquilla: ${crowd} personas × 3 € = ${crowd * 3} €. Árbitro y material: −45 €.`);
  if (c.sponsor === 'manolo') {
    money += 25;
    lines.push('Bar Manolo paga su patrocinio semanal: +25 €.');
  }
  // directiva
  let trust = result === 'win' ? 6 : result === 'draw' ? 0 : -6;
  if (c.promise === 'win') {
    trust += result === 'win' ? 6 : -10;
    lines.push(result === 'win' ? 'Prometiste ganar y has ganado. Don Ramón te invita a un carajillo.' : 'Prometiste ganar. Don Ramón lo recuerda. Mucho.');
  } else if (c.promise === 'fun') {
    const ok = g + a >= 3;
    trust += ok ? 5 : -4;
    fans += ok ? 2 : 0;
    lines.push(ok ? 'Prometiste espectáculo y lo hubo.' : 'Prometiste espectáculo. Hubo bostezos.');
  }
  c.money += money;
  c.fans = Math.max(3, c.fans + fans);
  c.boardTrust = Math.max(0, Math.min(100, c.boardTrust + trust));
  // jugadores
  for (const id of o.played) {
    const p = c.squad.find((x) => x.id === id);
    if (p) p.apps++;
  }
  for (const id of o.scorers) {
    const p = c.squad.find((x) => x.id === id);
    if (p) p.goals++;
  }
  const paper = headline(c, o);
  for (const p of c.squad) {
    if (p.drought === undefined) continue;
    if (o.scorers.includes(p.id)) p.drought = 0;
    else if (o.played.includes(p.id)) p.drought++;
  }
  // liga (de momento todos tus partidos se juegan en tu campo: eres siempre el de casa)
  const round = c.week - 1;
  const pair = c.league.rounds[round].find((m) => m.includes(c.club.id))!;
  const ours = pair[0] === c.club.id ? { home: pair[0], away: pair[1], score: [g, a] as [number, number] } : { home: pair[0], away: pair[1], score: [a, g] as [number, number] };
  playRound(c.league, round, c.seed + c.season * 1000, ours);
  const position = positionOf(c.league, c.club.id);
  c.history.push({ week: c.week, rival: rival.name, rivalId: rival.id, score: [g, a], fansDelta: fans, moneyDelta: money, trustDelta: trust, headline: paper.headline, sub: paper.sub });
  lines.push(`Tras la jornada ${c.week}: ${position}º en la liga.`);
  // semana nueva
  c.week++;
  c.day = 0;
  c.slot = 0;
  c.location = 'casa';
  c.promise = null;
  c.mods = {};
  c.modNotes = {};
  c.absent = {};
  c.weekDone = {};
  c.dayDone = {};
  c.scouted = 0;
  c.talkDone = false;
  for (const p of c.squad) p.load = 0;
  // sueldo (si lo hay) y alquiler del míster
  if (c.coach.salary) {
    c.coach.wallet += c.coach.salary;
    lines.push(`Tu sueldo del club: +${c.coach.salary} €.`);
  }
  c.coach.wallet -= 50;
  c.hungry = c.coach.wallet < 0;
  lines.push(c.hungry ? 'Alquiler: −50 € de tu cartera. Estás en números rojos: esta semana comes de lata (−20 de energía máxima).' : 'Alquiler: −50 € de tu cartera.');
  c.coach.energy = maxEnergy(c);
  if (c.boardTrust < 10) c.status = 'fired';
  else if (c.week > seasonWeeks(c)) c.status = 'seasonEnd';
  return { lines, fansDelta: fans, moneyDelta: money, trustDelta: trust, result, position, headline: paper.headline, sub: paper.sub };
}

// ───────────────────────── fin de temporada ─────────────────────────
export interface SeasonEnd {
  position: number;
  champion: boolean;
  promoted: boolean;
  relegated: boolean;
  /** Oferta de un club de Segunda Federación (al ganar la liga con el Barriobajo en regional). */
  offer: TeamDef | null;
}

const SEGUNDA_FED = divisionIndex('segunda-federacion');

export function seasonEnd(c: Career): SeasonEnd {
  const d = division(c);
  const position = positionOf(c.league, c.club.id);
  const n = c.league.teams.length;
  const champion = position === 1;
  const promoted = d.promote > 0 && position <= d.promote;
  const relegated = d.relegate > 0 && position > n - d.relegate;
  let offer: TeamDef | null = null;
  if (champion && c.club.id === 'barrio' && c.division < SEGUNDA_FED) {
    const div = DIVISIONS[SEGUNDA_FED];
    const rng = new Rng(c.seed * 7 + c.season * 389);
    offer = generateClub(rng, `oferta-${c.season}`, Math.round((div.level[0] + div.level[1]) / 2), new Set(c.league.teams.map((t) => t.name)));
  }
  return { position, champion, promoted, relegated, offer };
}

/** Un año más: los críos dan el estirón (más altos, más rápidos, más fuertes); los veteranos bajan. */
export function growUp(p: Career['squad'][number]) {
  if (p.age === undefined) return;
  p.age++;
  const y = youthLook(p.age);
  const young = p.look.youth ?? 0;
  p.look = { ...p.look, ...y };
  if (young > 0) {
    p.attrs.pace = Math.min(20, p.attrs.pace + 0.8 * young + 0.3);
    p.attrs.stamina = Math.min(20, p.attrs.stamina + 0.8 * young + 0.3);
    p.attrs.tackling = Math.min(20, p.attrs.tackling + 0.4 * young);
  } else if (p.age >= 31) {
    p.attrs.pace = Math.max(1, p.attrs.pace - 0.6);
    p.attrs.stamina = Math.max(1, p.attrs.stamina - 0.5);
  }
}

/** Rivales nuevos para una categoría: mismo nivel que la categoría, nombres inventados. */
function freshLeague(c: Career) {
  const d = division(c);
  const rng = new Rng(c.seed * 13 + c.season * 7919 + c.division);
  const taken = new Set<string>([c.club.name]);
  const teams: TeamDef[] = [c.club];
  for (let i = 1; i < d.size; i++) teams.push(generateClub(rng, `d${c.division}-s${c.season}-${i}`, rng.int(d.level[0], d.level[1]), taken));
  return newLeague(c.seed + c.season * 1000, teams);
}

/**
 * Temporada siguiente. `accept`: coges la oferta (club nuevo de Segunda Federación, plantilla
 * nueva, sueldo). Si no, sigues con los tuyos: subes, bajas o repites según la clasificación.
 */
export function nextSeason(c: Career, se: SeasonEnd, accept: boolean) {
  const prevClub = c.club.id;
  const prevDiv = c.division;
  if (accept && se.offer) {
    c.club = se.offer;
    c.division = SEGUNDA_FED;
    c.squad = clubSquad(c.seed, c.gender, se.offer, 20).map((p) => ({ ...p, load: 0, goals: 0, apps: 0 }));
    c.planned = { formation: se.offer.formation, block: 1, style: 'mixed' };
    c.familiarity = { '4-3-3': 0.5, '4-4-2': 0.5, '5-3-2': 0.5, [se.offer.formation]: 0.7 } as Career['familiarity'];
    c.lineup = [];
    c.lineup = bestEleven(c);
    c.stadiumLevel = 2;
    c.fans = 650;
    c.money = 4000;
    c.sponsor = null;
    c.sponsorShout = false;
    c.penaltyTaker = null;
    c.boardTrust = 50;
    c.flags.leftBarrio = true;
  } else {
    if (se.promoted) c.division = Math.min(DIVISIONS.length - 1, c.division + 1);
    else if (se.relegated) c.division = Math.max(0, c.division - 1);
    c.boardTrust = Math.max(c.boardTrust, 40);
  }
  c.coach.salary = division(c).salary;
  c.season++;
  c.week = 1;
  c.day = 0;
  c.slot = 0;
  c.status = 'playing';
  for (const p of c.squad) {
    p.goals = 0;
    p.apps = 0;
    growUp(p);
  }
  if (c.club.id !== prevClub || c.division !== prevDiv) c.league = freshLeague(c);
  else c.league = newLeague(c.seed + c.season * 1000, c.league.teams);
  c.coach.energy = maxEnergy(c);
}
