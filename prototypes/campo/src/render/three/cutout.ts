import { shade, type Kit, type Look } from '../../content/look';
import { Rng } from '../../sim/rng';

/**
 * Pintor de "cromos recortables": cada parte del cuerpo se dibuja en un lienzo 2D
 * con tinta y relleno plano, y luego se le añade el borde blanco de pegatina.
 * Las caras son caricaturas: aquí es donde vive la personalidad del jugador.
 */
export const PX_PER_M = 200;
const INK = '#2a1d22';
const PAPER = '#fffdf4';

export interface CutPart {
  canvas: HTMLCanvasElement;
  /** Pivote en píxeles del lienzo (hombro, cadera, cuello...). */
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

function cv(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Rellena con tinta exterior: primero el trazo gordo, luego el relleno tapa las líneas interiores. */
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

function darken(src: HTMLCanvasElement, amount: number) {
  const out = cv(src.width, src.height);
  const g = out.getContext('2d')!;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = `rgba(20,10,30,${amount})`;
  g.fillRect(0, 0, out.width, out.height);
  return out;
}

/** Borde blanco de pegatina + leve sombra de papel levantado. */
function sticker(src: HTMLCanvasElement, border = 7) {
  const w = src.width;
  const h = src.height;
  const sil = cv(w, h);
  const s = sil.getContext('2d')!;
  s.drawImage(src, 0, 0);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = PAPER;
  s.fillRect(0, 0, w, h);
  const shadow = cv(w, h);
  const sh = shadow.getContext('2d')!;
  sh.drawImage(src, 0, 0);
  sh.globalCompositeOperation = 'source-in';
  sh.fillStyle = 'rgba(40,20,40,0.28)';
  sh.fillRect(0, 0, w, h);
  const out = cv(w, h);
  const o = out.getContext('2d')!;
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2;
    o.drawImage(shadow, Math.cos(ang) * border + 3, Math.sin(ang) * border + 4);
  }
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2;
    o.drawImage(sil, Math.cos(ang) * border, Math.sin(ang) * border);
  }
  o.drawImage(src, 0, 0);
  return out;
}

