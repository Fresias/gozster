-- ============================================================================
-- GOZSter: Datos Semilla (Catálogo Maestro de Fuerza + Plantilla con Superseries)
-- Script SQL idempotente para PostgreSQL 15+ / Supabase
-- ============================================================================

BEGIN;

-- 1. Catálogo Maestro de Ejercicios Básicos de Fuerza
INSERT INTO public.ejercicios (
  id,
  nombre,
  comentario,
  url_video,
  musculos_principales,
  musculos_secundarios
)
VALUES
  (
    '11111111-1111-4111-8111-111111111101',
    'Sentadilla',
    'Sentadilla trasera con barra (Back Squat). Mantener el torso neutro, rodillas alineadas con la punta de los pies y romper el paralelo.',
    'ultWZbUMPL8',
    ARRAY['Cuádriceps', 'Glúteos'],
    ARRAY['Isquiotibiales', 'Erectores espinales', 'Core']
  ),
  (
    '11111111-1111-4111-8111-111111111102',
    'Press de Banca',
    'Press de banca plano con barra olímpica. Retracción escapular firme, pies apoyados en el suelo y control excéntrico hasta tocar el esternón.',
    'rT7DgCr-3pg',
    ARRAY['Pectoral mayor'],
    ARRAY['Tríceps braquial', 'Deltoides anterior']
  ),
  (
    '11111111-1111-4111-8111-111111111103',
    'Peso Muerto',
    'Peso muerto convencional con barra. Barra pegada a las tibias, activación dorsal (romper la barra) y empuje de suelo sin hiperextender la zona lumbar.',
    'op9kVnSso6Q',
    ARRAY['Isquiotibiales', 'Glúteos', 'Erectores espinales'],
    ARRAY['Dorsal ancho', 'Trapecio', 'Antebrazos', 'Core']
  ),
  (
    '11111111-1111-4111-8111-111111111104',
    'Press Militar',
    'Press vertical de pie con barra (Overhead Press). Contraer glúteos y abdomen para evitar compensación lumbar; bloquear codos sobre la corona.',
    '2yjwXTZQDDI',
    ARRAY['Deltoides anterior', 'Deltoides lateral'],
    ARRAY['Tríceps braquial', 'Trapecio superior', 'Core']
  ),
  (
    '11111111-1111-4111-8111-111111111105',
    'Dominadas',
    'Dominadas pronas en barra fija. Iniciar el gesto con depresión escapular y traccionar llevando el pecho hacia la barra en rango completo.',
    'eGo4IYlbE5g',
    ARRAY['Dorsal ancho', 'Redondo mayor'],
    ARRAY['Bíceps braquial', 'Romboides', 'Trapecio medio', 'Core']
  )
ON CONFLICT (nombre) DO UPDATE SET
  comentario = EXCLUDED.comentario,
  url_video = EXCLUDED.url_video,
  musculos_principales = EXCLUDED.musculos_principales,
  musculos_secundarios = EXCLUDED.musculos_secundarios,
  updated_at = now();

-- 2. Plantilla Global de Plan de Entrenamiento (alumno_id = NULL)
INSERT INTO public.planes_entrenamiento (
  id,
  profesor_id,
  alumno_id,
  nombre,
  estado,
  comentarios
)
VALUES (
  '22222222-2222-4222-8222-222222222201',
  NULL,
  NULL,
  'Plantilla Fuerza Base + Superseries Antagonistas',
  'ACTIVO',
  'Calentamiento general de 10 minutos (movilidad torácica y de cadera + 3 series de aproximación progresiva). Escala RPE 1-10: RPE 8 = 2 repeticiones en recámara (RIR 2), RPE 9 = 1 repetición en recámara (RIR 1).'
)
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  estado = EXCLUDED.estado,
  comentarios = EXCLUDED.comentarios,
  updated_at = now();

-- 3. Días de Rutina para la Plantilla Global
INSERT INTO public.dias_rutina (
  id,
  plan_id,
  nombre,
  orden
)
VALUES
  (
    '33333333-3333-4333-8333-333333333301',
    '22222222-2222-4222-8222-222222222201',
    'Día 1: Torso Pesado y Superserie Antagonista',
    1
  ),
  (
    '33333333-3333-4333-8333-333333333302',
    '22222222-2222-4222-8222-222222222201',
    'Día 2: Pierna Pesada y Cadena Posterior',
    2
  )
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  orden = EXCLUDED.orden,
  updated_at = now();

