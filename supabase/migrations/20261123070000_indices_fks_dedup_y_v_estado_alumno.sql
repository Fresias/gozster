-- GOZS-722 (PL-10): índices en 13 FKs faltantes, 2 índices compuestos para v_estado_alumno
-- y eliminación de 5 índices duplicados de constraints UNIQUE.
-- Idempotente: CREATE INDEX IF NOT EXISTS / DROP INDEX IF EXISTS.

BEGIN;

-- 1. Índices sobre las 13 claves foráneas sin índice de prefijo
CREATE INDEX IF NOT EXISTS idx_alertas_entrenador_resuelto_por
  ON public.alertas_entrenador (resuelto_por);

CREATE INDEX IF NOT EXISTS idx_alumno_historial_dolor_ejercicio_en_rutina_id
  ON public.alumno_historial_dolor (ejercicio_en_rutina_id);

CREATE INDEX IF NOT EXISTS idx_ejercicios_creado_por
  ON public.ejercicios (creado_por);

CREATE INDEX IF NOT EXISTS idx_ejercicios_en_rutina_ejercicio_id
  ON public.ejercicios_en_rutina (ejercicio_id);

CREATE INDEX IF NOT EXISTS idx_errores_app_usuario_id
  ON public.errores_app (usuario_id);

CREATE INDEX IF NOT EXISTS idx_planes_membresia_precios_creado_por
  ON public.planes_membresia_precios (creado_por);

CREATE INDEX IF NOT EXISTS idx_push_cola_destinatario_id
  ON public.push_cola (destinatario_id);

CREATE INDEX IF NOT EXISTS idx_push_cola_mensaje_id
  ON public.push_cola (mensaje_id);

CREATE INDEX IF NOT EXISTS idx_ranking_prs_ejercicio_id
  ON public.ranking_prs (ejercicio_id);

CREATE INDEX IF NOT EXISTS idx_ranking_prs_registrado_por
  ON public.ranking_prs (registrado_por);

CREATE INDEX IF NOT EXISTS idx_registro_series_ejercicio_id
  ON public.registro_series (ejercicio_id);

CREATE INDEX IF NOT EXISTS idx_registro_sesiones_dia_id
  ON public.registro_sesiones (dia_id);

CREATE INDEX IF NOT EXISTS idx_registro_sesiones_dia_sugerido_id
  ON public.registro_sesiones (dia_sugerido_id);

-- 2. Índices compuestos para v_estado_alumno (GOZS-719) y consultas de cobros por alumno
CREATE INDEX IF NOT EXISTS idx_contrataciones_alumno_fecha_fin
  ON public.contrataciones (alumno_id, fecha_fin DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cobros_alumno_fecha_vencimiento
  ON public.cobros (alumno_id, fecha_vencimiento);

-- 3. Eliminar los 5 índices no-únicos duplicados por índices UNIQUE idénticos
DROP INDEX IF EXISTS public.idx_alumno_cuestionario_inicial_alumno_id;
DROP INDEX IF EXISTS public.idx_conversaciones_alumno;
DROP INDEX IF EXISTS public.idx_dias_rutina_plan_orden;
DROP INDEX IF EXISTS public.idx_habitos_alumno_fecha;
DROP INDEX IF EXISTS public.idx_nutricion_alumno_fecha;

COMMIT;
