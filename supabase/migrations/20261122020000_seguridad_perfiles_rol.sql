-- ============================================================================
-- GOZSter: Endurecimiento de permisos en perfiles, handle_new_user y RPCs de planes
-- Archivo: supabase/migrations/20261122020000_seguridad_perfiles_rol.sql
-- Multica Issue: GOZS-683
-- Append-only e idempotente para PostgreSQL 15+ / Supabase.
-- ============================================================================

BEGIN;

-- 1) handle_new_user: el rol de un usuario nuevo solo puede venir de raw_app_meta_data
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_nombre TEXT;
  v_rol public.rol_usuario := 'ALUMNO'::public.rol_usuario;
  v_rol_raw TEXT;
  v_sexo TEXT;
  v_peso NUMERIC(5,2);
BEGIN
  -- Extraer nombre del metadata o derivar del email
  v_nombre := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'nombre_completo'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'name'), ''),
    split_part(COALESCE(NEW.email, 'Usuario'), '@', 1)
  );

  -- El rol nunca sale de raw_user_meta_data (editable por el usuario en signUp).
  -- Solo se respeta raw_app_meta_data, administrado por service_role / Admin API.
  v_rol_raw := upper(btrim(COALESCE(NEW.raw_app_meta_data ->> 'rol', '')));
  IF v_rol_raw IN ('ADMIN', 'ENTRENADOR', 'ALUMNO') THEN
    v_rol := v_rol_raw::public.rol_usuario;
  END IF;

  -- Sexo biológico ('M' o 'F')
  v_sexo := upper(btrim(COALESCE(NEW.raw_user_meta_data ->> 'sexo', '')));
  IF v_sexo NOT IN ('M', 'F') THEN
    v_sexo := NULL;
  END IF;

  -- Peso corporal (kg)
  BEGIN
    v_peso := (NEW.raw_user_meta_data ->> 'peso_corporal_kg')::NUMERIC(5,2);
    IF v_peso <= 0 OR v_peso > 500 THEN
      v_peso := NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_peso := NULL;
  END;

  INSERT INTO public.perfiles (
    id,
    email,
    nombre_completo,
    rol,
    estado_membresia,
    sexo,
    peso_corporal_kg
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_nombre,
    v_rol,
    'ACTIVA',
    v_sexo,
    v_peso
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.perfiles.email),
    nombre_completo = CASE
      WHEN public.perfiles.nombre_completo IS NULL OR public.perfiles.nombre_completo = ''
      THEN EXCLUDED.nombre_completo
      ELSE public.perfiles.nombre_completo
    END,
    sexo = COALESCE(EXCLUDED.sexo, public.perfiles.sexo),
    peso_corporal_kg = COALESCE(EXCLUDED.peso_corporal_kg, public.perfiles.peso_corporal_kg),
    updated_at = now();

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.perfiles (
        id,
        email,
        nombre_completo,
        rol,
        estado_membresia
      )
      VALUES (
        NEW.id,
        NEW.email,
        split_part(COALESCE(NEW.email, 'Usuario'), '@', 1),
        'ALUMNO',
        'ACTIVA'
      )
      ON CONFLICT (id) DO NOTHING;
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
    RETURN NEW;
END;
$function$;

-- 2) Eliminar trigger trg_00_upsert_perfiles y fn_upsert_perfil_si_existe.
--    Los escritores de perfiles deben usar INSERT ... ON CONFLICT (id) DO UPDATE explícito.
DROP TRIGGER IF EXISTS trg_00_upsert_perfiles ON public.perfiles;
DROP FUNCTION IF EXISTS public.fn_upsert_perfil_si_existe();

