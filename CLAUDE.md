# THE GAFFER

Simulador de gestión y dirección técnica de fútbol: mezcla de Football Manager, Punch Club y simulador de gestión empresarial, con humor, progresión RPG y sistemas interconectados.

## Fuentes de verdad

- `docs/BRIEF.md` — brief completo del autor. Léelo entero antes de proponer o tocar nada.
- `docs/diseno/01-direccion-visual-y-campo.md` — decisión de estilo, comparativa, arquitectura, sprites, género y política de nombres reales.

## Estado actual

- Brief memorizado. Dirección visual decidida: **pixel art HD con cámara de retransmisión en perspectiva** (según el concept del autor).
- Prototipo jugable del partido en `prototypes/campo/` (motor + tres renderizadores comparables + pantalla de juego). El resto del juego (carrera, economía, mercado...) aún no está diseñado en detalle ni implementado.

## Comandos (en `prototypes/campo/`)

- `npm install` (hay `.npmrc` con `legacy-peer-deps`).
- `npm run dev` — laboratorio en local.
- `npm test` — pruebas del motor y banco de equilibrado.
- `npm run typecheck`.
- `npm run bake:sprites` — genera las hojas de sprites que falten (`-- --force` las regenera y pisa retoques).
- `npm run build:artifact` — página autocontenida en `artifact/`.

## Reglas de trabajo

- Diseño antes que código. Núcleo pequeño, funcional y divertido; ampliar por hitos verificables.
- Nada de botones que no hacen nada: cada mecánica implementada tiene lógica, consecuencias y conexión con otros sistemas. No mostrar datos que el motor no tiene (p. ej. moral).
- Las órdenes tácticas y los rasgos modifican decisiones de la IA, nunca dan bonificaciones arbitrarias.
- Motor (`src/sim`) puro y determinista: sin DOM, sin `Math.random`; todo azar por `Rng`. La UI solo envía comandos.
- El humor sale de eventos del motor y rasgos de personalidad, no de chistes aleatorios.
- Arte: personajes antropomórficos (proporciones humanas, nada cúbico ni cabezón), reconocibles por su ADN visual, masculino y femenino. Los sprites son PNG editables por capas en colores clave (`assets/sprites/README.md`); el código no debe hardcodear arte que deba ser editable.
- Sin servicios ni MCP de pago para generar assets; solo código y herramientas gratuitas.
- Nombres: divisiones bajas inventadas; jugadores reales (futuro) siempre vía `content/names.ts` con nombre abreviado ("L. Messi") y datos en paquetes separados.
- Ante alternativas: comparar pros/contras y recomendar una. Ante decisiones de diseño importantes sin definir: preguntar al autor antes de asumir.
- Idioma de trabajo con el autor: español.