function paintHead(look: Look, shout: boolean, seed: number): CutPart {
  const W = 230;
  const c = cv(W, W);
  const g = c.getContext('2d')!;
  const cx = 110;
  const cy = 122;
  const sk = look.skin;
  const skD = shade(sk, -0.2);
  const hr = look.hairColor;
  const hrD = shade(hr, -0.22);
  const rng = new Rng(seed);

  // pelo de detrás
  if (look.hair === 'afro') {
    const parts = [ellipse(cx - 8, cy - 28, 80, 76)];
    for (let i = 0; i < 12; i++) {
      const a = Math.PI * 0.75 + (i / 11) * Math.PI * 1.55;
      parts.push(ellipse(cx - 8 + Math.cos(a) * 76, cy - 28 + Math.sin(a) * 72, 20, 20));
    }
    blob(g, union(...parts), hr);
  }
  if (look.hair === 'long') {
    const p = new Path2D();
    p.moveTo(cx - 40, cy - 50);
    p.bezierCurveTo(cx - 95, cy - 20, cx - 90, cy + 60, cx - 70, cy + 96);
    p.quadraticCurveTo(cx - 30, cy + 104, cx - 10, cy + 60);
    p.lineTo(cx + 10, cy - 30);
    p.closePath();
    blob(g, p, hrD);
  }
  if (look.hair === 'mullet') {
    const p = new Path2D();
    p.moveTo(cx - 50, cy - 10);
    p.bezierCurveTo(cx - 86, cy + 20, cx - 84, cy + 72, cx - 64, cy + 90);
    p.quadraticCurveTo(cx - 30, cy + 96, cx - 14, cy + 50);
    p.closePath();
    blob(g, p, hrD);
  }
  if (look.hair === 'ponytail') {
    const p = union(ellipse(cx - 74, cy - 22, 22, 18, -0.3));
    const tail = new Path2D();
    tail.moveTo(cx - 84, cy - 14);
    tail.quadraticCurveTo(cx - 112, cy + 30, cx - 92, cy + 66);
    tail.quadraticCurveTo(cx - 76, cy + 30, cx - 64, cy - 10);
    tail.closePath();
    p.addPath(tail);
    blob(g, p, hrD);
  }
  // oreja
  blob(g, ellipse(cx - 50, cy + 8, 14, 18), sk, 5);
  g.strokeStyle = skD;
  g.lineWidth = 4;
  g.beginPath();
  g.arc(cx - 50, cy + 8, 7, -1.2, 1.4);
  g.stroke();
  // cráneo + mandíbula
  const skull = union(ellipse(cx, cy, 62, 68), ellipse(cx + 26, cy + 44, 34, 30));
  blob(g, skull, sk);
  g.save();
  g.clip(skull);
  g.fillStyle = skD;
  g.globalAlpha = 0.35;
  g.fillRect(cx - 80, cy - 80, 30, 180);
  g.globalAlpha = 1;
  g.restore();
  // coloretes
  g.fillStyle = 'rgba(232,96,96,0.28)';
  g.fill(ellipse(cx + 24, cy + 28, 15, 9));
  // barba (debajo de boca y bigote)
  if (look.facial === 'beard') {
    const p = new Path2D();
    p.moveTo(cx - 44, cy + 8);
    p.bezierCurveTo(cx - 40, cy + 80, cx + 30, cy + 102, cx + 62, cy + 54);
    p.lineTo(cx + 66, cy + 34);
    p.quadraticCurveTo(cx + 36, cy + 30, cx + 10, cy + 40);
    p.quadraticCurveTo(cx - 20, cy + 40, cx - 34, cy + 4);
    p.closePath();
    blob(g, p, hrD, 5);
  }
  if (look.facial === 'stubble') {
    g.save();
    g.clip(skull);
    g.fillStyle = shade(hr, -0.1);
    g.globalAlpha = 0.45;
    for (let i = 0; i < 260; i++) {
      const a = rng.range(0.1, Math.PI - 0.2);
      const r = rng.range(40, 76);
      const x = cx + 10 + Math.cos(a) * r * 0.8;
      const y = cy + 18 + Math.sin(a) * r * 0.7;
      g.fillRect(x, y, 2.5, 2.5);
    }
    g.restore();
  }
  // ojos
  const eye = (x: number, y: number, rx: number, ry: number, pr: number) => {
    blob(g, ellipse(x, y, rx, ry), '#ffffff', 3);
    g.fillStyle = INK;
    g.fill(ellipse(x + rx * 0.35, y + 2, pr, pr * 1.1));
    g.fillStyle = '#ffffff';
    g.fill(ellipse(x + rx * 0.35 + 2, y - 1, pr * 0.32, pr * 0.32));
  };
  eye(cx + 18, cy - 6, 13, 16, 6.5);
  eye(cx + 48, cy - 8, 10, 14, 5.5);
  // cejas
  g.strokeStyle = hrD;
  g.lineCap = 'round';
  if (look.brows === 'uni') {
    g.lineWidth = 11;
    g.beginPath();
    g.moveTo(cx + 2, cy - 30);
    g.quadraticCurveTo(cx + 32, cy - 22, cx + 62, cy - 32);
    g.stroke();
  } else {
    g.lineWidth = look.brows === 'thick' ? 10 : 5;
    g.beginPath();
    g.moveTo(cx + 6, cy - 28);
    g.quadraticCurveTo(cx + 18, cy - 36, cx + 30, cy - 30);
    g.moveTo(cx + 40, cy - 31);
    g.quadraticCurveTo(cx + 50, cy - 38, cx + 60, cy - 32);
    g.stroke();
  }
  // nariz (sobresale del perfil: caricatura)
  if (look.nose === 'small') blob(g, ellipse(cx + 60, cy + 12, 12, 10), sk, 4);
  else if (look.nose === 'big') blob(g, ellipse(cx + 64, cy + 14, 22, 18), sk, 5);
  else {
    const p = new Path2D();
    p.moveTo(cx + 50, cy - 14);
    p.quadraticCurveTo(cx + 96, cy + 14, cx + 70, cy + 30);
    p.quadraticCurveTo(cx + 56, cy + 32, cx + 50, cy + 22);
    p.closePath();
    blob(g, p, sk, 5);
  }
  g.fillStyle = skD;
  g.fill(ellipse(cx + 60, cy + 22, 4, 3));
  // boca
  if (shout) {
    blob(g, ellipse(cx + 36, cy + 46, 17, 15), '#5a1820', 4);
    g.fillStyle = '#ffffff';
    g.fillRect(cx + 24, cy + 33, 24, 6);
    g.fillStyle = '#e0626b';
    g.fill(ellipse(cx + 36, cy + 54, 10, 5));
  } else {
    g.strokeStyle = INK;
    g.lineWidth = 4.5;
    g.beginPath();
    g.moveTo(cx + 18, cy + 42);
    g.quadraticCurveTo(cx + 34, cy + 50, cx + 50, cy + 40);
    g.stroke();
  }
  // bigote y perilla por encima de la boca
  if (look.facial === 'mustache') {
    blob(g, union(ellipse(cx + 32, cy + 31, 22, 10), ellipse(cx + 58, cy + 30, 18, 10), ellipse(cx + 14, cy + 40, 8, 11), ellipse(cx + 74, cy + 40, 7, 10)), hrD, 4);
  }
  if (look.facial === 'goatee') blob(g, ellipse(cx + 38, cy + 70, 14, 16), hrD, 4);
  // pelo de arriba
  const top = new Path2D();
  switch (look.hair) {
    case 'short':
    case 'long':
    case 'mullet':
    case 'ponytail':
      top.moveTo(cx - 60, cy + 8);
      top.bezierCurveTo(cx - 76, cy - 60, cx - 10, cy - 96, cx + 40, cy - 70);
      top.quadraticCurveTo(cx + 66, cy - 56, cx + 60, cy - 36);
      top.quadraticCurveTo(cx + 30, cy - 50, cx + 20, cy - 34);
      top.quadraticCurveTo(cx - 10, cy - 52, cx - 36, cy - 20);
      top.quadraticCurveTo(cx - 44, cy - 6, cx - 42, cy + 10);
      top.closePath();
      blob(g, top, hr);
      break;
    case 'buzz':
      g.save();
      g.clip(skull);
      g.fillStyle = hr;
      g.globalAlpha = 0.8;
      g.fillRect(cx - 70, cy - 80, 140, 40);
      g.fillRect(cx - 70, cy - 80, 26, 96);
      g.restore();
      break;
    case 'afro':
      blob(g, union(ellipse(cx - 10, cy - 58, 54, 26), ellipse(cx + 26, cy - 52, 30, 20)), hr);
      break;
    case 'mohawk': {
      g.save();
      g.clip(skull);
      g.fillStyle = shade(hr, -0.4);
      g.globalAlpha = 0.45;
      g.fillRect(cx - 70, cy - 80, 140, 34);
      g.restore();
      top.moveTo(cx - 54, cy - 30);
      const peaks: [number, number][] = [[cx - 56, cy - 92], [cx - 32, cy - 66], [cx - 18, cy - 112], [cx + 2, cy - 74], [cx + 22, cy - 104], [cx + 30, cy - 66], [cx + 50, cy - 80]];
      for (const [x, y] of peaks) top.lineTo(x, y);
      top.lineTo(cx + 44, cy - 52);
      top.quadraticCurveTo(cx, cy - 72, cx - 54, cy - 30);
      top.closePath();
      blob(g, top, hr, 5);
      break;
    }
    case 'curly': {
      const parts: Path2D[] = [];
      for (let i = 0; i < 10; i++) {
        const a = Math.PI * 0.95 + (i / 9) * Math.PI * 0.95;
        parts.push(ellipse(cx - 4 + Math.cos(a) * 58, cy - 18 + Math.sin(a) * 62, 22, 22));
      }
      blob(g, union(...parts), hr);
      break;
    }
    case 'combover':
      g.strokeStyle = hr;
      g.lineWidth = 5;
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.moveTo(cx - 52, cy - 32 - i * 10);
        g.quadraticCurveTo(cx, cy - 78 - i * 4, cx + 44, cy - 50 - i * 6);
        g.stroke();
      }
      blob(g, ellipse(cx - 52, cy - 12, 14, 22), hr, 4);
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.fill(ellipse(cx + 4, cy - 50, 14, 7, -0.2));
      break;
    case 'bald':
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fill(ellipse(cx - 14, cy - 46, 18, 9, -0.3));
      break;
  }
  // accesorios
  if (look.accessory === 'headband') {
    g.lineCap = 'round';
    g.strokeStyle = INK;
    g.lineWidth = 22;
    g.beginPath();
    g.moveTo(cx - 58, cy - 26);
    g.quadraticCurveTo(cx, cy - 50, cx + 58, cy - 38);
    g.stroke();
    g.strokeStyle = look.accColor;
    g.lineWidth = 12;
    g.stroke();
  }
  if (look.accessory === 'glasses') {
    g.strokeStyle = INK;
    g.lineWidth = 6;
    g.fillStyle = 'rgba(140,210,255,0.45)';
    for (const [x, rx] of [[cx + 18, 18], [cx + 50, 14]] as const) {
      const lens = ellipse(x, cy - 6, rx, 15);
      g.fill(lens);
      g.stroke(lens);
    }
    g.beginPath();
    g.moveTo(cx + 2, cy - 8);
    g.lineTo(cx - 46, cy - 2);
    g.stroke();
  }
  return { canvas: sticker(c), px: cx + 4, py: cy + 92 };
}

