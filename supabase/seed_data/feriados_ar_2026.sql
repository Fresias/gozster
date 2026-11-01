-- GOZS-229: feriados nacionales de Argentina 2026. Idempotente (ON CONFLICT (fecha) DO NOTHING).
-- Fuente: https://www.argentina.gob.ar/interior/feriados-nacionales-2026
-- id determinista (md5 de la fecha): una base restaurada coincide fila por fila con el seed.
INSERT INTO public.feriados (id, fecha, nombre, tipo)
SELECT md5('feriado:' || v.fecha)::uuid, v.fecha::date, v.nombre, v.tipo FROM (VALUES
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
) AS v(fecha, nombre, tipo)
ON CONFLICT (fecha) DO NOTHING;
