import './styles.css';
import type { Gender } from './content/look';
import { ACTIONS, actionsAt, blocked, dayLabel, perform, scoutReport, type ActionDef } from './game/actions';
import { DAYS_SHORT, LOCATIONS, MATCH_DAY, SLOTS, STATS, leagueName, maxEnergy, newCareer, rivalOf, todayWeather, weatherOf, type Career, type LocationId } from './game/career';
import { loadGame, saveGame, clearGame } from './game/save';
import { FOCUS, isTrainingSlot, type Focus } from './game/squad';
import { TALKS, closeWeek, seasonEnd, teamTalk, type MatchOutcome, type Talk } from './game/week';
import { sheetStore } from './render/hybrid/billboard';
import { BarView } from './render/world/bar';
import { CampoView } from './render/world/campo';
import { CasaView } from './render/world/casa';
import { FerreteriaView } from './render/world/ferreteria';
import { World, type Location } from './render/world/location';
import { autoScene, coachCharacter, firedScene, hotspotScene, postMatchScene, seasonEndStory, type VNScene } from './story/scenes';
import { $, Sheet, card, h, portrait, toast } from './ui/dom';
import { MatchScreen } from './ui/match';
import { clubTabs, coachPanel } from './ui/panels';
import { iconSvg } from './ui/pixelart';
import { VNPlayer } from './ui/vn';

/**
 * The Gaffer: flujo del juego. Portada → prólogo (historia) → semanas (lugares con acciones,
 * historia y gestión) → domingo de partido → cierre de semana → fin de temporada.
 */
const app = $('app');
const stage = $('stage');
const sheet = new Sheet();
const vn = new VNPlayer(app);
const world = new World();
stage.insertBefore(world.canvas, stage.firstChild);

let career: Career | null = null;
let match: MatchScreen | null = null;
let busy = false;
const panelState = { slot: -1, focus: null as string | null };

document.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => (el.innerHTML = iconSvg(el.dataset.icon!)));

function screen(s: 'title' | 'world' | 'match') {
  app.dataset.screen = s;
  world.canvas.hidden = s === 'match';
}

function resize() {
  const r = stage.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width));
  const hh = Math.max(1, Math.round(r.height));
  world.resize(w, hh);
  match?.resize(w, hh);
}
new ResizeObserver(resize).observe(stage);

const save = () => career && career.status !== 'fired' && saveGame(career);

// ═════════════════════════ portada ═════════════════════════
let lookPick: Gender = 'm';
function drawTitle() {
  document.querySelectorAll<HTMLButtonElement>('#coachLook button').forEach((b) => {
    const g = b.dataset.g as Gender;
    const me = coachCharacter(g, '');
    const cv = b.querySelector('canvas')!;
    cv.getContext('2d')!.drawImage(portrait(me.look, me.clothes, [], 0, 48), 0, 0);
    b.setAttribute('aria-pressed', String(g === lookPick));
    b.onclick = () => {
      lookPick = g;
      drawTitle();
    };
  });
  $('btnContinue').hidden = !loadGame();
}
$('newGame').onsubmit = (e) => {
  e.preventDefault();
  clearGame();
  career = newCareer('m', lookPick, ($('coachName') as HTMLInputElement).value);
  enterWorld('casa');
};
$('btnContinue').onclick = () => {
  career = loadGame();
  if (career) enterWorld(career.location);
};

// ═════════════════════════ mundo ═════════════════════════
const VIEWS: Record<LocationId, () => Location> = {
  casa: () => new CasaView(),
  campo: () => new CampoView(),
  bar: () => new BarView(),
  ferreteria: () => new FerreteriaView(),
};
let loc: Location | null = null;
const hotspotEls = new Map<string, HTMLButtonElement>();

function enterWorld(where: LocationId) {
  if (!career) return;
  match?.dispose();
  match = null;
  screen('world');
  goTo(where);
}

async function goTo(where: LocationId) {
  const c = career!;
  c.location = where;
  loc = world.show(where, VIEWS[where]);
  loc.resetCoach();
  const me = coachCharacter(c.coach.gender, c.coach.name);
  loc.setCoach(me.look, me.clothes);
  refresh();
  save();
  await playAuto();
}

/** Escenas que saltan solas al llegar (una detrás de otra). */
async function playAuto() {
  const c = career!;
  for (let guard = 0; guard < 4; guard++) {
    const s = autoScene(c, c.location);
    if (!s) break;
    await playScene(s);
  }
}

