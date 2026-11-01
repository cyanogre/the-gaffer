import './styles.css';
import { Banter, type Line } from './content/banter';
import type { Gender } from './content/look';
import { shortName } from './content/names';
import { RIVALS } from './content/teams';
import { STADIUM_LEVELS, attendance, closeWeek, matchSetup, newCareer, rivalOf, upgradeStadium, weatherOf, type Career, type Summary } from './game/career';
import { HybridRenderer } from './render/hybrid/hybrid';
import { HouseView, type HotspotId } from './render/house/house';
import type { CameraMode } from './render/types';
import { conditionsFor, type TimeOfDay, type Weather } from './sim/conditions';
import { FORMATION_NAMES } from './sim/formations';
import { BOX_D, BOX_W, PITCH_L, PITCH_W } from './sim/geometry';
import { MatchSim } from './sim/match';
import { TRAITS, traitLabel } from './sim/traits';
import type { Block, Formation, Freedom, MatchEvent, PassStyle, SimPlayer, TeamProfile } from './sim/types';
import { Overlay } from './ui/overlay';
import { drawCrest, iconSvg } from './ui/pixelart';
import { VNPlayer } from './ui/vn';
import { pendingScenes, postMatchScene, type Trigger, type VNScene } from './vn/scenes';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const game = $('game');
const stage = $('stage');
const overlay = new Overlay($('overlay'));
const vn = new VNPlayer(stage);

let career: Career = newCareer('m');
let mode: 'house' | 'match' = 'house';
let house: HouseView | null = null;
let renderer: HybridRenderer | null = null;
let sim: MatchSim | null = null;
let weekTeams: [TeamProfile, TeamProfile] = matchSetup(career).teams;
let banter = new Banter();
let speed = 1;
let paused = false;
let acc = 0;
let selected = -1;
let cam: CameraMode = 'tv';

const WX: Record<Weather, string> = { clear: 'Despejado', cloudy: 'Nublado', rain: 'Lluvia', storm: 'Tormenta', fog: 'Niebla', snow: 'Nieve' };
const TX: Record<TimeOfDay, string> = { day: 'mediodía', dusk: 'tarde', night: 'noche' };
const WX_EFFECT: Record<Weather, string> = {
  clear: 'Sin sorpresas: el campo manda.',
  cloudy: 'Algo de viento; los balones largos se desvían un poco.',
  rain: 'Barro en la tierra (el balón frena), resbalones en las entradas y el portero no blocará igual.',
  storm: 'Mucho viento, barro y resbalones. Viene la mitad de la gente.',
  fog: 'Se ven peor los pases largos: los jugadores buscan opciones cercanas.',
  snow: 'El balón casi no rueda, se cansan antes y se resbala más.',
};

function toast(text: string) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout((toast as unknown as { h: number }).h);
  (toast as unknown as { h: number }).h = window.setTimeout(() => (t.hidden = true), 2800);
}

function canvasFirst(el: HTMLElement) {
  stage.insertBefore(el, stage.firstChild);
}

function resize() {
  const r = stage.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width));
  const h = Math.max(1, Math.round(r.height));
  house?.resize(w, h);
  renderer?.resize(w, h);
}
new ResizeObserver(resize).observe(stage);

// ═════════════════════════ CASA ═════════════════════════
const hotspotEls = new Map<HotspotId, HTMLButtonElement>();
const TRIGGER_OF: Partial<Record<HotspotId, Trigger>> = { phone: 'phone', door: 'door', laptop: 'laptop' };

function enterHouse() {
  mode = 'house';
  game.dataset.mode = 'house';
  disposeMatch();
  house?.dispose();
  house = new HouseView();
  house.mount(stage);
  canvasFirst(stage.querySelector('canvas')!);
  overlay.clear();
  resize();
  refreshHouse();
}

