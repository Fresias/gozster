# 03 · Backend

> **Para:** `@backend-eng`. Issues: BE-01, BE-02, BE-03 (`06-issues.md`).
> **Nota:** BE-02 depende de la decisión D4 del PM. BE-01 y BE-03 pueden arrancar ya.
> **Reglas del repo que aplican:** RLS estricta, migraciones idempotentes en `supabase/migrations/`, regenerar `src/types/database.types.ts` si cambia el schema, sin dependencias nuevas, tests con `@electric-sql/pglite` como `src/__tests__/rpc-kpis-negocio.spec.ts`.

---

## 1. BE-01 · Fuente única de KPIs de negocio

### Problema
Cuatro cálculos para los mismos números:

| Vista | Hoy calcula con | Resultado demo |
|---|---|---|
| Inicio (`business-kpi-strip.tsx`) | `DEMO_KPIS_NEGOCIO` ← `derivarKpisNegocio()` en `coach-demo-generator.ts` | Ingresos $800.000, activos 32 |
| Cobros (`cobros-panel.tsx`) | `use-cobros-store.ts → metricas()` (líneas ~790–855) | Ingresos $767.000, tasa 71 %, 29 al día |
| Ingresos (`studio/ingresos/page.tsx`) | constante `CANONICAL_SANKEY_DATA` | Potencial $100.000 |
| Métricas (`retention-kpi-cards.tsx`) | filtro por actividad sobre el dataset | 15 activos |

Ya existe `obtener_kpis_negocio(p_desde, p_hasta)` (`20261022120001_rpc_obtener_kpis_negocio.sql`) y su mapper `mapearRpcAKpis` en `src/lib/kpis-negocio.ts`.

### Definiciones canónicas (las usa todo el producto)

| KPI | Definición | Unidad |
|---|---|---|
| `cobrado` | Suma de `pagos.monto` con `estado = 'CONFIRMADO'` y `confirmado_at` dentro del período (hora AR) | $ |
| `por_cobrar` | Cuotas de alumnos activos con vencimiento dentro del período aún no pagadas y **no vencidas** | $ y cantidad |
| `vencido` | Cuotas de alumnos activos con `fecha_fin < hoy` sin renovar | $ y cantidad de alumnos |
| `facturado` | `cobrado + por_cobrar + vencido` | $ |
| `tasa_cobro_pct` | `round(cobrado / facturado * 100)`; `null` si `facturado = 0` | % |
| `alumnos_total` | Perfiles `rol = 'ALUMNO'` visibles por RLS | n |
| `alumnos_activos` | `estado_membresia IN ('ACTIVA','ACTIVE')` (criterio actual de la RPC) | n |
| `alumnos_al_dia` | Activos **sin** cuota vencida | n |
| `sin_rutina` | Activos sin `planes_entrenamiento` en estado activo | n y ids |
| `sin_entrenar_7d` | Activos sin sesión registrada en los últimos 7 días | n y ids |
| `altas`, `bajas` | Criterio actual de la RPC | n |
| `por_canal` | `cobrado`, `por_cobrar`, `vencido` desglosados por `presencial` (Funcional, Boxeo) y `online` (Rutina online) | $ |

"Al día" en el directorio, en Inicio y en Cobros **es la misma cosa**: activo sin cuota vencida. Una cuota pendiente no vencida cuenta como al día (igual que hoy en `metricas()`).

### Contrato

Extender la RPC (nueva migración `2026110xxxxxxx_rpc_kpis_negocio_v2.sql`, `CREATE OR REPLACE`, mismo guard de rol):

```sql
RETURNS TABLE (
  -- existentes (no romper consumidores)
  ingresos NUMERIC, ingresos_6m NUMERIC[], ingresos_periodo_anterior NUMERIC,
  cobranza_esperada NUMERIC, cobranza_pendiente_monto NUMERIC, cobranza_vencidas_cant BIGINT,
  sin_entrenar_7d_ids UUID[], activos_fin BIGINT, altas BIGINT, bajas BIGINT,
  -- nuevas
  cobranza_vencida_monto NUMERIC,
  cobranza_pendiente_cant BIGINT,
  pagos_cant BIGINT,
  alumnos_total BIGINT,
  alumnos_al_dia BIGINT,
  sin_rutina_ids UUID[],
  por_canal JSONB   -- {"presencial":{"cobrado":0,"por_cobrar":0,"vencido":0,"por_actividad":{"FUNCIONAL":{...},"BOXEO":{...}}},"online":{...}}
)
```

TypeScript (`src/lib/kpis-negocio.ts`):

