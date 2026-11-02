import * as THREE from 'three';
import { rivalOf, slotTime, todayWeather, DAYS_SHORT, type Career } from '../../game/career';
import { FORMATIONS } from '../../sim/formations';
import { pixelText } from '../pixel/text';
import { Location, canvas as cv, pixTex as texOf, v3 } from './location';

/**
 * Casa del míster: diorama 3D con el míster en 2D. Pizarra (estudiar), portátil (vídeos y correo),
 * teléfono, puerta, sofá y cama. La ventana enseña el tiempo y la hora que hace.
 */
export class CasaView extends Location {
  private board = cv(96, 64);
  private boardTex: THREE.Texture;
  private cal = cv(48, 56);
  private calTex: THREE.Texture;
  private screen = cv(48, 32);
  private screenTex: THREE.Texture;
  private tv = cv(32, 24);
  private tvTex: THREE.Texture;
  private win = cv(32, 40);
  private winTex: THREE.Texture;
  private phoneLed: THREE.Mesh;
  private sky = new THREE.Color();
  private rainy = false;
  private night = false;
  private lamp = new THREE.PointLight('#ffcf8a', 3, 8, 1.2);
  private hemi = new THREE.HemisphereLight('#ffffff', '#5a4a3a', 1.2);
  private sun = new THREE.DirectionalLight('#ffffff', 1.2);
  phoneRinging = false;
  mailPending = false;
  doorKnock = false;

  constructor() {
    super();
    this.fit = { w: 9.4, h: 6.2 };
    this.coachHome = v3(-0.4, 0, 0.6);
    this.boardTex = texOf(this.board[0]);
    this.calTex = texOf(this.cal[0]);
    this.screenTex = texOf(this.screen[0]);
    this.tvTex = texOf(this.tv[0]);
    this.winTex = texOf(this.win[0]);
    this.camera.position.set(9, 8, 9);
    this.camera.lookAt(-0.2, 1.25, -0.3);
    this.scene.add(this.hemi, this.lamp, this.sun);
    this.sun.position.set(-6, 6, 3);
    this.sun.castShadow = true;
    this.lamp.position.set(0.9, 1.4, -2.3);
    this.phoneLed = this.build();
    this.flattenProps();
    this.activities = {
      estudiar: { at: v3(-1.4, 0, -1.9), view: 'back', frames: ['point', 'idle0', 'point', 'talk'], fps: 1.6 },
      // en la silla del escritorio, de espaldas, con las manos en el portátil
      videos: { at: v3(0.55, 0, -1.85), view: 'back', frames: ['table'], fps: 1, layers: { silla: 'front' } },
      // en el sofá mirando la tele: el sofá le tapa entero por delante, asoman la cabeza y los hombros
      descansar: { at: v3(1.4, 0, 1.85), view: 'back', frames: ['sit'], fps: 1, layers: { sofa: 'behind' } },
      // tumbado en la cama, tapado, con la cabeza en la almohada (sigue la cama en la vista isométrica)
      dormir: { bed: 'cama' },
      // de pie junto a la nevera, con el bocadillo
      comer: { at: v3(-2.4, 0, -1.6), view: 'front', frames: ['eat', 'idle0', 'eat', 'idle1'], fps: 1.6 },
    };
  }

