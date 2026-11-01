import { shade, type Kit, type Look } from '../../content/look';

/**
 * Generador de sprites pixel art a partir del ADN visual. Todo se pinta píxel a píxel
 * en un lienzo de 24×24 mirando a la derecha; la izquierda se obtiene volteando.
 * Siluetas redondeadas y cabeza grande: nada de muñecos cuadrados.
 */
export const SPRITE = 24;
const OUTLINE = '#1b1420';

export type FrameId =
  | 'idle0'
  | 'idle1'
  | 'run0'
  | 'run1'
  | 'run2'
  | 'run3'
  | 'kick'
  | 'up0'
  | 'up1'
  | 'out'
  | 'ear'
  | 'slide'
  | 'fall'
  | 'dive';

type Legs = 'stand' | 'runA' | 'runB' | 'runC' | 'runD' | 'kick';
type Arms = 'down' | 'swingA' | 'swingB' | 'up' | 'up2' | 'out' | 'ear';

class Px {
  data: (string | null)[] = new Array(SPRITE * SPRITE).fill(null);
  set(x: number, y: number, c: string) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= SPRITE || y >= SPRITE) return;
    this.data[y * SPRITE + x] = c;
  }
  get(x: number, y: number) {
    if (x < 0 || y < 0 || x >= SPRITE || y >= SPRITE) return null;
    return this.data[y * SPRITE + x];
  }
  rect(x0: number, y0: number, w: number, h: number, c: string) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c);
  }
  disc(cx: number, cy: number, r: number, c: string) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + 0.3) this.set(x, y, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, w: number, color: (t: number) => string) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = Math.round(x0 + (x1 - x0) * t);
      const y = Math.round(y0 + (y1 - y0) * t);
      for (let k = 0; k < w; k++) this.set(x + k, y, color(t));
    }
  }
  outline() {
    const add: number[] = [];
    for (let y = 0; y < SPRITE; y++)
      for (let x = 0; x < SPRITE; x++) {
        if (this.get(x, y)) continue;
        if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push(y * SPRITE + x);
      }
    for (const i of add) this.data[i] = OUTLINE;
  }
  /** Gira 90º exactos (los píxeles no se deforman) y apoya la figura tumbada en el suelo. */
  rotate(dir: 1 | -1) {
    const pts: [number, number, string][] = [];
    let maxY = 0;
    for (let y = 0; y < SPRITE; y++)
      for (let x = 0; x < SPRITE; x++) {
        const c = this.get(x, y);
        if (!c) continue;
        const nx = dir === 1 ? SPRITE - 1 - y : y;
        const ny = dir === 1 ? x : SPRITE - 1 - x;
        maxY = Math.max(maxY, ny);
        pts.push([nx, ny, c]);
      }
    const out = new Px();
    const shift = SPRITE - 2 - maxY;
    for (const [x, y, c] of pts) out.set(x, y + shift, c);
    return out;
  }
  toCanvas() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = SPRITE;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(SPRITE, SPRITE);
    for (let i = 0; i < this.data.length; i++) {
      const c = this.data[i];
      if (!c) continue;
      const n = parseInt(c.slice(1), 16);
      img.data[i * 4] = (n >> 16) & 255;
      img.data[i * 4 + 1] = (n >> 8) & 255;
      img.data[i * 4 + 2] = n & 255;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }
}

interface Spec {
  legs: Legs;
  arms: Arms;
  bob: number;
  shout: boolean;
}

