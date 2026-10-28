-- GOZS-194: lista de espera. EN_ESPERA no ocupa cupo ni consume límite semanal
-- (las RPC solo cuentan ANOTADO/AUSENTE) y el índice único ya la cubre (estado <> 'CANCELADO').
ALTER TABLE public.reservas DROP CONSTRAINT IF EXISTS reservas_estado_check;
ALTER TABLE public.reservas
  ADD CONSTRAINT reservas_estado_check
  CHECK (estado IN ('ANOTADO', 'CANCELADO', 'AUSENTE', 'ANULADO', 'EN_ESPERA'));
