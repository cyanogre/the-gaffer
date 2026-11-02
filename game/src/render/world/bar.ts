import * as THREE from 'three';
import { randomLook } from '../../content/look';
import { slotTime, type Career } from '../../game/career';
import { Rng } from '../../sim/rng';
import { NPC } from '../../story/scenes';
import { pixelText } from '../pixel/text';
import { Location, canvas, pixTex, v3, type Walker } from './location';

/** Luces de interior según la franja: de día entra luz por la puerta; de noche, fluorescente y bombilla. */
export class InteriorLights {
  hemi = new THREE.HemisphereLight('#fff6e6', '#4a3a2a', 1.1);
  sun = new THREE.DirectionalLight('#ffffff', 1);
  lamp: THREE.PointLight;
  night = false;
  constructor(scene: THREE.Scene, lampAt: THREE.Vector3, color = '#ffd9a0') {
    this.lamp = new THREE.PointLight(color, 3, 10, 1.1);
    this.lamp.position.copy(lampAt);
    this.sun.position.set(-5, 7, 4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    scene.add(this.hemi, this.sun, this.lamp);
  }
  apply(c: Career, scene: THREE.Scene) {
    const t = slotTime(c.slot);
    this.night = t === 'night';
    this.hemi.intensity = t === 'night' ? 0.55 : t === 'dusk' ? 0.9 : 1.15;
    this.sun.intensity = t === 'night' ? 0.15 : 0.9;
    this.sun.color.set(t === 'dusk' ? '#ffb27a' : '#ffffff');
    this.lamp.intensity = t === 'night' ? 6 : 2.5;
    scene.background = new THREE.Color(t === 'night' ? '#0e0a1a' : '#1a1330');
  }
}

const civ = (shirt: string, trousers: string) => ({ shirt, shirt2: shirt, pattern: 'plain' as const, shorts: trousers, socks: trousers, trim: shirt });

/**
 * Bar Manolo: barra de zinc, vitrina de tapas, tragaperras, tele con el fútbol y la peña del dominó.
 * Charlar en la barra, invitar a alguien a la mesa y el bocadillo de la cocina.
 */
export class BarView extends Location {
  private lights: InteriorLights;
  private tv = canvas(32, 20);
  private tvTex: THREE.Texture;
  private slot = canvas(16, 24);
  private slotTex: THREE.Texture;
  private manolo: Walker | null = null;
  private regulars: Walker[] = [];
  private mood: 'normal' | 'sulk' = 'normal';
  private nextMove = 2;

  constructor() {
    super();
    this.fit = { w: 9.6, h: 6.2 };
    this.coachHome = v3(1.6, 0, 1.8);
    this.camera.position.set(9, 8, 9);
    this.camera.lookAt(-0.2, 1.2, -0.3);
    this.lights = new InteriorLights(this.scene, v3(0.5, 2.6, -0.5));
    this.tvTex = pixTex(this.tv[0]);
    this.slotTex = pixTex(this.slot[0]);
    this.build();
  }

