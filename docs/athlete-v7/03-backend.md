# 03 · Backend

> **Agente:** `@backend-eng`. Lee además `02-pantallas.md` §1, §3.2, §3.3 y §10.
> **Regla de alcance:** `00-PM.md §2`. Migraciones solo agregadas (append-only), con RLS explícita. Tipos (`types/database.types.ts`) solo regenerados con el CLI de Supabase, nunca editados a mano.
> El esquema de referencia es el de producción que pasó el dueño del producto (tablas `perfiles`, `ejercicios`, `ejercicios_en_rutina`, `registro_series`, `alumno_historial_dolor`… con sus políticas). Lo de abajo se apoya en eso.

---

## 1. BE-01 · `perfiles.nombre_preferido` (D-53)

### 1.1 Migración

Archivo nuevo: `supabase/migrations/<YYYYMMDDHHMMSS>_perfiles_nombre_preferido.sql` (14 dígitos, posterior a `20261108170000`). Usar el timestamp real del día y verificar que la versión sea única (`tests/migrations-unique-versions.spec.ts`).

```sql
-- D-53 (Athlete v7): nombre con el que la app saluda al alumno.
ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS nombre_preferido TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perfiles_nombre_preferido_check') THEN
    ALTER TABLE public.perfiles
      ADD CONSTRAINT perfiles_nombre_preferido_check
      CHECK (nombre_preferido IS NULL OR char_length(btrim(nombre_preferido)) BETWEEN 1 AND 30);
  END IF;
END $$;

-- Escritura acotada a esa columna: no depende de la política amplia de UPDATE sobre perfiles.
CREATE OR REPLACE FUNCTION public.actualizar_nombre_preferido(p_nombre TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre TEXT := NULLIF(btrim(p_nombre), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;
  IF v_nombre IS NOT NULL AND char_length(v_nombre) > 30 THEN
    RAISE EXCEPTION 'El nombre tiene más de 30 caracteres' USING ERRCODE = '22001';
  END IF;
  UPDATE public.perfiles
     SET nombre_preferido = v_nombre, updated_at = now()
   WHERE id = auth.uid();
  RETURN v_nombre;
END $$;

REVOKE ALL ON FUNCTION public.actualizar_nombre_preferido(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actualizar_nombre_preferido(TEXT) TO authenticated;
```

- Parámetro con `DEFAULT NULL` (lección GOZS-331). `NULL` o vacío borra el nombre y la app vuelve al primer nombre de `nombre_completo`.
- **Lectura:** no hace falta una política nueva. `perfiles_select_propio_o_entrenador` ya deja leer la fila propia, y `fetchPlanAlumno` (`src/services/alumnos-service.ts:39`) hace `select("*")`, así que la columna llega sola.
- Coach Studio no se toca. El entrenador puede leer la columna por la política existente si algún día la quiere mostrar.

### 1.2 Tipos

Regenerar `types/database.types.ts` con `supabase gen types typescript` (o el comando que use el repo) y commitear el resultado. Si el entorno no tiene acceso al proyecto de Supabase, pedir a `@Fresias` que corra la generación: **no editar a mano** (`write.generated`).

### 1.3 Contrato con la app (en `src/store/use-athlete-store.ts`)

```ts
// Nombre para saludar: nombre_preferido o primer nombre de nombre_completo.
export function nombreParaSaludo(p: { nombre_preferido?: string | null; nombre_completo?: string | null }): string;
// Guarda con la RPC. Sin señal: actualiza el estado local, encola y reintenta al volver (mismo patrón que el resto del store).
guardarNombrePreferido: (nombre: string) => Promise<void>;
```

`nombreParaSaludo` va en `src/lib/athlete/nombre.ts` con tests: `"  Lu "` → `"Lu"`; `null` + `"Lucía Fernández"` → `"Lucía"`; `null` + `null` → `""` (la interfaz muestra "Hola." sin nombre, y nunca rompe con un perfil incompleto, como hoy en `inicio-mis-dias.tsx`).

### 1.4 Tests

- PGlite (como `onboarding-cuestionario-vista-minimalista.spec.ts`): aplicar la migración; un alumno actualiza su nombre por RPC; con 31 caracteres falla; vacío deja `NULL`; un alumno **no** puede cambiar el de otro (la función usa `auth.uid()`).
- Unitario de `nombreParaSaludo`.

---

## 2. BE-02 · Molestias: datos correctos y herencia por articulación (D-51)

### 2.1 Arreglos del insert actual (`use-athlete-store.ts`, `reportPainEvent`, ~línea 775)

