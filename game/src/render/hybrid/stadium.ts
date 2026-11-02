import * as THREE from 'three';
import { SPONSORS } from '../../content/sponsors';
import { BOX_D, BOX_W, CENTER_R, GOAL_H, GOAL_Y0, GOAL_Y1, PENALTY_D, PITCH_L, PITCH_W, SIX_D, SIX_W } from '../../sim/geometry';
import { Rng } from '../../sim/rng';

/**
 * Estadio 3D por niveles. Nivel 0 = campo de tierra del barrio; cada mejora comprada en la carrera
 * añade césped, gradas, focos... Todo se construye con código y texturas pintadas en lienzo.
 * Coordenadas Three: x = x_motor − 52,5; z = y_motor − 34; y hacia arriba.
 */
export interface LightSpot {
  pos: THREE.Vector3;
  power: number;
}
export interface Spot {
  pos: THREE.Vector3;
  kind: 'steps' | 'fence' | 'bar' | 'balcony' | 'stand' | 'wall';
}
export interface Stadium {
  group: THREE.Group;
  lights: LightSpot[];
  spots: Spot[];
  groundMats: THREE.MeshLambertMaterial[];
  windowMats: THREE.MeshLambertMaterial[];
  puddles: THREE.Vector3[];
  update(time: number, wind: number): void;
}

const HX = PITCH_L / 2;
const HZ = PITCH_W / 2;
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const matCache = new Map<string, THREE.MeshLambertMaterial>();
const mat = (c: string) => {
  let m = matCache.get(c);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: c });
    matCache.set(c, m);
  }
  return m;
};
function tex(cv: HTMLCanvasElement, nearest = false) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  if (nearest) {
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
  } else t.anisotropy = 4;
  return t;
}
function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

