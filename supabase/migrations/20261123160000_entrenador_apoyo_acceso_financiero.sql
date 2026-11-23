-- GOZS-758: entrenador de apoyo opcional por alumno (perfiles.profesor_apoyo_id).
-- El apoyo opera como entrenador (rutinas, sesiones, molestias, chat) pero no ve
-- ni opera dinero (contrataciones, cobros, pagos, v_estado_alumno, RPCs de cobro)
-- salvo que el titular o un ADMIN le conceda apoyo_acceso_financiero.
-- Idempotente: ADD COLUMN IF NOT EXISTS, constraints con guardas, CREATE OR REPLACE.

-- 1. Columnas e invariantes.
ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS profesor_apoyo_id UUID NULL REFERENCES public.perfiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS apoyo_acceso_financiero BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_perfiles_apoyo_vinculo') THEN
    ALTER TABLE public.perfiles ADD CONSTRAINT chk_perfiles_apoyo_vinculo CHECK (
      (profesor_apoyo_id IS NOT NULL OR NOT apoyo_acceso_financiero)
      AND profesor_apoyo_id IS DISTINCT FROM id
      AND (profesor_apoyo_id IS NULL OR profesor_apoyo_id IS DISTINCT FROM profesor_asignado_id)
    );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_perfiles_profesor_apoyo_id
  ON public.perfiles (profesor_apoyo_id)
  WHERE profesor_apoyo_id IS NOT NULL;

-- 2. Normalización del apoyo (corre antes que trg_perfiles_proteger_campos):
--    sin apoyo no hay permiso financiero (también tras ON DELETE SET NULL);
--    si el apoyo pasa a ser el titular, deja de ser apoyo;
--    el apoyo debe ser ENTRENADOR o ADMIN.
CREATE OR REPLACE FUNCTION public.fn_normalizar_apoyo_perfil()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.profesor_asignado_id IS DISTINCT FROM OLD.profesor_asignado_id
     AND NEW.profesor_apoyo_id IS NOT DISTINCT FROM OLD.profesor_apoyo_id
     AND NEW.profesor_asignado_id = NEW.profesor_apoyo_id THEN
    NEW.profesor_apoyo_id := NULL;
  END IF;

  IF NEW.profesor_apoyo_id IS NULL THEN
    NEW.apoyo_acceso_financiero := false;
  ELSIF (TG_OP = 'INSERT' OR NEW.profesor_apoyo_id IS DISTINCT FROM OLD.profesor_apoyo_id)
        AND NOT EXISTS (
          SELECT 1 FROM public.perfiles
          WHERE id = NEW.profesor_apoyo_id AND rol IN ('ENTRENADOR', 'ADMIN')
        ) THEN
    RAISE EXCEPTION 'El entrenador de apoyo debe tener rol ENTRENADOR o ADMIN'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_perfiles_apoyo_normalizar ON public.perfiles;
CREATE TRIGGER trg_perfiles_apoyo_normalizar
  BEFORE INSERT OR UPDATE ON public.perfiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_normalizar_apoyo_perfil();

-- 3. Acceso de entrenador: titular o apoyo (misma firma; las políticas no cambian).
CREATE OR REPLACE FUNCTION public.es_entrenador_de(p_alumno_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfiles
    WHERE id = p_alumno_id
      AND (
        profesor_asignado_id = (SELECT auth.uid())
        OR profesor_apoyo_id = (SELECT auth.uid())
      )
  );
$$;

