/**
 * Una persona de referencia en 3D (esqueleto de palitos) para dibujar los sprites 2D.
 *
 * Cada pose guarda los ángulos de muslo, espinilla, brazo y antebrazo; el generador los
 * proyecta a cada vista (frente, espalda, perfil). Así rodillas y codos doblan igual
 * desde cualquier lado, y la carrera sigue un ciclo de animación clásico
 * (contacto → paso → contacto → paso) en vez de piernas rectas como palos.
 *
 * Ángulos en grados. `sag`: hacia delante (+) o hacia atrás (−) desde la vertical.
 * `cor`: hacia fuera del cuerpo (+), en el plano frontal. Los ángulos son absolutos (no
 * relativos al segmento padre): más fáciles de leer y de retocar.
 */
export type Seg = [sag: number, cor: number];
export interface LimbPose {
  upper: Seg;
  lower: Seg;
}
/** [0] = izquierda en pantalla (frente/espalda) o lado lejano (perfil); [1] = derecha / lado cercano. */
export type Pair = [LimbPose, LimbPose];

const L = (upper: Seg, lower: Seg): LimbPose => ({ upper, lower });

// ── piernas (muslo 7 px, espinilla 7 px)
const STAND = L([3, 3], [-4, -2]);
const PLANT = L([4, 0], [-14, 0]);
const KNEE_UP = L([62, 0], [-28, 0]);
const REACH = L([32, 0], [12, 0]);
const PUSH = L([-28, 0], [-78, 0]);
const PASS_FREE = L([30, 0], [-92, 0]);
const PASS_SUPPORT = L([3, 0], [-24, 0]);

export const LEG_POSES: Record<string, Pair> = {
  stand: [STAND, STAND],
  liftL: [KNEE_UP, PLANT],
  liftR: [PLANT, KNEE_UP],
  // perfil: contacto con la pierna cercana delante, paso, contacto con la lejana, paso
  runA: [PUSH, REACH],
  runB: [PASS_FREE, PASS_SUPPORT],
  runC: [REACH, PUSH],
  runD: [PASS_SUPPORT, PASS_FREE],
  kick: [L([0, 0], [-8, 0]), L([72, 0], [82, 0])],
};

// ── brazos (brazo 5 px, antebrazo con mano 5 px)
const HANG = L([-4, 13], [14, -7]);
const FWD = L([38, 5], [112, 5]);
const BACK = L([-44, 5], [22, 5]);

export const ARM_POSES: Record<string, Pair> = {
  down: [HANG, HANG],
  swingL: [FWD, BACK],
  swingR: [BACK, FWD],
  up: [L([4, 162], [4, 174]), L([4, 162], [4, 174])],
  up2: [L([16, 138], [16, 158]), L([16, 138], [16, 158])],
  out: [L([18, 84], [24, 90]), L([18, 84], [24, 90])],
  // mano a la oreja: el brazo sube y el antebrazo vuelve hacia la cabeza
  ear: [L([0, 122], [0, 212]), HANG],
};

const D = Math.PI / 180;
/** Dirección del segmento: x lateral (side = −1 izquierda, +1 derecha), y hacia abajo, z hacia delante. */
export function dir(seg: Seg, side: number) {
  const s = seg[0] * D;
  const c = seg[1] * D;
  return { x: Math.sin(c) * side, y: Math.cos(c) * Math.cos(s), z: Math.cos(c) * Math.sin(s) };
}

export type ViewKind = 'front' | 'back' | 'side';

/**
 * Proyecta un miembro desde su raíz (cadera u hombro, en píxeles de la celda).
 * Devuelve la articulación media (rodilla/codo) y el extremo (tobillo/mano).
 */
export function project(view: ViewKind, root: { x: number; y: number }, pose: LimbPose, side: number, lenUpper: number, lenLower: number) {
  // [0] es siempre el miembro de la izquierda de la pantalla: «hacia fuera» es −x tanto de frente como de espaldas
  const p = (d: { x: number; y: number; z: number }, len: number) => ({ dx: (view === 'side' ? d.z : d.x) * len, dy: d.y * len });
  const a = p(dir(pose.upper, side), lenUpper);
  const b = p(dir(pose.lower, side), lenLower);
  const mid = { x: root.x + a.dx, y: root.y + a.dy };
  const end = { x: mid.x + b.dx, y: mid.y + b.dy };
  return { mid, end };
}
