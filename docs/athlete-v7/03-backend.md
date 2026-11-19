# 03 · Backend

> **Agente:** `@backend-eng`. Lee además `02-pantallas.md` §1, §3.2, §3.3 y §10, y el protocolo de checkpoints de `07-checkpoints.md`.
> **Regla de alcance:** `00-PM.md §2`. Migraciones solo agregadas (append-only), con RLS explícita. Tipos (`types/database.types.ts`) solo regenerados con el CLI de Supabase, nunca editados a mano. Parámetros opcionales de RPC con `DEFAULT NULL` (lección GOZS-331).
> El esquema de referencia es el de producción que pasó el dueño del producto. Las migraciones usan timestamps de 14 dígitos posteriores a `20261108170000`, únicos (`tests/migrations-unique-versions.spec.ts`).

---

## 0. BE-00 · Id de sesión real (prioridad 0, bloquea BE-02 y BE-03)

### 0.1 El problema (leído en el código)

`loadStudentSession` arma `currentSession.id = \`session-${student.id}-${selectedDia.id}\`` (`use-athlete-store.ts:1768`). Ese valor:

1. **No es un UUID.** La cola manda `registro_sesiones.id = sessionId` (`use-offline-queue.ts`, `sendSetEvent`). Postgres responde `22P02`, que **no** está en `PERMANENT_CODES` (`23514`, `23503`, `42501`), así que se trata como `retry`. Como la cola corta en el primer `retry`, **todas las series que están detrás quedan trabadas** en `pendingEvents`.
2. **Se repite** en cada sesión del mismo día y del mismo alumno: dos sesiones del Día 1 comparten id.

Antes de tocar nada, confirmar en producción (`@Fresias`, SQL de solo lectura): `SELECT count(*) FROM registro_series WHERE created_at > now() - interval '30 days';`. Si da 0 o muy poco con alumnos entrenando, el bug está activo.

### 0.2 Arreglo (todo dentro de `use-athlete-store.ts`)

- `currentSession.id = crypto.randomUUID()` al **crear** una sesión nueva (no al recargar una en curso: la persistida conserva su id).
- `resetSessionToDefaults` y el cierre de sesión dejan el próximo `loadStudentSession` con un id nuevo.
- **Reparación de eventos trabados**, una sola vez al iniciar la app (`repararSesionesNoUuid()`), sin tocar el código de la cola: con `useOfflineQueueStore.getState()` y `setState`, cada evento `WORKOUT_SET_*` cuyo `payload.sessionId` no sea UUID recibe un UUID nuevo, **el mismo para todos los eventos que compartían el id viejo**. Después, `flushQueue()`. También se corrigen `currentSession.id` y `sesionesCompletadas[].id` si tienen el formato viejo.
- `src/lib/athlete/uuid.ts`: `esUuid(v)` (mismo regex que `use-chat-store.ts:76`) y `nuevoUuid()` (con `crypto.randomUUID`, y un respaldo con `crypto.getRandomValues` para navegadores viejos).

### 0.3 Tests

- Sesión nueva → `esUuid(currentSession.id)`; dos sesiones seguidas del mismo día → ids distintos; recargar una sesión en curso → mismo id.
- Cola con 3 eventos `session-A-B` y 2 eventos `session-C-D` → después de reparar: 2 UUIDs distintos, 3 + 2 eventos agrupados igual que antes y orden preservado.

---

## 1. BE-01 · `perfiles.nombre_preferido` (D-53)

### 1.1 Migración `<ts>_perfiles_nombre_preferido.sql`

```sql
-- D-53 (Athlete v7): nombre con el que la app saluda al alumno.
ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS nombre_preferido TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perfiles_nombre_preferido_check') THEN
    ALTER TABLE public.perfiles ADD CONSTRAINT perfiles_nombre_preferido_check
      CHECK (nombre_preferido IS NULL OR char_length(btrim(nombre_preferido)) BETWEEN 1 AND 30);
  END IF;
END $$;

-- Escritura acotada a esa columna: no depende de la política amplia de UPDATE sobre perfiles.
CREATE OR REPLACE FUNCTION public.actualizar_nombre_preferido(p_nombre TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nombre TEXT := NULLIF(btrim(p_nombre), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501'; END IF;
  IF v_nombre IS NOT NULL AND char_length(v_nombre) > 30 THEN
    RAISE EXCEPTION 'El nombre tiene más de 30 caracteres' USING ERRCODE = '22001';
  END IF;
  UPDATE public.perfiles SET nombre_preferido = v_nombre, updated_at = now() WHERE id = auth.uid();
  RETURN v_nombre;
END $$;

REVOKE ALL ON FUNCTION public.actualizar_nombre_preferido(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actualizar_nombre_preferido(TEXT) TO authenticated;
```

