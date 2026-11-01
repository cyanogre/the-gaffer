import './styles.css';
import { Banter, type Line } from './content/banter';
import type { Gender } from './content/look';
import { shortName } from './content/names';
import { buildTeams } from './content/teams';
import { PixelRenderer } from './render/pixel/pixel';
import { CromosRenderer } from './render/three/cromos';
import { LowpolyRenderer } from './render/three/lowpoly';
import type { CameraMode, MatchRenderer, RendererId } from './render/types';
import { FORMATION_NAMES } from './sim/formations';
import { BOX_D, BOX_W, PITCH_L, PITCH_W } from './sim/geometry';
import { MatchSim } from './sim/match';
import { TRAITS, traitLabel } from './sim/traits';
import type { Block, Formation, Freedom, MatchEvent, PassStyle, SimPlayer } from './sim/types';
import { Overlay } from './ui/overlay';
import { drawCrest, iconSvg } from './ui/pixelart';

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
let gender: Gender = 'm';
let seed = 1 + Math.floor(Math.random() * 9999);
let sim = new MatchSim(seed, buildTeams(seed, gender));
let banter = new Banter();
let renderer: MatchRenderer;
let rendererId: RendererId = 'pixel';
let speed = 1;
let paused = false;
let acc = 0;
let selected = -1;
const cameraOf: Record<RendererId, CameraMode> = { pixel: 'tv', lowpoly: 'tv', cromos: 'tv' };

// Estadísticas por jugador, contadas a partir de los eventos del motor.
interface PStats {
  shots: number;
  goals: number;
  passes: number;
  tackles: number;
  fouls: number;
  saves: number;
}
let pstats: PStats[] = [];
const resetStats = () => (pstats = sim.players.map(() => ({ shots: 0, goals: 0, passes: 0, tackles: 0, fouls: 0, saves: 0 })));
resetStats();
function track(e: MatchEvent) {
  const s = e.a !== undefined && e.a >= 0 ? pstats[e.a] : undefined;
  if (!s) return;
  if (e.kind === 'shot') s.shots++;
  if (e.kind === 'goal' && e.detail !== 'og') s.goals++;
  if (e.kind === 'pass_ok') s.passes++;
  if (e.kind === 'tackle') s.tackles++;
  if (e.kind === 'foul') s.fouls++;
  if (e.kind === 'save') s.saves++;
}

// ───────────────────────── renderizador ─────────────────────────
let portraitCache = new Map<string, HTMLCanvasElement>();
function portrait(idx: number, size: number) {
  const key = `${rendererId}:${idx}:${size}`;
  let c = portraitCache.get(key);
  if (!c) {
    c = renderer.portrait(sim, idx, size);
    portraitCache.set(key, c);
  }
  const out = document.createElement('canvas');
  out.width = out.height = size;
  out.getContext('2d')!.drawImage(c, 0, 0);
  out.className = 'portrait';
  return out;
}

