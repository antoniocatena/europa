# EUROPA — contexto del proyecto (handoff desde Cowork)

Este archivo resume todo lo trabajado en una sesión anterior de Claude (Cowork,
en un sandbox en la nube) para que Claude Code tenga contexto completo al
retomar este repo. No es un README para usuarios finales — es una nota interna
de continuidad.

## Qué es esto

Juego 3D de navegador (Three.js, un solo archivo HTML autocontenido) llamado
**"EUROPA: Primer Contacto"**. Protagonista: EXP-07, un robot humanoide que
cae en Europa (la luna de Júpiter) en una cápsula que se estrella.

### Arco narrativo (ya implementado, jugable de punta a punta)

1. **Europa**: recolectar 10 piezas de la nave dispersas por el hielo,
   volver a la cápsula, repararla. Hay grietas de hielo que dañan energía
   (saltar para cruzarlas sin daño).
2. **Júpiter**: la cápsula despega, aterriza en las nubes altas de Júpiter.
   Pelea contra un alien (jefe único). Al derrotarlo, EXP-07 gana un
   **cañón de plasma** que se fusiona a su brazo (reemplaza el blaster de
   muñeca, hace 3x de daño, con animación de onda de plasma).
3. **Urano**: segunda pelea, un alien más grande y letal.
4. **Saturno**: última etapa. Un **enjambre de 12 mini aliens** ataca entre
   los anillos de Saturno. Se ve también el **cinturón de asteroides** de
   fondo (decorativo, entre Marte y Júpiter). Al eliminar el enjambre entero,
   pantalla de "MISIÓN CUMPLIDA".

Todo esto está **implementado, buildeado y testeado** (Playwright headless,
`test_curved_full.js` corre el playthrough completo Europa→Júpiter→Urano→
Saturno→victoria sin errores).

## Arquitectura técnica (importante antes de tocar código)

- **`game3d.js`** es el archivo fuente principal (~2000 líneas). Todo el
  juego vive ahí: física, IA de los aliens, cámara, HUD, minimapa, estados.
- **`index3d.html`** es el shell HTML/CSS (overlay de historia, HUD, estilos).
- **`three.min.js`** es Three.js r128 vendorizado (self-hosted).
- **`build.js`** es un script de Node que INLINEA `index3d.html` +
  `three.min.js` + `game3d.js` en un solo HTML autocontenido. Se corre así:
  ```
  node build.js EUROPA-2025-3D.html
  ```
  **Nunca edites `EUROPA-2025-3D.html` (ni `index.html`, que es una copia
  del mismo build) directamente** — son artefactos generados. Editá
  `game3d.js` / `index3d.html` y volvé a buildear.
- **`index.html`** en este repo es una copia del build de
  `EUROPA-2025-3D.html`, pensada para que GitHub Pages la sirva como raíz
  del sitio (hay un `CNAME` con `antoniocatena.com`). Si cambia el nombre
  del archivo principal del build, actualizar `index.html` también (o
  cambiar `build.js` para que buildee directo a `index.html`).

### Patrón "física plana, render curvo"

Todos los mundos (Europa, Júpiter, Urano, Saturno) son esferas de verdad
visualmente, pero toda la lógica de juego (movimiento, colisiones, hitscan)
sigue operando en coordenadas planas `(x, z)`. Funciones clave:

- `sphereFrame(x, z, w, d, radius)`: convierte una coordenada plana en
  posición 3D + orientación sobre la esfera (composición de dos rotaciones
  de eje pequeño). Válida solo para arenas acotadas (no hay wraparound
  completo — se implementó una vez y se revirtió a pedido explícito del
  usuario, ver historial más abajo).
- `placeOnSphere(obj, frame, height, yaw)`: posiciona cualquier
  `THREE.Object3D` usando el resultado de `sphereFrame`/`currentFrame`.
- `buildCurvedGround(w, d, radius, segW, segD, heightFn, marginX, marginZ)`:
  genera la geometría de terreno curvo custom.

### Sistema de combate

- **Jefes únicos** (Júpiter, Urano): variables globales `boss` / `bossMesh`
  / `bossGroup`, reasignadas en cada transición. `damageAlien()`,
  `firePlayerWeapon()` (hitscan por raycast), `fireAlienProjectile()` /
  `updateAlienBolts()` (proyectiles del alien), `updateAlien(dt)` (IA).
- **Enjambre de Saturno**: sistema completamente separado y en paralelo
  (array `miniAliens`, NO reutiliza `boss`/`bossMesh`) para no arriesgar
  romper la lógica ya afinada de los jefes. Funciones: `damageMiniAlien()`,
  `updateMiniAliens(dt)`, `checkSaturnSwarmDefeated()`. `firePlayerWeapon()`
  tiene una rama `if(missionStage === 'saturn')` que raycastea contra todos
  los mini aliens vivos y golpea al más cercano dentro de su radio.
