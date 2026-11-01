import { SPONSORS } from '../../content/sponsors';
import { BOX_D, BOX_W, CENTER_R, GOAL_H, GOAL_Y0, GOAL_Y1, PENALTY_D, PITCH_L, PITCH_W, SIX_D, SIX_W, clamp } from '../../sim/geometry';
import type { MatchSim } from '../../sim/match';
import { Rng } from '../../sim/rng';
import type { MatchEvent } from '../../sim/types';
import { AnimTracker } from '../anim';
import type { CameraMode, MatchRenderer, PerfInfo, ScreenPoint } from '../types';
import { PerspCam } from './persp';
import { pixelPortrait } from './portrait';
import { SheetStore, composeSprites, type SpriteSet } from './sheets';
import { SH, type FrameId, type View } from './sprites';

/**
 * Prototipo 1 · Pixel art HD con cámara de retransmisión en perspectiva.
 * Resolución interna baja (≈640×360) escalada a múltiplos enteros. El fondo se calcula
 * píxel a píxel (proyección inversa) y los jugadores salen de hojas de sprites por capas.
 */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const rgb = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)] as const;

const GRASS = ['#173d2a', '#1d4a30', '#235836', '#2b663c', '#337442', '#3d8248', '#4a904f', '#5a9d56'].map(rgb);
const DIRT = ['#2f4a2a', '#3a5230', '#4a5a36', '#58613e'].map(rgb);
const SKY = ['#1a1230', '#271a45', '#3c2459', '#5c2f66', '#8a3f66', '#c0586a', '#e6825e'].map(rgb);
const STAND = ['#2a2040', '#33284d', '#3d305a', '#4a3a68'].map(rgb);
const LINE = rgb('#e9f0e2');

interface Fan {
  x: number;
  y: number;
  shirt: string;
  skin: string;
  home: boolean;
  ph: number;
  big: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
  kind: 'confetti' | 'smoke' | 'spark';
}

export class PixelRenderer implements MatchRenderer {
  readonly id = 'pixel' as const;
  readonly cameraModes = [
    { id: 'tv' as CameraMode, label: 'Estadio' },
    { id: 'close' as CameraMode, label: 'Cerca' },
  ];
  readonly headHeight = 2.7;
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private frame = document.createElement('canvas');
  private fctx = this.frame.getContext('2d')!;
  private bg = document.createElement('canvas');
  private crowd = [document.createElement('canvas'), document.createElement('canvas')];
  private vig = document.createElement('canvas');
  private banners = document.createElement('canvas');
  private cam = new PerspCam();
  private anim = new AnimTracker();
  private store = new SheetStore();
  private sprites: SpriteSet[] = [];
  private builtFor: MatchSim | null = null;
  private fans: Fan[] = [];
  private particles: Particle[] = [];
  private mode: CameraMode = 'tv';
  private k = 2;
  private cssW = 1;
  private cssH = 1;
  private zoom = { x: 0, y: 0, s: 1 };
  private excitement = 0;
  private flash = 0;
  private selected = -1;
  private lastView: View[] = [];
  private flip: boolean[] = [];
  private draws = 0;
  private bgMs = 0;
  private sim: MatchSim | null = null;
  private fontsReady = false;

  mount(host: HTMLElement) {
    this.canvas.className = 'stage-canvas pixelated';
    host.appendChild(this.canvas);
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    const fontReady = fonts ? fonts.load('8px Silkscreen').catch(() => null) : Promise.resolve(null);
    Promise.all([this.store.load(), fontReady]).then(() => {
      this.fontsReady = true;
      this.builtFor = null;
    });
  }

  resize(w: number, h: number) {
    this.cssW = w;
    this.cssH = h;
    // Píxel grueso: la resolución interna se queda entre ~420 y 640 de ancho.
    this.k = Math.max(1, Math.ceil(w / 640));
    const W = Math.round(w / this.k);
    const H = Math.round(h / this.k);
    this.canvas.width = this.frame.width = this.bg.width = W;
    this.canvas.height = this.frame.height = this.bg.height = H;
    this.cam.fit(W, H);
    if (this.sim && this.store.ready && this.fontsReady) this.buildBackground(this.sim);
  }

  setCamera(mode: CameraMode) {
    this.mode = mode;
  }

  setSelected(idx: number) {
    this.selected = idx;
  }

