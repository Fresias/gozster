# 09 · Preguntas para cerrar antes de implementar

**Fecha:** 2026-11-06
**Consultados:** @frontend-eng, @qa-eng, @backend-eng
**Issues que dependen de estas respuestas:** FIX-V1 a FIX-V10, FIX-01 a FIX-09 (excepción `FIX-02` ya abierta y asignada a `@frontend-eng` en `GOZS-402`)

> **Respondido por el diseñador (Claude Design), 6 nov 2026.** Las 16 preguntas tienen respuesta y no hace falta dibujar pantallas nuevas en el canvas. Donde una respuesta cambia `02-vistas.md` u `08-fidelidad-visual.md`, **manda este archivo**; los cambios ya están aplicados en `08` (ver su nota de actualización).
>
> **Resumen de decisiones:** se acepta la recomendación A del PM en 15 de las 16 preguntas. En P04 se elige B (sin tabla de pesajes; el sparkline pasa al 1RM). Además se corrigen cuatro cosas que el PM daba por hechas:
> - "Medio" no se usa; el vocabulario es **leve / moderado / alto** (P07).
> - La acción primaria va en la fila del H1 y la topbar no lleva ninguna (P02).
> - En móvil, Salud va primero en la ficha solo si hay dolor activo (P12).
> - Los grupos del menú lateral se llaman **Alumnos / Operación / Negocio**.
>
> **Siguiente paso del PM:** abrir los issues de la Ola 1 (P16).

---

### P01 · Alcance de los nuevos tokens Zinc entre Coach Studio, Athlete App y Landing

- **De:** frontend | backend | pm
- **Bloquea:** FIX-V1, FIX-V2, FIX-V9, FIX-V10
- **Vista / componente:** `src/app/globals.css`, `docs/MARCA.md`, `StudioShell` y `FIX-V9` ("Ver como alumno")
- **Contexto:** `08-fidelidad-visual.md §2` reemplaza `:root` y `.dark` en `src/app/globals.css` por neutros zinc con primario `#18181B`, pero en la línea 106 indica que el Azul Atlántico (`#2563EB`) queda para la landing y la Athlete App, mientras que la vista previa del alumno (`FIX-V9`) se monta dentro de `/studio`. Además, cambiar `docs/MARCA.md` requiere confirmación del dueño del producto o `@UI/UX & Art Director`.
- **Pregunta:** ¿Reemplazamos `:root` y `.dark` globalmente en `src/app/globals.css` (aplicando zinc a todo el producto) o escopeamos los tokens zinc al layout de Coach Studio para que Athlete App y Landing conserven `--primary: 221 83% 53%`, y aprueba el dueño actualizar `docs/MARCA.md` + usar el isotipo `"G"` en cuadrado negro (`32×32 px`, `rounded-lg`) como logo definitivo de Studio?
- **Opciones:**
  - A) Aplicar `:root` y `.dark` de `08-fidelidad-visual.md §2` en `src/app/globals.css` como base global del sistema, aislar `.theme-athlete` (con `--primary` Azul Atlántico) únicamente en el contenedor de Athlete App / Landing (y dentro del marco de vista previa de `FIX-V9`), y actualizar `docs/MARCA.md` con el isotipo `"G"` negro para Coach Studio.
  - B) Unificar todo GOZSter (Coach Studio, Athlete App y Landing) en neutros zinc + primario `#18181B` sin mantener variables de Azul Atlántico.
- **Recomendación del PM:** A, porque cumple literalmente `08-fidelidad-visual.md §2` (tokens en `:root`/`.dark` + nota de `docs/MARCA.md`) sin romper la identidad de Athlete App cuando se abre dentro de la vista previa de `FIX-V9`.
- **Respuesta:** 

**A, con dos precisiones.**
1. Los tokens zinc de `08 §2` van en `:root` y `.dark` como base global. La Athlete App y la landing envuelven su raíz en `.theme-athlete`, que solo redefine `--primary: 221 83% 53%`, `--ring` y `--primary-foreground` (en dark: `--primary: 199 89% 48%`). El resto de los tokens es común.
2. Dentro de la vista previa de FIX-V9, el marco del teléfono lleva `.theme-athlete`: el alumno se ve en azul y la barra de Studio que lo rodea queda en zinc.
- **Logo:** el cuadrado negro con "G" es el isotipo de Coach Studio. Se aprueba el cambio en `docs/MARCA.md`, que debe decir que Coach Studio usa zinc y que el azul queda para la Athlete App y la landing.


---

### P02 · Topbar global y regla de "una acción primaria por vista" en pantallas secundarias

- **De:** frontend | qa
- **Bloquea:** FIX-V2, FIX-V4, FIX-V5, FIX-V6, FIX-V7, FIX-V10
- **Vista / componente:** `StudioShell` (`Topbar` `h-14`), Ficha (`§4.2`), Cobros (`§4.3`), Agenda (`§4.4`), Rutinas (`§4.5`), Ranking (`§4.6`) y `max-width` del contenedor
- **Contexto:** `Inicio.html` y `08-fidelidad-visual.md §3 Topbar` definen una barra superior `h-14 border-b px-6` en todas las pantallas con `{Nombre de página} · ⌘K · tema · acción primaria contextual (negra)`. Sin embargo, en `Ficha.html`, `Cobros.html`, `Agenda.html`, `Rutinas.html` y `Ranking.html` no está dibujada la topbar y el botón primario negro (`"Enviar mensaje"`, `"Registrar pago"`, `"Nueva clase"`, `"Nueva rutina"`, `"Sumar alumno"`) está en la cabecera del contenido (`main`), además de botones negros contextuales en filas vencidas de Cobros y en el Alert de Salud de Ficha. Asimismo, `Inicio.html` usa `max-width: 1180px`, `Rutinas.html`/`Ranking.html` usan `1240px` y `Ficha`/`Cobros`/`Agenda` ocupan todo el ancho.
- **Pregunta:** ¿Se mantiene la Topbar global `h-14` en todas las vistas de escritorio dejando el CTA primario en la cabecera `H1` de cada vista (sin duplicarlo en la Topbar), permitiendo botones negros contextuales en el Alert de Salud y en filas por cobrar de Cobros, y unificando el contenedor interno en `max-w-[1180px]`?
- **Opciones:**
  - A) Mantener la Topbar `h-14` en todas las vistas (con miga/título, `⌘K` y botón de tema), ubicar el CTA primario en la cabecera `H1` de cada vista (o en la Topbar en Inicio), permitir botones negros contextuales dentro del Alert de Salud y en filas vencidas/por vencer de Cobros (tal como dibujan `Ficha.html` y `Cobros.html`), y usar `max-w-[1240px]` (o `1180px` uniforme) en el contenedor de contenido.
  - B) Mostrar la Topbar `h-14` únicamente en Inicio (ocultándola en Ficha, Cobros, Agenda, Rutinas y Ranking tal como se ve en sus HTMLs) y exigir literalmente un único `<button>` con `bg-primary` en todo el DOM visible (pasando los botones de fila de Cobros y del Alert de Salud a `outline`/`secondary`).
- **Recomendación del PM:** A, porque preserva el buscador global `⌘K` y el selector de tema en todas las pantallas sin duplicar el botón primario ni contradecir los botones negros de `Ficha.html` y `Cobros.html`.
- **Respuesta:** 

