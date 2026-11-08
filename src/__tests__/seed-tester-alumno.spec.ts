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
  CREATE TABLE auth.users (id uuid PRIMARY KEY, instance_id uuid, aud text, role text, email text,
    encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb,
    raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz);
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

async function nuevaDb() {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(STUBS);
  const dir = path.join(SUPABASE_DIR, "migrations");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    await aplicar(fs.readFileSync(path.join(dir, f), "utf-8"));
  }
  return db;
}

const leerSeed = (f: string) => fs.readFileSync(path.join(SUPABASE_DIR, f), "utf-8");

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

// Estado observable del seed sin timestamps (updated_at cambia por trigger en cada UPDATE).
const snapshot = async () =>
  q(`SELECT
    (SELECT json_agg(x ORDER BY x.id) FROM (SELECT id, rol, estado_membresia, profesor_asignado_id FROM public.perfiles) x) AS perfiles,
    (SELECT json_agg(x ORDER BY x.id) FROM (SELECT id, profesor_id, alumno_id, nombre, estado FROM public.planes_entrenamiento) x) AS planes,
    (SELECT json_agg(x ORDER BY x.id) FROM (SELECT id, plan_id, nombre, orden FROM public.dias_rutina) x) AS dias,
    (SELECT json_agg(x ORDER BY x.id) FROM (SELECT id, dia_id, ejercicio_id, orden, series, repeticiones FROM public.ejercicios_en_rutina) x) AS ejr,
    (SELECT json_agg(x ORDER BY x.nombre) FROM (SELECT id, nombre FROM public.ejercicios) x) AS ejercicios`);

let primeraCorrida: unknown;
let segundaCorrida: unknown;

describe("GOZS-286: seed del tester como ALUMNO", () => {
  beforeAll(async () => {
    await nuevaDb();
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES
        ('${TESTER}','94.gabriel.sanchez@gmail.com'),('${COACH}','ds.gabriel.sanchez@gmail.com'),
        ('${ALU_B}','alumno.b.tester@gozster.local'),('00000000-0000-0000-0000-0000000000d1','otro@t');
      INSERT INTO public.perfiles (id, email, nombre_completo, rol) VALUES
        ('00000000-0000-0000-0000-0000000000d1','otro@t','Otro','ALUMNO');
      INSERT INTO public.planes_entrenamiento (id, alumno_id, nombre, estado)
        VALUES ('${GABI}','00000000-0000-0000-0000-0000000000d1','GABI AGOSTO','ACTIVO');
    `);
    const seed = leerSeed("seed_tester.sql");
    await db.exec(seed);
    primeraCorrida = await snapshot();
    await db.exec(seed);
    segundaCorrida = await snapshot();
  }, 90_000);

  it("correr el seed dos veces deja exactamente el mismo estado", () => {
    expect(segundaCorrida).toEqual(primeraCorrida);
  });

  it("el tester es ADMIN del coach con GABI AGOSTO como único plan activo (GOZS-339)", async () => {
    const [p] = await q<{ rol: string; nombre_completo: string; profesor_asignado_id: string }>(
      `SELECT rol, nombre_completo, profesor_asignado_id FROM public.perfiles WHERE id = '${TESTER}'`
    );
    expect(p).toEqual({ rol: "ADMIN", nombre_completo: "Gabriel Sanchez", profesor_asignado_id: COACH });
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

  // GOZS-300: el catálogo de constraints no basta; el INSERT real debe rebotar en Postgres.
  describe("INSERT real en registro_series", () => {
    let sesion: string;
    let ejercicio: string;
    beforeAll(async () => {
      sesion = (await q<{ id: string }>(
        `INSERT INTO public.registro_sesiones (alumno_id) VALUES ('${TESTER}') RETURNING id`
      ))[0]!.id;
      ejercicio = (await q<{ id: string }>(
        `SELECT id FROM public.ejercicios WHERE nombre = 'Press Plano con Barra'`
      ))[0]!.id;
    });
    const serie = (n: number, peso: number, reps: number) =>
      db.query(
        `INSERT INTO public.registro_series (sesion_id, ejercicio_id, numero_serie, peso_kg, reps_hechas)
         VALUES ($1, $2, $3, $4, $5)`,
        [sesion, ejercicio, n, peso, reps]
      );

    it("peso_kg = 2000 falla por chk_registro_series_peso_plausible", async () => {
      await expect(serie(1, 2000, 10)).rejects.toThrow(/chk_registro_series_peso_plausible/);
    });

    it("reps_hechas = 101 falla por chk_registro_series_reps_plausibles", async () => {
      await expect(serie(2, 100, 101)).rejects.toThrow(/chk_registro_series_reps_plausibles/);
    });

    it("negativos también fallan", async () => {
      await expect(serie(3, -1, 10)).rejects.toThrow(/chk_registro_series_peso_plausible|peso_kg_check/);
      await expect(serie(4, 100, -1)).rejects.toThrow(/chk_registro_series_reps_plausibles|reps_hechas_check/);
    });

    it("el límite exacto (1000 kg, 100 reps) se acepta", async () => {
      await expect(serie(5, 1000, 100)).resolves.toBeDefined();
      const [r] = await q<{ n: number }>(
        `SELECT count(*)::int AS n FROM public.registro_series WHERE sesion_id = '${sesion}'`
      );
      expect(r?.n).toBe(1);
    });
  });
});

// GOZS-300 (hallazgo): seed_tester crea "Press Plano con Barra" y "Prensa 45°" con id aleatorio; seed_gozs
// hace ON CONFLICT (nombre) conservando ese id y luego referencia su id fijo en ejercicios_en_rutina -> FK.
// Pasará a fallar (y habrá que quitar .fails) cuando el orden tester -> gozs deje de romper.
describe("GOZS-286: orden seed_tester -> seed_gozs", () => {
  it.fails("seed_gozs no rompe por ejercicios_en_rutina_ejercicio_id_fkey", async () => {
    await nuevaDb();
    await db.exec(`INSERT INTO auth.users (id, email) VALUES
      ('${TESTER}','94.gabriel.sanchez@gmail.com'),('${COACH}','ds.gabriel.sanchez@gmail.com')`);
    await db.exec(leerSeed("seed_tester.sql"));
    const err = await db.exec(leerSeed("seed_gozs.sql")).then(() => null, (e: Error) => e);
    expect(err?.message ?? "").not.toMatch(/ejercicios_en_rutina_ejercicio_id_fkey/);
  }, 90_000);
});
