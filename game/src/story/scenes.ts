import type { Expression, Gender, Kit, Look } from '../content/look';
import { DIVISIONS } from '../content/divisions';
import { SQUAD_INDEX } from '../content/teams';
import { STADIUM_LEVELS, division, leagueName, rivalOf, setLeagueGender, type Career, type LocationId, type StatId } from '../game/career';
import { standings, teamOf } from '../game/league';
import { changeMorale } from '../game/morale';
import { nextSeason, type SeasonEnd, type Summary } from '../game/week';

/**
 * Historia: escenas de novela visual. Aparecen en un sitio, un día y una semana concretos (o cuando
 * se cumple una condición). Cada decisión cambia algo que el juego usa de verdad.
 */
export type CharId = 'presidente' | 'manolo' | 'padel' | 'goleador' | 'abuela' | 'mister' | 'rivalMister' | 'jefa' | 'jugador' | 'narrador';

export interface Character {
  name: string;
  role: string;
  look: Look;
  clothes: Kit;
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

export const NPC: Record<'presidente' | 'manolo' | 'abuela' | 'rivalMister' | 'jefa', Character> = {
  jefa: {
    name: 'Doña Encarna',
    role: 'Jefa de departamento · Seguros Sólidos S.A.',
    look: look({ gender: 'f', hair: 'bun', hairColor: '#6b4428', accessory: 'glasses', accColor: '#1d1d22', nose: 'big', skin: '#f6d3b3', brows: 'thin' }),
    clothes: civ('#4a4f6a', '#2a2d34', '#e9e4d8'),
  },
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
  rivalMister: {
    name: 'Tito Ascensor',
    role: 'Míster de la Peña Ascensor',
    look: look({ hair: 'long', hairColor: '#1f1a17', facial: 'goatee', accessory: 'glasses', accColor: '#1d1d22', nose: 'hook', skin: '#d39a6a' }),
    clothes: civ('#1d1d22', '#1d1d22', '#f2c94c'),
  },
};

/** El míster eres tú: su aspecto depende de lo que elegiste al empezar. */
export function coachCharacter(g: Gender, name: string): Character {
  return g === 'f'
    ? { name, role: 'Míster del Atlético Barriobajo', look: look({ gender: 'f', hair: 'ponytail', hairColor: '#1f1a17', skin: '#eab68e', brows: 'thin' }), clothes: civ('#f0822a', '#1d1d22', '#1d1d22') }
    : { name, role: 'Míster del Atlético Barriobajo', look: look({ hair: 'short', hairColor: '#1f1a17', facial: 'stubble', skin: '#eab68e' }), clothes: civ('#f0822a', '#1d1d22', '#1d1d22') };
}

export interface VNLine {
  who: CharId;
  /** Para `jugador`: índice en la plantilla. */
  idx?: number;
  expr?: Expression;
  text: string;
}
export interface VNChoice {
  /** Lo que dice el míster. Las consecuencias no se anuncian: se ven después (moral con su motivo, caja, cartera...). */
  text: string;
  /** Opción que pide una estadística mínima del míster. */
  req?: { stat: StatId; lv: number };
  /** Aplica la consecuencia y devuelve la respuesta del personaje. */
  pick: (c: Career) => VNLine[];
}
export interface VNScene {
  id: string;
  where: LocationId;
  /** Objeto del escenario que la dispara (teléfono, puerta...). Sin objeto, salta al llegar. */
  hotspot?: string;
  badge?: string;
  /** Semana (0 = cualquiera, si se cumple la condición). */
  week: number;
  /** Puede saltar el domingo antes del partido (el estreno del míster). */
  sunday?: boolean;
  /** A partir de qué día de la semana. */
  day?: number;
  cond?: (c: Career) => boolean;
  title: string;
  lines: (c: Career) => VNLine[];
  choices: VNChoice[];
}

const gx = (g: Gender, m: string, f: string) => (g === 'f' ? f : m);
const pid = (c: Career, k: keyof typeof SQUAD_INDEX) => c.squad[SQUAD_INDEX[k]].id;
const nick = (c: Career, k: keyof typeof SQUAD_INDEX) => {
  const p = c.squad[SQUAD_INDEX[k]];
  return p.name.split(' ')[0];
};
/** Las decisiones no tocan atributos: cambian la moral (con su motivo) o algo concreto del club. */
const morale = (c: Career, id: string, delta: number, reason: string) => changeMorale(c, id, delta, reason);

const barrio = (c: Career) => c.club.id === 'barrio' && c.status === 'playing';

export const SCENES: VNScene[] = [
  {
    id: 'prologo',
    where: 'casa',
    week: 1,
    cond: (c) => c.status === 'prologue',
    title: 'Prólogo',
    lines: (c) => [
      { who: 'narrador', text: 'Seguros Sólidos S.A. Planta cuarta. Doce años rellenando la misma hoja de cálculo.' },
      { who: 'jefa', expr: 'neutral', text: `${c.coach.name}, pase a mi despacho. Traiga una caja. De cartón. Grande.` },
      { who: 'jefa', expr: 'smug', text: 'La empresa ha decidido apostar por la eficiencia. Y usted, con todo el cariño, no es eficiente. Es más bien... decorativ' + gx(c.coach.gender, 'o', 'a') + '.' },
      { who: 'narrador', text: 'Sales a la calle con una caja: una grapadora, una planta mustia y una foto tuya con ocho años y una camiseta del equipo del barrio. Tu sueño era el fútbol.' },
      { who: 'narrador', text: 'Esa noche, en la puerta del Bar Manolo, dos carteles. Uno: «SE BUSCA MÍSTER PARA LOS CHAVALES DEL ATLÉTICO BARRIOBAJO. TERCERA REGIONAL. NO SE PAGA, PERO SE QUIERE». El otro, igual, pero de las chavalas.' },
      { who: 'narrador', text: 'Será a tiempo parcial. Sin sueldo. Con un campo de tierra. Pero será fútbol. ¿Qué cartel arrancas?' },
    ],
    choices: [
      {
        text: 'El del Atlético Barriobajo (masculino).',
        pick: (c) => {
          setLeagueGender(c, 'm');
          return [{ who: 'narrador', text: 'Llamas al número del cartel. Contesta una voz con ruido de taladro de fondo.' }];
        },
      },
      {
        text: 'El del Atlético Barriobajo Femenino.',
        pick: (c) => {
          setLeagueGender(c, 'f');
          return [{ who: 'narrador', text: 'Llamas al número del cartel. Contesta una voz con ruido de taladro de fondo.' }];
        },
      },
    ],
  },
  {
    id: 'intro',
    where: 'campo',
    week: 1,
    sunday: true,
    cond: barrio,
    title: 'Hoy hay partido',
    lines: (c) => [
      { who: 'narrador', text: 'A la mañana siguiente te despierta el teléfono. «¿Míster? ¿No ha leído la letra pequeña del cartel? ¡El primer partido es HOY!» Diez minutos después estás en El Barrizal.' },
      { who: 'presidente', expr: 'happy', text: `¡Bienvenid${gx(c.coach.gender, 'o', 'a')}, míster! Ramón, de la ferretería. Y presidente. Este es el club más grande del barrio. Bueno, el único.` },
      { who: 'presidente', expr: 'neutral', text: `Jugamos en ${leagueName(c)}, la última categoría. Seis equipos, diez jornadas. Entrenamos martes y jueves por la tarde; los domingos, partido. Como hoy.` },
      { who: 'presidente', expr: 'smug', text: `Son ${gx(c.gender, 'críos', 'crías')}, sí: ${gx(c.gender, 'el mayor', 'la mayor')} tiene dieciséis años. Juegan contra adultos con permiso federativo. El permiso lo firmó mi cuñado.` },
      { who: 'presidente', expr: 'angry', text: `El míster de antes dejó el once hecho y se fue a vivir a Benidorm. Revíselo, que tenía sus manías: puso a su ${gx(c.gender, 'sobrino', 'sobrina')} de defensa, y ${gx(c.gender, 'el chaval es delantero', 'la chavala es delantera')}.` },
      { who: 'presidente', expr: 'dreamy', text: 'Ah, y le dejo el piso de encima de la ferretería. Si le faltan perras para el alquiler, abajo siempre hay turnos. Se cobra poco, pero se aprende mucho de llaves.' },
    ],
    choices: [
      {
        text: 'Cuente conmigo, presidente.',
        pick: () => {
          return [{ who: 'presidente', expr: 'happy', text: '¡Así me gusta! Le dejo, que tengo una señora esperando con un grifo.' }];
        },
      },
      {
        text: '¿Y no habría un adelanto? Por lo del alquiler...',
        pick: (c) => {
          c.coach.wallet += 30;
          c.flags.adelanto = true;
          return [{ who: 'presidente', expr: 'angry', text: 'Un adelanto... Tome, treinta euros. Me los descuenta en tornillos.' }];
        },
      },
    ],
  },
  {
    id: 'presentacion',
    where: 'campo',
    week: 1,
    sunday: true,
    cond: (c) => barrio(c) && !c.flags.metSquad,
    title: 'Tus chavales',
    lines: (c) => {
      const I = SQUAD_INDEX;
      const nm = (k: keyof typeof SQUAD_INDEX) => nick(c, k);
      const f = c.gender === 'f';
      return [
        { who: 'narrador', text: `En la banda te esperan quince ${gx(c.gender, 'críos', 'crías')} con petos de colores distintos y el partido a punto de empezar. ${gx(c.gender, 'El mayor', 'La mayor')} tiene dieciséis años; ${gx(c.gender, 'el más bajito', 'la más bajita')}, catorce y una gorra dos tallas más grande.` },
        { who: 'jugador', idx: I.portero, expr: 'happy', text: `Soy ${nm('portero')}, ${gx(c.gender, 'el portero', 'la portera')}. Llevo en el club desde los cuatro años. Si me la tiran alta, avisad antes.` },
        { who: 'jugador', idx: I.goleador, expr: 'smug', text: `${nm('goleador')}. ${f ? 'Goleadora nata' : 'Goleador nato'}: lo pone en mi Instagram. Llevo ${c.squad[I.goleador].drought} partidos sin marcar, pero eso es estadística.` },
        { who: 'jugador', idx: I.firuletas, expr: 'smug', text: '¿Puedes salir menos en mis vídeos, míster? Me tapas el regate.' },
        { who: 'jugador', idx: I.padel, expr: 'sleepy', text: '¿Esto acaba antes de las nueve? Es que tengo pádel.' },
        { who: 'jugador', idx: I.profesor, expr: 'dreamy', text: 'He visto un pase que no ha visto nadie. Todavía no sé si existe.' },
        { who: 'jugador', idx: I.nervioso, expr: 'nervous', text: `H-hola, míster. ${f ? 'Encantada' : 'Encantado'}. Perdón. Hola.` },
        { who: 'jugador', idx: I.lenero, expr: 'angry', text: 'Yo defiendo. A veces el balón y a veces las piernas. Depende del día.' },
        { who: 'jugador', idx: I.penaltiSeguro, expr: 'dramatic', text: '(Se cae al ir a saludarte. Se levanta. Hace una reverencia.) Teatro, los jueves.' },
        { who: 'narrador', text: 'Ya los conoces: sus manías y rasgos salen en su ficha (Club → Plantilla). ¿Qué les dices?' },
      ];
    },
    choices: [
      {
        text: '«Aquí se viene a disfrutar. Y a aprender.»',
        pick: (c) => {
          c.flags.metSquad = true;
          for (const p of c.squad) morale(c, p.id, p.traits.includes('nervioso') ? 8 : 4, 'Primer día: el míster les quitó presión');
          return [{ who: 'jugador', idx: SQUAD_INDEX.goleador, expr: 'happy', text: '¡Disfrutar marcando! Bueno, primero disfrutar.' }];
        },
      },
      {
        text: '«Vamos a ganar la liga. Empieza hoy.»',
        pick: (c) => {
          c.flags.metSquad = true;
          for (const p of c.squad) {
            const amb = p.traits.some((t) => t === 'goleadorNato' || t === 'egoista' || t === 'pulmon' || t === 'lenero');
            if (p.traits.includes('nervioso')) morale(c, p.id, -5, 'Primer día: el míster habló de ganar la liga (presión)');
            else morale(c, p.id, amb ? 7 : 2, 'Primer día: el míster habló de ganar la liga');
          }
          return [{ who: 'jugador', idx: SQUAD_INDEX.portero, expr: 'happy', text: '¡La liga! Mi madre va a flipar.' }];
        },
      },
      {
        text: '«¿Quién ha traído los balones?»',
        pick: (c) => {
          c.flags.metSquad = true;
          c.fans += 1;
          return [{ who: 'abuela', expr: 'happy', text: 'Los tenía en el trastero desde 1998. Están un poco blandos, pero ruedan.' }];
        },
      },
    ],
  },
  {
    id: 'llamada-presidente',
    cond: barrio,
    where: 'casa',
    hotspot: 'phone',
    badge: '¡Suena!',
    week: 2,
    day: 1,
    title: 'Llamada de Don Ramón',
    lines: (c) => [
      { who: 'narrador', text: 'Suena el teléfono. En la pantalla: «FERRETERÍA RAMÓN». Otra vez.' },
      { who: 'presidente', expr: 'smug', text: `¡Míster! El domingo viene el ${rivalOf(c).name}. Mi cuñado quiere saber qué vamos a ver.` },
    ],
    choices: [
      {
        text: 'Vamos a ganar, presidente. Palabra.',
        pick: (c) => {
          c.promise = 'win';
          return [{ who: 'presidente', expr: 'happy', text: '¡Así me gusta! Se lo digo a mi cuñado. Bueno, se lo grito, que está sordo.' }];
        },
      },
      {
        text: 'Le prometo espectáculo. Goles, en una portería o en la otra.',
        pick: (c) => {
          c.promise = 'fun';
          return [{ who: 'presidente', expr: 'dreamy', text: 'Espectáculo... Eso vende. Como las bisagras de oferta. Tres goles para arriba, ¿eh? Entre los dos equipos me vale.' }];
        },
      },
      {
        text: 'Con este campo, bastante es que no se nos rompa nadie un tobillo.',
        pick: (c) => {
          c.promise = 'realist';
          return [{ who: 'presidente', expr: 'angry', text: 'Ese campo lo allanó mi padre con una carretilla, míster. Con cariño.' }];
        },
      },
    ],
  },
  {
    id: 'visita-padel',
    cond: barrio,
    where: 'casa',
    hotspot: 'door',
    badge: '¡Llaman!',
    week: 2,
    day: 2,
    title: 'Llaman a la puerta',
    lines: (c) => [
      { who: 'narrador', text: 'Llaman a la puerta. Al otro lado, alguien con una raqueta de pádel en la mano. Y otra en la mochila.' },
      { who: 'padel', expr: 'sleepy', text: `${gx(c.coach.gender, 'Míster', 'Míster')}, una cosita... El jueves hay torneo en Pádel Cristal. ¿Me dejas faltar al entreno?` },
    ],
    choices: [
      {
        text: 'Vale, pero el domingo lo das todo.',
        pick: (c) => {
          c.absent[pid(c, 'padel')] = true;
          morale(c, pid(c, 'padel'), 9, 'Le dejaste ir al torneo de pádel');
          return [{ who: 'padel', expr: 'happy', text: '¡Gracias! El domingo corro como si hubiera bola de partido.' }];
        },
      },
      {
        text: 'Ni hablar. Primero el fútbol.',
        pick: (c) => {
          morale(c, pid(c, 'padel'), -9, 'No le dejaste ir al torneo de pádel');
          return [{ who: 'padel', expr: 'angry', text: 'Vale. Pues nada. Ya ganaremos el torneo el año que viene. O nunca.' }];
        },
      },
      {
        text: 'Ve, pero el miércoles te quedas una hora más a recuperar.',
        req: { stat: 'labia', lv: 2 },
        pick: (c) => {
          // no se pierde el entreno: lo recupera el miércoles
          morale(c, pid(c, 'padel'), 7, 'Le dejaste ir al torneo a cambio de recuperar el entreno');
          return [{ who: 'padel', expr: 'happy', text: '¡Trato! El miércoles me quedo. Y traigo los conos, que sé dónde los guarda el utillero.' }];
        },
      },
    ],
  },
  {
    id: 'correo-manolo',
    cond: barrio,
    where: 'casa',
    hotspot: 'laptop',
    badge: '1 correo',
    week: 2,
    title: 'Correo: «PROPUESTA (IMPORTANTE)»',
    lines: () => [
      { who: 'narrador', text: 'Un correo nuevo. Asunto: «PROPUESTA (IMPORTANTE) (LEER)». Remitente: manolo.bar.manolo.1987.' },
      { who: 'manolo', expr: 'smug', text: 'Míster, te propongo un trato: 150 euros para el club por poner MANOLO en la camiseta. Y 25 cada semana.' },
      { who: 'manolo', expr: 'happy', text: 'Solo una cosita: cada gol lo celebráis gritando «¡VIVA EL BAR MANOLO!». Bien alto, que se oiga en la barra.' },
    ],
    choices: [
      {
        text: 'Trato hecho, Manolo.',
        pick: (c) => {
          c.money += 150;
          c.sponsor = 'manolo';
          c.sponsorShout = true;
          return [{ who: 'manolo', expr: 'happy', text: '¡Eso es! Te pongo una caña en la cuenta. La de tapas no, que esa se cobra.' }];
        },
      },
      {
        text: '¿Y si son 200 y lo de gritar lo dejamos?',
        req: { stat: 'labia', lv: 2 },
        pick: (c) => {
          c.money += 200;
          c.sponsor = 'manolo';
          c.flags.manoloMosca = true;
          return [{ who: 'manolo', expr: 'angry', text: 'Qué duro negocias, míster. Vale. Pero la caña te la cobro.' }];
        },
      },
      {
        text: 'Gracias, pero la camiseta no se vende.',
        pick: (c) => {
          c.flags.manoloEnfadado = true;
          return [{ who: 'manolo', expr: 'angry', text: 'Pues muy bien. Muy bien. El domingo, el bocadillo de calamares a precio de turista.' }];
        },
      },
    ],
  },
  {
    id: 'penaltis',
    cond: barrio,
    where: 'casa',
    hotspot: 'door',
    badge: '¡Llaman!',
    week: 3,
    day: 1,
    title: 'Visita inesperada',
    lines: (c) => [
      { who: 'narrador', text: 'Otra vez la puerta. Un tupé pelirrojo, con medio bote de gomina, asoma por la mirilla.' },
      { who: 'goleador', expr: 'smug', text: `Míster, quiero tirar los penaltis. Soy ${gx(c.gender, 'un goleador nato', 'una goleadora nata')}. Lo pone en mi Instagram.` },
    ],
    choices: [
      {
        text: 'Son tuyos. Confío en ti.',
        pick: (c) => {
          c.penaltyTaker = pid(c, 'goleador');
          morale(c, pid(c, 'goleador'), 8, 'Le diste los penaltis');
          return [{ who: 'goleador', expr: 'happy', text: '¡No te vas a arrepentir! Bueno, igual un poco. Pero poco.' }];
        },
      },
      {
        text: 'Los tira el 11, que no falla.',
        pick: (c) => {
          c.penaltyTaker = pid(c, 'penaltiSeguro');
          morale(c, pid(c, 'goleador'), -8, 'No le dejaste tirar los penaltis');
          morale(c, pid(c, 'penaltiSeguro'), 4, 'Le diste los penaltis');
          return [{ who: 'goleador', expr: 'angry', text: 'El 11. Vale. Pues que marque también los de jugada, a ver.' }];
        },
      },
    ],
  },
  {
    id: 'bar-goleador',
    where: 'bar',
    week: 4,
    cond: (c) => barrio(c) && (c.squad[SQUAD_INDEX.goleador].drought ?? 0) >= 3,
    title: 'Penas en la barra',
    lines: (c) => [
      { who: 'narrador', text: `En una esquina del bar, ${nick(c, 'goleador')} mira fijamente un zumo de melocotón.` },
      { who: 'goleador', expr: 'sleepy', text: `${c.squad[SQUAD_INDEX.goleador].drought} partidos sin marcar, míster. Mi madre ya me pregunta si me he cambiado de puesto.` },
      { who: 'manolo', expr: 'neutral', text: 'Lleva ahí desde las cinco. Ni ha probado las bravas. Eso es grave.' },
    ],
    choices: [
      {
        text: 'Los goles llegarán. Sigue rematando.',
        pick: (c) => {
          morale(c, pid(c, 'goleador'), 7, 'El míster le arropó en el bar');
          return [{ who: 'goleador', expr: 'happy', text: 'Tienes razón. Soy un depredador. Un depredador con mala suerte, pero depredador.' }];
        },
      },
      {
        text: 'Quizá te venga bien una semana en el banquillo.',
        pick: (c) => {
          c.flags.goleadorAvisado = true;
          morale(c, pid(c, 'goleador'), -6, 'El míster le dijo que se juega el puesto');
          return [{ who: 'goleador', expr: 'angry', text: '¿Banquillo? ¿A mí? Vale. Vale, vale. Ya verás el domingo.' }];
        },
      },
      {
        text: 'Manolo, ponle unas bravas. Invito yo.',
        pick: (c) => {
          c.coach.wallet -= 6;
          morale(c, pid(c, 'goleador'), 6, 'El míster le invitó a unas bravas');
          return [{ who: 'manolo', expr: 'happy', text: 'Bravas para el chaval. Que las penas con patatas son menos.' }];
        },
      },
    ],
  },
  {
    id: 'abuela-pancarta',
    cond: barrio,
    where: 'campo',
    week: 5,
    title: 'Un proyecto textil',
    lines: () => [
      { who: 'narrador', text: 'Junto a la valla, la abuela Mari despliega una sábana enorme. Pone «BARRIOBAJO» con una B al revés.' },
      { who: 'abuela', expr: 'happy', text: 'Míster, quiero hacer una pancarta como Dios manda. Que se vea desde la autovía. Solo necesito tela y pintura: treinta euros, y la pinto yo.' },
    ],
    choices: [
      {
        text: 'Adelante, abuela. El club paga.',
        pick: (c) => {
          c.money -= 30;
          c.fans += 4;
          c.flags.pancarta = true;
          return [{ who: 'abuela', expr: 'happy', text: '¡Ay, qué alegría! Le pongo su nombre en una esquinita. Pequeñito.' }];
        },
      },
      {
        text: 'La de la B al revés tiene su encanto.',
        pick: (c) => {
          c.fans += 1;
          return [{ who: 'abuela', expr: 'smug', text: 'Eso digo yo. Es estilo. Como Picasso.' }];
        },
      },
    ],
  },
  {
    id: 'ramon-obras',
    where: 'ferreteria',
    week: 0,
    cond: (c) => barrio(c) && c.stadiumLevel === 0 && c.money >= STADIUM_LEVELS[1].cost,
    title: 'Planos en la trastienda',
    lines: () => [
      { who: 'narrador', text: 'Don Ramón tiene unos planos extendidos sobre el mostrador. Sujetos con cuatro latas de pintura.' },
      { who: 'presidente', expr: 'dreamy', text: `Míster, con lo que hay en caja podríamos hacer obras: césped, redes, una gradilla y focos. Un municipal de verdad. ${STADIUM_LEVELS[1].cost} euros.` },
    ],
    choices: [
      {
        text: '¡Hagámoslo!',
        pick: (c) => {
          c.money -= STADIUM_LEVELS[1].cost;
          c.stadiumLevel = 1;
          return [{ who: 'presidente', expr: 'happy', text: '¡Mañana mismo llamo a mi primo el de los jardines! Y a mi otro primo el de los focos.' }];
        },
      },
      {
        text: 'Mejor esperar. Quizá hace falta material de entrenamiento antes.',
        pick: () => [{ who: 'presidente', expr: 'neutral', text: 'Usted manda. Los planos se quedan aquí, cogiendo polvo con cariño. Cuando quiera, se hacen desde la caja del club.' }],
      },
    ],
  },
  {
    id: 'rival-chulo',
    where: 'casa',
    hotspot: 'phone',
    badge: '¡Suena!',
    week: 0,
    day: 1,
    cond: (c) => barrio(c) && rivalOf(c).id === 'ascensor',
    title: 'Número desconocido',
    lines: () => [
      { who: 'narrador', text: 'Número oculto. Al descolgar se oye un ascensor. Literalmente: la musiquita.' },
      { who: 'rivalMister', expr: 'smug', text: 'Hola, soy Tito, de la Peña Ascensor. Te llamo para que no te pille de sorpresa: el domingo os metemos cinco.' },
    ],
    choices: [
      {
        text: 'Cuelgas sin decir nada.',
        pick: (c) => {
          for (const id of c.lineup) morale(c, id, 4, 'Picados por la llamada del míster rival');
          return [{ who: 'narrador', text: 'El grupo de WhatsApp del equipo arde. Alguien pone un gif de un león.' }];
        },
      },
      {
        text: '«¿Cinco? Con ese ascensor no llegáis ni al segundo.»',
        req: { stat: 'labia', lv: 3 },
        pick: (c) => {
          for (const p of c.squad) morale(c, p.id, 6, 'El míster le ganó el duelo dialéctico al rival');
          c.fans += 3;
          return [{ who: 'rivalMister', expr: 'angry', text: '¿Qué...? Eso... Eso no tiene gracia. ¡Ya hablaremos el domingo!' }];
        },
      },
      {
        text: '«Puede ser. Sois los favoritos.»',
        pick: (c) => {
          for (const p of c.squad) {
            if (p.traits.includes('nervioso')) morale(c, p.id, 4, 'Sin presión: el rival es favorito');
            else if (p.traits.some((t) => t === 'goleadorNato' || t === 'egoista' || t === 'lenero')) morale(c, p.id, -4, 'El míster dio el partido por perdido');
          }
          return [{ who: 'rivalMister', expr: 'happy', text: 'Hombre, al menos eres realista. Me gusta. El domingo os tratamos con cariño.' }];
        },
      },
    ],
  },
];

/** Escenas que esperan en este sitio (o en cualquiera, si `where` no se pasa). */
export function pendingScenes(c: Career, where?: LocationId) {
  return SCENES.filter(
    (s) =>
      (where === undefined || s.where === where) &&
      (s.week === 0 || s.week === c.week) &&
      (s.day ?? 0) <= c.day &&
      (c.day < 6 || !!s.sunday) &&
      !c.seen.includes(s.id) &&
      (s.cond?.(c) ?? true),
  );
}

/** Escena que salta sola al llegar al sitio (sin objeto que tocar). */
export const autoScene = (c: Career, where: LocationId) => pendingScenes(c, where).find((s) => !s.hotspot);
export const hotspotScene = (c: Career, where: LocationId, hotspot: string) => pendingScenes(c, where).find((s) => s.hotspot === hotspot);

export function choiceLocked(c: Career, ch: VNChoice) {
  return ch.req && c.coach.stats[ch.req.stat].lv < ch.req.lv ? ch.req : null;
}

/** El presidente reacciona según el resultado y lo prometido. */
export function postMatchScene(c: Career, s: Summary, score: [number, number]): VNLine[] {
  const [g, a] = score;
  const lines: VNLine[] = [];
  if (s.result === 'win') lines.push({ who: 'presidente', expr: 'happy', text: `¡${g}-${a}! ¡Míster, eso es fútbol! Mañana le hago descuento en tacos a toda la plantilla.` });
  else if (s.result === 'draw') lines.push({ who: 'presidente', expr: 'neutral', text: `${g}-${a}. Ni fu ni fa. Como mi cuñado.` });
  else lines.push({ who: 'presidente', expr: 'angry', text: `${g}-${a}... Míster, en la ferretería las cosas que no funcionan se devuelven.` });
  if (c.boardTrust < 25 && c.status === 'playing') lines.push({ who: 'presidente', expr: 'angry', text: 'Se lo digo claro: mi cuñado ya ha preguntado por su número de teléfono. El de usted no, el del entrenador del Polígono.' });
  return lines;
}

/** Final de temporada: título, ascenso, oferta de un club grande... y la decisión. */
export function seasonEndStory(c: Career, se: SeasonEnd): { lines: VNLine[]; choices: VNChoice[] } {
  const champ = teamOf(c.league, standings(c.league)[0].id).name;
  const d = division(c);
  const next = DIVISIONS[Math.min(DIVISIONS.length - 1, c.division + 1)];
  const isBarrio = c.club.id === 'barrio';
  const lines: VNLine[] = [];
  if (se.champion) {
    lines.push({ who: 'narrador', text: `Última jornada. ¡${c.club.name} campeón de ${leagueName(c)}! ${isBarrio ? 'El Bar Manolo se queda sin cerveza a las nueve y cuarto.' : 'La ciudad sale a la calle.'}` });
    if (isBarrio) {
      lines.push({ who: 'presidente', expr: 'happy', text: `¡CAMPEONES, míster! ¡A ${next.name}! Mi cuñado está llorando. Bueno, siempre llora, pero hoy de alegría.` });
      lines.push({ who: 'abuela', expr: 'happy', text: 'Cuarenta años viniendo al Barrizal y nunca había visto esto. Ahora ya me puedo morir tranquila. Pero después de la temporada que viene.' });
    }
  } else if (se.promoted) lines.push({ who: 'narrador', text: `Fin de temporada: ${se.position}º. Campeón: ${champ}. ¡Pero el ${c.club.short} sube a ${next.name}!` });
  else if (se.relegated) lines.push({ who: 'narrador', text: `Fin de temporada: ${se.position}º. Descenso. Campeón: ${champ}.` });
  else lines.push({ who: 'narrador', text: `Fin de temporada: ${se.position}º en ${leagueName(c)}. Campeón: ${champ}.` });
  if (!se.champion && isBarrio && c.division === 0) lines.push({ who: 'presidente', expr: 'neutral', text: 'No hemos sido campeones, míster. Le doy otra temporada porque me cae bien. Y porque nadie más quiere el puesto.' });

  const choices: VNChoice[] = [];
  if (se.offer) {
    const o = se.offer;
    lines.push({ who: 'narrador', text: `Al día siguiente suena el teléfono. Es el director deportivo del ${o.name}, de Segunda Federación: «Hemos visto lo que ha hecho con ese equipo. Queremos que nos entrene. Con sueldo: ${DIVISIONS.find((x) => x.id === 'segunda-federacion')!.salary} euros a la semana.»` });
    lines.push({ who: 'narrador', text: 'Un club semiprofesional, un estadio de verdad, una plantilla que no conoces. O seguir con los tuyos y subir con ellos, categoría a categoría, hasta donde lleguen.' });
    choices.push(
      {
        text: `Aceptar: entrenar al ${o.name}.`,
        pick: (cc) => {
          nextSeason(cc, se, true);
          return [{ who: 'presidente', expr: 'sleepy', text: 'Lo entiendo, míster. Los sueños son los sueños. Aquí tiene su casa. Y su ferretería.' }];
        },
      },
      {
        text: 'Quedarme con los míos y subir con ellos.',
        pick: (cc) => {
          nextSeason(cc, se, false);
          return [{ who: 'presidente', expr: 'happy', text: '¡Lo sabía! Esto hay que celebrarlo. Manolo, ¡pon algo! Y apúntalo en la cuenta del club.' }];
        },
      },
    );
  } else {
    const where = se.promoted ? next.name : se.relegated ? DIVISIONS[Math.max(0, c.division - 1)].name : d.name;
    choices.push({
      text: 'A por la siguiente temporada.',
      pick: (cc) => {
        nextSeason(cc, se, false);
        return [{ who: 'narrador', text: `Pretemporada en ${where}. Mismo barrio, mismas ganas.` }];
      },
    });
  }
  return { lines, choices };
}

export function firedScene(c: Career): VNLine[] {
  return [
    { who: 'presidente', expr: 'angry', text: `${c.coach.name}, esto no funciona. La directiva ha votado. Dos a cero. Mi cuñado y yo.` },
    { who: 'presidente', expr: 'neutral', text: 'Puede quedarse con el silbato. Y con el piso hasta fin de mes, que tampoco soy un monstruo.' },
    { who: 'narrador', text: 'DESPEDIDO. La confianza de la directiva ha caído por debajo de 10.' },
  ];
}

