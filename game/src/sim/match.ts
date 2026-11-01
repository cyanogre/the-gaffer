import { decideCarrier, think } from './ai';
import { DEFAULT_CONDITIONS, physicsOf, type MatchConditions } from './conditions';
import { FORMATIONS, type Slot } from './formations';
import {
  BOX_D,
  BOX_W,
  GOAL_H,
  GOAL_Y0,
  GOAL_Y1,
  GRAVITY,
  PENALTY_D,
  PITCH_L,
  PITCH_W,
  clamp,
  dist,
  segmentDistance,
  sigmoid,
} from './geometry';
import { Rng } from './rng';
import { modsOf } from './traits';
import type {
  Ball,
  Command,
  MatchEvent,
  MatchEventKind,
  Phase,
  Restart,
  RestartKind,
  SimPlayer,
  Stats,
  TeamProfile,
  TeamSide,
  TeamState,
} from './types';

export const DT = 1 / 30;
/** Segundos de reloj de partido por segundo real: 90 minutos en 10 minutos de juego. */
export const CLOCK_FACTOR = 9;
export const MATCH_SECONDS = 90 * 60;

const zero2 = (): [number, number] => [0, 0];

export class MatchSim {
  readonly dt = DT;
  t = 0;
  tick = 0;
  rng: Rng;
  teams: [TeamState, TeamState];
  players: SimPlayer[] = [];
  ball: Ball;
  phase: Phase = 'kickoff';
  phaseT = 0;
  restart: Restart | null = null;
  /** Mientras el lanzador de una jugada a balón parado no suelte el balón, sus opciones están limitadas. */
  restrict: RestartKind | null = null;
  score: [number, number] = [0, 0];
  stats: Stats = {
    possession: zero2(),
    shots: zero2(),
    onTarget: zero2(),
    passes: zero2(),
    passesOk: zero2(),
    fouls: zero2(),
    yellows: zero2(),
    offsides: zero2(),
    tackles: zero2(),
  };
  possTeam: TeamSide = 0;
  lastGoal: { team: TeamSide; scorer: number; at: number } | null = null;
  readonly seed: number;
  conditions: MatchConditions;
  phys: ReturnType<typeof physicsOf>;
  private events: MatchEvent[] = [];
  private queue: Command[] = [];

  constructor(seed: number, profiles: [TeamProfile, TeamProfile], conditions: MatchConditions = DEFAULT_CONDITIONS) {
    this.seed = seed;
    this.conditions = conditions;
    this.phys = physicsOf(conditions);
    this.rng = new Rng(seed);
    this.teams = profiles.map((profile, side) => ({
      side: side as TeamSide,
      profile,
      tactics: { ...profile.tactics },
      signal: null,
      signalCooldown: { press: 0, counter: 0 },
    })) as [TeamState, TeamState];
    let idx = 0;
    for (const team of this.teams) {
      // Formación poco trabajada → los jugadores se van más de su sitio (0,75 = neutro).
      const jit = 0.6 + (1 - (team.profile.familiarity ?? 0.75)) * 1.6;
      team.profile.players.forEach((profile, slot) => {
        this.players.push({
          idx: idx++,
          team: team.side,
          slot,
          profile,
          x: 0,
          y: 0,
          px: 0,
          py: 0,
          vx: 0,
          vy: 0,
          facing: team.side === 0 ? 0 : Math.PI,
          fatigue: clamp(profile.startFatigue ?? 0, 0, 0.6),
          action: 'none',
          actionT: 0,
          actionDur: 0,
          actionSide: 1,
          stunT: 0,
          decideAt: 0,
          tackleCd: 0,
          touchCd: 0,
          freedom: 0,
          yellows: 0,
          sentOff: false,
          run: null,
          jx: this.rng.range(-0.018, 0.018) * jit,
          jy: this.rng.range(-0.02, 0.02) * jit,
          lastPasser: -1,
          lastPassAt: -10,
          carryDir: 0,
          carryUrgency: 0.5,
          selfishCd: 0,
        });
      });
    }
    this.ball = {
      x: PITCH_L / 2,
      y: PITCH_W / 2,
      z: 0,
      px: PITCH_L / 2,
      py: PITCH_W / 2,
      pz: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      owner: -1,
      lastTouch: -1,
      prevTouch: -1,
      lastTeam: 0,
      flight: null,
      spin: 0,
      ownedAt: 0,
    };
    this.setRestart('kickoff', 0, PITCH_L / 2, PITCH_W / 2);
    for (const p of this.players) {
      const tg = think(this, p);
      p.x = p.px = tg.x;
      p.y = p.py = tg.y;
    }
  }

