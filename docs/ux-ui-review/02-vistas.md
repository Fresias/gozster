# 02 · Especificación de vistas

> **Para:** `@frontend-eng` (construye), `@qa-eng` (verifica), `@backend-eng` (secciones "Datos").
> Cada vista lista: ruta, layout, regiones, datos, estados, interacciones, copy, responsive, accesibilidad y criterios de aceptación. Componentes y tokens: `01-sistema-visual.md`.
> Los números de ejemplo son los del dataset demo, ya conciliados entre vistas; en producción salen de las fuentes de `03-backend.md`.

Índice: [1 Shell](#1-shell) · [2 Inicio](#2-inicio--studio) · [3 Directorio](#3-directorio-de-alumnos) · [4 Ficha](#4-ficha-del-alumno--studio-con-alumno-seleccionado) · [5 Cobros](#5-cobros--studiocobros) · [6 Agenda](#6-agenda--studioagenda) · [7 Rutinas](#7-rutinas--studiorutinas) · [8 Ranking](#8-ranking--studioranking-funcional) · [9 Móvil](#9-coach-studio-móvil-390-px) · [10 Métricas e Ingresos](#10-métricas-e-ingresos) · [11 Fuera de alcance](#11-fuera-de-alcance)

---

## 1. Shell

**Archivo actual:** `src/components/coach/studio-shell.tsx` (470 líneas).

```
┌──────────────┬──────────────────────────────────────────────────────────┐
│ [G] GOZSter  │ {Página}            [🔍 Buscar alumno, rutina… ⌘K] [☾] [+ Acción] │ 56 px
│  Coach Studio├──────────────────────────────────────────────────────────┤
│              │                                                          │
│ Alumnos      │                    contenido (max 1180)                  │
│  · Inicio    │                                                          │
│  · Alumnos 40│                                                          │
│  · Rutinas   │                                                          │
│ Operación    │                                                          │
│  · Agenda    │                                                          │
│  · Ranking   │                                                          │
│ Negocio      │                                                          │
│  · Cobros  7 │                                                          │
│  · Métricas  │                                                          │
│ ──────────── │                                                          │
│ Vista alumno │                                                          │
│ (LF) Lucía ⇅ │                                                          │
└──────────────┴──────────────────────────────────────────────────────────┘
   240 px
```

### Regiones
| Región | Contenido | Notas |
|---|---|---|
| Marca | Cuadrado 32 px `bg-primary` con "G" + "GOZSter" (600) / "Coach Studio" (12, muted) | Sin "Executive Workspace • M3 Edition" |
| Nav grupo "Alumnos" | Inicio `/studio`, Alumnos `/studio` (directorio) con contador total, Rutinas `/studio/rutinas` | |
| Nav grupo "Operación" | Agenda `/studio/agenda`, Ranking `/studio/ranking-funcional` | |
| Nav grupo "Negocio" | Cobros `/studio/cobros` con contador de vencidos en `danger-soft-foreground`, Métricas `/studio/dashboard` | Ingresos se accede desde Inicio y Métricas, no desde el menú |
| Pie | "Vista del alumno" (link), botón de cuenta: avatar + nombre + estado de sincronización + ⇅ | El botón de cuenta abre DropdownMenu: Modo día/noche, Documentación, Cerrar sesión. **"Cerrar sesión" existe una sola vez.** |
| Topbar | Nombre de página (500), búsqueda, botón de tema (ícono, `aria-label="Cambiar a modo noche"` o "…día"), acción primaria contextual | La acción primaria cambia por página: Inicio "Alta de alumno", Cobros "Registrar pago", Agenda "Nueva clase", Rutinas "Nueva rutina" |

### Interacciones
| Disparador | Resultado |
|---|---|
| Click ítem de nav | Navega; ítem activo `bg-muted font-medium` + `aria-current="page"` |
| `⌘K` / `Ctrl+K` o click en búsqueda | Foco en el input; escribir filtra alumnos, rutinas y clases en un Popover de resultados (máx. 8, agrupados). Enter abre el primero. Escape cierra. |
| Botón colapsar (ícono `panel-left` en la topbar) | Sidebar a 56 px: solo íconos con `aria-label` y Tooltip a la derecha. Persistir en `localStorage` `gozster_sidebar_collapsed`. |
| Tema | Alterna `.dark` en `<html>`; el ícono muestra el modo al que se va a cambiar |
| Sin conexión | El estado bajo el nombre pasa a "Sin conexión · reintentando" en `warning-soft-foreground` |

### Responsive
- ≥ 1024: sidebar expandido. 768–1023: colapsado por defecto. < 768: sidebar oculto, ver §9.

### Criterios
- GIVEN cualquier página de `/studio` WHEN se renderiza THEN existe exactamente un control "Cerrar sesión" accesible y está dentro del menú de cuenta.
- GIVEN el sidebar colapsado WHEN el foco llega a un ícono THEN el lector anuncia su nombre (`aria-label`) y aparece el Tooltip.
- GIVEN 1366 × 768 WHEN se carga `/studio` THEN no hay scroll horizontal de página.

---

## 2. Inicio · `/studio`

**Archivos actuales:** `coach-studio-view.tsx` (1446), `business-kpi-strip.tsx`, `critical-alerts-inbox.tsx`, `chat-fab.tsx`.

```
Hola, Lucía                                          [Semana|Mes|Trimestre]
Jueves 5 de noviembre · 3 clases hoy, 5 alertas para revisar.
┌ Cobrado    nov ┐┌ Alumnos al día hoy ┐┌ Sin rutina hoy ┐┌ Sin entrenar +7 días ┐
│ $767.000       ││ 32 de 40           ││ 4              ││ 7                    │
│ $105.000 por…  ││ +4 altas, −2 bajas ││ Asignales una… ││ 3 con cuota al día   │
└────────────────┘└────────────────────┘└────────────────┘└──────────────────────┘
┌ Para revisar hoy ───────── Ordenado por prioridad ┐┌ Clases de hoy ── Ver agenda ┐
│ [Alto]  Celeste Gerardi  Dolor alto · Rodilla · EVA 7  Hoy 10:45 › ││ 17:00 Funcional   1/12 │
│ [Alto]  Martina Gómez …                               ││ 18:00 Funcional [Ahora] │
│ [Medio] Lucas Giménez  Dolor moderado · Hombro · EVA 5 ││ 19:30 Boxeo      0/10 │
│ [Cuota] Tomás Ledesma  Cuota vencida hace 9 días       ││ (JP)(AM)(RH) 7 sin entrenar… Escribirles │
│ [Progreso] Sofía Albarracín 30 días sin récord         │└─────────────────────────┘
└────────────────────────────────────────────────────┘
┌ Alumnos  [Todos 40][Al día 32][Pago pendiente 3][Nuevos 24]   [+ Actividad] ┐
│ DataTable (§3)                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Datos
| Bloque | Fuente (ver `03-backend.md`) |
|---|---|
| KPIs | `obtenerKpisNegocio({ desde, hasta })` según el Segmented de período. Los cuatro KPIs salen de la misma llamada. Si `puedeVerMontos(rol)` es falso, "Cobrado" se reemplaza por "Alumnos activos". |
| Para revisar hoy | `alertas_entrenador` con estado `PENDIENTE` ∪ cuotas vencidas ∪ estancados (`fetchAlumnosEstancados`), ordenado por prioridad: dolor alto > dolor moderado > cuota vencida > progreso. Máx. 5; si hay más, link "Ver las {n}". |
| Clases de hoy | `clases` del día del coach, con `reservas` confirmadas / cupo |
| Sin entrenar | Alumnos con último registro de sesión hace > 7 días |

### Componentes y props
- `Segmented` período: `value: "semana" | "mes" | "trimestre"`, default `"mes"`. Cambia el rango de los KPIs, no la lista de alertas.
- 4 × `KpiCard` (§2.10 del sistema). `testId`: `kpi-cobrado`, `kpi-al-dia`, `kpi-sin-rutina`, `kpi-sin-entrenar`. **Conservar `kpi-ingresos` como alias** mientras los tests existentes lo usen (ver `04-frontend.md §6`).
- Lista "Para revisar hoy": cada fila es un `<button>` 56 px de alto con `StatusBadge` + nombre (500) + detalle (13, muted) + tiempo + chevron.
- "Clases de hoy": filas de 40 px; la clase en curso lleva fondo `bg-muted` y badge "Ahora".

### Estados
| Estado | Qué se ve |
|---|---|
| Carga | 4 skeletons de KPI (alto 104), 5 filas skeleton en cada lista |
| KPIs con error | Cada KpiCard muestra "—" y un Tooltip "No se pudo calcular. Reintentar"; el resto de la página funciona |
| Sin alertas | EmptyState compacto: "Nada urgente por hoy." |
| Sin clases hoy | "No hay clases hoy." + link "Ver agenda" |

### Interacciones
| Disparador | Resultado |
|---|---|
| Click en fila de "Para revisar" (dolor) | Abre la ficha del alumno con la isla Salud expandida y el foco en la alerta |
| Click en fila (cuota) | Abre Cobros filtrado por ese alumno |
| Click en fila (progreso) | Abre la ficha con la isla Fuerza expandida |
| "Ver detalle" en KPI Cobrado | Navega a `/studio/ingresos` con el mismo período |
| "Escribirles" | Abre el chat con destinatarios preseleccionados (los 7) |
| Botón de chat flotante | **Se elimina.** El chat vive en el ítem "Mensajes" (móvil) y en la acción "Enviar mensaje" de la ficha. Si el PM decide mantener el FAB, debe ir a `bottom: 24px; right: 24px` y nunca tapar contenido de tabla (dejar `padding-bottom: 88px` en `main`). |

### Responsive
- KPIs: `grid-cols-[repeat(auto-fit,minmax(200px,1fr))]` → 4 / 2 / 1 columnas.
- "Para revisar" (flex 2) y "Clases de hoy" (flex 1) en fila; debajo de 860 px se apilan.

### Criterios
- GIVEN el período "Mes" WHEN se renderiza Inicio THEN el valor de `kpi-cobrado` es idéntico al KPI "Cobrado" de `/studio/cobros` para el mismo mes.
- GIVEN una alerta de dolor PENDIENTE con EVA 7 WHEN se renderiza "Para revisar" THEN aparece primera con badge "Alto".
- GIVEN 0 alertas WHEN se renderiza THEN se ve "Nada urgente por hoy." y no una caja vacía.
- GIVEN Inicio cargado WHEN se busca el texto "Touch targets" THEN no existe en el DOM.

---

## 3. Directorio de alumnos

Vive en Inicio y es la vista de "Alumnos" en el menú. Abierto por defecto si el PM aprueba D5 = A (revierte GOZS-131, hoy colapsado); colapsable, y la elección del coach se recuerda.

### Toolbar (una sola fila; envuelve en pantallas chicas)
`h2 "Alumnos"` · Segmented de estado `[Todos 40] [Al día 32] [Pago pendiente 3] [Nuevos 24]` · botón `outline` punteado "+ Actividad" (filtro por Funcional / Boxeo / Rutina online, abre DropdownMenu con checkboxes) · a la derecha búsqueda "Buscar alumno" (240 px).

Se eliminan de la toolbar: "Vista previa alumno…" (pasa a la ficha), "Ver como Alumno" (pasa al menú de la fila), "Constructor" (está en Rutinas), "Semana 42 / Octubre 2026" (dato sin función) y el checkbox "WhatsApp en acciones" (pasa a preferencia en el menú de cuenta).

### Columnas
| id | Header | Celda | Orden | Oculta bajo |
|---|---|---|---|---|
| `alumno` | Alumno | Avatar 32 + nombre (500) + actividad (12, muted). Es un `<a>` a la ficha. | sí (alfabético) | — |
| `cuota` | Cuota | StatusBadge (§2.2 mapeo Cuota) | sí (vencidas primero) | — |
| `rutina` | Rutina | Nombre de la rutina o StatusBadge "Sin rutina" | — | md |
| `ultimo` | Último entreno | "Hoy", "Ayer", "Hace {n} días" | sí | md |
| `alertas` | Alertas | El StatusBadge más grave del alumno ("Hombro · moderado", "Rodilla · alto", "30 d sin récord", "Récord sentadilla"); "—" si no hay | sí (gravedad) | — |
| `acciones` | (oculto, `sr-only` "Acciones") | Botón `…` con menú: Enviar mensaje, Escribir por WhatsApp, Ver como alumno, Asignar rutina, Registrar pago | — | — |

- `pageSize = 15`. Pie "Mostrando {n} de {total} alumnos".
- Se elimina el botón ⚡ naranja que aparecía solo en algunas filas y desbordaba la tabla: su acción ("Asignar rutina") pasa al menú.

### Interacciones
| Disparador | Resultado |
|---|---|
| Click en nombre o en cualquier celda de la fila salvo `…` | Abre la ficha |
| Segmented de estado | Filtra; actualiza contador del pie; persiste en la URL `?estado=aldia` |
| Escribir en búsqueda | Filtra por nombre o email, debounce 150 ms |
| Header ordenable | Alterna asc/desc; `aria-sort` en el `<th>` |

### Estados
Vacío por filtro: "Ningún alumno coincide con este filtro." + botón "Limpiar filtros". Sin alumnos: EmptyState "Todavía no tenés alumnos" + "Alta de alumno".

### Criterios
- GIVEN 40 alumnos WHEN se carga Inicio THEN el directorio está expandido y muestra 15 filas.
- GIVEN cualquier fila WHEN se inspecciona la columna Cuota THEN contiene texto ("Al día", "Vence en 3 d", "Vencida"), no solo un punto de color.
- GIVEN 1440 px WHEN se carga THEN ninguna celda de acciones sobresale del contenedor de la tabla.

---

## 4. Ficha del alumno · `/studio` con alumno seleccionado

**Archivos actuales:** `student-detail.tsx` (3137), `student-detail/islas/*`.
**Ejemplo:** Lucas Giménez.

```
Alumnos / Lucas Giménez
(LG) Lucas Giménez                                  [▦] [Asignar rutina] [💬 Enviar mensaje] […]
     [Cuota al día] [Dolor en hombro] [Rutina online]  lucas.gimenez@… · alumno desde jul 2026
┌ Últimas sesiones · 21 en total · 2,1 por semana ───────────────────────── ⌄ ┐
│ [20 sep PR│Press de banca│85 kg × 6] [16 sep PR│Sentadilla│100 kg × 6] [13 sep…] → │
└──────────────────────────────────────────────────────────────────────────────┘
┌ Rutina · Hipertrofia Torso-Pierna v2 [Vigente · 10 días] ── ⌄ ┐┌ Salud ───────────── ⌄ ┐
│ [Rutina actual|Historial (3)|Registros (21)]                   ││ ⚠ Dolor moderado · hombro anterior · EVA 5 │
│ (Día 1 · Torso pesado)(Día 2 · Pierna)(Día 3…)(Día 4…)         ││   Press de banca plano, serie 2 · ayer 18:30│
│ Ejercicio │ Series × reps │ Última carga │ Descanso │ RPE │ ⇄ ││   [Pendiente|Atendida|Resuelta]            │
│ Press de banca plano ⚠ │ 4 × 10-8-6 │ 77,5 kg │ 3 min │ 8,5 │ ⇄ ││   [Cambiar ejercicio]                     │
│ …                                                              ││ Nota de intervención [textarea]           │
│ Nota del coach: …                                              ││ Objetivo · Frecuencia · Molestia · Cirugías│
└────────────────────────────────────────────────────────────────┘│ Ver cuestionario inicial completo         │
┌ Fuerza y progreso [2 de 4 en progresión] últimos 2 meses ── ⌄ ┐└────────────────────────────────────────────┘
│ 1RM estimado · Peso muerto  138 kg  (Fórmula Epley · ver detalle)││ Actividad ─────────────────────── ⌄ ┐
│ Peso corporal 82 → 78 kg  [sparkline]                         ││ ● Sesión registrada · Hoy 10:30    │
│ Sentadilla trasera   85 → 120 kg  [↑ 41%]                     ││ ● Pago acreditado · Ayer …         │
│ Press de banca       70 → 60 kg   [↓ 14%]                     │└────────────────────────────────────┘
└────────────────────────────────────────────────────────────────┘┌ Membresía ─────────────────────── ⌄ ┐
                                                                  │ Pase libre · Funcional + Boxeo $40.000│
                                                                  │ Pagado el 1 nov… vence 26 nov        │
                                                                  │ [Registrar pago] Historial           │
                                                                  └──────────────────────────────────────┘
          columna principal: flex 2 1 560px                          riel: flex 1 1 320px
```

### 4.1 Cabecera
| Elemento | Especificación |
|---|---|
| Breadcrumb | `nav aria-label="Ruta"`: "Alumnos" (link, vuelve al directorio conservando filtros) / nombre. Reemplaza el botón "← Volver". |
| Avatar | 48 px, iniciales |
| Nombre | H1 22/600 |
| Badges | Cuota (§2.2), **dolor activo más grave** (si existe: "Dolor en {zona}" con tone según EVA), actividad (neutral). Se quita "Salud: 86.5/100". |
| Meta | email · "alumno desde {mes año}" |
| Acciones (derecha, en este orden) | 1) Ícono "Personalizar" (`Button size=icon variant=outline`, `aria-pressed`). 2) "Asignar rutina" (`outline`). 3) "Enviar mensaje" (`default`, la única primaria). 4) `…` con: Escribir por WhatsApp, Ver como alumno, Historial de cargas, separador, Editar datos del alumno. |

### 4.2 Layout por defecto y Personalizar
- Default (`DEFAULT_CANVAS_ROWS` v2, usando el modelo de filas existente):
```ts
[
  { id: "row-sesiones", items: ["timeline"] },
  { id: "row-1", items: ["routine_workbench", "salud_anamnesis"], widths: { routine_workbench: 2, salud_anamnesis: 1 } },
  { id: "row-2", items: ["metricas_1rm", "activity_feed"],      widths: { metricas_1rm: 2, activity_feed: 1 } },
  { id: "row-3", items: ["administracion"] },
]
```
  Si el modelo de filas no puede reproducir un riel continuo, esta aproximación por filas es aceptable para v1; el PDF muestra el ideal (riel continuo) como objetivo.
- Clave de persistencia: `gozster_canvas_layout_v2_${coachIdLogueado}` (hoy usa `alumno.entrenador_id`). Al leer, si no existe v2, usar el default; **ignorar** la clave vieja.
- Personalizar (on): banda bajo la cabecera con "Arrastrá desde el asa para reordenar. El orden se guarda para todas tus fichas." + "Restablecer" (`outline`) + "Listo" (`default`). Las islas muestran borde punteado y asa. Teclado: con foco en el asa, Espacio toma la isla, flechas la mueven, Espacio suelta, Escape cancela; anunciar con `aria-live="polite"` ("Salud movida a la fila 2, posición 2").
- Personalizar (off): sin asas, sin flechas, sin banda.
- Colapsar: cada isla tiene un único chevron. El estado colapsado se guarda junto con el layout.
- Por debajo de 960 px el layout es siempre una columna en este orden: Salud (si hay dolor activo), Sesiones, Rutina, Fuerza, Actividad, Membresía.

### 4.3 Isla "Últimas sesiones" (`timeline`)
- Meta: "{total} en total · {frecuencia} por semana" (1 decimal con coma).
- Tarjetas de 150 px en scroll horizontal: fecha "20 sep" (12, muted), "PR" en `success-soft-foreground` si hubo récord, ejercicio principal (500), top set en mono "85 kg × 6". Máx. 12; la última es "Ver todas".
- Se quitan: duración "60m" y "3 series" (ruido) — disponibles en "Registros".
- Click en tarjeta: abre la pestaña "Registros" de la isla Rutina en esa fecha.

### 4.4 Isla "Rutina" (`routine_workbench`)
- Header: "Rutina" · nombre del plan · StatusBadge de vigencia.
- Tabs: "Rutina actual", "Historial ({n})", "Registros ({n})".
- Chips de día (pill, activo `bg-primary text-primary-foreground`).
- Tabla: Ejercicio (nombre 500 + nota 12) · Series × reps · Última carga · Descanso · RPE · botón `⇄` (`aria-label="Cambiar {ejercicio}"`, abre el modal Quick Swap existente con el título "Cambiar ejercicio").
- Fila con dolor activo sobre ese ejercicio: fondo `warning-soft` y nota "Dolor de hombro activo · {nota}".
- Superseries: barra vertical de 2 px `bg-primary` a la izquierda de las filas agrupadas + etiqueta "Superserie A".
- Pie: "Nota del coach: {texto}".
- Vacío real (plan sin días): EmptyState "Esta rutina no tiene días cargados." + "Editar rutina". **No** mostrar "Sin días configurados" si hay días en la base (bug FE-02).
- Sin rutina: EmptyState "Lucas no tiene rutina asignada." + "Asignar rutina".

### 4.5 Isla "Fuerza y progreso" (`metricas_1rm`)
- Badge derivado: "{n} de {m} en progresión" con tone success si n = m, warning si 0 < n < m, danger si n = 0. Fuente: BE-03.
- Izquierda: "1RM estimado · {ejercicio}" + valor 32/600 + "Fórmula Epley · ver detalle" (Tooltip con la fórmula y el set usado). **Un solo valor**; Brzycki solo dentro del Tooltip.
- Debajo: "Peso corporal · {inicial} → {actual} kg" + sparkline 48 px (`role="img"` con `aria-label` que lista los valores).
- Derecha: lista de ejercicios clave: nombre · "inicio → actual kg" (mono) · StatusBadge "↑ 41%" / "↓ 14%".
- El heatmap de adherencia de 52 semanas pasa a "Registros"; si se mantiene, mostrar solo desde la primera sesión del alumno.

### 4.6 Isla "Salud" (`salud_anamnesis`)
- Orden: Alert de dolor activo → nota de intervención → resumen de anamnesis → link al cuestionario.
- **Alert** (`tone="warning"` para EVA 4–6, `danger` para EVA ≥ 7 o síntoma de alarma):
  - Título: "Dolor {leve|moderado|alto} · {zona} · EVA {n}".
  - Descripción: "{ejercicio}, serie {n} · {cuándo}".
  - Segmented de estado: "Pendiente" / "Atendida" / "Resuelta" (`aria-pressed`). Cambiar llama a `actualizarEstadoDolor` (BE-02). Optimista con rollback y toast "No se pudo guardar. Reintentá." si falla.
  - Botón "Cambiar ejercicio" (`default`) → Quick Swap con el ejercicio preseleccionado.
  - Si hay más de un dolor activo: uno debajo del otro, el más grave primero.
- **Nota de intervención:** `<label>` "Nota de intervención" + textarea + ayuda "Se guarda al salir del campo." Guarda en `notas_profesor` del caso; muestra "Guardado" 2 s tras éxito.
- **Anamnesis:** grilla 2 × 2 (Objetivo, Frecuencia, Molestia previa, Cirugías).
- Se elimina el bloque duplicado "Reporte de molestia en ejercicio" con su propio Pendiente/Atendido: es el mismo evento.
- Sin dolor activo: línea "Sin dolores activos." en muted + historial colapsado "Ver {n} reportes anteriores".

### 4.7 Isla "Actividad" (`activity_feed`)
- Lista ordenada, sin acordeones por fecha. Cada ítem: punto 8 px (color por tipo: sesión `foreground`, pago `success`, dolor `warning`, resto `muted-foreground`) + título 13/500 + detalle 12 + tiempo relativo.
- Tipos y títulos: "Sesión registrada", "Mensaje", "Pago acreditado", "Ejercicio cambiado", "Reportó dolor", "Rutina asignada".
- Máx. 8 + "Ver toda la actividad".

### 4.8 Isla "Membresía" (`administracion`)
- Plan + monto (mono) en una fila; "Pagado el {fecha} por {medio} · vence {fecha}" o StatusBadge de cuota si no está al día.
- Botones: "Registrar pago" (`outline`, abre el Sheet de §5) y "Historial" (link a Cobros filtrado).
- Las pestañas actuales "Contratación & Renovación", "Staff & Chat", "Nivel de Vista & Anamnesis" pasan a "Editar datos del alumno" (menú `…` de la cabecera), que abre un Sheet con esas secciones.

### 4.9 Criterios
- GIVEN un alumno con alerta de dolor PENDIENTE WHEN se abre la ficha THEN el badge de cabecera, el Alert de Salud, la fila de la tabla de rutina y la bandeja de Inicio muestran la misma severidad y el mismo estado.
- GIVEN un alumno sin dolores activos WHEN se abre la ficha THEN no aparece ningún badge de dolor y Salud dice "Sin dolores activos.".
- GIVEN un plan con 4 días en la base WHEN se abre la ficha THEN la isla Rutina muestra 4 chips de día.
- GIVEN 2 de 4 ejercicios con delta negativo WHEN se abre la ficha THEN el badge dice "2 de 4 en progresión" con tone warning.
- GIVEN Personalizar apagado WHEN se inspecciona la ficha THEN no hay asas ni flechas de mover visibles.
- GIVEN un layout guardado con la clave vieja WHEN se abre la ficha THEN se usa el default v2.
- GIVEN 1440 × 900 WHEN se abre la ficha con todas las islas expandidas THEN la altura total es ≤ 2.300 px.
- GIVEN Personalizar encendido WHEN se mueve una isla solo con teclado THEN cambia de posición y se anuncia el cambio.

---

## 5. Cobros · `/studio/cobros`

**Archivo actual:** `cobros-panel.tsx` (1750), `use-cobros-store.ts`, `historial-cobros-drawer.tsx`.

```
Cobros                                              [Planes y precios] [Registrar pago]
Noviembre 2026 · recibos internos, no fiscales.
┌ Cobrado ──┐┌ Por cobrar ┐┌ Vencido ──┐┌ Tasa de cobro ┐
│ $767.000  ││ $105.000   ││ $235.000  ││ 69%           │
│ 25 pagos… ││ 4 cuotas…  ││ 7 alumnos…││ $767.000 de…  │
└───────────┘└────────────┘└───────────┘└───────────────┘
┌ [🔍 Buscar alumno o servicio] [Todos 36][Vencidos 7][Por vencer 4][Pagados 25]   [Columnas] ┐
│ Alumno │ Plan │ Vence ⇅ │ Monto │ Estado │ Último pago │ [Registrar pago|Ver recibo] […] │
│ …                                                                                         │
│ Vencidos primero · 15 de 36                                     [Anterior] [Siguiente]    │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

### Datos
KPIs desde `obtenerKpisNegocio` del mes (definiciones en `03-backend.md §1`). **"Tasa de cobro" = cobrado / facturado en pesos**, y el subtítulo lo dice ("$767.000 de $1.107.000 facturados"). Subtítulos de los otros KPIs: Cobrado "{pagosCant} pagos este mes", Por cobrar "{cant} cuotas por vencer", Vencido "{cant} alumnos con cuota vencida". La lista desde `contrataciones` + último `pago`. Si el rol no puede ver montos (`puedeVerMontos`), la fila de KPIs se reemplaza por "Al día / Por vencer / Vencidos" en cantidades.

### Columnas
Alumno (nombre + email) · Plan (nombre; si hay descuento, "Pase libre −20%") · Vence (fecha + relativo "hace 9 días" / "en 3 días") · Monto (mono, alineado a la derecha; con descuento, el original tachado en una segunda línea) · Estado (StatusBadge) · Último pago ("Transferencia · 5 nov" o "Sin pagos") · Acciones.

Acción primaria por fila según estado: Vencido/Pendiente → "Registrar pago" (`default`, sm); Pagado → "Ver recibo" (`outline`, sm). Menú `…`: Historial de pagos, Cambiar plan, Aplicar descuento, Enviar recordatorio, separador, Dar de baja (destructivo).

Orden por defecto: Vencido (más antiguo primero) → Pendiente (más cercano primero) → Pagado.

### Sheet "Registrar pago"
| Campo | Tipo | Validación |
|---|---|---|
| Alumno | precargado si viene de la fila; si viene del botón global, `<select>` buscable | requerido |
| Monto | input numérico con prefijo $ | > 0; precargado con el monto del plan |
| Medio | radiogroup: Transferencia / Efectivo / Mercado Pago | requerido |
| Fecha | date, default hoy | ≤ hoy |
| Nota | textarea opcional | ≤ 280 caracteres |

Footer: "Cancelar" + "Guardar y enviar recibo". Al guardar: cierra, toast "Pago registrado", la fila pasa a Pagado y los KPIs se recalculan. Error: mensaje bajo el botón, el Sheet no se cierra.

### Criterios
- GIVEN 36 contratos WHEN se carga Cobros THEN se ven 15 filas y la paginación.
- GIVEN un pago registrado desde el Sheet WHEN se vuelve a Inicio THEN `kpi-cobrado` aumentó exactamente el monto pagado.
- GIVEN el filtro "Vencidos" WHEN se aplica THEN todas las filas tienen badge "Vencido" y la acción "Registrar pago".

---

## 6. Agenda · `/studio/agenda`

**Archivo actual:** `class-agenda.tsx` (1783).

```
Noviembre 2026                     [Todos los coaches ▾] [‹ Hoy ›] [Día|Semana|Mes] [Nueva clase]
Semana 45 · 2 al 8 de noviembre
┌──────┬ LUN 2 ┬ MAR 3 ┬ MIÉ 4 ┬ (JUE 5) ┬ VIE 6 ┬ SÁB 7 ┬ DOM 8 ┐ ┌ Funcional · 18:00 [Ahora] ┐
│17:00 │       │Func 5 │       │ Func 1  │       │       │       │ │ jueves 5 de nov · 60 min · cupo libre │
│18:00 │Func 0 │Func 0 │Func 5 │[Func 0] │~~Func~~│      │       │ │ [Anotar alumno][Cargar récords][…]  │
│19:00 │Box 2  │       │Box 0  │         │ Box 1 │       │       │ │ Anotados (0)                         │
│20:00 │       │       │       │         │       │       │       │ │ [Nadie anotado todavía…]             │
└──────┴───────┴───────┴───────┴─────────┴───────┴───────┴───────┘ │ Ajustes: [Duración][Mover][Cupo]    │
Mostrando 17:00 a 21:00 · las horas sin clases se ocultan.          │ Cancelar clase                       │
                                                                    └──────────────────────────────────────┘
```

### Especificación
- Rango horario automático: desde la primera hasta la última clase de la semana, ± 1 h. Se elimina la franja "+10 h / sin clases".
- Hora en mono 12. Día actual: número en círculo `bg-primary`.
- Bloque de clase (`<button>`): nombre 13/500 + "{hora} · {n} anotados". Colores: Funcional `act-funcional`, Boxeo `act-boxeo`, cancelada borde punteado + nombre tachado + "Cancelada". Seleccionada: `bg-primary text-primary-foreground`, `aria-pressed="true"`.
- Panel de detalle a la derecha (flex 1 1 320px), no a media columna debajo. En < 1024 px se abre como Sheet.
- Selector de coach: `<select>` "Todos los coaches" (reemplaza el chip "Coach Lucía Ferraro").
- Acciones del panel: "Anotar alumno" (`default`), "Cargar récords" (`outline`, va a Ranking con la clase preseleccionada), `…` (Duplicar, Editar recurrencia, Cancelar clase).
- Ajustes: tres botones `outline sm` que abren Popovers: Duración (45/60/90), Mover horario (time input), Cupo (número o "Sin límite").
- "Cancelar clase": `link` destructivo; abre Dialog de confirmación "¿Cancelar Funcional del jueves 5 a las 18:00? Se avisará a {n} anotados." con "Volver" y "Cancelar clase".

### Criterios
- GIVEN una semana con clases solo entre 17 y 20 h WHEN se renderiza THEN la grilla muestra 17:00 a 21:00 sin franjas vacías.
- GIVEN click en un bloque WHEN se selecciona THEN el panel muestra esa clase y el foco va al título del panel.
- GIVEN una clase cancelada WHEN se renderiza THEN dice "Cancelada" en texto, no solo tachado.

---

## 7. Rutinas · `/studio/rutinas`

**Archivo actual:** `rutinas-library.tsx` (432), `routine-builder/routine-builder-modal.tsx`.

- Header: "Rutinas" + "Plantillas reutilizables y rutinas asignadas a cada alumno." + "Nueva rutina" (`default`, tamaño normal; hoy es un CTA gigante).
- Una sola barra: Segmented de colección `[De alumnos 14] [Plantillas 0] [Borradores 0] [Archivadas 0]` · búsqueda "Buscar por nombre o alumno" · `<select>` "Todos los objetivos" (Fuerza, Hipertrofia, Rehabilitación, Potencia, Peso corporal). Reemplaza la doble capa de tabs + chips.
- **Pestaña inicial:** la primera con contenido (hoy "De alumnos"). Persistir la última elegida en la URL.
- Grilla `repeat(auto-fill, minmax(260px,1fr))` de cards: nombre 15/600, alumno 13 muted, `…` (Editar, Duplicar, Guardar como plantilla, Asignar a otro alumno, Archivar), badges objetivo (neutral) + vigencia, pie "{n} días · {n} ejercicios · actualizada hace {t}".
- Vacío de Plantillas: EmptyState "Todavía no tenés plantillas" + "Guardá una rutina de alumno como plantilla para reutilizarla, o empezá una desde cero." + "Ver rutinas de alumnos" / "Crear plantilla".
- "Constructor Visual" deja de ser una pestaña: "Nueva rutina" y "Editar" abren el constructor existente a pantalla completa. Dentro del constructor: quitar "(Coach Studio)" del título, quitar el emoji, y el pie queda "Cancelar" · Estado `<select>` · "Guardar como nueva" (`outline`) · "Guardar" (`default`).

Criterios: GIVEN 14 rutinas de alumnos y 0 plantillas WHEN se abre Rutinas THEN la pestaña activa es "De alumnos".

---

## 8. Ranking · `/studio/ranking-funcional`

**Archivo actual:** `ranking-funcional.tsx` (1027).

- Header: "Ranking funcional" + "Cargá el récord de cada alumno; el ranking compara kg levantados por kg de peso corporal."
- Fila de selección: `<label>` Clase (`<select>`) · `<label>` Ejercicio (`<select>`) · "Sumar alumno" (`outline`). Reemplaza las dos cards "1. Clase seleccionada" / "2. Ejercicio de prueba".
- Tabla "Participantes" con meta "{n} de {total} con récord cargado": Alumno · Categoría (`<select>` Masculino/Femenino, precargado de `perfiles.sexo`) · Peso corporal (input kg, precargado de `perfiles.peso`) · Carga (kg) · Reps · **un** botón por fila: "Guardar" (`default`) → "Guardado" (`success-soft`). Guarda peso y récord juntos. Se elimina el segundo "Guardar" de peso.
- Botón deshabilitado solo si falta carga o reps; en ese caso Tooltip "Completá carga y reps".
- Rankings: dos cards neutras lado a lado ("Masculino" / "Femenino", meta "{n} con récord"). Fila: posición (mono) · nombre · "{kg} kg × {reps}" · ratio "0,26×" (mono 600). Vacío: "Guardá un récord para que aparezca acá."
- Se eliminan los colores rosa/celeste por género.

Criterios: GIVEN una fila con peso, carga y reps WHEN se pulsa "Guardar" THEN aparece en la tabla de su categoría ordenada por ratio y el botón dice "Guardado".

---

## 9. Coach Studio móvil (390 px)

- Topbar 56: logo 28 + nombre de página + Buscar (44 × 44) + Notificaciones (44 × 44, punto rojo si hay pendientes, `aria-label="Notificaciones, {n} sin leer"`).
- **Barra inferior** fija 64 px, 5 ítems: Inicio, Alumnos, Agenda, Mensajes, Más. Ícono 20 + etiqueta 11. Activo: `foreground` 600; resto `muted-foreground`. "Más" abre Sheet inferior con Rutinas, Ranking, Cobros, Métricas, Vista del alumno, Documentación, Tema, Cerrar sesión.
- Se elimina la grilla de 8 botones de navegación que hoy ocupa 290 px y el botón flotante de chat.
- Inicio: saludo, KPIs en 2 × 2 (valor 20/600), "Para revisar hoy" (filas `<a>` 44 px mín.), "Clases de hoy".
- Tablas (directorio, cobros) en móvil: cada fila se vuelve una card de 2 líneas (nombre + badge / meta + acción).
- Ficha en móvil: una columna, orden de §4.2.

Criterios: GIVEN 390 × 844 WHEN se carga `/studio` THEN el primer KPI está visible sin scroll y no hay scroll horizontal.

---

## 10. Métricas e Ingresos

No se rediseñan visualmente en esta etapa; se corrigen datos y copy.

**Métricas (`/studio/dashboard`, `coach-dashboard-view.tsx`, `retention-kpi-cards.tsx`, `progressive-overload-feed.tsx`):**
- "Alumnos activos" usa la misma definición y fuente que Inicio (BE-01).
- Si el feed de sobrecarga no tiene datos, ocultar los 4 filtros y mostrar EmptyState "Todavía no hay progresiones registradas. Aparecen cuando un alumno supera su carga anterior."
- "Asignar Urgente →" → "Asignar rutina". Se quita el emoji de "Ver Directorio de Atletas" → "Ver alumnos".

**Ingresos (`/studio/ingresos`, `studio-sankey-view.tsx`):**
- Deja de usar `CANONICAL_SANKEY_DATA`; recibe datos de `obtenerKpisNegocio` con desglose por canal (BE-01).
- Nodos con tokens claros: Presencial `act-funcional-bg/fg`, Online `neutral-soft`, Cobrado `success-soft`, Por cobrar `warning-soft`. Sin azul/violeta saturado.
- Debajo del diagrama, tabla equivalente (Canal · Facturado · Cobrado · Por cobrar) para lectura accesible.
- "Facturación Potencial" → "Facturado".

---

## 11. Fuera de alcance (anotado para próxima épica)

| Vista | Observación |
|---|---|
| Athlete App `/athlete/*` | Solo FE-01 (crash). Onboarding se ve bien. |
| Documentación | 7.900 px de alto en una página; necesita índice lateral. |
| Login | La espera de red no termina (`networkidle` no se alcanza en 120 s con el stub); revisar polling. |
| Chat | Rediseño completo pendiente; en esta etapa solo quitar IDs truncados. |
