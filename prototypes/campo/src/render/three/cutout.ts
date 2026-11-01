import { expressionOf, type Expression, type Kit, type Look } from '../../content/look';
import { Rng } from '../../sim/rng';

/**
 * Pintor de "cromos recortables". Cada parte se pinta en un lienzo 2D como una ilustración
 * impresa: relleno plano, sombras de color (no grises), trama de puntos de imprenta en la
 * sombra, luz de contorno de los focos, tinta de grosor variable, grano de papel y el borde
 * blanco de pegatina. La cara refleja la personalidad (gesto por defecto) y el momento (grito).
 */
export const PX_PER_M = 200;
const INK = '#24161f';
const PAPER = '#fffaf0';
const SHADOW_TINT = '#3b1f52';
const LIGHT_TINT = '#fff3cf';

export interface CutPart {
  canvas: HTMLCanvasElement;
  px: number;
  py: number;
}

export interface CutoutSet {
  head: CutPart;
  headShout: CutPart;
  torso: CutPart;
  armFront: CutPart;
  armBack: CutPart;
  legFront: CutPart;
  legBack: CutPart;
}

export interface CutoutSpec {
  look: Look;
  kit: Kit;
  traits: readonly string[];
  num: number;
  chest: string;
  keeper: boolean;
  seed: number;
}

// ───────────────────────── utilidades de pintura ─────────────────────────
function cv(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}
const shadowOf = (c: string, k = 0.32) => mix(c, SHADOW_TINT, k);
const lightOf = (c: string, k = 0.45) => mix(c, LIGHT_TINT, k);

let dotTile: HTMLCanvasElement | null = null;
let grainTile: HTMLCanvasElement | null = null;
function halftone(g: CanvasRenderingContext2D, color: string, alpha = 0.55) {
  if (!dotTile) {
    dotTile = cv(7, 7);
    const d = dotTile.getContext('2d')!;
    d.fillStyle = '#000';
    d.beginPath();
    d.arc(3.5, 3.5, 1.5, 0, Math.PI * 2);
    d.fill();
  }
  const tinted = cv(7, 7);
  const t = tinted.getContext('2d')!;
  t.drawImage(dotTile, 0, 0);
  t.globalCompositeOperation = 'source-in';
  t.fillStyle = color;
  t.fillRect(0, 0, 7, 7);
  const pat = g.createPattern(tinted, 'repeat')!;
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = pat;
  g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  g.restore();
}
function grain(c: HTMLCanvasElement) {
  if (!grainTile) {
    grainTile = cv(64, 64);
    const g = grainTile.getContext('2d')!;
    const rng = new Rng(99);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.55)' : 'rgba(40,20,40,0.5)';
      g.fillRect(Math.floor(rng.range(0, 64)), Math.floor(rng.range(0, 64)), 1, 1);
    }
  }
  const g = c.getContext('2d')!;
  g.save();
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = 0.12;
  g.fillStyle = g.createPattern(grainTile, 'repeat')!;
  g.fillRect(0, 0, c.width, c.height);
  g.restore();
}

/** Silueta con tinta exterior gruesa: el trazo se pinta primero y el relleno tapa las líneas interiores. */
function blob(g: CanvasRenderingContext2D, p: Path2D, fill: string, lw = 6) {
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = INK;
  g.lineWidth = lw * 2;
  g.stroke(p);
  g.fillStyle = fill;
  g.fill(p);
}
function ellipse(x: number, y: number, rx: number, ry: number, rot = 0) {
  const p = new Path2D();
  p.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  return p;
}
function union(...paths: Path2D[]) {
  const p = new Path2D();
  for (const q of paths) p.addPath(q);
  return p;
}
function rrect(x: number, y: number, w: number, h: number, r: number) {
  const p = new Path2D();
  p.roundRect(x, y, w, h, r);
  return p;
}
function line(g: CanvasRenderingContext2D, color: string, lw: number, pts: number[]) {
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  if (pts.length === 6) g.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]);
  else for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.stroke();
}
/** Sombra de color + trama dentro de una forma, desplazada hacia la espalda (izquierda). */
function shadeInside(g: CanvasRenderingContext2D, shape: Path2D, shadowShape: Path2D, base: string) {
  g.save();
  g.clip(shape);
  g.fillStyle = shadowOf(base);
  g.fill(shadowShape);
  g.clip(shadowShape);
  halftone(g, shadowOf(base, 0.6), 0.45);
  g.restore();
}
/** Luz de contorno de los focos en el borde delantero. */
function rimLight(g: CanvasRenderingContext2D, shape: Path2D, base: string, fromX: number, lw = 7) {
  g.save();
  g.clip(shape);
  g.beginPath();
  g.rect(fromX, 0, g.canvas.width, g.canvas.height);
  g.clip();
  g.strokeStyle = lightOf(base, 0.6);
  g.lineWidth = lw;
  g.stroke(shape);
  g.restore();
}