  private build() {
    const s = this.scene;
    const m = (c: string) => this.b.mat(c);
    const box = (w: number, h: number, d: number, color: string | THREE.Material, x: number, y: number, z: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'string' ? m(color) : color);
      b.position.set(x, y + h / 2, z);
      b.castShadow = true;
      b.receiveShadow = true;
      s.add(b);
      return b;
    };
    // suelo de tarima vieja
    const [fc, fg] = cv(64, 64);
    for (let y = 0; y < 64; y += 8) {
      fg.fillStyle = y % 16 ? '#8a6544' : '#7d5a3c';
      fg.fillRect(0, y, 64, 8);
      fg.fillStyle = '#5e4129';
      fg.fillRect(0, y + 7, 64, 1);
      fg.fillRect((y * 13) % 64, y, 1, 8);
    }
    const ft = texOf(fc);
    ft.wrapS = ft.wrapT = THREE.RepeatWrapping;
    ft.repeat.set(3, 3);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(7, 6), new THREE.MeshLambertMaterial({ map: ft }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    // papel pintado con manchas de humedad
    const [wc, wg] = cv(64, 32);
    wg.fillStyle = '#c9b48a';
    wg.fillRect(0, 0, 64, 32);
    for (let x = 0; x < 64; x += 8) {
      wg.fillStyle = '#b9a276';
      wg.fillRect(x, 0, 2, 32);
      wg.fillStyle = '#d7c49c';
      wg.fillRect(x + 4, 6, 2, 2);
      wg.fillRect(x + 4, 20, 2, 2);
    }
    const wt = texOf(wc);
    wt.wrapS = wt.wrapT = THREE.RepeatWrapping;
    wt.repeat.set(3, 1.2);
    const wallMat = new THREE.MeshLambertMaterial({ map: wt });
    const back = new THREE.Mesh(new THREE.BoxGeometry(7, 3, 0.15), wallMat);
    back.position.set(0, 1.5, -3);
    back.receiveShadow = true;
    s.add(back);
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3, 6), wallMat);
    left.position.set(-3.5, 1.5, 0);
    left.receiveShadow = true;
    s.add(left);
    box(7, 0.12, 0.2, '#6e4c30', 0, 0, -2.88);
    box(0.2, 0.12, 6, '#6e4c30', -3.38, 0, 0);
    const plane = (w: number, h: number, t: THREE.Texture, x: number, y: number, z: number, ry = 0, emissive = false) => {
      const mat = emissive ? new THREE.MeshBasicMaterial({ map: t }) : new THREE.MeshLambertMaterial({ map: t });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      p.position.set(x, y, z);
      p.rotation.y = ry;
      s.add(p);
      return p;
    };
    // pizarra táctica
    box(1.95, 1.25, 0.06, '#d8d8d8', -1.4, 1.0, -2.9);
    plane(1.8, 1.1, this.boardTex, -1.4, 1.62, -2.86);
    // escritorio, portátil, teléfono y flexo
    box(1.7, 0.06, 0.75, '#7a5236', 0.7, 0.74, -2.45);
    for (const [dx, dz] of [
      [-0.78, -0.3],
      [0.78, -0.3],
      [-0.78, 0.3],
      [0.78, 0.3],
    ])
      box(0.06, 0.74, 0.06, '#5e3f28', 0.7 + dx, 0, -2.45 + dz);
    box(0.5, 0.03, 0.34, '#2a2d34', 0.55, 0.8, -2.4);
    const scr = plane(0.5, 0.32, this.screenTex, 0.55, 0.98, -2.58, 0, true);
    scr.rotation.x = -0.2;
    box(0.14, 0.06, 0.2, '#e8e2d6', 1.15, 0.8, -2.35);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), new THREE.MeshBasicMaterial({ color: '#ff3b3b' }));
    led.position.set(1.15, 0.9, -2.3);
    s.add(led);
    box(0.08, 0.5, 0.08, '#3a3a40', 1.4, 0.8, -2.6);
    this.furniture('silla', box(0.4, 0.45, 0.4, '#4a4f6a', 0.55, 0, -1.85));
    // póster del club y calendario
    const [pc, pg] = cv(32, 40);
    pg.fillStyle = '#f0822a';
    pg.fillRect(0, 0, 32, 40);
    pg.fillStyle = '#1d1d22';
    for (let x = 4; x < 32; x += 8) pg.fillRect(x, 0, 4, 40);
    pg.fillStyle = '#f4ecd8';
    pg.fillRect(4, 26, 24, 10);
    pixelText(pg, 'BARRIO', 16, 28, '#1d1d22', 22);
    plane(0.6, 0.75, texOf(pc), 0.7, 1.75, -2.92);
    plane(0.55, 0.65, this.calTex, -3.42, 1.7, -1.5, Math.PI / 2);
    // ventana (el tiempo de la semana se ve fuera)
    box(0.1, 1.15, 1.05, '#e8e2d6', -3.45, 1.15, 0.9);
    plane(0.9, 1.0, this.winTex, -3.38, 1.72, 0.9, Math.PI / 2, true);
    // puerta
    box(0.95, 2.1, 0.08, '#7a4f30', 2.4, 0, -2.92);
    box(0.08, 0.08, 0.08, '#e2c26a', 2.75, 1.0, -2.86);
    // cama deshecha (la manta se estira sobre quien se acuesta)
    const spread = box(1.4, 0.18, 1.25, '#c24d16', -2.0, 0.5, 1.6);
    this.furniture('cama', box(2.1, 0.35, 1.3, '#6b4a30', -2.3, 0, 1.6), box(2.0, 0.2, 1.2, '#f2efe6', -2.3, 0.35, 1.6), spread, box(0.4, 0.15, 0.7, '#ffffff', -3.0, 0.55, 1.6));
    this.beds.push({ id: 'cama', head: v3(-3.0, 0.7, 1.6), foot: v3(-1.32, 0.55, 1.6), width: 1.22, blanket: '#c24d16', spread });
    // sofá (asiento y respaldo: un solo mueble) y tele vieja
    this.furniture('sofa', box(1.6, 0.45, 0.7, '#5d6a3a', 1.6, 0, 1.9), box(1.6, 0.6, 0.18, '#53602f', 1.6, 0.45, 2.2));
    box(0.7, 0.45, 0.45, '#3a2a20', 1.6, 0, 0.2);
    box(0.62, 0.48, 0.42, '#24242a', 1.6, 0.45, 0.2);
    const tvp = plane(0.48, 0.34, this.tvTex, 1.6, 0.7, 0.42, 0, true);
    tvp.rotation.y = 0;
    // nevera y planta (bien regada)
    box(0.75, 1.75, 0.65, '#e8e6e0', -2.9, 0, -2.45);
    box(0.06, 0.4, 0.04, '#b9b6ae', -2.62, 1.0, -2.1);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.3, 8), m('#a5512e'));
    pot.position.set(3.0, 0.15, -2.5);
    s.add(pot);
    for (const [dx, dz, h] of [
      [0, 0, 0.62],
      [0.09, 0.05, 0.5],
      [-0.08, -0.04, 0.48],
    ]) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.16, h, 6), m('#4f9a3a'));
      leaf.position.set(3.0 + dx, 0.3 + h / 2, -2.5 + dz);
      s.add(leaf);
    }
    // estantería con un trofeo de alevines y unos libros de fútbol
    box(0.9, 0.05, 0.3, '#8a5a3a', 2.75, 1.45, -2.82);
    box(0.12, 0.28, 0.12, '#e2c26a', 2.5, 1.5, -2.8);
    for (let i = 0; i < 4; i++) box(0.08, 0.26, 0.2, ['#c8102e', '#2f6fd6', '#f2c94c', '#25a55f'][i], 2.75 + i * 0.1, 1.5, -2.8);
    // alfombra
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.1, 16), m('#c8763a'));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(-0.3, 0.01, 0.4);
    rug.receiveShadow = true;
    s.add(rug);

    this.hotspots = [
      { id: 'board', label: 'Pizarra', anchor: v3(-1.4, 2.45, -2.9), stand: v3(-1.4, 0, -2.0) },
      { id: 'laptop', label: 'Portátil', anchor: v3(0.55, 1.35, -2.5), stand: v3(0.3, 0, -1.6) },
      { id: 'phone', label: 'Teléfono', anchor: v3(1.15, 1.15, -2.3), stand: v3(1.1, 0, -1.6) },
      { id: 'door', label: 'Puerta', anchor: v3(2.4, 2.35, -2.9), stand: v3(2.4, 0, -2.1) },
      { id: 'calendar', label: 'Calendario', anchor: v3(-3.4, 2.15, -1.5), stand: v3(-2.6, 0, -1.4) },
      { id: 'sofa', label: 'Sofá', anchor: v3(1.6, 1.2, 1.9), stand: v3(1.0, 0, 1.2) },
      { id: 'fridge', label: 'Nevera', anchor: v3(-2.9, 2.0, -2.45), stand: v3(-2.4, 0, -1.6) },
      { id: 'bed', label: 'Cama', anchor: v3(-2.3, 1.0, 1.6), stand: v3(-1.0, 0, 1.4) },
    ];
    return led;
  }

  /** Refresca pizarra, calendario, ventana y luces con el estado del día. */
  setState(c: Career) {
    const w = todayWeather(c);
    const t = slotTime(c.slot);
    // pizarra: la formación planificada para el domingo
    const [, bg] = this.board;
    bg.fillStyle = '#f4f6f2';
    bg.fillRect(0, 0, 96, 64);
    bg.strokeStyle = '#7aa07a';
    bg.strokeRect(4.5, 10.5, 87, 50);
    bg.beginPath();
    bg.moveTo(48.5, 10);
    bg.lineTo(48.5, 61);
    bg.stroke();
    pixelText(bg, `DOM VS ${rivalOf(c).short}`, 48, 2, '#2a2d6a', 90);
    for (const s of FORMATIONS[c.planned.formation]) {
      bg.fillStyle = '#c8102e';
      const x = Math.round(6 + s.u * 84);
      const y = Math.round(12 + (1 - s.v) * 46);
      bg.fillRect(x - 1, y - 1, 3, 3);
    }
    bg.fillStyle = '#2a2d6a';
    bg.fillRect(6 + Math.round([0.3, 0.42, 0.55][c.planned.block] * 84), 12, 1, 46);
    this.boardTex.needsUpdate = true;
    // calendario: hoy y el rival del domingo
    const [, cg] = this.cal;
    cg.fillStyle = '#f4ecd8';
    cg.fillRect(0, 0, 48, 56);
    cg.fillStyle = '#c8102e';
    cg.fillRect(0, 0, 48, 12);
    pixelText(cg, `SEM ${c.week}`, 24, 3, '#ffffff', 44);
    pixelText(cg, DAYS_SHORT[Math.min(6, c.day)], 24, 16, '#2a1d22', 44);
    pixelText(cg, 'DOM', 24, 28, '#2a1d22', 44);
    pixelText(cg, rivalOf(c).short, 24, 39, '#c8102e', 44);
    this.calTex.needsUpdate = true;
    // luz y ventana según la franja y el tiempo de hoy
    this.night = t === 'night';
    this.sky.set(t === 'night' ? '#0d1030' : t === 'dusk' ? '#e88a5a' : w === 'clear' ? '#8ec5ef' : '#9aa2ad');
    this.rainy = w === 'rain' || w === 'storm';
    this.hemi.intensity = t === 'night' ? 0.5 : t === 'dusk' ? 0.9 : 1.15;
    this.sun.intensity = t === 'night' ? 0.1 : w === 'clear' ? 1.3 : 0.6;
    this.sun.color.set(t === 'dusk' ? '#ffb27a' : '#ffffff');
    this.lamp.intensity = t === 'night' ? 5 : 2;
    this.scene.background = new THREE.Color(t === 'night' ? '#0c1426' : '#16233a');
  }

  protected tintAt(_p: THREE.Vector3, out: THREE.Color) {
    return out.set(this.night ? '#c9b8d8' : '#ffffff');
  }

  protected tick(_dt: number) {
    // pantalla del portátil, tele y ventana
    const [, sg] = this.screen;
    sg.fillStyle = '#1c2a4a';
    sg.fillRect(0, 0, 48, 32);
    sg.fillStyle = '#9fd0ff';
    sg.fillRect(3, 3, 42, 4);
    if (this.mailPending && Math.floor(this.time * 2) % 2) {
      sg.fillStyle = '#f2c94c';
      sg.fillRect(16, 12, 16, 11);
      sg.fillStyle = '#c24d16';
      sg.fillRect(16, 12, 16, 2);
    }
    this.screenTex.needsUpdate = true;
    const [, tg] = this.tv;
    // la tele echa fútbol
    tg.fillStyle = '#2f7a3a';
    tg.fillRect(0, 0, 32, 24);
    tg.fillStyle = '#e8f0e0';
    tg.fillRect(16, 0, 1, 24);
    const tt = this.time;
    tg.fillStyle = '#c8102e';
    tg.fillRect(Math.round(16 + Math.sin(tt * 0.9) * 11), Math.round(12 + Math.cos(tt * 1.3) * 7), 2, 2);
    tg.fillStyle = '#f2c94c';
    tg.fillRect(Math.round(16 + Math.sin(tt * 0.9 + 1) * 10), Math.round(12 + Math.cos(tt * 1.1 + 2) * 6), 2, 2);
    tg.fillStyle = '#ffffff';
    tg.fillRect(Math.round(16 + Math.sin(tt * 0.9 + 0.3) * 11), Math.round(12 + Math.cos(tt * 1.25) * 7), 1, 1);
    this.tvTex.needsUpdate = true;
    const [, wg] = this.win;
    wg.fillStyle = `#${this.sky.getHexString()}`;
    wg.fillRect(0, 0, 32, 40);
    wg.fillStyle = '#4a4258';
    wg.fillRect(2, 26, 9, 14);
    wg.fillRect(14, 20, 7, 20);
    wg.fillRect(24, 30, 8, 10);
    if (this.rainy) {
      wg.fillStyle = 'rgba(200,215,240,0.8)';
      for (let i = 0; i < 18; i++) {
        const x = (i * 7 + Math.floor(this.time * 20) * 3) % 32;
        const y = (i * 11 + Math.floor(this.time * 40) * 5) % 40;
        wg.fillRect(x, y, 1, 3);
      }
    }
    wg.fillStyle = '#e8e2d6';
    wg.fillRect(15, 0, 2, 40);
    wg.fillRect(0, 19, 32, 2);
    this.winTex.needsUpdate = true;
    (this.phoneLed.material as THREE.MeshBasicMaterial).color.set(this.phoneRinging && Math.floor(this.time * 4) % 2 ? '#ff3b3b' : '#3a1414');
  }

}
