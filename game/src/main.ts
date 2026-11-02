import './styles.css';
import type { Gender } from './content/look';
import { ACTIONS, actionsAt, blocked, dayLabel, perform, scoutReport, type ActionDef } from './game/actions';
import { DAYS_SHORT, LOCATIONS, MATCH_DAY, SLOTS, STATS, dailyDecay, leagueName, levelOf, type StatId, maxEnergy, newCareer, rivalOf, todayWeather, weatherOf, type Career, type LocationId, type SquadPlayer } from './game/career';
import { talkTopic } from './game/morale';
import { playKeys } from './ui/llaves';
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
import { $, Sheet, card, crisp, h, portrait, toast } from './ui/dom';
import { MatchScreen } from './ui/match';
import { clubTabs, coachPanel } from './ui/panels';
import { iconSvg } from './ui/pixelart';
import { Guide } from './ui/guide';
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
const guide = new Guide(app, () => career, (id) => hotspotEls.get(id));
guide.onChange = () => {
  save();
  refresh();
};
sheet.onTab = (id) => guide.notify({ kind: 'tab', id });
guide.onHintDone = () => {
  if (match?.paused) {
    match.paused = false;
    $('btnPause').querySelector('b')!.textContent = 'Pausa';
  }
};
sheet.onAnyClose = () => guide.notify({ kind: 'close' });

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
  // al girar el móvil o estrechar la ventana, las etiquetas pasan a compactas (o al revés)
  if (career && $('hotspots').classList.contains('compact') !== compactLabels()) renderHotspots();
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
    cv.getContext('2d')!.clearRect(0, 0, 48, 48);
    cv.getContext('2d')!.drawImage(portrait(me.look, me.clothes, [], 0, 48), 0, 0);
    crisp(cv, 72);
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
/** Líneas que unen cada etiqueta apartada con su objeto. */
const SVG = 'http://www.w3.org/2000/svg';
const labelLines = document.createElementNS(SVG, 'svg');
labelLines.setAttribute('class', 'hotspot-lines');
const stemEls = new Map<string, SVGLineElement>();

function enterWorld(where: LocationId) {
  if (!career) return;
  match?.dispose();
  match = null;
  screen('world');
  goTo(where);
}

let shownLoc: LocationId | null = null;
async function goTo(where: LocationId) {
  const c = career!;
  c.location = where;
  shownLoc = where;
  loc = world.show(where, VIEWS[where]);
  loc.resetCoach();
  const me = coachCharacter(c.coach.gender, c.coach.name);
  loc.setCoach(me.look, me.clothes);
  refresh();
  save();
  guide.notify({ kind: 'location', id: where });
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
  // la plantilla puede haber cambiado (el prólogo elige liga)
  loc?.setState(c);
  refresh();
  save();
  guide.notify({ kind: 'scene', id: s.id });
  if (c.status === 'playing' && s.id === 'prologo') {
    toast(`${leagueName(c)}: empieza tu historia.`);
    // la temporada arranca el domingo de la jornada 1: al campo, que el estreno es hoy
    await goTo(c.location);
  }
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
  if (sunday && !c.flags.hintSunday && c.guide < 0) {
    c.flags.hintSunday = true;
    guide.showHint('¡Domingo de partido! Si quieres, revisa el once en «Club». Cuando estés, pulsa «¡A jugar!»: primero la charla en el vestuario y luego, al campo.', '#btnMatch');
  }
  if (sunday) $('btnMatchSub').textContent = `${c.club.short} vs ${rivalOf(c).short} · ${weatherOf(c)[0] === 'clear' ? 'despejado' : WX[weatherOf(c)[0]]}`;
}

const WX: Record<string, string> = { clear: 'sol', cloudy: 'nublado', rain: 'lluvia', storm: 'tormenta', fog: 'niebla', snow: 'nieve' };

