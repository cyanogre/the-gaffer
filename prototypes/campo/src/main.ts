import './styles.css';
import { Banter, type Line } from './content/banter';
import { shortName } from './content/names';
import { buildTeams } from './content/teams';
import { PixelRenderer } from './render/pixel/pixel';
import { CromosRenderer } from './render/three/cromos';
import { LowpolyRenderer } from './render/three/lowpoly';
import type { CameraMode, MatchRenderer, RendererId } from './render/types';
import { FORMATION_NAMES } from './sim/formations';
import { MatchSim } from './sim/match';
import { TRAITS } from './sim/traits';
import type { Block, Formation, Freedom, PassStyle } from './sim/types';
import { Overlay } from './ui/overlay';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const FACTORIES: Record<RendererId, () => MatchRenderer> = {
  pixel: () => new PixelRenderer(),
  lowpoly: () => new LowpolyRenderer(),
  cromos: () => new CromosRenderer(),
};
const HASH: Record<string, RendererId> = { pixel: 'pixel', '3d': 'lowpoly', cromos: 'cromos' };
const HASH_OF: Record<RendererId, string> = { pixel: 'pixel', lowpoly: '3d', cromos: 'cromos' };

const stage = $('stage');
const overlay = new Overlay($('overlay'));
let seed = 1 + Math.floor(Math.random() * 9999);
let sim = new MatchSim(seed, buildTeams(seed));
let banter = new Banter();
let renderer: MatchRenderer;
let rendererId: RendererId = 'cromos';
let speed = 1;
let acc = 0;
let selected = -1;
const cameraOf: Record<RendererId, CameraMode> = { pixel: 'tv', lowpoly: 'tv', cromos: 'tv' };

