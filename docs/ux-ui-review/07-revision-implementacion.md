# 07 · Revisión de la implementación del handoff

> **Para:** `@PM-GOZster` → reparte a `@frontend-eng`, `@backend-eng`, `@qa-eng`
> **Qué se revisó:** `main` de `Fresias/gozster` (zip del 6 nov 2026) contra los documentos 00–06 de este handoff.
> **Cómo:** diff contra `feature/student-detail-canvas-islas`, gate completo y la app levantada con `tests/e2e/supabase-stub.mjs` (que es un perfil **en vivo** con 15 alumnos, no el dataset demo). Recorrí Inicio, ficha, Cobros, Ingresos, Métricas, Agenda, Rutinas, Ranking, móvil 390 px y `/athlete`, y medí contraste, nombres accesibles y elementos clickeables sin foco.

---

## 1. Veredicto

**No se puede cerrar la épica todavía.** Backend, primitivas y shell quedaron bien. Pero la ficha del alumno muestra **datos clínicos y de pago inventados** a cualquier alumno que no tenga esos datos cargados, y los KPIs siguen sin coincidir entre pantallas en cuanto hay datos reales. Las dos cosas que el handoff buscaba arreglar (coherencia y una ficha que no se contradiga) empeoraron para alumnos reales.

| Gate | Resultado |
|---|---|
| `typecheck` | ✅ |
| `lint` | ✅ |
| `build` | ✅ |
| `test` | 3108 / 3112. Los 4 que fallan necesitan Supabase en vivo o el hook de git (`harness-kit/tests/surface.spec.ts`); no son regresiones de este trabajo. |
| Dependencias nuevas | ✅ ninguna (D2 = A respetada) |

---

## 2. Estado por issue

| Issue | Estado | Evidencia |
|---|---|---|
| BE-01 KPIs fuente única | 🟡 Backend ✅, sin conectar | RPC v2 con tests PGlite ✅. Pero `/studio/cobros` renderiza `<CobrosPanel />` sin `kpis` y sigue usando `metricas()` del store; `/studio/ingresos` renderiza `<StudioSankeyView />` sin `kpis` y usa siempre `DEMO_KPIS_NEGOCIO`. |
| BE-02 Dolor unificado | 🟡 Backend ✅, sin consumir | Migración, vista `v_dolor_activo`, RPC y triggers ✅ con PGlite. **Nadie lee `v_dolor_activo`** en la app (no existe `fetchDolorActivo`). |
| BE-03 Progresión | 🟡 | `calcularProgresion` ✅, pero la isla cae a datos fijos cuando no hay historial (ver P0-1). |
| FE-01 `/athlete` | ✅ | Renderiza sin `pageerror`; `error.tsx` en athlete y studio. |
| FE-02 planes/días | ✅ | La rutina muestra 4 días. |
| FE-03 Tokens | ✅ con 1 ajuste | Geist, radios 8/12, `*-soft` ✅. `--muted-foreground` da 4,49:1 sobre el sidebar y 4,29:1 sobre `muted` (ver P2-3). |
| FE-04 Primitivas | ✅ | Sheet sobre `<dialog>`, foco inicial en el primer campo, Escape cierra. Íconos SVG inline. |
| FE-05 Copy e íconos | 🟡 | Se fue la jerga más grave. Quedan sidebar, títulos de islas y emojis (P2-1). |
| FE-06 Shell | ✅ | Sidebar agrupado, ⌘K, un solo "Cerrar sesión" en el menú de cuenta, barra inferior móvil. |
| FE-07 Inicio | ❌ | KPI "32 de 15"; Cobrado "—"; bandeja vieja **y** "Para revisar hoy" a la vez; alertas de demo (P1-1, P1-2). |
| FE-08 Directorio | ✅ | Abierto con 15 filas y estado recordado. |
| FE-09 Ficha layout | ❌ | A 1440 px todas las islas quedan en una columna (x = 312, ancho 1032–1096). Cabecera con 9 acciones y emojis (P1-4). |
| FE-10 Salud | ❌ | Lee `DEMO_CRITICAL_ALERTS` y deduce EVA con un regex (P0-3). |
| FE-11 Islas | ❌ | Datos inventados en Fuerza, Actividad y Membresía (P0-1). |
| FE-12 Cobros | 🟡 | Tabla y Sheet de pago muy bien. KPIs desde otra fuente; 3 acciones por fila. |
| FE-13 Agenda | ✅ | Rango dinámico, Sheet y Dialog de cancelación. |
| FE-14 Rutinas + Ranking | ✅ con detalles | Un solo "Guardar" por fila ✅. Emojis 🏆 🥇 y banner rosa de bajo contraste. |
| FE-15 Ingresos + Métricas | ❌ | Ingresos siempre en demo; además fabrica el desglose presencial/online (`cobrado * 0.65`). |
| QA-01 Coherencia | ❌ | Los tests comparan un seed contra sí mismo o corren solo en modo demo; no detectan lo que se ve con datos en vivo (P1-5). |
| QA-02 Regresión visual | ✅ | Capturas en `docs/qa/demo-evidencia/*`. |
| QA-03 Accesibilidad | 🟡 | Hay spec, pero en Inicio quedan 149 elementos clickeables que no reciben foco. |

