import type { TeamDef } from '../content/clubs';
import { DIVISIONS } from '../content/divisions';
import type { Gender } from '../content/look';
import { BARRIO, RIVALS, barrioSquad } from '../content/teams';
import type { TimeOfDay, Weather } from '../sim/conditions';
import { FORMATIONS } from '../sim/formations';
import { Rng } from '../sim/rng';
import type { Formation, PlayerProfile, Tactics } from '../sim/types';
import { newLeague, type LeagueState } from './league';

/**
 * Estado completo de una partida. Es JSON puro (se guarda tal cual en el navegador) y toda la
 * lógica que lo cambia vive en src/game: la interfaz solo llama a funciones de aquí.
 */

// ───────────────────────── calendario ─────────────────────────
export const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;
export const DAYS_SHORT = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'] as const;
export const SLOTS = ['Mañana', 'Tarde', 'Noche'] as const;
export const MATCH_DAY = 6;

export type LocationId = 'casa' | 'campo' | 'bar' | 'ferreteria';
export const LOCATIONS: Record<LocationId, { name: string; short: string }> = {
  casa: { name: 'Casa del míster', short: 'Casa' },
  campo: { name: 'El Barrizal', short: 'Campo' },
  bar: { name: 'Bar Manolo', short: 'Bar' },
  ferreteria: { name: 'Ferretería Ramón', short: 'Ferretería' },
};

// ───────────────────────── estadio ─────────────────────────
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

/** Material de entrenamiento: multiplica lo que se aprende en cada sesión. */
export const MATERIAL_LEVELS = [
  { name: 'Cuatro conos y un balón pinchado', cost: 0, mult: 1 },
  { name: 'Conos, petos y balones nuevos', cost: 120, mult: 1.2 },
  { name: 'Porterías pequeñas, escalera de coordinación y vallas', cost: 380, mult: 1.4 },
];

// ───────────────────────── míster ─────────────────────────
export type StatId = 'tactica' | 'labia' | 'ojo' | 'forma';
/**
 * Estadísticas del míster, al estilo Punch Club: cuestan de subir (cada sesión rinde menos cuanto
 * más alta está) y de mantener (cada día que no se trabajan, bajan; más cuanto más altas). Cada una
 * sirve para algo concreto que se nota en el juego.
 */
export const STATS: Record<StatId, { label: string; desc: string; how: string; next: (lv: number) => string }> = {
  tactica: {
    label: 'Táctica',
    desc: 'Cuánto aprenden tus jugadores en cada entreno (+8 % por nivel) y lo rápido que asimilan la formación.',
    how: 'Se trabaja en la pizarra de casa, viendo partidos y entrenando.',
    next: (lv) => (lv < 2 ? 'Nivel 2: señales en el partido (presión total, contraataque).' : lv < 3 ? 'Nivel 3: libertad individual a cada jugador.' : `Nivel ${lv + 1}: aprenden un 8 % más en cada entreno.`),
  },
  labia: {
    label: 'Labia',
    desc: 'Cuánto les llega tu arenga y tus charlas, cuánto cobras en la ferretería (+4 € por turno y nivel) y respuestas especiales en la historia.',
    how: 'Se trabaja charlando en el bar, con la plantilla y en la ferretería.',
    next: (lv) => (lv < 2 ? 'Nivel 2: nuevas respuestas en algunas conversaciones.' : lv < 3 ? 'Nivel 3: puedes ganar duelos dialécticos (y más respuestas).' : `Nivel ${lv + 1}: más efecto en arengas y charlas, más sueldo.`),
  },
  ojo: {
    label: 'Ojo',
    desc: 'Lo que descubres al ojear al rival: formación (nivel 1), su jugador peligroso (2) y su punto débil (3).',
    how: 'Se trabaja viendo partidos en el portátil y ojeando al rival el sábado.',
    next: (lv) => (lv < 2 ? 'Nivel 2: sabrás quién es su jugador más peligroso.' : lv < 3 ? 'Nivel 3: verás su punto débil.' : 'Ya lo ves todo: mantenlo para no perderlo.'),
  },
  forma: {
    label: 'Forma',
    desc: 'Tu energía máxima (+10 por nivel): cuántas cosas puedes hacer al día.',
    how: 'Se trabaja saliendo a correr por la mañana.',
    next: (lv) => `Nivel ${lv + 1}: +10 de energía máxima.`,
  },
};
export const MAX_LEVEL = 10;
export interface CoachStat {
  /** Valor 0–100 (lo que se entrena y lo que se pierde). */
  value: number;
  /** Nivel que da el valor (1 + una decena por nivel). */
  lv: number;
  /** De partidas antiguas: se convierte a `value`. */
  xp?: number;
}
export const levelOf = (value: number) => Math.max(1, Math.min(MAX_LEVEL, 1 + Math.floor(value / 10)));
/** Lo que baja cada día que no se trabaja: más cuanto más alta (mantener arriba cuesta). */
export const dailyDecay = (value: number) => 0.3 + value * 0.018;
export interface Coach {
  name: string;
  gender: Gender;
  stats: Record<StatId, CoachStat>;
  energy: number;
  /** Comida (0–100). Con hambre no se puede entrenar ni trabajar (como en Punch Club). */
  food: number;
  /** Ánimo (0–100). Por debajo de 50, lo que entrenas rinde la mitad. */
  mood: number;
  wallet: number;
  /** Sueldo semanal del club (en regional, cero: de ahí la ferretería). */
  salary: number;
}
/** Experiencia para pasar de `lv` a `lv + 1`. */
export const xpToNext = (lv: number) => 8 + 6 * (lv - 1);