function paintTorso(look: Look, kit: Kit, chest: string): CutPart {
  const W = 180;
  const H = 230;
  const c = cv(W, H);
  const g = c.getContext('2d')!;
  const half = { slim: 32, normal: 40, stocky: 50, belly: 40 }[look.body];
  const x0 = 88 - half;
  const x1 = 88 + half;
  const y0 = 22;
  const y1 = 160;
  const body = new Path2D();
  body.moveTo(x0, y0 + 34);
  body.quadraticCurveTo(x0, y0, x0 + 32, y0);
  body.lineTo(x1 - 28, y0);
  body.quadraticCurveTo(x1, y0, x1, y0 + 34);
  if (look.body === 'belly') body.bezierCurveTo(x1 + 4, y0 + 60, x1 + 50, y0 + 96, x1 + 4, y1);
  else body.lineTo(x1 + 2, y1);
  body.lineTo(x0 - 2, y1);
  body.closePath();
  // pantalón
  const shorts = new Path2D();
  shorts.moveTo(x0 - 4, y1 - 10);
  shorts.lineTo(x1 + (look.body === 'belly' ? 10 : 4), y1 - 10);
  shorts.lineTo(x1 + 6, y1 + 50);
  shorts.quadraticCurveTo(88, y1 + 56, x0 - 6, y1 + 50);
  shorts.closePath();
  blob(g, shorts, kit.shorts, 5);
  blob(g, body, kit.shirt, 6);
  g.save();
  g.clip(body);
  g.fillStyle = kit.shirt2;
  if (kit.pattern === 'stripes') for (let x = x0 - 4; x < x1 + 60; x += 32) g.fillRect(x + 14, 0, 16, H);
  if (kit.pattern === 'hoops') for (let y = y0; y < y1; y += 30) g.fillRect(0, y + 12, W, 14);
  if (kit.pattern === 'half') g.fillRect(0, 0, 88, H);
  if (kit.pattern === 'sash') {
    g.beginPath();
    g.moveTo(x1 - 6, y0 - 10);
    g.lineTo(x1 + 30, y0 + 10);
    g.lineTo(x0 + 10, y1 + 20);
    g.lineTo(x0 - 26, y1);
    g.fill();
  }
  // sombra del costado (cel shading)
  g.fillStyle = 'rgba(20,10,40,0.16)';
  g.fillRect(0, 0, x0 + 22, H);
  // cuello
  g.fillStyle = kit.trim;
  g.beginPath();
  g.moveTo(x1 - 40, y0 - 2);
  g.lineTo(x1 - 22, y0 + 18);
  g.lineTo(x1 - 6, y0 - 2);
  g.fill();
  // patrocinador en el pecho
  g.fillStyle = PAPER;
  g.beginPath();
  g.roundRect(x1 - 58, y0 + 46, 50, 22, 6);
  g.fill();
  g.fillStyle = INK;
  g.font = '700 15px Bangers, Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(chest, x1 - 33, y0 + 58, 46);
  g.restore();
  g.strokeStyle = INK;
  g.lineWidth = 6;
  g.stroke(body);
  return { canvas: sticker(c), px: 88, py: y1 };
}

