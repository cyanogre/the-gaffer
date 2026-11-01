import type { TeamDef } from '../content/clubs';
import { Rng } from '../sim/rng';

/**
 * Liga de seis equipos a doble vuelta. Tus partidos se juegan con el motor completo; los de los
 * demás, con un modelo de goles por nivel (reproducible con la semilla de la partida).
 */
export type Pair = [string, string];

export interface Row {
  id: string;
  p: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  pts: number;
}

export interface Result {
  home: string;
  away: string;
  score: [number, number];
}

export interface LeagueState {
  /** Equipos del grupo (el tuyo incluido). */
  teams: TeamDef[];
  rounds: Pair[][];
  table: Row[];
  results: Result[][];
}

/** Método del círculo: cada equipo juega una vez por jornada. Segunda vuelta, en espejo. */
export function roundRobin(ids: string[], seed: number): Pair[][] {
  const r = new Rng(seed * 17 + 3);
  const t = [...ids];
  for (let i = t.length - 1; i > 0; i--) {
    const j = Math.floor(r.next() * (i + 1));
    [t[i], t[j]] = [t[j], t[i]];
  }
  const n = t.length;
  const first: Pair[][] = [];
  const rot = t.slice(1);
  for (let k = 0; k < n - 1; k++) {
    const round: Pair[] = [];
    const cur = [t[0], ...rot];
    for (let i = 0; i < n / 2; i++) {
      const a = cur[i];
      const b = cur[n - 1 - i];
      round.push(k % 2 ? [b, a] : [a, b]);
    }
    first.push(round);
    rot.unshift(rot.pop()!);
  }
  return [...first, ...first.map((rd) => rd.map(([a, b]) => [b, a] as Pair))];
}

export function newLeague(seed: number, teams: TeamDef[]): LeagueState {
  const ids = teams.map((t) => t.id);
  return {
    teams,
    rounds: roundRobin(ids, seed),
    table: ids.map((id) => ({ id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 })),
    results: [],
  };
}

export function teamOf(l: LeagueState, id: string): TeamDef {
  return l.teams.find((t) => t.id === id)!;
}

function poisson(r: Rng, lambda: number) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= r.next();
  } while (p > L && k < 12);
  return k - 1;
}

/** Partido de otros: más nivel, más goles esperados (se nota, pero en el barrio todo puede pasar). */
export function quickMatch(r: Rng, a: number, b: number): [number, number] {
  return [poisson(r, 1.45 * Math.exp((a - b) * 0.16)), poisson(r, 1.2 * Math.exp((b - a) * 0.16))];
}

function apply(t: Row[], res: Result) {
  const h = t.find((x) => x.id === res.home)!;
  const a = t.find((x) => x.id === res.away)!;
  const [g1, g2] = res.score;
  h.p++;
  a.p++;
  h.gf += g1;
  h.ga += g2;
  a.gf += g2;
  a.ga += g1;
  if (g1 > g2) {
    h.w++;
    a.l++;
    h.pts += 3;
  } else if (g1 < g2) {
    a.w++;
    h.l++;
    a.pts += 3;
  } else {
    h.d++;
    a.d++;
    h.pts++;
    a.pts++;
  }
}

/** Cierra una jornada: tu resultado y el resto simulado. */
export function playRound(l: LeagueState, round: number, seed: number, ours: Result): Result[] {
  const r = new Rng(seed * 131 + round * 7);
  const out: Result[] = [];
  for (const [home, away] of l.rounds[round]) {
    if (home === ours.home && away === ours.away) out.push(ours);
    else out.push({ home, away, score: quickMatch(r, teamOf(l, home).level, teamOf(l, away).level) });
  }
  for (const res of out) apply(l.table, res);
  l.results[round] = out;
  return out;
}

export function standings(l: LeagueState): Row[] {
  return [...l.table].sort((a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf || a.id.localeCompare(b.id));
}

export function positionOf(l: LeagueState, id: string) {
  return standings(l).findIndex((r) => r.id === id) + 1;
}
