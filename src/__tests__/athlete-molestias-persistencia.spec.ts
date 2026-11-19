import { describe, it, expect, beforeAll } from "vitest";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import * as fs from "node:fs";
import * as path from "node:path";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const NEW_MIGRATION = "20261119011000_molestias_sesion.sql";

const COACH = "00000000-0000-0000-0000-00000000c0ac";
const ALUMNO_A = "00000000-0000-0000-0000-00000000000a";
const ALUMNO_B = "00000000-0000-0000-0000-00000000000b";
const PLAN_A = "00000000-0000-0000-0000-000000000101";
const DIA_1 = "00000000-0000-0000-0000-000000000201";
const EJ_PRESS = "00000000-0000-0000-0000-000000000e01";
const EJ_RUTINA_PRESS = "00000000-0000-0000-0000-000000000f01";
const SESION_B = "00000000-0000-0000-0000-00000000b001";

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

const SEED = `
  INSERT INTO auth.users (id, email) VALUES
    ('${COACH}', 'coach@test.local'),
    ('${ALUMNO_A}', 'alumno-a@test.local'),
    ('${ALUMNO_B}', 'alumno-b@test.local');

  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${COACH}', 'coach@test.local', 'Coach Principal', 'ENTRENADOR', NULL, 'ACTIVA'),
    ('${ALUMNO_A}', 'alumno-a@test.local', 'Alumno A', 'ALUMNO', '${COACH}', 'ACTIVA'),
    ('${ALUMNO_B}', 'alumno-b@test.local', 'Alumno B', 'ALUMNO', '${COACH}', 'ACTIVA');

  INSERT INTO public.entrenador_alumnos (entrenador_id, alumno_id) VALUES
    ('${COACH}', '${ALUMNO_A}'),
    ('${COACH}', '${ALUMNO_B}');

  INSERT INTO public.ejercicios (id, nombre, musculos_principales) VALUES
    ('${EJ_PRESS}', 'Press Plano con Barra', ARRAY['Pecho'])
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.planes_entrenamiento (id, nombre, alumno_id, profesor_id)
  VALUES ('${PLAN_A}', 'Plan A', '${ALUMNO_A}', '${COACH}');

  INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
  VALUES ('${DIA_1}', '${PLAN_A}', 'Día 1', 1);

  INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos)
  VALUES ('${EJ_RUTINA_PRESS}', '${DIA_1}', '${EJ_PRESS}', 1, 3, '8-10', 90);

  INSERT INTO public.registro_sesiones (id, alumno_id, dia_id)
  VALUES ('${SESION_B}', '${ALUMNO_B}', '${DIA_1}');
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

describe("BE-02 CP1 · Migración y RPC registrar_molestia (PGlite)", () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(SUPABASE_STUBS);

    const archivos = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const archivo of archivos) {
      if (archivo === NEW_MIGRATION) await db.exec(SEED);
      await aplicarMigracion(fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), "utf-8"));
    }
    // Idempotencia de la migración
    await aplicarMigracion(fs.readFileSync(path.join(MIGRATIONS_DIR, NEW_MIGRATION), "utf-8"));
  }, 60_000);

  it("molestia antes de la primera serie crea registro_sesiones y guarda sesion_id, ejercicio_en_rutina_id y numero_serie", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const sesionId = "22222222-2222-4222-8222-222222222222";

    const res = await como<{ registrar_molestia: string }>(
      "authenticated",
      ALUMNO_A,
      `SELECT public.registrar_molestia($1, $2, $3, 'HOMBRO', 5, $4, $5, NULL, 'CALENTAMIENTO', '{}', '  Molestia en el deltoides  ')`,
      [id, sesionId, EJ_PRESS, DIA_1, EJ_RUTINA_PRESS],
    );
    expect(res.rows[0]?.registrar_molestia).toBe(id);

    const ses = await db.query<{ alumno_id: string; dia_id: string }>(
      `SELECT alumno_id, dia_id FROM public.registro_sesiones WHERE id = $1`,
      [sesionId],
    );
    expect(ses.rows[0]).toEqual({ alumno_id: ALUMNO_A, dia_id: DIA_1 });

    const dolor = await como<{
      id: string;
      sesion_id: string;
      ejercicio_en_rutina_id: string;
      numero_serie: number | null;
      eva: number;
      severidad: string;
      notas_alumno: string | null;
      es_sintoma_alarma: boolean;
    }>(
      "authenticated",
      ALUMNO_A,
      `SELECT id, sesion_id, ejercicio_en_rutina_id, numero_serie, eva, severidad, notas_alumno, es_sintoma_alarma
       FROM public.alumno_historial_dolor WHERE id = $1`,
      [id],
    );
    expect(dolor.rows[0]).toEqual({
      id,
      sesion_id: sesionId,
      ejercicio_en_rutina_id: EJ_RUTINA_PRESS,
      numero_serie: null,
      eva: 5,
      severidad: "MODERADO",
      notas_alumno: "Molestia en el deltoides",
      es_sintoma_alarma: false,
    });
  });

  it("es idempotente por p_id: reintentar no duplica la fila", async () => {
    const id = "11111111-1111-4111-8111-111111111112";
    const sesionId = "22222222-2222-4222-8222-222222222223";

    await como(
      "authenticated",
      ALUMNO_A,
      `SELECT public.registrar_molestia($1, $2, $3, 'RODILLA', 4, $4, $5, NULL, 'EN_SERIE', '{}', NULL)`,
      [id, sesionId, EJ_PRESS, DIA_1, EJ_RUTINA_PRESS],
    );
    await como(
      "authenticated",
      ALUMNO_A,
      `SELECT public.registrar_molestia($1, $2, $3, 'RODILLA', 4, $4, $5, NULL, 'EN_SERIE', '{}', NULL)`,
      [id, sesionId, EJ_PRESS, DIA_1, EJ_RUTINA_PRESS],
    );

    const cnt = await db.query<{ count: string }>(
      `SELECT count(*) FROM public.alumno_historial_dolor WHERE id = $1`,
      [id],
    );
    expect(Number(cnt.rows[0]?.count)).toBe(1);
  });

  it("rechaza con 42501 si p_sesion_id pertenece a otro alumno o no está autenticado", async () => {
    const id = "11111111-1111-4111-8111-111111111113";
    await expect(
      como(
        "authenticated",
        ALUMNO_A,
        `SELECT public.registrar_molestia($1, $2, $3, 'HOMBRO', 5)`,
        [id, SESION_B, EJ_PRESS],
      ),
    ).rejects.toMatchObject({ code: "42501" });

    await expect(
      como(
        "anon",
        null,
        `SELECT public.registrar_molestia($1, $2, $3, 'HOMBRO', 5)`,
        [id, SESION_B, EJ_PRESS],
      ),
    ).rejects.toThrow();
  });

  it("con numero_serie existente marca pain_reported = true en registro_series sin duplicar historial", async () => {
    const id = "11111111-1111-4111-8111-111111111114";
    const sesionId = "22222222-2222-4222-8222-222222222224";

    await db.query(
      `INSERT INTO public.registro_sesiones (id, alumno_id, dia_id) VALUES ($1, $2, $3)`,
      [sesionId, ALUMNO_A, DIA_1],
    );
    await db.query(
      `INSERT INTO public.registro_series (sesion_id, ejercicio_id, numero_serie, peso_kg, reps_hechas, completada)
       VALUES ($1, $2, 2, 80, 8, true)`,
      [sesionId, EJ_PRESS],
    );

    await como(
      "authenticated",
      ALUMNO_A,
      `SELECT public.registrar_molestia($1, $2, $3, 'CODO', 3, $4, $5, 2, 'EN_SERIE', '{}', 'Tensión leve')`,
      [id, sesionId, EJ_PRESS, DIA_1, EJ_RUTINA_PRESS],
    );

    const serie = await db.query<{ pain_reported: boolean; pain_notes: string }>(
      `SELECT pain_reported, pain_notes FROM public.registro_series
       WHERE sesion_id = $1 AND ejercicio_id = $2 AND numero_serie = 2`,
      [sesionId, EJ_PRESS],
    );
    expect(serie.rows[0]?.pain_reported).toBe(true);
    expect(serie.rows[0]?.pain_notes).toBe("CODO · 3/10 · Tensión leve");

    const historial = await db.query<{ count: string }>(
      `SELECT count(*) FROM public.alumno_historial_dolor WHERE sesion_id = $1`,
      [sesionId],
    );
    expect(Number(historial.rows[0]?.count)).toBe(1);
  });

  it("EVA 8 genera alertas_entrenador con reporte_dolor_id (trigger existente)", async () => {
    const id = "11111111-1111-4111-8111-111111111115";
    const sesionId = "22222222-2222-4222-8222-222222222225";

    await como(
      "authenticated",
      ALUMNO_A,
      `SELECT public.registrar_molestia($1, $2, $3, 'LUMBAR', 8, $4, $5, NULL, 'EN_SERIE', '{}', 'Pinchazo fuerte')`,
      [id, sesionId, EJ_PRESS, DIA_1, EJ_RUTINA_PRESS],
    );

    const alerta = await db.query<{
      reporte_dolor_id: string;
      severidad: string;
      alumno_id: string;
    }>(
      `SELECT reporte_dolor_id, severidad, alumno_id
       FROM public.alertas_entrenador WHERE reporte_dolor_id = $1`,
      [id],
    );
    expect(alerta.rows).toHaveLength(1);
    expect(alerta.rows[0]).toEqual({
      reporte_dolor_id: id,
      severidad: "ALTA",
      alumno_id: ALUMNO_A,
    });
  });

  it("valida EVA 1..10 y zona permitida (23514) y respeta RLS de lectura por sesion_id", async () => {
    const idBad = "11111111-1111-4111-8111-111111111116";
    const sesionId = "22222222-2222-4222-8222-222222222226";

    await expect(
      como(
        "authenticated",
        ALUMNO_A,
        `SELECT public.registrar_molestia($1, $2, $3, 'HOMBRO', 0)`,
        [idBad, sesionId, EJ_PRESS],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      como(
        "authenticated",
        ALUMNO_A,
        `SELECT public.registrar_molestia($1, $2, $3, 'MUÑECA', 5)`,
        [idBad, sesionId, EJ_PRESS],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    // Alumno B no ve las molestias de Alumno A
    const lecturaAjena = await como<{ id: string }>(
      "authenticated",
      ALUMNO_B,
      `SELECT id FROM public.alumno_historial_dolor WHERE sesion_id = '22222222-2222-4222-8222-222222222225'`,
    );
    expect(lecturaAjena.rows).toHaveLength(0);
  });
});