---

## 3. P0 · Bloquean el cierre (riesgo clínico o de datos)

### P0-1 · Los datos de ejemplo del mockup quedaron como valores por defecto en producción
Los textos de ejemplo del canvas se usaron como *fallback*. Cualquier alumno sin esos datos los "hereda". Lo verifiqué con Fernando Rosales (alumno real del stub, **0 sesiones, "Nunca entrenó"**): su ficha muestra "4 de 4 en progresión · Sobrecarga verificada", press de banca 80 → 95 kg, peso corporal 82 → 78 kg, y una anamnesis con "Cirugías: Ninguna".

| Archivo · línea | Valor inventado que se muestra |
|---|---|
| `islas/isla-salud-anamnesis.tsx:570-594` | Objetivo "Hipertrofia & Fuerza", Frecuencia "4 días / semana", Molestia previa "Hombro anterior", **Cirugías "Ninguna"**. `student-detail.tsx` nunca pasa `anamnesisData`, así que **todos** los alumnos ven estos valores. |
| `islas/isla-salud-anamnesis.tsx:181, 188, 193` | Zona "Hombro anterior", ejercicio "Press de banca plano, serie 2", fecha "ayer 18:30" |
| `islas/isla-metricas-1rm.tsx:~279` (`"Press de Banca Plano": { inicio: 80, actual: 95 }`), `:148`, `:339-342` | Progresión y peso corporal fijos cuando no hay series |
| `islas/isla-activity-feed.tsx:53` (`DEFAULT_FEED_ITEMS`), `:107` | Feed fijo ("Sesión registrada", "Pago acreditado", "Reportó dolor · Hombro anterior · EVA 5"). `student-detail.tsx` no pasa `items`. |
| `islas/isla-administrativa.tsx:88, 94, 104`; `student-detail.tsx:2747-2756` | "Pase libre · Funcional + Boxeo", "$40.000", "vence 26 nov", "**Pagado por transferencia**" (fijo aunque el medio haya sido otro) |
| `islas/isla-routine-workbench.tsx:226` | Nombre "Lucas Giménez" si falta el del alumno |

**Corrección:** ningún componente de producción puede tener datos de ejemplo como valor por defecto. Si falta el dato, se muestra un estado vacío que lo diga ("Sin anamnesis cargada", "Todavía no hay series para calcular progresión", "Sin contratación activa"). Los datos demo viven solo en `src/services/coach-demo-*`.

### P0-2 · Una nota de ejemplo se escribe en la ficha clínica real
`isla-salud-anamnesis.tsx:118-120` inicializa la nota con "28 oct: agarre neutro y Landmine Press 3x10 25 kg…". `handleEstadoChange` (≈ línea 231) envía `nota: coachLog` a `actualizar_estado_dolor`, y la RPC la **concatena** a `notas_profesor`. Resultado: cambiar el estado de un dolor guarda esa nota falsa en el registro del alumno, y cada cambio de estado vuelve a concatenar la nota completa.

**Corrección:** nota inicial vacía (o la `notas_profesor` real); enviar `nota` solo cuando el coach escribió algo nuevo desde el último guardado; un único mecanismo de guardado. Hoy conviven "Se guarda al salir del campo", "Se guarda automáticamente al escribir o salir" y el botón "Guardar registro en la ficha", y la nota se guarda solo en `localStorage`.

