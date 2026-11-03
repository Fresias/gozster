import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// GOZS-335: Tests de verificación de Alta persistente de Gonzalo Salas,
// trigger trg_on_auth_user_created y soporte RLS de autogestión de rutina para Admin.

const SUPABASE_DIR = path.resolve(__dirname, "../../supabase");
const MIGRATIONS_DIR = path.join(SUPABASE_DIR, "migrations");

const GONZALO_ID = "f4819866-b758-424e-90b2-555b7887c601";
const GONZALO_EMAIL = "gonzasalas2016@gmail.com";
const ADMIN_ID = GONZALO_ID;

const OTRO_ALUMNO_ID = "00000000-0000-0000-0000-0000000000a1";
const OTRO_ALUMNO_EMAIL = "alumno.otro@gozster.local";

const STUBS = `
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

let db: PGlite;

type Rol = "anon" | "authenticated" | "service_role";

function como<T>(rol: Rol, sub: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub ? { sub, role: rol } : { role: rol }),
    ]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query<T>(sql, params);
  });
}

describe("GOZS-335: Alta persistente de Gonzalo Salas (Admin), trigger on_auth_user_created y soporte de autogestión de rutina para Admin", () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(STUBS);

    const archivos = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const archivo of archivos) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), "utf-8");
      const inicio = sql.search(/^BEGIN;/m);
      if (inicio > 0) {
        await db.exec(sql.slice(0, inicio));
        await db.exec(sql.slice(inicio));
      } else {
        await db.exec(sql);
      }
    }
  }, 120_000);

  describe("1. Alta persistente de Gonzalo Salas en public.perfiles", () => {
    it("persiste de forma idempotente a Gonzalo Salas con rol = 'ADMIN' y estado_membresia = 'ACTIVA'", async () => {
      const res = await db.query<{
        id: string;
        email: string;
        nombre_completo: string;
        rol: string;
        estado_membresia: string;
      }>(`SELECT id::text, email, nombre_completo, rol, estado_membresia FROM public.perfiles WHERE id = $1`, [GONZALO_ID]);

      expect(res.rows).toHaveLength(1);
      const perfil = res.rows[0]!;
      expect(perfil.id).toBe(GONZALO_ID);
      expect(perfil.email).toBe(GONZALO_EMAIL);
      expect(perfil.nombre_completo).toBe("Gonzalo Salas");
      expect(perfil.rol).toBe("ADMIN");
      expect(perfil.estado_membresia).toBe("ACTIVA");
    });
  });

  describe("2. Trigger preventivo trg_on_auth_user_created", () => {
    it("crea automáticamente un perfil en public.perfiles cuando se inserta un nuevo usuario en auth.users", async () => {
      const nuevoId = "11111111-2222-3333-4444-555555555555";
      const nuevoEmail = "atleta.nuevo@gozster.com";

      await db.query(
        `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3)`,
        [nuevoId, nuevoEmail, JSON.stringify({ nombre_completo: "Atleta Nuevo" })]
      );

      const res = await db.query<{
        id: string;
        email: string;
        nombre_completo: string;
        rol: string;
        estado_membresia: string;
      }>(`SELECT id::text, email, nombre_completo, rol, estado_membresia FROM public.perfiles WHERE id = $1`, [nuevoId]);

      expect(res.rows).toHaveLength(1);
      const p = res.rows[0]!;
      expect(p.id).toBe(nuevoId);
      expect(p.email).toBe(nuevoEmail);
      expect(p.nombre_completo).toBe("Atleta Nuevo");
      expect(p.rol).toBe("ALUMNO");
      expect(p.estado_membresia).toBe("ACTIVA");
    });

    it("deriva el nombre_completo desde el email si no viene en los metadatos", async () => {
      const idSinMeta = "22222222-3333-4444-5555-666666666666";
      const emailSinMeta = "juan.perez@gozster.com";

      await db.query(
        `INSERT INTO auth.users (id, email) VALUES ($1, $2)`,
        [idSinMeta, emailSinMeta]
      );

      const res = await db.query<{ nombre_completo: string }>(
        `SELECT nombre_completo FROM public.perfiles WHERE id = $1`,
        [idSinMeta]
      );

      expect(res.rows[0]?.nombre_completo).toBe("juan.perez");
    });
  });

  describe("3. Rol Dual: Autogestión de rutina de entrenamiento para usuario ADMIN", () => {
    const planAdminId = "c0de0335-0000-4000-8000-000000000001";
    const diaAdminId = "c0de0335-0000-4000-8000-0000000000d1";
    const ejEnRutinaId = "c0de0335-0000-4000-8000-0000000000e1";
    const sesionAdminId = "c0de0335-0000-4000-8000-000000000051";
    const serieAdminId = "c0de0335-0000-4000-8000-00000000000a";
    let ejercicioMaestroId: string;

    beforeAll(async () => {
      // Registrar otro alumno para verificar aislamiento RLS
      await db.query(`
        INSERT INTO auth.users (id, email) VALUES ('${OTRO_ALUMNO_ID}', '${OTRO_ALUMNO_EMAIL}')
        ON CONFLICT (id) DO NOTHING;
      `);

      // Asegurar al menos un ejercicio en el catálogo maestro
      const ejRes = await db.query<{ id: string }>(`
        INSERT INTO public.ejercicios (nombre, musculos_principales)
        VALUES ('Press Militar con Mancuernas', ARRAY['Hombros'])
        ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre
        RETURNING id::text;
      `);
      ejercicioMaestroId = ejRes.rows[0]!.id;
    });

    it("el ADMIN puede crear un plan de entrenamiento asignado a sí mismo (alumno_id = auth.uid())", async () => {
      await como(
        "authenticated",
        ADMIN_ID,
        `INSERT INTO public.planes_entrenamiento (id, profesor_id, alumno_id, nombre, estado)
         VALUES ('${planAdminId}', '${ADMIN_ID}', '${ADMIN_ID}', 'Rutina Personal Admin', 'ACTIVO')`
      );

      const res = await como<{ id: string; nombre: string }>(
        "authenticated",
        ADMIN_ID,
        `SELECT id::text, nombre FROM public.planes_entrenamiento WHERE alumno_id = '${ADMIN_ID}'`
      );

      expect(res.rows).toHaveLength(1);
      expect(res.rows[0]?.nombre).toBe("Rutina Personal Admin");
    });

    it("el ADMIN puede insertar y consultar días de rutina y ejercicios en su plan personal", async () => {
      await como(
        "authenticated",
        ADMIN_ID,
        `INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
         VALUES ('${diaAdminId}', '${planAdminId}', 'Día 1 - Torso', 1)`
      );

      await como(
        "authenticated",
        ADMIN_ID,
        `INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones)
         VALUES ('${ejEnRutinaId}', '${diaAdminId}', '${ejercicioMaestroId}', 1, 4, '8-10')`
      );

      const dias = await como<{ nombre: string }>(
        "authenticated",
        ADMIN_ID,
        `SELECT nombre FROM public.dias_rutina WHERE plan_id = '${planAdminId}'`
      );
      expect(dias.rows[0]?.nombre).toBe("Día 1 - Torso");

      const ej = await como<{ series: number }>(
        "authenticated",
        ADMIN_ID,
        `SELECT series FROM public.ejercicios_en_rutina WHERE dia_id = '${diaAdminId}'`
      );
      expect(ej.rows[0]?.series).toBe(4);
    });

    it("el ADMIN puede registrar sesiones en registro_sesiones para sí mismo", async () => {
      await como(
        "authenticated",
        ADMIN_ID,
        `INSERT INTO public.registro_sesiones (id, alumno_id, dia_id, volumen_total_kg)
         VALUES ('${sesionAdminId}', '${ADMIN_ID}', '${diaAdminId}', 1200)`
      );

      const ses = await como<{ volumen_total_kg: string }>(
        "authenticated",
        ADMIN_ID,
        `SELECT volumen_total_kg::text FROM public.registro_sesiones WHERE alumno_id = '${ADMIN_ID}'`
      );
      expect(Number(ses.rows[0]?.volumen_total_kg)).toBe(1200);
    });

    it("el ADMIN puede registrar y consultar sus series en registro_series", async () => {
      await como(
        "authenticated",
        ADMIN_ID,
        `INSERT INTO public.registro_series (id, sesion_id, ejercicio_id, numero_serie, peso_kg, reps_hechas, completada)
         VALUES ('${serieAdminId}', '${sesionAdminId}', '${ejercicioMaestroId}', 1, 60, 10, true)`
      );

      const series = await como<{ peso_kg: string; reps_hechas: number; completada: boolean }>(
        "authenticated",
        ADMIN_ID,
        `SELECT peso_kg::text, reps_hechas, completada FROM public.registro_series WHERE sesion_id = '${sesionAdminId}'`
      );
      expect(series.rows).toHaveLength(1);
      expect(Number(series.rows[0]?.peso_kg)).toBe(60);
      expect(series.rows[0]?.reps_hechas).toBe(10);
      expect(series.rows[0]?.completada).toBe(true);
    });

    it("aislamiento RLS: otro alumno no puede ver la rutina ni las sesiones del Admin", async () => {
      const planesOtro = await como<{ id: string }>(
        "authenticated",
        OTRO_ALUMNO_ID,
        `SELECT id::text FROM public.planes_entrenamiento WHERE alumno_id = '${ADMIN_ID}'`
      );
      expect(planesOtro.rows).toHaveLength(0);

      const sesOtro = await como<{ id: string }>(
        "authenticated",
        OTRO_ALUMNO_ID,
        `SELECT id::text FROM public.registro_sesiones WHERE alumno_id = '${ADMIN_ID}'`
      );
      expect(sesOtro.rows).toHaveLength(0);
    });
  });
});
