# 04 · Frontend

> **Para:** `@frontend-eng`. Issues FE-01 a FE-15 (`06-issues.md`).
> Leer antes: `01-sistema-visual.md` (tokens y componentes) y `02-vistas.md` (qué construir).
> Reglas del repo: Karpathy (cambios quirúrgicos, un issue = un alcance), Ponytail (sin dependencias nuevas; ver D2), rama `feature/<#>-slug`, gate `npm test && npm run typecheck && npm run lint && npm run build`.

---

## 1. Orden de trabajo

```
Fase 0  FE-01 (/athlete)   FE-02 (planes/días)        ← sin dependencias, arrancan ya
Fase 1  FE-03 (tokens) ──► FE-04 (primitivas) ──► FE-05 (copy + íconos)
Fase 2  FE-06 (shell) ─┬─► FE-07 (Inicio)   ◄── BE-01
                       ├─► FE-08 (Directorio)
                       ├─► FE-09 (Ficha layout) ─┬─► FE-10 (Salud) ◄── BE-02
                       │                         └─► FE-11 (resto de islas) ◄── BE-03
                       ├─► FE-12 (Cobros) ◄── BE-01
                       ├─► FE-13 (Agenda)
                       └─► FE-14 (Rutinas + Ranking)
        FE-15 (Ingresos + Métricas) ◄── BE-01
```

Mientras backend termina BE-01/02/03, frontend puede programar contra los **tipos** publicados en `03-backend.md` con datos demo que cumplan ese tipo.

---

## 2. Inventario: actual → nuevo

| Actual | Acción | Nuevo / destino |
|---|---|---|
| `ui/button.tsx` | Ajustar variantes y tamaños (§2.1 sistema) | mismo archivo |
| `ui/badge.tsx` | Mantener para usos neutros | + `ui/status-badge.tsx` |
| `ui/card.tsx` | Quitar sombras | mismo archivo |
| `ui/tabs.tsx` | Mantener; agregar navegación con flechas | + `ui/segmented.tsx` |
| `ui/popover.tsx` | Base de Dropdown, Tooltip y búsqueda | + `ui/dropdown-menu.tsx`, `ui/tooltip.tsx` |
| — | Nuevo, sobre `<dialog>` nativo | `ui/sheet.tsx`, `ui/dialog.tsx` |
| — | Nuevo | `ui/alert.tsx`, `ui/empty-state.tsx`, `ui/skeleton.tsx`, `ui/avatar.tsx`, `ui/data-table.tsx`, `ui/icons.tsx` |
| `coach/business-kpi-strip.tsx` | Reescribir como fila de `KpiCard` | `coach/kpi-card.tsx` + `business-kpi-strip.tsx` (contenedor) |
| `coach/critical-alerts-inbox.tsx` | Reemplazar por lista "Para revisar hoy" | `coach/para-revisar-hoy.tsx`; conservar `critical-alerts-store.ts` adaptado a `DolorActivo` |
| `coach/student-card.tsx` + tabla en `coach-studio-view.tsx` | Reemplazar por DataTable | `coach/alumnos-table.tsx` |
| `coach/studio-shell.tsx` | Reestructurar sidebar y topbar | mismo archivo + `coach/account-menu.tsx`, `coach/global-search.tsx`, `coach/mobile-tab-bar.tsx` |
| `coach/chat-fab.tsx` | Quitar FAB del layout; el panel queda como Sheet invocable | mismo archivo |
| `coach/student-detail.tsx` (3137 líneas) | Extraer cabecera y layout; mantener orquestación | `student-detail/ficha-header.tsx`, `student-detail/use-canvas-layout.ts` |
| `islas/isla-card-shell.tsx` | Refactor a API `IslaProps` (§2.4 sistema) | mismo archivo |
| `islas/isla-timeline-ribbon.tsx` | "Últimas sesiones" | mismo archivo |
| `islas/isla-routine-workbench.tsx` | "Rutina" | mismo archivo |
| `islas/isla-metricas-1rm.tsx` | "Fuerza y progreso" con `calcularProgresion` | mismo archivo |
| `islas/isla-salud-anamnesis.tsx` + `coach/student-pain-alerts.tsx` | Unificar en una isla | `islas/isla-salud-anamnesis.tsx`; `student-pain-alerts.tsx` queda sin uso en la ficha |
| `islas/isla-activity-feed.tsx` | Lista plana | mismo archivo |
| `islas/isla-administrativa.tsx` | "Membresía" + Sheet "Editar datos del alumno" | mismo archivo + `student-detail/editar-alumno-sheet.tsx` |
| `coach/cobros-panel.tsx` (1750) | DataTable + Sheet de pago | mismo archivo + `coach/registrar-pago-sheet.tsx` |
| `coach/class-agenda.tsx` (1783) | Rango automático, panel lateral | mismo archivo + `coach/clase-detalle-panel.tsx` |
| `coach/rutinas-library.tsx` | Barra única, pestaña inicial con contenido | mismo archivo |
| `coach/ranking-funcional.tsx` (1027) | Un guardado por fila, rankings neutros | mismo archivo |
| `coach/studio-sankey-view.tsx` | Datos de `KpisNegocio`, tokens claros, tabla accesible | mismo archivo |
| `coach/retention-kpi-cards.tsx`, `coach/progressive-overload-feed.tsx` | Fuente única + empty state | mismos archivos |