  // ───────────────────────── utilidades de coordenadas ─────────────────────────
  dir(team: TeamSide) {
    return team === 0 ? 1 : -1;
  }
  attackGoalX(team: TeamSide) {
    return team === 0 ? PITCH_L : 0;
  }
  ownGoalX(team: TeamSide) {
    return team === 0 ? 0 : PITCH_L;
  }
  toU(team: TeamSide, x: number) {
    return team === 0 ? x / PITCH_L : 1 - x / PITCH_L;
  }
  toV(team: TeamSide, y: number) {
    return team === 0 ? y / PITCH_W : 1 - y / PITCH_W;
  }
  fromU(team: TeamSide, u: number) {
    return team === 0 ? u * PITCH_L : (1 - u) * PITCH_L;
  }
  fromV(team: TeamSide, v: number) {
    return team === 0 ? v * PITCH_W : (1 - v) * PITCH_W;
  }
  get clock() {
    return Math.min(MATCH_SECONDS, this.t * CLOCK_FACTOR);
  }
  slotOf(p: SimPlayer): Slot {
    return FORMATIONS[this.teams[p.team].tactics.formation][p.slot];
  }
  isGK(p: SimPlayer) {
    return p.slot === 0;
  }
  keeper(team: TeamSide) {
    return this.players.find((p) => p.team === team && p.slot === 0)!;
  }
  active(team?: TeamSide) {
    return this.players.filter((p) => !p.sentOff && (team === undefined || p.team === team));
  }
  kitOf(p: SimPlayer) {
    const prof = this.teams[p.team].profile;
    return this.isGK(p) ? prof.gkKit : prof.kit;
  }
  topSpeed(p: SimPlayer) {
    return (5.4 + (p.profile.attrs.pace / 20) * 3.2) * (1 - p.fatigue * 0.3);
  }
  nearestOpponentDist(team: TeamSide, x: number, y: number) {
    let best = 99;
    for (const q of this.players) {
      if (q.team === team || q.sentOff) continue;
      const d = dist(q.x, q.y, x, y);
      if (d < best) best = d;
    }
    return best;
  }
  /** Línea de fuera de juego (en coordenadas de ataque del equipo `team`): penúltimo defensor. */
  offsideLineU(team: TeamSide) {
    const us = this.players
      .filter((q) => q.team !== team && !q.sentOff)
      .map((q) => this.toU(team, q.x))
      .sort((a, b) => b - a);
    return Math.max(us[1] ?? 0.5, 0.5);
  }
  inOwnBox(team: TeamSide, x: number, y: number) {
    const gx = this.ownGoalX(team);
    return Math.abs(x - gx) < BOX_D && Math.abs(y - PITCH_W / 2) < BOX_W / 2;
  }
  signalActive(team: TeamSide, kind: 'press' | 'counter') {
    const s = this.teams[team].signal;
    if (!s || s.kind !== kind) return false;
    return kind === 'press' ? s.until > this.t : s.activeUntil > this.t;
  }

  // ───────────────────────── órdenes y eventos ─────────────────────────
  command(c: Command) {
    this.queue.push(c);
  }

  drainEvents(): MatchEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  emit(kind: MatchEventKind, data: Partial<MatchEvent> = {}) {
    this.events.push({ t: this.t, clock: this.clock, kind, ...data });
  }

  private applyCommands() {
    for (const c of this.queue) {
      if (c.kind === 'conditions') {
        this.conditions = c.value;
        this.phys = physicsOf(c.value);
      } else if (c.kind === 'tactics') {
        Object.assign(this.teams[c.team].tactics, c.patch);
        this.emit('tactic', { team: c.team, detail: JSON.stringify(c.patch) });
      } else if (c.kind === 'freedom') {
        const p = this.players[c.player];
        if (p) p.freedom = c.value;
      } else if (c.kind === 'sub') {
        const p = this.players[c.player];
        if (!p || p.sentOff || this.phase === 'fulltime') continue;
        const out = p.profile;
        p.profile = c.profile;
        p.fatigue = clamp(c.profile.startFatigue ?? 0, 0, 0.6);
        p.yellows = 0;
        p.freedom = 0;
        p.stunT = 0;
        this.emit('sub', { team: p.team, a: p.idx, detail: out.name });
      } else if (c.kind === 'signal') {
        const team = this.teams[c.team];
        if (team.signalCooldown[c.signal] > this.t) continue;
        if (c.signal === 'press') {
          team.signal = { kind: 'press', until: this.t + 25, activeUntil: this.t + 25 };
          team.signalCooldown.press = this.t + 45;
        } else {
          team.signal = { kind: 'counter', until: this.t + 45, activeUntil: 0 };
          team.signalCooldown.counter = this.t + 60;
        }
        this.emit('signal', { team: c.team, detail: c.signal });
      }
    }
    this.queue = [];
  }

  // ───────────────────────── bucle principal ─────────────────────────
  step() {
    this.applyCommands();
    this.tick++;
    this.t += DT;
    this.phaseT += DT;
    for (const p of this.players) {
      p.px = p.x;
      p.py = p.y;
    }
    const b = this.ball;
    b.px = b.x;
    b.py = b.y;
    b.pz = b.z;

    for (const team of this.teams) {
      const s = team.signal;
      if (s && s.until < this.t && s.activeUntil < this.t) team.signal = null;
    }
    for (const p of this.players) {
      if (p.actionT > 0) {
        p.actionT -= DT;
        if (p.actionT <= 0) p.action = 'none';
      }
      p.stunT = Math.max(0, p.stunT - DT);
      p.tackleCd = Math.max(0, p.tackleCd - DT);
      p.touchCd = Math.max(0, p.touchCd - DT);
      p.selfishCd = Math.max(0, p.selfishCd - DT);
      if (p.run && p.run.until < this.t) p.run = null;
    }

    if (this.phase !== 'fulltime' && this.clock >= MATCH_SECONDS && (this.phase === 'play' || this.phase === 'restart')) {
      this.phase = 'fulltime';
      this.phaseT = 0;
      b.owner = -1;
      b.flight = null;
      this.emit('fulltime');
    }

    switch (this.phase) {
      case 'kickoff':
      case 'restart':
        this.stepRestart();
        break;
      case 'play':
        this.stepPlay();
        break;
      case 'goal':
        this.stepGoal();
        break;
      case 'fulltime':
        this.moveAll();
        this.stepBallPhysics();
        break;
    }
  }

