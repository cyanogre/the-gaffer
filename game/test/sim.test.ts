import { describe, expect, it } from 'vitest';
import { buildTeams } from '../src/content/teams';
import { MATCH_SECONDS, CLOCK_FACTOR, DT, MatchSim } from '../src/sim/match';
import type { Command, MatchEvent } from '../src/sim/types';

// margen para que un gol en el último minuto termine su celebración
const FULL_MATCH_STEPS = Math.ceil(MATCH_SECONDS / CLOCK_FACTOR / DT) + 300;

function play(seed: number, commands: { at: number; cmd: Command }[] = [], steps = FULL_MATCH_STEPS) {
  const sim = new MatchSim(seed, buildTeams(seed));
  const events: MatchEvent[] = [];
  let ci = 0;
  for (let i = 0; i < steps; i++) {
    while (ci < commands.length && commands[ci].at === i) sim.command(commands[ci++].cmd);
    sim.step();
    events.push(...sim.drainEvents());
  }
  return { sim, events };
}

describe('motor de partido', () => {
  it('juega 90 minutos sin estados imposibles', () => {
    const { sim, events } = play(1);
    expect(sim.phase).toBe('fulltime');
    for (const p of sim.players) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
    expect(Number.isFinite(sim.ball.x)).toBe(true);
    expect(sim.stats.passes[0] + sim.stats.passes[1]).toBeGreaterThan(80);
    expect(events.some((e) => e.kind === 'shot')).toBe(true);
  });

  it('es determinista: misma semilla y mismas órdenes, mismo partido', () => {
    const cmds = [{ at: 600, cmd: { kind: 'tactics', team: 0, patch: { block: 2 } } as Command }];
    const a = play(7, cmds, 6000);
    const b = play(7, cmds, 6000);
    expect(a.sim.score).toEqual(b.sim.score);
    expect(a.sim.ball.x).toBeCloseTo(b.sim.ball.x, 10);
    expect(a.events.length).toBe(b.events.length);
  });

  it('el bloque alto adelanta de verdad la línea defensiva', () => {
    const avgLine = (block: 0 | 2) => {
      const sim = new MatchSim(3, buildTeams(3));
      sim.command({ kind: 'tactics', team: 0, patch: { block } });
      let sum = 0;
      let n = 0;
      for (let i = 0; i < 6000; i++) {
        sim.step();
        if (sim.phase === 'play' && sim.possTeam === 1) {
          const defs = sim.players.filter((p) => p.team === 0 && sim.slotOf(p).role === 'DEF' && !p.sentOff);
          sum += defs.reduce((s, p) => s + sim.toU(0, p.x), 0) / defs.length;
          n++;
        }
      }
      return sum / n;
    };
    expect(avgLine(2)).toBeGreaterThan(avgLine(0) + 0.05);
  });

  it('la presión total cansa más por segundo defendiendo (media de varios partidos)', () => {
    // Se mide el desgaste mientras el rival tiene el balón: es cuando la presión cambia lo que hacen.
    const rate = (press: boolean) => {
      let gain = 0;
      let steps = 0;
      for (const seed of [5, 11, 17, 23]) {
        const sim = new MatchSim(seed, buildTeams(seed));
        const team = sim.players.filter((p) => p.team === 0 && p.slot !== 0);
        for (let i = 0; i < 6000; i++) {
          if (press && i % 300 === 0) sim.command({ kind: 'signal', team: 0, signal: 'press' });
          const before = team.reduce((s, p) => s + p.fatigue, 0);
          sim.step();
          if (sim.phase === 'play' && sim.possTeam === 1 && (!press || sim.signalActive(0, 'press'))) {
            gain += team.reduce((s, p) => s + p.fatigue, 0) - before;
            steps++;
          }
        }
      }
      return gain / steps;
    };
    expect(rate(true)).toBeGreaterThan(rate(false) * 1.05);
  });
});

describe('duelos', () => {
  it('hay cabezazos y choques de hombros, y en el aire ganan más los altos', () => {
    let headers = 0;
    let pushes = 0;
    for (const seed of [1, 2, 3]) {
      const { events } = play(seed);
      headers += events.filter((e) => e.kind === 'header' || (e.kind === 'shot' && e.detail?.startsWith('header'))).length;
      pushes += events.filter((e) => e.kind === 'push').length;
    }
    expect(headers).toBeGreaterThan(10);
    expect(pushes).toBeGreaterThan(0);
  });
});

describe('condiciones del partido', () => {
  it('la lluvia en un campo de tierra provoca más resbalones y botes raros que un césped seco', async () => {
    const { conditionsFor } = await import('../src/sim/conditions');
    const count = (cond: ReturnType<typeof conditionsFor>) => {
      let n = 0;
      for (const seed of [2, 4, 6]) {
        const sim = new MatchSim(seed, buildTeams(seed), cond);
        for (let i = 0; i < 5000; i++) {
          sim.step();
          for (const e of sim.drainEvents()) if (e.kind === 'slip' || e.kind === 'bobble') n++;
        }
      }
      return n;
    };
    expect(count(conditionsFor('rain', 'night', 0.15, 1))).toBeGreaterThan(count(conditionsFor('clear', 'day', 0.95, 1)) + 5);
  });
});
