# 06 · Issues listos para Multica

> **Para:** `@PM-GOZster`. Cada bloque entre `---` es un issue. Copiar a un archivo y crear con `multica issue create --pr-auto-complete off --description-file <archivo>` (regla del repo: descripciones largas siempre por archivo; `--pr-auto-complete off` previene cierre prematuro en tareas multi-stage).
> Reemplazar `<#>` por el número asignado. Todas las ramas salen de `main` después de mergear `feature/student-detail-canvas-islas`.
> Cada issue hereda: gate `npm test && npm run typecheck && npm run lint && npm run build`, revisión Selection de `@qa-eng`, y actualización de specs afectados sin relajarlos (`04-frontend.md §6`).

---

## BE-01 · Fuente única de KPIs de negocio
**Owner:** `@backend-eng` · **Rama:** `feature/<#>-kpis-fuente-unica` · **Depende de:** — · **Tamaño:** M
**Docs:** `03-backend.md §1`
**Alcance:** nueva migración `rpc_kpis_negocio_v2`, `src/lib/kpis-negocio.ts`, `src/services/coach-demo-generator.ts`, `src/types/database.types.ts`, specs nuevos.

Extender `obtener_kpis_negocio` con los campos de §1 y publicar `obtenerKpisNegocio`, `rangoPeriodo`, `puedeVerMontos` y el tipo `KpisNegocio`. El modo demo devuelve el mismo tipo.

- GIVEN el seed de prueba WHEN se llama la RPC y `derivarKpisNegocio` sobre el mismo seed THEN todos los campos de `KpisNegocio` coinciden.
- GIVEN 3 pagos confirmados, 1 cuota por vencer y 2 vencidas THEN `cobrado`, `porCobrar`, `vencido`, `facturado` y `tasaCobroPct` dan los valores esperados.
- GIVEN rol ENTRENADOR WHEN se llama `obtenerKpisNegocio` THEN los montos vienen `null` y `puedeVerMontos` devuelve `false`.
- GIVEN `rangoPeriodo("mes", 2026-11-30T23:30-03:00)` THEN `desde = 2026-11-01`, `hasta = 2026-11-30`.

**Evidencia:** salida de los specs pglite; comentario de cierre con el contrato final.

---

## BE-02 · Modelo unificado de dolor (EVA + estado único)
**Owner:** `@backend-eng` · **Rama:** `feature/<#>-dolor-eva-estado-unico` · **Depende de:** D4 · **Tamaño:** M
**Docs:** `03-backend.md §2`
**Alcance:** migración `dolor_eva_estado_unico`, vista `v_dolor_activo`, RPC `actualizar_estado_dolor`, `src/lib/dolor.ts` (nuevo), `database.types.ts`.

- GIVEN filas existentes LEVE/MODERADO/AGUDO WHEN corre la migración THEN `eva` queda 3/5/8 y la migración es idempotente (correrla dos veces no cambia nada).
- GIVEN un caso con `eva = 7` THEN `severidad = 'AGUDO'`, `v_dolor_activo.nivel = 'alto'` y la alerta espejada tiene `severidad = 'ALTA'`.
- GIVEN un caso PENDIENTE WHEN `actualizar_estado_dolor(caso, 'ATENDIDO')` THEN el caso y su alerta quedan ATENDIDO.
- GIVEN un caso RESUELTO WHEN se reabre sin nota THEN la RPC rechaza con error de validación.
- GIVEN `nivelDesdeEva(3,false)`, `(4,false)`, `(7,false)`, `(2,true)` THEN `leve`, `moderado`, `alto`, `alto`.

---

## BE-03 · Progresión de cargas derivada
**Owner:** `@backend-eng` · **Rama:** `feature/<#>-progresion-derivada` · **Depende de:** — · **Tamaño:** S
**Docs:** `03-backend.md §3`
**Alcance:** `src/lib/strength-metrics.ts` o `src/lib/progresion.ts`, specs unit.

- GIVEN 4 ejercicios donde 2 suben y 2 bajan > 2,5 % THEN `enProgresion = 2`, `total = 4`.
- GIVEN series de calentamiento con más carga THEN no cuentan.
- GIVEN un ejercicio con datos de una sola semana THEN se excluye del total.

---

