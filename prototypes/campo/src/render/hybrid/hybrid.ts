import * as THREE from 'three';
import { randomLook, type Kit, type Look } from '../../content/look';
import { PITCH_L, PITCH_W } from '../../sim/geometry';
import type { MatchSim } from '../../sim/match';
import { Rng } from '../../sim/rng';
import type { MatchEvent } from '../../sim/types';
import { NPC } from '../../vn/scenes';
import { AnimTracker } from '../anim';
import { pixelText, pixelTextWidth } from '../pixel/pixel';
import { pixelPortrait } from '../pixel/portrait';
import type { View } from '../pixel/sprites';
import { BroadcastCamera, THREE_CAMERA_MODES } from '../three/camera';
import type { CameraMode, MatchRenderer, PerfInfo, ScreenPoint } from '../types';
import { Billboard, blobShadow, composeCharacter, frameOf, nearestTexture, pixelCanvas, sheetStore, viewOf } from './billboard';
import { buildStadium, type Spot, type Stadium } from './stadium';
import { WeatherFX } from './weather';

/** Quién mira el partido (sale de la carrera: aficionados, patrocinio, decisiones). */
export interface CrowdPlan {
  count: number;
  gender: 'm' | 'f';
  manolo: 'cheer' | 'sulk' | 'normal';
  presidente: boolean;
}

interface Fan {
  bb: Billboard;
  spot: Spot;
  phase: number;
  umbrella: THREE.Sprite | null;
  sign: THREE.Sprite | null;
  mood: 'home' | 'neutral' | 'grumpy';
}

const toX = (x: number) => x - PITCH_L / 2;
const toZ = (y: number) => y - PITCH_W / 2;

const UMBRELLA = ['....#####....', '..#########..', '.###########.', '#############', '#.#.#.#.#.#.#', '......|......', '......|......', '......|......'];
const DOG_A = ['..........##.', '.#.......####', '.##########..', '..########...', '..#.#..#.#...', '..#.#..#.#...'];
const DOG_B = ['..........##.', '.#.......####', '.##########..', '..########...', '.#..#..#..#..', '#...#.#....#.'];

export class HybridRenderer implements MatchRenderer {
  readonly id = 'hybrid' as const;
  readonly cameraModes = THREE_CAMERA_MODES;
  readonly headHeight = 2.5;
  private renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  private scene = new THREE.Scene();
  private cam = new BroadcastCamera();
  private anim = new AnimTracker();
  private weather = new WeatherFX(this.scene);
  private stadium: Stadium | null = null;
  private level = 0;
  private crowd: CrowdPlan = { count: 9, gender: 'm', manolo: 'normal', presidente: true };
  private builtFor: MatchSim | null = null;
  private appliedCond = '';
  private players: Billboard[] = [];
  private views: View[] = [];
  private flips: boolean[] = [];
  private fans: Fan[] = [];
  private dog: { s: THREE.Sprite; tA: THREE.Texture; tB: THREE.Texture; x: number; shadow: THREE.Mesh } | null = null;
  private ball: THREE.Sprite;
  private ballShadow: THREE.Mesh;
  private ring: THREE.Mesh;
  private shadow = blobShadow();
  private selected = -1;
  private cheer = 0;
  private gloom = 0;
  private w = 1;
  private h = 1;
  private tint = new THREE.Color();
  onThunder: (() => void) | null = null;

  constructor() {
    this.renderer.domElement.className = 'stage-canvas pixelated';
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const bc = pixelCanvas(['.###.', '#.#.#', '##.##', '#.#.#', '.###.'], { '#': '#f4f4f0' });
    const bg = bc.getContext('2d')!;
    bg.fillStyle = '#1a1226';
    bg.fillRect(2, 2, 1, 1);
    this.ball = new THREE.Sprite(new THREE.SpriteMaterial({ map: nearestTexture(bc), alphaTest: 0.5 }));
    this.ball.scale.set(0.5, 0.5, 1);
    this.ball.center.set(0.5, 0.1);
    this.ballShadow = new THREE.Mesh(this.shadow.geo, this.shadow.mat);
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.ballShadow.scale.setScalar(0.35);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 20), new THREE.MeshBasicMaterial({ color: '#f2c94c' }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.scene.add(this.ball, this.ballShadow, this.ring);
    this.weather.onThunder = () => this.onThunder?.();
    sheetStore.load().then(() => (this.builtFor = null));
  }

