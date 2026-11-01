import * as THREE from 'three';
import type { MatchSim } from '../../sim/match';
import type { MatchEvent } from '../../sim/types';
import { AnimTracker, computePose } from '../anim';
import type { CameraMode, MatchRenderer, PerfInfo, ScreenPoint } from '../types';
import { BroadcastCamera, THREE_CAMERA_MODES } from './camera';
import { PX_PER_M, paintBall, paintCutout, type CutPart, type CutoutSet } from './cutout';
import { buildStadium, disposeScene, toThree, type Stadium } from './stadium';

/**
 * Prototipo 3 · 2.5D "cromos": estadio tridimensional y futbolistas como recortables
 * de álbum (caricaturas 2D con borde de pegatina) animados como marionetas de papel.
 */
const HIP = 0.8;
const CHEST: Record<string, string> = { barrio: 'MANOLO', poligono: 'CHISPAS' };

interface Puppet {
  root: THREE.Group;
  body: THREE.Group;
  torso: THREE.Group;
  head: THREE.Mesh;
  legA: THREE.Group;
  legB: THREE.Group;
  armA: THREE.Group;
  armB: THREE.Group;
  headMat: THREE.MeshBasicMaterial;
  shoutMat: THREE.MeshBasicMaterial;
  shadow: THREE.Mesh;
  flip: number;
  set: CutoutSet;
}