// ───────────────────────── césped / tierra ─────────────────────────
function paintGround(level: number) {
  const PPM = 8;
  const M = 8;
  const W = (PITCH_L + M * 2) * PPM;
  const H = (PITCH_W + M * 2) * PPM;
  const [cv, g] = canvas(W, H);
  const X = (x: number) => (x + M) * PPM;
  const Y = (y: number) => (y + M) * PPM;
  const rng = new Rng(31 + level);
  if (level === 0) {
    // tierra apisonada con calvas de hierba, piedras y charcos secos
    g.fillStyle = '#9a7650';
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 5200; i++) {
      g.fillStyle = rng.pick(['#93714c', '#a07d56', '#a4825b', '#8d6c49']);
      const r = rng.range(1.5, 5);
      g.beginPath();
      g.ellipse(rng.range(0, W), rng.range(0, H), r * 1.6, r, rng.range(0, 3), 0, Math.PI * 2);
      g.fill();
    }
    // hierba solo donde no se pisa (bandas y esquinas)
    for (let i = 0; i < 1400; i++) {
      const edge = rng.chance(0.5);
      const x = edge ? rng.pick([rng.range(0, X(6)), rng.range(X(PITCH_L - 6), W)]) : rng.range(0, W);
      const y = edge ? rng.range(0, H) : rng.pick([rng.range(0, Y(4)), rng.range(Y(PITCH_W - 4), H)]);
      g.fillStyle = rng.pick(['#6f7a3c', '#5f6c33', '#808a45']);
      g.fillRect(x, y, rng.range(2, 6), rng.range(1, 4));
    }
    for (let i = 0; i < 500; i++) {
      g.fillStyle = rng.pick(['#c9c1b2', '#a8a196', '#6c655c']);
      g.fillRect(rng.range(0, W), rng.range(0, H), 2, 2);
    }
  } else {
    g.fillStyle = level === 1 ? '#4c8a3e' : '#3f8a47';
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 14; i++) {
      g.fillStyle = level === 1 ? (i % 2 ? '#568f42' : '#4a843b') : i % 2 ? '#47974d' : '#3d8a45';
      g.fillRect((i * W) / 14, 0, W / 14 + 1, H);
    }
    for (let i = 0; i < 6000; i++) {
      g.fillStyle = rng.chance(0.5) ? 'rgba(30,60,20,0.25)' : 'rgba(150,200,110,0.15)';
      g.fillRect(rng.range(0, W), rng.range(0, H), 2, 2);
    }
    if (level === 1)
      for (const gx of [2.5, PITCH_L - 2.5]) {
        g.fillStyle = 'rgba(140,105,70,0.75)';
        g.beginPath();
        g.ellipse(X(gx), Y(HZ), 5 * PPM, 9 * PPM, 0, 0, Math.PI * 2);
        g.fill();
      }
  }
  // líneas de cal: en el barrio, torcidas y medio borradas
  const faded = level === 0;
  g.strokeStyle = faded ? 'rgba(238,232,214,0.75)' : '#f2f5ec';
  g.lineWidth = faded ? 3 : 2.5;
  g.setLineDash(faded ? [18, 6, 9, 4] : []);
  const wob = faded ? 2.2 : 0;
  const line = (pts: [number, number][]) => {
    g.beginPath();
    pts.forEach(([x, y], i) => {
      const px = X(x) + rng.range(-wob, wob);
      const py = Y(y) + rng.range(-wob, wob);
      if (i) g.lineTo(px, py);
      else g.moveTo(px, py);
    });
    g.stroke();
  };
  const seg = (x0: number, y0: number, x1: number, y1: number) => {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 3));
    line(Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]));
  };
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number) =>
    line(Array.from({ length: 40 }, (_, i) => [cx + Math.cos(a0 + ((a1 - a0) * i) / 39) * r, cy + Math.sin(a0 + ((a1 - a0) * i) / 39) * r]));
  seg(0, 0, PITCH_L, 0);
  seg(PITCH_L, 0, PITCH_L, PITCH_W);
  seg(PITCH_L, PITCH_W, 0, PITCH_W);
  seg(0, PITCH_W, 0, 0);
  seg(HX, 0, HX, PITCH_W);
  arc(HX, HZ, CENTER_R, 0, Math.PI * 2);
  for (const sd of [0, 1]) {
    const gx = sd ? PITCH_L : 0;
    const dir = sd ? -1 : 1;
    seg(gx, HZ - BOX_W / 2, gx + dir * BOX_D, HZ - BOX_W / 2);
    seg(gx + dir * BOX_D, HZ - BOX_W / 2, gx + dir * BOX_D, HZ + BOX_W / 2);
    seg(gx + dir * BOX_D, HZ + BOX_W / 2, gx, HZ + BOX_W / 2);
    seg(gx, HZ - SIX_W / 2, gx + dir * SIX_D, HZ - SIX_W / 2);
    seg(gx + dir * SIX_D, HZ - SIX_W / 2, gx + dir * SIX_D, HZ + SIX_W / 2);
    seg(gx + dir * SIX_D, HZ + SIX_W / 2, gx, HZ + SIX_W / 2);
    const a = Math.acos((BOX_D - PENALTY_D) / CENTER_R);
    if (dir > 0) arc(gx + PENALTY_D, HZ, CENTER_R, -a, a);
    else arc(gx - PENALTY_D, HZ, CENTER_R, Math.PI - a, Math.PI + a);
  }
  g.setLineDash([]);
  return { tex: tex(cv), w: PITCH_L + M * 2, h: PITCH_W + M * 2 };
}

function windowTexture(seed: number, wall: string) {
  const [cv, g] = canvas(64, 96);
  const rng = new Rng(seed);
  g.fillStyle = wall;
  g.fillRect(0, 0, 64, 96);
  for (let y = 6; y < 92; y += 14)
    for (let x = 5; x < 60; x += 14) {
      // ventana con cristal, persiana a medio bajar y alguna maceta
      g.fillStyle = '#5a7896';
      g.fillRect(x, y, 9, 9);
      g.fillStyle = '#8fb4d0';
      g.fillRect(x + 1, y + 1, 3, 3);
      g.fillStyle = rng.pick(['#3f7a52', '#2f6f8a', '#8a5a3a', '#c8763a']);
      g.fillRect(x, y, 9, rng.int(2, 5));
      g.fillStyle = '#f4ecd8';
      g.fillRect(x - 1, y + 9, 11, 1);
      if (rng.chance(0.35)) {
        g.fillStyle = rng.pick(['#e23b3b', '#f2c94c', '#ff7aa8', '#ffffff']);
        g.fillRect(x + 1, y + 7, 2, 2);
        g.fillRect(x + 5, y + 7, 2, 2);
        g.fillStyle = '#3f8a3a';
        g.fillRect(x, y + 8, 9, 1);
      }
    }
  const [ecv, eg] = canvas(64, 96);
  eg.fillStyle = '#000';
  eg.fillRect(0, 0, 64, 96);
  for (let y = 6; y < 92; y += 14)
    for (let x = 5; x < 60; x += 14)
      if (rng.chance(0.4)) {
        eg.fillStyle = rng.pick(['#ffcf7a', '#ffb860', '#bfe0ff']);
        eg.fillRect(x, y, 9, 9);
      }
  const t = tex(cv, true);
  const e = tex(ecv, true);
  return { map: t, emissive: e };
}

