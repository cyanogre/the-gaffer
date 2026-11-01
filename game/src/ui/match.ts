import { Banter, type Line } from '../content/banter';
import { shortName } from '../content/names';
import { attendance, type Career } from '../game/career';
import { matchSetup, withMods } from '../game/squad';
import type { MatchOutcome } from '../game/week';
import { HybridRenderer } from '../render/hybrid/hybrid';
import type { CameraMode } from '../render/types';
import { FORMATION_NAMES } from '../sim/formations';
import { MatchSim } from '../sim/match';
import { TRAITS, traitLabel } from '../sim/traits';
import type { Block, Command, Formation, Freedom, MatchEventKind, PassStyle, SimPlayer } from '../sim/types';
import { $, h, portrait, type Sheet } from './dom';
import { Overlay } from './overlay';
import { drawCrest, iconSvg } from './pixelart';

/**
 * El domingo: el partido en el estadio 3D con el motor completo. La interfaz solo manda órdenes al
 * motor (táctica, señales, libertad, cambios) y recoge lo que pasa para cerrar la jornada.
 */
const MAX_SUBS = 5;

export class MatchScreen {
  sim: MatchSim;
  private renderer = new HybridRenderer();
  private overlay = new Overlay($('overlay'));
  private banter = new Banter();
  private speed = 1;
  paused = false;
  private acc = 0;
  private selected = -1;
  private cam: CameraMode = 'tv';
  private subsUsed = 0;
  private benchUsed = new Set<string>();
  private played = new Set<string>();
  private scorers: string[] = [];
  private counts: [Partial<Record<MatchEventKind, number>>, Partial<Record<MatchEventKind, number>>] = [{}, {}];
  private ownGoals: [number, number] = [0, 0];
  private slowAt = 0;
  onFinish: ((o: MatchOutcome) => void) | null = null;

  constructor(
    private c: Career,
    private stage: HTMLElement,
    private sheet: Sheet,
    private blocked: () => boolean,
  ) {
    const setup = matchSetup(c);
    this.sim = new MatchSim(setup.seed, setup.teams, setup.conditions);
    const manolo = c.flags.manoloEnfadado ? 'sulk' : c.sponsor ? 'cheer' : 'normal';
    this.banter.ctx = { sponsorShout: c.sponsorShout, manolo };
    this.renderer.setStadium(c.stadiumLevel);
    this.renderer.setCrowd({ count: attendance(c), gender: c.gender, manolo, presidente: c.club.id === 'barrio' });
    this.renderer.onThunder = () => this.show(this.banter.thunder());
    this.renderer.mount(stage);
    stage.insertBefore(stage.lastElementChild!, stage.firstChild);
    this.renderer.setCamera(this.cam);
    for (const p of this.sim.players) if (p.team === 0) this.played.add(p.profile.id);
    $('feed').replaceChildren();
    this.overlay.clear();
    const [hm, aw] = this.sim.teams.map((t) => t.profile);
    $('nameHome').textContent = hm.short;
    $('nameAway').textContent = aw.short;
    $('nameHome').title = hm.name;
    $('nameAway').title = aw.name;
    drawCrest($<HTMLCanvasElement>('crestHome'), hm.kit, c.club.letter);
    drawCrest($<HTMLCanvasElement>('crestAway'), aw.kit, aw.name.split(' ').slice(-1)[0][0]);
    $('fulltime').hidden = true;
    $('subsLeft').textContent = String(MAX_SUBS);
    $('speedTxt').textContent = '×1';
    $('btnPause').querySelector('b')!.textContent = 'Pausa';
    this.bindControls();
  }

