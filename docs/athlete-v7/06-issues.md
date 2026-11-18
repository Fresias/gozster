# 06 · Issues para Multica

> Cada bloque se pega como descripción (`--description-file`). Reemplazar `<#>` por el número de issue al crearlo. Rama: `feature/<#>-<slug>` (o `fix/` si corresponde). Commits convencionales.
> **En todos los issues aplica:** regla de alcance `00-PM.md §2`, referencia `docs/athlete-v7/referencia/athlete-v7.html`, gate `npm test && npm run typecheck && npm run lint && npm run build`, `harness-learn.sh` + `harness-gate.sh` antes del PR, y para multi-etapa `--pr-auto-complete off`.

---

## Ola 0

### BE-01 · Nombre preferido del alumno
- **Owner:** `@backend-eng` · **Rama:** `feature/<#>-athlete-v7-nombre-preferido` · **Tamaño:** S · **Depende de:** —
- **Doc:** `03-backend.md §1`
- **Archivos:** migración nueva, `types/database.types.ts` (regenerado), `src/lib/athlete/nombre.ts`, `src/store/use-athlete-store.ts`, tests.
- **Criterios:**
  - GIVEN la migración aplicada WHEN un alumno llama `actualizar_nombre_preferido('Lu')` THEN su `perfiles.nombre_preferido = 'Lu'`.
  - GIVEN 31 caracteres WHEN llama la RPC THEN falla con `22001` y no cambia nada.
  - GIVEN `''` o `NULL` THEN queda `NULL`.
  - GIVEN `nombre_preferido` NULL y `nombre_completo` "Lucía Fernández" THEN `nombreParaSaludo` devuelve "Lucía"; con los dos NULL devuelve "".
  - GIVEN sin señal WHEN `guardarNombrePreferido` THEN el estado local cambia y la escritura se reintenta al volver la red.
  - Ninguna migración existente modificada; los tipos regenerados, no editados a mano.

### BE-02 · Molestias: datos reales y herencia por articulación
- **Owner:** `@backend-eng` · **Rama:** `fix/<#>-athlete-v7-molestias-contrato` · **Tamaño:** S · **Depende de:** —
- **Doc:** `03-backend.md §2`
- **Archivos:** `src/store/use-athlete-store.ts`, `src/lib/athlete/molestias.ts`, `src/__tests__/athlete-molestias-herencia.spec.ts`.
- **Criterios:**
  - El insert a `alumno_historial_dolor` lleva `eva` y el `ejercicios.id` real; desaparece el id `30000000-0000-0000-0000-000000000001`.
  - `currentSession.molestias` reemplaza a `activePainBanner` como fuente; se limpia al cerrar o reiniciar la sesión.
  - `avisoMolestiaPara` y `ejercicioBloqueado` pasan los 10 casos de la tabla de `03 §2.3`.
  - Sin cambios en `lib/dolor.ts` ni en `use-offline-queue.ts`.

### BE-03 · Video por serie: que se envíe
- **Owner:** `@backend-eng` · **Rama:** `fix/<#>-athlete-v7-video-serie` · **Tamaño:** S · **Depende de:** D2
- **Doc:** `03-backend.md §3`
- **Archivos:** `src/store/use-athlete-store.ts`, `src/lib/athlete/video-serie.ts`, tests.
- **Criterios:**
  - GIVEN una serie ya registrada WHEN `attachVideoForSet(..., "https://youtu.be/x")` THEN se encola `WORKOUT_SET_COMPLETED` con el payload completo de esa serie y `videoUrl`.
  - GIVEN `videoUrl: null` THEN se encola con `videoUrl: null` (quitar el video).
  - `normalizarEnlaceVideo` pasa sus 5 casos (`03 §3.2`).

