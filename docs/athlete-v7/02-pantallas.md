# 02 · Pantallas

> Cada sección indica la **clave de captura** (`referencia/athlete-v7.html?screen=<clave>&embed=1`; PNG en `referencia/png/<clave>-light.png` y `-dark.png`), el componente actual, la estructura de arriba hacia abajo, el copy exacto y la brecha con la app de hoy.
> Clases con prefijo `a-` = clases de la referencia portadas a `athlete-v7.css` (ver `01 §1`). Datos de ejemplo de la referencia: Lucía Fernández, plan "PLAN GENERAL", Día 1 a 3. **La app nunca muestra datos de ejemplo** (`assertNoDemoLiteralsInLiveMode`): siempre muestra los datos reales del alumno.

---

## 0. Shell (todas las pantallas principales) · FE-02

**Componente actual:** `athlete-shell.tsx`. Encabezado con logo, `ModeSwitcher`, chip "Online/Modo Avión", `ThemeToggle`, salir. Pestañas de texto arriba. En escritorio, riel lateral.

**Referencia:**
1. Franja diagonal `.a-chev` de 8 px pegada arriba.
2. Encabezado `.a-ahead` (fila, gap 8): logo de 19 px (negro de día, blanco de noche) · chip de red `.a-net` alineado a la derecha · icon-btn tema (sol de día, luna de noche; `aria-label` "Usar tema oscuro" / "Usar tema claro") · icon-btn salir (`aria-label` "Cerrar sesión").
3. Contenido con `padding: 24px 16px 112px` (230 px abajo si está el panel de descanso).
4. **Navegación inferior** `.a-bnav` fija, 4 ítems con ícono y etiqueta: Entrenar (`dumbbell`), Historial (`history`), Progreso (`trend`), Clases (`calendar`). Activo: pastilla de tinta detrás del ícono y texto 700; `aria-current="page"`.
5. **Botón de chat flotante** `.a-fab` (solo en la pestaña Entrenar), con insignia roja con la cantidad de mensajes sin leer; `aria-label` "Chat con el coach, 1 mensaje nuevo".

**Chip de red** (`a-t-sec`, pastilla de 32 px):

| Estado | Texto | Estilo |
|---|---|---|
| Con señal | "Online" | `--ok-bg` / `--ok-fg`, punto lleno |
| Sin señal, nada pendiente | "Sin señal · se guarda igual" | `--warn-*`, borde punteado, punto hueco |
| Sin señal con series en el teléfono | "Sin señal · 3 series" (`aria-label` "Sin señal, 3 series guardadas en el teléfono") | igual |
| Enviando | "Enviando 3 series…" | igual |

**Reglas:** durante la rutina, el ejercicio, el cierre, el onboarding y el cuestionario **no** se muestran la navegación inferior ni el botón de chat (se vuelve con "Mis días" o "Volver"). `ModeSwitcher` (solo lo ve el rol ADMIN) se conserva como fila debajo del encabezado. En escritorio (≥ 1024 px) se mantiene la columna centrada de `max-width: 28rem` y la navegación inferior centrada al mismo ancho: no hace falta el riel lateral.

**Brecha:** pestañas arriba → abajo con íconos; "Modo Avión" → textos de la tabla; `ThemeToggle` → botón propio con `useTheme()`; falta el botón flotante de chat (hoy `athlete-chat.tsx` tiene su propio botón: se reubica y se reestiliza).

---

## 1. Inicio · FE-03

| Clave | Estado |
|---|---|
| `inicio` | Con plan, mensaje del coach sin leer, tarjeta de instalar |
| `inicio-dia` | Hoja "¿Qué día querés hacer hoy?" |
| `inicio-sinplan` | Sin plan |
| `inicio-cargando` | Cargando (después de 1 s) |
| `inicio-error` | Error |
| `inicio-vencida` | Suscripción vencida (banner) |
| `inicio-suscripcion` | Hoja centrada de la suscripción |
| `inicio-semana` | Día 1 hecho, te toca el Día 2 |
| `inicio-offline` | Sin señal, nada pendiente |
| `inicio-pendientes` | Sin señal con 3 series en el teléfono y sesión empezada ("Seguir Día 1") |
| `inicio-instalar`, `inicio-instalar-android` | Hoja de instalación (iPhone y Android) |

**Componente actual:** `inicio-mis-dias.tsx` (+ `membership-paywall.tsx`).

