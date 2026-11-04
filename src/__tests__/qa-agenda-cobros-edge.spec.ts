import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// GOZS-185 (QA): casos límite de cobros, veces por semana, pase libre, cupo flexible y RLS.
// Complementa agenda-cobros-coach.spec.ts sobre la misma migración, en Postgres real (PGlite).

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

const COACH_A = "00000000-0000-0000-0000-0000000000a1";
const COACH_B = "00000000-0000-0000-0000-0000000000b1";
const ALU_2X = "00000000-0000-0000-0000-0000000000a2"; // 2 clases/semana, solo FUNCIONAL
const ALU_LIBRE = "00000000-0000-0000-0000-0000000000a3"; // pase libre
const ALU_B = "00000000-0000-0000-0000-0000000000b2";
const PLAN_2X = "20000000-0000-0000-0000-0000000000a1";
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
    ('${ALU_2X}','a2@t'),('${ALU_LIBRE}','al@t'),('${ALU_B}','b@t');
  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${COACH_A}','ca@t','Coach A','ENTRENADOR',NULL,'ACTIVA'),
    ('${COACH_B}','cb@t','Coach B','ENTRENADOR',NULL,'ACTIVA'),
    ('${ALU_2X}','a2@t','Alumno 2x','ALUMNO','${COACH_A}','ACTIVA'),
    ('${ALU_LIBRE}','al@t','Alumno libre','ALUMNO','${COACH_A}','ACTIVA'),
    ('${ALU_B}','b@t','Alumno B','ALUMNO','${COACH_B}','ACTIVA');
  INSERT INTO public.planes_membresia (id, nombre, limite_semanal, cantidad_actividades, duracion_meses, precio) VALUES
    ('${PLAN_2X}','2 por semana',2,1,1,20000),
    ('${PLAN_LIBRE}','Pase libre',NULL,2,1,35000);
  INSERT INTO public.contrataciones
    (alumno_id, tipo_servicio, dia_vencimiento, fecha_inicio, fecha_fin, estado, plan_membresia_id, actividad, precio_pactado) VALUES
    ('${ALU_2X}','PRESENCIAL',5,CURRENT_DATE - 10,CURRENT_DATE + 400,'VIGENTE','${PLAN_2X}','FUNCIONAL',20000),
    ('${ALU_LIBRE}','PRESENCIAL',5,CURRENT_DATE - 10,CURRENT_DATE + 400,'VIGENTE','${PLAN_LIBRE}',NULL,35000),
    ('${ALU_B}','PRESENCIAL',5,CURRENT_DATE - 10,CURRENT_DATE + 400,'VIGENTE','${PLAN_LIBRE}',NULL,30000);
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

async function crearClase(
  actividad: "FUNCIONAL" | "BOXEO",
  inicio: string,
  capacidad: number | null = null,
  estado: "PROGRAMADA" | "CANCELADA" = "PROGRAMADA"
) {
  const r = await db.query<{ id: string }>(
    `INSERT INTO public.clases (actividad, inicio, duracion_minutos, capacidad, estado)
     VALUES ('${actividad}', ${inicio}, 60, ${capacidad ?? "NULL"}, '${estado}') RETURNING id`
  );
  return r.rows[0]!.id;
}

async function crearCobro(alumno: string, monto: number, venceEnDias: number, periodo: string) {
  const r = await db.query<{ id: string }>(
    `INSERT INTO public.cobros (contratacion_id, alumno_id, periodo, monto, fecha_vencimiento)
     SELECT id, alumno_id, '${periodo}', ${monto}, CURRENT_DATE + ${venceEnDias}
     FROM public.contrataciones WHERE alumno_id = '${alumno}' RETURNING id`
  );
  return r.rows[0]!.id;
}

const anotar = (sub: string | null, clase: string, alumno: string) =>
  como<{ reserva_id: string; sobrecupo: boolean; aviso: string | null }>(
    sub ? "authenticated" : "anon",
    sub,
    `SELECT * FROM public.anotar_alumno('${clase}', '${alumno}')`
  );

const pagar = (sub: string, cobro: string, monto: string, metodo: string) =>
  como<{ estado: string }>(
    "authenticated",
    sub,
    `SELECT * FROM public.registrar_pago('${cobro}', ${monto}, ${metodo})`
  );