### BE-04 · Indicaciones con formato
- **Owner:** `@backend-eng` · **Rama:** `feature/<#>-athlete-v7-indicaciones` · **Tamaño:** S · **Depende de:** —
- **Doc:** `03-backend.md §4`
- **Archivos:** `src/lib/athlete/indicaciones.ts`, tests, `docs/athlete-v7/guia-indicaciones-coach.md`.
- **Criterios:**
  - `parseIndicaciones` pasa los casos de `03 §4.3`, incluido el texto viejo sin encabezados.
  - La guía para coaches tiene el ejemplo de `03 §4.2` y una oración por regla.
  - Sin migraciones ni cambios en Coach Studio.

### FE-01 · Base visual: fuentes, tokens, tipografía y elevación
- **Owner:** `@frontend-eng` · **Rama:** `feature/<#>-athlete-v7-base` · **Tamaño:** M · **Depende de:** —
- **Doc:** `01-sistema-visual.md §1-§7`, `04-frontend.md §2-§3`
- **Archivos:** `src/app/(athlete)/athlete/layout.tsx`, `src/app/(athlete)/athlete/athlete-v7.css`, specs de la fila FE-01 de `04 §6`.
- **Criterios:**
  - GIVEN `/athlete` WHEN carga THEN `getComputedStyle(body-de-la-app).fontFamily` contiene Geist, y los títulos, Archivo.
  - GIVEN tema claro y oscuro THEN las variables HSL de `01 §3` valen lo indicado dentro de `.theme-athlete[data-v7]` y **no cambian** fuera (Coach Studio sigue igual: `regresion-visual-viewports.e2e.ts` verde sin actualizar capturas).
  - Existen las 11 clases `.a-t-*` con los valores de `01 §5` y los 3 niveles de elevación.
  - `globals.css`, `tailwind.config.ts` y `package.json` sin cambios.

### QA-01 · Harness de fidelidad visual
- **Owner:** `@qa-eng` · **Rama:** `feature/<#>-athlete-v7-fidelidad` · **Tamaño:** M · **Depende de:** — (se arma contra la app actual como "antes")
- **Doc:** `05-qa.md §2-§3`
- **Archivos:** `tests/e2e/fixtures/athlete-v7.json`, `tests/e2e/athlete-v7-fidelidad.e2e.ts`, `tests/e2e/helpers/contraste.ts`, ajustes al stub solo si hacen falta para el fixture del alumno, `docs/athlete-v7/evidencia/antes/`.
- **Criterios:**
  - Una receta por clave de `PANTALLAS` (salvo login, por D4), en claro y oscuro.
  - Genera `docs/athlete-v7/evidencia/<ISSUE>/<clave>-<tema>.png` (Referencia | App | Diferencia) + `resumen.md`.
  - Las aserciones de estilo de `05 §3` existen y se pueden filtrar por pantalla (`--grep`).
  - Evidencia "antes" de todas las pantallas adjunta al PR.

## Ola 1

### FE-02 · Shell: encabezado, navegación inferior, chat y tema
- **Owner:** `@frontend-eng` · **Rama:** `feature/<#>-athlete-v7-shell` · **Tamaño:** M · **Depende de:** FE-01
- **Doc:** `02-pantallas.md §0`
- **Archivos:** `athlete-shell.tsx`, nuevos `athlete-bottom-nav.tsx` y `athlete-theme-button.tsx`, `app/(athlete)/athlete/page.tsx`, `athlete-chat.tsx` (solo el disparador).
- **Criterios:**
  - Navegación inferior con 4 ítems (ícono + etiqueta), `aria-current="page"` en el activo; sin pestañas arriba.
  - El chip de red muestra los 4 textos de `02 §0` según el estado.
  - En rutina, ejercicio, cierre, onboarding y cuestionario, sin navegación inferior ni botón de chat.
  - Botón de tema con `useTheme()` (sin modificar `ui/theme-toggle`).
  - Evidencia de contraste: `inicio`, `hist`, `prog`, `cls`, claro y oscuro.

