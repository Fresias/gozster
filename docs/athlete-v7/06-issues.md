# 06 · Issues para Multica

> Cada bloque se pega como descripción (`--description-file`). Reemplazar `<#>` por el número de issue. Rama `feature/<#>-<slug>` o `fix/<#>-<slug>`. Commits convencionales. Multi-etapa: `--pr-auto-complete off`.
> **En todos:** regla de alcance `00-PM.md §2`; referencia `referencia/athlete-v7.html`; **checkpoints y archivo `docs/athlete-v7/progreso/<ID>.md` según `07-checkpoints.md`**; en cada CP, tests afectados + typecheck; en el último CP, gate completo + `harness-learn.sh` + `harness-gate.sh`, y recién ahí el PR.
> Los frontend adjuntan en el último CP la evidencia de contraste (`05-qa.md §2`) de las claves que figuran en "Evidencia".

---

## Ola 0 · Base y datos

### BE-00 · Id de sesión real y cola destrabada (P0)
- **Owner:** `@backend-eng` · **Rama:** `fix/<#>-athlete-sesion-uuid` · **Tamaño:** S · **Depende de:** —
- **Doc:** `03-backend.md §0`
- **Checkpoints:**
  - **CP1** · Confirmación: pedir a `@Fresias` el conteo de `03 §0.1` y anotarlo en `progreso/BE-00.md`. Mientras tanto, seguir (no bloquea).
  - **CP2** · `src/lib/athlete/uuid.ts` + tests. Verifica: `npx vitest run src/__tests__/athlete-uuid.spec.ts`.
  - **CP3** · `loadStudentSession` con `nuevoUuid()`; id estable al recargar una sesión en curso; nuevo al cerrar. Verifica: test de sesión + specs de `use-athlete-store` afectados.
  - **CP4** · `repararSesionesNoUuid()` al iniciar la app (eventos de la cola, `currentSession`, `sesionesCompletadas`) + test de agrupamiento y orden.
  - **CP5** · Gate completo, PR.
- **Criterios:** los de `03 §0.3`; ningún cambio en el código de `use-offline-queue.ts`.

### BE-01 · Nombre preferido del alumno
- **Owner:** `@backend-eng` · **Rama:** `feature/<#>-athlete-v7-nombre-preferido` · **Tamaño:** S · **Depende de:** —
- **Doc:** `03-backend.md §1`
- **Checkpoints:**
  - **CP1** · Migración + test PGlite (los 4 casos de `03 §1.3`).
  - **CP2** · Tipos regenerados (o pedido a `@Fresias` anotado en el progreso, con la migración ya pusheada).
  - **CP3** · `src/lib/athlete/nombre.ts` + `guardarNombrePreferido` en el store (con pendiente sin señal) + tests.
  - **CP4** · Gate completo, PR.
- **Criterios:** RPC con los 4 casos en verde; `nombreParaSaludo` con sus 3 casos; sin señal, el nombre cambia al instante y se envía al volver la red.

### BE-02 · Molestias: guardar, asociar a la sesión y avisar
- **Owner:** `@backend-eng` · **Rama:** `feature/<#>-athlete-v7-molestias` · **Tamaño:** M · **Depende de:** BE-00
- **Doc:** `03a-molestias.md`
- **Checkpoints:**
  - **CP1** · Migración (`sesion_id`, `ejercicio_en_rutina_id`, `numero_serie`, índice) + RPC `registrar_molestia` + tests PGlite (crea la sesión si falta, idempotente por `p_id`, sesión ajena → `42501`, `pain_reported` en la serie, alerta con EVA 8).
  - **CP2** · `src/lib/athlete/molestias.ts` (`nivelMolestia`, `GRUPOS_POR_ZONA`, `avisoMolestiaPara`, `ejercicioBloqueado`) + los 10 casos de `03a §7`.
  - **CP3** · Store: `MolestiaSesion`, `currentSession.molestias`, `reportarMolestia` (aviso al instante, RPC con señal).
  - **CP4** · Outbox: `flushMolestiasPendientes`, `molestiasPendientesFueraDeSesion` en `partialize`, disparo con `online`, al abrir la app y al reportar.
  - **CP5** · Recuperación: `cargarMolestiasDeSesion` + limpieza al cerrar o reiniciar la sesión + tests de persistencia de `03a §7`.
  - **CP6** · `PainReportModal` pasa `ejercicioId` real; specs de molestias actualizados (`04-frontend.md §6`, fila FE-08); gate completo, PR.