// ───────────────────────── plantilla ─────────────────────────
export interface SquadPlayer extends PlayerProfile {
  /** Carga de la semana (0–1): lo que no se recupere antes del domingo, sale como cansancio. */
  load: number;
  goals: number;
  apps: number;
  /** Moral (0–100): sale de lo que pasa (resultados, minutos, notas, promesas, charlas) y cambia cómo juega. */
  morale: number;
  /** Por qué ha cambiado la moral (lo más reciente primero). */
  moraleLog: MoraleEntry[];
  /** Notas de los últimos partidos (la más reciente primero). */
  form: number[];
}

export interface MoraleEntry {
  week: number;
  delta: number;
  reason: string;
}

/** Promesas a jugadores (se comprueban en el siguiente partido). */
export interface PlayerPromise {
  id: string;
  kind: 'minutes';
  week: number;
}

/** Ficha nueva de plantilla a partir de un jugador generado. */
export const toSquad = (p: PlayerProfile): SquadPlayer => ({ ...p, load: 0, goals: 0, apps: 0, morale: 60, moraleLog: [], form: [] });

export interface MatchRecord {
  week: number;
  rival: string;
  rivalId: string;
  score: [number, number];
  fansDelta: number;
  moneyDelta: number;
  trustDelta: number;
  headline: string;
  sub: string;
}

export type PromiseKind = 'win' | 'fun' | 'realist' | null;

export interface Career {
  v: 2;
  seed: number;
  /** Liga masculina o femenina. */
  gender: Gender;
  coach: Coach;
  /** Tu club y su categoría (índice en DIVISIONS). */
  club: TeamDef;
  division: number;
  season: number;
  week: number;
  day: number;
  slot: number;
  location: LocationId;
  status: 'prologue' | 'playing' | 'fired' | 'seasonEnd';
  // club
  money: number;
  fans: number;
  boardTrust: number;
  stadiumLevel: number;
  material: number;
  sponsor: 'manolo' | null;
  sponsorShout: boolean;
  promise: PromiseKind;
  penaltyTaker: string | null;
  // plantilla y táctica
  squad: SquadPlayer[];
  lineup: string[];
  planned: Tactics;
  familiarity: Record<Formation, number>;
  /** Cambios de la semana por decisiones (id de jugador → atributos). Se borran al cerrar la semana. */
  /** Promesas hechas a jugadores pendientes de cumplir. */
  promises: PlayerPromise[];
  /** No vienen al entreno esta semana (por historia). */
  absent: Record<string, boolean>;
  // historia y progreso
  flags: Record<string, boolean>;
  seen: string[];
  /** Acciones hechas esta semana (para las que solo se pueden hacer una vez). */
  weekDone: Record<string, number>;
  dayDone: Record<string, boolean>;
  scouted: number;
  hungry: boolean;
  talkDone: boolean;
  /** Paso de la guía de la primera semana (−1 = terminada o saltada). */
  guide: number;
  /** Avisos del último cambio de día (nivel perdido por no entrenar...). */
  dayNotes: string[];
  history: MatchRecord[];
  league: LeagueState;
  /** Partido rival forzado por la semana (lo decide el calendario de liga). */
  forced?: { weather?: Weather; time?: TimeOfDay };
}

