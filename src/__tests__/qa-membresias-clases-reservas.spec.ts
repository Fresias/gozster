import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// QA #113 (GOZS-100): verificación independiente de las RPC de reservas.
// Complementa membresias-clases-reservas.spec.ts con lo que esa suite no cubre:
// firmas sin alumno arbitrario, locks FOR UPDATE de la carrera por el último
// cupo, bordes de semana en America/Argentina/Buenos_Aires y autorización real
// de profesores (asignación en clases_profesores).

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const TZ = "America/Argentina/Buenos_Aires";

const ADMIN = "00000000-0000-0000-0000-0000000001ad";
const COACH = "00000000-0000-0000-0000-0000000001c0";
const OTRO_COACH = "00000000-0000-0000-0000-0000000001c2";
const DOS = "00000000-0000-0000-0000-00000000010a";
const LIBRE_1 = "00000000-0000-0000-0000-00000000010b";
const LIBRE_2 = "00000000-0000-0000-0000-00000000010c";
const LIBRE_3 = "00000000-0000-0000-0000-00000000010d";

const PLAN_2_1 = "20000000-0000-0000-0000-000000000101";
const PLAN_LIBRE = "20000000-0000-0000-0000-000000000102";

type Rol = "anon" | "authenticated";

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

const ALUMNOS = [DOS, LIBRE_1, LIBRE_2, LIBRE_3];

const SEED = `
  INSERT INTO auth.users (id, email) VALUES
    ('${ADMIN}','qa-admin@t'),('${COACH}','qa-coach@t'),('${OTRO_COACH}','qa-c2@t'),
    ${ALUMNOS.map((a, i) => `('${a}','qa-al${i}@t')`).join(",")};
  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${ADMIN}','qa-admin@t','Admin','ADMIN',NULL,'ACTIVA'),
    ('${COACH}','qa-coach@t','Coach','ENTRENADOR',NULL,'ACTIVA'),
    ('${OTRO_COACH}','qa-c2@t','Otro coach','ENTRENADOR',NULL,'ACTIVA'),
    ${ALUMNOS.map((a, i) => `('${a}','qa-al${i}@t','Alumno ${i}','ALUMNO','${COACH}','ACTIVA')`).join(",")};
  INSERT INTO public.planes_membresia (id, nombre, limite_semanal, cantidad_actividades, duracion_meses, precio) VALUES
    ('${PLAN_2_1}','2 por semana',2,1,1,20000),
    ('${PLAN_LIBRE}','Pase libre',NULL,2,1,35000);
  INSERT INTO public.contrataciones
    (alumno_id, tipo_servicio, dia_vencimiento, fecha_inicio, fecha_fin, estado, plan_membresia_id, actividad) VALUES
    ('${DOS}','PRESENCIAL',5,CURRENT_DATE - 30,CURRENT_DATE + 30,'VIGENTE','${PLAN_2_1}','FUNCIONAL'),
    ${[LIBRE_1, LIBRE_2, LIBRE_3]
      .map((a) => `('${a}','PRESENCIAL',5,CURRENT_DATE - 30,CURRENT_DATE + 30,'VIGENTE','${PLAN_LIBRE}',NULL)`)
      .join(",")};
`;

// Lunes 00:00 (hora argentina) de la semana en curso y de la siguiente.
const LUNES = `(date_trunc('week', now() AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}')`;
const FIN_SEMANA = `(${LUNES} + interval '7 days')`;
const enSemana = (f: number) => `now() + (${FIN_SEMANA} - now()) * ${f}`;

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

async function actuarComo(tx: Transaction, rol: Rol, sub: string | null) {
  await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify(sub ? { sub, role: rol } : { role: rol }),
  ]);
  await tx.query(`SET LOCAL ROLE ${rol}`);
}

function como<T>(rol: Rol, sub: string | null, sql: string) {
  return db.transaction(async (tx: Transaction) => {
    await actuarComo(tx, rol, sub);
    return tx.query<T>(sql);
  });
}