- **Criterios:** todos los tests de `03a §7` en verde; sin señal no se pierde ningún reporte; nunca se manda el id `30000000-…`; sin cambios en `lib/dolor.ts` ni en el código de la cola.

### BE-03 · Video de la serie: subida, enlace y envío
- **Owner:** `@backend-eng` · **Rama:** `feature/<#>-athlete-v7-video-serie` · **Tamaño:** M · **Depende de:** BE-00
- **Doc:** `03b-video-serie.md`
- **Checkpoints:**
  - **CP1** · Migración del bucket `videos-series` y sus 3 políticas + prueba de políticas (o SQL entregado a `@Fresias`, anotado en el progreso).
  - **CP2** · `src/lib/athlete/video-serie.ts` (`normalizarEnlaceVideo`, `rutaVideoSerie`, `esVideoDeStorage`, `validarArchivoVideo`, límites) + tests.
  - **CP3** · `src/lib/athlete/video-subida.ts` con el adaptador `AlmacenVideos` (IndexedDB en la app, memoria en tests): encolar, subir, reintentar, aislar por usuario.
  - **CP4** · Store: `videoEstado` por serie, `adjuntarVideoASerie`, `quitarVideoDeSerie`, `reintentarVideoDeSerie`; reencolar `WORKOUT_SET_COMPLETED` con `videoUrl`; `attachVideoForSet` como alias.
  - **CP5** · Disparo con `online` y al abrir la app; tests de estados (`telefono` → `subiendo` → `listo`; 413 → `error`); gate completo, PR.
- **Criterios:** los de `03b §5`; `video_url` guarda `https://…` o `storage:videos-series/<ruta>`, nunca una URL firmada.

### BE-04 · Indicaciones con formato
- **Owner:** `@backend-eng` · **Rama:** `feature/<#>-athlete-v7-indicaciones` · **Tamaño:** S · **Depende de:** —
- **Doc:** `03-backend.md §4`
- **Checkpoints:**
  - **CP1** · `src/lib/athlete/indicaciones.ts` + tests de `03 §4.3`.
  - **CP2** · `docs/athlete-v7/guia-indicaciones-coach.md`; gate completo, PR.
- **Criterios:** parser con todos sus casos; texto viejo sin encabezados igual que hoy; sin migraciones.

### FE-01 · Base visual: fuentes, tokens, tipografía y elevación
- **Owner:** `@frontend-eng` · **Rama:** `feature/<#>-athlete-v7-base` · **Tamaño:** M · **Depende de:** —
- **Doc:** `01-sistema-visual.md §1-§9`, `04-frontend.md §2-§3`
- **Checkpoints:**
  - **CP1** · `layout.tsx` con las 3 fuentes y `data-v7`; `athlete-v7.css` con las variables HSL (claro y oscuro). Verifica: `npm run build` (descarga de fuentes) y `/athlete` sin azul.
  - **CP2** · Tokens `--a-*`, elevación y las 11 clases `.a-t-*`.
  - **CP3** · Clases de componentes `.a-*` portadas de la referencia (sin usarlas todavía).
  - **CP4** · Specs de la fila FE-01 de `04 §6`; `regresion-visual-viewports.e2e.ts` de Coach Studio verde sin actualizar capturas; gate completo, PR.
- **Criterios:** los de la tabla `05-qa.md §3.1` que aplican al lienzo y a los títulos; `globals.css`, `tailwind.config.ts` y `package.json` sin cambios.

### QA-01 · Harness de fidelidad visual
- **Owner:** `@qa-eng` · **Rama:** `feature/<#>-athlete-v7-fidelidad` · **Tamaño:** M · **Depende de:** — (se arma contra la app actual como "antes")
- **Doc:** `05-qa.md §2-§3`
- **Checkpoints:**
  - **CP1** · Fixture `tests/e2e/fixtures/athlete-v7.json` y su carga en el stub.
  - **CP2** · Helper `tests/e2e/helpers/contraste.ts` (Referencia | App | Diferencia + `resumen.md`).
  - **CP3** · Recetas de Acceso y Entrenar (`05 §2.3`).
  - **CP4** · Recetas de Sesión y Ejercicio.
  - **CP5** · Recetas de Molestias, Historial y progreso, y Clases.
  - **CP6** · Aserciones de estilo de `05 §3` filtrables por pantalla (`--grep`).
  - **CP7** · Evidencia "antes" de todas las claves en `docs/athlete-v7/evidencia/antes/`; PR.
