import * as THREE from 'three';
import { PITCH_L, PITCH_W } from '../../sim/geometry';
import type { MatchSim } from '../../sim/match';
import type { AnimTracker } from '../anim';
import type { CameraMode, ScreenPoint } from '../types';

/** Cámara de retransmisión compartida por los dos prototipos 3D. */
export class BroadcastCamera {
  camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.5, 600);
  mode: CameraMode = 'tv';
  private pos = new THREE.Vector3(0, 30, 70);
  private look = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private punch = 0;

  goalPunch() {
    this.punch = 1;
  }

  update(sim: MatchSim, A: AnimTracker, dt: number) {
    const fx = A.bx - PITCH_L / 2;
    const fz = A.by - PITCH_W / 2;
    const desired = new THREE.Vector3();
    const look = new THREE.Vector3();
    let fov = 30;
    const celebrating = sim.phase === 'goal' && sim.lastGoal && this.mode !== 'tactical';
    if (celebrating) {
      const s = sim.lastGoal!.scorer;
      const sx = A.x[s] - PITCH_L / 2;
      const sz = A.y[s] - PITCH_W / 2;
      desired.set(sx, 6.5, sz + 15);
      look.set(sx, 1.4, sz);
      fov = 34;
    } else if (this.mode === 'tactical') {
      desired.set(fx * 0.3, 88, 34);
      look.set(fx * 0.3, 0, 3);
      fov = 40;
    } else if (this.mode === 'close') {
      const owner = sim.ball.owner >= 0 ? sim.players[sim.ball.owner] : null;
      const dir = owner ? sim.dir(owner.team) : 1;
      desired.set(fx - dir * 7, 4.2, fz + 11);
      look.set(fx + dir * 4, 1, fz);
      fov = 44;
    } else {
      desired.set(fx * 0.9, 17, 37 + fz * 0.25);
      look.set(fx * 0.95, 0, fz * 0.55 - 6);
      fov = 34;
    }
    this.punch = Math.max(0, this.punch - dt * 0.8);
    fov -= this.punch * 6;
    const k = 1 - Math.exp(-dt * (celebrating ? 1.6 : 2.4));
    this.pos.lerp(desired, k);
    this.look.lerp(look, k);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
    this.camera.fov += (fov - this.camera.fov) * k;
    this.camera.updateProjectionMatrix();
  }

  project(v: THREE.Vector3, w: number, h: number): ScreenPoint {
    this.tmp.copy(v).project(this.camera);
    return { x: (this.tmp.x * 0.5 + 0.5) * w, y: (-this.tmp.y * 0.5 + 0.5) * h, visible: this.tmp.z < 1 && Math.abs(this.tmp.x) < 1.2 && Math.abs(this.tmp.y) < 1.2 };
  }
}

export const THREE_CAMERA_MODES: { id: CameraMode; label: string }[] = [
  { id: 'tv', label: 'Televisión' },
  { id: 'tactical', label: 'Táctica' },
  { id: 'close', label: 'A pie de campo' },
];