function renderHud() {
  const c = career!;
  $('hudDay').textContent = c.day >= MATCH_DAY ? 'DOM' : DAYS_SHORT[c.day];
  $('hudSlot').textContent = c.day >= MATCH_DAY ? `Partido · J${c.week}` : `${SLOTS[c.slot]} · J${c.week}`;
  paintMeters(snapshot(c));
  $('hudMoney').textContent = `${c.money} €`;
  const t = $('hudTrust');
  t.style.width = `${c.boardTrust}%`;
  t.dataset.tier = c.boardTrust >= 55 ? 'hi' : c.boardTrust >= 30 ? 'mid' : 'lo';
  // aviso en el retrato: alguna estadística pierde nivel esta noche si no la trabajas
  const atRisk = (Object.keys(c.coach.stats) as (keyof typeof c.coach.stats)[]).some((id) => {
    const s = c.coach.stats[id];
    return s.lv > 1 && !c.dayDone[`trained:${id}`] && s.value - (s.lv - 1) * 10 < dailyDecay(s.value) + 0.01;
  });
  $('hudCoach').dataset.warn = String(atRisk && c.day < MATCH_DAY);
  $('hudCoach').title = atRisk ? 'Ficha del míster · ¡una estadística pierde nivel esta noche!' : 'Ficha del míster';
  const me = coachCharacter(c.coach.gender, c.coach.name);
  const cv = $('hudCoach').querySelector('canvas')!;
  const g = cv.getContext('2d')!;
  g.clearRect(0, 0, 48, 48);
  g.drawImage(portrait(me.look, me.clothes, [], 0, 48), 0, 0);
  crisp(cv, 40);
  $('placeName').textContent = c.location === 'campo' ? c.club.id === 'barrio' ? 'El Barrizal' : `Estadio del ${c.club.short}` : LOCATIONS[c.location].name;
  $('placeSub').textContent = `${dayLabel(c)} · ${WX[todayWeather(c)]}`;
}

// ── necesidades y estadísticas del míster (como en Punch Club): barras que se llenan y puntos
interface Meters {
  energy: number;
  max: number;
  food: number;
  mood: number;
  wallet: number;
  stats: Record<StatId, number>;
}
function snapshot(c: Career): Meters {
  const stats = {} as Record<StatId, number>;
  for (const id of Object.keys(c.coach.stats) as StatId[]) stats[id] = c.coach.stats[id].value;
  return { energy: c.coach.energy, max: maxEnergy(c), food: c.coach.food, mood: c.coach.mood, wallet: c.coach.wallet, stats };
}
const shownPoints: Partial<Record<StatId, number>> = {};
function paintMeters(m: Meters) {
  const bar = (id: string, v: number, max = 100) => {
    const e = $(id);
    e.style.width = `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
    e.dataset.tier = v > max * 0.5 ? 'hi' : v > max * 0.25 ? 'mid' : 'lo';
  };
  bar('hudEnergy', m.energy, m.max);
  bar('hudFood', m.food);
  bar('hudMood', m.mood);
  $('hudEnergy').parentElement!.parentElement!.title = `Energía ${Math.round(m.energy)}/${m.max}`;
  $('hudFood').parentElement!.parentElement!.title = `Comida ${Math.round(m.food)}/100${m.food <= 5 ? ' · ¡con hambre no puedes entrenar ni trabajar!' : ''}`;
  $('hudMood').parentElement!.parentElement!.title = `Ánimo ${Math.round(m.mood)}/100${m.mood < 50 ? ' · de bajón: entrenar rinde la mitad' : ''}`;
  $('hudWallet').textContent = `${Math.round(m.wallet)} €`;
  for (const id of Object.keys(m.stats) as StatId[]) {
    const v = m.stats[id];
    const pts = levelOf(v);
    const el = document.querySelector<HTMLElement>(`.hs[data-stat=${id}]`)!;
    el.querySelector('b')!.textContent = String(pts);
    (el.querySelector('.bar > i') as HTMLElement).style.width = `${Math.round((v - (pts - 1) * 10) * 10)}%`;
    const before = shownPoints[id];
    if (before !== undefined && pts !== before) {
      el.dataset.up = String(pts > before);
      el.dataset.down = String(pts < before);
      setTimeout(() => {
        el.dataset.up = 'false';
        el.dataset.down = 'false';
      }, 900);
      if (pts > before) toast(`¡+1 punto de ${STATS[id].label}!`);
    }
    shownPoints[id] = pts;
  }
}

/**
 * La actividad se ve mientras pasa: el míster la hace en el escenario y las barras van subiendo (o
 * bajando) de lo que había a lo que queda. Tocar la pantalla la acaba antes.
 */
function playActivity(id: string, from: Meters, to: Meters, seconds: number) {
  return new Promise<void>((resolve) => {
    loc?.startActivity(id, seconds);
    const skip = h('div', { class: 'skip-layer', title: 'Toca para terminar' });
    app.append(skip);
    $('hudTime').hidden = false;
    const t0 = performance.now();
    let end = seconds * 1000;
    skip.onclick = () => (end = 0);
    const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
    const step = () => {
      const k = Math.min(1, end <= 0 ? 1 : (performance.now() - t0) / end);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const stats = {} as Record<StatId, number>;
      for (const s of Object.keys(to.stats) as StatId[]) stats[s] = lerp(from.stats[s], to.stats[s], e);
      paintMeters({ energy: lerp(from.energy, to.energy, e), max: to.max, food: lerp(from.food, to.food, e), mood: lerp(from.mood, to.mood, e), wallet: lerp(from.wallet, to.wallet, e), stats });
      ($('hudTime').firstElementChild as HTMLElement).style.width = `${k * 100}%`;
      if (k < 1) requestAnimationFrame(step);
      else {
        skip.remove();
        $('hudTime').hidden = true;
        loc?.stopActivity();
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}
/** Lo que dura cada actividad en pantalla (segundos). */
const ACT_SECONDS: Record<string, number> = { comer: 1.4, bocata: 1.6, dormir: 2.4, descansar: 2.2, correr: 3.6, entrenar: 3.6 };

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
/** Móvil (estrecho en vertical o bajo en horizontal): etiquetas compactas y con el nombre corto. */
const compactLabels = () => stage.clientWidth < 600 || stage.clientHeight < 500;

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
  return { label: (compactLabels() && a.short) || a.label, sub: why ?? cost, state: why ? 'off' : 'on' };
}

function renderHotspots() {
  const host = $('hotspots');
  labelLines.replaceChildren();
  host.replaceChildren(labelLines);
  hotspotEls.clear();
  stemEls.clear();
  host.classList.toggle('compact', compactLabels());
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
      choices: options.map((p) => ({ label: `#${p.num} ${p.name}`, small: p.traits.length ? p.traits.join(', ').replace('goleadorNato', 'goleador nato').replace('lenero', 'leñero').replace('piscinero', 'piscinero') : 'sin manías conocidas' })),
    });
    if (i < 0) return;
    arg = options[i].id;
  }
  busy = true;
  loc.walkTo(id, async () => {
    // turno en la ferretería: el sueldo sale del minijuego de copiar llaves
    if (a.needs === 'llaves') {
      const k = await playKeys(app);
      arg = `${k.perfect},${k.good},${k.ruined}`;
    }
    const from = snapshot(c);
    const out = perform(c, a, arg);
    const to = snapshot(c);
    if (a.id === 'entrenar' && loc instanceof CampoView) loc.drill(7);
    await playActivity(a.id, from, to, ACT_SECONDS[a.id] ?? 2.8);
    refresh();
    save();
    await card(out.title, out.lines, { tone: out.tone });
    busy = false;
    guide.notify({ kind: 'action', id: a.id });
    if (out.dayEnded) await newDay();
    refresh();
  });
}