  private moveAll() {
    for (const p of this.players) {
      const tg = think(this, p);
      this.move(p, tg.x, tg.y, tg.urgency);
    }
  }

  private stepPlay() {
    const b = this.ball;
    // 1. Decisión del poseedor.
    if (b.owner >= 0) {
      const c = this.players[b.owner];
      // Cerca de la línea de fondo o de banda no se puede seguir conduciendo a ciegas.
      const nearEdge = c.x < 6 || c.x > PITCH_L - 6 || c.y < 2.5 || c.y > PITCH_W - 2.5;
      if (nearEdge && c.decideAt > this.t + 0.1 && c.carryUrgency > 0.3) c.decideAt = this.t;
      if (this.t >= c.decideAt && c.stunT <= 0) decideCarrier(this, c);
    }
    // 2. Movimiento de los 22.
    this.moveAll();
    // 3. Balón.
    this.stepBallPhysics();
    if (this.phase !== 'play') return;
    // 4. Duelos, controles y paradas.
    this.resolveTackles();
    if (this.phase !== 'play') return;
    this.resolveKeeper();
    this.resolveTouches();
    if (this.phase !== 'play') return;
    // 5. Reglas: gol, fuera de banda, saques.
    this.resolveBounds();
    if (this.phase === 'play') this.stats.possession[this.possTeam] += DT;
  }

  move(p: SimPlayer, tx: number, ty: number, urgency: number) {
    if (p.stunT > 0) {
      // En el suelo o tras un regate: solo inercia.
      p.vx *= 0.88;
      p.vy *= 0.88;
    } else {
      const dx = tx - p.x;
      const dy = ty - p.y;
      const d = Math.hypot(dx, dy);
      let cap = this.topSpeed(p) * (0.35 + 0.65 * clamp(urgency, 0, 1));
      if (this.ball.owner === p.idx) cap *= 0.8 + (p.profile.attrs.dribbling / 20) * 0.12;
      const want = d > 0.05 ? Math.min(cap, d * 1.8) : 0;
      let wx = d > 0.05 ? (dx / d) * want : 0;
      let wy = d > 0.05 ? (dy / d) * want : 0;
      // Separación entre compañeros para que no se amontonen.
      for (const q of this.players) {
        if (q === p || q.team !== p.team || q.sentOff) continue;
        const sx = p.x - q.x;
        const sy = p.y - q.y;
        const sd = Math.hypot(sx, sy);
        if (sd < 1.6 && sd > 1e-3) {
          wx += (sx / sd) * (1.6 - sd) * 1.5;
          wy += (sy / sd) * (1.6 - sd) * 1.5;
        }
      }
      const accel = (10 + (p.profile.attrs.pace / 20) * 6) * DT;
      let ax = wx - p.vx;
      let ay = wy - p.vy;
      const al = Math.hypot(ax, ay);
      if (al > accel) {
        ax = (ax / al) * accel;
        ay = (ay / al) * accel;
      }
      p.vx += ax;
      p.vy += ay;
    }
    p.x += p.vx * DT;
    p.y += p.vy * DT;
    if (!p.sentOff) {
      p.x = clamp(p.x, -2.5, PITCH_L + 2.5);
      p.y = clamp(p.y, -2.5, PITCH_W + 2.5);
    }
    const spd = Math.hypot(p.vx, p.vy);
    const m = modsOf(p);
    const staminaFactor = (1.5 - p.profile.attrs.stamina / 20) * m.staminaMult;
    p.fatigue += DT * (spd / 8.6) ** 2 * 0.006 * staminaFactor * this.phys.fatigue;
    if (spd < 2.5) p.fatigue -= DT * 0.0014;
    p.fatigue = clamp(p.fatigue, 0, 1);
    if (spd > 0.6) {
      const target = Math.atan2(p.vy, p.vx);
      p.facing = angleTo(p.facing, target, 0.3);
    } else if (this.ball.owner !== p.idx) {
      p.facing = angleTo(p.facing, Math.atan2(this.ball.y - p.y, this.ball.x - p.x), 0.12);
    }
  }