  mount(host: HTMLElement) {
    host.appendChild(this.renderer.domElement);
  }

  setStadium(level: number) {
    if (level !== this.level) {
      this.level = level;
      this.builtFor = null;
    }
  }

  setCrowd(plan: CrowdPlan) {
    this.crowd = plan;
    this.builtFor = null;
  }

  private ensure(sim: MatchSim) {
    const condKey = JSON.stringify(sim.conditions);
    if (this.builtFor === sim) {
      if (condKey !== this.appliedCond && this.stadium) {
        this.weather.apply(sim.conditions, this.stadium);
        this.appliedCond = condKey;
        this.placeUmbrellas(sim);
      }
      return;
    }
    if (!sheetStore.ready) return;
    this.clearWorld();
    this.stadium = buildStadium(this.level);
    this.scene.add(this.stadium.group);
    this.weather.apply(sim.conditions, this.stadium);
    this.appliedCond = condKey;
    this.players = sim.players.map((p) => {
      const bb = new Billboard(composeCharacter(p.profile.look, sim.kitOf(p), p.profile.num, false), this.shadow.geo, this.shadow.mat, p.profile.look.height);
      this.scene.add(bb.sprite, bb.shadow);
      return bb;
    });
    this.buildCrowd(sim);
    this.builtFor = sim;
  }

  private clearWorld() {
    if (this.stadium) this.scene.remove(this.stadium.group);
    for (const b of this.players) {
      this.scene.remove(b.sprite, b.shadow);
      b.dispose();
    }
    for (const f of this.fans) {
      this.scene.remove(f.bb.sprite, f.bb.shadow);
      if (f.umbrella) this.scene.remove(f.umbrella);
      if (f.sign) this.scene.remove(f.sign);
      f.bb.dispose();
    }
    if (this.dog) this.scene.remove(this.dog.s, this.dog.shadow);
    this.players = [];
    this.fans = [];
    this.dog = null;
  }