async function newDay() {
  const c = career!;
  // al acabar el día se vuelve a casa: la escena tiene que cambiar aunque el estado ya diga «casa»
  if (shownLoc !== 'casa') await goTo('casa');
  else refresh();
  if (c.dayNotes.length) await card('Al despertarte', c.dayNotes, { tone: 'bad' });
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
  // hablar con un jugador: te cuenta lo que le pasa y eliges qué contestar (escena con su retrato)
  const talk = async (p: SquadPlayer) => {
    const c = career!;
    const idx = c.squad.indexOf(p);
    const t = talkTopic(c, p);
    sheet.close();
    busy = true;
    const replies = t.replies.map((r) => ({
      text: r.text,
      pick: (cc: typeof c) => {
        const a = r.pick(cc);
        return [{ who: 'jugador' as const, idx, expr: a.expr, text: a.text }];
      },
    }));
    await vn.play([{ who: 'jugador', idx, expr: t.expr, text: t.opener }], c, replies);
    busy = false;
    save();
    openClub('plantilla');
  };
  sheet.open('club', career!.club.name, clubTabs({ career: () => career!, changed: () => (sheet.refresh(), save(), refresh()), talk, notify: (e) => guide.notify(e) }, panelState), tab);
  sheet.onClose = () => renderDock();
  renderDock();
  guide.notify({ kind: 'sheet', id: 'club' });
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
  guide.notify({ kind: 'match' });
  if (!c.flags.hintMatch) {
    c.flags.hintMatch = true;
    guide.showHint('El partido se juega solo, pero tú mandas: «Órdenes» cambia la táctica en vivo y «Cambios» mete a los del banquillo. Toca a un jugador para ver su ficha.', '#btnOrders');
    match.paused = true;
    $('btnPause').querySelector('b')!.textContent = 'Seguir';
  }
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
  // apodos ganados en el partido: el apodo, en color
  const nickLines = summary.nicknames.map((n) => h('span', {}, `Desde hoy, en el barrio a ${n.name} ${c.gender === 'f' ? 'la' : 'le'} llaman `, h('span', { class: 'apodo', text: `«${n.nick}»` }), ` (${n.why}).`));
  await card(`${summary.result === 'win' ? 'Victoria' : summary.result === 'draw' ? 'Empate' : 'Derrota'} · ${o.score[0]}–${o.score[1]}`, [...summary.lines, ...nickLines], { tone: summary.result === 'win' ? 'good' : summary.result === 'loss' ? 'bad' : 'info' });
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
  guide.notify({ kind: 'matchEnd' });
  await playAuto();
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/**
 * Coloca las etiquetas sobre sus objetos sin que se pisen entre ellas ni con la barra de arriba, el
 * cartel del sitio, el botón del partido o el dock. Cada una prueba primero su sitio (justo encima
 * del objeto) y, si choca, los huecos de alrededor, de más cerca a más lejos; si acaba apartada, una
 * línea la une con su objeto. Primero se colocan las de historia, luego las que se pueden usar y al
 * final las que no. Mismo resultado cada fotograma: no bailan.
 */
function placeLabels(l: Location) {
  const W = stage.clientWidth;
  const H = stage.clientHeight;
  const sr = stage.getBoundingClientRect();
  const blocks: Box[] = [];
  for (const id of ['hud', 'hudStats', 'hudTime', 'placeTag', 'btnMatch', 'dock']) {
    const e = document.getElementById(id);
    if (!e || e.hidden || !e.offsetParent) continue;
    const r = e.getBoundingClientRect();
    if (r.width && r.height) blocks.push({ x0: r.left - sr.left - 3, y0: r.top - sr.top - 3, x1: r.right - sr.left + 3, y1: r.bottom - sr.top + 3 });
  }
  const rank = (el: HTMLElement) => ({ story: 0, on: 1, off: 2 })[el.dataset.state as 'story' | 'on' | 'off'] ?? 1;
  const items = l.hotspots
    .map((hs) => ({ id: hs.id, el: hotspotEls.get(hs.id), p: l.project(hs.anchor) }))
    .filter((i): i is { id: string; el: HTMLButtonElement; p: { x: number; y: number; visible: boolean } } => !!i.el)
    .sort((a, b) => rank(a.el) - rank(b.el) || a.p.y - b.p.y);
  const placed: Box[] = [];
  const tip = 8; // el piquito de debajo de la etiqueta
  for (const { id, el, p } of items) {
    el.hidden = !p.visible;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    // la etiqueta pegada a su objeto (dentro de la pantalla)
    const ax = Math.max(w / 2 + 4, Math.min(W - w / 2 - 4, p.x));
    const ay = Math.max(h + 4, Math.min(H - tip - 4, p.y));
    let best = { x: ax, y: ay, cost: Infinity };
    const sy = h + 6;
    const sx = w / 2 + 6;
    const cands: [number, number][] = [];
    for (const dy of [0, -1, 1, -2, 2, -3, 3, -4, 4]) for (const dx of [0, -1, 1, -2, 2]) cands.push([dx * sx, dy * sy]);
    // de más cerca a más lejos (moverse en vertical se nota menos que en horizontal)
    cands.sort((a, b) => Math.hypot(a[0] * 1.3, a[1]) - Math.hypot(b[0] * 1.3, b[1]));
    for (const [dx, dy] of cands) {
      const x = ax + dx;
      const y = ay + dy;
      const box = { x0: x - w / 2 - 2, y0: y - h - 2, x1: x + w / 2 + 2, y1: y + 2 };
      if (box.x0 < 2 || box.x1 > W - 2 || box.y0 < 2 || box.y1 > H - 2) continue;
      let hit = 0;
      for (const r of placed) hit += overlap(box, r);
      for (const r of blocks) hit += overlap(box, r);
      const cost = hit * 50 + Math.hypot(dx, dy);
      if (cost < best.cost) best = { x, y, cost };
      if (!hit) break;
    }
    placed.push({ x0: best.x - w / 2 - 2, y0: best.y - h - 2, x1: best.x + w / 2 + 2, y1: best.y + tip });
    el.style.transform = `translate(${best.x.toFixed(0)}px, ${best.y.toFixed(0)}px)`;
    // apartada de su objeto: sin piquito y con una línea hasta él
    const moved = Math.hypot(best.x - p.x, best.y - p.y) > 10 && p.visible;
    el.classList.toggle('moved', moved);
    let line = stemEls.get(id);
    if (moved) {
      if (!line) {
        line = document.createElementNS(SVG, 'line');
        labelLines.append(line);
        stemEls.set(id, line);
      }
      const below = best.y - h / 2 > p.y;
      line.setAttribute('x1', best.x.toFixed(0));
      line.setAttribute('y1', (below ? best.y - h : best.y).toFixed(0));
      line.setAttribute('x2', p.x.toFixed(0));
      line.setAttribute('y2', p.y.toFixed(0));
      line.style.display = el.hidden ? 'none' : '';
    } else if (line) line.style.display = 'none';
  }
}

// ═════════════════════════ bucle ═════════════════════════
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  guide.frame(vn.open || !$('result').hidden || app.dataset.screen === 'title' || busy);
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
  /** Fotograma actual de cada personaje del sitio (pruebas de animación). */
  walkers: () => ((loc as unknown as { walkers?: { bb: { shown: string } }[] })?.walkers ?? []).map((w) => w.bb.shown),
};