function texOf(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function partMesh(part: CutPart, mat?: THREE.MeshBasicMaterial) {
  const w = part.canvas.width / PX_PER_M;
  const h = part.canvas.height / PX_PER_M;
  const geo = new THREE.PlaneGeometry(w, h).translate(w / 2 - part.px / PX_PER_M, part.py / PX_PER_M - h / 2, 0);
  const m = mat ?? new THREE.MeshBasicMaterial({ map: texOf(part.canvas), alphaTest: 0.45, side: THREE.DoubleSide });
  return new THREE.Mesh(geo, m);
}

function blobShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, 'rgba(30,20,40,0.55)');
  gr.addColorStop(1, 'rgba(30,20,40,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class CromosRenderer implements MatchRenderer {
  readonly id = 'cromos' as const;
  readonly cameraModes = THREE_CAMERA_MODES;
  readonly headHeight = 2.7;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new BroadcastCamera();
  private anim = new AnimTracker();
  private puppets: Puppet[] = [];
  private stadium: Stadium | null = null;
  private ball: THREE.Sprite;
  private ballShadow: THREE.Mesh;
  private shadowGeo = new THREE.CircleGeometry(0.75, 20);
  private shadowMat: THREE.MeshBasicMaterial;
  private ring: THREE.Mesh;
  private selected = -1;
  private excitement = 0;
  private w = 1;
  private h = 1;
  private camRight = new THREE.Vector3();

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.domElement.className = 'stage-canvas';
    // fondo de página de álbum: el estadio está "impreso" sobre papel
    this.scene.background = new THREE.Color('#f3e7cc');
    this.scene.fog = new THREE.Fog('#f3e7cc', 110, 240);
    this.scene.add(new THREE.HemisphereLight('#fff8e8', '#b8a07a', 2.4));
    const sun = new THREE.DirectionalLight('#fff1d6', 1.6);
    sun.position.set(-20, 50, 30);
    this.scene.add(sun);
    this.shadowMat = new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false });
    this.ball = new THREE.Sprite(new THREE.SpriteMaterial({ map: texOf(paintBall()), alphaTest: 0.4 }));
    this.ball.scale.set(0.62, 0.62, 1);
    this.scene.add(this.ball);
    this.ballShadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.ballShadow);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.08, 32), new THREE.MeshBasicMaterial({ color: '#ff5a36', transparent: true, opacity: 0.95, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.04;
    this.ring.visible = false;
    this.scene.add(this.ring);
  }

  mount(host: HTMLElement) {
    host.appendChild(this.renderer.domElement);
  }

  private ensure(sim: MatchSim) {
    if (this.stadium) return;
    this.stadium = buildStadium('paper', [sim.teams[0].profile.kit, sim.teams[1].profile.kit]);
    this.scene.add(this.stadium.group);
    for (const p of sim.players) {
      const set = paintCutout({
        look: p.profile.look,
        kit: sim.kitOf(p),
        traits: p.profile.traits,
        num: p.profile.num,
        chest: CHEST[sim.teams[p.team].profile.id] ?? 'FC',
        keeper: sim.isGK(p),
        seed: p.idx * 31 + 7,
      });
      this.puppets.push(this.buildPuppet(set, p.profile.look.height));
    }
  }

  private buildPuppet(set: CutoutSet, height: number): Puppet {
    const root = new THREE.Group();
    const body = new THREE.Group();
    body.position.y = HIP;
    root.add(body);
    const limb = (part: CutPart, x: number, y: number, z: number, parent: THREE.Object3D) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.add(partMesh(part));
      parent.add(g);
      return g;
    };
    const legB = limb(set.legBack, -0.06, 0.02, -0.03, body);
    const torso = new THREE.Group();
    body.add(torso);
    torso.add(partMesh(set.torso));
    const armB = limb(set.armBack, -0.02, 0.62, -0.05, torso);
    const legA = limb(set.legFront, 0.07, 0.02, 0.02, body);
    const headMat = new THREE.MeshBasicMaterial({ map: texOf(set.head.canvas), alphaTest: 0.45, side: THREE.DoubleSide });
    const shoutMat = new THREE.MeshBasicMaterial({ map: texOf(set.headShout.canvas), alphaTest: 0.45, side: THREE.DoubleSide });
    const head = partMesh(set.head, headMat);
    // proporciones humanas: cabeza más pequeña que en una caricatura de cabezón
    head.scale.setScalar(0.66);
    head.position.set(0.04, 0.68, 0.04);
    torso.add(head);
    const armA = limb(set.armFront, 0.02, 0.62, 0.06, torso);
    root.scale.setScalar(0.95 * height);
    const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(1.1, 0.75, 1);
    this.scene.add(shadow);
    this.scene.add(root);
    return { root, body, torso, head, legA, legB, armA, armB, headMat, shoutMat, shadow, flip: 1, set };
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.renderer.setSize(w, h, true);
    this.cam.camera.aspect = w / h;
    this.cam.camera.updateProjectionMatrix();
  }

  setCamera(mode: CameraMode) {
    this.cam.mode = mode;
  }

  setSelected(idx: number) {
    this.selected = idx;
  }

  onEvent(e: MatchEvent) {
    if (e.kind === 'goal') {
      this.excitement = 4.5;
      this.cam.goalPunch();
    }
  }

  project(x: number, y: number, z: number): ScreenPoint {
    return this.cam.project(toThree(x, y, z), this.w, this.h);
  }

  render(sim: MatchSim, alpha: number, dt: number) {
    this.ensure(sim);
    const A = this.anim;
    A.update(sim, alpha, dt);
    this.cam.update(sim, A, dt);
    const camera = this.cam.camera;
    this.camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    for (const p of sim.players) {
      const pp = this.puppets[p.idx];
      const pose = computePose(p, A.phase[p.idx], A.speed[p.idx], A.time);
      const pos = toThree(A.x[p.idx], A.y[p.idx]);
      pp.root.position.copy(pos);
      pp.root.quaternion.copy(camera.quaternion);
      // ¿hacia qué lado de la pantalla mira? se decide con la velocidad proyectada
      let sx: number;
      if (p.action === 'dive') sx = this.camRight.z * p.actionSide;
      else if (A.speed[p.idx] > 0.7) sx = this.camRight.x * p.vx + this.camRight.z * p.vy;
      else sx = this.camRight.x * Math.cos(p.facing) + this.camRight.z * Math.sin(p.facing);
      if (sx > 0.25) pp.flip = 1;
      else if (sx < -0.25) pp.flip = -1;
      if (pose.spin) pp.flip = Math.floor(A.time * 4) % 2 ? 1 : -1;
      const s = 0.95 * p.profile.look.height;
      pp.root.scale.set(s * pp.flip, s, s);
      // marioneta de papel: todo gira en el plano del cromo
      pp.legA.rotation.z = pose.legA;
      pp.legB.rotation.z = pose.legB;
      pp.armA.rotation.z = pose.armA + pose.raiseA * 1.05;
      pp.armB.rotation.z = pose.armB + pose.raiseB * 0.95;
      pp.torso.rotation.z = -pose.lean * (1 - pose.lie) * 1.2;
      const squash = 1 + Math.sin(A.phase[p.idx] * 2) * 0.045 * Math.min(1, A.speed[p.idx] / 7);
      pp.body.scale.set(1 / squash, squash, 1);
      let lie = pose.lie * pose.lieDir * 1.45;
      if (p.action === 'dive') lie = -pose.roll * 1.05;
      pp.body.rotation.z = lie;
      pp.body.position.y = HIP + pose.bob + pose.jump - Math.abs(lie) * 0.42;
      pp.head.material = pose.shout ? pp.shoutMat : pp.headMat;
      pp.head.rotation.z = Math.sin(A.time * 3 + p.idx) * 0.04 + (pose.shout ? 0.08 : 0);
      pp.shadow.position.set(pos.x, 0.03, pos.z);
      pp.root.visible = pp.shadow.visible = !(p.sentOff && p.y < -4);
    }
    const bp = toThree(A.bx, A.by, A.bz + 0.3);
    this.ball.position.copy(bp);
    this.ball.material.rotation = -sim.ball.spin * 0.8;
    this.ballShadow.position.set(bp.x, 0.035, bp.z);
    const hs = 0.45 / (1 + A.bz * 0.35);
    this.ballShadow.scale.set(hs, hs, hs);
    if (this.selected >= 0) {
      this.ring.visible = true;
      this.ring.position.set(A.x[this.selected] - 52.5, 0.04, A.y[this.selected] - 34);
    } else this.ring.visible = false;
    this.excitement = Math.max(0, this.excitement - dt);
    this.stadium!.update(A.time, this.excitement);
    this.renderer.render(this.scene, camera);
  }

  portrait(sim: MatchSim, idx: number, size: number) {
    this.ensure(sim);
    const out = document.createElement('canvas');
    out.width = out.height = size;
    const g = out.getContext('2d')!;
    g.fillStyle = '#f3c74f';
    g.fillRect(0, 0, size, size);
    const head = this.puppets[idx]?.set.head.canvas;
    if (head) g.drawImage(head, -size * 0.08, -size * 0.02, size * 1.12, size * 1.12);
    return out;
  }

  perf(): PerfInfo {
    const info = this.renderer.info;
    return { drawCalls: info.render.calls, detail: `${Math.round(info.render.triangles / 1000)}k triángulos · ${info.memory.textures} texturas · sin sombras dinámicas` };
  }

  dispose() {
    disposeScene(this.scene);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