  private build() {
    const b = this.b;
    // suelo de baldosa hidráulica
    const [fc, fg] = canvas(32, 32);
    for (let y = 0; y < 32; y += 8)
      for (let x = 0; x < 32; x += 8) {
        fg.fillStyle = (x + y) % 16 ? '#d8cbb0' : '#a8573c';
        fg.fillRect(x, y, 8, 8);
        fg.fillStyle = (x + y) % 16 ? '#c9b998' : '#934a32';
        fg.fillRect(x + 3, y + 3, 2, 2);
      }
    b.floor(8, 6, pixTex(fc, [8, 6]));
    // pared: zócalo de madera y gotelé mostaza con carteles
    const [wc, wg] = canvas(64, 48);
    wg.fillStyle = '#d6b45a';
    wg.fillRect(0, 0, 64, 48);
    for (let i = 0; i < 120; i++) {
      wg.fillStyle = i % 2 ? '#c9a64e' : '#e0c06a';
      wg.fillRect((i * 37) % 64, (i * 23) % 30, 1, 1);
    }
    wg.fillStyle = '#6b3f22';
    wg.fillRect(0, 30, 64, 18);
    wg.fillStyle = '#5a341c';
    for (let x = 0; x < 64; x += 8) wg.fillRect(x, 30, 1, 18);
    wg.fillStyle = '#7d4c2a';
    wg.fillRect(0, 30, 64, 2);
    const wt = pixTex(wc, [3, 1]);
    b.walls(8, 6, 3, new THREE.MeshLambertMaterial({ map: wt }), '#4a2a16');
    // barra de zinc
    b.box(4.6, 1.0, 0.65, '#6b3f22', 1.0, 0, -1.85);
    b.box(4.8, 0.08, 0.8, '#b9bec4', 1.0, 1.0, -1.85);
    b.box(0.65, 1.0, 1.6, '#6b3f22', 3.0, 0, -0.75);
    b.box(0.8, 0.08, 1.75, '#b9bec4', 3.0, 1.0, -0.75);
    // vitrina de tapas
    const [vc, vg] = canvas(32, 8);
    vg.fillStyle = '#f2ead8';
    vg.fillRect(0, 0, 32, 8);
    const tapas = ['#e8b04a', '#c24d16', '#f2e2b0', '#7a9a3a', '#d8d0c0', '#b3402a'];
    tapas.forEach((c, i) => {
      vg.fillStyle = '#ffffff';
      vg.fillRect(i * 5 + 1, 3, 5, 4);
      vg.fillStyle = c;
      vg.fillRect(i * 5 + 2, 3, 3, 3);
    });
    b.box(1.6, 0.35, 0.45, new THREE.MeshLambertMaterial({ color: '#cfe6ef', transparent: true, opacity: 0.55 }), 0.2, 1.08, -1.85);
    b.plane(1.5, 0.3, pixTex(vc), 0.2, 1.25, -1.62, 0, true);
    // grifos de cerveza
    for (const x of [1.6, 1.85]) {
      b.cyl(0.04, 0.04, 0.4, '#d8d8d8', x, 1.08, -1.95, 6);
      b.box(0.06, 0.14, 0.06, '#c8102e', x, 1.48, -1.95);
    }
    b.box(0.18, 0.12, 0.12, '#f4f4f0', 2.4, 1.08, -1.8);
    // estantería de botellas y espejo
    b.box(4.4, 0.06, 0.3, '#5a341c', 1.0, 1.6, -2.8);
    b.box(4.4, 0.06, 0.3, '#5a341c', 1.0, 2.15, -2.8);
    const glass = ['#2f7a3a', '#7a2a2a', '#d8b25c', '#3a5aa8', '#e8e2d0', '#5a3a1a'];
    for (let i = 0; i < 18; i++) {
      const x = -1.0 + (i % 9) * 0.5 + (i > 8 ? 0.2 : 0);
      b.cyl(0.06, 0.07, i % 3 ? 0.36 : 0.44, glass[i % glass.length], x, i > 8 ? 2.21 : 1.66, -2.8, 6);
    }
    const [mc, mg] = canvas(48, 16);
    mg.fillStyle = '#9fb6c4';
    mg.fillRect(0, 0, 48, 16);
    mg.fillStyle = '#c9dde8';
    for (let i = 0; i < 6; i++) mg.fillRect(4 + i * 8, 2 + (i % 3), 2, 10);
    b.plane(3.8, 0.5, pixTex(mc), 1.0, 2.75, -2.9);
    // bufanda del Barriobajo y cartel de fiestas
    const [sc, sg] = canvas(48, 8);
    for (let x = 0; x < 48; x += 6) {
      sg.fillStyle = x % 12 ? '#1d1d22' : '#f0822a';
      sg.fillRect(x, 0, 6, 8);
    }
    pixelText(sg, 'BARRIO', 24, 1, '#f4ecd8', 46);
    b.plane(2.4, 0.4, pixTex(sc), -1.7, 2.6, -2.9);
    const [pc, pg] = canvas(24, 32);
    pg.fillStyle = '#2f6fd6';
    pg.fillRect(0, 0, 24, 32);
    pg.fillStyle = '#f2c94c';
    pg.fillRect(2, 2, 20, 12);
    pixelText(pg, 'FIESTAS', 12, 4, '#c8102e', 20);
    pixelText(pg, '1982', 12, 18, '#ffffff', 20);
    b.plane(0.6, 0.8, pixTex(pc), -3.9, 2.0, 0.6, Math.PI / 2);
    // ventanuco de la cocina
    b.box(0.1, 0.8, 1.1, '#2a1a10', -3.95, 1.0, -1.6);
    const [kc, kg] = canvas(32, 8);
    kg.fillStyle = '#f4ecd8';
    kg.fillRect(0, 0, 32, 8);
    pixelText(kg, 'COCINA', 16, 1, '#c8102e', 30);
    b.plane(1.0, 0.25, pixTex(kc), -3.9, 2.0, -1.6, Math.PI / 2);
    b.box(0.5, 0.06, 1.1, '#b9bec4', -3.7, 1.0, -1.6);
    // tele en la esquina
    b.box(0.7, 0.5, 0.45, '#24242a', -3.4, 2.15, -2.55);
    b.plane(0.58, 0.38, this.tvTex, -3.4, 2.4, -2.32, 0, true);
    // tragaperras
    b.box(0.6, 1.5, 0.5, '#c8102e', -3.5, 0, 2.2);
    b.plane(0.4, 0.6, this.slotTex, -3.24, 1.0, 2.2, Math.PI / 2, true);
    // taburetes
    for (const x of [-0.4, 0.6, 1.6]) {
      b.cyl(0.04, 0.05, 0.7, '#3a3a40', x, 0, -1.2, 5);
      b.cyl(0.2, 0.2, 0.08, '#c8102e', x, 0.7, -1.2, 10);
    }
    // mesas con sillas
    for (const [x, z] of [
      [-2.2, 0.2],
      [-0.4, 1.9],
    ]) {
      b.cyl(0.05, 0.05, 0.72, '#3a3a40', x, 0, z, 5);
      b.cyl(0.5, 0.5, 0.05, '#e9e4d8', x, 0.72, z, 14);
      for (const [dx, dz] of [
        [-0.7, 0],
        [0.7, 0],
      ]) {
        b.box(0.4, 0.45, 0.4, '#8a5a3a', x + dx, 0, z + dz);
        b.box(0.4, 0.5, 0.06, '#8a5a3a', x + dx, 0.45, z + dz - 0.18);
      }
    }
    // fichas de dominó
    for (let i = 0; i < 6; i++) b.box(0.08, 0.02, 0.15, '#f4f4f0', -2.4 + i * 0.09, 0.77, 0.15 + (i % 2) * 0.06);
    this.hotspots = [
      { id: 'barra', label: 'Barra', anchor: v3(1.0, 2.05, -1.9), stand: v3(1.0, 0, -0.9) },
      { id: 'mesa', label: 'Mesa', anchor: v3(-0.4, 1.4, 1.9), stand: v3(0.5, 0, 1.4) },
      { id: 'cocina', label: 'Cocina', anchor: v3(-3.9, 2.45, -1.6), stand: v3(-3.0, 0, -1.4) },
    ];
  }