| Hoy | Debe ser |
|---|---|
| No envía `eva` | `eva: report.intensidadNumerica` (1 a 10). El trigger `fn_derivar_severidad_dolor` (migración `20261106110000`) deriva la severidad. Conservar `severidad` en el insert por compatibilidad. |
| `ejercicio_id` = id de la fila de la rutina; si no mide 36 caracteres, usa el id falso `30000000-…-0001` | `ejercicio_id` = **`ejercicios.id`** del ejercicio (`ej.ejercicio_id`, que la app ya tiene). Si no hay id válido, **no inventar uno**: encolar el evento y registrarlo en `errores_app` con `contexto: "molestia_sin_ejercicio"`. |
| `catch {}` silencioso | Encolar el evento para reintento (`PAIN_REPORT_SUBMITTED` ya existe en la cola) y no perderlo. |

### 2.2 Estado de molestias de la sesión

Reemplazar el único `activePainBanner` por una lista dentro de la sesión actual (persistida con `currentSession`, así sobrevive a recargar la página durante la sesión y se borra con `resetSessionToDefaults` y al cerrar la sesión):

```ts
export type ZonaArticular = "HOMBRO" | "RODILLA" | "LUMBAR" | "CODO" | "CUELLO" | "CADERA" | "TOBILLO" | "OTRO";
export type NivelMolestia = "leve" | "moderada" | "alta" | "alarma";

export interface MolestiaSesion {
  ejercicioEnRutinaId: string; // ej.id en currentSession
  ejercicioId: string;         // ejercicios.id
  zona: ZonaArticular;
  intensidad: number;          // 1-10
  nivel: NivelMolestia;        // alarma si hay síntoma o intensidad 10; alta 7-9; moderada 4-6; leve 1-3
  reportadaAt: number;
}
// currentSession.molestias: MolestiaSesion[]  (opcional; por defecto [])
```

- Si el alumno reporta dos veces el mismo ejercicio, queda la última.
- `stopProtocolActive` se mantiene para la alarma. `activePainBanner` y `PainReportBanner` dejan de usarse en la app (FE-08). `getPainBannerConfig` se puede reusar para el copy, adaptado al de `02-pantallas.md §3.3`.

### 2.3 Herencia por articulación (lógica pura)

Archivo nuevo: `src/lib/athlete/molestias.ts`. Los grupos son las etiquetas canónicas de `ejercicios.musculos_principales` (migración `20261108170000_etiquetado_canonico_ejercicios.sql`: Pecho, Espalda, Piernas, Hombros, Brazos, Core).

```ts
export const TREN_SUPERIOR = ["Pecho", "Espalda", "Hombros", "Brazos"] as const;
export const TREN_INFERIOR = ["Piernas"] as const;

export const GRUPOS_POR_ZONA: Record<ZonaArticular, readonly string[]> = {
  HOMBRO: TREN_SUPERIOR,
  CODO: TREN_SUPERIOR,
  CUELLO: TREN_SUPERIOR,
  RODILLA: TREN_INFERIOR,
  CADERA: TREN_INFERIOR,
  TOBILLO: TREN_INFERIOR,
  LUMBAR: [...TREN_SUPERIOR, ...TREN_INFERIOR, "Core"], // ambos trenes (y core)
  OTRO: [],                                             // solo el ejercicio reportado
};

export type AvisoMolestia =
  | { tipo: "propio"; molestia: MolestiaSesion }      // aviso completo; alta y alarma bloquean
  | { tipo: "heredado"; origen: MolestiaSesion }      // "! Molestia reportada"; no bloquea
  | null;

/** Para un ejercicio de la sesión: su propio aviso, uno heredado o nada. */
export function avisoMolestiaPara(
  ejercicio: { id: string; musculos_principales?: string[] | null },
  molestias: MolestiaSesion[],
): AvisoMolestia;

/** true solo si el ejercicio tiene molestia PROPIA alta o alarma. La heredada nunca bloquea. */
export function ejercicioBloqueado(ejercicioEnRutinaId: string, molestias: MolestiaSesion[]): boolean;
```

Reglas:
1. Si hay una molestia propia del ejercicio, gana la propia.
2. Si no, hereda la primera molestia de **otro** ejercicio cuya zona incluya alguno de los `musculos_principales` del ejercicio (comparación sin tildes ni mayúsculas).
3. Un ejercicio sin grupo canónico (array vacío o etiquetas viejas) nunca hereda.
4. La zona `OTRO` nunca hereda.

Tests (`src/__tests__/athlete-molestias-herencia.spec.ts`), uno por caso de la tabla:

| Reportado en | Zona | Ejercicio evaluado (grupo) | Resultado |
|---|---|---|---|
| Press banca (Pecho) | HOMBRO | Remo (Espalda) | heredado |
| Press banca (Pecho) | HOMBRO | Sentadilla (Piernas) | null |
| Press banca (Pecho) | HOMBRO | Plancha (Core) | null |
| Sentadilla (Piernas) | LUMBAR | Plancha (Core) | heredado |
| Sentadilla (Piernas) | LUMBAR | Press militar (Hombros) | heredado |
| Sentadilla (Piernas) | RODILLA | Peso muerto rumano (Piernas) | heredado |
| Press banca (Pecho) | OTRO | Remo (Espalda) | null |
| Press banca (Pecho) | HOMBRO | Press banca (Pecho) | propio |
| Press banca alta (8) | HOMBRO | Remo | heredado y `ejercicioBloqueado(remo) === false` |
| — | — | Sesión nueva | `molestias = []` |

