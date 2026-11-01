import { addMods, clampAttrs, rivalProfile } from '../content/teams';
import { conditionsFor, type MatchConditions } from '../sim/conditions';
import { FORMATIONS } from '../sim/formations';
import type { Attributes, PlayerProfile, Role, TeamProfile } from '../sim/types';
import { MATERIAL_LEVELS, STADIUM_LEVELS, gainXp, rivalOf, weatherOf, type Career, type SquadPlayer } from './career';

/**
 * Plantilla: once titular, entrenamiento y la ficha con la que cada jugador sale al partido.
 * Los atributos llevan decimales: el entrenamiento los empuja poco a poco y el motor los usa tal cual.
 */

// ───────────────────────── once titular ─────────────────────────
export const slotRole = (c: Career, slot: number): Role => FORMATIONS[c.planned.formation][slot].role;

/** Lo bueno que es alguien para un puesto (para el «once de gala» y para avisar de desajustes). */
export function fitFor(p: PlayerProfile, role: Role): number {
  const a = p.attrs;
  switch (role) {
    case 'POR':
      return a.keeping * 2 + a.positioning * 0.5 + a.composure * 0.3;
    case 'DEF':
      return a.tackling + a.positioning + a.pace * 0.5 + a.aggression * 0.3 + (p.role === 'POR' ? -20 : 0);
    case 'MED':
      return a.passing + a.vision + a.stamina * 0.4 + a.dribbling * 0.4 + a.workRate * 0.3 + (p.role === 'POR' ? -20 : 0);
    case 'DEL':
      return a.shooting + a.dribbling * 0.7 + a.pace * 0.6 + a.composure * 0.4 + (p.role === 'POR' ? -20 : 0);
  }
}

/** Mejor once para la formación planificada (voraz por puesto, porteros primero). */
export function bestEleven(c: Career): string[] {
  const roles = FORMATIONS[c.planned.formation].map((s) => s.role);
  const free = new Set(c.squad.map((p) => p.id));
  const out: string[] = new Array(roles.length);
  const order = roles.map((r, i) => [r, i] as const).sort((a, b) => (a[0] === 'POR' ? -1 : b[0] === 'POR' ? 1 : 0));
  for (const [role, i] of order) {
    let best: SquadPlayer | null = null;
    let bestV = -Infinity;
    for (const p of c.squad) {
      if (!free.has(p.id)) continue;
      const v = fitFor(p, role) - p.load * 8 + (p.role === role ? 3 : 0);
      if (v > bestV) {
        bestV = v;
        best = p;
      }
    }
    out[i] = best!.id;
    free.delete(best!.id);
  }
  return out;
}

export function swapLineup(c: Career, slot: number, id: string) {
  const cur = c.lineup[slot];
  const other = c.lineup.indexOf(id);
  if (other >= 0) c.lineup[other] = cur;
  c.lineup[slot] = id;
}

export const bench = (c: Career) => c.squad.filter((p) => !c.lineup.includes(p.id));

// ───────────────────────── entrenamiento ─────────────────────────
export type Focus = 'fisico' | 'tecnica' | 'tiro' | 'tactica' | 'partidillo';
export const FOCUS: Record<Focus, { label: string; desc: string; attrs: Partial<Record<keyof Attributes, number>>; gk: Partial<Record<keyof Attributes, number>>; load: number; fam: number }> = {
  fisico: { label: 'Físico', desc: 'Resistencia, velocidad y trabajo. Cansa mucho.', attrs: { stamina: 1, pace: 0.6, workRate: 0.5 }, gk: { pace: 0.5, stamina: 0.5 }, load: 0.24, fam: 0 },
  tecnica: { label: 'Técnica', desc: 'Pase, regate y visión.', attrs: { passing: 1, dribbling: 1, vision: 0.4 }, gk: { passing: 0.8, keeping: 0.4 }, load: 0.12, fam: 0 },
  tiro: { label: 'Tiro', desc: 'Remate y sangre fría. Los porteros, a parar.', attrs: { shooting: 1.2, composure: 0.5 }, gk: { keeping: 1.2, composure: 0.4 }, load: 0.12, fam: 0 },
  tactica: { label: 'Táctica', desc: 'Colocación y entradas. Asimilan la formación de la pizarra.', attrs: { positioning: 1, tackling: 0.6 }, gk: { positioning: 1 }, load: 0.08, fam: 0.12 },
  partidillo: { label: 'Partidillo', desc: 'Un poco de todo y algo de formación. Se lo pasan bien.', attrs: { composure: 0.6, dribbling: 0.4, passing: 0.4, tackling: 0.3 }, gk: { keeping: 0.5 }, load: 0.15, fam: 0.05 },
};
export const TRAINING_DAYS = [1, 3];
export const isTrainingSlot = (c: Career) => TRAINING_DAYS.includes(c.day) && c.slot === 1;

export interface TrainingReport {
  lines: string[];
  gains: { id: string; attr: keyof Attributes; from: number; to: number }[];
}

