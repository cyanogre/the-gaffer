import { SQUAD_INDEX } from '../content/teams';
import type { Expression } from '../content/look';
import { STATS, type Career } from '../game/career';
import { pixelPortrait } from '../render/pixel/portrait';
import { crisp } from './dom';
import { NPC, choiceLocked, coachCharacter, type CharId, type VNChoice, type VNLine } from '../story/scenes';

/**
 * Novela visual sobre el escenario: retrato pixel grande, placa con nombre, texto que se escribe
 * solo y decisiones. No se anuncia qué pasará con cada una: se ve después. Las que piden una
 * estadística llevan su etiqueta delante (como en los juegos de rol) y, si no llegas, salen bloqueadas.
 */
export class VNPlayer {
  private root = document.createElement('div');
  private portrait = document.createElement('div');
  private name = document.createElement('b');
  private role = document.createElement('small');
  private text = document.createElement('p');
  private choices = document.createElement('div');
  private next = document.createElement('span');
  private advance: (() => void) | null = null;
  private typing: number | null = null;
  private full = '';

  constructor(host: HTMLElement) {
    this.root.className = 'vn';
    this.root.hidden = true;
    const box = document.createElement('div');
    box.className = 'vn-box';
    const plate = document.createElement('div');
    plate.className = 'vn-plate';
    plate.append(this.name, this.role);
    this.next.className = 'vn-next';
    this.next.textContent = '▼';
    this.choices.className = 'vn-choices';
    box.append(plate, this.text, this.next, this.choices);
    this.portrait.className = 'vn-portrait';
    this.root.append(this.portrait, box);
    host.append(this.root);
    this.root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.vn-choices')) return;
      this.skip();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.root.hidden && (e.key === 'Enter' || e.key === ' ') && !this.choices.childElementCount) {
        e.preventDefault();
        this.skip();
      }
    });
  }

  private skip() {
    if (this.typing !== null) {
      clearInterval(this.typing);
      this.typing = null;
      this.text.textContent = this.full;
      this.next.hidden = false;
      return;
    }
    const a = this.advance;
    this.advance = null;
    a?.();
  }

  private who(id: CharId, c: Career, expr?: Expression, idx?: number): { name: string; nick?: string; role: string; img: HTMLCanvasElement | null } {
    if (id === 'narrador' || (id === 'jugador' && idx === undefined)) return { name: '', role: '', img: null };
    const draw = (spec: Parameters<typeof pixelPortrait>[0]) => {
      const out = pixelPortrait({ ...spec, expr });
      // múltiplo entero del retrato de 48 px, cerca del tamaño que cabe en pantalla
      crisp(out, window.innerWidth <= 700 ? 96 : Math.max(110, Math.min(220, window.innerWidth * 0.22)));
      return out;
    };
    if (id === 'jugador' && idx !== undefined) {
      const p = c.squad[idx];
      const pos = { POR: c.gender === 'f' ? 'Portera' : 'Portero', DEF: 'Defensa', MED: 'Centrocampista', DEL: c.gender === 'f' ? 'Delantera' : 'Delantero' }[p.role];
      return { name: p.nick ? p.name.split(' ')[0] : p.name, nick: p.nick, role: `${pos} · #${p.num} · ${p.age ?? ''} años`, img: draw({ look: p.look, kit: c.club.kit, traits: p.traits, num: p.num, seed: p.num * 13 }) };
    }
    if (id === 'padel' || id === 'goleador') {
      const p = c.squad[SQUAD_INDEX[id]];
      const role = id === 'padel' ? 'Centrocampista' : c.gender === 'f' ? 'Delantera' : 'Delantero';
      return { name: p.nick ? p.name.split(' ')[0] : p.name, nick: p.nick, role: `${role} · #${p.num}`, img: draw({ look: p.look, kit: c.club.kit, traits: p.traits, num: p.num, seed: p.num * 13 }) };
    }
    const n = id === 'mister' ? coachCharacter(c.coach.gender, c.coach.name) : NPC[id as keyof typeof NPC];
    return { name: n.name, role: n.role, img: draw({ look: n.look, kit: n.clothes, traits: [], num: 0, seed: id.length * 31 }) };
  }

  private show(line: VNLine, c: Career) {
    return new Promise<void>((resolve) => {
      const w = this.who(line.who, c, line.expr, line.idx);
      this.root.dataset.narrator = String(line.who === 'narrador');
      this.name.textContent = w.name;
      // el apodo (si se lo ha ganado), aparte y en color
      if (w.nick) {
        const a = document.createElement('span');
        a.className = 'apodo';
        a.textContent = ` «${w.nick}»`;
        this.name.append(a);
      }
      this.role.textContent = w.role;
      if (w.img) this.portrait.replaceChildren(w.img);
      else this.portrait.replaceChildren();
      this.full = line.text;
      this.text.textContent = '';
      this.next.hidden = true;
      this.choices.replaceChildren();
      let i = 0;
      this.typing = window.setInterval(() => {
        i += 2;
        this.text.textContent = this.full.slice(0, i);
        if (i >= this.full.length) {
          clearInterval(this.typing!);
          this.typing = null;
          this.next.hidden = false;
        }
      }, 20);
      this.advance = resolve;
    });
  }

  /** Reproduce las líneas y, si hay, las decisiones. Devuelve la elegida (o -1). */
  async play(lines: VNLine[], c: Career, choices: VNChoice[] = []): Promise<number> {
    this.root.hidden = false;
    for (const l of lines) await this.show(l, c);
    let picked = -1;
    if (choices.length) {
      this.next.hidden = true;
      picked = await new Promise<number>((resolve) => {
        this.choices.replaceChildren(
          ...choices.map((ch, i) => {
            const b = document.createElement('button');
            b.type = 'button';
            const lock = choiceLocked(c, ch);
            if (ch.req) {
              const tag = document.createElement('i');
              tag.className = 'vn-req';
              tag.textContent = `${STATS[ch.req.stat].label} ${ch.req.lv}`;
              b.append(tag);
              if (lock) b.title = `Te falta ${STATS[lock.stat].label.toLowerCase()}: nivel ${lock.lv} (tienes ${c.coach.stats[lock.stat].lv})`;
            }
            b.append(ch.text);
            b.disabled = !!lock;
            b.onclick = () => resolve(i);
            return b;
          }),
        );
        (this.choices.querySelector('button:not(:disabled)') as HTMLButtonElement | null)?.focus();
      });
      this.choices.replaceChildren();
      const reply = choices[picked].pick(c);
      for (const l of reply) await this.show(l, c);
    }
    this.root.hidden = true;
    return picked;
  }

  get open() {
    return !this.root.hidden;
  }
}
