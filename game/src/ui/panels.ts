import { DIVISIONS } from '../content/divisions';
import { traitLabel, TRAITS } from '../sim/traits';
import { FORMATIONS, FORMATION_NAMES } from '../sim/formations';
import type { Attributes, Block, Formation, PassStyle, Role } from '../sim/types';
import {
  MATERIAL_LEVELS,
  STADIUM_LEVELS,
  STATS,
  attendance,
  buyMaterial,
  division,
  leagueName,
  maxEnergy,
  rivalOf,
  upgradeStadium,
  dailyDecay,
  type Career,
  type SquadPlayer,
  type StatId,
} from '../game/career';
import { standings, teamOf } from '../game/league';
import { attrLabel, bestEleven, fitFor, swapLineup } from '../game/squad';
import { scoutReport } from '../game/actions';
import { moraleLabel, moraleMods } from '../game/morale';
import { coachCharacter } from '../story/scenes';
import type { GuideEvent } from './guide';
import { drawCrest } from './pixelart';
import { h, portrait, tier, type Tab } from './dom';

/**
 * Contenido de las hojas: Club (plantilla, pizarra, liga, caja) y Míster (estadísticas).
 * Gestionar no gasta franjas: es papeleo que se hace en cualquier momento.
 */
export interface PanelCtx {
  career: () => Career;
  changed: () => void;
  /** Hablar con un jugador desde su ficha (una vez por semana). */
  talk?: (p: SquadPlayer) => void;
  /** Avisa a la guía (ha tocado un puesto, ha cambiado el once...). */
  notify?: (e: GuideEvent) => void;
}

const ROLE_ES: Record<string, string> = { POR: 'POR', DEF: 'DEF', MED: 'MED', DEL: 'DEL' };
const nameOf = (p: SquadPlayer) => (p.nick ? `${p.name.split(' ')[0]} «${p.nick}»` : p.name);
const ROLE_DIV: Record<Role, number> = { POR: 2.8, DEF: 2.8, MED: 3.1, DEL: 3.7 };
/** Lo bien que haría un puesto (misma escala para todos: sale de los atributos que cuentan ahí). */
export const roleScore = (p: SquadPlayer, role: Role) => Math.round(fitFor(p, role) / ROLE_DIV[role]);
export const ovr = (p: SquadPlayer) => roleScore(p, p.role);
/** Lo que cuenta en cada puesto (lo mismo que usa `fitFor`). */
export const KEY_ATTRS: Record<Role, (keyof Attributes)[]> = {
  POR: ['keeping', 'positioning', 'composure'],
  DEF: ['tackling', 'positioning', 'pace', 'aggression'],
  MED: ['passing', 'vision', 'stamina', 'dribbling', 'workRate'],
  DEL: ['shooting', 'dribbling', 'pace', 'composure'],
};
const ROLE_LONG: Record<Role, string> = { POR: 'portería', DEF: 'defensa', MED: 'medio', DEL: 'delantera' };

function crest(kit: Parameters<typeof drawCrest>[1], letter: string) {
  const c = h('canvas', { width: 24, height: 28, class: 'crest' });
  drawCrest(c, kit, letter);
  return c;
}

/** Las manías de cada uno se conocen al presentarte a la plantilla (en el Barriobajo). */
const known = (c: Career) => c.club.id !== 'barrio' || !!c.flags.metSquad;