---

## 3. Detalles por issue

### FE-01 · `/athlete` no rompe
- `src/components/athlete/inicio-mis-dias.tsx` líneas ~327 y ~345: reemplazar `student.nombre_completo.split(" ")[0]` por un helper `primerNombre(nombre?: string | null): string` en `src/lib/utils.ts` que devuelve `""` si no hay nombre. Buscar otros `.nombre_completo.split(` en `src/` y usar el helper.
- Agregar `src/app/(athlete)/athlete/error.tsx` (error boundary de App Router): "No pudimos cargar tu plan." + "Reintentar" (`reset()`).
- Hacer lo mismo para `src/app/(coach)/studio/error.tsx`.

### FE-02 · Planes y días del mismo dataset
- `coach-studio-view.tsx` ~líneas 95–106: `planes` sale de `DEMO_GIMNASIO.planes` y `dias` / `ejerciciosEnRutina` de `initialDataset`. Tomar los cuatro (`alumnos`, `planes`, `dias`, `ejerciciosEnRutina`) **del mismo origen**: todos de `initialDataset` si trae alumnos, todos del demo si no.
- Test: un plan con 4 días en el dataset muestra 4 días en la ficha.

### FE-03 · Tokens y tipografía
- `globals.css`: aplicar §1.1 del sistema (solo `--radius` cambia valor; el resto se agrega). **No** tocar los valores que fija `bimodal-theme-toggle.spec.ts`.
- `tailwind.config.ts`: colores `*-soft`, `sidebar`; `fontFamily.sans/mono` con `var(--font-sans)` y `var(--font-mono)`; agregar `boxShadow.md` y `xl` según §1.3; dejar `m3-*` con comentario `@deprecated`.
- `src/app/layout.tsx`: `Geist` y `Geist_Mono` desde `next/font/google`, `variable: "--font-sans"` / `"--font-mono"`, aplicadas en `<html className>`.

### FE-04 · Primitivas UI
- API idéntica a shadcn/ui (nombres de componentes, props `variant`, `size`, `asChild`, `open`, `onOpenChange`, `side`) para que una futura migración a Radix (D2 = B) no toque consumidores.
- `sheet.tsx` y `dialog.tsx` sobre `<dialog>` con `showModal()`: foco inicial en el primer control, Escape cierra (evento `cancel`), al cerrar devolver el foco al trigger, scroll del body bloqueado.
- `dropdown-menu.tsx`: `role="menu"`, ítems `role="menuitem"`, flechas arriba/abajo, Home/End, Escape, cierre al elegir.
- `data-table.tsx`: implementar §2.6; ordenamiento y paginación en cliente; `aria-sort`; filas navegables con `<a>` en la primera celda (no `onClick` en `<tr>`).
- Una página interna `src/app/(coach)/studio/_ui/page.tsx` (solo en desarrollo, `notFound()` en producción) con todos los componentes y estados, para QA visual.