function paintArm(look: Look, kit: Kit): CutPart {
  const c = cv(80, 170);
  const g = c.getContext('2d')!;
  const arm = new Path2D();
  arm.roundRect(28, 34, 26, 96, 13);
  blob(g, arm, look.skin, 5);
  const sleeve = new Path2D();
  sleeve.moveTo(18, 40);
  sleeve.quadraticCurveTo(18, 14, 41, 14);
  sleeve.quadraticCurveTo(64, 14, 64, 40);
  sleeve.lineTo(60, 66);
  sleeve.lineTo(22, 66);
  sleeve.closePath();
  blob(g, sleeve, kit.shirt, 5);
  blob(g, union(ellipse(41, 136, 17, 16), ellipse(54, 128, 7, 9, 0.5)), look.skin, 5);
  return { canvas: sticker(c, 6), px: 41, py: 22 };
}

function paintLeg(look: Look, kit: Kit): CutPart {
  const c = cv(100, 200);
  const g = c.getContext('2d')!;
  const down = look.accessory === 'socksDown';
  blob(g, (() => { const p = new Path2D(); p.roundRect(30, 30, 30, 110, 15); return p; })(), look.skin, 5);
  const sock = new Path2D();
  if (down) sock.roundRect(30, 138, 30, 26, 10);
  else sock.roundRect(29, 92, 32, 72, 12);
  blob(g, sock, kit.socks, 5);
  g.fillStyle = kit.trim;
  g.fillRect(31, down ? 140 : 96, 28, 6);
  const top = new Path2D();
  top.roundRect(24, 14, 42, 40, 12);
  blob(g, top, kit.shorts, 5);
  const boot = new Path2D();
  boot.moveTo(26, 158);
  boot.lineTo(66, 158);
  boot.quadraticCurveTo(90, 160, 90, 176);
  boot.quadraticCurveTo(90, 186, 76, 186);
  boot.lineTo(28, 186);
  boot.quadraticCurveTo(20, 172, 26, 158);
  boot.closePath();
  blob(g, boot, look.boots, 5);
  g.strokeStyle = PAPER;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(40, 164);
  g.lineTo(52, 178);
  g.moveTo(50, 164);
  g.lineTo(62, 178);
  g.stroke();
  return { canvas: sticker(c, 6), px: 45, py: 22 };
}

export function paintCutout(look: Look, kit: Kit, chest: string, seed: number): CutoutSet {
  const armFront = paintArm(look, kit);
  const legFront = paintLeg(look, kit);
  return {
    head: paintHead(look, false, seed),
    headShout: paintHead(look, true, seed),
    torso: paintTorso(look, kit, chest),
    armFront,
    armBack: { ...armFront, canvas: darken(armFront.canvas, 0.25) },
    legFront,
    legBack: { ...legFront, canvas: darken(legFront.canvas, 0.25) },
  };
}

export function paintBall() {
  const c = cv(96, 96);
  const g = c.getContext('2d')!;
  blob(g, ellipse(48, 48, 34, 34), '#ffffff', 5);
  g.fillStyle = INK;
  const pent = (x: number, y: number, r: number) => {
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
      g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.fill();
  };
  pent(48, 48, 11);
  pent(24, 34, 7);
  pent(72, 34, 7);
  pent(34, 72, 7);
  pent(64, 72, 7);
  return sticker(c, 6);
}
