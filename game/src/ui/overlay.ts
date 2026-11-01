import { shortName } from '../content/names';
import type { MatchSim } from '../sim/match';
import type { MatchRenderer } from '../render/types';

interface Bubble {
  idx: number;
  el: HTMLDivElement;
  showAt: number;
  until: number;
}

/**
 * Capa HTML encima del lienzo: bocadillos, etiqueta del poseedor y selección por clic.
 * Es común a los tres estilos; cada renderizador solo aporta su proyección mundo → pantalla.
 */
export class Overlay {
  private bubbles: Bubble[] = [];
  private carrierTag = document.createElement('div');
  private selTag = document.createElement('div');
  private time = 0;

  constructor(private el: HTMLElement) {
    this.carrierTag.className = 'tag';
    this.selTag.className = 'tag tag-sel';
    el.append(this.carrierTag, this.selTag);
  }

  setStyle(id: string) {
    this.el.dataset.style = id;
  }

  clear() {
    for (const b of this.bubbles) b.el.remove();
    this.bubbles = [];
  }

  say(idx: number, text: string, delay = 0) {
    const old = this.bubbles.find((b) => b.idx === idx);
    if (old) {
      old.el.remove();
      this.bubbles = this.bubbles.filter((b) => b !== old);
    }
    if (this.bubbles.length >= 4) {
      this.bubbles[0].el.remove();
      this.bubbles.shift();
    }
    const el = document.createElement('div');
    el.className = 'bubble';
    el.textContent = text;
    el.hidden = true;
    this.el.appendChild(el);
    this.bubbles.push({ idx, el, showAt: this.time + delay, until: this.time + delay + 2.8 });
  }

  update(sim: MatchSim, r: MatchRenderer, alpha: number, dt: number, selected: number) {
    this.time += dt;
    const pos = (i: number) => {
      const p = sim.players[i];
      return { x: p.px + (p.x - p.px) * alpha, y: p.py + (p.y - p.py) * alpha, h: r.headHeight * p.profile.look.height };
    };
    for (const b of [...this.bubbles]) {
      if (this.time > b.until) {
        b.el.remove();
        this.bubbles = this.bubbles.filter((x) => x !== b);
        continue;
      }
      if (this.time < b.showAt) continue;
      const q = pos(b.idx);
      const s = r.project(q.x, q.y, q.h);
      b.el.hidden = !s.visible;
      b.el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
    }
    const tag = (el: HTMLDivElement, i: number, show: boolean) => {
      if (!show || i < 0) {
        el.hidden = true;
        return;
      }
      const p = sim.players[i];
      const q = pos(i);
      const s = r.project(q.x, q.y, 0);
      el.hidden = !s.visible;
      el.textContent = `${p.profile.num} · ${shortName(p.profile)}`;
      el.dataset.team = String(p.team);
      el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
    };
    const owner = sim.ball.owner;
    tag(this.carrierTag, owner, owner >= 0 && owner !== selected && sim.phase === 'play');
    tag(this.selTag, selected, selected >= 0);
  }

  /** Jugador más cercano al punto pulsado (entre pies y cabeza), o -1. */
  pick(x: number, y: number, sim: MatchSim, r: MatchRenderer) {
    let best = -1;
    let bd = 46;
    for (const p of sim.players) {
      if (p.sentOff) continue;
      const feet = r.project(p.x, p.y, 0);
      const head = r.project(p.x, p.y, r.headHeight * 0.6);
      const d = Math.min(Math.hypot(feet.x - x, feet.y - y), Math.hypot(head.x - x, head.y - y));
      if (d < bd) {
        bd = d;
        best = p.idx;
      }
    }
    return best;
  }
}