  onEvent(e: MatchEvent, sim: MatchSim) {
    if (e.kind === 'goal') {
      this.excitement = 5;
      this.flash = 1;
      const kit = sim.teams[e.team ?? 0].profile.kit;
      const W = this.frame.width;
      for (let i = 0; i < 160; i++)
        this.particles.push({
          x: Math.random() * W,
          y: -Math.random() * 60,
          vx: (Math.random() - 0.5) * 20,
          vy: 20 + Math.random() * 30,
          life: 4 + Math.random() * 2,
          color: [kit.shirt, kit.shirt2, '#ffffff', '#f2c94c'][i % 4],
          size: 1 + (i % 2),
          kind: 'confetti',
        });
      if (e.team === 0) this.flares();
    }
    if (e.kind === 'save') this.excitement = Math.max(this.excitement, 1.2);
  }

  /** Bengalas en el fondo local: chispas rojas y humo que sube. */
  private flares() {
    const home = this.fans.filter((f) => f.home && f.big);
    for (let i = 0; i < 5; i++) {
      const f = home[Math.floor(Math.random() * home.length)];
      if (!f) return;
      for (let j = 0; j < 30; j++)
        this.particles.push({ x: f.x, y: f.y - 3, vx: (Math.random() - 0.5) * 6, vy: -8 - Math.random() * 10, life: 2 + Math.random() * 2.5, color: '#ff4a3a', size: 1, kind: 'spark' });
      for (let j = 0; j < 14; j++)
        this.particles.push({ x: f.x + (Math.random() - 0.5) * 6, y: f.y - 6, vx: (Math.random() - 0.3) * 4, vy: -4 - Math.random() * 4, life: 4 + Math.random() * 3, color: '#b7a6c9', size: 3 + Math.floor(Math.random() * 3), kind: 'smoke' });
    }
  }

  // ───────────────────────── fondo estático ─────────────────────────
  private buildBackground(sim: MatchSim) {
    const t0 = performance.now();
    const W = this.bg.width;
    const H = this.bg.height;
    const g = this.bg.getContext('2d')!;
    const img = g.createImageData(W, H);
    const D = img.data;
    const put = (x: number, y: number, c: readonly number[]) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = (y * W + x) * 4;
      D[i] = c[0];
      D[i + 1] = c[1];
      D[i + 2] = c[2];
      D[i + 3] = 255;
    };
    const cam = this.cam;
    const P = (x: number, y: number, z = 0) => cam.project(x, y, z);
    const farLineY = P(PITCH_L / 2, 0).y;