**Estructura (con plan):**
1. Shell.
2. Saludo: `a-t-sec` muted "Hola, {nombre}" · `a-t-d` nombre del plan en mayúsculas ("PLAN GENERAL") · `a-t-sec` muted "Semana 3". **{nombre} = `nombre_preferido` o, si falta, el primer nombre de `nombre_completo`** (BE-01).
3. Tarjeta del coach (si hay mensaje sin leer): `.a-card .a-coachmsg`, avatar cuadrado de 36 px en tinta con ícono `msg` · "Mensaje del coach" + chip `NUEVO` (tinta) · preview del mensaje en una línea con elipsis · chevron. Abre el chat.
4. Tarjeta de instalar (si la app no está instalada y no se descartó): ícono `download` en cuadrado de 40 px · `a-t-bs` "Instalá GOZSter en tu inicio" · `a-t-sec` "Así abre aunque no haya señal en el gimnasio. En iPhone es la única forma." · botón "Cómo instalar" + enlace "Ahora no". Abre la hoja de instalación (iPhone / Android, 4 pasos numerados).
5. **Héroe "Te toca hoy"** (`.a-hero`, nivel 2, **invertido de noche**): eyebrow `TE TOCA HOY` + chip `CON BISERIE` si el día tiene biserie · `a-t-d` "Día 1" · `a-t-sec` "4 ejercicios · ~37 min" · botón `.a-btn.a-hbtn.gym` "▶ Empezar Día 1" ("Seguir Día 1" si hay sesión empezada) · botón contorno "⇄ Hacer otro día". Dos cuñas diagonales decorativas a la derecha (detrás de los botones).
6. Fila: eyebrow `TUS DÍAS` · `0/3 ESTA SEMANA`.
7. Lista de días (`.a-card .a-days`): número en cuadrado de 40 px (tinta si es hoy) · "Día 1 · DÍA 1" · "Te toca hoy" o "3 ejercicios · ~29 min" · chip `✓ HECHO` o chevron.

**Hoja "Hacer otro día":** título "¿Qué día querés hacer hoy?" · subtítulo "El Día 1 no se pierde: queda como el próximo." · opciones (la actual dice "El que te tocaba") · botón gym "Hacer Día 2 hoy". Con sesión empezada, tocar otro día muestra el toast "Terminá la sesión actual antes de cambiar de día.".

**Estados:**
- Cargando: nada durante el primer segundo; después tarjeta con tres puntos que laten, "Cargando tu plan…" y "Si tarda, revisá la señal. Lo último que viste queda guardado." **Nunca "No tenés plan" mientras carga.**
- Sin plan: "Todavía no tenés un plan" · "Tu coach te lo va a asignar pronto. Mientras, podés escribirle." · botón "Escribirle al coach".
- Error: "No pudimos cargar tu plan" · "Pasó algo de nuestro lado. Tus series guardadas no se perdieron." · "Reintentar".
- Vencida: banner `.a-banner` (advertencia) "Tu suscripción venció" · "Seguís con acceso completo. Hablá con el equipo para regularizar tu cuota." · "Hablar con GOZS" + "Ver detalle". La primera vez se abre la hoja centrada de suscripción (alias `GOZSTER.FIT` con "Copiar", 3 pasos, "Hablar con el equipo GOZS", "Enviar comprobante por WhatsApp", "Entendido, seguir usando la app"). Nunca bloquea.

**Brecha:** el héroe existe pero con otro estilo; falta la tarjeta de instalar; revisar que el estado de carga no muestre "sin plan".

---

## 2. Rutina del día · FE-04

| Clave | Estado |
|---|---|
| `rutina` | Rutina antes de empezar |
| `rutina-curso` | En curso: Sentadilla hecha, biserie 1/3, próximo marcado |
| `rutina-terminar` | Confirmación en línea "Te faltan 7 series." |
| `rutina-molestia` | Chip `MOLESTIA` en el ejercicio reportado |
| `registro` | Pestaña "Registro de la sesión" sin series |
| `registro-datos` | Registro con series guardadas y una en el teléfono |
| `config` | Hoja de Configuración |

**Componente actual:** parte superior de `live-workout.tsx` (columna `exercise-selector-column`). Hoy rutina y ejercicio están apilados en una sola pantalla. **Pasa a ser una pantalla propia** (`rutina-del-dia.tsx`), sin navegación inferior.