  stepBallPhysics() {
    const b = this.ball;
    if (b.owner >= 0) {
      const o = this.players[b.owner];
      b.x = o.x + Math.cos(o.facing) * 0.55;
      b.y = o.y + Math.sin(o.facing) * 0.55;
      // El balón controlado no cruza la línea por estar "delante del pie": se queda dentro.
      if (b.x < 0.3 || b.x > PITCH_L - 0.3) b.x = clamp(o.x, 0.3, PITCH_L - 0.3);
      if (b.y < 0.3 || b.y > PITCH_W - 0.3) b.y = clamp(o.y, 0.3, PITCH_W - 0.3);
      b.z = 0;
      b.vx = o.vx;
      b.vy = o.vy;
      b.vz = 0;
      b.spin += Math.hypot(o.vx, o.vy) * DT * 2.5;
      return;
    }
    b.x += b.vx * DT;
    b.y += b.vy * DT;
    b.z += b.vz * DT;
    if (b.z > 0 || b.vz > 0) {
      b.vz -= GRAVITY * DT;
      b.vx *= 1 - 0.12 * DT;
      b.vy *= 1 - 0.12 * DT;
      // el viento desvía los balones aéreos
      b.vx += this.conditions.windX * 0.14 * DT;
      b.vy += this.conditions.windY * 0.14 * DT;
    }
    if (b.z <= 0) {
      b.z = 0;
      if (b.vz < -1.5) {
        b.vz = -b.vz * 0.45;
        b.vx *= 0.82;
        b.vy *= 0.82;
      } else b.vz = 0;
    }
    const sp = Math.hypot(b.vx, b.vy);
    if (b.z === 0 && b.vz === 0 && sp > 0) {
      const nsp = Math.max(0, sp - (1.6 + sp * 0.18) * this.phys.roll * DT);
      b.vx *= nsp / sp;
      b.vy *= nsp / sp;
      // campo de tierra: piedras y socavones desvían el balón
      if (sp > 3 && this.phase === 'play' && this.rng.next() < this.phys.bobble * DT) {
        const a = this.rng.range(-0.5, 0.5);
        const c = Math.cos(a);
        const s2 = Math.sin(a);
        const vx = b.vx * c - b.vy * s2;
        b.vy = b.vx * s2 + b.vy * c;
        b.vx = vx;
        b.vz = this.rng.range(1, 2.5);
        this.emit('bobble', { a: b.lastTouch });
      }
    }
    b.spin += sp * DT * 2.5;
    // Red de la portería durante la celebración.
    if (this.phase === 'goal') {
      if (b.x < -1.8 || b.x > PITCH_L + 1.8) {
        b.x = clamp(b.x, -1.8, PITCH_L + 1.8);
        b.vx *= -0.15;
        b.vy *= 0.3;
      }
      b.y = clamp(b.y, GOAL_Y0 + 0.2, GOAL_Y1 - 0.2);
      b.z = Math.min(b.z, GOAL_H - 0.2);
    }
  }

  // ───────────────────────── posesión ─────────────────────────
  takePossession(q: SimPlayer, how: 'control' | 'tackle' | 'save' = 'control') {
    const b = this.ball;
    const f = b.flight;
    if (f && (f.kind === 'pass' || f.kind === 'cross')) {
      if (q.team === f.team) {
        if (f.offside && q.idx === f.to) {
          this.stats.offsides[q.team]++;
          this.emit('offside', { team: q.team, a: q.idx });
          this.setRestart('freekick', (1 - q.team) as TeamSide, q.x, q.y);
          return;
        }
        this.stats.passesOk[q.team]++;
        this.emit('pass_ok', { team: q.team, a: f.from, b: q.idx });
      } else {
        this.emit('intercept', { team: q.team, a: q.idx, b: f.from });
      }
    }
    const changed = q.team !== this.possTeam;
    b.owner = q.idx;
    b.ownedAt = this.t;
    b.flight = null;
    b.z = 0;
    b.vz = 0;
    if (b.lastTouch !== q.idx) b.prevTouch = b.lastTouch;
    b.lastTouch = q.idx;
    b.lastTeam = q.team;
    this.possTeam = q.team;
    const comp = q.profile.attrs.composure / 20;
    q.decideAt = this.t + (how === 'save' ? 1.3 : 0.22 + (1 - comp) * 0.3 + this.rng.next() * 0.15);
    q.carryDir = this.dir(q.team) > 0 ? 0 : Math.PI;
    if (how === 'save') {
      q.facing = q.carryDir;
      q.x = clamp(q.x, 0.6, PITCH_L - 0.6);
    }
    q.carryUrgency = 0.45;
    q.run = null;
    if (changed && this.phase === 'play') this.onRecovery(q.team);
  }

  private onRecovery(team: TeamSide) {
    const s = this.teams[team].signal;
    if (s && s.kind === 'counter' && s.activeUntil === 0 && s.until > this.t) {
      s.activeUntil = this.t + 7;
      s.until = this.t + 7;
      this.emit('counter_go', { team });
    }
  }

  // ───────────────────────── duelos ─────────────────────────
  private resolveTackles() {
    const b = this.ball;
    if (b.owner < 0) return;
    const c = this.players[b.owner];
    for (const d of this.players) {
      if (d.team === c.team || d.sentOff || d.stunT > 0 || d.tackleCd > 0) continue;
      const reach = this.isGK(d) ? 1.5 : 1.25;
      if (dist(d.x, d.y, c.x, c.y) > reach) continue;
      const press = this.signalActive(d.team, 'press') ? 1.2 : 1;
      const chance = 0.08 * (0.6 + (d.profile.attrs.aggression / 20) * 0.8) * press;
      if (this.rng.next() < chance) {
        this.resolveTackle(d, c);
        return;
      }
    }
  }