- `PLASMA_CANNON_DAMAGE_MULT = 3`, `spawnPlasmaWave(origin, hitPoint)` para
  el efecto visual del cañón (cilindro + ondas de choque).
- `WORLD_GRAVITY = { europa: -26, jupiter: -46, uranus: -34, saturn: -28 }`,
  `JUMP_SPEED = 9.5` fijo — la altura de salto sale proporcional a la
  gravedad de cada mundo.

### Máquina de estados

`state`: `title → intro → playing → transition → combat → reward →
transition2 → combat → reward → transition3 → combat → saturnVictory → win`
(o `gameover` si la energía llega a 0). `missionStage`:
`'europa' | 'jupiter' | 'uranus' | 'saturn'`.

### Debug hooks

`window.__debug` expone `player`, `parts`, `miniAliens`, `getBoss()`,
`getMissionStage()`, `firePlayerWeapon`, `damageAlien`, `damageMiniAlien`,
`beginTransition` / `beginTransitionToUranus` / `beginTransitionToSaturn`,
`getSaturnAliveCount()`, `getTransition3()`, etc. — usados por
`test_curved_full.js` para testear sin depender de input real de mouse/
teclado. Si agregás features nuevas, agregá los hooks correspondientes ahí.

## Testing

`test_curved_full.js` es un script de Playwright (headless Chromium,
software rendering vía swiftshader) que corre el playthrough completo y
saca screenshots. Se corre así:

```
node build.js EUROPA-2025-3D.html
node test_curved_full.js
```

**Ojo con el rendering headless**: es lento (~300ms por frame en este
entorno), y `dt` está cappeado a 0.05 por frame — hay que dar presupuestos
de espera generosos en los polls de estado (ver los loops de `for` con
`waitForTimeout` en el test). Un estado "trabado" casi siempre es esto, no
un bug real — antes de asumir bug, aumentar el número de iteraciones del
poll.

**Cuidado con el hitscan en el enjambre de Saturno en tests**: los 12 mini
aliens están parados en anillo, bastante cerca entre sí. Un raycast apuntado
a uno puede pegarle a un vecino más cercano (mismo criterio de "closest hit"
que usa el juego real). Para testear daño al enjambre, verificar la salud
TOTAL del enjambre antes/después, no la salud de un alien específico por
índice — así se validó en `test_curved_full.js`.

## Historial relevante (bugs ya resueltos, no reabrir)

- Bug de "dome" visual en Europa (piso curvo con artefacto raro) — resuelto.
- Pies hundidos en el piso (ruido de altura del terreno muy amplio) —
  resuelto, amplitud reducida.
- Júpiter/Urano (los planetas de fondo, no las arenas) se quedaban
  "gigantes" superpuestos a la arena de combate porque el cutscene de
  llegada los acerca ("looming") pero nunca los alejaba de nuevo al empezar
  el combate real — resuelto con `setXDistant()` al entrar en combate. Este
  mismo patrón se replicó para Saturno (`setSaturnDistant()` al entrar en
  combate, `setSaturnLooming()` durante el cutscene de llegada).
- Se implementó wraparound completo (dar la vuelta al mapa) en Europa a
  pedido del usuario, y LUEGO se revirtió por completo a pedido explícito
  ("cambiala por el modelo anterior"). No reintroducir sin que el usuario
  lo pida de nuevo.
- Bug real encontrado y corregido en esta última sesión: el enjambre de
  Saturno nunca disparaba la victoria porque `checkSaturnSwarmDefeated()`
  solo se llamaba en el instante del golpe de gracia (cuando la animación
  de hundimiento del último alien recién empieza, no terminó) — se agregó
  una segunda llamada dentro de `updateMiniAliens(dt)` cuando la animación
  de muerte realmente termina.

## Estado del repo de GitHub — IMPORTANTE, esto es la razón del handoff

- Remote: `git@github.com:antoniocatena/europa.git` (repo público).
- `CNAME` → `antoniocatena.com` (GitHub Pages con dominio custom).
- El repo remoto en este momento SOLO tiene `README.md` y `CNAME` (2
  commits). **Los archivos del juego todavía no están commiteados ni
  pusheados** — están acá, listos para agregar.
