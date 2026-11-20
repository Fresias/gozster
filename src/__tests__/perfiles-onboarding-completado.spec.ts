import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

const COACH = "00000000-0000-0000-0000-000000000002";
const ALUMNO = "00000000-0000-0000-0000-000000000004";
const OTRO_ALUMNO = "00000000-0000-0000-0000-000000000005";
const ALUMNO_NUEVO = "00000000-0000-0000-0000-000000000006";

type Rol = "anon" | "authenticated" | "service_role";

const SUPABASE_STUBS = `
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
    SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' $$;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`;

const SEED_PERFILES = `
  INSERT INTO auth.users (id, email) VALUES
    ('${COACH}','coach@t'),('${ALUMNO}','a@t'),('${OTRO_ALUMNO}','b@t');
  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${COACH}','coach@t','Coach','ENTRENADOR',NULL,'ACTIVA'),
    ('${ALUMNO}','a@t','Lucía Fernández','ALUMNO','${COACH}','ACTIVA'),
    ('${OTRO_ALUMNO}','b@t','Marcos Díaz','ALUMNO','${COACH}','ACTIVA');
`;

let db: PGlite;

async function aplicarMigracion(sql: string) {
  const inicio = sql.search(/^BEGIN;/m);
  if (inicio > 0) {
    await db.exec(sql.slice(0, inicio));
    await db.exec(sql.slice(inicio));
  } else {
    await db.exec(sql);
  }
}

function como<T>(rol: Rol, sub: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub ? { sub, role: rol } : { role: rol }),
    ]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query<T>(sql, params);
  });
}

describe("GH #548: perfiles.onboarding_completado y RPC completar_onboarding_alumno (PGlite)", () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(SUPABASE_STUBS);

    const archivos = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const archivo of archivos) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), "utf-8");
      await aplicarMigracion(sql);
    }

    await db.exec(SEED_PERFILES);
  }, 120_000);

  it("1. crea la columna onboarding_completado con DEFAULT false NOT NULL", async () => {
    const existentes = await db.query<{ id: string; onboarding_completado: boolean }>(
      `SELECT id, onboarding_completado FROM public.perfiles WHERE id IN ($1, $2) ORDER BY id`,
      [ALUMNO, OTRO_ALUMNO],
    );
    expect(existentes.rows).toEqual([
      { id: ALUMNO, onboarding_completado: false },
      { id: OTRO_ALUMNO, onboarding_completado: false },
    ]);

    // Un perfil recién creado también arranca en false por defecto
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'nuevo@t')`, [ALUMNO_NUEVO]);
    await db.query(
      `INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia)
       VALUES ($1, 'nuevo@t', 'Nuevo Alumno', 'ALUMNO', $2, 'ACTIVA')`,
      [ALUMNO_NUEVO, COACH],
    );
    const nuevo = await db.query<{ onboarding_completado: boolean }>(
      `SELECT onboarding_completado FROM public.perfiles WHERE id = $1`,
      [ALUMNO_NUEVO],
    );
    expect(nuevo.rows[0]?.onboarding_completado).toBe(false);

    // NOT NULL impide insertar NULL explícito
    await expect(
      db.query(`UPDATE public.perfiles SET onboarding_completado = NULL WHERE id = $1`, [
        ALUMNO_NUEVO,
      ]),
    ).rejects.toThrow();
  });

  it("2. usuario autenticado ejecuta completar_onboarding_alumno() -> marca true solo su fila y es idempotente", async () => {
    const res = await como<{ completar_onboarding_alumno: boolean }>(
      "authenticated",
      ALUMNO,
      `SELECT public.completar_onboarding_alumno()`,
    );
    expect(res.rows[0]?.completar_onboarding_alumno).toBe(true);

    const lectura = await como<{ onboarding_completado: boolean }>(
      "authenticated",
      ALUMNO,
      `SELECT onboarding_completado FROM public.perfiles WHERE id = $1`,
      [ALUMNO],
    );
    expect(lectura.rows[0]?.onboarding_completado).toBe(true);

    // Llamarla nuevamente sigue devolviendo true sin error
    const resRepetida = await como<{ completar_onboarding_alumno: boolean }>(
      "authenticated",
      ALUMNO,
      `SELECT public.completar_onboarding_alumno()`,
    );
    expect(resRepetida.rows[0]?.completar_onboarding_alumno).toBe(true);
  });

  it("3. no modifica filas de otros alumnos", async () => {
    const otro = await db.query<{ onboarding_completado: boolean }>(
      `SELECT onboarding_completado FROM public.perfiles WHERE id = $1`,
      [OTRO_ALUMNO],
    );
    expect(otro.rows[0]?.onboarding_completado).toBe(false);

    const nuevo = await db.query<{ onboarding_completado: boolean }>(
      `SELECT onboarding_completado FROM public.perfiles WHERE id = $1`,
      [ALUMNO_NUEVO],
    );
    expect(nuevo.rows[0]?.onboarding_completado).toBe(false);
  });

  it("4. rechaza ejecución para anon y para llamadas sin auth.uid() con SQLSTATE 42501", async () => {
    let anonCode: string | undefined;
    try {
      await como("anon", null, `SELECT public.completar_onboarding_alumno()`);
    } catch (err: unknown) {
      anonCode = (err as { code?: string }).code;
    }
    expect(anonCode).toBe("42501");

    let unauthCode: string | undefined;
    try {
      await como("authenticated", null, `SELECT public.completar_onboarding_alumno()`);
    } catch (err: unknown) {
      unauthCode = (err as { code?: string }).code;
    }
    expect(unauthCode).toBe("42501");
  });
});