export function playerCard(c: Career, p: SquadPlayer, onTalk?: () => void, forRole: Role = p.role) {
  const A = p.attrs;
  const key = KEY_ATTRS[forRole];
  const m = moraleMods(p.morale);
  const keys: (keyof Attributes)[] = p.role === 'POR' ? ['keeping', 'positioning', 'passing', 'pace', 'composure', 'stamina'] : ['pace', 'stamina', 'passing', 'shooting', 'dribbling', 'tackling', 'vision', 'positioning', 'composure', 'workRate', 'aggression'];
  const short: Partial<Record<keyof Attributes, string>> = { workRate: 'trabajo', aggression: 'agresiv.', positioning: 'colocac.', composure: 'sangre fría' };
  return h(
    'div',
    { class: 'box' },
    h(
      'div',
      { class: 'pcard' },
      portrait(p.look, p.role === 'POR' ? c.club.gkKit : c.club.kit, p.traits, p.num, 96),
      h(
        'div',
        {},
        h('b', { text: `#${p.num} ${nameOf(p)}` }),
        h('p', { class: 'note', text: `${ROLE_ES[p.role]} · ${p.age ?? '?'} años · ${p.goals} goles en ${p.apps} partidos` }),
        h(
          'div',
          { class: 'row', style: 'flex-wrap:wrap;gap:4px;margin-top:4px' },
          ...(known(c) ? p.traits.map((t) => h('span', { class: 'pill', title: TRAITS[t].desc, text: traitLabel(t, p.look.gender) })) : [h('span', { class: 'pill', text: 'Aún no lo conoces' })]),
        ),
        h('div', { class: 'row', style: 'margin-top:6px' }, h('small', { class: 'note', text: 'Carga' }), h('i', { class: 'bar load' }, h('i', { style: `width:${Math.round(p.load * 100)}%`, 'data-tier': p.load > 0.35 ? 'lo' : p.load > 0.15 ? 'mid' : 'hi' }))),
      ),
    ),
    h(
      'dl',
      { class: 'attrs' },
      ...keys.map((k) => {
        const v = Math.floor(A[k]);
        const mod = m[k];
        return h('div', { 'data-key': String(key.includes(k)) }, h('dt', { text: short[k] ?? attrLabel(k) }), h('dd', { 'data-tier': tier(v), 'data-mod': mod ? `${mod > 0 ? '+' : ''}${mod}` : undefined, text: String(v) }));
      }),
    ),
    h('p', { class: 'note', text: `Resaltado, lo que cuenta en ${ROLE_LONG[forRole]}: ${roleScore(p, forRole)} en ese puesto.` }),
    h('p', { class: 'quirk', text: known(c) ? p.quirk : 'Pasa por El Barrizal a conocer a la plantilla.' }),
    moraleBox(c, p, onTalk),
  );
}

/** Moral: nivel, por qué, cómo le afecta en el campo y las charlas (una por semana). */
function moraleBox(c: Career, p: SquadPlayer, onTalk?: () => void) {
  const m = moraleMods(p.morale);
  const eff = Object.entries(m)
    .filter(([, v]) => v)
    .map(([k, v]) => `${attrLabel(k as keyof Attributes)} ${v! > 0 ? '+' : ''}${v}`)
    .join(', ');
  const talked = !!c.weekDone[`charla:${p.id}`];
  const promised = c.promises.some((x) => x.id === p.id);
  return h(
    'div',
    { class: 'morale' },
    h(
      'div',
      { class: 'row' },
      h('b', { class: 'grow', text: `Moral: ${moraleLabel(p.morale)}` }),
      h('i', { class: 'bar load', style: 'width:90px;flex:none' }, h('i', { style: `width:${p.morale}%`, 'data-tier': p.morale >= 60 ? 'hi' : p.morale >= 40 ? 'mid' : 'lo' })),
    ),
    h('p', { class: 'note', text: eff ? `En el campo: ${eff}.` : 'En el campo: ni le sube ni le baja.' }),
    p.form.length ? h('p', { class: 'note', text: `Últimas notas: ${p.form.map((r) => r.toFixed(1)).join(' · ')}` }) : null,
    ...p.moraleLog.slice(0, 3).map((e) => h('p', { class: 'note', text: `${e.delta > 0 ? '▲' : '▼'} ${e.reason} (J${e.week})` })),
    promised ? h('p', { class: 'note', text: 'Le has prometido minutos para el domingo.' }) : null,
    onTalk
      ? talked
        ? h('p', { class: 'note', text: 'Ya habéis hablado esta semana.' })
        : h('button', { type: 'button', class: 'btn', onclick: () => onTalk() }, `Hablar con ${p.nick ?? p.name.split(' ')[0]}`)
      : null,
  );
}

