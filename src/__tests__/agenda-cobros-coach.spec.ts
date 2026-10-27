import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// GOZS-186: cobros manuales, anotar_alumno (cupo flexible) y RLS por coach.
// Migración probada sobre Postgres real (PGlite) con roles de Supabase simulados.

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const NEW_MIGRATION = "20261027120000_agenda_cobros_coach.sql";

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

async function crearClase(actividad: "FUNCIONAL" | "BOXEO", inicio: string, capacidad: number | null = null) {
  const r = await db.query<{ id: string }>(
    `INSERT INTO public.clases (actividad, inicio, duracion_minutos, capacidad)
     VALUES ('${actividad}', ${inicio}, 60, ${capacidad ?? "NULL"}) RETURNING id`
  );
  return r.rows[0]!.id;
}

async function crearCobro(contratacionAlumno: string, monto: number, venceEnDias: number, periodo: string) {
  const r = await db.query<{ id: string }>(
    `INSERT INTO public.cobros (contratacion_id, alumno_id, periodo, monto, fecha_vencimiento)
     SELECT id, alumno_id, '${periodo}', ${monto}, CURRENT_DATE + ${venceEnDias}
     FROM public.contrataciones WHERE alumno_id = '${contratacionAlumno}' RETURNING id`
  );
  return r.rows[0]!.id;
}

const anotar = (sub: string, clase: string, alumno: string) =>
  como<{ reserva_id: string; sobrecupo: boolean; aviso: string | null }>(
    "authenticated",
    sub,
    `SELECT * FROM public.anotar_alumno('${clase}', '${alumno}')`
  );

