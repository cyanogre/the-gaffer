# 02 · El juego: bucle, secciones e interfaz

Decisión final del autor: **fondos y escenarios en 3D (Three.js) con personajes y jugadores en pixel art**, para **móvil y PC**, con **pocos menús** y cuatro tipos de sección: historia pura, gestión, interacción y progresión del míster (estadísticas y dinero).

Este documento fija el primer hito jugable: **la temporada tutorial en Tercera Regional** y el salto a la siguiente. Todo lo que aparece aquí está implementado con lógica, consecuencias y conexión con otros sistemas; lo que no, figura en «Fuera de este hito».

## 1. Bucle

```
Lunes ── Sábado: 3 franjas al día (mañana · tarde · noche)
   │      cada acción gasta una franja y energía; algunas, dinero
   │      la historia aparece en la franja y el lugar donde toca
   ▼
Domingo: charla previa → partido en el estadio 3D → crónica
   ▼
Cierre: taquilla, patrocinio, alquiler, liga, confianza → nueva semana
```

- **Semana** = 6 días × 3 franjas + domingo de partido. La temporada tutorial son 10 jornadas (grupo de 6 a doble vuelta); cada categoría tiene su tamaño de grupo (ver §6).
- **Energía del míster**: cada acción cuesta; dormir la repone. Si la noche la pasas fuera, solo repones parte. Sin energía, solo puedes descansar.
- **Dos bolsillos**: *tu cartera* (vives de ella: alquiler semanal, bar, cursos) y *la caja del club* (taquilla, patrocinio, obras, material). Mezclarlos no es posible: el club no te paga en el barrio, por eso existe el curro en la ferretería.

## 2. Secciones

| Sección | Dónde | Qué haces | Consecuencia real |
|---|---|---|---|
| **Historia** | Escenas de novela visual en cualquier lugar (teléfono, puerta, correo, bar, ferretería, lunes por la mañana) | Leer y decidir | Dinero, aficionados, confianza, atributos de la semana, quién tira los penaltis, patrocinios |
| **Gestión** | Hoja *Club* (gratis, sin gastar franja): Plantilla · Pizarra · Liga · Caja | Once titular, formación y estilo, comprar obras y material | El once y la táctica entran en el motor; las obras cambian el campo, el aforo y el bote del balón |
| **Interacción** | Bar Manolo, entrenamiento, charla del domingo | Invitar a un jugador, elegir foco de entreno, arenga | Cambios de atributos (sangre fría, trabajo, agresividad) que la IA usa en sus decisiones |
| **Progresión** | Casa, campo, bar, ferretería | Estudiar, correr, ojear, trabajar | Sube las estadísticas del míster y la cartera |

## 3. El míster (tipo Punch Club)

Cuatro estadísticas con un valor de 0 a 100 (nivel = 1 + una decena por nivel). **Cuestan de subir**: cada sesión rinde menos cuanto más alta está. **Cuestan de mantener**: cada día que no se trabajan bajan (0,3 + 1,8 % de su valor), así que mantenerlas arriba exige constancia. La ficha del míster dice para qué sirve cada una, qué desbloquea el siguiente nivel y cuánto bajará esta noche; el retrato avisa si alguna está a punto de perder nivel.

- **Táctica** (pizarra, vídeos, entrenos): cuánto aprenden en cada entreno (+8 % por nivel) y lo rápido que asimilan la formación. Nivel 2: señales en el partido. Nivel 3: libertad individual.
- **Labia** (bar, charlas, ferretería): cuánto les llega la arenga y las charlas, sueldo en la ferretería (+4 € por turno y nivel) y respuestas especiales en la historia.
- **Ojo** (vídeos, ojear al rival): formación del rival (1), su jugador peligroso (2), su punto débil (3).
- **Forma** (correr): energía máxima (+10 por nivel).

**Necesidades** (como en Punch Club): energía, hambre y ánimo. Con hambre no se puede entrenar ni trabajar (hay que comer: nevera de casa o bocadillo del bar); con el ánimo por debajo de 50 cada sesión rinde la mitad; repetir el mismo ejercicio el mismo día rinde menos. Cada noche baja la comida y el ánimo vuelve hacia lo normal.

**Se ve hacerlo**: cada actividad se ve en el escenario mientras pasa (el míster da vueltas al campo, se sienta en el sofá, se tumba en la cama, come junto a la nevera) y las barras de la parte de arriba suben poco a poco; al llenarse una barra de estadística se gana un punto. Tocar la pantalla lo salta.

## 4. La plantilla