function refreshHouse() {
  weekTeams = matchSetup(career).teams;
  const pend = pendingScenes(career);
  if (house) {
    house.setState(career);
    house.phoneRinging = pend.some((s) => s.trigger === 'phone');
    house.mailPending = pend.some((s) => s.trigger === 'laptop');
    const host = $('hotspots');
    host.replaceChildren();
    hotspotEls.clear();
    for (const h of house.hotspots) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hotspot';
      const scene = pend.find((s) => s.trigger === TRIGGER_OF[h.id]);
      const badge = h.id === 'phone' && scene ? '¡Suena!' : h.id === 'door' && scene ? '¡Llaman!' : h.id === 'laptop' && scene ? '1 correo' : h.id === 'door' ? 'Al campo' : '';
      b.innerHTML = `<b></b>${badge ? '<i></i>' : ''}`;
      b.querySelector('b')!.textContent = h.label;
      if (badge) b.querySelector('i')!.textContent = badge;
      b.dataset.alert = String(!!scene);
      b.onclick = () => useHotspot(h.id);
      host.append(b);
      hotspotEls.set(h.id, b);
    }
  }
  renderTopHouse();
  renderAgenda();
  renderClub();
}

function renderTopHouse() {
  drawCrest($<HTMLCanvasElement>('crestClub'), weekTeams[0].kit, 'B');
  $('clubTag').textContent = career.gender === 'f' ? 'Liga Femenina de Barrio' : 'Liga de Barrio';
  $('kWeek').textContent = String(career.week);
  $('kMoney').textContent = `${career.money} €`;
  $('kFans').textContent = String(career.fans);
  $('kTrust').style.width = `${career.boardTrust}%`;
  $('kTrust').dataset.tier = career.boardTrust >= 60 ? 'hi' : career.boardTrust >= 35 ? 'mid' : 'lo';
  $('kStadium').textContent = STADIUM_LEVELS[career.stadiumLevel].short;
  document.querySelectorAll<HTMLButtonElement>('#gender button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.g === career.gender)));
  const [w] = weatherOf(career);
  $('goMatchTxt').textContent = `vs ${rivalOf(career).short} · ${WX[w].toLowerCase()}`;
}

function renderAgenda() {
  const pend = pendingScenes(career);
  const items: [string, string, boolean][] = [];
  const label: Record<Trigger, string> = { phone: 'Teléfono', door: 'Puerta', laptop: 'Portátil' };
  for (const s of pend) items.push([label[s.trigger], s.title, true]);
  const [w, t] = weatherOf(career);
  items.push(['Domingo', `vs ${rivalOf(career).name} · ${WX[w]} por la ${TX[t]}`, false]);
  items.push(['Público', `Se esperan ${attendance(career)} personas en ${STADIUM_LEVELS[career.stadiumLevel].short}`, false]);
  if (career.promise) items.push(['Promesa', { win: 'Le has prometido ganar a Don Ramón.', fun: 'Has prometido espectáculo.', realist: 'Fuiste sincero con el presidente.' }[career.promise], false]);
  $('agenda').replaceChildren(
    ...items.map(([k, v, alert]) => {
      const li = document.createElement('li');
      li.dataset.alert = String(alert);
      li.innerHTML = '<b></b><span></span>';
      li.querySelector('b')!.textContent = k;
      li.querySelector('span')!.textContent = v;
      return li;
    }),
  );
  const notes: string[] = [];
  for (const [i, n] of Object.entries(career.modNotes)) notes.push(`${weekTeams[0].players[Number(i)].nick ?? weekTeams[0].players[Number(i)].name}: ${n}`);
  if (career.penaltyTaker !== null) notes.push(`Penaltis: los tira ${weekTeams[0].players[career.penaltyTaker].nick ?? weekTeams[0].players[career.penaltyTaker].name}.`);
  if (career.sponsor) notes.push(career.sponsorShout ? 'Bar Manolo patrocina. Hay que gritar su nombre al marcar.' : 'Bar Manolo patrocina (sin gritos).');
  if (career.flags.manoloEnfadado) notes.push('Manolo está enfadado: no animará.');
  if (!notes.length) notes.push('Todo tranquilo. Demasiado.');
  $('notes').replaceChildren(
    ...notes.map((n) => {
      const li = document.createElement('li');
      li.textContent = n;
      return li;
    }),
  );
}

function renderClub() {
  const lvl = STADIUM_LEVELS[career.stadiumLevel];
  const next = STADIUM_LEVELS[career.stadiumLevel + 1];
  const card = $('clubCard');
  card.innerHTML = '<b></b><p></p><small></small>';
  card.querySelector('b')!.textContent = lvl.name;
  card.querySelector('p')!.textContent = lvl.desc;
  card.querySelector('small')!.textContent = next ? `Siguiente obra: ${next.short} (${next.cost} €). Se encarga desde el portátil.` : 'Instalaciones al máximo de este prototipo.';
  $('results').replaceChildren(
    ...(career.history.length
      ? career.history
          .slice()
          .reverse()
          .map((r) => {
            const li = document.createElement('li');
            li.dataset.r = r.score[0] > r.score[1] ? 'w' : r.score[0] === r.score[1] ? 'd' : 'l';
            li.textContent = `Sem ${r.week} · ${r.score[0]}-${r.score[1]} vs ${r.rival} · ${r.fansDelta >= 0 ? '+' : ''}${r.fansDelta} afic. · ${r.moneyDelta >= 0 ? '+' : ''}${r.moneyDelta} €`;
            return li;
          })
      : [Object.assign(document.createElement('li'), { textContent: 'Aún no se ha jugado nada.' })]),
  );
}

function useHotspot(id: HotspotId) {
  if (vn.open || !$('sheet').hidden || !house) return;
  house.walkTo(id, () => act(id));
}

function act(id: HotspotId) {
  const pend = pendingScenes(career);
  const scene = pend.find((s) => s.trigger === TRIGGER_OF[id]);
  if (scene) return playScene(scene);
  switch (id) {
    case 'board':
      return openSheet('Pizarra · plan del domingo', boardSheet());
    case 'laptop':
      return openSheet('Portátil', laptopSheet('mail'));
    case 'calendar':
      return openSheet('Calendario', calendarSheet());
    case 'phone':
      return toast('Nadie llama. Ni tu madre.');
    case 'door':
      return startMatch();
  }
}

async function playScene(scene: VNScene) {
  await vn.play(scene.lines(career), weekTeams[0], career, scene.choices);
  career.seen.push(scene.id);
  refreshHouse();
}

// ── hojas (pizarra, portátil, calendario)
function openSheet(title: string, body: HTMLElement) {
  $('sheetTitle').textContent = title;
  $('sheetBody').replaceChildren(body);
  $('sheet').hidden = false;
}
function closeSheet() {
  $('sheet').hidden = true;
}
$('sheetClose').onclick = closeSheet;

function seg<T extends string | number>(values: { v: T; label: string }[], get: () => T, set: (v: T) => void) {
  const el = document.createElement('div');
  el.className = 'seg seg-sm';
  const sync = () => el.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(values[i].v === get())));
  for (const { v, label } of values) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.onclick = () => {
      set(v);
      sync();
    };
    el.append(b);
  }
  sync();
  return el;
}
function field(label: string, control: HTMLElement, hint?: string) {
  const d = document.createElement('div');
  d.className = 'field';
  const l = document.createElement('span');
  l.className = 'label';
  l.textContent = label;
  d.append(l, control);
  if (hint) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = hint;
    d.append(p);
  }
  return d;
}

