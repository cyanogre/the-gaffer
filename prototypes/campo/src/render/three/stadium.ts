import * as THREE from 'three';
import { SPONSORS } from '../../content/sponsors';
import type { Kit } from '../../content/look';
import { BOX_D, BOX_W, CENTER_R, GOAL_H, GOAL_Y0, GOAL_Y1, PENALTY_D, PITCH_L, PITCH_W, SIX_D, SIX_W } from '../../sim/geometry';
import { Rng } from '../../sim/rng';

export type StadiumStyle = 'vinyl' | 'paper';

/** Mundo del motor (x, y, z-altura) → Three.js (x, y-arriba, z). */
export const toThree = (x: number, y: number, z = 0) => new THREE.Vector3(x - PITCH_L / 2, z, y - PITCH_W / 2);

const MARGIN = 8;
const TEX_PPM = 12;

let gradient: THREE.DataTexture | null = null;
/** Rampa de 3 tonos para el sombreado toon (luz, media, sombra). */
export function toonGradient() {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

export function paintPitch(style: StadiumStyle) {
  const W = (PITCH_L + MARGIN * 2) * TEX_PPM;
  const H = (PITCH_W + MARGIN * 2) * TEX_PPM;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const X = (x: number) => (x + MARGIN) * TEX_PPM;
  const Y = (y: number) => (y + MARGIN) * TEX_PPM;
  const rng = new Rng(11);
  const paper = style === 'paper';
  g.fillStyle = paper ? '#5aa84f' : '#3f8a43';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 14; i++) {
    g.fillStyle = paper ? (i % 2 ? '#67b65a' : '#5aa84f') : i % 2 ? '#4a9a4b' : '#41904a';
    const sw = (PITCH_L + MARGIN * 2) / 14;
    g.fillRect(i * sw * TEX_PPM, 0, sw * TEX_PPM + 1, H);
  }
  if (paper) {
    // pinceladas de gouache: el césped parece pintado a mano
    for (let i = 0; i < 1800; i++) {
      g.strokeStyle = rng.chance(0.5) ? 'rgba(40,90,40,0.10)' : 'rgba(200,240,160,0.10)';
      g.lineWidth = rng.range(2, 6);
      const x = rng.range(0, W);
      const y = rng.range(0, H);
      const a = rng.range(-0.4, 0.4);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * rng.range(10, 40), y + Math.sin(a) * rng.range(4, 12));
      g.stroke();
    }
  } else {
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = rng.chance(0.5) ? 'rgba(20,60,20,0.18)' : 'rgba(140,200,120,0.12)';
      g.fillRect(rng.range(0, W), rng.range(0, H), 2, 2);
    }
  }
  const wob = paper ? 1.4 : 0;
  g.strokeStyle = paper ? 'rgba(255,253,240,0.95)' : '#f1f5ea';
  g.lineWidth = paper ? 3.2 : 2;
  g.lineCap = 'round';
  const path = (pts: [number, number][]) => {
    g.beginPath();
    pts.forEach(([x, y], i) => {
      const px = X(x) + (wob ? rng.range(-wob, wob) : 0);
      const py = Y(y) + (wob ? rng.range(-wob, wob) : 0);
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    });
    g.stroke();
  };
  const seg = (x0: number, y0: number, x1: number, y1: number) => {
    const n = paper ? Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 4)) : 1;
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) pts.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
    path(pts);
  };
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number) => {
    const pts: [number, number][] = [];
    const n = 48;
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    path(pts);
  };
  seg(0, 0, PITCH_L, 0);
  seg(PITCH_L, 0, PITCH_L, PITCH_W);
  seg(PITCH_L, PITCH_W, 0, PITCH_W);
  seg(0, PITCH_W, 0, 0);
  seg(PITCH_L / 2, 0, PITCH_L / 2, PITCH_W);
  arc(PITCH_L / 2, PITCH_W / 2, CENTER_R, 0, Math.PI * 2);
  g.fillStyle = g.strokeStyle as string;
  g.beginPath();
  g.arc(X(PITCH_L / 2), Y(PITCH_W / 2), 4, 0, Math.PI * 2);
  g.fill();
  for (const side of [0, 1]) {
    const gx = side === 0 ? 0 : PITCH_L;
    const s = side === 0 ? 1 : -1;
    const y0 = PITCH_W / 2 - BOX_W / 2;
    const y1 = PITCH_W / 2 + BOX_W / 2;
    seg(gx, y0, gx + s * BOX_D, y0);
    seg(gx + s * BOX_D, y0, gx + s * BOX_D, y1);
    seg(gx + s * BOX_D, y1, gx, y1);
    const z0 = PITCH_W / 2 - SIX_W / 2;
    const z1 = PITCH_W / 2 + SIX_W / 2;
    seg(gx, z0, gx + s * SIX_D, z0);
    seg(gx + s * SIX_D, z0, gx + s * SIX_D, z1);
    seg(gx + s * SIX_D, z1, gx, z1);
    const px = gx + s * PENALTY_D;
    g.beginPath();
    g.arc(X(px), Y(PITCH_W / 2), 3.5, 0, Math.PI * 2);
    g.fill();
    const a = Math.acos((BOX_D - PENALTY_D) / CENTER_R);
    if (side === 0) arc(px, PITCH_W / 2, CENTER_R, -a, a);
    else arc(px, PITCH_W / 2, CENTER_R, Math.PI - a, Math.PI + a);
  }
  for (const [cx, cy, a0] of [[0, 0, 0], [PITCH_L, 0, Math.PI / 2], [PITCH_L, PITCH_W, Math.PI], [0, PITCH_W, -Math.PI / 2]] as const) arc(cx, cy, 1, a0, a0 + Math.PI / 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, w: PITCH_L + MARGIN * 2, h: PITCH_W + MARGIN * 2 };
}

