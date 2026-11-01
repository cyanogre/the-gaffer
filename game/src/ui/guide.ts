import type { Career, LocationId } from '../game/career';
import { h } from './dom';

/**
 * Guía de la primera semana: lleva al jugador «sobre raíles». Un halo marca el único botón que
 * se puede pulsar, el resto de la pantalla queda bloqueado y una nota explica por qué. Cada paso
 * avanza cuando pasa lo que pide (ir a un sitio, hacer una acción, abrir una hoja...).
 * Siempre se puede saltar.
 */
export type GuideEvent = { kind: 'location'; id: LocationId } | { kind: 'action'; id: string } | { kind: 'scene'; id: string } | { kind: 'sheet'; id: string } | { kind: 'tab'; id: string } | { kind: 'close' };

type Target = { dom: string } | { hotspot: string; orDock?: LocationId } | null;
interface Step {
  text: string;
  target: Target;
  /** 'tap': se avanza con «Siguiente». Si no, con el evento que coincida. */
  until: 'tap' | ((e: GuideEvent) => boolean);
}

const dock = (id: string) => `#dock button[data-loc=${id}]`;
const is = (kind: GuideEvent['kind'], id?: string) => (e: GuideEvent) => e.kind === kind && (id === undefined || ('id' in e && e.id === id));

