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
  <History className="h-4 w-4 shrink-0" aria-hidden="true" />   {/* lucide-react, ya en el bundle */}
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