**A, con estas reglas cerradas** (el canvas omitió la topbar en las pantallas secundarias solo para no repetirla, igual que el menú):
- **Topbar `h-14` en todas las vistas de escritorio.** Contenido, de izquierda a derecha: nombre de la página (o breadcrumb en la ficha) · búsqueda `⌘K` (280 px) · botón Mensajes (ver P09) · botón de tema. **No lleva acción primaria.**
- **La acción primaria va siempre en la fila del H1** de cada vista, a la derecha. En Inicio, "Alta de alumno" pasa de la topbar a la fila del saludo, a la derecha del Segmented de período (Segmented primero, después el botón). Esto corrige `08 §3 Topbar` y `02-vistas §1`.
- **Regla binaria para QA:** máximo **un** botón `variant="default"` (negro) en la fila del H1 y en la topbar sumadas. Se permiten primarios contextuales en exactamente dos lugares: (a) dentro de un `Alert` ("Cambiar ejercicio") y (b) uno por fila de tabla cuando es la acción principal de esa fila ("Registrar pago" en Cobros). Los ítems seleccionados (`aria-pressed`, `aria-selected`, día de hoy, bloque de clase seleccionado) no cuentan.
- **Ancho:** contenedor `w-full max-w-[1280px]` con `px-6` en todas las vistas, alineado a la izquierda. A 1440 px con el menú de 240 px el ancho útil es 1152 px, así que el máximo solo actúa en pantallas más anchas. Reemplaza los 1180 y 1240 px.


---

### P03 · Modelo de 2 columnas con riel continuo vs. filas en Ficha del alumno y alcance de "Personalizar"

- **De:** frontend | qa
- **Bloquea:** FIX-V4, FIX-07, FIX-V10
- **Vista / componente:** Ficha del alumno (`src/components/coach/student-detail-view.tsx`, `Ficha.html`)
- **Contexto:** `Ficha.html` (L104–358) y `08-fidelidad-visual.md §4.2` maquetan una banda superior a ancho completo (`Últimas sesiones`) y debajo **dos columnas verticales independientes** (`flex: 2 1 560px` a la izquierda con `Rutina` + `Fuerza`; `flex: 1 1 320px` a la derecha con `Salud` + `Actividad` + `Membresía`), lo que evita huecos blancos entre filas de distinta altura y mantiene la página `≤ 2.300 px`. En cambio, `02-vistas.md §4.2` describe filas horizontales (`row-1`, `row-2`).
- **Pregunta:** Para lograr exactamente el riel continuo de `Ficha.html` y la altura `≤ 2.300 px`, ¿migramos el estado de layout a dos columnas verticales (`left: ['rutina', 'fuerza']`, `right: ['salud', 'actividad', 'membresia']` con `timeline` arriba) y cómo debe funcionar el reordenamiento al activar `"Personalizar"`?
- **Opciones:**
  - A) Usar dos columnas verticales continuas como en `Ficha.html`; en modo `"Personalizar"` permitir reordenar islas verticalmente dentro de su columna y también moverlas entre columna izquierda y derecha (con mínimo 1 isla por columna), tanto por drag-and-drop nativo desde el asa `⠿` como por teclado (`Space` + flechas + `Escape`).
  - B) Usar dos columnas verticales continuas como en `Ficha.html`, pero restringir `"Personalizar"` a reordenar el orden vertical dentro de cada columna (`Rutina ↕ Fuerza` a la izquierda; `Salud ↕ Actividad ↕ Membresía` a la derecha).
- **Recomendación del PM:** A, porque reproduce al 100 % el layout sin huecos de `Ficha.html` (`≤ 2.300 px`) y mantiene la flexibilidad de personalización por columna.
- **Respuesta:** 

**A**, que coincide con el modelo `layoutColumns` que ya está en `main`; lo que falta es que el contenedor lo pinte en dos columnas (FIX-07).
- "Últimas sesiones" queda fija arriba, a ancho completo, y **no se mueve**.
- Con Personalizar activo: se reordena dentro de la columna y se puede pasar a la otra. Mínimo 1 isla por columna; si un movimiento dejaría una columna vacía, se rechaza con un anuncio por `aria-live`: "La columna no puede quedar vacía".
- Teclado, con foco en el asa: `Espacio` toma la isla, `↑`/`↓` la mueven dentro de la columna, `←`/`→` la pasan a la otra columna (al final), `Espacio` la suelta y `Escape` cancela. Anuncio: "{Isla} en columna {izquierda|derecha}, posición {n} de {m}".
- Mouse: drag nativo solo desde el asa (`draggable` se activa con `pointerdown` sobre el asa). La zona de destino se muestra con una línea de 2 px `bg-foreground` entre islas.
- Debajo de 960 px no hay Personalizar: se usa una columna con el orden fijo de `02-vistas §4.2`.


---

### P04 · Brecha de datos en Ficha · Peso corporal histórico (`82 → 78 kg`) y sparkline

- **De:** backend | frontend
- **Bloquea:** FIX-V4, FIX-01
- **Vista / componente:** Ficha del alumno · Isla Fuerza (`Ficha.html` L214–223) y base de datos Supabase
- **Contexto:** En `Ficha.html` (L214–223) el segundo bloque de la isla Fuerza muestra `"Peso corporal · 82 → 78 kg"` con un `<svg>` sparkline de 4 puntos y `"−4 kg desde jul"`. Sin embargo, `@backend-eng` verificó que en las migraciones actuales solo existe el escalar `public.perfiles.peso_corporal_kg` (sin tabla histórica de pesajes corporales y sin columna de peso en `alumno_cuestionario_inicial`), mientras que `08-fidelidad-visual.md §4.2` dice *"un solo 1RM (32/600) + 'Fórmula Epley · ver detalle' + sparkline de peso"*.
- **Pregunta:** ¿Cómo alimentamos el bloque de evolución y su sparkline en la isla Fuerza?
- **Opciones:**
  - A) Agregar en la migración menor de datos una tabla liviana `public.alumno_peso_corporal_registros (id, alumno_id, peso_kg, fecha)` (con trigger que sincroniza el último valor en `perfiles.peso_corporal_kg`) para graficar `"Peso corporal · {inicial} → {actual} kg"` cuando haya ≥ 2 registros, y mostrar solo `"{actual} kg"` (o `"Sin registros de peso"`) cuando haya 1 o 0 registros.
  - B) No crear tabla histórica de peso corporal en esta etapa: mostrar en la segunda columna el escalar `perfiles.peso_corporal_kg` y usar el sparkline para graficar la evolución de pesos levantados (`peso_kg` máximo por sesión) del ejercicio seleccionado en `registro_series`.
- **Recomendación del PM:** A, porque resuelve de raíz el contrato visual de `Ficha.html` (`82 → 78 kg` + sparkline + delta desde alta) con una migración mínima append-only y define el fallback limpio cuando el alumno tiene un solo pesaje.
- **Respuesta:** 

**B, ajustada.** No se crea la tabla de pesajes en esta etapa: cargar pesos necesitaría además una interfaz nueva, y eso es otra épica.
- **Bloque "Peso corporal":** se muestra como dato simple, "Peso corporal · 78 kg" (13 px, `text-muted-foreground`), leído de `perfiles.peso_corporal_kg`. Si es `NULL`, el bloque no se muestra; no se muestra "Sin registros".
- **El sparkline pasa al 1RM:** debajo de "138 kg · Fórmula Epley · ver detalle" va el sparkline (`240 × 48`, stroke 2 `currentColor`, punto final de 3 px) con el **1RM Epley por sesión del ejercicio mostrado** en las últimas 8 sesiones, tomado de `registro_series` (sin calentamientos). Con menos de 2 puntos no se dibuja.
- El texto del canvas "Peso corporal · 82 → 78 kg" con su línea queda **descartado**.
- Se actualiza la checklist de `08 §4.2`.


