/** Patrocinadores ficticios del fútbol de barrio. La sátira empieza en las vallas. */
export interface Sponsor {
  name: string;
  tag: string;
  bg: string;
  fg: string;
}

export const SPONSORS: Sponsor[] = [
  { name: 'BAR MANOLO', tag: 'Tapas desde 1987', bg: '#c8102e', fg: '#ffe9a8' },
  { name: 'TALLERES EL CHISPAS', tag: 'Si suena raro, es normal', bg: '#1f3f8f', fg: '#ffffff' },
  { name: 'PÁDEL CRISTAL', tag: '¡Ven y no vuelvas!', bg: '#00a3a3', fg: '#ffffff' },
  { name: 'INMOBILIARIA PELOTAZO', tag: 'Tu sueño, a 40 años', bg: '#f2b705', fg: '#1d1d1f' },
  { name: 'AUTOESCUELA FRENAZO', tag: 'Aprobado o casi', bg: '#ffffff', fg: '#c8102e' },
  { name: 'CHURROS LA ABUELA', tag: 'Grasa con cariño', bg: '#7a3e12', fg: '#ffd27a' },
];
