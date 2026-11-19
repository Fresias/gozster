-- D-50 (Athlete v7 · BE-03): videos del alumno por serie. Bucket privado.
-- Sin política de UPDATE: un video no se reemplaza, se sube uno nuevo.
-- Guardado con to_regclass para entornos de test sin esquema storage (PGlite base);
-- en Supabase siempre existen storage.buckets y storage.objects.

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL
     AND to_regclass('storage.objects') IS NOT NULL THEN

    EXECUTE $bucket$
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES (
        'videos-series',
        'videos-series',
        false,
        104857600,
        ARRAY['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp']
      )
      ON CONFLICT (id) DO NOTHING
    $bucket$;

    -- Ruta obligatoria: <alumno_id>/<sesion_id>/<ejercicio_id>/<numero_serie>-<uuid>.<ext>
    EXECUTE 'DROP POLICY IF EXISTS videos_series_insert_propio ON storage.objects';
    EXECUTE $policy$
      CREATE POLICY videos_series_insert_propio
        ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (
          bucket_id = 'videos-series'
          AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
        )
    $policy$;

    EXECUTE 'DROP POLICY IF EXISTS videos_series_select_alumno_o_entrenador ON storage.objects';
    EXECUTE $policy$
      CREATE POLICY videos_series_select_alumno_o_entrenador
        ON storage.objects FOR SELECT TO authenticated
        USING (
          bucket_id = 'videos-series'
          AND (
            (storage.foldername(name))[1] = (SELECT auth.uid())::text
            OR (
              (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND public.es_entrenador_de(((storage.foldername(name))[1])::uuid)
            )
            OR public.es_admin()
          )
        )
    $policy$;

    EXECUTE 'DROP POLICY IF EXISTS videos_series_delete_propio ON storage.objects';
    EXECUTE $policy$
      CREATE POLICY videos_series_delete_propio
        ON storage.objects FOR DELETE TO authenticated
        USING (
          bucket_id = 'videos-series'
          AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
        )
    $policy$;
  END IF;
END $$;