---

### P05 · Regla de negocio para "Ejercicio principal + top set + PR" en las tarjetas de "Últimas sesiones"

- **De:** backend | frontend
- **Bloquea:** FIX-V4, FIX-01
- **Vista / componente:** Ficha del alumno · Banda `"Últimas sesiones"` (`Ficha.html` L58–99)
- **Contexto:** Cada tarjeta de `150 px` en `"Últimas sesiones"` resume una sesión completa de `registro_sesiones` en una sola línea de ejercicio (`"20 sep · PR" / "Press de banca" / "85 kg × 6"`), pero una sesión real contiene múltiples ejercicios y múltiples series en `registro_series`.
- **Pregunta:** ¿Qué criterio determinista usamos para elegir el ejercicio y la serie que se muestran en cada tarjeta de `"Últimas sesiones"`, y cuándo lleva la etiqueta `"PR"`?
- **Opciones:**
  - A) Elegir la serie efectiva (`completada = true` y `set_type` distinto de calentamiento) con mayor **1RM Epley estimado** (`peso_kg * (1 + reps_hechas / 30)`) dentro de esa sesión, priorizando las series que superaron el máximo histórico previo del alumno en ese ejercicio, y mostrar el badge `"PR"` cuando en esa sesión se batió el récord histórico previo.
  - B) Elegir siempre la serie efectiva con mayor `peso_kg` bruto del primer ejercicio del día (`orden = 1` en `ejercicios_en_rutina`), marcando `"PR"` solo si ese primer ejercicio superó su `peso_kg` máximo histórico.
- **Recomendación del PM:** A, porque destaca automáticamente el hito real de sobrecarga progresiva de la sesión aunque el PR haya ocurrido en el segundo o tercer ejercicio básico.
- **Respuesta:** 

**A, con el criterio completo:**
- **Series válidas:** `completada = true`, `set_type` distinto de calentamiento, `peso_kg > 0` y `reps_hechas BETWEEN 1 AND 12` (Epley no es confiable con más de 12 repeticiones).
- **Top set de la sesión:** la serie válida con mayor `peso_kg * (1 + reps_hechas / 30.0)`. Si hay empate, gana la de mayor `peso_kg` y después la de menor `numero_serie`.
- **PR:** la sesión lleva "PR" si **alguna** serie válida supera el máximo Epley de ese ejercicio en todas las sesiones **anteriores** del alumno (`fecha < sesion.fecha`). La primera vez que aparece un ejercicio **no** cuenta como PR.
- **Qué muestra la tarjeta:** si hubo PR, el ejercicio y la serie del PR (si hubo varios, el de mayor Epley); si no, el top set.
- **Formato:** "85 kg × 6", con kg en coma decimal ("82,5 kg"). Fecha "20 sep".
- **Dónde se calcula:** función pura `resumirSesiones(sesiones, series, ejercicios)` en `src/lib/progresion.ts`, con tests unitarios de empate, primera vez, calentamiento y más de 12 repeticiones.


---

### P06 · Destino de los elementos que salen de la vista principal de Ficha (Brzycki, Heatmap de 52 semanas, pestañas de Rutina y cuestionario)

- **De:** frontend | qa
- **Bloquea:** FIX-V4, FIX-V10
- **Vista / componente:** Ficha del alumno · Islas Fuerza, Rutina y Salud (`08-fidelidad-visual.md §4.2`, `02-vistas.md §4.4–4.6`)
- **Contexto:** `08-fidelidad-visual.md §4.2` retira de la vista principal de Ficha la tarjeta `1RM Brzycki` y el `heatmap de 52 semanas` (dejando `Fuerza` con un solo 1RM + `"Fórmula Epley · ver detalle"`), mientras que `Ficha.html` dibuja las pestañas `"Rutina actual" / "Historial (3)" / "Registros (21)"` en la isla Rutina y el link `"Ver cuestionario inicial completo"` en Salud sin mostrar su contenido al abrirse.
- **Pregunta:** ¿Dónde viven ahora `1RM Brzycki`, el `heatmap de 52 semanas` y qué abren las pestañas `"Historial"` / `"Registros"` y el link `"Ver cuestionario inicial completo"`?
- **Opciones:**
  - A) Mostrar `1RM Brzycki` y la fórmula matemática dentro del Popover/Tooltip de `"Fórmula Epley · ver detalle"`; renderizar en la pestaña `"Historial (n)"` la lista compacta de planes anteriores y en `"Registros (n)"` el historial de sesiones junto con el heatmap de adherencia (desde la primera sesión del alumno); y abrir un Sheet/Dialog de lectura con las respuestas de `alumno_cuestionario_inicial` al pulsar `"Ver cuestionario inicial completo"`.
  - B) Eliminar el heatmap de 52 semanas de toda la interfaz (dejando en `"Registros"` únicamente la lista cronológica de sesiones) y mantener la verificación de Brzycki solo en el Tooltip de `"ver detalle"` y en los tests unitarios del motor matemático.
- **Recomendación del PM:** A, porque conserva el 100 % de la funcionalidad clínica y la cobertura de QA mientras deja la vista inicial de Ficha idéntica a `Ficha.html`.
- **Respuesta:** 

**A**, con el contenido definido:
- **"Fórmula Epley · ver detalle"** abre un **Popover** (no un Tooltip, porque tiene contenido para leer) de 280 px con: el set usado ("120 kg × 3 · 16 sep"), Epley y Brzycki con su valor y su fórmula en mono 12, y la nota "Se muestra Epley".
- **Pestaña "Historial (n)":** lista de planes anteriores; cada fila con nombre (500), "{fecha inicio} – {fecha fin}" (13) y "{n} días". Un click abre ese plan en solo lectura dentro de la misma isla, con "Volver a rutina actual".
- **Pestaña "Registros (n)":** arriba, el heatmap de adherencia **desde la semana de la primera sesión** (máximo 52 semanas, celdas de 10 px, gap 2, `bg-muted` para 0 y `bg-foreground` con opacidad 40/70/100 % para 1/2/3+ sesiones). Debajo, la lista de sesiones (fecha · día · ejercicios · volumen), paginada de a 10.
- **"Ver cuestionario inicial completo":** Sheet derecho de 400 px, solo lectura, con las respuestas de `alumno_cuestionario_inicial` agrupadas en Objetivo, Salud y Disponibilidad. Si no hay cuestionario, el link no se muestra.


---

### P07 · Texto exacto de los badges de dolor en las 4 superficies (HTML objetivo vs. especificación QA C5)

