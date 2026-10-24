# Spec UX: historial en la App y en el Dashboard (GOZS-158)

> **Dirección:** `@UI/UX & Art Director` · **Implementa:** `@frontend-eng` (y `@backend-eng` donde se indica un contrato de datos)
> **Base:** `docs/DESIGN_SYSTEM.md` (tokens), `docs/ATHLETE_APP_UX_SPEC.md` (ergonomía de gimnasio), `docs/COACH_STUDIO_INDEC_SPEC.md` (densidad y simbología INDEC), ADR-004 (vista `SIMPLE` / `TECNICA`), ADR-005 (cero "Mynter" en la UI).

**Principio rector:** en el **Dashboard** el entrenador **analiza y decide**; en la **App** el alumno **entrena y se motiva**. La App muestra *una* referencia por vez, en grande y sin jerga; el Dashboard muestra tendencias densas y comparables.

**Alcance quirúrgico:** seis piezas, cada una en su sección. Ninguna agrega dependencias (los gráficos son SVG inline, igual que `Sparkline` en `src/components/coach/business-kpi-strip.tsx`) ni animaciones más allá de transiciones CSS de opacidad/traslación con `motion-reduce:transition-none`.

---

## 0. Reglas comunes de datos y formato (aplican a todas las piezas)

### 0.1. Qué cuenta como "serie histórica válida"

Una fila de `registro_series` entra en historial, sugerencias y récords solo si cumple **todo**:

| Condición | Motivo |
| :--- | :--- |
| `completada = true` | Una serie no completada no es una marca. |
| `set_type` **no** es `WARMUP` / `W` | El calentamiento no es referencia de carga (mismo criterio que el tonelaje efectivo). |
| `reps_hechas >= 1` | Sin reps no hay marca. |
| La sesión (`registro_sesiones.alumno_id`) es del alumno | RLS ya lo garantiza; no filtrar por `profesor_id`. |

- **Ejercicio canónico:** se agrupa siempre por `registro_series.ejercicio_id`. El import (GOZS-157) ya dejó cada serie apuntando al ejercicio deduplicado del catálogo, así que **no** se filtra por plan, día ni `ejercicios_en_rutina`: si hizo Sentadilla en el plan viejo, esa es su "última vez" en el plan nuevo.
- **Peso corporal:** `peso_kg = 0` significa ejercicio a peso corporal (el import mapeó `peso null → 0`). En esos casos se habla solo de **reps**; nunca se muestra `0 kg`.
- **RPE importado:** el historial importado tiene `rpe_real = NULL`. Toda regla que use RPE lo ignora cuando es `NULL`.

### 0.2. Formato

| Dato | Formato | Ejemplo |
| :--- | :--- | :--- |
| Peso | `Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })` + ` kg` | `82,5 kg` |
| Peso × reps | `{peso} kg × {reps}` (signo `×` U+00D7, espacios finos no necesarios) | `80 kg × 6` |
| Peso corporal | `{reps} reps` | `12 reps` |
| Fecha corta (mismo año) | `dd/MM` | `12/10` |
| Fecha corta (otro año) | `dd/MM/yy` | `12/10/25` |
| Fecha en Dashboard | `toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })` | `3 mar 2025` |
| Zona horaria | Todas las fechas se calculan en `America/Argentina/Buenos_Aires`. La semana empieza el **lunes**. | |

Todo número va con `font-mono tabular-nums` (regla del Design System).

### 0.3. Offline-first

Las piezas 1, 2 y 3 se usan **durante** el entrenamiento, muchas veces sin señal. Por eso sus datos se descargan **al abrir la sesión del día** (junto con el plan) y se guardan en el store persistido (`src/store/use-athlete-store.ts`). Si no hay red, se usa lo guardado; si nunca se descargó, se aplica el estado vacío de cada pieza. **Nunca** se bloquea el registro de una serie esperando historial.

### 0.4. Íconos

El proyecto **no** usa `lucide-react`: los íconos de la App son SVG propios en `src/components/athlete/icons.tsx` (componente `Icon`, trazo de 24×24 estilo Lucide). Esta spec agrega cuatro, copiando los paths de Lucide (licencia ISC) con el mismo patrón que `TriangleAlert`:

| Componente | Path de referencia (Lucide) | Usado en |
| :--- | :--- | :--- |
| `History` | `history` | Pieza 1 |
| `TrendingUp` | `trending-up` | Pieza 2 (subir) |
| `Equal` | `equal` | Pieza 2 (repetir) |
| `Trophy` | `trophy` | Pieza 3 |

En el Coach Studio los íconos son SVG inline en el propio componente (como en `student-detail.tsx`); se sigue ese patrón.

---

## 1. App — "La última vez"

### 1.1. Qué resuelve
El alumno ve, en la misma tarjeta de la serie, qué hizo la última vez en **ese ejercicio**, para saber qué carga poner sin pensar.

### 1.2. Ubicación exacta
- **Tarjeta única de serie** (`src/components/athlete/live-workout.tsx`, bloque `single-set-card-*`): hoy existe un texto `Última vez:` a la derecha del encabezado "Serie N de M" que **cae al valor actual** cuando no hay dato (`serie.last_session_weight_kg || serie.peso_kg`). Eso muestra un dato inventado y se reemplaza.
- Nueva ubicación: **una línea propia, debajo del encabezado "Serie N de M"** y arriba del stepper de Peso, a todo el ancho. Así queda en la zona media (lectura) y no compite con el número de serie.
- **Pestaña "Registro del día"**: debajo de cada fila de serie, la misma línea en tamaño `text-xs`, para comparar al revisar.

```
┌──────────────────────────────────────┐
│ Serie 2 de 4                         │
│ ⟲ Última vez: 80 kg × 6 · 12/10      │  ← pieza 1
│ ───────────────────────────────────  │
│ PESO                                 │
│ [−2.5]   [   82,5 kg   ]   [+2.5]    │
```

