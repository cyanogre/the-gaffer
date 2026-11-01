/**
 * Generador pseudoaleatorio con semilla (mulberry32).
 * Todo el azar del motor pasa por aquí: misma semilla + mismas órdenes = mismo partido.
 * Eso permite repeticiones, depurar jugadas concretas y simular miles de partidos para equilibrar.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }

  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a: number, b: number) {
    return a + (b - a) * this.next();
  }

  int(a: number, b: number) {
    return Math.floor(this.range(a, b + 1));
  }

  chance(p: number) {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Normal aproximada (media 0, desviación 1). */
  gauss() {
    return (this.next() + this.next() + this.next() + this.next() - 2) * 1.732;
  }
}
