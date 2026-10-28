-- GOZS-229: feriados de Argentina y flag de clases.
-- Fuente oficial: argentina.gob.ar/interior/feriados-nacionales-2026 (Ley 27.399, Decreto 1027/2024
-- de dias no laborables con fines turisticos 2026). Revisar contra la fuente al cargar otros anios.
-- Por defecto no hay clases en feriado (hay_clases = false); un coach/admin puede habilitarlas.

CREATE TABLE IF NOT EXISTS public.feriados (
  fecha DATE PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('INAMOVIBLE', 'TRASLADABLE', 'PUENTE')),
  hay_clases BOOLEAN NOT NULL DEFAULT false,
  fuente TEXT NOT NULL DEFAULT 'https://www.argentina.gob.ar/interior/feriados-nacionales-2026',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_feriados_updated_at ON public.feriados;
CREATE TRIGGER trg_feriados_updated_at
  BEFORE UPDATE ON public.feriados
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.feriados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feriados_select_autenticado" ON public.feriados;
CREATE POLICY "feriados_select_autenticado"
  ON public.feriados FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "feriados_write_entrenador_o_admin" ON public.feriados;
CREATE POLICY "feriados_write_entrenador_o_admin"
  ON public.feriados FOR ALL TO authenticated
  USING (public.es_entrenador_o_admin())
  WITH CHECK (public.es_entrenador_o_admin());

INSERT INTO public.feriados (fecha, nombre, tipo) VALUES
  ('2026-01-01', 'Año Nuevo', 'INAMOVIBLE'),
  ('2026-02-16', 'Carnaval', 'INAMOVIBLE'),
  ('2026-02-17', 'Carnaval', 'INAMOVIBLE'),
  ('2026-03-23', 'Día no laborable con fines turísticos', 'PUENTE'),
  ('2026-03-24', 'Día Nacional de la Memoria por la Verdad y la Justicia', 'INAMOVIBLE'),
  ('2026-04-02', 'Día del Veterano y de los Caídos en la Guerra de Malvinas', 'INAMOVIBLE'),
  ('2026-04-03', 'Viernes Santo', 'INAMOVIBLE'),
  ('2026-05-01', 'Día del Trabajador', 'INAMOVIBLE'),
  ('2026-05-25', 'Día de la Revolución de Mayo', 'INAMOVIBLE'),
  ('2026-06-15', 'Paso a la Inmortalidad del General Güemes (trasladado)', 'TRASLADABLE'),
  ('2026-06-20', 'Paso a la Inmortalidad del General Belgrano', 'INAMOVIBLE'),
  ('2026-07-09', 'Día de la Independencia', 'INAMOVIBLE'),
  ('2026-07-10', 'Día no laborable con fines turísticos', 'PUENTE'),
  ('2026-08-17', 'Paso a la Inmortalidad del General San Martín', 'TRASLADABLE'),
  ('2026-10-12', 'Día del Respeto a la Diversidad Cultural', 'TRASLADABLE'),
  ('2026-11-23', 'Día de la Soberanía Nacional (trasladado)', 'TRASLADABLE'),
  ('2026-12-07', 'Día no laborable con fines turísticos', 'PUENTE'),
  ('2026-12-08', 'Inmaculada Concepción de María', 'INAMOVIBLE'),
  ('2026-12-25', 'Navidad', 'INAMOVIBLE')
ON CONFLICT (fecha) DO NOTHING;

-- Feriados de un rango (inclusive), ordenados por fecha.
CREATE OR REPLACE FUNCTION public.feriados_en_rango(p_desde DATE, p_hasta DATE)
RETURNS SETOF public.feriados
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT * FROM public.feriados WHERE fecha BETWEEN p_desde AND p_hasta ORDER BY fecha;
$$;

-- true si las clases automaticas pueden generarse ese dia (no feriado, o feriado con hay_clases).
-- SECURITY DEFINER: el generador corre con cualquier rol y solo expone un booleano.
CREATE OR REPLACE FUNCTION public.fecha_habilita_clases(p_fecha DATE)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT hay_clases FROM public.feriados WHERE fecha = p_fecha), true);
$$;

REVOKE ALL ON FUNCTION public.feriados_en_rango(DATE, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fecha_habilita_clases(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.feriados_en_rango(DATE, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fecha_habilita_clases(DATE) TO authenticated, service_role;