function boardSheet() {
  const box = document.createElement('div');
  box.className = 'sheet-grid';
  const p = career.planned;
  const changed = () => house?.setState(career);
  box.append(
    field('Formación', seg(FORMATION_NAMES.map((f) => ({ v: f, label: f })), () => p.formation, (v) => ((p.formation = v as Formation), changed()))),
    field('Bloque', seg([{ v: 0, label: 'Bajo' }, { v: 1, label: 'Medio' }, { v: 2, label: 'Alto' }], () => p.block, (v) => ((p.block = v as Block), changed())), 'Alto: línea arriba y dos presionando. Cansa más, sobre todo en barro.'),
    field('Estilo', seg([{ v: 'short', label: 'Corto' }, { v: 'mixed', label: 'Mixto' }, { v: 'long', label: 'Directo' }], () => p.style, (v) => ((p.style = v as PassStyle), changed())), 'Con niebla o en tierra, el pase largo es una lotería.'),
  );
  const note = document.createElement('p');
  note.className = 'hint';
  note.textContent = 'Así saldrá el equipo el domingo. Durante el partido podrás cambiarlo desde el banquillo.';
  box.append(note);
  return box;
}

function laptopSheet(tab: 'mail' | 'works' | 'results') {
  const wrap = document.createElement('div');
  const tabs = document.createElement('div');
  tabs.className = 'seg seg-sm tabs';
  for (const [id, label] of [
    ['mail', 'Correo'],
    ['works', 'Instalaciones'],
    ['results', 'Resultados'],
  ] as const) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-pressed', String(id === tab));
    b.onclick = () => openSheet('Portátil', laptopSheet(id));
    tabs.append(b);
  }
  const body = document.createElement('div');
  body.className = 'sheet-grid';
  if (tab === 'mail') {
    const p = document.createElement('p');
    p.textContent = 'Bandeja vacía. Bueno, hay un correo de un príncipe que quiere invertir en el club. Lo dejamos ahí.';
    body.append(p);
  } else if (tab === 'works') {
    STADIUM_LEVELS.forEach((l, i) => {
      const card = document.createElement('div');
      card.className = 'works';
      card.dataset.state = i < career.stadiumLevel ? 'done' : i === career.stadiumLevel ? 'now' : 'next';
      card.innerHTML = '<b></b><p></p>';
      card.querySelector('b')!.textContent = `${l.name}${i === career.stadiumLevel ? ' · ahora' : i > 0 && i <= career.stadiumLevel ? ' · hecho' : ''}`;
      card.querySelector('p')!.textContent = `${l.desc} Aforo ${l.capacity}.`;
      if (i === career.stadiumLevel + 1) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'cta';
        b.textContent = `Hacer obras (${l.cost} €)`;
        b.disabled = career.money < l.cost;
        b.onclick = () => {
          if (upgradeStadium(career)) {
            toast(`¡Obras terminadas! Bienvenido al ${l.name}.`);
            refreshHouse();
            openSheet('Portátil', laptopSheet('works'));
          }
        };
        card.append(b);
        if (career.money < l.cost) {
          const s = document.createElement('small');
          s.textContent = `Faltan ${l.cost - career.money} €.`;
          card.append(s);
        }
      }
      body.append(card);
    });
  } else {
    const ol = document.createElement('ol');
    ol.className = 'results';
    for (const r of career.history) {
      const li = document.createElement('li');
      li.textContent = `Semana ${r.week}: Barriobajo ${r.score[0]}-${r.score[1]} ${r.rival}`;
      ol.append(li);
    }
    if (!career.history.length) ol.append(Object.assign(document.createElement('li'), { textContent: 'Todavía no hay partidos.' }));
    body.append(ol);
  }
  wrap.append(tabs, body);
  return wrap;
}

