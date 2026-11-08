-- GOZS-425: etiquetado canónico del catálogo de ejercicios + renombre del coach sembrado.
-- Etiquetas canónicas: Pecho, Espalda, Piernas, Hombros, Brazos, Core. Idempotente.

-- 1. Etiquetar el catálogo maestro por nombre (clasificación provisoria aprobada).
UPDATE public.ejercicios e
SET musculos_principales = ARRAY[v.grupo]::TEXT[], updated_at = now()
FROM (VALUES
  ('90/90', 'Piernas'),
  ('Extension de rodilla', 'Piernas'),
  ('Sentadilla en silla', 'Piernas'),
  ('Skater con peso', 'Piernas'),
  ('Puente de Gluteo Asimetrico', 'Piernas'),
  ('Sentadilla isometrica', 'Piernas'),
  ('Abducción de cadera Acostado con Tobillera', 'Piernas'),
  ('Apertura de hombros c/ banda', 'Hombros'),
  ('Flexiones de Brazos Cerradas', 'Pecho'),
  ('Fondos estrictos con carga', 'Pecho'),
  ('Aperturas Planas con Mancuernas', 'Pecho'),
  ('Sentadilla Copa (Enfocada en Cuádriceps)', 'Piernas'),
  ('Cruce de polea bajo', 'Pecho'),
  ('Press Frances con Barra EZ en Banco Plano', 'Brazos'),
  ('Sillon de Cuadriceps', 'Piernas'),
  ('Rotaciones torácicas arrodillado', 'Espalda'),
  ('Plancha Toco Hombro', 'Core'),
  ('Press Plano con Barra', 'Pecho'),
  ('Press Inclinado con Mancuernas', 'Pecho'),
  ('Press francés con mancuernas en banco plano', 'Brazos'),
  ('Curl Concentrado', 'Brazos'),
  ('Extension de triceps barra V', 'Brazos'),
  ('Mariposa para Hombros Posteriores', 'Hombros'),
  ('Press militar c/ banda', 'Hombros'),
  ('Press Plano con Barra + Pausa (1",2",3")', 'Pecho'),
  ('APERTURA EN MAQUINA', 'Pecho'),
  ('Press militar en guia', 'Hombros'),
  ('Vuelos laterales con mancuernas', 'Hombros'),
  ('Dorsiflexion y movilidad de cadera', 'Piernas'),
  ('Plancha baja + plancha alta', 'Core'),
  ('Fondos Paralelas Asistido con Maquina', 'Pecho'),
  ('Press plano con mancuernas', 'Pecho'),
  ('Prensa 45°', 'Piernas'),
  ('Remo al mentón c/ pesa rusa', 'Espalda'),
  ('Sentadilla skater facilitada', 'Piernas'),
  ('Facepull parado con soga', 'Hombros'),
  ('Patada de gluteo diagonal', 'Piernas'),
  ('Extensiones de Espalda a 45°', 'Espalda'),
  ('Angelitos acostado', 'Hombros'),
  ('Plancha lateral c/ rotación', 'Core'),
  ('Rotaciones de hombro con disco', 'Hombros'),
  ('Remo con barra desde rack', 'Espalda'),
  ('Estocadas Frontales con Barra', 'Piernas'),
  ('Dominada al Pecho Supina', 'Espalda'),
  ('Pullover en polea alta', 'Espalda'),
  ('Curl 45°', 'Brazos'),
  ('Rotaciones toracicas en Cuadripedia', 'Espalda'),
  ('Press militar parado con barra', 'Hombros'),
  ('Sentadilla sumo c/ barra', 'Piernas'),
  ('Extension de Triceps Supino a un Brazo en Polea', 'Brazos'),
  ('Sentadilla bulgara 90° con barra', 'Piernas'),
  ('Rotaciones Dorsales', 'Espalda'),
  ('Almeja isometrica con banda', 'Piernas'),
  ('Sentadilla Paralela Barra Baja al Cajon', 'Piernas'),
  ('Dominada isométrica', 'Espalda'),
  ('Camilla de Isquios', 'Piernas'),
  ('Remo gorila', 'Espalda'),
  ('Sentadilla bulgara 45° con mancuernas', 'Piernas'),
  ('Sillon de cuadriceps unilateral', 'Piernas'),
  ('Flexiones de Brazos con Discos', 'Pecho'),
  ('Fondos con pausa', 'Pecho'),
  ('Sentadilla con Barra', 'Piernas'),
  ('Step Up Contralateral', 'Piernas'),
  ('Abdominales Acostado con Disco', 'Core'),
  ('Russian Twist c/ Mancuerna', 'Core'),
  ('Caminata Lateral en Sentadilla', 'Piernas'),
  ('Plancha Frontal desplazando Elemento', 'Core'),
  ('Hip thrust en maquina', 'Piernas'),
  ('Peso Muerto Rumano a una Pierna con Manc.', 'Piernas'),
  ('Patada de gluteo lateral en polea', 'Piernas'),
  ('Despliegue c/ rueda abdominal', 'Core'),
  ('Sentadilla Aerea', 'Piernas'),
  ('Remo Inclinado Agarre Prono con Barra', 'Espalda'),
  ('Remo unilateral con Giro de Torso', 'Espalda'),
  ('Estocadas Isometricas', 'Piernas'),
  ('Sentadilla + bisagra', 'Piernas'),
  ('Sentadilla Frontal agarre cruzado', 'Piernas'),
  ('Sentadilla lateral', 'Piernas'),
  ('Aduccion en maquina', 'Piernas'),
  ('Movilidad de tobillo en sentadilla', 'Piernas'),
  ('Sentadilla frontal con mochila', 'Piernas'),
  ('Flexiones de brazos', 'Pecho'),
  ('Sentadilla Bulgara con Peso Corporal', 'Piernas'),
  ('Remo al Mentón+ Press de Hombro c/ Banda', 'Hombros'),
  ('Abdominales acordeón', 'Core'),
  ('Plancha 4 apoyos', 'Core')
) AS v(nombre, grupo)
WHERE e.nombre = v.nombre
  AND e.musculos_principales IS DISTINCT FROM ARRAY[v.grupo]::TEXT[];

