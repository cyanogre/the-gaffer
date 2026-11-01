import { GOAL_Y0, GOAL_Y1, PITCH_L, PITCH_W, clamp, dist, goalOpening, lerp, segmentDistance, sigmoid } from './geometry';
import type { MatchSim } from './match';
import { modsOf } from './traits';
import type { Block, SimPlayer, TeamSide } from './types';

/**
 * IA de los futbolistas. Dos piezas:
 *  - think(): adónde quiere ir cada jugador este tick y con qué urgencia.
 *  - decideCarrier(): qué hace el poseedor (tirar, pasar, conducir, aguantar).
 * Las órdenes tácticas cambian parámetros de estas funciones (altura del bloque,
 * número de presionadores, preferencia de pase...), nunca el resultado de un duelo.
 */

export interface Target {
  x: number;
  y: number;
  urgency: number;
}

const BLOCK_LINES: Record<Block, [number, number]> = {
  0: [0.1, 0.28],
  1: [0.16, 0.4],
  2: [0.24, 0.52],
};
const PRESS_ZONE: Record<Block, number> = { 0: 0.45, 1: 0.65, 2: 1.01 };
const MID = PITCH_W / 2;

// ───────────────────────── valor de una posición ─────────────────────────
/** Probabilidad aproximada de que la posesión acabe en gol desde (x, y). */
export function positionValue(sim: MatchSim, team: TeamSide, x: number, y: number) {
  const u = sim.toU(team, x);
  const gx = sim.attackGoalX(team);
  const d = dist(x, y, gx, MID);
  const ang = clamp(1 - Math.abs(y - MID) / 42, 0.25, 1);
  return 0.01 + 0.09 * u * u + 0.33 * Math.exp(-d / 10) * ang;
}

const lossValue = (sim: MatchSim, team: TeamSide, x: number, y: number) => 0.7 * positionValue(sim, (1 - team) as TeamSide, x, y);

export function shotXg(sim: MatchSim, p: SimPlayer) {
  const gx = sim.attackGoalX(p.team);
  const ang = goalOpening(p.x, p.y, gx);
  const d = dist(p.x, p.y, gx, MID);
  const press = sim.nearestOpponentDist(p.team, p.x, p.y);
  // Cuantos más rivales tapan la trayectoria, peor pinta tiene el disparo.
  let crowd = 1;
  for (const o of sim.players) {
    if (o.team === p.team || o.sentOff || sim.isGK(o)) continue;
    const seg = segmentDistance(o.x, o.y, p.x, p.y, gx, MID);
    if (seg.s > 0.03 && seg.s < 0.9 && seg.d < 1.6) crowd *= 0.6;
  }
  return ((1.05 * ang) / (1 + d / 8)) * crowd * (1 - 0.45 * Math.exp(-press / 1.6)) * (0.6 + (p.profile.attrs.shooting / 20) * 0.6);
}

export function passSuccess(sim: MatchSim, c: SimPlayer, tx: number, ty: number, lofted: boolean) {
  const L = dist(c.x, c.y, tx, ty);
  const tech = c.profile.attrs.passing / 20;
  let p = 1 - L * (0.004 + (1 - tech) * 0.012) - (lofted ? 0.06 + (1 - tech) * 0.08 : 0);
  const speed = lofted ? clamp(9 + L * 0.3, 12, 22) : 4 + L * 0.55;
  for (const o of sim.players) {
    if (o.team === c.team || o.sentOff) continue;
    if (lofted) {
      const d = dist(o.x, o.y, tx, ty);
      if (d < 3) p *= 1 - (1 - d / 3) * 0.7;
      continue;
    }
    const { d, s } = segmentDistance(o.x, o.y, c.x, c.y, tx, ty);
    const tb = (s * L) / speed;
    const reach = 0.6 + tb * 3.5 + (o.profile.attrs.positioning / 20) * 0.5;
    p *= 1 - clamp(1 - (d - 0.5) / reach, 0, 1) * 0.85;
  }
  const r = sim.nearestOpponentDist(c.team, tx, ty);
  p *= 1 - Math.exp(-r / 2.2) * 0.55;
  return clamp(p, 0.02, 0.98);
}