- **Criterios:** una receta por clave de `PANTALLAS` (82); claves imposibles de alcanzar todavía en la app actual quedan listadas en `resumen.md` como "sin receta (falta FE-xx)".

## Ola 1 · Estructura

### FE-02 · Shell: encabezado, navegación inferior, chat y tema
- **Owner:** `@frontend-eng` · **Rama:** `feature/<#>-athlete-v7-shell` · **Tamaño:** M · **Depende de:** FE-01
- **Doc:** `02-pantallas.md §0`
- **Checkpoints:**
  - **CP1** · `athlete-theme-button.tsx` (con `useTheme()`) y encabezado nuevo con el chip de red (4 estados).
  - **CP2** · `athlete-bottom-nav.tsx`; quitar las pestañas de arriba; ocultar la navegación en rutina, ejercicio, cierre, onboarding y cuestionario.
  - **CP3** · Botón flotante de chat (reubicar el disparador de `athlete-chat.tsx`).
  - **CP4** · Specs afectados; evidencia; gate, PR.
- **Evidencia:** `inicio`, `inicio-offline`, `inicio-pendientes`, `hist`, `prog`, `cls`.

### FE-03 · Inicio y sus estados
- **Owner:** `@frontend-eng` · **Rama:** `feature/<#>-athlete-v7-inicio` · **Tamaño:** M · **Depende de:** FE-02 (BE-01 para el nombre; mientras tanto, `nombre_completo`)
- **Doc:** `02-pantallas.md §1`
- **Checkpoints:**
  - **CP1** · Saludo con `nombreParaSaludo`, héroe "Te toca hoy" (invertido de noche), lista de días.
  - **CP2** · Estados: cargando (nada antes de 1 s), sin plan, error.
  - **CP3** · Tarjeta y hoja de instalar (iPhone y Android).
  - **CP4** · Suscripción vencida (banner + hoja) y hoja "Hacer otro día".
  - **CP5** · Specs; evidencia; gate, PR.
- **Evidencia:** `inicio`, `inicio-semana`, `inicio-dia`, `inicio-sinplan`, `inicio-cargando`, `inicio-error`, `inicio-instalar`, `inicio-instalar-android`, `inicio-vencida`, `inicio-suscripcion`.

### FE-04 · Rutina del día como pantalla propia
- **Owner:** `@frontend-eng` · **Rama:** `feature/<#>-athlete-v7-rutina` · **Tamaño:** M · **Depende de:** FE-02
- **Doc:** `02-pantallas.md §2`, `04-frontend.md §4`
- **Checkpoints:**
  - **CP1** · Extraer `use-live-workout.ts` de `live-workout.tsx` **sin cambiar comportamiento**. Verifica: todos los specs de registro en verde con rutas actualizadas.
  - **CP2** · `rutina-del-dia.tsx`: cabecera, barra de avance segmentada, lista con próximo y biserie.
  - **CP3** · Pestaña "Registro de la sesión" y "Terminar sesión" con confirmación en línea.
  - **CP4** · Hoja de Configuración con "Cómo te llamamos".
  - **CP5** · Specs; evidencia; gate, PR.
- **Evidencia:** `rutina`, `rutina-curso`, `rutina-terminar`, `registro`, `registro-datos`, `config`.

### FE-05 · Pantalla del ejercicio
- **Owner:** `@frontend-eng` · **Rama:** `feature/<#>-athlete-v7-ejercicio` · **Tamaño:** L · **Depende de:** FE-04, D3
- **Doc:** `02-pantallas.md §3`
- **Checkpoints:**
  - **CP1** · `ejercicio-activo.tsx`: cabecera, herramientas, nombre y chips; navegación rutina ↔ ejercicio.
  - **CP2** · Tarjeta de serie normal: última vez, sugerencia, "Igual que la anterior", steppers con `a-t-mi`, registrar.
  - **CP3** · Aviso ×10 en línea y vista Técnica (RPE, 1RM, barra y discos).
  - **CP4** · Variantes: por lado, por tiempo (reloj), drop set.
  - **CP5** · Aproximación en línea (desde el peso de trabajo) y "Ejercicio completo".
  - **CP6** · Registradas con estados de guardado (según D3) y barra de error.
  - **CP7** · Panel de descanso (transcurrido, −30/+30/pausa/Omitir) y Wake Lock.
  - **CP8** · Specs de la fila FE-04/FE-05 de `04 §6`; evidencia; gate, PR.
