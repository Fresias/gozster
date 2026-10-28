-- GOZS-202: seed idempotente del usuario tester (admin + alumno) con rutina de 3 días ACTIVA.
-- No crea credenciales: si el usuario no existe en auth.users, no hace nada.
BEGIN;

DO $$
DECLARE
  v_uid UUID;
  v_plan CONSTANT UUID := '5eed0202-0000-4000-8000-000000000001';
  v_dias CONSTANT UUID[] := ARRAY[
    '5eed0202-0000-4000-8000-0000000000d1'::uuid,
    '5eed0202-0000-4000-8000-0000000000d2'::uuid,
    '5eed0202-0000-4000-8000-0000000000d3'::uuid];
  v_nombres CONSTANT TEXT[] := ARRAY['Día 1 - Tren inferior', 'Día 2 - Tren superior', 'Día 3 - Cuerpo completo'];
  -- (día, orden, ejercicio, series, repeticiones, rpe)
  v_items CONSTANT TEXT[][] := ARRAY[
    ['1','1','Sentadilla trasera','4','5','8'],
    ['1','2','Peso muerto rumano','3','8','8'],
    ['1','3','Hip thrust','3','10','8'],
    ['2','1','Press banca','4','6','8'],
    ['2','2','Remo con barra','4','8','8'],
    ['2','3','Press militar','3','8','8'],
    ['3','1','Sentadilla frontal','3','6','8'],
    ['3','2','Dominadas','3','6','8'],
    ['3','3','Fondos en paralelas','3','8','8']];
  i INT;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = '94.gabriel.sanchez@gmail.com';
  IF v_uid IS NULL THEN
    RAISE NOTICE 'Usuario tester no existe en auth.users; seed omitido';
    RETURN;
  END IF;

  -- ADMIN incluye acceso como alumno (es_admin() en RLS); rol_usuario es un único valor.
  INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia)
  VALUES (v_uid, '94.gabriel.sanchez@gmail.com', 'Tester GOZSter', 'ADMIN', 'ACTIVA')
  ON CONFLICT (id) DO UPDATE SET rol = 'ADMIN', estado_membresia = 'ACTIVA';

  INSERT INTO public.planes_entrenamiento (id, profesor_id, alumno_id, nombre, estado)
  VALUES (v_plan, v_uid, v_uid, 'Rutina Fuerza 3 días', 'ACTIVO')
  ON CONFLICT (id) DO UPDATE SET estado = 'ACTIVO', alumno_id = v_uid;

  INSERT INTO public.ejercicios (nombre, creado_por)
  SELECT DISTINCT v_items[k][3], v_uid FROM generate_subscripts(v_items, 1) AS k
  ON CONFLICT (nombre) DO NOTHING;

  FOR i IN 1..3 LOOP
    INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
    VALUES (v_dias[i], v_plan, v_nombres[i], i)
    ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre;
  END LOOP;

  FOR i IN 1..array_length(v_items, 1) LOOP
    INSERT INTO public.ejercicios_en_rutina (dia_id, ejercicio_id, orden, series, repeticiones, rpe_objetivo)
    SELECT v_dias[v_items[i][1]::int], e.id, v_items[i][2]::int, v_items[i][4]::int, v_items[i][5], v_items[i][6]::numeric
    FROM public.ejercicios e WHERE e.nombre = v_items[i][3]
    AND NOT EXISTS (
      SELECT 1 FROM public.ejercicios_en_rutina r
      WHERE r.dia_id = v_dias[v_items[i][1]::int] AND r.ejercicio_id = e.id
    );
  END LOOP;
END
$$;

COMMIT;