-- 4. Ejercicios en Rutina (incluyendo configuración de Superseries y rangos de repeticiones)
INSERT INTO public.ejercicios_en_rutina (
  id,
  dia_id,
  ejercicio_id,
  orden,
  series,
  repeticiones,
  descanso_segundos,
  rpe_objetivo,
  notas,
  es_superserie,
  grupo_superserie
)
VALUES
  -- Día 1: Bloque Principal + Superserie (Grupo 1: Press Militar + Dominadas)
  (
    '44444444-4444-4444-8444-444444444401',
    '33333333-3333-4333-8333-333333333301',
    (SELECT id FROM public.ejercicios WHERE nombre = 'Press de Banca'),
    1,
    4,
    '8-6-6-4',
    180,
    8.5,
    'Pausa de 1 segundo en el pecho en cada repetición.',
    false,
    NULL
  ),
  (
    '44444444-4444-4444-8444-444444444402',
    '33333333-3333-4333-8333-333333333301',
    (SELECT id FROM public.ejercicios WHERE nombre = 'Press Militar'),
    2,
    4,
    '4x8',
    30,
    8.0,
    'Superserie A1: Al finalizar la serie pasar en 30s a Dominadas.',
    true,
    1
  ),
  (
    '44444444-4444-4444-8444-444444444403',
    '33333333-3333-4333-8333-333333333301',
    (SELECT id FROM public.ejercicios WHERE nombre = 'Dominadas'),
    3,
    4,
    '10-8-8-6',
    120,
    8.5,
    'Superserie A2: Descansar 120s tras completar el par antagonista.',
    true,
    1
  ),
  -- Día 2: Pierna Pesada y Cadena Posterior
  (
    '44444444-4444-4444-8444-444444444404',
    '33333333-3333-4333-8333-333333333302',
    (SELECT id FROM public.ejercicios WHERE nombre = 'Sentadilla'),
    1,
    4,
    '5x5',
    180,
    8.0,
    'Controlar la bajada en 2 segundos y subir con máxima velocidad concéntrica.',
    false,
    NULL
  ),
  (
    '44444444-4444-4444-8444-444444444405',
    '33333333-3333-4333-8333-333333333302',
    (SELECT id FROM public.ejercicios WHERE nombre = 'Peso Muerto'),
    2,
    3,
    '5-3-1',
    240,
    9.0,
    'Resetear la posición en el suelo entre cada repetición (Dead Stop).',
    false,
    NULL
  )
ON CONFLICT (id) DO UPDATE SET
  dia_id = EXCLUDED.dia_id,
  ejercicio_id = EXCLUDED.ejercicio_id,
  orden = EXCLUDED.orden,
  series = EXCLUDED.series,
  repeticiones = EXCLUDED.repeticiones,
  descanso_segundos = EXCLUDED.descanso_segundos,
  rpe_objetivo = EXCLUDED.rpe_objetivo,
  notas = EXCLUDED.notas,
  es_superserie = EXCLUDED.es_superserie,
  grupo_superserie = EXCLUDED.grupo_superserie,
  updated_at = now();

-- 5. Plantilla global de adaptación (primer día de gimnasio). Idempotente.
-- 5.1 Ejercicios del catálogo (si ya existen por nombre, se respetan)
INSERT INTO public.ejercicios (nombre, comentario, musculos_principales, musculos_secundarios)
VALUES
  ('Prensa de Piernas', 'Pies al ancho de hombros, rango cómodo y control en la bajada.', ARRAY['Cuádriceps', 'Glúteos'], ARRAY['Isquiotibiales']),
  ('Jalón al Pecho', 'Agarre prono algo más ancho que hombros; llevar la barra a la clavícula.', ARRAY['Dorsales'], ARRAY['Bíceps']),
  ('Press de Pecho en Máquina', 'Espalda apoyada, empujar sin bloquear codos.', ARRAY['Pectorales'], ARRAY['Tríceps', 'Deltoides anterior']),
  ('Remo en Máquina', 'Pecho apoyado, juntar escápulas al final del recorrido.', ARRAY['Dorsales', 'Romboides'], ARRAY['Bíceps']),
  ('Plancha', 'Cuerpo en línea recta, abdomen activo, respiración continua.', ARRAY['Core'], ARRAY['Glúteos'])
ON CONFLICT (nombre) DO NOTHING;

-- 5.2 Plan plantilla global (alumno_id NULL)
INSERT INTO public.planes_entrenamiento (id, profesor_id, alumno_id, nombre, estado, comentarios)
VALUES (
  '22222222-2222-4222-8222-2222222222a1',
  NULL,
  NULL,
  'Adaptación - Primer día de gimnasio',
  'ACTIVO',
  'Rutina genérica de adaptación: cargas livianas, técnica primero, RPE 5-6 (4-5 repeticiones en recámara).'
)
ON CONFLICT (id) DO NOTHING;

-- 5.3 Día único
INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
VALUES (
  '33333333-3333-4333-8333-3333333333a1',
  '22222222-2222-4222-8222-2222222222a1',
  'Día 1: Adaptación Full Body',
  1
)
ON CONFLICT (id) DO NOTHING;

-- 5.4 Ejercicios del día
INSERT INTO public.ejercicios_en_rutina
  (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas)
SELECT v.id::uuid, '33333333-3333-4333-8333-3333333333a1', e.id, v.orden, v.series, v.reps, v.descanso, v.rpe, v.notas
FROM (VALUES
  ('44444444-4444-4444-8444-4444444444a1', 'Prensa de Piernas',          1, 2, '12',      90, 5.0, 'Carga liviana, aprender el movimiento.'),
  ('44444444-4444-4444-8444-4444444444a2', 'Jalón al Pecho',             2, 2, '12',      90, 5.0, NULL),
  ('44444444-4444-4444-8444-4444444444a3', 'Press de Pecho en Máquina',  3, 2, '12',      90, 5.0, NULL),
  ('44444444-4444-4444-8444-4444444444a4', 'Remo en Máquina',            4, 2, '12',      90, 5.0, NULL),
  ('44444444-4444-4444-8444-4444444444a5', 'Plancha',                    5, 2, '20-30', 60, 5.0, 'Mantener la posición con buena técnica.')
) AS v(id, nombre, orden, series, reps, descanso, rpe, notas)
JOIN public.ejercicios e ON e.nombre = v.nombre
ON CONFLICT (id) DO NOTHING;

COMMIT;