function useRenderer(id: RendererId) {
  if (renderer) renderer.dispose();
  rendererId = id;
  renderer = FACTORIES[id]();
  renderer.mount(stage);
  stage.insertBefore(stage.lastElementChild!, stage.firstChild);
  stage.dataset.style = id;
  document.body.dataset.style = id;
  overlay.setStyle(id);
  overlay.clear();
  if (!renderer.cameraModes.some((m) => m.id === cameraOf[id])) cameraOf[id] = renderer.cameraModes[0].id;
  renderer.setCamera(cameraOf[id]);
  renderer.setSelected(selected);
  resize();
  document.querySelectorAll<HTMLButtonElement>('#styles [data-r]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.r === id)));
  $('camTxt').textContent = renderer.cameraModes.find((m) => m.id === cameraOf[id])?.label ?? '';
  if (location.hash !== `#${HASH_OF[id]}`) history.replaceState(null, '', `#${HASH_OF[id]}`);
  renderSquad();
  renderCard();
}

function resize() {
  const r = stage.getBoundingClientRect();
  renderer.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
}
new ResizeObserver(() => renderer && resize()).observe(stage);

// ───────────────────────── marcador superior ─────────────────────────
function renderTop() {
  const [h, a] = sim.teams.map((t) => t.profile);
  $('nameHome').textContent = h.name.toUpperCase();
  $('nameAway').textContent = a.name.toUpperCase();
  const tag = gender === 'f' ? 'Liga Femenina de Barrio' : 'Liga de Barrio';
  $('tagHome').textContent = tag;
  $('tagAway').textContent = tag;
  drawCrest($<HTMLCanvasElement>('crestHome'), h.kit, 'B');
  drawCrest($<HTMLCanvasElement>('crestAway'), a.kit, 'P');
  document.querySelectorAll<HTMLButtonElement>('#gender button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.g === gender)));
}
function updateTop() {
  $('scoreHome').textContent = String(sim.score[0]);
  $('scoreAway').textContent = String(sim.score[1]);
  const c = sim.clock;
  $('clock').textContent = `${Math.floor(c / 60)}:${String(Math.floor(c % 60)).padStart(2, '0')}`;
  $('half').textContent = sim.phase === 'fulltime' ? 'FINAL' : c < 45 * 60 ? '1ª PARTE' : '2ª PARTE';
  const s = sim.teams[0].signal;
  const chip = $('signalChip');
  if (s && s.kind === 'press' && s.until > sim.t) {
    chip.hidden = false;
    chip.textContent = `Presión total · ${Math.ceil(s.until - sim.t)} s`;
  } else if (s && s.kind === 'counter') {
    chip.hidden = false;
    chip.textContent = s.activeUntil > sim.t ? `¡Contra! · ${Math.ceil(s.activeUntil - sim.t)} s` : 'Contraataque preparado';
  } else chip.hidden = true;
  $('fulltime').hidden = sim.phase !== 'fulltime';
  if (sim.phase === 'fulltime') $('ftScore').textContent = `${sim.teams[0].profile.name} ${sim.score[0]} – ${sim.score[1]} ${sim.teams[1].profile.name}`;
}

// ───────────────────────── órdenes tácticas ─────────────────────────
interface Order {
  icon: string;
  label: string;
  hint: string;
  active: () => boolean;
  apply: () => void;
}
const T = () => sim.teams[0].tactics;
const ORDERS: Order[] = [
  { icon: 'shield', label: 'Bloque bajo', hint: 'Línea atrás, un solo presionador', active: () => T().block === 0, apply: () => sim.command({ kind: 'tactics', team: 0, patch: { block: 0 as Block } }) },
  { icon: 'lines', label: 'Bloque medio', hint: 'Equilibrio', active: () => T().block === 1, apply: () => sim.command({ kind: 'tactics', team: 0, patch: { block: 1 as Block } }) },
  { icon: 'run', label: 'Presión alta', hint: 'Línea arriba, dos presionan', active: () => T().block === 2, apply: () => sim.command({ kind: 'tactics', team: 0, patch: { block: 2 as Block } }) },
  { icon: 'dots', label: 'Mantener posesión', hint: 'Pases cortos y seguros', active: () => T().style === 'short', apply: () => sim.command({ kind: 'tactics', team: 0, patch: { style: 'short' as PassStyle } }) },
  { icon: 'zig', label: 'Juego mixto', hint: 'Sin preferencia', active: () => T().style === 'mixed', apply: () => sim.command({ kind: 'tactics', team: 0, patch: { style: 'mixed' as PassStyle } }) },
  { icon: 'arrow', label: 'Buscar el pase largo', hint: 'Balón a la espalda', active: () => T().style === 'long', apply: () => sim.command({ kind: 'tactics', team: 0, patch: { style: 'long' as PassStyle } }) },
];
function orderItem(o: { icon: string; label: string; hint: string }, onClick: () => void) {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button';
  b.innerHTML = `${iconSvg(o.icon)}<span><b></b><small></small></span>`;
  b.querySelector('b')!.textContent = o.label;
  b.querySelector('small')!.textContent = o.hint;
  b.onclick = onClick;
  li.append(b);
  return { li, b };
}
const orderButtons: { b: HTMLButtonElement; o: Order }[] = [];
for (const o of ORDERS) {
  const { li, b } = orderItem(o, () => {
    o.apply();
    setTimeout(syncOrders, 60);
  });
  orderButtons.push({ b, o });
  $('orders').append(li);
}
function syncOrders() {
  for (const { b, o } of orderButtons) b.setAttribute('aria-pressed', String(o.active()));
  document.querySelectorAll<HTMLButtonElement>('#formation button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === T().formation)));
}
$('formation').replaceChildren(
  ...FORMATION_NAMES.map((f) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = f;
    b.dataset.v = f;
    b.onclick = () => {
      sim.command({ kind: 'tactics', team: 0, patch: { formation: f as Formation } });
      setTimeout(syncOrders, 60);
    };
    return b;
  }),
);
const signalButtons: Record<'press' | 'counter', HTMLButtonElement> = {
  press: orderItem({ icon: 'flame', label: '¡Presión total!', hint: '25 s · cansa mucho' }, () => sim.command({ kind: 'signal', team: 0, signal: 'press' })).b,
  counter: orderItem({ icon: 'bolt', label: 'Contraataque', hint: 'al recuperar el balón' }, () => sim.command({ kind: 'signal', team: 0, signal: 'counter' })).b,
};
$('signals').append(signalButtons.press.parentElement!, signalButtons.counter.parentElement!);
function syncSignals() {
  const team = sim.teams[0];
  for (const kind of ['press', 'counter'] as const) {
    const b = signalButtons[kind];
    const cd = team.signalCooldown[kind] - sim.t;
    const active = team.signal?.kind === kind && (kind === 'press' ? team.signal.until > sim.t : true);
    b.disabled = (cd > 0 && !active) || sim.phase === 'fulltime';
    b.setAttribute('aria-pressed', String(active));
    b.querySelector('small')!.textContent = active ? (kind === 'press' ? 'en marcha' : team.signal!.activeUntil > sim.t ? '¡en marcha!' : 'preparado') : cd > 0 ? `disponible en ${Math.ceil(cd)} s` : kind === 'press' ? '25 s · cansa mucho' : 'al recuperar el balón';
  }
}

// ───────────────────────── ficha del jugador ─────────────────────────
const g = (p: SimPlayer, m: string, f: string) => (p.profile.look.gender === 'f' ? f : m);
const ROLE = (p: SimPlayer, role: string) => ({ POR: g(p, 'Portero', 'Portera'), DEF: 'Defensa', MED: 'Centrocampista', DEL: g(p, 'Delantero', 'Delantera') })[role] ?? role;
function surname(p: SimPlayer) {
  const parts = p.profile.name.split(' ');
  return parts[parts.length - 1];
}
function comment(p: SimPlayer): string {
  const s = pstats[p.idx];
  const t = p.profile.traits;
  if (p.sentOff) return 'Expulsado. Lo ve desde la grada, indignado con el mundo.';
  if (s.goals >= 2) return `¡Está en racha! Pide que pongan su nombre a la grada.`;
  if (s.goals === 1) return t.includes('goleadorNato') ? 'Ha marcado. Ya habla de sí en tercera persona.' : 'Ha marcado y no se calla.';
  if (t.includes('goleadorNato') && s.shots >= 3) return `${s.shots} tiros y ningún gol. Dice que el portero tiene un pacto con alguien.`;
  if (p.fatigue > 0.6) return 'Va justo de fuerzas. Pide el cambio con la mirada.';
  if (s.fouls >= 2) return `Lleva ${s.fouls} faltas. El árbitro ya le tiene ${g(p, 'fichado', 'fichada')}.`;
  if (s.saves >= 2) return 'Lo está parando todo. La grada corea su apodo.';
  if (s.tackles >= 3) return 'Está ganando todos los duelos.';
  if (s.passes >= 8) return 'Está moviendo bien el balón.';
  if (t.includes('padel')) return 'Mira mucho el reloj. Tiene pádel a las nueve.';
  if (t.includes('nervioso')) return 'Le tiemblan las piernas en cada control.';
  if (t.includes('egoista')) return 'Aún no ha dado un pase. Lo considera un logro.';
  return sim.t < 20 ? 'Calentando motores.' : g(p, 'Está metido en el partido.', 'Está metida en el partido.');
}
function tier(v: number) {
  return v >= 15 ? 'hi' : v >= 10 ? 'mid' : 'lo';
}
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
  $('cardName').textContent = `#${prof.num} · ${surname(p)}`;
  $('cardPos').textContent = slot.label;
  $('cardPos').dataset.team = String(p.team);
  $('cardPortrait').replaceChildren(portrait(selected, 96));
  $('cardNick').textContent = `${prof.nick ? `«${prof.nick}» · ` : ''}${ROLE(p, slot.role)} · ${sim.teams[p.team].profile.name}`;
  $('cardQuirk').textContent = prof.quirk;
  const A = prof.attrs;
  const attrs: [string, number][] =
    slot.role === 'POR'
      ? [['PAR', A.keeping], ['COL', A.positioning], ['PAS', A.passing], ['VEL', A.pace], ['SAN', A.composure], ['RES', A.stamina]]
      : [['VEL', A.pace], ['PAS', A.passing], ['TIR', A.shooting], ['REG', A.dribbling], ['ENT', A.tackling], ['VIS', A.vision]];
  $('cardAttrs').replaceChildren(
    ...attrs.flatMap(([k, v]) => {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = String(v);
      dd.dataset.tier = tier(v);
      return [dt, dd];
    }),
  );
  $('cardTraits').replaceChildren(
    ...prof.traits.map((t) => {
      const li = document.createElement('li');
      li.textContent = traitLabel(t, prof.look.gender);
      li.title = TRAITS[t].desc;
      return li;
    }),
  );
  $('cardOrders').hidden = p.team !== 0;
  document.querySelectorAll<HTMLButtonElement>('#freedom button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === p.freedom)));
  liveCard();
}
function liveCard() {
  if (selected < 0) return;
  const p = sim.players[selected];
  $('cardFatigue').style.width = `${Math.round((1 - p.fatigue) * 100)}%`;
  $('cardFatigue').dataset.tier = p.fatigue < 0.3 ? 'hi' : p.fatigue < 0.6 ? 'mid' : 'lo';
  $('cardFatigueTxt').textContent = p.sentOff ? 'Expulsado' : p.fatigue < 0.25 ? 'Fresco' : p.fatigue < 0.5 ? 'Tocado' : p.fatigue < 0.7 ? 'Cansado' : 'Fundido';
  $('cardComment').textContent = comment(p);
}
document.querySelectorAll<HTMLButtonElement>('#freedom button').forEach((b) => {
  b.onclick = () => {
    if (selected < 0) return;
    sim.command({ kind: 'freedom', player: selected, value: Number(b.dataset.v) as Freedom });
    document.querySelectorAll<HTMLButtonElement>('#freedom button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  };
});
function select(idx: number) {
  selected = idx;
  renderer.setSelected(idx);
  renderCard();
  document.querySelectorAll<HTMLElement>('#squad [data-idx]').forEach((el) => el.setAttribute('aria-pressed', String(Number(el.dataset.idx) === idx)));
}

// ───────────────────────── tu once ─────────────────────────
function renderSquad() {
  const list = $('squad');
  list.replaceChildren(
    ...sim.players
      .filter((p) => p.team === 0)
      .map((p) => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.idx = String(p.idx);
        b.setAttribute('aria-pressed', String(p.idx === selected));
        b.append(portrait(p.idx, 48));
        const meta = document.createElement('span');
        meta.className = 'sq-meta';
        meta.innerHTML = '<b></b><small></small><i class="bar"><i></i></i>';
        meta.querySelector('b')!.textContent = `#${p.profile.num}`;
        meta.querySelector('small')!.textContent = surname(p);
        b.append(meta);
        b.onclick = () => select(p.idx);
        li.append(b);
        return li;
      }),
  );
}
function liveSquad() {
  document.querySelectorAll<HTMLElement>('#squad [data-idx]').forEach((el) => {
    const p = sim.players[Number(el.dataset.idx)];
    const bar = el.querySelector<HTMLElement>('.bar > i')!;
    bar.style.width = `${Math.round((1 - p.fatigue) * 100)}%`;
    bar.dataset.tier = p.fatigue < 0.3 ? 'hi' : p.fatigue < 0.6 ? 'mid' : 'lo';
    el.dataset.out = String(p.sentOff);
    el.dataset.card = p.yellows ? 'y' : '';
  });
}

// ───────────────────────── eventos ─────────────────────────
const feed = $('feed');
function show(lines: Line[]) {
  for (const l of lines) {
    if (l.feed) {
      const li = document.createElement('li');
      li.dataset.tone = l.tone ?? 'info';
      const t = document.createElement('time');
      t.textContent = `${Math.floor(sim.clock / 60)}'`;
      const span = document.createElement('span');
      span.textContent = l.feed;
      li.append(document.createElement('i'), t, span);
      feed.prepend(li);
      while (feed.children.length > 30) feed.lastElementChild!.remove();
    }
    for (const b of l.bubbles ?? []) overlay.say(b.idx, b.text, b.delay ?? 0);
  }
}

// ───────────────────────── minimapa ─────────────────────────
const mini = $<HTMLCanvasElement>('minimap');
const mctx = mini.getContext('2d')!;
function drawMinimap() {
  const W = mini.width;
  const H = mini.height;
  const m = 6;
  const sx = (x: number) => m + (x / PITCH_L) * (W - 2 * m);
  const sy = (y: number) => m + (y / PITCH_W) * (H - 2 * m);
  mctx.fillStyle = '#1d4a30';
  mctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 8; i++) {
    mctx.fillStyle = i % 2 ? '#235836' : '#1f4f33';
    mctx.fillRect(sx((PITCH_L / 8) * i), sy(0), (W - 2 * m) / 8 + 1, H - 2 * m);
  }
  mctx.strokeStyle = 'rgba(233,240,226,0.7)';
  mctx.lineWidth = 1;
  mctx.strokeRect(sx(0) + 0.5, sy(0) + 0.5, W - 2 * m - 1, H - 2 * m - 1);
  mctx.beginPath();
  mctx.moveTo(Math.round(sx(PITCH_L / 2)) + 0.5, sy(0));
  mctx.lineTo(Math.round(sx(PITCH_L / 2)) + 0.5, sy(PITCH_W));
  mctx.stroke();
  mctx.beginPath();
  mctx.arc(sx(PITCH_L / 2), sy(PITCH_W / 2), (9.15 / PITCH_L) * (W - 2 * m), 0, Math.PI * 2);
  mctx.stroke();
  for (const gx of [0, PITCH_L]) {
    const x0 = gx === 0 ? sx(0) : sx(PITCH_L - BOX_D);
    mctx.strokeRect(Math.round(x0) + 0.5, Math.round(sy(PITCH_W / 2 - BOX_W / 2)) + 0.5, Math.round((BOX_D / PITCH_L) * (W - 2 * m)), Math.round((BOX_W / PITCH_W) * (H - 2 * m)));
  }
  for (const p of sim.players) {
    if (p.sentOff) continue;
    const kit = sim.kitOf(p);
    mctx.fillStyle = '#1a1226';
    mctx.fillRect(Math.round(sx(p.x)) - 2, Math.round(sy(p.y)) - 2, 5, 5);
    mctx.fillStyle = kit.shirt;
    mctx.fillRect(Math.round(sx(p.x)) - 1, Math.round(sy(p.y)) - 1, 3, 3);
    if (p.idx === selected) {
      mctx.strokeStyle = '#f2c94c';
      mctx.strokeRect(Math.round(sx(p.x)) - 3.5, Math.round(sy(p.y)) - 3.5, 7, 7);
    }
  }
  mctx.fillStyle = '#ffffff';
  mctx.fillRect(Math.round(sx(sim.ball.x)) - 1, Math.round(sy(sim.ball.y)) - 1, 3, 3);
}

// ───────────────────────── controles ─────────────────────────
$('btnPause').onclick = () => {
  paused = !paused;
  $('btnPause').querySelector('b')!.textContent = paused ? 'Seguir' : 'Pausa';
  $('btnPause').setAttribute('aria-pressed', String(paused));
};
$('btnSpeed').onclick = () => {
  speed = speed === 1 ? 2 : speed === 2 ? 4 : 1;
  $('speedTxt').textContent = `×${speed}`;
};
$('btnCam').onclick = () => {
  const modes = renderer.cameraModes;
  const i = modes.findIndex((m) => m.id === cameraOf[rendererId]);
  const next = modes[(i + 1) % modes.length];
  cameraOf[rendererId] = next.id;
  renderer.setCamera(next.id);
  $('camTxt').textContent = next.label;
};
$('btnNew').onclick = () => newMatch();
$('again').onclick = () => newMatch();
document.querySelectorAll<HTMLButtonElement>('#gender button').forEach((b) => (b.onclick = () => newMatch(b.dataset.g as Gender)));
document.querySelectorAll<HTMLButtonElement>('#styles [data-r]').forEach((b) => (b.onclick = () => useRenderer(b.dataset.r as RendererId)));
window.addEventListener('hashchange', () => {
  const id = HASH[location.hash.slice(1)];
  if (id && id !== rendererId) useRenderer(id);
});
stage.addEventListener('pointerdown', (ev) => {
  const r = stage.getBoundingClientRect();
  const idx = overlay.pick(ev.clientX - r.left, ev.clientY - r.top, sim, renderer);
  if (idx >= 0) select(idx);
});

function newMatch(g?: Gender) {
  if (g) gender = g;
  seed = 1 + Math.floor(Math.random() * 9999);
  sim = new MatchSim(seed, buildTeams(seed, gender));
  banter = new Banter();
  portraitCache = new Map();
  resetStats();
  feed.replaceChildren();
  renderTop();
  useRenderer(rendererId);
  syncOrders();
  select(defaultSelection());
}
function defaultSelection() {
  return sim.players.find((p) => p.team === 0 && p.profile.traits.includes('goleadorNato'))?.idx ?? 9;
}

// ───────────────────────── bucle ─────────────────────────
let last = performance.now();
let fps = 60;
let slowAt = 0;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  if (!paused) acc += dt * speed;
  let steps = 0;
  while (acc >= sim.dt && steps < 12) {
    sim.step();
    acc -= sim.dt;
    steps++;
  }
  if (steps === 12) acc = 0;
  for (const e of sim.drainEvents()) {
    track(e);
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
  renderer.render(sim, alpha, paused ? 0 : dt * speed);
  overlay.update(sim, renderer, alpha, dt, selected);
  updateTop();
  drawMinimap();
  if (now - slowAt > 400) {
    slowAt = now;
    syncSignals();
    liveCard();
    liveSquad();
    const pf = renderer.perf();
    $('perf').textContent = `${Math.round(fps)} fps · ${pf.drawCalls} llamadas de dibujo · ${pf.detail}`;
  }
  requestAnimationFrame(frame);
}

// Puntos de la tabla comparativa.
document.querySelectorAll<HTMLTableCellElement>('td[data-s]').forEach((td) => {
  const s = Number(td.dataset.s);
  td.textContent = '■'.repeat(s) + '□'.repeat(5 - s);
  td.setAttribute('aria-label', `${s} de 5`);
});

renderTop();
useRenderer(HASH[location.hash.slice(1)] ?? 'pixel');
syncOrders();
select(defaultSelection());
requestAnimationFrame(frame);