### P0-3 · La isla Salud no lee el modelo nuevo de dolor
- `student-detail.tsx:202-210`: `chatActivePainAlert` se busca **solo** en `DEMO_CRITICAL_ALERTS`. Un alumno real con un caso en `alumno_historial_dolor` ve "Sin dolores activos".
- `student-detail.tsx:2699-2703`: el EVA se deduce con `/agudo/i.test(detalle) ? 8 : 5`. Un EVA 3 o 7 real nunca se muestra.
- `reporteId` recibe ids de demo ("alert-demo-dolor-1") o `reporte-${alumnoId}`; la RPC espera el `id` de `alumno_historial_dolor`, así que el cambio de estado falla.

**Corrección:** crear `fetchDolorActivo(client, alumnoId?)` sobre `v_dolor_activo` (contrato en `03-backend.md §2`), pasar el resultado como `dolorActivo` a la isla, a la cabecera, a la fila de la rutina y a "Para revisar hoy", y borrar la deducción por regex.

### P0-4 · El flujo viejo escribe un estado que la base ahora rechaza
`critical-alerts-data.ts:503-529` (`persistAlertEstado`) escribe `estado: 'CERRADO'` en `alumno_historial_dolor`, y el CHECK nuevo solo admite `PENDIENTE/ATENDIDO/RESUELTO`. El error se traga en `Promise.allSettled`. Al mismo tiempo escribe `alertas_entrenador` directo, así que la alerta queda "cerrada" y el caso sigue "pendiente": es exactamente la divergencia que BE-02 tenía que eliminar. Lo usan `student-pain-alerts.tsx` y la bandeja vieja.

**Corrección:** que `persistAlertEstado` llame a `actualizarEstadoDolor`; quitar `CERRADO` de `AlertaEstado`; no escribir `alertas_entrenador` desde el cliente para alertas de dolor (lo espeja el trigger).

---

## 4. P1 · Deben resolverse antes de cerrar la épica

### P1-1 · Inicio mezcla números de demo con datos en vivo
Captura con el stub: **"Alumnos al día: 32 de 15"**. El 32 sale de `derivarKpisNegocio(DEMO_GIMNASIO)` y el 15 de los alumnos reales. Pasa porque `coach-studio-view.tsx:387-428` cae a los KPIs de demo cuando la RPC falla, también en modo en vivo. Con datos reales, cualquier error de red muestra números inventados como si fueran ciertos.
**Corrección:** en modo en vivo, si la RPC falla, cada KPI muestra "—" con "No se pudo calcular · Reintentar" (`02-vistas.md §2`, estados). El fallback demo solo aplica cuando `!isLiveDatabase && !hasInitialData`.

### P1-2 · Los KPIs siguen sin coincidir y los permisos se aplican en una sola pantalla
Para el mismo usuario y el mismo mes:

| | Inicio | Cobros | Ingresos | Métricas |
|---|---|---|---|---|
| Cobrado | **—** (oculto por rol) | **$767.000** | **$800.000** | — |
| Vencidos | "6 cuotas en mora" | 7 | — | — |
| Al día | 32 (de 15) | 29 | — | 32 |

- Cobros e Ingresos no reciben `kpis` (ver BE-01 arriba). Hay que obtener `KpisNegocio` en esas páginas (server component o hook compartido `useKpisNegocio(periodo)`) y pasarlo.
- `puedeVerMontos` se aplica en Inicio pero no en Cobros ni en Ingresos: un usuario al que Inicio le oculta el monto lo ve en las otras dos. Hay que decidir la regla una vez y aplicarla en las tres.
- `studio-sankey-view.tsx:126` inventa el desglose (`ingresos_presencial ?? cobrado * 0.65`) y `:144` usa `|| 6` morosos. Usar `porCanal` de la RPC o no mostrar el desglose.

### P1-3 · "Para revisar hoy" duplica la bandeja y usa datos de demo
- `coach-studio-view.tsx:1210-1216` sigue mostrando `CriticalAlertsInbox` ("Bandeja de alertas críticas") y en `:1250` agrega `ParaRevisarHoy`: las mismas 5 alertas aparecen dos veces.
- `ParaRevisarHoy` se usa sin `molestias`, así que siempre lee `getDemoCriticalAlerts()`, que **agrega las alertas demo a las reales** (`critical-alerts-data.ts:494-497`). Además inventa el EVA por posición: `idx === 1 ? 7 : 5` (`para-revisar-hoy.tsx:80`). Por eso Lucas figura con EVA 7 en Inicio.
- Las filas son `<div onClick>`: no se alcanzan con teclado. Hacer click en una alerta de un alumno demo no abre nada.
- 12 ítems sin tope (spec: máximo 5 + "Ver las {n}"). Las cuotas vencidas usan tono `warning` (spec: `danger`) y abren la ficha en lugar de Cobros.
- `nivelDesdeEva(eva)` ignora el síntoma de alarma: un caso EVA 2 con red flag se muestra "Leve" mientras la base lo marca `CRITICA`. La vista `v_dolor_activo.nivel` tiene el mismo problema. Spec: alarma ⇒ "alto".

