import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { shade, type Kit, type Look } from '../../content/look';
import type { Pose } from '../anim';
import { toonGradient } from './stadium';

/**
 * Personaje 3D "figura de vinilo": todo cápsulas y esferas con sombreado toon
 * y contorno de tinta. Nada de cubos ni prismas. Se construye 100 % desde el ADN visual.
 */
const INK = '#1b1420';
const HIP = 0.8;

type ColorFn = (v: THREE.Vector3) => string;

function paint(geo: THREE.BufferGeometry, color: string | ColorFn) {
  const pos = geo.attributes.position;
  const arr = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const v = new THREE.Vector3();
  const cache = new Map<string, THREE.Color>();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const hex = typeof color === 'string' ? color : color(v);
    let cc = cache.get(hex);
    if (!cc) {
      cc = new THREE.Color(hex);
      cache.set(hex, cc);
    }
    c.copy(cc);
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

const sphere = (r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ws = 16, hs = 12) =>
  new THREE.SphereGeometry(r, ws, hs).scale(sx, sy, sz).translate(x, y, z);
const cap = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 4, 12);

function outlineOf(geo: THREE.BufferGeometry, t: number) {
  const g = geo.clone();
  g.deleteAttribute('color');
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) + nor.getX(i) * t, pos.getY(i) + nor.getY(i) * t, pos.getZ(i) + nor.getZ(i) * t);
  }
  return g;
}

export interface SharedMaterials {
  vertex: THREE.MeshToonMaterial;
  ink: THREE.MeshBasicMaterial;
  kits: Map<Kit, THREE.MeshToonMaterial>;
}

export function sharedMaterials(): SharedMaterials {
  return {
    vertex: new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() }),
    ink: new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }),
    kits: new Map(),
  };
}

function kitMaterial(kit: Kit, mats: SharedMaterials) {
  let m = mats.kits.get(kit);
  if (m) return m;
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 128;
  const g = cv.getContext('2d')!;
  g.fillStyle = kit.shirt;
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = kit.shirt2;
  if (kit.pattern === 'stripes') for (let i = 0; i < 10; i++) g.fillRect(i * 25.6 + 12.8, 0, 12.8, 128);
  if (kit.pattern === 'hoops') for (let i = 0; i < 6; i++) g.fillRect(0, i * 21.3 + 10, 256, 10.6);
  if (kit.pattern === 'half') g.fillRect(0, 0, 128, 128);
  if (kit.pattern === 'sash') {
    g.beginPath();
    g.moveTo(40, 128);
    g.lineTo(80, 128);
    g.lineTo(150, 0);
    g.lineTo(110, 0);
    g.fill();
  }
  g.fillStyle = kit.trim;
  g.fillRect(0, 118, 256, 10);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  m = new THREE.MeshToonMaterial({ map: tex, gradientMap: toonGradient() });
  mats.kits.set(kit, m);
  return m;
}

export interface VinylRig {
  root: THREE.Group;
  body: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  legA: THREE.Group;
  legB: THREE.Group;
  armA: THREE.Group;
  armB: THREE.Group;
  mouth: THREE.Mesh;
}

function addPart(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, mats: SharedMaterials, ink = 0.022, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  parent.add(m);
  if (ink > 0) parent.add(new THREE.Mesh(outlineOf(geo, ink), mats.ink));
  return m;
}