// ───────────────────────── club ─────────────────────────
export function clubTabs(ctx: PanelCtx, state: { slot: number; focus: string | null }): Tab[] {
  const C = ctx.career;
  return [
    {
      id: 'plantilla',
      label: 'Plantilla',
      render: () => {
        const c = C();
        const slots = FORMATIONS[c.planned.formation];
        const map = h('div', { class: 'pitchmap', 'data-dirt': String(c.stadiumLevel === 0) });
        slots.forEach((s, i) => {
          const p = c.squad.find((x) => x.id === c.lineup[i])!;
          const b = h(
            'button',
            {
              type: 'button',
              'aria-pressed': String(state.slot === i),
              // fuera de su puesto: en amarillo
              'data-weak': String(p.role !== s.role),
              style: `left:${8 + s.v * 84}%;top:${92 - s.u * 100}%`,
              title: `${s.label}: ${p.name}`,
              onclick: () => {
                state.slot = state.slot === i ? -1 : i;
                state.focus = p.id;
                ctx.changed();
                ctx.notify?.({ kind: 'slot' });
              },
            },
            portrait(p.look, p.role === 'POR' ? c.club.gkKit : c.club.kit, p.traits, p.num, 34),
            h('span', { text: `${s.label} ${p.nick ?? p.name.split(' ').slice(-1)[0]}` }),
          );
          map.append(b);
        });
        const pick = state.slot >= 0 ? slots[state.slot].role : null;
        const order = pick ? [...c.squad].sort((a, b) => roleScore(b, pick) - roleScore(a, pick)) : c.squad;
        const row = (p: SquadPlayer) => {
          const at = c.lineup.indexOf(p.id);
          const role = at >= 0 ? slots[at].role : null;
          const bad = role && role !== p.role && (role === 'POR' || p.role === 'POR');
          return h(
            'li',
            {},
            h(
              'button',
              {
                type: 'button',
                class: 'prow',
                'aria-pressed': String(state.focus === p.id),
                onclick: () => {
                  let swapped = false;
                  if (state.slot >= 0 && c.lineup[state.slot] !== p.id) {
                    swapLineup(c, state.slot, p.id);
                    state.slot = -1;
                    swapped = true;
                  }
                  state.focus = p.id;
                  ctx.changed();
                  if (swapped) ctx.notify?.({ kind: 'lineup' });
                },
              },
              h('span', { class: 'slot', 'data-bad': String(!!bad), text: at >= 0 ? slots[at].label : '—' }),
              portrait(p.look, p.role === 'POR' ? c.club.gkKit : c.club.kit, p.traits, p.num, 40),
              h('span', {}, h('b', { text: `#${p.num} ${p.nick ?? p.name}` }), h('small', { text: `${ROLE_ES[p.role]} · ${p.age ?? ''} años${c.absent[p.id] ? ' · falta al entreno' : ''} · moral ${moraleLabel(p.morale).toLowerCase()}` })),
              h('span', { class: 'tags' }, p.load > 0.2 ? h('span', { class: 'pill warn', text: 'cargado' }) : null, h('span', { class: 'ovr', title: pick ? `En ${ROLE_LONG[pick]}` : 'En su puesto', text: String(pick ? roleScore(p, pick) : ovr(p)) })),
            ),
          );
        };
        const rows = pick ? [] : order.map(row);
        // eligiendo un puesto: primero el banquillo (lo normal es meter a alguien), luego los que ya juegan (se intercambian)
        const benchRows = pick ? order.filter((p) => !c.lineup.includes(p.id)).map(row) : [];
        const onRows = pick ? order.filter((p) => c.lineup.includes(p.id) && p.id !== c.lineup[state.slot]).map(row) : [];
        const focus = c.squad.find((p) => p.id === state.focus);
        return [
          h('p', { class: 'note', text: pick ? `Elige quién juega de ${slots[state.slot].label}: cada lista va de mejor a peor en ${ROLE_LONG[pick]} (el número de la derecha).` : 'Toca un puesto del campo y luego a quien quieras poner. En amarillo, alguien fuera de su puesto.' }),
          map,
          h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', id: 'btnGala', text: 'Once de gala', onclick: () => ((c.lineup = bestEleven(c)), ctx.changed(), ctx.notify?.({ kind: 'lineup' })) }), h('span', { class: 'note grow', text: 'Pone a los mejores en cada puesto (y deja descansar a los cargados).' })),
          // con un puesto elegido, la lista (ordenada para ese puesto) va justo debajo del campo
          ...(pick
            ? [
                h('h3', { text: `Banquillo · para ${slots[state.slot].label}` }),
                h('ul', { class: 'plist' }, ...benchRows),
                h('h3', { text: 'En el once (os cambiáis el puesto)' }),
                h('ul', { class: 'plist' }, ...onRows),
                focus ? playerCard(c, focus, ctx.talk ? () => ctx.talk!(focus) : undefined, pick) : null,
              ]
            : [focus ? playerCard(c, focus, ctx.talk ? () => ctx.talk!(focus) : undefined, focus.role) : null, h('h3', { text: `Plantilla · ${c.squad.length}` }), h('ul', { class: 'plist' }, ...rows)]),
        ];
      },
    },
    {
      id: 'pizarra',
      label: 'Pizarra',
      render: () => {
        const c = C();
        const seg = <T extends string | number>(opts: { v: T; label: string; small?: string }[], cur: T, set: (v: T) => void) =>
          h('div', { class: 'seg' }, ...opts.map((o) => h('button', { type: 'button', 'aria-pressed': String(o.v === cur), onclick: () => (set(o.v), ctx.changed()) }, o.label, o.small ? h('small', { text: o.small }) : null)));
        const lineupPlayers = c.lineup.map((id) => c.squad.find((p) => p.id === id)!).filter((p) => p.role !== 'POR');
        return [
          h('h3', { text: 'Formación' }),
          seg(
            FORMATION_NAMES.map((f) => ({ v: f as Formation, label: f, small: `la conocen ${Math.round(c.familiarity[f as Formation] * 100)} %` })),
            c.planned.formation,
            (v) => (c.planned.formation = v),
          ),
          h('p', { class: 'note', text: 'Una formación poco trabajada se desordena en el campo. Se aprende entrenando táctica o estudiando en la pizarra de casa.' }),
          h('h3', { text: 'Altura del bloque' }),
          seg<Block>(
            [
              { v: 0, label: 'Bajo', small: 'esperar atrás' },
              { v: 1, label: 'Medio', small: 'equilibrio' },
              { v: 2, label: 'Alto', small: 'presionar arriba' },
            ],
            c.planned.block,
            (v) => (c.planned.block = v),
          ),
          h('h3', { text: 'Estilo de pase' }),
          seg<PassStyle>(
            [
              { v: 'short', label: 'Corto', small: 'posesión' },
              { v: 'mixed', label: 'Mixto', small: 'según la jugada' },
              { v: 'long', label: 'Largo', small: 'a la espalda' },
            ],
            c.planned.style,
            (v) => (c.planned.style = v),
          ),
          h('h3', { text: 'Penaltis' }),
          seg(
            [{ v: '', label: 'Que decidan' }, ...lineupPlayers.slice(-6).map((p) => ({ v: p.id, label: `#${p.num}`, small: p.nick ?? p.name.split(' ')[0] }))],
            c.penaltyTaker ?? '',
            (v) => (c.penaltyTaker = v || null),
          ),
          h('p', { class: 'note', text: 'Todo esto se puede cambiar durante el partido desde «Órdenes».' }),
        ];
      },
    },
    {
      id: 'liga',
      label: 'Liga',
      render: () => {
        const c = C();
        const d = division(c);
        const n = c.league.teams.length;
        const rows = standings(c.league).map((r, i) => {
          const t = teamOf(c.league, r.id);
          const zone = i < d.promote ? 'up' : d.relegate && i >= n - d.relegate ? 'down' : '';
          return h(
            'tr',
            { 'data-me': String(r.id === c.club.id), 'data-zone': zone },
            h('td', { text: String(i + 1) }),
            h('td', {}, crest(t.kit, t.letter), ' ', t.name),
            h('td', { text: String(r.p) }),
            h('td', { text: `${r.gf}:${r.ga}` }),
            h('td', {}, h('b', { text: String(r.pts) })),
          );
        });
        const round = c.league.rounds[Math.min(c.week, c.league.rounds.length) - 1] ?? [];
        const last = c.league.results[c.week - 2] ?? [];
        return [
          h('p', { class: 'note', text: `${leagueName(c)} · ${d.real}. Suben ${d.promote}${d.relegate ? `, bajan ${d.relegate}` : ''}. Jornada ${Math.min(c.week, c.league.rounds.length)} de ${c.league.rounds.length}.` }),
          h('table', { class: 'table' }, h('thead', {}, h('tr', {}, h('th', { text: '#' }), h('th', { text: 'Equipo' }), h('th', { text: 'PJ' }), h('th', { text: 'Goles' }), h('th', { text: 'Pts' }))), h('tbody', {}, ...rows)),
          h('h3', { text: 'Esta jornada' }),
          ...round.map(([a, b]) => h('p', { class: 'note', text: `${teamOf(c.league, a).name} – ${teamOf(c.league, b).name}` })),
          last.length ? h('h3', { text: 'Jornada anterior' }) : null,
          ...last.map((r) => h('p', { class: 'note', text: `${teamOf(c.league, r.home).short} ${r.score[0]}–${r.score[1]} ${teamOf(c.league, r.away).short}` })),
          h('h3', { text: `Próximo rival: ${rivalOf(c).name}` }),
          ...scoutReport(c).map((l) => h('p', { class: 'note', text: l })),
          h('h3', { text: 'El camino' }),
          h('p', { class: 'note', text: DIVISIONS.map((x, i) => (i === c.division ? `▶ ${x.name}` : x.name)).join(' · ') }),
        ];
      },
    },
    {
      id: 'caja',
      label: 'Caja',
      render: () => {
        const c = C();
        const st = STADIUM_LEVELS[c.stadiumLevel];
        const next = STADIUM_LEVELS[c.stadiumLevel + 1];
        const mat = MATERIAL_LEVELS[c.material];
        const nextMat = MATERIAL_LEVELS[c.material + 1];
        return [
          h('div', { class: 'box' }, h('div', { class: 'row' }, h('b', { class: 'grow', text: 'Caja del club' }), h('b', { text: `${c.money} €` })), h('p', { class: 'note', text: `Aficionados: ${c.fans}. El domingo se esperan ${attendance(c)} (entrada a 3 €). Árbitro y material: 45 € por partido.${c.sponsor ? ' Patrocinio de Bar Manolo: +25 € por semana.' : ''}` })),
          h('h3', { text: 'Estadio' }),
          h('div', { class: 'box' }, h('b', { text: st.name }), h('p', { class: 'note', text: `${st.desc} Aforo: ${st.capacity}.` })),
          next
            ? h(
                'div',
                { class: 'box' },
                h('b', { text: `Obras: ${next.name}` }),
                h('p', { class: 'note', text: `${next.desc} Aforo ${next.capacity}. El balón rueda mejor y se resbala menos.` }),
                h('button', { type: 'button', class: 'btn gold', disabled: c.money < next.cost, text: `Hacer obras · ${next.cost} €`, onclick: () => upgradeStadium(c) && ctx.changed() }),
              )
            : null,
          h('h3', { text: 'Material de entrenamiento' }),
          h('div', { class: 'box' }, h('b', { text: mat.name }), h('p', { class: 'note', text: `Aprenden un ${Math.round((mat.mult - 1) * 100)} % más en cada entrenamiento.` })),
          nextMat ? h('div', { class: 'box' }, h('b', { text: nextMat.name }), h('p', { class: 'note', text: `Aprenderán un ${Math.round((nextMat.mult - 1) * 100)} % más.` }), h('button', { type: 'button', class: 'btn gold', disabled: c.money < nextMat.cost, text: `Comprar · ${nextMat.cost} €`, onclick: () => buyMaterial(c) && ctx.changed() })) : null,
          c.history.length ? h('h3', { text: 'Resultados' }) : null,
          ...[...c.history].reverse().map((r) => h('p', { class: 'note', text: `J${r.week} vs ${r.rival}: ${r.score[0]}–${r.score[1]} · caja ${r.moneyDelta >= 0 ? '+' : ''}${r.moneyDelta} € · afición ${r.fansDelta >= 0 ? '+' : ''}${r.fansDelta}` })),
        ];
      },
    },
  ];
}