- **Evidencia:** `ex-aprox`, `ex-ss`, `ex-tec`, `ex-tec-rpe`, `ex-tiempo`, `ex-tiempo-run`, `ex-drop`, `ex-drop-2`, `ex-uni`, `ex-uni-izq`, `ex-rest`, `ex-rest-pausa`, `ex-descanso-info`, `ex-x10`, `ex-rej`, `ex-offline`, `toast-sinsenal`, `ex-completo`.

## Ola 2 · Cambios v7

### FE-06 · Récord en un solo dorado
- **Owner:** `@frontend-eng` · **Rama:** `feature/<#>-athlete-v7-record` · **Tamaño:** S · **Depende de:** FE-05
- **Doc:** `01-sistema-visual.md §8`
- **Checkpoints:** **CP1** · aviso (copa sin círculo) y toast · **CP2** · chip PR en Registradas e Historial, tarjeta del cierre · **CP3** · specs, evidencia, gate, PR.
- **Evidencia:** `ex-record`, `toast-record`, `hist`, `cierre`.

### FE-07 · Hojas: indicaciones, video demostrativo, video de la serie, configuración
- **Owner:** `@frontend-eng` · **Rama:** `feature/<#>-athlete-v7-hojas` · **Tamaño:** M · **Depende de:** FE-05, BE-03, BE-04
- **Doc:** `02-pantallas.md §3.1-§3.2`, `03b-video-serie.md §2 y §4`
- **Checkpoints:**
  - **CP1** · Componente de hoja base (crece con el contenido, se desliza adentro, encabezado fijo, foco y Escape).
  - **CP2** · Indicaciones con `parseIndicaciones` (secciones y "De la biblioteca").
  - **CP3** · Video demostrativo solo (sin botón si no hay `url_video`).
  - **CP4** · Botón "Video" por serie y hoja "Video de la serie N": grabar (`capture="environment"`), galería, enlace; validación con los mensajes de `02 §3.2`.
  - **CP5** · Estados en la fila (Video, Subiendo…, Video en el teléfono, Reintentar video) conectados a `videoEstado`.
  - **CP6** · Specs; evidencia; gate, PR.
- **Evidencia:** `notes`, `video`, `setvideo`, `ex-videos`, `ex-video-estados`.

### FE-08 · Molestias por ejercicio y heredadas
- **Owner:** `@frontend-eng` · **Rama:** `feature/<#>-athlete-v7-molestias-ui` · **Tamaño:** M · **Depende de:** FE-05, BE-02
- **Doc:** `02-pantallas.md §3.3`, `03a-molestias.md §2 y §6`
- **Checkpoints:**
  - **CP1** · Hoja "Tengo una molestia" con el estilo nuevo, llamando a `reportarMolestia`.
  - **CP2** · `aviso-molestia.tsx`: completo (4 niveles) dentro del ejercicio; bloqueo en alta; "Frená por hoy" en alarma.
  - **CP3** · Formato chico heredado con `avisoMolestiaPara`; chip `MOLESTIA` en la rutina; nada al empezar otra sesión.
  - **CP4** · Specs; evidencia; gate, PR.
- **Evidencia:** `mol-modal`, `mol-modal-alta`, `mol-modal-alarma`, `mol-leve`, `mol-mod`, `mol-alta`, `mol-alarma`, `mol-hereda`, `mol-lumbar`, `mol-no-hereda`, `mol-otro`, `rutina-molestia`.

