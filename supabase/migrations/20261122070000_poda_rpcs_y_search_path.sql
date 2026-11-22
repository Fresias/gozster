-- ============================================================================
-- GOZSter: Poda de RPCs sin uso y search_path fijo en funciones trigger
-- Archivo: supabase/migrations/20261122070000_poda_rpcs_y_search_path.sql
-- Multica Issue: GOZS-691
-- Append-only e idempotente para PostgreSQL 15+ / Supabase.
-- ============================================================================

BEGIN;

-- 1) Poda de 10 RPCs sin invocadores en la aplicación ni dependencias internas
DROP FUNCTION IF EXISTS public.anotar_alumno(uuid, uuid);
DROP FUNCTION IF EXISTS public.registrar_pago(uuid, numeric, text);
DROP FUNCTION IF EXISTS public.registrar_pago_con_descuento(uuid, numeric, text, text);
DROP FUNCTION IF EXISTS public.ingresos_mes(date);
DROP FUNCTION IF EXISTS public.obtener_ranking_ejercicio(uuid);
DROP FUNCTION IF EXISTS public.activar_rutina(uuid);
DROP FUNCTION IF EXISTS public.actualizar_perfil_alumno(uuid, numeric, text);
DROP FUNCTION IF EXISTS public.actualizar_peso_sexo_alumno(uuid, numeric, text);
DROP FUNCTION IF EXISTS public.fecha_habilita_clases(date);
DROP FUNCTION IF EXISTS public.obtener_ficha_alumno_actividades(uuid);

-- 2) Fijar search_path en las funciones trigger que aún no lo tenían explícito
ALTER FUNCTION public.handle_updated_at() SET search_path = public;
ALTER FUNCTION public.handle_conversacion_nuevo_mensaje() SET search_path = public;
ALTER FUNCTION public.rechazar_cambio_precio_historico() SET search_path = public;

COMMIT;
