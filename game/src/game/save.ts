import { migrateStats, type Career } from './career';

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
    if (!c || c.v !== 2) return null;
    c.guide ??= -1;
    c.dayNotes ??= [];
    c.promises ??= [];
    for (const p of c.squad) {
      if (p.look.hair === 'mohawk' || p.look.hair === 'mullet') p.look.hair = p.look.gender === 'f' ? 'ponytail' : 'quiff';
      p.morale ??= 60;
      p.moraleLog ??= [];
      p.form ??= [];
    }
    migrateStats(c);
    c.coach.food ??= 80;
    c.coach.mood ??= 65;
    return c;
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
