import * as THREE from 'three';
import { randomLook } from '../../content/look';
import { STADIUM_LEVELS, slotTime, todayWeather, type Career } from '../../game/career';
import { isTrainingSlot } from '../../game/squad';
import { conditionsFor } from '../../sim/conditions';
import { Rng } from '../../sim/rng';
import { NPC } from '../../story/scenes';
import { buildStadium, type Stadium } from '../hybrid/stadium';
import { WeatherFX } from '../hybrid/weather';
import { Location, v3, type Walker } from './location';

/**
 * El campo del club: el mismo estadio 3D del domingo (evoluciona con las obras), con su tiempo y su
 * hora. Martes y jueves por la tarde está la plantilla entrenando; el resto, lo que haya.
 */
const GROUP = v3(-24, 0, -25);

export class CampoView extends Location {
  private weather = new WeatherFX(this.scene);
  private stadium: Stadium | null = null;
  private level = -1;
  private squadKey = '';
  private squad: Walker[] = [];
  private locals: Walker[] = [];
  private training = false;
  private cones: THREE.Mesh[] = [];
  private wind = 0;

  constructor() {
    super();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 600);
    this.coachHome = v3(-22, 0, -19.5);
    this.coachScale = 1;
    this.coachSpeed = 7;
    const cm = new THREE.MeshLambertMaterial({ color: '#ff7a1a' });
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 6), cm);
      c.position.set(GROUP.x - 6 + i * 2.4, 0.22, GROUP.z + 4.5 + (i % 2) * 1.2);
      this.cones.push(c);
      this.scene.add(c);
    }
    this.hotspots = [
      { id: 'pitch', label: 'Césped', anchor: v3(GROUP.x, 3.4, GROUP.z), stand: v3(GROUP.x + 1.5, 0, GROUP.z + 3.5) },
      { id: 'track', label: 'Banda', anchor: v3(-32, 2.6, -30.5), stand: v3(-31, 0, -29) },
      { id: 'fence', label: 'Valla', anchor: v3(-11, 4.2, -37.4), stand: v3(-11, 0, -33) },
    ];
  }

  protected onResize(aspect: number) {
    const cam = this.camera as THREE.PerspectiveCamera;
    // en vertical la cámara sube y mira más hacia abajo: grupo, banda y valla caben a lo alto
    const narrow = Math.max(0, Math.min(1, (1.3 - aspect) / 0.85));
    cam.fov = 42 + narrow * 8;
    cam.position.set(-14 - narrow * 10, 7 + narrow * 19, -4 + narrow * 6);
    cam.lookAt(-25, 0.5, -30 + narrow * 4);
    cam.updateProjectionMatrix();
  }

  private ensureStadium(level: number) {
    if (level === this.level && this.stadium) return;
    if (this.stadium) this.scene.remove(this.stadium.group);
    this.stadium = buildStadium(level);
    this.scene.add(this.stadium.group);
    this.level = level;
  }

  private ensureSquad(c: Career) {
    const key = c.squad.map((p) => p.id).join() + c.club.id + c.lineup.join();
    if (key === this.squadKey) return;
    this.squadKey = key;
    for (const w of this.squad) this.scene.remove(w.bb.sprite, w.bb.shadow);
    this.walkers = this.walkers.filter((w) => !this.squad.includes(w));
    const order = [...c.lineup, ...c.squad.filter((p) => !c.lineup.includes(p.id)).map((p) => p.id)];
    this.squad = order.map((id, i) => {
      const p = c.squad.find((x) => x.id === id)!;
      const a = Math.PI * (0.15 + (0.7 * i) / Math.max(1, order.length - 1));
      const pos = v3(GROUP.x + Math.cos(a) * 5.5, 0, GROUP.z - Math.sin(a) * 3.2);
      const w = this.addWalker(p.look, p.role === 'POR' ? c.club.gkKit : c.club.kit, p.num, false, pos, 'front', 1);
      w.speed = 3 + (p.attrs.pace / 20) * 2;
      return w;
    });
    if (!this.locals.length) {
      const rng = new Rng(77);
      // la abuela Mari no se pierde un entrenamiento; un vecino pasea por la banda
      this.locals.push(this.addWalker(NPC.abuela.look, NPC.abuela.clothes, -1, true, v3(-8, 0.45, -38.4), 'front', 1));
      const look = randomLook(rng, 'm', { accessory: 'none' });
      const w = this.addWalker(look, { shirt: '#4a4f6a', shirt2: '#4a4f6a', pattern: 'plain', shorts: '#3a3a44', socks: '#3a3a44', trim: '#4a4f6a' }, -1, true, v3(-40, 0, -36.5), 'side', 1);
      w.speed = 1.1;
      this.locals.push(w);
    }
  }

  private lastState: Career | null = null;
  setState(c: Career) {
    this.lastState = c;
    this.ensureStadium(c.stadiumLevel);
    const cond = conditionsFor(todayWeather(c), slotTime(c.slot), STADIUM_LEVELS[c.stadiumLevel].pitch, c.seed + c.week * 7 + c.day);
    this.weather.apply(cond, this.stadium!);
    this.wind = Math.hypot(cond.windX, cond.windY);
    this.ensureSquad(c);
    this.training = isTrainingSlot(c) || this.drillT > 0;
    for (const w of this.squad) {
      w.bb.sprite.visible = w.bb.shadow.visible = this.training;
    }
    for (const cn of this.cones) cn.visible = this.training;
  }

  /** Tras el entreno: rondo alrededor de los conos durante unos segundos. */
  drill(seconds = 6) {
    this.drillT = seconds;
  }
  private drillT = 0;

  protected tintAt(p: THREE.Vector3, out: THREE.Color) {
    return this.weather.lightAt(p.x, p.z, out);
  }

  protected tick(dt: number) {
    this.weather.update(dt, this.time);
    this.stadium?.update(this.time, this.wind);
    const was = this.drillT;
    this.drillT = Math.max(0, this.drillT - dt);
    if (was > 0 && this.drillT === 0 && this.lastState) this.setState(this.lastState);
    this.squad.forEach((w, i) => {
      if (this.drillT > 0) {
        const a = this.time * 0.9 + (i / this.squad.length) * Math.PI * 2;
        w.target.set(GROUP.x + Math.cos(a) * 7, 0, GROUP.z + 2 + Math.sin(a) * 3.5);
      } else {
        const a = Math.PI * (0.15 + (0.7 * i) / Math.max(1, this.squad.length - 1));
        w.target.set(GROUP.x + Math.cos(a) * 5.5, 0, GROUP.z - Math.sin(a) * 3.2);
      }
    });
    const walker = this.locals[1];
    if (walker) {
      walker.target.x = -40 + Math.sin(this.time * 0.08) * 18;
      walker.face = 'side';
    }
  }
}
