## Athlete App (/athlete) con la estética de la landing (/) — mockups de alta fidelidad

Vista previa de cómo se verá `/athlete` cuando se implemente el cambio estético. **No se modificó código de la app**: todo vive en esta carpeta.

- [`index.html`](index.html): todas las pantallas, ANTES | DESPUÉS lado a lado, en claro y en oscuro.
- `pantallas/<id>.html`: un mockup DESPUÉS por pantalla (toggle claro/oscuro abajo a la derecha; también `#dark` en la URL).
- `antes/<id>.html`: el mismo DOM con el CSS actual (sirve para comparar y para las pantallas sin captura).
- `png/antes/` y `png/despues/`: `<id>-<movil|desktop>-<light|dark>.png` (390×844 @2x y 1280×800).
- `tools/`: scripts que generan todo lo anterior (reproducible, ver [Cómo se regenera](#cómo-se-regenera)).

### Cómo se construyó (fidelidad)

Los mockups no se dibujaron a mano ni se transcribió el JSX de memoria: **cada HTML es el DOM que renderiza el JSX real**, con las mismas clases, textos e íconos (los SVG de `icons.tsx`/lucide salen tal cual del render).

1. **Captura del ANTES** (`tools/capture.mjs`): Playwright entra con el alumno de prueba (`FE_alumno_mail` / `FE_alumno_password`, leídas solo de `process.env`; `storageState` en el temporal del sistema, fuera del repo) en `npm run dev` y recorre cada pantalla. Guarda el PNG, el DOM serializado y la caja de cada bloque.
   - **Solo lectura garantizada por red**: toda petición a Supabase que no sea `GET`/`HEAD` (salvo el login y la RPC de lectura `feriados_en_rango`) se aborta. En los 41 escenarios (86 capturas) no se intentó ni una escritura.
   - **Datos de ejemplo genéricos** (`tools/fixtures.mjs`): las lecturas de perfil, plan, días, ejercicios e historial se responden en el navegador con datos neutros («Lucía Fernández», «PLAN GENERAL», 10 ejercicios comunes, 6 sesiones). Así hay un día con **superserie + aproximación**, uno con **drop set + unilateral** y uno con superserie de hombros, sin tocar datos reales. El alumno de prueba real no aparece en ninguna captura (el script falla si encuentra su nombre o su email en pantalla).
   - Estados locales (onboarding, vista Técnica, membresía vencida, cuestionario completado) se siembran en el `localStorage` del navegador de captura; offline con `context.setOffline(true)`; «cargando» dejando colgada la lectura correspondiente.
2. **Render desde el código** (`tools/ssr.tsx`, `tools/cliente/`): los estados que en la app solo aparecen **escribiendo datos** (registrar una serie → temporizador de descanso y aviso de récord; reportar molestia → banner; terminar la sesión → cierre de día) y los componentes **que no están montados en ninguna ruta** se renderizan con `react-dom` a partir del mismo componente, y se insertan en el DOM capturado de su pantalla anfitriona. Figuran como «sin captura» en el inventario.
3. **DESPUÉS** (`tools/build.mjs` + `tools/propuesta.mjs`): sobre ese DOM se aplican solo los cambios de la tabla del Paso 1 (tokens + clases). El HTML usa Tailwind Play CDN **3.4.17** con el `theme.extend` de `tailwind.config.ts` copiado tal cual (sin plugins: el config no usa `tailwindcss-animate`), `globals.css` completo y sin cambios salvo el bloque `.theme-athlete`, que queda aislado en `<style id="propuesta">`. No se carga ninguna webfont: rige el mismo `fontFamily` del config.
4. **Verificación** (`tools/verify.mjs`, `tools/medir.mjs`): cada mockup se captura en el mismo viewport que su ANTES y se comparan las cajas de todos los bloques (`[data-testid]`, header, nav, main y sus hijos, botones, enlaces, títulos, inputs…) con tolerancia ±2 px. Además se mide el contraste WCAG de **todo** el texto visible, antes y después. Como control del método, el HTML del ANTES (CSS actual) se compara también contra la captura real.

### Paso 1 — Lenguaje visual de la landing → uso en athlete

| Aspecto | Landing (fuente) | Uso en /athlete (propuesta) |
|---|---|---|
| Fuente | `fontFamily.sans`: Geist, Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif · `mono`: Geist Mono, JetBrains Mono, Menlo, monospace (`tailwind.config.ts`). Geist **no se carga** (no hay `next/font` ni `@font-face`). | Igual. Ver [riesgo de fuente](#fuente-geist-propuesta-aparte-requiere-aprobación). |
| Títulos | `H2` (`kit.tsx:31`): `font-black leading-[0.98] tracking-tighter` | **T9**: h1/h2 ≥ 20 px pasan a `font-black tracking-tighter`, con el tamaño y el interlineado actuales (el `leading-[0.98]` cambiaría el alto de los bloques). |
| Texto de apoyo | `LEAD` (`kit.tsx:36`): `text-base leading-relaxed text-muted-foreground sm:text-lg` | No se aplica: las descripciones ya son `text-muted-foreground`; subir a `text-base`/`sm:text-lg` movería todo. |
| Micro-etiquetas | `MICRO_LABEL` (`kit.tsx:17`): `font-mono text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground` | **T8**: las etiquetas en mayúsculas sin fondo («Te toca hoy», «Tus días», «Rutina», «Peso», «Descanso»…) pasan a `font-mono tracking-[0.18em] font-semibold`, conservando tamaño y color. |
| Primary | `:root` `--primary: 240 5.9% 10%` (#18181B) · `.dark` `0 0% 98%` (#FAFAFA); `--primary-foreground` inverso; `--ring` #18181B / #D4D4D8 | **Se quitan** los overrides de `.theme-athlete` (azul 221 83% 53% / cian 199 89% 48%). |
| Fondo y tarjetas | `--background`/`--card`: #FFFFFF / #09090B | **Se quitan** `--background: 0 0% 98%` (#FAFAFA) y `--card`/`--popover` 7 % de GOZS-448. En oscuro las tarjetas se separan por borde, como en la landing. |
| Texto secundario | `--muted-foreground` #52525B / #A1A1AA · `--subtle-foreground` #71717A | Sin cambios (7.7:1 sobre el fondo nuevo en ambos modos; subtle 4.8:1 en claro). |
| Bordes y superficies | `--border` #E4E4E7 / #27272A · `--secondary` #F4F4F5 / #27272A | Sin cambios. |
| Estados soft | success/warning/danger soft de `:root`/`.dark` | Sin cambios (decisión 3). `--neutral-soft` de `.dark` es azul pizarra (217 33% 17%): en athlete pasa a zinc (`#27272A`) dentro de la propuesta. |
| Selección | `.landing-root ::selection { background: hsl(240 5% 52% / .4); color: currentColor }` | Se copia a `.theme-athlete ::selection` (con primary zinc, el `selection:text-primary` del `body` quedaría casi invisible sobre botones). |
| Radios | `--radius: 0.5rem`; botones `rounded-full`; tarjetas `rounded-2xl` (algunas `rounded-xl`) | **T5/T6/T7**: acciones, pestañas y segmentados en pastilla; **T12**: contenedores grandes `rounded-2xl`. |
| Sombras | Solo `BTN_PRIMARY`: `shadow-lg shadow-primary/20`; tarjetas planas con borde (sombra solo en hover de `.landing-card`) | **T5**: acciones principales con `shadow-lg shadow-primary/20`. El resto conserva sus sombras (no se agregan). |
| Separadores | `border-t border-border` | Ya es el patrón de athlete; sin cambios. |
| Botones | `BTN` (`min-h-[48px] rounded-full px-6 py-3 text-sm font-bold active:scale-[0.98]`), `BTN_PRIMARY` (+ `landing-shine`, `hover:-translate-y-0.5`), `BTN_GHOST` (borde, `hover:bg-secondary`), `BTN_XL` (`min-h-[56px]`) | Forma y color: sí. Alto: **se conserva el actual** (56 px `--target-quick` en las acciones de gimnasio, mínimo 48 px). `landing-shine` y `hover:-translate-y-0.5`: **no** (hover inexistente en táctil y el translate compite con `:active { scale: .98 }`). |
| Isla oscura | `figure.landing-media.dark` (`page.tsx:453`): la clase `.dark` re-escopa los tokens en un bloque | **T3**: la tarjeta «Te toca hoy» y el toast de cambio de día dejan `bg-[#0F172A] text-white` y usan `dark bg-background text-foreground`. |
| Movimiento | `landing-rise`, `landing-shine`, `landing-dot`, `landing-pop`, `active:scale-[0.98]`, marquesina, storytelling horizontal, character reveal, tachados, tilt, float | **Sí**: `active:scale-[0.98]` (ya existe en `.theme-athlete :active`), `landing-dot` en el chip «Online» (**T10**). **Opcional, no aplicado**: `landing-pop` para el sello de récord. **No**: `landing-rise` (retrasa la lectura entre series), `landing-shine`, marquesina, storytelling horizontal, character reveal, tachados, tilt, float. Todo respeta `prefers-reduced-motion`. |
| Ritmo | `CONTAINER` `max-w-7xl px-5 sm:px-8 lg:px-12`; secciones `pb-24 pt-8` | No se aplica: athlete es una app (`main` `max-w-md p-4`, `lg:max-w-2xl`); cambiar el contenedor rompería la paridad de layout. |
| Modo claro/oscuro | `:root` / `.dark` | Ambos modos verificados en todas las pantallas. |

### Paso 2 — Inventario de pantallas

«Captura» = estado real de la app (con datos de ejemplo servidos en el navegador). «Sin captura» = render del componente desde su código (no se alcanza sin escribir datos o no está montado).

| Grupo | Pantalla / estado | Fuente |
|---|---|---|
| Shell | Header, chip Online / Modo Avión, 4 pestañas (móvil), sidebar ≥ lg | Captura (`inicio`, `inicio-desktop`, `lw-superserie-desktop`, `*-offline`) |
| Shell | `error.tsx` | **Sin captura** (solo aparece si un componente lanza) |
| Inicio | Con datos · hoja «Hacer otro día» · sin plan · cargando · Modo Avión | Captura. **Hallazgo**: no hay estado de carga propio; mientras el plan no llega se muestra «Todavía no tenés un plan asignado». Un error de red se ve igual (se conserva el plan cacheado o, sin caché, el vacío). |
| Paywall | Membresía vencida: aviso en Inicio · detalle | Captura (estado sembrado localmente). `MembershipPaywall` como pantalla bloqueante no existe (ADR-001). |
| Entrenamiento en vivo | Aproximación · superserie (móvil y 1280) · por tiempo · drop set · unilateral · vista Técnica · Registro del día vacío · ajustes de vista · Modo Avión · popover de descanso | Captura. Incluye `ultima-vez`, `sugerencia-carga` y `tooltip-1rm` (vista Técnica). |
| Entrenamiento en vivo | Temporizador de descanso activo / en pausa · aviso de récord (Simple y Técnica) · banner de molestia leve / moderada / alta | **Sin captura** (requieren registrar una serie o reportar una molestia) |
| Entrenamiento en vivo | Registro del día **con series** | **No incluido**: requiere registrar series. El mismo tipo de filas se ve en «Historial · sesión expandida». |
| Modales | Notas del ejercicio · video del ejercicio · calentamiento/aproximación (vista Técnica) · reportar molestia | Captura (abiertos y cerrados sin confirmar) |
| Modales | Cierre de día | **Sin captura** (requiere terminar la sesión) |
| Modales | Calculadora de discos · subida de video | **Sin captura**: `PlateCalculatorModal` no está montado en ninguna ruta y `VideoUploadModal` está montado pero nada lo abre (`setVideoUploadModalData` solo se llama con `null`). |
| Historial | Con datos · sesión expandida · progreso (mini-dash) · vacío · Modo Avión | Captura |
| Progreso | Con datos (Simple y Técnica) · vacío · cargando · Modo Avión con datos guardados · Modo Avión sin datos | Captura |
| Clases | Sin clases · semana con clases · Modo Avión | Captura. «Con clases» usa el selector «Dataset demo» que la pantalla muestra hoy en producción. |
| Chat | Chat GOZS abierto (el botón flotante aparece en todas las pantallas de Entrenar) | Captura |
| Onboarding | Pasos 1, 2 y 3 | Captura |
| Cuestionario inicial | Formulario · resumen completado | Captura |
| Hábitos / Nutrición | `habit-tracker`, `nutrition-tracker` | **Sin captura**: no están montados en ninguna ruta de /athlete. Render en navegador con Supabase simulado (muestran sus valores por defecto). |

Observaciones fuera de alcance (no se tocaron): el Inicio y el live workout muestran un mensaje del coach que viene del dataset demo del chat (`coach-mock-data`), y Clases muestra el selector «Dataset demo» con alumnos de ejemplo, en modo real.

<!-- VERIFICACION:INICIO -->
### Verificación (Playwright, mismos viewports, tolerancia ±2 px)

Bloques = cajas comparadas en claro. «Fuera» = bloques con alguna diferencia de posición o tamaño > 2 px (claro / oscuro). Contraste = cantidad de textos que no llegan a AA, ANTES → DESPUÉS.

| Pantalla | Fuente | Bloques | Fuera ±2 px (claro / oscuro) | Fallas AA claro | Fallas AA oscuro |
|---|---|---|---|---|---|
| `inicio` | captura | 28 | 1 / 1 | 9 → 2 | 0 → 0 |
| `inicio (1280)` | captura | 28 | 1 / 1 | 9 → 2 | 0 → 0 |
| `inicio-sheet-otro-dia` | captura | 37 | 1 / 1 | 9 → 2 | 0 → 0 |
| `inicio-sin-plan` | captura | 19 | 0 / 0 | 4 → 2 | 0 → 0 |
| `inicio-cargando` | captura | 19 | 0 / 0 | 4 → 2 | 0 → 0 |
| `inicio-offline` | captura | 28 | 1 / 1 | 9 → 2 | 0 → 0 |
| `membresia-vencida` | captura | 45 | 1 / 1 | 12 → 5 | 0 → 0 |
| `membresia-vencida-banner` | captura | 33 | 1 / 1 | 11 → 4 | 0 → 0 |
| `chat-abierto` | captura | 45 | 1 / 1 | 11 → 0 | 1 → 0 |
| `onboarding-1` | captura | 23 | 0 / 0 | 4 → 2 | 0 → 0 |
| `onboarding-2` | captura | 35 | 1 / 1 | 10 → 2 | 0 → 0 |
| `onboarding-3` | captura | 35 | 1 / 1 | 11 → 4 | 0 → 0 |
| `lw-aproximacion` | captura | 51 | 19 / 19 | 8 → 1 | 1 → 0 |
| `lw-superserie` | captura | 52 | 3 / 3 | 7 → 1 | 0 → 0 |
| `lw-superserie (1280)` | captura | 52 | 3 / 3 | 7 → 1 | 0 → 0 |
| `lw-tiempo` | captura | 54 | 19 / 19 | 8 → 1 | 1 → 0 |
| `lw-dropset` | captura | 51 | 4 / 4 | 15 → 1 | 0 → 0 |
| `lw-unilateral` | captura | 50 | 4 / 4 | 9 → 1 | 1 → 0 |
| `lw-tecnica` | captura | 58 | 3 / 3 | 8 → 1 | 0 → 0 |
| `lw-registro-dia` | captura | 26 | 0 / 0 | 3 → 1 | 0 → 0 |
| `lw-ajustes` | captura | 70 | 37 / 37 | 8 → 1 | 1 → 0 |
| `lw-cuestionario` | captura | 47 | 0 / 0 | 1 → 1 | 0 → 0 |
| `lw-cuestionario-completado` | captura | 29 | 0 / 0 | 1 → 1 | 0 → 0 |
| `lw-offline` | captura | 51 | 19 / 19 | 8 → 1 | 1 → 0 |
| `lw-popover-descanso` | captura | 52 | 19 / 19 | 8 → 1 | 1 → 0 |
| `modal-notas` | captura | 56 | 19 / 19 | 8 → 1 | 1 → 0 |
| `modal-video` | captura | 57 | 4 / 4 | 7 → 1 | 0 → 0 |
| `modal-calentamiento` | captura | 74 | 41 / 41 | 24 → 16 | 1 → 0 |
| `modal-molestia` | captura | 95 | 33 / 33 | 13 → 6 | 3 → 2 |
| `historial` | captura | 51 | 0 / 0 | 9 → 0 | 0 → 0 |
| `historial-detalle` | captura | 29 | 0 / 0 | 0 → 0 | 0 → 0 |
| `historial-dashboard` | captura | 25 | 1 / 1 | 0 → 0 | 0 → 0 |
| `historial-vacio` | captura | 19 | 0 / 0 | 0 → 0 | 0 → 0 |
| `historial-offline` | captura | 51 | 0 / 0 | 10 → 1 | 0 → 0 |
| `progreso` | captura | 23 | 0 / 0 | 4 → 4 | 0 → 0 |
| `progreso-tecnica` | captura | 31 | 10 / 10 | 4 → 4 | 0 → 0 |
| `progreso-vacio` | captura | 16 | 0 / 0 | 0 → 0 | 0 → 0 |
| `progreso-cargando` | captura | 16 | 0 / 0 | 0 → 0 | 0 → 0 |
| `progreso-offline` | captura | 24 | 0 / 0 | 4 → 4 | 0 → 0 |
| `progreso-offline-sin-datos` | captura | 14 | 0 / 0 | 0 → 0 | 0 → 0 |
| `clases` | captura | 29 | 1 / 1 | 0 → 0 | 0 → 0 |
| `clases-con-datos` | captura | 39 | 1 / 1 | 0 → 0 | 0 → 0 |
| `clases-offline` | captura | 29 | 1 / 1 | 0 → 0 | 0 → 0 |
| `aviso-record-tecnica` | sin captura | 60 | 3 / 3 | 8 → 1 | 0 → 0 |
| `aviso-record` | sin captura | 54 | 3 / 3 | 7 → 1 | 0 → 0 |
| `error` | sin captura | 18 | 0 / 0 | 0 → 0 | 0 → 0 |
| `habitos` | sin captura | 21 | 0 / 0 | 4 → 4 | 0 → 0 |
| `modal-calculadora-discos` | sin captura | 69 | 22 / 22 | 11 → 4 | 1 → 0 |
| `modal-cierre-dia` | sin captura | 69 | 18 / 18 | 13 → 7 | 0 → 0 |
| `modal-subida-video` | sin captura | 59 | 3 / 3 | 7 → 1 | 0 → 0 |
| `nutricion` | sin captura | 21 | 0 / 0 | 2 → 2 | 1 → 1 |
| `pain-banner-alto` | sin captura | 58 | 3 / 3 | 9 → 3 | 2 → 2 |
| `pain-banner-leve` | sin captura | 58 | 3 / 3 | 7 → 1 | 0 → 0 |
| `pain-banner-moderado` | sin captura | 58 | 3 / 3 | 9 → 3 | 0 → 0 |
| `rest-timer-pausa` | sin captura | 59 | 3 / 3 | 7 → 1 | 0 → 0 |
| `rest-timer` | sin captura | 59 | 3 / 3 | 7 → 1 | 0 → 0 |

#### Diferencias de layout por pantalla y su causa

Todas vienen de cambios estéticos documentados (ninguna de estructura). Una fila por bloque distinto (se listan una vez aunque aparezcan en ambos modos).

| Pantalla | Bloque | Diferencia | Causa |
|---|---|---|---|
| `inicio` | `hero-superserie-badge` «Circuito Violeta» | x +19 px | T8: «Te toca hoy» en mono es más ancho y corre el badge en la misma fila |
| `inicio (1280)` | `hero-superserie-badge` «Circuito Violeta» | x +19 px | T8: «Te toca hoy» en mono es más ancho y corre el badge en la misma fila |
| `inicio-sheet-otro-dia` | `hero-superserie-badge` «Circuito Violeta» | x +19 px | T8: «Te toca hoy» en mono es más ancho y corre el badge en la misma fila |
| `inicio-offline` | `hero-superserie-badge` «Circuito Violeta» | x +19 px | T8: «Te toca hoy» en mono es más ancho y corre el badge en la misma fila |
| `membresia-vencida` | `hero-superserie-badge` «Circuito Violeta» | x +19 px | T8: «Te toca hoy» en mono es más ancho y corre el badge en la misma fila |
| `membresia-vencida-banner` | `hero-superserie-badge` «Circuito Violeta» | x +19 px | T8: «Te toca hoy» en mono es más ancho y corre el badge en la misma fila |
| `chat-abierto` | `hero-superserie-badge` «Circuito Violeta» | x +19 px | T8: «Te toca hoy» en mono es más ancho y corre el badge en la misma fila |
| `onboarding-2` | `hero-superserie-badge` «Circuito Violeta» | x +19 px | T8: «Te toca hoy» en mono es más ancho y corre el badge en la misma fila |
| `onboarding-3` | `hero-superserie-badge` «Circuito Violeta» | x +19 px | T8: «Te toca hoy» en mono es más ancho y corre el badge en la misma fila |
| `lw-aproximacion` | `h2` «Sentadilla con barra» | y +1, ancho -10, alto -28 px | T9: con font-black tracking-tighter el título entra en 1 línea en vez de 2 (−28 px); todo lo de abajo sube 27 px |
| `lw-aproximacion` | `button` «150s» | x -3, y +1, ancho +3 px | T9: badge o chip en la misma fila que el título; se corre con el nuevo ancho del título |
| `lw-aproximacion` | `descanso-chip-…` «150s» | x -3, y +1, ancho +3 px | T9: badge o chip en la misma fila que el título; se corre con el nuevo ancho del título |
| `lw-aproximacion` | `label` «PESO» | y -27, ancho +5 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `lw-aproximacion` | `label` «REPETICIONES» | y -27, ancho +23 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `lw-aproximacion` | 14 bloques más (contenedores, tarjeta de serie, inputs y botones de abajo) | y -27 px | Arrastre vertical: se mueve con el bloque de arriba que cambió de alto (T8/T9) |
| `lw-superserie` | `h2` «Press banca plano» | y +1, ancho -8 px | T9: font-black tracking-tighter cambia el ancho del título (alto igual) |
| `lw-superserie` | `label` «PESO» | y +1, ancho +5 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `lw-superserie` | `label` «REPETICIONES» | y +1, ancho +23 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `lw-superserie (1280)` | `h2` «Press banca plano» | y +1, ancho -10 px | T9: font-black tracking-tighter cambia el ancho del título (alto igual) |
| `lw-superserie (1280)` | `label` «PESO» | y +1, ancho +5 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `lw-superserie (1280)` | `label` «REPETICIONES» | y +1, ancho +23 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `lw-tiempo` | `h2` «Plancha frontal» | y +1, ancho -8 px | T9: font-black tracking-tighter cambia el ancho del título (alto igual) |
| `lw-tiempo` | `badge-tipo-tiempo` «45s» | x -8, y +1 px | T9: badge o chip en la misma fila que el título; se corre con el nuevo ancho del título |
| `lw-tiempo` | `timer-ejercicio-tiempo` «TEMPORIZADOR DE EJERCICIO (45S)» | y +1, alto +12 px | T8: «TEMPORIZADOR DE EJERCICIO» en mono pasa a 2 líneas (+12 px) |
| `lw-tiempo` | `label` «PESO» | y +13, ancho +5 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `lw-tiempo` | `label` «TIEMPO (SEGUNDOS)» | y +13, ancho +27 px | T8: la etiqueta en mono + tracking-[0.18em] pasa a 2 líneas (+12/+16 px de alto) y arrastra lo de abajo |
| `lw-tiempo` | 14 bloques más (contenedores, tarjeta de serie, inputs y botones de abajo) | y 1 / 13 px | Arrastre vertical: se mueve con el bloque de arriba que cambió de alto (T8/T9) |
| `lw-dropset` | `h2` «Jalón al pecho» | y +1, ancho -7 px | T9: font-black tracking-tighter cambia el ancho del título (alto igual) |
| `lw-dropset` | `dropset-title-badge` «⚡ Drop Set» | x -7, y +1 px | T9: badge o chip en la misma fila que el título; se corre con el nuevo ancho del título |
| `lw-dropset` | `label` «PESO» | y +1, ancho +5 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `lw-dropset` | `label` «REPETICIONES» | y +1, ancho +23 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `lw-unilateral` | `h2` «Zancada búlgara» | y +1, ancho -7 px | T9: font-black tracking-tighter cambia el ancho del título (alto igual) |
| `lw-unilateral` | `badge-unilateral` «c/lado» | x -7, y +1 px | T9: badge o chip en la misma fila que el título; se corre con el nuevo ancho del título |
| `lw-unilateral` | `label` «PESO» | y +1, ancho +5 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `lw-unilateral` | `label` «REPETICIONES» | y +1, ancho +23 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `lw-tecnica` | `h2` «Press banca plano» | y +2, ancho -8 px | T9: font-black tracking-tighter cambia el ancho del título (alto igual) |
| `lw-tecnica` | `label` «PESO» | y +2, ancho +5 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `lw-tecnica` | `label` «REPETICIONES» | y +2, ancho +23 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `lw-ajustes` | `h2` «Sentadilla con barra» | y +1, ancho -10, alto -28 px | T9: con font-black tracking-tighter el título entra en 1 línea en vez de 2 (−28 px); todo lo de abajo sube 27 px |
| `lw-ajustes` | `button` «150s» | x -3, y +1, ancho +3 px | T9: badge o chip en la misma fila que el título; se corre con el nuevo ancho del título |
| `lw-ajustes` | `descanso-chip-…` «150s» | x -3, y +1, ancho +3 px | T9: badge o chip en la misma fila que el título; se corre con el nuevo ancho del título |
| `lw-ajustes` | `label` «PESO» | y -27, ancho +5 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `lw-ajustes` | `label` «REPETICIONES» | y -27, ancho +23 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `lw-ajustes` | `h2` «Configuración de la app» | y -8 px | T9: font-black tracking-tighter cambia el ancho del título (alto igual) |
| `lw-ajustes` | `button` «Cerrar configuración» | y -8 px | Arrastre: el panel centrado crece por la etiqueta de 2 líneas (T8) y se recentra (±8 px) |
| `lw-ajustes` | `label` «MODO DE VISUALIZACIÓN» | y -8 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `lw-ajustes` | `athlete-view-mode-container` «Vista Simple» | y -8 px | Arrastre: el panel centrado crece por la etiqueta de 2 líneas (T8) y se recentra (±8 px) |
| `lw-ajustes` | `athlete-toggle-vista-simple` «Vista Simple» | y -8 px | Arrastre: el panel centrado crece por la etiqueta de 2 líneas (T8) y se recentra (±8 px) |
| `lw-ajustes` | `athlete-toggle-vista-tecnica` «Vista Técnica» | y -8 px | Arrastre: el panel centrado crece por la etiqueta de 2 líneas (T8) y se recentra (±8 px) |
| `lw-ajustes` | `athlete-vista-recomendada-info` «Recomendada por tu coach: Simple» | y -8 px | Arrastre: el panel centrado crece por la etiqueta de 2 líneas (T8) y se recentra (±8 px) |
| `lw-ajustes` | `athlete-vista-recomendada-texto` «Recomendada por tu coach: Simple» | y -8 px | Arrastre: el panel centrado crece por la etiqueta de 2 líneas (T8) y se recentra (±8 px) |
| `lw-ajustes` | `label` «PASO DE INCREMENTO DE PESO (KILOS)» | y -8, alto +16 px | T8: la etiqueta en mono + tracking-[0.18em] pasa a 2 líneas (+12/+16 px de alto) y arrastra lo de abajo |
| `lw-ajustes` | `button` «±1.25 kg» | y +8 px | Arrastre: el panel centrado crece por la etiqueta de 2 líneas (T8) y se recentra (±8 px) |
| `lw-ajustes` | `button` «±2.5 kg» | y +8 px | Arrastre: el panel centrado crece por la etiqueta de 2 líneas (T8) y se recentra (±8 px) |
| `lw-ajustes` | `button` «±5 kg» | y +8 px | Arrastre: el panel centrado crece por la etiqueta de 2 líneas (T8) y se recentra (±8 px) |
| `lw-ajustes` | `button` «±10 kg» | y +8 px | Arrastre: el panel centrado crece por la etiqueta de 2 líneas (T8) y se recentra (±8 px) |
| `lw-ajustes` | `label` «Colapsar rutina en cascada» | y +8 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `lw-ajustes` | `toggle-colapsar-rutina` «Colapsar rutina en cascada» | y +8 px | Arrastre: el panel centrado crece por la etiqueta de 2 líneas (T8) y se recentra (±8 px) |
| `lw-ajustes` | `label` «PERFIL DEL ALUMNO» | y +8 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `lw-ajustes` | `tab-cuestionario` «Cuestionario Inicial» | y +8 px | Arrastre: el panel centrado crece por la etiqueta de 2 líneas (T8) y se recentra (±8 px) |
| `lw-ajustes` | `button` «Cerrar» | y +8 px | Arrastre: el panel centrado crece por la etiqueta de 2 líneas (T8) y se recentra (±8 px) |
| `lw-ajustes` | 14 bloques más (contenedores, tarjeta de serie, inputs y botones de abajo) | y -27 px | Arrastre vertical: se mueve con el bloque de arriba que cambió de alto (T8/T9) |
| `lw-offline` | `h2` «Sentadilla con barra» | y +1, ancho -10, alto -28 px | T9: con font-black tracking-tighter el título entra en 1 línea en vez de 2 (−28 px); todo lo de abajo sube 27 px |
| `lw-offline` | `button` «150s» | x -3, y +1, ancho +3 px | T9: badge o chip en la misma fila que el título; se corre con el nuevo ancho del título |
| `lw-offline` | `descanso-chip-…` «150s» | x -3, y +1, ancho +3 px | T9: badge o chip en la misma fila que el título; se corre con el nuevo ancho del título |
| `lw-offline` | `label` «PESO» | y -27, ancho +5 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `lw-offline` | `label` «REPETICIONES» | y -27, ancho +23 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `lw-offline` | 14 bloques más (contenedores, tarjeta de serie, inputs y botones de abajo) | y -27 px | Arrastre vertical: se mueve con el bloque de arriba que cambió de alto (T8/T9) |
| `lw-popover-descanso` | `h2` «Sentadilla con barra» | y +1, ancho -10, alto -28 px | T9: con font-black tracking-tighter el título entra en 1 línea en vez de 2 (−28 px); todo lo de abajo sube 27 px |
| `lw-popover-descanso` | `button` «150s» | x -3, y +1, ancho +3 px | T9: badge o chip en la misma fila que el título; se corre con el nuevo ancho del título |
| `lw-popover-descanso` | `descanso-chip-…` «150s» | x -3, y +1, ancho +3 px | T9: badge o chip en la misma fila que el título; se corre con el nuevo ancho del título |
| `lw-popover-descanso` | `label` «PESO» | y -27, ancho +5 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `lw-popover-descanso` | `label` «REPETICIONES» | y -27, ancho +23 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `lw-popover-descanso` | 14 bloques más (contenedores, tarjeta de serie, inputs y botones de abajo) | y -27 px | Arrastre vertical: se mueve con el bloque de arriba que cambió de alto (T8/T9) |
| `modal-notas` | `h2` «Sentadilla con barra» | y +1, ancho -10, alto -28 px | T9: con font-black tracking-tighter el título entra en 1 línea en vez de 2 (−28 px); todo lo de abajo sube 27 px |
| `modal-notas` | `button` «150s» | x -3, y +1, ancho +3 px | T9: badge o chip en la misma fila que el título; se corre con el nuevo ancho del título |
| `modal-notas` | `descanso-chip-…` «150s» | x -3, y +1, ancho +3 px | T9: badge o chip en la misma fila que el título; se corre con el nuevo ancho del título |
| `modal-notas` | `label` «PESO» | y -27, ancho +5 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `modal-notas` | `label` «REPETICIONES» | y -27, ancho +23 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `modal-notas` | 14 bloques más (contenedores, tarjeta de serie, inputs y botones de abajo) | y -27 px | Arrastre vertical: se mueve con el bloque de arriba que cambió de alto (T8/T9) |
| `modal-video` | `h2` «Press banca plano» | y +1, ancho -8 px | T9: font-black tracking-tighter cambia el ancho del título (alto igual) |
| `modal-video` | `label` «PESO» | y +1, ancho +5 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `modal-video` | `label` «REPETICIONES» | y +1, ancho +23 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `modal-calentamiento` | `h2` «Sentadilla con barra» | y +2, ancho -10, alto -28 px | T9: con font-black tracking-tighter el título entra en 1 línea en vez de 2 (−28 px); todo lo de abajo sube 27 px |
| `modal-calentamiento` | `button` «150s» | x -3, y +2, ancho +3 px | T9: badge o chip en la misma fila que el título; se corre con el nuevo ancho del título |
| `modal-calentamiento` | `descanso-chip-…` «150s» | x -3, y +2, ancho +3 px | T9: badge o chip en la misma fila que el título; se corre con el nuevo ancho del título |
| `modal-calentamiento` | `label` «PESO» | y -26, ancho +5 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `modal-calentamiento` | `label` «REPETICIONES» | y -26, ancho +23 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `modal-calentamiento` | `tooltip-1rm-trigger` «¿Qué es 1RM? Ver explicación» | y -26 px | T8: etiquetas en mono (en Windows Courier) dentro de cada tarjeta: otras métricas de fuente, +1 px por tarjeta que se acumula |
| `modal-calentamiento` | `h2` «Calculadora de Aproximación» | y -8 px | T9: font-black tracking-tighter cambia el ancho del título (alto igual) |
| `modal-calentamiento` | `label` «Peso de Trabajo Efectivo (kg):» | y -8 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `modal-calentamiento` | `button` «Cerrar» | y +8 px | Arrastre: el panel centrado crece por la etiqueta de 2 líneas (T8) y se recentra (±8 px) |
| `modal-calentamiento` | 31 bloques más (contenedores, tarjeta de serie, inputs y botones de abajo) | y -26 / -8 / 1 / 8 px | Arrastre vertical: se mueve con el bloque de arriba que cambió de alto (T8/T9) |
| `modal-molestia` | `h2` «Sentadilla con barra» | y +1, ancho -10, alto -28 px | T9: con font-black tracking-tighter el título entra en 1 línea en vez de 2 (−28 px); todo lo de abajo sube 27 px |
| `modal-molestia` | `button` «150s» | x -3, y +1, ancho +3 px | T9: badge o chip en la misma fila que el título; se corre con el nuevo ancho del título |
| `modal-molestia` | `descanso-chip-…` «150s» | x -3, y +1, ancho +3 px | T9: badge o chip en la misma fila que el título; se corre con el nuevo ancho del título |
| `modal-molestia` | `label` «PESO» | y -27, ancho +5 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `modal-molestia` | `label` «REPETICIONES» | y -27, ancho +23 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `modal-molestia` | `label` «SÍNTOMAS DE ALARMA (RED FLAGS)» | y -2, ancho +24, alto +16 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `modal-molestia` | `label` «Comentario opcional para el Coach:» | y +12 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `modal-molestia` | 26 bloques más (contenedores, tarjeta de serie, inputs y botones de abajo) | y -27 / 12 px | Arrastre vertical: se mueve con el bloque de arriba que cambió de alto (T8/T9) |
| `historial-dashboard` | `label` «EJERCICIO PARA ANALIZAR» | ancho +12 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `progreso-tecnica` | `main` «Mi progreso» | alto +4 px | T8: etiquetas en mono (en Windows Courier) dentro de cada tarjeta: otras métricas de fuente, +1 px por tarjeta que se acumula |
| `progreso-tecnica` | `section` «Mi progreso» | alto +4 px | T8: etiquetas en mono (en Windows Courier) dentro de cada tarjeta: otras métricas de fuente, +1 px por tarjeta que se acumula |
| `progreso-tecnica` | `tooltip-1rm-trigger` «¿Qué es 1RM? Ver explicación» | x +9, y +1 px | T8: etiquetas en mono (en Windows Courier) dentro de cada tarjeta: otras métricas de fuente, +1 px por tarjeta que se acumula |
| `progreso-tecnica` | `progreso-ejercicio` «Press banca plano» | y +3, alto +1 px | T8: etiquetas en mono (en Windows Courier) dentro de cada tarjeta: otras métricas de fuente, +1 px por tarjeta que se acumula |
| `progreso-tecnica` | `h3` «Press banca plano» | y +3 px | T9: font-black tracking-tighter cambia el ancho del título (alto igual) |
| `clases` | `h1` «Clases» | ancho -3 px | T9: font-black tracking-tighter cambia el ancho del título (alto igual) |
| `clases-con-datos` | `h1` «Clases» | ancho -3 px | T9: font-black tracking-tighter cambia el ancho del título (alto igual) |
| `clases-offline` | `h1` «Clases» | ancho -3 px | T9: font-black tracking-tighter cambia el ancho del título (alto igual) |
| `aviso-record-tecnica` | `h2` «Press banca plano» | y +2, ancho -8 px | T9: font-black tracking-tighter cambia el ancho del título (alto igual) |
| `aviso-record-tecnica` | `label` «PESO» | y +2, ancho +5 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `aviso-record-tecnica` | `label` «REPETICIONES» | y +2, ancho +23 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `aviso-record` | `h2` «Press banca plano» | y +1, ancho -8 px | T9: font-black tracking-tighter cambia el ancho del título (alto igual) |
| `aviso-record` | `label` «PESO» | y +1, ancho +5 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `aviso-record` | `label` «REPETICIONES» | y +1, ancho +23 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `modal-calculadora-discos` | `h2` «Sentadilla con barra» | y +1, ancho -10, alto -28 px | T9: con font-black tracking-tighter el título entra en 1 línea en vez de 2 (−28 px); todo lo de abajo sube 27 px |
| `modal-calculadora-discos` | `button` «150s» | x -3, y +1, ancho +3 px | T9: badge o chip en la misma fila que el título; se corre con el nuevo ancho del título |
| `modal-calculadora-discos` | `descanso-chip-…` «150s» | x -3, y +1, ancho +3 px | T9: badge o chip en la misma fila que el título; se corre con el nuevo ancho del título |
| `modal-calculadora-discos` | `label` «PESO» | y -27, ancho +5 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `modal-calculadora-discos` | `label` «REPETICIONES» | y -27, ancho +23 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `modal-calculadora-discos` | 17 bloques más (contenedores, tarjeta de serie, inputs y botones de abajo) | y -27 / 17 px | Arrastre vertical: se mueve con el bloque de arriba que cambió de alto (T8/T9) |
| `modal-cierre-dia` | `h2` «Press banca plano» | y +1, ancho -8 px | T9: font-black tracking-tighter cambia el ancho del título (alto igual) |
| `modal-cierre-dia` | `label` «PESO» | y +1, ancho +5 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `modal-cierre-dia` | `label` «REPETICIONES» | y +1, ancho +23 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `modal-cierre-dia` | `cierre-dia-card` «Sesión Guardada y Sincronizada» | y -8, alto +15 px | T8/T9 dentro de la tarjeta centrada de cierre: etiquetas mono y cifras font-black cambian el alto (+15 px) y el modal se recentra (−8 px) |
| `modal-cierre-dia` | `cierre-dia-close-btn` «Cerrar modal» | y -8 px | T8/T9 dentro de la tarjeta centrada de cierre: etiquetas mono y cifras font-black cambian el alto (+15 px) y el modal se recentra (−8 px) |
| `modal-cierre-dia` | `cierre-dia-titulo` «¡Gran entrenamiento, Lucía!» | y -8 px | T8/T9 dentro de la tarjeta centrada de cierre: etiquetas mono y cifras font-black cambian el alto (+15 px) y el modal se recentra (−8 px) |
| `modal-cierre-dia` | `hero-metric-summary-card` «SERIES» | y -8 px | T8/T9 dentro de la tarjeta centrada de cierre: etiquetas mono y cifras font-black cambian el alto (+15 px) y el modal se recentra (−8 px) |
| `modal-cierre-dia` | `hero-metric-series` «13/13» | x -3, y -7, ancho +5, alto -2 px | T8/T9 dentro de la tarjeta centrada de cierre: etiquetas mono y cifras font-black cambian el alto (+15 px) y el modal se recentra (−8 px) |
| `modal-cierre-dia` | `hero-metric-tiempo` «54 min» | x -3, y -7, ancho +6, alto -2 px | T8/T9 dentro de la tarjeta centrada de cierre: etiquetas mono y cifras font-black cambian el alto (+15 px) y el modal se recentra (−8 px) |
| `modal-cierre-dia` | `cierre-dia-racha-card` «Racha Semanal:» | y -8 px | T8/T9 dentro de la tarjeta centrada de cierre: etiquetas mono y cifras font-black cambian el alto (+15 px) y el modal se recentra (−8 px) |
| `modal-cierre-dia` | `racha-dias-valor` «4 días» | x -2, y -8, ancho +2 px | T8/T9 dentro de la tarjeta centrada de cierre: etiquetas mono y cifras font-black cambian el alto (+15 px) y el modal se recentra (−8 px) |
| `modal-cierre-dia` | `racha-incremento-badge` «+1 día hoy» | y -8 px | T8/T9 dentro de la tarjeta centrada de cierre: etiquetas mono y cifras font-black cambian el alto (+15 px) y el modal se recentra (−8 px) |
| `modal-cierre-dia` | `cierre-dia-ranking-constancia` «Impacto en Ranking de Constancia» | y -8 px | T8/T9 dentro de la tarjeta centrada de cierre: etiquetas mono y cifras font-black cambian el alto (+15 px) y el modal se recentra (−8 px) |
| `modal-cierre-dia` | `cierre-dia-prs-section` «🏆» | y -8, alto +15 px | T8/T9 dentro de la tarjeta centrada de cierre: etiquetas mono y cifras font-black cambian el alto (+15 px) y el modal se recentra (−8 px) |
| `modal-cierre-dia` | `cierre-dia-pr-item-0` «Press banca plano» | y -8, alto +15 px | T8/T9 dentro de la tarjeta centrada de cierre: etiquetas mono y cifras font-black cambian el alto (+15 px) y el modal se recentra (−8 px) |
| `modal-cierre-dia` | `tooltip-1rm-trigger` «¿Qué es 1RM? Ver explicación» | x +4, y +1 px | T8: etiquetas en mono (en Windows Courier) dentro de cada tarjeta: otras métricas de fuente, +1 px por tarjeta que se acumula |
| `modal-cierre-dia` | `cierre-dia-volver-athlete-btn` «Volver a Inicio (/athlete)» | y +7 px | T8/T9 dentro de la tarjeta centrada de cierre: etiquetas mono y cifras font-black cambian el alto (+15 px) y el modal se recentra (−8 px) |
| `modal-cierre-dia` | 1 bloques más (contenedores, tarjeta de serie, inputs y botones de abajo) | y -8 px | Arrastre vertical: se mueve con el bloque de arriba que cambió de alto (T8/T9) |
| `modal-subida-video` | `h2` «Press banca plano» | y +1, ancho -8 px | T9: font-black tracking-tighter cambia el ancho del título (alto igual) |
| `modal-subida-video` | `label` «PESO» | y +1, ancho +5 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `modal-subida-video` | `label` «REPETICIONES» | y +1, ancho +23 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `pain-banner-alto` | `h2` «Press banca plano» | y +1, ancho -8 px | T9: font-black tracking-tighter cambia el ancho del título (alto igual) |
| `pain-banner-alto` | `label` «PESO» | y +1, ancho +5 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `pain-banner-alto` | `label` «REPETICIONES» | y +1, ancho +23 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `pain-banner-leve` | `h2` «Press banca plano» | y +1, ancho -8 px | T9: font-black tracking-tighter cambia el ancho del título (alto igual) |
| `pain-banner-leve` | `label` «PESO» | y +1, ancho +5 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `pain-banner-leve` | `label` «REPETICIONES» | y +1, ancho +23 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `pain-banner-moderado` | `h2` «Press banca plano» | y +1, ancho -8 px | T9: font-black tracking-tighter cambia el ancho del título (alto igual) |
| `pain-banner-moderado` | `label` «PESO» | y +1, ancho +5 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `pain-banner-moderado` | `label` «REPETICIONES» | y +1, ancho +23 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `rest-timer-pausa` | `h2` «Press banca plano» | y +1, ancho -8 px | T9: font-black tracking-tighter cambia el ancho del título (alto igual) |
| `rest-timer-pausa` | `label` «PESO» | y +1, ancho +5 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `rest-timer-pausa` | `label` «REPETICIONES» | y +1, ancho +23 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `rest-timer` | `h2` «Press banca plano» | y +1, ancho -8 px | T9: font-black tracking-tighter cambia el ancho del título (alto igual) |
| `rest-timer` | `label` «PESO» | y +1, ancho +5 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |
| `rest-timer` | `label` «REPETICIONES» | y +1, ancho +23 px | T8: micro-etiqueta en mono + tracking-[0.18em] (solo cambia el ancho del texto) |

<!-- VERIFICACION:FIN -->

### Riesgos de contraste y cómo se resolvieron

Medido sobre el DOM real con los colores computados (fondo efectivo = composición de los fondos de los ancestros). Umbral AA: 4.5:1 texto, 3:1 texto grande y UI.

| Elemento | ANTES | DESPUÉS | Resolución |
|---|---|---|---|
| Pestaña / chip activo (texto) | blanco sobre azul 5.2:1 · oscuro sobre cian 6.2:1 | #FAFAFA/#18181B 17:1 · #18181B/#FAFAFA 17:1 | Tokens zinc |
| Pestaña activa vs barra (UI) | azul sobre #FAFAFA 5.0:1 | 17.7:1 claro · 19.1:1 oscuro | Tokens zinc |
| Día de hoy en la lista («Te toca hoy») | azul 5.0:1 | 17.7:1 claro | Tokens zinc |
| Tarjeta «Te toca hoy» | «Hacer otro día» **1.1:1**, «Te toca hoy» azul sobre #0F172A **3.5:1**, «4 ejercicios · ~37 min» **2.3:1** (claro) | 19:1 / 19:1 / 7.8:1 | **T3** isla `.dark` |
| Botón principal del live workout («Registrar serie») | blanco/azul 5.2:1 · oscuro/cian 6.2:1 | 17:1 en ambos modos | Tokens zinc + **T2** (`text-white` → `text-primary-foreground` en el ordinal activo, que en oscuro hubiera quedado blanco sobre #FAFAFA) |
| Barra del rest-timer: relleno vs pista (UI) | azul/cian sobre muted | 16.1:1 claro · 14.3:1 oscuro | Tokens zinc (`--rest-timer-fill-bg: var(--primary)`) |
| Barra del rest-timer en pausa (UI) | warning-soft-foreground sobre muted | 4.6:1 claro · 11.2:1 oscuro | Sin cambios (semántico) |
| Violeta de superserie / drop set sobre los fondos nuevos | `text-purple-300`/`200` sin variante `dark:` en claro: **1.1–1.8:1** (tag, banner y título del drop set, nombre del ejercicio seleccionado, ordinal) | Claro: 4.7–6.1:1 (tag superserie 5.7, banner 6.1, seleccionado sobre el tinte zinc 5.7, drop set 4.7–5.8) · Oscuro: 7.7–10.6:1 | **T11**: solo tono dentro de la familia purple (`purple-700`/`800` en claro; en oscuro no cambia) |
| Avatar «Tú» del chat (`bg-primary/30 text-primary-foreground`) | 1.5:1 claro y oscuro | 17:1 | **T13**: avatar sólido `bg-primary` |
| Ordinal sólido de superserie (`bg-purple-600 text-white`) | 5.4:1 | 5.4:1 | Sin cambios |
| Distinción violeta ↔ primary ↔ success | violeta vs azul (dos acentos fríos) | violeta es el **único** color cromático de la rutina: primary es neutro (zinc) y success verde | Mejora por sí sola |
| «No leído» (`text-success` sobre `success-soft`) | 3.2:1 | 3.2:1 | **Pendiente, fuera de alcance** (semántico, decisión 3). Sugerencia: `text-success-soft-foreground` (6.9:1). |
| Badges de tipo de serie W/F (`bg-amber-500`/`bg-rose-600` + `text-white`, vista Técnica) | 2.1:1 / 4.7:1 | igual | **Pendiente, fuera de alcance** (semántico). Sugerencia: texto oscuro sobre ámbar (`text-zinc-950`, 9.8:1); `bg-amber-600` con blanco tampoco alcanza (3.2:1). |

| Resto de fallas que quedan en el DESPUÉS (modo claro) | — | `text-success` / `text-warning` sobre blanco o sobre su soft (3.0–3.3:1): «No leído», racha, «Offline (Modo Avión)», tabla del calentamiento, carteles del modal de molestia; texto blanco sobre `bg-success` (badge de no leídos, «Hablar con GOZS») 3.3:1 | **Pendiente, fuera de alcance**: son los colores semánticos que la decisión 3 conserva y fallan igual hoy. En oscuro solo queda `text-destructive` (#DC2626) sobre fondos casi negros (3.8–4.1:1) en el modal de molestia, el banner de molestia alta y «Grasas» de Nutrición, también preexistente; sugerencia: `text-danger-soft-foreground` (#FCA5A5 en oscuro). |
| Badge fijo «Aproximación» (`fixed-warmup-badge`, modal de calentamiento) | 1.1:1: el `bg-secondary` de la variante del Badge le gana a `bg-amber-500` y queda texto blanco sobre gris | igual | **Bug preexistente**, no estético: el badge es invisible. Sugerencia: usar los tokens `warning-soft` como `warmup-tag`. |

El detalle de cada falla por pantalla (texto, ratio, colores) está en `tools/dom/_verificacion.json`.

#### Otros hallazgos del recorrido (no estéticos, no se tocaron)

- **`<button>` dentro de `<button>`** en el chip de descanso del live workout (`live-workout.tsx`, disparador del popover): HTML inválido; los lectores de pantalla y el foco por teclado lo tratan de forma inconsistente. El mockup lo reproduce tal cual (se reconstruye por DOM, ver `tools/anidados.mjs`).
- `/athlete/historial` cargado directo (sin pasar por Inicio) queda vacío aunque haya sesiones: depende de `planAlumno` cacheado, que solo carga Inicio.
- Inicio no tiene estado de carga: mientras el plan no llega muestra «Todavía no tenés un plan asignado».

### Fuente Geist (propuesta aparte, requiere aprobación)

El proyecto declara Geist / Geist Mono pero no las carga, así que tanto la landing como athlete se ven con la fuente del sistema. En Windows el stack mono cae en **Courier New** (serif), que es lo que se ve en las micro-etiquetas de los mockups y hoy en la landing. Para que athlete (y la landing) se vean como fueron diseñadas, hay que cargar Geist con `next/font/local` o el paquete `geist` (agrega un asset o una dependencia: **requiere aprobación**, regla Ponytail). No se aplicó en los mockups.

### Cambios propuestos para la issue de implementación (SIN aplicar)

#### 1. `src/app/globals.css`

Reemplazar los bloques «Athlete App y landing… (P01)» (líneas 163-173) y «Capas de superficie de Coach Studio» (líneas 178-180) por el contenido de `<style id="propuesta">`:

```css
/* Athlete App con el lenguaje de la landing.
   Sin overrides de --primary/--ring/--background/--card: rige la paleta zinc de :root y .dark
   (primary #18181B en claro, #FAFAFA en oscuro; fondo y tarjetas #FFFFFF / #09090B). */
.theme-athlete {
  --rest-timer-bg: var(--card);
  --rest-timer-time-fg: var(--foreground);
  --rest-timer-track-bg: var(--muted);
  --rest-timer-fill-bg: var(--primary);
  --rest-timer-fill-bg-paused: var(--warning-soft-foreground);

  /* Superserie y drop set: el violeta del constructor de rutinas como token semántico
     (hoy son purple-* de Tailwind hardcodeados; valores = purple-600 / purple-800 / purple-500). */
  --superset: 271 81% 56%;            /* #9333EA  ordinal y badge sólido (texto blanco 5.4:1) */
  --superset-foreground: 0 0% 100%;
  --superset-soft: 271 91% 65%;       /* #A855F7  fondos /10–/20 y bordes /30–/40 */
  --superset-soft-foreground: 273 67% 39%; /* #6B21A8  texto sobre el tinte (purple-800) */
}
.dark .theme-athlete,
.theme-athlete .dark {
  --superset-soft-foreground: 269 100% 92%; /* #E9D5FF  purple-200 */
  /* --neutral-soft de .dark es azul pizarra (217 33% 17%): en athlete pasa a zinc como el resto. */
  --neutral-soft: 240 3.7% 15.9%;
  --neutral-soft-foreground: 0 0% 98%;
  --neutral-soft-border: 240 5.3% 26%;
}
/* Selección de texto de la landing (.landing-root ::selection): legible también sobre botones primary. */
.theme-athlete ::selection { background: hsl(240 5% 52% / 0.4); color: currentColor; }
```

Esto **elimina los overrides de `--primary`/`--ring`** (y de `--background`, `--card`, `--popover`) de `.theme-athlete`. El resto del bloque GOZS-448 (`:where()` de tabular-nums, tracking, foco, `:active`, `min-height`) se mantiene igual.

#### 2. Clases (archivo · actual → nueva)

<!-- REGLAS:INICIO -->
| Regla | Cambio | Archivo(s) | Actual | Nueva | Por qué | Efecto en layout |
|---|---|---|---|---|---|---|
| T2 | Texto sobre primary | `src/components/athlete/live-workout.tsx:1166` | `bg-primary text-white` | `bg-primary text-primary-foreground` | En oscuro el primary pasa a #FAFAFA: el blanco fijo desaparece. | Ninguno |
| T3 | Tarjeta «Te toca hoy» y toast de cambio de día como isla oscura de la landing | `src/components/athlete/inicio-mis-dias.tsx:429`<br>`src/components/athlete/inicio-mis-dias.tsx:460`<br>`src/components/athlete/inicio-mis-dias.tsx:774` | `bg-[#0F172A] text-white (h2: text-white)` | `dark bg-background text-foreground (h2: text-foreground)` | #0F172A es pizarra azulada y deja «Hacer otro día» ilegible en claro (text-foreground oscuro sobre fondo oscuro). La landing usa el mismo recurso con la clase .dark (figure.landing-media dark). | Ninguno |
| T4 | Botón «Empezar Día N» | `src/components/athlete/inicio-mis-dias.tsx:474 (empezar-dia-btn)` | `rounded-[14px] bg-[#38BDF8] text-[#0F172A] shadow-md hover:bg-[#38BDF8]/90` | `rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90` | Cian hardcodeado (decisión 1). Receta BTN_PRIMARY de la landing. | Ninguno (mismo alto h-14) |
| T5 | Acciones principales con forma BTN_PRIMARY | `src/components/athlete/live-workout.tsx:2092, 2161, 2520 (registrar-serie-btn, terminar-entrenamiento-btn*)`<br>`onboarding-alumno.tsx:481/490/499`<br>`cuestionario-inicial.tsx (submit-cuestionario-btn)`<br>`pain-report-modal.tsx (submit-pain-report-btn)`<br>`cierre-dia-modal.tsx (cierre-dia-volver-athlete-btn)`<br>`historial-sesiones.tsx / mi-progreso.tsx (CTA de vacío)` | `rounded-lg | rounded-xl | rounded-[14px] + shadow-*` | `rounded-full shadow-lg shadow-primary/20` | BTN_PRIMARY (kit.tsx:23). Se aplica a botones bg-primary de ≥44 px de alto y ≥160 px de ancho. | Ninguno (solo radio y sombra) |
| T6 | Acciones secundarias con forma BTN_GHOST | `src/components/athlete/inicio-mis-dias.tsx:485 (hacer-otro-dia-btn)`<br>`modales: botones Volver/Cancelar de ancho completo` | `rounded-[12px] | rounded-xl | rounded-lg` | `rounded-full` | BTN_GHOST (kit.tsx:26): borde 1px y pastilla. | Ninguno |
| T7 | Pestañas y segmentados como el selector de público de la landing | `src/components/athlete/athlete-shell.tsx:126`<br>`live-workout.tsx (tab-entrenar / tab-registro-dia)`<br>`historial-sesiones.tsx (tab-sesiones / tab-dashboard)` | `rounded-xl / rounded-lg` | `rounded-full` | Selector de público (kit.tsx:268-279): contenedor y opción activa en pastilla. | Ninguno |
| T8 | Micro-etiquetas en mayúsculas → MICRO_LABEL | `inicio-mis-dias.tsx («Te toca hoy», «Tus días»)`<br>`live-workout.tsx («Rutina», «Peso», «Repeticiones»)`<br>`rest-timer.tsx:«Descanso»`<br>`y el resto de etiquetas uppercase sin fondo` | `uppercase tracking-wider|tracking-widest|tracking-[0.12em] font-bold|font-extrabold` | `uppercase font-mono tracking-[0.18em] font-semibold` | MICRO_LABEL (kit.tsx:17). Se conserva el tamaño y el color de cada etiqueta (no se fuerza text-xs ni muted) para no mover bloques. | Solo ancho del texto (mono + tracking); alto igual |
| T9 | Títulos con el peso de la landing | `live-workout.tsx:779 (h1 del día)`<br>`inicio-mis-dias.tsx (h1 del plan, h2 del hero)`<br>`historial-sesiones.tsx / mi-progreso.tsx / athlete-classes.tsx (h1/h2)` | `font-bold | font-extrabold + tracking-tight` | `font-black tracking-tighter` | H2 de la landing (kit.tsx:31). No se toma leading-[0.98] porque cambiaría el alto de los bloques. | Ninguno en alto; el ancho de la línea cambia levemente |
| T10 | Punto «Online» con pulso de presencia | `src/components/athlete/athlete-shell.tsx:35-38` | `size-2 rounded-full bg-success` | `landing-dot size-2 rounded-full bg-success text-success` | landing-dot (globals.css:468). Respeta prefers-reduced-motion. | Ninguno |
| T11 | Violeta legible en modo claro | `live-workout.tsx:1168, 1189, 1220, 1291, 1294, 1298, 1301 y resto de text-purple-300/200 sin variante dark:` | `text-purple-300 | text-purple-200 | text-purple-300/80 (iguales en claro y oscuro)` | `text-purple-700 dark:text-purple-300 | text-purple-800 dark:text-purple-200 | text-purple-700 dark:text-purple-300/80` | purple-300 sobre blanco da ~1.5:1. Se ajusta solo el tono dentro de la familia purple (regla de contraste). En oscuro no cambia. | Ninguno |
| T12 | Tarjetas grandes con radio de la landing | `inicio-mis-dias.tsx (hero rounded-[20px])`<br>`live-workout.tsx / historial-sesiones.tsx / modales (contenedores rounded-xl ≥300 px)` | `rounded-xl | rounded-[14px] | rounded-[20px]` | `rounded-2xl` | Tarjetas de la landing: rounded-2xl border border-border bg-card. | Ninguno |
| T13 | Avatar «Tú» del chat legible | `src/components/athlete/athlete-chat.tsx:312` | `bg-primary/30 text-primary-foreground` | `bg-primary text-primary-foreground` | Texto claro sobre un tinte del 30 %: 1.5:1 hoy (azul) y 1.9:1 con zinc. Sólido: 17:1. | Ninguno |
<!-- REGLAS:FIN -->

#### 3. `text-white` fijos sobre primary

| Archivo | Actual | Nueva |
|---|---|---|
| `src/components/athlete/live-workout.tsx:1166` | `bg-primary text-white` | `bg-primary text-primary-foreground` |
| `src/components/athlete/inicio-mis-dias.tsx:429, 460, 774` | `bg-[#0F172A] … text-white` (no es primary, pero es el mismo problema) | ver T3 |

Los `text-white` restantes van sobre `bg-purple-600`, `bg-amber-500` y `bg-rose-600` (semánticos, no dependen del primary).

#### 4. Token semántico de superserie (en lugar de `purple-*` hardcodeado)

Agregar a `tailwind.config.ts` → `theme.extend.colors`:

```ts
superset: {
  DEFAULT: "hsl(var(--superset) / <alpha-value>)",
  foreground: "hsl(var(--superset-foreground))",
  soft: "hsl(var(--superset-soft) / <alpha-value>)",
  "soft-foreground": "hsl(var(--superset-soft-foreground))",
},
```

y reemplazar en `live-workout.tsx` (y opcionalmente en `src/components/coach/routine-builder/routine-builder-modal.tsx`):

| Actual | Nueva |
|---|---|
| `bg-purple-600 text-white` | `bg-superset text-superset-foreground` |
| `bg-purple-500/5` · `/10` · `/15` · `/20` | `bg-superset-soft/5` · `/10` · `/15` · `/20` |
| `border-purple-500` · `/20` · `/30` · `/40` · `/50`, `ring-purple-500/40`, `hover:bg-purple-500/10` | `border-superset-soft` · `/20`…`/50`, `ring-superset-soft/40`, `hover:bg-superset-soft/10` |
| `text-purple-800 dark:text-purple-200`, `text-purple-900 dark:text-purple-100` | `text-superset-soft-foreground` |
| `text-purple-300`, `text-purple-200`, `text-purple-300/80` (sin `dark:`) | `text-superset-soft-foreground` (resuelve T11) |

Los valores del token son los mismos purple de hoy (600/500/800 y 200 en oscuro), así que el violeta no cambia: solo deja de estar hardcodeado.

#### 5. Tests a actualizar en la issue de implementación (no se tocaron)

- `src/__tests__/touch-target-tokens.spec.tsx:50-55` valida el cian de `.dark .theme-athlete` (`--primary: 199 89% 48%`). Hay que reescribirlo para el primary zinc (`#FAFAFA` con `--primary-foreground` #18181B: 16.97:1).
- `src/__tests__/bimodal-theme-toggle.spec.ts:133,148` solo exige que existan `.theme-athlete` y `.dark .theme-athlete`: la propuesta los conserva.

### Cómo se regenera

```bash
npm ci && npx next dev -p 3100                         # en otra terminal
node docs/ux-ui-review/athlete-landing/tools/session.mjs        # login (usa FE_alumno_mail / FE_alumno_password)
node docs/ux-ui-review/athlete-landing/tools/capture.mjs        # ANTES: PNG + DOM + cajas (filtro opcional: "=inicio,lw-")
node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json docs/ux-ui-review/athlete-landing/tools/ssr.tsx
node docs/ux-ui-review/athlete-landing/tools/cliente/build.mjs && node docs/ux-ui-review/athlete-landing/tools/cliente/render.mjs
node docs/ux-ui-review/athlete-landing/tools/build.mjs          # HTML ANTES y DESPUÉS
node docs/ux-ui-review/athlete-landing/tools/verify.mjs         # PNG DESPUÉS + ±2 px + contraste
node docs/ux-ui-review/athlete-landing/tools/index.mjs && node docs/ux-ui-review/athlete-landing/tools/resumen.mjs
```

`tools/dom/` guarda el DOM capturado (ya con los datos de ejemplo) para regenerar los mockups sin volver a entrar a la app.