const ATTR_LABEL: Record<keyof Attributes, string> = {
  pace: 'velocidad',
  stamina: 'resistencia',
  passing: 'pase',
  shooting: 'tiro',
  dribbling: 'regate',
  tackling: 'entrada',
  vision: 'visión',
  positioning: 'colocación',
  keeping: 'paradas',
  aggression: 'agresividad',
  composure: 'sangre fría',
  workRate: 'trabajo',
};
export const attrLabel = (k: keyof Attributes) => ATTR_LABEL[k];

/** Una sesión: cada jugador presente mejora según el foco (menos cuanto más alto está) y se carga. */
export function train(c: Career, focus: Focus): TrainingReport {
  const f = FOCUS[focus];
  const tact = c.coach.stats.tactica.lv;
  const mult = 0.22 * (1 + 0.08 * (tact - 1)) * MATERIAL_LEVELS[c.material].mult;
  const lines: string[] = [];
  const gains: TrainingReport['gains'] = [];
  const absent: string[] = [];
  for (const p of c.squad) {
    if (c.absent[p.id]) {
      absent.push(p.nick ?? p.name.split(' ')[0]);
      continue;
    }
    const w = p.role === 'POR' ? f.gk : f.attrs;
    for (const [k, weight] of Object.entries(w) as [keyof Attributes, number][]) {
      const from = p.attrs[k];
      const room = Math.max(0.15, Math.min(1, (20 - from) / 9));
      // el pulmón se entrena a gusto el físico; al de pádel le aburre todo lo que no sea partidillo
      // los críos aprenden más rápido
      let t = 1 + (p.look.youth ?? 0) * 0.5;
      if (p.traits.includes('pulmon') && focus === 'fisico') t *= 1.3;
      if (p.traits.includes('padel') && focus !== 'partidillo') t *= 0.8;
      const to = Math.min(20, from + mult * weight * room * t);
      p.attrs[k] = to;
      if (Math.floor(to) > Math.floor(from)) gains.push({ id: p.id, attr: k, from, to });
    }
    p.load = Math.min(1, p.load + f.load * (p.traits.includes('pulmon') ? 0.7 : 1));
  }
  if (f.fam > 0) {
    const fm = c.planned.formation;
    const before = c.familiarity[fm];
    c.familiarity[fm] = Math.min(1, before + f.fam * (1 + 0.1 * (tact - 1)));
    lines.push(`El ${fm} va entrando: familiaridad ${Math.round(before * 100)} → ${Math.round(c.familiarity[fm] * 100)} %.`);
  }
  if (absent.length) lines.unshift(`No han venido: ${absent.join(', ')}.`);
  // lo que ha subido de media cada atributo trabajado (en décimas: el progreso se ve aunque nadie suba un punto)
  const present = c.squad.filter((p) => !c.absent[p.id] && p.role !== 'POR');
  if (present.length) {
    const avg = (Object.entries(f.attrs) as [keyof Attributes, number][]).map(([k, w]) => {
      const room = present.reduce((s, p) => s + Math.max(0.15, Math.min(1, (20 - p.attrs[k]) / 9)), 0) / present.length;
      return `${ATTR_LABEL[k]} +${(mult * w * room).toFixed(2)}`;
    });
    lines.push(`De media: ${avg.join(', ')}.`);
  }
  for (const g of gains) {
    const p = c.squad.find((x) => x.id === g.id)!;
    lines.push(`${p.nick ?? p.name.split(' ')[0]} sube su ${ATTR_LABEL[g.attr]} a ${Math.floor(g.to)}.`);
  }
  if (!gains.length) lines.push('Nadie llega hoy al siguiente punto, pero todo suma.');
  const up = gainXp(c, 'tactica', 3);
  if (up) lines.push(up);
  return { lines, gains };
}

/** Recuperación diaria de la carga. */
export function recover(c: Career, amount = 0.09) {
  for (const p of c.squad) p.load = Math.max(0, p.load - amount);
}

// ───────────────────────── al partido ─────────────────────────
export function withMods(c: Career, p: SquadPlayer): PlayerProfile {
  const { load, goals, apps, ...base } = p;
  void goals;
  void apps;
  const m = c.mods[p.id];
  return { ...base, attrs: clampAttrs({ ...p.attrs, ...addMods(p.attrs, m) }), startFatigue: Math.min(0.4, load) };
}

export function homeProfile(c: Career): TeamProfile {
  const players = c.lineup.map((id) => withMods(c, c.squad.find((p) => p.id === id)!));
  const k = c.club;
  return {
    id: k.id,
    name: k.name,
    short: k.short,
    kit: k.kit,
    gkKit: k.gkKit,
    motto: k.motto,
    gender: c.gender,
    players,
    tactics: { ...c.planned },
    familiarity: c.familiarity[c.planned.formation],
    penaltyTaker: c.penaltyTaker && c.lineup.includes(c.penaltyTaker) ? c.penaltyTaker : undefined,
  };
}

export function matchSetup(c: Career): { teams: [TeamProfile, TeamProfile]; conditions: MatchConditions; seed: number } {
  const seed = (c.seed + c.season * 7001 + c.week * 101) >>> 0;
  const rival = rivalProfile(c.seed, c.gender, rivalOf(c));
  rival.familiarity = 0.6;
  const [w, t] = weatherOf(c);
  return { teams: [homeProfile(c), rival], conditions: conditionsFor(w, t, STADIUM_LEVELS[c.stadiumLevel].pitch, seed), seed };
}
