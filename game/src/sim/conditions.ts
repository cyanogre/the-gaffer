/**
 * Condiciones del partido: estado del campo y meteorología. No son decorado: cambian el bote
 * del balón, los controles, los resbalones, la deriva de los balones aéreos y el cansancio.
 */
export type Weather = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'snow';
export type TimeOfDay = 'day' | 'dusk' | 'night';

export interface MatchConditions {
  weather: Weather;
  time: TimeOfDay;
  /** Calidad del terreno: 0 = tierra con piedras, 1 = césped perfecto. */
  pitch: number;
  /** Intensidad de lluvia o nieve (0–1). */
  precip: number;
  /** Viento en m/s (componentes x, y del mundo). */
  windX: number;
  windY: number;
}

export const DEFAULT_CONDITIONS: MatchConditions = { weather: 'clear', time: 'dusk', pitch: 0.25, precip: 0, windX: 0, windY: 0 };

export function conditionsFor(weather: Weather, time: TimeOfDay, pitch: number, seed = 1): MatchConditions {
  const precip = weather === 'rain' ? 0.55 : weather === 'storm' ? 1 : weather === 'snow' ? 0.6 : 0;
  const windSpeed = weather === 'storm' ? 9 : weather === 'rain' ? 4 : weather === 'snow' ? 3 : weather === 'cloudy' ? 2.5 : 1;
  const a = (seed * 2.399) % (Math.PI * 2);
  return { weather, time, pitch, precip, windX: Math.cos(a) * windSpeed, windY: Math.sin(a) * windSpeed };
}

/** Modificadores físicos derivados (los usa el motor en cada tick). */
export function physicsOf(c: MatchConditions) {
  const wet = c.weather === 'snow' ? 0 : c.precip;
  const mud = wet * (1 - c.pitch);
  return {
    /** Rozamiento del balón rodando: el barro frena, el césped mojado hace patinar. */
    roll: 1 + (1 - c.pitch) * 0.35 + mud * 0.6 - wet * c.pitch * 0.25 + (c.weather === 'snow' ? 0.5 : 0),
    /** Probabilidad de bote raro por segundo con el balón por el suelo. */
    bobble: (1 - c.pitch) * 0.55,
    /** Penalización a controles e intercepciones. */
    control: (1 - c.pitch) * 0.1 + wet * 0.08 + (c.weather === 'snow' ? 0.06 : 0),
    /** Multiplicador del error de pases y tiros. */
    error: 1 + wet * 0.3 + (1 - c.pitch) * 0.25 + (c.weather === 'fog' ? 0.15 : 0),
    /** Probabilidad extra de resbalar al entrar. */
    slip: wet * 0.12 + (c.weather === 'snow' ? 0.08 : 0),
    /** Multiplicador de cansancio (terreno pesado). */
    fatigue: 1 + mud * 0.35 + (c.weather === 'snow' ? 0.2 : 0),
    /** El balón mojado se escurre de las manos del portero. */
    gripLoss: wet * 0.35,
    /** Visibilidad: con niebla los jugadores ven menos pases largos. */
    vision: c.weather === 'fog' ? 0.65 : 1,
  };
}
