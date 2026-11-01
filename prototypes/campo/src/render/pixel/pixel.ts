import { shade } from '../../content/look';
import { SPONSORS } from '../../content/sponsors';
import {
  BOX_D,
  BOX_W,
  CENTER_R,
  GOAL_Y0,
  GOAL_Y1,
  PENALTY_D,
  PITCH_L,
  PITCH_W,
  SIX_D,
  SIX_W,
  clamp,
} from '../../sim/geometry';
import type { MatchSim } from '../../sim/match';
import { Rng } from '../../sim/rng';
import type { MatchEvent } from '../../sim/types';
import { AnimTracker } from '../anim';
import type { CameraMode, MatchRenderer, PerfInfo, ScreenPoint } from '../types';
import { buildSprites, pixelPortrait, type FrameId, type SpriteSet } from './sprites';

const PPM = 6; // píxeles por metro
const MX = 6;
const MY = 10;
const WORLD_W = (PITCH_L + MX * 2) * PPM;
const WORLD_H = (PITCH_W + MY * 2) * PPM;
const wx = (x: number) => (x + MX) * PPM;
const wy = (y: number) => (y + MY) * PPM;

interface Fan {
  x: number;
  y: number;
  skin: string;
  shirt: string;
  side: 0 | 1;
}

/**
 * Prototipo 1 · Pixel art 2D sobre Canvas 2D, resolución interna baja y escalado entero.
 * En producción iría sobre PixiJS por rendimiento con muchos efectos; para comparar basta Canvas.
 */
export class PixelRenderer implements MatchRenderer {
  readonly id = 'pixel' as const;
  readonly cameraModes = [
    { id: 'tv' as CameraMode, label: 'Cerca' },
    { id: 'tactical' as CameraMode, label: 'Campo entero' },
  ];
  readonly headHeight = 3.7;
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private pitch = document.createElement('canvas');
  private crowd: [HTMLCanvasElement, HTMLCanvasElement] = [document.createElement('canvas'), document.createElement('canvas')];
  private sprites: SpriteSet[] = [];
  private ballFrames: HTMLCanvasElement[] = [];
  private anim = new AnimTracker();
  private mode: CameraMode = 'tv';
  private scale = 3;
  private camX = 0;
  private camY = 0;
  private shake = 0;
  private excitement = 0;
  private flip: boolean[] = [];
  private selected = -1;
  private drawCalls = 0;
  private cssW = 0;
  private cssH = 0;
  private built = false;

  mount(host: HTMLElement) {
    this.canvas.className = 'stage-canvas pixelated';
    host.appendChild(this.canvas);
    this.buildPitch();
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    fonts?.load('8px Silkscreen').then(() => this.buildPitch()).catch(() => {});
  }

  private ensureSprites(sim: MatchSim) {
    if (this.built) return;
    this.sprites = sim.players.map((p) => buildSprites(p.profile.look, sim.kitOf(p)));
    this.buildCrowd(sim);
    this.ballFrames = [0, 1, 2, 3].map((f) => {
      const c = document.createElement('canvas');
      c.width = c.height = 5;
      const x = c.getContext('2d')!;
      x.fillStyle = '#1b1420';
      x.fillRect(1, 0, 3, 5);
      x.fillRect(0, 1, 5, 3);
      x.fillStyle = '#ffffff';
      x.fillRect(1, 1, 3, 3);
      x.fillStyle = '#3a3a48';
      x.fillRect(1 + (f % 2), 1 + (f >> 1), 1, 1);
      return c;
    });
    this.built = true;
  }