async function crearClase(inicio: string, capacidad: number | null = null, profesores: string[] = [COACH]) {
  const r = await db.query<{ id: string }>(
    `INSERT INTO public.clases (actividad, inicio, duracion_minutos, capacidad)
     VALUES ('FUNCIONAL', ${inicio}, 60, ${capacidad ?? "NULL"}) RETURNING id`
  );
  const id = r.rows[0]!.id;
  for (const p of profesores) {
    await db.query(`INSERT INTO public.clases_profesores (clase_id, profesor_id) VALUES ('${id}', '${p}')`);
  }
  return id;
}

const reservar = async (alumno: string, claseId: string) =>
  (
    await como<{ reserva_id: string; aviso: string | null }>(
      "authenticated",
      alumno,
      `SELECT reserva_id, aviso FROM public.reservar_clase('${claseId}')`
    )
  ).rows[0]!;

async function contar(sql: string): Promise<number> {
  return (await db.query<{ n: number }>(sql)).rows[0]!.n;
}

describe("QA #113: reservas de clases (PGlite)", () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(SUPABASE_STUBS);
    const archivos = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const archivo of archivos) {
      await aplicarMigracion(fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), "utf-8"));
    }
    await db.exec(SEED);
  }, 60_000);

  describe("ninguna RPC acepta un alumno arbitrario", () => {
    const FIRMAS: Record<string, string[]> = {
      reservar_clase: ["p_clase_id"],
      cancelar_reserva: ["p_reserva_id"],
      marcar_ausente: ["p_reserva_id"],
      cancelar_clase: ["p_clase_id", "p_motivo"],
    };

    it("cada RPC tiene una sola firma, sin parámetros de alumno, SECURITY DEFINER y search_path fijo", async () => {
      const r = await db.query<{ proname: string; args: string[]; secdef: boolean; config: string[] | null }>(
        // Solo argumentos de entrada: RETURNS TABLE suma las columnas OUT a proargnames.
        `SELECT proname, coalesce((proargnames)[1:pronargs], '{}') AS args, prosecdef AS secdef, proconfig AS config
         FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = ANY($1)`,
        [Object.keys(FIRMAS)]
      );
      expect(r.rows).toHaveLength(Object.keys(FIRMAS).length);
      for (const fn of r.rows) {
        expect(fn.args).toEqual(FIRMAS[fn.proname]);
        expect(fn.args.some((a) => /alumno|usuario|user|perfil/i.test(a))).toBe(false);
        expect(fn.secdef).toBe(true);
        expect(fn.config).toContain("search_path=public");
      }
    });

    it("authenticated sin sub en el JWT no puede reservar", async () => {
      const clase = await crearClase(enSemana(0.5));
      await expect(
        como("authenticated", null, `SELECT * FROM public.reservar_clase('${clase}')`)
      ).rejects.toMatchObject({ code: "42501" });
      expect(await contar(`SELECT count(*)::int AS n FROM public.reservas WHERE clase_id = '${clase}'`)).toBe(0);
    });

    it("la reserva siempre queda a nombre de auth.uid()", async () => {
      const clase = await crearClase(enSemana(0.5));
      const { reserva_id } = await reservar(LIBRE_3, clase);
      const r = await db.query<{ alumno_id: string }>(`SELECT alumno_id FROM public.reservas WHERE id = '${reserva_id}'`);
      expect(r.rows[0]!.alumno_id).toBe(LIBRE_3);
    });
  });

  describe("carrera por el último cupo", () => {
    it("reservar_clase toma FOR UPDATE sobre la clase y sobre la contratación antes de insertar", async () => {
      const clase = await crearClase(enSemana(0.4), 5);
      // Un row lock deja xmax = xid de la transacción que lo tomó. Es la misma
      // fila que una segunda transacción concurrente tendría que esperar.
      const locks = await db.transaction(async (tx: Transaction) => {
        await actuarComo(tx, "authenticated", LIBRE_1);
        await tx.query(`SELECT * FROM public.reservar_clase('${clase}')`);
        await tx.query(`RESET ROLE`);
        const r = await tx.query<{ clase: boolean; contratacion: boolean }>(
          `SELECT
             (SELECT xmax::text FROM public.clases WHERE id = '${clase}') = (txid_current() % 4294967296)::text AS clase,
             (SELECT xmax::text FROM public.contrataciones WHERE alumno_id = '${LIBRE_1}') = (txid_current() % 4294967296)::text AS contratacion`
        );
        return r.rows[0]!;
      });
      expect(locks).toEqual({ clase: true, contratacion: true });
    });

    // PGlite tiene una sola conexión: las dos reservas se serializan. La
    // exclusión mutua entre conexiones reales la garantiza el lock del test anterior.
    it("con un solo lugar libre, de dos alumnos exactamente uno prospera y el cupo nunca se excede", async () => {
      const clase = await crearClase(enSemana(0.45), 2);
      await reservar(LIBRE_1, clase);
      const resultados = await Promise.allSettled([reservar(LIBRE_2, clase), reservar(LIBRE_3, clase)]);
      const ok = resultados.filter((r) => r.status === "fulfilled");
      const ko = resultados.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(ok).toHaveLength(1);
      expect(ko).toHaveLength(1);
      expect(ko[0]!.reason).toMatchObject({ code: "GZ001" });
      expect(
        await contar(`SELECT count(*)::int AS n FROM public.reservas WHERE clase_id = '${clase}' AND estado = 'ANOTADO'`)
      ).toBe(2);
    });
  });

  describe("semana en curso (lunes a domingo, hora argentina)", () => {
    it("el domingo 23:59 argentino es semana en curso; el lunes 00:00 es la semana próxima", async () => {
      // Domingo 23:59 ART = lunes 02:59 UTC: una ventana calculada en UTC lo rechazaría.
      const domingo = await crearClase(`${FIN_SEMANA} - interval '1 minute'`);
      const lunes = await crearClase(FIN_SEMANA);
      expect((await reservar(LIBRE_2, domingo)).reserva_id).toBeTruthy();
      await expect(reservar(LIBRE_2, lunes)).rejects.toMatchObject({ code: "GZ005" });
    });

    it("las reservas de la semana anterior no consumen el límite de esta semana", async () => {
      const pasada = await crearClase(`${LUNES} - interval '2 days'`);
      const pasada2 = await crearClase(`${LUNES} - interval '1 day'`);
      await db.query(
        `INSERT INTO public.reservas (clase_id, alumno_id, estado) VALUES
         ('${pasada}', '${DOS}', 'AUSENTE'), ('${pasada2}', '${DOS}', 'ANOTADO')`
      );
      await reservar(DOS, await crearClase(enSemana(0.6)));
      await reservar(DOS, await crearClase(enSemana(0.65)));
      await expect(reservar(DOS, await crearClase(enSemana(0.7)))).rejects.toMatchObject({ code: "GZ002" });
    });
  });

  describe("autorización de profesores", () => {
    it("un entrenador no asignado no puede autoasignarse a la clase de otro profesor", async () => {
      const clase = await crearClase(enSemana(0.8), null, [COACH]);
      await expect(
        como(
          "authenticated",
          OTRO_COACH,
          `INSERT INTO public.clases_profesores (clase_id, profesor_id) VALUES ('${clase}', '${OTRO_COACH}')`
        )
      ).rejects.toThrow(/row-level security|permission denied/);
    });

    it("un entrenador no asignado no puede quitar al profesor asignado", async () => {
      const clase = await crearClase(enSemana(0.8), null, [COACH]);
      await como("authenticated", OTRO_COACH, `DELETE FROM public.clases_profesores WHERE clase_id = '${clase}'`).catch(
        () => undefined
      );
      expect(
        await contar(`SELECT count(*)::int AS n FROM public.clases_profesores WHERE clase_id = '${clase}'`)
      ).toBe(1);
    });

    it("ADMIN asigna profesores a una clase", async () => {
      const clase = await crearClase(enSemana(0.8), null, []);
      await como(
        "authenticated",
        ADMIN,
        `INSERT INTO public.clases_profesores (clase_id, profesor_id) VALUES ('${clase}', '${OTRO_COACH}')`
      );
      expect(
        await contar(`SELECT count(*)::int AS n FROM public.clases_profesores WHERE clase_id = '${clase}'`)
      ).toBe(1);
    });
  });
});