- 15 jugadores: los 11 del brief (masculino o femenino) y 4 suplentes generados. Son **críos de 14 a 16 años**:
  más bajitos, con proporciones de crío, aprenden más rápido al entrenar y **crecen cada temporada** (altura,
  velocidad, resistencia). Juegan contra adultos «con permiso federativo» (lo firmó el cuñado del presidente).
- **Atributos con decimales**: el entrenamiento los sube poco a poco (y menos cuanto más altos). El motor los usa tal cual.
- **Carga**: entrenar cansa. Lo que no se recupera antes del domingo sale al campo como cansancio inicial. Un entreno físico el sábado se paga el domingo.
- **Familiaridad** con cada formación (0–1): a más familiaridad, menos desorden posicional en el motor (las líneas se mantienen mejor). No es una bonificación: cambia dónde se colocan.
- En el partido: hasta 5 cambios. El que entra sale fresco (con su carga de la semana).

### Moral (gestión tipo Football Manager)

Cada jugador tiene moral (0–100) con sus motivos a la vista («No jugó», «Le diste los penaltis», «Gran partido (8,1)»). Cambia por:

- **Resultados y notas**: cada partido se puntúa a cada jugador (1–10) con lo que ha hecho (goles, tiros a puerta, pases, entradas, paradas, faltas, tarjetas, goles encajados el portero).
- **Minutos**: a los habituales y a los que se creen imprescindibles no jugar les sienta mal.
- **Promesas**: prometer minutos alegra ahora; si el domingo no juega, se paga caro.
- **Charlas desde su ficha** (una por semana): elogiar su forma (funciona si de verdad jugó bien), pedirle más (a algunos les pica para bien, a otros les hunde), prometer minutos o preguntarle cómo está. Un café en el bar también ayuda.
- **Arenga** del domingo: cada carácter reacciona a su manera; al que llega hundido le va bien la calma.
- **Historia**: las decisiones cambian la moral con su motivo o algo concreto (entrenos, penaltis, contratos), nunca atributos a capricho.

Efecto en el campo (fórmula única, en `game/morale.ts`): sangre fría + (moral − 55) / 10 y trabajo + (moral − 55) / 14. Con la moral alta juegan sueltos y corren; hundidos, se precipitan y se esconden. Con los días, la moral vuelve poco a poco hacia lo normal.

## 5. Lugares (escenarios 3D)

- **Casa**: pizarra (estudiar táctica), portátil (correo y vídeos: ojo), teléfono, puerta, sofá (descansar), cama (dormir pronto).
- **El Barrizal** (el campo, el mismo que se juega el domingo y que evoluciona con las obras): entrenar (martes y jueves por la tarde), correr (por la mañana), ojear al rival (sábado).
- **Bar Manolo**: charlar con la parroquia (labia, aficionados), invitar a un jugador (interacción), bocadillo (energía).
- **Ferretería Ramón**: echar un turno (cartera, confianza del presidente), hablar con Don Ramón.

### Muebles, sitios y poses (cómo se usa el escenario)

Todo lo que alguien hace con un mueble sale del mismo sistema, para el míster y para los vecinos:

- **Mueble**: piezas 3D con nombre (`barra`, `sofa`, `cama`, `silla-doma`...). Lo que está encima va con él (la caja registradora con el mostrador). Lo colgado de la pared y lo que está a ras de suelo (alfombras) no tapa a nadie.
- **Sitio**: dónde se pone la persona, con qué pose en bucle (sentado, sentado a la mesa, jugando una ficha, limpiando con el trapo, comiendo, hablando, señalando, tumbado) y **cómo se tapa con cada mueble**:
  - *delante* (en un taburete, con la barra detrás),
  - *detrás* (en el sofá viendo la tele: el sofá le tapa y asoman cabeza y hombros),
  - *brazos por encima* (Manolo limpia la barra: el cuerpo detrás de la barra, el brazo con el trapo por encima; lo mismo al atender en la ferretería o al jugar al dominó con los brazos sobre la mesa).
  Lo que el sitio no dice se decide como en un point & click: si está más al fondo que la esquina delantera del mueble, detrás; si no, delante. Nunca a medias.
- **Rutina** de un vecino: una lista de sitios con su rato en cada uno (Manolo limpia la barra, coge una botella, vuelve a limpiar, mira el bar; Ramón quita el polvo al mostrador y va al despacho; los del dominó, sentados jugando). Si Manolo está enfadado, su rutina es quedarse quieto.
- **Cama**: quien se tumba se dibuja en 3D a lo largo de la cama (manta con el cuerpo marcado: pecho que respira, piernas y pies), así sigue la orientación de la cama en la vista isométrica; asoma su propia cabeza pixel (de perfil, ojos cerrados) sobre la almohada y le salen zetas.