  private buildPitch() {
    const c = this.pitch;
    c.width = WORLD_W;
    c.height = WORLD_H;
    const g = c.getContext('2d')!;
    const rng = new Rng(42);
    g.fillStyle = '#5b5f6b';
    g.fillRect(0, 0, WORLD_W, WORLD_H);
    // gradas: escalones
    for (let y = 0; y < wy(-2.6); y += 5) {
      g.fillStyle = y % 10 === 0 ? '#6b707c' : '#5f6370';
      g.fillRect(0, y, WORLD_W, 5);
    }
    for (let y = wy(PITCH_W + 2.6); y < WORLD_H; y += 5) {
      g.fillStyle = y % 10 === 0 ? '#6b707c' : '#5f6370';
      g.fillRect(0, y, WORLD_W, 5);
    }
    // pista y césped exterior
    g.fillStyle = '#3f7a39';
    g.fillRect(0, wy(-2.6), WORLD_W, (PITCH_W + 5.2) * PPM);
    // franjas del césped
    for (let i = 0; i < 12; i++) {
      g.fillStyle = i % 2 ? '#4a9646' : '#438c40';
      const x0 = wx((PITCH_L / 12) * i);
      g.fillRect(x0, wy(-1.2), (PITCH_L / 12) * PPM + 1, (PITCH_W + 2.4) * PPM);
    }
    // ruido de hierba
    for (let i = 0; i < 2200; i++) {
      const x = Math.floor(rng.range(wx(-1), wx(PITCH_L + 1)));
      const y = Math.floor(rng.range(wy(-1), wy(PITCH_W + 1)));
      g.fillStyle = rng.chance(0.5) ? '#3b8037' : '#56a552';
      g.fillRect(x, y, 1, 1);
    }
    // líneas
    g.fillStyle = '#eef3e2';
    const hline = (x0: number, x1: number, y: number) => g.fillRect(Math.round(wx(x0)), Math.round(wy(y)), Math.round((x1 - x0) * PPM) + 1, 1);
    const vline = (x: number, y0: number, y1: number) => g.fillRect(Math.round(wx(x)), Math.round(wy(y0)), 1, Math.round((y1 - y0) * PPM) + 1);
    const circle = (cx: number, cy: number, r: number, from = 0, to = Math.PI * 2) => {
      const n = Math.ceil(r * PPM * 7);
      for (let i = 0; i <= n; i++) {
        const a = from + ((to - from) * i) / n;
        g.fillRect(Math.round(wx(cx + Math.cos(a) * r)), Math.round(wy(cy + Math.sin(a) * r)), 1, 1);
      }
    };
    hline(0, PITCH_L, 0);
    hline(0, PITCH_L, PITCH_W);
    vline(0, 0, PITCH_W);
    vline(PITCH_L, 0, PITCH_W);
    vline(PITCH_L / 2, 0, PITCH_W);
    circle(PITCH_L / 2, PITCH_W / 2, CENTER_R);
    g.fillRect(Math.round(wx(PITCH_L / 2)) - 1, Math.round(wy(PITCH_W / 2)) - 1, 3, 3);
    for (const side of [0, 1]) {
      const gx = side === 0 ? 0 : PITCH_L;
      const s = side === 0 ? 1 : -1;
      const bx = gx + s * BOX_D;
      const sx = gx + s * SIX_D;
      hline(Math.min(gx, bx), Math.max(gx, bx), PITCH_W / 2 - BOX_W / 2);
      hline(Math.min(gx, bx), Math.max(gx, bx), PITCH_W / 2 + BOX_W / 2);
      vline(bx, PITCH_W / 2 - BOX_W / 2, PITCH_W / 2 + BOX_W / 2);
      hline(Math.min(gx, sx), Math.max(gx, sx), PITCH_W / 2 - SIX_W / 2);
      hline(Math.min(gx, sx), Math.max(gx, sx), PITCH_W / 2 + SIX_W / 2);
      vline(sx, PITCH_W / 2 - SIX_W / 2, PITCH_W / 2 + SIX_W / 2);
      const px = gx + s * PENALTY_D;
      g.fillRect(Math.round(wx(px)), Math.round(wy(PITCH_W / 2)), 2, 2);
      const a = Math.acos((BOX_D - PENALTY_D) / CENTER_R);
      if (side === 0) circle(px, PITCH_W / 2, CENTER_R, -a, a);
      else circle(px, PITCH_W / 2, CENTER_R, Math.PI - a, Math.PI + a);
      // porterías: red por detrás de la línea
      const nx0 = side === 0 ? wx(-2) : wx(PITCH_L);
      for (let y = Math.round(wy(GOAL_Y0)); y <= Math.round(wy(GOAL_Y1)); y++)
        for (let x = Math.round(nx0); x < Math.round(nx0 + 2 * PPM); x++) if ((x + y) % 2 === 0) {
          g.fillStyle = '#d8dee6';
          g.fillRect(x, y, 1, 1);
        }
      g.fillStyle = '#ffffff';
      g.fillRect(Math.round(wx(gx)) - 1, Math.round(wy(GOAL_Y0)) - 1, 3, Math.round((GOAL_Y1 - GOAL_Y0) * PPM) + 3);
      g.fillStyle = '#eef3e2';
    }
    // banderines
    for (const [x, y] of [[0, 0], [PITCH_L, 0], [0, PITCH_W], [PITCH_L, PITCH_W]]) {
      g.fillStyle = '#ffffff';
      g.fillRect(wx(x), wy(y) - 6, 1, 6);
      g.fillStyle = '#ffcc00';
      g.fillRect(wx(x) + 1, wy(y) - 6, 3, 2);
    }
    // vallas publicitarias
    const boardW = 92;
    const drawBoards = (y: number) => {
      for (let i = 0, x = 4; x < WORLD_W - 4; i++, x += boardW + 2) {
        const sp = SPONSORS[i % SPONSORS.length];
        g.fillStyle = shade(sp.bg, -0.35);
        g.fillRect(x, y, boardW, 9);
        g.fillStyle = sp.bg;
        g.fillRect(x, y, boardW, 8);
        pixelText(g, sp.name, x + boardW / 2, y + 1, sp.fg);
      }
    };
    drawBoards(Math.round(wy(-2.4)));
    drawBoards(Math.round(wy(PITCH_W + 1.2)));
  }

