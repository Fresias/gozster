-- ============================================================================
-- GOZSter: Revocación de privilegios para rol anon y endurecimiento RLS
-- Archivo: supabase/migrations/20261122120000_revocar_anon_y_refinar_rls.sql
-- Multica Issue: GOZS-702
-- Append-only e idempotente para PostgreSQL 15+ / Supabase.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. DEFENSA EN PROFUNDIDAD: REVOCAR PRIVILEGIOS A `anon` EN SCHEMA `public`
-- ============================================================================

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;

DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid, p.oid::regprocedure AS firma, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend d
        WHERE d.objid = p.oid
          AND d.deptype = 'e'
      )
  LOOP
    IF has_function_privilege('authenticated', fn.oid, 'EXECUTE')
       AND fn.proname NOT IN (
         '_resolver_cobertura_actividad_alumno',
         'fn_limpiar_debe_cambiar_password',
         'handle_new_user',
         'restaurar_filas_respaldo'
       ) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.firma);
    END IF;

    IF has_function_privilege('service_role', fn.oid, 'EXECUTE') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.firma);
    END IF;

    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn.firma);
  END LOOP;
END
$$;

-- ============================================================================
-- 2. PROTECCIÓN DE ESTADO CLÍNICO EN `public.alumno_historial_dolor`
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_proteger_estado_historial_dolor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS NULL
     OR auth.role() = 'service_role'
     OR public.es_admin()
     OR (public.es_entrenador_o_admin() AND public.es_entrenador_de(NEW.alumno_id)) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.estado IS DISTINCT FROM 'PENDIENTE'
       OR NEW.estado_recuperacion IS DISTINCT FROM 'ACTIVO'
       OR NEW.notas_profesor IS NOT NULL THEN
      RAISE EXCEPTION 'Solo el entrenador asignado o un administrador puede definir el estado o notas clínicas del reporte'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado
     OR NEW.estado_recuperacion IS DISTINCT FROM OLD.estado_recuperacion
     OR NEW.notas_profesor IS DISTINCT FROM OLD.notas_profesor THEN
    RAISE EXCEPTION 'Solo el entrenador asignado o un administrador puede modificar el estado o notas clínicas del reporte'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alumno_historial_dolor_proteger_estado ON public.alumno_historial_dolor;
CREATE TRIGGER trg_alumno_historial_dolor_proteger_estado
  BEFORE INSERT OR UPDATE ON public.alumno_historial_dolor
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_proteger_estado_historial_dolor();

-- ============================================================================
-- 3. RESTRICCIONES EN `public.alertas_entrenador`
-- ============================================================================

DROP POLICY IF EXISTS "alertas_entrenador_insert" ON public.alertas_entrenador;
CREATE POLICY "alertas_entrenador_insert" ON public.alertas_entrenador
  FOR INSERT TO authenticated
  WITH CHECK (
    public.es_admin()
    OR (
      public.es_entrenador_o_admin()
      AND public.es_entrenador_de(alumno_id)
    )
    OR (
      alumno_id = (SELECT auth.uid())
      AND severidad IN ('BAJA', 'MEDIA')
      AND estado = 'PENDIENTE'
    )
  );

DROP POLICY IF EXISTS "alertas_entrenador_update" ON public.alertas_entrenador;
CREATE POLICY "alertas_entrenador_update" ON public.alertas_entrenador
  FOR UPDATE TO authenticated
  USING (
    public.es_admin()
    OR (
      public.es_entrenador_o_admin()
      AND (profesor_id = (SELECT auth.uid()) OR public.es_entrenador_de(alumno_id))
    )
  )
  WITH CHECK (
    public.es_admin()
    OR (
      public.es_entrenador_o_admin()
      AND (profesor_id = (SELECT auth.uid()) OR public.es_entrenador_de(alumno_id))
    )
  );

