import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { ultimaVezDeEjercicio, type SerieHistorica } from "@/lib/historial-ejercicio";

// GOZS-294: QA de rutinas — clonación completa (GOZS-290), histórico abril-junio
// y guardado/asignación transaccional (GOZS-291), contra las migraciones reales (PGlite).
//
// Contrato asumido de las RPCs de GOZS-291 (alinear si el PR de backend lo cambia):
//   guardar_rutina(p_payload jsonb) -> uuid del plan
//     p_payload = { plan: { id?, nombre, alumno_id?, comentarios? }, como_nueva?: boolean,
//                   dias: [{ nombre, orden, ejercicios: [{ ejercicio_id, orden, series, repeticiones, ... }] }] }
//   asignar_rutina_a_alumno(p_plan_id uuid, p_alumno_id uuid) -> uuid del plan nuevo del alumno

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

const ADMIN = "00000000-0000-0000-0000-0000000000ad";
const COACH = "00000000-0000-0000-0000-00000000c0ac";
const JUAN = "00000000-0000-0000-0000-00000000000a";
const ANA = "00000000-0000-0000-0000-00000000000b";

const PRESS = "00000000-0000-0000-0000-0000000000e1";
const SENTADILLA = "00000000-0000-0000-0000-0000000000e2";
const REMO = "00000000-0000-0000-0000-0000000000e3";
const INEXISTENTE = "00000000-0000-0000-0000-0000000000ff";

const PLAN_ABRIL = "30000000-0000-0000-0000-000000000004";
const PLAN_MAYO = "30000000-0000-0000-0000-000000000005";
const PLANTILLA_PECHO = "30000000-0000-0000-0000-0000000000a1";
const PLAN_PRESCRIPCION = "30000000-0000-0000-0000-0000000000b1";
const PLAN_ANA = "30000000-0000-0000-0000-0000000000c1";

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
    ('${ADMIN}','admin@t'),('${COACH}','coach@t'),('${JUAN}','juan@t'),('${ANA}','ana@t');
  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${ADMIN}','admin@t','Admin','ADMIN',NULL,'ACTIVA'),
    ('${COACH}','coach@t','Coach','ENTRENADOR',NULL,'ACTIVA'),
    ('${JUAN}','juan@t','Juan','ALUMNO','${COACH}','ACTIVA'),
    ('${ANA}','ana@t','Ana','ALUMNO','${COACH}','ACTIVA');
  INSERT INTO public.ejercicios (id, nombre, musculos_principales) VALUES
    ('${PRESS}','QA Press pecho',ARRAY['PECHO']),
    ('${SENTADILLA}','QA Sentadilla',ARRAY['CUADRICEPS']),
    ('${REMO}','QA Remo',ARRAY['ESPALDA'])
  ON CONFLICT (id) DO NOTHING;

  -- Juan: Press pecho en abril (archivado), otra rutina en mayo (activa).
  INSERT INTO public.planes_entrenamiento (id, profesor_id, alumno_id, nombre, estado, fecha_inicio, fecha_fin) VALUES
    ('${PLAN_ABRIL}','${COACH}','${JUAN}','Abril','INACTIVO','2026-04-01T00:00:00Z','2026-05-01T00:00:00Z'),
    ('${PLAN_MAYO}','${COACH}','${JUAN}','Mayo','ACTIVO','2026-05-01T00:00:00Z',NULL),
    ('${PLANTILLA_PECHO}','${COACH}',NULL,'Plantilla pecho','BORRADOR','2026-01-01T00:00:00Z',NULL),
    ('${PLAN_PRESCRIPCION}','${COACH}',NULL,'Prescripción completa','BORRADOR','2026-01-01T00:00:00Z',NULL),
    ('${PLAN_ANA}','${COACH}','${ANA}','Ana actual','ACTIVO','2026-03-01T00:00:00Z',NULL);
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

async function errorDe(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("se esperaba que la operación fallara y no falló");
}

// Texto crudo de Postgres que nunca debe llegar al usuario.
const MENSAJE_CRUDO = /violates|foreign key|constraint|SQLSTATE|duplicate key|null value|syntax|invalid input|\b23\d{3}\b/i;