  private resolveTackle(d: SimPlayer, c: SimPlayer) {
    const md = modsOf(d);
    const mc = modsOf(c);
    const gk = this.isGK(d);
    const A = d.profile.attrs;
    d.tackleCd = 1.0;
    const slide = !gk && this.rng.next() < clamp((0.1 + (A.aggression / 20) * 0.25) * md.slideMult, 0, 0.85);
    const helpers = this.players.filter((q) => q.team === d.team && q !== d && !q.sentOff && dist(q.x, q.y, c.x, c.y) < 2.5).length;
    const skill = ((gk ? A.keeping : A.tackling) - c.profile.attrs.dribbling) / 5;
    const pWin = sigmoid(skill + (slide ? 0.35 : 0) + (c.fatigue - d.fatigue) * 0.8 + helpers * 0.25 - 0.1);
    const pFoul = clamp((0.035 + (A.aggression / 20) * 0.07 + (slide ? 0.09 : 0) + (1 - A.tackling / 20) * 0.05) * md.foulMult, 0, 0.6);
    d.action = slide ? 'tackle' : 'poke';
    d.actionDur = d.actionT = slide ? 0.9 : 0.35;
    d.actionSide = 1;
    // terreno mojado o helado: el que entra puede acabar en el suelo
    if (this.rng.next() < this.phys.slip) {
      d.action = 'fall';
      d.actionDur = d.actionT = 1.1;
      d.stunT = 1.2;
      this.emit('slip', { team: d.team, a: d.idx });
      return;
    }
    if (this.rng.next() < pFoul) {
      this.foul(d, c, slide);
      return;
    }
    if (this.rng.next() < pWin) {
      if (mc.diveChance > 0 && this.rng.next() < mc.diveChance) {
        this.dive(c, d);
        return;
      }
      this.stats.tackles[d.team]++;
      this.emit('tackle', { team: d.team, a: d.idx, b: c.idx, detail: slide ? 'slide' : 'stand' });
      c.stunT = 0.35;
      c.touchCd = 0.5;
      if (slide) {
        const b = this.ball;
        b.owner = -1;
        b.flight = null;
        const a = d.facing + this.rng.range(-0.6, 0.6);
        const s = this.rng.range(3, 6);
        b.vx = Math.cos(a) * s;
        b.vy = Math.sin(a) * s;
        b.lastTouch = d.idx;
        b.lastTeam = d.team;
        d.stunT = 0.6;
      } else this.takePossession(d, 'tackle');
    } else {
      d.stunT = slide ? 1.0 : 0.35;
    }
  }

  private dive(c: SimPlayer, d: SimPlayer) {
    c.action = 'fall';
    c.actionDur = c.actionT = 1.2;
    c.stunT = 1.0;
    if (this.rng.next() < 0.55) {
      this.emit('dive', { team: c.team, a: c.idx, b: d.idx, value: 1 });
      this.foul(d, c, false, true);
    } else {
      this.emit('dive', { team: c.team, a: c.idx, b: d.idx, value: 0 });
      if (this.rng.next() < 0.3) this.card(c);
      this.takePossession(d, 'tackle');
    }
  }

  private foul(d: SimPlayer, c: SimPlayer, slide: boolean, simulated = false) {
    this.stats.fouls[d.team]++;
    this.emit('foul', { team: d.team, a: d.idx, b: c.idx, value: simulated ? 1 : 0 });
    if (c.action !== 'fall') {
      c.action = 'fall';
      c.actionDur = c.actionT = 1.0;
      c.stunT = 0.8;
    }
    const pYellow = 0.12 + (slide ? 0.25 : 0) + (d.profile.attrs.aggression / 20) * 0.12;
    if (this.rng.next() < pYellow) this.card(d);
    if (this.inOwnBox(d.team, c.x, c.y)) {
      const gx = this.ownGoalX(d.team);
      this.setRestart('penalty', c.team, gx + this.dir(d.team) * PENALTY_D, PITCH_W / 2);
    } else {
      this.setRestart('freekick', c.team, c.x, c.y);
    }
  }

  private card(p: SimPlayer) {
    p.yellows++;
    this.stats.yellows[p.team]++;
    if (p.yellows >= 2) {
      p.sentOff = true;
      p.run = null;
      if (this.ball.owner === p.idx) this.ball.owner = -1;
      this.emit('red', { team: p.team, a: p.idx });
    } else this.emit('yellow', { team: p.team, a: p.idx });
  }

