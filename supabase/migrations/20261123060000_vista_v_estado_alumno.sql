-- GOZS-719 (PL-7): estado de membresía derivado.
--
-- public.v_estado_alumno deriva el estado comercial de cada alumno solo desde
-- public.contrataciones y public.cobros, sin leer
-- perfiles.estado_membresia ni perfiles.fecha_vencimiento_cuota. Es la
-- fuente única para "alumno al día" (KPI, tabla, Cobros).
--
-- Reglas (fecha de referencia = hoy en America/Argentina/Buenos_Aires):
--   * Contratación de referencia: la de fecha_fin más reciente del alumno.
--   * SIN_CONTRATACION: el alumno no tiene contrataciones.
--   * EN_PAUSA: la contratación de referencia está en pausa.
--   * VENCIDA: tiene cobros impagos con vencimiento pasado (mismo criterio
--     que v_morosos), o la contratación está VENCIDA o su fecha_fin ya pasó.
--   * PENDIENTE: la contratación está PENDIENTE_RENOVACION.
--   * POR_VENCER: faltan dias_aviso_previo días o menos para fecha_fin.
--   * AL_DIA: el resto.
--   al_dia = estado IN ('AL_DIA', 'POR_VENCER').
--
-- security_invoker: cada rol ve solo las filas que el RLS de perfiles,
-- contrataciones y cobros ya le permite (alumno: la propia; coach: sus alumnos).
--
-- Idempotente: CREATE OR REPLACE VIEW.

BEGIN;

CREATE OR REPLACE VIEW public.v_estado_alumno
WITH (security_invoker = true) AS
WITH hoy AS (
  SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS d
),
referencia AS (
  SELECT DISTINCT ON (c.alumno_id)
    c.alumno_id, c.id, c.estado, c.fecha_fin, c.dias_aviso_previo
  FROM public.contrataciones c
  ORDER BY c.alumno_id, c.fecha_fin DESC, c.created_at DESC
),
deuda AS (
  SELECT cb.alumno_id,
         count(*)::int AS cobros_vencidos,
         min(cb.fecha_vencimiento) AS primer_vencimiento_impago
  FROM public.cobros cb, hoy
  WHERE cb.estado <> 'PAGADO'
    AND cb.fecha_vencimiento < hoy.d
  GROUP BY cb.alumno_id
),
estado AS (
  SELECT
    p.id AS alumno_id,
    p.profesor_asignado_id,
    r.id AS contratacion_id,
    r.estado AS estado_contratacion,
    r.fecha_fin AS fecha_vencimiento,
    COALESCE(d.cobros_vencidos, 0) AS cobros_vencidos,
    d.primer_vencimiento_impago,
    CASE
      WHEN r.id IS NULL THEN 'SIN_CONTRATACION'
      WHEN r.estado = 'EN_PAUSA' THEN 'EN_PAUSA'
      WHEN d.cobros_vencidos > 0
        OR r.estado = 'VENCIDA'
        OR r.fecha_fin < hoy.d THEN 'VENCIDA'
      WHEN r.estado = 'PENDIENTE_RENOVACION' THEN 'PENDIENTE'
      WHEN r.fecha_fin - hoy.d <= r.dias_aviso_previo THEN 'POR_VENCER'
      ELSE 'AL_DIA'
    END AS estado
  FROM public.perfiles p
  CROSS JOIN hoy
  LEFT JOIN referencia r ON r.alumno_id = p.id
  LEFT JOIN deuda d ON d.alumno_id = p.id
  WHERE p.rol = 'ALUMNO' OR r.id IS NOT NULL
)
SELECT
  alumno_id,
  profesor_asignado_id,
  contratacion_id,
  estado_contratacion,
  fecha_vencimiento,
  cobros_vencidos,
  primer_vencimiento_impago,
  estado,
  estado IN ('AL_DIA', 'POR_VENCER') AS al_dia
FROM estado;

COMMENT ON VIEW public.v_estado_alumno IS
  'Estado comercial del alumno derivado de contrataciones y cobros (GOZS-719). Fuente única de "al día".';

REVOKE ALL ON public.v_estado_alumno FROM PUBLIC, anon;
GRANT SELECT ON public.v_estado_alumno TO authenticated, service_role;

COMMIT;