export function buildVinyl(look: Look, kit: Kit, mats: SharedMaterials, shadows = true): VinylRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = HIP;
  root.add(body);
  const skin = look.skin;
  const hair = look.hairColor;
  const hairD = shade(hair, -0.15);
  const torsoR = { slim: 0.2, normal: 0.23, stocky: 0.27, belly: 0.235 }[look.body];

  // piernas (pivote en la cadera)
  const leg = (z: number) => {
    const g = new THREE.Group();
    g.position.set(0, 0, z);
    const L = 0.62;
    const shin = cap(0.1, L - 0.2).translate(0, -L / 2, 0);
    paint(shin, (v) => {
      if (v.y > -0.2) return kit.shorts;
      if (look.accessory === 'socksDown') return v.y < -0.52 ? kit.socks : skin;
      return v.y > -0.33 ? skin : kit.socks;
    });
    const boot = paint(sphere(0.115, 0.06, -L - 0.02, 0, 1.55, 0.7, 1), look.boots);
    addPart(g, mergeGeometries([shin, boot])!, mats.vertex, mats, 0.02, shadows);
    body.add(g);
    return g;
  };
  const legB = leg(-0.11);
  const legA = leg(0.11);

  // torso (pivote en la cadera, se inclina desde ahí)
  const torso = new THREE.Group();
  body.add(torso);
  const shorts = paint(new THREE.CylinderGeometry(torsoR + 0.02, torsoR + 0.04, 0.2, 14).translate(0, 0.02, 0), kit.shorts);
  addPart(torso, shorts, mats.vertex, mats, 0.018, shadows);
  const chestParts: THREE.BufferGeometry[] = [cap(torsoR, 0.28).scale(1, 1, 0.82).translate(0, 0.34, 0)];
  if (look.body === 'belly') chestParts.push(sphere(0.25, 0.09, 0.24, 0, 1, 0.9, 1.05));
  for (const gch of chestParts) gch.deleteAttribute('color');
  addPart(torso, mergeGeometries(chestParts)!, kitMaterial(kit, mats), mats, 0.022, shadows);
  const shoulderY = 0.55;

  // brazos (pivote en el hombro)
  const arm = (z: number) => {
    const g = new THREE.Group();
    g.position.set(0, shoulderY, z);
    const a = cap(0.065, 0.34).translate(0, -0.22, 0);
    paint(a, (v) => (v.y > -0.14 ? kit.shirt : skin));
    const hand = paint(sphere(0.078, 0, -0.45, 0), skin);
    addPart(g, mergeGeometries([a, hand])!, mats.vertex, mats, 0.018, shadows);
    torso.add(g);
    return g;
  };
  const armB = arm(-(torsoR + 0.07));
  const armA = arm(torsoR + 0.07);

  // cabeza (grande, simpática, sin aristas)
  const head = new THREE.Group();
  head.position.set(0.02, shoulderY + 0.06, 0);
  head.scale.setScalar(0.74);
  torso.add(head);
  const HC = new THREE.Vector3(0.02, 0.26, 0);
  const R = 0.27;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paint(new THREE.CylinderGeometry(0.08, 0.09, 0.12, 10).translate(0, 0.02, 0), skin));
  parts.push(paint(sphere(R, HC.x, HC.y, HC.z, 1, 1.02, 0.96, 22, 16), skin));
  for (const z of [-1, 1]) parts.push(paint(sphere(0.065, HC.x - 0.02, HC.y - 0.01, z * (R - 0.01), 0.55, 1, 0.8), shade(skin, -0.08)));
  // ojos
  for (const z of [-0.105, 0.105]) {
    parts.push(paint(sphere(0.062, HC.x + 0.21, HC.y + 0.04, z, 0.6, 1.05, 1), '#ffffff'));
    parts.push(paint(sphere(0.032, HC.x + 0.25, HC.y + 0.035, z, 0.6, 1.1, 1), INK));
  }
  // cejas
  const browR = look.brows === 'thick' || look.brows === 'uni' ? 0.028 : 0.017;
  const brow = (z: number, len: number) => parts.push(paint(cap(browR, len).rotateX(Math.PI / 2).translate(HC.x + 0.235, HC.y + 0.12, z), hairD));
  if (look.brows === 'uni') brow(0, 0.24);
  else {
    brow(-0.105, 0.07);
    brow(0.105, 0.07);
  }
  // nariz de patata
  if (look.nose === 'small') parts.push(paint(sphere(0.05, HC.x + 0.27, HC.y - 0.03, 0), shade(skin, -0.05)));
  else if (look.nose === 'big') parts.push(paint(sphere(0.085, HC.x + 0.29, HC.y - 0.05, 0, 1, 0.9, 0.9), shade(skin, -0.05)));
  else parts.push(paint(sphere(0.07, HC.x + 0.3, HC.y - 0.02, 0, 1.35, 1, 0.8), shade(skin, -0.05)));
  // vello facial
  if (look.facial === 'mustache') {
    parts.push(paint(cap(0.04, 0.15).rotateX(Math.PI / 2).translate(HC.x + 0.26, HC.y - 0.1, 0), hairD));
    for (const z of [-0.11, 0.11]) parts.push(paint(sphere(0.04, HC.x + 0.23, HC.y - 0.15, z), hairD));
  } else if (look.facial === 'beard') {
    parts.push(paint(new THREE.SphereGeometry(R + 0.012, 18, 10, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.48).translate(HC.x + 0.01, HC.y, 0), hairD));
  } else if (look.facial === 'goatee') {
    parts.push(paint(sphere(0.06, HC.x + 0.23, HC.y - 0.24, 0, 0.8, 1.1, 0.9), hairD));
  } else if (look.facial === 'stubble') {
    const mix = new THREE.Color(skin).lerp(new THREE.Color(hair), 0.35).getStyle();
    parts.push(paint(new THREE.SphereGeometry(R + 0.004, 18, 10, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.42).translate(HC.x + 0.012, HC.y, 0), mix));
  }
  // peinados
  const capGeo = (r: number, theta: number, tilt: number) =>
    new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, theta).rotateZ(tilt).translate(HC.x - 0.01, HC.y + 0.01, 0);
  switch (look.hair) {
    case 'bald':
      break;
    case 'buzz':
      parts.push(paint(capGeo(R + 0.008, Math.PI * 0.42, 0.35), hairD));
      break;
    case 'short':
      parts.push(paint(capGeo(R + 0.03, Math.PI * 0.45, 0.45), hair));
      break;
    case 'afro':
      parts.push(paint(sphere(0.36, HC.x - 0.1, HC.y + 0.12, 0, 1, 0.95, 1.05), hair));
      break;
    case 'mohawk':
      parts.push(paint(capGeo(R + 0.006, Math.PI * 0.35, 0.3), shade(hair, -0.45)));
      for (let i = 0; i < 5; i++) {
        const a = -0.5 + i * 0.32;
        parts.push(paint(sphere(0.07, HC.x + Math.sin(a) * 0.27, HC.y + Math.cos(a) * 0.27 + 0.06, 0, 1, 1.7, 0.55), hair));
      }
      break;
    case 'long':
      parts.push(paint(capGeo(R + 0.03, Math.PI * 0.48, 0.5), hair));
      parts.push(paint(cap(0.16, 0.3).scale(0.8, 1, 1.45).translate(HC.x - 0.17, HC.y - 0.2, 0), hair));
      break;
    case 'ponytail':
      parts.push(paint(capGeo(R + 0.025, Math.PI * 0.46, 0.5), hair));
      parts.push(paint(sphere(0.085, HC.x - 0.28, HC.y + 0.06, 0), hairD));
      parts.push(paint(cap(0.06, 0.2).rotateZ(-0.5).translate(HC.x - 0.36, HC.y - 0.1, 0), hair));
      break;
    case 'mullet':
      parts.push(paint(capGeo(R + 0.025, Math.PI * 0.42, 0.45), hair));
      parts.push(paint(cap(0.15, 0.16).scale(0.8, 1, 1.55).translate(HC.x - 0.19, HC.y - 0.2, 0), hair));
      break;
    case 'curly':
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2;
        const el = 0.35 + (i % 3) * 0.25;
        parts.push(paint(sphere(0.105, HC.x - 0.04 + Math.cos(a) * Math.cos(el) * 0.22, HC.y + Math.sin(el) * 0.24 + 0.04, Math.sin(a) * Math.cos(el) * 0.22), i % 2 ? hair : hairD));
      }
      break;
    case 'pixie':
      parts.push(paint(capGeo(R + 0.025, Math.PI * 0.44, 0.15), hair));
      for (let i = 0; i < 3; i++) parts.push(paint(sphere(0.06, HC.x + 0.16 + i * 0.03, HC.y + 0.2 - i * 0.04, -0.06 + i * 0.07, 1, 0.7, 0.8), hairD));
      break;
    case 'bun':
      parts.push(paint(capGeo(R + 0.015, Math.PI * 0.5, 0.4), hair));
      parts.push(paint(sphere(0.13, HC.x - 0.16, HC.y + 0.27, 0), hairD));
      break;
    case 'braids':
      parts.push(paint(capGeo(R + 0.015, Math.PI * 0.5, 0.45), hair));
      for (const z of [-0.12, 0.12]) for (let i = 0; i < 4; i++) parts.push(paint(sphere(0.06, HC.x - 0.2 - i * 0.02, HC.y - 0.05 - i * 0.1, z, 1, 1.1, 1), i % 2 ? hair : hairD));
      break;
    case 'combover':
      parts.push(paint(new THREE.SphereGeometry(R + 0.006, 16, 6, 0, Math.PI * 0.9, 0, Math.PI * 0.3).rotateZ(0.2).translate(HC.x, HC.y + 0.01, 0), hair));
      for (const z of [-1, 1]) parts.push(paint(sphere(0.12, HC.x - 0.1, HC.y + 0.01, z * 0.2, 0.8, 0.9, 0.5), hair));
      break;
  }
  if (look.accessory === 'headband') parts.push(paint(new THREE.TorusGeometry(R + 0.005, 0.03, 8, 28).rotateX(Math.PI / 2).rotateZ(0.18).translate(HC.x, HC.y + 0.1, 0), look.accColor));
  if (look.accessory === 'glasses') {
    for (const z of [-0.105, 0.105]) parts.push(paint(new THREE.TorusGeometry(0.06, 0.014, 6, 16).rotateY(Math.PI / 2).translate(HC.x + 0.25, HC.y + 0.04, z), '#22252c'));
    parts.push(paint(cap(0.012, 0.06).rotateX(Math.PI / 2).translate(HC.x + 0.27, HC.y + 0.05, 0), '#22252c'));
  }
  addPart(head, mergeGeometries(parts)!, mats.vertex, mats, 0.02, shadows);
  const mouth = new THREE.Mesh(sphere(0.05, 0, 0, 0, 0.5, 1, 1.3), new THREE.MeshBasicMaterial({ color: '#5a1820' }));
  mouth.position.set(HC.x + 0.25, HC.y - 0.13, 0);
  head.add(mouth);

  root.scale.setScalar(1.3 * look.height);
  return { root, body, torso, head, legA, legB, armA, armB, mouth };
}

/** Aplica una pose. `side` es el lado local (+1/-1) hacia el que se tira el portero. */
export function applyVinylPose(r: VinylRig, pose: Pose, side: number) {
  r.legA.rotation.z = pose.legA;
  r.legB.rotation.z = pose.legB;
  r.armA.rotation.set(-pose.raiseA, 0, pose.armA);
  r.armB.rotation.set(pose.raiseB, 0, pose.armB);
  r.torso.rotation.z = -pose.lean * (1 - pose.lie);
  r.body.rotation.set(pose.roll * side, 0, pose.lie * pose.lieDir * 1.45);
  r.body.position.y = HIP + pose.bob + pose.jump - pose.lie * 0.5 - Math.abs(pose.roll) * 0.25;
  r.mouth.scale.set(pose.shout ? 1.4 : 1, pose.shout ? 1.6 : 0.35, 1);
}
