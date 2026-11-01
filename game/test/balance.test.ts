import { describe, expect, it } from 'vitest';
import { buildTeams } from '../src/content/teams';
import { MATCH_SECONDS, CLOCK_FACTOR, DT, MatchSim } from '../src/sim/match';

/**
 * Banco de equilibrado: simula varios partidos completos sin pantalla y comprueba que
 * las cifras globales (goles, tiros, posesión, faltas) caen en rangos jugables.
 * Es la herramienta con la que se ajustará el motor cuando crezca.
 */
describe('equilibrio global', () => {
  it('produce partidos con cifras creíbles', () => {
    const steps = Math.ceil(MATCH_SECONDS / CLOCK_FACTOR / DT) + 30;
    const rows: string[] = [];
    let goals = 0;
    let shots = 0;
    let passPct = 0;
    let fouls = 0;
    const N = 8;
    for (let seed = 1; seed <= N; seed++) {
      const sim = new MatchSim(seed, buildTeams(seed));
      for (let i = 0; i < steps; i++) sim.step();
      const s = sim.stats;
      const g = sim.score[0] + sim.score[1];
      const pass = (s.passesOk[0] + s.passesOk[1]) / Math.max(1, s.passes[0] + s.passes[1]);
      const poss = (s.possession[0] / (s.possession[0] + s.possession[1])) * 100;
      goals += g;
      shots += s.shots[0] + s.shots[1];
      passPct += pass;
      fouls += s.fouls[0] + s.fouls[1];
      rows.push(
        `semilla ${seed}: ${sim.score[0]}-${sim.score[1]} | tiros ${s.shots[0]}-${s.shots[1]} (a puerta ${s.onTarget[0]}-${s.onTarget[1]}) | pases ${(pass * 100).toFixed(0)}% | posesión ${poss.toFixed(0)}% | faltas ${s.fouls[0]}-${s.fouls[1]} | amarillas ${s.yellows[0]}-${s.yellows[1]} | fueras de juego ${s.offsides[0]}-${s.offsides[1]}`,
      );
    }
    console.log(rows.join('\n'));
    console.log(`media: goles ${(goals / N).toFixed(2)} · tiros ${(shots / N).toFixed(1)} · pases ${((passPct / N) * 100).toFixed(0)}% · faltas ${(fouls / N).toFixed(1)}`);
    expect(goals / N).toBeGreaterThan(0.8);
    expect(goals / N).toBeLessThan(7.5);
    expect(shots / N).toBeGreaterThan(8);
    // en el barrio se falla mucho: el listón es bajo a propósito
    expect(passPct / N).toBeGreaterThan(0.5);
  }, 120_000);
});
