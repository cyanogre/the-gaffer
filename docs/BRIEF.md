# PROYECTO: THE GAFFER — Diseño de un simulador de gestión y dirección técnica de fútbol

> Brief original del proyecto, tal y como lo definió el autor. Es la fuente de verdad del diseño.
> Estado: **memorizado, sin implementar**. No se escribe código hasta que el diseño (sección 12) esté acordado.

Actúa como un equipo multidisciplinar formado por:

- Un diseñador senior de videojuegos especializado en simuladores de gestión.
- Un diseñador de sistemas y economía de videojuegos.
- Un experto en simulación futbolística y táctica.
- Un game designer especializado en progresión RPG.
- Un director artístico especializado en videojuegos indie con personalidad.
- Un arquitecto de software especializado en videojuegos.

Tu misión es ayudarme a diseñar y desarrollar un videojuego de gestión futbolística con una identidad propia.

**IMPORTANTE:** No quiero un clon de Football Manager. Quiero una mezcla de Football Manager, Punch Club y un simulador de gestión empresarial, con humor, progresión y mecánicas interconectadas.

No empieces programando inmediatamente. Primero debemos definir correctamente el diseño del juego, sus sistemas y su arquitectura.

---

## 1. VISIÓN GENERAL

El jugador encarna a un entrenador de fútbol que comienza desde lo más bajo del fútbol.

Su objetivo es construir una carrera deportiva y empresarial, empezando con un equipo humilde y llegando, si es capaz, a dirigir grandes clubes y construir un auténtico imperio futbolístico.

El juego debe combinar:

1. Dirección técnica y táctica.
2. Simulación de partidos en tiempo real.
3. Gestión de jugadores y vestuario.
4. Mercado de fichajes y negociación.
5. Desarrollo y venta de futbolistas.
6. Economía y gestión empresarial.
7. Marketing, reputación y afición.
8. Progresión del entrenador.
9. Ascensos, descensos y competiciones.
10. Personajes, acontecimientos y situaciones humorísticas.

La experiencia debe ser divertida, accesible y profunda. No quiero una simulación excesivamente burocrática ni una interfaz llena de tablas.

El jugador debe sentir que está construyendo algo desde cero.

## 2. IDENTIDAD Y TONO

La principal referencia conceptual es Punch Club.

Quiero:

- Humor absurdo e inteligente.
- Personajes extravagantes.
- Situaciones inesperadas.
- Diálogos con personalidad.
- Eventos que puedan generar historias memorables.
- Una cierta sátira del fútbol moderno, los representantes, los patrocinadores, los egos y los negocios deportivos.
- Una progresión muy satisfactoria.

Ejemplos de situaciones:

- Un delantero que asegura ser un goleador nato, pero lleva 14 partidos sin marcar.
- Un representante que intenta venderte a un jugador que ni siquiera es titular en su equipo.
- Un patrocinador local que quiere aparecer en la camiseta y exige que el equipo celebre sus goles mencionando su negocio.
- Un jugador que se niega a entrenar porque ha descubierto el pádel.
- Un futbolista con un talento extraordinario, pero una personalidad imposible.
- Un club que ofrece una cantidad absurda por un jugador porque su presidente está convencido de que será el próximo Messi.

El humor debe surgir de las situaciones y de los sistemas, no limitarse a introducir chistes aleatorios.

## 3. SISTEMA DE PROGRESIÓN

El juego comienza con recursos y posibilidades muy limitados.

Quiero una progresión por etapas:

### ETAPA 1 — FÚTBOL DE BARRIO

- Equipo semiprofesional o amateur.
- Presupuesto prácticamente inexistente.
- Instalaciones precarias.
- Jugadores generados con habilidades muy desiguales.
- Entrenamientos básicos.
- Poca visibilidad y reputación.
- Primeros patrocinadores locales.
- Gestión económica sencilla.

### ETAPA 2 — FÚTBOL REGIONAL

- Mayor competición.
- Primeros contratos.
- Fichajes y cesiones.
- Ojeadores básicos.
- Mejoras de instalaciones.
- Marketing local.
- Mayor responsabilidad económica.

### ETAPA 3 — FÚTBOL SEMIPROFESIONAL

- Contratos más complejos.
- Agentes y representantes.
- Cantera.
- Desarrollo de jóvenes promesas.
- Negociaciones de traspasos.
- Patrocinadores importantes.
- Mayor atención mediática.

### ETAPA 4 — FÚTBOL PROFESIONAL

