import { h } from './dom';

/**
 * Minijuego del turno en la ferretería: copiar llaves en la máquina de Don Ramón.
 *
 * Arriba, la llave del cliente con sus dientes; abajo, la llave en bruto. La fresa la recorre de
 * izquierda a derecha y hay que cortar (tocar la pantalla, clic o espacio) justo cuando pasa por
 * cada diente. Tres llaves por turno, cada una algo más deprisa. Cada llave sale perfecta, buena o
 * estropeada (y el bombín estropeado se paga).
 */
export interface KeysResult {
  perfect: number;
  good: number;
  ruined: number;
}

const W = 160;
const HGT = 76;
const BLADE0 = 42;
const BLADE1 = 140;
const TEETH = 5;
const SPEEDS = [34, 44, 56];
const C = {
  bg: '#1d2433',
  bench: '#2c3546',
  silver: '#cfd6de',
  silverD: '#8f9aa6',
  brass: '#e2b450',
  brassD: '#a8792a',
  brassL: '#f6dc8c',
  ink: '#1a1226',
  wheel: '#9aa3ad',
  wheelD: '#5a6370',
  spark: '#ffe27a',
  mark: '#ff5a7a',
};

interface Tooth {
  x: number;
  depth: number;
  cut: 'perfect' | 'good' | null;
}