**Estructura:**
1. Fila: botón `.a-back` "‹ Mis días" · herramienta engranaje (`aria-label` "Configuración").
2. Título `a-t-d` "DÍA 1" · `a-t-sec` "{nombre_completo} · 4 ejercicios" · chip con timer de la sesión `⏱ 06:00` si empezó.
3. Barra de error de guardado (si corresponde, ver §3).
4. Tarjeta del coach (si hay mensaje sin leer).
5. Tarjeta de avance: "0 de 4 ejercicios" · `0/13 SERIES` · barra segmentada (un segmento por serie, agrupados por ejercicio, en tinta los hechos). En Técnica: "Volumen efectivo: X kg · Bruto: Y kg".
6. Segmentado de pastilla: "Entrenar" | "Registro de la sesión".
7. **Entrenar:** eyebrow `RUTINA` · filas de ejercicio `.a-card.a-row` (número en cuadrado · nombre `a-t-bs` · "8-10 reps · 3 series" (o "45 s · 3 series", "10 reps por lado · 3 series") · chips de tipo · a la derecha puntos de series, `✓ HECHO` o chip rojo `⚠ MOLESTIA`). El **próximo** ejercicio lleva borde de 2 px `--sel-line`, fondo `--sel-soft` y número en tinta. Biserie: contenedor `.a-ss` con borde de tinta de 1,5 px, encabezado `BISERIE A1 · SIN DESCANSO ENTRE EJERCICIOS` y `1/3`.
8. Botón gym "Empezar →" o "Seguir: {ejercicio} →".
9. Botón `.a-molbtn` "⚠ Tengo una molestia" (borde rojo, texto `--bad-fg`).
10. "Terminar sesión" (contorno si quedan ejercicios). Si faltan series: confirmación en línea "Te faltan N series." · "Lo que registraste se guarda igual." · "Seguir" | "Terminar".
11. **Registro de la sesión:** por ejercicio, nombre + `2/3`, lista de series ("Serie 1 · 45 kg × 9" + estado). Vacío: "Todavía no guardaste ninguna serie hoy" + "Empezar a entrenar".

**Hoja Configuración:** "Cómo te llamamos" (input, guarda al salir del campo con el toast "Listo, te llamamos {nombre}") · "Modo de visualización" Simple | Técnica + "Tu coach te recomienda: Simple" · "Cuánto suman los botones de peso" ±1,25 / ±2,5 / ±5 / ±10 kg · interruptor "Mostrar el descanso" ("Reloj después de cada serie") · fila "Cuestionario inicial" (Completado / Opcional) · "Cerrar".

**Brecha:** separar la pantalla; barra segmentada; contenedor de biserie; "próximo" marcado; confirmación de terminar en línea; agregar el nombre a Configuración.

---

## 3. Ejercicio activo · FE-05 (+ FE-06, FE-07, FE-08)

| Clave | Estado |
|---|---|
| `ex-aprox` | Sentadilla con aproximación W1 a W4 |
| `ex-ss` | Press banca dentro de biserie |
| `ex-tec` | Vista Técnica (RPE, 1RM, barra, discos) |
| `ex-tiempo` | Plancha por tiempo |
| `ex-drop` | Drop set |
| `ex-uni` | Zancada por lado |
| `ex-tec-rpe` | Técnica con la ayuda de RPE abierta |
| `ex-tiempo-run` | Plancha con el reloj corriendo ("Detener") |
| `ex-drop-2` | Drop set en el segundo tramo |
| `ex-uni-izq` | Por lado: derecha cargada, falta izquierda |
| `ex-rest` | Panel de descanso activo |
| `ex-rest-pausa` | Descanso en pausa ("PAUSADO") |
| `ex-descanso-info` | Ayuda del botón de descanso |
| `ex-completo` | "Ejercicio completo" + "Siguiente: …" |
| `ex-offline` | Sin señal: series "En el teléfono" |
| `toast-sinsenal`, `toast-record` | Toasts de advertencia y de récord |
| `ex-record` | Aviso de récord (FE-06) |
| `ex-x10` | Aviso de peso mal tecleado |
| `ex-rej` | Serie no guardada |
| `ex-videos` | Registradas, una con video (FE-07) |
| `ex-video-estados` | Los 4 estados del video de la serie (FE-07) |
| `setvideo` | Hoja "Video de la serie 2" (FE-07) |
| `notes` | Hoja de indicaciones con formato (FE-07) |
| `video` | Hoja del video demostrativo (FE-07) |

**Componente actual:** parte inferior de `live-workout.tsx` + `ultima-vez.tsx`, `sugerencia-carga.tsx`, `aviso-record.tsx`, `rest-timer.tsx`, `warmup-modal.tsx`, `pain-banner.tsx`. **Pasa a ser una pantalla propia** (`ejercicio-activo.tsx`), sin navegación inferior.