### FE-03 · Inicio y sus estados
- **Owner:** `@frontend-eng` · **Rama:** `feature/<#>-athlete-v7-inicio` · **Tamaño:** M · **Depende de:** FE-02 (y BE-01 para el nombre; mientras tanto usa `nombre_completo`)
- **Doc:** `02-pantallas.md §1`
- **Criterios:**
  - Héroe "Te toca hoy" invertido de noche (estilo computado de `05 §3.2`).
  - Cargando: nada antes de 1 s y nunca "sin plan" mientras carga.
  - Tarjeta de instalar descartable, con hoja de pasos iPhone/Android.
  - Suscripción vencida: banner + hoja; nunca bloquea.
  - Evidencia: `inicio`, `inicio-dia`, `inicio-sinplan`, `inicio-cargando`, `inicio-error`, `inicio-vencida`.

### FE-04 · Rutina del día como pantalla propia
- **Owner:** `@frontend-eng` · **Rama:** `feature/<#>-athlete-v7-rutina` · **Tamaño:** M · **Depende de:** FE-02
- **Doc:** `02-pantallas.md §2`, `04-frontend.md §4`
- **Criterios:**
  - `rutina-del-dia.tsx` y `use-live-workout.ts` extraídos de `live-workout.tsx` sin cambiar el comportamiento (los specs de registro siguen verdes con las rutas actualizadas).
  - Barra segmentada de avance con `role="progressbar"`; ejercicio próximo marcado; biserie agrupada.
  - "Terminar sesión" con confirmación en línea si faltan series.
  - Configuración con "Cómo te llamamos".
  - Evidencia: `rutina`, `registro`, `config`.

### FE-05 · Pantalla del ejercicio
- **Owner:** `@frontend-eng` · **Rama:** `feature/<#>-athlete-v7-ejercicio` · **Tamaño:** L · **Depende de:** FE-04, D3
- **Doc:** `02-pantallas.md §3`
- **Criterios:**
  - `ejercicio-activo.tsx` con tarjeta de serie, steppers con `a-t-mi` (147,5 entra en el campo a 360 px), "Igual que la anterior", aviso ×10 en línea, aproximación en línea, vista Técnica con calculadora de discos, variantes por tiempo, drop set y por lado.
  - Registradas con estados de guardado según D3.
  - Panel de descanso con tiempo transcurrido y 4 controles.
  - Wake Lock y chip "Pantalla activa".
  - Evidencia: `ex-aprox`, `ex-ss`, `ex-tec`, `ex-tiempo`, `ex-drop`, `ex-uni`, `ex-rest`, `ex-x10`, `ex-rej`.

## Ola 2

### FE-06 · Récord en un solo dorado
- **Owner:** `@frontend-eng` · **Rama:** `feature/<#>-athlete-v7-record` · **Tamaño:** S · **Depende de:** FE-05
- **Doc:** `01-sistema-visual.md §8`
- **Criterios:** aviso, chip PR de Registradas, chip PR del historial, toast y tarjeta del cierre con el mismo fondo, texto y acento (estilo computado); copa sin círculo ni fondo; sin degradés. Evidencia: `ex-record`, `hist`, `cierre`.

### FE-07 · Hojas: indicaciones, video demostrativo, video por serie, configuración
- **Owner:** `@frontend-eng` · **Rama:** `feature/<#>-athlete-v7-hojas` · **Tamaño:** M · **Depende de:** FE-05, BE-03, BE-04
- **Doc:** `02-pantallas.md §3.1-§3.2`
- **Criterios:** F-11 a F-16 de `05 §4` en verde; hoja que crece y se desliza adentro con el encabezado fijo; sin `dangerouslySetInnerHTML`. Evidencia: `notes`, `video`, `setvideo`, `ex-videos`.