function calendarSheet() {
  const box = document.createElement('div');
  box.className = 'sheet-grid';
  const r = rivalOf(career);
  const [w, t] = weatherOf(career);
  const add = (k: string, v: string) => {
    const p = document.createElement('p');
    p.innerHTML = '<b></b> <span></span>';
    p.querySelector('b')!.textContent = k;
    p.querySelector('span')!.textContent = v;
    box.append(p);
  };
  add('Rival:', `${r.name}. ${r.motto}`);
  add('Pronóstico:', `${WX[w]} por la ${TX[t]}. ${WX_EFFECT[w]}`);
  add('Campo:', `${STADIUM_LEVELS[career.stadiumLevel].name}.`);
  add('Público esperado:', `${attendance(career)} personas (aforo ${STADIUM_LEVELS[career.stadiumLevel].capacity}).`);
  add('Próximas semanas:', RIVALS.slice(career.week % RIVALS.length).concat(RIVALS).slice(0, 3).map((x) => x.short).join(' · '));
  return box;
}

$('btnGoMatch').onclick = () => {
  if (mode === 'house' && !vn.open) startMatch();
};

// ═════════════════════════ PARTIDO ═════════════════════════
interface PStats {
  shots: number;
  goals: number;
  passes: number;
  tackles: number;
  fouls: number;
  saves: number;
}
let pstats: PStats[] = [];
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

function crowdPlan() {
  return {
    count: attendance(career),
    gender: career.gender,
    manolo: career.flags.manoloEnfadado ? ('sulk' as const) : career.sponsor ? ('cheer' as const) : ('normal' as const),
    presidente: true,
  };
}

function startMatch() {
  closeSheet();
  house?.dispose();
  house = null;
  $('hotspots').replaceChildren();
  mode = 'match';
  game.dataset.mode = 'match';
  const setup = matchSetup(career);
  sim = new MatchSim(setup.seed, setup.teams, setup.conditions);
  banter = new Banter();
  banter.ctx = { sponsorShout: career.sponsorShout, manolo: crowdPlan().manolo };
  renderer = new HybridRenderer();
  renderer.setStadium(career.stadiumLevel);
  renderer.setCrowd(crowdPlan());
  renderer.onThunder = () => show(banter.thunder());
  renderer.mount(stage);
  canvasFirst(stage.querySelector('canvas:last-of-type') as HTMLElement);
  renderer.setCamera(cam);
  pstats = sim.players.map(() => ({ shots: 0, goals: 0, passes: 0, tackles: 0, fouls: 0, saves: 0 }));
  $('feed').replaceChildren();
  overlay.clear();
  paused = false;
  resize();
  renderTopMatch();
  renderSquad();
  syncOrders();
  select(sim.players.find((p) => p.team === 0 && p.profile.traits.includes('goleadorNato'))?.idx ?? 9);
}