-- 3) fn_proteger_campos_perfil: el alumno no puede modificar fecha_vencimiento_cuota
CREATE OR REPLACE FUNCTION public.fn_proteger_campos_perfil()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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

  -- Permitir si viene del trigger de cambio de contraseña en auth.users
  IF current_setting('gozster.limpiando_password', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF (
    NEW.estado_membresia IS DISTINCT FROM OLD.estado_membresia
    OR NEW.estado_cuenta IS DISTINCT FROM OLD.estado_cuenta
    OR NEW.profesor_asignado_id IS DISTINCT FROM OLD.profesor_asignado_id
    OR NEW.fecha_baja IS DISTINCT FROM OLD.fecha_baja
    OR NEW.nivel_vista_alumno IS DISTINCT FROM OLD.nivel_vista_alumno
    OR NEW.fecha_vencimiento_cuota IS DISTINCT FROM OLD.fecha_vencimiento_cuota
  ) AND NOT (
    OLD.id <> auth.uid()
    AND public.es_entrenador_o_admin()
    AND (OLD.profesor_asignado_id = auth.uid() OR public.es_entrenador_de(OLD.id))
  ) THEN
    RAISE EXCEPTION 'Solo el entrenador asignado puede modificar cuenta, membresía, baja, asignación o nivel de vista del alumno'
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
       AND (OLD.profesor_asignado_id = auth.uid() OR public.es_entrenador_de(OLD.id)) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'No tenés permisos para modificar el estado de cambio de contraseña'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

-- 4) Restringir ejecución de obtener_ranking_ejercicio(uuid)
REVOKE EXECUTE ON FUNCTION public.obtener_ranking_ejercicio(uuid) FROM PUBLIC, anon, authenticated;