function darken(src: HTMLCanvasElement, amount: number) {
  const out = cv(src.width, src.height);
  const g = out.getContext('2d')!;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = `rgba(30,12,50,${amount})`;
  g.fillRect(0, 0, out.width, out.height);
  return out;
}

/** Borde blanco de pegatina + sombra de papel levantado. */
function sticker(src: HTMLCanvasElement, border = 7) {
  grain(src);
  const w = src.width;
  const h = src.height;
  const tint = (color: string) => {
    const c = cv(w, h);
    const s = c.getContext('2d')!;
    s.drawImage(src, 0, 0);
    s.globalCompositeOperation = 'source-in';
    s.fillStyle = color;
    s.fillRect(0, 0, w, h);
    return c;
  };
  const sil = tint(PAPER);
  const shadow = tint('rgba(30,10,40,0.32)');
  const out = cv(w, h);
  const o = out.getContext('2d')!;
  for (let a = 0; a < 20; a++) {
    const ang = (a / 20) * Math.PI * 2;
    o.drawImage(shadow, Math.cos(ang) * border + 3, Math.sin(ang) * border + 5);
  }
  for (let a = 0; a < 20; a++) {
    const ang = (a / 20) * Math.PI * 2;
    o.drawImage(sil, Math.cos(ang) * border, Math.sin(ang) * border);
  }
  o.drawImage(src, 0, 0);
  return out;
}