  private bindControls() {
    $('btnOrders').onclick = () => this.openOrders();
    $('btnSubs').onclick = () => this.openSubs();
    $('btnSpeed').onclick = () => {
      this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 4 : 1;
      $('speedTxt').textContent = `×${this.speed}`;
    };
    $('btnCam').onclick = () => {
      const modes = this.renderer.cameraModes;
      const next = modes[(modes.findIndex((m) => m.id === this.cam) + 1) % modes.length];
      this.cam = next.id;
      this.renderer.setCamera(this.cam);
      $('camTxt').textContent = next.id === 'tv' ? 'TV' : next.id === 'tactical' ? 'Táctica' : 'Pie';
    };
    $('btnPause').onclick = () => {
      this.paused = !this.paused;
      $('btnPause').querySelector('b')!.textContent = this.paused ? 'Seguir' : 'Pausa';
      $('btnPause').setAttribute('aria-pressed', String(this.paused));
    };
    $('btnFt').onclick = () => this.onFinish?.(this.outcome());
    this.stage.onpointerdown = (ev) => {
      if (this.blocked()) return;
      const r = this.stage.getBoundingClientRect();
      const idx = this.overlay.pick(ev.clientX - r.left, ev.clientY - r.top, this.sim, this.renderer);
      if (idx >= 0) {
        this.select(idx);
        this.openPlayer(idx);
      }
    };
  }

  private cmd(c: Command) {
    this.sim.command(c);
    setTimeout(() => this.sheet.refresh(), 60);
  }

  private select(idx: number) {
    this.selected = idx;
    this.renderer.setSelected(idx);
  }

  resize(w: number, hgt: number) {
    this.renderer.resize(w, hgt);
  }

  // ───────────────────────── hojas ─────────────────────────
  private openOrders() {
    const T = () => this.sim.teams[0].tactics;
    const lv = this.c.coach.stats.tactica.lv;
    const item = (icon: string, label: string, hint: string, active: boolean, onclick: () => void, disabled = false) =>
      h('li', {}, h('button', { type: 'button', 'aria-pressed': String(active), disabled, onclick }, h('span', { html: iconSvg(icon) }), h('span', {}, h('b', { text: label }), h('small', { text: hint }))));
    this.sheet.open('orders', 'Órdenes', () => {
      const team = this.sim.teams[0];
      const sig = (kind: 'press' | 'counter') => {
        const cd = team.signalCooldown[kind] - this.sim.t;
        const active = team.signal?.kind === kind && (kind === 'press' ? team.signal.until > this.sim.t : true);
        return { cd, active };
      };
      const press = sig('press');
      const counter = sig('counter');
      return [
        h('h3', { text: 'Formación' }),
        h(
          'div',
          { class: 'seg' },
          ...FORMATION_NAMES.map((f) =>
            h('button', { type: 'button', 'aria-pressed': String(T().formation === f), onclick: () => this.cmd({ kind: 'tactics', team: 0, patch: { formation: f as Formation } }) }, f, h('small', { text: `${Math.round(this.c.familiarity[f as Formation] * 100)} %` })),
          ),
        ),
        h('h3', { text: 'Órdenes permanentes' }),
        h(
          'ul',
          { class: 'orders' },
          ...([0, 1, 2] as Block[]).map((b) =>
            item(['shield', 'lines', 'run'][b], ['Bloque bajo', 'Bloque medio', 'Presión alta'][b], ['Línea atrás, un presionador', 'Equilibrio', 'Línea arriba, dos presionan'][b], T().block === b, () => this.cmd({ kind: 'tactics', team: 0, patch: { block: b } })),
          ),
          ...(['short', 'mixed', 'long'] as PassStyle[]).map((s, i) =>
            item(['dots', 'zig', 'arrow'][i], ['Posesión', 'Juego mixto', 'Pase largo'][i], ['Pases cortos y seguros', 'Sin preferencia', 'Balón a la espalda'][i], T().style === s, () => this.cmd({ kind: 'tactics', team: 0, patch: { style: s } })),
          ),
        ),
        h('h3', { text: 'Señales (órdenes temporales)' }),
        lv >= 2
          ? h(
              'ul',
              { class: 'orders' },
              item('flame', '¡Presión total!', press.active ? 'en marcha' : press.cd > 0 ? `disponible en ${Math.ceil(press.cd)} s` : '25 s · aprietan todos, cansa', press.active, () => this.cmd({ kind: 'signal', team: 0, signal: 'press' }), (press.cd > 0 && !press.active) || this.sim.phase === 'fulltime'),
              item('bolt', 'Contraataque', counter.active ? (team.signal!.activeUntil > this.sim.t ? '¡en marcha!' : 'preparado') : counter.cd > 0 ? `disponible en ${Math.ceil(counter.cd)} s` : 'al recuperar, todos arriba', counter.active, () => this.cmd({ kind: 'signal', team: 0, signal: 'counter' }), (counter.cd > 0 && !counter.active) || this.sim.phase === 'fulltime'),
            )
          : h('p', { class: 'locked', text: `Las señales se desbloquean con Táctica 2 (tienes ${lv}). Estudia en la pizarra o entrena.` }),
        h('p', { class: 'note', text: 'Toca a un jugador en el campo para ver su ficha, darle libertad o cambiarlo.' }),
      ];
    });
  }

