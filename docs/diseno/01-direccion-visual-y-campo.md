# 01 · Dirección visual y motor del campo

Estado: **decidido el estilo (Pixel HD en perspectiva)**, prototipo jugable en `prototypes/campo/`.

## 1. Decisión

El partido se verá en **pixel art HD con cámara de retransmisión en perspectiva**, como el concept
de referencia del autor: campo entero a la vista, estadio con público y horizonte urbano al
atardecer, futbolistas con proporciones humanas e interfaz de juego alrededor del campo
(marcador, órdenes, ficha con retrato, once con retratos, eventos, minimapa y controles).

Restricciones de dirección de arte acordadas:

- **Personajes antropomórficos**: proporciones humanas (cabeza ≈ 1/4,5 de la altura en el sprite),
  nada de cabezones ni de muñecos cúbicos tipo Minecraft.
- **Personajes reconocibles**: cada jugador sale de un "ADN visual" (piel, pelo, peinado, vello,
  complexión, nariz, cejas, accesorio, botas, celebración) y su personalidad se ve en la cara del
  retrato (gesto por defecto según rasgos).
- **Fútbol masculino y femenino** seleccionable, con plantillas, nombres, rasgos y crónica con
  concordancia de género.
- **Arte editable**: los sprites viven en hojas PNG por capas, con las equipaciones separadas y
  repintadas en tiempo real (ver §5).
- **Sin herramientas ni servicios de pago.**

## 2. Comparativa de los tres enfoques

Se construyeron tres prototipos que dibujan **el mismo partido** (mismo motor, mismo estado) para
compararlos en igualdad de condiciones. Puntuación 1–5 (5 mejor) para un equipo de dos personas
que trabaja con Claude Code:

| Criterio | Pixel HD | 3D estilizado (Three.js) | 2.5D cromos (Three.js + recortables) |
|---|---|---|---|
| Desarrollo con Claude Code | 5 | 3 | 4 |
| Sencillez técnica | 4 | 2 | 4 |
| Rendimiento | 5 | 3 | 4 |
| Crear y retocar arte sin pagar | 5 | 2 | 4 |
| Posibilidades de animación | 3 | 5 | 4 |
| Escalabilidad | 4 | 4 | 4 |
| Mantenimiento del código | 4 | 3 | 4 |
| Potencial visual y comercial | 5 | 4 | 4 |
| Personajes reconocibles y humor | 4 | 3 | 5 |
| **Total (de 45)** | **39** | **29** | **37** |

Por qué gana el Pixel HD:

- **Tono**: es el lenguaje de Punch Club. El humor y la nostalgia del fútbol de barrio encajan.
- **Coste de arte**: un sprite de 24×30 por capas lo puede retocar cualquiera en un editor
  gratuito; la variedad sale de combinar capas y repintar colores, no de dibujar más.
- **Rendimiento**: el fondo se calcula una vez (≈0,35 s) y cada fotograma son unas pocas decenas
  de `drawImage` a ~470×264 px internos. Va sobrado en cualquier portátil.
- **Perspectiva sin 3D**: la cámara es una proyección estenopeica en ~50 líneas; el campo se
  pinta píxel a píxel por proyección inversa (franjas de corte, desgaste, focos, cal de 1 px).

Qué se pierde frente al 3D: libertad de cámara y animación esquelética (repeticiones desde
cualquier ángulo). Se compensa con dos cámaras (estadio y cerca) y animación por fotogramas.

El 2.5D cromos queda como alternativa sólida si algún día se quiere un aspecto ilustrado: comparte
estadio y cámara con el 3D y su pintor de recortables está en `render/three/cutout.ts`.

## 3. Investigación de herramientas (noviembre de 2026)

