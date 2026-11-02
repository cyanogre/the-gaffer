import * as THREE from 'three';
import type { Kit, Look } from '../../content/look';
import type { Career } from '../../game/career';
import { Billboard, CELL_H, blobShadow, composeCharacterArt, flatDepth, nearestTexture, pixelCanvas, sheetStore, type CharacterArt } from '../hybrid/billboard';
import { lyingHead } from '../pixel/lying';
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
  /** Su arte compuesto (la cabeza dormida sale de aquí). */
  art: CharacterArt;
  /** El sitio en el que está haciendo algo ahora (pose, capas con los muebles, cama). */
  doing?: Spot | null;
  /** Rutina de un vecino: va de sitio en sitio y se queda un rato en cada uno. */
  routine?: RoutineStep[];
  step: number;
  stepT: number;
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

/**
 * Cómo queda una persona respecto a un mueble mientras lo usa, como en un point & click:
 * - `front`: delante entero (sentado en un taburete, la mesa detrás).
 * - `behind`: detrás entero; el mueble le tapa donde coinciden (en el sofá, el respaldo le tapa la espalda).
 * - `arms`: el cuerpo detrás y los brazos (y lo que lleve en la mano) por encima (limpiar la barra).
 */
export type Layer = 'front' | 'behind' | 'arms';

/**
 * Un sitio donde se hace algo con un mueble (o en el escenario): dónde se pone, con qué pose y cómo
 * se tapa con cada mueble. Lo usan igual el míster (actividades) y los vecinos (rutinas): añadir
 * una interacción nueva es añadir un sitio, no código.
 */
export interface Spot {
  /** Dónde se pone: de pie, los pies; sentado, el centro del asiento (el ancla va bajo la cadera). */
  at?: THREE.Vector3;
  view?: View;
  /** Volteado (solo de perfil: mirando a la izquierda). */
  flip?: boolean;
  frames?: FrameId[];
  fps?: number;
  /** Por mueble (su id): delante, detrás o con los brazos por encima. El resto, según dónde esté. */
  layers?: Record<string, Layer>;
  /** Tumbado en esta cama (id): bulto 3D bajo la manta a lo largo de la cama y la cabeza en la almohada. */
  bed?: string;
  /** Recorrido en bucle (vueltas al campo). */
  path?: THREE.Vector3[];
}
/** Una actividad del míster es un sitio (o un recorrido). */
export type ActivitySpec = Spot;

/** Un paso de la rutina de un vecino: a qué sitio va y cuántos segundos se queda. */
export interface RoutineStep {
  spot: Spot;
  secs: number;
}

/**
 * Una cama: centro de la almohada (por encima), pie del colchón (por encima), ancho y color de la
 * manta. Quien se tumba se dibuja en 3D a lo largo de la cama (respeta su orientación en la vista
 * isométrica) y con su propia cabeza pixel girada al ángulo de la cama.
 */
export interface BedDef {
  id: string;
  head: THREE.Vector3;
  foot: THREE.Vector3;
  width: number;
  blanket: string;
  /** La manta tal y como está la cama vacía (se esconde mientras hay alguien). */
  spread?: THREE.Object3D;
}
interface Sleeper {
  w: Walker;
  root: THREE.Group;
  head: THREE.Sprite;
  headSize: [number, number];
  chest: THREE.Mesh;
  zs: THREE.Sprite[];
}

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
  /** Pared del fondo (z) y de la izquierda (x): lo que está pegado a ellas no se agrupa como mueble. */
  backZ = -99;
  leftX = -99;
  floor(w: number, d: number, t: THREE.Texture) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: t }));
    f.rotation.x = -Math.PI / 2;
    f.receiveShadow = true;
    f.userData.structure = true;
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
    back.userData.structure = left.userData.structure = true;
    this.backZ = -d / 2;
    this.leftX = -w / 2;
    this.root.add(back, left);
    this.box(w, 0.12, 0.2, skirting, 0, 0, -d / 2 + 0.12);
    this.box(0.2, 0.12, d, skirting, -w / 2 + 0.12, 0, 0);
  }
}

/**
 * Un mueble con lo que tiene encima (mostrador con su caja, cama con su almohada...). Se dibuja todo
 * a la profundidad de su esquina delantera, como un decorado de point & click: una persona o está
 * detrás (y el mueble la tapa por donde coinciden) o está delante (y no la tapa nada). Nunca a medias.
 */