- **De:** frontend | qa
- **Bloquea:** FIX-V3, FIX-V4, FIX-03, FIX-V10
- **Vista / componente:** Inicio ("Para revisar hoy" y Directorio) y Ficha (Cabecera e Isla Salud)
- **Contexto:** En los HTML objetivo el mismo caso de dolor cambia de texto según la superficie: en `Inicio.html` ("Para revisar hoy", L108/128) el badge dice `"Alto"` / `"Medio"` (y en las filas de cuota/progreso dice `"Cuota"` / `"Progreso"`); en `Inicio.html` (Directorio, L216/230) dice `"Hombro · moderado"` / `"Rodilla · alto"`; en `Ficha.html` (Cabecera, L28) dice `"Dolor en hombro"` (sin nivel); y en `Ficha.html` (Alert Salud, L266) dice `"Dolor moderado · hombro anterior · EVA 5"`. Sin embargo, `05-qa.md §2 C5` pide verificar que las 4 superficies muestren la misma palabra de severidad (`"alto"` / `"moderado"`).
- **Pregunta:** ¿Respetamos el formato de texto exacto de cada superficie tal como está en `Inicio.html` y `Ficha.html` (ajustando el test C5 para validar la coherencia de variante semántica `danger`/`warning` + zona/nivel según superficie), o forzamos el mismo string en las 4?
- **Opciones:**
  - A) Respetar el copy exacto de `Inicio.html` y `Ficha.html` en cada superficie (`"Alto"`/`"Medio"` en Para revisar hoy; `"{Zona} · {leve|moderado|alto}"` en Directorio; `"Dolor en {zona}"` en Cabecera de Ficha; `"Dolor {leve|moderado|alto} · {zona} · EVA {n}"` en Isla Salud), verificando en QA C5 que las 4 superficies deriven del mismo `v_dolor_activo.nivel` y compartan el mismo token semántico (`danger` para alto, `warning` para moderado/leve).
  - B) Unificar el texto del badge en las 4 superficies como `"Dolor {leve|moderado|alto} · {zona}"`.
- **Recomendación del PM:** A, porque evita truncamientos en espacios angostos (como la fila de "Para revisar hoy" y la cabecera de Ficha) y coincide palabra por palabra con `Inicio.html` y `Ficha.html`.
- **Respuesta:** 

**A**, con un vocabulario único: **leve / moderado / alto**. "Medio" no se usa en ningún lado: el canvas lo tenía en "Para revisar hoy" y era un error.
| Superficie | Texto |
|---|---|
| "Para revisar hoy" | Badge "Alto" / "Moderado" / "Leve" + detalle "Dolor {nivel} · {Zona} · EVA {n}" |
| Directorio, columna Alertas | "{Zona} · {nivel}" |
| Cabecera de la ficha | "Dolor en {zona}" |
| Alert de Salud | "Dolor {nivel} · {zona} · EVA {n}" |
- **Una sola función de mapeo:** `etiquetaNivelDolor(nivel: 'bajo'|'medio'|'alto') → 'leve'|'moderado'|'alto'` y `tonoNivelDolor → 'neutral'|'warning'|'danger'`. Leve usa `neutral`, no `warning`.
- **QA C5:** verifica que las 4 superficies usen el mismo `nivel` de `v_dolor_activo` y el mismo tono, no el mismo texto.


---

### P08 · Divergencias entre `Inicio.html` / `Cobros.html` y `02-vistas.md` (Chips vs. Segmented, buscador en Directorio, KPIs de Cobros y columna Rutina/Monto)

- **De:** frontend | qa
- **Bloquea:** FIX-V3, FIX-V5, FIX-V10
- **Vista / componente:** Inicio (`Directorio de Alumnos`) y Cobros (`KPIs`, filtros y tabla)
- **Contexto:** Entre los HTML objetivo y `02-vistas.md` hay 5 diferencias puntuales: (1) `Inicio.html` y `Cobros.html` usan **Chips sueltos `h-8`** (`gap: 4px`, activo con `bg: #F4F4F5` y `border: 1px solid #E4E4E7`) en vez de un `Segmented` con contenedor gris; (2) la toolbar del Directorio en `Inicio.html` (L177–191) no tiene el input `"Buscar alumno"` (ya está el buscador en la topbar) y muestra texto plano `"Sin rutina"` / `"Vence en 2 d"` en la columna Rutina en vez de `StatusBadge`; (3) `Cobros.html` muestra `Pase libre −20%` en la columna Plan y `$32.000` en una sola línea en Monto (sin segunda línea tachada) y usa cifra de KPI en `26 px` sin etiqueta de período arriba a la derecha; y (4) el pie de tabla en HTML dice `8 de 40` / `9 de 36` mientras `08 §4.1, §4.3` y `02 §3, §5` piden `pageSize = 15` (`15 de 40` / `15 de 36`).
- **Pregunta:** ¿Cuál es la combinación canónica para implementar Directorio y Cobros sin ambigüedad?
- **Opciones:**
  - A) Seguir la estética de `Inicio.html` y `Cobros.html` en componentes visuales (filtros como **Chips `h-8`** con borde en activo, columna Rutina en texto plano, descuento `−20%` junto al nombre del Plan con monto en una línea, KPIs con `KpiCard` unificada de `08 §3`), mantener un input compacto `"Buscar alumno"` en la toolbar del Directorio (para filtrar la tabla localmente sin abrir `⌘K`), y fijar `pageSize = 15` (`15 de 40` y `15 de 36`) como exigen `08 §4.1` y `08 §4.3`.
  - B) Copiar literalmente `Inicio.html` y `Cobros.html` omitiendo el buscador local del Directorio y dejando `pageSize = 8` en Inicio y `9` en Cobros.
- **Recomendación del PM:** A, porque respeta el diseño visual limpio de los chips y celdas de `Inicio.html`/`Cobros.html` y a la vez cumple el checklist binario de `08-fidelidad-visual.md §4.1 y §4.3` (`15 de 40` y `15 de 36`) sin perder el filtrado rápido de tabla.
- **Respuesta:** 

**A**, con estos ajustes:
1. **Filtros:** chips `h-8`, como dibujan `Inicio.html` y `Cobros.html`. Corrige `02-vistas §3`, que decía Segmented.
2. **Búsqueda del directorio:** sí va. Input compacto de 220 px al final de la toolbar, después de "+ Actividad", con placeholder "Buscar alumno" y `aria-label`. Filtra localmente con debounce de 150 ms.
3. **Columna Rutina:** nombre de la rutina en texto. Si vence en 5 días o menos, debajo en 12 px `text-warning-soft-foreground`: "Vence en {n} d". Sin rutina: "Sin rutina" en `text-subtle-foreground`, sin badge.
4. **KPIs de Cobros:** el mismo `KpiCard` que Inicio (cifra 28/600 y período "nov" arriba a la derecha). El tamaño de 26 px del canvas no se usa.
5. **Descuento:** como `Cobros.html`, "Pase libre −20%" en la columna Plan y el monto final en una línea. Se descarta el "original tachado" de `02-vistas §5`.
6. **Paginación:** `pageSize = 15` en las dos tablas.


---

### P09 · Acceso al Chat general en escritorio tras eliminar el FAB flotante

- **De:** frontend | pm
- **Bloquea:** FIX-V2, FIX-V3, FIX-05
- **Vista / componente:** `StudioShell` (Sidebar / Topbar desktop) y Drawer de Chat
- **Contexto:** `08-fidelidad-visual.md §4.1` y `02-vistas.md §2` eliminan el botón flotante de chat (FAB) de todas las vistas. En móvil (`Movil.html` L57–60) existe el tab `"Mensajes"` en la barra inferior de 5 ítems, y contextualmente se entra desde `"Enviar mensaje"` en Ficha o `"Escribirles"` en Clases de hoy, pero en el sidebar de escritorio (`Inicio.html` L15–32) no hay ítem `"Mensajes"`.
- **Pregunta:** ¿Dónde ubicamos el punto de entrada general a `"Mensajes"` en escritorio para cuando el entrenador quiere abrir su bandeja de conversaciones sin entrar primero a la ficha de un alumno?
- **Opciones:**
  - A) Agregar un botón de ícono `"Mensajes"` (con punto indicador si hay no leídos) en la Topbar de escritorio junto al botón de tema, que abre el Sheet/Drawer general de conversaciones.
  - B) No agregar acceso general en escritorio; el chat en desktop se abre únicamente de forma contextual desde `"Enviar mensaje"` (Ficha), `"Escribirles"` (Clases de hoy) o el menú `⋯` de cada fila de alumno.
