-- GOZS-231: ranking funcional. El coach registra PRs de los alumnos de una clase
-- en un ejercicio del catálogo (dominada con lastre, press militar, etc.).
-- Se reutiliza clases/reservas/ejercicios: solo se agrega ranking_prs.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ranking_prs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clase_id UUID NOT NULL REFERENCES public.clases(id) ON DELETE RESTRICT,
  alumno_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE RESTRICT,
  ejercicio_id UUID NOT NULL REFERENCES public.ejercicios(id) ON DELETE RESTRICT,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  peso_kg NUMERIC(6, 2) NOT NULL CHECK (peso_kg >= 0),
  reps INT NOT NULL CHECK (reps > 0),
  registrado_por UUID NOT NULL DEFAULT auth.uid() REFERENCES public.perfiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_ranking_prs_updated_at ON public.ranking_prs;
CREATE TRIGGER trg_ranking_prs_updated_at
  BEFORE UPDATE ON public.ranking_prs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_ranking_prs_clase_ejercicio ON public.ranking_prs (clase_id, ejercicio_id, peso_kg DESC);
CREATE INDEX IF NOT EXISTS idx_ranking_prs_alumno_id ON public.ranking_prs (alumno_id);
CREATE INDEX IF NOT EXISTS idx_ranking_prs_updated_at ON public.ranking_prs (updated_at);

-- Solo participan alumnos con reserva vigente en la clase.
CREATE OR REPLACE FUNCTION public.fn_ranking_pr_participante()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.reservas
    WHERE clase_id = NEW.clase_id
      AND alumno_id = NEW.alumno_id
      AND estado IN ('ANOTADO', 'AUSENTE')
  ) THEN
    RAISE EXCEPTION 'El alumno no participa en la clase'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ranking_prs_participante ON public.ranking_prs;
CREATE TRIGGER trg_ranking_prs_participante
  BEFORE INSERT OR UPDATE OF clase_id, alumno_id ON public.ranking_prs
  FOR EACH ROW EXECUTE FUNCTION public.fn_ranking_pr_participante();

-- RLS: el profesor de la clase (o admin) gestiona; el alumno lee los suyos.
ALTER TABLE public.ranking_prs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ranking_prs_select" ON public.ranking_prs;
CREATE POLICY "ranking_prs_select"
  ON public.ranking_prs FOR SELECT TO authenticated
  USING (alumno_id = auth.uid() OR public.es_profesor_de_clase(clase_id));

DROP POLICY IF EXISTS "ranking_prs_insert_coach" ON public.ranking_prs;
CREATE POLICY "ranking_prs_insert_coach"
  ON public.ranking_prs FOR INSERT TO authenticated
  WITH CHECK (public.es_profesor_de_clase(clase_id) AND registrado_por = auth.uid());

DROP POLICY IF EXISTS "ranking_prs_update_coach" ON public.ranking_prs;
CREATE POLICY "ranking_prs_update_coach"
  ON public.ranking_prs FOR UPDATE TO authenticated
  USING (public.es_profesor_de_clase(clase_id))
  WITH CHECK (public.es_profesor_de_clase(clase_id));

DROP POLICY IF EXISTS "ranking_prs_delete_coach" ON public.ranking_prs;
CREATE POLICY "ranking_prs_delete_coach"
  ON public.ranking_prs FOR DELETE TO authenticated
  USING (public.es_profesor_de_clase(clase_id));

REVOKE ALL ON public.ranking_prs FROM anon;

COMMIT;