## FE-01 · `/athlete` no rompe con perfil incompleto
**Owner:** `@frontend-eng` · **Rama:** `fix/<#>-athlete-nombre-null` · **Depende de:** — · **Tamaño:** S
**Docs:** `04-frontend.md §3 FE-01`
**Alcance:** `src/components/athlete/inicio-mis-dias.tsx`, `src/lib/utils.ts`, `src/app/(athlete)/athlete/error.tsx`, `src/app/(coach)/studio/error.tsx`.

- GIVEN un perfil sin `nombre_completo` WHEN se abre `/athlete` THEN la página renderiza con "Hola" y sin `pageerror`.
- GIVEN un error no controlado en `/athlete` o `/studio` THEN se ve "No pudimos cargar…" con "Reintentar".

---

## FE-02 · Ficha: planes y días del mismo dataset
**Owner:** `@frontend-eng` · **Rama:** `fix/<#>-ficha-planes-dias` · **Depende de:** — · **Tamaño:** S
**Alcance:** `src/components/coach/coach-studio-view.tsx`.

- GIVEN `initialDataset` con alumnos, planes y 4 días para el plan activo de Lucas WHEN se abre su ficha THEN la isla de rutina muestra 4 días y no "Sin días configurados".
- GIVEN `initialDataset` vacío THEN todo sale del demo y los días también coinciden.

---

## FE-03 · Tokens, tipografía y radios
**Owner:** `@frontend-eng` · **Rama:** `feature/<#>-tokens-ui` · **Depende de:** D1 · **Tamaño:** S
**Docs:** `01-sistema-visual.md §1`
**Alcance:** `src/app/globals.css`, `tailwind.config.ts`, `src/app/layout.tsx`.

- GIVEN `globals.css` THEN existen los tokens `*-soft` en `:root` y `.dark` y `--radius: 0.5rem`; los valores que fija `bimodal-theme-toggle.spec.ts` no cambian.
- GIVEN la app THEN `body` usa Geist y los números con clase `font-mono` usan Geist Mono.
- GIVEN `package.json` THEN no hay dependencias nuevas.

---

## FE-04 · Primitivas UI con API shadcn
**Owner:** `@frontend-eng` · **Rama:** `feature/<#>-primitivas-ui` · **Depende de:** D2, FE-03 · **Tamaño:** L
**Docs:** `01-sistema-visual.md §2–3`, `04-frontend.md §3 FE-04`
**Alcance:** `src/components/ui/*` (nuevos: status-badge, segmented, dropdown-menu, tooltip, sheet, dialog, alert, empty-state, skeleton, avatar, data-table, icons), página interna `studio/_ui`.

- GIVEN un `StatusBadge` sin `children` THEN TypeScript no compila.
- GIVEN un Sheet abierto WHEN se presiona Escape THEN cierra y el foco vuelve al disparador; Tab no sale del Sheet mientras está abierto.
- GIVEN un DropdownMenu abierto WHEN se usan flechas, Home, End, Enter y Escape THEN se comporta como `role="menu"` estándar.
- GIVEN una DataTable con 36 filas y `pageSize = 15` THEN muestra 15, "Mostrando 15 de 36" y Anterior deshabilitado.
- GIVEN un `<th>` ordenable WHEN se ordena THEN `aria-sort` cambia.
- GIVEN `/studio/_ui` en producción THEN responde 404.

---

## FE-05 · Limpieza de copy, jerga e íconos
**Owner:** `@frontend-eng` · **Rama:** `feature/<#>-copy-iconos` · **Depende de:** FE-03 · **Tamaño:** M
**Docs:** `01-sistema-visual.md §3–4`
**Alcance:** textos y emojis en `src/components/coach/**` y `src/app/(coach)/**`.

- GIVEN el repo WHEN se corre `rg -n "M3 Edition|Executive Workspace|ADR-0|Columna Matriz|Ribbon|Quirúrgica|Touch targets" src/components src/app` THEN no hay coincidencias en texto renderizado.
- GIVEN el chat del coach THEN no se muestran IDs truncados.
- GIVEN Coach Studio THEN ningún emoji cumple función de ícono.

---

## FE-06 · Shell: sidebar agrupado, topbar y barra inferior móvil
**Owner:** `@frontend-eng` · **Rama:** `feature/<#>-shell-studio` · **Depende de:** FE-04 · **Tamaño:** M
**Docs:** `02-vistas.md §1, §9`

- GIVEN cualquier ruta de `/studio` THEN hay un único "Cerrar sesión" y está en el menú de cuenta.
- GIVEN el sidebar colapsado WHEN el foco llega a un ítem THEN se anuncia su nombre y aparece Tooltip.
- GIVEN `⌘K` THEN el foco va a la búsqueda; escribir "Lucas" y Enter abre su ficha.
- GIVEN 390 × 844 THEN se ve la barra inferior de 5 ítems y no la grilla de navegación ni el FAB.

