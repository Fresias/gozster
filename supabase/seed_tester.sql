-- GOZS-199 / GOZS-286: alumno tester (ALUMNO del coach de pruebas) con "GABI AGOSTO" asignada,
-- rutina de 3 días + antebrazos (inactiva) y un alumno B de pruebas para el IDOR.
-- Idempotente. Requiere que los usuarios ya existan en Auth (no se crean credenciales aquí).
-- Orden: seed_mynter.sql (trae el plan GABI AGOSTO) y luego este archivo.
-- Solo escribe filas del tester, del alumno B y del plan GABI AGOSTO; no toca otros alumnos.
DO $$
DECLARE
  v_email CONSTANT TEXT := '94.gabriel.sanchez@gmail.com';
  v_coach_email CONSTANT TEXT := 'ds.gabriel.sanchez@gmail.com';
  v_b_email CONSTANT TEXT := 'alumno.b.tester@gozster.local';
  v_uid UUID;
  v_coach UUID;
  v_b UUID;
  v_gabi CONSTANT UUID := 'cab4ad3d-8595-47be-a220-6dc52117048e';
  v_plan CONSTANT UUID := 'c0de1990-0000-4000-8000-000000000001';
  v_plan_b CONSTANT UUID := 'c0de1990-0000-4000-8000-0000000000b1';
  v_dia_b CONSTANT UUID := 'c0de1990-0000-4000-8000-0000000000b2';
  v_press UUID; v_prensa UUID; v_jalon UUID; v_muneca UUID; v_muneca_inv UUID;
  v_d1 CONSTANT UUID := 'c0de1990-0000-4000-8000-0000000000d1';
  v_d2 CONSTANT UUID := 'c0de1990-0000-4000-8000-0000000000d2';
  v_d3 CONSTANT UUID := 'c0de1990-0000-4000-8000-0000000000d3';
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = v_email;
  SELECT id INTO v_coach FROM auth.users WHERE lower(email) = v_coach_email;
  IF v_uid IS NULL OR v_coach IS NULL THEN
    RAISE NOTICE 'seed_tester: faltan % / % en auth.users; registrarlos primero. Sin cambios.', v_email, v_coach_email;
    RETURN;
  END IF;

  INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia)
  VALUES (v_coach, v_coach_email, 'Coach GOZS', 'ADMIN', 'ACTIVA')
  ON CONFLICT (id) DO UPDATE SET rol = 'ADMIN', estado_membresia = 'ACTIVA';

  INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia, profesor_asignado_id)
  VALUES (v_uid, v_email, 'Tester GOZS', 'ALUMNO', 'ACTIVA', v_coach)
  ON CONFLICT (id) DO UPDATE SET rol = 'ALUMNO', estado_membresia = 'ACTIVA', profesor_asignado_id = v_coach;

  -- Catálogo: reutiliza los del seed Mynter; crea solo los que falten (nombre es UNIQUE).
  INSERT INTO public.ejercicios (nombre, musculos_principales) VALUES
    ('Press Plano con Barra', ARRAY['Pecho']),
    ('Prensa 45°', ARRAY['Cuádriceps']),
    ('Jalón al pecho agarre neutro', ARRAY['Dorsal ancho']),
    ('Curl de muñeca con barra', ARRAY['Antebrazos']),
    ('Curl de muñeca inverso', ARRAY['Antebrazos'])
  ON CONFLICT (nombre) DO NOTHING;

  SELECT id INTO v_press FROM public.ejercicios WHERE nombre = 'Press Plano con Barra';
  SELECT id INTO v_prensa FROM public.ejercicios WHERE nombre = 'Prensa 45°';
  SELECT id INTO v_jalon FROM public.ejercicios WHERE nombre = 'Jalón al pecho agarre neutro';
  SELECT id INTO v_muneca FROM public.ejercicios WHERE nombre = 'Curl de muñeca con barra';
  SELECT id INTO v_muneca_inv FROM public.ejercicios WHERE nombre = 'Curl de muñeca inverso';

  -- Un solo plan ACTIVO por alumno (uq_planes_un_activo_por_alumno): el del tester pasa a INACTIVO.
  UPDATE public.planes_entrenamiento SET estado = 'INACTIVO'
  WHERE alumno_id = v_uid AND estado = 'ACTIVO' AND id <> v_gabi;

  INSERT INTO public.planes_entrenamiento (id, profesor_id, alumno_id, nombre, estado, comentarios)
  VALUES (v_plan, v_coach, v_uid, 'Tester 3 días + antebrazos', 'INACTIVO', 'Plan de pruebas (GOZS-199)')
  ON CONFLICT (id) DO UPDATE SET estado = 'INACTIVO', alumno_id = v_uid, profesor_id = v_coach;

  -- GABI AGOSTO (de seed_mynter.sql) queda asignada al tester y a su coach.
  UPDATE public.planes_entrenamiento SET alumno_id = v_uid, profesor_id = v_coach, estado = 'ACTIVO'
  WHERE id = v_gabi;
  IF NOT FOUND THEN
    RAISE NOTICE 'seed_tester: plan GABI AGOSTO (%) no existe; correr seed_mynter.sql antes.', v_gabi;
  END IF;

  INSERT INTO public.dias_rutina (id, plan_id, nombre, orden) VALUES
    (v_d1, v_plan, 'Día 1', 1), (v_d2, v_plan, 'Día 2', 2), (v_d3, v_plan, 'Día 3', 3)
  ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, orden = EXCLUDED.orden;

  INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos) VALUES
    ('c0de1990-0000-4000-8000-000000000e11', v_d1, v_press,      1, 4, '8 a 10',  120),
    ('c0de1990-0000-4000-8000-000000000e12', v_d1, v_muneca,     2, 3, '12 a 15',  60),
    ('c0de1990-0000-4000-8000-000000000e21', v_d2, v_prensa,     1, 4, '10 a 12',  120),
    ('c0de1990-0000-4000-8000-000000000e22', v_d2, v_muneca_inv, 2, 3, '12 a 15',  60),
    ('c0de1990-0000-4000-8000-000000000e31', v_d3, v_jalon,      1, 4, '8 a 12',   90),
    ('c0de1990-0000-4000-8000-000000000e32', v_d3, v_muneca,     2, 3, '12 a 15',  60)
  ON CONFLICT (id) DO UPDATE SET ejercicio_id = EXCLUDED.ejercicio_id, orden = EXCLUDED.orden,
    series = EXCLUDED.series, repeticiones = EXCLUDED.repeticiones;

  -- Alumno B (IDOR): debe existir en Auth; su plan es de otro alumno que el tester.
  SELECT id INTO v_b FROM auth.users WHERE lower(email) = v_b_email;
  IF v_b IS NULL THEN
    RAISE NOTICE 'seed_tester: % no existe en auth.users; crear alumno B en Auth. Sin alumno B.', v_b_email;
  ELSE
    INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia, profesor_asignado_id)
    VALUES (v_b, v_b_email, 'Alumno B Tester', 'ALUMNO', 'ACTIVA', v_coach)
    ON CONFLICT (id) DO UPDATE SET rol = 'ALUMNO', estado_membresia = 'ACTIVA', profesor_asignado_id = v_coach;

    INSERT INTO public.planes_entrenamiento (id, profesor_id, alumno_id, nombre, estado, comentarios)
    VALUES (v_plan_b, v_coach, v_b, 'Plan Alumno B', 'ACTIVO', 'Plan de pruebas IDOR (GOZS-286)')
    ON CONFLICT (id) DO UPDATE SET estado = 'ACTIVO', alumno_id = v_b, profesor_id = v_coach;

    INSERT INTO public.dias_rutina (id, plan_id, nombre, orden) VALUES (v_dia_b, v_plan_b, 'Día 1', 1)
    ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, orden = EXCLUDED.orden;

    INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos)
    VALUES ('c0de1990-0000-4000-8000-000000000b11', v_dia_b, v_press, 1, 3, '8 a 10', 90)
    ON CONFLICT (id) DO UPDATE SET ejercicio_id = EXCLUDED.ejercicio_id;
  END IF;
END
$$;