DROP POLICY IF EXISTS "alertas_entrenador_delete" ON public.alertas_entrenador;
CREATE POLICY "alertas_entrenador_delete" ON public.alertas_entrenador
  FOR DELETE TO authenticated
  USING (
    public.es_admin()
    OR (
      public.es_entrenador_o_admin()
      AND profesor_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.fn_proteger_alertas_entrenador()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Triggers internos y operaciones privilegiadas mantienen su flujo normal
  IF pg_trigger_depth() > 1 OR auth.role() IS NULL OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.perfiles p
    WHERE p.id = NEW.profesor_id
      AND p.rol IN ('ENTRENADOR', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'alertas_entrenador.profesor_id debe corresponder a un entrenador o administrador'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.es_admin() AND NOT (
    EXISTS (
      SELECT 1
      FROM public.perfiles p
      WHERE p.id = NEW.alumno_id
        AND p.profesor_asignado_id = NEW.profesor_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.entrenador_alumnos ea
      WHERE ea.alumno_id = NEW.alumno_id
        AND ea.entrenador_id = NEW.profesor_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.planes_entrenamiento pe
      WHERE pe.alumno_id = NEW.alumno_id
        AND pe.profesor_id = NEW.profesor_id
    )
  ) THEN
    RAISE EXCEPTION 'alertas_entrenador.profesor_id debe corresponder a un entrenador asignado al alumno'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.es_entrenador_o_admin() THEN
    IF NEW.severidad NOT IN ('BAJA', 'MEDIA') OR NEW.estado <> 'PENDIENTE' THEN
      RAISE EXCEPTION 'Un alumno solo puede crear alertas con severidad acotada (BAJA o MEDIA) y estado PENDIENTE'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alertas_entrenador_proteger ON public.alertas_entrenador;
CREATE TRIGGER trg_alertas_entrenador_proteger
  BEFORE INSERT OR UPDATE ON public.alertas_entrenador
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_proteger_alertas_entrenador();

-- ============================================================================
-- 4. INTEGRIDAD DE `public.conversaciones.responsable_id`
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_proteger_conversacion_responsable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.responsable_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.perfiles p
    WHERE p.id = NEW.responsable_id
      AND p.rol IN ('ENTRENADOR', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'conversaciones.responsable_id solo puede apuntar a un usuario con rol ENTRENADOR o ADMIN'
      USING ERRCODE = '42501';
  END IF;

  IF auth.role() IS NULL OR auth.role() = 'service_role' OR public.es_admin() THEN
    RETURN NEW;
  END IF;

  IF public.es_entrenador_o_admin()
     AND (
       public.es_entrenador_de(NEW.alumno_id)
       OR (TG_OP = 'UPDATE' AND OLD.responsable_id = (SELECT auth.uid()))
     ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.responsable_id IS NOT NULL AND NEW.responsable_id IS DISTINCT FROM (
      SELECT p.profesor_asignado_id
      FROM public.perfiles p
      WHERE p.id = NEW.alumno_id
    ) THEN
      RAISE EXCEPTION 'Solo un entrenador asignado o administrador puede asignar responsable_id'
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.responsable_id IS DISTINCT FROM OLD.responsable_id THEN
      RAISE EXCEPTION 'Solo un entrenador asignado o administrador puede cambiar responsable_id'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversaciones_proteger_responsable ON public.conversaciones;
CREATE TRIGGER trg_conversaciones_proteger_responsable
  BEFORE INSERT OR UPDATE ON public.conversaciones
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_proteger_conversacion_responsable();

-- ============================================================================
-- 5. VISIBILIDAD DE `public.errores_app` Y `public.feedback_clase` POR COACH ASIGNADO
-- ============================================================================

DROP POLICY IF EXISTS "errores_app_select_staff" ON public.errores_app;
CREATE POLICY "errores_app_select_staff"
  ON public.errores_app FOR SELECT TO authenticated
  USING (
    public.es_admin()
    OR (
      public.es_entrenador_o_admin()
      AND (
        usuario_id = (SELECT auth.uid())
        OR public.es_entrenador_de(usuario_id)
      )
    )
  );

DROP POLICY IF EXISTS "feedback_clase_select" ON public.feedback_clase;
CREATE POLICY "feedback_clase_select"
  ON public.feedback_clase FOR SELECT TO authenticated
  USING (
    public.es_admin()
    OR EXISTS (
      SELECT 1
      FROM public.reservas r
      WHERE r.id = reserva_id
        AND (
          r.alumno_id = (SELECT auth.uid())
          OR (
            public.es_entrenador_o_admin()
            AND (
              public.es_entrenador_de(r.alumno_id)
              OR public.es_profesor_de_clase(r.clase_id)
            )
          )
        )
    )
  );

COMMIT;
