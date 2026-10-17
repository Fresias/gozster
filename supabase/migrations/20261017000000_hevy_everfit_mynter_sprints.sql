-- ============================================================================
-- GOZSter: Migración Sprints 1 a 4 (Hevy, Everfit, Mynter Reverse-Engineered)
-- Archivo: supabase/migrations/20261017000000_hevy_everfit_mynter_sprints.sql
-- ============================================================================

BEGIN;

-- 1. Ampliar ejercicios_en_rutina para Tempo y RPE Forzado
ALTER TABLE public.ejercicios_en_rutina
  ADD COLUMN IF NOT EXISTS tempo TEXT DEFAULT '3-0-1-0',
  ADD COLUMN IF NOT EXISTS force_rpe_required BOOLEAN NOT NULL DEFAULT false;

-- 2. Ampliar registro_sesiones para Volumen Efectivo (excluye Warmup) y Feedback
ALTER TABLE public.registro_sesiones
  ADD COLUMN IF NOT EXISTS effective_volume_kg NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS athlete_feedback TEXT;

-- 3. Ampliar registro_series para Taxonomía Hevy (W, N, F, D), Dolor y Video
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'registro_series' 
      AND column_name = 'set_type'
  ) THEN
    ALTER TABLE public.registro_series
      ADD COLUMN set_type TEXT NOT NULL DEFAULT 'NORMAL'
      CHECK (set_type IN ('WARMUP', 'NORMAL', 'FAILURE', 'DROPSET', 'W', 'N', 'F', 'D'));
  END IF;
END $$;

ALTER TABLE public.registro_series
  ADD COLUMN IF NOT EXISTS pain_reported BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pain_notes TEXT,
  ADD COLUMN IF NOT EXISTS video_url TEXT;

-- 4. Ampliar perfiles con teléfono para WhatsApp 1-Clic
ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS telefono TEXT;

-- 5. Tabla: habitos_registros (Everfit Habit Tracker)
CREATE TABLE IF NOT EXISTS public.habitos_registros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  agua_ml INTEGER NOT NULL DEFAULT 0 CHECK (agua_ml >= 0),
  pasos INTEGER NOT NULL DEFAULT 0 CHECK (pasos >= 0),
  sueno_horas NUMERIC(3,1) NOT NULL DEFAULT 0 CHECK (sueno_horas >= 0),
  habitos_completados BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_habitos_alumno_fecha UNIQUE (alumno_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_habitos_alumno_fecha ON public.habitos_registros(alumno_id, fecha);

ALTER TABLE public.habitos_registros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "habitos_lectura_autenticada" ON public.habitos_registros;
CREATE POLICY "habitos_lectura_autenticada" ON public.habitos_registros
  FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "habitos_escritura_autenticada" ON public.habitos_registros;
CREATE POLICY "habitos_escritura_autenticada" ON public.habitos_registros
  FOR ALL TO authenticated, anon
  USING (true)
  WITH CHECK (true);

-- 6. Tabla: nutricion_registros (Everfit Macros Weekly)
CREATE TABLE IF NOT EXISTS public.nutricion_registros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  calorias_consumidas INTEGER NOT NULL DEFAULT 0 CHECK (calorias_consumidas >= 0),
  calorias_meta INTEGER NOT NULL DEFAULT 2200 CHECK (calorias_meta >= 0),
  proteinas_g INTEGER NOT NULL DEFAULT 0 CHECK (proteinas_g >= 0),
  proteinas_meta_g INTEGER NOT NULL DEFAULT 160 CHECK (proteinas_meta_g >= 0),
  carbos_g INTEGER NOT NULL DEFAULT 0 CHECK (carbos_g >= 0),
  carbos_meta_g INTEGER NOT NULL DEFAULT 220 CHECK (carbos_meta_g >= 0),
  grasas_g INTEGER NOT NULL DEFAULT 0 CHECK (grasas_g >= 0),
  grasas_meta_g INTEGER NOT NULL DEFAULT 65 CHECK (grasas_meta_g >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_nutricion_alumno_fecha UNIQUE (alumno_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_nutricion_alumno_fecha ON public.nutricion_registros(alumno_id, fecha);

ALTER TABLE public.nutricion_registros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nutricion_lectura_autenticada" ON public.nutricion_registros;
CREATE POLICY "nutricion_lectura_autenticada" ON public.nutricion_registros
  FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "nutricion_escritura_autenticada" ON public.nutricion_registros;
CREATE POLICY "nutricion_escritura_autenticada" ON public.nutricion_registros
  FOR ALL TO authenticated, anon
  USING (true)
  WITH CHECK (true);

-- Triggers para updated_at
DROP TRIGGER IF EXISTS trg_habitos_updated_at ON public.habitos_registros;
CREATE TRIGGER trg_habitos_updated_at
  BEFORE UPDATE ON public.habitos_registros
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_nutricion_updated_at ON public.nutricion_registros;
CREATE TRIGGER trg_nutricion_updated_at
  BEFORE UPDATE ON public.nutricion_registros
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMIT;
