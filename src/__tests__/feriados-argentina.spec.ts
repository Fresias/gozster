import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// GOZS-229: feriados de Argentina y flag de clases (PGlite, roles Supabase simulados).

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const NEW_MIGRATION = "20261030000700_feriados_argentina.sql";
const COACH = "00000000-0000-0000-0000-0000000000a1";
const ALUMNO = "00000000-0000-0000-0000-0000000000a2";

type Rol = "anon" | "authenticated" | "service_role";

const SUPABASE_STUBS = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, instance_id uuid, aud text, role text, email text, encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
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

describe("GOZS-229: feriados", () => {
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
    const seedPath = path.resolve(__dirname, "../../supabase/seed_data/feriados_ar_2026.sql");
    await db.exec(fs.readFileSync(seedPath, "utf-8"));
    await db.exec(fs.readFileSync(seedPath, "utf-8")); // idempotente
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${COACH}','c@t'),('${ALUMNO}','a@t');
      INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia) VALUES
        ('${COACH}','c@t','Coach','ENTRENADOR','ACTIVA'),('${ALUMNO}','a@t','Alumno','ALUMNO','ACTIVA');
    `);
  }, 60_000);

  it("devuelve feriados de un rango con tipo y fuente documentada", async () => {
    const r = await como<{ fecha: string; tipo: string; fuente: string }>(
      "authenticated", ALUMNO,
      "SELECT fecha::text, tipo, fuente FROM public.feriados_en_rango('2026-03-01','2026-04-30')"
    );
    expect(r.rows.map((x) => x.fecha)).toEqual(["2026-03-23", "2026-03-24", "2026-04-02", "2026-04-03"]);
    expect(r.rows[0]!.tipo).toBe("PUENTE");
    expect(r.rows.every((x) => x.fuente.includes("argentina.gob.ar"))).toBe(true);
  });

  it("no habilita clases en feriado, sí en día común", async () => {
    const r = await como<{ a: boolean; b: boolean }>(
      "authenticated", ALUMNO,
      "SELECT public.fecha_habilita_clases('2026-05-25') AS a, public.fecha_habilita_clases('2026-05-26') AS b"
    );
    expect(r.rows[0]).toEqual({ a: false, b: true });
  });

  it("solo entrenador/admin escribe; anon no lee", async () => {
    await expect(
      como("authenticated", ALUMNO, "INSERT INTO public.feriados (fecha, nombre, tipo) VALUES ('2026-09-01','x','PUENTE')")
    ).rejects.toThrow();
    await como("authenticated", COACH, "UPDATE public.feriados SET hay_clases = true WHERE fecha = '2026-05-25'");
    const r = await como<{ a: boolean }>("authenticated", ALUMNO, "SELECT public.fecha_habilita_clases('2026-05-25') AS a");
    expect(r.rows[0]!.a).toBe(true);
    await expect(como("anon", null, "SELECT * FROM public.feriados_en_rango('2026-01-01','2026-12-31')")).rejects.toThrow();
  });
});