  private openPlayer(idx: number) {
    const p = this.sim.players[idx];
    const lv = this.c.coach.stats.tactica.lv;
    this.sheet.open('player', `#${p.profile.num} ${shortName(p.profile)}`, () => {
      const q = this.sim.players[idx];
      const A = q.profile.attrs;
      const keys: [string, number][] =
        this.sim.slotOf(q).role === 'POR'
          ? [['Paradas', A.keeping], ['Colocación', A.positioning], ['Pase', A.passing], ['Velocidad', A.pace], ['Sangre fría', A.composure], ['Resistencia', A.stamina]]
          : [['Velocidad', A.pace], ['Pase', A.passing], ['Tiro', A.shooting], ['Regate', A.dribbling], ['Trabajo', A.workRate], ['Sangre fría', A.composure]];
      const mine = q.team === 0;
      return [
        h(
          'div',
          { class: 'box' },
          h(
            'div',
            { class: 'pcard' },
            portrait(q.profile.look, this.sim.kitOf(q), q.profile.traits, q.profile.num, 96),
            h(
              'div',
              {},
              h('b', { text: q.profile.name }),
              h('p', { class: 'note', text: `${this.sim.slotOf(q).label} · ${this.sim.teams[q.team].profile.name}${q.profile.age ? ` · ${q.profile.age} años` : ''}` }),
              h('div', { class: 'row', style: 'flex-wrap:wrap;gap:4px' }, ...q.profile.traits.map((t) => h('span', { class: 'pill', title: TRAITS[t].desc, text: traitLabel(t, q.profile.look.gender) }))),
              h('div', { class: 'row', style: 'margin-top:6px' }, h('small', { class: 'note', text: 'Piernas' }), h('i', { class: 'bar' }, h('i', { style: `width:${Math.round((1 - q.fatigue) * 100)}%`, 'data-tier': q.fatigue < 0.3 ? 'hi' : q.fatigue < 0.6 ? 'mid' : 'lo' }))),
            ),
          ),
          h('dl', { class: 'attrs' }, ...keys.map(([k, v]) => h('div', {}, h('dt', { text: k }), h('dd', { 'data-tier': v >= 15 ? 'hi' : v >= 9 ? 'mid' : 'lo', text: String(Math.floor(v)) })))),
          h('p', { class: 'quirk', text: q.profile.quirk }),
        ),
        mine ? h('h3', { text: 'Libertad' }) : null,
        mine
          ? lv >= 3
            ? h(
                'div',
                { class: 'seg' },
                ...([-1, 0, 1] as Freedom[]).map((v) =>
                  h('button', { type: 'button', 'aria-pressed': String(q.freedom === v), onclick: () => this.cmd({ kind: 'freedom', player: idx, value: v }) }, ['Juega simple', 'Normal', 'Libertad'][v + 1], h('small', { text: ['pocos riesgos', '', 'regate y pase difícil'][v + 1] })),
                ),
              )
            : h('p', { class: 'locked', text: `La libertad individual se desbloquea con Táctica 3 (tienes ${lv}).` })
          : null,
        mine && !q.sentOff ? h('button', { type: 'button', class: 'btn', text: 'Cambiarlo', disabled: this.subsUsed >= MAX_SUBS || this.sim.phase === 'fulltime', onclick: () => this.openSubs(idx) }) : null,
      ];
    });
  }