async function contar(sql: string): Promise<number> {
  const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM (${sql}) t`);
  return r.rows[0]!.n;
}

async function crearDia(planId: string, nombre: string, orden: number): Promise<string> {
  const r = await db.query<{ id: string }>(
    `INSERT INTO public.dias_rutina (plan_id, nombre, orden) VALUES ($1,$2,$3) RETURNING id`,
    [planId, nombre, orden],
  );
  return r.rows[0]!.id;
}

async function crearSesion(diaId: string, alumnoId: string, fecha: string, ejercicioId: string, cargas: [number, number][]) {
  const s = await db.query<{ id: string }>(
    `INSERT INTO public.registro_sesiones (alumno_id, dia_id, fecha) VALUES ($1,$2,$3) RETURNING id`,
    [alumnoId, diaId, fecha],
  );
  const sesionId = s.rows[0]!.id;
  for (const [i, [peso, reps]] of cargas.entries()) {
    await db.query(
      `INSERT INTO public.registro_series (sesion_id, ejercicio_id, numero_serie, peso_kg, reps_hechas, completada)
       VALUES ($1,$2,$3,$4,$5,true)`,
      [sesionId, ejercicioId, i + 1, peso, reps],
    );
  }
  return sesionId;
}

async function historialDe(alumnoId: string): Promise<SerieHistorica[]> {
  const r = await db.query<SerieHistorica & { fecha: Date | string; peso_kg: string | number }>(
    `SELECT rs.ejercicio_id, rs.sesion_id, s.fecha, rs.numero_serie, rs.peso_kg, rs.reps_hechas,
            rs.rpe_real, rs.completada, rs.set_type
     FROM public.registro_series rs JOIN public.registro_sesiones s ON s.id = rs.sesion_id
     WHERE s.alumno_id = $1`,
    [alumnoId],
  );
  return r.rows.map((x) => ({
    ...x,
    fecha: new Date(x.fecha).toISOString(),
    peso_kg: Number(x.peso_kg),
    rpe_real: x.rpe_real === null ? null : Number(x.rpe_real),
  }));
}

function payloadValido(nombre: string, ejercicioId: string, extra: Record<string, unknown> = {}) {
  return {
    ...extra,
    plan: { nombre, ...((extra.plan as object) ?? {}) },
    dias: [
      {
        nombre: "Día 1",
        orden: 1,
        ejercicios: [{ ejercicio_id: SENTADILLA, orden: 1, series: 3, repeticiones: "10" }],
      },
      {
        nombre: "Día 2",
        orden: 2,
        ejercicios: [
          { ejercicio_id: REMO, orden: 1, series: 3, repeticiones: "12" },
          { ejercicio_id: ejercicioId, orden: 2, series: 4, repeticiones: "8" },
        ],
      },
    ],
  };
}

const guardar = (payload: unknown) =>
  como<{ id: string }>("authenticated", COACH, `SELECT public.guardar_rutina($1::jsonb)::text AS id`, [
    JSON.stringify(payload),
  ]);

const asignar = (planId: string, alumnoId: string) =>
  como<{ id: string }>("authenticated", COACH, `SELECT public.asignar_rutina_a_alumno($1, $2)::text AS id`, [
    planId,
    alumnoId,
  ]);

const filasDeRutinas = () =>
  db.query<{ planes: number; dias: number; ejercicios: number }>(
    `SELECT (SELECT count(*)::int FROM public.planes_entrenamiento) AS planes,
            (SELECT count(*)::int FROM public.dias_rutina) AS dias,
            (SELECT count(*)::int FROM public.ejercicios_en_rutina) AS ejercicios`,
  );

describe("GOZS-294 QA Rutinas: clonación, histórico y guardado transaccional", () => {
  let seriesPressAbril = 0;
  let sesionAbril: string;
  let diaAbril: string;

  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(SUPABASE_STUBS);
    const archivos = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const archivo of archivos) {
      await aplicarMigracion(fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), "utf-8"));
    }
    await db.exec(SEED);

    diaAbril = await crearDia(PLAN_ABRIL, "Pecho", 1);
    await db.query(
      `INSERT INTO public.ejercicios_en_rutina (dia_id, ejercicio_id, orden, series, repeticiones) VALUES ($1,$2,1,3,'8')`,
      [diaAbril, PRESS],
    );
    sesionAbril = await crearSesion(diaAbril, JUAN, "2026-04-14T12:00:00Z", PRESS, [
      [60, 8],
      [62.5, 7],
      [62.5, 6],
    ]);
    seriesPressAbril = 3;

    const diaMayo = await crearDia(PLAN_MAYO, "Piernas", 1);
    await db.query(
      `INSERT INTO public.ejercicios_en_rutina (dia_id, ejercicio_id, orden, series, repeticiones) VALUES ($1,$2,1,3,'10')`,
      [diaMayo, SENTADILLA],
    );
    await crearSesion(diaMayo, JUAN, "2026-05-20T12:00:00Z", SENTADILLA, [
      [80, 10],
      [80, 10],
    ]);

    const diaPlantilla = await crearDia(PLANTILLA_PECHO, "Pecho", 1);
    await db.query(
      `INSERT INTO public.ejercicios_en_rutina (dia_id, ejercicio_id, orden, series, repeticiones) VALUES ($1,$2,1,4,'6-8')`,
      [diaPlantilla, PRESS],
    );

    // Prescripción con todos los valores distintos al default.
    const d1 = await crearDia(PLAN_PRESCRIPCION, "Empuje", 1);
    const d2 = await crearDia(PLAN_PRESCRIPCION, "Tirón", 2);
    await db.query(
      `INSERT INTO public.ejercicios_en_rutina
         (dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas,
          es_superserie, grupo_superserie, tempo, force_rpe_required, tempo_activo, tipo_serie)
       VALUES
         ($1,$3,1,4,'6-8',150,8.5,'Pausa en el pecho',true,1,'4-1-2-0',true,true,'DROPSET'),
         ($1,$4,2,3,'10',60,NULL,NULL,true,1,'2-0-1-0',false,false,'WARMUP'),
         ($2,$5,1,5,'5',180,9.0,'Agarre prono',false,NULL,'3-1-1-1',true,true,'NORMAL')`,
      [d1, d2, PRESS, SENTADILLA, REMO],
    );
  }, 120_000);

  describe("1. Histórico abril → mayo → junio", () => {
    it("'la última vez' de Press pecho en junio es el registro de abril (agrupado por ejercicio_id, no por plan)", async () => {
      const u = ultimaVezDeEjercicio(await historialDe(JUAN), PRESS, "2026-06-10T12:00:00Z");
      expect(u).not.toBeNull();
      expect(u!.fecha.slice(0, 10)).toBe("2026-04-14");
      expect(u!.series.map((s) => [s.peso_kg, s.reps_hechas])).toEqual([
        [60, 8],
        [62.5, 7],
        [62.5, 6],
      ]);
    });

    it("asignar en junio una rutina con Press pecho no pierde series ni su ejercicio_id, y el histórico sigue apuntando a abril", async () => {
      const antes = await contar(`SELECT 1 FROM public.registro_series`);
      const nuevo = (await asignar(PLANTILLA_PECHO, JUAN)).rows[0]!.id;
      expect(nuevo).toBeTruthy();

      expect(await contar(`SELECT 1 FROM public.registro_series`)).toBe(antes);
      expect(
        await contar(`SELECT 1 FROM public.registro_series WHERE sesion_id = '${sesionAbril}' AND ejercicio_id = '${PRESS}'`),
      ).toBe(seriesPressAbril);
      // La sesión de abril sigue colgando de su día original (no se borró ni se puso en NULL).
      const s = await db.query<{ dia_id: string | null }>(
        `SELECT dia_id FROM public.registro_sesiones WHERE id = $1`,
        [sesionAbril],
      );
      expect(s.rows[0]!.dia_id).toBe(diaAbril);

      // El plan de junio prescribe el mismo ejercicio canónico.
      expect(
        await contar(
          `SELECT 1 FROM public.ejercicios_en_rutina er JOIN public.dias_rutina d ON d.id = er.dia_id
           WHERE d.plan_id = '${nuevo}' AND er.ejercicio_id = '${PRESS}'`,
        ),
      ).toBe(1);

      const u = ultimaVezDeEjercicio(await historialDe(JUAN), PRESS);
      expect(u!.fecha.slice(0, 10)).toBe("2026-04-14");
      expect(u!.series).toHaveLength(seriesPressAbril);
    });
  });

  describe("2. Clonación completa (clonar_plan_entrenamiento)", () => {
    it("la copia coincide con la original en TODAS las columnas de prescripción y registra plan_origen_id", async () => {
      const r = await como<{ id: string }>(
        "authenticated",
        COACH,
        `SELECT public.clonar_plan_entrenamiento($1, 'Copia QA')::text AS id`,
        [PLAN_PRESCRIPCION],
      );
      const copia = r.rows[0]!.id;
      expect(copia).not.toBe(PLAN_PRESCRIPCION);

      // Columnas de prescripción = todas las de ejercicios_en_rutina salvo identidad/auditoría.
      // Si mañana se agrega una columna nueva y el clon no la copia, este test la detecta.
      const cols = (
        await db.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'ejercicios_en_rutina'
             AND column_name NOT IN ('id','dia_id','created_at','updated_at')
           ORDER BY column_name`,
        )
      ).rows.map((c) => c.column_name);
      expect(cols).toEqual(expect.arrayContaining(["tempo", "tempo_activo", "tipo_serie", "force_rpe_required"]));

      const filas = (planId: string) =>
        db.query<Record<string, unknown>>(
          `SELECT d.nombre AS dia_nombre, d.orden AS dia_orden, ${cols.map((c) => `er.${c}`).join(", ")}
           FROM public.ejercicios_en_rutina er JOIN public.dias_rutina d ON d.id = er.dia_id
           WHERE d.plan_id = $1 ORDER BY d.orden, er.orden`,
          [planId],
        );
      const original = (await filas(PLAN_PRESCRIPCION)).rows;
      const clonada = (await filas(copia)).rows;
      expect(original).toHaveLength(3);
      expect(clonada).toEqual(original);

      const origen = await db.query<{ plan_origen_id: string | null }>(
        `SELECT plan_origen_id::text FROM public.planes_entrenamiento WHERE id = $1`,
        [copia],
      );
      expect(origen.rows[0]!.plan_origen_id).toBe(PLAN_PRESCRIPCION);
    });
  });

  describe("3. Guardado transaccional (guardar_rutina)", () => {
    it("una rutina nueva con un ejercicio inválido no deja filas parciales y el mensaje es humano", async () => {
      const antes = (await filasDeRutinas()).rows[0];
      const msg = await errorDe(guardar(payloadValido("Rutina rota", INEXISTENTE)));

      expect((await filasDeRutinas()).rows[0]).toEqual(antes);
      expect(msg).toMatch(/No se pudo guardar/);
      expect(msg).not.toMatch(MENSAJE_CRUDO);
      expect(await contar(`SELECT 1 FROM public.planes_entrenamiento WHERE nombre = 'Rutina rota'`)).toBe(0);
    });

    it("editar una rutina existente con un ejercicio inválido conserva intactos sus días y ejercicios", async () => {
      const id = (await guardar(payloadValido("Editable", PRESS))).rows[0]!.id;
      const foto = () =>
        db.query(
          `SELECT d.id, d.nombre, d.orden, er.ejercicio_id, er.orden AS er_orden, er.series, er.repeticiones
           FROM public.dias_rutina d LEFT JOIN public.ejercicios_en_rutina er ON er.dia_id = d.id
           WHERE d.plan_id = $1 ORDER BY d.orden, er.orden`,
          [id],
        );
      const antes = (await foto()).rows;
      expect(antes).toHaveLength(3);

      const msg = await errorDe(guardar(payloadValido("Editable v2", INEXISTENTE, { plan: { id } })));
      expect((await foto()).rows).toEqual(antes);
      const plan = await db.query<{ nombre: string }>(`SELECT nombre FROM public.planes_entrenamiento WHERE id = $1`, [id]);
      expect(plan.rows[0]!.nombre).toBe("Editable");
      expect(msg).toMatch(/No se pudo guardar/);
      expect(msg).not.toMatch(MENSAJE_CRUDO);
    });

    it("guardar una rutina sin sesiones actualiza el mismo plan_id y no crea duplicado", async () => {
      const id = (await guardar(payloadValido("Sin sesiones", PRESS))).rows[0]!.id;
      const planes = await contar(`SELECT 1 FROM public.planes_entrenamiento`);
      const id2 = (await guardar(payloadValido("Sin sesiones v2", SENTADILLA, { plan: { id } }))).rows[0]!.id;
      expect(id2).toBe(id);
      expect(await contar(`SELECT 1 FROM public.planes_entrenamiento`)).toBe(planes);
    });

    it("actualizar en el lugar una rutina con sesiones se rechaza con mensaje humano y las sesiones conservan su dia_id", async () => {
      const msg = await errorDe(guardar(payloadValido("Abril editado", PRESS, { plan: { id: PLAN_ABRIL } })));
      expect(msg).not.toMatch(MENSAJE_CRUDO);
      expect(msg).toMatch(/nueva versi[oó]n/i);
      const s = await db.query<{ dia_id: string }>(`SELECT dia_id FROM public.registro_sesiones WHERE id = $1`, [sesionAbril]);
      expect(s.rows[0]!.dia_id).toBe(diaAbril);
      expect(await contar(`SELECT 1 FROM public.planes_entrenamiento WHERE id = '${PLAN_ABRIL}' AND nombre = 'Abril'`)).toBe(1);
    });
  });

  describe("4. Asignación (asignar_rutina_a_alumno)", () => {
    it("con rutina activa, asignar otra deja exactamente una ACTIVO y fechas sin solaparse", async () => {
      const nuevo = (await asignar(PLANTILLA_PECHO, ANA)).rows[0]!.id;

      const activos = await db.query<{ id: string }>(
        `SELECT id::text FROM public.planes_entrenamiento WHERE alumno_id = $1 AND estado = 'ACTIVO'`,
        [ANA],
      );
      expect(activos.rows.map((r) => r.id)).toEqual([nuevo]);

      const anterior = await db.query<{ estado: string; fin: string; inicio_nuevo: string }>(
        `SELECT a.estado::text, a.fecha_fin::text AS fin, n.fecha_inicio::text AS inicio_nuevo
         FROM public.planes_entrenamiento a, public.planes_entrenamiento n
         WHERE a.id = $1 AND n.id = $2`,
        [PLAN_ANA, nuevo],
      );
      expect(anterior.rows[0]!.estado).toBe("INACTIVO");
      expect(anterior.rows[0]!.fin).toBe(anterior.rows[0]!.inicio_nuevo);

      // Ningún par de rutinas ACTIVO/INACTIVO del alumno se solapa en el tiempo.
      expect(
        await contar(
          `SELECT 1 FROM public.planes_entrenamiento a JOIN public.planes_entrenamiento b
             ON a.alumno_id = b.alumno_id AND a.id < b.id
           WHERE a.alumno_id = '${ANA}' AND a.estado <> 'BORRADOR' AND b.estado <> 'BORRADOR'
             AND tstzrange(a.fecha_inicio, a.fecha_fin) && tstzrange(b.fecha_inicio, b.fecha_fin)`,
        ),
      ).toBe(0);
    });

    it("la base impide dos rutinas ACTIVO para el mismo alumno (índice único parcial)", async () => {
      await expect(
        db.query(
          `INSERT INTO public.planes_entrenamiento (profesor_id, alumno_id, nombre, estado) VALUES ($1,$2,'Segunda activa','ACTIVO')`,
          [COACH, ANA],
        ),
      ).rejects.toThrow(/duplicate key|unique/i);
    });

    it("un entrenador no puede asignar a un alumno que no es suyo", async () => {
      await db.exec(`
        INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-0000000000c9','ajeno@t');
        INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia)
        VALUES ('00000000-0000-0000-0000-0000000000c9','ajeno@t','Ajeno','ENTRENADOR',NULL,'ACTIVA');
      `);
      const antes = await contar(`SELECT 1 FROM public.planes_entrenamiento WHERE alumno_id = '${ANA}'`);
      await expect(
        como("authenticated", "00000000-0000-0000-0000-0000000000c9", `SELECT public.asignar_rutina_a_alumno($1, $2)`, [
          PLANTILLA_PECHO,
          ANA,
        ]),
      ).rejects.toThrow(/No autorizado|No se pudo|row-level security|permission denied/);
      expect(await contar(`SELECT 1 FROM public.planes_entrenamiento WHERE alumno_id = '${ANA}'`)).toBe(antes);
    });
  });
});
