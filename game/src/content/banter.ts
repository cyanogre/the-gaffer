import type { MatchSim } from '../sim/match';
import { Rng } from '../sim/rng';
import type { MatchEvent, SimPlayer } from '../sim/types';
import { shortName } from './names';

/**
 * Capa de humor. Convierte hechos del motor + rasgos de personalidad en crónica y bocadillos.
 * No inventa sucesos: solo narra lo que ha pasado, con la voz del fútbol de barrio.
 */
export interface Line {
  feed?: string;
  tone?: 'goal' | 'card' | 'signal' | 'info' | 'fun';
  bubbles?: { idx: number; text: string; delay?: number }[];
}

const rng = new Rng(2024);
const pick = <T,>(a: readonly T[]) => rng.pick(a);
const has = (p: SimPlayer, t: SimPlayer['profile']['traits'][number]) => p.profile.traits.includes(t);

const CELEBRATION: Record<string, string[]> = {
  arms: ['¡VAMOOOS!', '¡Toma, toma, toma!'],
  plane: ['¡Despegando!', '¡Modo avión!'],
  knees: ['¡Por mi abuela!', '¡Esto va por el barrio!'],
  dance: ['¡Lo ensayé en el móvil!', '¡Baile nuevo!'],
  ear: ['¿Qué decíais?', 'No os oigo…'],
};

export interface BanterContext {
  sponsorShout: boolean;
  manolo: 'cheer' | 'sulk' | 'normal';
}

export class Banter {
  private lastFeedAt: Record<string, number> = {};
  private ambientAt = 8;
  ctx: BanterContext = { sponsorShout: false, manolo: 'normal' };

  thunder(): Line[] {
    return [{ feed: '¡Trueno! La abuela Mari se santigua. Dos veces, por si acaso.', tone: 'fun' }];
  }

  private throttle(key: string, t: number, gap: number) {
    if ((this.lastFeedAt[key] ?? -99) + gap > t) return false;
    this.lastFeedAt[key] = t;
    return true;
  }

