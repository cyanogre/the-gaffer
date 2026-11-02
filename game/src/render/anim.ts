import type { MatchSim } from '../sim/match';
import type { SimPlayer } from '../sim/types';

/**
 * Estado de animación compartido por los renderizadores: posición interpolada entre ticks,
 * velocidad suavizada y fase del ciclo de carrera. Así los tres estilos se mueven igual.
 */
export class AnimTracker {
  phase: number[] = [];
  speed: number[] = [];
  /** Corriendo o quieto, con margen: para arrancar hace falta más velocidad que para seguir. */
  moving: boolean[] = [];
  x: number[] = [];
  y: number[] = [];
  bx = 0;
  by = 0;
  bz = 0;
  time = 0;

  update(sim: MatchSim, alpha: number, dt: number) {
    this.time += dt;
    for (const p of sim.players) {
      const i = p.idx;
      this.x[i] = p.px + (p.x - p.px) * alpha;
      this.y[i] = p.py + (p.y - p.py) * alpha;
      // velocidad real (lo que se ha desplazado), no la intención: contra la banda no «corre en el sitio»;
      // los saltos de colocación en los saques no cuentan
      const s = Math.min(10, Math.hypot(p.x - p.px, p.y - p.py) / sim.dt);
      this.speed[i] = (this.speed[i] ?? 0) + (s - (this.speed[i] ?? 0)) * Math.min(1, dt * 8);
      this.moving[i] = this.moving[i] ? this.speed[i] > 0.4 : this.speed[i] > 1;
      // el ciclo de carrera avanza con lo recorrido y nunca va a cámara lenta
      if (this.moving[i]) this.phase[i] = (this.phase[i] ?? i * 0.7) + Math.max(this.speed[i], 3) * dt * 1.55;
    }
    const b = sim.ball;
    this.bx = b.px + (b.x - b.px) * alpha;
    this.by = b.py + (b.y - b.py) * alpha;
    this.bz = b.pz + (b.z - b.pz) * alpha;
  }
}

/** Pose de esqueleto simple (ángulos en radianes) que entienden los dos renderizadores 3D. */
export interface Pose {
  legA: number;
  legB: number;
  armA: number;
  armB: number;
  raiseA: number;
  raiseB: number;
  lean: number;
  lie: number;
  lieDir: number;
  roll: number;
  bob: number;
  jump: number;
  spin: number;
  shout: boolean;
}

const ease = (k: number) => k * k * (3 - 2 * k);

export function computePose(p: SimPlayer, phase: number, speed: number, time: number): Pose {
  const run = Math.min(1, speed / 7);
  const sw = Math.sin(phase);
  const pose: Pose = {
    legA: sw * 0.95 * run,
    legB: -sw * 0.95 * run,
    armA: -sw * 0.75 * run,
    armB: sw * 0.75 * run,
    raiseA: 0.12,
    raiseB: 0.12,
    lean: 0.14 * run + (speed > 6 ? 0.08 : 0),
    lie: 0,
    lieDir: 1,
    roll: 0,
    bob: Math.abs(Math.cos(phase)) * 0.07 * run + Math.sin(time * 2.2 + p.idx) * 0.008,
    jump: 0,
    spin: 0,
    shout: false,
  };
  const k = p.actionDur > 0 ? 1 - Math.max(0, p.actionT) / p.actionDur : 1;
  switch (p.action) {
    case 'kick': {
      pose.legA = k < 0.35 ? -0.9 * (k / 0.35) : -0.9 + ((k - 0.35) / 0.65) * 2.3;
      pose.legB = 0.1;
      pose.armA = 0.5;
      pose.armB = -0.6;
      pose.raiseA = pose.raiseB = 0.5;
      pose.lean = -0.08;
      break;
    }
    case 'poke':
      pose.legA = Math.sin(k * Math.PI) * 1.0;
      pose.lean = 0.25;
      break;
    case 'tackle': {
      const l = k < 0.15 ? ease(k / 0.15) : k > 0.8 ? ease((1 - k) / 0.2) : 1;
      pose.lie = l;
      pose.lieDir = 1;
      pose.legA = 1.1;
      pose.legB = 0.35;
      pose.armA = -0.5;
      pose.armB = -1.3;
      pose.bob = 0;
      break;
    }
    case 'dive': {
      const l = k < 0.2 ? ease(k / 0.2) : k > 0.75 ? ease((1 - k) / 0.25) : 1;
      pose.roll = l * 1.35;
      pose.raiseA = pose.raiseB = 2.6;
      pose.jump = Math.sin(Math.min(1, k * 2.2) * Math.PI) * 0.45;
      pose.legA = 0.3;
      pose.legB = -0.2;
      break;
    }
    case 'fall': {
      const l = k < 0.25 ? ease(k / 0.25) : k > 0.8 ? ease((1 - k) / 0.2) : 1;
      pose.lie = l;
      pose.lieDir = 1;
      pose.raiseA = 1.6 + Math.sin(time * 14) * 0.5;
      pose.raiseB = 1.6 + Math.cos(time * 13) * 0.5;
      pose.legA = 0.6 + Math.sin(time * 11) * 0.3;
      pose.legB = 0.2;
      pose.shout = true;
      break;
    }
    case 'celebrate': {
      pose.shout = true;
      switch (p.profile.look.celebration) {
        case 'arms':
          pose.raiseA = pose.raiseB = 2.75;
          pose.jump = Math.abs(Math.sin(time * 6)) * 0.35;
          break;
        case 'plane':
          pose.raiseA = pose.raiseB = 1.57;
          pose.roll = Math.sin(time * 3) * 0.35;
          pose.lean = 0.25;
          break;
        case 'knees':
          if (k < 0.45) {
            pose.lean = -0.55;
            pose.bob = -0.32;
            pose.legA = pose.legB = -1.25;
            pose.raiseA = pose.raiseB = 2.5;
          } else {
            pose.raiseA = 2.6;
            pose.raiseB = 2.6;
            pose.jump = Math.abs(Math.sin(time * 5)) * 0.25;
          }
          break;
        case 'dance':
          pose.spin = time * 6;
          pose.raiseA = 1.3 + Math.sin(time * 8) * 1.1;
          pose.raiseB = 1.3 - Math.sin(time * 8) * 1.1;
          pose.bob = Math.abs(Math.sin(time * 8)) * 0.12;
          break;
        case 'ear':
          pose.raiseA = 2.3;
          pose.armA = 0.6;
          pose.raiseB = 0.3;
          pose.lean = 0.1;
          break;
      }
      break;
    }
  }
  return pose;
}
