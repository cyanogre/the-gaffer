import * as THREE from 'three';
import type { Career } from '../../game/career';
import { NPC } from '../../story/scenes';
import { pixelText } from '../pixel/text';
import { InteriorLights } from './bar';
import { Location, canvas, pixTex, v3, type Walker } from './location';

/**
 * Ferretería Ramón: estanterías hasta el techo, panel de herramientas, máquina de llaves y el
 * despacho del presidente. Aquí se echan turnos (dinero para el míster) y se habla con la directiva.
 */
export class FerreteriaView extends Location {
  private lights: InteriorLights;
  private ramon: Walker | null = null;

  constructor() {
    super();
    this.fit = { w: 9.6, h: 6.2 };
    this.coachHome = v3(0.2, 0, 1.6);
    this.camera.position.set(9, 8, 9);
    this.camera.lookAt(-0.2, 1.2, -0.3);
    this.lights = new InteriorLights(this.scene, v3(0.6, 2.7, -0.4), '#eef4ff');
    this.build();
  }

  private build() {
    const b = this.b;
    // terrazo gris
    const [fc, fg] = canvas(32, 32);
    fg.fillStyle = '#a9a7a2';
    fg.fillRect(0, 0, 32, 32);
    for (let i = 0; i < 90; i++) {
      fg.fillStyle = ['#8e8c87', '#c4c1bb', '#7a7873'][i % 3];
      fg.fillRect((i * 13) % 32, (i * 7 + (i >> 3)) % 32, 1, 1);
    }
    fg.fillStyle = '#8a8883';
    fg.fillRect(0, 0, 32, 1);
    fg.fillRect(0, 0, 1, 32);
    b.floor(8, 6, pixTex(fc, [8, 6]));
    const [wc, wg] = canvas(32, 32);
    wg.fillStyle = '#a9c4a0';
    wg.fillRect(0, 0, 32, 32);
    wg.fillStyle = '#98b48f';
    for (let y = 0; y < 32; y += 4) wg.fillRect(0, y, 32, 1);
    b.walls(8, 6, 3, new THREE.MeshLambertMaterial({ map: pixTex(wc, [4, 2]) }), '#5a6a52');
    // estanterías del fondo llenas de cajas
    const [bc, bg] = canvas(64, 16);
    bg.fillStyle = '#4a3a2a';
    bg.fillRect(0, 0, 64, 16);
    const boxes = ['#e8b04a', '#c24d16', '#2f6fd6', '#f4f4f0', '#5d6a3a', '#d8b07a', '#7a2a2a'];
    for (let x = 1, i = 0; x < 62; i++) {
      const w = 3 + (i * 5) % 4;
      bg.fillStyle = boxes[i % boxes.length];
      bg.fillRect(x, 3 + (i % 3), w, 13 - (i % 3));
      bg.fillStyle = '#ffffff';
      bg.fillRect(x + 1, 8, Math.max(1, w - 2), 2);
      x += w + 1;
    }
    const shelfTex = pixTex(bc);
    for (let k = 0; k < 3; k++) {
      b.box(5.2, 0.06, 0.45, '#6b4a30', -1.2, 0.6 + k * 0.75, -2.7);
      b.plane(5.1, 0.6, shelfTex, -1.2, 0.95 + k * 0.75, -2.6);
    }
    b.box(0.08, 2.4, 0.45, '#6b4a30', -3.8, 0, -2.7);
    b.box(0.08, 2.4, 0.45, '#6b4a30', 1.4, 0, -2.7);
    // panel de herramientas en la pared izquierda
    const [tc, tg] = canvas(48, 32);
    tg.fillStyle = '#c9a77a';
    tg.fillRect(0, 0, 48, 32);
    tg.fillStyle = '#b08d62';
    for (let y = 2; y < 32; y += 4) for (let x = 2; x < 48; x += 4) tg.fillRect(x, y, 1, 1);
    const tool = (x: number, y: number, h: number, head: string) => {
      tg.fillStyle = '#6b4a30';
      tg.fillRect(x, y, 1, h);
      tg.fillStyle = head;
      tg.fillRect(x - 2, y, 5, 2);
    };
    tool(5, 4, 10, '#5a5f66');
    tool(13, 6, 9, '#c8102e');
    tool(21, 4, 12, '#5a5f66');
    tg.fillStyle = '#9aa3ad';
    tg.fillRect(28, 6, 12, 4);
    tg.fillStyle = '#6b4a30';
    tg.fillRect(38, 6, 4, 4);
    tool(8, 18, 9, '#2f6fd6');
    tool(18, 19, 8, '#f2c94c');
    tg.fillStyle = '#5a5f66';
    tg.fillRect(28, 18, 2, 10);
    tg.fillRect(34, 18, 2, 10);
    tg.fillRect(28, 18, 8, 2);
    b.plane(2.4, 1.6, pixTex(tc), -3.9, 1.7, 0.2, Math.PI / 2);
    // letrero
    const [sc, sg] = canvas(96, 16);
    sg.fillStyle = '#1d3a6a';
    sg.fillRect(0, 0, 96, 16);
    sg.fillStyle = '#f2c94c';
    sg.fillRect(0, 0, 96, 1);
    sg.fillRect(0, 15, 96, 1);
    pixelText(sg, 'FERRETERIA RAMON 1971', 48, 4, '#f2c94c', 94);
    b.plane(3.6, 0.6, pixTex(sc), -1.2, 2.72, -2.9);
    // mostrador con caja registradora, máquina de llaves y catálogo
    b.box(3.0, 1.0, 0.7, '#7a5236', 1.2, 0, -0.6);
    b.box(3.1, 0.06, 0.8, '#d8cbb0', 1.2, 1.0, -0.6);
    b.box(0.5, 0.3, 0.4, '#3a3a40', 2.2, 1.06, -0.65);
    b.box(0.4, 0.12, 0.08, '#7aff9a', 2.2, 1.36, -0.75);
    b.box(0.45, 0.25, 0.3, '#9aa3ad', 0.2, 1.06, -0.6);
    b.cyl(0.08, 0.08, 0.06, '#5a5f66', 0.2, 1.31, -0.6, 8);
    b.box(0.4, 0.06, 0.55, '#c24d16', 1.1, 1.06, -0.5);
    // pirámide de botes de pintura
    const paint = ['#f4f4f0', '#2f6fd6', '#c8102e', '#f2c94c', '#25a55f', '#f4f4f0'];
    let n = 0;
    for (let row = 0; row < 3; row++)
      for (let i = 0; i < 3 - row; i++) b.cyl(0.18, 0.18, 0.3, paint[n++ % paint.length], -2.6 + i * 0.4 + row * 0.2, row * 0.3, 1.8, 10);
    // banderín del Barriobajo
    const [pc, pg] = canvas(16, 12);
    pg.fillStyle = '#f0822a';
    pg.beginPath();
    pg.moveTo(0, 0);
    pg.lineTo(16, 6);
    pg.lineTo(0, 12);
    pg.fill();
    pg.fillStyle = '#1d1d22';
    pg.fillRect(0, 0, 3, 12);
    b.plane(0.7, 0.5, pixTex(pc), 2.2, 2.3, -2.9);
    // puerta del despacho con cristal esmerilado
    b.box(0.95, 2.1, 0.08, '#6b4a30', 3.0, 0, -2.92);
    const [dc, dg] = canvas(24, 16);
    dg.fillStyle = '#dfe8ec';
    dg.fillRect(0, 0, 24, 16);
    pixelText(dg, 'DIRECC', 12, 4, '#3a3a40', 22);
    b.plane(0.6, 0.4, pixTex(dc), 3.0, 1.55, -2.86);
    b.box(0.08, 0.08, 0.08, '#e2c26a', 3.35, 1.0, -2.86);
    // cajón de tornillos a granel
    b.box(1.2, 0.6, 0.6, '#8a5a3a', -1.2, 0, 0.6);
    b.box(1.1, 0.04, 0.5, '#9aa3ad', -1.2, 0.6, 0.6);
    this.hotspots = [
      { id: 'mostrador', label: 'Mostrador', anchor: v3(1.2, 2.0, -0.6), stand: v3(1.2, 0, 0.4) },
      { id: 'despacho', label: 'Despacho', anchor: v3(3.0, 2.6, -2.9), stand: v3(2.6, 0, -2.0) },
    ];
  }

  setState(c: Career) {
    this.lights.apply(c, this.scene);
    if (!this.ramon) this.ramon = this.addWalker(NPC.presidente.look, NPC.presidente.clothes, -1, true, v3(3.1, 0, -0.9), 'front');
  }

  protected tintAt(_p: THREE.Vector3, out: THREE.Color) {
    return out.set(this.lights.night ? '#dcdcf0' : '#ffffff');
  }

  protected tick() {
    // Don Ramón ordena el mostrador
    if (this.ramon) this.ramon.target.z = -0.9 + Math.sin(this.time * 0.2) * 0.5;
  }
}
