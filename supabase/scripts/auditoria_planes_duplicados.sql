-- GOZS-293: auditoría de SOLO LECTURA. No modifica datos.
-- Ejecutar en una transacción de solo lectura para garantizarlo.
BEGIN READ ONLY;

-- (a) Planes duplicados: mismo profesor_id + nombre + alumno_id.
-- accion_sugerida: BORRAR_CANDIDATO (sin sesiones) | ARCHIVAR (con sesiones: INACTIVO + fecha_fin).
-- El owner decide qué se ejecuta; en cada grupo se sugiere conservar el plan con sesiones / el más reciente.
WITH planes AS (
  SELECT p.id, p.profesor_id, p.alumno_id, p.nombre, p.estado, p.created_at,
         (SELECT count(*) FROM public.registro_sesiones s
            JOIN public.dias_rutina d ON d.id = s.dia_id
           WHERE d.plan_id = p.id) AS sesiones,
         count(*) OVER w AS copias,
         row_number() OVER (w ORDER BY
           (EXISTS (SELECT 1 FROM public.registro_sesiones s
                      JOIN public.dias_rutina d ON d.id = s.dia_id
                     WHERE d.plan_id = p.id)) DESC,
           p.created_at DESC) AS rango
  FROM public.planes_entrenamiento p
  WINDOW w AS (PARTITION BY p.profesor_id, p.alumno_id, p.nombre)
)
SELECT profesor_id, alumno_id, nombre, id AS plan_id, estado, created_at, sesiones,
       CASE WHEN rango = 1 THEN 'CONSERVAR'
            WHEN sesiones = 0 THEN 'BORRAR_CANDIDATO'
            ELSE 'ARCHIVAR' END AS accion_sugerida
FROM planes
WHERE copias > 1
ORDER BY profesor_id, alumno_id, nombre, rango;

-- (b) Alumnos con más de un plan ACTIVO.
SELECT p.alumno_id, p.id AS plan_id, p.nombre, p.profesor_id, p.created_at, p.fecha_inicio, p.fecha_fin,
       (SELECT count(*) FROM public.registro_sesiones s
          JOIN public.dias_rutina d ON d.id = s.dia_id
         WHERE d.plan_id = p.id) AS sesiones
FROM public.planes_entrenamiento p
WHERE p.estado = 'ACTIVO'
  AND p.alumno_id IN (SELECT alumno_id FROM public.planes_entrenamiento
                       WHERE estado = 'ACTIVO' AND alumno_id IS NOT NULL
                       GROUP BY alumno_id HAVING count(*) > 1)
ORDER BY p.alumno_id, p.created_at DESC;

ROLLBACK;
