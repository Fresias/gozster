import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// GOZS-225: clases fijas del alumno según plan, asignables por el coach (PGlite).

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const NEW_MIGRATION = "20261030000300_clases_fijas_alumno.sql";

const ADMIN = "00000000-0000-0000-0000-0000000000ad";
const COACH = "00000000-0000-0000-0000-00000000c0ac";
const OTRO_COACH = "00000000-0000-0000-0000-0000000000c2";
const DOS_BOXEO = "00000000-0000-0000-0000-00000000000a";
const LIBRE = "00000000-0000-0000-0000-00000000000b";
const OTRO_ALUMNO = "00000000-0000-0000-0000-00000000000c";
const EN_PAUSA = "00000000-0000-0000-0000-00000000000d";
const SIN_PLAN = "00000000-0000-0000-0000-00000000000f";

const PLAN_2_1 = "20000000-0000-0000-0000-000000000001";
const PLAN_LIBRE = "20000000-0000-0000-0000-000000000002";

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
    ('${ADMIN}','admin@t'),('${COACH}','coach@t'),('${OTRO_COACH}','c2@t'),
    ('${DOS_BOXEO}','a@t'),('${LIBRE}','b@t'),('${OTRO_ALUMNO}','c@t'),
    ('${EN_PAUSA}','d@t'),('${SIN_PLAN}','f@t');
  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${ADMIN}','admin@t','Admin','ADMIN',NULL,'ACTIVA'),
    ('${COACH}','coach@t','Coach','ENTRENADOR',NULL,'ACTIVA'),
    ('${OTRO_COACH}','c2@t','Otro coach','ENTRENADOR',NULL,'ACTIVA'),
    ('${DOS_BOXEO}','a@t','Dos Boxeo','ALUMNO','${COACH}','ACTIVA'),
    ('${LIBRE}','b@t','Libre','ALUMNO','${COACH}','ACTIVA'),
    ('${OTRO_ALUMNO}','c@t','Otro','ALUMNO','${OTRO_COACH}','ACTIVA'),
    ('${EN_PAUSA}','d@t','Pausa','ALUMNO','${COACH}','ACTIVA'),
    ('${SIN_PLAN}','f@t','Sin plan','ALUMNO','${COACH}','ACTIVA');
  INSERT INTO public.planes_membresia (id, nombre, limite_semanal, cantidad_actividades, duracion_meses, precio) VALUES
    ('${PLAN_2_1}','2 por semana',2,1,1,20000),
    ('${PLAN_LIBRE}','Pase libre',NULL,2,1,35000);
  INSERT INTO public.contrataciones
    (alumno_id, tipo_servicio, dia_vencimiento, fecha_inicio, fecha_fin, estado, plan_membresia_id, actividad) VALUES
    ('${DOS_BOXEO}','PRESENCIAL',5,CURRENT_DATE - 10,CURRENT_DATE + 30,'VIGENTE','${PLAN_2_1}','BOXEO'),
    ('${LIBRE}','PRESENCIAL',5,CURRENT_DATE - 10,CURRENT_DATE + 30,'VIGENTE','${PLAN_LIBRE}',NULL),
    ('${OTRO_ALUMNO}','PRESENCIAL',5,CURRENT_DATE - 10,CURRENT_DATE + 30,'VIGENTE','${PLAN_LIBRE}',NULL),
    ('${EN_PAUSA}','PRESENCIAL',5,CURRENT_DATE - 10,CURRENT_DATE + 30,'EN_PAUSA','${PLAN_LIBRE}',NULL),
    ('${SIN_PLAN}','ASESORIA_ONLINE',5,CURRENT_DATE - 10,CURRENT_DATE + 30,'VIGENTE',NULL,NULL);
