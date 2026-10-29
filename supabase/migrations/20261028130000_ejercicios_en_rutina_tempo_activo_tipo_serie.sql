-- GOZS-233: tempo opcional (on/off) y tipo de serie por ejercicio en rutina.
-- `tempo` (TEXT) y `es_superserie`/`grupo_superserie` ya existen; esta migración solo añade
-- el flag de activación y el tipo. Son ortogonales a la superserie: un DROPSET puede vivir
-- dentro de un grupo de superserie.
ALTER TABLE public.ejercicios_en_rutina
  ADD COLUMN IF NOT EXISTS tempo_activo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tipo_serie TEXT NOT NULL DEFAULT 'NORMAL';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_ejercicios_en_rutina_tipo_serie'
      AND conrelid = 'public.ejercicios_en_rutina'::regclass
  ) THEN
    ALTER TABLE public.ejercicios_en_rutina
      ADD CONSTRAINT chk_ejercicios_en_rutina_tipo_serie
      CHECK (tipo_serie IN ('NORMAL', 'WARMUP', 'DROPSET'));
  END IF;
END $$;
-- RLS: sin cambios; las políticas existentes de la tabla cubren las columnas nuevas.