function boardTexture(i: number, paper: boolean) {
  const sp = SPONSORS[i % SPONSORS.length];
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 64;
  const g = cv.getContext('2d')!;
  g.fillStyle = sp.bg;
  g.fillRect(0, 0, 512, 64);
  if (paper) {
    g.strokeStyle = '#2a1d22';
    g.lineWidth = 6;
    g.strokeRect(3, 3, 506, 58);
  }
  g.fillStyle = sp.fg;
  g.textBaseline = 'middle';
  g.font = `${paper ? '400 34px Bangers' : '800 30px Barlow'}, Impact, sans-serif`;
  g.fillText(sp.name, 16, 26, 330);
  g.font = `${paper ? '400 20px Bangers' : 'italic 600 18px Barlow'}, sans-serif`;
  g.globalAlpha = 0.85;
  g.fillText(sp.tag, 350, 34, 150);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function netTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 2;
  for (let i = 0; i <= 64; i += 8) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 64);
    g.moveTo(0, i);
    g.lineTo(64, i);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 2);
  return t;
}

function fanTexture() {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 80;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#2a1d22';
  g.lineWidth = 5;
  g.beginPath();
  g.ellipse(32, 64, 26, 20, 0, Math.PI, 0);
  g.lineTo(58, 80);
  g.lineTo(6, 80);
  g.closePath();
  g.fill();
  g.stroke();
  g.beginPath();
  g.arc(32, 28, 17, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface Stadium {
  group: THREE.Group;
  update(time: number, excitement: number): void;
}

export function buildStadium(style: StadiumStyle, kits: [Kit, Kit]): Stadium {
  const paper = style === 'paper';
  const group = new THREE.Group();
  const rng = new Rng(3);
  const mat = (color: string) =>
    paper ? new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() }) : new THREE.MeshStandardMaterial({ color, roughness: 0.85 });

  // césped
  const { tex, w, h } = paintPitch(style);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(w, h), paper ? new THREE.MeshBasicMaterial({ map: tex }) : new THREE.MeshLambertMaterial({ map: tex }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = !paper;
  group.add(ground);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(w + 60, h + 60), mat(paper ? '#c99a63' : '#4b4f57'));
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.02;
  group.add(apron);

  // porterías
  const postMat = mat('#ffffff');
  const netMat = new THREE.MeshBasicMaterial({ map: netTexture(), transparent: true, opacity: paper ? 0.9 : 0.75, side: THREE.DoubleSide, depthWrite: false });
  for (const side of [0, 1]) {
    const gx = side === 0 ? 0 : PITCH_L;
    const back = side === 0 ? -1 : 1;
    const r = paper ? 0.12 : 0.07;
    const post = new THREE.CylinderGeometry(r, r, GOAL_H, 10);
    for (const gy of [GOAL_Y0, GOAL_Y1]) {
      const m = new THREE.Mesh(post, postMat);
      m.position.copy(toThree(gx, gy, GOAL_H / 2));
      m.castShadow = !paper;
      group.add(m);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, GOAL_Y1 - GOAL_Y0, 10), postMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.copy(toThree(gx, PITCH_W / 2, GOAL_H));
    bar.castShadow = !paper;
    group.add(bar);
    const depth = 2;
    const netBack = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_Y1 - GOAL_Y0, GOAL_H), netMat);
    netBack.rotation.y = Math.PI / 2;
    netBack.position.copy(toThree(gx + back * depth, PITCH_W / 2, GOAL_H / 2));
    group.add(netBack);
    const netTop = new THREE.Mesh(new THREE.PlaneGeometry(depth, GOAL_Y1 - GOAL_Y0), netMat);
    netTop.rotation.x = -Math.PI / 2;
    netTop.position.copy(toThree(gx + (back * depth) / 2, PITCH_W / 2, GOAL_H));
    group.add(netTop);
    for (const gy of [GOAL_Y0, GOAL_Y1]) {
      const netSide = new THREE.Mesh(new THREE.PlaneGeometry(depth, GOAL_H), netMat);
      netSide.position.copy(toThree(gx + (back * depth) / 2, gy, GOAL_H / 2));
      group.add(netSide);
    }
  }

  // vallas publicitarias
  const boardGeo = new THREE.PlaneGeometry(12, 1.1);
  let bi = 0;
  for (const side of [0, 1]) {
    for (let x = 2; x < PITCH_L - 2; x += 12.4) {
      const m = new THREE.Mesh(boardGeo, new THREE.MeshBasicMaterial({ map: boardTexture(bi++, paper) }));
      m.position.copy(toThree(x + 6, side === 0 ? -2.2 : PITCH_W + 2.2, 0.55));
      if (side === 1) m.rotation.y = Math.PI;
      group.add(m);
    }
  }

  // gradas escalonadas
  const standMat = mat(paper ? '#8f7ab8' : '#6e7480');
  const standMat2 = mat(paper ? '#a48fcc' : '#7d8390');
  const tiers = 6;
  const longStand = (sideZ: number) => {
    for (let i = 0; i < tiers; i++) {
      const geo = new THREE.BoxGeometry(PITCH_L + 18, 0.9, 2.2);
      const m = new THREE.Mesh(geo, i % 2 ? standMat : standMat2);
      m.position.set(0, 0.45 + i * 0.9, sideZ * (PITCH_W / 2 + 5 + i * 2.2));
      m.receiveShadow = !paper;
      group.add(m);
    }
  };
  longStand(-1);
  longStand(1);
  const endStand = (sideX: number) => {
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, PITCH_W + 6), i % 2 ? standMat : standMat2);
      m.position.set(sideX * (PITCH_L / 2 + 6 + i * 2.2), 0.45 + i * 0.9, 0);
      m.receiveShadow = !paper;
      group.add(m);
    }
  };
  endStand(-1);
  endStand(1);

  // público instanciado: una sola llamada de dibujo para miles de aficionados
  interface Seat {
    x: number;
    y: number;
    z: number;
    ry: number;
    phase: number;
    home: boolean;
  }
  const seats: Seat[] = [];
  for (const sideZ of [-1, 1])
    for (let i = 0; i < tiers; i++)
      for (let x = -PITCH_L / 2 - 6; x < PITCH_L / 2 + 6; x += 1.15) {
        if (rng.chance(0.15)) continue;
        seats.push({
          x: x + rng.range(-0.2, 0.2),
          y: 0.9 + i * 0.9,
          z: sideZ * (PITCH_W / 2 + 5 + i * 2.2),
          ry: sideZ < 0 ? 0 : Math.PI,
          phase: rng.range(0, 6.28),
          home: x < 20 ? rng.chance(0.8) : rng.chance(0.3),
        });
      }
  for (const sideX of [-1, 1])
    for (let i = 0; i < 4; i++)
      for (let z = -PITCH_W / 2; z < PITCH_W / 2; z += 1.2) {
        if (rng.chance(0.25)) continue;
        seats.push({
          x: sideX * (PITCH_L / 2 + 6 + i * 2.2),
          y: 0.9 + i * 0.9,
          z: z + rng.range(-0.2, 0.2),
          ry: sideX < 0 ? Math.PI / 2 : -Math.PI / 2,
          phase: rng.range(0, 6.28),
          home: sideX < 0,
        });
      }
  const colors = seats.map((s) => {
    const kit = kits[s.home ? 0 : 1];
    const pick = rng.chance(0.75) ? (rng.chance(0.6) ? kit.shirt : kit.shirt2) : rng.pick(['#33363f', '#d9d4c7', '#8a3a3a', '#3a5a8a']);
    return new THREE.Color(pick);
  });
  const fanMeshes: THREE.InstancedMesh[] = [];
  if (paper) {
    const fm = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.95, 1.2).translate(0, 0.6, 0),
      new THREE.MeshBasicMaterial({ map: fanTexture(), alphaTest: 0.5, side: THREE.DoubleSide }),
      seats.length,
    );
    fanMeshes.push(fm);
  } else {
    // aficionados "peón": cuerpo en cápsula y cabeza esférica, nada de cubos
    const body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.26, 0.35, 2, 6).translate(0, 0.45, 0), new THREE.MeshLambertMaterial(), seats.length);
    const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 7, 5).translate(0, 1.05, 0), new THREE.MeshLambertMaterial({ color: '#e8b88f' }), seats.length);
    fanMeshes.push(body, head);
  }
  const dummy = new THREE.Object3D();
  const place = (bounce: number, time: number) => {
    seats.forEach((s, i) => {
      const jump = bounce > 0 && s.home ? Math.max(0, Math.sin(time * 9 + s.phase)) * 0.45 * Math.min(1, bounce) : 0;
      dummy.position.set(s.x, s.y + jump, s.z);
      dummy.rotation.set(0, s.ry, 0);
      dummy.updateMatrix();
      for (const m of fanMeshes) m.setMatrixAt(i, dummy.matrix);
    });
    for (const m of fanMeshes) m.instanceMatrix.needsUpdate = true;
  };
  place(0, 0);
  fanMeshes[0].instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(seats.length * 3), 3);
  colors.forEach((c, i) => fanMeshes[0].setColorAt(i, c));
  for (const m of fanMeshes) group.add(m);

  // torres de focos
  const poleMat = mat(paper ? '#5b4b7a' : '#9aa0aa');
  const lampMat = new THREE.MeshBasicMaterial({ color: paper ? '#fff3b0' : '#fffbe8' });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 30, 8), poleMat);
    pole.position.set(sx * (PITCH_L / 2 + 10), 15, sz * (PITCH_W / 2 + 14));
    group.add(pole);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.8, 16), lampMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(sx * (PITCH_L / 2 + 10), 30.5, sz * (PITCH_W / 2 + 14));
    lamp.lookAt(0, 0, 0);
    group.add(lamp);
  }

  let wasExcited = false;
  return {
    group,
    update(time, excitement) {
      if (excitement > 0) {
        place(excitement, time);
        wasExcited = true;
      } else if (wasExcited) {
        place(0, time);
        wasExcited = false;
      }
    },
  };
}

export function disposeScene(scene: THREE.Object3D) {
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
      mat.dispose();
    }
  });
}
