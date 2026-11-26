-- GOZS-872: columna `usa_barra` en public.ejercicios + backfill 100% verificado.
-- Propósito: etiquetar únicamente los ejercicios que 100% seguro se ejecutan con
-- barra libre olímpica estándar (20 kg) cargable con discos, para mostrar el chip
-- "Barra" en la biblioteca y habilitar el bloque de Aproximación (barra vacía 20 kg)
-- solo cuando corresponde.
--
-- Criterio estricto de inclusión (`usa_barra = true`):
--   - Ejercicios confirmados con barra libre cargable con discos olímpicos.
--   - Catálogo de producción (`seed_produccion.sql` / `seed_gozs.sql`): 11 ejercicios.
--   - Catálogo base local (`seed.sql`): 4 ejercicios básicos con barra libre.
--
-- Criterio estricto de exclusión (`usa_barra = false`):
--   - Poleas/cables aunque mencionen "barra" como agarre (ej.: "Extension de triceps barra V",
--     "Jalón al pecho agarre neutro", "Jalón al Pecho").
--   - Máquinas y Smith/guía (ej.: "Press militar en guia", "Prensa 45°", "Hip thrust en maquina",
--     "Camilla de Isquios", "Sillon de Cuadriceps", "Prensa de Piernas").
--   - Mancuernas, pesas rusas, bandas, discos sueltos, peso corporal, dominadas en barra fija
--     y ejercicios ambiguos sin barra libre confirmada (ej.: "Curl Concentrado", "Curl 45°",
--     "Remo gorila", "Step Up Contralateral", "Skater con peso", "Apertura de hombros c/ banda",
--     "Curl de muñeca inverso", "Dominada al Pecho Supina", "Dominada isométrica", "Dominadas").
--
-- Evaluación explícita de casos de borde (mantenidos en `usa_barra = false`):
--   1. "Press Frances con Barra EZ en Banco Plano": utiliza Barra EZ (~7.5–10 kg), no barra
--      olímpica estándar de 20 kg, y es un ejercicio de aislamiento de tríceps. Mostrar el
--      bloque de Aproximación basado en barra vacía de 20 kg produciría cargas erróneas.
--   2. "Curl de muñeca con barra": ejercicio de aislamiento de antebrazos ejecutado
--      habitualmente con barra corta / EZ (~7.5–10 kg) o barra pre-cargada ligera, cuyas cargas
--      de trabajo frecuentemente rondan 15–30 kg; la aproximación desde barra olímpica de 20 kg
--      no aplica. El entrenador puede activar el flag manualmente en Coach Studio si lo desea.
--
-- Migración estrictamente append-only e idempotente. No modifica `musculos_principales`.

-- 1. Agregar columna `usa_barra` (operación metadata-only en PostgreSQL 15+).
ALTER TABLE public.ejercicios
  ADD COLUMN IF NOT EXISTS usa_barra BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ejercicios.usa_barra IS
  'Indica si el ejercicio se ejecuta 100% seguro con barra libre olímpica estándar (20 kg) cargable con discos; habilita etiqueta "Barra" y bloque de Aproximación.';

-- 2. Backfill idempotente únicamente para ejercicios 100% verificados con barra libre.
UPDATE public.ejercicios e
SET
  usa_barra = true,
  updated_at = now()
FROM (
  VALUES
    -- Catálogo de producción (`seed_produccion.sql` / `seed_gozs.sql`) — 11 ejercicios
    ('Estocadas Frontales con Barra'),
    ('Press militar parado con barra'),
    ('Press Plano con Barra'),
    ('Press Plano con Barra + Pausa (1",2",3")'),
    ('Remo con barra desde rack'),
    ('Remo Inclinado Agarre Prono con Barra'),
    ('Sentadilla bulgara 90° con barra'),
    ('Sentadilla con Barra'),
    ('Sentadilla Frontal agarre cruzado'),
    ('Sentadilla Paralela Barra Baja al Cajon'),
    ('Sentadilla sumo c/ barra'),
    -- Catálogo base local (`seed.sql`) — 4 ejercicios básicos con barra libre
    ('Peso Muerto'),
    ('Press de Banca'),
    ('Press Militar'),
    ('Sentadilla')
) AS v(nombre)
WHERE e.nombre = v.nombre
  AND e.usa_barra IS DISTINCT FROM true;