// ───────────────────────── roles dinámicos por tick ─────────────────────────
interface Roles {
  tick: number;
  chasers: [number, number];
  pressers: number[];
  contain: boolean;
  supporter: number;
}
const rolesCache = new WeakMap<MatchSim, Roles>();

function pressWeight(q: SimPlayer) {
  return modsOf(q).pressBias * (0.6 + (q.profile.attrs.workRate / 20) * 0.8) * (1 - q.fatigue * 0.5);
}

function roles(sim: MatchSim): Roles {
  const cached = rolesCache.get(sim);
  if (cached && cached.tick === sim.tick) return cached;
  const b = sim.ball;
  const r: Roles = { tick: sim.tick, chasers: [-1, -1], pressers: [], contain: false, supporter: -1 };
  if (b.owner < 0) {
    for (const team of [0, 1] as TeamSide[]) {
      const f = b.flight;
      if (f && (f.kind === 'pass' || f.kind === 'cross') && f.team === team) continue;
      let best = 1e9;
      for (const q of sim.players) {
        if (q.team !== team || q.sentOff || q.stunT > 0) continue;
        if (sim.isGK(q) && !sim.inOwnBox(team, b.x, b.y)) continue;
        const d = dist(q.x, q.y, b.x, b.y);
        const k = Math.min(0.7, d / 10);
        const tt = dist(q.x, q.y, b.x + b.vx * k, b.y + b.vy * k) / sim.topSpeed(q);
        if (tt < best) {
          best = tt;
          r.chasers[team] = q.idx;
        }
      }
    }
  } else {
    const c = sim.players[b.owner];
    const def = (1 - c.team) as TeamSide;
    const press = sim.signalActive(def, 'press');
    const block: Block = press ? 2 : sim.teams[def].tactics.block;
    const cands = sim.players
      .filter((q) => q.team === def && !q.sentOff && !sim.isGK(q))
      .sort((a, z) => dist(a.x, a.y, c.x, c.y) / pressWeight(a) - dist(z.x, z.y, c.x, c.y) / pressWeight(z));
    const inZone = sim.toU(def, c.x) < PRESS_ZONE[block];
    const n = inZone ? [1, 1, 2][block] + (press ? 2 : 0) : 1;
    r.contain = !inZone;
    r.pressers = cands.slice(0, n).map((q) => q.idx);
    let bd = 1e9;
    for (const q of sim.players) {
      if (q.team !== c.team || q === c || q.sentOff || sim.isGK(q)) continue;
      const d = dist(q.x, q.y, c.x, c.y);
      if (d < bd) {
        bd = d;
        r.supporter = q.idx;
      }
    }
  }
  rolesCache.set(sim, r);
  return r;
}

// ───────────────────────── posicionamiento ─────────────────────────
interface ShapeOpts {
  inPoss?: boolean;
  ballX?: number;
  ballY?: number;
  block?: Block;
}

export function shapeTarget(sim: MatchSim, p: SimPlayer, o: ShapeOpts = {}) {
  const team = sim.teams[p.team];
  const slot = sim.slotOf(p);
  const ballU = sim.toU(p.team, o.ballX ?? sim.ball.x);
  const ballV = sim.toV(p.team, o.ballY ?? sim.ball.y);
  const inPoss = o.inPoss ?? sim.possTeam === p.team;
  const block: Block = o.block ?? (sim.signalActive(p.team, 'press') ? 2 : team.tactics.block);
  let u: number;
  let v: number;
  if (inPoss) {
    const line = clamp(ballU - 0.32, 0.16, 0.52);
    u = line + (slot.u - 0.18) * 1.3;
    v = 0.5 + (slot.v - 0.5) * 1.1 + (ballV - 0.5) * 0.18;
  } else {
    const [lo, hi] = BLOCK_LINES[block];
    const line = clamp(ballU - 0.22, lo, hi);
    u = line + (slot.u - 0.18) * 0.82;
    v = 0.5 + (slot.v - 0.5) * 0.78 + (ballV - 0.5) * 0.32;
  }
  u += p.jx;
  v += p.jy;
  if (inPoss && slot.role !== 'DEF') {
    // Los jugadores listos se quedan pegados a la línea; los despistados la pisan.
    const off = sim.offsideLineU(p.team);
    const margin = 0.01 + (p.profile.attrs.positioning - 10) * 0.0012;
    u = Math.min(u, off - margin);
  }
  u = clamp(u, 0.03, 0.95);
  v = clamp(v, 0.04, 0.96);
  return { x: sim.fromU(p.team, u), y: sim.fromV(p.team, v) };
}