  private buildCrowd(sim: MatchSim) {
    const rng = new Rng(7);
    const home = sim.teams[0].profile.kit;
    const away = sim.teams[1].profile.kit;
    const fans: Fan[] = [];
    const rows = (y0: number, y1: number) => {
      for (let y = y0; y < y1; y += 5)
        for (let x = 2; x < WORLD_W - 2; x += 3 + Math.floor(rng.next() * 2)) {
          if (rng.chance(0.12)) continue;
          const homeFan = x < WORLD_W * 0.68 ? rng.chance(0.8) : rng.chance(0.25);
          const kit = homeFan ? home : away;
          fans.push({
            x,
            y: y + 1,
            skin: rng.pick(['#f6d3b3', '#eab68e', '#d39a6a', '#8a5530']),
            shirt: rng.chance(0.7) ? (rng.chance(0.5) ? kit.shirt : kit.shirt2) : rng.pick(['#3b3f4a', '#c9c9c9', '#7a2b2b', '#2b4f7a']),
            side: homeFan ? 0 : 1,
          });
        }
    };
    rows(1, wy(-2.6) - 4);
    rows(wy(PITCH_W + 2.6) + 1, WORLD_H - 3);
    for (const [i, cv] of this.crowd.entries()) {
      cv.width = WORLD_W;
      cv.height = WORLD_H;
      const g = cv.getContext('2d')!;
      for (const f of fans) {
        const jump = i === 1 && f.side === 0 ? -1 : 0;
        g.fillStyle = f.shirt;
        g.fillRect(f.x, f.y + 2 + jump, 3, 2);
        g.fillStyle = f.skin;
        g.fillRect(f.x + 1, f.y + jump, 2, 2);
        if (i === 1 && f.side === 0 && (f.x + f.y) % 3 === 0) {
          g.fillRect(f.x, f.y - 1 + jump, 1, 1);
          g.fillRect(f.x + 3, f.y - 1 + jump, 1, 1);
        }
      }
    }
  }

