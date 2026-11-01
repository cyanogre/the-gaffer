import type { Gender } from '../content/look';
import { RIVALS, buildTeams, type RivalDef } from '../content/teams';
import { conditionsFor, type MatchConditions, type TimeOfDay, type Weather } from '../sim/conditions';
import type { MatchSim } from '../sim/match';
import type { Attributes, Tactics, TeamProfile } from '../sim/types';

/**
 * Carrera del míster: lo que persiste entre partidos. Empieza en lo más bajo: campo de tierra,
 * nueve aficionados (la mayoría familia) y una caja de 120 €.
 */
export interface StadiumLevel {
  name: string;
  short: string;
  cost: number;
  pitch: number;
  capacity: number;
  desc: string;
}

export const STADIUM_LEVELS: StadiumLevel[] = [
  { name: 'Campo de tierra El Barrizal', short: 'El Barrizal', cost: 0, pitch: 0.18, capacity: 40, desc: 'Tierra, piedras, una valla metálica y tres escalones de obra. El bar hace de vestuario.' },
  { name: 'Municipal El Barrizal', short: 'Municipal', cost: 450, pitch: 0.62, capacity: 150, desc: 'Césped de verdad, redes en las porterías, una gradilla cubierta y focos que se encienden casi siempre.' },
  { name: 'Estadio El Barrizal', short: 'Estadio', cost: 2500, pitch: 0.9, capacity: 900, desc: 'Dos gradas, marcador electrónico, banquillos con techo y vallas publicitarias.' },
];

export interface MatchRecord {
  week: number;
  rival: string;
  score: [number, number];
  fansDelta: number;
  moneyDelta: number;
  trustDelta: number;
}

export interface Career {
  week: number;
  gender: Gender;
  seed: number;
  money: number;
  fans: number;
  boardTrust: number;
  stadiumLevel: number;
  planned: Tactics;
  sponsor: 'manolo' | null;
  sponsorShout: boolean;
  promise: 'win' | 'fun' | 'realist' | null;
  penaltyTaker: number | null;
  /** Ajustes de atributos de esta semana por decisiones (índice de dorsal en la plantilla → cambios). */
  mods: Record<number, Partial<Attributes>>;
  modNotes: Record<number, string>;
  flags: Record<string, boolean>;
  seen: string[];
  history: MatchRecord[];
  /** Condiciones forzadas desde el panel de laboratorio (no es una mecánica). */
  forced?: { weather?: Weather; time?: TimeOfDay };
}

export function newCareer(gender: Gender): Career {
  return {
    week: 1,
    gender,
    seed: 1 + Math.floor(Math.random() * 9999),
    money: 120,
    fans: 9,
    boardTrust: 50,
    stadiumLevel: 0,
    planned: { formation: '4-3-3', block: 1, style: 'mixed' },
    sponsor: null,
    sponsorShout: false,
    promise: null,
    penaltyTaker: null,
    mods: {},
    modNotes: {},
    flags: {},
    seen: [],
    history: [],
  };
}

export function rivalOf(c: Career): RivalDef {
  return RIVALS[(c.week - 1) % RIVALS.length];
}

const WEEK_WEATHER: [Weather, TimeOfDay][] = [
  ['clear', 'dusk'],
  ['rain', 'night'],
  ['fog', 'day'],
  ['storm', 'night'],
  ['cloudy', 'day'],
  ['snow', 'dusk'],
];
export function weatherOf(c: Career): [Weather, TimeOfDay] {
  const [w, t] = WEEK_WEATHER[(c.week - 1) % WEEK_WEATHER.length];
  return [c.forced?.weather ?? w, c.forced?.time ?? t];
}

export function matchSetup(c: Career): { teams: [TeamProfile, TeamProfile]; conditions: MatchConditions; seed: number } {
  const seed = c.seed + c.week * 101;
  const teams = buildTeams(seed, c.gender, rivalOf(c), c.mods);
  teams[0].tactics = { ...c.planned };
  if (c.penaltyTaker !== null) teams[0].penaltyTaker = teams[0].players[c.penaltyTaker].id;
  const [w, t] = weatherOf(c);
  return { teams, conditions: conditionsFor(w, t, STADIUM_LEVELS[c.stadiumLevel].pitch, seed), seed };
}

/** Asistencia: tus aficionados, limitados por el aforo y por el tiempo que haga. */
export function attendance(c: Career) {
  const [w] = weatherOf(c);
  const weatherCut = w === 'storm' ? 0.5 : w === 'rain' || w === 'snow' ? 0.75 : 1;
  return Math.max(2, Math.min(STADIUM_LEVELS[c.stadiumLevel].capacity, Math.round(c.fans * weatherCut)));
}

export interface Summary {
  lines: string[];
  fansDelta: number;
  moneyDelta: number;
  trustDelta: number;
  result: 'win' | 'draw' | 'loss';
}

/** Cierra la jornada: dinero, aficionados y confianza de la directiva salen de lo que ha pasado. */
export function closeWeek(c: Career, sim: MatchSim): Summary {
  const [g, a] = sim.score;
  const result = g > a ? 'win' : g === a ? 'draw' : 'loss';
  const lines: string[] = [];
  const crowd = attendance(c);
  let fans = result === 'win' ? 3 : result === 'draw' ? 1 : -1;
  fans += Math.min(4, g);
  if (g + a >= 5) {
    fans += 2;
    lines.push('Partido loco: los vecinos lo comentan en la panadería (+2 aficionados).');
  }
  let money = crowd * 3 - 45;
  lines.push(`Taquilla: ${crowd} personas × 3 € = ${crowd * 3} €. Árbitro y material: −45 €.`);
  if (c.sponsor === 'manolo') {
    money += 25;
    lines.push('Bar Manolo paga su patrocinio semanal: +25 €.');
  }
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
  c.history.push({ week: c.week, rival: sim.teams[1].profile.name, score: [g, a], fansDelta: fans, moneyDelta: money, trustDelta: trust });
  // la semana nueva empieza limpia
  c.week++;
  c.promise = null;
  c.mods = {};
  c.modNotes = {};
  return { lines, fansDelta: fans, moneyDelta: money, trustDelta: trust, result };
}

export function canUpgrade(c: Career) {
  const next = STADIUM_LEVELS[c.stadiumLevel + 1];
  return next && c.money >= next.cost ? next : null;
}

export function upgradeStadium(c: Career) {
  const next = canUpgrade(c);
  if (!next) return false;
  c.money -= next.cost;
  c.stadiumLevel++;
  return true;
}