### P1-4 · La ficha no aplica el layout ni la cabecera
- **Layout:** a 1440 × 900 todas las islas quedan en una columna; la ficha mide ~3.700 px (criterio: ≤ 2.300). El modelo `layoutColumns` (izquierda/derecha) está bien pensado, pero el contenedor no renderiza las dos columnas.
- **Clave de layout:** sigue usando `alumno.entrenador_id` (`student-detail.tsx:736`) en lugar del coach logueado.
- **Asas y flechas** (⠿ ⬅️ ⬆️ ⬇️) visibles con Personalizar apagado.
- **Cabecera:** "← Volver", "Salud: 86.5/100", "Cargas Históricas", "👁️ Ver como Alumno", "Personalizar", "Configurar Islas 6/6", "📱 WhatsApp", "Asignar rutina", "💬 Enviar mensaje", "⋯". El spec pide breadcrumb + Personalizar (ícono) + Asignar rutina + Enviar mensaje + `⋯` con el resto, y sin el puntaje de salud.
- **Fuerza** sigue mostrando Epley **y** Brzycki con valores distintos, y el título "Telemetría de fuerza & sobrecarga".

### P1-5 · Los tests de coherencia no pueden fallar por lo que realmente falla
- `src/__tests__/coherencia-datos.spec.ts` arma un seed y compara cifras del seed entre sí (y todavía usa `CERRADO` en C6).
- `tests/e2e/coherencia-datos.e2e.ts` corre en modo demo, donde todas las vistas leen el mismo `DEMO_*`. Con el stub en vivo esos mismos casos fallan (los números de arriba).
- Faltan: un e2e de coherencia **con fixtures en vivo** del stub (`PUT /__e2e/fixtures`), un test de render "alumno sin datos" para cada isla y un guard que falle si aparecen strings del mockup en `src/components` (ver FIX-08).

Esto es una falla de Selection nivel 2 (Conformance) que pasó la revisión: los criterios tienen test, pero el test no ejercita el comportamiento.

---

## 5. P2 · Pulido pendiente

1. **Copy y emojis.** Sidebar: "Rutinas & Constructor", "Agenda de Clases", "Ranking Funcional", "Cobros & Pagos", "Métricas & Retención", "Vista Atleta (PWA)", "Colapsar Menú". Inicio: "Coach Studio / Gestión operativa de atletas…" (spec: "Hola, {nombre}" + resumen del día). Islas: "Clínica, Anamnesis & Red Flags", "Telemetría de Fuerza & Sobrecarga". Emojis: Cobros 🏷 ➕, Métricas 👥 🏆 🔥 📈, Ranking 🏆 🥇, ficha 👁️ 📱 💬 ⠿ ⬅️ ⬆️ ⬇️.
2. **Accesibilidad.** Inicio tiene 149 elementos con `cursor: pointer` que no reciben foco; inputs de búsqueda del directorio y de Cobros sin `<label>` ni `aria-label`; 44 textos de 10 px en Inicio y la ficha.
3. **Contraste del token gris.** `--muted-foreground: 215 16% 47%` da 4,70 sobre blanco, **4,49 sobre el sidebar** y **4,29 sobre `bg-muted`**. Con `215 16% 45%` pasa en los tres (5,06 / 4,83 / 4,61). Cambio de una línea en `globals.css`; ningún spec fija ese valor. Además, en el banner de error de Ranking `text-rose-300` sobre `rose-500/10` no alcanza 3:1 en modo día.
4. **Inicio.** KPIs en 2 × 2 con sombra (spec: fila de 4, solo borde). El botón flotante de chat sigue (spec: se elimina). La acción de la topbar es "Alta de alumno" en todas las páginas (spec: contextual: "Registrar pago" en Cobros, "Nueva clase" en Agenda, "Nueva rutina" en Rutinas).
5. **Cobros.** Por fila conviven "Historial" + "Plan" + "Registrar pago" + `⋯` (spec: una acción primaria + `⋯`). El header suma "Nuevo Plan" como segundo botón primario junto al de la topbar.
6. **Móvil 390.** La barra inferior está ✅, pero las cards de KPI y el subtítulo se cortan por el borde derecho (contenido más ancho que el viewport con `overflow: hidden`, por eso el chequeo de scroll horizontal no lo detecta). La bandeja de alertas vieja aparece antes que los KPIs.
7. **Base de datos (menores).** `v_dolor_activo` tiene `GRANT SELECT … TO anon` (innecesario; RLS lo cubre, pero mejor quitarlo). `actualizar_estado_dolor` permite que el propio alumno cambie el estado de su caso (spec: ENTRENADOR/ADMIN); confirmar si es intencional. El trigger `fn_derivar_severidad_dolor` ignora un `UPDATE` que cambie solo `severidad` (la recalcula desde el `eva` viejo); hoy nadie lo hace, pero documentarlo en el encabezado de la migración.