function drawFigure(look: Look, kit: Kit, s: Spec): Px {
  const g = new Px();
  const tall = look.height > 1.03 ? 1 : look.height < 0.96 ? -1 : 0;
  const cx = 11;
  const headTop = 1 - tall + s.bob;
  const torsoTop = headTop + 9;
  const torsoBot = torsoTop + 5;
  const shortsTop = torsoBot + 1;
  const footY = 23;
  const skin = look.skin;
  const skinD = shade(skin, -0.22);
  const hair = look.hairColor;
  const hairD = shade(hair, -0.25);
  const shirt = kit.shirt;
  const shirt2 = kit.shirt2;
  const widths = { slim: [cx - 2, cx + 2], normal: [cx - 3, cx + 2], stocky: [cx - 3, cx + 3], belly: [cx - 3, cx + 2] } as const;
  const [tx0, tx1] = widths[look.body];

  // ── brazo trasero (más oscuro, queda detrás del torso)
  const arm = (front: boolean) => {
    const sleeve = front ? shirt : shade(shirt, -0.3);
    const sk = front ? skin : skinD;
    const col = (t: number) => (t < 0.35 ? sleeve : sk);
    const sx = front ? cx : tx0;
    const sy = torsoTop + 1;
    const swing = s.arms === 'swingA' ? (front ? 2 : -2) : s.arms === 'swingB' ? (front ? -2 : 2) : 0;
    switch (s.arms) {
      case 'up':
        g.line(sx + (front ? 1 : -1), sy, sx + (front ? 2 : -2), sy - 6, 2, col);
        break;
      case 'up2':
        g.line(sx + (front ? 1 : -1), sy, sx + (front ? 3 : -1), sy - 6, 2, col);
        break;
      case 'out':
        for (let i = 0; i < 6; i++) g.rect(front ? sx + 2 + i : sx - 2 - i, sy, 1, 2, i < 2 ? sleeve : sk);
        break;
      case 'ear':
        if (front) g.line(sx + 1, sy, sx - 2, sy - 5, 2, col);
        else g.line(sx, sy, sx - 1, sy + 4, 2, col);
        break;
      default:
        g.line(sx, sy, sx + swing, sy + 5, 2, col);
    }
  };
  arm(false);

  // ── piernas
  const legTop = shortsTop + 1;
  const leg = (x0: number, x1: number, footLift: number, front: boolean) => {
    const sk = front ? skin : skinD;
    const sock = front ? kit.socks : shade(kit.socks, -0.3);
    const boot = front ? look.boots : shade(look.boots, -0.3);
    const yEnd = footY - footLift;
    const len = yEnd - legTop;
    const down = look.accessory === 'socksDown';
    g.line(x0, legTop, x1, yEnd - 1, 2, (t) => {
      const y = t * len;
      if (y < 1) return sk;
      if (down) return y > len - 2.2 ? sock : sk;
      return y > 1.6 ? sock : sk;
    });
    g.rect(x1, yEnd, 3, 1, boot);
  };
  switch (s.legs) {
    case 'stand':
      leg(cx - 2, cx - 2, 0, false);
      leg(cx, cx, 0, true);
      break;
    case 'runA':
      leg(cx - 2, cx - 4, 1, false);
      leg(cx, cx + 2, 0, true);
      break;
    case 'runB':
      leg(cx - 2, cx - 1, 0, false);
      leg(cx, cx, 2, true);
      break;
    case 'runC':
      leg(cx - 2, cx + 1, 0, false);
      leg(cx, cx - 2, 1, true);
      break;
    case 'runD':
      leg(cx - 2, cx - 2, 2, false);
      leg(cx, cx + 1, 0, true);
      break;
    case 'kick':
      leg(cx - 2, cx - 2, 0, false);
      g.line(cx, legTop, cx + 5, legTop + 3, 2, (t) => (t < 0.3 ? skin : kit.socks));
      g.rect(cx + 6, legTop + 3, 2, 2, look.boots);
      break;
  }

  // ── pantalón
  g.rect(tx0, shortsTop, tx1 - tx0 + 1, 2, kit.shorts);
  g.set(tx0, shortsTop + 1, shade(kit.shorts, -0.25));

  // ── torso con hombros redondeados y patrón de la camiseta
  for (let y = torsoTop; y <= torsoBot; y++) {
    const inset = y === torsoTop ? 1 : 0;
    for (let x = tx0 + inset; x <= tx1 - inset; x++) {
      let c = shirt;
      const ix = x - tx0;
      const iy = y - torsoTop;
      if (kit.pattern === 'stripes' && ix % 2 === 1) c = shirt2;
      if (kit.pattern === 'hoops' && iy % 2 === 1) c = shirt2;
      if (kit.pattern === 'half' && x < cx) c = shirt2;
      if (kit.pattern === 'sash' && Math.abs(ix - (5 - iy)) <= 0) c = shirt2;
      if (x === tx0) c = shade(c, -0.25);
      g.set(x, y, c);
    }
  }
  if (look.body === 'belly') {
    for (let y = torsoTop + 2; y <= torsoBot; y++) g.set(tx1 + 1, y, shirt);
    g.set(tx1 + 2, torsoTop + 3, shirt);
    g.set(tx1 + 2, torsoTop + 4, shirt);
  }
  g.set(cx + 1, torsoTop, kit.trim);

  // ── pelo trasero (afro, melena, coleta, mullet)
  if (look.hair === 'afro') g.disc(cx - 0.5, headTop + 2.5, 5.6, hair);
  if (look.hair === 'long') g.rect(cx - 5, headTop + 2, 3, 9, hairD);
  if (look.hair === 'mullet') g.rect(cx - 5, headTop + 3, 3, 7, hairD);
  if (look.hair === 'ponytail') {
    g.rect(cx - 6, headTop + 3, 2, 2, hair);
    g.rect(cx - 7, headTop + 4, 2, 3, hairD);
  }

  // ── cabeza (8×8 con esquinas recortadas)
  const hx0 = cx - 4;
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 9; x++) {
      const corner = (y === 0 || y === 7) && (x === 0 || x === 8);
      const corner2 = (y === 0 && (x === 1 || x === 7)) || (y === 7 && x === 8);
      if (corner || corner2) continue;
      g.set(hx0 + x, headTop + y, x === 0 ? skinD : skin);
    }
  g.set(hx0 + 2, headTop + 4, skinD); // oreja
  g.set(hx0 + 2, headTop + 5, skinD);
  // ojos y cejas
  const eyeY = headTop + 4;
  g.set(cx + 1, eyeY, OUTLINE);
  g.set(cx + 3, eyeY, OUTLINE);
  if (look.brows === 'uni') g.rect(cx, eyeY - 1, 5, 1, hairD);
  else if (look.brows === 'thick') {
    g.rect(cx, eyeY - 1, 2, 1, hairD);
    g.rect(cx + 3, eyeY - 1, 2, 1, hairD);
  }
  // nariz
  const nx = cx + 5;
  if (look.nose === 'small') g.set(nx, eyeY + 1, skin);
  else if (look.nose === 'big') {
    g.rect(nx, eyeY + 1, 2, 1, skin);
    g.set(nx, eyeY + 2, skin);
  } else {
    g.set(nx, eyeY, skin);
    g.set(nx + 1, eyeY + 1, skin);
    g.set(nx, eyeY + 2, skin);
  }
  // boca
  if (s.shout) g.rect(cx + 2, eyeY + 2, 2, 2, '#5a1820');
  else g.rect(cx + 2, eyeY + 2, 2, 1, skinD);
  // vello facial
  if (look.facial === 'mustache') {
    g.rect(cx + 1, eyeY + 2, 5, 1, hairD);
    g.set(cx + 5, eyeY + 3, hairD);
    g.set(cx + 1, eyeY + 3, hairD);
  } else if (look.facial === 'beard') {
    for (let y = eyeY + 1; y <= headTop + 8; y++) for (let x = cx - 1; x <= cx + 4; x++) if (!(s.shout && y >= eyeY + 2 && y <= eyeY + 3 && x >= cx + 2 && x <= cx + 3)) g.set(x, y, hairD);
  } else if (look.facial === 'goatee') g.rect(cx + 2, headTop + 7, 2, 2, hairD);
  else if (look.facial === 'stubble') {
    for (let y = eyeY + 2; y <= headTop + 7; y++) for (let x = cx; x <= cx + 4; x++) if ((x + y) % 2 === 0 && !g.get(x, y)?.startsWith('#5a')) g.set(x, y, shade(skin, -0.12));
  }

  // ── pelo superior
  const top = (rows: number, x0 = hx0, x1 = hx0 + 7) => {
    for (let y = headTop - 1; y < headTop - 1 + rows; y++) for (let x = x0; x <= x1; x++) g.set(x, y, y === headTop - 1 ? hair : hairD);
  };
  switch (look.hair) {
    case 'bald':
      g.set(cx - 1, headTop + 1, shade(skin, 0.35));
      break;
    case 'buzz':
      for (let x = hx0 + 1; x <= hx0 + 6; x++) g.set(x, headTop, shade(hair, 0.1));
      g.set(hx0, headTop + 1, shade(hair, 0.1));
      break;
    case 'short':
    case 'long':
    case 'mullet':
    case 'ponytail':
      top(3);
      g.rect(hx0, headTop + 2, 2, 2, hairD);
      break;
    case 'afro':
      top(2, hx0 - 1, hx0 + 8);
      break;
    case 'mohawk':
      g.rect(cx - 1, headTop - 3, 2, 4, hair);
      g.set(cx - 2, headTop - 2, hair);
      for (let x = hx0 + 1; x <= hx0 + 6; x++) if (x < cx - 1 || x > cx) g.set(x, headTop, shade(hair, -0.4));
      break;
    case 'curly':
      top(2);
      for (let x = hx0; x <= hx0 + 7; x += 2) g.set(x, headTop - 2, hair);
      g.rect(hx0, headTop + 1, 2, 3, hairD);
      break;
    case 'combover':
      for (let x = hx0 + 1; x <= hx0 + 6; x += 2) g.set(x, headTop, hair);
      g.set(hx0 + 7, headTop + 1, hair);
      g.rect(hx0, headTop + 2, 1, 3, hair);
      break;
  }
  if (look.accessory === 'headband') g.rect(hx0, headTop + 2, 9, 1, look.accColor);
  if (look.accessory === 'glasses') {
    g.rect(cx, eyeY, 5, 1, '#20232a');
    g.set(cx + 1, eyeY, '#8fd3ff');
    g.set(cx + 3, eyeY, '#8fd3ff');
  }
  arm(true);
  return g;
}