### FE-05 · Copy, jerga e íconos
- Aplicar el glosario §4 del sistema completo.
- Reemplazar emojis usados como íconos en `src/components/coach/**` por `ui/icons.tsx`.
- Quitar `remitente_id.slice(0, 8)` de `chat-fab.tsx`.
- Quitar la nota "Semáforos Material Design 3… Touch targets…" de `coach-studio-view.tsx`.
- Comando de verificación para el PR: `rg -n "M3 Edition|Executive Workspace|ADR-0|Columna Matriz|Ribbon|Quirúrgica|Touch targets|\[-\]|\[\+\]" src/components src/app` debe devolver vacío (los comentarios de código pueden quedarse si no se renderizan; preferible limpiarlos también).

### FE-06 · Shell
- §1 de `02-vistas.md`. `aria-current="page"` en el ítem activo, contadores con `aria-label` ("Cobros, 7 vencidos").
- Un solo "Cerrar sesión" (en `account-menu.tsx`). Mantener el `data-testid` de logout que use `qa-logout-universal-ui.spec.tsx`.
- `mobile-tab-bar.tsx` visible solo `< md`.

### FE-07 · Inicio
- §2 de `02-vistas.md`. Directorio abierto por defecto si D5 = A.
- Conservar `data-testid="kpi-ingresos"` y `kpi-ingresos-total` como alias del KPI "Cobrado" (6 specs los usan).

### FE-08 · Directorio
- §3 de `02-vistas.md`. Estado del filtro en la URL (`useSearchParams`).

### FE-09 · Ficha: cabecera, layout, Personalizar
- Extraer `use-canvas-layout.ts` desde `student-detail.tsx` (líneas ~668–1040: `DEFAULT_CANVAS_ROWS`, `canvasRows`, `collapsedIslands`, `moveIsland*`, `handleDrag*`, persistencia).
- Nuevo default v2 (§4.2 de `02-vistas.md`), clave `gozster_canvas_layout_v2_${coachIdLogueado}`; el id sale de la sesión (`useRolActual` / perfil logueado), no de `alumno.entrenador_id`.
- `isCanvasMode` → `editing`; botón de ícono en la cabecera. Teclado para mover islas con `aria-live`.
- Debajo de 960 px: una columna, orden fijo, Personalizar oculto.

### FE-10 · Isla Salud unificada
- Consumir `fetchDolorActivo(alumnoId)` y `actualizarEstadoDolor` (BE-02). Badge de cabecera y fila resaltada en la rutina leen la misma lista.
- Quitar el bloque "Reporte de Molestia en Ejercicio" y el `StudentPainAlerts` embebido; un solo Alert por caso.
- El badge "Sin red flags" desaparece; si no hay casos: "Sin dolores activos.".

### FE-11 · Sesiones, Rutina, Fuerza, Actividad, Membresía
- §4.3–4.8 de `02-vistas.md`. Fuerza usa `calcularProgresion` (BE-03); el badge "{n} de {m} en progresión" se deriva, no se escribe.

### FE-12 · Cobros
- §5 de `02-vistas.md`. KPIs desde `KpisNegocio`; `metricas()` del store deja de alimentar la fila de KPIs (puede seguir existiendo para la lista).

### FE-13 · Agenda / FE-14 · Rutinas + Ranking / FE-15 · Ingresos + Métricas
- §6, §7, §8 y §10 de `02-vistas.md`.

---

## 4. Convenciones de implementación

