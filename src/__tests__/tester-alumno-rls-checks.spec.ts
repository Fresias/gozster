import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// GOZS-202: seed del tester, aislamiento IDOR entre atletas y CHECKs de registro_series (PGlite).

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const SEED_MIGRATION = "20261028130100_seed_tester_alumno_rutina_3_dias.sql";
const TESTER_EMAIL = "94.gabriel.sanchez@gmail.com";

const TESTER = "00000000-0000-0000-0000-0000000000f1";
const ALUMNO_A = "00000000-0000-0000-0000-00000000000a";
const ALUMNO_B = "00000000-0000-0000-0000-00000000000b";
const PLAN_B = "00000000-0000-0000-0000-0000000f00b1";
const SESION_A = "00000000-0000-0000-0000-0000000a0001";
const SESION_B = "00000000-0000-0000-0000-0000000b0001";
const EJ = "00000000-0000-0000-0000-0000000e0001";

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

const SEED = `
  INSERT INTO auth.users (id, email) VALUES
    ('${TESTER}','${TESTER_EMAIL}'),('${ALUMNO_A}','a@t'),('${ALUMNO_B}','b@t');
  INSERT INTO public.perfiles (id, email, nombre_completo, rol) VALUES
    ('${TESTER}','${TESTER_EMAIL}','Tester','ALUMNO'),
    ('${ALUMNO_A}','a@t','Alumno A','ALUMNO'),
    ('${ALUMNO_B}','b@t','Alumno B','ALUMNO');
  INSERT INTO public.ejercicios (id, nombre) VALUES ('${EJ}','Ej test');
  INSERT INTO public.planes_entrenamiento (id, nombre, alumno_id) VALUES ('${PLAN_B}','Plan B','${ALUMNO_B}');
  INSERT INTO public.registro_sesiones (id, alumno_id) VALUES ('${SESION_A}','${ALUMNO_A}'),('${SESION_B}','${ALUMNO_B}');
  INSERT INTO public.registro_series (sesion_id, ejercicio_id, numero_serie, peso_kg, reps_hechas)
    VALUES ('${SESION_B}','${EJ}',1,50,5);
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

async function aplicar(sql: string) {
  const inicio = sql.search(/^BEGIN;/m);
  if (inicio > 0) {
    await db.exec(sql.slice(0, inicio));
    await db.exec(sql.slice(inicio));
  } else {
    await db.exec(sql);
  }
}

const DENEGADO = /row-level security|permission denied/;

describe("GOZS-202: tester alumno, aislamiento IDOR y CHECKs de series", () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(SUPABASE_STUBS);
    const archivos = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const archivo of archivos) {
      if (archivo === SEED_MIGRATION) await db.exec(SEED);
      await aplicar(fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), "utf-8"));
    }
    // Idempotencia del seed
    await aplicar(fs.readFileSync(path.join(MIGRATIONS_DIR, SEED_MIGRATION), "utf-8"));
  }, 90_000);

  it("el tester queda ADMIN con un único plan ACTIVO de 3 días con ejercicios", async () => {
    const p = await db.query<{ rol: string }>(`SELECT rol FROM public.perfiles WHERE id = '${TESTER}'`);
    expect(p.rows[0]?.rol).toBe("ADMIN");
    const r = await db.query<{ planes: number; dias: number; ejs: number }>(`
      SELECT count(DISTINCT p.id)::int AS planes, count(DISTINCT d.id)::int AS dias, count(e.id)::int AS ejs
      FROM public.planes_entrenamiento p
      JOIN public.dias_rutina d ON d.plan_id = p.id
      JOIN public.ejercicios_en_rutina e ON e.dia_id = d.id
      WHERE p.alumno_id = '${TESTER}' AND p.estado = 'ACTIVO'`);
    expect(r.rows[0]).toEqual({ planes: 1, dias: 3, ejs: 9 });
  });

  it("A no lee ni modifica sesiones, series ni planes de B", async () => {
    for (const sql of [
      `SELECT id FROM public.registro_sesiones WHERE alumno_id = '${ALUMNO_B}'`,
      `SELECT id FROM public.registro_series WHERE sesion_id = '${SESION_B}'`,
      `SELECT id FROM public.planes_entrenamiento WHERE id = '${PLAN_B}'`,
      `UPDATE public.registro_sesiones SET duracion_minutos = 1 WHERE id = '${SESION_B}' RETURNING id`,
      `UPDATE public.registro_series SET peso_kg = 1 WHERE sesion_id = '${SESION_B}' RETURNING id`,
      `UPDATE public.planes_entrenamiento SET nombre = 'x' WHERE id = '${PLAN_B}' RETURNING id`,
      `DELETE FROM public.registro_series WHERE sesion_id = '${SESION_B}' RETURNING id`,
    ]) {
      expect((await como("authenticated", ALUMNO_A, sql)).rows).toHaveLength(0);
    }
  });

  it("A no inserta filas con alumno_id o sesión de B", async () => {
    for (const sql of [
      `INSERT INTO public.registro_sesiones (alumno_id) VALUES ('${ALUMNO_B}')`,
      `INSERT INTO public.registro_series (sesion_id, ejercicio_id, numero_serie, peso_kg, reps_hechas)
         VALUES ('${SESION_B}','${EJ}',2,50,5)`,
      `INSERT INTO public.planes_entrenamiento (nombre, alumno_id) VALUES ('x','${ALUMNO_B}')`,
    ]) {
      await expect(como("authenticated", ALUMNO_A, sql)).rejects.toThrow(DENEGADO);
    }
  });

  it("registro_series rechaza peso negativo, reps 0 o >1000 y RPE fuera de 1-10", async () => {
    const ins = (n: number, peso: number, reps: number, rpe: number) =>
      `INSERT INTO public.registro_series (sesion_id, ejercicio_id, numero_serie, peso_kg, reps_hechas, rpe_real)
       VALUES ('${SESION_A}','${EJ}',${n},${peso},${reps},${rpe})`;
    await expect(como("authenticated", ALUMNO_A, ins(10, -1, 5, 8))).rejects.toThrow(/peso/);
    await expect(como("authenticated", ALUMNO_A, ins(11, 50, 0, 8))).rejects.toThrow(/reps/);
    await expect(como("authenticated", ALUMNO_A, ins(12, 50, 1001, 8))).rejects.toThrow(/reps/);
    await expect(como("authenticated", ALUMNO_A, ins(13, 50, 5, 0))).rejects.toThrow(/rpe/);
    await expect(como("authenticated", ALUMNO_A, ins(14, 50, 5, 11))).rejects.toThrow(/rpe/);
    await como("authenticated", ALUMNO_A, ins(15, 50, 5, 8));
  });
});