/**
 * Partida nueva. La liga (masculina o femenina) se elige dentro de la historia, en el prólogo:
 * hasta entonces la plantilla es provisional (`setLeagueGender` la rehace).
 */
export function newCareer(gender: Gender, coachGender: Gender = 'm', coachName = '', seed = 1 + Math.floor(Math.random() * 9999)): Career {
  const squad: SquadPlayer[] = barrioSquad(seed, gender).map(toSquad);
  const c: Career = {
    v: 2,
    seed,
    gender,
    coach: {
      name: coachName.trim() || (coachGender === 'f' ? 'Loli Prieto' : 'Paco Prieto'),
      gender: coachGender,
      stats: { tactica: { lv: 1, value: 4 }, labia: { lv: 1, value: 4 }, ojo: { lv: 1, value: 4 }, forma: { lv: 1, value: 4 } },
      energy: 0,
      food: 80,
      mood: 65,
      wallet: 90,
      salary: 0,
    },
    club: BARRIO,
    division: 0,
    season: 1,
    week: 1,
    day: 0,
    slot: 0,
    location: 'casa',
    status: 'prologue',
    money: 120,
    fans: 9,
    boardTrust: 50,
    stadiumLevel: 0,
    material: 0,
    sponsor: null,
    sponsorShout: false,
    promise: null,
    penaltyTaker: null,
    squad,
    lineup: squad.slice(0, 11).map((p) => p.id),
    planned: { formation: '4-3-3', block: 1, style: 'mixed' },
    familiarity: { '4-3-3': 0.55, '4-4-2': 0.45, '5-3-2': 0.25 },
    promises: [],
    absent: {},
    flags: { guiaMister: true },
    seen: [],
    weekDone: {},
    dayDone: {},
    scouted: 0,
    hungry: false,
    talkDone: false,
    guide: 0,
    dayNotes: [],
    history: [],
    league: newLeague(seed, [BARRIO, ...RIVALS]),
  };
  c.coach.energy = maxEnergy(c);
  return c;
}

/** Elegida en el prólogo: masculino o femenino. Rehace la plantilla con esa liga. */
export function setLeagueGender(c: Career, gender: Gender) {
  c.gender = gender;
  c.squad = barrioSquad(c.seed, gender).map(toSquad);
  c.lineup = c.squad.slice(0, 11).map((p) => p.id);
  // el once que dejó el míster anterior tiene su manía: el sobrino (delantero) juega de defensa.
  // Es lo primero que se arregla en la guía, mirando los números de cada uno en ese puesto.
  const slots = FORMATIONS[c.planned.formation];
  const def = slots.findIndex((s) => s.role === 'DEF');
  const nephew = c.squad.find((p) => p.role === 'DEL' && !c.lineup.includes(p.id));
  if (def >= 0 && nephew) c.lineup[def] = nephew.id;
  c.status = 'playing';
  // la temporada arranca el domingo de la jornada 1, en el campo: el estreno es hoy
  c.day = MATCH_DAY;
  c.slot = 0;
  c.location = 'campo';
}

export const division = (c: Career) => DIVISIONS[c.division];
export const seasonWeeks = (c: Career) => c.league.rounds.length;
export const leagueName = (c: Career) => `${division(c).name}${c.gender === 'f' ? ' Femenina' : ''}`;

export const maxEnergy = (c: Career) => 70 + 10 * c.coach.stats.forma.lv - (c.hungry ? 20 : 0);

/** Suma experiencia y sube de nivel. Devuelve el texto de la subida si la hay. */
/** Multiplicador de la sesión en curso (lo fija `perform`: ánimo y repetición). */
let trainMult = 1;
export const setTrainMult = (m: number) => (trainMult = m);

export function gainXp(c: Career, stat: StatId, xp: number): string | null {
  const s = c.coach.stats[stat];
  c.dayDone[`trained:${stat}`] = true;
  const before = s.lv;
  // rinde menos cuanto más alta está; y menos aún de bajón o repitiendo lo mismo (ver trainMult)
  s.value = Math.min(100, s.value + xp * trainMult * 1.25 * Math.max(0.3, 1 - s.value / 120));
  s.lv = levelOf(s.value);
  if (s.lv <= before) return null;
  if (stat === 'forma') c.coach.energy = Math.min(maxEnergy(c), c.coach.energy + 10);
  const unlock = stat === 'tactica' && s.lv === 2 ? ' Ya puedes dar señales en el partido.' : stat === 'tactica' && s.lv === 3 ? ' Ya puedes dar libertad individual.' : '';
  return `¡${STATS[stat].label} sube a nivel ${s.lv}!${unlock}`;
}

