-- ============================================================================
-- GOZS-703 (M-1): normalizar el enum public.estado_membresia
-- ----------------------------------------------------------------------------
-- El enum mezclaba dos juegos de valores: ACTIVA/INACTIVA/PENDIENTE/BAJA
-- (migración inicial) y ACTIVE/EXPIRED_PAYMENT_PENDING/ARCHIVED (agregados en
-- 20261016100000). Ninguna función ni RPC escribe los valores en inglés; solo
-- aparecían como sinónimos en filtros. Queda un único juego, en español:
--
--   ACTIVE                  -> ACTIVA   (sinónimo)
--   ARCHIVED                -> BAJA     (sinónimo)
--   EXPIRED_PAYMENT_PENDING -> VENCIDA  (valor propio: bloquea la lectura de la
--                                        rutina y la reserva de clases)
--
-- PostgreSQL no permite quitar valores de un enum, así que se recrea el tipo.
-- Dependencias del tipo (inventariadas con pg_depend): la columna
-- perfiles.estado_membresia, su DEFAULT y la política
-- ejercicios_en_rutina_select_acceso_plan. Se agregan además las 4 funciones
-- que comparaban contra los valores en inglés (plpgsql/sql no registran esa
-- dependencia, pero fallarían en ejecución con "invalid input value for enum").
--
-- Idempotente: si el enum ya tiene solo los 5 valores, no hace nada.
-- ============================================================================

DO $$
DECLARE
  v_fn  regprocedure;
  v_def text;
  v_new text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.estado_membresia'::regtype
      AND enumlabel NOT IN ('ACTIVA', 'INACTIVA', 'PENDIENTE', 'BAJA', 'VENCIDA')
  ) THEN
    RAISE NOTICE 'estado_membresia ya normalizado; nada que hacer';
    RETURN;
  END IF;

  -- 1) Soltar lo que bloquea el cambio de tipo de la columna.
  DROP POLICY IF EXISTS "ejercicios_en_rutina_select_acceso_plan" ON public.ejercicios_en_rutina;
  ALTER TABLE public.perfiles ALTER COLUMN estado_membresia DROP DEFAULT;

  -- 2) Recrear el tipo con un solo juego de valores y mapear los datos.
  ALTER TYPE public.estado_membresia RENAME TO estado_membresia_old;
  CREATE TYPE public.estado_membresia AS ENUM ('ACTIVA', 'INACTIVA', 'PENDIENTE', 'BAJA', 'VENCIDA');

  ALTER TABLE public.perfiles
    ALTER COLUMN estado_membresia TYPE public.estado_membresia
    USING (CASE estado_membresia::text
             WHEN 'ACTIVE' THEN 'ACTIVA'
             WHEN 'ARCHIVED' THEN 'BAJA'
             WHEN 'EXPIRED_PAYMENT_PENDING' THEN 'VENCIDA'
             ELSE estado_membresia::text
           END)::public.estado_membresia;
  ALTER TABLE public.perfiles ALTER COLUMN estado_membresia SET DEFAULT 'ACTIVA';

  DROP TYPE public.estado_membresia_old;

  -- 3) Política: idéntica a la anterior, con 'VENCIDA' en lugar de
  --    'EXPIRED_PAYMENT_PENDING' (el alumno vencido no lee la rutina del día).
  CREATE POLICY "ejercicios_en_rutina_select_acceso_plan"
    ON public.ejercicios_en_rutina
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.dias_rutina d
        JOIN public.planes_entrenamiento p ON p.id = d.plan_id
        WHERE d.id = ejercicios_en_rutina.dia_id
          AND (
            (
              p.alumno_id = auth.uid()
              AND NOT EXISTS (
                SELECT 1
                FROM public.perfiles perf
                WHERE perf.id = auth.uid()
                  AND perf.estado_membresia = 'VENCIDA'
              )
            )
            OR p.profesor_id = auth.uid()
            OR (p.alumno_id IS NULL AND public.es_entrenador_o_admin())
            OR (p.alumno_id IS NOT NULL AND public.es_entrenador_de(p.alumno_id))
            OR public.es_admin()
          )
      )
    );

  -- 4) Funciones: reemplazar los valores en inglés en los filtros, sin tocar el
  --    resto del cuerpo (CREATE OR REPLACE conserva grants y propietario).
  FOREACH v_fn IN ARRAY ARRAY[
    'public.obtener_kpis_negocio(date, date)'::regprocedure,
    'public.obtener_metricas_retencion(uuid)'::regprocedure,
    'public.resumen_clases_alumno(date)'::regprocedure,
    'public._resolver_cobertura_actividad_alumno(uuid, text, date)'::regprocedure
  ] LOOP
    v_def := pg_get_functiondef(v_fn);
    v_new := replace(v_def, '(''ACTIVA'', ''ACTIVE'')', '(''ACTIVA'')');
    v_new := replace(v_new, '(''INACTIVA'', ''BAJA'', ''ARCHIVED'')', '(''INACTIVA'', ''BAJA'')');
    v_new := replace(v_new, '(''INACTIVA'', ''BAJA'', ''EXPIRED_PAYMENT_PENDING'', ''ARCHIVED'')', '(''INACTIVA'', ''BAJA'', ''VENCIDA'')');

    IF v_new ~ '''(ACTIVE|ARCHIVED|EXPIRED_PAYMENT_PENDING)''' THEN
      RAISE EXCEPTION 'GOZS-703: % sigue referenciando valores en inglés de estado_membresia', v_fn;
    END IF;

    IF v_new <> v_def THEN
      EXECUTE v_new;
    END IF;
  END LOOP;
END
$$;