Lectura: no hace falta política nueva (`perfiles_select_propio_o_entrenador` cubre la fila propia, y `fetchPlanAlumno` hace `select("*")`).

### 1.2 Contrato con la app

- `src/lib/athlete/nombre.ts`: `nombreParaSaludo({ nombre_preferido, nombre_completo })` → `nombre_preferido` recortado, o primer nombre de `nombre_completo`, o `""`.
- Store: `guardarNombrePreferido(nombre)`: actualiza el estado local al instante; llama la RPC; sin señal, deja `nombrePreferidoPendiente` (persistido) y reintenta al volver la red o al abrir la app.

### 1.3 Tests

PGlite (como `onboarding-cuestionario-vista-minimalista.spec.ts`): actualizar el propio; 31 caracteres → `22001`; vacío → `NULL`; no se puede cambiar el de otro alumno. Unitario de `nombreParaSaludo` (`"  Lu "` → `"Lu"`; `null` + `"Lucía Fernández"` → `"Lucía"`; `null` + `null` → `""`).

---

## 2. BE-02 · Molestias → `03a-molestias.md`

Guardar, asociar a la sesión, ejercicio y serie, outbox sin señal, recuperación y herencia por articulación.

---

## 3. BE-03 · Video de la serie → `03b-video-serie.md`

Bucket privado, subida con o sin señal, enlace y envío del `video_url`.

---

## 4. BE-04 · Indicaciones con formato (D-49)

### 4.1 Sin esquema nuevo ni pantallas nuevas

El coach sigue escribiendo en los campos que ya existen: `ejercicios_en_rutina.notas` (de esta prescripción) y `ejercicios.comentario` (de la biblioteca). La app muestra primero `notas` y, si hay un `comentario` distinto, lo agrega debajo bajo "De la biblioteca".

### 4.2 Convención de texto (guía para coaches: `docs/athlete-v7/guia-indicaciones-coach.md`)

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

- Encabezados (solos en su línea, sin importar mayúsculas, dos puntos opcionales): `Pasos`, `Puntos clave`, `Errores comunes`.
- `Tempo:` y `Respiración:` (o `Respiracion:`) en una línea con su valor.
- Ítems: líneas que empiezan con `1.`, `1)`, `-`, `•` o `*` (el marcador se quita), o líneas sin marcador dentro de una sección.
- Lo anterior al primer encabezado es texto libre. **Un texto viejo sin encabezados se ve igual que hoy.**

### 4.3 Parser · `src/lib/athlete/indicaciones.ts` (mismo algoritmo que `parseInd` de la referencia)

```ts
export interface Indicaciones { libre: string[]; pasos: string[]; clave: string[]; errores: string[]; tempo: string | null; respiracion: string | null; }
export function parseIndicaciones(texto: string | null | undefined): Indicaciones;
export function tieneIndicaciones(i: Indicaciones): boolean;
```

Tests: el ejemplo completo; solo texto libre; encabezados en mayúsculas y sin dos puntos; `\r\n`; líneas vacías; un `Tempo:` en medio de una sección corta la sección; `null` → vacío; texto con `<script>` se devuelve tal cual (React lo escapa: **no usar `dangerouslySetInnerHTML`**).

---

## 5. Lo que backend no hace

- Nada en Coach Studio, en `lib/dolor.ts` ni en el código de `use-offline-queue.ts` (BE-00 solo reescribe datos de eventos propios con `setState`; D3-B, si se aprueba, es aparte).
- No regenera tipos a mano.
- No cambia políticas RLS existentes. Hallazgo anotado para otra épica: el alumno puede actualizar cualquier columna de su fila en `perfiles`.