```ts
export interface KpisNegocio {
  periodo: { desde: string; hasta: string; etiqueta: string };   // etiqueta: "nov", "1–7 nov", "Q4"
  cobrado: number; porCobrar: { monto: number; cant: number }; vencido: { monto: number; cant: number };
  facturado: number; tasaCobroPct: number | null;
  pagosCant: number;
  alumnos: { total: number; activos: number; alDia: number; altas: number; bajas: number };
  sinRutinaIds: string[]; sinEntrenar7dIds: string[];
  ingresos6m: number[]; ingresosPeriodoAnterior: number; variacionPct: number | null;
  porCanal: { presencial: CanalKpi; online: CanalKpi };
  fuente: "rpc" | "demo";
}
export function obtenerKpisNegocio(client, rango: { desde: string; hasta: string }): Promise<KpisNegocio>;
export function rangoPeriodo(tipo: "semana" | "mes" | "trimestre", ahora?: Date): { desde: string; hasta: string; etiqueta: string };
```

- Modo demo: `derivarKpisNegocio()` devuelve **el mismo tipo** `KpisNegocio` con `fuente: "demo"`, calculado sobre `DEMO_GIMNASIO` y sus contrataciones/pagos — no sobre listas paralelas. `use-cobros-store.ts → metricas()` y `CANONICAL_SANKEY_DATA` dejan de calcular KPIs: la lista de Cobros sigue en el store, los totales vienen de `KpisNegocio`.
- Mantener `mapearRpcAKpis` como adaptador interno; marcar `KpisNegocioDatos` como deprecated y migrar consumidores en FE-07/FE-12/FE-15.

### Permisos (decisión existente que hay que respetar en UI)
La RPC es **solo ADMIN** (los montos no se exponen a ENTRENADOR). Contrato para frontend: si el rol es ENTRENADOR, `obtenerKpisNegocio` devuelve montos `null` y el UI muestra solo KPIs de alumnos (Al día, Sin rutina, Sin entrenar). Agregar `export function puedeVerMontos(rol): boolean` y testearlo.

### Pruebas (en el mismo PR)
- pglite: dataset con 3 pagados, 1 pendiente no vencido, 2 vencidos, 1 inactivo → assert de cada campo nuevo.
- Unit: `derivarKpisNegocio(DEMO_GIMNASIO)` y la RPC sobre el mismo seed producen los mismos números.
- Unit: `rangoPeriodo` en bordes de mes y zona AR.

---

## 2. BE-02 · Modelo unificado de dolor

### Problema
Un mismo reporte vive en dos tablas con escalas y estados incompatibles:

| Tabla | Severidad | Estado(s) |
|---|---|---|
| `alumno_historial_dolor` | `LEVE / MODERADO / AGUDO` | `estado` (`PENDIENTE / ATENDIDO / CERRADO`) **y** `estado_recuperacion` (`ACTIVO / EN_RECUPERACION / RESUELTO`) |
| `alertas_entrenador` | `BAJA / MEDIA / ALTA / CRITICA` | `PENDIENTE / RESUELTO / IGNORADO / ATENDIDO / CERRADO` |

El UI agrega una tercera lectura (`zonaDolorActual` del cuestionario inicial) para el badge "Sin red flags".

### Propuesta (D4 = A)

Migración `2026110xxxxxxx_dolor_eva_estado_unico.sql`, idempotente:

1. `alumno_historial_dolor`:
   - `ADD COLUMN IF NOT EXISTS eva SMALLINT CHECK (eva BETWEEN 0 AND 10)`.
   - Backfill: `LEVE → 3`, `MODERADO → 5`, `AGUDO → 8` donde `eva IS NULL`.
   - `severidad` pasa a columna generada o a trigger que la deriva: `eva ≤ 3 → LEVE`, `4–6 → MODERADO`, `≥ 7 → AGUDO`. Se conserva el nombre para no romper el trigger `fn_crear_alerta_sintoma_alarma`.
   - **Estado único del caso:** `estado` con valores `PENDIENTE / ATENDIDO / RESUELTO`. Migrar `CERRADO → RESUELTO`. `estado_recuperacion` queda deprecated (no se escribe más; se mantiene la columna una versión para rollback).
2. `alertas_entrenador` (solo filas con `reporte_dolor_id`):
   - Su `estado` y `severidad` se **espejan** desde el caso por trigger `AFTER UPDATE OF estado, eva ON alumno_historial_dolor`. Mapeo de severidad: `LEVE → BAJA`, `MODERADO → MEDIA`, `AGUDO → ALTA`, síntoma de alarma → `CRITICA`.
   - El UI deja de escribir `alertas_entrenador.estado` para alertas de dolor.
3. Vista `v_dolor_activo` (RLS por `security_invoker`):

```sql
-- una fila por caso no resuelto, la más reciente por (alumno, zona)
alumno_id, caso_id, zona_articular, eva, nivel ('leve'|'moderado'|'alto'), es_sintoma_alarma,
ejercicio_id, ejercicio_nombre, serie, reportado_at, estado, notas_profesor
```
   `nivel = 'alto'` si `eva ≥ 7` o `es_sintoma_alarma`.
