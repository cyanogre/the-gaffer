import type { Kit, Look } from '../content/look';

export type Role = 'POR' | 'DEF' | 'MED' | 'DEL';
export type TeamSide = 0 | 1;

/** Atributos en escala 1–20. Cada uno alimenta decisiones concretas de la IA (ver ai.ts). */
export interface Attributes {
  pace: number; // velocidad punta y aceleración
  stamina: number; // ritmo al que se cansa
  passing: number; // precisión y alcance del pase
  shooting: number; // precisión y potencia del tiro
  dribbling: number; // conservar el balón en carrera y controles
  tackling: number; // ganar duelos defensivos
  vision: number; // qué compañeros "ve" y lo bien que valora opciones
  positioning: number; // colocación, fuera de juego, intercepciones
  keeping: number; // reflejos y alcance (porteros)
  aggression: number; // frecuencia de entradas y riesgo de falta
  composure: number; // calidad de decisión y ejecución bajo presión
  workRate: number; // implicación sin balón (presión, repliegue)
}

export type TraitId = 'goleadorNato' | 'egoista' | 'lenero' | 'padel' | 'pulmon' | 'artista' | 'piscinero' | 'nervioso';

export interface PlayerProfile {
  id: string;
  name: string;
  nick?: string;
  num: number;
  role: Role;
  attrs: Attributes;
  traits: TraitId[];
  look: Look;
  quirk: string;
  /** Partidos seguidos sin marcar (solo para la narrativa del "goleador nato"). */
  drought?: number;
}

export type Formation = '4-3-3' | '4-4-2' | '5-3-2';
export type Block = 0 | 1 | 2; // bajo, medio, alto
export type PassStyle = 'short' | 'mixed' | 'long';

export interface Tactics {
  formation: Formation;
  block: Block;
  style: PassStyle;
}

export interface TeamProfile {
  id: string;
  name: string;
  short: string;
  kit: Kit;
  gkKit: Kit;
  players: PlayerProfile[];
  tactics: Tactics;
  motto: string;
}

/** -1 juega simple, 0 normal, 1 libertad creativa. */
export type Freedom = -1 | 0 | 1;
export type Action = 'none' | 'kick' | 'poke' | 'tackle' | 'celebrate' | 'dive' | 'fall';

export interface SimPlayer {
  idx: number;
  team: TeamSide;
  slot: number;
  profile: PlayerProfile;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  facing: number;
  fatigue: number;
  action: Action;
  actionT: number;
  actionDur: number;
  actionSide: number;
  stunT: number;
  decideAt: number;
  tackleCd: number;
  touchCd: number;
  freedom: Freedom;
  yellows: number;
  sentOff: boolean;
  run: { x: number; y: number; until: number } | null;
  /** Desfase estable para que las líneas no parezcan dibujadas con regla. */
  jx: number;
  jy: number;
  lastPasser: number;
  lastPassAt: number;
  /** Dirección de conducción elegida por la IA mientras lleva el balón. */
  carryDir: number;
  carryUrgency: number;
  selfishCd: number;
}

export type FlightKind = 'pass' | 'cross' | 'shot' | 'clear';

export interface Flight {
  kind: FlightKind;
  from: number;
  to: number;
  team: TeamSide;
  t: number;
  offside: boolean;
  saveTried: boolean;
  onTarget: boolean;
  tx: number;
  ty: number;
}

export interface Ball {
  x: number;
  y: number;
  z: number;
  px: number;
  py: number;
  pz: number;
  vx: number;
  vy: number;
  vz: number;
  owner: number;
  lastTouch: number;
  prevTouch: number;
  lastTeam: TeamSide;
  flight: Flight | null;
  spin: number;
  /** Momento en que el poseedor actual se hizo con el balón. */
  ownedAt: number;
}

export type Phase = 'kickoff' | 'play' | 'restart' | 'goal' | 'fulltime';
export type RestartKind = 'kickoff' | 'throw' | 'goalkick' | 'corner' | 'freekick' | 'penalty';

export interface Restart {
  kind: RestartKind;
  team: TeamSide;
  x: number;
  y: number;
  taker: number;
}

export type SignalKind = 'press' | 'counter';

export interface SignalState {
  kind: SignalKind;
  until: number;
  /** Para el contraataque: ventana activa tras recuperar el balón. */
  activeUntil: number;
}

export interface TeamState {
  side: TeamSide;
  profile: TeamProfile;
  tactics: Tactics;
  signal: SignalState | null;
  signalCooldown: Record<SignalKind, number>;
}

export interface Stats {
  possession: [number, number];
  shots: [number, number];
  onTarget: [number, number];
  passes: [number, number];
  passesOk: [number, number];
  fouls: [number, number];
  yellows: [number, number];
  offsides: [number, number];
  tackles: [number, number];
}

export type MatchEventKind =
  | 'kickoff'
  | 'pass'
  | 'pass_ok'
  | 'shot'
  | 'save'
  | 'miss'
  | 'post'
  | 'goal'
  | 'tackle'
  | 'foul'
  | 'yellow'
  | 'red'
  | 'offside'
  | 'restart'
  | 'signal'
  | 'counter_go'
  | 'dive'
  | 'selfish'
  | 'intercept'
  | 'tactic'
  | 'block'
  | 'fulltime';

export interface MatchEvent {
  t: number;
  clock: number;
  kind: MatchEventKind;
  team?: TeamSide;
  a?: number;
  b?: number;
  value?: number;
  detail?: string;
}

export type Command =
  | { kind: 'tactics'; team: TeamSide; patch: Partial<Tactics> }
  | { kind: 'signal'; team: TeamSide; signal: SignalKind }
  | { kind: 'freedom'; player: number; value: Freedom };
