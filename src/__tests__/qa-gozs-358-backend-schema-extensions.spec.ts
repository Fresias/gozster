import { describe, it, expect, beforeAll } from "vitest";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import * as fs from "node:fs";
import * as path from "node:path";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const NUEVA_MIGRACION = "20261104193000_extensiones_ejercicios_tiempo_tags_planes.sql";

const ADMIN = "00000000-0000-0000-0000-0000000000ad";
const COACH = "00000000-0000-0000-0000-00000000c0ac";
const ALUMNO = "00000000-0000-0000-0000-00000000000a";

const EJERCICIO_1 = "00000000-0000-0000-0000-0000000000e1";
const EJERCICIO_2 = "00000000-0000-0000-0000-0000000000e2";

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
    ('${ADMIN}', 'admin@test.local'),
    ('${COACH}', 'coach@test.local'),
    ('${ALUMNO}', 'alumno@test.local');

  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${ADMIN}', 'admin@test.local', 'Admin General', 'ADMIN', NULL, 'ACTIVA'),
    ('${COACH}', 'coach@test.local', 'Coach Principal', 'ENTRENADOR', NULL, 'ACTIVA'),
    ('${ALUMNO}', 'alumno@test.local', 'Alumno Test', 'ALUMNO', '${COACH}', 'ACTIVA');

  INSERT INTO public.ejercicios (id, nombre, musculos_principales) VALUES
    ('${EJERCICIO_1}', 'Plancha isométrica', ARRAY['CORE']),
    ('${EJERCICIO_2}', 'Remo con mancuerna', ARRAY['ESPALDA'])
  ON CONFLICT (id) DO NOTHING;
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