**Estructura:**
1. Fila: `.a-back` "‹ DÍA 1" · herramientas de 48 px: indicaciones (`note`, solo si hay texto; `aria-label` "Indicaciones del ejercicio") · video (`video`; "Video del ejercicio") · descanso ancho `⏱ 90 S` ("Descanso recomendado: 90 segundos"; al tocarlo muestra la ayuda "Descanso: 90 s. Es lo que tu coach recomienda entre una serie y la siguiente.").
2. Eyebrow `EJERCICIO 2 DE 4` + chip timer de sesión + chip `💡 PANTALLA ACTIVA` (ícono `bulb`) si Wake Lock está activo.
3. Nombre `a-t-h` + chips: músculos (`a-t-sec`), `BISERIE A1`, tipo (`APROXIMACIÓN` punteado, `DROP SET`, `POR LADO`, `⏱ TIEMPO`).
4. Barra de error de guardado (D3 del PM).
5. Molestia: aviso completo o heredado (§3.3).
6. Aproximación (si corresponde): tarjeta "Aproximación" · "Calculada desde tu peso de trabajo (62,5 kg) · opcional" · enlace "Saltar" · filas W1 a W4 (`W1` en tinta, "20 × 8 Barra vacía", "32,5 × 5 50 %", "45 × 3 70 %", "52,5 × 2 85 %") con "Registrar" → "✓ Hecha" · botón "Cargar 4 series". **Va en línea, no en un modal** (hoy `warmup-modal.tsx`).
7. Aviso de récord (FE-06, `01 §8`).
8. **Tarjeta de serie** `.a-setcard` (borde de tinta de 2 px, radio 24, nivel 2):
   - Pastilla `SERIE 1 DE 3` en tinta · `OBJ. 8-10` (`OBJ. 10 POR LADO`, `OBJ. 45 S`).
   - "↻ Última vez: **45 kg × 9** · 10/11".
   - Solo en la serie 1: sugerencia `.a-sug` ("Probá 47,5 kg" / "Completaste todas las reps la última vez." con flecha arriba, o "Repetí 45 kg" / "La última vez quedaron reps sin completar. Primero completalas con este peso." con ícono repetir). Tocarla aplica el peso.
   - Desde la serie 2: botón punteado "↻ Igual que la anterior   45 kg × 9".
   - Unilateral: segmentado Derecha | Izquierda (check en el lado ya cargado).
   - Label `PESO` · stepper: `−2,5` | campo `45` con unidad "kg" | `+2,5`. El paso sale de Configuración.
   - Aviso ×10 (si el peso es ≥ 1,8 o ≤ 0,55 veces el de referencia): caja con borde izquierdo de tinta "⚠ ¿450 kg?" · "Es mucho más que la última vez (45 kg). Revisá si se te escapó un cero o la coma." · "Corregir" | "Sí, es correcto". Aparece al salir del campo y se va al corregir. **En línea, no como diálogo** (hoy `atypical-confirmation-dialog`).
   - Label `REPETICIONES` · stepper `−1` | campo | `+1`.
   - Vista Técnica (`.a-tec`): Tipo de serie · RPE objetivo "**8** · lo prescribe tu coach" · 1RM estimado con `?` · "Tu RPE" con `?` (ayuda: "RPE 8: podías hacer 2 repeticiones más.") · fila RPE 6 a 10 de a 0,5 (2 filas de 5) · Barra: Olímpica 20 / Semi 15 / EZ 10 / Otra (a medida, en 2 × 2) · "Carga por lado" `a-t-mm` + discos por lado (chips; los de ≥ 10 kg en tinta).
   - Botón gym "✓ Registrar serie 1" ("Registrar derecha", "Siguiente drop →", "Registrar 46 s").
   - Puntos de página (uno por serie).
   - Por tiempo: reloj `TEMPORIZADOR DEL EJERCICIO` `00:45` (`a-t-ml`), stepper ±5 s, "▶ Iniciar" y "✓ Registrar 45 s".
   - Drop set: info "**Drop set:** al terminar, bajás el peso sin descanso para extender la fatiga." · tarjeta punteada con trama · cargas `47,5 kg ▼ 37,5 kg` (la actual en negrita) · carga actual `a-t-ml` · reps · "Siguiente drop →".
9. Ejercicio completo: "✓ Ejercicio completo" · "3 series registradas." · "Siguiente: {ejercicio} →" o "Terminar sesión".
10. `.a-molbtn` "Tengo una molestia" (no se muestra si el ejercicio está bloqueado).
11. Eyebrow `REGISTRADAS` + lista: "**Serie 1** · 45 kg × 9" (+ " · RPE 8" en Técnica) · chip `🏆 PR` dorado si fue récord · **botón "▶ Video" o chip `VIDEO`** (FE-07) · estado a la derecha: "✓ Guardada" | "📱 En el teléfono" | "Enviando…" | "⚠ No se guardó" (+ "Corregir" / "Volver a enviar"; según D3).

**Panel de descanso** (`ex-rest`, `.a-restbar`, nivel 3, fijo abajo, radio 24 arriba): barra de 5 px que se llena · "DESCANSO" (o "PAUSADO") + "Sentadilla con barra · Serie 2" · a la derecha `0:46` en `a-t-ml` a 2,75rem (**transcurrido**, no regresivo) y "de 2:30 · faltan 1:44" · 4 botones de 52 px: `−30 s`, `+30 s`, pausa/reanudar (tinta), `Omitir`. Al terminar: sonido y vibración (Android), toast "Terminó el descanso. A la serie.". Si "Mostrar el descanso" está apagado: toast "Serie guardada. Sigue: …".