    // cielo de atardecer con trama ordenada
    const skyBottom = Math.max(4, farLineY - H * 0.12);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const t = clamp(y / skyBottom, 0, 1) * (SKY.length - 1);
        const i = Math.min(SKY.length - 1, Math.floor(t) + (t % 1 > bayer(x, y) ? 1 : 0));
        put(x, y, SKY[i]);
      }
    const rng = new Rng(77);
    for (let i = 0; i < W * 0.12; i++) put(Math.floor(rng.range(0, W)), Math.floor(rng.range(0, skyBottom * 0.45)), rng.chance(0.3) ? [255, 240, 210] : [200, 180, 230]);
    // horizonte urbano en dos capas, con ventanas encendidas
    const city = (base: number, hMax: number, col: readonly number[], win: number) => {
      let x = -4;
      while (x < W + 4) {
        const bw = Math.floor(rng.range(6, 18));
        const bh = Math.floor(rng.range(hMax * 0.3, hMax));
        for (let yy = base - bh; yy < base; yy++) for (let xx = x; xx < x + bw; xx++) put(xx, yy, col);
        if (rng.chance(0.25)) for (let yy = base - bh - 5; yy < base - bh; yy++) put(x + Math.floor(bw / 2), yy, col);
        for (let yy = base - bh + 2; yy < base - 2; yy += 3)
          for (let xx = x + 1; xx < x + bw - 1; xx += 2) if (rng.chance(win)) put(xx, yy, rng.chance(0.7) ? [255, 200, 110] : [255, 150, 90]);
        x += bw + Math.floor(rng.range(0, 3));
      }
    };
    const tiers = 10;
    const standTop = P(PITCH_L / 2, -4.5 - 2.4 * tiers, 0.9 * tiers).y;
    city(Math.round(standTop + 4), H * 0.2, [62, 40, 84], 0.06);
    city(Math.round(standTop + 6), H * 0.13, [40, 27, 60], 0.16);

    // gradas: polígonos proyectados sin antialias
    const fillPoly = (pts: { x: number; y: number }[], col: (x: number, y: number) => readonly number[]) => {
      const ys = pts.map((p) => p.y);
      const y0 = Math.max(0, Math.floor(Math.min(...ys)));
      const y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)));
      for (let y = y0; y <= y1; y++) {
        const xs: number[] = [];
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i];
          const b = pts[(i + 1) % pts.length];
          if ((a.y <= y + 0.5 && b.y > y + 0.5) || (b.y <= y + 0.5 && a.y > y + 0.5)) xs.push(a.x + ((y + 0.5 - a.y) / (b.y - a.y)) * (b.x - a.x));
        }
        xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.round(xs[k])); x < Math.min(W, Math.round(xs[k + 1])); x++) put(x, y, col(x, y));
      }
    };
    this.fans = [];
    const kitH = sim.teams[0].profile.kit;
    const kitA = sim.teams[1].profile.kit;
    const fanRng = new Rng(5);
    const addFan = (x: number, y: number, z: number, homeBias: number) => {
      const p = P(x, y, z + 0.6);
      if (p.x < -2 || p.x > W + 2) return;
      const home = fanRng.chance(homeBias);
      const kit = home ? kitH : kitA;
      this.fans.push({
        x: Math.round(p.x),
        y: Math.round(p.y),
        shirt: fanRng.chance(0.75) ? (fanRng.chance(0.6) ? kit.shirt : kit.shirt2) : fanRng.pick(['#3b3550', '#c9c2b5', '#7a2b3b', '#2b4f7a']),
        skin: fanRng.pick(['#f6d3b3', '#eab68e', '#d39a6a', '#8a5530']),
        home,
        ph: fanRng.range(0, 6.28),
        big: z > 4,
      });
    };
    for (let i = tiers - 1; i >= 0; i--) {
      const y = -4.5 - 2.4 * i;
      const z = 0.9 * i;
      const a = P(-14, y, z);
      const b = P(PITCH_L + 14, y, z);
      const c = P(PITCH_L + 14, y - 2.4, z + 0.9);
      const d = P(-14, y - 2.4, z + 0.9);
      fillPoly([d, c, b, a], (_x, yy) => STAND[(i % 2) + (yy > (a.y + d.y) / 2 ? 0 : 1)]);
      for (let x = -12; x < PITCH_L + 12; x += 1.25 + fanRng.range(0, 0.5)) if (!fanRng.chance(0.12)) addFan(x, y - 1.2, z, x < PITCH_L * 0.7 ? 0.82 : 0.25);
    }
    for (const sideX of [-1, 1]) {
      for (let i = 5; i >= 0; i--) {
        const x = sideX < 0 ? -9 - 2.4 * i : PITCH_L + 9 + 2.4 * i;
        const z = 0.9 * i;
        const a = P(x, -6, z);
        const b = P(x, PITCH_W + 6, z);
        const c = P(x + sideX * 2.4, PITCH_W + 6, z + 0.9);
        const d = P(x + sideX * 2.4, -6, z + 0.9);
        fillPoly([a, b, c, d], () => STAND[(i % 2) + 1]);
        for (let y = -5; y < PITCH_W + 5; y += 1.3 + fanRng.range(0, 0.4)) if (!fanRng.chance(0.2)) addFan(x + sideX * 1.2, y, z, sideX < 0 ? 0.85 : 0.3);
      }
    }
    this.fans.sort((p, q) => p.y - q.y);
    this.buildCrowd();

    // césped por proyección inversa: cada píxel sabe qué punto del campo está mirando
    const wear = (x: number, y: number) => {
      let w = 0;
      for (const gx of [2.5, PITCH_L - 2.5]) w = Math.max(w, Math.exp(-((x - gx) ** 2 / 18 + (y - PITCH_W / 2) ** 2 / 30)));
      w = Math.max(w, 0.45 * Math.exp(-((x - PITCH_L / 2) ** 2 + (y - PITCH_W / 2) ** 2) / 30));
      for (const px of [PENALTY_D, PITCH_L - PENALTY_D]) w = Math.max(w, 0.55 * Math.exp(-((x - px) ** 2 + (y - PITCH_W / 2) ** 2) / 6));
      return w;
    };
    const lights = [
      [-12, -14],
      [PITCH_L + 12, -14],
      [-12, PITCH_W + 14],
      [PITCH_L + 12, PITCH_W + 14],
    ];
    const top = Math.max(0, Math.floor(P(PITCH_L / 2, -3.2).y));
    for (let Y = top; Y < H; Y++)
      for (let X = 0; X < W; X++) {
        const w = cam.unproject(X + 0.5, Y + 0.5);
        if (!w || w.y < -3.2 || w.x < -8.5 || w.x > PITCH_L + 8.5) continue;
        const inPitch = w.x >= -1.5 && w.x <= PITCH_L + 1.5 && w.y >= -1.5 && w.y <= PITCH_W + 1.5;
        let light = 0;
        for (const [lx, ly] of lights) light += Math.exp(-((w.x - lx) ** 2 + (w.y - ly) ** 2) / (2 * 55 * 55));
        const stripe = Math.floor((w.x + 105) / 7.5) % 2;
        const checker = Math.floor((w.y + 70) / 9) % 2;
        let t = 2.2 + stripe * 1.15 + checker * 0.25 + light * 1.6 + (hash(Math.floor(w.x * 2.2), Math.floor(w.y * 2.2)) - 0.5) * 0.9;
        if (!inPitch) t -= 1.1;
        if (w.y > PITCH_W + 3.5) t -= 0.6;
        const ti = clamp(Math.floor(t) + (t % 1 > bayer(X, Y) ? 1 : 0), 0, GRASS.length - 1);
        let col: readonly number[] = GRASS[ti];
        const wr = inPitch ? wear(w.x, w.y) * (0.6 + hash(Math.floor(w.x * 3), Math.floor(w.y * 3)) * 0.8) : 0;
        if (wr > bayer(X + 1, Y + 2) * 1.2 + 0.32) col = DIRT[clamp(Math.floor(light * 2 + (hash(X, Y) > 0.5 ? 1 : 0)), 0, 3)];
        put(X, Y, col);
      }
    // líneas de cal: se recorre cada línea en el mundo y se proyecta (1 px, nítidas)
    const chalk = (x: number, y: number) => {
      const q = P(x, y);
      const X = Math.round(q.x - 0.5);
      const Y = Math.round(q.y - 0.5);
      put(X, Y, LINE);
    };
    const segLine = (x0: number, y0: number, x1: number, y1: number) => {
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.06);
      for (let i = 0; i <= n; i++) chalk(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n);
    };
    const arcLine = (cx: number, cy: number, r: number, a0 = 0, a1 = Math.PI * 2) => {
      const n = Math.ceil((Math.abs(a1 - a0) * r) / 0.06);
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        chalk(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
    };
    segLine(0, 0, PITCH_L, 0);
    segLine(0, PITCH_W, PITCH_L, PITCH_W);
    segLine(0, 0, 0, PITCH_W);
    segLine(PITCH_L, 0, PITCH_L, PITCH_W);
    segLine(PITCH_L / 2, 0, PITCH_L / 2, PITCH_W);
    arcLine(PITCH_L / 2, PITCH_W / 2, CENTER_R);
    arcLine(PITCH_L / 2, PITCH_W / 2, 0.25);
    for (const sd of [0, 1]) {
      const gx = sd ? PITCH_L : 0;
      const dir = sd ? -1 : 1;
      const bx = gx + dir * BOX_D;
      segLine(gx, PITCH_W / 2 - BOX_W / 2, bx, PITCH_W / 2 - BOX_W / 2);
      segLine(gx, PITCH_W / 2 + BOX_W / 2, bx, PITCH_W / 2 + BOX_W / 2);
      segLine(bx, PITCH_W / 2 - BOX_W / 2, bx, PITCH_W / 2 + BOX_W / 2);
      const sx = gx + dir * SIX_D;
      segLine(gx, PITCH_W / 2 - SIX_W / 2, sx, PITCH_W / 2 - SIX_W / 2);
      segLine(gx, PITCH_W / 2 + SIX_W / 2, sx, PITCH_W / 2 + SIX_W / 2);
      segLine(sx, PITCH_W / 2 - SIX_W / 2, sx, PITCH_W / 2 + SIX_W / 2);
      const px = gx + dir * PENALTY_D;
      arcLine(px, PITCH_W / 2, 0.2);
      const a = Math.acos((BOX_D - PENALTY_D) / CENTER_R);
      if (dir > 0) arcLine(px, PITCH_W / 2, CENTER_R, -a, a);
      else arcLine(px, PITCH_W / 2, CENTER_R, Math.PI - a, Math.PI + a);
    }
    for (const [cx, cy, a0] of [[0, 0, 0], [PITCH_L, 0, Math.PI / 2], [PITCH_L, PITCH_W, Math.PI], [0, PITCH_W, -Math.PI / 2]] as const) arcLine(cx, cy, 1, a0, a0 + Math.PI / 2);
    g.putImageData(img, 0, 0);

    // vallas del fondo con patrocinadores del barrio
    const by = Math.round(P(PITCH_L / 2, -2.6, 0).y);
    const bh = Math.max(5, Math.round(P(PITCH_L / 2, -2.6, 0).y - P(PITCH_L / 2, -2.6, 1.1).y));
    let x = Math.round(P(-3, -2.6).x);
    const xEnd = Math.round(P(PITCH_L + 3, -2.6).x);
    let n = 0;
    while (x < xEnd) {
      const sp = SPONSORS[n++ % SPONSORS.length];
      const w = pixelTextWidth(sp.name) + 12;
      g.fillStyle = sp.bg;
      g.fillRect(x, by - bh, Math.min(w, xEnd - x), bh);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x, by - 1, Math.min(w, xEnd - x), 1);
      pixelText(g, sp.name, x + w / 2, by - bh + Math.max(1, Math.floor((bh - 6) / 2)), sp.fg, w - 4);
      x += w + 1;
    }
    // pancartas de la grada: van en su propia capa, por encima del público
    this.banners.width = W;
    this.banners.height = H;
    const gb = this.banners.getContext('2d')!;
    const groundCtx = g;
    {
    const g = gb;
    const banner = sim.teams[0].profile.name.toUpperCase();
    const bp = P(PITCH_L * 0.33, -4.5 - 2.4 * 4.5, 0.9 * 4.5 + 1.2);
    const bw = pixelTextWidth(banner) + 14;
    g.fillStyle = '#e8dcc4';
    g.fillRect(Math.round(bp.x - bw / 2), Math.round(bp.y - 6), Math.round(bw), 11);
    g.fillStyle = '#c24d16';
    g.fillRect(Math.round(bp.x - bw / 2), Math.round(bp.y - 6), Math.round(bw), 2);
    g.fillRect(Math.round(bp.x - bw / 2), Math.round(bp.y + 3), Math.round(bw), 2);
    pixelText(g, banner, bp.x, Math.round(bp.y - 3), '#3a1f14', bw - 6);
    ['MANOLO, PON OTRA', 'AQUÍ SE VIENE A SUFRIR'].forEach((j, k) => {
      const q = P(PITCH_L * (0.62 + k * 0.22), -4.5 - 2.4 * (2.5 + k * 3), 0.9 * (2.5 + k * 3) + 1.2);
      const w = pixelTextWidth(j) + 10;
      g.fillStyle = k ? '#2f86c4' : '#f2c94c';
      g.fillRect(Math.round(q.x - w / 2), Math.round(q.y - 4), w, 9);
      pixelText(g, j, q.x, Math.round(q.y - 2), k ? '#ffffff' : '#2a1d22', w - 4);
    });
    }
    // torres de focos
    {
    const g = groundCtx;
    for (const lx of [-16, PITCH_L + 16]) {
      const base = P(lx, -20, 0);
      const topP = P(lx, -20, 34);
      g.fillStyle = '#251a38';
      g.fillRect(Math.round(topP.x), Math.round(topP.y), 2, Math.max(0, Math.round(base.y - topP.y)));
      g.fillStyle = '#3a2d55';
      g.fillRect(Math.round(topP.x) - 6, Math.round(topP.y) - 5, 14, 6);
      g.fillStyle = '#fff6d6';
      for (let k = 0; k < 6; k++) g.fillRect(Math.round(topP.x) - 5 + k * 2, Math.round(topP.y) - 4, 1, 2);
      const glow = g.createRadialGradient(topP.x + 1, topP.y - 2, 1, topP.x + 1, topP.y - 2, 26);
      glow.addColorStop(0, 'rgba(255,240,200,0.55)');
      glow.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = glow;
      g.fillRect(topP.x - 26, topP.y - 28, 54, 54);
    }
    }
    this.bgMs = performance.now() - t0;
  }

  private ensure(sim: MatchSim) {
    this.sim = sim;
    if (this.builtFor === sim || !this.store.ready || !this.fontsReady) return;
    this.sprites = sim.players.map((p) => composeSprites(this.store, p.profile.look, sim.kitOf(p), p.profile.num));
    this.buildBackground(sim);
    this.builtFor = sim;
  }

  // ───────────────────────── proyección para la capa HTML ─────────────────────────
  project(x: number, y: number, z: number): ScreenPoint {
    const p = this.cam.project(x, y, 0);
    const px = (p.x - this.zoom.x) * this.zoom.s * this.k;
    const py = (p.y - z * 10 - this.zoom.y) * this.zoom.s * this.k;
    return { x: px, y: py, visible: px > -30 && py > -30 && px < this.cssW + 30 && py < this.cssH + 30 };
  }

  render(sim: MatchSim, alpha: number, dt: number) {
    this.ensure(sim);
    const A = this.anim;
    A.update(sim, alpha, dt);
    const g = this.fctx;
    const W = this.frame.width;
    const H = this.frame.height;
    g.imageSmoothingEnabled = false;
    this.draws = 0;
    if (!this.store.ready || this.builtFor !== sim) {
      g.fillStyle = '#1a1230';
      g.fillRect(0, 0, W, H);
      pixelText(g, 'CARGANDO HOJAS DE SPRITES', W / 2, Math.round(H / 2), '#f2c94c', W);
      this.blit();
      return;
    }
    g.drawImage(this.bg, 0, 0);
    this.excitement = Math.max(0, this.excitement - dt);
    this.drawCrowd(A.time);

    const cam = this.cam;
    for (const p of sim.players) {
      const q = cam.project(A.x[p.idx], A.y[p.idx]);
      g.fillStyle = 'rgba(12,20,16,0.38)';
      g.fillRect(Math.round(q.x) - 4, Math.round(q.y), 9, 1);
      g.fillRect(Math.round(q.x) - 3, Math.round(q.y) + 1, 7, 1);
    }
    const bq = cam.project(A.bx, A.by, 0);
    g.fillStyle = 'rgba(12,20,16,0.4)';
    g.fillRect(Math.round(bq.x) - 2, Math.round(bq.y), 4, 1);
    const f = sim.ball.flight;
    if (f && (f.kind === 'pass' || f.kind === 'cross')) this.dashedArrow(cam.project(A.bx, A.by), cam.project(f.tx, f.ty), f.team === 0 ? '#ffd0a8' : '#bfe6ff', A.time);

    const entities: { y: number; draw: () => void }[] = [];
    for (const p of sim.players) entities.push({ y: A.y[p.idx], draw: () => this.drawPlayer(sim, p.idx) });
    entities.push({ y: A.by + 0.01, draw: () => this.drawBall(sim) });
    for (const gx of [0, PITCH_L]) entities.push({ y: PITCH_W / 2 + 0.5, draw: () => this.drawGoal(gx) });
    entities.sort((a, b) => a.y - b.y);
    for (const e of entities) e.draw();

    this.drawParticles(dt);
    if (this.flash > 0) {
      g.fillStyle = `rgba(255,240,200,${(this.flash * 0.35).toFixed(3)})`;
      g.fillRect(0, 0, W, H);
      this.flash = Math.max(0, this.flash - dt * 1.6);
    }
    this.vignette();
    this.blit();
  }

  private blit() {
    const W = this.frame.width;
    const H = this.frame.height;
    const c = this.ctx;
    c.imageSmoothingEnabled = false;
    if (this.mode === 'close' && this.sim) {
      const s = 2;
      const q = this.cam.project(this.anim.bx, this.anim.by);
      const zx = clamp(q.x - W / (2 * s), 0, W - W / s);
      const zy = clamp(q.y - H / (2 * s) - 10, 0, H - H / s);
      this.zoom.x += (zx - this.zoom.x) * 0.12;
      this.zoom.y += (zy - this.zoom.y) * 0.12;
      this.zoom.s = s;
      c.drawImage(this.frame, Math.round(this.zoom.x), Math.round(this.zoom.y), W / s, H / s, 0, 0, W, H);
    } else {
      this.zoom = { x: 0, y: 0, s: 1 };
      c.drawImage(this.frame, 0, 0);
    }
  }

  /** El público se pre-pinta en dos fotogramas (calma y euforia) y se alterna. */
  private buildCrowd() {
    this.crowd.forEach((cv, frame) => {
      cv.width = this.bg.width;
      cv.height = this.bg.height;
      const g = cv.getContext('2d')!;
      for (const f of this.fans) {
        const up = frame === 1 && f.home && (f.x * 7 + f.y) % 5 < 3;
        const jump = up ? 2 : frame === 1 && f.home ? 1 : 0;
        g.fillStyle = f.shirt;
        g.fillRect(f.x - 1, f.y - 2 - jump, 3, 3);
        g.fillStyle = f.skin;
        g.fillRect(f.x, f.y - 4 - jump, 2, 2);
        if (up) {
          g.fillRect(f.x - 2, f.y - 5 - jump, 1, 2);
          g.fillRect(f.x + 2, f.y - 5 - jump, 1, 2);
        }
      }
    });
    const v = this.vig;
    v.width = this.bg.width;
    v.height = this.bg.height;
    const g = v.getContext('2d')!;
    const W = v.width;
    const H = v.height;
    const grd = g.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, W * 0.72);
    grd.addColorStop(0, 'rgba(40,20,70,0)');
    grd.addColorStop(1, 'rgba(30,14,50,0.45)');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
  }

  private drawCrowd(time: number) {
    const frame = this.excitement > 0 && Math.floor(time * 8) % 2 === 1 ? 1 : 0;
    this.fctx.drawImage(this.crowd[frame], 0, 0);
    this.fctx.drawImage(this.banners, 0, 0);
    this.draws += 2;
  }

  private viewFor(sim: MatchSim, i: number): { view: View; flip: boolean } {
    const p = sim.players[i];
    const moving = this.anim.speed[i] > 0.7;
    const dx = moving ? p.vx : Math.cos(p.facing);
    const dy = moving ? p.vy : Math.sin(p.facing);
    let view = this.lastView[i] ?? 'side';
    if (p.action === 'celebrate') view = 'front';
    else if (p.action === 'tackle' || p.action === 'fall' || p.action === 'dive' || p.action === 'kick' || p.action === 'poke') view = 'side';
    else if (Math.abs(dy) > Math.abs(dx) * 1.3) view = dy > 0 ? 'front' : 'back';
    else if (Math.abs(dx) > Math.abs(dy) * 1.1) view = 'side';
    this.lastView[i] = view;
    if (dx < -0.2) this.flip[i] = true;
    else if (dx > 0.2) this.flip[i] = false;
    if (p.action === 'dive') this.flip[i] = p.actionSide < 0;
    return { view, flip: view === 'side' ? !!this.flip[i] : false };
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
    if (A.speed[i] > 0.7) return (['run0', 'run1', 'run2', 'run3'] as const)[Math.floor(A.phase[i] / (Math.PI / 2)) & 3];
    return Math.floor(A.time * 1.4 + i * 0.37) % 2 ? 'idle0' : 'idle1';
  }

  private drawPlayer(sim: MatchSim, i: number) {
    const p = sim.players[i];
    const set = this.sprites[i];
    if (!set) return;
    const q = this.cam.project(this.anim.x[i], this.anim.y[i]);
    const { view, flip } = this.viewFor(sim, i);
    const fr = this.frameFor(sim, i);
    const img = set[view][fr] ?? set.side[fr] ?? set[view].idle0!;
    let jump = 0;
    if (p.action === 'celebrate') {
      const c = p.profile.look.celebration;
      if (c === 'arms' || c === 'dance') jump = Math.round(Math.abs(Math.sin(this.anim.time * 7)) * 3);
      if (c === 'knees') jump = -3;
    }
    const x = Math.round(q.x);
    const y = Math.round(q.y);
    const g = this.fctx;
    if (flip) {
      g.save();
      g.translate(x + 1, 0);
      g.scale(-1, 1);
      g.drawImage(img, -12, y - SH + 1 - jump);
      g.restore();
    } else g.drawImage(img, x - 12, y - SH + 1 - jump);
    this.draws++;
    if (i === this.selected) {
      const t = Math.floor(this.anim.time * 3) % 2;
      g.fillStyle = '#f2c94c';
      g.fillRect(x - 2, y - SH - 4 - t, 5, 1);
      g.fillRect(x - 1, y - SH - 3 - t, 3, 1);
      g.fillRect(x, y - SH - 2 - t, 1, 1);
    }
  }

  private drawBall(sim: MatchSim) {
    const q = this.cam.project(this.anim.bx, this.anim.by, this.anim.bz * 2.2);
    const g = this.fctx;
    const x = Math.round(q.x);
    const y = Math.round(q.y);
    g.fillStyle = '#1a1226';
    g.fillRect(x - 2, y - 4, 4, 5);
    g.fillRect(x - 3, y - 3, 6, 3);
    g.fillStyle = '#ffffff';
    g.fillRect(x - 2, y - 3, 4, 3);
    g.fillStyle = '#3a3448';
    const s = Math.floor(sim.ball.spin * 2) % 4;
    g.fillRect(x - 2 + (s % 2) * 2, y - 3 + (s >> 1), 1, 1);
    this.draws++;
  }

  /** Portería exagerada (como el resto de proporciones del estilo) con su red. */
  private drawGoal(gx: number) {
    const cam = this.cam;
    const dir = gx === 0 ? -1 : 1;
    const wY0 = PITCH_W / 2 - (GOAL_Y1 - GOAL_Y0) * 0.75;
    const wY1 = PITCH_W / 2 + (GOAL_Y1 - GOAL_Y0) * 0.75;
    const h = GOAL_H * 2.6;
    const d = 3.2 * dir;
    const g = this.fctx;
    const pix = (x: number, y: number, c: string) => {
      g.fillStyle = c;
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
    };
    const line = (a: { x: number; y: number }, b: { x: number; y: number }, c: string, step = 1) => {
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))));
      for (let i = 0; i <= n; i += step) pix(a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n, c);
    };
    const P = (x: number, y: number, z: number) => cam.project(x, y, z);
    const net = 'rgba(230,230,240,0.55)';
    for (let k = 0; k <= 8; k++) {
      const yy = wY0 + ((wY1 - wY0) * k) / 8;
      line(P(gx + d, yy, 0), P(gx + d, yy, h * 0.8), net, 2);
      line(P(gx, yy, h), P(gx + d, yy, h * 0.8), net, 2);
    }
    for (let k = 0; k <= 5; k++) line(P(gx + d, wY0, (h * 0.8 * k) / 5), P(gx + d, wY1, (h * 0.8 * k) / 5), net, 2);
    for (const yy of [wY0, wY1]) for (let k = 0; k <= 4; k++) line(P(gx, yy, (h * k) / 4), P(gx + d, yy, (h * 0.8 * k) / 4), net, 2);
    for (const yy of [wY0, wY1]) {
      const a = P(gx, yy, 0);
      const b = P(gx, yy, h);
      line(a, b, '#f4f4f0');
      line({ x: a.x + 1, y: a.y }, { x: b.x + 1, y: b.y }, '#b9b6c8');
    }
    const a = P(gx, wY0, h);
    const b = P(gx, wY1, h);
    line(a, b, '#f4f4f0');
    line({ x: a.x, y: a.y + 1 }, { x: b.x, y: b.y + 1 }, '#b9b6c8');
    this.draws++;
  }

  private dashedArrow(a: { x: number; y: number }, b: { x: number; y: number }, color: string, t: number) {
    const g = this.fctx;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const n = Math.ceil(Math.hypot(dx, dy));
    if (n < 6) return;
    g.fillStyle = color;
    const off = Math.floor(t * 12) % 6;
    for (let i = 0; i < n - 3; i++) if ((i + 6 - off) % 6 < 3) g.fillRect(Math.round(a.x + (dx * i) / n), Math.round(a.y + (dy * i) / n), 1, 1);
    const ux = dx / n;
    const uy = dy / n;
    for (let k = 0; k < 4; k++) for (let s = -k; s <= k; s++) g.fillRect(Math.round(b.x - ux * (4 - k) - uy * s * 0.8), Math.round(b.y - uy * (4 - k) + ux * s * 0.8), 1, 1);
  }

  private drawParticles(dt: number) {
    const g = this.fctx;
    const H = this.frame.height;
    this.particles = this.particles.filter((p) => (p.life -= dt) > 0 && p.y < H + 10);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'confetti') {
        p.vx += Math.sin(p.y * 0.2) * 8 * dt;
        g.fillStyle = p.color;
        g.fillRect(Math.round(p.x), Math.round(p.y), p.size, Math.floor(p.life * 6) % 2 ? 1 : p.size);
      } else if (p.kind === 'spark') {
        p.vy += 6 * dt;
        g.fillStyle = 'rgba(255,80,60,0.22)';
        g.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 2, 5, 5);
        g.fillStyle = Math.random() > 0.5 ? '#ffd27a' : p.color;
        g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      } else {
        p.vx *= 0.99;
        g.fillStyle = `rgba(183,166,201,${Math.min(0.45, p.life * 0.12).toFixed(3)})`;
        g.fillRect(Math.round(p.x - p.size / 2), Math.round(p.y - p.size / 2), Math.round(p.size), Math.round(p.size));
        p.size = Math.min(10, p.size + dt * 1.5);
      }
    }
  }

  private vignette() {
    this.fctx.drawImage(this.vig, 0, 0);
  }

  portrait(sim: MatchSim, idx: number, size: number) {
    const p = sim.players[idx];
    const base = pixelPortrait({ look: p.profile.look, kit: sim.kitOf(p), traits: p.profile.traits, num: p.profile.num, seed: idx * 13 + 1 });
    const out = document.createElement('canvas');
    out.width = out.height = size;
    const g = out.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.drawImage(base, 0, 0, size, size);
    return out;
  }

  perf(): PerfInfo {
    return {
      drawCalls: this.draws,
      detail: `${this.frame.width}×${this.frame.height} px internos ×${this.k} · ${this.store.count} hojas de sprites · ${this.fans.length} aficionados · fondo en ${Math.round(this.bgMs)} ms`,
    };
  }

  dispose() {
    this.canvas.remove();
  }
}

