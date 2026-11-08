-- ADR-005 / GOZS-423: purga de "Mynter" en la capa de datos.
-- Renombra el coach sembrado conservando el MISMO UUID (FKs y login intactos). Idempotente.
DO $$
DECLARE
  v_id    constant uuid := '20685bca-6304-4e55-abba-37a1cf8f6113';
  v_email constant text := 'coach.gozs@gozster.local';
  v_nombre constant text := 'Profesor Titular GOZS';
BEGIN
  -- auth.users: solo si existe el coach y el email destino no está tomado por otro usuario.
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = v_id)
     AND NOT EXISTS (SELECT 1 FROM auth.users WHERE email = v_email AND id <> v_id) THEN
    UPDATE auth.users
       SET email = v_email,
           raw_user_meta_data = jsonb_set(coalesce(raw_user_meta_data, '{}'::jsonb), '{nombre_completo}', to_jsonb(v_nombre)),
           updated_at = now()
     WHERE id = v_id
       AND (email IS DISTINCT FROM v_email
            OR raw_user_meta_data ->> 'nombre_completo' IS DISTINCT FROM v_nombre);

    IF to_regclass('auth.identities') IS NOT NULL THEN
      EXECUTE $q$
        UPDATE auth.identities
           SET identity_data = jsonb_set(coalesce(identity_data, '{}'::jsonb), '{email}', to_jsonb($2::text)),
               updated_at = now()
         WHERE user_id = $1 AND provider = 'email'
           AND identity_data ->> 'email' IS DISTINCT FROM $2
      $q$ USING v_id, v_email;
    END IF;

    UPDATE public.perfiles
       SET email = v_email, nombre_completo = v_nombre, updated_at = now()
     WHERE id = v_id
       AND (email IS DISTINCT FROM v_email OR nombre_completo IS DISTINCT FROM v_nombre);
  END IF;
END $$;