-- 4. Acceso financiero: titular, o apoyo con permiso concedido.
CREATE OR REPLACE FUNCTION public.es_entrenador_financiero_de(p_alumno_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfiles
    WHERE id = p_alumno_id
      AND (
        profesor_asignado_id = (SELECT auth.uid())
        OR (profesor_apoyo_id = (SELECT auth.uid()) AND apoyo_acceso_financiero)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.es_entrenador_financiero_de(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.es_entrenador_financiero_de(UUID) TO authenticated, service_role;

-- 5. Políticas de tablas financieras.
ALTER POLICY "contrataciones_select_alumno_o_entrenador" ON public.contrataciones
  USING (((alumno_id = (SELECT auth.uid())) OR es_entrenador_financiero_de(alumno_id) OR es_admin()));

ALTER POLICY "contrataciones_insert_entrenador_o_admin" ON public.contrataciones
  WITH CHECK ((es_admin() OR (es_entrenador_o_admin() AND es_entrenador_financiero_de(alumno_id))));

ALTER POLICY "contrataciones_update_entrenador_o_admin" ON public.contrataciones
  USING ((es_admin() OR (es_entrenador_o_admin() AND es_entrenador_financiero_de(alumno_id))))
  WITH CHECK ((es_admin() OR (es_entrenador_o_admin() AND es_entrenador_financiero_de(alumno_id))));

ALTER POLICY "cobros_select_alumno_o_entrenador" ON public.cobros
  USING (((alumno_id = (SELECT auth.uid())) OR es_entrenador_financiero_de(alumno_id) OR es_admin()));

ALTER POLICY "cobros_insert_entrenador_o_admin" ON public.cobros
  WITH CHECK (((estado = 'PENDIENTE'::text) AND (es_admin() OR (es_entrenador_o_admin() AND es_entrenador_financiero_de(alumno_id)))));

ALTER POLICY "pagos_select_alumno_o_entrenador" ON public.pagos
  USING (((alumno_id = (SELECT auth.uid())) OR es_entrenador_financiero_de(alumno_id) OR es_admin()));

-- Auditoría: los registros de contrataciones siguen la regla financiera.
ALTER POLICY "auditoria_cambios_select_staff" ON public.auditoria_cambios
  USING ((es_admin() OR (es_entrenador_o_admin() AND (((entidad = 'contrataciones'::text) AND (EXISTS ( SELECT 1
   FROM contrataciones c
  WHERE ((c.id = auditoria_cambios.entidad_id) AND es_entrenador_financiero_de(c.alumno_id))))) OR ((entidad = 'conversaciones'::text) AND (EXISTS ( SELECT 1
   FROM conversaciones conv
  WHERE ((conv.id = auditoria_cambios.entidad_id) AND es_entrenador_de(conv.alumno_id))))) OR ((entidad = 'planes_entrenamiento'::text) AND (EXISTS ( SELECT 1
   FROM planes_entrenamiento p
  WHERE ((p.id = auditoria_cambios.entidad_id) AND ((p.alumno_id IS NULL) OR es_entrenador_de(p.alumno_id)))))) OR ((entidad = 'dias_rutina'::text) AND (EXISTS ( SELECT 1
   FROM (dias_rutina d
     JOIN planes_entrenamiento p ON ((p.id = d.plan_id)))
  WHERE ((d.id = auditoria_cambios.entidad_id) AND ((p.alumno_id IS NULL) OR es_entrenador_de(p.alumno_id)))))) OR ((entidad = 'ejercicios_en_rutina'::text) AND (EXISTS ( SELECT 1
   FROM ((ejercicios_en_rutina er
     JOIN dias_rutina d ON ((d.id = er.dia_id)))
     JOIN planes_entrenamiento p ON ((p.id = d.plan_id)))
  WHERE ((er.id = auditoria_cambios.entidad_id) AND ((p.alumno_id IS NULL) OR es_entrenador_de(p.alumno_id)))))) OR (autorizado_por = ( SELECT auth.uid() AS uid)) OR (usuario_id = ( SELECT auth.uid() AS uid))))));

-- 6. RPCs financieras: mismo cuerpo, autorización con la regla financiera.
--    Se reescribe el cuerpo vigente para no duplicar cientos de líneas; falla si
--    alguna función ya no contiene el chequeo esperado.
DO $$
DECLARE
  v_firma TEXT;
  v_def TEXT;
BEGIN
  FOREACH v_firma IN ARRAY ARRAY[
    'public.asignar_suscripcion_y_cobro(uuid,uuid,text,numeric,boolean,text,boolean,text,text,integer,boolean)',
    'public.extender_contratacion_excepcional(uuid,date,text)',
    'public.registrar_pago(uuid,numeric,text,text)',
    'public.registrar_y_confirmar_renovacion(uuid,numeric,text,text)',
    'public.renovar_contratacion(uuid,numeric,text,text)'
  ] LOOP
    v_def := pg_get_functiondef(v_firma::regprocedure);
    IF position('public.es_entrenador_financiero_de(' IN v_def) > 0 THEN
      CONTINUE;
    END IF;
    IF position('public.es_entrenador_de(' IN v_def) = 0 THEN
      RAISE EXCEPTION 'GOZS-758: % no contiene el chequeo public.es_entrenador_de', v_firma;
    END IF;
    EXECUTE replace(v_def, 'public.es_entrenador_de(', 'public.es_entrenador_financiero_de(');
  END LOOP;
END;
$$;

-- 7. Perfil: asignación y permiso financiero solo titular/ADMIN; membresía,
--    cuenta y baja requieren acceso financiero; nivel de vista y clave, cualquier entrenador.
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
    IF NEW.profesor_apoyo_id IS NOT NULL OR NEW.apoyo_acceso_financiero THEN
      RAISE EXCEPTION 'Solo el entrenador titular o un administrador puede asignar un entrenador de apoyo'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.rol IS DISTINCT FROM OLD.rol THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar el rol de un perfil'
      USING ERRCODE = '42501';
  END IF;

  -- Permitir si viene del trigger de cambio de contraseña en auth.users
  IF current_setting('gozster.limpiando_password', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF (
    NEW.profesor_asignado_id IS DISTINCT FROM OLD.profesor_asignado_id
    OR NEW.profesor_apoyo_id IS DISTINCT FROM OLD.profesor_apoyo_id
    OR NEW.apoyo_acceso_financiero IS DISTINCT FROM OLD.apoyo_acceso_financiero
  ) AND NOT (
    OLD.id <> auth.uid()
    AND public.es_entrenador_o_admin()
    AND OLD.profesor_asignado_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Solo el entrenador asignado puede modificar la asignación o el entrenador de apoyo del alumno'
      USING ERRCODE = '42501';
  END IF;

  IF (
    NEW.estado_membresia IS DISTINCT FROM OLD.estado_membresia
    OR NEW.estado_cuenta IS DISTINCT FROM OLD.estado_cuenta
    OR NEW.fecha_baja IS DISTINCT FROM OLD.fecha_baja
    OR NEW.fecha_vencimiento_cuota IS DISTINCT FROM OLD.fecha_vencimiento_cuota
  ) AND NOT (
    OLD.id <> auth.uid()
    AND public.es_entrenador_o_admin()
    AND public.es_entrenador_financiero_de(OLD.id)
  ) THEN
    RAISE EXCEPTION 'Solo el entrenador asignado puede modificar cuenta, membresía o baja del alumno (o el de apoyo con acceso financiero)'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.nivel_vista_alumno IS DISTINCT FROM OLD.nivel_vista_alumno
     AND NOT (
       OLD.id <> auth.uid()
       AND public.es_entrenador_o_admin()
       AND public.es_entrenador_de(OLD.id)
     ) THEN
    RAISE EXCEPTION 'Solo el entrenador asignado puede modificar el nivel de vista del alumno (o el de apoyo)'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.debe_cambiar_password IS DISTINCT FROM OLD.debe_cambiar_password THEN
    -- El propio usuario apagando la bandera en su perfil tras cambiar clave
    IF OLD.id = auth.uid() AND OLD.debe_cambiar_password = true AND NEW.debe_cambiar_password = false THEN
      RETURN NEW;
    END IF;

    -- Entrenador o admin gestionando al alumno
    IF OLD.id <> auth.uid()
       AND public.es_entrenador_o_admin()
       AND public.es_entrenador_de(OLD.id) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'No tenés permisos para modificar el estado de cambio de contraseña'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- 8. v_estado_alumno (security_invoker) parte de perfiles: oculta la fila al
--    apoyo sin permiso financiero. Mismas columnas que la versión vigente.
CREATE OR REPLACE VIEW public.v_estado_alumno
WITH (security_invoker = true)
AS
WITH hoy AS (
  SELECT ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date AS d
), referencia AS (
  SELECT DISTINCT ON (c.alumno_id) c.alumno_id,
    c.id,
    c.estado,
    c.fecha_fin,
    c.dias_aviso_previo
  FROM public.contrataciones c
  ORDER BY c.alumno_id, c.fecha_fin DESC, c.created_at DESC
), deuda AS (
  SELECT cb.alumno_id,
    (count(*))::integer AS cobros_vencidos,
    min(cb.fecha_vencimiento) AS primer_vencimiento_impago
  FROM public.cobros cb, hoy
  WHERE ((cb.estado <> 'PAGADO'::text) AND (cb.fecha_vencimiento < hoy.d))
  GROUP BY cb.alumno_id
), estado AS (
  SELECT p.id AS alumno_id,
    p.profesor_asignado_id,
    r.id AS contratacion_id,
    r.estado AS estado_contratacion,
    r.fecha_fin AS fecha_vencimiento,
    COALESCE(d.cobros_vencidos, 0) AS cobros_vencidos,
    d.primer_vencimiento_impago,
    CASE
      WHEN (r.id IS NULL) THEN 'SIN_CONTRATACION'::text
      WHEN (r.estado = 'EN_PAUSA'::text) THEN 'EN_PAUSA'::text
      WHEN ((d.cobros_vencidos > 0) OR (r.estado = 'VENCIDA'::text) OR (r.fecha_fin < hoy.d)) THEN 'VENCIDA'::text
      WHEN (r.estado = 'PENDIENTE_RENOVACION'::text) THEN 'PENDIENTE'::text
      WHEN ((r.fecha_fin - hoy.d) <= r.dias_aviso_previo) THEN 'POR_VENCER'::text
      ELSE 'AL_DIA'::text
    END AS estado
  FROM (((public.perfiles p
    CROSS JOIN hoy)
    LEFT JOIN referencia r ON ((r.alumno_id = p.id)))
    LEFT JOIN deuda d ON ((d.alumno_id = p.id)))
  WHERE ((p.rol = 'ALUMNO'::rol_usuario) OR (r.id IS NOT NULL))
    AND NOT COALESCE(p.profesor_apoyo_id = (SELECT auth.uid()) AND NOT p.apoyo_acceso_financiero, false)
)
SELECT alumno_id,
  profesor_asignado_id,
  contratacion_id,
  estado_contratacion,
  fecha_vencimiento,
  cobros_vencidos,
  primer_vencimiento_impago,
  estado,
  (estado = ANY (ARRAY['AL_DIA'::text, 'POR_VENCER'::text])) AS al_dia
FROM estado;