**Biserie:** al registrar A1 pasa sola a A2 con el toast "Biserie, sin descanso: {ejercicio}"; el descanso corre después de la última del grupo.

**Brecha principal:** pantalla separada; campos con `a-t-mi` (hoy los números grandes no entran con 5 cifras); "Igual que la anterior" no existe; aviso ×10 y aproximación pasan a estar en línea; descanso en panel inferior con tiempo transcurrido; estados de guardado visibles (hoy la cola es invisible).

### 3.1 Hoja de indicaciones (`notes`) · D-49

Hoja desde abajo (`.a-sheet`, radio 28 arriba, manija de 40 × 5): título `a-t-h` "Indicaciones del ejercicio" · subtítulo "Sentadilla con barra · Cuádriceps, Glúteos" · botón cerrar. Encabezado **pegajoso** al deslizar.

Contenido, a partir del parser (`03-backend.md §4`), en este orden y solo las secciones con datos:
- Texto libre (lo que no está bajo ningún encabezado), párrafos `a-t-body`.
- `PASOS`: lista numerada; cada paso en fila `--surface-2` con radio 12 y número en círculo de tinta de 30 px.
- `PUNTOS CLAVE`: viñetas con check.
- `ERRORES COMUNES`: viñetas con × en `--bad-fg`.
- `TEMPO Y RESPIRACIÓN`: caja `--surface-2` con "Tempo" `3-1-X-1` (Archivo 1,5rem) y "Respiración" en `a-t-body`.
- Botón "Volver al ejercicio".

**La hoja crece con el texto** (altura automática) hasta `100% − 40px`. Si el texto no entra, **se desliza adentro** (`overflow:auto`, `overscroll-behavior:contain`), con el encabezado fijo arriba.

### 3.2 Videos separados · D-50

- **`video` (botón del ejercicio):** "Video del ejercicio" · nombre · cuadro 16:9 negro con play (embed de YouTube cuando hay `url_video`) · "Video demostrativo que cargó tu coach." · "Volver al ejercicio". **Nada para subir.** Sin `url_video`: el botón no se muestra (hoy ofrece buscar en YouTube: se quita).
- **`setvideo` (desde Registradas):** botón "▶ Video" en cada serie registrada (`aria-label` "Agregar video a la serie N") → hoja "Video de la serie 2" · "Press banca plano · opcional · tu coach lo ve en tu registro" · "Grabar ahora" (`<input type="file" accept="video/*" capture="environment">`) · "Elegir de la galería" (`accept="video/*"`) · "Hasta 2 minutos o 100 MB. Sin señal, queda en el teléfono y se envía cuando vuelva." · "Pegar un enlace" (despliega el campo "Enlace al video", `type="url"`) · confirmación con check del archivo o enlace elegido · botón "Adjuntar a la serie 2" (deshabilitado sin video). Toast al adjuntar: "Video adjunto a la serie 2" (sin señal: "Sin señal: el video se envía cuando vuelva la conexión.").
- **Errores** (debajo de las opciones, caja `.a-ferr` con borde izquierdo de tinta): más de 100 MB → "El video pesa más de 100 MB. Grabá uno más corto o pegá un enlace." · más de 2 minutos → "El video dura más de 2 minutos. Grabá uno más corto o pegá un enlace." · formato → "Ese archivo no es un video que podamos subir (MP4, MOV o WebM)." · enlace → "Pegá un enlace que empiece con https://".
- **Estados en la fila de Registradas** (`ex-video-estados`): sin video → botón "▶ Video" · listo → chip `▶ VIDEO` · subiendo → chip `↑ SUBIENDO…` (`role="status"`) · sin señal → chip punteado `📱 VIDEO EN EL TELÉFONO` (ícono `phone`) · error → botón "⚠ Reintentar video". La pestaña "Registro de la sesión" muestra el mismo chip. Datos y subida: `03b-video-serie.md`.

### 3.3 Molestias · D-51 · FE-08

| Clave | Qué muestra |
|---|---|
| `mol-modal` | Hoja "Tengo una molestia" (5/10, moderada) |
| `mol-modal-alta`, `mol-modal-alarma` | Hoja con intensidad 8 (botones 7-10 en rojo) y con síntoma de alarma |
| `rutina-molestia` | Chip rojo en la rutina |
| `mol-leve`, `mol-mod`, `mol-alta`, `mol-alarma` | Aviso completo en el ejercicio reportado (Press banca) |
| `mol-hereda` | Hombro reportado en Press banca → **Remo** (Espalda, tren superior) muestra el formato chico |
| `mol-lumbar` | Lumbar reportado en Sentadilla → **Plancha** (Core) muestra el formato chico |
| `mol-no-hereda` | Hombro reportado en Press banca → **Sentadilla** (Piernas) no muestra nada |
| `mol-otro` | Zona "Otro" en Press banca → **Remo** no muestra nada |

