import * as THREE from 'three';
import type { Kit, Look } from '../../content/look';
import type { Career } from '../../game/career';
import { Billboard, CELL_H, blobShadow, composeCharacter, sheetStore } from '../hybrid/billboard';
import { SH } from '../pixel/sprites';
import { PIXEL_GRID, defaultScale, dpr, fitCanvas, gridFor, texelUnits, type Grid } from '../pixelgrid';

/** Metros por píxel de arte en los interiores: el míster (48 px) mide 1,45 m junto a los muebles. */
export const ROOM_UPP = (CELL_H * 0.66) / SH;
import type { FrameId, View } from '../pixel/sprites';

/**
 * Un sitio del juego: escena 3D con personajes 2D en pixel art. Las acciones viven en objetos del
 * escenario (hotspots): la interfaz dibuja su etiqueta encima y el míster camina hasta ellos.
 */
export interface Hotspot {
  id: string;
  label: string;
  anchor: THREE.Vector3;
  stand: THREE.Vector3;
}

export interface Walker {
  bb: Billboard;
  pos: THREE.Vector3;
  target: THREE.Vector3;
  speed: number;
  phase: number;
  /** Mirando hacia dónde cuando lleva un rato quieto. */
  face: View;
  flip: boolean;
  /** Animación en bucle cuando está quieto (por ejemplo, levantar los brazos). */
  idle?: FrameId[];
  // ── locomoción (la animación sale de lo que se mueve de verdad, con margen para no parpadear)
  vel: number;
  stride: number;
  moving: boolean;
  dirX: number;
  dirZ: number;
  view: View;
  curFlip: boolean;
  viewT: number;
  idleT: number;
  /** Metros por fotograma de carrera (zancada). */
  strideLen: number;
}

export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

export function pixTex(c: HTMLCanvasElement, repeat?: [number, number]) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** Utilidades de construcción para interiores (cajas, planos y cilindros con sombra). */
export class Builder {
  private mats = new Map<string, THREE.MeshLambertMaterial>();
  constructor(public root: THREE.Object3D) {}
  mat(c: string) {
    let m = this.mats.get(c);
    if (!m) this.mats.set(c, (m = new THREE.MeshLambertMaterial({ color: c })));
    return m;
  }
  box(w: number, h: number, d: number, color: string | THREE.Material | THREE.Material[], x: number, y: number, z: number) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'string' ? this.mat(color) : color);
    b.position.set(x, y + h / 2, z);
    b.castShadow = true;
    b.receiveShadow = true;
    this.root.add(b);
    return b;
  }
  plane(w: number, h: number, t: THREE.Texture, x: number, y: number, z: number, ry = 0, emissive = false) {
    const mat = emissive ? new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.1 }) : new THREE.MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.1 });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    p.position.set(x, y, z);
    p.rotation.y = ry;
    this.root.add(p);
    return p;
  }
  floor(w: number, d: number, t: THREE.Texture) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: t }));
    f.rotation.x = -Math.PI / 2;
    f.receiveShadow = true;
    this.root.add(f);
    return f;
  }
  cyl(rt: number, rb: number, h: number, color: string, x: number, y: number, z: number, seg = 10) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), this.mat(color));
    m.position.set(x, y + h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    this.root.add(m);
    return m;
  }
  /** Paredes del fondo y de la izquierda (vista isométrica: las otras dos no se ven). */
  walls(w: number, d: number, h: number, mat: THREE.Material, skirting = '#5e4129') {
    const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.15), mat);
    back.position.set(0, h / 2, -d / 2);
    back.receiveShadow = true;
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.15, h, d), mat);
    left.position.set(-w / 2, h / 2, 0);
    left.receiveShadow = true;
    this.root.add(back, left);
    this.box(w, 0.12, 0.2, skirting, 0, 0, -d / 2 + 0.12);
    this.box(0.2, 0.12, d, skirting, -w / 2 + 0.12, 0, 0);
  }
}

export abstract class Location {
  scene = new THREE.Scene();
  camera: THREE.OrthographicCamera | THREE.PerspectiveCamera = new THREE.OrthographicCamera(-5, 5, 3, -3, 0.1, 200);
  hotspots: Hotspot[] = [];
  protected b = new Builder(this.scene);
  protected shadow = blobShadow();
  protected coach: Walker | null = null;
  protected walkers: Walker[] = [];
  protected time = 0;
  protected w = 1;
  protected h = 1;
  /** Ancho y alto (en metros) que tiene que caber en pantalla con cámara ortográfica. */
  protected fit = { w: 9, h: 5.6 };
  protected coachHome = v3(0, 0, 0.5);
  private onArrive: (() => void) | null = null;
  private coachKey = '';