function disposeMatch() {
  renderer?.dispose();
  renderer = null;
  sim = null;
  selected = -1;
  $('fulltime').hidden = true;
  $('signalChip').hidden = true;
}

$('goHome').onclick = async () => {
  if (!sim) return;
  const score: [number, number] = [sim.score[0], sim.score[1]];
  const summary = closeWeek(career, sim);
  enterHouse();
  await vn.play(postMatchScene(career, summary, score), weekTeams[0], career);
  openSheet('Resumen de la jornada', summarySheet(summary, score));
  refreshHouse();
};

function summarySheet(s: Summary, score: [number, number]) {
  const box = document.createElement('div');
  box.className = 'sheet-grid';
  const h = document.createElement('p');
  h.className = 'big-result';
  h.textContent = `Barriobajo ${score[0]} – ${score[1]} ${career.history[career.history.length - 1].rival}`;
  box.append(h);
  for (const l of s.lines) box.append(Object.assign(document.createElement('p'), { textContent: l }));
  const k = document.createElement('p');
  k.className = 'deltas';
  k.textContent = `Aficionados ${s.fansDelta >= 0 ? '+' : ''}${s.fansDelta} · Caja ${s.moneyDelta >= 0 ? '+' : ''}${s.moneyDelta} € · Confianza ${s.trustDelta >= 0 ? '+' : ''}${s.trustDelta}`;
  box.append(k);
  return box;
}