describe("GOZS-186: cobros, anotar_alumno y RLS por coach (PGlite)", () => {
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

  describe("anotar_alumno", () => {
    it("rechaza un servicio no cubierto por la suscripción", async () => {
      const funcional = await crearClase("FUNCIONAL", "now() + interval '2 days'");
      await expect(anotar(COACH_A, funcional, ALU_A1)).rejects.toMatchObject({
        code: "GZ003",
        message: expect.stringContaining("no cubre el servicio FUNCIONAL"),
      });
    });

    it("anota y luego rechaza al superar las veces por semana", async () => {
      const b1 = await crearClase("BOXEO", "now() + interval '2 days'");
      const b2 = await crearClase("BOXEO", "now() + interval '2 days 1 hour'");
      const ok = await anotar(COACH_A, b1, ALU_A1);
      expect(ok.rows[0]!.sobrecupo).toBe(false);
      await expect(anotar(COACH_A, b2, ALU_A1)).rejects.toMatchObject({ code: "GZ002" });
    });

    it("superar el cupo NO bloquea: anota con advertencia sobrecupo", async () => {
      const clase = await crearClase("FUNCIONAL", "now() + interval '3 days'", 1);
      const primero = await anotar(COACH_A, clase, ALU_A2);
      expect(primero.rows[0]!.sobrecupo).toBe(false);
      // Segundo alumno del mismo coach: otro pase libre
      await db.query(`UPDATE public.perfiles SET profesor_asignado_id = '${COACH_A}' WHERE id = '${ALU_B}'`);
      const segundo = await anotar(COACH_A, clase, ALU_B);
      expect(segundo.rows[0]!.sobrecupo).toBe(true);
      expect(segundo.rows[0]!.aviso).toContain("sobrecupo");
      await db.query(`UPDATE public.perfiles SET profesor_asignado_id = '${COACH_B}' WHERE id = '${ALU_B}'`);
    });

    it("rechaza anotar al alumno de otro coach", async () => {
      const clase = await crearClase("FUNCIONAL", "now() + interval '4 days'");
      await expect(anotar(COACH_B, clase, ALU_A2)).rejects.toMatchObject({ code: "42501" });
    });

    it("el alumno no puede usarla sobre sí mismo", async () => {
      const clase = await crearClase("FUNCIONAL", "now() + interval '4 days'");
      await expect(anotar(ALU_A2, clase, ALU_A2)).rejects.toMatchObject({ code: "42501" });
    });
  });

  describe("registrar_pago", () => {
    it("marca el cobro como pagado y registra confirmado_por", async () => {
      const cobro = await crearCobro(ALU_A1, 14000, -3, "2026-10-01");
      const r = await como<{ estado: string }>(
        "authenticated",
        COACH_A,
        `SELECT * FROM public.registrar_pago('${cobro}', 14000, 'TRANSFERENCIA')`
      );
      expect(r.rows[0]!.estado).toBe("PAGADO");
      const pago = await db.query<{ confirmado_por: string; medio_pago: string; estado: string }>(
        `SELECT confirmado_por, medio_pago, estado FROM public.pagos WHERE cobro_id = '${cobro}'`
      );
      expect(pago.rows).toEqual([{ confirmado_por: COACH_A, medio_pago: "TRANSFERENCIA", estado: "CONFIRMADO" }]);
    });

    it("rechaza pagar dos veces, métodos inválidos, montos insuficientes y coach ajeno", async () => {
      const cobro = await crearCobro(ALU_A2, 30000, 5, "2026-11-01");
      await expect(
        como("authenticated", COACH_A, `SELECT * FROM public.registrar_pago('${cobro}', 30000, 'TARJETA')`)
      ).rejects.toMatchObject({ code: "22023" });
      await expect(
        como("authenticated", COACH_A, `SELECT * FROM public.registrar_pago('${cobro}', 100, 'EFECTIVO')`)
      ).rejects.toMatchObject({ code: "22023" });
      await expect(
        como("authenticated", COACH_B, `SELECT * FROM public.registrar_pago('${cobro}', 30000, 'EFECTIVO')`)
      ).rejects.toMatchObject({ code: "42501" });
      await como("authenticated", COACH_A, `SELECT * FROM public.registrar_pago('${cobro}', 30000, 'EFECTIVO')`);
      await expect(
        como("authenticated", COACH_A, `SELECT * FROM public.registrar_pago('${cobro}', 30000, 'EFECTIVO')`)
      ).rejects.toMatchObject({ code: "GZ020" });
    });

    it("el estado del cobro no se edita directo (solo vía RPC)", async () => {
      const cobro = await crearCobro(ALU_B, 30000, 5, "2026-12-01");
      await expect(
        como("authenticated", COACH_B, `UPDATE public.cobros SET estado = 'PAGADO' WHERE id = '${cobro}'`)
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  describe("RLS por coach", () => {
    it("coach B ve 0 filas de los alumnos del coach A", async () => {
      const ids = `('${ALU_A1}','${ALU_A2}')`;
      for (const tabla of ["cobros", "pagos", "contrataciones", "reservas"]) {
        const r = await como<{ n: string }>(
          "authenticated",
          COACH_B,
          `SELECT count(*)::text AS n FROM public.${tabla} WHERE alumno_id IN ${ids}`
        );
        expect(r.rows[0]!.n, tabla).toBe("0");
      }
      const propios = await como<{ n: string }>(
        "authenticated",
        COACH_A,
        `SELECT count(*)::text AS n FROM public.cobros WHERE alumno_id IN ${ids}`
      );
      expect(Number(propios.rows[0]!.n)).toBeGreaterThan(0);
    });

    it("el alumno solo lee lo propio y no puede insertar cobros", async () => {
      const r = await como<{ n: string }>(
        "authenticated",
        ALU_A1,
        `SELECT count(*)::text AS n FROM public.cobros WHERE alumno_id <> '${ALU_A1}'`
      );
      expect(r.rows[0]!.n).toBe("0");
      await expect(
        como(
          "authenticated",
          ALU_A1,
          `INSERT INTO public.cobros (contratacion_id, alumno_id, periodo, monto, fecha_vencimiento)
           SELECT id, alumno_id, '2027-01-01', 1, CURRENT_DATE FROM public.contrataciones WHERE alumno_id = '${ALU_A1}'`
        )
      ).rejects.toMatchObject({ code: "42501" });
    });

    it("anon no accede a cobros", async () => {
      await expect(como("anon", null, `SELECT * FROM public.cobros`)).rejects.toMatchObject({ code: "42501" });
    });
  });

  describe("morosos e ingresos del mes", () => {
    it("v_morosos lista solo cobros vencidos impagos del coach", async () => {
      await crearCobro(ALU_A1, 14000, -5, "2027-02-01");
      const a = await como<{ alumno_id: string; dias_atraso: number }>(
        "authenticated",
        COACH_A,
        `SELECT alumno_id, dias_atraso FROM public.v_morosos`
      );
      expect(a.rows.length).toBe(1);
      expect(a.rows[0]!.alumno_id).toBe(ALU_A1);
      expect(Number(a.rows[0]!.dias_atraso)).toBeGreaterThanOrEqual(4);
      const b = await como("authenticated", COACH_B, `SELECT * FROM public.v_morosos`);
      expect(b.rows.length).toBe(0);
    });

    it("ingresos_mes suma pagos confirmados del mes, acotado por coach", async () => {
      const a = await como<{ t: string }>("authenticated", COACH_A, `SELECT public.ingresos_mes()::text AS t`);
      expect(Number(a.rows[0]!.t)).toBe(44000);
      const b = await como<{ t: string }>("authenticated", COACH_B, `SELECT public.ingresos_mes()::text AS t`);
      expect(Number(b.rows[0]!.t)).toBe(0);
    });
  });
});