  resize(w: number, h: number) {
    this.cssW = w;
    this.cssH = h;
    if (this.mode === 'tactical') this.scale = Math.min(w / WORLD_W, h / WORLD_H);
    else this.scale = clamp(Math.round(h / 170), 2, 6);
    this.canvas.width = Math.ceil(w / this.scale);
    this.canvas.height = Math.ceil(h / this.scale);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  setCamera(mode: CameraMode) {
    this.mode = mode;
    if (this.cssW) this.resize(this.cssW, this.cssH);
  }

  setSelected(idx: number) {
    this.selected = idx;
  }

  onEvent(e: MatchEvent) {
    if (e.kind === 'goal') {
      this.shake = 1;
      this.excitement = 4.5;
    }
    if (e.kind === 'save' || e.kind === 'post') this.excitement = Math.max(this.excitement, 1.2);
  }

  project(x: number, y: number, z: number): ScreenPoint {
    const sx = (wx(x) - this.camX) * this.scale;
    const sy = (wy(y) - z * PPM - this.camY) * this.scale;
    return { x: sx, y: sy, visible: sx > -40 && sy > -40 && sx < this.cssW + 40 && sy < this.cssH + 40 };
  }

  render(sim: MatchSim, alpha: number, dt: number) {
    this.ensureSprites(sim);
    this.anim.update(sim, alpha, dt);
    const A = this.anim;
    const ctx = this.ctx;
    const vw = this.canvas.width;
    const vh = this.canvas.height;
    this.drawCalls = 0;
    // cámara
    let tx: number;
    let ty: number;
    if (sim.phase === 'goal' && sim.lastGoal) {
      tx = wx(A.x[sim.lastGoal.scorer]);
      ty = wy(A.y[sim.lastGoal.scorer]);
    } else {
      const lead = sim.ball.owner >= 0 ? sim.dir(sim.players[sim.ball.owner].team) * 8 : 0;
      tx = wx(A.bx + lead);
      ty = wy(A.by);
    }
    const k = Math.min(1, dt * 3.2);
    this.camX += (tx - vw / 2 - this.camX) * k;
    this.camY += (ty - vh / 2 - this.camY) * k;
    this.camX = vw >= WORLD_W ? (WORLD_W - vw) / 2 : clamp(this.camX, 0, WORLD_W - vw);
    this.camY = vh >= WORLD_H ? (WORLD_H - vh) / 2 : clamp(this.camY, 0, WORLD_H - vh);
    this.shake = Math.max(0, this.shake - dt * 1.4);
    this.excitement = Math.max(0, this.excitement - dt);
    const sx = this.shake > 0 ? Math.round(Math.sin(A.time * 60) * 3 * this.shake) : 0;
    const sy = this.shake > 0 ? Math.round(Math.cos(A.time * 47) * 2 * this.shake) : 0;
    const cx = Math.round(this.camX) - sx;
    const cy = Math.round(this.camY) - sy;

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#2b2e36';
    ctx.fillRect(0, 0, vw, vh);
    ctx.drawImage(this.pitch, -cx, -cy);
    const crowdFrame = this.excitement > 0 && Math.floor(A.time * 8) % 2 === 1 ? 1 : 0;
    ctx.drawImage(this.crowd[crowdFrame], -cx, -cy);
    this.drawCalls += 3;

    // entidades ordenadas por profundidad (y)
    const order = sim.players.map((p) => p.idx).sort((a, b) => A.y[a] - A.y[b]);
    let ballDrawn = false;
    const drawBall = () => {
      const bx = Math.round(wx(A.bx)) - cx;
      const by = Math.round(wy(A.by)) - cy;
      ctx.fillStyle = 'rgba(10,20,10,0.35)';
      ctx.fillRect(bx - 2, by, 5, 1);
      const f = Math.floor(sim.ball.spin * 2) % 4;
      ctx.drawImage(this.ballFrames[f], bx - 2, by - 4 - Math.round(A.bz * PPM));
      this.drawCalls += 2;
    };
    for (const i of order) {
      if (!ballDrawn && A.by < A.y[i]) {
        drawBall();
        ballDrawn = true;
      }
      const p = sim.players[i];
      const px = Math.round(wx(A.x[i])) - cx;
      const py = Math.round(wy(A.y[i])) - cy;
      if (px < -30 || py < -30 || px > vw + 30 || py > vh + 40) continue;
      // sombra
      ctx.fillStyle = 'rgba(10,20,10,0.32)';
      ctx.fillRect(px - 3, py - 1, 7, 1);
      ctx.fillRect(px - 4, py, 9, 1);
      ctx.fillRect(px - 3, py + 1, 7, 1);
      const frame = this.frameFor(sim, i);
      const cosF = Math.cos(p.facing);
      if (cosF < -0.2) this.flip[i] = true;
      else if (cosF > 0.2) this.flip[i] = false;
      let jump = 0;
      if (p.action === 'celebrate' && p.profile.look.celebration === 'arms') jump = Math.round(Math.abs(Math.sin(A.time * 7)) * 4);
      if (p.action === 'celebrate' && p.profile.look.celebration === 'dance') this.flip[i] = Math.floor(A.time * 4) % 2 === 0;
      const img = this.sprites[i][frame];
      if (this.flip[i]) {
        ctx.save();
        ctx.translate(px + 1, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(img, -12, py - 23 - jump);
        ctx.restore();
      } else ctx.drawImage(img, px - 11, py - 23 - jump);
      this.drawCalls += 4;
      if (i === this.selected && Math.floor(A.time * 3) % 2 === 0) {
        ctx.fillStyle = '#ffd34d';
        ctx.fillRect(px - 2, py - 30, 5, 1);
        ctx.fillRect(px - 1, py - 29, 3, 1);
        ctx.fillRect(px, py - 28, 1, 1);
      }
    }
    if (!ballDrawn) drawBall();
  }

  private frameFor(sim: MatchSim, i: number): FrameId {
    const p = sim.players[i];
    const A = this.anim;
    switch (p.action) {
      case 'tackle':
        return 'slide';
      case 'fall':
        return 'fall';
      case 'dive':
        return 'dive';
      case 'kick':
      case 'poke':
        return 'kick';
      case 'celebrate': {
        const c = p.profile.look.celebration;
        if (c === 'plane') return 'out';
        if (c === 'ear') return 'ear';
        return Math.floor(A.time * 6) % 2 ? 'up0' : 'up1';
      }
    }
    if (A.speed[i] > 0.8) return (['run0', 'run1', 'run2', 'run3'] as const)[Math.floor(A.phase[i] / (Math.PI / 2)) & 3];
    return Math.floor(A.time * 1.6 + i) % 2 ? 'idle0' : 'idle1';
  }

  portrait(sim: MatchSim, idx: number, size: number) {
    this.ensureSprites(sim);
    return pixelPortrait(this.sprites[idx], size, '#3a7d3a');
  }

  perf(): PerfInfo {
    return { drawCalls: this.drawCalls, detail: `${this.sprites.length * 14} sprites generados · ${this.canvas.width}×${this.canvas.height} px internos` };
  }

  dispose() {
    this.canvas.remove();
  }
}

/** Texto nítido a 8 px: se rasteriza y se umbraliza para que no haya antialias. */
function pixelText(g: CanvasRenderingContext2D, text: string, cx: number, y: number, color: string) {
  const t = document.createElement('canvas');
  t.width = 200;
  t.height = 10;
  const c = t.getContext('2d')!;
  c.font = '8px Silkscreen, monospace';
  c.textBaseline = 'top';
  const w = Math.min(196, Math.ceil(c.measureText(text).width));
  c.fillStyle = '#fff';
  c.fillText(text, 0, 0, 196);
  const img = c.getImageData(0, 0, t.width, t.height);
  g.fillStyle = color;
  const x0 = Math.round(cx - w / 2);
  for (let yy = 0; yy < t.height; yy++)
    for (let xx = 0; xx < w; xx++) if (img.data[(yy * t.width + xx) * 4 + 3] > 110) g.fillRect(x0 + xx, y + yy - 1, 1, 1);
}
