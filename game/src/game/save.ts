import type { Career } from './career';

/** Guardado automático en el navegador (una sola ranura). */
const KEY = 'the-gaffer-partida';

export function saveGame(c: Career) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* sin almacenamiento (modo privado): se juega igual, sin guardar */
  }
}

export function loadGame(): Career | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Career;
    return c && c.v === 2 ? c : null;
  } catch {
    return null;
  }
}

export function clearGame() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nada que borrar */
  }
}