  onEvent(e: MatchEvent, sim: MatchSim): Line[] {
    const P = (i?: number) => (i !== undefined && i >= 0 ? sim.players[i] : undefined);
    const a = P(e.a);
    const b = P(e.b);
    const n = (p?: SimPlayer) => (p ? shortName(p.profile) : '¿?');
    const home = sim.teams[0].profile.name;
    const away = sim.teams[1].profile.name;
    switch (e.kind) {
      case 'sub': {
        if (!a) return [];
        const out = e.detail ?? '';
        const fresh = a.profile.look.youth && a.profile.look.youth > 0.6 ? '¡Corre como si no hubiera mañana!' : '¡A por ellos!';
        return [{ feed: `Cambio en el ${sim.teams[a.team].profile.short}: entra ${n(a)} por ${out.split(' ').slice(-1)[0]}.`, tone: 'info', bubbles: [{ idx: a.idx, text: fresh }] }];
      }
      case 'kickoff':
        if (sim.t < 3) return [{ feed: `Pita el árbitro. ${home} y ${away} saltan al barro.`, tone: 'info' }];
        return [];
      case 'goal': {
        if (!a) return [];
        const shout: Line[] = [];
        if (a.team === 0 && this.ctx.sponsorShout) {
          const mate = sim.players.find((p) => p.team === 0 && p.idx !== a.idx && !p.sentOff && Math.hypot(p.x - a.x, p.y - a.y) < 30);
          shout.push({ feed: 'Cumplen con el patrocinador: «¡VIVA EL BAR MANOLO!». Manolo llora detrás de la barra.', tone: 'fun', bubbles: mate ? [{ idx: mate.idx, text: '¡VIVA EL BAR MANOLO!', delay: 1.2 }] : [] });
        }
        if (e.detail === 'og') {
          return [{ feed: `¡Gol en propia puerta de ${n(a)}! Lo celebra el rival y, en silencio, su suegro.`, tone: 'goal', bubbles: [{ idx: a.idx, text: '¿Pero qué he hecho?' }] }];
        }
        if (has(a, 'goleadorNato')) {
          const d = a.profile.drought ?? 0;
          const feed = d > 0 ? `¡GOOOL de ${n(a)}! Se acaba una sequía de ${d} partidos. Ya está pidiendo una estatua.` : `¡GOOOL de ${n(a)}! Dice que lo había avisado. Nadie lo recuerda.`;
          a.profile.drought = 0;
          return [{ feed, tone: 'goal', bubbles: [{ idx: a.idx, text: a.profile.look.gender === 'f' ? '¡Os lo dije! ¡NATA!' : '¡Os lo dije! ¡NATO!' }] }, ...shout];
        }
        const assist = b ? ` Pase de ${n(b)}.` : '';
        const flavor = a.team === 0 ? pick([' La grada del Bar Manolo se viene arriba.', ' Hasta el utillero lo celebra.', ' Manolo invita a una ronda. Dice.']) : pick([' Silencio en el barrio.', ' Alguien en la grada culpa al árbitro por si acaso.']);
        return [{ feed: `¡GOOOL de ${n(a)}!${assist}${flavor}`, tone: 'goal', bubbles: [{ idx: a.idx, text: pick(CELEBRATION[a.profile.look.celebration]) }] }, ...shout];
      }
      case 'header': {
        if (!a) return [];
        const loser = b && b.team !== a.team ? b : undefined;
        const small = loser && (loser.profile.look.youth ?? 0) > 0.4 && !(a.profile.look.youth ?? 0);
        if (small && this.throttle('header-kid', sim.t, 25)) return [{ feed: `${n(a)} gana el salto por una cabeza. Literalmente: ${n(loser)} le llega por el hombro.`, tone: 'fun' }];
        if (this.throttle('header', sim.t, 18)) return [{ feed: e.detail === 'clear' ? `Despeje de cabeza de ${n(a)}.` : `${n(a)} la prolonga de cabeza.`, tone: 'info' }];
        return [];
      }
      case 'push': {
        if (!a || !b) return [];
        if (e.value === 1) return [{ bubbles: [{ idx: b.idx, text: pick(['¡Me ha empujado!', '¡Árbitro, eso es falta!']) }] }];
        if (e.detail === 'down') return [{ feed: this.throttle('push', sim.t, 15) ? `Choque de hombros: ${n(a)} se lleva por delante a ${n(b)}.` : undefined, tone: 'fun', bubbles: [{ idx: b.idx, text: pick(['¡Ay!', '¡Que no es rugby!']) }] }];
        if (e.detail === 'bounce') return this.throttle('bounce', sim.t, 20) ? [{ bubbles: [{ idx: a.idx, text: pick(['¡Es una pared!', 'Uf, qué duro.']) }] }] : [];
        if (e.detail === 'air' && this.throttle('air', sim.t, 20)) return [{ bubbles: [{ idx: b.idx, text: pick(['¡Me ha usado de escalera!', '¡Codazo!']) }] }];
        return [];
      }
      case 'shot':
        if (!a) return [];
        if (e.detail?.startsWith('header') && this.throttle('header-shot', sim.t, 10)) return [{ feed: `¡Remate de cabeza de ${n(a)}!`, tone: 'info' }];
        if (has(a, 'goleadorNato') && (e.value ?? 0) > 22 && this.throttle('nato-far', sim.t, 20)) {
          return [{ feed: `${n(a)} lo intenta desde ${Math.round(e.value ?? 0)} metros. Fe no le falta.`, tone: 'fun' }];
        }
        return [];
      case 'miss':
        if (a && has(a, 'goleadorNato')) {
          a.profile.drought = a.profile.drought ?? 0;
          return [{ bubbles: [{ idx: a.idx, text: pick(['El balón está mal hinchado.', 'Eso en el entreno entra.', '¡El césped está alto!', 'Iba con efecto, ¿eh?']) }] }];
        }
        if (a && this.throttle('miss', sim.t, 12)) return [{ feed: `Disparo de ${n(a)} que se marcha fuera.`, tone: 'info' }];
        return [];
      case 'save': {
        if (!a) return [];
        const belly = a.profile.look.body === 'belly';
        const feed = belly ? `¡${n(a)} vuela! Bueno, se desplaza lateralmente con mucha dignidad.` : `¡Paradón de ${n(a)}!`;
        return [{ feed, tone: 'info', bubbles: b ? [{ idx: b.idx, text: pick(['¡Noooo!', '¿Cómo la ha sacado?']) }] : [] }];
      }
      case 'bobble':
        if (sim.conditions.pitch < 0.4 && this.throttle('bobble', sim.t, 35)) return [{ feed: pick(['El balón bota en una piedra. El Barrizal también juega.', 'Socavón traicionero: el balón sale disparado hacia donde nadie esperaba.', 'El balón tropieza con un hueso de aceituna. Herencia del Bar Manolo.']), tone: 'fun' }];
        return [];
      case 'slip':
        if (!a) return [];
        return [{ feed: this.throttle('slip', sim.t, 15) ? `${n(a)} resbala ${sim.conditions.weather === 'snow' ? 'en la nieve' : 'en el barro'} y acaba ${a.profile.look.gender === 'f' ? 'sentada' : 'sentado'}.` : undefined, tone: 'fun', bubbles: [{ idx: a.idx, text: pick(['¡Uy!', '¡Mi chándal!', 'Esto no cuenta.']) }] }];
      case 'block':
        if (a && rng.chance(0.4)) return [{ bubbles: [{ idx: a.idx, text: pick(['¡Por aquí no pasa!', '¡Con la cara no!']) }] }];
        return [];
      case 'foul': {
        if (!a || !b) return [];
        if (has(a, 'lenero')) return [{ feed: `${n(a)} entra con la delicadeza de una hormigonera. Falta.`, tone: 'fun', bubbles: [{ idx: b.idx, text: '¡AY, MI TOBILLO!' }] }];
        if (e.value === 1) return [];
        return [{ feed: this.throttle('foul', sim.t, 8) ? `Falta de ${n(a)} sobre ${n(b)}.` : undefined, tone: 'info', bubbles: [{ idx: b.idx, text: pick(['¡Árbitro!', '¡Eso es tarjeta!']) }] }];
      }
      case 'yellow':
        if (!a) return [];
        return [{ feed: has(a, 'lenero') ? `Amarilla para ${n(a)}. Las colecciona.` : `Amarilla para ${n(a)}. Protesta como si le hubieran robado la cartera.`, tone: 'card', bubbles: [{ idx: a.idx, text: pick(['¡Si no la he tocado!', '¿Yo? ¿YO?']) }] }];
      case 'red':
        if (!a) return [];
        return [{ feed: `¡Roja para ${n(a)}! Se va al vestuario señalando al cielo. El cielo no opina.`, tone: 'card' }];
      case 'dive':
        if (!a) return [];
        if (e.value === 1) return [{ feed: `${n(a)} se desploma como si le hubiera alcanzado un rayo. El árbitro se lo compra.`, tone: 'fun', bubbles: [{ idx: a.idx, text: '¡Me ha matado!' }] }];
        return [{ feed: `${n(a)} se tira a la piscina, pero hoy no hay agua.`, tone: 'fun', bubbles: [{ idx: a.idx, text: '¿Nadie lo ha visto?' }] }];
      case 'selfish':
        if (!a || !b) return [];
        return [
          {
            feed: this.throttle('selfish', sim.t, 25) ? `${n(a)} ve a ${n(b)} solo y decide que pasar es de cobardes.` : undefined,
            tone: 'fun',
            bubbles: [
              { idx: b.idx, text: pick(['¡ESTABA SOLO!', '¡Que la sueltes!']) },
              { idx: a.idx, text: 'Puedo yo.', delay: 0.9 },
            ],
          },
        ];
      case 'offside':
        if (!a) return [];
        return [{ feed: `Fuera de juego de ${n(a)}. Jura que estaba en línea.`, tone: 'info', bubbles: [{ idx: a.idx, text: '¡Estaba en línea!' }] }];
      case 'restart':
        if (e.detail === 'penalty' && a) return [{ feed: `¡Penalti! ${n(a)} coge el balón como si fuera suyo.`, tone: 'info' }];
        return [];
      case 'signal': {
        const team = sim.players.filter((p) => p.team === e.team && !p.sentOff);
        if (e.detail === 'press') {
          const pul = team.find((p) => has(p, 'pulmon'));
          const pad = team.find((p) => has(p, 'padel'));
          const extra = `${pul ? ` ${n(pul)} sonríe.` : ''}${pad ? ` ${n(pad)} mira el reloj.` : ''}`;
          const bubbles = [pul && { idx: pul.idx, text: '¡Vamos, vamos, vamos!' }, pad && { idx: pad.idx, text: '¿Ahora?', delay: 0.7 }].filter(Boolean) as Line['bubbles'];
          return [{ feed: `El míster grita «¡Presión total!» durante 25 segundos.${extra}`, tone: 'signal', bubbles }];
        }
        return [{ feed: 'Señal preparada: ¡contraataque! En cuanto recuperemos el balón, todos arriba.', tone: 'signal' }];
      }
      case 'counter_go': {
        const fw = sim.players.filter((p) => p.team === e.team && sim.slotOf(p).role === 'DEL' && !p.sentOff);
        return [{ feed: `¡Contra! ${fw.map(n).join(', ')} salen como si regalaran churros en el área.`, tone: 'signal', bubbles: fw[0] ? [{ idx: fw[0].idx, text: '¡Corre, corre!' }] : [] }];
      }
      case 'tactic': {
        const patch = JSON.parse(e.detail ?? '{}');
        const parts: string[] = [];
        if (patch.formation) parts.push(`pasamos al ${patch.formation}`);
        if (patch.block !== undefined) parts.push(`bloque ${['bajo', 'medio', 'alto'][patch.block]}`);
        if (patch.style) parts.push(`juego ${({ short: 'corto', mixed: 'mixto', long: 'directo' } as Record<string, string>)[patch.style]}`);
        return parts.length ? [{ feed: `Cambio desde el banquillo: ${parts.join(', ')}.`, tone: 'signal' }] : [];
      }
      case 'fulltime': {
        const [s0, s1] = sim.score;
        const flavor = s0 > s1 ? 'Esta noche se cena en el Bar Manolo.' : s0 < s1 ? 'La directiva pide una reunión. En el bar, claro.' : 'Empate. Nadie está contento, que es lo justo.';
        return [{ feed: `Final: ${home} ${s0}-${s1} ${away}. ${flavor}`, tone: 'goal' }];
      }
    }
    return [];
  }