// ───────────────────────── cabeza ─────────────────────────
function paintHead(spec: CutoutSpec, shout: boolean): CutPart {
  const { look } = spec;
  const W = 240;
  const c = cv(W, W);
  const g = c.getContext('2d')!;
  const cx = 114;
  const cy = 120;
  const f = look.gender === 'f';
  const rng = new Rng(spec.seed);
  const expr: Expression = shout ? 'neutral' : expressionOf(spec.traits);
  const sk = look.skin;
  const hr = look.hairColor;
  const hrS = shadowOf(hr, 0.4);
  const hrL = lightOf(hr, 0.4);

  // proporciones de la cara según complexión
  const jaw = { slim: [22, 28, 0.9], normal: [26, 30, 1], stocky: [36, 32, 1.05], belly: [34, 36, 1.08] }[look.body];
  const skullRx = (f ? 58 : 61) * jaw[2];
  const skullRy = 67;
  const jawRx = f ? jaw[0] * 0.85 : jaw[0];
  const jawRy = f ? jaw[1] * 0.9 : jaw[1];

  // ── pelo de detrás
  const backHair = () => {
    if (look.hair === 'afro') {
      const parts = [ellipse(cx - 10, cy - 30, 84, 78)];
      for (let i = 0; i < 14; i++) {
        const a = Math.PI * 0.7 + (i / 13) * Math.PI * 1.6;
        parts.push(ellipse(cx - 10 + Math.cos(a) * 80, cy - 30 + Math.sin(a) * 74, 20, 20));
      }
      const p = union(...parts);
      blob(g, p, hr);
      shadeInside(g, p, ellipse(cx - 70, cy - 10, 70, 90), hr);
      for (let i = 0; i < 26; i++) {
        const a = rng.range(Math.PI * 0.8, Math.PI * 2.2);
        const r = rng.range(30, 76);
        g.strokeStyle = hrL;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(cx - 10 + Math.cos(a) * r, cy - 30 + Math.sin(a) * r * 0.9, 6, a, a + 2);
        g.stroke();
      }
    }
    if (look.hair === 'long') {
      const p = new Path2D();
      p.moveTo(cx - 40, cy - 56);
      p.bezierCurveTo(cx - 104, cy - 20, cx - 96, cy + 70, cx - 74, cy + 104);
      p.quadraticCurveTo(cx - 32, cy + 112, cx - 10, cy + 64);
      p.lineTo(cx + 12, cy - 30);
      p.closePath();
      blob(g, p, hrS);
      for (let i = 0; i < 5; i++) line(g, hr, 3, [cx - 60 + i * 6, cy - 30, cx - 86 + i * 8, cy + 30, cx - 66 + i * 8, cy + 96]);
    }
    if (look.hair === 'mullet') {
      const p = new Path2D();
      p.moveTo(cx - 52, cy - 12);
      p.bezierCurveTo(cx - 92, cy + 20, cx - 90, cy + 78, cx - 66, cy + 96);
      p.quadraticCurveTo(cx - 30, cy + 102, cx - 14, cy + 52);
      p.closePath();
      blob(g, p, hrS);
      for (let i = 0; i < 4; i++) line(g, hr, 3, [cx - 56 + i * 7, cy, cx - 80 + i * 8, cy + 50, cx - 60 + i * 9, cy + 92]);
    }
    if (look.hair === 'ponytail') {
      const p = union(ellipse(cx - 78, cy - 26, 22, 17, -0.3));
      const tail = new Path2D();
      tail.moveTo(cx - 90, cy - 18);
      tail.bezierCurveTo(cx - 128, cy + 20, cx - 112, cy + 70, cx - 92, cy + 84);
      tail.quadraticCurveTo(cx - 86, cy + 40, cx - 66, cy - 12);
      tail.closePath();
      p.addPath(tail);
      blob(g, p, hr);
      line(g, hrL, 3, [cx - 98, cy - 4, cx - 112, cy + 36, cx - 98, cy + 70]);
      blob(g, ellipse(cx - 74, cy - 24, 7, 10, -0.3), look.accColor, 3);
    }
    if (look.hair === 'braids') {
      for (const off of [0, 14]) {
        for (let i = 0; i < 6; i++) {
          const y = cy - 6 + i * 17;
          const x = cx - 70 - off + Math.sin(i * 0.8) * 4 + i * 2;
          blob(g, ellipse(x, y, 11, 10, 0.4), i % 2 ? hr : hrS, 3);
        }
        blob(g, ellipse(cx - 58 - off, cy + 100, 6, 5), look.accColor, 3);
      }
    }
    if (look.hair === 'bun') {
      blob(g, ellipse(cx - 34, cy - 84, 28, 26), hr);
      line(g, hrL, 3, [cx - 48, cy - 92, cx - 34, cy - 104, cx - 18, cy - 90]);
      line(g, hrS, 3, [cx - 50, cy - 76, cx - 34, cy - 66, cx - 16, cy - 76]);
      blob(g, rrect(cx - 46, cy - 64, 22, 8, 4), look.accColor, 3);
    }
  };
  backHair();

  // ── cuello
  const neck = rrect(cx - 18, cy + 40, 40, 70, 12);
  blob(g, neck, sk, 5);
  g.save();
  g.clip(neck);
  g.fillStyle = shadowOf(sk, 0.45);
  g.fillRect(cx - 30, cy + 40, 80, 26);
  g.restore();

  // ── oreja
  const ear = ellipse(cx - 52, cy + 8, 14, 18);
  blob(g, ear, sk, 4.5);
  line(g, shadowOf(sk, 0.5), 3.5, [cx - 54, cy - 2, cx - 46, cy + 8, cx - 54, cy + 18]);
  if (f && rng.chance(0.5)) blob(g, ellipse(cx - 52, cy + 32, 5, 7), '#f2c230', 2.5);

  // ── cráneo con mandíbula
  const skull = union(ellipse(cx, cy, skullRx, skullRy), ellipse(cx + 26, cy + 44, jawRx, jawRy));
  if (look.body === 'belly') skull.addPath(ellipse(cx + 18, cy + 66, 30, 16));
  blob(g, skull, sk, 6.5);
  shadeInside(g, skull, union(ellipse(cx - 58, cy + 6, 44, 80), ellipse(cx + 10, cy + 84, 60, 18)), sk);
  rimLight(g, skull, sk, cx + 44, 8);
  // coloretes
  g.fillStyle = 'rgba(236,96,104,0.30)';
  g.fill(ellipse(cx + 24, cy + 26, 16, 9));
  if (f) g.fill(ellipse(cx + 62, cy + 22, 7, 6));

  // ── barba (bajo boca y bigote)
  if (look.facial === 'beard') {
    const p = new Path2D();
    p.moveTo(cx - 46, cy + 8);
    p.bezierCurveTo(cx - 44, cy + 86, cx + 30, cy + 108, cx + 64, cy + 56);
    p.lineTo(cx + 68, cy + 34);
    p.quadraticCurveTo(cx + 36, cy + 30, cx + 10, cy + 42);
    p.quadraticCurveTo(cx - 20, cy + 42, cx - 36, cy + 4);
    p.closePath();
    blob(g, p, hrS, 5);
    for (let i = 0; i < 18; i++) {
      const x = rng.range(cx - 34, cx + 56);
      const y = rng.range(cy + 50, cy + 86);
      line(g, hr, 2.5, [x, y, x + 3, y + 8]);
    }
  } else if (look.facial === 'stubble') {
    g.save();
    g.clip(skull);
    g.fillStyle = shadowOf(hr, 0.2);
    g.globalAlpha = 0.5;
    for (let i = 0; i < 300; i++) {
      const a = rng.range(0.1, Math.PI - 0.2);
      const r = rng.range(40, 78);
      g.fillRect(cx + 12 + Math.cos(a) * r * 0.8, cy + 20 + Math.sin(a) * r * 0.7, 2.5, 2.5);
    }
    g.restore();
  }

  // ── ojos según el gesto
  const big = f ? 1.08 : 1;
  const eye = (x: number, y: number, rx: number, ry: number, pr: number, near: boolean) => {
    rx *= big;
    ry *= big;
    const white = ellipse(x, y, rx, ry);
    blob(g, white, '#ffffff', 2.5);
    let px = x + rx * 0.35;
    let py = y + 2;
    let r = pr;
    if (expr === 'dreamy') {
      px = x + rx * 0.3;
      py = y - ry * 0.35;
    }
    if (expr === 'nervous') r = pr * 0.6;
    if (expr === 'sleepy' || expr === 'smug') py = y + ry * 0.25;
    g.save();
    g.clip(white);
    g.fillStyle = INK;
    g.fill(ellipse(px, py, r, r * 1.12));
    g.fillStyle = '#ffffff';
    g.fill(ellipse(px + 2, py - 2, r * 0.34, r * 0.34));
    // párpado superior según el gesto
    const lid = { neutral: 0.15, smug: 0.5, angry: 0.38, sleepy: 0.62, nervous: 0, happy: 0.2, dreamy: 0.1, dramatic: 0 }[expr];
    if (lid > 0) {
      g.fillStyle = shadowOf(sk, 0.1);
      const tilt = expr === 'angry' ? (near ? 0.25 : 0.35) : 0;
      g.beginPath();
      g.moveTo(x - rx - 2, y - ry - 2);
      g.lineTo(x + rx + 2, y - ry - 2);
      g.lineTo(x + rx + 2, y - ry + ry * 2 * lid - tilt * ry);
      g.lineTo(x - rx - 2, y - ry + ry * 2 * lid + tilt * ry);
      g.closePath();
      g.fill();
    }
    if (expr === 'happy') {
      g.fillStyle = shadowOf(sk, 0.1);
      g.fill(ellipse(x, y + ry * 1.25, rx * 1.3, ry * 0.6));
    }
    g.restore();
    line(g, INK, 3.5, [x - rx, y - ry * 0.2 - (lid > 0.3 ? -ry * 0.4 : 0), x, y - ry - 2 + (lid > 0.3 ? ry * lid : 0), x + rx, y - ry * 0.3]);
    if (f) {
      line(g, INK, 3, [x + rx * 0.6, y - ry * 0.7, x + rx + 6, y - ry - 4]);
      line(g, INK, 3, [x + rx * 0.9, y - ry * 0.3, x + rx + 8, y - ry * 0.6]);
    }
  };
  eye(cx + 18, cy - 6, 13, 16, 6.5, true);
  eye(cx + 48, cy - 8, 10, 14, 5.5, false);

  // ── cejas
  const browW = look.brows === 'thick' || look.brows === 'uni' ? 10 : f ? 4.5 : 6;
  const browCol = shadowOf(hr, 0.15);
  const browY = { neutral: 0, smug: -4, angry: 6, sleepy: 2, nervous: -6, happy: -4, dreamy: -8, dramatic: -10 }[expr];
  const tiltIn = { neutral: 0, smug: 0, angry: 10, sleepy: -2, nervous: -8, happy: 0, dreamy: -2, dramatic: -12 }[expr];
  if (look.brows === 'uni') {
    line(g, browCol, 11, [cx + 2, cy - 30 + browY, cx + 32, cy - 22 + browY + tiltIn, cx + 62, cy - 32 + browY]);
  } else {
    line(g, browCol, browW, [cx + 4, cy - 30 + browY, cx + 18, cy - 38 + browY, cx + 30, cy - 30 + browY + tiltIn]);
    const smugRaise = expr === 'smug' ? -8 : 0;
    line(g, browCol, browW, [cx + 40, cy - 30 + browY + tiltIn, cx + 50, cy - 38 + browY + smugRaise, cx + 62, cy - 33 + browY + smugRaise]);
  }

  // ── nariz (sobresale del perfil: caricatura)
  let nose: Path2D;
  if (look.nose === 'small') nose = ellipse(cx + 61, cy + 12, 12, 10);
  else if (look.nose === 'big') nose = ellipse(cx + 66, cy + 14, 23, 19);
  else {
    nose = new Path2D();
    nose.moveTo(cx + 50, cy - 16);
    nose.quadraticCurveTo(cx + 100, cy + 14, cx + 72, cy + 32);
    nose.quadraticCurveTo(cx + 56, cy + 34, cx + 50, cy + 22);
    nose.closePath();
  }
  blob(g, nose, sk, 4.5);
  shadeInside(g, nose, ellipse(cx + 54, cy + 30, 30, 12), sk);
  g.fillStyle = lightOf(sk, 0.7);
  g.fill(ellipse(cx + 70, cy + 6, 4, 3));
  g.fillStyle = shadowOf(sk, 0.6);
  g.fill(ellipse(cx + 60, cy + 24, 4, 3));

  // ── boca
  const mouthCol = f ? mix(sk, '#b8344a', 0.6) : INK;
  if (shout) {
    const m = ellipse(cx + 36, cy + 48, 18, 16);
    blob(g, m, '#5a1820', 4);
    g.save();
    g.clip(m);
    g.fillStyle = '#ffffff';
    g.fillRect(cx + 16, cy + 30, 40, 8);
    g.fillStyle = '#e0626b';
    g.fill(ellipse(cx + 36, cy + 60, 12, 7));
    g.restore();
  } else {
    switch (expr) {
      case 'smug':
        line(g, mouthCol, 4.5, [cx + 18, cy + 46, cx + 36, cy + 50, cx + 54, cy + 36]);
        break;
      case 'angry': {
        const m = rrect(cx + 18, cy + 40, 32, 12, 4);
        blob(g, m, '#ffffff', 3);
        line(g, INK, 2, [cx + 26, cy + 40, cx + 26, cy + 52]);
        line(g, INK, 2, [cx + 34, cy + 40, cx + 34, cy + 52]);
        line(g, INK, 2, [cx + 42, cy + 40, cx + 42, cy + 52]);
        break;
      }
      case 'sleepy':
        line(g, mouthCol, 4, [cx + 24, cy + 46, cx + 42, cy + 46]);
        break;
      case 'nervous':
        line(g, mouthCol, 3.5, [cx + 18, cy + 46, cx + 24, cy + 42, cx + 30, cy + 47, cx + 36, cy + 42, cx + 42, cy + 47, cx + 48, cy + 42]);
        blob(g, (() => {
          const d = new Path2D();
          d.moveTo(cx + 40, cy - 64);
          d.quadraticCurveTo(cx + 52, cy - 46, cx + 40, cy - 42);
          d.quadraticCurveTo(cx + 28, cy - 46, cx + 40, cy - 64);
          return d;
        })(), '#9fd8ff', 2.5);
        break;
      case 'happy': {
        const m = new Path2D();
        m.moveTo(cx + 14, cy + 40);
        m.quadraticCurveTo(cx + 36, cy + 70, cx + 58, cy + 38);
        m.closePath();
        blob(g, m, '#5a1820', 3.5);
        g.fillStyle = '#ffffff';
        g.fillRect(cx + 20, cy + 40, 32, 6);
        break;
      }
      case 'dramatic':
        blob(g, ellipse(cx + 36, cy + 48, 7, 9), '#5a1820', 3);
        break;
      default:
        line(g, mouthCol, 4.5, [cx + 18, cy + 42, cx + 34, cy + 52, cx + 52, cy + 40]);
    }
    if (f && expr !== 'angry' && expr !== 'happy' && expr !== 'dramatic') {
      g.fillStyle = mix(sk, '#c4455a', 0.45);
      g.fill(ellipse(cx + 36, cy + 52, 9, 4));
    }
  }

  // ── bigote y perilla
  if (look.facial === 'mustache') {
    const m = union(ellipse(cx + 32, cy + 32, 23, 10), ellipse(cx + 59, cy + 31, 18, 10), ellipse(cx + 13, cy + 41, 8, 11), ellipse(cx + 76, cy + 41, 7, 10));
    blob(g, m, hrS, 4);
    for (let i = 0; i < 6; i++) line(g, hrL, 2, [cx + 18 + i * 9, cy + 26, cx + 22 + i * 9, cy + 36]);
  }
  if (look.facial === 'goatee') blob(g, ellipse(cx + 38, cy + 72, 14, 16), hrS, 4);

  // ── pelo de arriba
  const strands = (n: number, x0: number, x1: number, y: number, h: number) => {
    for (let i = 0; i < n; i++) {
      const x = x0 + ((x1 - x0) * i) / Math.max(1, n - 1);
      line(g, hrL, 3, [x, y + h * 0.4, x + 10, y, x + 24, y + h * 0.2]);
    }
  };
  const top = new Path2D();
  switch (look.hair) {
    case 'short':
    case 'long':
    case 'mullet':
    case 'ponytail':
    case 'braids':
    case 'bun': {
      const sleek = look.hair === 'bun' || look.hair === 'braids' || look.hair === 'ponytail';
      top.moveTo(cx - 62, cy + 10);
      top.bezierCurveTo(cx - 80, cy - 62, cx - 10, cy - 100, cx + 42, cy - 74);
      top.quadraticCurveTo(cx + 70, cy - 58, cx + 62, cy - 36);
      if (sleek) top.quadraticCurveTo(cx + 20, cy - 54, cx - 40, cy - 30);
      else {
        top.quadraticCurveTo(cx + 34, cy - 52, cx + 22, cy - 34);
        top.quadraticCurveTo(cx - 8, cy - 54, cx - 36, cy - 22);
      }
      top.quadraticCurveTo(cx - 46, cy - 6, cx - 44, cy + 12);
      top.closePath();
      blob(g, top, hr);
      shadeInside(g, top, ellipse(cx - 60, cy - 20, 40, 50), hr);
      if (look.hair === 'braids') line(g, hrS, 3, [cx - 6, cy - 92, cx + 10, cy - 64]);
      strands(sleek ? 3 : 4, cx - 40, cx + 30, cy - 78, 30);
      break;
    }
    case 'pixie': {
      top.moveTo(cx - 60, cy + 6);
      top.bezierCurveTo(cx - 78, cy - 64, cx - 6, cy - 104, cx + 50, cy - 72);
      top.lineTo(cx + 70, cy - 40);
      top.lineTo(cx + 46, cy - 46);
      top.lineTo(cx + 54, cy - 26);
      top.lineTo(cx + 28, cy - 40);
      top.lineTo(cx + 30, cy - 20);
      top.quadraticCurveTo(cx - 10, cy - 44, cx - 40, cy - 16);
      top.quadraticCurveTo(cx - 44, cy - 2, cx - 44, cy + 8);
      top.closePath();
      blob(g, top, hr);
      shadeInside(g, top, ellipse(cx - 60, cy - 20, 40, 50), hr);
      strands(4, cx - 36, cx + 34, cy - 80, 28);
      break;
    }
    case 'buzz':
      g.save();
      g.clip(skull);
      g.fillStyle = hr;
      g.globalAlpha = 0.85;
      g.fill(ellipse(cx - 6, cy - 64, 80, 34));
      g.fill(ellipse(cx - 56, cy - 20, 22, 46));
      g.globalAlpha = 0.5;
      halftone(g, hrS, 0.6);
      g.restore();
      break;
    case 'afro':
      blob(g, union(ellipse(cx - 10, cy - 62, 56, 26), ellipse(cx + 28, cy - 54, 30, 20)), hr);
      break;
    case 'mohawk': {
      g.save();
      g.clip(skull);
      g.fillStyle = shadowOf(hr, 0.5);
      g.globalAlpha = 0.55;
      g.fill(ellipse(cx - 6, cy - 62, 80, 30));
      g.restore();
      top.moveTo(cx - 56, cy - 30);
      const peaks: [number, number][] = [[cx - 60, cy - 96], [cx - 34, cy - 68], [cx - 20, cy - 118], [cx + 2, cy - 76], [cx + 24, cy - 110], [cx + 32, cy - 66], [cx + 56, cy - 84]];
      for (const [x, y] of peaks) top.lineTo(x, y);
      top.lineTo(cx + 46, cy - 52);
      top.quadraticCurveTo(cx, cy - 74, cx - 56, cy - 30);
      top.closePath();
      blob(g, top, hr, 5);
      shadeInside(g, top, ellipse(cx - 40, cy - 40, 30, 40), hr);
      line(g, hrL, 3, [cx - 18, cy - 70, cx - 16, cy - 104]);
      line(g, hrL, 3, [cx + 22, cy - 70, cx + 22, cy - 98]);
      break;
    }
    case 'curly': {
      const parts: Path2D[] = [];
      for (let i = 0; i < 11; i++) {
        const a = Math.PI * 0.92 + (i / 10) * Math.PI * 0.98;
        parts.push(ellipse(cx - 4 + Math.cos(a) * 60, cy - 18 + Math.sin(a) * 64, 22, 22));
      }
      const p = union(...parts);
      blob(g, p, hr);
      shadeInside(g, p, ellipse(cx - 60, cy - 10, 30, 50), hr);
      for (let i = 0; i < 10; i++) {
        const a = Math.PI * 0.95 + (i / 9) * Math.PI * 0.95;
        g.strokeStyle = hrL;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(cx - 4 + Math.cos(a) * 60, cy - 18 + Math.sin(a) * 64, 9, 3.4, 5.2);
        g.stroke();
      }
      break;
    }
    case 'combover':
      for (let i = 0; i < 4; i++) line(g, hr, 4.5, [cx - 54, cy - 30 - i * 9, cx, cy - 80 - i * 3, cx + 46, cy - 48 - i * 6]);
      blob(g, ellipse(cx - 54, cy - 12, 14, 24), hr, 4);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fill(ellipse(cx + 6, cy - 52, 15, 7, -0.2));
      break;
    case 'bald':
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fill(ellipse(cx - 14, cy - 48, 19, 9, -0.3));
      g.fill(ellipse(cx + 10, cy - 58, 5, 3, -0.3));
      break;
  }

  // ── accesorios
  if (look.accessory === 'headband') {
    line(g, INK, 22, [cx - 60, cy - 28, cx, cy - 52, cx + 60, cy - 40]);
    line(g, look.accColor, 12, [cx - 60, cy - 28, cx, cy - 52, cx + 60, cy - 40]);
    line(g, lightOf(look.accColor, 0.5), 3, [cx - 40, cy - 38, cx, cy - 54, cx + 40, cy - 46]);
  }
  if (look.accessory === 'glasses') {
    g.strokeStyle = INK;
    g.lineWidth = 6;
    for (const [x, rx] of [[cx + 18, 19], [cx + 50, 15]] as const) {
      const lens = ellipse(x, cy - 6, rx, 16);
      g.fillStyle = 'rgba(150,215,255,0.42)';
      g.fill(lens);
      g.stroke(lens);
      line(g, 'rgba(255,255,255,0.8)', 3, [x - rx * 0.4, cy - 14, x - rx * 0.1, cy - 18]);
    }
    line(g, INK, 6, [cx + 1, cy - 8, cx - 48, cy - 2]);
  }
  return { canvas: sticker(c), px: cx + 4, py: cy + 98 };
}