const SPECS: Record<Exclude<FrameId, 'slide' | 'fall' | 'dive'>, Spec> = {
  idle0: { legs: 'stand', arms: 'down', bob: 0, shout: false },
  idle1: { legs: 'stand', arms: 'down', bob: 1, shout: false },
  run0: { legs: 'runA', arms: 'swingB', bob: 0, shout: false },
  run1: { legs: 'runB', arms: 'down', bob: 1, shout: false },
  run2: { legs: 'runC', arms: 'swingA', bob: 0, shout: false },
  run3: { legs: 'runD', arms: 'down', bob: 1, shout: false },
  kick: { legs: 'kick', arms: 'out', bob: 0, shout: false },
  up0: { legs: 'stand', arms: 'up', bob: 0, shout: true },
  up1: { legs: 'stand', arms: 'up2', bob: 1, shout: true },
  out: { legs: 'runB', arms: 'out', bob: 0, shout: true },
  ear: { legs: 'stand', arms: 'ear', bob: 0, shout: true },
};

export type SpriteSet = Record<FrameId, HTMLCanvasElement>;

export function buildSprites(look: Look, kit: Kit): SpriteSet {
  const out = {} as SpriteSet;
  for (const [id, spec] of Object.entries(SPECS) as [keyof typeof SPECS, Spec][]) {
    const g = drawFigure(look, kit, spec);
    g.outline();
    out[id] = g.toCanvas();
  }
  const slide = drawFigure(look, kit, { legs: 'kick', arms: 'up', bob: 0, shout: false }).rotate(-1);
  slide.outline();
  out.slide = slide.toCanvas();
  const fall = drawFigure(look, kit, { legs: 'runA', arms: 'up2', bob: 0, shout: true }).rotate(-1);
  fall.outline();
  out.fall = fall.toCanvas();
  const dive = drawFigure(look, kit, { legs: 'stand', arms: 'up', bob: 0, shout: false }).rotate(1);
  dive.outline();
  out.dive = dive.toCanvas();
  return out;
}

/** Retrato grande para la ficha: la cabeza del sprite de reposo ampliada sin suavizado. */
export function pixelPortrait(sprites: SpriteSet, size: number, bg: string) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = false;
  const crop = 15;
  ctx.drawImage(sprites.idle0, 4, -3, crop, crop, 0, 0, size, size);
  return cv;
}