### 1.3. Datos
- **Sesión de referencia:** la `registro_sesiones` **más reciente** del alumno, con `fecha` anterior al inicio de la sesión en curso, que tenga al menos una serie válida (0.1) de ese `ejercicio_id`. Puede ser de otro plan.
- **Serie mostrada:** la de esa sesión con el mismo `numero_serie`. Si en esa sesión hizo menos series, se muestra la **última** serie válida que tenga (ej.: hoy va por la serie 4 y la última vez hizo 3 → muestra la 3).
- **Contrato (store):**

```ts
// Una entrada por ejercicio del día, descargada al abrir la sesión.
type UltimaVezEjercicio = {
  ejercicio_id: string;
  fecha: string;                       // registro_sesiones.fecha (ISO)
  series: { numero_serie: number; peso_kg: number; reps_hechas: number; rpe_real: number | null }[];
};
// useAthleteStore: ultimaVez: Record<string /* ejercicio_id */, UltimaVezEjercicio | null>
// null = consultado y sin historial. undefined = todavía no consultado.
```

- **Consulta de referencia** (`@backend-eng` la expone como RPC `SECURITY INVOKER` para que aplique RLS; recibe los `ejercicio_id` del día y devuelve una fila por serie):

```sql
-- Parámetros: p_ejercicio_ids uuid[], p_antes_de timestamptz
WITH validas AS (
  SELECT rs.ejercicio_id, rs.numero_serie, rs.peso_kg, rs.reps_hechas, rs.rpe_real,
         s.id AS sesion_id, s.fecha
  FROM public.registro_series rs
  JOIN public.registro_sesiones s ON s.id = rs.sesion_id
  WHERE s.alumno_id = auth.uid()
    AND s.fecha < p_antes_de
    AND rs.ejercicio_id = ANY (p_ejercicio_ids)
    AND rs.completada
    AND rs.set_type NOT IN ('WARMUP', 'W')
    AND rs.reps_hechas >= 1
),
ultima AS (
  SELECT DISTINCT ON (ejercicio_id) ejercicio_id, sesion_id
  FROM validas
  ORDER BY ejercicio_id, fecha DESC
)
SELECT v.ejercicio_id, v.fecha, v.numero_serie, v.peso_kg, v.reps_hechas, v.rpe_real
FROM validas v
JOIN ultima u USING (ejercicio_id, sesion_id)
ORDER BY v.ejercicio_id, v.numero_serie;
```

  El mismo RPC alimenta la pieza 2 (sugerencia) y, con un campo extra, la pieza 3 (marcas). Ver 3.3.

### 1.4. Estados

| Estado | Cuándo | Qué se ve |
| :--- | :--- | :--- |
| **Cargando** | `ultimaVez[ejercicio_id] === undefined` y hay red | Barra esqueleto `h-4 w-44 rounded bg-muted animate-pulse motion-reduce:animate-none`. Nunca más de la altura de la línea final (no salta el layout). |
| **Vacío** | `null` (sin historial) o nunca descargado y sin red | `Primera vez con este ejercicio` en `text-muted-foreground`. Sin ícono de reloj. |
| **Con datos** | Hay entrada | `Última vez: 80 kg × 6 · 12/10` |
| **Con datos, peso corporal** | `peso_kg = 0` | `Última vez: 12 reps · 12/10` |

### 1.5. Copy
- Etiqueta: `Última vez:` (con dos puntos). Valor: `80 kg × 6`. Separador: ` · ` y fecha corta (0.2).
- No se agrega "con el plan X" ni "hace N días": la fecha alcanza y la línea tiene que entrar en 390 px sin cortarse.
- `aria-label` de la línea: `Última vez, 12 de octubre: 80 kilos por 6 repeticiones`.

### 1.6. Clases Tailwind

```tsx
<p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground" data-testid="ultima-vez">
  <History className="h-4 w-4 shrink-0" aria-hidden="true" />   {/* icons.tsx, ver 0.4 */}
  <span>Última vez:</span>
  <span className="font-mono font-bold tabular-nums text-foreground">80 kg × 6</span>
  <span aria-hidden="true">·</span>
  <span className="font-mono tabular-nums">12/10</span>
</p>
```

- En "Registro del día": mismas clases cambiando `text-sm` por `text-xs` y sin ícono.
- Contraste: `text-muted-foreground` sobre `bg-card` cumple AA en ambos temas (ver tabla de contraste del Design System); el valor (`text-foreground`) es el dato clave y queda en AAA.

### 1.7. Criterios de aceptación
- GIVEN un alumno que hizo Sentadilla el 12/10 en el plan "Fuerza Base" (80 kg × 6 en la serie 2) WHEN hoy hace Sentadilla en el plan "Hipertrofia" y está en la serie 2 THEN ve `Última vez: 80 kg × 6 · 12/10`.
- GIVEN un ejercicio sin series válidas previas WHEN abre la tarjeta THEN ve `Primera vez con este ejercicio` y **nunca** el peso actual disfrazado de "última vez".
- GIVEN la sesión del día ya descargada y el teléfono sin señal WHEN cambia de ejercicio THEN la línea aparece sin esqueleto.

---

## 2. App — Sugerencia de carga

### 2.1. Qué resuelve
El alumno no tiene que decidir cuánto poner: la App le propone el peso de cada serie según lo que hizo la última vez (sobrecarga progresiva simple, "doble progresión"). Siempre puede cambiarlo con los steppers.

### 2.2. Ubicación exacta
- En la tarjeta única de serie, **debajo de la línea "Última vez"** (pieza 1) y arriba del stepper de Peso.
- Además, el **stepper de Peso arranca precargado** con el peso sugerido (y el de Reps con el objetivo). Es la parte importante: el alumno solo toca "Registrar serie".