// ───────────────────────── torso ─────────────────────────
function paintTorso(spec: CutoutSpec): CutPart {
  const { look, kit } = spec;
  const W = 190;
  const H = 240;
  const c = cv(W, H);
  const g = c.getContext('2d')!;
  const f = look.gender === 'f';
  const half = { slim: 32, normal: 40, stocky: 50, belly: 42 }[look.body] - (f ? 3 : 0);
  const cx = 92;
  const x0 = cx - half;
  const x1 = cx + half;
  const y0 = 24;
  const y1 = 166;
  const body = new Path2D();
  body.moveTo(x0, y0 + 34);
  body.quadraticCurveTo(x0, y0, x0 + 32, y0);
  body.lineTo(x1 - 28, y0);
  body.quadraticCurveTo(x1, y0, x1, y0 + 34);
  if (look.body === 'belly') body.bezierCurveTo(x1 + 6, y0 + 60, x1 + 52, y0 + 98, x1 + 4, y1);
  else if (f) body.bezierCurveTo(x1 + 2, y0 + 70, x1 - 8, y0 + 96, x1 + 2, y1);
  else body.lineTo(x1 + 2, y1);
  body.lineTo(x0 - 2, y1);
  if (f) body.bezierCurveTo(x0 + 8, y0 + 96, x0 - 2, y0 + 70, x0, y0 + 34);
  body.closePath();

  // pantalón
  const shorts = new Path2D();
  shorts.moveTo(x0 - 5, y1 - 12);
  shorts.lineTo(x1 + (look.body === 'belly' ? 12 : 5), y1 - 12);
  shorts.lineTo(x1 + 8, y1 + 54);
  shorts.quadraticCurveTo(cx, y1 + 60, x0 - 8, y1 + 54);
  shorts.closePath();
  blob(g, shorts, kit.shorts, 5.5);
  shadeInside(g, shorts, ellipse(x0 - 10, y1 + 30, 40, 50), kit.shorts);
  g.save();
  g.clip(shorts);
  g.fillStyle = kit.trim;
  g.fillRect(x1 - 2, y1 - 12, 7, 70);
  g.font = '400 22px "Bowlby One", Impact, sans-serif';
  g.fillStyle = kit.trim;
  g.fillText(String(spec.num), x1 - 34, y1 + 40);
  g.restore();

  // camiseta
  blob(g, body, kit.shirt, 6.5);
  g.save();
  g.clip(body);
  g.fillStyle = kit.shirt2;
  if (kit.pattern === 'stripes') for (let x = x0 - 6; x < x1 + 60; x += 32) g.fillRect(x + 14, 0, 16, H);
  if (kit.pattern === 'hoops') for (let y = y0; y < y1; y += 30) g.fillRect(0, y + 12, W, 14);
  if (kit.pattern === 'half') g.fillRect(0, 0, cx, H);
  if (kit.pattern === 'sash') {
    g.beginPath();
    g.moveTo(x1 - 6, y0 - 10);
    g.lineTo(x1 + 30, y0 + 10);
    g.lineTo(x0 + 10, y1 + 20);
    g.lineTo(x0 - 26, y1);
    g.fill();
  }
  // dorsal en la espalda (lado izquierdo): identifica al jugador a distancia
  g.font = '400 64px "Bowlby One", Impact, sans-serif';
  g.textAlign = 'center';
  g.lineWidth = 6;
  g.strokeStyle = INK;
  g.fillStyle = kit.trim === kit.shirt ? PAPER : kit.trim;
  g.strokeText(String(spec.num), x0 + 8, y0 + 104);
  g.fillText(String(spec.num), x0 + 8, y0 + 104);
  // pliegues de la tela
  line(g, shadowOf(kit.shirt, 0.5), 3, [x0 + 30, y0 + 40, x0 + 46, y0 + 70, x0 + 40, y0 + 104]);
  line(g, shadowOf(kit.shirt, 0.5), 3, [x1 - 16, y0 + 80, x1 - 30, y0 + 104, x1 - 20, y0 + 128]);
  g.restore();
  shadeInside(g, body, ellipse(x0 - 26, y0 + 80, 52, 120), kit.shirt);
  rimLight(g, body, kit.shirt, x1 - 16, 8);
  // cuello y patrocinador
  g.fillStyle = kit.trim;
  g.beginPath();
  g.moveTo(x1 - 42, y0 - 2);
  g.lineTo(x1 - 22, y0 + 20);
  g.lineTo(x1 - 4, y0 - 2);
  g.fill();
  g.save();
  g.clip(body);
  const patch = rrect(x1 - 62, y0 + 48, 54, 24, 6);
  blob(g, patch, PAPER, 2.5);
  g.fillStyle = INK;
  g.font = '400 16px Bangers, Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(spec.chest, x1 - 35, y0 + 61, 48);
  g.restore();
  return { canvas: sticker(c), px: cx, py: y1 };
}