`;

let db: PGlite;
const H: Record<string, string> = {};

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

const asignar = (sub: string, horario: string, alumno?: string) =>
  como<{ id: string }>(
    "authenticated",
    sub,
    `SELECT public.asignar_clase_fija('${horario}'${alumno ? `, '${alumno}'` : ""}) AS id`
  );

async function crearHorario(actividad: "FUNCIONAL" | "BOXEO", dia: number, activo = true) {
  const r = await db.query<{ id: string }>(
    `INSERT INTO public.clases_horario (actividad, dia_semana, hora_inicio, duracion_minutos, activo)
     VALUES ('${actividad}', ${dia}, '18:00', 60, ${activo}) RETURNING id`
  );
  return r.rows[0]!.id;
}

describe("GOZS-225: clases fijas del alumno (PGlite)", () => {
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
    H.box1 = await crearHorario("BOXEO", 1);
    H.box2 = await crearHorario("BOXEO", 3);
    H.box3 = await crearHorario("BOXEO", 5);
    H.func = await crearHorario("FUNCIONAL", 2);
    H.inactivo = await crearHorario("BOXEO", 4, false);
  }, 60_000);

  it("el alumno elige sus fijas hasta el tope del plan y ve las suyas", async () => {
    await asignar(DOS_BOXEO, H.box1!);
    await asignar(DOS_BOXEO, H.box2!);
    await expect(asignar(DOS_BOXEO, H.box3!)).rejects.toMatchObject({ code: "GZ002" });
    const r = await como<{ n: number }>(
      "authenticated",
      DOS_BOXEO,
      `SELECT count(*)::int AS n FROM public.clases_fijas`
    );
    expect(r.rows[0]!.n).toBe(2);
  });

  it("no repite una clase fija ni excede la actividad del plan ni usa horarios inactivos", async () => {
    await expect(asignar(DOS_BOXEO, H.box1!)).rejects.toMatchObject({ code: "GZ008" });
    await expect(asignar(DOS_BOXEO, H.func!)).rejects.toMatchObject({ code: "GZ003" });
    await expect(asignar(LIBRE, H.inactivo!)).rejects.toMatchObject({ code: "GZ010" });
  });

  it("pase libre no tiene tope", async () => {
    for (const h of [H.box1!, H.box2!, H.box3!, H.func!]) await asignar(LIBRE, h);
  });

  it("el coach asignado fija clases a su alumno y respeta el tope", async () => {
    await db.query(`DELETE FROM public.clases_fijas WHERE alumno_id = '${DOS_BOXEO}'`);
    await asignar(COACH, H.box1!, DOS_BOXEO);
    await asignar(COACH, H.box2!, DOS_BOXEO);
    await expect(asignar(COACH, H.box3!, DOS_BOXEO)).rejects.toMatchObject({ code: "GZ002" });
  });

  it("un coach no asignado ni un alumno ajeno pueden gestionar", async () => {
    await expect(asignar(OTRO_COACH, H.box3!, LIBRE)).rejects.toMatchObject({ code: "42501" });
    await expect(asignar(OTRO_ALUMNO, H.box3!, LIBRE)).rejects.toMatchObject({ code: "42501" });
    await asignar(ADMIN, H.box3!, OTRO_ALUMNO);
  });

  it("sin membresía habilitada se rechaza", async () => {
    await expect(asignar(SIN_PLAN, H.box1!)).rejects.toMatchObject({ code: "GZ004" });
    await expect(asignar(EN_PAUSA, H.box1!)).rejects.toMatchObject({ code: "GZ004" });
  });

  it("RLS: el alumno no ve las de otros, staff ve todas, anon nada, sin escritura directa", async () => {
    const ajeno = await como<{ n: number }>(
      "authenticated",
      OTRO_ALUMNO,
      `SELECT count(*)::int AS n FROM public.clases_fijas WHERE alumno_id <> '${OTRO_ALUMNO}'`
    );
    expect(ajeno.rows[0]!.n).toBe(0);
    const staff = await como<{ n: number }>(
      "authenticated",
      COACH,
      `SELECT count(*)::int AS n FROM public.clases_fijas`
    );
    expect(staff.rows[0]!.n).toBeGreaterThan(2);
    const anon = await como("anon", null, `SELECT * FROM public.clases_fijas`);
    expect(anon.rows).toHaveLength(0);
    await expect(
      como(
        "authenticated",
        OTRO_ALUMNO,
        `INSERT INTO public.clases_fijas (alumno_id, horario_id) VALUES ('${OTRO_ALUMNO}', '${H.func}')`
      )
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("quitar: el alumno la suya, el coach las de su alumno, no las ajenas", async () => {
    const f = await db.query<{ id: string }>(
      `SELECT id FROM public.clases_fijas WHERE alumno_id = '${LIBRE}' LIMIT 1`
    );
    const id = f.rows[0]!.id;
    await expect(
      como("authenticated", OTRO_COACH, `SELECT public.quitar_clase_fija('${id}')`)
    ).rejects.toMatchObject({ code: "42501" });
    await como("authenticated", COACH, `SELECT public.quitar_clase_fija('${id}')`);
    const otra = await db.query<{ id: string }>(
      `SELECT id FROM public.clases_fijas WHERE alumno_id = '${LIBRE}' LIMIT 1`
    );
    await como("authenticated", LIBRE, `SELECT public.quitar_clase_fija('${otra.rows[0]!.id}')`);
  });
});