```
│ Serie 2 de 4                         │
│ ⟲ Última vez: 80 kg × 8 · 12/10      │
│ ┌──────────────────────────────────┐ │
│ │ ↑ Subí a 82,5 kg                 │ │  ← pieza 2 (no es botón)
│ │   La última vez completaste      │ │
│ │   todas las reps.                │ │
│ └──────────────────────────────────┘ │
│ PESO                                 │
│ [−2.5]   [   82,5 kg   ]   [+2.5]    │  ← precargado
```

### 2.3. Regla de decisión

Entrada: la sesión de referencia de la pieza 1 (`UltimaVezEjercicio`), el objetivo de reps del ejercicio de hoy (`repeticiones_objetivo`, texto de `ejercicios_en_rutina.repeticiones`) y la cantidad de series prescriptas.

1. **Objetivo de reps** (`objetivo`): se parsea `repeticiones_objetivo`.
   - Número solo (`"8"`) → `8`.
   - Rango (`"6-8"`, `"6 a 8"`, `"6–8"`) → el **tope** del rango, `8` (se sube cuando llega arriba del rango).
   - Cualquier otro texto (`"AMRAP"`, `"al fallo"`, `"30 s"`, vacío) → **sin objetivo** → regla "repetir".
2. **Completó todo** si se cumplen las tres:
   - La sesión de referencia tiene **al menos tantas series válidas** como series prescriptas hoy (hizo todas).
   - **Todas** esas series tienen `reps_hechas >= objetivo`.
   - Ninguna tiene `rpe_real >= 9.5` (se ignora si es `NULL`; el historial importado no tiene RPE).
3. Si **completó todo** → **subir**: peso sugerido = peso de la misma serie la última vez (mapeo de la pieza 1) + incremento (tabla 2.4). Reps precargadas = **piso** del rango (`6` en `"6-8"`) o el número fijo.
4. Si **no** → **repetir**: peso sugerido = peso de esa serie la última vez. Reps precargadas = objetivo.
5. Series `DROPSET` / `D`: siempre **repetir** (no se progresa un drop set).
6. Sin historial (`ultimaVez = null`) → **no hay sugerencia**: no se muestra el bloque y los steppers arrancan como hoy.

### 2.4. Incremento por tipo de ejercicio

El tipo se deduce del catálogo (`ejercicios.musculos_principales`) y del peso; **no requiere columnas nuevas**. La comparación de músculos normaliza tildes y mayúsculas y busca por substring.

| Tipo | Cómo se detecta | Incremento | Por qué |
| :--- | :--- | :--- | :--- |
| **Peso corporal** | Peso de la última vez = `0` | **+1 rep** (el peso queda en 0) | No hay disco que sumar. |
| **Tren inferior pesado** | `musculos_principales` contiene `cuadriceps`, `gluteo`, `isquio` o `aductor` **y** última vez ≥ 60 kg | **+5 kg** | Sentadilla, peso muerto, prensa, hip thrust: progresan rápido; 2,5 kg por lado es el salto estándar. |
| **Tren inferior liviano** | Mismos músculos, última vez < 60 kg | **+2,5 kg** | Principiantes y unilaterales. |
| **Tren superior / resto** | Cualquier otro, última vez ≥ 20 kg | **+2,5 kg** | Press, remo, militar: 1,25 kg por lado. |
| **Liviano** | Cualquier otro, última vez < 20 kg | **+1 kg** | Mancuernas, polea y aislamiento: saltos chicos para no romper la técnica. |

- La tabla vive como constante en `src/lib/sugerencia-carga.ts` (`INCREMENTOS_SUGERIDOS`) junto con la función pura `sugerirCarga()`, para poder ajustarla sin tocar la UI y testearla con Vitest.
- El peso sugerido se redondea a múltiplos de `0,5 kg`.

### 2.5. Precarga de steppers
- Se precarga **solo** en series pendientes (`completada = false`) que el alumno **todavía no tocó** en esta sesión. Si ya ajustó el peso o las reps, no se pisa su valor.
- El bloque de sugerencia sigue visible aunque el alumno cambie el peso (es la referencia), pero si el peso actual difiere del sugerido el título pasa a `text-muted-foreground` para no gritar.

### 2.6. Estados

| Estado | Qué se ve |
| :--- | :--- |
| **Cargando** | Nada (la pieza 1 ya muestra su esqueleto; no se apilan dos esqueletos). Steppers con el valor de hoy. |
| **Vacío** (sin historial o sin datos offline) | No se renderiza el bloque. |
| **Subir** | Título `Subí a 82,5 kg` + motivo `La última vez completaste todas las reps.` |
| **Subir, peso corporal** | Título `Probá 13 reps` + motivo `La última vez completaste todas las reps.` |
| **Repetir** | Título `Repetí 80 kg` + motivo `La última vez quedaron reps sin completar. Primero completalas con este peso.` |
| **Repetir por RPE** | Título `Repetí 80 kg` + motivo `La última vez fue al límite (RPE 10). Repetí y buscá más control.` (en vista `SIMPLE` se reemplaza por `La última vez fue al límite. Repetí y buscá más control.`: sin la sigla RPE) |
| **Repetir sin objetivo numérico** | Título `Repetí 80 kg` + motivo `Mismo peso que la última vez.` |

### 2.7. Clases Tailwind

