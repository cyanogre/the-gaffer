// Medidas reglamentarias en metros. El motor trabaja siempre en metros y segundos.
export const PITCH_L = 105;
export const PITCH_W = 68;
export const GOAL_W = 7.32;
export const GOAL_H = 2.44;
export const GOAL_Y0 = (PITCH_W - GOAL_W) / 2;
export const GOAL_Y1 = GOAL_Y0 + GOAL_W;
export const BOX_D = 16.5;
export const BOX_W = 40.32;
export const SIX_D = 5.5;
export const SIX_W = 18.32;
export const PENALTY_D = 11;
export const CENTER_R = 9.15;
export const GRAVITY = 9.81;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(bx - ax, by - ay);
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Distancia de un punto al segmento AB y posición relativa (0..1) de la proyección. */
export function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy || 1e-6;
  const s = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  return { d: dist(px, py, ax + dx * s, ay + dy * s), s };
}

/** Ángulo con el que se ve la portería desde (x, y). Cuanto mayor, más fácil marcar. */
export function goalOpening(x: number, y: number, goalX: number) {
  const dx = Math.abs(goalX - x) || 1e-3;
  const a0 = Math.atan2(GOAL_Y0 - y, dx);
  const a1 = Math.atan2(GOAL_Y1 - y, dx);
  return Math.abs(a1 - a0);
}

export function angleLerp(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