function predictedBall(sim: MatchSim, p: SimPlayer, urgency = 1): Target {
  const b = sim.ball;
  const k = Math.min(0.7, dist(p.x, p.y, b.x, b.y) / 10);
  return { x: b.x + b.vx * k, y: b.y + b.vy * k, urgency };
}

function gkTarget(sim: MatchSim, p: SimPlayer): Target {
  const b = sim.ball;
  const gx = sim.ownGoalX(p.team);
  const dir = sim.dir(p.team);
  if (b.owner === p.idx) return { x: p.x, y: p.y, urgency: 0 };
  if (sim.phase === 'play' && b.owner < 0 && roles(sim).chasers[p.team] === p.idx) return predictedBall(sim, p);
  if (sim.possTeam === p.team && sim.toU(p.team, b.x) > 0.45) return { x: gx + dir * 10, y: MID, urgency: 0.4 };
  const dG = Math.max(0.5, dist(b.x, b.y, gx, MID));
  const depth = clamp(dG * 0.13, 0.6, 6);
  let tx = gx + ((b.x - gx) / dG) * depth;
  let ty = clamp(MID + ((b.y - MID) / dG) * depth, GOAL_Y0 - 1.2, GOAL_Y1 + 1.2);
  const owner = b.owner >= 0 ? sim.players[b.owner] : null;
  if (owner && owner.team !== p.team && dG < 14) {
    tx = lerp(tx, owner.x, 0.4);
    ty = lerp(ty, owner.y, 0.4);
  }
  return { x: tx, y: ty, urgency: 0.9 };
}

function recoveryUrgency(p: SimPlayer, d: number) {
  return clamp(0.3 + d / 12, 0.3, 1) * (0.55 + (p.profile.attrs.workRate / 20) * 0.45);
}

