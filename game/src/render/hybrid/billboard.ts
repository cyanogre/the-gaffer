import * as THREE from 'three';
import type { Kit, Look } from '../../content/look';
import type { MatchSim } from '../../sim/match';
import type { SimPlayer } from '../../sim/types';
import { SheetStore, composeSprites, type SpriteSet } from '../pixel/sheets';
import { SH, SW, type FrameId, type View } from '../pixel/sprites';
import { PIXEL_GRID } from '../pixelgrid';

/**
 * Personajes 2D dentro del mundo 3D: cada muñeco es un sprite que mira siempre a cámara,
 * con su hoja de animación como textura pixel (sin suavizado). La luz de la escena le tiñe.
 */
export const sheetStore = new SheetStore();

const COLS: FrameId[] = ['idle0', 'idle1', 'run0', 'run1', 'run2', 'run3', 'kick', 'up0', 'up1', 'out', 'ear', 'slide', 'fall', 'dive', 'poke', 'head', 'push', 'kneel', 'throw', 'catch'];
const ROWS: View[] = ['front', 'back', 'side'];
/** Altura en metros de la celda de 48 px (la figura de ≈46 px mide ≈ 2,1 m: exageración ligera para leerse). */
export const CELL_H = 2.2;
export const CELL_W = (CELL_H * SW) / SH;

/**
 * Sprites pixel dentro del 3D:
 * - Profundidad plana: todo el sprite usa la profundidad de su punto de apoyo (los pies), así
 *   nunca atraviesa un mueble o una valla.
 * - Tamaño fijo en píxeles (no encoge con la distancia) y anclado a la rejilla de píxel: cada
 *   píxel de arte ocupa exactamente un píxel de la escena, sin columnas gordas ni finas.
 */
export function flatDepth<T extends THREE.SpriteMaterial>(mat: T): T {
  mat.sizeAttenuation = false;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPixelGrid = PIXEL_GRID;
    shader.vertexShader = 'uniform vec2 uPixelGrid;\n' + shader.vertexShader.replace(
      '#include <logdepthbuf_vertex>',
      `vec4 anchorClip = projectionMatrix * modelViewMatrix[ 3 ];
      vec2 anchorPix = ( anchorClip.xy / anchorClip.w * 0.5 + 0.5 ) * uPixelGrid;
      vec2 snapPix = floor( anchorPix + 0.5 ) - anchorPix;
      gl_Position.xy += snapPix / uPixelGrid * 2.0 * gl_Position.w;
      gl_Position.z = ( anchorClip.z / anchorClip.w - 0.0004 ) * gl_Position.w;
      #include <logdepthbuf_vertex>`,
    );
  };
  mat.customProgramCacheKey = () => 'pixel-sprite';
  return mat;
}

/** Ajusta un sprite a su tamaño en píxeles de arte (u = unidades por píxel, ver texelUnits). */
export function pixelSize(s: THREE.Sprite, w: number, h: number, u: number) {
  s.scale.set(w * u, h * u, 1);
}

