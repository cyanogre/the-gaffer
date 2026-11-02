import { cellOf, outline, toCanvas } from './sheets';

/**
 * Tumba la cabeza de perfil (ojos cerrados) sobre la almohada: giro exacto de 90º, sin perder un
 * píxel, con la coronilla hacia la cabecera de la cama en pantalla y la cara mirando arriba (si la
 * cama va al revés, el dibujo se voltea).
 *
 * Probado y descartado: girarla al ángulo exacto de la cama (RotSprite a 65º la deja en una bola sin
 * cara) y cizallarla en escalera 2:1 (queda una hoja torcida). Con una cabeza de 11 px, la cabeza
 * recta sobre la almohada y la manta en 3D siguiendo la cama se leen mejor que cualquier giro.
 *
 * `up`: hacia dónde queda la cabecera en pantalla (x a la derecha, y hacia abajo).
 */
export function lyingHead(src: HTMLCanvasElement, up: { x: number; y: number }) {
  const w = src.width;
  const h = src.height;
  const cell = cellOf(src);
  const left = up.x <= 0;
  const ow = h + 2;
  const oh = w + 2;
  const out = new Uint32Array(ow * oh);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = cell[y * w + x];
      if (!v) continue;
      // de pie mira a la derecha: la coronilla pasa a un lado y la cara arriba
      const nx = left ? y : h - 1 - y;
      const ny = w - 1 - x;
      out[(ny + 1) * ow + nx + 1] = v;
    }
  outline(out, ow, oh);
  return toCanvas({ data: out, w: ow, h: oh });
}