  constructor() {
    this.scene.background = new THREE.Color('#140f22');
  }

  /** Coloca a un personaje (NPC o jugador) en el escenario. */
  addWalker(look: Look, kit: Kit, num: number, civil: boolean, pos: THREE.Vector3, face: View = 'front', scale = 0.66): Walker {
    const bb = new Billboard(composeCharacter(look, kit, num, civil), this.shadow.geo, this.shadow.mat, scale * look.height);
    this.scene.add(bb.sprite, bb.shadow);
    const w: Walker = {
      bb,
      pos: pos.clone(),
      target: pos.clone(),
      speed: 2.2,
      phase: Math.random() * 3,
      face,
      flip: false,
      vel: 0,
      stride: 0,
      moving: false,
      dirX: 0,
      dirZ: 1,
      view: face,
      curFlip: false,
      viewT: 0,
      idleT: 9,
      strideLen: 0.45 * scale,
    };
    this.walkers.push(w);
    return w;
  }

  setCoach(look: Look, kit: Kit) {
    const key = JSON.stringify([look, kit]);
    if (key === this.coachKey || !sheetStore.ready) return;
    this.coachKey = key;
    const at = this.coach?.pos ?? this.coachHome;
    if (this.coach) {
      this.scene.remove(this.coach.bb.sprite, this.coach.bb.shadow);
      this.walkers = this.walkers.filter((w) => w !== this.coach);
    }
    this.coach = this.addWalker(look, kit, -1, true, at, 'front', this.coachScale);
    this.coach.speed = this.coachSpeed;
  }
  protected coachScale = 0.66;
  protected coachSpeed = 2.6;

  walkTo(id: string, done: () => void) {
    const h = this.hotspots.find((x) => x.id === id);
    if (!h || !this.coach) return done();
    this.coach.target.copy(h.stand);
    this.onArrive = done;
  }

  resetCoach() {
    if (this.coach) {
      this.coach.pos.copy(this.coachHome);
      this.coach.target.copy(this.coachHome);
    }
    this.onArrive = null;
  }

  grid: Grid | null = null;
  /** Píxeles del dispositivo por píxel de arte que mejor le van a este sitio. */
  pixelScale(cssW: number, cssH: number) {
    if (this.camera instanceof THREE.OrthographicCamera) {
      // interiores: la escala entera más grande con la que cabe la habitación entera
      const d = dpr();
      return Math.max(1, Math.floor(Math.min((cssW * d) / (this.fit.w / ROOM_UPP), (cssH * d) / (this.fit.h / ROOM_UPP))));
    }
    return defaultScale(cssW, cssH);
  }

  resize(g: Grid) {
    this.grid = g;
    this.w = g.cssW;
    this.h = g.cssH;
    const aspect = g.intW / g.intH;
    if (this.camera instanceof THREE.OrthographicCamera) {
      // un píxel de arte = ROOM_UPP metros: personajes y muebles con la misma rejilla
      const viewH = g.intH * ROOM_UPP;
      this.camera.left = (-viewH * aspect) / 2;
      this.camera.right = (viewH * aspect) / 2;
      this.camera.top = viewH / 2;
      this.camera.bottom = -viewH / 2;
    } else this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.onResize(aspect);
  }
  protected onResize(_aspect: number) {}

  project(v: THREE.Vector3) {
    const p = v.clone().project(this.camera);
    // fuera de cuadro no se esconde: la interfaz la pega al borde (siempre se puede usar)
    return { x: (p.x * 0.5 + 0.5) * this.w, y: (-p.y * 0.5 + 0.5) * this.h, visible: p.z < 1 };
  }

  /** Estado del día: luz por franja, tiempo, objetos que dependen de la partida. */
  abstract setState(c: Career): void;
  protected abstract tick(dt: number): void;
  /** Color de luz para teñir a los personajes (de noche, más oscuros). */
  protected tintAt(_p: THREE.Vector3, out: THREE.Color) {
    return out.set('#ffffff');
  }