export function atlasTexture(set: SpriteSet) {
  const cv = document.createElement('canvas');
  cv.width = SW * COLS.length;
  cv.height = SH * ROWS.length;
  const g = cv.getContext('2d')!;
  ROWS.forEach((view, r) =>
    COLS.forEach((frame, c) => {
      const img = set[view][frame] ?? set.side[frame];
      if (img) g.drawImage(img, c * SW, r * SH);
    }),
  );
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Billboard {
  sprite: THREE.Sprite;
  shadow: THREE.Mesh;
  private tex: THREE.Texture;
  view: View = 'side';
  flip = false;

  constructor(atlas: THREE.Texture, shadowGeo: THREE.BufferGeometry, shadowMat: THREE.Material, scale = 1) {
    this.tex = atlas.clone();
    this.tex.needsUpdate = true;
    this.tex.repeat.set(1 / COLS.length, 1 / ROWS.length);
    const mat = flatDepth(new THREE.SpriteMaterial({ map: this.tex, alphaTest: 0.5, transparent: false }));
    this.sprite = new THREE.Sprite(mat);
    // ancla en el borde de un píxel (centro horizontal, fila de las suelas) para que encaje en la rejilla
    this.sprite.center.set(0.5, 1 / SH);
    this.sprite.scale.set(CELL_W * scale, CELL_H * scale, 1);
    this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.scale.setScalar(scale);
  }

  /** Último fotograma puesto (para depurar y para las pruebas). */
  shown = '';
  setFrame(view: View, frame: FrameId, flip: boolean) {
    this.shown = `${view}:${frame}:${flip ? 'f' : ''}`;
    const c = COLS.indexOf(frame);
    const r = ROWS.indexOf(view);
    const cw = 1 / COLS.length;
    this.tex.repeat.x = flip ? -cw : cw;
    this.tex.offset.x = flip ? (c + 1) * cw : c * cw;
    this.tex.offset.y = 1 - (r + 1) / ROWS.length;
  }

  place(x: number, y: number, z: number, lift = 0) {
    this.sprite.position.set(x, z + lift, y);
    this.shadow.position.set(x, z + 0.02, y);
  }

  /** Tamaño exacto: un píxel de arte por píxel de la escena. */
  setTexel(u: number) {
    this.sprite.scale.set(SW * u, SH * u, 1);
  }

  tint(c: THREE.Color) {
    (this.sprite.material as THREE.SpriteMaterial).color.copy(c);
  }

  dispose() {
    this.tex.dispose();
    (this.sprite.material as THREE.SpriteMaterial).dispose();
  }
}

export function composeCharacter(look: Look, kit: Kit, num: number, civil: boolean) {
  return atlasTexture(composeSprites(sheetStore, look, kit, num, civil));
}

/** Vista y volteo según hacia dónde se mueve (la cámara mira desde la banda cercana). */
export function viewOf(p: SimPlayer, moving: boolean, last: View | undefined, lastFlip: boolean): { view: View; flip: boolean } {
  const dx = moving ? p.vx : Math.cos(p.facing);
  const dy = moving ? p.vy : Math.sin(p.facing);
  let view: View = last ?? 'side';
  if (p.action === 'celebrate') view = 'front';
  else if (p.action === 'tackle' || p.action === 'fall' || p.action === 'dive' || p.action === 'kick' || p.action === 'poke' || p.action === 'push') view = 'side';
  else if (Math.abs(dy) > Math.abs(dx) * 1.3) view = dy > 0 ? 'front' : 'back';
  else if (Math.abs(dx) > Math.abs(dy) * 1.1) view = 'side';
  let flip = lastFlip;
  if (dx < -0.2) flip = true;
  else if (dx > 0.2) flip = false;
  if (p.action === 'dive') flip = p.actionSide < 0;
  return { view, flip };
}

/** Lo que el motor dice que pasa, en un fotograma. `sim` aporta el contexto (saques, balón en las manos). */
export function frameOf(p: SimPlayer, moving: boolean, phase: number, time: number, sim?: MatchSim): FrameId {
  if (sim) {
    const r = sim.restart;
    if (sim.phase === 'restart' && r && r.kind === 'throw' && r.taker === p.idx) return 'throw';
    if (sim.ball.owner === p.idx && sim.isGK(p) && p.action === 'none' && sim.inOwnBox(p.team, p.x, p.y)) return 'catch';
  }
  switch (p.action) {
    case 'tackle':
      return 'slide';
    case 'fall':
      return 'fall';
    case 'dive':
      return 'dive';
    case 'kick':
      return 'kick';
    case 'poke':
      return 'poke';
    case 'header':
      return 'head';
    case 'push':
      return 'push';
    case 'celebrate': {
      const c = p.profile.look.celebration;
      if (c === 'plane') return 'out';
      if (c === 'ear') return 'ear';
      return Math.floor(time * 6) % 2 ? 'up0' : 'up1';
    }
  }
  // tras caer o chocar, se levanta: de rodillas mientras dura el aturdimiento
  if (p.stunT > 0.15 && !moving) return 'kneel';
  if (moving) return (['run0', 'run1', 'run2', 'run3'] as const)[Math.floor(phase / (Math.PI / 2)) & 3];
  return Math.floor(time * 1.4 + p.idx * 0.37) % 2 ? 'idle0' : 'idle1';
}

/** Sombra suave en el suelo (textura radial). */
export function blobShadow() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(16, 16, 2, 16, 16, 15);
  gr.addColorStop(0, 'rgba(10,8,20,0.55)');
  gr.addColorStop(1, 'rgba(10,8,20,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  return {
    geo: new THREE.PlaneGeometry(1.5, 0.9),
    mat: new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }),
  };
}

/** Pequeños sprites pixel dibujados a mano en código: paraguas, perro, pancarta. */
export function pixelCanvas(rows: string[], palette: Record<string, string>) {
  const c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const g = c.getContext('2d')!;
  rows.forEach((r, y) =>
    r.split('').forEach((ch, x) => {
      if (ch === '.') return;
      g.fillStyle = palette[ch];
      g.fillRect(x, y, 1, 1);
    }),
  );
  return c;
}

export function nearestTexture(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