**Hoja:** "Tengo una molestia" · "Tu coach recibe el aviso y decide si cambia el ejercicio." · select Ejercicio · Zona en 2 columnas (Hombro, Rodilla, Espalda baja / Lumbar, Codo, Cuello / Cervical, Cadera, Tobillo, Otro) · "Cuándo apareció" (Calentamiento, Durante la serie, Post-ejercicio) · Intensidad 1 a 10 en 2 filas de 5 (7 a 10 en rojo al elegirse) con "5/10 · moderada" · mensaje según nivel · "Síntomas de alarma" (4 checks) · Comentario opcional · botón rojo gym "Avisar a mi coach".

**Aviso completo (solo en el ejercicio reportado):**

| Nivel | Regla | Estilo | Copy |
|---|---|---|---|
| Leve | 1 a 3 | neutro, borde `--line-strong`, ícono info | "Molestia leve · Hombro · 2/10" / "Avisamos a tu coach. Seguí con precaución según cómo te sientas." |
| Moderada | 4 a 6 | advertencia (borde de tinta de 2 px) | "Molestia moderada · Hombro · 5/10" / "Avisamos a tu coach. Si sigue, bajá el peso en las próximas series." |
| Alta | 7 a 9 | relleno rojo | "Suspendé este ejercicio" / "Hombro · 8/10. Seguí con el resto solo si no te molesta. Tu coach ya fue avisado." · **Bloquea el registro de ese ejercicio** |
| Alarma | algún síntoma o 10 | `#7F1D1D` | "Frená por hoy" / "Rodilla · 6/10. Avisá en el gimnasio o a tu entrenador cercano. Tu coach ya recibió una alerta." + "Terminar sesión" · **Frena la sesión** |

**Formato chico (heredado):** en los demás ejercicios de la sesión cuyo grupo muscular comparte la articulación (tabla en `03a-molestias.md §6`): caja `.a-pain-mini` con borde 1,5 px `--warn-line`, fondo `--warn-bg`, círculo de 24 px `--warn-ic` con "!" y el texto `a-t-bs` **"Molestia reportada"**. Sin descripción, sin nivel, **no bloquea** (aunque el original sea alto). `role="status"`, `data-testid="molestia-heredada"`.

**No pasa a la sesión siguiente:** al terminar o reiniciar la sesión se limpian los avisos. En la rutina, solo el ejercicio reportado lleva el chip rojo `MOLESTIA`.

**Guardado y asociación:** cada reporte es una fila de `alumno_historial_dolor` asociada a la sesión, la prescripción y la serie; el aviso de la sesión se deriva de esas filas y aparece al instante aunque no haya señal (`03a-molestias.md §2 y §4`).

**Brecha:** hoy `PainReportBanner` es uno solo para toda la sesión (`activePainBanner`), arriba de la rutina, no sabe de articulaciones, y **sin señal el reporte se pierde**.

---

## 4. Cierre de sesión · FE-11

**Claves:** `cierre`, `cierre-off` (sin señal: chip "Guardada en el teléfono" y "· 3 series se envían cuando vuelva la señal"), `toast-sesion` (al volver: Historial con el toast "Sesión guardada en tu historial"). **Componente actual:** `cierre-dia-modal.tsx`.

Pantalla completa siempre oscura (`#09090B`) con cuña plateada arriba a la derecha y una "G" gigante al 4 %: chip `✓ GUARDADA Y SINCRONIZADA` (o "Guardada en el teléfono") · copa de 44 px · `a-t-dxl` (2,125rem) "¡Gran entrenamiento, {nombre}!" · "Completaste DÍA 1" (+ " · 3 series se envían cuando vuelva la señal") · 2 tarjetas: `SERIES` "13/13" "100% completadas" · `TIEMPO` "54'" "duración de la sesión" · tarjeta "Racha semanal: 1 de 3 días" / "Cuenta solo los días de tu plan; el descanso no la corta." · tarjetas doradas "🏆 Nuevo PR · Press banca plano" / "47,5 kg × 8" (+ " · 1RM ~60 kg" en Técnica) · botón claro "Volver al inicio".

**Brecha:** quitar el "ranking de constancia" (`cierre-dia-ranking-constancia`) y el emoji 🏆; PR en el dorado único.

---

## 5. Historial · FE-09

| Clave | Estado |
|---|---|
| `hist` | Por sesión, cerradas |
| `hist-open` | Sesión abierta con series |
| `hist-fix` | Hoja "Corregir serie" |
| `hist-dash` | Por ejercicio |
| `hist-vacio` | Vacío |
| `hist-off` | Sin conexión |
| `hist-open-tec` | Sesión abierta en Técnica (RPE por serie) |

**Componente actual:** `historial-sesiones.tsx`.