  update(dt: number) {
    this.time += dt;
    this.tick(dt);
    const u = this.grid ? texelUnits(this.camera, this.grid.intH) : 0.03;
    for (const w of this.walkers) w.bb.setTexel(u);
    const tint = new THREE.Color();
    for (const w of this.walkers) {
      const dx = w.target.x - w.pos.x;
      const dz = w.target.z - w.pos.z;
      const dist = Math.hypot(dx, dz);
      let step = 0;
      if (dist > 0.01) {
        step = Math.min(dist, w.speed * dt);
        w.pos.x += (dx / dist) * step;
        w.pos.z += (dz / dist) * step;
        const k = Math.min(1, dt * 12);
        w.dirX += (dx / dist - w.dirX) * k;
        w.dirZ += (dz / dist - w.dirZ) * k;
      } else if (w === this.coach && this.onArrive) {
        const cb = this.onArrive;
        this.onArrive = null;
        cb();
      }
      // velocidad real suavizada; para empezar a correr hace falta más que para seguir corriendo
      const v = dt > 0 ? step / dt : 0;
      w.vel += (v - w.vel) * Math.min(1, dt * 6);
      w.moving = w.moving ? w.vel > 0.12 : w.vel > 0.3;
      w.stride += step;
      w.idleT = w.moving ? 0 : w.idleT + dt;
      // vista: de la dirección al moverse; quieto, la última (y al rato, hacia donde suele mirar)
      let wantView: View = w.view;
      let wantFlip = w.curFlip;
      if (w.moving) {
        const ax = Math.abs(w.dirX);
        const az = Math.abs(w.dirZ);
        if (az > ax * 1.3) wantView = w.dirZ > 0 ? 'front' : 'back';
        else if (ax > az * 1.1) wantView = 'side';
        if (w.dirX < -0.2) wantFlip = true;
        else if (w.dirX > 0.2) wantFlip = false;
      } else if (w.idleT > 0.8) {
        wantView = w.face;
        wantFlip = w.flip;
      }
      if (wantView !== w.view || wantFlip !== w.curFlip) {
        w.viewT += dt;
        if (w.viewT > 0.25) {
          w.view = wantView;
          w.curFlip = wantFlip;
          w.viewT = 0;
        }
      } else w.viewT = 0;
      let fr: FrameId;
      if (w.moving) fr = (['run0', 'run1', 'run2', 'run3'] as const)[Math.floor(w.stride / w.strideLen) & 3];
      else if (w.idle) fr = w.idle[Math.floor(this.time * 2 + w.phase) % w.idle.length];
      else fr = Math.floor(this.time * 1.3 + w.phase) % 2 ? 'idle0' : 'idle1';
      w.bb.setFrame(w.view, fr, w.view === 'side' && w.curFlip);
      w.bb.place(w.pos.x, w.pos.z, w.pos.y);
      w.bb.tint(this.tintAt(w.pos, tint));
    }
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
    });
  }
}

/** Un único contexto WebGL para todos los sitios (cambiar de sitio no crea otro). */
export class World {
  renderer = new THREE.WebGLRenderer({ antialias: false });
  current: Location | null = null;
  private cache = new Map<string, Location>();

  constructor() {
    this.renderer.domElement.className = 'stage-canvas pixelated';
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
  }

  get canvas() {
    return this.renderer.domElement;
  }

  show(id: string, make: () => Location) {
    let loc = this.cache.get(id);
    if (!loc) this.cache.set(id, (loc = make()));
    this.current = loc;
    // cada sitio elige su escala de píxel: hay que reajustar el lienzo
    this.resize(this.w, this.h);
    return loc;
  }

  /** Para sitios que cambian de forma (el campo tras unas obras). */
  forget(id: string) {
    const l = this.cache.get(id);
    l?.dispose();
    this.cache.delete(id);
  }

  private w = 1;
  private h = 1;
  private grid: Grid | null = null;
  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    const P = this.current?.pixelScale(w, h) ?? defaultScale(w, h);
    this.grid = gridFor(w, h, P);
    fitCanvas(this.renderer, this.grid);
    this.current?.resize(this.grid);
  }

  render(dt: number) {
    if (!this.current || !this.grid) return;
    PIXEL_GRID.value.set(this.grid.intW, this.grid.intH);
    this.current.update(dt);
    this.renderer.render(this.current.scene, this.current.camera);
  }
}
