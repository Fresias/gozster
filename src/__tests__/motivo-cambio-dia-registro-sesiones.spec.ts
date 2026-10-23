import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// GOZS-146: motivo_cambio_dia / dia_sugerido_id en registro_sesiones sobre Postgres real (PGlite).

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const NEW_MIGRATION = "20261023150000_motivo_cambio_dia_registro_sesiones.sql";

const COACH = "00000000-0000-0000-0000-00000000c0ac";
const OTRO_COACH = "00000000-0000-0000-0000-0000000000c2";
const ALUMNO_A = "00000000-0000-0000-0000-00000000000a";
const ALUMNO_B = "00000000-0000-0000-0000-00000000000b";
const PLAN = "00000000-0000-0000-0000-0000000f0001";
const DIA_1 = "00000000-0000-0000-0000-0000000d0001";
const DIA_2 = "00000000-0000-0000-0000-0000000d0002";
const SESION_A = "00000000-0000-0000-0000-0000000a0001";

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
    ('${COACH}','coach@t'),('${OTRO_COACH}','c2@t'),('${ALUMNO_A}','a@t'),('${ALUMNO_B}','b@t');
  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id) VALUES
    ('${COACH}','coach@t','Coach','ENTRENADOR',NULL),
    ('${OTRO_COACH}','c2@t','Otro coach','ENTRENADOR',NULL),
    ('${ALUMNO_A}','a@t','Alumno A','ALUMNO','${COACH}'),
    ('${ALUMNO_B}','b@t','Alumno B','ALUMNO','${OTRO_COACH}');
  INSERT INTO public.planes_entrenamiento (id, nombre, alumno_id, profesor_id)
    VALUES ('${PLAN}','Plan A','${ALUMNO_A}','${COACH}');
  INSERT INTO public.dias_rutina (id, plan_id, nombre, orden) VALUES
    ('${DIA_1}','${PLAN}','Día 1',1),('${DIA_2}','${PLAN}','Día 2',2);
  INSERT INTO public.registro_sesiones (id, alumno_id, dia_id) VALUES ('${SESION_A}','${ALUMNO_A}','${DIA_2}');
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

async function aplicarMigracion(sql: string) {
  // Statements previos a BEGIN (ALTER TYPE ... ADD VALUE) requieren su propia transacción
  const inicio = sql.search(/^BEGIN;/m);
  if (inicio > 0) {
    await db.exec(sql.slice(0, inicio));
    await db.exec(sql.slice(inicio));
  } else {
    await db.exec(sql);
  }
}

const DENEGADO = /row-level security|permission denied/;

describe("GOZS-146: motivo del cambio de día en registro_sesiones", () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(SUPABASE_STUBS);
    const archivos = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const archivo of archivos) {
      if (archivo === NEW_MIGRATION) await db.exec(SEED);
      await aplicarMigracion(fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), "utf-8"));
    }
    // Idempotencia
    await aplicarMigracion(fs.readFileSync(path.join(MIGRATIONS_DIR, NEW_MIGRATION), "utf-8"));
  }, 60_000);

  it("agrega columnas nulables y conserva las filas previas", async () => {
    const r = await db.query<{ motivo_cambio_dia: string | null; dia_sugerido_id: string | null }>(
      `SELECT motivo_cambio_dia, dia_sugerido_id FROM public.registro_sesiones WHERE id = '${SESION_A}'`
    );
    expect(r.rows[0]).toEqual({ motivo_cambio_dia: null, dia_sugerido_id: null });
  });

  it("el alumno registra motivo y día sugerido en su propia sesión", async () => {
    await como(
      "authenticated",
      ALUMNO_A,
      `UPDATE public.registro_sesiones SET motivo_cambio_dia = 'MOLESTIA', dia_sugerido_id = '${DIA_1}'
       WHERE id = '${SESION_A}'`
    );
    const r = await como<{ motivo_cambio_dia: string; dia_sugerido_id: string }>(
      "authenticated",
      ALUMNO_A,
      `SELECT motivo_cambio_dia, dia_sugerido_id FROM public.registro_sesiones WHERE id = '${SESION_A}'`
    );
    expect(r.rows[0]).toEqual({ motivo_cambio_dia: "MOLESTIA", dia_sugerido_id: DIA_1 });
  });

  it("el coach asignado lee los campos; otro coach y otro alumno no ven la sesión", async () => {
    const q = `SELECT motivo_cambio_dia FROM public.registro_sesiones WHERE id = '${SESION_A}'`;
    expect((await como("authenticated", COACH, q)).rows).toHaveLength(1);
    expect((await como("authenticated", OTRO_COACH, q)).rows).toHaveLength(0);
    expect((await como("authenticated", ALUMNO_B, q)).rows).toHaveLength(0);
  });

  it("el alumno no puede escribir en sesiones ajenas", async () => {
    const r = await como(
      "authenticated",
      ALUMNO_B,
      `UPDATE public.registro_sesiones SET motivo_cambio_dia = 'POCO_TIEMPO' WHERE id = '${SESION_A}' RETURNING id`
    );
    expect(r.rows).toHaveLength(0);
    await expect(
      como(
        "authenticated",
        ALUMNO_B,
        `INSERT INTO public.registro_sesiones (alumno_id, motivo_cambio_dia) VALUES ('${ALUMNO_A}','POCO_TIEMPO')`
      )
    ).rejects.toThrow(DENEGADO);
    const v = await db.query<{ motivo_cambio_dia: string }>(
      `SELECT motivo_cambio_dia FROM public.registro_sesiones WHERE id = '${SESION_A}'`
    );
    expect(v.rows[0]?.motivo_cambio_dia).toBe("MOLESTIA");
  });

  it("el coach no escribe en sesiones de su alumno", async () => {
    const r = await como(
      "authenticated",
      COACH,
      `UPDATE public.registro_sesiones SET motivo_cambio_dia = 'POCO_TIEMPO' WHERE id = '${SESION_A}' RETURNING id`
    );
    expect(r.rows).toHaveLength(0);
  });

  it("el CHECK rechaza motivos inválidos y acepta los 4 válidos", async () => {
    await expect(
      como(
        "authenticated",
        ALUMNO_A,
        `UPDATE public.registro_sesiones SET motivo_cambio_dia = 'PEREZA' WHERE id = '${SESION_A}'`
      )
    ).rejects.toThrow(/registro_sesiones_motivo_cambio_dia_check/);
    for (const m of ["CANSANCIO_DEPORTE", "MOLESTIA", "POCO_TIEMPO", "EQUIPO_OCUPADO"]) {
      await como(
        "authenticated",
        ALUMNO_A,
        `UPDATE public.registro_sesiones SET motivo_cambio_dia = '${m}' WHERE id = '${SESION_A}'`
      );
    }
  });

  it("dia_sugerido_id pasa a NULL si se borra el día", async () => {
    await db.exec(`UPDATE public.registro_sesiones SET dia_sugerido_id = '${DIA_1}' WHERE id = '${SESION_A}';
      DELETE FROM public.dias_rutina WHERE id = '${DIA_1}'`);
    const r = await db.query<{ dia_sugerido_id: string | null }>(
      `SELECT dia_sugerido_id FROM public.registro_sesiones WHERE id = '${SESION_A}'`
    );
    expect(r.rows[0]?.dia_sugerido_id).toBeNull();
  });
});