```tsx
{/* Subir */}
<div className="rounded-xl border border-success/40 bg-success/10 px-3.5 py-2.5" data-testid="sugerencia-carga" data-tipo="subir">
  <p className="flex items-center gap-1.5 text-base font-bold text-foreground">
    <TrendingUp className="h-4 w-4 text-success" aria-hidden="true" />
    Subí a <span className="font-mono tabular-nums">82,5 kg</span>
  </p>
  <p className="text-xs text-muted-foreground mt-0.5">La última vez completaste todas las reps.</p>
</div>

{/* Repetir: mismo layout, neutro */}
<div className="rounded-xl border border-border bg-secondary/60 px-3.5 py-2.5" data-testid="sugerencia-carga" data-tipo="repetir">
  <p className="flex items-center gap-1.5 text-base font-bold text-foreground">
    <Equal className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
    Repetí <span className="font-mono tabular-nums">80 kg</span>
  </p>
  <p className="text-xs text-muted-foreground mt-0.5">La última vez quedaron reps sin completar. Primero completalas con este peso.</p>
</div>
```

- **No es un botón** (no tiene `onClick` ni foco): la acción ya ocurrió al precargar el stepper. Así no suma un tap target más en la zona del pulgar.
- `repetir` no usa rojo ni ámbar: no es un error, es la regla de entrenamiento.
- `aria-live="polite"` en el contenedor, para que el lector de pantalla lo anuncie al cambiar de serie.

### 2.8. Criterios de aceptación
- GIVEN Sentadilla (cuádriceps/glúteos), objetivo `"6-8"`, 4 series prescriptas, la última vez 4 series de 80 kg × 8 WHEN abre la serie 1 THEN ve `Subí a 85 kg` y el stepper arranca en `85` con reps `6`.
- GIVEN Press de banca, la última vez 60 kg × 8, 8, 7 con objetivo `"8"` WHEN abre la serie 1 THEN ve `Repetí 60 kg` y el stepper arranca en `60`.
- GIVEN Elevaciones laterales con 8 kg × 12 en todas las series y objetivo `"10-12"` THEN sugiere `9 kg`.
- GIVEN Dominadas a peso corporal con 3 × 10 y objetivo `"10"` THEN ve `Probá 11 reps` y nunca `0 kg`.
- GIVEN el alumno ya cambió el peso de la serie 3 WHEN vuelve a esa serie THEN se respeta su valor.

---

## 3. App — "¡Nuevo récord!"

### 3.1. Qué resuelve
Al registrar una serie que supera su mejor marca en ese ejercicio, el alumno lo ve en el momento. Es la "gamificación mínima" de ADR-003: récords por ejercicio, **sin ranking** contra otros.

### 3.2. Ubicación exacta
- Ocupa **el mismo lugar que el aviso "Serie N guardada"** (`optimistic-saved-banner`, arriba de las pestañas Entrenar / Registro del día). Si la serie es récord, el aviso verde se **reemplaza** por la variante récord; nunca se muestran los dos.
- En "Registro del día", la fila de esa serie lleva un ícono `Trophy` dorado chico al lado del peso (persistente durante la sesión).

```
┌──────────────────────────────────────┐
│ 🏆 ¡Nuevo récord!               [✕]  │  ← dorado, reemplaza "Serie 2 guardada"
│    85 kg × 5 · tu mejor marca en     │
│    Sentadilla                        │
└──────────────────────────────────────┘
```

### 3.3. Datos
Se extiende el RPC de la pieza 1 para devolver también las **marcas históricas** de cada ejercicio del día (todas las series válidas de 0.1, de todas las sesiones anteriores, no solo la última):

```ts
type MarcasEjercicio = {
  ejercicio_id: string;
  // Frontera de Pareto de (peso, reps): series que ninguna otra supera en peso Y reps a la vez.
  // Es corta (en general < 10 pares) y alcanza para decidir cualquier récord offline.
  frontera: { peso_kg: number; reps_hechas: number; fecha: string }[];
  max_peso_kg: number;     // 0 si es a peso corporal
  max_epley_kg: number;    // calculateEpley1RM() sobre series con reps <= 12
};
// useAthleteStore: marcas: Record<string /* ejercicio_id */, MarcasEjercicio | null>
```

- La frontera se puede calcular en el RPC (SQL) o en el cliente a partir de las series; lo importante es que viaje en la misma descarga de la sesión y quede guardada para offline.
- Las series **ya completadas en la sesión de hoy** se suman a la frontera en memoria a medida que se registran, para que la serie 3 no festeje un récord que ya superó la serie 2.

### 3.4. Regla de récord
Al tocar "Registrar serie" (`handleRegistrarSerie`), con la serie válida según 0.1 (no `WARMUP`, reps ≥ 1):

1. **Sin historial** (`marcas = null`, primera vez con el ejercicio) → **no** hay récord. No se festeja la primera serie de la vida.
2. **Es récord** si **ninguna** serie de la frontera tiene `peso_kg >= peso` **y** `reps_hechas >= reps` a la vez (nadie la iguala ni la supera en las dos cosas), **y** además `peso >= 0,8 × max_peso_kg` (evita festejar 12 reps livianas con un peso que nunca usó).
3. Tipo de récord (define el texto; uno solo por serie, en este orden):
   - **Récord de peso:** `peso > max_peso_kg`.
   - **Récord de reps:** el resto de los casos de la regla 2 (más reps que nunca con ese peso o más).
   - **Peso corporal** (`peso = 0`): solo aplica récord de reps; la regla del 80% no aplica.
4. **1RM estimado:** si `calculateEpley1RM(peso, reps) > max_epley_kg` y `reps <= 12`, en vista `TECNICA` se agrega la línea del 1RM. En vista `SIMPLE` **nunca** se menciona 1RM (ADR-004).
5. Récord en una serie `DROPSET` o `FAILURE` cuenta igual (es una serie efectiva).

### 3.5. Estados y copy

