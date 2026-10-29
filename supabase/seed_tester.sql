-- GOZS-199: alumno tester (ADMIN + alumno de su propio plan) con rutina de 3 días + antebrazos.
-- Idempotente. Requiere que el tester ya se haya registrado en Auth (no se crean credenciales aquí).
-- Solo escribe filas del tester (ids fijos); no toca datos de otros alumnos.
DO $$
DECLARE
  v_email CONSTANT TEXT := '94.gabriel.sanchez@gmail.com';
  v_uid UUID;
  v_plan CONSTANT UUID := 'c0de1990-0000-4000-8000-000000000001';
  v_press UUID; v_prensa UUID; v_jalon UUID; v_muneca UUID; v_muneca_inv UUID;
  v_d1 CONSTANT UUID := 'c0de1990-0000-4000-8000-0000000000d1';
  v_d2 CONSTANT UUID := 'c0de1990-0000-4000-8000-0000000000d2';
  v_d3 CONSTANT UUID := 'c0de1990-0000-4000-8000-0000000000d3';
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = v_email;
  IF v_uid IS NULL THEN
    RAISE NOTICE 'seed_tester: % no existe en auth.users; registrarlo primero. Sin cambios.', v_email;
    RETURN;
  END IF;

  INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia)
  VALUES (v_uid, v_email, 'Tester GOZS', 'ADMIN', 'ACTIVA')
  ON CONFLICT (id) DO UPDATE SET rol = 'ADMIN', estado_membresia = 'ACTIVA';

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

  INSERT INTO public.planes_entrenamiento (id, profesor_id, alumno_id, nombre, estado, comentarios)
  VALUES (v_plan, v_uid, v_uid, 'Tester 3 días + antebrazos', 'ACTIVO', 'Plan de pruebas (GOZS-199)')
  ON CONFLICT (id) DO UPDATE SET estado = 'ACTIVO', alumno_id = v_uid, profesor_id = v_uid;

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
END
$$;