- Mercado de fichajes completo.
- Derechos de imagen.
- Grandes contratos.
- Departamentos de marketing y scouting.
- Gestión de instalaciones avanzadas.
- Competición nacional.
- Mayor presión de aficionados y prensa.

### ETAPA 5 — ÉLITE

- Grandes competiciones.
- Operaciones millonarias.
- Estrellas internacionales.
- Gestión empresarial compleja.
- Reputación internacional.
- Construcción de una marca global.
- Posibilidad de crear una estructura futbolística propia.

Estas etapas son orientativas. Diseña una progresión equilibrada que permita desbloquear mecánicas gradualmente sin hacer que las primeras horas sean aburridas.

El desbloqueo de mecánicas debe tener sentido narrativo y económico.

## 4. SISTEMA DE FÚTBOL Y PARTIDOS

Esta es una parte fundamental del juego.

Quiero que los partidos sean visuales y que el jugador pueda ver jugar a su equipo.

No quiero que el resultado se calcule simplemente mediante una tirada aleatoria de goles.

El partido debe simular comportamientos individuales y colectivos.

Características:

- Campo de fútbol visualizado en 2D.
- Jugadores que se desplazan autónomamente.
- Posesión y circulación del balón.
- Pases, controles, regates y disparos.
- Desmarques y movimientos sin balón.
- Duelos individuales.
- Defensa zonal e individual.
- Presión y repliegue.
- Porteros con comportamientos propios.
- Faltas, tarjetas, lesiones y fueras de juego.
- Estadísticas en directo.
- Sustituciones.

El usuario es el entrenador, no controla directamente a los futbolistas.

Debe poder:

- Preparar la táctica antes del encuentro.
- Seleccionar formación y alineación.
- Asignar roles.
- Dar instrucciones individuales.
- Ordenar marcajes específicos.
- Cambiar el planteamiento durante el partido.
- Dar órdenes colectivas.
- Activar señales tácticas previamente preparadas.
- Hablar con jugadores y modificar su comportamiento.

Quiero tres tipos de órdenes:

1. Instrucciones permanentes.
2. Órdenes temporales.
3. Señales tácticas coordinadas que impliquen a varios futbolistas.

Las instrucciones deben modificar la IA y las decisiones de los futbolistas, nunca regalar bonificaciones arbitrarias.

## 5. SISTEMA DE ATRIBUTOS DE LOS FUTBOLISTAS

Diseña un sistema de estadísticas interrelacionadas.

Quiero atributos:

- Técnicos.
- Físicos.
- Mentales.
- Psicológicos.

Cada jugador debe tener:

- Atributos individuales.
- Posiciones y roles preferidos.
- Potencial.
- Edad.
- Estado físico.
- Fatiga.
- Moral.
- Confianza.
- Personalidad.
- Disciplina.
- Tendencias de comportamiento.
- Valor de mercado.
- Salario.
- Situación contractual.

Los atributos deben influir directamente en el comportamiento de la IA y en las acciones durante los partidos.

No quiero jugadores que sean simplemente una colección de números.

Quiero futbolistas con personalidad, virtudes, defectos y comportamientos reconocibles.

## 6. MERCADO DE FICHAJES Y NEGOCIOS

El mercado de fichajes debe ser un sistema jugable y progresivamente más complejo.

Mecánicas:

- Buscar futbolistas.
- Descubrir talentos.
- Negociar fichajes.
- Negociar salarios.
- Contratos.
- Cesiones.
- Traspasos.
- Cláusulas.
- Representantes.
- Comisiones.
- Renovaciones.
- Venta de jugadores.
- Desarrollo de jóvenes para venderlos posteriormente.

Quiero que el jugador pueda desarrollar una estrategia empresarial propia.

Por ejemplo:

- Comprar jóvenes baratos y venderlos más caros.
- Formar jugadores de cantera.
- Buscar jugadores infravalorados.
- Construir un equipo competitivo con pocos recursos.
- Convertirse en un club vendedor.
- Apostar por estrellas veteranas.
- Construir una plantilla equilibrada a largo plazo.

Los jugadores deben tener un valor de mercado dinámico influido por su rendimiento, edad, potencial, reputación, contrato y demanda.

El sistema debe evitar que el jugador pueda enriquecerse abusando de una única mecánica.

## 7. ECONOMÍA Y GESTIÓN EMPRESARIAL

El dinero debe ser una mecánica importante.

Ingresos:

- Entradas.
- Abonos.
- Patrocinios.
- Merchandising.
- Premios deportivos.
- Traspasos.
- Derechos audiovisuales.
- Eventos.
- Otros negocios del club.

Gastos:

- Salarios.
- Fichajes.
- Instalaciones.
- Personal.
- Mantenimiento.
- Viajes.
- Formación.
- Marketing.
- Representantes y comisiones.

Quiero una economía sencilla al principio y progresivamente más profunda.

El usuario debe poder decidir si reinvierte el dinero en:

- Mejorar la plantilla.
- Mejorar instalaciones.
- Contratar personal.
- Marketing.
- Cantera.
- Scouting.
- Infraestructuras.

## 8. MARKETING, REPUTACIÓN Y AFICIÓN

El marketing no debe ser una simple estadística.

Debe existir una relación entre:

- Resultados deportivos.
- Reputación del club.
- Popularidad de los jugadores.
- Identidad del equipo.
- Afición.
- Patrocinadores.
- Asistencia al estadio.
- Venta de merchandising.

Ejemplos de decisiones:

- Crear una campaña para promocionar a un jugador.
- Fichar a un futbolista popular aunque no sea especialmente bueno.
- Organizar eventos.
- Negociar patrocinadores.
- Mejorar la imagen del club.
- Expandir la marca.
- Gestionar polémicas públicas.

El marketing debe poder generar ingresos, pero también riesgos y situaciones cómicas.

## 9. ENTRENADOR Y PROGRESIÓN RPG

El propio entrenador debe evolucionar.

Quiero un sistema de progresión mediante experiencia y habilidades.

Posibles especializaciones:

- Táctica.
- Desarrollo de jugadores.
- Motivación.
- Negociación.
- Scouting.
- Gestión económica.
- Liderazgo.
- Marketing.

Las habilidades desbloquean nuevas posibilidades y mejoran la capacidad del entrenador.

No quiero que todo dependa exclusivamente del dinero.

El conocimiento y la experiencia deben importar.

## 10. EVENTOS Y NARRATIVA EMERGENTE

El mundo debe generar acontecimientos.

Ejemplos:

- Jugadores descontentos.
- Problemas de vestuario.
- Rumores de fichajes.
- Ofertas inesperadas.
- Lesiones.
- Polémicas.
- Patrocinadores excéntricos.
- Conflictos con la directiva.
- Aficionados enfadados.
- Jugadores que se convierten en ídolos.

Los acontecimientos deben tener consecuencias mecánicas.

Quiero que cada partida genere historias distintas.

## 11. PRINCIPIOS DE DISEÑO

Prioridades:

1. Diversión antes que realismo absoluto.
2. Sistemas interconectados.
3. Progresión satisfactoria.
4. Decisiones con consecuencias.
5. Personalidad y humor.
6. Partidos visuales e interesantes.
7. Gestión económica comprensible.
8. Interfaz sencilla.
9. Rejugabilidad.
10. Evitar complejidad innecesaria.

No quiero implementar todas las mecánicas desde el primer momento.

El juego debe comenzar con un núcleo pequeño, funcional y divertido, y ampliarse progresivamente.

## 12. TU PRIMERA TAREA: DISEÑO, NO PROGRAMACIÓN

Antes de escribir código, quiero que prepares:

- **A.** Un Game Design Document (GDD) completo.
- **B.** Un mapa de sistemas y sus interdependencias.
- **C.** Una propuesta de arquitectura técnica.
- **D.** Un modelo de datos para jugadores, clubes, contratos, partidos y economía.
- **E.** Una propuesta de progresión y desbloqueo de mecánicas.
- **F.** Un diseño del motor de simulación de partidos.
- **G.** Un diseño de la economía y el mercado de fichajes.
- **H.** Una propuesta de interfaz y experiencia de usuario.
- **I.** Un plan de desarrollo dividido en hitos pequeños y verificables.
- **J.** Un prototipo mínimo jugable que permita comprobar que el concepto funciona.

No implementes todos los sistemas simultáneamente.

Identifica dependencias, riesgos técnicos y posibles problemas de equilibrio.

Cuando haya varias alternativas, compara sus ventajas e inconvenientes y recomienda una.

Si faltan decisiones de diseño, pregúntame antes de asumir cosas importantes.

**IMPORTANTE:** Quiero construir un videojuego real, no una demostración visual llena de botones que no hacen nada. Cada mecánica implementada debe tener lógica, consecuencias y conexión con los demás sistemas.