async function playScene(s: VNScene) {
  const c = career!;
  busy = true;
  sheet.close();
  c.seen.push(s.id);
  await vn.play(s.lines(c), c, s.choices);
  busy = false;
  if (c.status === 'playing' && s.id === 'prologo') toast(`${leagueName(c)}: empieza tu historia.`);
  // la plantilla puede haber cambiado (el prólogo elige liga)
  loc?.setState(c);
  refresh();
  save();
}

function refresh() {
  const c = career;
  if (!c || !loc) return;
  loc.setState(c);
  const casa = loc instanceof CasaView ? loc : null;
  if (casa) {
    casa.phoneRinging = !!hotspotScene(c, 'casa', 'phone');
    casa.mailPending = !!hotspotScene(c, 'casa', 'laptop');
  }
  renderHud();
  renderHotspots();
  renderDock();
  sheet.refresh();
  // domingo: botón del partido
  const sunday = c.day >= MATCH_DAY && c.status === 'playing';
  $('btnMatch').hidden = !sunday;
  if (sunday) $('btnMatchSub').textContent = `${c.club.short} vs ${rivalOf(c).short} · ${weatherOf(c)[0] === 'clear' ? 'despejado' : WX[weatherOf(c)[0]]}`;
}

const WX: Record<string, string> = { clear: 'sol', cloudy: 'nublado', rain: 'lluvia', storm: 'tormenta', fog: 'niebla', snow: 'nieve' };

function renderHud() {
  const c = career!;
  $('hudDay').textContent = c.day >= MATCH_DAY ? 'DOM' : DAYS_SHORT[c.day];
  $('hudSlot').textContent = c.day >= MATCH_DAY ? `Partido · J${c.week}` : `${SLOTS[c.slot]} · J${c.week}`;
  const max = maxEnergy(c);
  const e = $('hudEnergy');
  e.style.width = `${Math.round((c.coach.energy / max) * 100)}%`;
  e.dataset.tier = c.coach.energy > max * 0.5 ? 'hi' : c.coach.energy > max * 0.25 ? 'mid' : 'lo';
  $('hudEnergyTxt').textContent = String(c.coach.energy);
  $('hudWallet').textContent = `${c.coach.wallet} €`;
  $('hudMoney').textContent = `${c.money} €`;
  const t = $('hudTrust');
  t.style.width = `${c.boardTrust}%`;
  t.dataset.tier = c.boardTrust >= 55 ? 'hi' : c.boardTrust >= 30 ? 'mid' : 'lo';
  const me = coachCharacter(c.coach.gender, c.coach.name);
  const cv = $('hudCoach').querySelector('canvas')!;
  const g = cv.getContext('2d')!;
  g.clearRect(0, 0, 48, 48);
  g.drawImage(portrait(me.look, me.clothes, [], 0, 48), 0, 0);
  $('placeName').textContent = c.location === 'campo' ? c.club.id === 'barrio' ? 'El Barrizal' : `Estadio del ${c.club.short}` : LOCATIONS[c.location].name;
  $('placeSub').textContent = `${dayLabel(c)} · ${WX[todayWeather(c)]}`;
}

function renderDock() {
  const c = career!;
  document.querySelectorAll<HTMLButtonElement>('#dock button').forEach((b) => {
    const id = b.dataset.loc!;
    b.setAttribute('aria-current', String(id === c.location && !(sheet.isOpen && sheet.kind === 'club')));
    if (id === 'club') b.setAttribute('aria-current', String(sheet.isOpen && sheet.kind === 'club'));
    const alert = id !== 'club' && id !== c.location && (hotspotScene(c, id as LocationId, 'phone') || autoScene(c, id as LocationId));
    b.dataset.alert = String(!!alert);
  });
}

interface HotspotUse {
  label: string;
  sub: string;
  state: 'on' | 'off' | 'story';
}
function hotspotInfo(id: string): HotspotUse {
  const c = career!;
  const scene = hotspotScene(c, c.location, id);
  if (scene) return { label: scene.badge ?? scene.title, sub: scene.title, state: 'story' };
  if (id === 'calendar') return { label: 'Calendario', sub: `J${c.week} · vs ${rivalOf(c).short}`, state: 'on' };
  const acts = ACTIONS.filter((a) => a.where === c.location && a.hotspot === id);
  if (!acts.length) {
    const idle: Record<string, string> = { phone: 'Teléfono', door: 'Puerta' };
    return { label: idle[id] ?? id, sub: 'Nada por ahora', state: 'off' };
  }
  const a = acts[0];
  const why = blocked(c, a);
  const cost = [a.energy > 0 ? `⚡${a.energy}` : a.energy < 0 ? `⚡+${-a.energy}` : '', a.wallet ? `${a.wallet} €` : '', a.trains ? `${STATS[a.trains].label}+` : ''].filter(Boolean).join(' · ');
  return { label: a.label, sub: why ?? cost, state: why ? 'off' : 'on' };
}