- **Por qué se cambió a Claude Code**: la sesión de Cowork en la nube tiene
  un proxy de git que exige autorizar cada repo explícitamente como "fuente"
  de la sesión antes de poder hacer push (se intentó, se confirmó con un
  push de prueba a una rama descartable, rechazado con: *"antoniocatena/europa
  is not in this session's authorized repository set"*). Claude Code corre
  local con las credenciales de git del usuario, así que no debería tener
  esta restricción — usá tu flujo normal de `git add / commit / push`.

## Qué falta / próximos pasos sugeridos

1. Decidir estructura final del repo (¿el `index.html` autocontenido en la
   raíz alcanza para GitHub Pages, o preferís separar `game3d.js` /
   `three.min.js` como archivos servidos aparte en vez de inlineados? Ahora
   mismo `index.html` es un build inlineado — funciona standalone pero pesa
   ~700KB).
2. ~~Primer commit~~ — hecho (commit `cab7333`, pusheado). Verificado en vivo
   que GitHub Pages sirve el juego en `antoniocatena.com`.
3. Seguir iterando sobre pedidos del usuario (Antonio), haciendo un commit +
   push por cada hito que valga la pena, como pidió explícitamente.

## Soporte mobile (agregado en esta sesión)

Se agregaron controles táctiles completos para que el juego sea jugable en
celulares, sin tocar la lógica de input de desktop (todo es aditivo):

- **Aspect ratio**: `#stage` en `index3d.html` usaba `width:960px;height:600px;
  max-width:100vw;max-height:100vh` — en pantallas angostas esto rompía la
  proporción 8:5 porque ancho y alto se clampeaban de forma independiente.
  Se cambió a la técnica `width:min(960px,100vw,100vh*8/5)` /
  `height:min(600px,100vh,100vw*5/8)` para que siempre preserve el aspect
  ratio (letterbox en vez de estirar).
- **Bug real encontrado y corregido**: `renderer.setSize(VIEW_W, VIEW_H)` (sin
  el tercer argumento) hace que Three.js fije `canvas.style.width/height` en
  960px/600px inline, pisando el `width:100%;height:100%` del CSS — el canvas
  se desbordaba del `#stage` en cualquier pantalla más chica que 960×600 (esto
  ya pasaba en desktop con ventanas chicas, no era exclusivo de mobile). Fix:
  `renderer.setSize(VIEW_W, VIEW_H, false)` — el `false` le dice a Three.js
  que no toque el CSS, solo el buffer interno de dibujo.
- **Controles táctiles** (todo en `game3d.js`, bloque `if(IS_TOUCH){...}`
  después de los listeners de teclado): joystick virtual (`#joyZone` — mitad
  izquierda de la pantalla, dinámico, aparece donde tocás) que alimenta
  `touchMove.{x,z}`, sumado a `mx`/`mz` junto con las teclas WASD en el update
  loop. Drag en `#lookZone` (toda la pantalla) rota cámara igual que
  `mousemove` pero sin pointer lock (no aplica en touch). Botones `#jumpBtn` /
  `#fireBtn` alimentan `touchJump` / `fireHeld`. `IS_TOUCH` se detecta una
  sola vez con `'ontouchstart' in window || navigator.maxTouchPoints>0`.
  Debug hook agregado: `window.__debug.getTouchInput()`.
- **CSS responsive**: media query `(max-width:640px), (max-height:520px)`
  reduce fuentes/paddings y hace que `#overlay` (historia + botón "Iniciar
  descenso") sea scrolleable con `justify-content:flex-start` — el texto de
  la historia ya era más alto que 600px incluso en desktop chico, así que
  el overflow-y:auto quedó *solo* en la media query para no cambiar el
  comportamiento en desktop grande (ahí el texto simplemente se sale
  visualmente del stage hacia el margen negro, como siempre).
- **Testing sin Playwright**: esta máquina no tiene `node`/`npm` instalados
  (a diferencia del sandbox de Cowork donde se armó `test_curved_full.js`).
  El build (`node build.js EUROPA-2025-3D.html`) se replicó a mano con
  `python3` (mismo string-replace que hace `build.js`) para no depender de
  Node. La verificación de los controles táctiles se hizo con el navegador
  del propio Claude Code: viewport mobile (`resize_window` a 375×812),
  eventos `Touch`/`TouchEvent` sintéticos vía `javascript_exec`, y chequeo de
  estado real del juego a través de `window.__debug`. Ojo: en ese navegador
  el loop de `requestAnimationFrame` sólo avanza cuando el tool pide un
  screenshot/interacción — un `wait` o un `javascript_exec` puro no pintan
  frames nuevos. Si algo "no se mueve" al testear ahí, tomar un screenshot
  antes de volver a leer el estado, no asumir que es un bug real.

## Nota sobre infraestructura

El usuario pidió que se le avise explícitamente si algún pedido futuro
requiere infraestructura nueva (base de datos, servidor, función lambda,
etc.) para poder habilitarla. Hasta ahora el único bloqueo de este tipo fue
el de acceso a GitHub descripto arriba (ya resuelto al pasar a Claude Code).
No hay otras necesidades de infraestructura identificadas todavía — el juego
es 100% cliente (un HTML autocontenido), sin backend.