### FE-08 · Molestias por ejercicio y heredadas
- **Owner:** `@frontend-eng` · **Rama:** `feature/<#>-athlete-v7-molestias` · **Tamaño:** M · **Depende de:** FE-05, BE-02
- **Doc:** `02-pantallas.md §3.3`
- **Criterios:** F-04 a F-10 de `05 §4` en verde; el aviso se renderiza dentro del ejercicio, no en la cabecera de la sesión; heredado con `role="status"` y `data-testid="molestia-heredada"`. Evidencia: `mol-modal`, `mol-leve`, `mol-mod`, `mol-alta`, `mol-alarma`, `mol-hereda`, `mol-lumbar`, `mol-no-hereda`, `mol-otro`.

### FE-09 · Historial y Progreso
- **Owner:** `@frontend-eng` · **Rama:** `feature/<#>-athlete-v7-historial-progreso` · **Tamaño:** M · **Depende de:** FE-02
- **Doc:** `02-pantallas.md §5-§6`
- **Criterios:** cabeceras invertidas de noche; `formatearDelta` devuelve "+10 kg" (y su test actualizado); chip PR dorado; hoja de corrección. Evidencia: `hist`, `hist-open`, `hist-fix`, `hist-dash`, `hist-vacio`, `prog`, `prog-tec`, `prog-vacio`, `prog-off`.

### FE-10 · Clases, chat, suscripción vencida y cuestionario
- **Owner:** `@frontend-eng` · **Rama:** `feature/<#>-athlete-v7-clases-chat` · **Tamaño:** M · **Depende de:** FE-02
- **Doc:** `02-pantallas.md §7-§9`
- **Criterios:** semana como vista principal y botones deshabilitados con el motivo; chat en hoja sin IDs; cuestionario sin fondo generativo. Evidencia: `cls`, `cls-mes`, `cls-off`, `chat`, `cuest`.

### FE-11 · Onboarding de 4 pasos y cierre
- **Owner:** `@frontend-eng` · **Rama:** `feature/<#>-athlete-v7-onboarding-cierre` · **Tamaño:** M · **Depende de:** FE-01, BE-01
- **Doc:** `02-pantallas.md §4` y `§10`
- **Criterios:** F-01 a F-03 de `05 §4` en verde; "Saltar" no guarda nombre; cierre sin ranking de constancia y con título que no desborda a 360 px. Evidencia: `onb1`, `onbname`, `onb2`, `onb3`, `cierre`.

### FE-12 · Fondo generativo
- **Owner:** `@frontend-eng` · **Rama:** `feature/<#>-athlete-v7-fondo` · **Tamaño:** S · **Depende de:** FE-02, D1
- **Doc:** `01-sistema-visual.md §10`
- **Valores elegidos (D1):** `fondo=malla · semilla=3 · escala=1 · intensidad=sutil` (reemplazar por la línea que copie `@Fresias` del panel de la referencia).
- **Criterios:** F-20 de `05 §4`; `src/lib/athlete/fondo.ts` con las fórmulas de la referencia y un test que compare la cadena CSS generada con la de la referencia para la misma semilla; sin animación; fondo liso en el ejercicio, el onboarding de nombre y el cuestionario.

## Ola 3

### QA-02 · E2E funcional v7
- **Owner:** `@qa-eng` · **Rama:** `feature/<#>-athlete-v7-e2e` · **Tamaño:** M · **Depende de:** ola 2
- **Doc:** `05-qa.md §4`
- **Criterios:** F-01 a F-20 automatizados en `tests/e2e/athlete-v7-funcional.e2e.ts` y en verde; evidencia final de todas las pantallas aprobada por `@Fresias`; capturas aprobadas convertidas en base de `toHaveScreenshot` (`05 §2.5`).

### QA-03 · Accesibilidad, desbordes y control de alcance
- **Owner:** `@qa-eng` · **Rama:** `feature/<#>-athlete-v7-a11y-alcance` · **Tamaño:** M · **Depende de:** ola 2
- **Doc:** `05-qa.md §5-§6`
- **Criterios:** control de alcance vacío sobre toda la épica; `athlete-v7-sin-colores-viejos.spec.ts` en verde; desbordes, contraste, teclado, movimiento reducido y letra grande como en `05 §6`; Coach Studio sin cambios visuales.