export function playKeys(host: HTMLElement): Promise<KeysResult> {
  return new Promise((resolve) => {
    const cv = h('canvas', { width: W, height: HGT, class: 'mg-canvas' }) as HTMLCanvasElement;
    const g = cv.getContext('2d')!;
    const title = h('h3', { text: 'Copia de llaves · 1/3' });
    const say = h('p', { class: 'mg-say', text: 'Toca justo cuando la fresa pase por cada diente.' });
    const btn = h('button', { type: 'button', class: 'btn gold mg-cut', text: 'Cortar' }) as HTMLButtonElement;
    const root = h('div', { class: 'minigame' }, h('div', { class: 'mg-box' }, title, cv, say, btn));
    host.append(root);

    const res: KeysResult = { perfect: 0, good: 0, ruined: 0 };
    let key = 0;
    let teeth: Tooth[] = [];
    let stray: number[] = [];
    let x = 0;
    let state: 'run' | 'pause' | 'done' = 'pause';
    let sparkT = 0;
    let last = performance.now();

    const newKey = () => {
      teeth = [];
      const gap = (BLADE1 - BLADE0 - 8) / (TEETH - 1);
      for (let i = 0; i < TEETH; i++) teeth.push({ x: Math.round(BLADE0 + 4 + i * gap + (Math.random() - 0.5) * gap * 0.5), depth: 2 + Math.floor(Math.random() * 3), cut: null });
      stray = [];
      x = BLADE0 - 16;
      title.textContent = `Copia de llaves · ${key + 1}/3`;
      state = 'run';
    };

    const cut = () => {
      if (state === 'done') return finish();
      if (state !== 'run') return;
      sparkT = 0.12;
      const t = teeth.filter((q) => !q.cut).sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
      const d = t ? Math.abs(t.x - x) : 99;
      if (t && d <= 1.6) {
        t.cut = 'perfect';
        say.textContent = '¡Clavado!';
      } else if (t && d <= 4) {
        t.cut = 'good';
        say.textContent = 'Vale.';
      } else {
        stray.push(Math.round(x));
        say.textContent = '¡Ay! Muesca donde no era.';
      }
    };

    const endKey = () => {
      let pts = 0;
      for (const t of teeth) pts += t.cut === 'perfect' ? 2 : t.cut === 'good' ? 1 : -2;
      pts -= stray.length;
      const kind = pts >= 9 ? 'perfect' : pts >= 5 ? 'good' : 'ruined';
      res[kind]++;
      say.textContent = kind === 'perfect' ? '¡Llave perfecta! El cliente ni lo nota.' : kind === 'good' ? 'Abre. Con un poco de maña, pero abre.' : 'Esa no abre ni el buzón. Bombín a la basura.';
      state = 'pause';
      key++;
      window.setTimeout(() => {
        if (key < 3) newKey();
        else {
          state = 'done';
          title.textContent = 'Turno terminado';
          say.textContent = `${res.perfect} perfecta${res.perfect === 1 ? '' : 's'}, ${res.good} buena${res.good === 1 ? '' : 's'} y ${res.ruined} estropeada${res.ruined === 1 ? '' : 's'}.`;
          btn.textContent = 'Cobrar';
        }
      }, 1100);
    };

    const finish = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      root.remove();
      resolve(res);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        cut();
      }
    };
    window.addEventListener('keydown', onKey);
    btn.onclick = (e) => {
      e.stopPropagation();
      cut();
    };
    cv.onpointerdown = (e) => {
      e.preventDefault();
      cut();
    };

    // ── dibujo (pixel a pixel, a la rejilla del lienzo; el CSS lo amplía sin suavizar)
    const rect = (x0: number, y0: number, w: number, hh: number, col: string) => {
      g.fillStyle = col;
      g.fillRect(Math.round(x0), Math.round(y0), w, hh);
    };
    const drawKey = (y: number, body: string, dark: string, light: string, notches: { x: number; depth: number }[]) => {
      // cabeza con su agujero
      rect(10, y - 6, 22, 20, dark);
      rect(11, y - 5, 20, 18, body);
      rect(12, y - 5, 18, 2, light);
      rect(16, y + 1, 6, 6, C.bench);
      // pala: los dientes salen del borde de abajo
      rect(32, y, BLADE1 - 32 + 6, 9, body);
      rect(32, y, BLADE1 - 32 + 6, 1, light);
      rect(32, y + 8, BLADE1 - 32 + 6, 1, dark);
      rect(BLADE1 + 4, y + 1, 3, 7, body);
      for (const n of notches) {
        rect(n.x - 1, y + 9 - n.depth, 3, n.depth, C.bench);
        rect(n.x - 2, y + 9 - n.depth, 1, n.depth, dark);
      }
    };
    const draw = () => {
      rect(0, 0, W, HGT, C.bg);
      rect(0, HGT - 14, W, 14, C.bench);
      // la del cliente (con sus dientes) y la que estás copiando
      drawKey(10, C.silver, C.silverD, '#ffffff', teeth.map((t) => ({ x: t.x, depth: t.depth })));
      const made = [...teeth.filter((t) => t.cut).map((t) => ({ x: t.x, depth: t.depth })), ...stray.map((s) => ({ x: s, depth: 3 }))];
      drawKey(44, C.brass, C.brassD, C.brassL, made);
      // guías: dónde caen los dientes (en la llave en bruto, una marca)
      for (const t of teeth) if (!t.cut) rect(t.x, 54, 1, 2, C.mark);
      // la fresa
      if (state === 'run' || sparkT > 0) {
        const fx = Math.round(x);
        rect(fx - 4, 32, 9, 9, C.wheelD);
        rect(fx - 3, 33, 7, 7, C.wheel);
        rect(fx, 33, 1, 7, C.wheelD);
        rect(fx - 3, 36, 7, 1, C.wheelD);
        rect(fx, 41, 1, 3, C.ink);
        if (sparkT > 0)
          for (let i = 0; i < 6; i++) rect(fx + Math.round((Math.random() - 0.3) * 10), 44 + Math.round(Math.random() * 6), 1, 1, C.spark);
      }
    };

    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      sparkT = Math.max(0, sparkT - dt);
      if (state === 'run') {
        x += SPEEDS[key] * dt;
        if (x > BLADE1 + 8) endKey();
      }
      draw();
      raf = requestAnimationFrame(tick);
    };
    newKey();
    raf = requestAnimationFrame(tick);
  });
}