---

## FE-07 · Inicio
**Owner:** `@frontend-eng` · **Rama:** `feature/<#>-inicio-studio` · **Depende de:** BE-01, FE-06, D5 · **Tamaño:** M
**Docs:** `02-vistas.md §2`

- GIVEN período Mes THEN `kpi-cobrado` es igual al KPI Cobrado de `/studio/cobros`.
- GIVEN una alerta de dolor EVA 7 pendiente THEN encabeza "Para revisar hoy" con badge "Alto".
- GIVEN 0 alertas THEN se lee "Nada urgente por hoy.".
- GIVEN rol ENTRENADOR THEN no hay montos visibles.
- GIVEN los specs que usan `kpi-ingresos` THEN siguen encontrando el elemento.

---

## FE-08 · Directorio de alumnos
**Owner:** `@frontend-eng` · **Rama:** `feature/<#>-directorio-alumnos` · **Depende de:** FE-04, D5 · **Tamaño:** M
**Docs:** `02-vistas.md §3`

- GIVEN 40 alumnos THEN el directorio arranca abierto (D5 = A) con 15 filas.
- GIVEN cualquier fila THEN Cuota y Alertas tienen texto.
- GIVEN 1440 px THEN ninguna acción sobresale del contenedor.
- GIVEN el filtro "Pago pendiente" THEN la URL tiene `?estado=pend` y recargar conserva el filtro.

---

## FE-09 · Ficha: cabecera, layout por defecto y Personalizar
**Owner:** `@frontend-eng` · **Rama:** `feature/<#>-ficha-layout` · **Depende de:** D3, FE-04 · **Tamaño:** L
**Docs:** `02-vistas.md §4.1–4.2`, `04-frontend.md §3 FE-09`

- GIVEN la ficha THEN hay una sola acción primaria ("Enviar mensaje") y el resto está en `outline` o en `…`.
- GIVEN sin layout guardado THEN se aplica el default v2 (Rutina + Salud en la misma fila; Fuerza + Actividad en la siguiente).
- GIVEN un layout guardado con la clave vieja THEN se ignora.
- GIVEN Personalizar apagado THEN no hay asas ni flechas visibles.
- GIVEN Personalizar encendido WHEN se mueve una isla solo con teclado THEN cambia de lugar, se anuncia por `aria-live` y persiste al recargar.
- GIVEN < 960 px THEN una columna en el orden de §4.2.

---

## FE-10 · Ficha: isla Salud unificada
**Owner:** `@frontend-eng` · **Rama:** `feature/<#>-ficha-salud` · **Depende de:** BE-02, FE-09 · **Tamaño:** M
**Docs:** `02-vistas.md §4.6`

- GIVEN un caso EVA 5 pendiente THEN cabecera, Alert de Salud, fila de rutina y "Para revisar hoy" muestran "moderado" y "Pendiente".
- GIVEN el Segmented WHEN se elige "Atendida" THEN se llama `actualizarEstadoDolor`; si falla, vuelve al estado anterior y se ve "No se pudo guardar. Reintentá.".
- GIVEN sin casos activos THEN "Sin dolores activos." y ningún badge de dolor.
- GIVEN la ficha THEN no existe el bloque "Reporte de Molestia en Ejercicio".

---

## FE-11 · Ficha: Sesiones, Rutina, Fuerza, Actividad y Membresía
**Owner:** `@frontend-eng` · **Rama:** `feature/<#>-ficha-islas` · **Depende de:** BE-03, FE-09 · **Tamaño:** M
**Docs:** `02-vistas.md §4.3–4.8`

- GIVEN 2 de 4 ejercicios en baja THEN el badge dice "2 de 4 en progresión" (warning).
- GIVEN la isla Fuerza THEN hay un único valor de 1RM visible; Brzycki solo en el Tooltip.
- GIVEN un ejercicio con dolor activo THEN su fila en la tabla de rutina tiene fondo de advertencia y nota.
- GIVEN 1440 × 900 con todo expandido THEN la ficha mide ≤ 2.300 px de alto.

---

## FE-12 · Cobros
**Owner:** `@frontend-eng` · **Rama:** `feature/<#>-cobros-datatable` · **Depende de:** BE-01, FE-04 · **Tamaño:** M
**Docs:** `02-vistas.md §5`