  // ───────────────────────── portero ─────────────────────────
  private resolveKeeper() {
    const b = this.ball;
    const f = b.flight;
    if (!f || f.kind !== 'shot' || f.saveTried) return;
    const def = (1 - f.team) as TeamSide;
    const gk = this.keeper(def);
    if (gk.sentOff) return;
    const lineX = this.ownGoalX(def);
    if ((lineX - b.x) * b.vx <= 0) return;
    const tl = (lineX - b.x) / b.vx;
    if (tl > 0.42) return;
    f.saveTried = true;
    const yL = b.y + b.vy * tl;
    const zL = b.z + b.vz * tl - 0.5 * GRAVITY * tl * tl;
    const K = gk.profile.attrs.keeping;
    // Alcance = estirada + lo que le da tiempo a desplazarse desde que se golpea el balón.
    const total = this.t - f.t + tl;
    const react = 0.25 - (K / 20) * 0.1;
    const reach = 1.0 + (K / 20) * 1.4 + Math.max(0, total - react) * 3.6;
    // Salir de la línea reduce el ángulo: se mide la distancia lateral en el plano del portero.
    const tk = (gk.x - b.x) / b.vx;
    const yK = tk > 0 && tk < tl ? b.y + b.vy * tk : yL;
    const lateral = Math.abs(yK - gk.y);
    const side = Math.sign(yL - gk.y) || 1;
    const speed = Math.hypot(b.vx, b.vy);
    if (lateral > 0.9) {
      gk.action = 'dive';
      gk.actionDur = gk.actionT = 1.1;
      gk.actionSide = side;
      gk.vy = side * Math.min(lateral, reach) / 0.35;
      gk.vx = 0;
      gk.stunT = 0.9;
    }
    // Un disparo raso que bota antes de la línea también va a puerta.
    const onTarget = yL > GOAL_Y0 && yL < GOAL_Y1 && zL < GOAL_H;
    if (!onTarget) return;
    let pSave = Math.pow(clamp(1 - lateral / reach, 0, 1), 0.25) * (0.8 + (K / 20) * 0.2) * clamp(1.2 - speed / 60, 0.75, 1);
    if (zL > 1.9 && lateral > 1.8) pSave *= 0.7;
    if (this.rng.next() >= pSave) return;
    const catchIt = speed < 20 && lateral < 1.4 && this.rng.next() < 0.6 * (1 - this.phys.gripLoss);
    this.emit('save', { team: def, a: gk.idx, b: f.from, value: catchIt ? 1 : 0 });
    if (catchIt) {
      this.takePossession(gk, 'save');
      return;
    }
    // Despeje: el balón sale rechazado hacia el campo, delante de la portería.
    const out = this.dir(def);
    b.flight = null;
    b.x = lineX + out * 1.2;
    b.vx = out * this.rng.range(2, 6);
    b.vy = this.rng.range(-8, 8);
    b.vz = this.rng.range(1, 3.5);
    b.lastTouch = gk.idx;
    b.lastTeam = def;
  }

  // ───────────────────────── controles e intercepciones ─────────────────────────
  private resolveTouches() {
    const b = this.ball;
    if (b.owner >= 0) return;
    const sp = Math.hypot(b.vx, b.vy);
    const f = b.flight;
    const cands = this.players
      .filter((q) => !q.sentOff && q.stunT <= 0 && q.touchCd <= 0)
      .map((q) => ({ q, d: dist(q.x, q.y, b.x, b.y) }))
      .filter(({ q, d }) => {
        const gk = this.isGK(q) && this.inOwnBox(q.team, b.x, b.y);
        const reach = gk ? 1.4 + (q.profile.attrs.keeping / 20) * 0.6 : 1.0;
        return d < reach && b.z < (gk ? 2.6 : 1.8);
      })
      .sort((a, z) => a.d - z.d);
    for (const { q } of cands) {
      if (f && f.kind === 'shot' && q.team === f.team && f.from === q.idx) continue;
      let p: number;
      const tech = (q.profile.attrs.dribbling - 10) * 0.012;
      if (f && (f.kind === 'pass' || f.kind === 'cross') && q.team !== f.team) {
        p = 0.35 + (q.profile.attrs.positioning / 20) * 0.35 - Math.max(0, sp - 10) * 0.02;
      } else if (f && f.kind === 'shot') {
        p = this.isGK(q) ? 0.75 : 0.3 - Math.max(0, sp - 15) * 0.02;
      } else {
        p = 0.92 - Math.max(0, sp - 8) * 0.03 + tech;
      }
      p -= this.phys.control;
      if (this.rng.next() < clamp(p, 0.05, 0.98)) {
        this.takePossession(q);
        return;
      }
      q.touchCd = 0.4;
      if (f && f.kind === 'shot') {
        // Roce en un disparo: lo desvía hacia fuera, no hacia dentro.
        if (!this.isGK(q) && this.rng.next() < 0.3) {
          b.vx *= -0.3;
          b.vy = this.rng.range(-6, 6);
          b.lastTouch = q.idx;
          b.lastTeam = q.team;
          f.kind = 'clear';
        }
        return;
      }
      if (sp > 6) {
        b.vx = b.vx * this.rng.range(-0.3, 0.4) + this.rng.range(-2, 2);
        b.vy = b.vy * this.rng.range(-0.3, 0.4) + this.rng.range(-2, 2);
        b.lastTouch = q.idx;
        b.lastTeam = q.team;
      }
      return;
    }
  }