  private openSubs(out = -1) {
    let chosen = out;
    this.sheet.open('subs', `Cambios · quedan ${MAX_SUBS - this.subsUsed}`, () => {
      const onPitch = this.sim.players.filter((p) => p.team === 0);
      const inIds = new Set(onPitch.map((p) => p.profile.id));
      const bench = this.c.squad.filter((p) => !inIds.has(p.id) && !this.benchUsed.has(p.id));
      const row = (p: SimPlayer) =>
        h(
          'li',
          {},
          h(
            'button',
            { type: 'button', class: 'prow', 'aria-pressed': String(chosen === p.idx), disabled: p.sentOff, onclick: () => ((chosen = p.idx), this.sheet.refresh()) },
            h('span', { class: 'slot', text: this.sim.slotOf(p).label }),
            portrait(p.profile.look, this.sim.kitOf(p), p.profile.traits, p.profile.num, 40),
            h('span', {}, h('b', { text: `#${p.profile.num} ${shortName(p.profile)}` }), h('small', { text: p.sentOff ? 'Expulsado' : p.yellows ? 'Amonestado' : p.fatigue > 0.6 ? 'Fundido' : p.fatigue > 0.35 ? 'Cansado' : 'Bien' })),
            h('i', { class: 'bar load' }, h('i', { style: `width:${Math.round((1 - p.fatigue) * 100)}%`, 'data-tier': p.fatigue < 0.3 ? 'hi' : p.fatigue < 0.6 ? 'mid' : 'lo' })),
          ),
        );
      const can = this.subsUsed < MAX_SUBS && this.sim.phase !== 'fulltime';
      return [
        h('p', { class: 'note', text: chosen >= 0 ? `Sale ${shortName(this.sim.players[chosen].profile)}. ¿Quién entra?` : 'Elige quién sale.' }),
        h('ul', { class: 'plist' }, ...onPitch.map(row)),
        h('h3', { text: 'Banquillo' }),
        bench.length
          ? h(
              'ul',
              { class: 'plist' },
              ...bench.map((b) =>
                h(
                  'li',
                  {},
                  h(
                    'button',
                    {
                      type: 'button',
                      class: 'prow',
                      disabled: !can || chosen < 0,
                      onclick: () => {
                        const prof = withMods(this.c, b);
                        this.sim.command({ kind: 'sub', player: chosen, profile: prof });
                        this.subsUsed++;
                        this.benchUsed.add(b.id);
                        this.played.add(b.id);
                        $('subsLeft').textContent = String(MAX_SUBS - this.subsUsed);
                        this.sheet.close();
                      },
                    },
                    h('span', { class: 'slot', text: b.role }),
                    portrait(b.look, b.role === 'POR' ? this.c.club.gkKit : this.c.club.kit, b.traits, b.num, 40),
                    h('span', {}, h('b', { text: `#${b.num} ${b.nick ?? b.name}` }), h('small', { text: b.quirk })),
                    h('span', { class: 'ovr', text: 'Entra' }),
                  ),
                ),
              ),
            )
          : h('p', { class: 'note', text: 'No queda nadie en el banquillo.' }),
      ];
    });
  }

  // ───────────────────────── eventos ─────────────────────────
  private show(lines: Line[]) {
    const feed = $('feed');
    for (const l of lines) {
      if (l.feed) {
        const li = h('li', { 'data-tone': l.tone ?? 'info' }, h('i'), h('time', { text: `${Math.floor(this.sim.clock / 60)}'` }), h('span', { text: l.feed }));
        feed.prepend(li);
        while (feed.children.length > 8) feed.lastElementChild!.remove();
      }
      for (const b of l.bubbles ?? []) this.overlay.say(b.idx, b.text, b.delay ?? 0);
    }
  }