| Caso | Título | Detalle |
| :--- | :--- | :--- |
| Récord de peso | `¡Nuevo récord!` | `85 kg × 5 · tu mejor marca en Sentadilla` |
| Récord de reps | `¡Nuevo récord!` | `80 kg × 9 · nunca hiciste tantas reps con este peso` |
| Récord, peso corporal | `¡Nuevo récord!` | `14 reps · tu mejor marca en Dominadas` |
| Línea extra solo `TECNICA` | — | `1RM estimado: 99 kg (+3 kg)` |
| Sin récord | — | Se muestra el aviso verde actual `Serie N guardada · 80 kg × 6`, sin cambios. |
| Sin datos (offline sin descarga previa) | — | Sin récord (no se puede comparar); aviso verde normal. No se recalcula después. |

- "Cargando" no existe: la decisión es local y sincrónica con datos ya guardados.
- Nada de "¡Increíble, bestia!" ni emojis en el texto: el trofeo y el color dicen suficiente. El nombre del ejercicio es el de `ejercicios.nombre`.

### 3.6. Clases Tailwind y feedback

```tsx
<div
  role="status"
  aria-live="polite"
  className="mb-4 flex items-start justify-between gap-2 rounded-xl border-2 border-warning bg-warning/15 px-3.5 py-3 text-foreground
             transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none
             data-[enter=true]:opacity-0 data-[enter=true]:translate-y-1"
  data-testid="nuevo-record-banner"
>
  <div className="flex items-start gap-2.5">
    <Trophy className="h-6 w-6 shrink-0 text-warning" aria-hidden="true" />
    <div>
      <p className="text-base font-extrabold">¡Nuevo récord!</p>
      <p className="text-sm font-medium">
        <span className="font-mono font-bold tabular-nums">85 kg × 5</span> · tu mejor marca en Sentadilla
      </p>
      {/* solo TECNICA */}
      <p className="text-xs text-muted-foreground font-mono tabular-nums">1RM estimado: 99 kg (+3 kg)</p>
    </div>
  </div>
  <button type="button" aria-label="Cerrar aviso de récord"
          className="-m-2 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-foreground/70 hover:text-foreground touch-manipulation">
    <X className="h-4 w-4" />
  </button>
</div>
```

- **Color:** token `warning` (dorado: `#F59E0B` en claro, `#FBBF24` en oscuro, ver `src/app/globals.css`). El texto va en `text-foreground`, **no** en dorado, para mantener AA sobre el fondo `warning/15`. El dorado solo va en el borde y el trofeo (elementos gráficos, requisito 3:1 cumplido).
- **Movimiento:** solo entrada de opacidad + 4 px hacia arriba en 200 ms por CSS. Sin confeti, sin Lottie, sin escalado (Regla Ponytail).
- **Vibración:** `triggerHapticVibration([60, 40, 60])` (`src/lib/sound.ts`) una vez. Sin sonido: el beep queda reservado al timer de descanso.
- **Duración:** queda visible hasta registrar la serie siguiente o tocar ✕ (igual que el aviso verde). El ✕ mide **48 × 48 px** (el ✕ actual del aviso verde mide ~18 px: corregirlo con las mismas clases en esa misma pasada).
- **Registro del día:** `<Trophy className="h-4 w-4 text-warning" aria-label="Récord" />` a la derecha del peso de la fila.

### 3.7. Criterios de aceptación
- GIVEN marcas de Sentadilla con frontera `[100×3, 90×6, 80×8]` WHEN registra `95 kg × 5` THEN ve récord de reps (`nunca hiciste tantas reps con este peso`): nadie hizo ≥ 95 kg con ≥ 5 reps.
- GIVEN la misma frontera WHEN registra `90 kg × 6` THEN **no** es récord (lo iguala) y ve el aviso verde.
- GIVEN la misma frontera WHEN registra `102,5 kg × 1` THEN ve récord de peso.
- GIVEN la misma frontera WHEN registra `60 kg × 15` THEN **no** es récord (60 < 0,8 × 100).
- GIVEN vista `SIMPLE` THEN el aviso no contiene "1RM" en ningún caso.
- GIVEN un ejercicio que nunca hizo WHEN registra la primera serie THEN no hay récord.
- GIVEN serie 2 récord con 85 × 5 WHEN la serie 3 es 85 × 5 THEN no se repite el récord.

---

## 4. App — "Mi progreso"

### 4.1. Qué resuelve
Una pantalla para **motivarse**, no para analizar: "¿estoy levantando más que antes?" y "¿cuánto vine este mes?". Nada de tablas.

### 4.2. Ubicación exacta
- **Nueva sección en la navegación de la App** (`src/components/athlete/athlete-shell.tsx`): la grilla pasa de `grid-cols-2` a `grid-cols-3` con el orden `Entrenar · Progreso · Clases`. Mismo estilo de link (`min-h-12`, ya cumple 48 px). En 390 px cada botón queda en ~114 px de ancho: entra la palabra sin cortar.
- **Nueva ruta:** `src/app/(athlete)/athlete/progreso/page.tsx`, con el componente `src/components/athlete/mi-progreso.tsx`.
- Diseño de una sola columna (la Athlete App es exclusivamente móvil), ancho útil 390 − 2 × 16 px = 358 px.

```
┌──────────────────────────────────────┐
│ [Entrenar] [Progreso] [Clases]       │
├──────────────────────────────────────┤
│ SESIONES ESTE MES                    │
│ 9            el mes pasado: 7        │  ← número grande
├──────────────────────────────────────┤
│ Sentadilla                           │
│ 85 kg          +10 kg desde agosto   │
│ ╱‾‾╲__╱‾‾‾‾╱                         │  ← línea simple, 12 sesiones
├──────────────────────────────────────┤
│ Press de banca                       │
│ ...                                  │
└──────────────────────────────────────┘
```

### 4.3. Datos