// ───────────────────────── renderizador ─────────────────────────
function useRenderer(id: RendererId) {
  if (renderer) renderer.dispose();
  rendererId = id;
  renderer = FACTORIES[id]();
  renderer.mount(stage);
  stage.insertBefore(stage.lastElementChild!, stage.firstChild);
  stage.dataset.style = id;
  overlay.setStyle(id);
  overlay.clear();
  renderer.setCamera(cameraOf[id]);
  renderer.setSelected(selected);
  resize();
  document.querySelectorAll<HTMLButtonElement>('#styles [data-r]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.r === id)));
  const cams = $('cams');
  cams.replaceChildren(
    ...renderer.cameraModes.map((m) => {
      const b = document.createElement('button');
      b.textContent = m.label;
      b.setAttribute('aria-pressed', String(m.id === cameraOf[id]));
      b.onclick = () => {
        cameraOf[id] = m.id;
        renderer.setCamera(m.id);
        resize();
        cams.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      };
      return b;
    }),
  );
  if (location.hash !== `#${HASH_OF[id]}`) history.replaceState(null, '', `#${HASH_OF[id]}`);
  if (selected >= 0) renderCard();
}

function resize() {
  const r = stage.getBoundingClientRect();
  renderer.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
}
new ResizeObserver(() => renderer && resize()).observe(stage);

// ───────────────────────── crónica y bocadillos ─────────────────────────
const feed = $('feed');
function clock(s: number) {
  return `${Math.floor(s / 60)}'`;
}
function show(lines: Line[]) {
  for (const l of lines) {
    if (l.feed) {
      const li = document.createElement('li');
      li.dataset.tone = l.tone ?? 'info';
      const t = document.createElement('time');
      t.textContent = clock(sim.clock);
      const span = document.createElement('span');
      span.textContent = l.feed;
      li.append(t, span);
      feed.prepend(li);
      while (feed.children.length > 30) feed.lastElementChild!.remove();
    }
    for (const b of l.bubbles ?? []) overlay.say(b.idx, b.text, b.delay ?? 0);
  }
}

// ───────────────────────── marcador ─────────────────────────
function scorebug() {
  const [h, a] = sim.teams.map((t) => t.profile);
  $('sbHome').textContent = h.short;
  $('sbAway').textContent = a.short;
  $('sbScore').textContent = `${sim.score[0]} – ${sim.score[1]}`;
  $('sbClock').textContent = sim.phase === 'fulltime' ? 'FINAL' : `${Math.floor(sim.clock / 60)}:${String(Math.floor(sim.clock % 60)).padStart(2, '0')}`;
  const s = sim.teams[0].signal;
  const chip = $('signalChip');
  if (s && s.kind === 'press' && s.until > sim.t) {
    chip.hidden = false;
    chip.textContent = `Presión total · ${Math.ceil(s.until - sim.t)} s`;
  } else if (s && s.kind === 'counter') {
    chip.hidden = false;
    chip.textContent = s.activeUntil > sim.t ? `¡Contra! · ${Math.ceil(s.activeUntil - sim.t)} s` : 'Contra preparada';
  } else chip.hidden = true;
  const st = sim.stats;
  const tot = st.possession[0] + st.possession[1] || 1;
  const pass = (i: 0 | 1) => (st.passes[i] ? Math.round((st.passesOk[i] / st.passes[i]) * 100) : 0);
  const rows: [string, string, string][] = [
    ['Posesión', `${Math.round((st.possession[0] / tot) * 100)}%`, `${Math.round((st.possession[1] / tot) * 100)}%`],
    ['Tiros (a puerta)', `${st.shots[0]} (${st.onTarget[0]})`, `${st.shots[1]} (${st.onTarget[1]})`],
    ['Pases acertados', `${pass(0)}%`, `${pass(1)}%`],
    ['Faltas', String(st.fouls[0]), String(st.fouls[1])],
    ['Amarillas', String(st.yellows[0]), String(st.yellows[1])],
  ];
  const tb = $('statsBody');
  if (tb.children.length !== rows.length) {
    tb.replaceChildren(
      ...rows.map(() => {
        const tr = document.createElement('tr');
        tr.append(document.createElement('td'), document.createElement('th'), document.createElement('td'));
        return tr;
      }),
    );
  }
  rows.forEach(([label, h0, a0], i) => {
    const tr = tb.children[i];
    tr.children[0].textContent = h0;
    tr.children[1].textContent = label;
    tr.children[2].textContent = a0;
  });
  $('fulltime').hidden = sim.phase !== 'fulltime';
  if (sim.phase === 'fulltime') $('ftScore').textContent = `${h.name} ${sim.score[0]} – ${sim.score[1]} ${a.name}`;
}

// ───────────────────────── banquillo ─────────────────────────
function seg(id: string, values: { v: string; label: string }[], current: () => string, apply: (v: string) => void) {
  const el = $(id);
  el.replaceChildren(
    ...values.map(({ v, label }) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.dataset.v = v;
      b.onclick = () => {
        apply(v);
        sync();
      };
      return b;
    }),
  );
  const sync = () => el.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === current())));
  sync();
  return sync;
}

const syncers: (() => void)[] = [];
function buildBench() {
  syncers.length = 0;
  const t = () => sim.teams[0].tactics;
  syncers.push(
    seg('formation', FORMATION_NAMES.map((f) => ({ v: f, label: f })), () => t().formation, (v) => sim.command({ kind: 'tactics', team: 0, patch: { formation: v as Formation } })),
    seg('block', [{ v: '0', label: 'Bajo' }, { v: '1', label: 'Medio' }, { v: '2', label: 'Alto' }], () => String(t().block), (v) => sim.command({ kind: 'tactics', team: 0, patch: { block: Number(v) as Block } })),
    seg('passStyle', [{ v: 'short', label: 'Corto' }, { v: 'mixed', label: 'Mixto' }, { v: 'long', label: 'Directo' }], () => t().style, (v) => sim.command({ kind: 'tactics', team: 0, patch: { style: v as PassStyle } })),
  );
}
// Las órdenes se aplican en el siguiente tick; los botones se resincronizan entonces.
setInterval(() => syncers.forEach((s) => s()), 300);