1. Cabecera `.a-hhero` (héroe, **invertida de noche**): `a-t-d` "Historial" · "Tus sesiones y series. Si cargaste algo mal, lo podés corregir." · stats `a-t-mm` "6" `SESIONES` · "50" `SERIES`. Cuña ancha a la derecha.
2. Sin conexión: chip punteado "☁ Sin conexión · datos del 17/11".
3. Segmentado "Por sesión" | "Por ejercicio".
4. Por sesión: tarjetas `.a-hcard` con columna de fecha de 62 px ("14" `a-t-mm` 1,5rem + `NOV`; la más reciente en tinta) · "DÍA 3" + chip dorado `🏆 1 PR` · "3 ejercicios · 9 series" · enlace "Ver series y corregir" / "Ver menos". Abierta: por ejercicio "Press militar" + `MÁX 30 KG`, filas de serie (número en tinta 24 px, "30 kg × 10", "RPE 7,5" en Técnica, chip de tipo, chip `CORREGIDA`, botón lápiz 36 px "Corregir serie 2 de Press militar").
5. Hoja "Corregir serie": "Sentadilla con barra · serie 2 · 10 de noviembre" · steppers de peso (±2,5) y reps · info "La serie queda marcada como corregida y tu coach ve el valor original." · "Guardar corrección".
6. Por ejercicio: select "Ejercicio para analizar" · tarjetas "Récord de carga" y "Máx. repeticiones" (+ "Mejor 1RM estimado (Epley)" en Técnica) · `EVOLUCIÓN · 3 SESIONES` + filas con fecha, día, series y kg.
7. Vacío: stats en 0 + "Todavía no hay sesiones" · "Cuando termines un entrenamiento, aparece acá con sus series y cargas." · "Empezar a entrenar".

**Brecha:** cabecera invertida de noche; chip PR dorado único; "Modo Avión" → "Sin conexión · datos del …". La corrección con "Corregida" depende de que la app ya guarde el original: si no lo guarda, se marca igual en la interfaz y se anota como deuda (no hay columna para el original en `registro_series`).

---

## 6. Progreso · FE-09

| Clave | Estado |
|---|---|
| `prog`, `prog-tec` | Simple y Técnica |
| `prog-vacio` | Sin entrenamientos |
| `prog-off` | Sin conexión |

**Componente actual:** `mi-progreso.tsx` + `lib/mi-progreso.ts`.

1. `a-t-d` "Mi progreso" (+ chip punteado sin conexión).
2. Cabecera `.a-hhero` (**invertida de noche**): `SESIONES ESTE MES` · `a-t-ml` "6" · "de 8 planificadas · el mes pasado: 4" (+ "Volumen del mes: 16.938 kg" en Técnica).
3. Una tarjeta por ejercicio: nombre `a-t-bs` · **delta `+12,5 KG`** (`a-t-label`, `--ok-bg`/`--ok-fg`, borde `--ok-line`) · valor `a-t-mm` "62,5" + "kg" · gráfico SVG 300 × 96: 3 líneas guía, área en degradé `--silver-2` (45 %) → `--silver` (0 %), línea de tinta de 2,5 px, puntos huecos de 3,2 px y el último lleno de 5 px, fechas en Geist Mono 10 px. Técnica: "1RM estimado 75 kg", 1RM punteado y leyenda.
4. Vacío: "Todavía no hay entrenamientos" · "Tu progreso aparece acá después de tu primera sesión." · "Ir a entrenar".

**Cambio v7 (D-52):** `formatearDelta` devuelve `"+10 kg"` / `"−5 kg"` / `"+2 reps"` y, si no cambió, `"Igual"`. Sin "desde {mes}" (`lib/mi-progreso.ts:176-189`).

---

## 7. Clases · FE-10

| Clave | Estado |
|---|---|
| `cls` | Semana (vista principal) |
| `cls-mes` | Mes |
| `cls-reservada` | Clase reservada ("✓ Reservada · Cancelar") |
| `cls-cupo` | Cupo semanal agotado ("Ya usaste tus 2 clases de la semana") |
| `cls-dia-vacio` | Domingo sin clases |
| `cls-off` | Sin conexión |

**Componente actual:** `athlete-classes.tsx`.

`a-t-d` "Clases" · segmentado Semana | Mes · cupo semanal `.a-quota` ("1 de 2 clases usadas" · `ESTA SEMANA` · barra segmentada · "Te queda 1 clase · la semana va de lunes a domingo"; con 0: "No te quedan clases · …") · semana en 7 celdas de 60 px (día de la semana y número; elegido en tinta; punto si hay reserva) o mes en grilla de 7 columnas con celdas de 48 px · tarjetas de clase `.a-ccl`: hora `a-t-mm` "18:00" + chip `FUNCIONAL` · "60 min · Quedan 2 lugares" ("Queda 1 lugar", "Cupo libre", "Completa") · botón según estado: "Reservar cupo" · "✓ Reservada · Cancelar" · "Clase completa" · "Ya usaste tus 2 clases de la semana" · "Necesitás conexión para reservar" · "Asististe" / "Clase pasada" (los deshabilitados dicen el motivo). Día sin clases: "No hay clases este día" · "Elegí otro día de la semana.".

