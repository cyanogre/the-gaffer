import { describe, expect, it } from 'vitest';
import { ACTIONS, blocked, perform } from '../src/game/actions';
import { maxEnergy, newCareer, rivalOf, setLeagueGender, type Career } from '../src/game/career';
import { roundRobin, standings } from '../src/game/league';
import { matchSetup } from '../src/game/squad';
import { closeWeek, nextSeason, seasonEnd, teamTalk, type MatchOutcome } from '../src/game/week';
import { MatchSim } from '../src/sim/match';
import { pendingScenes, SCENES } from '../src/story/scenes';

const act = (id: string) => ACTIONS.find((a) => a.id === id)!;
const outcome = (g: number, a: number, c: Career): MatchOutcome => ({
  score: [g, a],
  scorers: new Array(g).fill(c.squad[9].id),
  played: c.lineup,
  counts: [{}, {}],
  ownGoals: [0, 0],
});
/** Gasta el resto de la semana durmiendo hasta el domingo. */
function sleepToSunday(c: Career) {
  while (c.day < 6) perform(c, act('dormir'));
}

describe('liga', () => {
  it('doble vuelta: cada equipo juega una vez por jornada y contra cada rival dos veces', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const rounds = roundRobin(ids, 3);
    expect(rounds.length).toBe(10);
    for (const r of rounds) expect(new Set(r.flat()).size).toBe(6);
    const pairs = new Map<string, number>();
    for (const r of rounds) for (const [x, y] of r) pairs.set([x, y].sort().join('-'), (pairs.get([x, y].sort().join('-')) ?? 0) + 1);
    expect([...pairs.values()].every((n) => n === 2)).toBe(true);
    expect(pairs.size).toBe(15);
  });
});

describe('semana del míster', () => {
  it('empieza con plantilla de 15, once válido y energía llena', () => {
    const c = newCareer('f', 'f', 'Loli', 42);
    expect(c.squad.length).toBe(15);
    expect(new Set(c.lineup).size).toBe(11);
    expect(c.coach.energy).toBe(maxEnergy(c));
  });

  it('cada acción gasta franja y energía; el entreno solo martes y jueves por la tarde', () => {
    const c = newCareer('m', 'm', '', 7);
    const e0 = c.coach.energy;
    perform(c, act('estudiar'));
    expect(c.slot).toBe(1);
    expect(c.coach.energy).toBe(e0 - 15);
    expect(blocked(c, act('entrenar'))).not.toBeNull(); // lunes
    perform(c, act('dormir'));
    expect(c.day).toBe(1);
    perform(c, act('estudiar'));
    expect(c.slot).toBe(1);
    expect(blocked(c, act('entrenar'))).toBeNull(); // martes tarde
    const before = c.squad.reduce((s, p) => s + p.attrs.stamina, 0);
    perform(c, act('entrenar'), 'fisico');
    const after = c.squad.reduce((s, p) => s + p.attrs.stamina, 0);
    expect(after).toBeGreaterThan(before);
    expect(c.squad[1].load).toBeGreaterThan(0);
  });

  it('la carga de los entrenos llega al partido como cansancio inicial', () => {
    const c = newCareer('m', 'm', '', 9);
    c.day = 5;
    c.squad.forEach((p) => (p.load = 0.3));
    const setup = matchSetup(c);
    const sim = new MatchSim(setup.seed, setup.teams, setup.conditions);
    expect(sim.players.filter((p) => p.team === 0).every((p) => p.fatigue > 0.2)).toBe(true);
  });

  it('las escenas aparecen en su día y no se repiten', () => {
    const c = newCareer('m', 'm', '', 11);
    expect(pendingScenes(c, 'casa').map((s) => s.id)).toEqual(['prologo']);
    setLeagueGender(c, 'f');
    expect(c.squad[0].look.gender).toBe('f');
    // el estreno es el domingo de la jornada 1, en el campo: Ramón y la presentación de la plantilla
    expect(c.day).toBe(6);
    expect(c.location).toBe('campo');
    expect(pendingScenes(c, 'campo').map((s) => s.id)).toEqual(['intro', 'presentacion']);
    // el once que dejó el míster anterior tiene a un delantero de defensa (lo arregla la guía)
    expect(c.lineup.map((id) => c.squad.find((p) => p.id === id)!.role)).toContain('DEL');
    expect(c.squad.find((p) => p.id === c.lineup[1])!.role).toBe('DEL');
    // la primera semana entera es la de la jornada 2
    c.week = 2;
    c.day = 0;
    expect(pendingScenes(c, 'casa').map((s) => s.id)).not.toContain('visita-padel');
    c.day = 2;
    expect(pendingScenes(c, 'casa').map((s) => s.id)).toContain('visita-padel');
    c.seen.push('visita-padel');
    expect(pendingScenes(c, 'casa').map((s) => s.id)).not.toContain('visita-padel');
    // todas las escenas tienen al menos una opción sin requisitos
    for (const s of SCENES) expect(s.choices.some((ch) => !ch.req)).toBe(true);
  });

  it('la arenga cambia la moral del once según el carácter, y la moral cambia cómo juegan', () => {
    const c = newCareer('m', 'm', '', 12);
    setLeagueGender(c, 'm');
    const nervioso = c.squad.find((p) => p.traits.includes('nervioso'))!;
    const neutral = c.squad.find((p) => c.lineup.includes(p.id) && !p.traits.length && p.role !== 'POR')!;
    const before = [nervioso.morale, neutral.morale];
    teamTalk(c, 'calma');
    expect(nervioso.morale - before[0]).toBeGreaterThan(neutral.morale - before[1]);
    expect(nervioso.moraleLog[0].reason).toContain('Arenga');
    nervioso.morale = 90;
    const setup = matchSetup(c);
    const inMatch = setup.teams[0].players.find((p) => p.id === nervioso.id)!;
    expect(inMatch.attrs.composure).toBeGreaterThan(nervioso.attrs.composure);
  });

  it('no jugar baja la moral a los que esperan jugar; las promesas incumplidas, más', () => {
    const c = newCareer('m', 'm', '', 21);
    setLeagueGender(c, 'm');
    const sub = c.squad.find((p) => !c.lineup.includes(p.id))!;
    c.promises.push({ id: sub.id, kind: 'minutes', week: 1 });
    const m0 = sub.morale;
    c.day = 6;
    closeWeek(c, outcome(1, 0, c));
    expect(sub.morale).toBeLessThan(m0);
    expect(sub.moraleLog.some((e) => e.reason.includes('prometiste'))).toBe(true);
  });
});