- **Recomendación del PM:** A, porque mantiene paridad funcional con el tab `"Mensajes"` de la barra móvil (`Movil.html`) sin ensuciar el sidebar de 6 ítems ni reintroducir el FAB flotante.
- **Respuesta:** 

**A.** Botón de ícono "Mensajes" (`size-9 border`, ícono `message-square`) en la topbar, entre la búsqueda y el botón de tema.
- `aria-label="Mensajes"`, o "Mensajes, {n} sin leer" si hay pendientes. Punto de 8 px `bg-destructive` arriba a la derecha si hay no leídos.
- Abre el Sheet derecho de 400 px con la lista de conversaciones; click en una conversación abre el hilo dentro del mismo Sheet, con "← Conversaciones".
- No se agrega ítem al menú lateral.


---

### P10 · Fuentes en DB para `"alumno desde {mes año}"` y etiquetas de `pagos.medio_pago`

- **De:** backend | frontend
- **Bloquea:** FIX-V4, FIX-V5, FIX-09
- **Vista / componente:** Ficha (`Cabecera` e `Isla Membresía`) y Cobros (`Columna Medio` y Sheet `"Registrar pago"`)
- **Contexto:** `@backend-eng` confirmó que no existe una columna `alumno_desde`, pero sí `MIN(contrataciones.fecha_inicio)` y `perfiles.created_at`. Asimismo, la columna real en `public.pagos` es `medio_pago` con constraint `'TRANSFERENCIA' | 'EFECTIVO' | 'PASARELA_ONLINE' | 'OTRO'` (y la RPC `registrar_pago` recibe `'TRANSFERENCIA' | 'EFECTIVO'`), mientras que `02-vistas.md §5` menciona `Transferencia / Efectivo / Mercado Pago / Otro`.
- **Pregunta:** ¿Confirmamos `COALESCE(MIN(contrataciones.fecha_inicio), perfiles.created_at)` para calcular `"alumno desde {mes año}"` y el mapeo `'PASARELA_ONLINE' ↔ 'Mercado Pago'` en la UI y en la RPC `registrar_pago`?
- **Opciones:**
  - A) Usar `COALESCE(MIN(contrataciones.fecha_inicio), perfiles.created_at)` para `"alumno desde {mes año}"`, mapear `'PASARELA_ONLINE'` como `"Mercado Pago"` en la interfaz, y ampliar `public.registrar_pago` en la migración menor para que acepte los 4 valores del constraint de `public.pagos` (`'TRANSFERENCIA'`, `'EFECTIVO'`, `'PASARELA_ONLINE'`, `'OTRO'`).
  - B) Usar siempre `perfiles.created_at` para `"alumno desde"` y limitar el Sheet de `"Registrar pago"` únicamente a `"Transferencia"` y `"Efectivo"`.
- **Recomendación del PM:** A, porque alinea la base de datos con los 4 medios de pago definidos en `02-vistas.md §5` y usa el criterio comercial real de primera contratación con fallback seguro.
- **Respuesta:** 

**A**, con un ajuste en el nombre visible:
- **"alumno desde":** `COALESCE(MIN(contrataciones.fecha_inicio), perfiles.created_at)`, con formato "{mes abreviado} {año}" ("jul 2026").
- **Etiquetas de medio de pago:** `TRANSFERENCIA` → "Transferencia", `EFECTIVO` → "Efectivo", `PASARELA_ONLINE` → "Mercado Pago", `OTRO` → "Otro". Un único `formatearMedioPago()` en `src/lib/`.
- **Sheet "Registrar pago":** las 4 opciones como radiogroup de 2 × 2.
- **Backend:** la migración menor amplía `registrar_pago` para aceptar los 4 valores (es `CREATE OR REPLACE`, append-only).


---

### P11 · Pantallas de escritorio no dibujadas en el canvas (Métricas, Ingresos/Sankey, Constructor de rutinas, Vista previa de alumno y Vistas Día/Mes de Agenda)

- **De:** frontend | pm
- **Bloquea:** FIX-V2, FIX-V6, FIX-V7, FIX-V9, FIX-09
- **Vista / componente:** Métricas (`/studio/dashboard`), Ingresos (`/studio/ingresos`), Constructor de rutinas a pantalla completa, barra `"Ver como alumno"` (`FIX-V9`) y vistas `Día` / `Mes` del Segmented de Agenda
- **Contexto:** `objetivo/html/` contiene las 6 pantallas principales de escritorio en estado base (`Inicio`, `Ficha`, `Cobros`, `Agenda Semana`, `Rutinas grilla`, `Ranking`), pero no tiene dibujos para Métricas, Ingresos/Sankey, el interior del Constructor de rutinas, el marco de `"Ver como alumno"` ni las vistas `Día` y `Mes` del Segmented de Agenda.
- **Pregunta:** ¿Implementamos estas vistas aplicando directamente los tokens zinc de `08 §2`, las primitivas de `08 §3` y los contratos de `02-vistas.md §6, §7, §10 y §11`, o alguna requiere que el diseñador suba un HTML/PNG antes?
- **Opciones:**
  - A) No requieren nuevos dibujos en el canvas: se implementan aplicando estrictamente los tokens de `08 §2`, las reglas de `08 §3` (cards `rounded-xl border` sin sombra, cero `uppercase`, botones `h-9`, tipografía Geist) y las especificaciones de `02-vistas.md` (en Agenda: `Día` muestra las columnas de actividades de ese día y `Mes` la grilla mensual compacta con conteo de clases; en `FIX-V9`: barra superior `h-12` zinc con selector de alumno + botón `"Volver a Studio"` y vista móvil centrada debajo).
  - B) Pausar las vistas no dibujadas hasta que el diseñador agregue sus HTML/PNG en `objetivo/`.
- **Recomendación del PM:** A, porque `08 §2–3` y `02-vistas.md` ya definen todas las reglas estructurales y de negocio necesarias sin frenar la entrega.
- **Respuesta:** 

**A, sin dibujos nuevos**, con estas definiciones para las que el PM proponía solo una línea:
- **Agenda · Día:** una sola columna con la misma grilla horaria, los mismos bloques y el mismo panel derecho que Semana; el bloque ocupa el ancho de la columna menos 8 px. Encabezado "jueves 5 de noviembre".
- **Agenda · Mes:** grilla de 7 columnas (`grid-cols-7`) con celdas de 112 px de alto. Cada celda tiene el número del día arriba a la izquierda (hoy en círculo negro de 24 px), hasta 3 líneas "18:00 Funcional" (12 px, hora en mono) y "+{n} más". Los días fuera del mes van en `text-subtle-foreground`. Click en una clase la selecciona y abre el panel derecho.
- **Vista previa del alumno (FIX-V9):** barra superior `h-12 bg-muted border-b px-6` con "Vista previa como" + `<select>` de alumno (`h-8`) y, a la derecha, "Volver a Studio" (`outline`, `h-8`). Debajo, centrado con `py-6`, un marco de 390 × 844 `rounded-xl border` con la Athlete App adentro (`.theme-athlete`, ver P01). **Sin barra de estado falsa (hora, batería).**
- **Métricas, Ingresos, Documentación y constructor de rutinas:** solo reglas de `08 §2–3`. No se cambia su estructura en esta etapa.