function renderHotspots() {
  const host = $('hotspots');
  host.replaceChildren();
  hotspotEls.clear();
  if (!loc) return;
  for (const hs of loc.hotspots) {
    const info = hotspotInfo(hs.id);
    // objetos sin nada que hacer ni historia: sin etiqueta (menos ruido en pantalla)
    if (info.state === 'off' && info.sub === 'Nada por ahora') continue;
    const b = h('button', { type: 'button', class: 'hotspot', 'data-state': info.state, onclick: () => useHotspot(hs.id) }, h('b', { text: info.label }), h('small', { text: info.sub }));
    host.append(b);
    hotspotEls.set(hs.id, b);
  }
}

async function useHotspot(id: string) {
  const c = career!;
  if (busy || vn.open || !loc) return;
  const scene = hotspotScene(c, c.location, id);
  if (scene) {
    busy = true;
    loc.walkTo(id, async () => {
      await playScene(scene);
    });
    return;
  }
  if (id === 'calendar') return openClub('liga');
  const acts = ACTIONS.filter((a) => a.where === c.location && a.hotspot === id);
  if (!acts.length) return toast(id === 'door' ? 'No hay nadie en la puerta.' : id === 'phone' ? 'El teléfono no suena. Mejor.' : 'Nada que hacer aquí ahora.');
  const a = acts[0];
  const why = blocked(c, a);
  if (why) return toast(why);
  let arg: string | undefined;
  if (a.needs === 'focus') {
    const foci = Object.keys(FOCUS) as Focus[];
    const i = await card(
      'Entrenamiento',
      [`¿En qué trabajáis hoy? Tu táctica (nivel ${c.coach.stats.tactica.lv}) multiplica lo que aprenden.${Object.keys(c.absent).length ? ' Hay ausencias.' : ''}`],
      { choices: foci.map((f) => ({ label: FOCUS[f].label, small: FOCUS[f].desc })) },
    );
    if (i < 0) return;
    arg = foci[i];
  }
  if (a.needs === 'player') {
    const options = c.squad.filter((p) => !c.weekDone[`invitar:${p.id}`]);
    const i = await card('¿A quién invitas?', ['Una charla a solas cambia cómo juega el domingo (si sale bien). Cada carácter se convence a su manera.'], {
      choices: options.map((p) => ({ label: `#${p.num} ${p.nick ?? p.name}`, small: p.traits.length ? p.traits.join(', ').replace('goleadorNato', 'goleador nato').replace('lenero', 'leñero').replace('piscinero', 'piscinero') : 'sin manías conocidas' })),
    });
    if (i < 0) return;
    arg = options[i].id;
  }
  busy = true;
  loc.walkTo(id, async () => {
    const out = perform(c, a, arg);
    if (a.id === 'entrenar' && loc instanceof CampoView) loc.drill(7);
    refresh();
    save();
    await card(out.title, out.lines, { tone: out.tone });
    busy = false;
    if (out.dayEnded) await newDay();
    refresh();
  });
}

async function newDay() {
  const c = career!;
  if (c.location !== 'casa') {
    await goTo('casa');
  } else refresh();
  if (c.day >= MATCH_DAY) toast('¡Domingo de partido! Revisa el once en «Club» y dale a «¡A jugar!».', 4200);
  else toast(`Nuevo día: ${dayLabel(c)}${isTrainingSlot({ ...c, slot: 1 }) ? ' · hoy toca entreno por la tarde' : ''}.`, 3200);
  await playAuto();
}

// ── dock
document.querySelectorAll<HTMLButtonElement>('#dock button').forEach((b) => {
  b.onclick = () => {
    if (!career || busy || vn.open) return;
    const id = b.dataset.loc!;
    if (id === 'club') return sheet.isOpen && sheet.kind === 'club' ? sheet.close() : openClub();
    sheet.close();
    if (id !== career.location) goTo(id as LocationId);
  };
});
$('hudCoach').onclick = () => {
  if (!career) return;
  sheet.open('coach', 'Míster', () => coachPanel(career!));
};
function openClub(tab?: string) {
  sheet.open('club', career!.club.name, clubTabs({ career: () => career!, changed: () => (sheet.refresh(), save(), refresh()) }, panelState), tab);
  sheet.onClose = () => renderDock();
  renderDock();
}