Para añadir una interacción nueva basta con nombrar el mueble y añadir un sitio (y, si hace falta, una pose nueva en el generador de sprites).

## 6. Pirámide, liga y carrera

| Categoría | En la realidad | Grupo en el juego | Suben / bajan | Sueldo del míster |
|---|---|---|---|---|
| Tercera Regional | regional, por comarcas | 6 (tutorial) | 2 / 0 | 0 |
| Segunda Regional | regional | 8 | 2 / 1 | 0 |
| Primera Regional | regional | 10 | 2 / 2 | 40 €/sem |
| Regional Preferente | máxima regional | 12 | 2 / 2 | 80 €/sem |
| Tercera Federación | ≈18 grupos territoriales | 18 | 1 / 3 | 150 €/sem |
| Segunda Federación | 90 equipos, 5 grupos de 18 | 18 | 1 / 4 | 250 €/sem |
| Primera Federación | 40 equipos, 2 grupos de 20 | 20 | 2 / 4 | 600 €/sem |
| Segunda División | 22, profesional | 22 | 2 / 4 | 2500 €/sem |
| Primera División | 20, profesional | 20 | — / 3 | 9000 €/sem |

- Nombres genéricos de categoría, sin marcas de patrocinio. Clubes inventados en todas; los reales llegarán por paquetes de datos con nombre abreviado.
- **Tutorial**: ser campeón de Tercera Regional con el Barriobajo. Si lo eres, un club de Segunda Federación te ofrece entrenarle (con sueldo, estadio y plantilla nuevos). Puedes aceptar o **quedarte con tus críos** y subir con ellos categoría a categoría. Si no eres campeón, repites (o subes si quedas segundo).
- Los partidos de los demás se resuelven con un modelo estadístico por nivel (semilla fija: reproducible). Tus partidos, con el motor completo. Si la confianza baja de 10, te despiden (fin de partida).
- Caja: taquilla (aficionados × precio, con aforo y tiempo), patrocinio, árbitro y material. Obras del estadio (nivel 1 y 2) y material de entrenamiento.

## 7. Interfaz (móvil y PC, pocos menús)

- **Una sola barra superior**: día y franja, energía, cartera, caja, confianza; el retrato del míster abre su ficha.
- **Un solo dock inferior**: los cuatro lugares y *Club*. No hay más menús.
- **Las acciones viven en el escenario**: etiquetas sobre los objetos 3D (con coste de energía/dinero y si están disponibles). El míster camina hasta el objeto y la acción se resuelve con una tarjeta de resultado.
- **Una hoja** que en móvil sube desde abajo y en PC aparece a la derecha (Club, Míster, resultados).
- **Partido**: marcador arriba; abajo, cuatro botones (órdenes, cambios, velocidad, pausa). En PC, panel lateral fijo con órdenes y plantilla.
- Guardado automático en el navegador al final de cada acción.

## 8. Primera semana guiada

La primera semana va «sobre raíles»: un halo marca el único botón que se puede pulsar, el resto de la pantalla queda bloqueado y una nota explica el porqué (reloj y franjas, energía, cartera, ir al campo, correr, el papeleo del Club, el bar, dormir, el turno en la ferretería y el primer entreno). Se puede saltar en cualquier momento.

- **Conocer a la plantilla**: al llegar al Barrizal por primera vez, los chavales se presentan uno a uno (cada uno con su manía) y eliges tus primeras palabras. Hasta entonces sus rasgos no salen en la ficha.
- Pistas sueltas el primer domingo («¡A jugar!») y en el primer partido («Órdenes» y «Cambios»).

## 9. Fútbol de contacto

El motor no solo corre y chuta: hay entradas de pie y segadas, choques de hombros en carrera (gana el más corpulento y agresivo; puede acabar en falta o con el otro en el suelo), duelos aéreos con cabezazos (despeje, prolongación o remate; gana el más alto y mejor colocado, así que los críos sufren contra adultos), caídas, piscinazos, estiradas del portero, saques de banda y el portero con el balón en las manos. Cada cosa tiene su pose en los sprites, generada con el esqueleto de referencia.

## 10. Fuera de este hito

Mercado de fichajes, lesiones, clubes y jugadores reales en divisiones altas (la estructura ya está en `content/names.ts` y `content/divisions.ts`), partidos fuera de casa (hoy todo se juega en tu campo), historia propia de cada categoría y del club de Segunda Federación, marketing. Se diseñarán y se preguntarán al autor antes de implementarlos.