- **Regla de datos de ejemplo (agregada tras la revisión 07).** Los valores que aparecen en el canvas, el PDF y `02-vistas.md` (Lucas, EVA 5, "Pase libre $40.000", "26 nov", la nota de Landmine, etc.) son ilustrativos. Ningún componente fuera de `src/services/coach-demo-*` puede tenerlos como valor por defecto: ni en props, ni en `useState`, ni con `||` / `??`. Si falta un dato, se muestra el estado vacío especificado. En modo en vivo, si una consulta falla, se muestra error con "Reintentar"; **nunca** datos demo.
- `data-testid` en todo elemento que un test necesite encontrar; **nunca** testear por copy visible en specs nuevos.
- Componentes de vista sin cálculos de negocio: reciben datos ya calculados (`KpisNegocio`, `DolorActivo[]`, `ResumenProgresion`).
- Estados de carga con `Skeleton`, error con `Alert`, vacío con `EmptyState`. Ningún componente renderiza una caja vacía.
- Números: `Intl.NumberFormat("es-AR")`; dinero sin decimales; kg con hasta 1 decimal y coma.
- Fechas relativas: "Hoy", "Ayer", "Hace {n} días", "en {n} días"; absolutas "5 nov".
- Modo noche: todo color por token; prohibido `text-emerald-400`, `bg-amber-500/20` y similares en código nuevo.

---

## 5. Accesibilidad que frontend debe dejar resuelta

| Regla | Dónde se nota |
|---|---|
| Botones de ícono con `aria-label` | `…` de filas, chevrons de islas, tema, búsqueda móvil |
| Estado con palabra | badges de cuota, rutina, dolor, pago |
| `aria-expanded` + `aria-controls` | islas, menú de cuenta, `…` |
| `aria-pressed` | Segmented, Personalizar, bloques de agenda |
| `aria-sort` | encabezados ordenables |
| Foco visible | `focus-visible:ring-2 ring-ring ring-offset-2` en todo control |
| Orden de tabulación | cabecera de ficha → islas en orden visual; con Personalizar, el asa es tabulable |
| `prefers-reduced-motion` | sin animación de chevron ni skeleton pulse |

---

## 6. Specs existentes que se rompen y hay que actualizar en el mismo PR

Muchos specs leen el código fuente (`readFileSync`) y buscan strings. Al cambiar copy o estructura, actualizar el spec en el mismo PR: reemplazar la aserción por un `data-testid` o por el copy nuevo, **sin** relajarla (`.skip`/`.todo` están prohibidos por Selection nivel 6).

