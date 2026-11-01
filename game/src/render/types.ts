import type { MatchSim } from '../sim/match';
import type { MatchEvent } from '../sim/types';

export type RendererId = 'hybrid';
export type CameraMode = 'tv' | 'tactical' | 'close';

export interface ScreenPoint {
  x: number;
  y: number;
  visible: boolean;
}

export interface PerfInfo {
  drawCalls: number;
  detail: string;
}

/**
 * Contrato que cumple cada estilo visual. El motor no sabe nada de cómo se dibuja:
 * cambiar de estética es cambiar de MatchRenderer, el partido sigue intacto.
 */
export interface MatchRenderer {
  readonly id: RendererId;
  readonly cameraModes: { id: CameraMode; label: string }[];
  /** Altura (en metros del mundo del renderizador) de la parte alta de la cabeza: para bocadillos. */
  readonly headHeight: number;
  mount(host: HTMLElement): void;
  resize(w: number, h: number): void;
  render(sim: MatchSim, alpha: number, dt: number): void;
  onEvent(e: MatchEvent, sim: MatchSim): void;
  setCamera(mode: CameraMode): void;
  setSelected(idx: number): void;
  /** Punto del mundo (metros, z = altura) → píxeles CSS relativos al contenedor. */
  project(x: number, y: number, z: number): ScreenPoint;
  portrait(sim: MatchSim, idx: number, size: number): HTMLCanvasElement;
  perf(): PerfInfo;
  dispose(): void;
}
