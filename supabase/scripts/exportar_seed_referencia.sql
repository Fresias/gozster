-- GOZS-705 (D-2): exporta desde dev el catálogo de ejercicios y las plantillas como
-- sentencias INSERT idempotentes para el seed de producción. Solo lectura.
-- Uso: correrlo en el SQL Editor de dev, descargar el resultado (una sola celda "sql") y pegarla en
-- la sección de catálogo/plantillas de supabase/seed_produccion.sql.
-- Sin personas: se anulan creado_por, profesor_id, alumno_id y plan_origen_id.
-- Plantilla = planes_entrenamiento.alumno_id IS NULL.
WITH plantillas AS (
  SELECT p.* FROM public.planes_entrenamiento p WHERE p.alumno_id IS NULL
),
filas AS (
  SELECT 1 AS paso, e.nombre AS clave,
         'public.ejercicios' AS tabla,
         to_jsonb(e) || jsonb_build_object('creado_por', NULL) AS fila
  FROM public.ejercicios e
  UNION ALL
  SELECT 2, p.nombre || ' ' || p.id, 'public.planes_entrenamiento',
         to_jsonb(p) || jsonb_build_object('profesor_id', NULL, 'alumno_id', NULL, 'plan_origen_id', NULL)
  FROM plantillas p
  UNION ALL
  SELECT 3, d.plan_id || lpad(d.orden::text, 4, '0'), 'public.dias_rutina', to_jsonb(d)
  FROM public.dias_rutina d JOIN plantillas p ON p.id = d.plan_id
  UNION ALL
  SELECT 4, d.plan_id || lpad(d.orden::text, 4, '0') || lpad(er.orden::text, 4, '0'),
         'public.ejercicios_en_rutina', to_jsonb(er)
  FROM public.ejercicios_en_rutina er
  JOIN public.dias_rutina d ON d.id = er.dia_id
  JOIN plantillas p ON p.id = d.plan_id
)
-- Una sola fila: el SQL Editor puede recortar resultados largos en filas sueltas.
SELECT string_agg(
  format(
    'INSERT INTO %s SELECT * FROM json_populate_record(NULL::%s, %L) ON CONFLICT DO NOTHING;',
    tabla, tabla, fila::text
  ),
  E'\n' ORDER BY paso, clave
) AS sql
FROM filas;