// ───────────────────────── míster ─────────────────────────
export function coachPanel(c: Career) {
  const me = coachCharacter(c.coach.gender, c.coach.name);
  const stat = (id: StatId) => {
    const s = c.coach.stats[id];
    const S = STATS[id];
    const inLevel = s.value - (s.lv - 1) * 10;
    const trained = !!c.dayDone[`trained:${id}`];
    const risk = !trained && s.lv > 1 && inLevel < dailyDecay(s.value) + 0.01;
    return h(
      'div',
      { class: 'box stat' },
      h('div', { class: 'row' }, h('b', { class: 'grow', text: S.label }), h('span', { class: 'lv', text: `NV ${s.lv}` })),
      h('i', { class: 'bar' }, h('i', { style: `width:${Math.round(inLevel * 10)}%`, 'data-tier': risk ? 'lo' : 'hi' })),
      h('p', { class: 'note', text: S.desc }),
      h('p', { class: 'note', text: `Próximo: ${S.next(s.lv)}` }),
      h('p', { class: 'note', text: `${S.how} ${trained ? 'Hoy ya la has trabajado: no baja.' : `Si hoy no la trabajas, baja ${dailyDecay(s.value).toFixed(1)}.`}${risk ? ' ¡Esta noche pierdes un nivel!' : ''}` }),
    );
  };
  return [
    h('div', { class: 'row' }, portrait(me.look, me.clothes, [], 0, 72), h('div', { class: 'grow' }, h('b', { text: c.coach.name }), h('p', { class: 'note', text: `${c.coach.gender === 'f' ? 'Míster' : 'Míster'} del ${c.club.name} · ${leagueName(c)} · temporada ${c.season}` }))),
    h(
      'div',
      { class: 'box' },
      h('p', { text: `Energía ${c.coach.energy}/${maxEnergy(c)}${c.hungry ? ' (comes de lata: −20)' : ''}` }),
      h('p', { text: `Cartera ${c.coach.wallet} € · alquiler 50 € cada lunes${c.coach.salary ? ` · sueldo ${c.coach.salary} €/semana` : ' · sin sueldo (la ferretería ayuda)'}` }),
      h('p', { text: `Confianza de la directiva: ${c.boardTrust}/100${c.boardTrust < 25 ? ' — ¡cuidado! Por debajo de 10 te echan.' : ''}` }),
      h('p', { class: 'note', text: c.club.id === 'barrio' && c.division === 0 ? 'Objetivo: ser campeón de liga.' : `Objetivo: ${division(c).promote ? `subir (los ${division(c).promote} primeros)` : 'mantenerse'}.` }),
    ),
    stat('tactica'),
    stat('labia'),
    stat('ojo'),
    stat('forma'),
  ];
}