-- 2. Homogeneizar etiquetas legadas restantes (ejercicios fuera del catálogo maestro).
UPDATE public.ejercicios e
SET musculos_principales = (
  SELECT COALESCE(array_agg(DISTINCT m.canon), '{}')
  FROM unnest(e.musculos_principales) AS t(valor)
  CROSS JOIN LATERAL (SELECT CASE t.valor
    WHEN 'Biceps' THEN 'Brazos'
    WHEN 'Hombro' THEN 'Hombros'
    WHEN 'Cuadriceps' THEN 'Piernas'
    WHEN 'Isquio' THEN 'Piernas'
    WHEN 'Aductores' THEN 'Piernas'
    WHEN 'Recto abdominal' THEN 'Core'
    ELSE t.valor END AS canon) m
), updated_at = now()
WHERE e.musculos_principales && ARRAY['Biceps','Hombro','Cuadriceps','Isquio','Aductores','Recto abdominal'];

-- 3. Renombrar coach sembrado (mismo UUID, sin tocar FKs).
UPDATE public.perfiles
SET nombre_completo = 'Profesor Titular GOZS', email = 'coach.gozs@gozster.local'
WHERE id = '20685bca-6304-4e55-abba-37a1cf8f6113'
  AND (nombre_completo <> 'Profesor Titular GOZS' OR email <> 'coach.gozs@gozster.local');

DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    UPDATE auth.users
    SET email = 'coach.gozs@gozster.local',
        raw_user_meta_data = jsonb_set(COALESCE(raw_user_meta_data, '{}'::jsonb), '{nombre_completo}', '"Profesor Titular GOZS"')
    WHERE id = '20685bca-6304-4e55-abba-37a1cf8f6113'
      AND email IS DISTINCT FROM 'coach.gozs@gozster.local';
  END IF;
END $$;