-- 5) Lógica de tres valores: envolver comparaciones con auth.uid() en COALESCE(..., false)
-- clonar_plan_entrenamiento
CREATE OR REPLACE FUNCTION public.clonar_plan_entrenamiento(p_plan_id uuid, p_nuevo_nombre text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan_origen public.planes_entrenamiento%ROWTYPE;
  v_nuevo_plan_id UUID;
  v_nuevo_dia_id UUID;
  v_nombre_final TEXT;
  r_dia RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_plan_origen
  FROM public.planes_entrenamiento
  WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan de entrenamiento no encontrado con ID: %', p_plan_id;
  END IF;

  IF NOT (
    public.es_admin()
    OR COALESCE(v_plan_origen.profesor_id = auth.uid(), false)
    OR (v_plan_origen.alumno_id IS NOT NULL AND public.es_entrenador_de(v_plan_origen.alumno_id))
    OR (v_plan_origen.alumno_id IS NULL AND public.es_entrenador_o_admin())
  ) THEN
    RAISE EXCEPTION 'No autorizado para clonar este plan de entrenamiento';
  END IF;

  v_nombre_final := COALESCE(NULLIF(TRIM(p_nuevo_nombre), ''), v_plan_origen.nombre || ' (Copia)');

  INSERT INTO public.planes_entrenamiento (
    profesor_id,
    alumno_id,
    nombre,
    estado,
    comentarios,
    fecha_inicio,
    fecha_fin,
    tipo,
    etiqueta,
    tags,
    plan_origen_id
  )
  VALUES (
    COALESCE(auth.uid(), v_plan_origen.profesor_id),
    v_plan_origen.alumno_id,
    v_nombre_final,
    'BORRADOR',
    v_plan_origen.comentarios,
    now(),
    NULL,
    v_plan_origen.tipo,
    v_plan_origen.etiqueta,
    COALESCE(v_plan_origen.tags, '{}'),
    v_plan_origen.id
  )
  RETURNING id INTO v_nuevo_plan_id;

  FOR r_dia IN
    SELECT id, nombre, orden
    FROM public.dias_rutina
    WHERE plan_id = p_plan_id
    ORDER BY orden ASC
  LOOP
    INSERT INTO public.dias_rutina (plan_id, nombre, orden)
    VALUES (v_nuevo_plan_id, r_dia.nombre, r_dia.orden)
    RETURNING id INTO v_nuevo_dia_id;

    INSERT INTO public.ejercicios_en_rutina (
      dia_id,
      ejercicio_id,
      orden,
      series,
      repeticiones,
      descanso_segundos,
      rpe_objetivo,
      notas,
      es_superserie,
      grupo_superserie,
      tempo,
      tempo_activo,
      tipo_serie,
      force_rpe_required,
      tipo_medicion,
      tiempo_objetivo_segundos,
      es_unilateral
    )
    SELECT
      v_nuevo_dia_id,
      e.ejercicio_id,
      e.orden,
      e.series,
      e.repeticiones,
      e.descanso_segundos,
      e.rpe_objetivo,
      e.notas,
      e.es_superserie,
      e.grupo_superserie,
      e.tempo,
      e.tempo_activo,
      e.tipo_serie,
      e.force_rpe_required,
      e.tipo_medicion,
      e.tiempo_objetivo_segundos,
      e.es_unilateral
    FROM public.ejercicios_en_rutina e
    WHERE e.dia_id = r_dia.id
    ORDER BY e.orden ASC;
  END LOOP;

  RETURN v_nuevo_plan_id;
END;
$function$;

-- extender_vigencia_plan
CREATE OR REPLACE FUNCTION public.extender_vigencia_plan(p_plan_id uuid, p_dias_adicionales integer)
 RETURNS planes_entrenamiento
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan public.planes_entrenamiento%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión' USING ERRCODE = '42501';
  END IF;
  IF p_dias_adicionales IS NULL OR p_dias_adicionales <= 0 THEN
    RAISE EXCEPTION 'El número de días adicionales debe ser mayor a 0';
  END IF;

  SELECT * INTO v_plan
  FROM public.planes_entrenamiento
  WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan de entrenamiento no encontrado con ID: %', p_plan_id;
  END IF;

  IF NOT (
    public.es_admin()
    OR COALESCE(v_plan.profesor_id = auth.uid(), false)
    OR (v_plan.alumno_id IS NOT NULL AND public.es_entrenador_de(v_plan.alumno_id))
    OR (v_plan.alumno_id IS NULL AND public.es_entrenador_o_admin())
  ) THEN
    RAISE EXCEPTION 'No autorizado para extender la vigencia de este plan';
  END IF;

  UPDATE public.planes_entrenamiento
  SET
    fecha_fin = GREATEST(COALESCE(fecha_fin, now()), now()) + (p_dias_adicionales || ' days')::INTERVAL,
    estado = 'ACTIVO',
    updated_at = now()
  WHERE id = p_plan_id
  RETURNING * INTO v_plan;

  RETURN v_plan;
END;
$function$;

-- activar_rutina
CREATE OR REPLACE FUNCTION public.activar_rutina(p_plan_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan public.planes_entrenamiento%ROWTYPE;
  v_ahora TIMESTAMPTZ := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para activar una rutina' USING ERRCODE = 'GZ010';
  END IF;

  SELECT * INTO v_plan FROM public.planes_entrenamiento WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La rutina que intentas activar ya no existe' USING ERRCODE = 'GZ010';
  END IF;
  IF v_plan.alumno_id IS NULL THEN
    RAISE EXCEPTION 'Una plantilla no se puede activar: asígnala primero a un alumno' USING ERRCODE = 'GZ010';
  END IF;
  IF NOT (
    public.es_admin()
    OR COALESCE(v_plan.profesor_id = auth.uid(), false)
    OR public.es_entrenador_de(v_plan.alumno_id)
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para activar esta rutina' USING ERRCODE = 'GZ010';
  END IF;

  -- serializa activaciones concurrentes sobre el mismo alumno
  PERFORM 1 FROM public.planes_entrenamiento WHERE alumno_id = v_plan.alumno_id FOR UPDATE;

  UPDATE public.planes_entrenamiento
  SET estado = 'INACTIVO', fecha_fin = v_ahora
  WHERE alumno_id = v_plan.alumno_id AND estado = 'ACTIVO' AND id <> p_plan_id;

  UPDATE public.planes_entrenamiento
  SET estado = 'ACTIVO', fecha_inicio = v_ahora, fecha_fin = NULL
  WHERE id = p_plan_id;

  RETURN p_plan_id;
END;
$function$;

-- asignar_rutina_a_alumno
CREATE OR REPLACE FUNCTION public.asignar_rutina_a_alumno(p_plan_id uuid, p_alumno_id uuid, p_nombre text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_origen public.planes_entrenamiento%ROWTYPE;
  v_nuevo_id UUID;
  v_ahora TIMESTAMPTZ := now();
BEGIN
  IF auth.uid() IS NULL OR NOT (public.es_admin() OR public.es_entrenador_de(p_alumno_id)) THEN
    RAISE EXCEPTION 'Ese alumno no está asignado a tu cuenta' USING ERRCODE = 'GZ010';
  END IF;

  SELECT * INTO v_origen FROM public.planes_entrenamiento WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La rutina que intentas asignar ya no existe' USING ERRCODE = 'GZ010';
  END IF;
  IF NOT (
    public.es_admin()
    OR COALESCE(v_origen.profesor_id = auth.uid(), false)
    OR (v_origen.alumno_id IS NULL AND public.es_entrenador_o_admin())
    OR (v_origen.alumno_id IS NOT NULL AND public.es_entrenador_de(v_origen.alumno_id))
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para asignar esta rutina' USING ERRCODE = 'GZ010';
  END IF;

  -- serializa asignaciones concurrentes al mismo alumno
  PERFORM 1 FROM public.perfiles WHERE id = p_alumno_id FOR UPDATE;

  UPDATE public.planes_entrenamiento
  SET estado = 'INACTIVO', fecha_fin = v_ahora
  WHERE alumno_id = p_alumno_id AND estado = 'ACTIVO';

  v_nuevo_id := public.clonar_plan_entrenamiento(p_plan_id, COALESCE(NULLIF(btrim(p_nombre), ''), v_origen.nombre));

  UPDATE public.planes_entrenamiento
  SET alumno_id = p_alumno_id,
      profesor_id = auth.uid(),
      tipo = 'DE_ALUMNO',
      estado = 'ACTIVO',
      fecha_inicio = v_ahora,
      fecha_fin = NULL
  WHERE id = v_nuevo_id;

  RETURN v_nuevo_id;
END;
$function$;

-- guardar_rutina
CREATE OR REPLACE FUNCTION public.guardar_rutina (p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan_id UUID := NULLIF(p_payload #>> '{plan_id}', '')::UUID;
  v_como_nueva BOOLEAN := COALESCE((p_payload #>> '{como_nueva}')::BOOLEAN, false);
  v_alumno_id UUID := NULLIF(p_payload #>> '{alumno_id}', '')::UUID;
  v_nombre TEXT := NULLIF(TRIM(p_payload #>> '{nombre}'), '');
  v_plan public.planes_entrenamiento%ROWTYPE;
  v_estado public.estado_plan;
  v_estado_pedido TEXT := NULLIF(p_payload #>> '{estado}', '');
  v_nuevo_id UUID;
  v_dia_id UUID;
  v_dia JSONB;
  v_ej JSONB;
  v_dia_n INTEGER := 0;
  v_ej_n INTEGER;
  v_ej_nombre TEXT;
  v_grupos_validos INTEGER[];
  v_es_ss BOOLEAN;
  v_restriccion TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.es_entrenador_o_admin() THEN
    RAISE EXCEPTION 'No tienes permiso para guardar rutinas' USING ERRCODE = 'GZ010';
  END IF;
  IF v_nombre IS NULL THEN
    RAISE EXCEPTION 'La rutina necesita un nombre' USING ERRCODE = 'GZ010';
  END IF;
  -- GOZS-323: tope de comentarios del plan, con mensaje humano antes de tocar nada
  IF char_length(p_payload #>> '{comentarios}') > 5000 THEN
    RAISE EXCEPTION 'Los comentarios de la rutina no pueden superar los 5000 caracteres'
      USING ERRCODE = 'GZ010';
  END IF;
  IF v_estado_pedido IS NOT NULL AND v_estado_pedido NOT IN ('BORRADOR', 'ACTIVO') THEN
    RAISE EXCEPTION 'Estado de rutina inválido' USING ERRCODE = 'GZ010';
  END IF;
  IF jsonb_typeof(p_payload -> 'dias') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_payload -> 'dias') = 0 THEN
    RAISE EXCEPTION 'La rutina necesita al menos un día' USING ERRCODE = 'GZ010';
  END IF;

  IF v_plan_id IS NOT NULL THEN
    SELECT * INTO v_plan FROM public.planes_entrenamiento WHERE id = v_plan_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La rutina que intentas guardar ya no existe' USING ERRCODE = 'GZ010';
    END IF;
    IF NOT (
      public.es_admin()
      OR COALESCE(v_plan.profesor_id = auth.uid(), false)
      OR (v_plan.alumno_id IS NOT NULL AND public.es_entrenador_de(v_plan.alumno_id))
    ) THEN
      RAISE EXCEPTION 'No tienes permiso para modificar esta rutina' USING ERRCODE = 'GZ010';
    END IF;
    v_alumno_id := v_plan.alumno_id;
  ELSIF v_alumno_id IS NOT NULL
        AND NOT (public.es_admin() OR public.es_entrenador_de(v_alumno_id)) THEN
    RAISE EXCEPTION 'Ese alumno no está asignado a tu cuenta' USING ERRCODE = 'GZ010';
  END IF;

  IF v_plan_id IS NOT NULL AND NOT v_como_nueva THEN
    IF EXISTS (
      SELECT 1
      FROM public.registro_sesiones s
      JOIN public.dias_rutina d ON d.id = s.dia_id
      WHERE d.plan_id = v_plan_id
    ) THEN
      RAISE EXCEPTION 'Esta rutina ya tiene sesiones registradas y no se puede modificar: guárdala como nueva versión'
        USING ERRCODE = 'GZ010';
    END IF;

    -- GOZS-318: otra pestaña/dispositivo guardó después de que este cliente leyó la rutina
    IF NULLIF(p_payload #>> '{version}', '') IS NOT NULL
       AND v_plan.updated_at IS DISTINCT FROM (p_payload #>> '{version}')::TIMESTAMPTZ THEN
      RAISE EXCEPTION 'Esta rutina cambió en otra pestaña o dispositivo. Recarga para ver la última versión'
        USING ERRCODE = 'GZ011';
    END IF;

    UPDATE public.planes_entrenamiento
    SET nombre = v_nombre,
        comentarios = p_payload #>> '{comentarios}',
        etiqueta = p_payload #>> '{etiqueta}',
        estado = CASE WHEN v_plan.alumno_id IS NULL AND v_estado_pedido IS NOT NULL
                      THEN v_estado_pedido::public.estado_plan ELSE estado END
    WHERE id = v_plan_id;
    DELETE FROM public.dias_rutina WHERE plan_id = v_plan_id;
    v_nuevo_id := v_plan_id;
  ELSE
    -- plantilla nueva: BORRADOR salvo que el payload pida ACTIVO; plan de alumno nuevo: BORRADOR;
    -- versión nueva de un plan de alumno: hereda el estado de la anterior y su fecha_inicio, y si
    -- estaba ACTIVO la reemplaza (la anterior pasa a INACTIVO)
    v_estado := CASE
      WHEN v_alumno_id IS NULL THEN COALESCE(v_estado_pedido, 'BORRADOR')
      WHEN v_plan_id IS NOT NULL THEN v_plan.estado::TEXT
      ELSE 'BORRADOR'
    END::public.estado_plan;
    IF v_plan_id IS NOT NULL AND v_alumno_id IS NOT NULL AND v_plan.estado = 'ACTIVO' THEN
      -- serializa con asignar_rutina_a_alumno y respeta uq_planes_un_activo_por_alumno
      PERFORM 1 FROM public.perfiles WHERE id = v_alumno_id FOR UPDATE;
      UPDATE public.planes_entrenamiento
      SET estado = 'INACTIVO', fecha_fin = now()
      WHERE id = v_plan_id;
    END IF;
    INSERT INTO public.planes_entrenamiento (
      profesor_id, alumno_id, nombre, comentarios, etiqueta, tipo, plan_origen_id, estado, fecha_inicio
    )
    VALUES (
      auth.uid(),
      v_alumno_id,
      v_nombre,
      p_payload #>> '{comentarios}',
      p_payload #>> '{etiqueta}',
      CASE WHEN v_alumno_id IS NULL THEN 'PLANTILLA' ELSE 'DE_ALUMNO' END,
      v_plan_id,
      v_estado,
      CASE
        WHEN v_plan_id IS NOT NULL
         AND v_como_nueva
         AND v_alumno_id IS NOT NULL
         AND v_plan.alumno_id = v_alumno_id
        THEN COALESCE(v_plan.fecha_inicio, now())
        ELSE now()
      END
    )
    RETURNING id INTO v_nuevo_id;
  END IF;

  FOR v_dia IN SELECT * FROM jsonb_array_elements(p_payload -> 'dias') LOOP
    v_dia_n := v_dia_n + 1;
    INSERT INTO public.dias_rutina (plan_id, nombre, orden)
    VALUES (v_nuevo_id, COALESCE(NULLIF(TRIM(v_dia ->> 'nombre'), ''), 'Día ' || v_dia_n), v_dia_n)
    RETURNING id INTO v_dia_id;

    -- grupos de superserie válidos del día: los que tienen >= 2 ejercicios
    BEGIN
      SELECT COALESCE(array_agg(g), '{}') INTO v_grupos_validos
      FROM (
        SELECT (x ->> 'grupo_superserie')::INTEGER AS g
        FROM jsonb_array_elements(COALESCE(v_dia -> 'ejercicios', '[]'::JSONB)) x
        WHERE COALESCE((x ->> 'es_superserie')::BOOLEAN, false)
        GROUP BY 1 HAVING count(*) >= 2
      ) q;
    EXCEPTION WHEN OTHERS THEN
      v_grupos_validos := '{}'; -- valores mal formados: el INSERT de abajo da el mensaje humano
    END;

    v_ej_n := 0;
    FOR v_ej IN SELECT * FROM jsonb_array_elements(COALESCE(v_dia -> 'ejercicios', '[]'::JSONB)) LOOP
      v_ej_n := v_ej_n + 1;
      v_ej_nombre := COALESCE(NULLIF(v_ej ->> 'nombre', ''), 'ejercicio ' || v_ej_n);
      BEGIN
        v_es_ss := COALESCE(
          COALESCE((v_ej ->> 'es_superserie')::BOOLEAN, false)
          AND (v_ej ->> 'grupo_superserie')::INTEGER = ANY (v_grupos_validos),
          false
        );
        -- el cast a UUID va dentro del bloque: un id mal formado también da mensaje humano
        v_ej_nombre := COALESCE(
          NULLIF(v_ej ->> 'nombre', ''),
          (SELECT e.nombre FROM public.ejercicios e WHERE e.id = (v_ej ->> 'ejercicio_id')::UUID),
          v_ej_nombre
        );
        INSERT INTO public.ejercicios_en_rutina (
          dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo,
          notas, es_superserie, grupo_superserie, tempo, tempo_activo, tipo_serie, force_rpe_required,
          tipo_medicion, tiempo_objetivo_segundos, es_unilateral
        )
        VALUES (
          v_dia_id,
          (v_ej ->> 'ejercicio_id')::UUID,
          v_ej_n,
          (v_ej ->> 'series')::INTEGER,
          v_ej ->> 'repeticiones',
          COALESCE((v_ej ->> 'descanso_segundos')::INTEGER, 90),
          NULLIF(btrim(v_ej ->> 'rpe_objetivo'), ''),
          v_ej ->> 'notas',
          v_es_ss,
          CASE WHEN v_es_ss THEN (v_ej ->> 'grupo_superserie')::INTEGER END,
          COALESCE(v_ej ->> 'tempo', '3-0-1-0'),
          COALESCE((v_ej ->> 'tempo_activo')::BOOLEAN, false),
          COALESCE(v_ej ->> 'tipo_serie', 'NORMAL'),
          COALESCE((v_ej ->> 'force_rpe_required')::BOOLEAN, false),
          COALESCE(v_ej ->> 'tipo_medicion', 'REPS'),
          (v_ej ->> 'tiempo_objetivo_segundos')::INTEGER,
          COALESCE((v_ej ->> 'es_unilateral')::BOOLEAN, false)
        );
      EXCEPTION
        WHEN foreign_key_violation THEN
          RAISE EXCEPTION 'No se pudo guardar ''%'' (día %): el ejercicio ya no existe en el catálogo',
            v_ej_nombre, v_dia_n USING ERRCODE = 'GZ010';
        WHEN check_violation THEN
          -- GOZS-323: dice qué valor falló en vez del mensaje genérico
          GET STACKED DIAGNOSTICS v_restriccion = CONSTRAINT_NAME;
          RAISE EXCEPTION 'No se pudo guardar ''%'' (día %): %', v_ej_nombre, v_dia_n,
            CASE v_restriccion
              WHEN 'chk_eer_repeticiones_formato' THEN 'las repeticiones deben ser como 10, 8-12 o 3x10'
              WHEN 'chk_eer_series_rango' THEN 'las series deben estar entre 1 y 20'
              WHEN 'chk_eer_descanso_rango' THEN 'el descanso debe estar entre 0 y 900 segundos'
              WHEN 'chk_eer_rpe_objetivo_rango' THEN 'el RPE objetivo debe estar entre 1 y 10'
              WHEN 'chk_eer_notas_largo' THEN 'las notas no pueden superar los 2000 caracteres'
              ELSE 'revisa series, repeticiones y demás valores'
            END USING ERRCODE = 'GZ010';
        WHEN OTHERS THEN
          RAISE EXCEPTION 'No se pudo guardar ''%'' (día %): revisa series, repeticiones y demás valores',
            v_ej_nombre, v_dia_n USING ERRCODE = 'GZ010';
      END;
    END LOOP;
  END LOOP;

  RETURN v_nuevo_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.clonar_plan_entrenamiento(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.extender_vigencia_plan(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clonar_plan_entrenamiento(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.extender_vigencia_plan(uuid, integer) TO authenticated, service_role;

COMMIT;