// ───────────────────────── brazos y piernas ─────────────────────────
function paintArm(spec: CutoutSpec): CutPart {
  const { look, kit, keeper } = spec;
  const c = cv(84, 180);
  const g = c.getContext('2d')!;
  const sleeveLen = keeper ? 112 : 54;
  const arm = rrect(30, 36, 26, 98, 13);
  blob(g, arm, look.skin, 5);
  shadeInside(g, arm, rrect(10, 0, 30, 180, 0), look.skin);
  rimLight(g, arm, look.skin, 48, 6);
  const sleeve = new Path2D();
  sleeve.moveTo(19, 42);
  sleeve.quadraticCurveTo(19, 14, 43, 14);
  sleeve.quadraticCurveTo(67, 14, 67, 42);
  sleeve.lineTo(62, 14 + sleeveLen);
  sleeve.lineTo(24, 14 + sleeveLen);
  sleeve.closePath();
  blob(g, sleeve, kit.shirt, 5);
  shadeInside(g, sleeve, rrect(0, 0, 34, 180, 0), kit.shirt);
  g.fillStyle = kit.trim;
  g.fillRect(24, 8 + sleeveLen, 38, 6);
  if (keeper) {
    // guantes de portero
    const glove = union(rrect(22, 120, 42, 40, 14), ellipse(60, 128, 9, 12, 0.5));
    blob(g, glove, '#f4f4f4', 5);
    g.fillStyle = spec.look.accColor;
    g.fillRect(24, 124, 38, 8);
  } else {
    const hand = union(ellipse(43, 142, 17, 16), ellipse(56, 134, 7, 9, 0.5));
    blob(g, hand, look.skin, 5);
    shadeInside(g, hand, ellipse(30, 150, 14, 14), look.skin);
  }
  return { canvas: sticker(c, 6), px: 43, py: 22 };
}

