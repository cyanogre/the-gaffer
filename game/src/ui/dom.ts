import type { Expression, Kit, Look } from '../content/look';
import { pixelPortrait } from '../render/pixel/portrait';
import { crispCss } from '../render/pixelgrid';
import type { TraitId } from '../sim/types';

/** Utilidades de interfaz: crear nodos, avisos, retratos, la hoja lateral y la tarjeta de resultado. */
export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

type Kid = Node | string | null | undefined | false;
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k.startsWith('on') && typeof v === 'function') (el as unknown as Record<string, unknown>)[k] = v;
    else if (k === 'style') el.setAttribute('style', String(v));
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/**
 * Nombre de un jugador con su apodo (si se lo ha ganado en el campo) aparte y en color, para que se
 * vea que es un apodo y no su nombre: «Lucía «Santa Lucía»».
 */
export function nameEl(p: { name: string; nick?: string }, mode: 'first' | 'full' | 'last' = 'full', prefix = '') {
  const parts = p.name.split(' ');
  const base = mode === 'first' ? parts[0] : mode === 'last' ? parts[parts.length - 1] : p.name;
  const el = h('span', { class: 'pname' }, prefix + base);
  if (p.nick) el.append(' ', h('span', { class: 'apodo', title: 'Apodo que se ha ganado en el campo', text: `«${p.nick}»` }));
  return el;
}

let toastTimer = 0;
export function toast(text: string, ms = 2600) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.hidden = true), ms);
}

const portraitCache = new Map<string, HTMLCanvasElement>();
/**
 * Retrato pixel (48×48). Se muestra a un múltiplo ENTERO de píxeles del dispositivo lo más cerca
 * posible de `size` (en CSS): ningún píxel sale más gordo que otro.
 */
export function portrait(look: Look, kit: Kit, traits: readonly TraitId[], num: number, size = 48, expr?: Expression) {
  const key = JSON.stringify([look, kit, traits, num, expr]);
  let base = portraitCache.get(key);
  if (!base) {
    base = pixelPortrait({ look, kit, traits: [...traits], num, seed: num * 13 + 1, expr });
    portraitCache.set(key, base);
  }
  const c = document.createElement('canvas');
  c.width = base.width;
  c.height = base.height;
  c.getContext('2d')!.drawImage(base, 0, 0);
  crisp(c, size);
  return c;
}

/** Tamaño CSS exacto para un lienzo pixel (múltiplo entero en el dispositivo). */
export function crisp(c: HTMLCanvasElement, size: number) {
  const css = crispCss(c.width, size);
  c.style.width = `${css}px`;
  c.style.height = `${(css * c.height) / c.width}px`;
  c.style.imageRendering = 'pixelated';
}

export const tier = (v: number) => (v >= 15 ? 'hi' : v >= 9 ? 'mid' : 'lo');

export interface Tab {
  id: string;
  label: string;
  render: () => Kid[];
}

/** Hoja única: sube desde abajo en móvil y se queda a la derecha en pantallas anchas. */
export class Sheet {
  private el = $('sheet');
  private title = $('sheetTitle');
  private tabsEl = $('sheetTabs');
  private body = $('sheetBody');
  private tabs: Tab[] = [];
  private active = '';
  private renderOne: (() => Kid[]) | null = null;
  kind = '';
  onClose: (() => void) | null = null;
  /** Avisos para la guía: pestaña elegida y hoja cerrada. */
  onTab: ((id: string) => void) | null = null;
  onAnyClose: (() => void) | null = null;

  constructor() {
    $('sheetClose').onclick = () => this.close();
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
  }

  get isOpen() {
    return !this.el.hidden;
  }

  open(kind: string, title: string, content: Tab[] | (() => Kid[]), tab?: string) {
    this.kind = kind;
    this.title.textContent = title;
    if (Array.isArray(content)) {
      this.tabs = content;
      this.renderOne = null;
      this.active = tab ?? (this.active && content.some((t) => t.id === this.active) ? this.active : content[0].id);
    } else {
      this.tabs = [];
      this.renderOne = content;
    }
    this.el.hidden = false;
    this.refresh();
  }

  select(tab: string) {
    this.active = tab;
    this.refresh();
    this.onTab?.(tab);
  }

  refresh() {
    if (this.el.hidden) return;
    const scroll = this.body.scrollTop;
    this.tabsEl.replaceChildren(
      ...this.tabs.map((t) =>
        h('button', { type: 'button', role: 'tab', 'aria-selected': String(t.id === this.active), text: t.label, onclick: () => this.select(t.id) }),
      ),
    );
    const kids = this.renderOne ? this.renderOne() : (this.tabs.find((t) => t.id === this.active)?.render() ?? []);
    this.body.replaceChildren(...(kids.filter(Boolean) as (Node | string)[]));
    this.body.scrollTop = scroll;
  }

  close() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    this.kind = '';
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
    this.onAnyClose?.();
  }
}

export interface CardChoice {
  label: string;
  small?: string;
  disabled?: boolean;
}

/** Tarjeta central (resultado de una acción, periódico, elección). Resuelve con la opción elegida (o -1). */
export function card(title: string, lines: (string | Node)[], opts: { tone?: string; choices?: CardChoice[]; ok?: string; className?: string } = {}): Promise<number> {
  const el = $('result');
  return new Promise((resolve) => {
    el.dataset.tone = opts.tone ?? 'info';
    el.className = `result ${opts.className ?? ''}`;
    const done = (i: number) => {
      el.hidden = true;
      window.removeEventListener('keydown', onKey);
      resolve(i);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!opts.choices && (e.key === 'Enter' || e.key === 'Escape')) {
        e.preventDefault();
        done(-1);
      }
    };
    const kids: Node[] = [h('h3', { text: title })];
    kids.push(h('ul', {}, ...lines.map((l) => h('li', {}, l))));
    if (opts.choices) {
      kids.push(
        h(
          'div',
          { class: 'choices' },
          ...opts.choices.map((c, i) => h('button', { type: 'button', disabled: c.disabled, onclick: () => done(i) }, h('b', { text: c.label }), c.small ? h('small', { text: c.small }) : null)),
          h('button', { type: 'button', onclick: () => done(-1) }, h('b', { text: 'Ahora no' })),
        ),
      );
    } else kids.push(h('button', { type: 'button', text: opts.ok ?? 'Vale', onclick: () => done(-1) }));
    el.replaceChildren(...kids);
    el.hidden = false;
    window.addEventListener('keydown', onKey);
    (el.querySelector('button:not(:disabled)') as HTMLButtonElement | null)?.focus();
  });
}