| Issue | Archivo fuente | Specs a revisar |
|---|---|---|
| FE-03 | `globals.css` | `bimodal-theme-toggle.spec.ts`, `agenda-tokens-cabecera-grilla.spec.ts` |
| FE-04 | `ui/popover.tsx`, `ui/tabs.tsx` | `athlete-single-set-workout.spec.ts` (sin `@radix-ui`), `athlete-set-type-taxonomy-popover.spec.ts` |
| FE-05 / FE-06 | `studio-shell.tsx` | `bimodal-theme-toggle`, `clases-reservas-ui`, `coach-studio-v2-ui`, `documentacion-testeo`, `instant-loading-studio-metrics-342`, `qa-auth-rbac-verification`, `qa-fase1-contrataciones-vencimientos-backup`, `qa-logout-universal-ui`, `qa-rutinas-2x1-previsualizacion-peso`, `qa-student-detail-canvas-islas`, `ranking-funcional`, `studio-layout-testeo`, `qa-studio-perf-combobox-rutinas` |
| FE-05 / FE-07 / FE-08 | `coach-studio-view.tsx` | `alumnos-directory-collapsible` (GOZS-131, ver D5), `assign-routine-preview`, `bimodal-theme-toggle` ("Columna Matriz", `min-h-[48px]`), `business-kpi-strip`, `coach-studio-chat-action`, `coach-studio-v2-ui` ("Bandeja de alertas críticas", "Columna Matriz", "Score Salud [SH]", "Vigencia Rutina"), `coach-studio-v2`, `demo-gimnasio-40`, `eliminar-proxy-sh`, `inapp-chat-athlete-notif-drawer-cobros`, `indec-copy`, `instant-loading-studio-metrics-342`, `onboarding-cuestionario-vista-minimalista`, `qa-audit-gozs-351-edge-cases`, `qa-coach-studio-multiactividad-planes-corpo`, `qa-cupos-default-sankey-ingresos`, `qa-gozs-359-athlete-studio-fixes`, `qa-pulido-app-alta-cobro-rutinas-351`, `qa-rutinas-2x1-previsualizacion-peso`, `student-pain-alerts-testeo`, `studio-layout-testeo`, `studio-sankey-filtros-actividad`, `table-density-testeo`, `table-email-testeo`, `qa-studio-perf-combobox-rutinas` |
| FE-07 | `business-kpi-strip.tsx` | `business-kpi-strip-promocion`, `business-kpi-strip`, `kpi-ingresos-desagregado`, `studio-sankey-filtros-actividad`, `qa-studio-sankey-dolor-chat-app` |
| FE-07 / FE-10 | `critical-alerts-inbox.tsx`, `student-pain-alerts.tsx` | `coach-studio-v2-ui`, `coach-studio-v2`, `critical-alerts-inbox-testeo`, `molestias-red-flags-ui`, `studio-layout-testeo`, `student-pain-alerts-testeo` |
| FE-09 / FE-10 / FE-11 | `student-detail.tsx`, `islas/*` | `qa-student-detail-canvas-islas` ("Modo Canvas", "Configurar Islas", "Colapsar Feed", "Timeline Biomecánico Ribbon", "[-]", "Reporte de Molestia en Ejercicio", "Bitácora de Intervención del Entrenador", "Guardar Registro en la Ficha", "Progresión Real de Cargas"), `qa-canvas-user-matrix` ("Modo Canvas", "6/6", "[+]", "Salud:", "Staff &amp; Chat", "Contratación &amp; Renovación", "cursor-grab", "border-dashed border-primary/50"), `chat-ui-gozs-transferencia`, `clases-reservas-ui`, `coach-studio-chat-action`, `fernando-rosales-alumnos-testeo`, `ficha-alumno-actividad-pago`, `molestias-red-flags-ui`, `onboarding-cuestionario-vista-minimalista`, `qa-coach-studio-multiactividad-planes-corpo`, `student-pain-alerts-testeo`, `vista-simple-tecnica-alumno-coach` |
| FE-12 | `cobros-panel.tsx` | `cobros-panel-ui-planes`, `inapp-chat-athlete-notif-drawer-cobros`, `kpi-ingresos-anual-cobros`, `qa-coach-studio-multiactividad-planes-corpo`, `qa-combobox-alta-sexo-cobros-descuentos`, `qa-studio-perf-combobox-rutinas` |
| FE-13 | `class-agenda.tsx` | `agenda-cancelar-defaults-gozs-251`, `agenda-tokens-cabecera-grilla`, `clases-reservas-ui`, `qa-cupos-default-sankey-ingresos`, `ranking-funcional` |
| FE-14 | `rutinas-library.tsx`, `ranking-funcional.tsx` | `qa-gozs-365-coach-studio-tags-biblioteca`, `qa-rutinas-2x1-previsualizacion-peso`, `qa-studio-perf-combobox-rutinas`, `qa-combobox-alta-sexo-cobros-descuentos`, `ranking-funcional` |
| FE-15 | `studio-sankey-view.tsx`, `retention-kpi-cards.tsx` | `qa-cupos-default-sankey-ingresos`, `coach-studio-v2-ui`, `coach-studio-v2` |
| FE-01 | `inicio-mis-dias.tsx` | `athlete-inicio-mis-dias`, `athlete-motivo-cambio-dia`, `athlete-plan-real`, `fernando-rosales-alumnos-testeo`, `inapp-chat-athlete-notif-drawer-cobros`, `qa-rutinas-2x1-previsualizacion-peso` |

Todos en `src/__tests__/`, salvo `qa-studio-perf-combobox-rutinas.spec.ts` y `qa-studio-sankey-dolor-chat-app.spec.ts`, que están en `tests/`. Los e2e en `tests/e2e/` usan `data-testid` y textos de login/agenda; correrlos completos al cerrar Fase 2.