function paintLeg(spec: CutoutSpec): CutPart {
  const { look, kit } = spec;
  const c = cv(104, 206);
  const g = c.getContext('2d')!;
  const down = look.accessory === 'socksDown';
  const leg = rrect(31, 30, 30, 112, 15);
  blob(g, leg, look.skin, 5);
  shadeInside(g, leg, rrect(0, 0, 40, 206, 0), look.skin);
  rimLight(g, leg, look.skin, 54, 6);
  line(g, shadowOf(look.skin, 0.5), 3, [36, 86, 46, 92, 56, 86]);
  const sock = down ? rrect(30, 140, 32, 28, 10) : rrect(29, 94, 34, 74, 12);
  blob(g, sock, kit.socks, 5);
  shadeInside(g, sock, rrect(0, 0, 40, 206, 0), kit.socks);
  if (!down) {
    // espinillera bajo la media
    g.fillStyle = lightOf(kit.socks, 0.25);
    g.fill(rrect(46, 104, 12, 40, 6));
  }
  g.fillStyle = kit.trim;
  g.fillRect(31, down ? 142 : 98, 30, 7);
  const top = rrect(24, 14, 44, 42, 12);
  blob(g, top, kit.shorts, 5);
  shadeInside(g, top, rrect(0, 0, 38, 80, 0), kit.shorts);
  const boot = new Path2D();
  boot.moveTo(26, 160);
  boot.lineTo(68, 160);
  boot.quadraticCurveTo(94, 162, 94, 178);
  boot.quadraticCurveTo(94, 190, 78, 190);
  boot.lineTo(28, 190);
  boot.quadraticCurveTo(20, 176, 26, 160);
  boot.closePath();
  blob(g, boot, look.boots, 5);
  shadeInside(g, boot, ellipse(30, 190, 40, 14), look.boots);
  line(g, PAPER, 3, [40, 166, 52, 182]);
  line(g, PAPER, 3, [50, 166, 62, 182]);
  g.fillStyle = INK;
  for (const x of [34, 50, 66, 82]) g.fill(rrect(x, 190, 6, 7, 2));
  return { canvas: sticker(c, 6), px: 46, py: 22 };
}

