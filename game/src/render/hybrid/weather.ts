import * as THREE from 'three';
import type { MatchConditions } from '../../sim/conditions';
import type { Stadium } from './stadium';

/**
 * Cielo, luz y meteorología del estadio 3D. También calcula cuánta luz recibe un punto,
 * para teñir los sprites 2D igual que el escenario (de noche solo brilla lo que alumbra un foco).
 */
const SKY: Record<string, [string, string]> = {
  day: ['#4f9be0', '#d8ecf7'],
  dusk: ['#4a6fb0', '#ffb070'],
  night: ['#0d1a3a', '#2e3f6e'],
};

export class WeatherFX {
  private sky: THREE.Mesh;
  private hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1);
  private sun = new THREE.DirectionalLight('#ffffff', 2);
  private floods: THREE.SpotLight[] = [];
  private rain: THREE.LineSegments | null = null;
  private snow: THREE.Points | null = null;
  private puddles: THREE.Mesh[] = [];
  private cond: MatchConditions | null = null;
  private baseHemi = 1;
  private baseSun = 1;
  private ambient = new THREE.Color();
  private nextBolt = 6;
  flash = 0;
  onThunder: (() => void) | null = null;

  constructor(private scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(400, 24, 12);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    this.sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    scene.add(this.sky, this.hemi, this.sun, this.sun.target);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const c = this.sun.shadow.camera;
    c.left = -80;
    c.right = 80;
    c.top = 60;
    c.bottom = -60;
    c.near = 10;
    c.far = 260;
  }

  apply(cond: MatchConditions, stadium: Stadium) {
    this.cond = cond;
    const t = cond.time;
    const w = cond.weather;
    const gloomy = w === 'rain' || w === 'storm' ? (w === 'storm' ? 0.6 : 0.45) : w === 'cloudy' || w === 'fog' ? 0.35 : w === 'snow' ? 0.3 : 0;
    // cielo
    let [top, bottom] = SKY[t].map((c) => new THREE.Color(c));
    const grey = new THREE.Color(t === 'night' ? '#14151c' : w === 'snow' ? '#c9ced6' : '#7d838e');
    top = top.lerp(grey, gloomy);
    bottom = bottom.lerp(grey, gloomy * 0.9);
    const pos = this.sky.geometry.attributes.position;
    const col = this.sky.geometry.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      const k = THREE.MathUtils.clamp(pos.getY(i) / 160, 0, 1);
      const c = bottom.clone().lerp(top, Math.pow(k, 0.7));
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
    // luz principal
    const hemiCfg = { day: ['#f2f6ff', '#7a6a50', 1.6], dusk: ['#ffd9b8', '#5a4a58', 1.3], night: ['#6f86c0', '#1c1e30', 0.65] } as const;
    const sunCfg = { day: ['#fff2d8', 2.4, [-30, 70, 40]], dusk: ['#ffad6a', 1.9, [-80, 22, -60]], night: ['#9fb4ff', 0.3, [40, 60, -30]] } as const;
    const [hs, hg, hi] = hemiCfg[t];
    this.hemi.color.set(hs);
    this.hemi.groundColor.set(hg);
    this.baseHemi = hi * (1 - gloomy * 0.35);
    const [sc, si, sp] = sunCfg[t];
    this.sun.color.set(sc);
    this.baseSun = si * (1 - gloomy * 0.85);
    this.sun.position.set(sp[0], sp[1], sp[2]);
    this.sun.castShadow = t !== 'night' && gloomy < 0.5;
    // niebla
    const fogCol = bottom.clone().lerp(grey, 0.5);
    this.scene.fog = w === 'fog' ? new THREE.Fog(fogCol, 12, 85) : new THREE.Fog(fogCol, 140, 380);
    // focos (solo de noche o con mucha tormenta)
    for (const f of this.floods) this.scene.remove(f, f.target);
    this.floods = [];
    const lit = t === 'night' || (t === 'dusk' && gloomy > 0.3);
    if (lit)
      for (const l of stadium.lights) {
        const s = new THREE.SpotLight('#fff1c8', 0, 120, 0.9, 0.6, 0);
        s.position.copy(l.pos);
        s.target.position.set(l.pos.x * 0.35, 0, l.pos.z * 0.2 + 2);
        s.userData.power = l.power;
        this.scene.add(s, s.target);
        this.floods.push(s);
      }
    for (const m of stadium.windowMats) m.emissive.set(t === 'night' ? '#ffffff' : t === 'dusk' ? '#555555' : '#000000');
    // suelo mojado o nevado
    const wet = (w === 'rain' || w === 'storm') && cond.precip > 0;
    // el color base de cada suelo se guarda la primera vez; el tiempo solo lo multiplica
    const tint = new THREE.Color(w === 'snow' ? '#f0f4fa' : wet ? '#9da0a8' : '#ffffff');
    for (const m of stadium.groundMats) {
      const base = (m.userData.base ??= m.color.clone()) as THREE.Color;
      m.color.copy(base).multiply(tint);
      if (w === 'snow') m.color.lerp(new THREE.Color('#eef2f8'), 0.55);
    }
    for (const p of this.puddles) this.scene.remove(p);
    this.puddles = [];
    if (wet) {
      const pm = new THREE.MeshLambertMaterial({ color: '#3c4a5c', transparent: true, opacity: 0.75 });
      for (const p of stadium.puddles) {
        const m = new THREE.Mesh(new THREE.CircleGeometry(1, 12), pm);
        m.rotation.x = -Math.PI / 2;
        m.position.copy(p);
        m.scale.set(1.2 + (p.x % 1.5), 0.8 + (p.z % 0.8), 1);
        this.scene.add(m);
        this.puddles.push(m);
      }
    }
    this.buildParticles(cond);
  }

  private buildParticles(cond: MatchConditions) {
    if (this.rain) this.scene.remove(this.rain);
    if (this.snow) this.scene.remove(this.snow);
    this.rain = null;
    this.snow = null;
    if ((cond.weather === 'rain' || cond.weather === 'storm') && cond.precip > 0) {
      const n = Math.round(900 + cond.precip * 1200);
      const arr = new Float32Array(n * 6);
      for (let i = 0; i < n; i++) {
        const x = (Math.random() - 0.5) * 110;
        const y = Math.random() * 34;
        const z = (Math.random() - 0.5) * 80;
        arr.set([x, y, z, x, y - 0.9, z], i * 6);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#a9bbd6', transparent: true, opacity: 0.55 }));
      this.rain.frustumCulled = false;
      this.scene.add(this.rain);
    }
    if (cond.weather === 'snow') {
      const n = 1400;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) arr.set([(Math.random() - 0.5) * 110, Math.random() * 30, (Math.random() - 0.5) * 80], i * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      this.snow = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false }));
      this.snow.frustumCulled = false;
      this.scene.add(this.snow);
    }
  }

  update(dt: number, time: number) {
    const c = this.cond;
    if (!c) return;
    // relámpagos
    if (c.weather === 'storm') {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.flash = 1;
        this.nextBolt = 7 + Math.random() * 9;
        this.onThunder?.();
      }
    }
    this.flash = Math.max(0, this.flash - dt * 3);
    const strobe = this.flash > 0 ? this.flash * (0.6 + Math.sin(time * 90) * 0.4) : 0;
    this.hemi.intensity = this.baseHemi + strobe * 2.5;
    this.sun.intensity = this.baseSun;
    for (const f of this.floods) f.intensity = 2.2 * f.userData.power * (0.97 + Math.sin(time * 37 + f.position.x) * 0.03);
    if (this.rain) {
      const a = this.rain.geometry.attributes.position.array as Float32Array;
      const fall = (20 + c.precip * 8) * dt;
      const wx = c.windX * 0.05;
      const wz = c.windY * 0.05;
      for (let i = 0; i < a.length; i += 6) {
        a[i + 1] -= fall;
        a[i + 4] -= fall;
        a[i] += wx * fall;
        a[i + 2] += wz * fall;
        if (a[i + 4] < 0) {
          const x = (Math.random() - 0.5) * 110;
          const z = (Math.random() - 0.5) * 80;
          a.set([x, 34, z, x - wx * 6, 33.1, z - wz * 6], i);
        } else {
          a[i + 3] = a[i] - wx * 6;
          a[i + 5] = a[i + 2] - wz * 6;
        }
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
    if (this.snow) {
      const a = this.snow.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < a.length; i += 3) {
        a[i + 1] -= 1.6 * dt;
        a[i] += (Math.sin(time + i) * 0.6 + c.windX * 0.2) * dt;
        a[i + 2] += c.windY * 0.2 * dt;
        if (a[i + 1] < 0) a[i + 1] = 30;
      }
      this.snow.geometry.attributes.position.needsUpdate = true;
    }
  }

  /** Luz que recibe un punto (para teñir los sprites 2D). */
  lightAt(x: number, z: number, out: THREE.Color) {
    const c = this.cond;
    if (!c) return out.setScalar(1);
    const base = { day: 1, dusk: 0.92, night: 0.5 }[c.time];
    const gloom = c.weather === 'storm' ? 0.75 : c.weather === 'rain' ? 0.82 : c.weather === 'cloudy' || c.weather === 'fog' ? 0.9 : 1;
    this.ambient.setRGB(base * gloom, base * gloom * (c.time === 'dusk' ? 0.9 : 1), base * gloom * (c.time === 'night' ? 1.25 : c.time === 'dusk' ? 0.85 : 1));
    out.copy(this.ambient);
    for (const f of this.floods) {
      const d = Math.hypot(f.position.x - x, f.position.z - z);
      const reach = 40 * Math.sqrt(f.userData.power);
      const k = Math.max(0, 1 - d / reach) * 0.85 * f.userData.power;
      out.r += k;
      out.g += k * 0.95;
      out.b += k * 0.8;
    }
    const s = this.flash * 1.2;
    out.r = Math.min(1.3, out.r + s);
    out.g = Math.min(1.3, out.g + s);
    out.b = Math.min(1.4, out.b + s * 1.1);
    return out;
  }

  dispose() {
    this.rain?.geometry.dispose();
    this.snow?.geometry.dispose();
  }
}
