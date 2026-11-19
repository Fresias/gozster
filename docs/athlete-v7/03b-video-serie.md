# 03b · Backend: video de la serie

> **Agente:** `@backend-eng` (el frontend lee §2 y §4). Reglas generales y BE-00, del que depende este issue: `03-backend.md`. Checkpoints: `07-checkpoints.md`.

---

## BE-03 · Video de la serie: subida, enlace y envío (D-50)

Se implementa completo en esta épica: **grabar, elegir de la galería o pegar un enlace**, opcional y por serie.

### 1 Migración `<ts>_storage_videos_series.sql`

```sql
-- D-50 (Athlete v7): videos del alumno por serie. Bucket privado.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('videos-series', 'videos-series', false, 104857600,
        ARRAY['video/mp4','video/quicktime','video/webm','video/3gpp'])
ON CONFLICT (id) DO NOTHING;

-- Ruta obligatoria: <alumno_id>/<sesion_id>/<ejercicio_id>/<numero_serie>-<uuid>.<ext>
CREATE POLICY videos_series_insert_propio ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'videos-series' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY videos_series_select_alumno_o_entrenador ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'videos-series' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.es_entrenador_de(((storage.foldername(name))[1])::uuid)
    OR public.es_admin()));

CREATE POLICY videos_series_delete_propio ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'videos-series' AND (storage.foldername(name))[1] = auth.uid()::text);
```

Sin política de UPDATE: un video no se reemplaza, se sube uno nuevo. Verificar que `es_entrenador_de(uuid)` y `es_admin()` existan con esa firma (las usan las políticas actuales). Si el entorno no permite crear políticas sobre `storage.objects` desde migraciones, dejar el SQL en el PR y pedir a `@Fresias` que lo aplique desde el panel.

### 2 Qué se guarda en `registro_series.video_url`

| Origen | Valor |
|---|---|
| Enlace pegado | La URL `https://…` normalizada |
| Archivo subido | `storage:videos-series/<ruta>` (nunca una URL pública ni firmada: vencen) |

`src/lib/athlete/video-serie.ts`:

```ts
export function normalizarEnlaceVideo(texto: string): string | null;   // https, ≤ 2.048 caracteres; http → https; otro esquema → null
export function rutaVideoSerie(a: { alumnoId: string; sesionId: string; ejercicioId: string; numeroSerie: number; ext: string }): string;
export function esVideoDeStorage(v: string | null | undefined): boolean; // empieza con "storage:videos-series/"
export const VIDEO_MAX_BYTES = 104_857_600;                           // 100 MB
export const VIDEO_MAX_SEGUNDOS = 120;
export async function validarArchivoVideo(f: File): Promise<"ok" | "muy-pesado" | "muy-largo" | "formato">;
// duración con un <video> fuera del DOM (loadedmetadata); si el navegador no la informa, se acepta por tamaño
```

### 3 Subida con o sin señal · `src/lib/athlete/video-subida.ts`

- **Cola local en IndexedDB** (API del navegador, sin dependencias): base `gozster-athlete`, store `videos-pendientes`, clave `<alumnoId>|<sesionId>|<ejercicioId>|<numeroSerie>`, valor `{ blob, ext, intentos, creadoAt }`. Una serie tiene un solo video: el nuevo reemplaza al pendiente.
- `encolarVideo(...)` guarda el blob y deja la serie en `videoEstado: "telefono"` (sin señal) o arranca la subida (`"subiendo"`).
- `subirPendientes(alumnoId)`: por cada pendiente del alumno, `supabase.storage.from("videos-series").upload(ruta, blob, { contentType, upsert: false })`. Éxito → borra la entrada de IndexedDB, guarda `video_url = "storage:videos-series/<ruta>"` en la serie y **reencola `WORKOUT_SET_COMPLETED`** con el payload completo de la serie y `videoUrl` (el upsert de la cola es idempotente y escribe `video_url`; `WORKOUT_SET_UPDATED` no lo escribe). Error de red → `intentos++` y queda. Error 4xx (tamaño, formato, permisos) → `videoEstado: "error"` y registro en `errores_app` (contexto `"video_serie"`).
- Disparo: al volver la red (listener `online` que ya existe en el shell), al abrir la app y después de encolar.
- **Aislamiento por usuario:** solo se suben las entradas cuyo `alumnoId` es el usuario autenticado. Al iniciar con otro usuario no se tocan las ajenas (`cerrarSesion` es compartido y no se modifica).
- **iPhone:** Safari puede borrar IndexedDB de sitios no instalados. La tarjeta "Instalá GOZSter" ya lo explica; no se agrega nada.
- La subida de `supabase-js` no informa el progreso: la interfaz muestra "Subiendo…" sin porcentaje (no se agrega `tus-js-client`).

### 4 Store

```ts
// En cada serie de currentSession:
video_url?: string | null;
videoEstado?: "ninguno" | "telefono" | "subiendo" | "listo" | "error";

adjuntarVideoASerie(ejercicioEnRutinaId: string, numeroSerie: number, origen: { tipo: "enlace"; url: string } | { tipo: "archivo"; file: File }): Promise<"ok" | "invalido" | "muy-pesado" | "muy-largo" | "formato">;
quitarVideoDeSerie(ejercicioEnRutinaId: string, numeroSerie: number): void;  // reencola con videoUrl: null y borra el pendiente
reintentarVideoDeSerie(ejercicioEnRutinaId: string, numeroSerie: number): void;
```

`attachVideoForSet` queda como alias de `adjuntarVideoASerie` con `tipo: "enlace"` para no romper los tests existentes, o se reemplaza y se actualizan esos tests.

### 5 Tests

- Unitarios: `normalizarEnlaceVideo` (5 casos: `https://youtu.be/x` válido; `http` → `https`; `javascript:` → `null`; vacío → `null`; > 2.048 → `null`), `rutaVideoSerie`, `esVideoDeStorage`, `validarArchivoVideo` (101 MB → `muy-pesado`).
- Store con IndexedDB simulado (`fake-indexeddb` **no** está instalado y no se agrega: inyectar un adaptador `AlmacenVideos` con una implementación en memoria para tests).
- Sin señal → `telefono`; vuelve la señal → `upload` + `WORKOUT_SET_COMPLETED` con `videoUrl = storage:…`; error 413 → `error`; reintentar → `subiendo` → `listo`.
- PGlite o SQL de políticas: el alumno A no puede subir en la carpeta de B; el entrenador de A puede leer; otro entrenador no.

### 6 Fuera de esta épica

Mostrar el video en Coach Studio (necesita una URL firmada con `createSignedUrl`, desde Coach Studio). Queda anotado para el PM.
