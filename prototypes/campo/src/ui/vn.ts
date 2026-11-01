import type { Expression } from '../content/look';
import type { Career } from '../game/career';
import { pixelPortrait } from '../render/pixel/portrait';
import type { TeamProfile } from '../sim/types';
import { NPC, type CharId, type VNChoice, type VNLine } from '../vn/scenes';

/**
 * Novela visual sobre el escenario: retrato pixel grande, placa con nombre, texto que se escribe
 * solo y decisiones que explican qué cambian. Devuelve el índice elegido.
 */
const PADEL = 6;
const GOLEADOR = 9;

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
      if (!this.root.hidden && (e.key === 'Enter' || e.key === ' ')) {
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

  private who(id: CharId, team: TeamProfile, career: Career): { name: string; role: string; img: HTMLCanvasElement | null } {
    if (id === 'narrador') return { name: '', role: '', img: null };
    const draw = (look: Parameters<typeof pixelPortrait>[0]) => {
      const base = pixelPortrait(look);
      const c = document.createElement('canvas');
      c.width = c.height = 192;
      const g = c.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      g.drawImage(base, 0, 0, 192, 192);
      return c;
    };
    if (id === 'padel' || id === 'goleador') {
      const p = team.players[id === 'padel' ? PADEL : GOLEADOR];
      return {
        name: p.nick ? `${p.name.split(' ')[0]} «${p.nick}»` : p.name,
        role: `${id === 'padel' ? 'Centrocampista' : career.gender === 'f' ? 'Delantera' : 'Delantero'} · #${p.num}`,
        img: draw({ look: p.look, kit: team.kit, traits: p.traits, num: p.num, seed: p.num * 13 }),
      };
    }
    const n = NPC[id];
    return { name: n.name, role: n.role, img: draw({ look: n.look, kit: n.clothes, traits: [], num: 0, seed: id.length * 31 }) };
  }

  private show(line: VNLine, team: TeamProfile, career: Career) {
    return new Promise<void>((resolve) => {
      const w = this.who(line.who, team, career);
      this.root.dataset.narrator = String(line.who === 'narrador');
      this.name.textContent = w.name;
      this.role.textContent = w.role;
      if (w.img) {
        // el gesto de esta frase manda sobre el de la personalidad
        if (line.expr && line.who !== 'narrador') {
          const base = this.exprPortrait(line.who, line.expr, team);
          if (base) this.portrait.replaceChildren(base);
          else this.portrait.replaceChildren(w.img);
        } else this.portrait.replaceChildren(w.img);
      } else this.portrait.replaceChildren();
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
      }, 22);
      this.advance = resolve;
    });
  }

  private exprPortrait(id: CharId, expr: Expression, team: TeamProfile) {
    const make = (spec: Parameters<typeof pixelPortrait>[0]) => {
      const base = pixelPortrait({ ...spec, expr });
      const c = document.createElement('canvas');
      c.width = c.height = 192;
      const g = c.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      g.drawImage(base, 0, 0, 192, 192);
      return c;
    };
    if (id === 'padel' || id === 'goleador') {
      const p = team.players[id === 'padel' ? PADEL : GOLEADOR];
      return make({ look: p.look, kit: team.kit, traits: p.traits, num: p.num, seed: p.num * 13 });
    }
    if (id === 'narrador') return null;
    const n = NPC[id];
    return make({ look: n.look, kit: n.clothes, traits: [], num: 0, seed: id.length * 31 });
  }

  /** Reproduce las líneas y, si hay, las decisiones. Devuelve la elegida (o -1). */
  async play(lines: VNLine[], team: TeamProfile, career: Career, choices: VNChoice[] = []): Promise<number> {
    this.root.hidden = false;
    for (const l of lines) await this.show(l, team, career);
    let picked = -1;
    if (choices.length) {
      this.next.hidden = true;
      picked = await new Promise<number>((resolve) => {
        this.choices.replaceChildren(
          ...choices.map((c, i) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.innerHTML = '<b></b><small></small>';
            b.querySelector('b')!.textContent = c.text;
            b.querySelector('small')!.textContent = c.effect;
            b.onclick = () => resolve(i);
            return b;
          }),
        );
        (this.choices.firstElementChild as HTMLButtonElement | null)?.focus();
      });
      this.choices.replaceChildren();
      const reply = choices[picked].pick(career);
      for (const l of reply) await this.show(l, team, career);
    }
    this.root.hidden = true;
    return picked;
  }

  get open() {
    return !this.root.hidden;
  }
}
