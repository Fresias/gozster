import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// GOZS-577 (BE-03 CP1): bucket privado videos-series y políticas RLS en storage.objects (PGlite).

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

const ALUMNO_A = "00000000-0000-0000-0000-0000000000a1";
const ALUMNO_B = "00000000-0000-0000-0000-0000000000a2";
const COACH_A = "00000000-0000-0000-0000-0000000000c1";
const COACH_OTRO = "00000000-0000-0000-0000-0000000000c2";
const ADMIN_ID = "00000000-0000-0000-0000-0000000000ad";
const SESION_ID = "11111111-1111-4111-8111-111111111111";
const EJERCICIO_ID = "22222222-2222-4222-8222-222222222222";

type Rol = "anon" | "authenticated" | "service_role";

const SUPABASE_AND_STORAGE_STUBS = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;

  CREATE SCHEMA auth;
  CREATE TABLE auth.users (
    id uuid PRIMARY KEY,
    instance_id uuid,
    aud text,
    role text,
    email text,
    encrypted_password text,
    email_confirmed_at timestamptz,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
  $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  $$;

  CREATE SCHEMA storage;
  CREATE TABLE storage.buckets (
    id text PRIMARY KEY,
    name text NOT NULL,
    public boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  CREATE TABLE storage.objects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id text REFERENCES storage.buckets(id),
    name text NOT NULL,
    owner uuid,
    created_at timestamptz DEFAULT now()
  );
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

  CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
      WHEN position('/' in name) = 0 THEN ARRAY[]::text[]
      ELSE (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
    END
  $$;

  GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
  GRANT ALL ON TABLE storage.buckets TO service_role;
  GRANT SELECT ON TABLE storage.buckets TO authenticated;
  GRANT ALL ON TABLE storage.objects TO authenticated, service_role;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA storage TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`;

let db: PGlite;

function como<T = Record<string, unknown>>(
  rol: Rol,
  sub: string | null,
  sql: string,
  params: unknown[] = [],
) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub ? { sub, role: rol } : { role: rol }),
    ]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query<T>(sql, params);
  });
}

describe("GOZS-577 (BE-03 CP1): bucket videos-series y políticas RLS", () => {
  beforeAll(async () => {
    // Bootstrap propio: agrega schema `storage` (buckets, objects, foldername) ausente en el snapshot compartido.
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(SUPABASE_AND_STORAGE_STUBS);

    const aplicar = async (sql: string) => {
      const i = sql.search(/^BEGIN;/m);
      if (i > 0) {
        await db.exec(sql.slice(0, i));
        await db.exec(sql.slice(i));
      } else {
        await db.exec(sql);
      }
    };

    for (const f of fs.readdirSync(MIGRATIONS_DIR).filter((x) => x.endsWith(".sql")).sort()) {
      await aplicar(fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf-8"));
    }

    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES
        ('${COACH_A}', 'coach-a@t.test'),
        ('${COACH_OTRO}', 'coach-b@t.test'),
        ('${ADMIN_ID}', 'admin@t.test'),
        ('${ALUMNO_A}', 'alumno-a@t.test'),
        ('${ALUMNO_B}', 'alumno-b@t.test');

      INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia, profesor_asignado_id) VALUES
        ('${COACH_A}', 'coach-a@t.test', 'Coach A', 'ENTRENADOR', 'ACTIVA', NULL),
        ('${COACH_OTRO}', 'coach-b@t.test', 'Coach Otro', 'ENTRENADOR', 'ACTIVA', NULL),
        ('${ADMIN_ID}', 'admin@t.test', 'Admin', 'ADMIN', 'ACTIVA', NULL),
        ('${ALUMNO_A}', 'alumno-a@t.test', 'Alumno A', 'ALUMNO', 'ACTIVA', '${COACH_A}'),
        ('${ALUMNO_B}', 'alumno-b@t.test', 'Alumno B', 'ALUMNO', 'ACTIVA', '${COACH_OTRO}')
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, nombre_completo = EXCLUDED.nombre_completo, rol = EXCLUDED.rol, estado_membresia = EXCLUDED.estado_membresia, profesor_asignado_id = EXCLUDED.profesor_asignado_id;

      INSERT INTO storage.buckets (id, name, public) VALUES ('otro-bucket', 'otro-bucket', true);
      INSERT INTO storage.objects (bucket_id, name) VALUES
        ('otro-bucket', 'public/logo.png'),
        ('videos-series', '${ALUMNO_B}/${SESION_ID}/${EJERCICIO_ID}/1-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.mp4');
    `);
  }, 60_000);

  it("crea el bucket privado videos-series con límite de 100 MB y MIME de video", async () => {
    const r = await db.query<{
      id: string;
      public: boolean;
      file_size_limit: string | number;
      allowed_mime_types: string[];
    }>("SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'videos-series'");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]?.public).toBe(false);
    expect(Number(r.rows[0]?.file_size_limit)).toBe(104_857_600);
    expect(r.rows[0]?.allowed_mime_types).toEqual([
      "video/mp4",
      "video/quicktime",
      "video/webm",
      "video/3gpp",
    ]);
  });

  it("el alumno A sube en su carpeta, pero NO puede subir en la carpeta de B ni anon puede insertar", async () => {
    const rutaA = `${ALUMNO_A}/${SESION_ID}/${EJERCICIO_ID}/1-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.mp4`;
    const rutaB = `${ALUMNO_B}/${SESION_ID}/${EJERCICIO_ID}/1-cccccccc-cccc-4ccc-8ccc-cccccccccccc.mp4`;

    await expect(
      como(
        "authenticated",
        ALUMNO_A,
        "INSERT INTO storage.objects (bucket_id, name) VALUES ('videos-series', $1)",
        [rutaB],
      ),
    ).rejects.toThrow();

    await expect(
      como(
        "anon",
        null,
        "INSERT INTO storage.objects (bucket_id, name) VALUES ('videos-series', $1)",
        [rutaA],
      ),
    ).rejects.toThrow();

    await como(
      "authenticated",
      ALUMNO_A,
      "INSERT INTO storage.objects (bucket_id, name) VALUES ('videos-series', $1)",
      [rutaA],
    );

    const propios = await como<{ name: string }>(
      "authenticated",
      ALUMNO_A,
      "SELECT name FROM storage.objects WHERE bucket_id = 'videos-series'",
    );
    expect(propios.rows.map((r) => r.name)).toEqual([rutaA]);
  });

  it("el entrenador de A y admin leen el video de A; otro entrenador no lee el video de A", async () => {
    const rutaA = `${ALUMNO_A}/${SESION_ID}/${EJERCICIO_ID}/1-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.mp4`;

    const coachA = await como<{ name: string }>(
      "authenticated",
      COACH_A,
      "SELECT name FROM storage.objects WHERE bucket_id = 'videos-series'",
    );
    expect(coachA.rows.map((r) => r.name)).toEqual([rutaA]);

    const otroCoach = await como<{ name: string }>(
      "authenticated",
      COACH_OTRO,
      "SELECT name FROM storage.objects WHERE bucket_id = 'videos-series' AND name = $1",
      [rutaA],
    );
    expect(otroCoach.rows).toHaveLength(0);

    const admin = await como<{ name: string }>(
      "authenticated",
      ADMIN_ID,
      "SELECT name FROM storage.objects WHERE bucket_id = 'videos-series' AND name = $1",
      [rutaA],
    );
    expect(admin.rows).toHaveLength(1);
  });

  it("no existe política de UPDATE y solo el alumno dueño puede borrar su objeto", async () => {
    const rutaA = `${ALUMNO_A}/${SESION_ID}/${EJERCICIO_ID}/1-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.mp4`;

    const upd = await como(
      "authenticated",
      ALUMNO_A,
      "UPDATE storage.objects SET name = $1 WHERE bucket_id = 'videos-series' AND name = $2",
      [`${ALUMNO_A}/otro.mp4`, rutaA],
    );
    expect(upd.affectedRows ?? 0).toBe(0);

    const delCoach = await como(
      "authenticated",
      COACH_A,
      "DELETE FROM storage.objects WHERE bucket_id = 'videos-series' AND name = $1",
      [rutaA],
    );
    expect(delCoach.affectedRows ?? 0).toBe(0);

    const delProp = await como(
      "authenticated",
      ALUMNO_A,
      "DELETE FROM storage.objects WHERE bucket_id = 'videos-series' AND name = $1",
      [rutaA],
    );
    expect(delProp.affectedRows).toBe(1);
  });
});