- GIVEN 36 contratos THEN 15 filas, vencidos primero, paginación visible.
- GIVEN una fila vencida THEN su acción primaria es "Registrar pago"; en una pagada, "Ver recibo".
- GIVEN el Sheet con monto 0 o fecha futura THEN no guarda y muestra el error.
- GIVEN un pago guardado THEN la fila pasa a "Pagado" y Cobrado aumenta exactamente ese monto en Cobros e Inicio.

---

## FE-13 · Agenda
**Owner:** `@frontend-eng` · **Rama:** `feature/<#>-agenda-panel` · **Depende de:** FE-04 · **Tamaño:** M
**Docs:** `02-vistas.md §6`

- GIVEN clases solo entre 17 y 20 h THEN la grilla muestra 17:00–21:00 sin la franja "+10 h".
- GIVEN click en un bloque THEN el panel derecho muestra esa clase y recibe el foco.
- GIVEN una clase cancelada THEN dice "Cancelada".
- GIVEN "Cancelar clase" THEN aparece Dialog de confirmación con la cantidad de anotados.
- GIVEN < 1024 px THEN el detalle abre como Sheet.

---

## FE-14 · Rutinas y Ranking
**Owner:** `@frontend-eng` · **Rama:** `feature/<#>-rutinas-ranking` · **Depende de:** FE-04 · **Tamaño:** M
**Docs:** `02-vistas.md §7–8`

- GIVEN 14 rutinas de alumnos y 0 plantillas THEN Rutinas abre en "De alumnos".
- GIVEN la pestaña Plantillas vacía THEN EmptyState con "Ver rutinas de alumnos" y "Crear plantilla".
- GIVEN una fila de Ranking con peso, carga y reps WHEN "Guardar" THEN se guarda todo junto, el botón dice "Guardado" y aparece en su categoría ordenada por ratio.
- GIVEN Ranking THEN no hay un segundo botón de guardar peso ni colores rosa/celeste.

---

## FE-15 · Ingresos y Métricas consumen KPIs únicos
**Owner:** `@frontend-eng` · **Rama:** `feature/<#>-ingresos-metricas-kpis` · **Depende de:** BE-01 · **Tamaño:** S
**Docs:** `02-vistas.md §10`

- GIVEN `/studio/ingresos` THEN no se importa `CANONICAL_SANKEY_DATA` en la página y "Facturado" = Cobrado + Por cobrar + Vencido.
- GIVEN el diagrama THEN existe la tabla equivalente debajo.
- GIVEN Métricas THEN "Alumnos activos" coincide con Inicio.
- GIVEN feed de sobrecarga sin datos THEN no se muestran los filtros y sí el EmptyState.

---

## QA-01 · Suite de coherencia cruzada
**Owner:** `@qa-eng` · **Rama:** `feature/<#>-coherencia-datos` · **Depende de:** contrato de BE-01 y BE-02 · **Tamaño:** S
**Docs:** `05-qa.md §2`

- GIVEN el seed fijo THEN los casos C1–C9 pasan en `desktop`.
- GIVEN un PR que rompa la igualdad de Cobrado entre Inicio y Cobros THEN la suite falla.

---

## QA-02 · Regresión e2e y visual por vista
**Owner:** `@qa-eng` · **Rama:** `feature/<#>-ux-regresion` · **Depende de:** cierre de Fase 2 (puede escribirse en paralelo por vista) · **Tamaño:** M
**Docs:** `05-qa.md §3`

- GIVEN los 4 proyectos de Playwright THEN UX-S, UX-I, UX-D, UX-F, UX-C, UX-A, UX-R, UX-K pasan; UX-M pasa en `mobile`.
- GIVEN cada vista THEN se guardan capturas en `docs/qa/demo-evidencia/<proyecto>/UX-*.png`.

---

## QA-03 · Auditoría de accesibilidad AA
**Owner:** `@qa-eng` · **Rama:** `feature/<#>-a11y-aa` · **Depende de:** cierre de Fase 2 · **Tamaño:** M
**Docs:** `05-qa.md §4`

- GIVEN cada vista en día y noche THEN el helper de contraste no reporta texto < 4,5:1.
- GIVEN cada vista THEN el snapshot ARIA está versionado y todo control tiene nombre accesible.
- GIVEN recorrido con Tab THEN el orden coincide con el visual y el foco siempre es visible.
- GIVEN Sheet, Dialog y menús THEN Escape cierra y el foco vuelve al disparador.