---

## 3. BE-03 · Video por serie (D-50, decisión D2 del PM)

### 3.1 El problema

`registro_series.video_url` ya existe y la cola ya lo manda en `WORKOUT_SET_COMPLETED`. Pero el alumno adjunta el video **después** de registrar la serie, y `attachVideoForSet` (`use-athlete-store.ts:861`) solo cambia el estado local: **nunca se envía**. Además, `WORKOUT_SET_UPDATED` solo actualiza peso y reps.

### 3.2 Arreglo dentro del alcance (sin tocar `use-offline-queue.ts`)

En `attachVideoForSet`, después de actualizar el estado local, volver a encolar **`WORKOUT_SET_COMPLETED`** con el payload completo de esa serie (el mismo que arma el registro original) más `videoUrl`. El upsert de la cola es idempotente (`onConflict: "sesion_id,ejercicio_id,numero_serie"`) y escribe `video_url`. Quitar el video = encolar lo mismo con `videoUrl: null`.

Validación del enlace en `src/lib/athlete/video-serie.ts`:

```ts
/** Acepta https:// de cualquier dominio. Devuelve la URL normalizada o null. */
export function normalizarEnlaceVideo(texto: string): string | null;
```

Tests: `https://youtu.be/x` válido; `http://…` se convierte a `https://`; `javascript:alert(1)` → `null`; vacío → `null`; más de 2.048 caracteres → `null`.

### 3.3 Si el PM elige D2-B (archivo desde el teléfono)

Queda para otra épica: bucket privado `videos-series`, políticas de Storage (el alumno escribe en `alumno_id/…`, el entrenador lee con `es_entrenador_de`), límite de tamaño y subida diferida sin señal. No se implementa en esta épica.

---

## 4. BE-04 · Indicaciones con formato (D-49)

### 4.1 Sin esquema nuevo ni pantallas nuevas

El coach sigue escribiendo en los campos de texto que ya existen en Coach Studio:

- `ejercicios_en_rutina.notas`: indicaciones de **esta** prescripción (las pone el coach en la rutina).
- `ejercicios.comentario`: indicaciones de la **biblioteca** (generales del ejercicio).

La app muestra primero `notas` y, si también hay `comentario` distinto, lo agrega debajo bajo el subtítulo "De la biblioteca" (hoy `exercise-notes-modal.tsx` ya lee los dos).

### 4.2 Convención de texto (guía para coaches)

Archivo nuevo: `docs/athlete-v7/guia-indicaciones-coach.md`, con esto:

```
Pasos:
1. Barra apoyada en los trapecios.
2. Pies al ancho de la cadera.
Puntos clave:
- Las rodillas siguen la dirección de las puntas.
Errores comunes:
- Talones que se despegan del piso.
Tempo: 3-1-X-1
Respiración: inspirá arriba, aguantá al bajar.
```

- Encabezados reconocidos, sin importar mayúsculas y con los dos puntos opcionales, cada uno solo en su línea: `Pasos`, `Puntos clave`, `Errores comunes`.
- `Tempo:` y `Respiración:` (o `Respiracion:`) van en una sola línea con su valor.
- Ítems: líneas que empiezan con `1.`, `1)`, `-`, `•` o `*` (el marcador se quita). También se aceptan líneas sin marcador dentro de una sección.
- Lo que está antes del primer encabezado es texto libre y se muestra como párrafos.
- **Un texto viejo sin encabezados se ve igual que hoy** (todo como texto libre). No hace falta migrar datos.

### 4.3 Parser (lógica pura)

Archivo nuevo: `src/lib/athlete/indicaciones.ts`. Es el mismo algoritmo que `parseInd` de la referencia.

```ts
export interface Indicaciones {
  libre: string[];
  pasos: string[];
  clave: string[];
  errores: string[];
  tempo: string | null;
  respiracion: string | null;
}
export function parseIndicaciones(texto: string | null | undefined): Indicaciones;
export function tieneIndicaciones(i: Indicaciones): boolean;
```

Tests: el ejemplo de §4.2 completo; solo texto libre; encabezados en mayúsculas y sin dos puntos; `\r\n`; líneas vacías; un `Tempo:` en medio de una sección corta la sección; `null` → todo vacío; texto con `<script>` se devuelve tal cual (el componente lo escapa al renderizar: React lo hace solo, **no usar `dangerouslySetInnerHTML`**).

---

## 5. Lo que backend no hace

- Nada en Coach Studio, en `use-offline-queue.ts` (salvo D3-B aprobada) ni en `lib/dolor.ts`.
- No regenera tipos a mano.
- No cambia políticas RLS existentes. El hallazgo de que el alumno puede actualizar cualquier columna de su fila en `perfiles` queda anotado en `00-PM.md §6` para otra épica.