  // ───────────────────────── reglas ─────────────────────────
  private resolveBounds() {
    const b = this.ball;
    if (b.x < 0 || b.x > PITCH_L) {
      const defending: TeamSide = b.x < 0 ? 0 : 1;
      const attacking = (1 - defending) as TeamSide;
      if (b.y > GOAL_Y0 && b.y < GOAL_Y1 && b.z < GOAL_H) {
        this.goal(attacking);
        return;
      }
      if (b.flight?.kind === 'shot') this.emit('miss', { team: b.flight.team, a: b.flight.from });
      if (b.lastTeam === defending) {
        this.setRestart('corner', attacking, b.x < 0 ? 0.4 : PITCH_L - 0.4, b.y < PITCH_W / 2 ? 0.4 : PITCH_W - 0.4);
      } else {
        this.setRestart('goalkick', defending, defending === 0 ? 5.5 : PITCH_L - 5.5, PITCH_W / 2 + (b.y < PITCH_W / 2 ? -6 : 6));
      }
      return;
    }
    if (b.y < 0 || b.y > PITCH_W) {
      this.setRestart('throw', (1 - b.lastTeam) as TeamSide, clamp(b.x, 1, PITCH_L - 1), b.y < 0 ? 0.2 : PITCH_W - 0.2);
    }
  }

  private goal(team: TeamSide) {
    const b = this.ball;


    const scorer = b.lastTouch >= 0 ? this.players[b.lastTouch] : this.players.find((p) => p.team === team)!;
    const own = scorer.team !== team;
    const assist = !own && b.prevTouch >= 0 && this.players[b.prevTouch].team === team && b.prevTouch !== scorer.idx ? b.prevTouch : -1;
    this.score[team]++;
    this.lastGoal = { team, scorer: scorer.idx, at: this.t };
    this.emit('goal', { team, a: scorer.idx, b: assist, detail: own ? 'og' : undefined });
    b.flight = null;
    this.phase = 'goal';
    this.phaseT = 0;
    this.restrict = null;
    if (!own) {
      scorer.action = 'celebrate';
      scorer.actionDur = scorer.actionT = 4.5;
    }
  }

  private stepGoal() {
    this.moveAll();
    this.stepBallPhysics();
    if (this.phaseT > 4.6) {
      const conceded = (1 - (this.lastGoal?.team ?? 0)) as TeamSide;
      this.setRestart('kickoff', conceded, PITCH_L / 2, PITCH_W / 2);
    }
  }

  setRestart(kind: RestartKind, team: TeamSide, x: number, y: number) {
    const b = this.ball;
    b.owner = -1;
    b.flight = null;
    b.x = b.px = x;
    b.y = b.py = y;
    b.z = b.pz = 0;
    b.vx = b.vy = b.vz = 0;
    const mates = this.active(team);
    let taker: SimPlayer;
    if (kind === 'goalkick') taker = this.keeper(team);
    else if (kind === 'penalty')
      taker =
        mates.find((p) => p.profile.id === this.teams[team].profile.penaltyTaker) ??
        mates.filter((p) => !this.isGK(p)).sort((a, z) => z.profile.attrs.shooting - a.profile.attrs.shooting)[0];
    else if (kind === 'kickoff') taker = mates.find((p) => p.slot === 9) ?? mates[mates.length - 1];
    else taker = mates.filter((p) => !this.isGK(p)).sort((a, z) => dist(a.x, a.y, x, y) - dist(z.x, z.y, x, y))[0];
    this.restart = { kind, team, x, y, taker: taker.idx };
    this.phase = kind === 'kickoff' ? 'kickoff' : 'restart';
    this.phaseT = 0;
    this.possTeam = team;
    for (const p of this.players) p.run = null;
    if (kind !== 'kickoff') this.emit('restart', { team, a: taker.idx, detail: kind });
  }

  private stepRestart() {
    const r = this.restart!;
    this.moveAll();
    const taker = this.players[r.taker];
    const b = this.ball;
    const wait = r.kind === 'penalty' ? 2.2 : r.kind === 'kickoff' ? 1.8 : 1.3;
    if (this.phaseT > 7) {
      taker.x = b.x - this.dir(r.team) * 0.6;
      taker.y = b.y;
    }
    if (this.phaseT > wait && dist(taker.x, taker.y, b.x, b.y) < 1.1) {
      this.phase = 'play';
      this.phaseT = 0;
      if (r.kind === 'kickoff') this.emit('kickoff', { team: r.team, a: taker.idx });
      this.restrict = r.kind;
      this.restart = null;
      b.owner = taker.idx;
      b.ownedAt = this.t;
      b.lastTouch = taker.idx;
      b.lastTeam = taker.team;
      taker.facing = Math.atan2(PITCH_W / 2 - taker.y, this.attackGoalX(taker.team) - taker.x);
      taker.decideAt = this.t + 0.15;
    }
  }

