# THE GAFFER

Simulador de gestión y dirección técnica de fútbol: mezcla de Football Manager, Punch Club y simulador de gestión empresarial, con humor, progresión RPG y sistemas interconectados.

## Fuentes de verdad

- `docs/BRIEF.md` — brief completo del autor. Léelo entero antes de proponer o tocar nada.
- `docs/diseno/00-decisiones-del-autor.md` — decisiones del autor (mandan sobre todo lo demás).
- `docs/diseno/01-direccion-visual-y-campo.md` — investigación de estilo, comparativa, sprites y política de nombres reales.
- `docs/diseno/02-el-juego.md` — bucle de juego, secciones, míster, plantilla, pirámide y carrera, interfaz.

## Estado actual

- Dirección visual **final**: escenarios y fondos en **3D (Three.js)** y personajes y jugadores en **pixel art 2D** (billboards). Móvil y PC.
- Juego en `game/` (antes `prototypes/campo`, el laboratorio de estilos ya no existe): primera temporada jugable en Tercera Regional con el Atlético Barriobajo (críos de 14–16 años), semana tipo Punch Club, lugares 3D (casa, campo, Bar Manolo, Ferretería Ramón), novela visual, gestión (plantilla, pizarra, liga, caja), partido con el motor completo, fin de temporada con oferta de Segunda Federación o seguir con los tuyos.
- Pendiente de diseño: mercado, lesiones, divisiones altas con clubes reales, historia propia de cada categoría.

## Comandos (en `game/`)

- `npm install` (hay `.npmrc` con `legacy-peer-deps`).
- `npm run dev` — el juego en local.
- `npm test` — pruebas del motor y banco de equilibrado.
- `npm run typecheck`.
- `npm run bake:sprites` — genera las hojas de sprites que falten (`-- --force` las regenera y pisa retoques).
- `npm run build:artifact` — página autocontenida en `artifact/the-gaffer.html`.

## Reglas de trabajo

- Diseño antes que código. Núcleo pequeño, funcional y divertido; ampliar por hitos verificables.
- Nada de botones que no hacen nada: cada mecánica implementada tiene lógica, consecuencias y conexión con otros sistemas. No mostrar datos que el motor no tiene (p. ej. moral).
- Las órdenes tácticas y los rasgos modifican decisiones de la IA, nunca dan bonificaciones arbitrarias.
- Motor (`src/sim`) puro y determinista: sin DOM, sin `Math.random`; todo azar por `Rng`. La UI solo envía comandos.
- El humor sale de eventos del motor y rasgos de personalidad, no de chistes aleatorios.
- Arte: personajes antropomórficos (proporciones humanas, nada cúbico ni cabezón), reconocibles por su ADN visual. Las mujeres se leen como mujeres (cintura, cadera, pecho, peinados variados, sin vello facial); los críos, como críos (más bajitos, proporciones de crío). Los sprites son PNG editables por capas en colores clave (`game/assets/sprites/README.md`); el código no debe hardcodear arte que deba ser editable.
- Interfaz: pocos menús. Una barra superior, un dock de lugares + Club, acciones sobre los objetos del escenario y una sola hoja (abajo en móvil, a la derecha en PC).
- Sin servicios ni MCP de pago para generar assets; solo código y herramientas gratuitas.
- Nombres: divisiones bajas inventadas; jugadores reales (futuro) siempre vía `content/names.ts` con nombre abreviado ("L. Messi") y datos en paquetes separados.
- Ante alternativas: comparar pros/contras y recomendar una. Ante decisiones de diseño importantes sin definir: preguntar al autor antes de asumir.
- Idioma de trabajo con el autor: español.
