# Hojas de sprites de los futbolistas

Estas PNG **son el arte del juego**. El motor las carga, las apila por capas y repinta los
colores clave con la piel, el pelo y la equipación de cada jugador. Si retocas una PNG, el
cambio aparece en el juego sin tocar código.

Herramientas gratuitas que sirven: [LibreSprite](https://libresprite.github.io/),
[Pixelorama](https://orama-interactive.itch.io/pixelorama) o cualquier editor que guarde PNG
con transparencia (Aseprite también, si lo tienes).

## Rejilla

Todas las hojas tienen la misma rejilla (ver `manifest.json`):

- **Celda**: 48 × 48 px. Cabeza en las filas 4–11, camiseta 13–24, pantalón 25–29, piernas hasta la 44 y botas 45–47 (los pies apoyan abajo).
- **Columnas** (20 fotogramas): `idle0 idle1 run0 run1 run2 run3 kick up0 up1 out ear slideU fallU diveU poke head push kneel throw catch` (correr, chutar, celebrar, segada, caída, estirada, entrada de pie, cabezazo, empujón, levantarse, saque de banda y portero con el balón).
- **Filas** (3 vistas): `front` (de cara a la cámara), `back` (de espaldas), `side` (perfil mirando a la derecha; la izquierda se obtiene volteando).
- Las celdas vacías no se usan (por ejemplo, no hay `kick` de frente).
- `slideU`, `fallU` y `diveU` se dibujan **de pie**: el juego las gira 90º al componer (entrada, caída y estirada).

## Capas y orden de pintado

De atrás adelante (cada carpeta es una capa; cada PNG, una variante):

| Capa | Variantes | Qué contiene |
|---|---|---|
| `arm_back` | complexión | brazo de detrás (manga + piel) |
| `hair_back` | peinado | pelo que queda detrás de la cabeza (melena, coleta, afro...) |
| `legs` | `socks`, `socksdown` | piernas, medias y botas |
| `shorts` | complexión | pantalón |
| `torso` | complexión × patrón | camiseta (`plain`, `stripes`, `hoops`, `half`, `sash`) |
| `head` | nariz | cuello, cabeza, ojos, boca |
| `facial` | vello facial | bigote, barba, perilla, sombra de barba |
| `hair_front` | peinado | pelo por encima de la cabeza |
| `acc` | accesorio | gafas, cinta |
| `arm_front` | complexión | brazo de delante |

**Complexiones**: masculinas `slim`, `normal`, `stocky`, `belly`; femeninas `fslim`, `fnormal`,
`fstocky` (hombros más estrechos, cintura marcada, cadera más ancha y pecho; de perfil, pecho y
glúteo). Las jugadoras usan siempre las femeninas.

**Poses (rodillas y codos)**: brazos y piernas no se dibujan como palos. El generador usa una persona
de referencia en 3D (`src/render/pixel/skeleton.ts`): ángulos de muslo, espinilla, brazo y antebrazo
para cada fotograma, con un ciclo de carrera clásico (contacto → paso → contacto → paso), y los
proyecta a cada vista. Para cambiar cómo corre o celebra alguien, toca esos ángulos y vuelve a hacer
el bake; para retocar un píxel concreto, edita la PNG.

**Escala**: en el juego nunca se escalan. Cada escena 3D se dibuja a baja resolución y se amplía
por un número entero de píxeles de la pantalla; los personajes van a un píxel de arte por píxel de
esa rejilla (no encogen con la distancia) y pegados a ella. Por eso la altura de cada uno se hace
con filas (quitando o repitiendo filas de torso y espinilla), no estirando la imagen. Los retratos de
la interfaz igual: siempre a múltiplos exactos de 48 px.

**Críos**: no hay hojas aparte. Al componer, el juego quita filas del abdomen y de las espinillas
según la edad (14 años = 7 filas menos) y los hace algo más bajitos: misma cabeza, cuerpo más
corto. Cada temporada crecen y vuelven poco a poco a las proporciones adultas.

El **dorsal** no está en las hojas: el juego lo estampa en la vista de espaldas con el color
del ribete de la camiseta. El **contorno oscuro** tampoco: se calcula después de apilar las
capas, así siempre envuelve la silueta final. No pintes contorno en las hojas.

## Colores clave

Pinta solo con estos colores (están en `paleta-clave.png`). El juego los sustituye:

| Rampa | luz | base | sombra | oscuro |
|---|---|---|---|---|
| piel | `#ffe0c0` | `#ffc090` | `#e09060` | `#b06040` |
| pelo | `#c8a8ff` | `#9070e0` | `#6040b0` | `#402080` |
| camiseta (color 1) | `#ff8080` | `#ff0000` | `#c00000` | `#800000` |
| camiseta (color 2, patrón) | `#80ff80` | `#00ff00` | `#00c000` | `#008000` |
| pantalón | `#8080ff` | `#0000ff` | `#0000c0` | `#000080` |
| medias | `#80ffff` | `#00ffff` | `#00c0c0` | `#008080` |
| botas | `#ff80ff` | `#ff00ff` | `#c000c0` | `#800080` |

Colores sueltos: ribete `#ffff00`, accesorio (cinta, coletero) `#ff8000`, labios `#ff0080`,
sombra de barba `#c06080`.

Cualquier otro color se respeta tal cual (ojos `#1a1226`, boca abierta `#5a1820`, montura de
gafas `#20232a`, cristal `#8fd3ff`...). Úsalo para detalles que no deban cambiar.

## Regenerar la base

```bash
npm run bake:sprites
```

Solo crea las hojas que falten. Para regenerar las que siguen tal cual las dejó el generador
(las que **hayas retocado a mano se respetan** y el script te avisa de cuáles son):

```bash
npm run bake:sprites -- --force
```

Para pisarlas todas, también las retocadas:

```bash
npm run bake:sprites -- --force --pisar-retoques
```

El script sabe qué está retocado porque guarda la huella de lo que generó en `generadas.json`.

**¿Se ve el cambio al momento?** Con `npm run dev` abierto, guardar una PNG recarga el juego solo.
La versión publicada en la web no: hay que volver a construirla y publicarla.

Para añadir un peinado, un patrón de camiseta o una complexión nuevos: añade la variante al
tipo correspondiente en `src/content/look.ts`, su dibujo en `src/render/pixel/sprites.ts`,
ejecuta el bake y retoca la PNG resultante.