  /** Pocos espectadores, del mismo nivel que los jugadores y con personalidad. */
  private buildCrowd(sim: MatchSim) {
    const st = this.stadium!;
    const rng = new Rng(sim.seed + 3);
    const order: Spot['kind'][] = this.level === 0 ? ['steps', 'fence', 'bar', 'wall', 'balcony'] : ['stand', 'fence', 'bar'];
    const spots = order.flatMap((k) => {
      const list = st.spots.filter((s) => s.kind === k);
      if (k !== 'stand') return list.sort(() => rng.next() - 0.5);
      // en la grada se sientan juntos, cerca del centro
      return list.sort((a, b) => Math.abs(a.pos.x) + a.pos.y * 4 - (Math.abs(b.pos.x) + b.pos.y * 4));
    });
    const home = sim.teams[0].profile.kit;
    const clothes = ['#3b4a6b', '#6b3b3b', '#2f5a3a', '#7a6a4a', '#4a4a52', '#8a3a6a', '#2a6a7a', '#c9b8a0'];
    const trousers = ['#2a2f3a', '#3a3a44', '#4a3a2a', '#24242a', '#2f4a6a'];
    const atlases = new Map<string, THREE.Texture>();
    const make = (key: string, look: Look, kit: Kit) => {
      let t = atlases.get(key);
      if (!t) {
        t = composeCharacter(look, kit, -1, true);
        atlases.set(key, t);
      }
      return t;
    };
    const used = new Set<Spot>();
    const take = (kind?: Spot['kind']) => {
      const s = spots.find((x) => !used.has(x) && (!kind || x.kind === kind));
      if (s) used.add(s);
      return s;
    };
    const add = (spot: Spot | undefined, tex: THREE.Texture, mood: Fan['mood'], scale = 1) => {
      if (!spot) return null;
      const bb = new Billboard(tex, this.shadow.geo, this.shadow.mat, scale);
      bb.place(spot.pos.x, spot.pos.z, spot.pos.y);
      bb.setFrame('front', 'idle0', false);
      this.scene.add(bb.sprite, bb.shadow);
      const fan: Fan = { bb, spot, phase: rng.range(0, 6), umbrella: null, sign: null, mood };
      this.fans.push(fan);
      return fan;
    };
    // personajes fijos
    const abuela = add(take(this.level === 0 ? 'steps' : 'stand'), make('abuela', NPC.abuela.look, NPC.abuela.clothes), 'home', 0.95);
    if (abuela) {
      const txt = this.crowd.gender === 'f' ? '¡ESA ES MI NIETA!' : '¡ESE ES MI NIETO!';
      const w = pixelTextWidth(txt) + 6;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = 11;
      const g = c.getContext('2d')!;
      g.fillStyle = '#f4ecd8';
      g.fillRect(0, 0, w, 11);
      g.fillStyle = '#c24d16';
      g.fillRect(0, 0, w, 1);
      g.fillRect(0, 10, w, 1);
      pixelText(g, txt, w / 2, 2, '#2a1d22', w);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: nearestTexture(c), alphaTest: 0.5 }));
      s.scale.set(w * 0.085, 11 * 0.085, 1);
      s.center.set(0.5, 0);
      s.position.set(abuela.spot.pos.x, abuela.spot.pos.y + 2.5, abuela.spot.pos.z);
      this.scene.add(s);
      abuela.sign = s;
    }
    add(take('bar'), make('manolo', NPC.manolo.look, NPC.manolo.clothes), this.crowd.manolo === 'sulk' ? 'grumpy' : 'home');
    if (this.crowd.presidente) add(take(this.level === 0 ? 'steps' : 'stand'), make('presidente', NPC.presidente.look, NPC.presidente.clothes), 'home');
    // el resto del público: tantos como aficionados vengan
    for (let i = 0; i < this.crowd.count; i++) {
      const gender = rng.chance(0.5) ? 'm' : 'f';
      const look = randomLook(rng, gender, { accessory: 'none', facial: gender === 'f' ? 'none' : rng.pick(['none', 'mustache', 'beard', 'stubble']) });
      const fanOfHome = rng.chance(0.8);
      const shirt = fanOfHome && rng.chance(0.5) ? home.shirt : rng.pick(clothes);
      const kit: Kit = { shirt, shirt2: shirt, pattern: 'plain', shorts: rng.pick(trousers), socks: '#24242a', trim: fanOfHome ? home.shirt2 : shirt };
      add(take(), make(`fan${i % 18}`, look, kit), fanOfHome ? 'home' : 'neutral', rng.range(0.92, 1.04));
    }
    // el perro del barrio
    if (this.level === 0) {
      const pal = { '#': '#8a5a34' };
      const tA = nearestTexture(pixelCanvas(DOG_A, pal));
      const tB = nearestTexture(pixelCanvas(DOG_B, pal));
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tA, alphaTest: 0.5 }));
      s.scale.set(1.3, 0.6, 1);
      s.center.set(0.5, 0);
      const shadow = new THREE.Mesh(this.shadow.geo, this.shadow.mat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.scale.setScalar(0.7);
      this.scene.add(s, shadow);
      this.dog = { s, tA, tB, x: 0, shadow };
    }
    this.placeUmbrellas(sim);
  }

  private placeUmbrellas(sim: MatchSim) {
    const wet = (sim.conditions.weather === 'rain' || sim.conditions.weather === 'storm') && sim.conditions.precip > 0;
    const rng = new Rng(4);
    for (const f of this.fans) {
      if (f.umbrella) {
        this.scene.remove(f.umbrella);
        f.umbrella = null;
      }
      if (!wet || f.spot.kind === 'balcony' || f.spot.kind === 'bar' || rng.chance(0.25)) continue;
      const tex = nearestTexture(pixelCanvas(UMBRELLA, { '#': rng.pick(['#c8102e', '#2f6fd6', '#1d1d22', '#f2c94c', '#3fae5a', '#7d55d9']), '|': '#3a3a40' }));
      const u = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5 }));
      u.scale.set(1.6, 1.0, 1);
      u.center.set(0.5, 0);
      u.position.set(f.spot.pos.x, f.spot.pos.y + 1.75, f.spot.pos.z);
      this.scene.add(u);
      f.umbrella = u;
    }
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    // píxel gordo: el búfer interno se queda en ~470–560 px de ancho y se amplía sin suavizar
    const k = Math.max(1, Math.ceil(w / 560));
    this.renderer.setPixelRatio(1 / k);
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
      this.cam.goalPunch();
      if (e.team === 0) this.cheer = 4.5;
      else this.gloom = 4;
    }
  }

  project(x: number, y: number, z: number): ScreenPoint {
    return this.cam.project(new THREE.Vector3(toX(x), z, toZ(y)), this.w, this.h);
  }

  render(sim: MatchSim, alpha: number, dt: number) {
    this.ensure(sim);
    if (this.builtFor !== sim) {
      this.renderer.setClearColor('#1a1230');
      this.renderer.clear();
      return;
    }
    const A = this.anim;
    A.update(sim, alpha, dt);
    this.cheer = Math.max(0, this.cheer - dt);
    this.gloom = Math.max(0, this.gloom - dt);
    this.weather.update(dt, A.time);
    for (const p of sim.players) {
      const i = p.idx;
      const bb = this.players[i];
      const { view, flip } = viewOf(p, A.speed[i], this.views[i], this.flips[i]);
      this.views[i] = view;
      this.flips[i] = flip;
      bb.setFrame(view === 'side' ? 'side' : view, frameOf(p, A.speed[i], A.phase[i], A.time), view === 'side' && flip);
      let lift = 0;
      if (p.action === 'celebrate' && (p.profile.look.celebration === 'arms' || p.profile.look.celebration === 'dance')) lift = Math.abs(Math.sin(A.time * 7)) * 0.35;
      bb.place(toX(A.x[i]), toZ(A.y[i]), 0, lift);
      bb.tint(this.weather.lightAt(toX(A.x[i]), toZ(A.y[i]), this.tint));
      bb.sprite.visible = bb.shadow.visible = !(p.sentOff && p.y < -4);
    }
    const bx = toX(A.bx);
    const bz = toZ(A.by);
    this.ball.position.set(bx, A.bz * 1.6 + 0.05, bz);
    (this.ball.material as THREE.SpriteMaterial).color.copy(this.weather.lightAt(bx, bz, this.tint));
    this.ballShadow.position.set(bx, 0.03, bz);
    if (this.selected >= 0) {
      this.ring.visible = true;
      this.ring.position.set(toX(A.x[this.selected]), 0.04, toZ(A.y[this.selected]));
    } else this.ring.visible = false;
    // público
    for (const f of this.fans) {
      let frame: 'idle0' | 'idle1' | 'up0' | 'up1' = Math.floor(A.time * 1.2 + f.phase) % 2 ? 'idle0' : 'idle1';
      let lift = 0;
      if (this.cheer > 0 && f.mood === 'home') {
        frame = Math.floor(A.time * 6 + f.phase) % 2 ? 'up0' : 'up1';
        lift = Math.max(0, Math.sin(A.time * 9 + f.phase)) * 0.3;
      }
      f.bb.place(f.spot.pos.x, f.spot.pos.z, f.spot.pos.y, lift);
      f.bb.setFrame('front', frame, false);
      f.bb.tint(this.weather.lightAt(f.spot.pos.x, f.spot.pos.z, this.tint));
    }
    // el perro persigue el balón por fuera de la valla
    if (this.dog) {
      const d = this.dog;
      const tx = Math.max(-PITCH_L / 2, Math.min(PITCH_L / 2, bx));
      const dx = tx - d.x;
      d.x += Math.sign(dx) * Math.min(Math.abs(dx), 9 * dt);
      const running = Math.abs(dx) > 0.5;
      d.s.material.map = running && Math.floor(A.time * 8) % 2 ? d.tB : d.tA;
      d.s.scale.x = dx < 0 ? -1.3 : 1.3;
      const hop = this.cheer > 0 ? Math.abs(Math.sin(A.time * 10)) * 0.5 : 0;
      d.s.position.set(d.x, hop, -PITCH_W / 2 - 5.2);
      d.shadow.position.set(d.x, 0.03, -PITCH_W / 2 - 5.2);
      d.s.material.color.copy(this.weather.lightAt(d.x, -PITCH_W / 2 - 5, this.tint));
    }
    this.stadium!.update(A.time, Math.hypot(sim.conditions.windX, sim.conditions.windY));
    this.cam.update(sim, A, dt);
    this.renderer.render(this.scene, this.cam.camera);
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
    const info = this.renderer.info;
    return { drawCalls: info.render.calls, detail: `${this.renderer.domElement.width}×${this.renderer.domElement.height} px internos · ${this.fans.length} espectadores · ${Math.round(info.render.triangles / 1000)}k triángulos` };
  }

  dispose() {
    this.clearWorld();
    this.weather.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