---

## 6. Lo que quedó bien

- **Backend sólido:** las dos migraciones son idempotentes, con backfill, triggers de espejo, RPC con validación de transición y tests sobre Postgres real (PGlite).
- **Primitivas** con la API de shadcn y sin dependencias; el Sheet de pago tiene foco inicial, Escape y foco de vuelta.
- **Shell:** navegación agrupada, ⌘K, un solo "Cerrar sesión", barra inferior móvil.
- **Cobros, Agenda, Rutinas y Ranking:** el cambio visual es grande y fiel a `02-vistas.md`.
- **`/athlete`** ya no rompe y hay `error.tsx`.
- **El modelo `layoutColumns`** de la ficha es mejor que el de filas que proponía el handoff: solo falta que el contenedor lo pinte en dos columnas.

---

## 7. Causa de fondo y regla nueva para el handoff

El canvas y `02-vistas.md` usaban valores de ejemplo realistas (Lucas, EVA 5, "Pase libre $40.000", "26 nov"). El handoff decía que eran del dataset demo, pero **no prohibía usarlos como valor por defecto**, y los agentes los tomaron como fallback para que la UI "nunca quede vacía". Se agrega esta regla a `04-frontend.md §4` y al checklist de QA:

> **Regla de datos de ejemplo.** Los valores que aparecen en el canvas, el PDF y `02-vistas.md` son ilustrativos. Ningún componente fuera de `src/services/coach-demo-*` puede tenerlos como valor por defecto, ni en props, ni en `useState`, ni con `||` / `??`. Si falta un dato, se muestra el estado vacío especificado. En modo en vivo, si una consulta falla, se muestra error con "Reintentar"; nunca datos demo.

---

## 8. Issues de corrección (listos para Multica)

> Mismo formato que `06-issues.md`. Todas heredan el gate y la revisión Selection.

---

### FIX-01 · Quitar datos de ejemplo usados como fallback en la ficha
**Owner:** `@frontend-eng` · **Rama:** `fix/<#>-ficha-sin-datos-ejemplo` · **Prioridad:** P0 · **Tamaño:** M
**Alcance:** `islas/isla-salud-anamnesis.tsx`, `islas/isla-metricas-1rm.tsx`, `islas/isla-activity-feed.tsx`, `islas/isla-administrativa.tsx`, `islas/isla-routine-workbench.tsx`, `student-detail.tsx`.

- GIVEN un alumno en vivo sin anamnesis WHEN se abre la ficha THEN Salud dice "Sin anamnesis cargada" y no muestra Objetivo, Frecuencia, Molestia ni Cirugías.
- GIVEN un alumno sin series registradas THEN Fuerza muestra "Todavía no hay series para calcular progresión" y ningún badge de progresión ni peso corporal.
- GIVEN un alumno sin actividad THEN Actividad muestra un estado vacío; `student-detail.tsx` pasa `items` reales.
- GIVEN un alumno sin contratación THEN Membresía dice "Sin contratación activa" + "Asignar plan".
- GIVEN un pago real por efectivo THEN el detalle dice "Efectivo", no "transferencia".
- GIVEN `rg -n "Landmine|Hipertrofia & Fuerza|4 días / semana|Pase libre · Funcional \+ Boxeo|26 nov|ayer 18:30|\\\$40\.000" src/components src/app` THEN no hay coincidencias.

