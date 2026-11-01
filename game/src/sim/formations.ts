import type { Formation, Role } from './types';

/**
 * Posición base de cada puesto en coordenadas relativas al ataque:
 * u = 0 propia línea de gol → 1 portería rival; v = 0 banda derecha → 1 banda izquierda.
 * El índice del puesto se mantiene entre formaciones (0 portero, 1 lateral derecho...).
 */
export interface Slot {
  u: number;
  v: number;
  role: Role;
  label: string;
}

export const FORMATIONS: Record<Formation, Slot[]> = {
  '4-3-3': [
    { u: 0.03, v: 0.5, role: 'POR', label: 'POR' },
    { u: 0.22, v: 0.14, role: 'DEF', label: 'LD' },
    { u: 0.18, v: 0.37, role: 'DEF', label: 'DFC' },
    { u: 0.18, v: 0.63, role: 'DEF', label: 'DFC' },
    { u: 0.22, v: 0.86, role: 'DEF', label: 'LI' },
    { u: 0.38, v: 0.3, role: 'MED', label: 'MC' },
    { u: 0.33, v: 0.5, role: 'MED', label: 'MCD' },
    { u: 0.38, v: 0.7, role: 'MED', label: 'MC' },
    { u: 0.56, v: 0.14, role: 'DEL', label: 'ED' },
    { u: 0.6, v: 0.5, role: 'DEL', label: 'DC' },
    { u: 0.56, v: 0.86, role: 'DEL', label: 'EI' },
  ],
  // Del 4-3-3 al 4-4-2: los extremos bajan a banda y el interior izquierdo acompaña al 9.
  '4-4-2': [
    { u: 0.03, v: 0.5, role: 'POR', label: 'POR' },
    { u: 0.22, v: 0.14, role: 'DEF', label: 'LD' },
    { u: 0.18, v: 0.37, role: 'DEF', label: 'DFC' },
    { u: 0.18, v: 0.63, role: 'DEF', label: 'DFC' },
    { u: 0.22, v: 0.86, role: 'DEF', label: 'LI' },
    { u: 0.37, v: 0.37, role: 'MED', label: 'MC' },
    { u: 0.37, v: 0.63, role: 'MED', label: 'MC' },
    { u: 0.57, v: 0.62, role: 'DEL', label: 'DC' },
    { u: 0.41, v: 0.14, role: 'MED', label: 'MD' },
    { u: 0.58, v: 0.4, role: 'DEL', label: 'DC' },
    { u: 0.41, v: 0.86, role: 'MED', label: 'MI' },
  ],
  // Del 4-3-3 al 5-3-2: el pivote se mete de líbero y los laterales pasan a carrileros.
  '5-3-2': [
    { u: 0.03, v: 0.5, role: 'POR', label: 'POR' },
    { u: 0.27, v: 0.1, role: 'DEF', label: 'CAD' },
    { u: 0.17, v: 0.32, role: 'DEF', label: 'DFC' },
    { u: 0.17, v: 0.68, role: 'DEF', label: 'DFC' },
    { u: 0.27, v: 0.9, role: 'DEF', label: 'CAI' },
    { u: 0.37, v: 0.3, role: 'MED', label: 'MC' },
    { u: 0.15, v: 0.5, role: 'DEF', label: 'LIB' },
    { u: 0.37, v: 0.7, role: 'MED', label: 'MC' },
    { u: 0.43, v: 0.5, role: 'MED', label: 'MCO' },
    { u: 0.58, v: 0.38, role: 'DEL', label: 'DC' },
    { u: 0.58, v: 0.62, role: 'DEL', label: 'DC' },
  ],
};

export const FORMATION_NAMES: Formation[] = ['4-3-3', '4-4-2', '5-3-2'];
