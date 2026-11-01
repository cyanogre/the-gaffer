import type { Expression, Gender, Kit, Look } from '../content/look';
import { STADIUM_LEVELS, rivalOf, type Career, type Summary } from '../game/career';

/**
 * Novela visual: escenas con personajes, diálogo y decisiones. Cada decisión cambia algo
 * que el juego usa de verdad (dinero, aficionados, confianza, atributos, quién tira los penaltis...).
 */
export type CharId = 'presidente' | 'manolo' | 'padel' | 'goleador' | 'abuela' | 'mister' | 'narrador';

export interface Character {
  name: string;
  role: string;
  look: Look;
  clothes: Kit;
  /** Para jugadores: índice en la plantilla (la cara y el nombre salen de ahí). */
  squadIndex?: number;
}

const civ = (shirt: string, trousers: string, trim = shirt): Kit => ({ shirt, shirt2: shirt, pattern: 'plain', shorts: trousers, socks: trousers, trim });
const look = (o: Partial<Look>): Look => ({
  gender: 'm',
  skin: '#eab68e',
  hair: 'short',
  hairColor: '#3b2a1e',
  facial: 'none',
  body: 'normal',
  height: 1,
  accessory: 'none',
  accColor: '#e23b3b',
  celebration: 'arms',
  boots: '#3a2a22',
  nose: 'small',
  brows: 'thick',
  ...o,
});

export const NPC: Record<Exclude<CharId, 'padel' | 'goleador' | 'narrador'>, Character> = {
  presidente: {
    name: 'Don Ramón',
    role: 'Presidente · Ferretería Ramón',
    look: look({ hair: 'combover', hairColor: '#bfb9b0', facial: 'mustache', accessory: 'glasses', body: 'belly', nose: 'big', skin: '#f6d3b3' }),
    clothes: civ('#7a5236', '#4a4a52', '#e9d9b8'),
  },
  manolo: {
    name: 'Manolo',
    role: 'Dueño del Bar Manolo',
    look: look({ hair: 'bald', facial: 'mustache', body: 'belly', nose: 'hook', skin: '#d39a6a' }),
    clothes: civ('#f2f0ea', '#24242a', '#c8102e'),
  },
  abuela: {
    name: 'La abuela Mari',
    role: 'Aficionada número uno',
    look: look({ gender: 'f', hair: 'bun', hairColor: '#d8d4cc', accessory: 'glasses', body: 'stocky', skin: '#f6d3b3', brows: 'thin' }),
    clothes: civ('#7d55d9', '#3a3a44', '#f2c94c'),
  },
  mister: {
    name: 'Tú',
    role: 'Míster del Atlético Barriobajo',
    look: look({ hair: 'short', hairColor: '#1f1a17', facial: 'stubble', skin: '#eab68e' }),
    clothes: civ('#f0822a', '#1d1d22', '#1d1d22'),
  },
};

export interface VNLine {
  who: CharId;
  expr?: Expression;
  text: string;
}
export interface VNChoice {
  text: string;
  /** Aplica la consecuencia y devuelve la respuesta del personaje. */
  pick: (c: Career) => VNLine[];
  /** Qué cambia (se muestra al elegir, para que la decisión se entienda). */
  effect: string;
}
export type Trigger = 'phone' | 'door' | 'laptop';
export interface VNScene {
  id: string;
  trigger: Trigger;
  week: number;
  title: string;
  lines: (c: Career) => VNLine[];
  choices: VNChoice[];
}

const gx = (g: Gender, m: string, f: string) => (g === 'f' ? f : m);
const PADEL = 6;
const GOLEADOR = 9;
const SAFE_PENALTY = 10;