interface PropGroup {
  /** Nombre del mueble (los sitios lo usan para decir cómo se tapan con él). */
  id?: string;
  /** Esquina delantera a la que se aplana (compartida con lo que se le añada luego, como la manta). */
  uAnchor: { value: THREE.Vector3 };
  min: THREE.Vector3;
  max: THREE.Vector3;
  anchor: THREE.Vector3;
  far: THREE.Vector3;
  /** Profundidad (NDC) de la esquina delantera y del punto más lejano ya comprimido. */
  depth: number;
  farDepth: number;
  /** Rectángulo en pantalla (NDC). */
  rect: [number, number, number, number];
}
const COMPRESS = 0.01;

/** Copia de un material que se dibuja aplanado a la profundidad de la esquina delantera de su mueble. */
function flatMaterial(mat: THREE.Material, uAnchor: { value: THREE.Vector3 }) {
  const c = mat.clone();
  c.onBeforeCompile = (shader) => {
    shader.uniforms.uAnchor = uAnchor;
    shader.vertexShader = 'uniform vec3 uAnchor;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vec4 aClip = projectionMatrix * viewMatrix * vec4( uAnchor, 1.0 );
      float aZ = aClip.z / aClip.w;
      gl_Position.z = ( aZ + ( gl_Position.z / gl_Position.w - aZ ) * ${COMPRESS.toFixed(3)} ) * gl_Position.w;`,
    );
  };
  c.customProgramCacheKey = () => `flat-prop-${mat.type}`;
  return c;
}

/** «z» de dormir, en píxeles (blanca con contorno oscuro). */
const ZZZ = pixelCanvas(['kkkkkk', 'kwwwwk', 'kkkwkk', 'kkwkk.', 'kwwwwk', 'kkkkkk'], { k: '#2a2440', w: '#f4f0ff' });

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
  /** Actividades del míster en este sitio (id de acción → sitio donde se hace). */
  protected activities: Record<string, ActivitySpec> = {};
  private act: { spec: ActivitySpec; leg: number; back: THREE.Vector3; speed: number } | null = null;
  /** Camas del sitio (y quién duerme en cada una). */
  protected beds: (BedDef & { sleeper?: Sleeper })[] = [];

  startActivity(id: string, _seconds: number) {
    const spec = this.activities[id];
    if (!spec || !this.coach) return;
    this.act = { spec, leg: 0, back: this.coach.pos.clone(), speed: this.coach.speed };
    if (spec.at) {
      this.coach.pos.copy(spec.at);
      this.coach.target.copy(spec.at);
    }
    if (spec.path) {
      this.coach.speed = Math.min(this.coach.speed, 5);
      this.coach.target.copy(spec.path[0]);
    } else this.coach.doing = spec;
    if (spec.bed) this.lieDown(this.coach, spec.bed);
  }

  stopActivity() {
    if (!this.act || !this.coach) return;
    const { back, speed, spec } = this.act;
    this.act = null;
    if (this.coach.doing?.bed) this.getUp(this.coach);
    this.coach.doing = null;
    this.coach.speed = speed;
    if (spec.path) {
      // vuelve trotando a donde estaba
      this.coach.target.copy(back);
    } else {
      this.coach.pos.copy(back);
      this.coach.target.copy(back);
    }
  }

  /** Pone a un vecino a seguir una rutina (o la quita con una lista vacía). */
  protected setRoutine(w: Walker, steps: RoutineStep[]) {
    if (w.doing?.bed) this.getUp(w);
    w.routine = steps;
    w.step = 0;
    w.stepT = 0;
    w.doing = null;
  }

  /** De camino al sitio que toca, o haciendo lo suyo allí hasta que se acaba el rato. */
  private followRoutine(w: Walker, dt: number) {
    const r = w.routine;
    if (!r?.length) return;
    const step = r[w.step % r.length];
    const at = step.spot.at;
    if (w.doing !== step.spot) {
      if (at) w.target.copy(at);
      if (!at || Math.hypot(w.pos.x - w.target.x, w.pos.z - w.target.z) < 0.03) {
        if (at) w.pos.copy(at);
        w.doing = step.spot;
        w.stepT = step.secs;
        if (step.spot.bed) this.lieDown(w, step.spot.bed);
      }
    } else if ((w.stepT -= dt) <= 0) {
      if (step.spot.bed) this.getUp(w);
      w.doing = null;
      w.step = (w.step + 1) % r.length;
    }
  }

  /** Se tumba en la cama: el muñeco de pie desaparece y la cama le enseña tapado, con su cabeza. */
  protected lieDown(w: Walker, bedId: string) {
    const bed = this.beds.find((b) => b.id === bedId);
    const g = this.groups.find((q) => q.id === bedId);
    if (!bed || bed.sleeper || !w.art.sleepHead) return;
    const axis = bed.foot.clone().sub(bed.head).setY(0);
    const len = axis.length();
    axis.normalize();
    // todo en ejes de la cama: x desde la almohada hacia los pies
    const root = new THREE.Group();
    root.position.set(bed.head.x, bed.foot.y, bed.head.z);
    root.rotation.y = -Math.atan2(axis.z, axis.x);
    const mat = g ? flatMaterial(this.b.mat(bed.blanket), g.uAnchor) : this.b.mat(bed.blanket);
    const add = (geo: THREE.BufferGeometry, x: number, y: number, sx = 1, sy = 1) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, 0);
      m.scale.set(sx, sy, 1);
      m.castShadow = m.receiveShadow = true;
      root.add(m);
      return m;
    };
    // manta desde los hombros hasta el pie, con el cuerpo marcado debajo: pecho, piernas y pies
    const from = 0.22;
    const cover = len - from + 0.06;
    add(new THREE.BoxGeometry(cover, 0.08, bed.width), from + cover / 2, 0.04);
    const chest = add(new THREE.SphereGeometry(0.24, 10, 6), from + 0.3, 0.08, 1.3, 0.55);
    const legs = add(new THREE.CapsuleGeometry(0.15, Math.max(0.2, cover - 0.8), 3, 8), from + 0.48 + (cover - 0.6) / 2, 0.08);
    legs.rotation.z = Math.PI / 2;
    legs.scale.set(0.6, 1, 1);
    // los pies levantan la manta al final
    add(new THREE.SphereGeometry(0.1, 8, 5), len - 0.1, 0.12, 1, 1.4);
    this.scene.add(root);
    // la cabeza: su propio arte, de perfil y con los ojos cerrados, girado como la cama en pantalla
    const hp = bed.head.clone().project(this.camera);
    const fp = bed.foot.clone().project(this.camera);
    const up = { x: (hp.x - fp.x) * this.w, y: -(hp.y - fp.y) * this.h };
    const n = Math.hypot(up.x, up.y) || 1;
    const art = lyingHead(w.art.sleepHead, { x: up.x / n, y: up.y / n });
    const head = new THREE.Sprite(flatDepth(new THREE.SpriteMaterial({ map: nearestTexture(art), alphaTest: 0.5 })));
    head.center.set(Math.floor(art.width / 2) / art.width, Math.floor(art.height / 2) / art.height);
    head.position.copy(bed.head).addScaledVector(axis, 0.03);
    head.position.y += 0.04;
    this.scene.add(head);
    const zs = [0, 1, 2].map(() => {
      const z = new THREE.Sprite(flatDepth(new THREE.SpriteMaterial({ map: nearestTexture(ZZZ), alphaTest: 0.5 })));
      this.scene.add(z);
      return z;
    });
    if (bed.spread) bed.spread.visible = false;
    w.bb.sprite.visible = false;
    w.bb.shadow.visible = false;
    bed.sleeper = { w, root, head, headSize: [art.width, art.height], chest, zs };
  }

  protected getUp(w: Walker) {
    const bed = this.beds.find((b) => b.sleeper?.w === w);
    if (!bed?.sleeper) return;
    const s = bed.sleeper;
    this.scene.remove(s.root, s.head, ...s.zs);
    s.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    (s.head.material as THREE.SpriteMaterial).map?.dispose();
    bed.sleeper = undefined;
    if (bed.spread) bed.spread.visible = true;
    w.bb.sprite.visible = true;
    w.bb.shadow.visible = true;
  }

  /** El durmiente: respira (el pecho sube y baja) y le salen zetas. Siempre delante de su cama. */
  private updateSleeper(w: Walker, u: number, tint: THREE.Color) {
    const bed = this.beds.find((b) => b.sleeper?.w === w);
    const s = bed?.sleeper;
    if (!bed || !s) return;
    const g = this.groups.find((q) => q.id === bed.id);
    const front = g ? g.depth - 0.0003 : null;
    s.head.scale.set(s.headSize[0] * u, s.headSize[1] * u, 1);
    (s.head.material as THREE.SpriteMaterial).userData.depth.value = front ?? 2;
    (s.head.material as THREE.SpriteMaterial).color.copy(tint);
    // respira: el pecho sube y baja un píxel
    s.chest.scale.y = Math.floor(this.time * 0.8 + w.phase) % 2 ? 0.66 : 0.55;
    s.zs.forEach((z, i) => {
      // suben en diagonal a saltos de píxel, una detrás de otra
      const t = (this.time * 0.35 + i / 3) % 1;
      const k = Math.floor(t * 6) / 6;
      z.position.copy(s.head.position);
      z.position.y += 0.25 + k * 0.7;
      z.position.x += 0.1 + k * 0.35;
      z.position.z -= 0.1 + k * 0.35;
      z.scale.set(ZZZ.width * u, ZZZ.height * u, 1);
      z.visible = t < 0.84;
      (z.material as THREE.SpriteMaterial).userData.depth.value = -0.99;
    });
  }
  private coachKey = '';

  constructor() {
    this.scene.background = new THREE.Color('#121c30');
  }

  /** Coloca a un personaje (NPC o jugador) en el escenario. */
  addWalker(look: Look, kit: Kit, num: number, civil: boolean, pos: THREE.Vector3, face: View = 'front', scale = 0.66): Walker {
    const art = composeCharacterArt(look, kit, num, civil);
    const bb = new Billboard(art.atlas, this.shadow.geo, this.shadow.mat, scale * look.height, art.parts);
    this.scene.add(bb.sprite, bb.shadow);
    const w: Walker = {
      bb,
      art,
      step: 0,
      stepT: 0,
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
      this.getUp(this.coach);
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
  protected groups: PropGroup[] = [];

  /** Marca piezas como un mueble con nombre: se tapan juntas y los sitios lo nombran en sus capas. */
  protected furniture(id: string, ...parts: THREE.Object3D[]) {
    for (const p of parts) p.traverse((o) => (o.userData.furniture = id));
    return parts;
  }

  /**
   * Agrupa los muebles y los aplana a su esquina delantera. Llamar al terminar de construir el sitio.
   * Las piezas con nombre (`furniture`) van juntas; lo demás se agrupa con el mueble sobre el que está
   * (la caja registradora con el mostrador). Lo colgado de la pared y lo que está a ras de suelo
   * (alfombras) no tapa a nadie.
   */
  protected flattenProps() {
    const props: { m: THREE.Mesh; box: THREE.Box3; id?: string }[] = [];
    this.scene.updateMatrixWorld(true);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.structure) return;
      const box = new THREE.Box3().setFromObject(m);
      const id: string | undefined = m.userData.furniture;
      if (box.max.y < 0.06) return;
      // los muebles con nombre siempre cuentan (la cama, aunque esté contra la pared)
      if (!id && (box.min.z <= this.b.backZ + 0.3 || box.min.x <= this.b.leftX + 0.3)) return;
      props.push({ m, box, id });
    });
    const area = (b: THREE.Box3) => (b.max.x - b.min.x) * (b.max.z - b.min.z);
    props.sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || area(b.box) - area(a.box));
    const groups: { box: THREE.Box3; meshes: THREE.Mesh[]; id?: string }[] = [];
    for (const p of props) {
      const cx = (p.box.min.x + p.box.max.x) / 2;
      const cz = (p.box.min.z + p.box.max.z) / 2;
      const g = p.id
        ? groups.find((q) => q.id === p.id)
        : groups.find((q) => cx >= q.box.min.x - 0.02 && cx <= q.box.max.x + 0.02 && cz >= q.box.min.z - 0.02 && cz <= q.box.max.z + 0.02);
      if (g) {
        g.box.union(p.box);
        g.meshes.push(p.m);
      } else groups.push({ box: p.box.clone(), meshes: [p.m], id: p.id });
    }
    for (const g of groups) {
      const anchor = new THREE.Vector3(g.box.max.x, g.box.min.y, g.box.max.z);
      const far = new THREE.Vector3(g.box.min.x, g.box.max.y, g.box.min.z);
      const uAnchor = { value: anchor };
      for (const m of g.meshes) m.material = Array.isArray(m.material) ? m.material.map((x) => flatMaterial(x, uAnchor)) : flatMaterial(m.material, uAnchor);
      this.groups.push({ id: g.id, uAnchor, min: g.box.min.clone(), max: g.box.max.clone(), anchor, far, depth: 0, farDepth: 0, rect: [0, 0, 0, 0] });
    }
  }

  /** Profundidad y rectángulo en pantalla de cada mueble (cambian con la cámara). */
  private measureGroups() {
    for (const g of this.groups) {
      const a = g.anchor.clone().project(this.camera).z;
      const f = g.far.clone().project(this.camera).z;
      g.depth = a;
      g.farDepth = a + (f - a) * COMPRESS;
      let x0 = 9;
      let y0 = 9;
      let x1 = -9;
      let y1 = -9;
      for (const x of [g.min.x, g.max.x])
        for (const y of [g.min.y, g.max.y])
          for (const z of [g.min.z, g.max.z]) {
            const p = new THREE.Vector3(x, y, z).project(this.camera);
            x0 = Math.min(x0, p.x);
            x1 = Math.max(x1, p.x);
            y0 = Math.min(y0, p.y);
            y1 = Math.max(y1, p.y);
          }
      g.rect = [x0, y0, x1, y1];
    }
  }

  /**
   * Delante o detrás de cada mueble que pisa en pantalla: entero, nunca a medias. Por defecto, detrás
   * si está más al fondo que la esquina delantera del mueble; un sitio puede decir otra cosa por
   * mueble (y dejar los brazos por encima). Devuelve la profundidad del cuerpo y la de los brazos.
   */
  private spriteDepth(w: Walker, sp: Spot | null | undefined): { body: number | null; arms: number | null } {
    if (!this.groups.length) return { body: null, arms: null };
    const feet = w.pos.clone().project(this.camera);
    let z = feet.z - 0.0004;
    const cam = this.camera as THREE.OrthographicCamera;
    const kx = 2 / (cam.right - cam.left);
    const ky = 2 / (cam.top - cam.bottom);
    const sx0 = feet.x - (w.bb.sprite.scale.x / 2) * kx;
    const sx1 = feet.x + (w.bb.sprite.scale.x / 2) * kx;
    const sy0 = feet.y;
    const sy1 = feet.y + w.bb.sprite.scale.y * ky;
    const front: PropGroup[] = [];
    let arms = Infinity;
    for (const g of this.groups) {
      const [x0, y0, x1, y1] = g.rect;
      if (sx1 < x0 || sx0 > x1 || sy1 < y0 || sy0 > y1) continue;
      const auto: Layer = w.pos.x < g.max.x - 0.05 && w.pos.z < g.max.z - 0.05 ? 'behind' : 'front';
      const rule = (g.id && sp?.layers?.[g.id]) || auto;
      if (rule === 'front') front.push(g);
      else {
        z = Math.max(z, g.farDepth + 0.0002);
        if (rule === 'arms') arms = Math.min(arms, g.depth - 0.0002);
      }
    }
    // a la mínima que no está detrás, va delante
    for (const g of front) z = Math.min(z, g.depth - 0.0002);
    return { body: z, arms: arms < Infinity ? Math.min(arms, z) : null };
  }

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
    this.camera.updateMatrixWorld();
    this.measureGroups();
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
      this.followRoutine(w, dt);
      // haciendo algo en un sitio (el míster o un vecino): poses en bucle, sin andar
      const sp = w.doing;
      if (sp && !sp.path) {
        this.tintAt(w.pos, tint);
        if (sp.bed) {
          this.updateSleeper(w, u, tint);
          continue;
        }
        const fr = sp.frames ?? ['idle0', 'idle1'];
        const view = sp.view ?? 'front';
        w.bb.setFrame(view, fr[Math.floor(this.time * (sp.fps ?? 1.5) + w.phase) % fr.length], !!sp.flip && view === 'side');
        w.bb.place(w.pos.x, w.pos.z, w.pos.y);
        const d = this.spriteDepth(w, sp);
        w.bb.setDepth(d.body, d.arms);
        w.bb.tint(tint);
        // al terminar, sigue mirando hacia donde estaba
        w.view = view;
        w.curFlip = !!sp.flip;
        w.vel = 0;
        w.moving = false;
        continue;
      }
      if (w === this.coach && this.act?.spec.path) {
        const path = this.act.spec.path;
        if (Math.hypot(w.target.x - w.pos.x, w.target.z - w.pos.z) < 0.4) {
          this.act.leg = (this.act.leg + 1) % path.length;
          w.target.copy(path[this.act.leg]);
        }
      }
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
      const d = this.spriteDepth(w, null);
      w.bb.setDepth(d.body, d.arms);
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