### FIX-02 · La nota de intervención no escribe texto de ejemplo ni duplica
**Owner:** `@frontend-eng` · **Rama:** `fix/<#>-nota-intervencion` · **Prioridad:** P0 · **Tamaño:** S
**Alcance:** `islas/isla-salud-anamnesis.tsx`.

- GIVEN la ficha recién abierta THEN la nota muestra `notas_profesor` del caso o está vacía.
- GIVEN un cambio de estado sin nota nueva THEN la RPC recibe `p_nota = null`.
- GIVEN dos cambios de estado seguidos con la misma nota THEN `notas_profesor` la contiene una sola vez.
- GIVEN la isla THEN existe un único mecanismo de guardado y un único texto de ayuda.

### FIX-03 · Salud, cabecera y rutina consumen `v_dolor_activo`
**Owner:** `@frontend-eng` (+ `@backend-eng` para `fetchDolorActivo`) · **Rama:** `fix/<#>-dolor-activo-vivo` · **Prioridad:** P0 · **Tamaño:** M
**Alcance:** `src/lib/dolor.ts`, `student-detail.tsx`, `islas/isla-salud-anamnesis.tsx`, `islas/isla-routine-workbench.tsx`.

- GIVEN un caso real con EVA 3 en `alumno_historial_dolor` WHEN se abre la ficha THEN Salud muestra "Dolor leve · EVA 3" y la cabecera el mismo nivel.
- GIVEN el Segmented en "Atendida" THEN la RPC recibe el `id` real del caso y, al recargar, el estado persiste.
- GIVEN `student-detail.tsx` THEN no hay referencias a `DEMO_CRITICAL_ALERTS` ni deducción de EVA por regex.

### FIX-04 · Un solo camino de escritura del estado de dolor
**Owner:** `@frontend-eng` · **Rama:** `fix/<#>-persist-alert-estado` · **Prioridad:** P0 · **Tamaño:** S
**Alcance:** `critical-alerts-data.ts`, `critical-alerts-store.ts`, `student-pain-alerts.tsx`, `critical-alerts-inbox.tsx`.

- GIVEN cualquier UI que cambie el estado de un dolor THEN llama a `actualizarEstadoDolor` y no escribe `alertas_entrenador` ni `alumno_historial_dolor` directo.
- GIVEN `AlertaEstado` THEN no incluye `CERRADO`.
- GIVEN un error de la RPC THEN la UI revierte y muestra "No se pudo guardar. Reintentá." (no se traga el error).

### FIX-05 · Inicio: una sola bandeja, datos en vivo, sin demo en vivo
**Owner:** `@frontend-eng` · **Rama:** `fix/<#>-inicio-para-revisar-vivo` · **Prioridad:** P1 · **Tamaño:** M
**Alcance:** `coach-studio-view.tsx`, `para-revisar-hoy.tsx`, `src/lib/dolor.ts`, `critical-alerts-data.ts`, migración menor para `v_dolor_activo.nivel`.

- GIVEN Inicio THEN no se renderiza `CriticalAlertsInbox`; solo "Para revisar hoy".
- GIVEN modo en vivo THEN "Para revisar hoy" recibe `DolorActivo[]` reales y ninguna alerta demo; el EVA es el de la base.
- GIVEN 12 pendientes THEN se ven 5 y "Ver las 12".
- GIVEN un caso con síntoma de alarma y EVA 2 THEN el badge dice "Alto" en Inicio, en la ficha y en `v_dolor_activo.nivel`.
- GIVEN las filas THEN son `<button>` alcanzables con Tab; la cuota vencida usa tono `danger` y abre Cobros filtrado por ese alumno.

### FIX-06 · KPIs: misma fuente, mismo período y misma regla de permisos en todas las vistas
**Owner:** `@frontend-eng` · **Rama:** `fix/<#>-kpis-cableado` · **Prioridad:** P1 · **Tamaño:** M
**Alcance:** `src/app/(coach)/studio/cobros/page.tsx`, `src/app/(coach)/studio/ingresos/page.tsx`, `coach-studio-view.tsx`, `cobros-panel.tsx`, `studio-sankey-view.tsx`, nuevo `src/lib/use-kpis-negocio.ts`.

