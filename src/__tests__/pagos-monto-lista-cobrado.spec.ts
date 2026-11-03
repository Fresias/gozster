import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// GOZS-222: pagos con monto de lista, monto cobrado y nota.
// Migración probada sobre Postgres real (PGlite) con roles de Supabase simulados.

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const NEW_MIGRATION = "20261030000800_pagos_monto_lista_cobrado_nota.sql";

const COACH_A = "00000000-0000-0000-0000-0000000000a1";
const COACH_B = "00000000-0000-0000-0000-0000000000b1";
const ALU_A1 = "00000000-0000-0000-0000-0000000000a2"; // 1 clase/semana, solo BOXEO
const ALU_A2 = "00000000-0000-0000-0000-0000000000a3"; // pase libre
const ALU_B = "00000000-0000-0000-0000-0000000000b2";
const PLAN_1_BOXEO = "20000000-0000-0000-0000-0000000000a1";
const PLAN_LIBRE = "20000000-0000-0000-0000-0000000000a2";

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

const SEED = `
  INSERT INTO auth.users (id, email) VALUES
    ('${COACH_A}','ca@t'),('${COACH_B}','cb@t'),
    ('${ALU_A1}','a1@t'),('${ALU_A2}','a2@t'),('${ALU_B}','b@t');
  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${COACH_A}','ca@t','Coach A','ENTRENADOR',NULL,'ACTIVA'),
    ('${COACH_B}','cb@t','Coach B','ENTRENADOR',NULL,'ACTIVA'),
    ('${ALU_A1}','a1@t','Alumno A1','ALUMNO','${COACH_A}','ACTIVA'),
    ('${ALU_A2}','a2@t','Alumno A2','ALUMNO','${COACH_A}','ACTIVA'),
    ('${ALU_B}','b@t','Alumno B','ALUMNO','${COACH_B}','ACTIVA');
  INSERT INTO public.planes_membresia (id, nombre, limite_semanal, cantidad_actividades, duracion_meses, precio) VALUES
    ('${PLAN_1_BOXEO}','1 por semana',1,1,1,15000),
    ('${PLAN_LIBRE}','Pase libre',NULL,2,1,35000);
  INSERT INTO public.contrataciones
    (alumno_id, tipo_servicio, dia_vencimiento, fecha_inicio, fecha_fin, estado, plan_membresia_id, actividad, precio_pactado) VALUES
    ('${ALU_A1}','PRESENCIAL',5,CURRENT_DATE - 10,CURRENT_DATE + 30,'VIGENTE','${PLAN_1_BOXEO}','BOXEO',14000),
    ('${ALU_A2}','PRESENCIAL',5,CURRENT_DATE - 10,CURRENT_DATE + 30,'VIGENTE','${PLAN_LIBRE}',NULL,30000),
    ('${ALU_B}','PRESENCIAL',5,CURRENT_DATE - 10,CURRENT_DATE + 30,'VIGENTE','${PLAN_LIBRE}',NULL,30000);
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

function como<T>(rol: Rol, sub: string | null, sql: string) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub ? { sub, role: rol } : { role: rol }),
    ]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query<T>(sql);
  });
}

async function crearCobro(contratacionAlumno: string, monto: number, venceEnDias: number, periodo: string) {
  const r = await db.query<{ id: string }>(
    `INSERT INTO public.cobros (contratacion_id, alumno_id, periodo, monto, fecha_vencimiento)
     SELECT id, alumno_id, '${periodo}', ${monto}, CURRENT_DATE + ${venceEnDias}
     FROM public.contrataciones WHERE alumno_id = '${contratacionAlumno}' RETURNING id`
  );
  return r.rows[0]!.id;
}


describe("GOZS-222: pagos con monto de lista, cobrado y nota (PGlite)", () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(SUPABASE_STUBS);
    const archivos = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const archivo of archivos) {
      await aplicarMigracion(fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), "utf-8"));
    }
    // Idempotencia
    await aplicarMigracion(fs.readFileSync(path.join(MIGRATIONS_DIR, NEW_MIGRATION), "utf-8"));
    await db.exec(SEED);
  }, 60_000);

  it("pago con 20% de descuento persiste lista, cobrado y nota; ingresos suma lo cobrado", async () => {
    const cobro = await crearCobro(ALU_A1, 40000, 5, "2026-10-01");
    await como(
      "authenticated",
      COACH_A,
      `SELECT * FROM public.registrar_pago_con_descuento('${cobro}', 32000, 'EFECTIVO', 'descuento 20%')`
    );
    const p = await db.query(
      `SELECT monto_lista::int AS l, monto_cobrado::int AS c, nota FROM public.pagos WHERE cobro_id = '${cobro}'`
    );
    expect(p.rows).toEqual([{ l: 40000, c: 32000, nota: "descuento 20%" }]);
    const ing = await como<{ t: string }>("authenticated", COACH_A, `SELECT public.ingresos_mes()::text AS t`);
    expect(Number(ing.rows[0]!.t)).toBe(32000);
    const d = await como<{ descuento: string; nota: string }>(
      "authenticated",
      COACH_A,
      `SELECT descuento::text, nota FROM public.v_descuentos_otorgados`
    );
    expect(d.rows.map((r) => [Number(r.descuento), r.nota])).toEqual([[8000, "descuento 20%"]]);
    const otro = await como("authenticated", COACH_B, `SELECT * FROM public.v_descuentos_otorgados`);
    expect(otro.rows.length).toBe(0);
  });

  it("sin monto cobrado se cobra la lista y no es descuento; descuento sin nota o cobrado > lista se rechaza", async () => {
    const cobro = await crearCobro(ALU_A2, 30000, 5, "2026-11-01");
    await expect(
      como("authenticated", COACH_A, `SELECT * FROM public.registrar_pago_con_descuento('${cobro}', 25000, 'EFECTIVO', NULL)`)
    ).rejects.toMatchObject({ code: "22023" });
    await expect(
      como("authenticated", COACH_A, `SELECT * FROM public.registrar_pago_con_descuento('${cobro}', 31000, 'EFECTIVO', 'x')`)
    ).rejects.toMatchObject({ code: "22023" });
    await como("authenticated", COACH_A, `SELECT * FROM public.registrar_pago('${cobro}', 30000, 'EFECTIVO')`);
    const p = await db.query(`SELECT monto_lista::int AS l, monto_cobrado::int AS c FROM public.pagos WHERE cobro_id = '${cobro}'`);
    expect(p.rows).toEqual([{ l: 30000, c: 30000 }]);
    const d = await como("authenticated", COACH_A, `SELECT * FROM public.v_descuentos_otorgados`);
    expect(d.rows.length).toBe(1);
  });
});
