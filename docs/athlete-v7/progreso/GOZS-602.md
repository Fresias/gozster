# GOZS-602 · R4 · Molestias que no fallen en silencio (PGRST202, 42883, 42P01)

- **Rama:** `fix/602-athlete-molestias-errores`
- **Issue Multica:** GOZS-602
- **Estado:** listo para PR / `in_review`
- **Última actualización:** 2026-11-19 por frontend-eng

## Cambios aplicados
- **1. Categoría "servidor sin la función/tabla" (`src/store/use-athlete-store.ts`):**
  - `PERMANENT_MOLESTIA_CODES` se mantiene exclusivamente con `"42501"` y `"23514"`.
  - Se creó `MISSING_SCHEMA_MOLESTIA_CODES = new Set(["PGRST202", "42883", "42P01"])`.
  - Ante cualquiera de esos códigos en `enviarMolestiaRpc`:
    1. Se registra en `errores_app` (`contexto: "molestia"`, `mensaje_humano: "No se pudo guardar el reporte de molestia."`, `detalle_tecnico` y `payload_resumen` con `code`) **una sola vez por `id` de molestia** (controlado con `molestiasErrorRegistradoIds` en `useAthleteStore`).
    2. La molestia permanece con `envio: "pendiente"` en la cola (`currentSession.molestias` y/o `molestiasPendientesFueraDeSesion`) para reintentarse al abrir la app, al volver la señal o en el siguiente `flushMolestiasPendientes()`.
    3. Cuando la migración ya está aplicada y la RPC responde sin error, la molestia se envía una sola vez, pasa a `envio: "enviada"` y sale de la cola pendiente.
- **2. Estado propio para el aviso visible (`use-athlete-store.ts` + `aviso-molestia.tsx`):**
  - No se utiliza `setSyncError` de `use-offline-queue.ts` (ya que `flushQueue()` limpia `syncError` al iniciar un envío de series).
  - Se agregó `molestiaEnvioError` en `useAthleteStore` y `src/components/athlete/aviso-molestia.tsx` muestra `"No pudimos avisarle a tu coach. Si la molestia es fuerte, escribile por el chat."` con `data-testid="molestia-envio-error"`, manteniéndose visible incluso después de un `flushQueue()` de series y limpiándose cuando la molestia se envía con éxito.
- **3. Tests unitarios (`src/__tests__/athlete-molestias-persistencia.spec.ts`):**
  - Casos parametrizados para `PGRST202`, `42883` y `42P01` verificando los 4 criterios: registro único en `errores_app` ante múltiples reintentos, permanencia en cola con `envio: "pendiente"`, persistencia del aviso visible tras `flushQueue()` de series, y envío único + transición a `"enviada"` + limpieza del aviso cuando la RPC finalmente responde sin error.

## Pedido pendiente a `@Fresias` (`types/database.types.ts` y migraciones en producción)
- No se editó `types/database.types.ts` a mano.
- Queda pendiente por parte de `@Fresias`:
  1. Verificar `supabase migration list` en producción para confirmar que la migración `20261119030000_molestias_sesion.sql` (`registrar_molestia`) esté aplicada.
  2. Regenerar `types/database.types.ts` con el CLI de Supabase contra la base actualizada para incluir la firma tipada de `registrar_molestia`.