- GIVEN el stub en vivo y el período Mes THEN Cobrado, Vencidos y Al día son idénticos en Inicio, Cobros, Ingresos y Métricas.
- GIVEN modo en vivo y la RPC con error THEN cada KPI muestra "—" + "Reintentar"; nunca valores de `DEMO_*`.
- GIVEN un rol sin permiso de montos THEN ninguna de las cuatro vistas muestra montos.
- GIVEN Ingresos THEN el desglose por canal sale de `porCanal` o no se muestra; no hay multiplicadores fijos.

### FIX-07 · Ficha: dos columnas, cabecera del spec y Personalizar real
**Owner:** `@frontend-eng` · **Rama:** `fix/<#>-ficha-layout-cabecera` · **Prioridad:** P1 · **Tamaño:** M
**Alcance:** `student-detail.tsx`, `islas/isla-card-shell.tsx`, `islas/isla-metricas-1rm.tsx`.

- GIVEN 1440 × 900 THEN `routine_workbench` y `salud_anamnesis` quedan lado a lado (misma `y`, distinta `x`) y la ficha mide ≤ 2.300 px.
- GIVEN Personalizar apagado THEN no hay asas ni flechas en el DOM visible.
- GIVEN la cabecera THEN muestra breadcrumb, Personalizar (ícono), "Asignar rutina", "Enviar mensaje" y `⋯` (WhatsApp, Ver como alumno, Historial de cargas, Editar datos); sin "Salud: x/100", sin emojis.
- GIVEN la clave de layout THEN usa el id del coach logueado.
- GIVEN Fuerza THEN un solo 1RM visible; Brzycki solo en el Tooltip; título "Fuerza y progreso".

### FIX-08 · Tests que fallen por lo que importa
**Owner:** `@qa-eng` · **Rama:** `fix/<#>-qa-coherencia-vivo` · **Prioridad:** P1 · **Tamaño:** M
**Alcance:** `tests/e2e/coherencia-datos.e2e.ts`, `src/__tests__/coherencia-datos.spec.ts`, nuevos specs.

- GIVEN fixtures en vivo del stub (`PUT /__e2e/fixtures`) THEN los casos C1–C9 de `05-qa.md §2` corren contra datos en vivo, no demo.
- GIVEN un render de cada isla con un alumno sin datos THEN no aparece ningún valor del mockup (lista de FIX-01).
- GIVEN un spec guard THEN falla si alguno de los strings de ejemplo aparece en `src/components` o `src/app`.
- GIVEN C6 THEN usa `RESUELTO`, no `CERRADO`.
- GIVEN la revisión Selection de FIX-01 a FIX-07 THEN QA adjunta capturas con el stub en vivo, no en demo.

### FIX-09 · Pulido de copy, contraste y móvil
**Owner:** `@frontend-eng` · **Rama:** `fix/<#>-pulido-copy-a11y` · **Prioridad:** P2 · **Tamaño:** M
**Alcance:** `studio-shell.tsx`, `coach-studio-view.tsx`, `cobros-panel.tsx`, `coach-dashboard-view.tsx`, `ranking-funcional.tsx`, islas, `globals.css`.

- GIVEN el sidebar y los títulos THEN coinciden con el glosario de `01-sistema-visual.md §4`.
- GIVEN Coach Studio THEN no hay emojis usados como íconos.
- GIVEN `--muted-foreground` THEN `215 16% 45%` y el recorrido de contraste no reporta texto < 4,5:1 en Inicio, Cobros ni la ficha.
- GIVEN Inicio THEN 0 elementos clickeables sin foco; las búsquedas tienen nombre accesible; no hay texto < 11 px salvo la barra móvil.
- GIVEN 390 × 844 THEN ningún contenido se corta por el borde derecho y los KPIs aparecen antes que cualquier lista.
- GIVEN la topbar THEN la acción primaria es contextual por página; Cobros tiene una acción primaria por fila.

**Orden sugerido:** FIX-01 → FIX-02 → FIX-04 → FIX-03 → FIX-05 → FIX-06 → FIX-07 → FIX-08 (QA puede escribir el guard de FIX-08 ya, en paralelo) → FIX-09.

---

## Evidencia

`assets/revision-07/`: `inicio-32-de-15.jpg` (KPIs mezclados y bandeja duplicada), `ficha-alumno-real-datos-inventados.jpg` (Fernando Rosales: 0 sesiones y "4 de 4 en progresión"), `cobros.jpg`, `movil-390.jpg`, y `verificacion.json` con las mediciones de cada vista (texto prohibido, emojis, nombres accesibles, contraste, radios y alto de página).