describe("GOZS-358: Extensiones de Esquema SQL para Ejercicios por Tiempo, Unilaterales, Tags de Rutina y Planes $0 con Notas", () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(SUPABASE_STUBS);

    const archivos = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const archivo of archivos) {
      await aplicarMigracion(fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), "utf-8"));
    }
    await db.exec(SEED);
  });

  it("debe existir el archivo de migración append-only", () => {
    const ruta = path.join(MIGRATIONS_DIR, NUEVA_MIGRACION);
    expect(fs.existsSync(ruta)).toBe(true);
    const contenido = fs.readFileSync(ruta, "utf-8");
    expect(contenido).toContain("tipo_medicion");
    expect(contenido).toContain("tiempo_objetivo_segundos");
    expect(contenido).toContain("es_unilateral");
    expect(contenido).toContain("chk_planes_entrenamiento_tags");
    expect(contenido).toContain("chk_planes_membresia_precio");
  });

  describe("Criterio 1: ejercicios_en_rutina (tiempo, unilateral y defaults)", () => {
    let planId: string;
    let diaId: string;

    beforeAll(async () => {
      const p = await db.query<{ id: string }>(
        `INSERT INTO public.planes_entrenamiento (profesor_id, alumno_id, nombre, estado, fecha_inicio)
         VALUES ($1, $2, 'Plan Pruebas Tiempo', 'ACTIVO', now()) RETURNING id`,
        [COACH, ALUMNO],
      );
      planId = p.rows[0]!.id;

      const d = await db.query<{ id: string }>(
        `INSERT INTO public.dias_rutina (plan_id, nombre, orden)
         VALUES ($1, 'Día A', 1) RETURNING id`,
        [planId],
      );
      diaId = d.rows[0]!.id;
    });

    it("GIVEN base con migración, WHEN inserta con tipo_medicion = 'TIEMPO', tiempo = 45 y unilateral = true, THEN persiste exitosamente", async () => {
      const res = await db.query<{
        id: string;
        tipo_medicion: string;
        tiempo_objetivo_segundos: number;
        es_unilateral: boolean;
        series: number;
        repeticiones: string;
        descanso_segundos: number;
      }>(
        `INSERT INTO public.ejercicios_en_rutina (
           dia_id, ejercicio_id, orden, series, repeticiones, tipo_medicion, tiempo_objetivo_segundos, es_unilateral
         ) VALUES ($1, $2, 1, 3, '45', 'TIEMPO', 45, true)
         RETURNING id, tipo_medicion, tiempo_objetivo_segundos, es_unilateral, series, repeticiones, descanso_segundos`,
        [diaId, EJERCICIO_1],
      );

      expect(res.rows).toHaveLength(1);
      const row = res.rows[0]!;
      expect(row.tipo_medicion).toBe("TIEMPO");
      expect(row.tiempo_objetivo_segundos).toBe(45);
      expect(row.es_unilateral).toBe(true);
      expect(row.series).toBe(3);
      expect(row.repeticiones).toBe("45");
      expect(row.descanso_segundos).toBe(90); // default original intacto
    });

    it("persiste con valores por defecto íntegros cuando se omiten las nuevas columnas", async () => {
      const res = await db.query<{
        tipo_medicion: string;
        tiempo_objetivo_segundos: number | null;
        es_unilateral: boolean;
      }>(
        `INSERT INTO public.ejercicios_en_rutina (
           dia_id, ejercicio_id, orden, series, repeticiones
         ) VALUES ($1, $2, 2, 4, '10')
         RETURNING tipo_medicion, tiempo_objetivo_segundos, es_unilateral`,
        [diaId, EJERCICIO_2],
      );

      expect(res.rows[0]!.tipo_medicion).toBe("REPS");
      expect(res.rows[0]!.tiempo_objetivo_segundos).toBeNull();
      expect(res.rows[0]!.es_unilateral).toBe(false);
    });

    it("rechaza tipo_medicion inválido por constraint chk_ejercicios_en_rutina_tipo_medicion", async () => {
      await expect(
        db.query(
          `INSERT INTO public.ejercicios_en_rutina (
             dia_id, ejercicio_id, orden, series, repeticiones, tipo_medicion
           ) VALUES ($1, $2, 3, 3, '10', 'METROS')`,
          [diaId, EJERCICIO_1],
        ),
      ).rejects.toThrow(/chk_ejercicios_en_rutina_tipo_medicion/);
    });

    it("rechaza tiempo_objetivo_segundos negativo", async () => {
      await expect(
        db.query(
          `INSERT INTO public.ejercicios_en_rutina (
             dia_id, ejercicio_id, orden, series, repeticiones, tipo_medicion, tiempo_objetivo_segundos
           ) VALUES ($1, $2, 4, 3, '10', 'TIEMPO', -5)`,
          [diaId, EJERCICIO_1],
        ),
      ).rejects.toThrow(/chk_ejercicios_en_rutina_tiempo_objetivo/);
    });
  });

  describe("Criterio 2: planes_entrenamiento.tags (array y catálogo cerrado)", () => {
    it("GIVEN un plan de entrenamiento, WHEN se asignan tags ['Fuerza', 'Hipertrofia'], THEN se consultan como array de texto", async () => {
      const res = await db.query<{ id: string; tags: string[] }>(
        `INSERT INTO public.planes_entrenamiento (profesor_id, nombre, estado, fecha_inicio, tags)
         VALUES ($1, 'Plan Con Tags', 'BORRADOR', now(), ARRAY['Fuerza', 'Hipertrofia']::text[])
         RETURNING id, tags`,
        [COACH],
      );

      expect(res.rows).toHaveLength(1);
      expect(res.rows[0]!.tags).toEqual(["Fuerza", "Hipertrofia"]);
    });

    it("permite todos los tags del catálogo oficial ('Fuerza', 'Hipertrofia', 'Rehabilitación', 'Potencia', 'Peso Corporal')", async () => {
      const todos = ["Fuerza", "Hipertrofia", "Rehabilitación", "Potencia", "Peso Corporal"];
      const res = await db.query<{ tags: string[] }>(
        `INSERT INTO public.planes_entrenamiento (profesor_id, nombre, estado, fecha_inicio, tags)
         VALUES ($1, 'Plan Full Tags', 'BORRADOR', now(), $2::text[])
         RETURNING tags`,
        [COACH, todos],
      );

      expect(res.rows[0]!.tags).toEqual(todos);
    });

    it("por defecto inicializa con array vacío '{}'", async () => {
      const res = await db.query<{ tags: string[] }>(
        `INSERT INTO public.planes_entrenamiento (profesor_id, nombre, estado, fecha_inicio)
         VALUES ($1, 'Plan Default Tags', 'BORRADOR', now())
         RETURNING tags`,
        [COACH],
      );

      expect(res.rows[0]!.tags).toEqual([]);
    });

    it("rechaza tags fuera del catálogo permitido", async () => {
      await expect(
        db.query(
          `INSERT INTO public.planes_entrenamiento (profesor_id, nombre, estado, fecha_inicio, tags)
           VALUES ($1, 'Plan Tag Inválido', 'BORRADOR', now(), ARRAY['Fuerza', 'Crossfit']::text[])`,
          [COACH],
        ),
      ).rejects.toThrow(/chk_planes_entrenamiento_tags/);
    });
  });

  describe("Criterio 3: planes_membresia (precio = 0 y notas descriptivas)", () => {
    it("GIVEN la tabla planes_membresia, WHEN crea plan con precio = 0 y nota, THEN guarda sin violar integridad", async () => {
      const res = await db.query<{
        id: string;
        nombre: string;
        precio: number;
        notas: string;
      }>(
        `INSERT INTO public.planes_membresia (
           nombre, cantidad_actividades, duracion_meses, precio, notas
         ) VALUES ('Plan Corpo Corporativo', 1, 1, 0, 'Beneficio 100% bonificado para colaboradores de la empresa')
         RETURNING id, nombre, precio, notas`,
      );

      expect(res.rows).toHaveLength(1);
      const row = res.rows[0]!;
      expect(Number(row.precio)).toBe(0);
      expect(row.notas).toBe("Beneficio 100% bonificado para colaboradores de la empresa");

      // Verificar que el trigger de historial de precio creó la fila de precio inicial a $0
      const historico = await db.query<{ precio: number }>(
        `SELECT precio FROM public.planes_membresia_precios WHERE plan_membresia_id = $1`,
        [row.id],
      );
      expect(historico.rows).toHaveLength(1);
      expect(Number(historico.rows[0]!.precio)).toBe(0);
    });

    it("permite notas nulas (columna opcional)", async () => {
      const res = await db.query<{ notas: string | null }>(
        `INSERT INTO public.planes_membresia (
           nombre, cantidad_actividades, duracion_meses, precio
         ) VALUES ('Plan Estándar Sin Notas', 1, 1, 15000)
         RETURNING notas`,
      );

      expect(res.rows[0]!.notas).toBeNull();
    });

    it("rechaza precios negativos", async () => {
      await expect(
        db.query(
          `INSERT INTO public.planes_membresia (
             nombre, cantidad_actividades, duracion_meses, precio
           ) VALUES ('Plan Precio Negativo', 1, 1, -500)`,
        ),
      ).rejects.toThrow(/precio/);
    });
  });

  describe("Criterio 4: clonar_plan_entrenamiento conserva prescripción y tags", () => {
    it("copia fielmente los tags del plan y las columnas tipo_medicion, tiempo_objetivo_segundos y es_unilateral", async () => {
      // 1. Crear plan origen con tags
      const p = await db.query<{ id: string }>(
        `INSERT INTO public.planes_entrenamiento (profesor_id, nombre, estado, fecha_inicio, tags)
         VALUES ($1, 'Rutina Origen Prescripción', 'BORRADOR', now(), ARRAY['Fuerza', 'Potencia']::text[])
         RETURNING id`,
        [COACH],
      );
      const origenPlanId = p.rows[0]!.id;

      // 2. Crear día
      const d = await db.query<{ id: string }>(
        `INSERT INTO public.dias_rutina (plan_id, nombre, orden)
         VALUES ($1, 'Día Único', 1) RETURNING id`,
        [origenPlanId],
      );
      const origenDiaId = d.rows[0]!.id;

      // 3. Crear ejercicio por tiempo y unilateral
      await db.query(
        `INSERT INTO public.ejercicios_en_rutina (
           dia_id, ejercicio_id, orden, series, repeticiones, tipo_medicion, tiempo_objetivo_segundos, es_unilateral
         ) VALUES ($1, $2, 1, 4, '30', 'TIEMPO', 30, true)`,
        [origenDiaId, EJERCICIO_1],
      );

      // 4. Ejecutar clonación como COACH autenticado
      const clonRes = await como<{ id: string }>(
        "authenticated",
        COACH,
        `SELECT public.clonar_plan_entrenamiento($1, 'Rutina Clonada QA')::text AS id`,
        [origenPlanId],
      );
      const clonId = clonRes.rows[0]!.id;

      // 5. Verificar tags del clon
      const clonPlan = await db.query<{ nombre: string; tags: string[]; plan_origen_id: string }>(
        `SELECT nombre, tags, plan_origen_id::text FROM public.planes_entrenamiento WHERE id = $1`,
        [clonId],
      );
      expect(clonPlan.rows[0]!.nombre).toBe("Rutina Clonada QA");
      expect(clonPlan.rows[0]!.tags).toEqual(["Fuerza", "Potencia"]);
      expect(clonPlan.rows[0]!.plan_origen_id).toBe(origenPlanId);

      // 6. Verificar ejercicio clonado
      const clonEj = await db.query<{
        tipo_medicion: string;
        tiempo_objetivo_segundos: number;
        es_unilateral: boolean;
      }>(
        `SELECT er.tipo_medicion, er.tiempo_objetivo_segundos, er.es_unilateral
         FROM public.ejercicios_en_rutina er
         JOIN public.dias_rutina d ON d.id = er.dia_id
         WHERE d.plan_id = $1`,
        [clonId],
      );
      expect(clonEj.rows).toHaveLength(1);
      expect(clonEj.rows[0]!.tipo_medicion).toBe("TIEMPO");
      expect(clonEj.rows[0]!.tiempo_objetivo_segundos).toBe(30);
      expect(clonEj.rows[0]!.es_unilateral).toBe(true);
    });
  });
});
