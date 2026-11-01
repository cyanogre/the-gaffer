import { PITCH_L, PITCH_W } from '../../sim/geometry';

/**
 * Cámara de retransmisión estenopeica para el pixel art: proyecta el mundo (metros) a la
 * resolución interna baja. Es fija y encuadra el campo entero, como una realización de TV.
 *
 * Base de la cámara: derecha (1,0,0), adelante (0,-cos θ,-sen θ), arriba (0,-sen θ,cos θ).
 */
export class PerspCam {
  W = 640;
  H = 360;
  f = 1000;
  cy0 = 220;
  readonly cx = PITCH_L / 2;
  readonly camY = PITCH_W + 140;
  readonly camZ = 150;
  readonly ct: number;
  readonly st: number;

  constructor() {
    const th = Math.atan2(this.camZ, this.camY - PITCH_W / 2);
    this.ct = Math.cos(th);
    this.st = Math.sin(th);
  }

  private depth(y: number, z: number) {
    return (this.camY - y) * this.ct + (this.camZ - z) * this.st;
  }
  private up(y: number, z: number) {
    return (this.camY - y) * this.st - (this.camZ - z) * this.ct;
  }

  /** Línea de banda cercana al 94 % del ancho; banda lejana al 30 % de la altura. */
  fit(W: number, H: number) {
    this.W = W;
    this.H = H;
    const dN = this.depth(PITCH_W, 0);
    const dF = this.depth(0, 0);
    const span = -this.up(PITCH_W, 0) / dN + this.up(0, 0) / dF;
    this.f = Math.min((0.47 * W * dN) / (PITCH_L / 2), (0.64 * H) / span);
    this.cy0 = 0.3 * H + (this.f * this.up(0, 0)) / dF;
  }

  project(x: number, y: number, z = 0) {
    const d = this.depth(y, z);
    return { x: this.W / 2 + (this.f * (x - this.cx)) / d, y: this.cy0 - (this.f * this.up(y, z)) / d, d };
  }

  /** Píxel de pantalla → punto del suelo (z = 0), con el tamaño en metros de un píxel ahí. */
  unproject(X: number, Y: number) {
    const a = (X - this.W / 2) / this.f;
    const b = (this.cy0 - Y) / this.f;
    const dy = -this.ct - b * this.st;
    const dz = -this.st + b * this.ct;
    if (dz >= -1e-4) return null;
    const t = -this.camZ / dz;
    return { x: this.cx + a * t, y: this.camY + dy * t, scale: t / this.f };
  }
}