$('sigPress').onclick = () => sim.command({ kind: 'signal', team: 0, signal: 'press' });
$('sigCounter').onclick = () => sim.command({ kind: 'signal', team: 0, signal: 'counter' });
function signalButtons() {
  const team = sim.teams[0];
  for (const [id, kind] of [['sigPress', 'press'], ['sigCounter', 'counter']] as const) {
    const b = $<HTMLButtonElement>(id);
    const cd = team.signalCooldown[kind] - sim.t;
    b.disabled = cd > 0 || sim.phase === 'fulltime';
    b.querySelector('small')!.textContent = cd > 0 ? `disponible en ${Math.ceil(cd)} s` : kind === 'press' ? '25 s · cansa mucho' : 'al recuperar el balón';
  }
}

// ───────────────────────── ficha del jugador ─────────────────────────
const ROLE: Record<string, string> = { POR: 'Portero', DEF: 'Defensa', MED: 'Centrocampista', DEL: 'Delantero' };
function renderCard() {
  const card = $('card');
  if (selected < 0) {
    card.dataset.empty = 'true';
    return;
  }
  card.dataset.empty = 'false';
  const p = sim.players[selected];
  const prof = p.profile;
  const slot = sim.slotOf(p);
  const portrait = renderer.portrait(sim, selected, 160);
  portrait.className = 'portrait';
  $('cardPortrait').replaceChildren(portrait);
  $('cardName').textContent = prof.name;
  $('cardNick').textContent = prof.nick ? `«${prof.nick}»` : '';
  $('cardMeta').textContent = `${prof.num} · ${slot.label} · ${ROLE[slot.role]} · ${sim.teams[p.team].profile.name}`;
  $('cardQuirk').textContent = prof.quirk;
  const traits = $('cardTraits');
  traits.replaceChildren(
    ...prof.traits.map((t) => {
      const li = document.createElement('li');
      const b = document.createElement('b');
      b.textContent = TRAITS[t].label;
      const s = document.createElement('span');
      s.textContent = TRAITS[t].desc;
      li.append(b, s);
      return li;
    }),
  );
  if (!prof.traits.length) {
    const li = document.createElement('li');
    li.textContent = 'Sin manías conocidas. De momento.';
    traits.append(li);
  }
  const A = prof.attrs;
  const attrs: [string, number][] =
    slot.role === 'POR'
      ? [['Paradas', A.keeping], ['Colocación', A.positioning], ['Pase', A.passing], ['Sangre fría', A.composure]]
      : [['Velocidad', A.pace], ['Pase', A.passing], ['Tiro', A.shooting], ['Regate', A.dribbling], ['Entrada', A.tackling], ['Visión', A.vision]];
  $('cardAttrs').replaceChildren(
    ...attrs.map(([label, v]) => {
      const row = document.createElement('div');
      row.className = 'attr';
      row.innerHTML = `<span></span><meter min="1" max="20" low="8" high="14" optimum="20"></meter><b></b>`;
      row.children[0].textContent = label;
      (row.children[1] as HTMLMeterElement).value = v;
      row.children[2].textContent = String(v);
      return row;
    }),
  );
  const own = p.team === 0;
  $('cardOrders').hidden = !own;
  document.querySelectorAll<HTMLButtonElement>('#freedom button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === p.freedom)));
}
document.querySelectorAll<HTMLButtonElement>('#freedom button').forEach((b) => {
  b.onclick = () => {
    if (selected < 0) return;
    sim.command({ kind: 'freedom', player: selected, value: Number(b.dataset.v) as Freedom });
    document.querySelectorAll<HTMLButtonElement>('#freedom button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  };
});
function liveCard() {
  if (selected < 0) return;
  const p = sim.players[selected];
  const f = $<HTMLMeterElement>('cardFatigue');
  f.value = 1 - p.fatigue;
  $('cardFatigueTxt').textContent = p.fatigue < 0.25 ? 'Fresco' : p.fatigue < 0.5 ? 'Tocado' : p.fatigue < 0.7 ? 'Cansado' : 'Fundido';
  $('cardCards').textContent = p.sentOff ? 'Expulsado' : p.yellows ? `${p.yellows} amarilla` : '';
}
function select(idx: number) {
  selected = idx;
  renderer.setSelected(idx);
  renderCard();
}

stage.addEventListener('pointerdown', (ev) => {
  const r = stage.getBoundingClientRect();
  const idx = overlay.pick(ev.clientX - r.left, ev.clientY - r.top, sim, renderer);
  if (idx >= 0) select(idx);
});

// ───────────────────────── controles generales ─────────────────────────
document.querySelectorAll<HTMLButtonElement>('#styles [data-r]').forEach((b) => (b.onclick = () => useRenderer(b.dataset.r as RendererId)));
document.querySelectorAll<HTMLButtonElement>('#speed button').forEach((b) => {
  b.onclick = () => {
    speed = Number(b.dataset.speed);
    document.querySelectorAll('#speed button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  };
});
$('again').onclick = () => newMatch();
window.addEventListener('hashchange', () => {
  const id = HASH[location.hash.slice(1)];
  if (id && id !== rendererId) useRenderer(id);
});

function newMatch() {
  seed = 1 + Math.floor(Math.random() * 9999);
  sim = new MatchSim(seed, buildTeams(seed));
  banter = new Banter();
  feed.replaceChildren();
  useRenderer(rendererId);
  buildBench();
  select(sim.players.find((p) => p.team === 0 && p.profile.traits.includes('goleadorNato'))?.idx ?? 9);
}

// ───────────────────────── bucle ─────────────────────────
let last = performance.now();
let fps = 60;
let perfAt = 0;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  acc += dt * speed;
  let steps = 0;
  while (acc >= sim.dt && steps < 12) {
    sim.step();
    acc -= sim.dt;
    steps++;
  }
  if (steps === 12) acc = 0;
  for (const e of sim.drainEvents()) {
    renderer.onEvent(e, sim);
    show(banter.onEvent(e, sim));
    if (e.kind === 'goal' && e.a !== undefined) {
      const banner = $('banner');
      banner.hidden = false;
      banner.dataset.team = String(e.team);
      $('bannerWho').textContent = e.detail === 'og' ? 'en propia puerta' : shortName(sim.players[e.a].profile);
      banner.classList.remove('pop');
      void banner.offsetWidth;
      banner.classList.add('pop');
      setTimeout(() => (banner.hidden = true), 2600);
    }
  }
  show(banter.ambient(sim));
  const alpha = acc / sim.dt;
  renderer.render(sim, alpha, dt * (speed || 0.0001));
  overlay.update(sim, renderer, alpha, dt, selected);
  scorebug();
  signalButtons();
  liveCard();
  if (now - perfAt > 500) {
    perfAt = now;
    const pf = renderer.perf();
    $('perf').textContent = `${Math.round(fps)} fps · ${pf.drawCalls} llamadas de dibujo · ${pf.detail}`;
  }
  requestAnimationFrame(frame);
}

// ───────────────────────── arranque ─────────────────────────
const initial = HASH[location.hash.slice(1)] ?? 'cromos';
useRenderer(initial);
buildBench();
select(sim.players.find((p) => p.team === 0 && p.profile.traits.includes('goleadorNato'))?.idx ?? 9);
requestAnimationFrame(frame);

// Puntos de la tabla comparativa (●●●○○).
document.querySelectorAll<HTMLTableCellElement>('td[data-s]').forEach((td) => {
  const s = Number(td.dataset.s);
  td.textContent = '●'.repeat(s) + '○'.repeat(5 - s);
  td.setAttribute('aria-label', `${s} de 5`);
});