| Bloque | Fuente | Regla |
| :--- | :--- | :--- |
| **Sesiones este mes** | `registro_sesiones` del alumno | Cantidad de sesiones con `fecha` dentro del mes calendario en curso (zona horaria de 0.2). "El mes pasado" = mismo conteo del mes calendario anterior **completo**. |
| **Ejercicios principales** | `registro_series` válidas (0.1) de los últimos **90 días** | Los **4** `ejercicio_id` presentes en más sesiones distintas. Desempate: mayor peso máximo. Si hay menos de 4, se muestran los que haya. Si no hay ninguno en 90 días, se usan los 4 más frecuentes de todo el historial. |
| **Punto del gráfico** | Uno por sesión, últimas **12** sesiones del ejercicio (sin límite de fecha) | `SIMPLE`: **peso máximo** de la sesión (`max(peso_kg)`). Peso corporal: **reps máximas**. `TECNICA`: además, 1RM Epley máximo de la sesión (series con reps ≤ 12). |
| **Delta** | Primer y último punto del gráfico | `+10 kg desde agosto` (mes del primer punto, en minúscula; si es de otro año: `desde agosto 2025`). Si es 0: `Igual que en agosto`. Si es negativo: `−5 kg desde agosto` (sin rojo: es información, no un reto). |
| **Volumen del mes** (solo `TECNICA`) | `registro_sesiones.effective_volume_kg` | Suma del mes en curso. |

- Contrato sugerido: un RPC `obtener_mi_progreso()` (`SECURITY INVOKER`, sin parámetros, usa `auth.uid()`) que devuelve `{ sesiones_mes, sesiones_mes_anterior, volumen_mes_kg, ejercicios: [{ ejercicio_id, nombre, a_peso_corporal, puntos: [{ fecha, peso_max_kg, reps_max, epley_max_kg }] }] }`. Una sola llamada, < 5 KB.
- Se guarda en el store persistido con su `fecha_descarga` para mostrarse offline.

### 4.4. Gráfico (SVG inline, sin librerías)
Componente `ProgresoLinea` dentro de `mi-progreso.tsx`, derivado del `Sparkline` de `business-kpi-strip.tsx`:

- `viewBox="0 0 100 40"`, `className="h-20 w-full text-primary"`, `preserveAspectRatio="none"`, `polyline` con `strokeWidth="2.5"` y `vectorEffect="non-scaling-stroke"`.
- **Último punto** marcado con un círculo de 6 px relleno `currentColor`. Como el `svg` se estira (`preserveAspectRatio="none"`), el punto se dibuja como un `span` absoluto `h-1.5 w-1.5 rounded-full bg-primary` posicionado en `%` sobre el contenedor (`relative`), para que no se deforme.
- Sin ejes, sin grilla, sin tooltip: el número grande arriba del gráfico ya es el dato. La línea es la "forma" del progreso.
- Eje Y: de `min − 5 %` a `max + 5 %` de los puntos, para que una mejora de 80 → 85 kg se vea.
- `TECNICA`: segunda línea del 1RM en `text-muted-foreground` con `strokeDasharray="3 3"`, y leyenda de texto debajo: `— Peso máx  ··· 1RM estimado`.
- Accesibilidad: el `svg` lleva `role="img"` y `aria-label="Sentadilla: de 75 a 85 kilos en las últimas 12 sesiones"`.

### 4.5. Estados

| Estado | Qué se ve |
| :--- | :--- |
| **Cargando** (sin datos guardados) | Esqueleto: un bloque `h-24` para "Sesiones este mes" y 3 tarjetas `h-36`, `bg-muted animate-pulse motion-reduce:animate-none rounded-2xl`. |
| **Vacío** (ninguna sesión registrada nunca) | Ícono `History` grande `h-10 w-10 text-muted-foreground`, título `Todavía no hay entrenamientos` y texto `Tu progreso aparece acá después de tu primera sesión.` Botón primario `Ir a entrenar` (`h-14 w-full`, link a `/athlete`). |
| **Sesiones este mes = 0, con historial** | Número `0` y debajo `el mes pasado: 7`. Sin regaño ni copy negativo. |
| **Ejercicio con 1 sola sesión** | Tarjeta con el número grande y, en lugar del gráfico, `Con 2 sesiones vas a ver tu línea de progreso.` en `text-sm text-muted-foreground`. |
| **Con datos** | Como el esquema 4.2. |
| **Offline con datos guardados** | Igual que "con datos" + línea `text-xs text-muted-foreground` arriba de todo: `Sin conexión · datos del 23/10`. |
| **Offline sin datos guardados** | Ícono `CloudOff` (ya existe en `icons.tsx`) + `Sin conexión. Conectate para ver tu progreso.` |

### 4.6. Copy y vista `SIMPLE` vs `TECNICA`

| Elemento | `SIMPLE` | `TECNICA` |
| :--- | :--- | :--- |
| Título de la pantalla | `Mi progreso` | `Mi progreso` |
| Bloque mensual | `Sesiones este mes` | `Sesiones este mes` + `Volumen del mes: 42.350 kg` |
| Número de la tarjeta | `85 kg` (peso máximo de la última sesión) | `85 kg` + debajo `1RM est. 99 kg` |
| Gráfico | 1 línea (peso máx) | 2 líneas (peso máx + 1RM) |
| Palabras que no aparecen | "1RM", "volumen", "tonelaje", "RPE" | — |

### 4.7. Clases Tailwind

```tsx
{/* Bloque mensual */}
<section className="rounded-2xl border border-border bg-card p-4" aria-labelledby="sesiones-mes">
  <h2 id="sesiones-mes" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Sesiones este mes</h2>
  <div className="mt-1 flex items-baseline justify-between">
    <span className="font-mono text-5xl font-extrabold tabular-nums text-foreground">9</span>
    <span className="text-sm text-muted-foreground">el mes pasado: <span className="font-mono font-bold text-foreground">7</span></span>
  </div>
</section>

{/* Tarjeta de ejercicio */}
<article className="rounded-2xl border border-border bg-card p-4 space-y-2" data-testid="progreso-ejercicio">
  <h3 className="text-base font-bold text-foreground">Sentadilla</h3>
  <div className="flex items-baseline justify-between">
    <span className="font-mono text-3xl font-extrabold tabular-nums text-foreground">85 kg</span>
    <span className="text-sm font-semibold text-emerald-700 dark:text-success">+10 kg desde agosto</span>
  </div>
  {/* <ProgresoLinea /> */}
</article>
```

