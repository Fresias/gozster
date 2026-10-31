import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// GOZS-292: errores_app (PGlite, roles Supabase simulados).

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const NEW_MIGRATION = "20261029190000_errores_app.sql";
const COACH = "00000000-0000-0000-0000-0000000000a1";
const ALUMNO = "00000000-0000-0000-0000-0000000000a2";

type Rol = "anon" | "authenticated" | "service_role";

const SUPABASE_STUBS = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, encrypted_password text);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' $$;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`;

let db: PGlite;

function como<T>(rol: Rol, sub: string | null, sql: string) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub ? { sub, role: rol } : { role: rol }),
    ]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query<T>(sql);
  });
}

describe("GOZS-292: errores_app", () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(SUPABASE_STUBS);
    const aplicar = async (sql: string) => {
      const i = sql.search(/^BEGIN;/m);
      if (i > 0) {
        await db.exec(sql.slice(0, i));
        await db.exec(sql.slice(i));
      } else await db.exec(sql);
    };
    for (const f of fs.readdirSync(MIGRATIONS_DIR).filter((x) => x.endsWith(".sql")).sort()) {
      await aplicar(fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf-8"));
    }
    await aplicar(fs.readFileSync(path.join(MIGRATIONS_DIR, NEW_MIGRATION), "utf-8"));
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${COACH}','c@t'),('${ALUMNO}','a@t');
      INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia) VALUES
        ('${COACH}','c@t','Coach','ENTRENADOR','ACTIVA'),('${ALUMNO}','a@t','Alumno','ALUMNO','ACTIVA');
    `);
  }, 60_000);

  it("el usuario inserta su error y no lee errores ajenos", async () => {
    await como("authenticated", ALUMNO, `INSERT INTO public.errores_app (usuario_id, contexto, mensaje_humano) VALUES ('${ALUMNO}','guardar_sesion','No se pudo guardar')`);
    const r = await como("authenticated", ALUMNO, "SELECT * FROM public.errores_app");
    expect(r.rows).toHaveLength(0);
  });

  it("rechaza insertar con usuario_id ajeno y a anon", async () => {
    await expect(
      como("authenticated", ALUMNO, `INSERT INTO public.errores_app (usuario_id, contexto, mensaje_humano) VALUES ('${COACH}','x','y')`)
    ).rejects.toThrow();
    await expect(
      como("anon", null, `INSERT INTO public.errores_app (usuario_id, contexto, mensaje_humano) VALUES ('${ALUMNO}','x','y')`)
    ).rejects.toThrow();
  });

  it("entrenador/admin lee los errores", async () => {
    const r = await como("authenticated", COACH, "SELECT usuario_id FROM public.errores_app");
    expect(r.rows).toHaveLength(1);
  });
});