4. RPC `actualizar_estado_dolor(p_caso_id UUID, p_estado TEXT, p_nota TEXT DEFAULT NULL)`: valida rol ENTRENADOR/ADMIN y transición (`PENDIENTE ↔ ATENDIDO → RESUELTO`; reabrir `RESUELTO → PENDIENTE` permitido con nota obligatoria). Devuelve la fila de `v_dolor_activo` o `NULL` si quedó resuelto.

### Contrato TS
```ts
export type NivelDolor = "leve" | "moderado" | "alto";
export type EstadoDolor = "PENDIENTE" | "ATENDIDO" | "RESUELTO";
export interface DolorActivo { casoId: string; alumnoId: string; zona: ZonaArticular; eva: number; nivel: NivelDolor;
  alarma: boolean; ejercicio: { id: string; nombre: string } | null; serie: number | null; reportadoAt: string;
  estado: EstadoDolor; notaCoach: string | null }
export function fetchDolorActivo(client, alumnoId?: string): Promise<DolorActivo[]>;
export function actualizarEstadoDolor(client, casoId: string, estado: EstadoDolor, nota?: string): Promise<DolorActivo | null>;
export function nivelDesdeEva(eva: number, alarma: boolean): NivelDolor;   // única función de mapeo
```

Consumidores a migrar (frontend): `critical-alerts-inbox.tsx`, `critical-alerts-store.ts`, `student-pain-alerts.tsx`, `isla-salud-anamnesis.tsx`, `isla-activity-feed.tsx`, columna Alertas del directorio, `alerta-dolor-agudo` del dashboard. El modo demo (`useDemoAlertEstados`) debe producir `DolorActivo[]`.

### Pruebas
- pglite: backfill, derivación de severidad, espejo a `alertas_entrenador`, transiciones válidas e inválidas de la RPC, RLS (un ENTRENADOR no ve casos de alumnos ajenos si así lo define la política actual).
- Unit: `nivelDesdeEva` en 0, 3, 4, 6, 7, 10 y con alarma.

---

## 3. BE-03 · Progresión de cargas derivada

### Problema
`isla-metricas-1rm.tsx` muestra "↑ Sobrecarga Progresiva Verificada" fijo aunque los deltas sean negativos.

### Contrato
En `src/lib/strength-metrics.ts` (o nuevo `src/lib/progresion.ts`):

```ts
export interface ProgresionEjercicio { ejercicioId: string; nombre: string; inicioKg: number; actualKg: number;
  deltaPct: number; tendencia: "sube" | "estable" | "baja" }   // estable si |delta| < 2,5 %
export interface ResumenProgresion { ventana: { desde: string; hasta: string }; ejercicios: ProgresionEjercicio[];
  enProgresion: number; total: number }
export function calcularProgresion(registros: RegistroSerie[], ventanaDias = 60, claves?: string[]): ResumenProgresion;
export function estimar1RM(pesoKg: number, reps: number): { epley: number; brzycki: number };
```
- `inicioKg` = mejor top set de las 2 primeras semanas de la ventana; `actualKg` = mejor top set de las 2 últimas.
- `claves` default: los 4 ejercicios con más registros en la ventana.
- Excluir series de calentamiento (respetar `tipo_serie`).

### Pruebas
Unit con series sintéticas: todo sube, todo baja, mezcla 2/4, ejercicio con una sola semana de datos (se excluye), calentamientos ignorados.

---

## 4. Otros contratos que usa el frontend

| Necesidad | Estado | Acción |
|---|---|---|
| Layout de islas por coach | `localStorage` (`gozster_canvas_layout_${coachId}`) | Sin backend en v1. Si se quiere sincronizar entre dispositivos, issue aparte: tabla `preferencias_coach (coach_id, clave, valor jsonb)`. |
| Búsqueda global ⌘K | No existe | v1 en cliente sobre datos ya cargados (alumnos, rutinas, clases). Sin endpoint nuevo. |
| Registrar pago desde Sheet | Existe en `use-cobros-store` | Confirmar que el pago dispara recálculo de `KpisNegocio` (invalidar caché del período). |
| Perfil de alumno sin `nombre_completo` | Permitido por el schema | No requiere cambio; frontend se protege (FE-01). Evaluar `NOT NULL` con default `''` en otra épica. |

## 5. Entregables de backend por issue (checklist)

- [ ] Migración idempotente + rollback comentado en el encabezado.
- [ ] `database.types.ts` regenerado.
- [ ] Funciones TS con JSDoc y tests pglite + unit.
- [ ] Comentario de cierre en el issue con el contrato final (para que frontend no tenga que leer SQL).