function defendTarget(sim: MatchSim, p: SimPlayer, c: SimPlayer): Target {
  const r = roles(sim);
  const i = r.pressers.indexOf(p.idx);
  const block = sim.signalActive(p.team, 'press') ? 2 : sim.teams[p.team].tactics.block;
  if (i >= 0) {
    const gx = sim.ownGoalX(p.team);
    const dg = Math.max(0.1, dist(c.x, c.y, gx, MID));
    const ux = (gx - c.x) / dg;
    const uy = (MID - c.y) / dg;
    if (r.contain) return { x: c.x + ux * 4, y: c.y + uy * 4, urgency: 0.7 };
    if (i === 0) return { x: c.x + ux * 0.8, y: c.y + uy * 0.8, urgency: sim.signalActive(p.team, 'press') ? 1 : [0.75, 0.85, 1][block] };
    // Segundo y siguientes presionadores: cierran la línea de pase al compañero más cercano.
    const sup = r.supporter >= 0 ? sim.players[r.supporter] : null;
    if (sup) return { x: lerp(c.x, sup.x, 0.45), y: lerp(c.y, sup.y, 0.45), urgency: 0.95 };
    return { x: c.x + ux * 2.5, y: c.y + uy * 2.5, urgency: 0.95 };
  }
  let s = shapeTarget(sim, p, { inPoss: false });
  const role = sim.slotOf(p).role;
  if (role !== 'DEL') {
    const R = role === 'DEF' ? 9 : 6;
    let best: SimPlayer | null = null;
    let bd = R;
    for (const q of sim.players) {
      if (q.team === p.team || q.sentOff || sim.isGK(q)) continue;
      const d = dist(q.x, q.y, s.x, s.y);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    if (best) {
      const gx = sim.ownGoalX(p.team);
      const dg = Math.max(0.1, dist(best.x, best.y, gx, MID));
      const gsx = best.x + ((gx - best.x) / dg) * 1.6;
      const gsy = best.y + ((MID - best.y) / dg) * 1.6;
      const w = role === 'DEF' ? 0.6 : 0.35;
      s = { x: lerp(s.x, gsx, w), y: lerp(s.y, gsy, w) };
    }
  }
  return { ...s, urgency: recoveryUrgency(p, dist(p.x, p.y, s.x, s.y)) };
}

function supportTarget(sim: MatchSim, p: SimPlayer, c: SimPlayer): Target {
  const r = roles(sim);
  const slot = sim.slotOf(p);
  const counter = sim.signalActive(p.team, 'counter');
  const wide = slot.role === 'MED' && Math.abs(slot.v - 0.5) > 0.3;
  const off = sim.offsideLineU(p.team);
  if (!p.run && (slot.role === 'DEL' || (counter && wide))) {
    const cu = sim.toU(p.team, c.x);
    const pu = sim.toU(p.team, p.x);
    const rate = counter ? 3 : 0.35 * (p.freedom === 1 ? 1.6 : 1);
    if (pu <= off + 0.003 && cu > 0.25 && cu < 0.88 && sim.rng.next() < sim.dt * rate) {
      const u = Math.min(0.95, off + (counter ? 0.12 : 0.06) + sim.rng.next() * 0.05);
      const v = clamp(slot.v + (0.5 - slot.v) * 0.3, 0.08, 0.92);
      p.run = { x: sim.fromU(p.team, u), y: sim.fromV(p.team, v), until: sim.t + (counter ? 3.5 : 2.6) };
    }
  }
  if (p.run) return { x: p.run.x, y: p.run.y, urgency: counter ? 1 : 0.95 };
  if (r.supporter === p.idx) {
    const side = c.y < MID ? 1 : -1;
    const u = clamp(sim.toU(p.team, c.x) - 0.06, 0.1, 0.9);
    return { x: sim.fromU(p.team, u), y: clamp(c.y + side * 8, 2, PITCH_W - 2), urgency: 0.75 };
  }
  const s = shapeTarget(sim, p, { inPoss: true });
  return { ...s, urgency: clamp(0.3 + dist(p.x, p.y, s.x, s.y) / 10, 0.3, 0.9) };
}

function playTarget(sim: MatchSim, p: SimPlayer): Target {
  const b = sim.ball;
  if (sim.isGK(p)) return gkTarget(sim, p);
  if (b.owner === p.idx) {
    const a = p.carryDir;
    return {
      x: clamp(p.x + Math.cos(a) * 4, 0.8, PITCH_L - 0.8),
      y: clamp(p.y + Math.sin(a) * 4, 0.8, PITCH_W - 0.8),
      urgency: p.carryUrgency,
    };
  }
  if (b.owner < 0) {
    const f = b.flight;
    if (f && (f.kind === 'pass' || f.kind === 'cross') && f.to === p.idx) {
      if (dist(p.x, p.y, b.x, b.y) > 4) return { x: f.tx, y: f.ty, urgency: 1 };
      return predictedBall(sim, p);
    }
    if (roles(sim).chasers[p.team] === p.idx) return predictedBall(sim, p);
    const s = shapeTarget(sim, p);
    return { ...s, urgency: recoveryUrgency(p, dist(p.x, p.y, s.x, s.y)) };
  }
  const owner = sim.players[b.owner];
  return owner.team === p.team ? supportTarget(sim, p, owner) : defendTarget(sim, p, owner);
}

function kickoffTarget(sim: MatchSim, p: SimPlayer): Target {
  const r = sim.restart!;
  const dir = sim.dir(p.team);
  if (p.idx === r.taker) return { x: PITCH_L / 2 - dir * 0.6, y: MID, urgency: 0.6 };
  if (sim.isGK(p)) return { x: sim.ownGoalX(p.team) + dir * 1.5, y: MID, urgency: 0.5 };
  const s = shapeTarget(sim, p, { inPoss: false, ballX: PITCH_L / 2, ballY: MID, block: 1 });
  let x = sim.fromU(p.team, Math.min(sim.toU(p.team, s.x), 0.46));
  let y = s.y;
  if (p.team !== r.team) {
    const d = dist(x, y, PITCH_L / 2, MID);
    if (d < 9.6) {
      const k = 9.6 / Math.max(d, 0.1);
      x = PITCH_L / 2 + (x - PITCH_L / 2) * k;
      y = MID + (y - MID) * k;
    }
  }
  return { x, y, urgency: 0.6 };
}

function restartTarget(sim: MatchSim, p: SimPlayer): Target {
  const r = sim.restart!;
  const b = sim.ball;
  const atkDir = sim.dir(r.team);
  if (p.idx === r.taker) {
    if (r.kind === 'throw') return { x: b.x, y: b.y + (b.y < MID ? -0.5 : 0.5), urgency: 0.85 };
    return { x: b.x - atkDir * 0.6, y: b.y, urgency: 0.85 };
  }
  if (sim.isGK(p)) {
    if (r.kind === 'penalty' && p.team !== r.team) return { x: sim.ownGoalX(p.team), y: MID, urgency: 0.6 };
    return gkTarget(sim, p);
  }
  const slot = sim.slotOf(p);
  let s: { x: number; y: number };
  if (r.kind === 'corner' && p.team === r.team && (slot.role === 'DEL' || p.slot === 2 || p.slot === 3)) {
    const gx = sim.attackGoalX(r.team);
    const inward = -atkDir;
    const near = b.y < MID ? -1 : 1;
    const spots = [
      { x: gx + inward * 2.5, y: MID + near * 2.5 },
      { x: gx + inward * 6, y: MID - near * 3 },
      { x: gx + inward * 11, y: MID },
      { x: gx + inward * 4.5, y: MID + near * 0.5 },
      { x: gx + inward * 14, y: MID - near * 6 },
    ];
    const attackers = sim.active(r.team).filter((q) => sim.slotOf(q).role === 'DEL' || q.slot === 2 || q.slot === 3);
    s = spots[attackers.indexOf(p) % spots.length];
  } else if (p.team !== r.team && (r.kind === 'corner' || r.kind === 'penalty')) {
    s = shapeTarget(sim, p, { inPoss: false, block: 0 });
  } else {
    s = shapeTarget(sim, p, { inPoss: p.team === r.team });
  }
  if (r.kind === 'penalty') {
    const defTeam = (1 - r.team) as TeamSide;
    if (sim.inOwnBox(defTeam, s.x, s.y)) s = { x: sim.ownGoalX(defTeam) + sim.dir(defTeam) * 18, y: s.y };
  }
  if (p.team !== r.team && r.kind !== 'throw') {
    const d = dist(s.x, s.y, b.x, b.y);
    if (d < 9.5) {
      const k = 9.5 / Math.max(d, 0.1);
      s = { x: b.x + (s.x - b.x) * k, y: b.y + (s.y - b.y) * k };
    }
  }
  return { ...s, urgency: 0.7 };
}

function goalTarget(sim: MatchSim, p: SimPlayer): Target {
  const g = sim.lastGoal!;
  const scorer = sim.players[g.scorer];
  if (p.idx === g.scorer && scorer.team === g.team) {
    const corner = scorer.y < MID ? -1.5 : PITCH_W + 1.5;
    return { x: sim.attackGoalX(g.team) - sim.dir(g.team) * 10, y: corner, urgency: 0.85 };
  }
  if (p.team === g.team && !sim.isGK(p) && dist(p.x, p.y, scorer.x, scorer.y) < 32) {
    const a = p.idx * 1.7;
    return { x: scorer.x + Math.cos(a) * 1.6, y: scorer.y + Math.sin(a) * 1.6, urgency: 0.9 };
  }
  const s = shapeTarget(sim, p, { inPoss: false, ballX: PITCH_L / 2, ballY: MID, block: 1 });
  return { ...s, urgency: 0.25 };
}

export function think(sim: MatchSim, p: SimPlayer): Target {
  if (p.sentOff) return { x: p.x, y: -5, urgency: 0.3 };
  switch (sim.phase) {
    case 'kickoff':
      return kickoffTarget(sim, p);
    case 'restart':
      return restartTarget(sim, p);
    case 'goal':
      return goalTarget(sim, p);
    case 'fulltime': {
      const s = shapeTarget(sim, p, { inPoss: false, ballX: PITCH_L / 2, ballY: MID, block: 0 });
      return { ...s, urgency: 0.2 };
    }
    default:
      return playTarget(sim, p);
  }
}

// ───────────────────────── decisión del poseedor ─────────────────────────
type Option =
  | { kind: 'shoot'; util: number }
  | { kind: 'pass'; util: number; raw: number; q: SimPlayer; tx: number; ty: number; lofted: boolean }
  | { kind: 'dribble'; util: number; a: number; open: number }
  | { kind: 'hold'; util: number };

export function decideCarrier(sim: MatchSim, c: SimPlayer) {
  const restrict = sim.restrict;
  const team = c.team;
  const A = c.profile.attrs;
  const m = modsOf(c);
  const gk = sim.isGK(c);
  const gx = sim.attackGoalX(team);
  const pressure = sim.nearestOpponentDist(team, c.x, c.y);
  const noise = 0.006 * (1.8 - A.vision / 20 - (A.composure / 20) * m.composure);
  const here = positionValue(sim, team, c.x, c.y);
  const hereLoss = lossValue(sim, team, c.x, c.y);
  const opts: Option[] = [];
  const g = () => sim.rng.gauss() * noise;

  if (restrict === 'penalty') {
    sim.executeShot(c);
    return;
  }

  const canShoot = !gk && (!restrict || restrict === 'freekick');
  if (canShoot && dist(c.x, c.y, gx, MID) < 34 * m.shootRange && sim.toU(team, c.x) > 0.6) {
    opts.push({ kind: 'shoot', util: shotXg(sim, c) * 0.8 * m.shootBias + g() });
  }

  const off = sim.offsideLineU(team);
  const style = sim.teams[team].tactics.style;
  const counter = sim.signalActive(team, 'counter');
  for (const q of sim.players) {
    if (q.team !== team || q === c || q.sentOff) continue;
    const lead = q.run ? 0.75 : 0.3;
    const tx = clamp(q.x + q.vx * lead, 1, PITCH_L - 1);
    const ty = clamp(q.y + q.vy * lead, 1, PITCH_W - 1);
    const L = dist(c.x, c.y, tx, ty);
    if (L < 3.5) continue;
    if (restrict === 'throw' && L > 25) continue;
    if (restrict === 'kickoff' && sim.toU(team, tx) > sim.toU(team, c.x) + 0.02) continue;
    if (L > 18 + A.vision * 1.6 && sim.rng.next() > 0.12) continue;
    const ground = passSuccess(sim, c, tx, ty, false);
    const air = L > 14 && restrict !== 'throw' ? passSuccess(sim, c, tx, ty, true) : 0;
    const lofted = air > ground;
    const pS = Math.max(ground, air);
    let util = pS * positionValue(sim, team, tx, ty) - (1 - pS) * lossValue(sim, team, tx, ty);
    const progress = sim.toU(team, tx) - sim.toU(team, c.x);
    if (style === 'long' && L > 25 && progress > 0.1) util += 0.012;
    if (style === 'short') util += L < 18 ? 0.006 : L > 28 ? -0.01 : 0;
    util += Math.max(0, progress) * 0.03 * (m.riskyPass - 1);
    if (counter) util += Math.max(0, progress) * 0.08;
    const qu = sim.toU(team, q.x);
    if (qu > 0.5 && qu > off + 0.004) util *= (A.vision / 20) * 0.3;
    if (q.idx === c.lastPasser && sim.t - c.lastPassAt < 1.5) util *= 0.85;
    if (sim.isGK(q)) util *= pressure < 3 ? 0.8 : 0.5;
    const raw = util;
    opts.push({ kind: 'pass', util: util * m.passBias + g(), raw, q, tx, ty, lofted });
  }

  if (!restrict && !gk) {
    const base = Math.atan2(MID - c.y, gx - c.x);
    const straight = sim.dir(team) > 0 ? 0 : Math.PI;
    for (const a of [base, base + 0.6, base - 0.6, straight]) {
      const ax = c.x + Math.cos(a) * 5;
      const ay = c.y + Math.sin(a) * 5;
      if (ax < 1 || ax > PITCH_L - 1 || ay < 1 || ay > PITCH_W - 1) continue;
      const open = sim.nearestOpponentDist(team, ax, ay);
      const nerves = m.composure < 1 && pressure < 3 ? -0.6 : 0;
      const pKeep = sigmoid((A.dribbling - 10) / 4 + (Math.min(open, pressure + 1) - 3) * 0.9 + nerves);
      const util = (pKeep * positionValue(sim, team, ax, ay) - (1 - pKeep) * hereLoss) * m.dribbleBias + g();
      opts.push({ kind: 'dribble', util, a, open });
    }
  }

  // Aguantar el balón cuesta tiempo: el rival se ordena. El portero, por reglamento, no puede eternizarse.
  const held = sim.t - sim.ball.ownedAt;
  if ((!restrict || gk) && !(gk && held > 2.5)) {
    const pHold = sigmoid((pressure - 2.2) * 1.5 + (A.dribbling - 10) / 6);
    opts.push({ kind: 'hold', util: pHold * here * 0.9 - (1 - pHold) * hereLoss - held * 0.003 + g() });
  }

  if (!opts.length) {
    const mate = sim.players.filter((q) => q.team === team && q !== c && !q.sentOff).sort((a, z) => dist(a.x, a.y, c.x, c.y) - dist(z.x, z.y, c.x, c.y))[0];
    sim.executePass(c, mate, mate.x, mate.y, false);
    return;
  }

  let best = opts[0];
  for (const o of opts) if (o.util > best.util) best = o;

  if (c.profile.traits.includes('egoista') && best.kind !== 'pass' && c.selfishCd <= 0) {
    const bestPass = opts.filter((o): o is Extract<Option, { kind: 'pass' }> => o.kind === 'pass').sort((a, z) => z.raw - a.raw)[0];
    if (bestPass && bestPass.raw > best.util + 0.015) {
      sim.emit('selfish', { team, a: c.idx, b: bestPass.q.idx });
      c.selfishCd = 10;
    }
  }

  switch (best.kind) {
    case 'shoot':
      sim.executeShot(c);
      break;
    case 'pass':
      sim.executePass(c, best.q, best.tx, best.ty, best.lofted);
      break;
    case 'dribble':
      c.carryDir = best.a;
      c.carryUrgency = best.open > 4 ? 0.95 : 0.7;
      c.decideAt = sim.t + 0.3 + sim.rng.next() * 0.2;
      break;
    case 'hold': {
      let nx = 0;
      let ny = 0;
      for (const o of sim.players) {
        if (o.team === team || o.sentOff) continue;
        const d = dist(o.x, o.y, c.x, c.y);
        if (d < 5) {
          nx += (c.x - o.x) / (d + 0.1);
          ny += (c.y - o.y) / (d + 0.1);
        }
      }
      c.carryDir = nx || ny ? Math.atan2(ny, nx) : c.facing;
      c.carryUrgency = 0.15;
      c.decideAt = sim.t + 0.3;
      break;
    }
  }
}
