import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// ============================================================================
// GOZS-339: Verificación de aprovisionamiento de 94.gabriel.sanchez@gmail.com
// como ADMIN con rutina activa principal ("GABI AGOSTO") y ds.gabriel.sanchez@gmail.com
// como ADMIN auxiliar en PostgreSQL real (PGlite).
// ============================================================================

const SUPABASE_DIR = path.resolve(__dirname, "../../supabase");
const GABI_PLAN = "cab4ad3d-8595-47be-a220-6dc52117048e";
const TESTER = "00000000-0000-4000-8000-0000000000a1";
const COACH = "00000000-0000-4000-8000-0000000000c1";
const ALU_B = "00000000-0000-4000-8000-0000000000b2";

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

async function aplicar(sql: string) {
  const inicio = sql.search(/^BEGIN;/m);
  if (inicio > 0) {
    await db.exec(sql.slice(0, inicio));
    await db.exec(sql.slice(inicio));
  } else {
    await db.exec(sql);
  }
}

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
const q = async <T>(sql: string) => (await db.query<T>(sql)).rows;

const snapshot = async () =>
  q(`SELECT
    (SELECT json_agg(x ORDER BY x.id) FROM (SELECT id, email, nombre_completo, rol, estado_membresia FROM public.perfiles) x) AS perfiles,
    (SELECT json_agg(x ORDER BY x.id) FROM (SELECT id, profesor_id, alumno_id, nombre, estado FROM public.planes_entrenamiento) x) AS planes,
    (SELECT json_agg(x ORDER BY x.id) FROM (SELECT id, plan_id, nombre, orden FROM public.dias_rutina) x) AS dias,
    (SELECT json_agg(x ORDER BY x.id) FROM (SELECT id, dia_id, ejercicio_id, orden, series, repeticiones FROM public.ejercicios_en_rutina) x) AS ejr,
    (SELECT json_agg(x ORDER BY x.nombre) FROM (SELECT id, nombre FROM public.ejercicios) x) AS ejercicios`);

let snapshot1: unknown;
let snapshot2: unknown;