function renderTopMatch() {
  if (!sim) return;
  const [h, a] = sim.teams.map((t) => t.profile);
  $('nameHome').textContent = h.name.toUpperCase();
  $('nameAway').textContent = a.name.toUpperCase();
  const tag = career.gender === 'f' ? 'Liga Femenina de Barrio' : 'Liga de Barrio';
  $('tagHome').textContent = tag;
  $('tagAway').textContent = tag;
  drawCrest($<HTMLCanvasElement>('crestHome'), h.kit, 'B');
  drawCrest($<HTMLCanvasElement>('crestAway'), a.kit, rivalOf(career).letter);
  $('wxText').textContent = `${WX[sim.conditions.weather]} · ${TX[sim.conditions.time]}`;
  $('wxIcon').dataset.w = sim.conditions.weather;
  $('wxIcon').dataset.t = sim.conditions.time;
  $('venue').textContent = `${STADIUM_LEVELS[career.stadiumLevel].name} · ${attendance(career)} espectadores`;
}
function updateTopMatch() {
  if (!sim) return;
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

// ── órdenes
interface Order {
  icon: string;
  label: string;
  hint: string;
  active: () => boolean;
  apply: () => void;
}
const T = () => sim!.teams[0].tactics;
const cmd = (patch: Parameters<MatchSim['command']>[0]) => sim?.command(patch);
const ORDERS: Order[] = [
  { icon: 'shield', label: 'Bloque bajo', hint: 'Línea atrás, un solo presionador', active: () => T().block === 0, apply: () => cmd({ kind: 'tactics', team: 0, patch: { block: 0 } }) },
  { icon: 'lines', label: 'Bloque medio', hint: 'Equilibrio', active: () => T().block === 1, apply: () => cmd({ kind: 'tactics', team: 0, patch: { block: 1 } }) },
  { icon: 'run', label: 'Presión alta', hint: 'Línea arriba, dos presionan', active: () => T().block === 2, apply: () => cmd({ kind: 'tactics', team: 0, patch: { block: 2 } }) },
  { icon: 'dots', label: 'Mantener posesión', hint: 'Pases cortos y seguros', active: () => T().style === 'short', apply: () => cmd({ kind: 'tactics', team: 0, patch: { style: 'short' } }) },
  { icon: 'zig', label: 'Juego mixto', hint: 'Sin preferencia', active: () => T().style === 'mixed', apply: () => cmd({ kind: 'tactics', team: 0, patch: { style: 'mixed' } }) },
  { icon: 'arrow', label: 'Buscar el pase largo', hint: 'Balón a la espalda', active: () => T().style === 'long', apply: () => cmd({ kind: 'tactics', team: 0, patch: { style: 'long' } }) },
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
  if (!sim) return;
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
      cmd({ kind: 'tactics', team: 0, patch: { formation: f as Formation } });
      setTimeout(syncOrders, 60);
    };
    return b;
  }),
);
const signalButtons = {
  press: orderItem({ icon: 'flame', label: '¡Presión total!', hint: '25 s · cansa mucho' }, () => cmd({ kind: 'signal', team: 0, signal: 'press' })).b,
  counter: orderItem({ icon: 'bolt', label: 'Contraataque', hint: 'al recuperar el balón' }, () => cmd({ kind: 'signal', team: 0, signal: 'counter' })).b,
};
$('signals').append(signalButtons.press.parentElement!, signalButtons.counter.parentElement!);
function syncSignals() {
  if (!sim) return;
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

// ── ficha
const gx = (p: SimPlayer, m: string, f: string) => (p.profile.look.gender === 'f' ? f : m);
const ROLE = (p: SimPlayer, role: string) => ({ POR: gx(p, 'Portero', 'Portera'), DEF: 'Defensa', MED: 'Centrocampista', DEL: gx(p, 'Delantero', 'Delantera') })[role] ?? role;
const surname = (p: SimPlayer) => p.profile.name.split(' ').slice(-1)[0];
function comment(p: SimPlayer): string {
  const s = pstats[p.idx];
  const t = p.profile.traits;
  if (p.sentOff) return 'Expulsado. Lo ve desde la grada, indignado con el mundo.';
  if (s.goals >= 2) return '¡Está en racha! Pide que pongan su nombre a la grada.';
  if (s.goals === 1) return t.includes('goleadorNato') ? 'Ha marcado. Ya habla de sí en tercera persona.' : 'Ha marcado y no se calla.';
  if (p.team === 0 && career.modNotes[p.slot]) return career.modNotes[p.slot];
  if (t.includes('goleadorNato') && s.shots >= 3) return `${s.shots} tiros y ningún gol. Dice que el portero tiene un pacto con alguien.`;
  if (p.fatigue > 0.6) return 'Va justo de fuerzas. Pide el cambio con la mirada.';
  if (s.fouls >= 2) return `Lleva ${s.fouls} faltas. El árbitro ya le tiene ${gx(p, 'fichado', 'fichada')}.`;
  if (s.saves >= 2) return 'Lo está parando todo.';
  if (s.tackles >= 3) return 'Está ganando todos los duelos.';
  if (s.passes >= 8) return 'Está moviendo bien el balón.';
  if (t.includes('padel')) return 'Mira mucho el reloj. Tiene pádel a las nueve.';
  if (t.includes('nervioso')) return 'Le tiemblan las piernas en cada control.';
  if (t.includes('egoista')) return 'Aún no ha dado un pase. Lo considera un logro.';
  return sim && sim.t < 20 ? 'Calentando motores.' : gx(p, 'Está metido en el partido.', 'Está metida en el partido.');
}
const tier = (v: number) => (v >= 15 ? 'hi' : v >= 10 ? 'mid' : 'lo');
function portraitOf(idx: number, size: number) {
  const c = renderer!.portrait(sim!, idx, size);
  c.className = 'portrait';
  return c;
}
function renderCard() {
  const card = $('card');
  if (!sim || selected < 0) {
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
  $('cardPortrait').replaceChildren(portraitOf(selected, 96));
  $('cardNick').textContent = `${prof.nick ? `«${prof.nick}» · ` : ''}${ROLE(p, slot.role)} · ${sim.teams[p.team].profile.name}`;
  $('cardQuirk').textContent = prof.quirk;
  const A = prof.attrs;
  const attrs: [string, number][] =
    slot.role === 'POR'
      ? [['PAR', A.keeping], ['COL', A.positioning], ['PAS', A.passing], ['VEL', A.pace], ['SAN', A.composure], ['RES', A.stamina]]
      : [['VEL', A.pace], ['PAS', A.passing], ['TIR', A.shooting], ['REG', A.dribbling], ['TRA', A.workRate], ['SAN', A.composure]];
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
  if (!sim || selected < 0) return;
  const p = sim.players[selected];
  $('cardFatigue').style.width = `${Math.round((1 - p.fatigue) * 100)}%`;
  $('cardFatigue').dataset.tier = p.fatigue < 0.3 ? 'hi' : p.fatigue < 0.6 ? 'mid' : 'lo';
  $('cardFatigueTxt').textContent = p.sentOff ? 'Expulsado' : p.fatigue < 0.25 ? 'Fresco' : p.fatigue < 0.5 ? 'Tocado' : p.fatigue < 0.7 ? 'Cansado' : 'Fundido';
  $('cardComment').textContent = comment(p);
}
document.querySelectorAll<HTMLButtonElement>('#freedom button').forEach((b) => {
  b.onclick = () => {
    if (selected < 0) return;
    cmd({ kind: 'freedom', player: selected, value: Number(b.dataset.v) as Freedom });
    document.querySelectorAll<HTMLButtonElement>('#freedom button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  };
});
function select(idx: number) {
  selected = idx;
  renderer?.setSelected(idx);
  renderCard();
  document.querySelectorAll<HTMLElement>('#squad [data-idx]').forEach((el) => el.setAttribute('aria-pressed', String(Number(el.dataset.idx) === idx)));
}
function renderSquad() {
  if (!sim) return;
  $('squad').replaceChildren(
    ...sim.players
      .filter((p) => p.team === 0)
      .map((p) => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.idx = String(p.idx);
        b.append(portraitOf(p.idx, 48));
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
  if (!sim) return;
  document.querySelectorAll<HTMLElement>('#squad [data-idx]').forEach((el) => {
    const p = sim!.players[Number(el.dataset.idx)];
    const bar = el.querySelector<HTMLElement>('.bar > i')!;
    bar.style.width = `${Math.round((1 - p.fatigue) * 100)}%`;
    bar.dataset.tier = p.fatigue < 0.3 ? 'hi' : p.fatigue < 0.6 ? 'mid' : 'lo';
    el.dataset.out = String(p.sentOff);
    el.dataset.card = p.yellows ? 'y' : '';
  });
}

// ── eventos y minimapa
function show(lines: Line[]) {
  const feed = $('feed');
  for (const l of lines) {
    if (l.feed && sim) {
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
const mini = $<HTMLCanvasElement>('minimap');
const mctx = mini.getContext('2d')!;
function drawMinimap() {
  if (!sim) return;
  const W = mini.width;
  const H = mini.height;
  const m = 6;
  const sx = (x: number) => m + (x / PITCH_L) * (W - 2 * m);
  const sy = (y: number) => m + (y / PITCH_W) * (H - 2 * m);
  mctx.fillStyle = career.stadiumLevel === 0 ? '#6b5236' : '#1d4a30';
  mctx.fillRect(0, 0, W, H);
  mctx.strokeStyle = 'rgba(233,240,226,0.7)';
  mctx.strokeRect(sx(0) + 0.5, sy(0) + 0.5, W - 2 * m - 1, H - 2 * m - 1);
  mctx.beginPath();
  mctx.moveTo(Math.round(sx(PITCH_L / 2)) + 0.5, sy(0));
  mctx.lineTo(Math.round(sx(PITCH_L / 2)) + 0.5, sy(PITCH_W));
  mctx.stroke();
  for (const g of [0, PITCH_L]) {
    const x0 = g === 0 ? sx(0) : sx(PITCH_L - BOX_D);
    mctx.strokeRect(Math.round(x0) + 0.5, Math.round(sy(PITCH_W / 2 - BOX_W / 2)) + 0.5, Math.round((BOX_D / PITCH_L) * (W - 2 * m)), Math.round((BOX_W / PITCH_W) * (H - 2 * m)));
  }
  for (const p of sim.players) {
    if (p.sentOff) continue;
    mctx.fillStyle = '#1a1226';
    mctx.fillRect(Math.round(sx(p.x)) - 2, Math.round(sy(p.y)) - 2, 5, 5);
    mctx.fillStyle = sim.kitOf(p).shirt;
    mctx.fillRect(Math.round(sx(p.x)) - 1, Math.round(sy(p.y)) - 1, 3, 3);
    if (p.idx === selected) {
      mctx.strokeStyle = '#f2c94c';
      mctx.strokeRect(Math.round(sx(p.x)) - 3.5, Math.round(sy(p.y)) - 3.5, 7, 7);
      mctx.strokeStyle = 'rgba(233,240,226,0.7)';
    }
  }
  mctx.fillStyle = '#ffffff';
  mctx.fillRect(Math.round(sx(sim.ball.x)) - 1, Math.round(sy(sim.ball.y)) - 1, 3, 3);
}

// ── controles
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
  if (!renderer) return;
  const modes = renderer.cameraModes;
  const next = modes[(modes.findIndex((m) => m.id === cam) + 1) % modes.length];
  cam = next.id;
  renderer.setCamera(cam);
  $('camTxt').textContent = next.label;
};
stage.addEventListener('pointerdown', (ev) => {
  if (mode !== 'match' || !sim || !renderer) return;
  const r = stage.getBoundingClientRect();
  const idx = overlay.pick(ev.clientX - r.left, ev.clientY - r.top, sim, renderer);
  if (idx >= 0) select(idx);
});
document.querySelectorAll<HTMLButtonElement>('#gender button').forEach((b) => {
  b.onclick = () => {
    if (vn.open) return;
    career = newCareer(b.dataset.g as Gender);
    closeSheet();
    enterHouse();
    toast(b.dataset.g === 'f' ? 'Nueva carrera en la Liga Femenina de Barrio.' : 'Nueva carrera en la Liga de Barrio.');
  };
});

// ── laboratorio (vista previa de estadio y tiempo)
function labSync() {
  const [w, t] = weatherOf(career);
  document.querySelectorAll<HTMLButtonElement>('#labLevel button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === career.stadiumLevel)));
  document.querySelectorAll<HTMLButtonElement>('#labWeather button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === w)));
  document.querySelectorAll<HTMLButtonElement>('#labTime button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === t)));
}
function labApply() {
  if (mode === 'match' && sim && renderer) {
    const [w, t] = weatherOf(career);
    sim.command({ kind: 'conditions', value: conditionsFor(w, t, STADIUM_LEVELS[career.stadiumLevel].pitch, sim.seed) });
    renderer.setStadium(career.stadiumLevel);
    renderer.setCrowd(crowdPlan());
    setTimeout(renderTopMatch, 80);
  } else refreshHouse();
  labSync();
}
document.querySelectorAll<HTMLButtonElement>('#labLevel button').forEach((b) => (b.onclick = () => ((career.stadiumLevel = Number(b.dataset.v)), labApply())));
document.querySelectorAll<HTMLButtonElement>('#labWeather button').forEach((b) => (b.onclick = () => ((career.forced = { ...career.forced, weather: b.dataset.v as Weather }), labApply())));
document.querySelectorAll<HTMLButtonElement>('#labTime button').forEach((b) => (b.onclick = () => ((career.forced = { ...career.forced, time: b.dataset.v as TimeOfDay }), labApply())));

// ═════════════════════════ BUCLE ═════════════════════════
let last = performance.now();
let fps = 60;
let slowAt = 0;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  if (mode === 'house' && house) {
    house.render(dt);
    for (const h of house.hotspots) {
      const el = hotspotEls.get(h.id);
      if (!el) continue;
      const p = house.project(h.anchor);
      el.style.transform = `translate(${p.x.toFixed(0)}px, ${p.y.toFixed(0)}px)`;
    }
  } else if (sim && renderer) {
    const running = !paused && !vn.open;
    if (running) acc += dt * speed;
    let steps = 0;
    while (acc >= sim.dt && steps < 12) {
      sim.step();
      acc -= sim.dt;
      steps++;
    }
    if (steps === 12) acc = 0;
    for (const e of sim.drainEvents()) {
      track(e);
      renderer.onEvent(e);
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
    renderer.render(sim, alpha, running ? dt * speed : 0);
    overlay.update(sim, renderer, alpha, dt, selected);
    updateTopMatch();
    drawMinimap();
  }
  if (now - slowAt > 400) {
    slowAt = now;
    if (mode === 'match') {
      syncSignals();
      liveCard();
      liveSquad();
    }
    const pf = renderer?.perf();
    $('perf').textContent = pf ? `${Math.round(fps)} fps · ${pf.drawCalls} llamadas de dibujo · ${pf.detail}` : `${Math.round(fps)} fps · casa del míster`;
  }
  requestAnimationFrame(frame);
}

enterHouse();
labSync();
requestAnimationFrame(frame);