### FE-09 · Historial y Progreso
- **Owner:** `@frontend-eng` · **Rama:** `feature/<#>-athlete-v7-historial-progreso` · **Tamaño:** M · **Depende de:** FE-02
- **Doc:** `02-pantallas.md §5-§6`
- **Checkpoints:** **CP1** · cabecera invertida y tarjetas de Historial · **CP2** · sesión abierta, Técnica, hoja "Corregir serie", por ejercicio, vacío, sin conexión · **CP3** · Progreso: cabecera, `formatearDelta` "+10 kg", gráfico · **CP4** · specs, evidencia, gate, PR.
- **Evidencia:** `hist`, `hist-open`, `hist-open-tec`, `hist-fix`, `hist-dash`, `hist-vacio`, `hist-off`, `prog`, `prog-tec`, `prog-vacio`, `prog-off`.

### FE-10 · Clases, chat, suscripción y cuestionario
- **Owner:** `@frontend-eng` · **Rama:** `feature/<#>-athlete-v7-clases-chat` · **Tamaño:** M · **Depende de:** FE-02
- **Doc:** `02-pantallas.md §7-§9`
- **Checkpoints:** **CP1** · Clases: semana, mes, cupo, botones con motivo y plurales · **CP2** · chat en hoja · **CP3** · cuestionario (con y sin respuestas) · **CP4** · specs, evidencia, gate, PR.
- **Evidencia:** `cls`, `cls-mes`, `cls-reservada`, `cls-cupo`, `cls-dia-vacio`, `cls-off`, `chat`, `cuest`, `cuest-hecho`.

### FE-11 · Onboarding de 4 pasos y cierre
- **Owner:** `@frontend-eng` · **Rama:** `feature/<#>-athlete-v7-onboarding-cierre` · **Tamaño:** M · **Depende de:** FE-01, BE-01
- **Doc:** `02-pantallas.md §4` y `§10`
- **Checkpoints:** **CP1** · paso 1 (bienvenida oscura) y paso 2 (nombre) · **CP2** · pasos 3 y 4 con la numeración nueva, "Saltar" · **CP3** · cierre: pantalla oscura, sin ranking, PR dorado, sin señal · **CP4** · specs, evidencia, gate, PR.
- **Evidencia:** `onb1`, `onbname`, `onb2`, `onb3`, `cierre`, `cierre-off`, `toast-sesion`.

### FE-12 · Fondo: malla asimétrica
- **Owner:** `@frontend-eng` · **Rama:** `feature/<#>-athlete-v7-fondo` · **Tamaño:** S · **Depende de:** FE-02
- **Doc:** `01-sistema-visual.md §10`
- **Checkpoints:** **CP1** · `src/lib/athlete/fondo.ts` (rng, anclas, desvíos, SVG, grano, desvanecido) + test que compara con `window.gzFondo.bgValue` de la referencia para 3 semillas · **CP2** · `fondo-generativo.tsx` con semilla al azar por apertura (`sessionStorage`), liso en ejercicio, onboarding de nombre y cuestionario · **CP3** · evidencia con semilla 3 (`?seed=3` o `sessionStorage`), gate, PR.
- **Criterios:** F-20 y F-21 de `05 §4`; sin animación ni repintado al navegar.

## Ola 3 · Cierre

### QA-02 · E2E funcional v7
- **Owner:** `@qa-eng` · **Rama:** `feature/<#>-athlete-v7-e2e` · **Tamaño:** M · **Depende de:** ola 2
- **Doc:** `05-qa.md §4`
- **Checkpoints:** **CP1** · F-00 (series llegan a la base) y F-01 a F-03 (nombre) · **CP2** · F-04 a F-10c (molestias: aviso, herencia, guardado sin señal y recuperación) · **CP3** · F-11 a F-16 (video: enlace, archivo sin señal, límites, error y reintento; indicaciones) · **CP4** · F-17 a F-21 · **CP5** · evidencia final aprobada y capturas convertidas en base de `toHaveScreenshot`; PR.

### QA-03 · Accesibilidad, desbordes y control de alcance
- **Owner:** `@qa-eng` · **Rama:** `feature/<#>-athlete-v7-a11y-alcance` · **Tamaño:** M · **Depende de:** ola 2
- **Doc:** `05-qa.md §5-§6`
- **Checkpoints:** **CP1** · control de alcance sobre toda la épica y `athlete-v7-sin-colores-viejos.spec.ts` · **CP2** · desbordes a 390 y 360 px con "147,5" y letra grande · **CP3** · contraste, teclado y movimiento reducido · **CP4** · Coach Studio sin cambios visuales; PR.
