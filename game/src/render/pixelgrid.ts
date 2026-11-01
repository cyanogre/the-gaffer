import * as THREE from 'three';

/**
 * Rejilla de píxel única. Las escenas 3D se dibujan a baja resolución y se amplían por un número
 * ENTERO de píxeles del dispositivo (teniendo en cuenta la densidad de la pantalla). Los sprites
 * se dibujan a un píxel de arte por píxel de esa rejilla, pegados a ella. Así ningún píxel sale
 * más gordo o más fino que otro.
 */
export interface Grid {
  /** Píxeles del dispositivo por píxel de arte. */
  P: number;
  /** Resolución interna (píxeles de arte). */
  intW: number;
  intH: number;
  /** Tamaño CSS del lienzo (puede pasarse del contenedor en menos de un píxel de arte: se recorta). */
  cssW: number;
  cssH: number;
}

/** Rejilla actual para el shader de los sprites (la fija el renderizador que va a dibujar). */
export const PIXEL_GRID = { value: new THREE.Vector2(1, 1) };

export const dpr = () => Math.max(1, window.devicePixelRatio || 1);

/** Escala por defecto: ~360 píxeles de arte en el lado corto de la pantalla. */
export function defaultScale(cssW: number, cssH: number) {
  const d = dpr();
  const shortSide = Math.min(cssW, cssH) * d;
  return Math.max(1, Math.round(shortSide / 360));
}

export function gridFor(cssW: number, cssH: number, P: number): Grid {
  const d = dpr();
  const devW = Math.round(cssW * d);
  const devH = Math.round(cssH * d);
  const intW = Math.max(1, Math.ceil(devW / P));
  const intH = Math.max(1, Math.ceil(devH / P));
  return { P, intW, intH, cssW: (intW * P) / d, cssH: (intH * P) / d };
}

/** Ajusta el lienzo: búfer interno a la resolución de arte y tamaño CSS múltiplo exacto. */
export function fitCanvas(renderer: THREE.WebGLRenderer, g: Grid) {
  renderer.setPixelRatio(1);
  renderer.setSize(g.intW, g.intH, false);
  const c = renderer.domElement;
  c.style.width = `${g.cssW}px`;
  c.style.height = `${g.cssH}px`;
  c.style.right = 'auto';
  c.style.bottom = 'auto';
}

/**
 * Unidades de escala de un sprite por píxel de arte. Con cámara ortográfica son metros; con
 * perspectiva los sprites no se encogen con la distancia (sizeAttenuation desactivado) y la
 * unidad sale de la proyección.
 */
export function texelUnits(cam: THREE.Camera, intH: number) {
  if (cam instanceof THREE.OrthographicCamera) return (cam.top - cam.bottom) / cam.zoom / intH;
  const p = (cam as THREE.PerspectiveCamera).projectionMatrix.elements[5];
  return 2 / (p * intH);
}

/** Tamaño CSS para mostrar una imagen pixel de `texels` lado a un múltiplo entero en el dispositivo. */
export function crispCss(texels: number, desiredCss: number) {
  const d = dpr();
  const m = Math.max(1, Math.round((desiredCss * d) / texels));
  return (texels * m) / d;
}
