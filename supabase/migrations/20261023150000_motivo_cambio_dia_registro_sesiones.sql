-- GOZS-146: el alumno informa por qué cambió de día de entrenamiento.
-- motivo_cambio_dia: razón elegida (mockup 09). dia_sugerido_id: el día que le tocaba y no hizo
-- (dia_id sigue siendo el día realmente entrenado), para que el coach vea "cambió Día 2 -> Día 3".
-- RLS: sin cambios; las políticas existentes de registro_sesiones ya limitan la escritura al
-- alumno dueño (o admin) y la lectura a alumno, su entrenador asignado y admin.

BEGIN;

ALTER TABLE public.registro_sesiones
  ADD COLUMN IF NOT EXISTS motivo_cambio_dia TEXT,
  ADD COLUMN IF NOT EXISTS dia_sugerido_id UUID REFERENCES public.dias_rutina(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registro_sesiones_motivo_cambio_dia_check'
      AND conrelid = 'public.registro_sesiones'::regclass
  ) THEN
    ALTER TABLE public.registro_sesiones
      ADD CONSTRAINT registro_sesiones_motivo_cambio_dia_check
      CHECK (motivo_cambio_dia IS NULL OR motivo_cambio_dia IN
        ('CANSANCIO_DEPORTE', 'MOLESTIA', 'POCO_TIEMPO', 'EQUIPO_OCUPADO'));
  END IF;
END $$;

COMMIT;