---

## 8. Chat · FE-10

**Clave:** `chat`. **Componente actual:** `athlete-chat.tsx` (drawer).

Hoja: "GOZS · Equipo" · "Tu equipo de entrenadores" · tarjeta de avisos ("¿Querés que te avisemos cuando responda tu coach?" + "Activar avisos" / "✓ Avisos activos") · burbujas (las mías en tinta a la derecha; pie "Vos · 18:20" / "Coach · 18:25") · `RESPUESTAS RÁPIDAS` en chips · input "Escribile al equipo GOZS" + "Enviar". Sin IDs ni datos técnicos.

---

## 9. Cuestionario inicial · FE-10

**Claves:** `cuest`, `cuest-hecho`. **Componente actual:** `cuestionario-inicial.tsx`. Se abre desde Configuración. Lienzo liso, sin fondo generativo.

"‹ Volver" · tarjeta "Cuestionario inicial" / "Opcional. No bloquea tu entrenamiento: ayuda a tu coach a ajustar el plan y las sugerencias de carga." · secciones numeradas (`1 · OBJETIVO PRINCIPAL` … `6 · COMENTARIOS PARA TU COACH (OPCIONAL)`) con opciones `.a-opt` de tarjeta completa, chips para días (2 a 6) y textareas · "Guardar respuestas". Completado: chip `✓ COMPLETADO`, "Tu coach ve estas respuestas en el Coach Studio. Podés editarlas cuando quieras.", "✎ Modificar respuestas" y una tarjeta por respuesta.

---

## 10. Onboarding · FE-11

| Clave | Paso |
|---|---|
| `onb1` | 1 de 4 · Bienvenida (pantalla oscura) |
| `onbname` | **2 de 4 · ¿Cómo querés que te llamemos? (nuevo, D-53)** |
| `onb2` | 3 de 4 · Vista Simple o Técnica |
| `onb3` | 4 de 4 · Descanso |

**Componente actual:** `onboarding-alumno.tsx` (3 pasos).

- **Paso 1:** fondo `#09090B`, cuña plateada, "G" al 4 % · `PASO 1 DE 4` + "Saltar" · `a-t-dxl` "Hola, {primer nombre}." + en gris "Tu plan ya está listo." · "Tu coach te armó tu plan. Antes de empezar, contanos cómo te llamamos y elegí dos cosas para que la app se adapte a vos. Tarda 30 segundos." · tarjeta con 3 filas (✎ "Cómo te llamamos" / "Tu nombre o un apodo"; "Cómo ver tus ejercicios" / "Simple o Técnica"; "El descanso entre series" / "Si querés ver la cuenta o no"; títulos en `#FAFAFA` en los dos temas) · botón claro "Empezar".
- **Paso 2 (nuevo):** encabezado de paso ("‹ Atrás" · `PASO 2 DE 4` · "Saltar") + 4 barritas · `a-t-h` a 2rem "¿Cómo querés que te llamemos?" · "Así te saludamos en la app. Lo podés cambiar cuando quieras en Configuración." · label "Nombre o apodo" · input `a-t-body` precargado con el primer nombre, `autocomplete="nickname"`, `maxlength=30` · "Hasta 30 caracteres. Si lo dejás vacío, usamos tu primer nombre." · "Continuar". Lienzo liso. Guarda con la RPC de BE-01 (sin señal: se encola y se usa localmente).
- **Paso 3:** "¿Cómo querés ver tus ejercicios?" · opciones Simple (chip `TE LA RECOMIENDA TU COACH` si corresponde, "Solo peso y repeticiones. Anotás y seguís.", vista previa) y Técnica ("Lo mismo, más cuánto te costó (RPE), tipo de serie, aproximación y tu máximo estimado.") · "Podés cambiarla cuando quieras desde Configuración." · "Continuar con Simple".
- **Paso 4:** "¿Querés ver el descanso después de cada serie?" · "Cada ejercicio tiene un descanso que indica tu coach (por ejemplo, 90 s) para recuperarte antes de la próxima serie." · "Sí, mostrame la cuenta" ("Al registrar una serie aparece el reloj. **Suena cuando termina; en Android también vibra.**") · "No, voy a mi ritmo" · "Listo, ver mis días".
- "Saltar" en cualquier paso: vista recomendada + descanso visible + nombre = primer nombre (no se guarda `nombre_preferido`).

**Login** (`login`, `login-err`): fuera de alcance (C10: esta épica es la estética de la app); queda como referencia para una próxima épica.