let measureCtx: CanvasRenderingContext2D | null = null;
export function pixelTextWidth(text: string) {
  measureCtx ??= document.createElement('canvas').getContext('2d')!;
  measureCtx.font = '8px Silkscreen, monospace';
  return Math.ceil(measureCtx.measureText(text).width);
}

/** Texto nítido a 8 px: se rasteriza y se umbraliza para que no haya antialias. */
export function pixelText(g: CanvasRenderingContext2D, text: string, cx: number, y: number, color: string, maxW = 400) {
  const t = document.createElement('canvas');
  t.width = Math.ceil(Math.max(8, maxW)) + 4;
  t.height = 10;
  const c = t.getContext('2d')!;
  c.font = '8px Silkscreen, monospace';
  c.textBaseline = 'top';
  const w = Math.min(maxW, Math.ceil(c.measureText(text).width));
  c.fillStyle = '#fff';
  c.fillText(text, 0, 0, Math.max(8, maxW));
  const img = c.getImageData(0, 0, t.width, t.height);
  g.fillStyle = color;
  const x0 = Math.round(cx - w / 2);
  for (let yy = 0; yy < t.height; yy++)
    for (let xx = 0; xx < w; xx++) if (img.data[(yy * t.width + xx) * 4 + 3] > 110) g.fillRect(x0 + xx, y + yy - 1, 1, 1);
}