  private people(c: Career) {
    if (!this.manolo) {
      this.manolo = this.addWalker(NPC.manolo.look, NPC.manolo.clothes, -1, true, v3(1.2, 0, -2.45), 'front');
      this.manolo.speed = 1.3;
      const rng = new Rng(404);
      for (const [x, z] of [
        [-2.9, 0.25],
        [-1.5, 0.25],
      ]) {
        const look = randomLook(rng, 'm', { hair: rng.pick(['bald', 'combover', 'short']), hairColor: '#d8d4cc', facial: rng.pick(['mustache', 'none']), accessory: 'none', body: 'belly' });
        const w = this.addWalker(look, civ(rng.pick(['#5d6a3a', '#4a4f6a', '#7a5236']), '#3a3a44'), -1, true, v3(x, 0, z), 'side');
        w.flip = x > -2.2;
        this.regulars.push(w);
      }
    }
    this.mood = c.flags.manoloEnfadado ? 'sulk' : 'normal';
    this.manolo.idle = this.mood === 'sulk' ? ['idle0'] : undefined;
  }

  setState(c: Career) {
    this.lights.apply(c, this.scene);
    this.people(c);
  }

  protected tintAt(_p: THREE.Vector3, out: THREE.Color) {
    return out.set(this.lights.night ? '#e8d4c0' : '#ffffff');
  }

  protected tick() {
    // la tele echa fútbol (un campo verde con dos puntos que corren)
    const [, g] = this.tv;
    g.fillStyle = '#2f7a3a';
    g.fillRect(0, 0, 32, 20);
    g.fillStyle = '#e8f0e0';
    g.fillRect(16, 0, 1, 20);
    const t = this.time;
    g.fillStyle = '#c8102e';
    g.fillRect(Math.round(16 + Math.sin(t * 0.9) * 11), Math.round(10 + Math.cos(t * 1.3) * 6), 2, 2);
    g.fillStyle = '#f2c94c';
    g.fillRect(Math.round(16 + Math.sin(t * 0.9 + 1) * 10), Math.round(10 + Math.cos(t * 1.1 + 2) * 5), 2, 2);
    g.fillStyle = '#ffffff';
    g.fillRect(Math.round(16 + Math.sin(t * 0.9 + 0.3) * 11), Math.round(10 + Math.cos(t * 1.25) * 6), 1, 1);
    this.tvTex.needsUpdate = true;
    // la tragaperras parpadea
    const [, sg] = this.slot;
    sg.fillStyle = '#1a1226';
    sg.fillRect(0, 0, 16, 24);
    const on = Math.floor(t * 3) % 3;
    ['#f2c94c', '#33d17a', '#ff4fa3'].forEach((c, i) => {
      sg.fillStyle = i === on ? c : '#3a2a4a';
      sg.fillRect(2 + i * 4, 3, 3, 3);
    });
    sg.fillStyle = '#f4f4f0';
    sg.fillRect(3, 10, 10, 7);
    pixelText(sg, '777', 8, 10, Math.floor(t * 2) % 2 ? '#c8102e' : '#1a1226', 12);
    this.slotTex.needsUpdate = true;
    // Manolo va de un lado a otro de la barra: camina, se para a secar vasos y vuelve
    if (this.manolo && this.mood === 'normal' && t > this.nextMove) {
      this.nextMove = t + 3 + ((t * 7.3) % 3);
      this.manolo.target.x = this.manolo.target.x > 1.2 ? 0.2 : 2.2;
    }
  }
}