- Delta positivo en `text-emerald-700 dark:text-success` (en tema claro `--success` #10B981 sobre blanco no llega a AA para texto chico; #047857 sí), cero o negativo en `text-muted-foreground`.
- Las tarjetas **no son tocables** en esta versión (no hay detalle por ejercicio): sin `hover`, sin chevron. Evita prometer una pantalla que no existe.

### 4.8. Criterios de aceptación
- GIVEN un alumno `SIMPLE` con historial WHEN abre Progreso THEN ve sesiones del mes, hasta 4 ejercicios con su línea, y en ningún lugar las palabras "1RM", "volumen" o "RPE".
- GIVEN el mismo alumno pasado a `TECNICA` THEN ve además la línea punteada de 1RM y el volumen del mes.
- GIVEN Dominadas a peso corporal THEN el número es `14 reps` y el gráfico usa reps máximas.
- GIVEN un alumno sin ninguna sesión THEN ve el estado vacío con el botón `Ir a entrenar`.
- GIVEN 390 px de ancho THEN la navegación muestra `Entrenar · Progreso · Clases` sin cortes y cada botón mide ≥ 48 px de alto.

---

## 5. Dashboard — Calendario de adherencia y "días sin entrenar"

### 5.1. Qué resuelve
El entrenador ve de un vistazo **si el alumno viene con constancia**, semana por semana, durante el último año, y cuántos días lleva sin entrenar. Sirve para decidir: escribirle, ajustar la frecuencia del plan o no tocar nada.

### 5.2. Ubicación exacta
- **Detalle del alumno** en el Coach Studio (`src/components/coach/student-detail.tsx`): una tarjeta nueva `AdherenciaCard` **inmediatamente debajo de la tarjeta de encabezado** del alumno (la que tiene el nombre, el estado de cuota y el botón "Cargas y RPE Históricos") y **arriba** de la tarjeta "Vista recomendada" (`coach-nivel-vista-card`).
- Componente nuevo: `src/components/coach/adherencia-card.tsx`.
- No se agrega columna nueva al roster: ya tiene `ÚLTIMO ENTRENO` y el filtro "Sin entrenar +7 días" (GOZS-136).

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ ADHERENCIA · ÚLTIMAS 52 SEMANAS                        [ 9 días sin entrenar ]  (badge)    │
│ Promedio 12 sem.: 2,4 ses/sem (obj. 3)   ·   Semanas con objetivo cumplido: 31 de 52      │
│                                                                                            │
│        nov       dic       ene       feb   …                                    oct        │
│ Lun  ▢ ■ ■ ▢ ■ ▢ ▢ ■ ■ ■ ▢ ■ …                                               ■ ▢ ▢         │
│ Mié  ■ ▢ ■ ■ ▢ ■ ▢ ▢ ■ ■ ■ ▢ …                                               ▢ ■ ▢         │
│ Vie  ...                                                                                   │
│ ses  2 3 3 1 2 — 1 2 3 3 2 2 …                                               2 1 …         │
│                                                                                            │
│ ■ Entrenó  ▢ No entrenó  ▢ (punteado) Antes de su primera sesión    Fuente: Registro GOZSter│
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.3. Datos

| Dato | Fuente | Regla |
| :--- | :--- | :--- |
| Días entrenados | `registro_sesiones` (`alumno_id`, `fecha`, `dia_id`) de los últimos **371 días** (53 semanas completas) | Un día cuenta como entrenado si tiene ≥ 1 sesión. Fechas en `America/Argentina/Buenos_Aires`. |
| Sesiones por semana | Mismas filas | Conteo de sesiones (no días) por semana lunes–domingo. |
| Objetivo semanal | `dias_rutina` del plan activo (`rutinaActiva`) | Cantidad de días del plan. Sin plan activo → **sin objetivo** (no se colorea nada en rojo). |
| Días sin entrenar | Última `registro_sesiones.fecha` | Días calendario entre esa fecha y hoy. Si no hay sesiones → no hay número (ver estados). |
| Primera sesión | Mínima `fecha` del alumno (se pide aparte, `limit 1`) | Las semanas anteriores se muestran como "sin datos", no como "no entrenó". |

- Consulta directa con el cliente Supabase del coach (RLS ya permite al entrenador leer las sesiones de sus alumnos). Son ≤ ~400 filas livianas; no hace falta RPC.
- El cálculo (grilla, conteos, promedio) va en una función pura `armarAdherencia(sesiones, hoy, objetivo, primeraSesion)` en `src/lib/adherencia.ts`, testeable con Vitest. Reutiliza `DIAS_SIN_ENTRENAR` de `src/lib/sin-entrenar.ts` para el umbral rojo.

### 5.4. Grilla estilo contribuciones
- **Columnas:** 52 semanas, la más reciente a la **derecha**. **Filas:** 7 días (lunes arriba). Etiquetas de fila solo en `Lun`, `Mié`, `Vie` (como GitHub) para no saturar.
- **Celda:** `h-3 w-3 rounded-[3px]`, separación `gap-[3px]`. Ancho total ≈ 52 × 15 px = 780 px: entra en el panel de detalle a 1440 px. Por debajo de eso, el contenedor hace `overflow-x-auto` y arranca **scrolleado al final** (`scrollLeft = scrollWidth`), para que siempre se vea la semana actual.
- **Colores (binario, sin escala de intensidad: el alumno entrena una vez por día):**

| Estado de la celda | Clase |
| :--- | :--- |
| Entrenó | `bg-primary` |
| No entrenó | `bg-surface-container` |
| Antes de la primera sesión | `border border-dashed border-border bg-transparent` |
| Días futuros de la semana actual | `bg-transparent` (sin borde) |
| Hoy | se suma `ring-1 ring-foreground/50 ring-offset-1 ring-offset-card` |

- **Fila de sesiones por semana** (debajo de la grilla, alineada a cada columna): `font-mono text-[10px] tabular-nums text-center w-3`.
  - Con objetivo y `sesiones >= objetivo`: `text-foreground`.
  - Con objetivo y `0 < sesiones < objetivo`: `text-destructive font-bold`.
  - `0` sesiones: `—` (simbología INDEC: magnitud cero) en `text-destructive` si hay objetivo.
  - Semana anterior a la primera sesión: `…` (INDEC: dato no disponible) en `text-muted-foreground`.
  - Semana actual (incompleta): número en `text-muted-foreground`, nunca en rojo.
- **Meses:** etiqueta `text-[11px] text-muted-foreground` sobre la primera columna de cada mes (`ene`, `feb`…).
- **Hover:** cada celda lleva `title` nativo, sin tooltip custom: `mar 14 oct 2025 · 1 sesión` / `mar 14 oct 2025 · sin entrenar`. Las celdas **no** son focusables (serían 364 paradas de Tab); la accesibilidad va en el resumen (5.7).

### 5.5. Resumen y "días sin entrenar"
- **Badge "días sin entrenar"** (arriba a la derecha de la tarjeta), usando las variantes de `Badge` del Design System:

| Días | Texto | Variante |
| :--- | :--- | :--- |
| 0 | `Entrenó hoy` | `outline` con `text-success` (`text-emerald-700` en claro) |
| 1 | `1 día sin entrenar` | `outline` |
| 2 a 7 | `{n} días sin entrenar` | `outline` |
| > 7 (`DIAS_SIN_ENTRENAR`) | `{n} días sin entrenar` | `destructive` |
| Sin sesiones | `Nunca entrenó` | `secondary` |

- **Línea de resumen** (`text-xs text-muted-foreground`, números en `font-mono tabular-nums text-foreground`):
  - `Promedio 12 sem.: 2,4 ses/sem (obj. 3)` — promedio de las últimas 12 semanas **completas** (sin contar la actual), 1 decimal con coma. Sin objetivo: se omite `(obj. 3)`.
  - `Semanas con objetivo cumplido: 31 de 52` — solo semanas completas posteriores a la primera sesión. Sin objetivo: se omite este dato.
- **Pie INDEC:** leyenda de colores a la izquierda y `Fuente: Registro GOZSter` a la derecha, `text-[11px] text-muted-foreground`.

### 5.6. Estados

| Estado | Qué se ve |
| :--- | :--- |
| **Cargando** | La tarjeta con su título y una grilla esqueleto `h-[120px] w-full rounded-md bg-muted animate-pulse motion-reduce:animate-none`. El badge no se muestra hasta tener datos. |
| **Vacío** (alumno sin ninguna sesión) | Título igual, badge `Nunca entrenó`, y en lugar de la grilla: `Todavía no registró entrenamientos. El calendario se completa con cada sesión.` en `text-sm text-muted-foreground`, con una grilla de celdas punteadas detrás al 40 % de opacidad para anticipar la forma. |
| **Con datos, < 52 semanas de historia** | Grilla completa; las semanas previas a la primera sesión en punteado y `…`. |
| **Con datos** | Como el esquema 5.2. |
| **Error de red** | `No se pudo cargar la adherencia.` + botón `Reintentar` (`Button variant="outline" size="sm"`, `min-h-11`). |

### 5.7. Clases Tailwind (esqueleto)

```tsx
<Card data-testid="adherencia-card">
  <CardContent className="p-4 sm:p-5 space-y-3">
    <div className="flex items-start justify-between gap-4">
      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Adherencia · últimas 52 semanas
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Promedio 12 sem.: <span className="font-mono tabular-nums text-foreground">2,4</span> ses/sem (obj. 3)
          <span aria-hidden="true"> · </span>
          Semanas con objetivo cumplido: <span className="font-mono tabular-nums text-foreground">31 de 52</span>
        </p>
      </div>
      <Badge variant="destructive">9 días sin entrenar</Badge>
    </div>
    <div className="overflow-x-auto" role="img"
         aria-label="Adherencia de las últimas 52 semanas: 31 semanas con el objetivo cumplido, promedio 2,4 sesiones por semana, 9 días sin entrenar">
      <div className="grid grid-flow-col grid-rows-7 gap-[3px] w-max">{/* 364 celdas h-3 w-3 */}</div>
      <div className="mt-1 grid grid-flow-col gap-[3px] w-max">{/* 52 números w-3 */}</div>
    </div>
    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
      <span>{/* leyenda */}</span>
      <span>Fuente: Registro GOZSter</span>
    </div>
  </CardContent>
</Card>
```

### 5.8. Criterios de aceptación
- GIVEN un alumno con plan activo de 3 días que entrenó 2 veces la semana pasada WHEN el coach abre su detalle THEN la columna de esa semana tiene 2 celdas `bg-primary` y el número `2` en rojo.
- GIVEN la última sesión hace 9 días THEN el badge dice `9 días sin entrenar` en variante `destructive`.
- GIVEN un alumno cuya primera sesión fue hace 10 semanas THEN las 42 semanas anteriores se ven punteadas con `…` y no cuentan para "semanas con objetivo cumplido".
- GIVEN un alumno sin plan activo THEN no hay números en rojo ni mención a objetivo.
- GIVEN un monitor de 1440 px THEN la grilla entra completa sin scroll horizontal.