describe('estadísticas del míster (tipo Punch Club)', () => {
  it('lo que no se trabaja baja cada día; lo que se trabaja, sube (cada vez menos)', () => {
    const c = newCareer('m', 'm', '', 31);
    setLeagueGender(c, 'm');
    c.day = 0; // lunes (el estreno es en domingo)
    c.coach.stats.ojo.value = 31; // nivel 4 (30–39)
    c.coach.stats.forma.value = 35;
    for (let d = 0; d < 5; d++) {
      perform(c, act('correr')); // forma, por la mañana
      perform(c, act('dormir'));
    }
    expect(c.coach.stats.ojo.value).toBeLessThan(28);
    expect(c.coach.stats.ojo.lv).toBe(3); // ha perdido un nivel por no trabajarla
    expect(c.coach.stats.forma.value).toBeGreaterThan(40);
    // cuanto más alta, menos rinde cada sesión
    const low = newCareer('m', 'm', '', 32);
    const high = newCareer('m', 'm', '', 33);
    high.coach.stats.tactica.value = 80;
    perform(low, act('estudiar'));
    perform(high, act('estudiar'));
    expect(low.coach.stats.tactica.value - 4).toBeGreaterThan(high.coach.stats.tactica.value - 80);
  });
});

describe('temporada completa', () => {
  it('diez jornadas, tabla coherente, alquiler y fin de temporada (reproducible)', () => {
    const run = () => {
      const c = newCareer('m', 'm', '', 99);
      setLeagueGender(c, 'm');
      const rivals: string[] = [];
      for (let w = 0; w < 10; w++) {
        sleepToSunday(c);
        rivals.push(rivalOf(c).id);
        closeWeek(c, outcome(2, 1, c));
      }
      return { c, rivals };
    };
    const { c, rivals } = run();
    expect(c.status).toBe('seasonEnd');
    expect(new Set(rivals).size).toBe(5);
    const table = standings(c.league);
    expect(table.every((r) => r.p === 10)).toBe(true);
    expect(table[0].id).toBe('barrio');
    expect(table.reduce((s, r) => s + r.gf, 0)).toBe(table.reduce((s, r) => s + r.ga, 0));
    expect(c.squad[9].goals).toBe(20);
    expect(c.history.length).toBe(10);
    // misma semilla, misma liga
    expect(standings(run().c.league).map((r) => r.pts)).toEqual(table.map((r) => r.pts));
    // campeón del tutorial: oferta de Segunda Federación
    const se = seasonEnd(c);
    expect(se.champion).toBe(true);
    expect(se.offer).not.toBeNull();
    const stay = structuredClone(c);
    nextSeason(stay, se, false);
    expect(stay.division).toBe(1);
    expect(stay.league.teams.length).toBe(8);
    expect(stay.club.id).toBe('barrio');
    nextSeason(c, se, true);
    expect(c.club.id).toBe(se.offer!.id);
    expect(c.league.teams.length).toBe(18);
    expect(c.league.rounds.length).toBe(34);
    expect(c.coach.salary).toBe(250);
    expect(c.squad.length).toBe(20);
    expect(new Set(c.lineup).size).toBe(11);
    expect(c.status).toBe('playing');
  });

  it('perder mucho con promesas incumplidas acaba en despido', () => {
    const c = newCareer('m', 'm', '', 5);
    setLeagueGender(c, 'm');
    for (let w = 0; w < 6 && c.status === 'playing'; w++) {
      sleepToSunday(c);
      c.promise = 'win';
      closeWeek(c, outcome(0, 4, c));
    }
    expect(c.status).toBe('fired');
  });
});

describe('motor: cambios y familiaridad', () => {
  it('un cambio sustituye al jugador y entra con su cansancio', () => {
    const c = newCareer('m', 'm', '', 3);
    const setup = matchSetup(c);
    const sim = new MatchSim(setup.seed, setup.teams, setup.conditions);
    for (let i = 0; i < 300; i++) sim.step();
    const out = sim.players[5];
    const sub = { ...c.squad[13], startFatigue: 0.1 };
    sim.command({ kind: 'sub', player: 5, profile: sub });
    sim.step();
    expect(sim.players[5].profile.id).toBe(sub.id);
    expect(sim.players[5].fatigue).toBeCloseTo(0.1, 2);
    expect(sim.drainEvents().some((e) => e.kind === 'sub' && e.a === out.idx)).toBe(true);
  });

  it('con poca familiaridad los jugadores se desordenan más', () => {
    const c = newCareer('m', 'm', '', 4);
    const spread = (fam: number) => {
      const setup = matchSetup(c);
      setup.teams[0].familiarity = fam;
      const sim = new MatchSim(setup.seed, setup.teams, setup.conditions);
      return sim.players.filter((p) => p.team === 0).reduce((s, p) => s + Math.abs(p.jx) + Math.abs(p.jy), 0);
    };
    expect(spread(0.1)).toBeGreaterThan(spread(0.95) * 2);
  });
});
