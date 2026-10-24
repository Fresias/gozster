-- Importador (GH #160): conserva el comentario de cada serie del historial.
ALTER TABLE public.registro_series
  ADD COLUMN IF NOT EXISTS notas TEXT;