function signTexture(text: string, bg: string, fg: string, w = 256, h = 48, font = '700 30px "Barlow Condensed", Impact, sans-serif') {
  const [cv, g] = canvas(w, h);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 1, w - 10);
  return tex(cv);
}

function fenceTexture() {
  const [cv, g] = canvas(32, 32);
  g.strokeStyle = 'rgba(200,205,210,0.95)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(0, 16);
  g.lineTo(16, 0);
  g.lineTo(32, 16);
  g.lineTo(16, 32);
  g.closePath();
  g.stroke();
  const t = tex(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ───────────────────────── construcción ─────────────────────────
export function buildStadium(level: number): Stadium {
  const group = new THREE.Group();
  const lights: LightSpot[] = [];
  const spots: Spot[] = [];
  const windowMats: THREE.MeshLambertMaterial[] = [];
  const waving: { mesh: THREE.Mesh; base: Float32Array; amp: number }[] = [];
  const rng = new Rng(9 + level);
  const box = (w: number, h: number, d: number, color: string | THREE.Material, x: number, y: number, z: number, shadow = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'string' ? mat(color) : color);
    m.position.set(x, y + h / 2, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const cyl = (r: number, h: number, color: string, x: number, y: number, z: number, seg = 8) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat(color));
    m.position.set(x, y + h / 2, z);
    m.castShadow = true;
    group.add(m);
    return m;
  };

  // suelo exterior (asfalto y tierra del barrio)
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(320, 240), new THREE.MeshLambertMaterial({ color: level === 0 ? '#7d6a55' : '#5d5a58' }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.03;
  outer.receiveShadow = true;
  group.add(outer);
  const { tex: gt, w, h } = paintGround(level);
  const groundMat = new THREE.MeshLambertMaterial({ map: gt });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(w, h), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  const groundMats = [groundMat, outer.material as THREE.MeshLambertMaterial];

  // porterías
  const post = level === 0 ? '#b9aea0' : '#f4f4f0';
  for (const sd of [-1, 1]) {
    const gx = sd * HX;
    for (const gy of [GOAL_Y0 - HZ, GOAL_Y1 - HZ]) {
      cyl(0.08, GOAL_H, post, gx, 0, gy);
      if (level === 0) cyl(0.085, 0.4, '#8a4b2a', gx, 0.9, gy, 6);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, GOAL_Y1 - GOAL_Y0, 8), mat(post));
    bar.rotation.x = Math.PI / 2;
    bar.position.set(gx, GOAL_H, 0);
    bar.castShadow = true;
    group.add(bar);
    if (level >= 1) {
      const [nc, ng] = canvas(32, 32);
      ng.strokeStyle = 'rgba(255,255,255,0.85)';
      ng.lineWidth = 2;
      for (let i = 0; i <= 32; i += 8) {
        ng.beginPath();
        ng.moveTo(i, 0);
        ng.lineTo(i, 32);
        ng.moveTo(0, i);
        ng.lineTo(32, i);
        ng.stroke();
      }
      const nt = tex(nc);
      nt.wrapS = nt.wrapT = THREE.RepeatWrapping;
      nt.repeat.set(7, 3);
      const nm = new THREE.MeshBasicMaterial({ map: nt, transparent: true, side: THREE.DoubleSide, depthWrite: false });
      const back = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_Y1 - GOAL_Y0, GOAL_H), nm);
      back.rotation.y = Math.PI / 2;
      back.position.set(gx + sd * 1.8, GOAL_H / 2, 0);
      group.add(back);
      for (const gy of [GOAL_Y0 - HZ, GOAL_Y1 - HZ]) {
        const side = new THREE.Mesh(new THREE.PlaneGeometry(1.8, GOAL_H), nm);
        side.position.set(gx + sd * 0.9, GOAL_H / 2, gy);
        group.add(side);
      }
    }
  }

  // bloques de pisos alrededor: el barrio mira (o no) el partido
  // fachadas de barrio con color (ocre, teja, crema, salvia, melocotón), no bloques grises
  const walls = ['#e8c48a', '#eaa47c', '#f1e3c6', '#c9d8b8', '#f0b98f', '#b9d1e0'];
  const addBlock = (x: number, z: number, bw: number, bh: number, bd: number, i: number, rotY = 0) => {
    const { map, emissive } = windowTexture(i * 7 + 3, walls[i % walls.length]);
    map.wrapS = map.wrapT = emissive.wrapS = emissive.wrapT = THREE.RepeatWrapping;
    map.repeat.set(bw / 8, bh / 12);
    emissive.repeat.copy(map.repeat);
    const m = new THREE.MeshLambertMaterial({ map, emissiveMap: emissive, emissive: new THREE.Color('#000000') });
    windowMats.push(m);
    const side = walls[(i + 2) % walls.length];
    const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), [mat(side), mat(side), mat('#b5654a'), mat('#8a5a44'), m, m]);
    b.position.set(x, bh / 2, z);
    b.rotation.y = rotY;
    b.castShadow = true;
    group.add(b);
    if (rng.chance(0.6)) box(1.4, 1.6, 1.4, '#d8d8d8', x + rng.range(-bw / 3, bw / 3), bh, z, false);
    // tendedero con ropa al viento
    if (rng.chance(0.7)) {
      const [lc, lg] = canvas(64, 16);
      for (let k = 0; k < 6; k++) {
        lg.fillStyle = rng.pick(['#e23b3b', '#f2f0ea', '#2f6fd6', '#f2c94c', '#3fae5a', '#7d55d9']);
        lg.fillRect(k * 11 + 1, 0, 8, rng.range(8, 15));
      }
      const geo = new THREE.PlaneGeometry(6, 1.4, 8, 2);
      const lm = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex(lc, true), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
      lm.position.set(x + rng.range(-bw / 4, bw / 4), bh * rng.range(0.35, 0.75), z + bd / 2 + 0.8);
      group.add(lm);
      waving.push({ mesh: lm, base: (geo.attributes.position.array as Float32Array).slice(), amp: 0.25 });
    }
    return b;
  };
  let bi = 0;
  for (let x = -95; x < 100; x += rng.range(17, 24)) addBlock(x, -HZ - rng.range(36, 48), rng.range(12, 18), rng.range(10, 22), 10, bi++);
  for (const sd of [-1, 1]) for (let z = -40; z < 30; z += rng.range(18, 24)) addBlock(sd * (HX + rng.range(34, 44)), z, 10, rng.range(9, 18), rng.range(12, 16), bi++, Math.PI / 2);
  // balcón con vecino mirando
  spots.push({ pos: v3(-6, 9.2, -HZ - 30.5), kind: 'balcony' });
  // árboles
  for (let i = 0; i < 9; i++) {
    const x = rng.pick([-1, 1]) * rng.range(HX + 8, HX + 28);
    const z = rng.range(-HZ - 20, HZ + 12);
    cyl(0.25, 2.2, '#5a3d2a', x, 0, z, 6);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(rng.range(1.8, 2.8), 0), mat(rng.pick(['#3f6b35', '#4d7a3a', '#5b8a41'])));
    crown.position.set(x, 3.6, z);
    crown.castShadow = true;
    group.add(crown);
  }

  if (level === 0) {
    // valla metálica (fondo y fondos laterales)
    const ft = fenceTexture();
    const fenceMat = new THREE.MeshBasicMaterial({ map: ft, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, color: '#c7ccd2' });
    const fence = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const tt = ft.clone();
      tt.needsUpdate = true;
      tt.repeat.set(len / 1.2, 3.5 / 1.2);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 3.5), fenceMat.clone());
      (m.material as THREE.MeshBasicMaterial).map = tt;
      m.position.set((x0 + x1) / 2, 1.75, (z0 + z1) / 2);
      m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
      group.add(m);
      for (let i = 0; i <= Math.round(len / 4); i++) cyl(0.05, 3.6, '#8d9298', x0 + ((x1 - x0) * i) / Math.round(len / 4), 0, z0 + ((z1 - z0) * i) / Math.round(len / 4), 5);
    };
    fence(-HX - 4, -HZ - 3.5, HX + 4, -HZ - 3.5);
    fence(-HX - 4, -HZ - 3.5, -HX - 4, HZ + 3);
    fence(HX + 4, -HZ - 3.5, HX + 4, HZ + 3);
    for (let x = -HX + 4; x < HX - 4; x += 2.6) spots.push({ pos: v3(x + rng.range(-0.4, 0.4), 0, -HZ - 4.4), kind: 'fence' });
    // mural del club pintado por los vecinos detrás de la valla
    const [wc, wg] = canvas(512, 64);
    wg.fillStyle = '#f1e3c6';
    wg.fillRect(0, 0, 512, 64);
    for (let x = 0; x < 120; x += 16) {
      wg.fillStyle = (x / 16) % 2 ? '#1d1d22' : '#f0822a';
      wg.fillRect(x, 0, 16, 64);
    }
    wg.font = '700 34px Bangers, Impact, sans-serif';
    wg.fillStyle = '#1d1d22';
    wg.fillText('ATLÉTICO BARRIOBAJO', 134, 40);
    wg.font = '700 16px Bangers, Impact, sans-serif';
    wg.fillStyle = '#c24d16';
    wg.fillText('DESDE 1974 · EL BARRIO CONTIGO', 140, 58);
    wg.fillStyle = '#3f8a3a';
    wg.fillRect(0, 60, 512, 4);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(60, 2.2, 0.4), [mat('#e8dcc0'), mat('#e8dcc0'), mat('#e8dcc0'), mat('#e8dcc0'), new THREE.MeshLambertMaterial({ map: tex(wc) }), mat('#e8dcc0')]);
    wall.position.set(18, 1.1, -HZ - 9.5);
    wall.castShadow = true;
    group.add(wall);
    for (let x = 30; x < 46; x += 3) spots.push({ pos: v3(x, 2.2, -HZ - 9.5), kind: 'wall' });
    // tres escalones de obra
    for (let i = 0; i < 3; i++) {
      box(22, 0.45 * (i + 1), 1.1, i % 2 ? '#a7a29a' : '#b6b1a8', -10, 0, -HZ - 6.2 - i * 1.1);
      for (let x = -19; x <= -1; x += 2.2) spots.push({ pos: v3(x + rng.range(-0.3, 0.3), 0.45 * (i + 1), -HZ - 6.2 - i * 1.1), kind: 'steps' });
    }
    // banquillos caseros con techo de chapa
    for (const x of [-26, 6]) {
      box(6, 0.5, 1, '#6a4e36', x, 0, -HZ - 5);
      box(6.4, 0.08, 2, '#9aa3ad', x, 2.3, -HZ - 5.2);
      for (const dx of [-3, 3]) cyl(0.06, 2.3, '#7a7f86', x + dx, 0, -HZ - 4.4, 5);
    }
    // Bar Manolo
    const bx = -HX - 12;
    const bz = -HZ - 8;
    box(8, 3.2, 5, '#efe6d6', bx, 0, bz);
    box(8.4, 0.3, 5.4, '#b23b2e', bx, 3.2, bz);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.9), new THREE.MeshLambertMaterial({ map: signTexture('BAR MANOLO', '#c8102e', '#ffe9a8') }));
    sign.position.set(bx, 2.8, bz + 2.52);
    group.add(sign);
    const [ac, ag] = canvas(64, 16);
    for (let i = 0; i < 8; i++) {
      ag.fillStyle = i % 2 ? '#f2f0ea' : '#c8102e';
      ag.fillRect(i * 8, 0, 8, 16);
    }
    const awning = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.2), new THREE.MeshLambertMaterial({ map: tex(ac, true), side: THREE.DoubleSide }));
    awning.position.set(bx, 2.4, bz + 3.4);
    awning.rotation.x = -Math.PI / 2 + 0.45;
    awning.castShadow = true;
    group.add(awning);
    box(6, 1.1, 0.6, '#8a5a3a', bx, 0, bz + 2.9);
    spots.push({ pos: v3(bx - 1.2, 0, bz + 2.4), kind: 'bar' });
    for (const [tx, tz] of [
      [bx + 7, bz + 5],
      [bx + 10, bz + 2.5],
    ]) {
      cyl(0.5, 0.75, '#e9e4d8', tx, 0, tz, 10);
      cyl(0.04, 2.2, '#cfcfcf', tx, 0, tz, 4);
      const um = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.6, 8), mat('#f2c94c'));
      um.position.set(tx, 2.3, tz);
      group.add(um);
      spots.push({ pos: v3(tx + 0.9, 0, tz + 0.3), kind: 'bar' });
    }
    // un poste de madera con un foco (el único) y una farola
    cyl(0.18, 11, '#6b4a30', -HX + 18, 0, -HZ - 4.6, 6);
    box(1.6, 0.6, 0.5, '#3a3a40', -HX + 18, 11, -HZ - 4.3);
    lights.push({ pos: v3(-HX + 18, 11.2, -HZ - 3.8), power: 1 });
    cyl(0.1, 6.5, '#4a4f58', HX - 14, 0, -HZ - 4.6, 6);
    lights.push({ pos: v3(HX - 14, 6.6, -HZ - 4.2), power: 0.45 });
  }

  if (level >= 1) {
    // vallas publicitarias
    let x = -HX + 2;
    let i = 0;
    while (x < HX - 2) {
      const sp = SPONSORS[i++ % SPONSORS.length];
      const bw = 12;
      const m = new THREE.Mesh(new THREE.BoxGeometry(bw, 1, 0.2), [mat('#333'), mat('#333'), mat('#333'), mat('#333'), new THREE.MeshLambertMaterial({ map: signTexture(sp.name, sp.bg, sp.fg) }), mat('#333')]);
      m.position.set(x + bw / 2, 0.5, -HZ - 2.2);
      group.add(m);
      x += bw + 0.4;
    }
    // grada (cubierta en nivel 1, doble en nivel 2)
    const tiers = level === 1 ? 5 : 9;
    const len = level === 1 ? 44 : 100;
    for (let t = 0; t < tiers; t++) {
      box(len, 0.55 * (t + 1), 1.2, t % 2 ? '#8e8a96' : '#9c98a4', 0, 0, -HZ - 5 - t * 1.2);
      for (let sx = -len / 2 + 1; sx < len / 2 - 1; sx += 1.3) spots.push({ pos: v3(sx, 0.55 * (t + 1), -HZ - 5 - t * 1.2), kind: 'stand' });
    }
    const roofZ = -HZ - 5 - tiers * 0.6;
    const roof = box(len + 2, 0.2, tiers * 1.2 + 2, level === 1 ? '#c24d16' : '#3a3550', 0, 0.55 * tiers + 3.2, roofZ);
    roof.castShadow = true;
    for (let px = -len / 2; px <= len / 2; px += len / 4) cyl(0.12, 0.55 * tiers + 3.2, '#6b6f78', px, 0, roofZ + tiers * 0.6, 6);
    // torres de focos
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const lx = sx * (HX + 8);
        const lz = sz * (HZ + 8);
        if (sz > 0 && level === 1) continue;
        cyl(0.3, level === 1 ? 18 : 26, '#8d9298', lx, 0, lz, 6);
        box(3.2, 1.6, 0.6, '#3a3a40', lx, level === 1 ? 18 : 26, lz);
        lights.push({ pos: v3(lx, level === 1 ? 18.5 : 26.5, lz), power: level === 1 ? 1.6 : 2.2 });
      }
    // el bar sigue ahí, en la esquina
    box(8, 3.2, 5, '#efe6d6', -HX - 14, 0, -HZ - 12);
    spots.push({ pos: v3(-HX - 14, 0, -HZ - 9.2), kind: 'bar' });
  }
  if (level >= 2) {
    for (const sd of [-1, 1])
      for (let t = 0; t < 6; t++) {
        box(1.2, 0.55 * (t + 1), 60, t % 2 ? '#8e8a96' : '#9c98a4', sd * (HX + 6 + t * 1.2), 0, -6);
        for (let sz = -32; sz < 22; sz += 1.4) spots.push({ pos: v3(sd * (HX + 6 + t * 1.2), 0.55 * (t + 1), sz), kind: 'stand' });
      }
    const board = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 0.6), [mat('#222'), mat('#222'), mat('#222'), mat('#222'), new THREE.MeshBasicMaterial({ map: signTexture('ESTADIO EL BARRIZAL', '#111', '#ffcf3a', 256, 96, '700 26px Silkscreen, monospace') }), mat('#222')]);
    board.position.set(0, 16, -HZ - 18);
    group.add(board);
  }

  const puddles: THREE.Vector3[] = [];
  const pr = new Rng(77);
  const count = level === 0 ? 14 : level === 1 ? 5 : 1;
  for (let i = 0; i < count; i++) puddles.push(v3(pr.range(-HX + 4, HX - 4), 0.03, pr.range(-HZ + 3, HZ - 3)));

  return {
    group,
    lights,
    spots,
    groundMats,
    windowMats,
    puddles,
    update(time, wind) {
      for (const w of waving) {
        const pos = w.mesh.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const bx = w.base[i * 3];
          const by = w.base[i * 3 + 1];
          const sway = Math.sin(time * (2 + wind * 0.4) + bx * 1.3) * w.amp * (0.4 + wind * 0.15) * (0.7 - by / 1.4);
          pos.setZ(i, sway);
        }
        pos.needsUpdate = true;
      }
    },
  };
}