describe("GOZS-339: DB & Seeds: Configurar Gabriel dual admin emails y rutina activa", () => {
  beforeAll(async () => {
    await nuevaDb();
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES
        ('${TESTER}','94.gabriel.sanchez@gmail.com'),
        ('${COACH}','ds.gabriel.sanchez@gmail.com'),
        ('${ALU_B}','alumno.b.tester@gozster.local');

      -- Perfil previo del tester o alumno original antes del seed
      INSERT INTO public.perfiles (id, email, nombre_completo, rol) VALUES
        ('${TESTER}','94.gabriel.sanchez@gmail.com','Gabriel Tester','ALUMNO'),
        ('${COACH}','ds.gabriel.sanchez@gmail.com','Coach Tester','ADMIN');

      -- Preexistencia de GABI AGOSTO con sus días y ejercicios (representando la rutina real del usuario)
      INSERT INTO public.ejercicios (nombre, musculos_principales) VALUES
        ('Press Plano con Barra', ARRAY['Pecho']),
        ('Prensa 45°', ARRAY['Cuádriceps']),
        ('Jalón al pecho agarre neutro', ARRAY['Dorsal ancho']),
        ('Curl de muñeca con barra', ARRAY['Antebrazos']),
        ('Curl de muñeca inverso', ARRAY['Antebrazos'])
      ON CONFLICT (nombre) DO NOTHING;

      INSERT INTO public.planes_entrenamiento (id, alumno_id, profesor_id, nombre, estado)
      VALUES ('${GABI_PLAN}', '${TESTER}', '${COACH}', 'GABI AGOSTO', 'ACTIVO')
      ON CONFLICT (id) DO UPDATE SET estado = 'ACTIVO';

      INSERT INTO public.dias_rutina (id, plan_id, nombre, orden) VALUES
        ('cab4ad3d-8595-47be-a220-6dc5211700d1', '${GABI_PLAN}', 'Día 1 - Empuje + Antebrazos', 1),
        ('cab4ad3d-8595-47be-a220-6dc5211700d2', '${GABI_PLAN}', 'Día 2 - Piernas + Antebrazos', 2),
        ('cab4ad3d-8595-47be-a220-6dc5211700d3', '${GABI_PLAN}', 'Día 3 - Tracción + Antebrazos', 3)
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones)
      SELECT 'cab4ad3d-8595-47be-a220-6dc521170e11', 'cab4ad3d-8595-47be-a220-6dc5211700d1', id, 1, 4, '8-10'
      FROM public.ejercicios WHERE nombre = 'Press Plano con Barra'
      ON CONFLICT (id) DO NOTHING;
    `);

    const seed = leerSeed("seed_tester.sql");
    await db.exec(seed);
    snapshot1 = await snapshot();
    await db.exec(seed);
    snapshot2 = await snapshot();
  }, 90_000);

  it("el seed_tester.sql es 100% idempotente al ejecutarse múltiples veces", () => {
    expect(snapshot2).toEqual(snapshot1);
  });

  it("94.gabriel.sanchez@gmail.com queda configurado con rol = ADMIN, nombre_completo = Gabriel Sanchez y membresía ACTIVA", async () => {
    const [perfil] = await q<{
      id: string;
      email: string;
      nombre_completo: string;
      rol: string;
      estado_membresia: string;
    }>(
      `SELECT id, email, nombre_completo, rol, estado_membresia FROM public.perfiles WHERE id = '${TESTER}'`
    );

    expect(perfil).toBeDefined();
    expect(perfil!.email).toBe("94.gabriel.sanchez@gmail.com");
    expect(perfil!.nombre_completo).toBe("Gabriel Sanchez");
    expect(perfil!.rol).toBe("ADMIN");
    expect(perfil!.estado_membresia).toBe("ACTIVA");
  });

  it("ds.gabriel.sanchez@gmail.com queda configurado con rol = ADMIN y membresía ACTIVA como admin auxiliar", async () => {
    const [perfil] = await q<{
      id: string;
      email: string;
      rol: string;
      estado_membresia: string;
    }>(
      `SELECT id, email, rol, estado_membresia FROM public.perfiles WHERE id = '${COACH}'`
    );

    expect(perfil).toBeDefined();
    expect(perfil!.email).toBe("ds.gabriel.sanchez@gmail.com");
    expect(perfil!.rol).toBe("ADMIN");
    expect(perfil!.estado_membresia).toBe("ACTIVA");
  });

  it("94.gabriel.sanchez@gmail.com tiene 'GABI AGOSTO' como único plan de entrenamiento ACTIVO", async () => {
    const activos = await q<{ id: string; nombre: string; estado: string; alumno_id: string }>(
      `SELECT id, nombre, estado, alumno_id FROM public.planes_entrenamiento
       WHERE alumno_id = '${TESTER}' AND estado = 'ACTIVO'`
    );

    expect(activos).toHaveLength(1);
    expect(activos[0]!.id).toBe(GABI_PLAN);
    expect(activos[0]!.nombre).toBe("GABI AGOSTO");
    expect(activos[0]!.estado).toBe("ACTIVO");
  });

  it("la rutina 'GABI AGOSTO' cuenta con días y ejercicios con series configurados", async () => {
    const dias = await q<{ id: string; nombre: string; orden: number }>(
      `SELECT id, nombre, orden FROM public.dias_rutina WHERE plan_id = '${GABI_PLAN}' ORDER BY orden ASC`
    );
    expect(dias.length).toBeGreaterThanOrEqual(1);

    const ejr = await q<{ id: string; series: number }>(
      `SELECT id, series FROM public.ejercicios_en_rutina
       WHERE dia_id IN (SELECT id FROM public.dias_rutina WHERE plan_id = '${GABI_PLAN}')`
    );
    expect(ejr.length).toBeGreaterThanOrEqual(1);
  });

  it("RLS: un usuario ADMIN puede consultar su propia rutina activa y registrar series sin violaciones de política", async () => {
    // Configurar contexto JWT para simular sesión autenticada de 94.gabriel.sanchez@gmail.com
    await db.exec(`SET request.jwt.claims = '{"sub": "${TESTER}", "role": "authenticated"}';`);
    await db.exec(`SET ROLE authenticated;`);

    // SELECT perfil propio
    const miPerfil = await q<{ id: string; rol: string }>(
      `SELECT id, rol FROM public.perfiles WHERE id = '${TESTER}'`
    );
    expect(miPerfil).toHaveLength(1);
    expect(miPerfil[0]!.rol).toBe("ADMIN");

    // SELECT plan propio ACTIVO
    const misPlanes = await q<{ id: string; nombre: string }>(
      `SELECT id, nombre FROM public.planes_entrenamiento WHERE alumno_id = '${TESTER}' AND estado = 'ACTIVO'`
    );
    expect(misPlanes).toHaveLength(1);
    expect(misPlanes[0]!.nombre).toBe("GABI AGOSTO");

    // INSERT de sesión y serie de entrenamiento propia
    const [sesion] = await q<{ id: string }>(
      `INSERT INTO public.registro_sesiones (alumno_id) VALUES ('${TESTER}') RETURNING id`
    );
    expect(sesion?.id).toBeDefined();

    const [ej] = await q<{ id: string }>(
      `SELECT id FROM public.ejercicios LIMIT 1`
    );

    const [serie] = await q<{ id: string }>(
      `INSERT INTO public.registro_series (sesion_id, ejercicio_id, numero_serie, peso_kg, reps_hechas)
       VALUES ('${sesion!.id}', '${ej!.id}', 1, 80, 10) RETURNING id`
    );
    expect(serie?.id).toBeDefined();

    // Resetear rol
    await db.exec(`RESET ROLE;`);
    await db.exec(`SET request.jwt.claims = '';`);
  });
});