export function paintCutout(spec: CutoutSpec): CutoutSet {
  const armFront = paintArm(spec);
  const legFront = paintLeg(spec);
  return {
    head: paintHead(spec, false),
    headShout: paintHead(spec, true),
    torso: paintTorso(spec),
    armFront,
    armBack: { ...armFront, canvas: darken(armFront.canvas, 0.28) },
    legFront,
    legBack: { ...legFront, canvas: darken(legFront.canvas, 0.28) },
  };
}

export function paintBall() {
  const c = cv(100, 100);
  const g = c.getContext('2d')!;
  const ball = ellipse(50, 50, 34, 34);
  blob(g, ball, '#ffffff', 5);
  g.save();
  g.clip(ball);
  g.fillStyle = INK;
  const pent = (x: number, y: number, r: number) => {
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
      g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.fill();
  };
  pent(50, 50, 11);
  pent(26, 36, 8);
  pent(74, 36, 8);
  pent(36, 74, 8);
  pent(64, 74, 8);
  g.fillStyle = shadowOf('#ffffff', 0.4);
  g.globalAlpha = 0.6;
  g.fill(ellipse(30, 68, 30, 26));
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fill(ellipse(62, 32, 8, 5, -0.6));
  g.restore();
  return sticker(c, 6);
}