- **3D con IA** (Meshy, Tripo): generan mallas y ofrecen auto-rigging, pero los propios análisis
  coinciden en que los personajes estilizados suelen requerir corregir el rig a mano y que conviene
  generar en pose T/A. Es el flujo más caro de mantener para un equipo sin modelador.
  Fuentes (en su mayoría blogs de proveedores, sin verificación independiente):
  [comparativa Meshy vs Tripo](https://www.selfcad.com/blog/meshy-vs-tripo),
  [Hitem3D vs Meshy vs Tripo](https://www.3daistudio.com/blog/hitem3d-vs-meshy-vs-tripo-comparison),
  [guía de assets 3D para juegos 2026](https://levelup.gitconnected.com/building-game-ready-3d-assets-fast-the-best-ai-generators-for-production-workflows-in-2026-f1f725ff5df0).
- **Pixel art con IA** (PixelLab, Retro Diffusion): sirven para bocetos y variantes, pero las guías
  insisten en limpiar a mano y fijar paleta para un juego comercial. Fuentes:
  [mejores generadores pixel 2026](https://llamagen.ai/en-in/articles/best-ai-pixel-art-generators-2026),
  [generar sprites con IA en 2026](https://sorceress.games/blog/how-to-generate-game-sprites-with-ai-in-2026).
- **Billboards 2.5D en Three.js**: patrón estándar (`Sprite`, quads orientados a cámara). Fuente:
  [manual de three.js, billboards](https://threejs.org/manual/en/billboards).

Conclusión práctica: el arte base lo genera **código** (el "bake" de §5) y se mejora **a mano** en
editores gratuitos: [LibreSprite](https://libresprite.github.io/),
[Pixelorama](https://orama-interactive.itch.io/pixelorama), Krita.

## 4. Arquitectura

```
prototypes/campo/
  src/sim/        motor de partido: puro, determinista, sin DOM (Node o Web Worker)
  src/content/    datos y tono: ADN visual, plantillas, nombres, patrocinadores, humor
  src/render/     MatchRenderer intercambiable: pixel/ (Canvas 2D) y three/ (Three.js)
  src/ui/         capa HTML: bocadillos, selección, iconos y escudos pixel
  assets/sprites/ hojas de sprites editables (PNG por capas + manifest.json)
  test/           pruebas del motor y banco de equilibrado
```

Principios:

1. **Motor y dibujo separados.** El motor avanza a 30 Hz fijos con semilla; los renderizadores
   interpolan entre ticks. Cambiar de estética no altera el partido (se puede comprobar en el
   laboratorio cambiando de pestaña en pleno partido).
2. **Órdenes como comandos.** La UI no toca el estado: envía comandos (`tactics`, `signal`,
   `freedom`) que se aplican en el siguiente tick. Misma semilla + mismos comandos = mismo partido
   (hay un test). Esto da repeticiones, depuración y simulación masiva gratis.
3. **Las órdenes cambian decisiones, no números.** El bloque cambia la altura de la línea y
   cuántos presionan; el estilo cambia el valor de cada pase; la libertad individual cambia los
   pesos de regatear/arriesgar. Los rasgos de personalidad funcionan igual (el "goleador nato" no
   tira mejor: tira más).
4. **Eventos como interfaz.** El motor emite hechos (`pass`, `shot`, `save`, `foul`, `selfish`...).
   La crónica, los bocadillos, las estadísticas por jugador y los efectos visuales se alimentan de
   ahí. El humor nunca inventa hechos.
5. **Banco de equilibrado headless.** `test/balance.test.ts` juega partidos completos sin pantalla
   y comprueba rangos (goles, tiros, % de pase). Es la herramienta para afinar cada división.

Para el juego completo se añadirán, en este orden: `game/` (carrera, economía, mercado; dominio
puro y serializable), `data/` (paquetes de contenido, §7) y persistencia en IndexedDB con esquema
versionado. Interfaz de gestión en DOM; React cuando haya muchas pantallas. Distribución web
primero; escritorio con Tauri o Electron cuando toque Steam (decisión aplazada).

## 5. Sprites por capas (arte editable)

- Cada capa del cuerpo es una hoja PNG: `arm_back, hair_back, legs, shorts, torso, head, facial,
  hair_front, acc, arm_front`. Rejilla común: **14 fotogramas × 3 vistas** (frente, espalda,
  perfil), celda 24×30.
- **Colores clave**: piel, pelo, camiseta, segundo color, pantalón, medias y botas tienen rampas de
  4 tonos en colores "imposibles" (rojo puro, verde puro...). Al componer se sustituyen por los
  reales, con sombras frías y luces cálidas. Una sola hoja de camiseta sirve para todos los
  equipos; los patrones (rayas, aros, mitad, banda) son variantes de la capa `torso`.
- El **dorsal** se estampa en tiempo real y el **contorno** se calcula sobre la silueta final.
- `npm run bake:sprites` genera la base desde código sin pisar retoques; `--force` la regenera.
- Guía completa: `prototypes/campo/assets/sprites/README.md`.
- Pendiente: pasar los **retratos** (hoy procedimentales, `render/pixel/portrait.ts`) al mismo
  sistema de capas (cara, ojos por gesto, boca por gesto, pelo, vello, camiseta).

## 6. Fútbol masculino y femenino

- El ADN visual tiene `gender`; cada género tiene su catálogo de peinados (moño, trenzas, pixie...)
  y la complexión "normal" femenina usa hombros más estrechos.
- Plantillas propias (`content/teams.ts`), nombres y apodos por género, rasgos con etiqueta
  masculina y femenina (`traitLabel`), y textos con concordancia en la ficha y la crónica.
- El selector está en el marcador; cambia de competición y empieza un partido nuevo.

## 7. Jugadores reales en divisiones altas

Decisión del autor: en las categorías bajas todo es inventado; en Segunda/Primera habrá una base
de datos de jugadores reales mostrados con nombre abreviado ("L. Messi").

Cómo lo soporta la estructura:

- La identidad del jugador (id estable) va separada de cómo se muestra. Toda la UI pasa por
  `content/names.ts` (`displayName(perfil, política)`), que ya implementa `initial-surname`.
- Los datos irán en **paquetes de contenido** intercambiables: el paquete ficticio por defecto y
  paquetes de datos de divisiones altas que se cargan aparte. El motor y las partidas guardadas
  solo conocen ids.

Aviso: abreviar el nombre **reduce** el riesgo, pero no lo elimina. Los derechos de imagen, la
caricatura reconocible de una persona real, y los nombres, escudos y equipaciones de clubes y
ligas también están protegidos. Alternativas habituales en el género: juego base 100 % ficticio y
paquetes editables por la comunidad. Antes de lanzar comercialmente conviene una consulta legal.

## 8. Riesgos y equilibrio detectados

- **Goles**: el primer motor daba 14,5 goles por partido. Se corrigió con alcance del portero según
  tiempo de reacción, cierre de ángulo, bloqueos de disparo, error mínimo de tiro y regla de no
  conducir a ciegas cerca de la línea. Media actual ≈ 6 en un partido de 10 minutos reales: alto,
  pero coherente con fútbol de barrio. Hay que fijar objetivos por división.
- **Bloqueos de posesión**: el portero retenía el balón indefinidamente (posesión del 96 %). Ahora
  aguantar cuesta tiempo y el portero suelta en 2,5 s.
- **Fueras de juego**: casi nunca se pitan, porque los delanteros se quedan en línea y los
  desmarques arrancan habilitados. Hará falta ajustar el momento del pase al hueco.
- **Rendimiento del fondo pixel**: comprobar la cal píxel a píxel costaba 22 s. Se cambió por un
  muestreo proyectado de cada línea (≈0,35 s).

## 9. Fuera de este prototipo

Cambios y banquillo, descanso y segunda parte con cambio de campo, moral (no se muestra hasta que
exista en el motor), jugadas de estrategia preparadas, lesiones, repeticiones y sonido.

## 10. Cómo ejecutarlo

```bash
cd prototypes/campo
```

```bash
npm install
```

```bash
npm run dev
```

Pruebas y banco de equilibrado:

```bash
npm test
```