export const SCENES: VNScene[] = [
  {
    id: 'llamada-presidente',
    trigger: 'phone',
    week: 1,
    title: 'Llamada de Don Ramón',
    lines: (c) => [
      { who: 'narrador', text: 'Suena el teléfono. En la pantalla: «FERRETERÍA RAMÓN». Otra vez.' },
      { who: 'presidente', expr: 'smug', text: '¡Míster! Soy Ramón. De la ferretería. Y presidente, que se me olvida decirlo.' },
      { who: 'presidente', expr: 'neutral', text: `El domingo viene el ${rivalOf(c).name}. La directiva, o sea, mi cuñado y yo, queremos saber qué vamos a ver.` },
    ],
    choices: [
      {
        text: 'Vamos a ganar, presidente. Palabra.',
        effect: 'Promesa: ganar. Si ganas, la confianza sube mucho; si no, se hunde.',
        pick: (c) => {
          c.promise = 'win';
          c.boardTrust = Math.min(100, c.boardTrust + 3);
          return [{ who: 'presidente', expr: 'happy', text: '¡Así me gusta! Se lo digo a mi cuñado. Bueno, se lo grito, que está sordo.' }];
        },
      },
      {
        text: 'Le prometo espectáculo. Goles, en una portería o en la otra.',
        effect: 'Promesa: espectáculo. Si hay 3 goles o más, ganas aficionados y confianza.',
        pick: (c) => {
          c.promise = 'fun';
          return [{ who: 'presidente', expr: 'dreamy', text: 'Espectáculo... Eso vende. Como las bisagras de oferta.' }];
        },
      },
      {
        text: 'Con este campo, bastante es que no se nos rompa nadie un tobillo.',
        effect: 'Sinceridad: −4 de confianza ahora, pero sin promesas que cumplir.',
        pick: (c) => {
          c.promise = 'realist';
          c.boardTrust = Math.max(0, c.boardTrust - 4);
          return [{ who: 'presidente', expr: 'angry', text: 'Ese campo lo allanó mi padre con una carretilla, míster. Con cariño.' }];
        },
      },
    ],
  },
  {
    id: 'visita-padel',
    trigger: 'door',
    week: 1,
    title: 'Llaman a la puerta',
    lines: (c) => [
      { who: 'narrador', text: 'Llaman a la puerta. Al otro lado, alguien con una raqueta de pádel en la mano. Y otra en la mochila.' },
      { who: 'padel', expr: 'sleepy', text: `Míster, una cosita... El sábado hay torneo en Pádel Cristal. ¿Me ${gx(c.gender, 'dejas', 'dejas')} faltar al entreno?` },
    ],
    choices: [
      {
        text: 'Vale, pero el domingo lo das todo.',
        effect: 'Pádel: +5 de trabajo sin balón, −2 de resistencia (llega cansado del torneo).',
        pick: (c) => {
          c.mods[PADEL] = { workRate: 5, stamina: -2 };
          c.modNotes[PADEL] = 'Agradecimiento del torneo de pádel: presiona más, aguanta menos.';
          return [{ who: 'padel', expr: 'happy', text: '¡Gracias, míster! El domingo corro como si hubiera bola de partido.' }];
        },
      },
      {
        text: 'Ni hablar. Primero el fútbol.',
        effect: 'Pádel: −3 de trabajo sin balón y −2 de sangre fría (está de morros).',
        pick: (c) => {
          c.mods[PADEL] = { workRate: -3, composure: -2 };
          c.modNotes[PADEL] = 'Enfadado por no ir al torneo: presiona menos y se precipita.';
          return [{ who: 'padel', expr: 'angry', text: 'Vale. Pues nada. Ya ganaremos el torneo el año que viene. O nunca.' }];
        },
      },
      {
        text: 'Te dejo si consigues pista gratis para el equipo.',
        effect: 'Pádel: +2 de trabajo; el club de pádel os anuncia (+2 aficionados).',
        pick: (c) => {
          c.mods[PADEL] = { workRate: 2 };
          c.modNotes[PADEL] = 'Trato cerrado con Pádel Cristal.';
          c.fans += 2;
          return [{ who: 'padel', expr: 'smug', text: 'Hecho. Y les digo que os pongan en la pizarra de la entrada. Al lado de las clases de zumba.' }];
        },
      },
    ],
  },
  {
    id: 'correo-manolo',
    trigger: 'laptop',
    week: 1,
    title: 'Correo: «PROPUESTA (IMPORTANTE)»',
    lines: () => [
      { who: 'narrador', text: 'Un correo nuevo. Asunto: «PROPUESTA (IMPORTANTE) (LEER)». Remitente: manolo.bar.manolo.1987.' },
      { who: 'manolo', expr: 'smug', text: 'Míster, te propongo un trato: 150 euros por poner MANOLO en la camiseta. Y 25 cada semana.' },
      { who: 'manolo', expr: 'happy', text: 'Solo una cosita: cada gol lo celebráis gritando «¡VIVA EL BAR MANOLO!». Bien alto, que se oiga en la barra.' },
    ],
    choices: [
      {
        text: 'Trato hecho, Manolo.',
        effect: '+150 € y +25 € por semana. Tus jugadores gritarán al marcar.',
        pick: (c) => {
          c.money += 150;
          c.sponsor = 'manolo';
          c.sponsorShout = true;
          return [{ who: 'manolo', expr: 'happy', text: '¡Eso es! Te pongo una caña en la cuenta. La de tapas no, que esa se cobra.' }];
        },
      },
      {
        text: '¿Y si son 175 y lo de gritar lo dejamos?',
        effect: '+175 € y patrocinio, sin gritos. Manolo se queda un poco mosca.',
        pick: (c) => {
          c.money += 175;
          c.sponsor = 'manolo';
          c.flags.manoloMosca = true;
          return [{ who: 'manolo', expr: 'angry', text: 'Qué duro negocias, míster. Vale. Pero la caña te la cobro.' }];
        },
      },
      {
        text: 'Gracias, pero la camiseta no se vende.',
        effect: 'Sin dinero. Manolo no animará el domingo.',
        pick: (c) => {
          c.flags.manoloEnfadado = true;
          return [{ who: 'manolo', expr: 'angry', text: 'Pues muy bien. Muy bien. El domingo, el bocadillo de calamares a precio de turista.' }];
        },
      },
    ],
  },
  {
    id: 'penaltis',
    trigger: 'door',
    week: 2,
    title: 'Visita inesperada',
    lines: (c) => [
      { who: 'narrador', text: 'Otra vez la puerta. Una cresta pelirroja asoma por la mirilla.' },
      { who: 'goleador', expr: 'smug', text: `Míster, quiero tirar los penaltis. Soy ${gx(c.gender, 'un goleador nato', 'una goleadora nata')}. Lo pone en mi Instagram.` },
    ],
    choices: [
      {
        text: 'Son tuyos. Confío en ti.',
        effect: `Penaltis para el 9. Su sangre fría sube +3 esta semana.`,
        pick: (c) => {
          c.penaltyTaker = GOLEADOR;
          c.mods[GOLEADOR] = { composure: 3 };
          c.modNotes[GOLEADOR] = 'Tira los penaltis y está crecido.';
          return [{ who: 'goleador', expr: 'happy', text: '¡No te vas a arrepentir! Bueno, igual un poco. Pero poco.' }];
        },
      },
      {
        text: 'Los tira el 11, que no falla.',
        effect: 'Penaltis para el 11. El 9 se pica: −2 de sangre fría.',
        pick: (c) => {
          c.penaltyTaker = SAFE_PENALTY;
          c.mods[GOLEADOR] = { composure: -2 };
          c.modNotes[GOLEADOR] = 'Picado porque no tira los penaltis.';
          return [{ who: 'goleador', expr: 'angry', text: 'El 11. Vale. Pues que marque también los de jugada, a ver.' }];
        },
      },
    ],
  },
];

export function pendingScenes(c: Career) {
  return SCENES.filter((s) => s.week <= c.week && !c.seen.includes(s.id));
}

/** Escena posterior al partido: el presidente reacciona según el resultado y lo prometido. */
export function postMatchScene(c: Career, s: Summary, score: [number, number]): VNLine[] {
  const [g, a] = score;
  const lines: VNLine[] = [];
  if (s.result === 'win') lines.push({ who: 'presidente', expr: 'happy', text: `¡${g}-${a}! ¡Míster, eso es fútbol! Mañana le hago descuento en tacos a toda la plantilla.` });
  else if (s.result === 'draw') lines.push({ who: 'presidente', expr: 'neutral', text: `${g}-${a}. Ni fu ni fa. Como mi cuñado.` });
  else lines.push({ who: 'presidente', expr: 'angry', text: `${g}-${a}... Míster, en la ferretería las cosas que no funcionan se devuelven.` });
  const next = STADIUM_LEVELS[c.stadiumLevel + 1];
  if (next && c.money >= next.cost) lines.push({ who: 'presidente', expr: 'dreamy', text: `Por cierto, con lo que hay en caja podríamos hacer obras: ${next.name}. Mírelo en el portátil.` });
  return lines;
}