/** Al acabar el día: lo que no se ha trabajado hoy, baja. Devuelve los avisos de nivel perdido. */
export function decayStats(c: Career): string[] {
  const notes: string[] = [];
  for (const id of Object.keys(c.coach.stats) as StatId[]) {
    const s = c.coach.stats[id];
    if (c.dayDone[`trained:${id}`]) continue;
    const before = s.lv;
    s.value = Math.max(0, s.value - dailyDecay(s.value));
    s.lv = levelOf(s.value);
    if (s.lv < before) notes.push(`Tu ${STATS[id].label} baja a nivel ${s.lv}: hace días que no la trabajas.`);
  }
  if (c.coach.energy > maxEnergy(c)) c.coach.energy = maxEnergy(c);
  return notes;
}

/** Partidas guardadas antes del sistema de mantenimiento: nivel y experiencia → valor. */
export function migrateStats(c: Career) {
  for (const id of Object.keys(c.coach.stats) as StatId[]) {
    const s = c.coach.stats[id];
    if (s.value === undefined) s.value = (s.lv - 1) * 10 + Math.min(9, ((s.xp ?? 0) / xpToNext(s.lv)) * 10);
    s.lv = levelOf(s.value);
    delete s.xp;
  }
}

/** Azar reproducible para la lógica de juego: misma partida y mismo momento, mismo resultado. */
export function rngFor(c: Career, tag: string) {
  let h = (c.seed * 2654435761) >>> 0;
  const key = `${c.season}:${c.week}:${c.day}:${c.slot}:${tag}`;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
  return new Rng(h);
}

export function player(c: Career, id: string) {
  return c.squad.find((p) => p.id === id);
}

// ───────────────────────── rival y tiempo ─────────────────────────
export function rivalOf(c: Career): TeamDef {
  const pair = c.league.rounds[Math.min(c.week, seasonWeeks(c)) - 1].find((m) => m.includes(c.club.id))!;
  const id = pair[0] === c.club.id ? pair[1] : pair[0];
  return c.league.teams.find((t) => t.id === id)!;
}

const WEATHERS: Weather[] = ['clear', 'clear', 'cloudy', 'cloudy', 'rain', 'fog', 'storm', 'snow'];
/** Pronóstico del domingo: sale de la semilla de la partida (y de la estación: la nieve, en pleno invierno). */
export function weatherOf(c: Career): [Weather, TimeOfDay] {
  const r = new Rng(c.seed * 97 + c.season * 1009 + c.week * 13);
  let w = r.pick(WEATHERS);
  const f = c.week / seasonWeeks(c);
  if (w === 'snow' && (f < 0.3 || f > 0.8)) w = 'rain';
  const t = r.pick<TimeOfDay>(['day', 'dusk', 'dusk', 'night']);
  return [c.forced?.weather ?? w, c.forced?.time ?? t];
}

/** El tiempo que hace hoy (los días de diario: el del domingo se acerca según avanza la semana). */
export function todayWeather(c: Career): Weather {
  if (c.day >= 4) return weatherOf(c)[0];
  const r = new Rng(c.seed * 31 + c.week * 7 + c.day);
  return r.pick<Weather>(['clear', 'clear', 'cloudy', 'rain', 'fog']);
}
export const slotTime = (slot: number): TimeOfDay => (slot === 0 ? 'day' : slot === 1 ? 'dusk' : 'night');

/** Asistencia: tus aficionados, limitados por el aforo y por el tiempo que haga. */
export function attendance(c: Career) {
  const [w] = weatherOf(c);
  const weatherCut = w === 'storm' ? 0.5 : w === 'rain' || w === 'snow' ? 0.75 : 1;
  return Math.max(2, Math.min(STADIUM_LEVELS[c.stadiumLevel].capacity, Math.round(c.fans * weatherCut)));
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

export function buyMaterial(c: Career) {
  const next = MATERIAL_LEVELS[c.material + 1];
  if (!next || c.money < next.cost) return false;
  c.money -= next.cost;
  c.material++;
  return true;
}