export const STEPS: Step[] = [
  { text: 'Tu primera semana como míster. Te enseño cómo funciona en un momento (puedes saltarlo cuando quieras).', target: null, until: 'tap' },
  { text: 'El reloj. Cada día tiene tres franjas: mañana, tarde y noche. Todo lo que haces gasta una. El domingo, partido.', target: { dom: '.hud-clock' }, until: 'tap' },
  { text: 'Tu energía. Hacer cosas cansa; dormir la recupera. Sin energía, solo puedes descansar.', target: { dom: '.hud-meter' }, until: 'tap' },
  { text: 'Tu cartera. El club no te paga: cada lunes pagas 50 € de alquiler. Abajo, en la ferretería, hay turnos.', target: { dom: '#hudWallet' }, until: 'tap' },
  { text: 'Lo primero es conocer a tus chavales. Te esperan en El Barrizal: pulsa «Campo».', target: { dom: dock('campo') }, until: is('scene', 'presentacion') },
  { text: 'Ahora tú: sal a correr. Cada etiqueta dice lo que cuesta (⚡ energía) y qué estadística del míster mejora.', target: { hotspot: 'track', orDock: 'campo' }, until: is('action', 'correr') },
  { text: 'El papeleo no gasta tiempo. Pulsa «Club».', target: { dom: dock('club') }, until: is('sheet', 'club') },
  { text: 'Tu once. Toca un puesto del campo y luego a quien quieras poner. En la lista ves su edad, su nota y si va cargado.', target: { dom: '.pitchmap' }, until: 'tap' },
  { text: 'En «Pizarra» eliges formación, bloque y estilo. El porcentaje es lo que la conocen: si es bajo, se desordenan.', target: { dom: '#sheetTabs button:nth-child(2)' }, until: is('tab', 'pizarra') },
  { text: 'Cierra la hoja cuando quieras: siempre está en «Club».', target: { dom: '#sheetClose' }, until: is('close') },
  { text: 'Ya es por la tarde. Vamos al Bar Manolo: ahí se gana labia y, con suerte, aficionados.', target: { dom: dock('bar') }, until: is('location', 'bar') },
  { text: 'Charla en la barra (4 € de tu cartera). La labia te servirá en las conversaciones y en la arenga del domingo.', target: { hotspot: 'barra', orDock: 'bar' }, until: is('action', 'parroquia') },
  { text: 'Es de noche. A casa.', target: { dom: dock('casa') }, until: is('location', 'casa') },
  { text: 'Duerme: el día termina y recuperas toda la energía. Si pasas la noche fuera, solo recuperas una parte.', target: { hotspot: 'bed', orDock: 'casa' }, until: is('action', 'dormir') },
  { text: 'Martes por la mañana. Echa un turno en la ferretería: dinero para ti y Don Ramón te verá trabajar.', target: { hotspot: 'mostrador', orDock: 'ferreteria' }, until: is('action', 'turno') },
  { text: 'Martes por la tarde: ¡entrenamiento! Elige en qué trabajáis. Los críos aprenden rápido y tu Táctica lo multiplica.', target: { hotspot: 'pitch', orDock: 'campo' }, until: is('action', 'entrenar') },
  {
    text: 'Ya sabes lo básico. Se entrena martes y jueves, el sábado puedes ojear al rival y el domingo se juega. El resto de la semana es tuya. ¡Suerte, míster!',
    target: null,
    until: 'tap',
  },
];

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Guide {
  private root = h('div', { class: 'guide', hidden: true });
  private blocks = [0, 1, 2, 3].map(() => h('div', { class: 'g-block' }));
  private halo = h('div', { class: 'g-halo' });
  private tip = h('div', { class: 'g-tip' });
  private text = h('p');
  private nextBtn = h('button', { type: 'button', class: 'btn gold', text: 'Siguiente' });
  private skipBtn = h('button', { type: 'button', class: 'g-skip', id: 'guideSkip', text: 'Saltar guía' });
  /** Pista suelta (fuera de la guía): domingo, primer partido. */
  private hint: { text: string; sel: string } | null = null;
  onChange: (() => void) | null = null;
  /** Al cerrar una pista suelta (por ejemplo, para reanudar el partido). */
  onHintDone: (() => void) | null = null;

  constructor(
    host: HTMLElement,
    private career: () => Career | null,
    private hotspot: (id: string) => HTMLElement | undefined,
  ) {
    this.tip.append(this.text, h('div', { class: 'row' }, this.skipBtn, h('span', { class: 'grow' }), this.nextBtn));
    this.root.append(...this.blocks, this.halo, this.tip);
    host.append(this.root);
    this.nextBtn.onclick = () => {
      if (this.hint) {
        this.hint = null;
        this.onHintDone?.();
        this.onChange?.();
        return;
      }
      this.advance();
    };
    this.skipBtn.onclick = () => {
      const c = this.career();
      if (c) c.guide = -1;
      this.hint = null;
      this.onChange?.();
    };
  }

  private get step(): Step | null {
    const c = this.career();
    if (!c || c.guide < 0 || c.guide >= STEPS.length || c.status !== 'playing') return null;
    return STEPS[c.guide];
  }

  get active() {
    return !!this.step || !!this.hint;
  }

  private advance() {
    const c = this.career();
    if (!c) return;
    c.guide++;
    if (c.guide >= STEPS.length) c.guide = -1;
    this.onChange?.();
  }

  /** Algo ha pasado en el juego: si es lo que pedía el paso, se avanza. */
  notify(e: GuideEvent) {
    const s = this.step;
    if (s && s.until !== 'tap' && s.until(e)) this.advance();
  }

  /** Pista de una vez fuera de la guía (con halo sobre un botón). */
  showHint(text: string, sel: string) {
    this.hint = { text, sel };
  }

  private targetRect(): Rect | null {
    const sel = this.hint ? { dom: this.hint.sel } : this.step?.target;
    if (!sel) return null;
    let el: Element | null | undefined = null;
    if ('dom' in sel) el = document.querySelector(sel.dom);
    else {
      const c = this.career();
      if (sel.orDock && c && c.location !== sel.orDock) el = document.querySelector(dock(sel.orDock));
      else el = this.hotspot(sel.hotspot);
    }
    if (!el || (el as HTMLElement).hidden) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { x: r.left - 6, y: r.top - 6, w: r.width + 12, h: r.height + 12 };
  }

  /** Cada fotograma: coloca halo, bloqueos y nota. `paused` cuando hay escena o tarjeta encima. */
  frame(paused: boolean) {
    const s = this.step;
    const show = (!!s || !!this.hint) && !paused;
    this.root.hidden = !show;
    if (!show) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const r = this.targetRect();
    const tap = this.hint ? true : s!.until === 'tap';
    this.text.textContent = this.hint ? this.hint.text : s!.text;
    this.nextBtn.hidden = !tap;
    this.nextBtn.textContent = this.hint ? 'Entendido' : this.career()?.guide === STEPS.length - 1 ? '¡A jugar!' : 'Siguiente';
    this.skipBtn.hidden = !!this.hint;
    // bloqueo: cuatro rectángulos alrededor del hueco (en pasos de «Siguiente» se bloquea todo)
    const hole = r && !tap ? r : { x: W / 2, y: H / 2, w: 0, h: 0 };
    const [top, bottom, left, right] = this.blocks;
    Object.assign(top.style, { left: '0px', top: '0px', width: `${W}px`, height: `${Math.max(0, hole.y)}px` });
    Object.assign(bottom.style, { left: '0px', top: `${hole.y + hole.h}px`, width: `${W}px`, height: `${Math.max(0, H - hole.y - hole.h)}px` });
    Object.assign(left.style, { left: '0px', top: `${hole.y}px`, width: `${Math.max(0, hole.x)}px`, height: `${hole.h}px` });
    Object.assign(right.style, { left: `${hole.x + hole.w}px`, top: `${hole.y}px`, width: `${Math.max(0, W - hole.x - hole.w)}px`, height: `${hole.h}px` });
    this.halo.hidden = !r;
    if (r) Object.assign(this.halo.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    // la nota, al otro lado del objetivo
    const tw = Math.min(360, W - 24);
    const th = this.tip.offsetHeight || 120;
    let ty = H * 0.38;
    if (r) ty = r.y + r.h / 2 > H / 2 ? r.y - th - 14 : r.y + r.h + 14;
    ty = Math.max(70, Math.min(H - th - 12, ty));
    const tx = Math.max(12, Math.min(W - tw - 12, (r ? r.x + r.w / 2 : W / 2) - tw / 2));
    Object.assign(this.tip.style, { left: `${tx}px`, top: `${ty}px`, width: `${tw}px` });
  }
}
