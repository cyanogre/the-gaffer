import * as THREE from 'three';
import type { MatchSim } from '../../sim/match';
import type { MatchEvent } from '../../sim/types';
import { AnimTracker, computePose } from '../anim';
import type { CameraMode, MatchRenderer, PerfInfo, ScreenPoint } from '../types';
import { BroadcastCamera, THREE_CAMERA_MODES } from './camera';
import { buildStadium, disposeScene, toThree, type Stadium } from './stadium';
import { applyVinylPose, buildVinyl, sharedMaterials, type SharedMaterials, type VinylRig } from './vinyl';

/**
 * Prototipo 2 · Three.js con personajes 3D estilizados ("figuras de vinilo"):
 * cápsulas y esferas, sombreado toon, contorno de tinta y sombras reales.
 */
export class LowpolyRenderer implements MatchRenderer {
  readonly id = 'lowpoly' as const;
  readonly cameraModes = THREE_CAMERA_MODES;
  readonly headHeight = 2.75;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new BroadcastCamera();
  private anim = new AnimTracker();
  private rigs: VinylRig[] = [];
  private mats: SharedMaterials = sharedMaterials();
  private stadium: Stadium | null = null;
  private ball: THREE.Mesh;
  private ring: THREE.Mesh;
  private selected = -1;
  private excitement = 0;
  private w = 1;
  private h = 1;
  private portraitRenderer: THREE.WebGLRenderer | null = null;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = 'stage-canvas';
    this.scene.background = new THREE.Color('#9cc7e6');
    this.scene.fog = new THREE.Fog('#9cc7e6', 120, 260);
    const hemi = new THREE.HemisphereLight('#e8f4ff', '#3d5a35', 1.6);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff4dc', 2.2);
    sun.position.set(-30, 60, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -65;
    sc.right = 65;
    sc.top = 45;
    sc.bottom = -45;
    sc.near = 10;
    sc.far = 160;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
    const ballGeo = new THREE.IcosahedronGeometry(0.24, 2);
    const colors: number[] = [];
    const pos = ballGeo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const spot = Math.abs(v.x) > 0.8 || Math.abs(v.y) > 0.8 || Math.abs(v.z) > 0.8;
      colors.push(...(spot ? [0.08, 0.08, 0.1] : [1, 1, 1]));
    }
    ballGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.ball = new THREE.Mesh(ballGeo, new THREE.MeshToonMaterial({ vertexColors: true }));
    this.ball.castShadow = true;
    this.scene.add(this.ball);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.0, 32), new THREE.MeshBasicMaterial({ color: '#ffd34d', transparent: true, opacity: 0.9 }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.03;
    this.ring.visible = false;
    this.scene.add(this.ring);
  }

  mount(host: HTMLElement) {
    host.appendChild(this.renderer.domElement);
  }

  private ensure(sim: MatchSim) {
    if (this.stadium) return;
    this.stadium = buildStadium('vinyl', [sim.teams[0].profile.kit, sim.teams[1].profile.kit]);
    this.scene.add(this.stadium.group);
    for (const p of sim.players) {
      const rig = buildVinyl(p.profile.look, sim.kitOf(p), this.mats);
      this.rigs.push(rig);
      this.scene.add(rig.root);
    }
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
    for (const p of sim.players) {
      const r = this.rigs[p.idx];
      const pose = computePose(p, A.phase[p.idx], A.speed[p.idx], A.time);
      r.root.position.copy(toThree(A.x[p.idx], A.y[p.idx]));
      r.root.rotation.y = -p.facing + pose.spin;
      // El portero se lanza hacia un lado del mundo; se traduce a su lado local.
      const side = p.action === 'dive' ? p.actionSide * (Math.cos(p.facing) >= 0 ? 1 : -1) : 1;
      applyVinylPose(r, pose, side);
      r.root.visible = !(p.sentOff && p.y < -4);
    }
    this.ball.position.copy(toThree(A.bx, A.by, A.bz + 0.24));
    this.ball.rotation.set(sim.ball.spin * 0.7, 0, -sim.ball.spin);
    if (this.selected >= 0) {
      this.ring.visible = true;
      this.ring.position.set(A.x[this.selected] - 52.5, 0.03, A.y[this.selected] - 34);
    } else this.ring.visible = false;
    this.excitement = Math.max(0, this.excitement - dt);
    this.stadium!.update(A.time, this.excitement);
    this.cam.update(sim, A, dt);
    this.renderer.render(this.scene, this.cam.camera);
  }

  portrait(sim: MatchSim, idx: number, size: number) {
    if (!this.portraitRenderer) {
      this.portraitRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    }
    const pr = this.portraitRenderer;
    pr.setPixelRatio(1);
    pr.setSize(size, size, false);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#9cc7e6');
    scene.add(new THREE.HemisphereLight('#ffffff', '#55606a', 2.2));
    const l = new THREE.DirectionalLight('#ffffff', 1.6);
    l.position.set(3, 4, 5);
    scene.add(l);
    const p = sim.players[idx];
    const rig = buildVinyl(p.profile.look, sim.kitOf(p), this.mats, false);
    rig.root.rotation.y = -0.5;
    scene.add(rig.root);
    const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    const top = 2.5 * p.profile.look.height;
    cam.position.set(2.6, top - 0.15, 1.6);
    cam.lookAt(0, top - 0.55, 0);
    pr.render(scene, cam);
    const out = document.createElement('canvas');
    out.width = out.height = size;
    out.getContext('2d')!.drawImage(pr.domElement, 0, 0);
    scene.remove(rig.root);
    rig.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    return out;
  }

  perf(): PerfInfo {
    const info = this.renderer.info;
    return { drawCalls: info.render.calls, detail: `${Math.round(info.render.triangles / 1000)}k triángulos · ${info.memory.textures} texturas · sombras dinámicas` };
  }

  dispose() {
    disposeScene(this.scene);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    if (this.portraitRenderer) {
      this.portraitRenderer.dispose();
      this.portraitRenderer.forceContextLoss();
    }
  }
}