---

### P12 · Vistas móviles (`390×844`) más allá de Inicio y viewports intermedios (`1366×768`, `768×1024`)

- **De:** frontend | qa
- **Bloquea:** FIX-V8, FIX-V10
- **Vista / componente:** Ficha, Directorio, Cobros, Agenda, Rutinas, Ranking y Sheet `"Más"` en `390×844` (`mobile`), `768×1024` (`tablet`) y `1366×768` (`desktop-1366`)
- **Contexto:** En `objetivo/html/` solo está dibujado `Movil.html` (Inicio a 390 px). Para el resto de las vistas en móvil y tablet existen las reglas de `02-vistas.md §9` y la matriz de `05-qa.md §3`. Asimismo, en `src/__tests__/` hay 7 tests heredados de la etapa Material 3 que exigen `min-h-[48px]` en controles de escritorio, lo que choca con `h-9` (`36 px`) y `h-8` (`32 px`) de `08 §3`.
- **Pregunta:** ¿Implementamos y auditamos las vistas móviles secundarias y los viewports `768` / `1366` con las reglas de `02-vistas.md §9` y `08 §4.7` (actualizando los 7 specs heredados de M3 para que `h-9`/`h-8` aplique en desktop y `≥ 44×44 px` en móvil), o se dibujarán más pantallas móviles en el canvas?
- **Opciones:**
  - A) Aplicar directamente `02-vistas.md §9` y `08 §4.7` sin esperar nuevos dibujos (en 390 px: barra inferior fija de 5 ítems con Sheet `"Más"`, KPIs en grilla `2×2`, tablas convertidas en cards de 2 líneas, Ficha en 1 columna con orden `Últimas sesiones → Salud → Rutina → Fuerza → Actividad → Membresía`, detalle de Agenda en Sheet inferior y áreas táctiles `≥ 44×44 px`), y actualizar los specs heredados de M3 a las nuevas alturas `h-9`/`h-8` en desktop.
  - B) Dibujar primero en el canvas las versiones móviles de Ficha, Cobros y Agenda antes de ejecutar `FIX-V8`.
- **Recomendación del PM:** A, porque las reglas de transformación responsiva de `02-vistas.md §9` y `05-qa.md §3` son completamente deterministas.
- **Respuesta:** 

**A, corrigiendo el orden de la ficha en móvil.** Va el de `02-vistas §4.2`: **Salud primero solo si hay dolor activo**; después Últimas sesiones, Rutina, Fuerza, Actividad y Membresía (y Salud en ese lugar si no hay dolor activo).
- **Alturas:** en escritorio rigen `h-9` (36 px) y `h-8` (32 px). En Coach Studio móvil (< 768 px), todo control interactivo tiene caja ≥ 44 × 44 (padding o `min-h-11`, sin agrandar el texto). Los 48 px quedan solo para la Athlete App.
- **Tests heredados:** se actualizan los 7 specs que exigen `min-h-[48px]` en Studio escritorio para que verifiquen las clases nuevas, sin relajar la aserción.
- **Tablet (768–1023 px):** menú lateral colapsado (56 px, solo íconos con Tooltip). Detalle de Agenda en Sheet. Ficha en una columna.


---

### P13 · Modo noche (`.dark`) y tokens de color para actividades (Boxeo/Funcional) y Alert de Salud

- **De:** frontend | qa
- **Bloquea:** FIX-V1, FIX-V4, FIX-V6, FIX-V10
- **Vista / componente:** `src/app/globals.css` (`.dark`), bloques de Agenda (`Agenda.html` L72) y Alert de Salud (`Ficha.html` L262–278)
- **Contexto:** El canvas no incluye capturas en modo noche. `08-fidelidad-visual.md §2` define la paleta `.dark`, pero en `:root` agrega `--act-funcional-bg/border` (`#F4F4F5`/`#D4D4D8`) y `--act-boxeo-bg/border` (`#FFF7ED`/`#FED7AA`) sin su equivalente dentro de `.dark` (lo que dejaría bloques crema brillantes en Agenda oscura). Además, en `Ficha.html` (L272) el botón activo `"Pendiente"` dentro del Segmented del Alert ámbar usa fondo `#FEF3C7` (`amber-100`) y texto `#78350F` (`amber-900`).
- **Pregunta:** ¿Alcanzan los tokens `.dark` de `08 §2` (agregando overrides oscuros para `--act-funcional-bg/border` y `--act-boxeo-bg/border` y usando los tokens semánticos `--warning-soft` / `--warning-soft-foreground` en el Alert) sin necesidad de diseñar pantallas nocturnas en el canvas?
- **Opciones:**
  - A) Sí: no hace falta dibujar modo noche en el canvas; agregamos en `.dark` de `globals.css` los pares `--act-funcional-bg: 240 3.7% 15.9%` / `--act-funcional-border: 240 5% 26%` y `--act-boxeo-bg: 28 73% 12%` / `--act-boxeo-border: 32 81% 29%`, y validamos `.dark` con contraste automático WCAG AA (`≥ 4.5:1`) y `box-shadow: none`.
  - B) Esperar capturas de modo noche en el canvas antes de cerrar `FIX-V1` y `FIX-V10`.
- **Recomendación del PM:** A, porque evita que los bloques de Boxeo y Funcional encandilen en modo oscuro y permite verificar `.dark` de forma automática con el helper WCAG AA de `05-qa.md §4`.
- **Respuesta:** 

**A, con los valores definitivos.** No se dibuja modo noche.
- **Agregar en `.dark`:**
  - `--act-funcional-bg: 240 3.7% 15.9%` y `--act-funcional-border: 240 5.3% 26%`
  - `--act-boxeo-bg: 21 75% 12%` y `--act-boxeo-border: 26 80% 30%`
