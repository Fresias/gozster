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