describe("GOZS-185 QA: casos límite de agenda y cobros (PGlite)", () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(SUPABASE_STUBS);
    const archivos = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const archivo of archivos) {
      await aplicarMigracion(fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), "utf-8"));
    }
    await db.exec(SEED);
  }, 60_000);

  describe("veces por semana vs pase libre", () => {
    it("plan 2x: anota 2 clases de la misma semana y rechaza la 3ra (GZ002)", async () => {
      // 20 días adelante, a mediodía de gimnasio: las 3 clases caen el mismo día (misma semana)
      const base = `date_trunc('day', now() + interval '20 days') + interval '15 hours'`;
      const c = [
        await crearClase("FUNCIONAL", base),
        await crearClase("FUNCIONAL", `${base} + interval '2 hours'`),
        await crearClase("FUNCIONAL", `${base} + interval '4 hours'`),
      ];
      await anotar(COACH_A, c[0]!, ALU_2X);
      await anotar(COACH_A, c[1]!, ALU_2X);
      await expect(anotar(COACH_A, c[2]!, ALU_2X)).rejects.toMatchObject({ code: "GZ002" });
    });

    it("el límite se reinicia en otra semana (+7 días vuelve a permitir)", async () => {
      const otraSemana = await crearClase(
        "FUNCIONAL",
        `date_trunc('day', now() + interval '27 days') + interval '15 hours'`
      );
      const r = await anotar(COACH_A, otraSemana, ALU_2X);
      expect(r.rows[0]!.reserva_id).toBeTruthy();
    });

    it("una reserva CANCELADA no consume cupo semanal del alumno", async () => {
      const base = `date_trunc('day', now() + interval '60 days') + interval '15 hours'`;
      const a = await crearClase("FUNCIONAL", base);
      const b = await crearClase("FUNCIONAL", `${base} + interval '2 hours'`);
      const c = await crearClase("FUNCIONAL", `${base} + interval '4 hours'`);
      const ra = await anotar(COACH_A, a, ALU_2X);
      await anotar(COACH_A, b, ALU_2X);
      await db.query(`UPDATE public.reservas SET estado = 'CANCELADO' WHERE id = '${ra.rows[0]!.reserva_id}'`);
      const r = await anotar(COACH_A, c, ALU_2X);
      expect(r.rows[0]!.reserva_id).toBeTruthy();
    });

    it("pase libre: sin límite semanal y cubre FUNCIONAL y BOXEO", async () => {
      const base = `date_trunc('day', now() + interval '90 days') + interval '8 hours'`;
      for (let i = 0; i < 6; i++) {
        const act = i % 2 === 0 ? "FUNCIONAL" : "BOXEO";
        const id = await crearClase(act, `${base} + interval '${i} hours'`);
        const r = await anotar(COACH_A, id, ALU_LIBRE);
        expect(r.rows[0]!.reserva_id).toBeTruthy();
      }
    });

    it("rechaza anotar dos veces al mismo alumno en la misma clase (GZ008)", async () => {
      const id = await crearClase("BOXEO", "now() + interval '120 days'");
      await anotar(COACH_A, id, ALU_LIBRE);
      await expect(anotar(COACH_A, id, ALU_LIBRE)).rejects.toMatchObject({ code: "GZ008" });
    });

    it("plan de una sola actividad rechaza otra actividad (GZ003)", async () => {
      const id = await crearClase("BOXEO", "now() + interval '121 days'");
      await expect(anotar(COACH_A, id, ALU_2X)).rejects.toMatchObject({ code: "GZ003" });
    });
  });

  describe("estado de la clase y autenticación", () => {
    it("clase cancelada (GZ007) y clase ya iniciada (GZ006) no admiten anotados", async () => {
      const cancelada = await crearClase("BOXEO", "now() + interval '3 days'", null, "CANCELADA");
      const pasada = await crearClase("BOXEO", "now() - interval '1 hour'");
      await expect(anotar(COACH_A, cancelada, ALU_LIBRE)).rejects.toMatchObject({ code: "GZ007" });
      await expect(anotar(COACH_A, pasada, ALU_LIBRE)).rejects.toMatchObject({ code: "GZ006" });
    });

    it("clase inexistente devuelve P0002", async () => {
      await expect(
        anotar(COACH_A, "99999999-9999-9999-9999-999999999999", ALU_LIBRE)
      ).rejects.toMatchObject({ code: "P0002" });
    });

    it("sin sesión (anon) no puede anotar", async () => {
      const id = await crearClase("BOXEO", "now() + interval '130 days'");
      await expect(anotar(null, id, ALU_LIBRE)).rejects.toThrow();
    });
  });

  describe("cupo flexible", () => {
    it("capacidad 1: el 2do alumno entra con sobrecupo y aviso, sin bloquear", async () => {
      const id = await crearClase("BOXEO", "now() + interval '140 days'", 1);
      const p = await anotar(COACH_A, id, ALU_LIBRE);
      expect(p.rows[0]!.sobrecupo).toBe(false);
      expect(p.rows[0]!.aviso).toBeNull();
      const q = await anotar(COACH_B, id, ALU_B);
      expect(q.rows[0]!.sobrecupo).toBe(true);
      expect(q.rows[0]!.aviso).toContain("sobrecupo: 2/1");
    });

    it("capacidad NULL (sin cupo definido) nunca marca sobrecupo", async () => {
      const id = await crearClase("FUNCIONAL", "now() + interval '150 days'", null);
      await anotar(COACH_A, id, ALU_LIBRE);
      const q = await anotar(COACH_B, id, ALU_B);
      expect(q.rows[0]!.sobrecupo).toBe(false);
    });

    it("capacidad 0 o negativa es rechazada por el esquema", async () => {
      await expect(crearClase("BOXEO", "now() + interval '160 days'", 0)).rejects.toThrow();
      await expect(crearClase("BOXEO", "now() + interval '160 days'", -3)).rejects.toThrow();
    });
  });

  describe("registrar_pago: casos límite", () => {
    it("monto 0, negativo, NULL o menor al cobro se rechaza (22023) y el cobro sigue impago", async () => {
      const cobro = await crearCobro(ALU_2X, 20000, 5, "2030-01-01");
      for (const monto of ["0", "-100", "NULL", "19999.99"]) {
        await expect(pagar(COACH_A, cobro, monto, "'EFECTIVO'")).rejects.toMatchObject({ code: "22023" });
      }
      const e = await db.query<{ estado: string }>(`SELECT estado FROM public.cobros WHERE id = '${cobro}'`);
      expect(e.rows[0]!.estado).toBe("PENDIENTE");
      const n = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.pagos WHERE cobro_id = '${cobro}'`);
      expect(n.rows[0]!.n).toBe(0);
    });

    it("método NULL, en minúscula o desconocido se rechaza (22023)", async () => {
      const cobro = await crearCobro(ALU_2X, 20000, 5, "2030-02-01");
      for (const metodo of ["NULL", "'efectivo'", "'TARJETA'", "''"]) {
        await expect(pagar(COACH_A, cobro, "20000", metodo)).rejects.toMatchObject({ code: "22023" });
      }
    });

    it("pago exacto por TRANSFERENCIA y por EFECTIVO deja el cobro PAGADO con confirmado_por", async () => {
      const t = await crearCobro(ALU_2X, 20000, 5, "2030-03-01");
      const e = await crearCobro(ALU_LIBRE, 35000, 5, "2030-03-01");
      expect((await pagar(COACH_A, t, "20000", "'TRANSFERENCIA'")).rows[0]!.estado).toBe("PAGADO");
      expect((await pagar(COACH_A, e, "35000", "'EFECTIVO'")).rows[0]!.estado).toBe("PAGADO");
      const p = await db.query<{ medio_pago: string; confirmado_por: string }>(
        `SELECT medio_pago, confirmado_por FROM public.pagos WHERE cobro_id IN ('${t}','${e}') ORDER BY medio_pago`
      );
      expect(p.rows.map((r) => r.medio_pago)).toEqual(["EFECTIVO", "TRANSFERENCIA"]);
      expect(p.rows.every((r) => r.confirmado_por === COACH_A)).toBe(true);
    });

    it("cobro inexistente devuelve P0002; segundo pago del mismo cobro devuelve GZ020", async () => {
      await expect(
        pagar(COACH_A, "99999999-9999-9999-9999-999999999999", "100", "'EFECTIVO'")
      ).rejects.toMatchObject({ code: "P0002" });
      const cobro = await crearCobro(ALU_2X, 20000, 5, "2030-04-01");
      await pagar(COACH_A, cobro, "20000", "'EFECTIVO'");
      await expect(pagar(COACH_A, cobro, "20000", "'EFECTIVO'")).rejects.toMatchObject({ code: "GZ020" });
    });

    it("un alumno no puede pagarse su propio cobro ni el coach B el del coach A (42501)", async () => {
      const cobro = await crearCobro(ALU_2X, 20000, 5, "2030-05-01");
      await expect(pagar(ALU_2X, cobro, "20000", "'EFECTIVO'")).rejects.toMatchObject({ code: "42501" });
      await expect(pagar(COACH_B, cobro, "20000", "'EFECTIVO'")).rejects.toMatchObject({ code: "42501" });
    });
  });

  describe("integridad de cobros y métricas", () => {
    it("rechaza monto negativo, período que no es día 1 y cobro duplicado del mismo período", async () => {
      const ins = (periodo: string, monto: number) =>
        db.query(
          `INSERT INTO public.cobros (contratacion_id, alumno_id, periodo, monto, fecha_vencimiento)
           SELECT id, alumno_id, '${periodo}', ${monto}, CURRENT_DATE FROM public.contrataciones WHERE alumno_id = '${ALU_B}'`
        );
      await expect(ins("2031-01-01", -1)).rejects.toThrow();
      await expect(ins("2031-01-15", 100)).rejects.toThrow();
      await ins("2031-02-01", 100);
      await expect(ins("2031-02-01", 100)).rejects.toThrow();
    });

    it("v_morosos excluye cobros pagados y los que vencen hoy o después", async () => {
      const futuro = await crearCobro(ALU_2X, 1, 3, "2032-01-01");
      const hoy = await crearCobro(ALU_2X, 1, 0, "2032-02-01");
      const atrasadoPagado = await crearCobro(ALU_2X, 1, -9, "2032-03-01");
      await pagar(COACH_A, atrasadoPagado, "1", "'EFECTIVO'");
      const m = await como<{ cobro_id: string }>("authenticated", COACH_A, `SELECT cobro_id FROM public.v_morosos`);
      const ids = m.rows.map((r) => r.cobro_id);
      expect(ids).not.toContain(futuro);
      expect(ids).not.toContain(hoy);
      expect(ids).not.toContain(atrasadoPagado);
    });

    it("ingresos_mes: mes sin pagos suma 0 y el mes actual coincide con la suma de pagos del coach", async () => {
      const vacio = await como<{ t: string }>(
        "authenticated", COACH_A, `SELECT public.ingresos_mes('2000-01-01')::text AS t`
      );
      expect(Number(vacio.rows[0]!.t)).toBe(0);
      const hoy = await como<{ t: string }>("authenticated", COACH_A, `SELECT public.ingresos_mes()::text AS t`);
      const sumaDirecta = await db.query<{ t: string }>(
        `SELECT COALESCE(sum(p.monto),0)::text AS t FROM public.pagos p
         JOIN public.perfiles pe ON pe.id = p.alumno_id
         WHERE pe.profesor_asignado_id = '${COACH_A}' AND p.estado = 'CONFIRMADO'`
      );
      expect(Number(hoy.rows[0]!.t)).toBe(Number(sumaDirecta.rows[0]!.t));
    });
  });

  describe("RLS coach/alumno", () => {
    it("el alumno B no ve cobros del alumno A y anon no ve nada", async () => {
      const b = await como<{ n: number }>(
        "authenticated", ALU_B,
        `SELECT count(*)::int AS n FROM public.cobros WHERE alumno_id = '${ALU_2X}'`
      );
      expect(b.rows[0]!.n).toBe(0);
      const anonRes = await como<{ n: number }>(
        "anon", null, `SELECT count(*)::int AS n FROM public.cobros`
      ).catch(() => ({ rows: [{ n: 0 }] }));
      expect(anonRes.rows[0]!.n).toBe(0);
    });

    it("el coach B no puede anotar alumnos del coach A (42501)", async () => {
      const id = await crearClase("BOXEO", "now() + interval '170 days'");
      await expect(anotar(COACH_B, id, ALU_LIBRE)).rejects.toMatchObject({ code: "42501" });
    });

    it("el alumno no puede marcar pagado su cobro ni insertar pagos directo", async () => {
      const cobro = await crearCobro(ALU_LIBRE, 35000, 5, "2033-01-01");
      await como("authenticated", ALU_LIBRE, `UPDATE public.cobros SET estado = 'PAGADO' WHERE id = '${cobro}'`).catch(
        () => undefined
      );
      const e = await db.query<{ estado: string }>(`SELECT estado FROM public.cobros WHERE id = '${cobro}'`);
      expect(e.rows[0]!.estado).toBe("PENDIENTE");
      await expect(
        como(
          "authenticated",
          ALU_LIBRE,
          `INSERT INTO public.pagos (contratacion_id, alumno_id, cobro_id, monto, medio_pago, estado, idempotency_key)
           SELECT contratacion_id, alumno_id, id, 35000, 'EFECTIVO', 'CONFIRMADO', 'x' FROM public.cobros WHERE id = '${cobro}'`
        )
      ).rejects.toThrow();
    });
  });
});