  /** Pruebas: juega lo que queda del partido sin dibujar. */
  fastForward() {
    for (let i = 0; i < 40000 && this.sim.phase !== 'fulltime'; i++) {
      this.sim.step();
      for (const e of this.sim.drainEvents()) {
        if (e.team !== undefined) this.counts[e.team][e.kind] = (this.counts[e.team][e.kind] ?? 0) + 1;
        if (e.kind === 'goal' && e.a !== undefined) {
          const sc = this.sim.players[e.a];
          if (e.detail === 'og') this.ownGoals[sc.team]++;
          else if (e.team === 0) this.scorers.push(sc.profile.id);
        }
      }
    }
  }

  private outcome(): MatchOutcome {
    return { score: [this.sim.score[0], this.sim.score[1]], scorers: this.scorers, played: [...this.played], counts: this.counts, ownGoals: this.ownGoals };
  }

  frame(dt: number) {
    const sim = this.sim;
    const running = !this.paused && !this.blocked();
    if (running) this.acc += dt * this.speed;
    let steps = 0;
    while (this.acc >= sim.dt && steps < 12) {
      sim.step();
      this.acc -= sim.dt;
      steps++;
    }
    if (steps === 12) this.acc = 0;
    for (const e of sim.drainEvents()) {
      if (e.team !== undefined) this.counts[e.team][e.kind] = (this.counts[e.team][e.kind] ?? 0) + 1;
      if (e.kind === 'goal' && e.a !== undefined) {
        const scorer = sim.players[e.a];
        if (e.detail === 'og') this.ownGoals[scorer.team]++;
        else if (e.team === 0) this.scorers.push(scorer.profile.id);
        const banner = $('banner');
        banner.hidden = false;
        banner.dataset.team = String(e.team);
        $('bannerWho').textContent = e.detail === 'og' ? 'en propia puerta' : shortName(scorer.profile);
        banner.classList.remove('pop');
        void banner.offsetWidth;
        banner.classList.add('pop');
        setTimeout(() => (banner.hidden = true), 2600);
      }
      this.renderer.onEvent(e, sim);
      this.show(this.banter.onEvent(e, sim));
    }
    this.show(this.banter.ambient(sim));
    const alpha = this.acc / sim.dt;
    this.renderer.render(sim, alpha, running ? dt * this.speed : 0);
    this.overlay.update(sim, this.renderer, alpha, dt, this.selected);
    $('scoreHome').textContent = String(sim.score[0]);
    $('scoreAway').textContent = String(sim.score[1]);
    const cl = sim.clock;
    $('clock').textContent = sim.phase === 'fulltime' ? 'FINAL' : `${Math.floor(cl / 60)}:${String(Math.floor(cl % 60)).padStart(2, '0')}`;
    const s = sim.teams[0].signal;
    const chip = $('signalChip');
    if (s && s.kind === 'press' && s.until > sim.t) {
      chip.hidden = false;
      chip.textContent = `Presión total · ${Math.ceil(s.until - sim.t)} s`;
    } else if (s && s.kind === 'counter') {
      chip.hidden = false;
      chip.textContent = s.activeUntil > sim.t ? `¡Contra! · ${Math.ceil(s.activeUntil - sim.t)} s` : 'Contraataque preparado';
    } else chip.hidden = true;
    if (sim.phase === 'fulltime' && $('fulltime').hidden) {
      $('fulltime').hidden = false;
      this.sheet.close();
      $('ftScore').textContent = `${sim.teams[0].profile.name} ${sim.score[0]} – ${sim.score[1]} ${sim.teams[1].profile.name}`;
    }
    const now = performance.now();
    if (now - this.slowAt > 500) {
      this.slowAt = now;
      if (this.sheet.isOpen && (this.sheet.kind === 'orders' || this.sheet.kind === 'subs' || this.sheet.kind === 'player')) this.sheet.refresh();
    }
  }

  dispose() {
    this.overlay.clear();
    this.renderer.dispose();
    this.stage.onpointerdown = null;
    $('signalChip').hidden = true;
    $('fulltime').hidden = true;
  }
}
