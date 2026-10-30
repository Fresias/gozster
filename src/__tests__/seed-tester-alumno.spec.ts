import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// GOZS-286: todas las migraciones en orden + seed del tester (ALUMNO, GABI AGOSTO, alumno B) sobre PGlite.

const SUPABASE_DIR = path.resolve(__dirname, "../../supabase");
const GABI = "cab4ad3d-8595-47be-a220-6dc52117048e";
const TESTER = "00000000-0000-0000-0000-0000000000a1";
const COACH = "00000000-0000-0000-0000-0000000000c1";
const ALU_B = "00000000-0000-0000-0000-0000000000b2";

const STUBS = `
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

async function aplicar(sql: string) {
  const inicio = sql.search(/^BEGIN;/m);
  if (inicio > 0) {
    await db.exec(sql.slice(0, inicio));
    await db.exec(sql.slice(inicio));
  } else {
    await db.exec(sql);
  }
}

const q = async <T>(sql: string) => (await db.query<T>(sql)).rows;

describe("GOZS-286: seed del tester como ALUMNO", () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(STUBS);
    const dir = path.join(SUPABASE_DIR, "migrations");
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
      await aplicar(fs.readFileSync(path.join(dir, f), "utf-8"));
    }
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES
        ('${TESTER}','94.gabriel.sanchez@gmail.com'),('${COACH}','ds.gabriel.sanchez@gmail.com'),
        ('${ALU_B}','alumno.b.tester@gozster.local'),('00000000-0000-0000-0000-0000000000d1','otro@t');
      INSERT INTO public.perfiles (id, email, nombre_completo, rol) VALUES
        ('00000000-0000-0000-0000-0000000000d1','otro@t','Otro','ALUMNO');
      INSERT INTO public.planes_entrenamiento (id, alumno_id, nombre, estado)
        VALUES ('${GABI}','00000000-0000-0000-0000-0000000000d1','GABI AGOSTO','ACTIVO');
    `);
    const seed = fs.readFileSync(path.join(SUPABASE_DIR, "seed_tester.sql"), "utf-8");
    await db.exec(seed);
    await db.exec(seed); // idempotente
  }, 90_000);

  it("el tester es ALUMNO del coach con GABI AGOSTO como único plan activo", async () => {
    const [p] = await q<{ rol: string; profesor_asignado_id: string }>(
      `SELECT rol, profesor_asignado_id FROM public.perfiles WHERE id = '${TESTER}'`
    );
    expect(p).toEqual({ rol: "ALUMNO", profesor_asignado_id: COACH });
    const activos = await q<{ id: string; profesor_id: string }>(
      `SELECT id, profesor_id FROM public.planes_entrenamiento WHERE alumno_id = '${TESTER}' AND estado = 'ACTIVO'`
    );
    expect(activos).toEqual([{ id: GABI, profesor_id: COACH }]);
  });

  it("existe el alumno B con plan propio, distinto del tester", async () => {
    const r = await q<{ alumno_id: string }>(
      `SELECT alumno_id FROM public.planes_entrenamiento WHERE alumno_id = '${ALU_B}' AND estado = 'ACTIVO'`
    );
    expect(r).toHaveLength(1);
  });

  it("registro_series tiene los CHECK de 1000 kg y 100 reps", async () => {
    const checks = await q<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'public.registro_series'::regclass AND contype = 'c'`
    );
    const defs = checks.map((c) => c.def).join(" ");
    expect(defs).toContain("peso_kg <= (1000)::numeric");
    expect(defs).toContain("reps_hechas <= 100)");
  });
});