// ═════════════════════════ domingo ═════════════════════════
$('btnMatch').onclick = async () => {
  const c = career!;
  if (busy) return;
  sheet.close();
  if (!c.talkDone) {
    const talks = Object.keys(TALKS) as Talk[];
    const i = await card(
      `Vestuario · vs ${rivalOf(c).name}`,
      [...scoutReport(c), `Tu labia (nivel ${c.coach.stats.labia.lv}) decide cuánto les llega la arenga.`],
      { choices: talks.map((t) => ({ label: TALKS[t].label, small: TALKS[t].line })) },
    );
    if (i < 0) return;
    const lines = teamTalk(c, talks[i]);
    save();
    await card('La arenga', lines, { ok: '¡Al campo!' });
  }
  startMatch();
};

function startMatch() {
  const c = career!;
  sheet.close();
  screen('match');
  match = new MatchScreen(c, stage, sheet, () => vn.open || !$('result').hidden);
  match.onFinish = (o) => finishMatch(o);
  resize();
}

async function finishMatch(o: MatchOutcome) {
  const c = career!;
  match?.dispose();
  match = null;
  const summary = closeWeek(c, o);
  save();
  screen('world');
  await goTo('casa');
  busy = true;
  if (c.club.id === 'barrio') await vn.play(postMatchScene(c, summary, o.score), c);
  await card(`${summary.result === 'win' ? 'Victoria' : summary.result === 'draw' ? 'Empate' : 'Derrota'} · ${o.score[0]}–${o.score[1]}`, summary.lines, { tone: summary.result === 'win' ? 'good' : summary.result === 'loss' ? 'bad' : 'info' });
  const paper = h('div', { class: 'paper' }, h('p', { class: 'mast', text: 'EL ECO DEL BARRIO' }), h('p', { class: 'head', text: summary.headline }), h('p', { text: summary.sub }));
  await card('Lunes por la mañana', [paper], { ok: 'A por la semana', className: 'paper-card' });
  busy = false;
  if (c.status === 'fired') {
    await vn.play(firedScene(c), c);
    clearGame();
    career = null;
    drawTitle();
    screen('title');
    return;
  }
  if (c.status === 'seasonEnd') {
    const se = seasonEnd(c);
    const story = seasonEndStory(c, se);
    await vn.play(story.lines, c, story.choices);
    world.forget('campo');
    await goTo('casa');
  }
  refresh();
  save();
  await playAuto();
}

/** Coloca las etiquetas sobre sus objetos; si dos se pisan, la de abajo baja hasta dejar de pisarla. */
function placeLabels(l: Location) {
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const items = l.hotspots
    .map((hs) => ({ el: hotspotEls.get(hs.id), p: l.project(hs.anchor) }))
    .filter((i): i is { el: HTMLButtonElement; p: { x: number; y: number; visible: boolean } } => !!i.el)
    .sort((a, b) => a.p.y - b.p.y);
  for (const { el, p } of items) {
    el.hidden = !p.visible;
    const w = el.offsetWidth;
    const hh = el.offsetHeight + 6;
    let y = p.y;
    for (let k = 0; k < 8; k++) {
      // la etiqueta ocupa [y - alto, y]
      const hit = placed.find((r) => Math.abs(r.x - p.x) < (r.w + w) / 2 + 2 && y - hh < r.y && y > r.y - r.h);
      if (!hit) break;
      y = hit.y + hh;
    }
    placed.push({ x: p.x, y, w, h: hh });
    // que no se salga de la pantalla
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const x = Math.max(w / 2 + 4, Math.min(W - w / 2 - 4, p.x));
    y = Math.max(hh + 60, Math.min(H - 110, y));
    el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
  }
}

// ═════════════════════════ bucle ═════════════════════════
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (app.dataset.screen === 'match' && match) match.frame(dt);
  else if (loc) {
    world.render(dt);
    if (app.dataset.screen === 'world') placeLabels(loc);
  }
  requestAnimationFrame(frame);
}

// arranque: hojas de sprites, portada con la casa de fondo
sheetStore.load().then(() => {
  drawTitle();
  loc = world.show('casa', VIEWS.casa);
  const tmp = newCareer('m', 'm', '', 1);
  loc.setState(tmp);
  resize();
  requestAnimationFrame(frame);
});

// para depurar y para las pruebas automáticas
(window as unknown as { gaffer: unknown }).gaffer = {
  get career() {
    return career;
  },
  actions: () => (career ? actionsAt(career.location).map((a: ActionDef) => [a.id, blocked(career!, a)]) : []),
  sheet,
  get match() {
    return match;
  },
};