- **Corrección a `08 §2`:** `--act-funcional-border` en `:root` es `240 5.9% 90%` (#E4E4E7), no #D4D4D8.
- **Token nuevo para el ítem activo de un Segmented dentro de un Alert:** `--warning-soft-strong`, con valor `48 96% 89%` (#FEF3C7) en `:root` y `26 85% 22%` en `.dark`.
- El texto del Alert usa `--warning-soft-foreground` (#92400E). El #78350F del canvas no se usa.
- **QA:** el helper de contraste corre en día y noche; cualquier par por debajo de 4,5:1 bloquea.


---

### P14 · Estados interactivos, Sheets, Dialogs y menús contextuales no dibujados en el canvas

- **De:** frontend | qa
- **Bloquea:** FIX-V2, FIX-V3, FIX-V4, FIX-V5, FIX-V6, FIX-V7
- **Vista / componente:** Carga (skeletons), estados vacíos/error, hover/focus, Sheet `"Registrar pago"`, Sheet `"Editar datos del alumno"`, modal `"Cambiar ejercicio"` (Quick Swap), Dialog `"Cancelar clase"`, modales de `"Alta de alumno"` / `"Nueva clase"` / `"Planes y precios"`, menús `⋯` y barra `"Personalizar"` activa
- **Contexto:** Los HTML objetivo muestran únicamente el estado cargado con datos y con todos los menús/modales cerrados.
- **Pregunta:** ¿Construimos todos los estados vacíos/carga/error y los Sheets/Dialogs/Popovers siguiendo las reglas y textos de `01-sistema-visual.md §2` y `02-vistas.md` (sobre `<dialog>` y `Popover` nativos, sin nuevas librerías), o alguno requiere maqueta previa en el canvas?
- **Opciones:**
  - A) Construirlos todos con las primitivas de `01-sistema-visual.md §2` y los campos/textos de `02-vistas.md` (Sheet derecho de `400 px` con `<dialog>` nativo, `DropdownMenu`/`Popover` con sombra `0 8px 24px rgb(0 0 0/.08)`, banda de `"Personalizar"` con borde punteado `--border` y botones `"Restablecer"` / `"Listo"`, y modales existentes estilizados con tokens zinc).
  - B) Diseñar en el canvas los Sheets de `"Registrar pago"`, `"Editar datos del alumno"` y `"Cambiar ejercicio"` antes de implementarlos.
- **Recomendación del PM:** A, porque `01-sistema-visual.md §2` y `02-vistas.md` ya especifican dimensiones, campos, validaciones y comportamiento de teclado (`Escape` y foco).
- **Respuesta:** 

**A.** Las medidas que faltaban:
- **Banda de Personalizar:** `mx-6 mt-4 px-3.5 py-2.5 rounded-lg border bg-sidebar flex items-center gap-3`, texto 13 `text-muted-foreground`; a la derecha "Restablecer" (`outline`, `h-8`) y "Listo" (`default`, `h-8`).
- **Isla en modo edición:** `border-dashed border-subtle-foreground/60`, asa `grip-vertical` de 16 px en un botón `size-8 ghost` a la izquierda del título. No hay flechas visibles: el teclado actúa sobre el asa (ver P03).
- **Estados de carga:** skeletons con la forma final (KPI 104 px; filas 44 px; isla con el header real y 3 líneas).
- **Vacío y error:** según `01 §2.9–2.11`.
- **Formularios** (Registrar pago, Alta de alumno, Nueva clase, Anotar alumno, Sumar alumno, Planes y precios, Editar datos del alumno): Sheet derecho de 400 px. **Confirmaciones** (Cancelar clase, Dar de baja): Dialog de 420 px. **"Ver recibo":** Dialog de 480 px con vista de recibo y "Descargar PDF" si ya existe la función. **Quick Swap ("Cambiar ejercicio"):** Sheet de 400 px con buscador arriba y lista de alternativas debajo.
- Los modales actuales se reestilan, sin rehacer su lógica.


---

### P15 · Criterio binario de "¿Qué es igual al objetivo?", tolerancia en medidas y responsable del OK visual final

- **De:** qa | pm
- **Bloquea:** FIX-V1 a FIX-V10
- **Vista / componente:** Proceso de QA y cierre de PRs (`tests/e2e/regresion-visual-viewports.e2e.ts` y `comparar/<vista>.jpg`)
- **Contexto:** `09-pm-preguntas.md §5.14–15` pide definir un criterio verificable para decidir si una vista quedó igual al objetivo sin discusiones subjetivas, y definir quién da el OK visual final en cada PR.
- **Pregunta:** ¿Cuál es el contrato binario de aceptación visual y el flujo de aprobación para hacer merge de `FIX-V1` a `FIX-V10`?
- **Opciones:**
  - A) Una vista se considera "igual al objetivo" cuando cumple simultáneamente: (1) 100 % de los ítems del checklist binario de `08-fidelidad-visual.md §4`, (2) 100 % de las aserciones automáticas de `getComputedStyle` y geometría de `FIX-V10` (con tolerancia `±2 px` en alturas/anchos de caja para absorber redondeo subpíxel de fuentes), y (3) imagen regenerada en `docs/ux-ui-review/comparar/<vista>.jpg` auditada por `@qa-eng`; con eso `@PM-GOZster` hace merge de cada PR y el dueño del producto realiza la validación visual final sobre el conjunto completo de `comparar/*.jpg`.
  - B) Cada PR individual de vista (`FIX-V3` a `FIX-V8`) debe quedar bloqueado en `in_review` esperando aprobación humana del dueño del producto antes de que `@PM-GOZster` pueda hacer merge.
- **Recomendación del PM:** A, porque establece un criterio 100 % objetivo y reproducible por Playwright y permite entregar la cadena completa con todas las comparativas `comparar/<vista>.jpg` actualizadas de una sola vez.
- **Respuesta:** 

**A, con un punto de control humano al inicio** (para no descubrir al final que la dirección es incorrecta):
- **Contrato binario por PR:**
  1. 100 % del checklist de `08 §4` de esa vista.
  2. 100 % de las aserciones de estilo computado de FIX-V10, con tolerancia **±2 px** en dimensiones de caja y **valor exacto** en colores, radios, sombras y `text-transform`.
  3. `comparar/<vista>.jpg` regenerado **con el stub en vivo** y adjunto al PR.
  4. Gate verde.
- **Flujo:** QA aprueba y el PM hace merge. **Excepción:** el **primer PR de vista de la Ola 2 (Inicio)** queda en revisión hasta que el dueño del producto mire `comparar/inicio.jpg` y responda "ok" o una lista de cambios en el issue. Después de ese ok, el resto sigue con aprobación de QA, y el dueño valida el conjunto completo al final de la Ola 3.
- No se usa `toHaveScreenshot` contra los PNG del canvas: los datos y el renderizado de fuentes difieren y daría falsos negativos.


---

### P16 · Orden de ejecución (`FIX-01..09` vs. `FIX-V1..V10`) y estrategia de PRs (uno por vista vs. uno por issue)

- **De:** pm | frontend | backend | qa
- **Bloquea:** FIX-V1 a FIX-V10, FIX-01 a FIX-09
- **Vista / componente:** Plan de ejecución del Sprint y gobernanza de ramas/PRs en `Fresias/gozster`
- **Contexto:** `09-pm-preguntas.md §5.16–17` consulta en qué orden ejecutar los fixes de datos abiertos (`FIX-01` a `FIX-09` de `07-revision-implementacion.md §8`, con `FIX-02` ya en curso en `GOZS-402`) respecto de los visuales (`FIX-V1` a `FIX-V10` de `08-fidelidad-visual.md §6`), y si conviene abrir un PR por issue o agrupar por vista.
- **Pregunta:** Una vez respondido este documento, ¿en qué orden ejecutamos los issues y cómo cortamos los PRs?
- **Opciones:**
  - A) Ejecutar en **4 olas atómicas** donde cada PR de vista resuelve juntos su fidelidad visual (`FIX-V*`) y su fix de datos (`FIX-0*`): **Ola 1 (Base):** `FIX-03` + `FIX-06` (migración menor de DB para `v_dolor_activo`, permisos, peso corporal y `registrar_pago`) en paralelo con `FIX-V1` + `FIX-V2` (tokens zinc, `globals.css`, primitivas y `StudioShell`); **Ola 2 (Vistas core):** un PR por vista combinando `FIX-V3 + FIX-05` (Inicio), `FIX-V4 + FIX-01 + FIX-07` (Ficha) y `FIX-V5 + FIX-04` (Cobros); **Ola 3 (Resto de vistas):** `FIX-V6` (Agenda), `FIX-V7` (Rutinas + Ranking), `FIX-V8 + FIX-08` (Móvil 390), `FIX-V9` (Vista previa alumno) y `FIX-09` (Métricas/Sankey/Header); **Ola 4 (Cierre QA):** `FIX-V10` (regeneración de `comparar/*.jpg` y suite E2E completa).
  - B) Ejecutar primero todos los issues de datos (`FIX-01` a `FIX-09`) en PRs separados sobre la interfaz actual, y recién después abrir los 10 PRs visuales (`FIX-V1` a `FIX-V10`).
