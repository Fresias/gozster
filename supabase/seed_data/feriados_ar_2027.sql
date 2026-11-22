-- GOZS-705: feriados nacionales de Argentina 2027. Idempotente (ON CONFLICT (fecha) DO NOTHING).
-- Fechas calculadas con la Ley 27.399: Pascua 28/3 (Carnaval 8 y 9/2, Viernes Santo 26/3);
-- trasladables: mar/mié -> lunes anterior, jue/vie -> lunes siguiente, sáb/dom no se mueven.
-- Los días no laborables con fines turísticos (PUENTE) de 2027 no estaban publicados al
-- 22/11/2026: cargarlos con un INSERT aparte cuando salga el decreto.
-- id determinista (md5 de la fecha), igual que feriados_ar_2026.sql.
INSERT INTO public.feriados (id, fecha, nombre, tipo, fuente)
SELECT md5('feriado:' || v.fecha)::uuid, v.fecha::date, v.nombre, v.tipo,
       'https://www.argentina.gob.ar/interior/feriados-nacionales-2027'
FROM (VALUES
  ('2027-01-01', 'Año Nuevo', 'INAMOVIBLE'),
  ('2027-02-08', 'Carnaval', 'INAMOVIBLE'),
  ('2027-02-09', 'Carnaval', 'INAMOVIBLE'),
  ('2027-03-24', 'Día Nacional de la Memoria por la Verdad y la Justicia', 'INAMOVIBLE'),
  ('2027-03-26', 'Viernes Santo', 'INAMOVIBLE'),
  ('2027-04-02', 'Día del Veterano y de los Caídos en la Guerra de Malvinas', 'INAMOVIBLE'),
  ('2027-05-01', 'Día del Trabajador', 'INAMOVIBLE'),
  ('2027-05-25', 'Día de la Revolución de Mayo', 'INAMOVIBLE'),
  ('2027-06-20', 'Paso a la Inmortalidad del General Belgrano', 'INAMOVIBLE'),
  ('2027-06-21', 'Paso a la Inmortalidad del General Güemes (trasladado)', 'TRASLADABLE'),
  ('2027-07-09', 'Día de la Independencia', 'INAMOVIBLE'),
  ('2027-08-16', 'Paso a la Inmortalidad del General San Martín (trasladado)', 'TRASLADABLE'),
  ('2027-10-11', 'Día del Respeto a la Diversidad Cultural (trasladado)', 'TRASLADABLE'),
  ('2027-11-20', 'Día de la Soberanía Nacional', 'TRASLADABLE'),
  ('2027-12-08', 'Inmaculada Concepción de María', 'INAMOVIBLE'),
  ('2027-12-25', 'Navidad', 'INAMOVIBLE')
) AS v(fecha, nombre, tipo)
ON CONFLICT (fecha) DO NOTHING;