  /** Comentarios ambientales que salen de la personalidad y del estado físico. */
  ambient(sim: MatchSim): Line[] {
    if (sim.t < this.ambientAt || sim.phase !== 'play') return [];
    this.ambientAt = sim.t + rng.range(7, 13);
    const cands: { idx: number; text: string }[] = [];
    for (const p of sim.players) {
      if (p.sentOff) continue;
      const spd = Math.hypot(p.vx, p.vy);
      if (has(p, 'padel') && sim.possTeam !== p.team && spd < 2.5) cands.push({ idx: p.idx, text: pick(['¿Alguien echa un pádel luego?', 'Hoy hay torneo en Pádel Cristal…', 'Esta pista es enorme.']) });
      if (has(p, 'pulmon') && spd > 6) cands.push({ idx: p.idx, text: '¡Vamos, vamos, vamos!' });
      if (p.fatigue > 0.55) cands.push({ idx: p.idx, text: pick(['Míster, me muero…', 'Necesito un bocadillo.']) });
      if (has(p, 'artista') && sim.ball.owner === p.idx) cands.push({ idx: p.idx, text: 'Mirad esto…' });
      if (has(p, 'nervioso') && sim.ball.owner === p.idx) cands.push({ idx: p.idx, text: 'Ay, ay, ay…' });
      if (p.slot === 0 && p.profile.look.body === 'belly' && Math.abs(sim.ball.x - sim.ownGoalX(p.team)) < 25) cands.push({ idx: p.idx, text: 'Eso no llega, eso no llega…' });
    }
    return cands.length ? [{ bubbles: [rng.pick(cands)] }] : [];
  }
}
