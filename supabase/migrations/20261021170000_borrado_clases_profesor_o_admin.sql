-- ============================================================================
-- GOZSter: Restricción de borrado de clases a profesor asignado o ADMIN
-- Archivo: supabase/migrations/20261021170000_borrado_clases_profesor_o_admin.sql
-- GitHub Issue: #120 | Multica Issue: GOZS-107
-- Idempotente para PostgreSQL 15+ / Supabase
--
-- Regla de negocio:
--   - La política clases_write_entrenador_o_admin (FOR ALL) permitía que un
--     coach no asignado borrase una clase y eliminase sus reservas en cascada.
--   - Se divide la política en INSERT, UPDATE y DELETE:
--     1. INSERT: permitido a cualquier ENTRENADOR o ADMIN (creación sin regresiones).
--     2. UPDATE: permitido a ENTRENADOR o ADMIN, gobernado por los triggers
--        de protección de estado (cancelar_clase) y de inicio/capacidad (GOZS-104).
--     3. DELETE: permitido ÚNICAMENTE si el usuario es ADMIN o el profesor
--        asignado a la clase (reutilizando public.es_profesor_de_clase(id)).
-- ============================================================================

BEGIN;

-- 1. Eliminar la política permisiva FOR ALL previa si aún existe
DROP POLICY IF EXISTS "clases_write_entrenador_o_admin" ON public.clases;

-- 2. INSERT: cualquier ENTRENADOR o ADMIN puede crear clases
DROP POLICY IF EXISTS "clases_insert_entrenador_o_admin" ON public.clases;
CREATE POLICY "clases_insert_entrenador_o_admin"
  ON public.clases FOR INSERT TO authenticated
  WITH CHECK (public.es_entrenador_o_admin());

-- 3. UPDATE: cualquier ENTRENADOR o ADMIN puede actualizar campos permitidos
--    (trg_clases_proteger_edicion y trg_clases_proteger_estado hacen cumplir
--    las restricciones de inicio/capacidad y estado respectivamente)
DROP POLICY IF EXISTS "clases_update_entrenador_o_admin" ON public.clases;
CREATE POLICY "clases_update_entrenador_o_admin"
  ON public.clases FOR UPDATE TO authenticated
  USING (public.es_entrenador_o_admin())
  WITH CHECK (public.es_entrenador_o_admin());

-- 4. DELETE: solo el profesor asignado o un ADMIN pueden eliminar una clase
DROP POLICY IF EXISTS "clases_delete_profesor_o_admin" ON public.clases;
CREATE POLICY "clases_delete_profesor_o_admin"
  ON public.clases FOR DELETE TO authenticated
  USING (public.es_profesor_de_clase(id));

COMMIT;
