-- ============================================================================
-- GOZSter: Hardening de RLS para alta de alumnos por invitación
-- Migración idempotente para PostgreSQL 15+ / Supabase
-- GitHub Issue: #49 (Auditoría de seguridad Supabase 2026-10-17)
--
-- Modelo de acceso: el entrenador invita al alumno (Edge Function invitar-alumno),
-- el alumno elige su contraseña. Ningún dato del core es legible sin sesión.
--
-- ⚠️ ORDEN DE DESPLIEGUE: aplicar DESPUÉS de que el login del frontend esté en
-- producción. Hasta entonces Studio y Athlete App leen con la clave anónima.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ELIMINAR POLÍTICAS ANÓNIMAS / USING (true) (incluye drift del proyecto en vivo)
-- El proyecto en vivo tiene políticas de lectura para anon que no existen en las
-- migraciones. Se eliminan todas las que apliquen a anon, y las de PUBLIC que
-- no filtren nada.
-- ============================================================================

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        'anon' = ANY (roles)
        OR ('public' = ANY (roles) AND (qual = 'true' OR with_check = 'true'))
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    RAISE NOTICE 'Política insegura eliminada: %.% -> %', pol.schemaname, pol.tablename, pol.policyname;
  END LOOP;
END
$$;

-- ============================================================================
-- 2. POLÍTICAS RLS: habitos_registros y nutricion_registros
-- Reemplazan "FOR ALL TO authenticated, anon USING (true)".
-- El alumno gestiona sus registros; su entrenador (y admin) también.
-- ============================================================================

DROP POLICY IF EXISTS "habitos_lectura_autenticada" ON public.habitos_registros;
DROP POLICY IF EXISTS "habitos_escritura_autenticada" ON public.habitos_registros;
DROP POLICY IF EXISTS "habitos_propio_o_entrenador" ON public.habitos_registros;
CREATE POLICY "habitos_propio_o_entrenador"
  ON public.habitos_registros
  FOR ALL
  TO authenticated
  USING (
    alumno_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
    OR public.es_admin()
  )
  WITH CHECK (
    alumno_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
    OR public.es_admin()
  );

DROP POLICY IF EXISTS "nutricion_lectura_autenticada" ON public.nutricion_registros;
DROP POLICY IF EXISTS "nutricion_escritura_autenticada" ON public.nutricion_registros;
DROP POLICY IF EXISTS "nutricion_propio_o_entrenador" ON public.nutricion_registros;
CREATE POLICY "nutricion_propio_o_entrenador"
  ON public.nutricion_registros
  FOR ALL
  TO authenticated
  USING (
    alumno_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
    OR public.es_admin()
  )
  WITH CHECK (
    alumno_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
    OR public.es_admin()
  );

-- ============================================================================
-- 3. GUARD DE CAMPOS PRIVILEGIADOS EN perfiles (anti escalada de privilegios)
-- Las políticas permiten a un usuario insertar/editar su propio perfil; sin este
-- guard podría asignarse rol ADMIN o ENTRENADOR. Reglas:
--   - rol: sólo ADMIN (o contexto de servidor). Un usuario sólo crea perfiles ALUMNO.
--   - estado_membresia, profesor_asignado_id, fecha_baja: sólo el entrenador del
--     alumno o ADMIN, nunca el propio alumno.
-- Contexto de servidor = service_role (Edge Functions, seeds) o SQL directo sin JWT.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_proteger_campos_perfil()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS NULL OR auth.role() = 'service_role' OR public.es_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.rol <> 'ALUMNO' THEN
      RAISE EXCEPTION 'Solo un administrador puede crear perfiles con rol %', NEW.rol
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.rol IS DISTINCT FROM OLD.rol THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar el rol de un perfil'
      USING ERRCODE = '42501';
  END IF;

  IF (
    NEW.estado_membresia IS DISTINCT FROM OLD.estado_membresia
    OR NEW.profesor_asignado_id IS DISTINCT FROM OLD.profesor_asignado_id
    OR NEW.fecha_baja IS DISTINCT FROM OLD.fecha_baja
  ) AND NOT (
    OLD.id <> auth.uid()
    AND public.es_entrenador_o_admin()
    AND (OLD.profesor_asignado_id = auth.uid() OR public.es_entrenador_de(OLD.id))
  ) THEN
    RAISE EXCEPTION 'Solo el entrenador asignado puede modificar membresía, baja o asignación del alumno'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_perfiles_proteger_campos ON public.perfiles;
CREATE TRIGGER trg_perfiles_proteger_campos
  BEFORE INSERT OR UPDATE ON public.perfiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_proteger_campos_perfil();

-- ============================================================================
-- 4. RPC quick_swap_ejercicio: sin ejecución anónima
-- Su control de permisos acepta "auth.uid() IS NULL" (pensado para SQL directo),
-- condición que también cumple el rol anon vía PostgREST.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.quick_swap_ejercicio(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quick_swap_ejercicio(UUID, UUID, UUID, TEXT) TO authenticated, service_role;

COMMIT;
