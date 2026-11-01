/**
 * La pirámide del fútbol español, de abajo arriba. Los nombres son los genéricos de cada
 * categoría (sin marcas comerciales de patrocinio). `real` describe cómo es de verdad; `size`
 * es el tamaño del grupo que se juega en el juego (en regional se recorta para que la temporada
 * no se haga eterna; desde Tercera Federación, tamaño real).
 */
export type Status = 'amateur' | 'semipro' | 'pro';

export interface Division {
  id: string;
  name: string;
  real: string;
  size: number;
  promote: number;
  relegate: number;
  /** Nivel medio de los equipos (escala de atributos 1–20). */
  level: [number, number];
  status: Status;
  /** Lo que cobra el míster a la semana (0 = no cobra: de ahí la ferretería). */
  salary: number;
}

export const DIVISIONS: Division[] = [
  { id: 'tercera-regional', name: 'Tercera Regional', real: 'Categoría regional · grupos por comarca', size: 6, promote: 2, relegate: 0, level: [10, 12], status: 'amateur', salary: 0 },
  { id: 'segunda-regional', name: 'Segunda Regional', real: 'Categoría regional', size: 8, promote: 2, relegate: 1, level: [11, 13], status: 'amateur', salary: 0 },
  { id: 'primera-regional', name: 'Primera Regional', real: 'Categoría regional', size: 10, promote: 2, relegate: 2, level: [12, 14], status: 'amateur', salary: 40 },
  { id: 'preferente', name: 'Regional Preferente', real: 'Máxima categoría regional', size: 12, promote: 2, relegate: 2, level: [13, 15], status: 'amateur', salary: 80 },
  { id: 'tercera-federacion', name: 'Tercera Federación', real: '≈18 grupos de organización territorial', size: 18, promote: 1, relegate: 3, level: [14, 16], status: 'amateur', salary: 150 },
  { id: 'segunda-federacion', name: 'Segunda Federación', real: '90 equipos · 5 grupos de 18', size: 18, promote: 1, relegate: 4, level: [15, 17], status: 'semipro', salary: 250 },
  { id: 'primera-federacion', name: 'Primera Federación', real: '40 equipos · 2 grupos de 20 · semiprofesional', size: 20, promote: 2, relegate: 4, level: [16, 18], status: 'semipro', salary: 600 },
  { id: 'segunda', name: 'Segunda División', real: '22 equipos · profesional', size: 22, promote: 2, relegate: 4, level: [17, 19], status: 'pro', salary: 2500 },
  { id: 'primera', name: 'Primera División', real: '20 equipos · profesional', size: 20, promote: 0, relegate: 3, level: [18, 20], status: 'pro', salary: 9000 },
];

export const divisionIndex = (id: string) => DIVISIONS.findIndex((d) => d.id === id);