- **Recomendación del PM:** A, porque evita tocar dos veces los mismos archivos (`Ficha`, `Inicio`, `Cobros`), reduce conflictos de merge y garantiza que cada vista quede cerrada en datos y diseño en una sola pasada verificada por `@qa-eng`.
- **Respuesta:** 

**A, reordenando las olas.** El mapa del PM mezcla qué es migración y qué es frontend:
- **Ola 1 · Base:**
  - Backend: una migración menor con `v_dolor_activo.nivel` (alarma o crítico = alto), revocar `anon`, sacar al alumno de `actualizar_estado_dolor`, el comentario en `fn_derivar_severidad_dolor` y `registrar_pago` con 4 medios.
  - Frontend: **FIX-V1** + **FIX-V2** + **FIX-04** (un solo camino de escritura del estado de dolor).
  - FIX-02 sigue en curso (GOZS-402).
- **Ola 2 · Vistas núcleo (un PR por vista):**
  - **Inicio** = FIX-V3 + FIX-05 + la parte de Inicio de FIX-06.
  - **Ficha** = FIX-V4 + FIX-01 + FIX-03 + FIX-07, con P03 a P07.
  - **Cobros** = FIX-V5 + la parte de Cobros de FIX-06, con P08 y P10.
  - Inicio va primero por el punto de control de P15.
- **Ola 3 · Resto:** Agenda (FIX-V6, con P11), Rutinas + Ranking (FIX-V7), Ingresos + Métricas (resto de FIX-06 + reglas de `08 §3`), Móvil (FIX-V8, con P12), Vista previa (FIX-V9, con P11) y copy pendiente (FIX-09).
- **Transversal:** **FIX-08** (tests contra datos en vivo y guard de datos de ejemplo) lo escribe QA en la Ola 1 y se aplica como requisito a cada PR de las Olas 2 y 3.
- **Ola 4 · Cierre:** FIX-V10, regeneración de todos los `comparar/*.jpg` y revisión final del dueño.
- **PRs:** uno por vista (o por base en la Ola 1), referenciando todos los issues que cierra.


---

## Ya respondido en los documentos (no hace falta preguntar)

- **Paleta y tokens base de Coach Studio (`D1 = B`):** respondido en `08-fidelidad-visual.md §2` → Coach Studio usa neutros zinc con fondo `#FFFFFF`, primario `#18181B` y sin tinte azulado.
- **Primitivas UI nativas sin nuevas dependencias (`D2 = A`):** respondido en `01-sistema-visual.md §2` → `Sheet` y `Dialog` sobre `<dialog>` nativo; `DropdownMenu`, `Popover` y `Tooltip` sin instalar paquetes de `@radix-ui/*`.
- **Fórmula y subtítulo de "Tasa de cobro" en Inicio y Cobros:** respondido en `08-fidelidad-visual.md` (preámbulo *"Qué manda en caso de diferencia: `02-vistas.md` manda en datos, reglas y textos"*) y `02-vistas.md §5` → es `cobrado / facturado` en pesos y el subtítulo es `"$767.000 de $1.107.000 facturados"` (no `"25 de 36 contratos pagos"` del canvas).
- **Menú lateral en pantallas secundarias (240 px vs. 56 px del canvas):** respondido en `08-fidelidad-visual.md §1` (*"Dos cosas del canvas que NO se copian"*, punto 1) y `§3 Sidebar` → el riel de 56 px del canvas es solo una abreviatura del dibujo; en todas las pantallas va el menú completo de Inicio (`240 px`, agrupado en **Alumnos / Operación / Negocio** — corrección del diseñador: no `Principal / Seguimiento / Gestión`), colapsable por el usuario (`02-vistas.md §1`).
- **Directorio de alumnos abierto por defecto en Inicio (`D5 = A`):** respondido en `08-fidelidad-visual.md §4.1` y `07-revision-implementacion.md §2 FE-08` → la tabla va directamente visible en una card con toolbar de una línea, sin el acordeón colapsado `"Alumnos 15 ▲"`.
- **Comportamiento de "Vista del alumno" en el sidebar (`FIX-V9`):** respondido en `08-fidelidad-visual.md §5` y `§6 FIX-V9` → el enlace del sidebar no navega a `/athlete` perdiendo el shell del entrenador, sino que abre la vista previa del alumno dentro de `/studio` con opción `"Volver a Studio"`.
- **Eliminación de "Bandeja de alertas críticas", "Salud: x/100" y botón "Cargas Históricas" en cabecera:** respondido en `08-fidelidad-visual.md §4.1–4.2` y `02-vistas.md §2, §4.1` → las alertas críticas viven ordenadas por prioridad dentro de `"Para revisar hoy"`, el puntaje `"Salud: 86.5/100"` se elimina, y `"Historial de cargas"` pasa al menú `⋯` de la cabecera de Ficha.
- **Correcciones de seguridad y severidad en `v_dolor_activo` y `actualizar_estado_dolor`:** respondido en `07-revision-implementacion.md §4 P1-3, §5.7 y §8 FIX-03/FIX-06` (y verificado por `@backend-eng` en `20261106110000_dolor_eva_estado_unico.sql`) → `v_dolor_activo.nivel` debe contemplar `es_sintoma_alarma = true OR severidad = 'CRITICA'`, revocar `SELECT` a `anon` y restringir `actualizar_estado_dolor` exclusivamente al staff autorizado.

---

## Respuestas a puntos de los relevamientos que no entraron en P01–P16

Respondidos por el diseñador a partir de los relevamientos de `@frontend-eng` y `@qa-eng`.

| Punto | Respuesta |
|---|---|
| **QA C2** · alturas heredadas de Material 3 | Ver P12: 36/32 px en escritorio, ≥ 44 px en Studio móvil y 48 px solo en la Athlete App. Se actualizan los 7 specs. |
| **QA C3** · bandeja de alertas | Sí: aserción negativa (la bandeja no existe en Inicio) más una positiva que verifique que las alertas críticas aparecen primeras en "Para revisar hoy". |
| **QA C4** · cabecera e islas de la ficha | Sí: migrar los specs al flujo nuevo. Personalizar es un botón de ícono con `aria-label="Personalizar el orden de las secciones"` y `aria-pressed`; "Ver como alumno" pasa al menú `⋯`; asas solo con Personalizar activo; sin flechas visibles. |
| **QA C5** · Brzycki y heatmap | Ver P06. Brzycki sigue verificado en el Popover y en los tests unitarios; el heatmap, en la pestaña Registros. No se pierde cobertura. |
| **QA C6** · cómo se abre el constructor | "Nueva rutina" abre el constructor vacío. **Click en la card** abre el constructor en modo edición de esa rutina. El `⋯` de la card tiene Editar, Duplicar, Guardar como plantilla, Asignar a otro alumno y Archivar. El `data-testid="rutinas-main-nav-tabs"` se reemplaza por `rutinas-coleccion` (el Segmented de colección). |
| **QA C7** · tarjeta de sincronización | Se verifica "Sincronizado" (o "Sin conexión · reintentando") dentro del botón de cuenta del pie del menú. |
| **Frontend 1.2** · Quick Swap | Sheet de 400 px (ver P14). |
| **Frontend 3.2** · sparkline con 0 o 1 punto | Ver P04: con menos de 2 puntos no se dibuja el sparkline y solo queda la cifra. |
| **Frontend 3.3** · primitivas nativas | Confirmado: sin dependencias nuevas. |
