-- GOZS-234: deduplicar ejercicios importados de Mynter conservando el más completo.
-- Duplicado = mismo nombre normalizado (minúsculas, sin acentos, sin puntuación/espacios repetidos).
-- Ganador = más completo (url_video, luego comentario), desempate: más antiguo, luego id.
-- Idempotente: sin duplicados no hace nada. Reporte vía RAISE NOTICE (visible en logs de la migración).

CREATE TEMP TABLE _ej_dedup ON COMMIT DROP AS
WITH k AS (
  SELECT id, nombre, url_video, comentario, created_at,
    btrim(regexp_replace(
      translate(lower(nombre), 'áàäâéèëêíìïîóòöôúùüûñ', 'aaaaeeeeiiiioooouuuun'),
      '[^a-z0-9]+', ' ', 'g')) AS clave
  FROM public.ejercicios
), r AS (
  SELECT *, first_value(id) OVER (
    PARTITION BY clave
    ORDER BY (nullif(btrim(url_video), '') IS NOT NULL) DESC,
             (nullif(btrim(comentario), '') IS NOT NULL) DESC,
             length(coalesce(comentario, '')) DESC,
             created_at ASC, id ASC) AS ganador_id
  FROM k
)
SELECT id AS perdedor_id, ganador_id, nombre FROM r WHERE id <> ganador_id AND clave <> '';

-- Completar campos vacíos del ganador con los de los perdedores.
UPDATE public.ejercicios g SET
  url_video = coalesce(nullif(btrim(g.url_video), ''), (
    SELECT e.url_video FROM _ej_dedup d JOIN public.ejercicios e ON e.id = d.perdedor_id
    WHERE d.ganador_id = g.id AND nullif(btrim(e.url_video), '') IS NOT NULL LIMIT 1), g.url_video),
  comentario = coalesce(nullif(btrim(g.comentario), ''), (
    SELECT e.comentario FROM _ej_dedup d JOIN public.ejercicios e ON e.id = d.perdedor_id
    WHERE d.ganador_id = g.id AND nullif(btrim(e.comentario), '') IS NOT NULL LIMIT 1), g.comentario)
WHERE g.id IN (SELECT ganador_id FROM _ej_dedup);

-- Repuntar referencias (el trigger de alertas se desactiva para no regenerar alertas al actualizar series).
ALTER TABLE public.registro_series DISABLE TRIGGER trg_crear_alerta_dolor;

UPDATE public.ejercicios_en_rutina t SET ejercicio_id = d.ganador_id
  FROM _ej_dedup d WHERE t.ejercicio_id = d.perdedor_id;
UPDATE public.registro_series t SET ejercicio_id = d.ganador_id
  FROM _ej_dedup d WHERE t.ejercicio_id = d.perdedor_id;
UPDATE public.alertas_entrenador t SET ejercicio_id = d.ganador_id
  FROM _ej_dedup d WHERE t.ejercicio_id = d.perdedor_id;
UPDATE public.alumno_historial_dolor t SET ejercicio_id = d.ganador_id
  FROM _ej_dedup d WHERE t.ejercicio_id = d.perdedor_id;
UPDATE public.sustituciones_ejercicios t SET ejercicio_original_id = d.ganador_id
  FROM _ej_dedup d WHERE t.ejercicio_original_id = d.perdedor_id;
UPDATE public.sustituciones_ejercicios t SET ejercicio_sustituto_id = d.ganador_id
  FROM _ej_dedup d WHERE t.ejercicio_sustituto_id = d.perdedor_id;

ALTER TABLE public.registro_series ENABLE TRIGGER trg_crear_alerta_dolor;

-- Alternativas: pares únicos y sin auto-referencia; los que colisionan se descartan (el par ganador ya existe).
UPDATE public.ejercicios_alternativas t SET ejercicio_origen_id = d.ganador_id
  FROM _ej_dedup d WHERE t.ejercicio_origen_id = d.perdedor_id
  AND NOT EXISTS (SELECT 1 FROM public.ejercicios_alternativas x
                  WHERE x.ejercicio_origen_id = d.ganador_id
                    AND x.ejercicio_alternativo_id = t.ejercicio_alternativo_id)
  AND t.ejercicio_alternativo_id <> d.ganador_id;
UPDATE public.ejercicios_alternativas t SET ejercicio_alternativo_id = d.ganador_id
  FROM _ej_dedup d WHERE t.ejercicio_alternativo_id = d.perdedor_id
  AND NOT EXISTS (SELECT 1 FROM public.ejercicios_alternativas x
                  WHERE x.ejercicio_alternativo_id = d.ganador_id
                    AND x.ejercicio_origen_id = t.ejercicio_origen_id)
  AND t.ejercicio_origen_id <> d.ganador_id;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT d.nombre AS perdido, g.nombre AS conservado
           FROM _ej_dedup d JOIN public.ejercicios g ON g.id = d.ganador_id ORDER BY 2, 1 LOOP
    RAISE NOTICE 'dedup ejercicios: "%" fusionado en "%"', r.perdido, r.conservado;
  END LOOP;
END $$;

-- Las filas de ejercicios_alternativas que no pudieron repuntarse caen por ON DELETE CASCADE.
-- Cualquier otra referencia sin repuntar (p. ej. colisión en registro_series) aborta por RESTRICT.
DELETE FROM public.ejercicios WHERE id IN (SELECT perdedor_id FROM _ej_dedup);
