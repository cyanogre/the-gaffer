# 02 · El juego: bucle, secciones e interfaz

Decisión final del autor: **fondos y escenarios en 3D (Three.js) con personajes y jugadores en pixel art**, para **móvil y PC**, con **pocos menús** y cuatro tipos de sección: historia pura, gestión, interacción y progresión del míster (estadísticas y dinero).

Este documento fija el primer hito jugable: **Temporada 1 en la Liga de Barrio**. Todo lo que aparece aquí está implementado con lógica, consecuencias y conexión con otros sistemas; lo que no, figura en «Fuera de este hito».

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

- **Semana** = 6 días × 3 franjas + domingo de partido. La temporada son 10 jornadas (liga de 6 equipos a doble vuelta).
- **Energía del míster**: cada acción cuesta; dormir la repone. Si la noche la pasas fuera, solo repones parte. Sin energía, solo puedes descansar.
- **Dos bolsillos**: *tu cartera* (vives de ella: alquiler semanal, bar, cursos) y *la caja del club* (taquilla, patrocinio, obras, material). Mezclarlos no es posible: el club no te paga en el barrio, por eso existe el curro en la ferretería.

## 2. Secciones

| Sección | Dónde | Qué haces | Consecuencia real |
|---|---|---|---|
| **Historia** | Escenas de novela visual en cualquier lugar (teléfono, puerta, correo, bar, ferretería, lunes por la mañana) | Leer y decidir | Dinero, aficionados, confianza, atributos de la semana, quién tira los penaltis, patrocinios |
| **Gestión** | Hoja *Club* (gratis, sin gastar franja): Plantilla · Pizarra · Liga · Caja | Once titular, formación y estilo, comprar obras y material | El once y la táctica entran en el motor; las obras cambian el campo, el aforo y el bote del balón |
| **Interacción** | Bar Manolo, entrenamiento, charla del domingo | Invitar a un jugador, elegir foco de entreno, arenga | Cambios de atributos (sangre fría, trabajo, agresividad) que la IA usa en sus decisiones |
| **Progresión** | Casa, campo, bar, ferretería | Estudiar, correr, ojear, trabajar | Sube las estadísticas del míster y la cartera |

## 3. El míster

Cuatro estadísticas con nivel y experiencia. Cada una tiene efectos concretos:

- **Táctica**: multiplica lo que aprenden los jugadores al entrenar y lo rápido que asimilan la formación (*familiaridad*). Desbloquea órdenes de partido: nivel 2 las señales (presión total, contraataque), nivel 3 la libertad individual.
- **Labia**: decisiones de novela que piden labia, éxito al charlar con jugadores, aficionados que ganas en el bar, lo que cobras en la ferretería y la fuerza de la arenga.
- **Ojo**: lo que averiguas al ojear al rival (formación → jugador peligroso → punto débil) y en el informe previo al partido.
- **Forma**: energía máxima.

## 4. La plantilla

- 15 jugadores: los 11 del brief (masculino o femenino) y 4 suplentes generados.
- **Atributos con decimales**: el entrenamiento los sube poco a poco (y menos cuanto más altos). El motor los usa tal cual.
- **Carga**: entrenar cansa. Lo que no se recupera antes del domingo sale al campo como cansancio inicial. Un entreno físico el sábado se paga el domingo.
- **Familiaridad** con cada formación (0–1): a más familiaridad, menos desorden posicional en el motor (las líneas se mantienen mejor). No es una bonificación: cambia dónde se colocan.
- En el partido: hasta 5 cambios. El que entra sale fresco (con su carga de la semana).

## 5. Lugares (escenarios 3D)

- **Casa**: pizarra (estudiar táctica), portátil (correo y vídeos: ojo), teléfono, puerta, sofá (descansar), cama (dormir pronto).
- **El Barrizal** (el campo, el mismo que se juega el domingo y que evoluciona con las obras): entrenar (martes y jueves por la tarde), correr (por la mañana), ojear al rival (sábado).
- **Bar Manolo**: charlar con la parroquia (labia, aficionados), invitar a un jugador (interacción), bocadillo (energía).
- **Ferretería Ramón**: echar un turno (cartera, confianza del presidente), hablar con Don Ramón.

## 6. Liga y economía del club

- 6 equipos, doble vuelta. Los partidos de los demás se resuelven con un modelo estadístico por nivel (semilla fija: reproducible). Tus partidos, con el motor completo.
- Objetivo de la directiva: quedar entre los 3 primeros. Si la confianza baja de 10, te despiden (fin de partida). Los 2 primeros ascienden.
- Caja: taquilla (aficionados × precio, con aforo y tiempo), patrocinio, árbitro y material. Obras del estadio (nivel 1 y 2) y material de entrenamiento.

## 7. Interfaz (móvil y PC, pocos menús)

- **Una sola barra superior**: día y franja, energía, cartera, caja, confianza; el retrato del míster abre su ficha.
- **Un solo dock inferior**: los cuatro lugares y *Club*. No hay más menús.
- **Las acciones viven en el escenario**: etiquetas sobre los objetos 3D (con coste de energía/dinero y si están disponibles). El míster camina hasta el objeto y la acción se resuelve con una tarjeta de resultado.
- **Una hoja** que en móvil sube desde abajo y en PC aparece a la derecha (Club, Míster, resultados).
- **Partido**: marcador arriba; abajo, cuatro botones (órdenes, cambios, velocidad, pausa). En PC, panel lateral fijo con órdenes y plantilla.
- Guardado automático en el navegador al final de cada acción.

## 8. Fuera de este hito

Mercado de fichajes, lesiones, divisiones superiores con jugadores reales (la estructura ya está en `content/names.ts`), marketing, más temporadas con historia propia. Se diseñarán y se preguntarán al autor antes de implementarlos.