  // ───────────────────────── ejecución de acciones ─────────────────────────
  executePass(p: SimPlayer, q: SimPlayer, tx: number, ty: number, lofted: boolean) {
    const b = this.ball;
    const A = p.profile.attrs;
    const m = modsOf(p);
    const pressure = Math.exp(-this.nearestOpponentDist(p.team, p.x, p.y) / 1.8);
    const L = dist(p.x, p.y, tx, ty);
    const sigma = (0.015 + (1 - A.passing / 20) * 0.07 + (pressure * 0.05) / m.composure) * (1 + p.fatigue * 0.6) * this.phys.error;
    const a = Math.atan2(ty - p.y, tx - p.x) + this.rng.gauss() * sigma;
    const sErr = 1 + this.rng.gauss() * (0.02 + (1 - A.passing / 20) * 0.06);
    const offside = this.isOffside(q);
    if (!lofted) {
      const v0 = (4 + L * 0.55) * sErr;
      b.vx = Math.cos(a) * v0;
      b.vy = Math.sin(a) * v0;
      b.vz = 0;
      b.z = 0;
    } else {
      const vh = clamp(9 + L * 0.3, 12, 22) * sErr;
      const T = (L * 0.92) / vh;
      b.vx = Math.cos(a) * vh;
      b.vy = Math.sin(a) * vh;
      b.vz = 0.5 * GRAVITY * T;
      b.z = 0.1;
    }
    const kind = lofted && this.toU(p.team, tx) > 0.8 ? 'cross' : 'pass';
    b.owner = -1;
    b.flight = { kind, from: p.idx, to: q.idx, team: p.team, t: this.t, offside, saveTried: false, onTarget: false, tx, ty };
    b.lastTouch = p.idx;
    b.lastTeam = p.team;
    this.stats.passes[p.team]++;
    this.emit('pass', { team: p.team, a: p.idx, b: q.idx, value: L, detail: lofted ? 'air' : 'ground' });
    p.action = 'kick';
    p.actionDur = p.actionT = 0.35;
    p.touchCd = 0.35;
    q.lastPasser = p.idx;
    q.lastPassAt = this.t;
    this.restrict = null;
  }

  isOffside(q: SimPlayer) {
    const u = this.toU(q.team, q.x);
    return u > 0.5 && u > this.toU(q.team, this.ball.x) && u > this.offsideLineU(q.team) + 0.004;
  }

  executeShot(p: SimPlayer) {
    const b = this.ball;
    const A = p.profile.attrs;
    const m = modsOf(p);
    const gx = this.attackGoalX(p.team);
    const gk = this.keeper((1 - p.team) as TeamSide);
    // Apunta al palo más alejado del portero; los buenos tiradores se atreven a acercarse más al poste.
    const margin = 0.6 + this.rng.next() * (2.2 - (A.shooting / 20) * 1.2);
    const aimY = gk.y < PITCH_W / 2 ? GOAL_Y1 - margin : GOAL_Y0 + margin;
    const d = dist(p.x, p.y, gx, aimY);
    const pressure = Math.exp(-this.nearestOpponentDist(p.team, p.x, p.y) / 1.5);
    const sig = (0.35 + d * (0.035 + (1 - A.shooting / 20) * 0.085 + (pressure * 0.06) / m.composure)) * (1 + p.fatigue * 0.5) * this.phys.error;
    const yL = aimY + this.rng.gauss() * sig;
    const zL = this.rng.range(0.3, 1.9) + this.rng.gauss() * sig * 0.55;
    const vh = 19 + (A.shooting / 20) * 9 + this.rng.next() * 2 - (d < 10 ? 3 : 0);
    const T = d / vh;
    const a = Math.atan2(yL - p.y, gx - p.x);
    b.vx = Math.cos(a) * vh;
    b.vy = Math.sin(a) * vh;
    b.vz = (zL + 0.5 * GRAVITY * T * T) / T;
    b.z = 0.15;
    b.owner = -1;
    const onTarget = yL > GOAL_Y0 + 0.1 && yL < GOAL_Y1 - 0.1 && zL < GOAL_H - 0.05;
    // Un defensor en la trayectoria puede tapar el disparo.
    for (const o of this.players) {
      if (o.team === p.team || o.sentOff || this.isGK(o) || o.stunT > 0) continue;
      const seg = segmentDistance(o.x, o.y, p.x, p.y, gx, yL);
      if (seg.s > 0.03 && seg.s < 0.9 && seg.d < 0.8 && this.rng.next() < 0.5 + (o.profile.attrs.positioning / 20) * 0.25) {
        this.stats.shots[p.team]++;
        this.emit('shot', { team: p.team, a: p.idx, value: d, detail: 'blocked' });
        this.emit('block', { team: o.team, a: o.idx, b: p.idx });
        const ba = Math.atan2(p.y - o.y, p.x - o.x) + this.rng.range(-1.2, 1.2);
        const bs = this.rng.range(3, 8);
        b.owner = -1;
        b.flight = null;
        b.x = o.x;
        b.y = o.y;
        b.vx = Math.cos(ba) * bs;
        b.vy = Math.sin(ba) * bs;
        b.vz = this.rng.range(0, 3);
        b.lastTouch = o.idx;
        b.lastTeam = o.team;
        p.action = 'kick';
        p.actionDur = p.actionT = 0.4;
        p.touchCd = 0.5;
        o.touchCd = 0.4;
        this.restrict = null;
        return;
      }
    }
    b.flight = { kind: 'shot', from: p.idx, to: -1, team: p.team, t: this.t, offside: false, saveTried: false, onTarget, tx: gx, ty: yL };
    b.lastTouch = p.idx;
    b.lastTeam = p.team;
    this.stats.shots[p.team]++;
    if (onTarget) this.stats.onTarget[p.team]++;
    this.emit('shot', { team: p.team, a: p.idx, value: d, detail: onTarget ? 'on' : 'off' });
    p.action = 'kick';
    p.actionDur = p.actionT = 0.4;
    p.touchCd = 0.5;
    this.restrict = null;
  }
}

function angleTo(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
