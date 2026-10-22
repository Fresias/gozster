import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// Issue #113: membresías por frecuencia, clases presenciales y reservas.
// Migración probada sobre Postgres real (PGlite) con roles de Supabase simulados.
// Las clases se crean relativas a now() dentro de la semana en curso
// (lunes a domingo, America/Argentina/Buenos_Aires).

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const NEW_MIGRATION = "20261021150000_reglas_reservas_entrenador.sql";
const TZ = "America/Argentina/Buenos_Aires";

const ADMIN = "00000000-0000-0000-0000-0000000000ad";
const COACH = "00000000-0000-0000-0000-00000000c0ac";
const OTRO_COACH = "00000000-0000-0000-0000-0000000000c2";
const DOS_BOXEO = "00000000-0000-0000-0000-00000000000a";
const LIBRE = "00000000-0000-0000-0000-00000000000b";
const EN_PAUSA = "00000000-0000-0000-0000-00000000000c";
const VENCIDA = "00000000-0000-0000-0000-00000000000d";
const LIBRE_2 = "00000000-0000-0000-0000-00000000000e";
const RENUEVA = "00000000-0000-0000-0000-000000000010";
const VENCIDA_SIN_BATCH = "00000000-0000-0000-0000-000000000011";
const PENDIENTE_RENOV = "00000000-0000-0000-0000-000000000012";
const FUTURA = "00000000-0000-0000-0000-000000000013";
const SIN_PLAN = "00000000-0000-0000-0000-00000000000f";

const PLAN_2_1 = "20000000-0000-0000-0000-000000000001";
const PLAN_LIBRE = "20000000-0000-0000-0000-000000000002";

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
    ('${ADMIN}','admin@t'),('${COACH}','coach@t'),('${OTRO_COACH}','c2@t'),
    ('${DOS_BOXEO}','a@t'),('${LIBRE}','b@t'),('${EN_PAUSA}','c@t'),
    ('${VENCIDA}','d@t'),('${LIBRE_2}','e@t'),('${SIN_PLAN}','f@t'),
    ('${RENUEVA}','g@t'),('${VENCIDA_SIN_BATCH}','h@t'),
    ('${PENDIENTE_RENOV}','pend@t'),('${FUTURA}','futura@t');
  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${ADMIN}','admin@t','Admin','ADMIN',NULL,'ACTIVA'),
    ('${COACH}','coach@t','Coach','ENTRENADOR',NULL,'ACTIVA'),
    ('${OTRO_COACH}','c2@t','Otro coach','ENTRENADOR',NULL,'ACTIVA'),
    ('${DOS_BOXEO}','a@t','Dos Boxeo','ALUMNO','${COACH}','ACTIVA'),
    ('${LIBRE}','b@t','Libre','ALUMNO','${COACH}','ACTIVA'),
    ('${EN_PAUSA}','c@t','Pausa','ALUMNO','${COACH}','ACTIVA'),
    ('${VENCIDA}','d@t','Vencida','ALUMNO','${COACH}','ACTIVA'),
    ('${LIBRE_2}','e@t','Libre 2','ALUMNO','${COACH}','ACTIVA'),
    ('${SIN_PLAN}','f@t','Sin plan','ALUMNO','${COACH}','ACTIVA'),
    ('${RENUEVA}','g@t','Renueva','ALUMNO','${COACH}','ACTIVA'),
    ('${VENCIDA_SIN_BATCH}','h@t','Vencida sin batch','ALUMNO','${COACH}','ACTIVA'),
    ('${PENDIENTE_RENOV}','pend@t','Pendiente','ALUMNO','${COACH}','ACTIVA'),
    ('${FUTURA}','futura@t','Futura','ALUMNO','${COACH}','ACTIVA');
  INSERT INTO public.planes_membresia (id, nombre, limite_semanal, cantidad_actividades, duracion_meses, precio) VALUES
    ('${PLAN_2_1}','2 por semana',2,1,1,20000),
    ('${PLAN_LIBRE}','Pase libre',NULL,2,1,35000);
  INSERT INTO public.contrataciones
    (alumno_id, tipo_servicio, dia_vencimiento, fecha_inicio, fecha_fin, estado, plan_membresia_id, actividad) VALUES
    ('${DOS_BOXEO}','PRESENCIAL',5,CURRENT_DATE - 10,CURRENT_DATE + 30,'VIGENTE','${PLAN_2_1}','BOXEO'),
    ('${LIBRE}','PRESENCIAL',5,CURRENT_DATE - 10,CURRENT_DATE + 30,'POR_VENCER','${PLAN_LIBRE}',NULL),
    ('${EN_PAUSA}','PRESENCIAL',5,CURRENT_DATE - 10,CURRENT_DATE + 30,'EN_PAUSA','${PLAN_LIBRE}',NULL),
    ('${VENCIDA}','PRESENCIAL',5,CURRENT_DATE - 40,CURRENT_DATE - 10,'VENCIDA','${PLAN_LIBRE}',NULL),
    ('${LIBRE_2}','PRESENCIAL',5,CURRENT_DATE - 10,CURRENT_DATE + 30,'VIGENTE','${PLAN_LIBRE}',NULL),
    -- Vence el lunes de esta semana (hora argentina)
    ('${RENUEVA}','PRESENCIAL',5,CURRENT_DATE - 40,
      date_trunc('week', now() AT TIME ZONE '${TZ}')::date,'VIGENTE','${PLAN_LIBRE}',NULL),
    -- Venció ayer pero el batch todavía no la pasó a VENCIDA
    ('${VENCIDA_SIN_BATCH}','PRESENCIAL',5,CURRENT_DATE - 40,
      (now() AT TIME ZONE '${TZ}')::date - 1,'VIGENTE','${PLAN_LIBRE}',NULL),
    -- PENDIENTE_RENOVACION (puede reservar según regla GOZS-104)
    ('${PENDIENTE_RENOV}','PRESENCIAL',5,CURRENT_DATE - 10,CURRENT_DATE + 30,'PENDIENTE_RENOVACION','${PLAN_LIBRE}',NULL),
    -- Fecha de inicio futura (no puede reservar hasta que empiece)
    ('${FUTURA}','PRESENCIAL',5,CURRENT_DATE + 5,CURRENT_DATE + 35,'VIGENTE','${PLAN_LIBRE}',NULL),
    ('${SIN_PLAN}','ASESORIA_ONLINE',5,CURRENT_DATE - 10,CURRENT_DATE + 30,'VIGENTE',NULL,NULL);
`;

// Fin de la semana en curso (lunes 00:00 siguiente, hora argentina).
const FIN_SEMANA = `((date_trunc('week', now() AT TIME ZONE '${TZ}') + interval '7 days') AT TIME ZONE '${TZ}')`;
// Instante futuro dentro de la semana en curso, f ∈ (0, 1).
const enSemana = (f: number) => `now() + (${FIN_SEMANA} - now()) * ${f}`;
// Lunes de la semana en curso a las HH:00, hora argentina.
const LUNES = `(date_trunc('week', now() AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}')`;
const lunesMas = (horas: number) => `${LUNES} + interval '${horas} hours'`;

// Reloj de prueba: solo en esta base, reservar_clase resuelve now() en el
// esquema reloj, que devuelve test.ahora si está seteado. Permite fijar el
// "ahora" en un día de semana para casos imposibles un domingo.
const RELOJ = `
  CREATE SCHEMA reloj;
  CREATE FUNCTION reloj.now() RETURNS timestamptz LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('test.ahora', true), '')::timestamptz, pg_catalog.now()) $$;
  GRANT USAGE ON SCHEMA reloj TO authenticated;
  ALTER FUNCTION public.reservar_clase(UUID) SET search_path = reloj, pg_catalog, public;
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

function como<T>(rol: Rol, sub: string | null, sql: string, ahora?: string) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub ? { sub, role: rol } : { role: rol }),
    ]);
    if (ahora) await tx.query(`SELECT set_config('test.ahora', (${ahora})::text, true)`);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query<T>(sql);
  });
}

async function crearClase(
  actividad: "FUNCIONAL" | "BOXEO",
  inicio: string,
  capacidad: number | null = null,
  profesores: string[] = [COACH]
): Promise<string> {
  const r = await db.query<{ id: string }>(
    `INSERT INTO public.clases (actividad, inicio, duracion_minutos, capacidad)
     VALUES ('${actividad}', ${inicio}, 60, ${capacidad ?? "NULL"}) RETURNING id`
  );
  const id = r.rows[0]!.id;
  for (const p of profesores) {
    await db.query(`INSERT INTO public.clases_profesores (clase_id, profesor_id) VALUES ('${id}', '${p}')`);
  }
  return id;
}

async function reservar(alumno: string, claseId: string, ahora?: string) {
  const r = await como<{ reserva_id: string; aviso: string | null }>(
    "authenticated",
    alumno,
    `SELECT reserva_id, aviso FROM public.reservar_clase('${claseId}')`,
    ahora
  );
  return r.rows[0]!;
}

async function estadoReserva(id: string): Promise<string> {
  const r = await db.query<{ estado: string }>(`SELECT estado FROM public.reservas WHERE id = '${id}'`);
  return r.rows[0]!.estado;
}

const cancelarReserva = (sub: string, id: string) =>
  como("authenticated", sub, `SELECT * FROM public.cancelar_reserva('${id}')`);
const marcarAusente = (sub: string, id: string) =>
  como("authenticated", sub, `SELECT * FROM public.marcar_ausente('${id}')`);
const cancelarClase = (sub: string, id: string, motivo = "Feriado") =>
  como("authenticated", sub, `SELECT * FROM public.cancelar_clase('${id}', '${motivo}')`);

describe("Issue #113: membresías, clases y reservas (PGlite)", () => {
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
    await db.exec(RELOJ);
  }, 60_000);

  describe("esquema", () => {
    it("un plan de una sola actividad exige la actividad en la contratación", async () => {
      await expect(
        db.query(
          `INSERT INTO public.contrataciones (alumno_id, dia_vencimiento, fecha_inicio, fecha_fin, plan_membresia_id)
           VALUES ('${SIN_PLAN}', 5, CURRENT_DATE, CURRENT_DATE + 30, '${PLAN_2_1}')`
        )
      ).rejects.toMatchObject({ code: "23514" });
    });
  });

  describe("plan 2 por semana · Boxeo", () => {
    let b1: string, b2: string, b3: string, f1: string;
    let rB1: string, rB2: string, rB3: string;

    beforeAll(async () => {
      b1 = await crearClase("BOXEO", enSemana(0.2));
      b2 = await crearClase("BOXEO", enSemana(0.3));
      b3 = await crearClase("BOXEO", enSemana(0.4));
      f1 = await crearClase("FUNCIONAL", enSemana(0.5));
    });

    it("reserva dos clases (happy path) y rechaza la tercera por límite semanal", async () => {
      const r1 = await reservar(DOS_BOXEO, b1);
      const r2 = await reservar(DOS_BOXEO, b2);
      rB1 = r1.reserva_id;
      rB2 = r2.reserva_id;
      expect(r1.aviso).toBeNull();
      expect(await estadoReserva(rB1)).toBe("ANOTADO");
      await expect(reservar(DOS_BOXEO, b3)).rejects.toMatchObject({ code: "GZ002" });
    });

    it("rechaza una actividad no habilitada", async () => {
      await expect(reservar(DOS_BOXEO, f1)).rejects.toMatchObject({ code: "GZ003" });
    });

    it("rechaza anotarse dos veces en la misma clase", async () => {
      await expect(reservar(DOS_BOXEO, b1)).rejects.toMatchObject({ code: "GZ008" });
    });

    it("cancelar antes del inicio pasa a CANCELADO y libera el límite semanal", async () => {
      await cancelarReserva(DOS_BOXEO, rB2);
      expect(await estadoReserva(rB2)).toBe("CANCELADO");
      rB3 = (await reservar(DOS_BOXEO, b3)).reserva_id;
      expect(await estadoReserva(rB3)).toBe("ANOTADO");
    });

    it("cancelar una reserva ya cancelada se rechaza", async () => {
      await expect(cancelarReserva(DOS_BOXEO, rB2)).rejects.toMatchObject({ code: "GZ009" });
    });

    it("otro alumno no puede cancelar una reserva ajena (IDOR)", async () => {
      await expect(cancelarReserva(LIBRE, rB3)).rejects.toMatchObject({ code: "P0002" });
      expect(await estadoReserva(rB3)).toBe("ANOTADO");
    });

    it("solo un profesor de la clase o ADMIN marca ausentes y solo después del inicio de la clase", async () => {
      await expect(marcarAusente(OTRO_COACH, rB1)).rejects.toMatchObject({ code: "42501" });
      await expect(marcarAusente(DOS_BOXEO, rB1)).rejects.toMatchObject({ code: "42501" });
      // Antes de que empiece la clase, marcar ausente se rechaza (GOZS-104)
      await expect(marcarAusente(COACH, rB1)).rejects.toMatchObject({
        code: "GZ006",
        message: expect.stringMatching(/todavía no comenzó/),
      });
      // Simulamos que la clase ya comenzó
      await db.query(`UPDATE public.clases SET inicio = now() - interval '10 minutes' WHERE id = '${b1}'`);
      await marcarAusente(COACH, rB1);
      expect(await estadoReserva(rB1)).toBe("AUSENTE");
      await expect(marcarAusente(ADMIN, rB1)).rejects.toMatchObject({ code: "GZ009" });
    });

    it("una ausencia sigue consumiendo el límite semanal", async () => {
      // B1 AUSENTE + B3 ANOTADO = 2
      await expect(reservar(DOS_BOXEO, b2)).rejects.toMatchObject({ code: "GZ002" });
    });

    it("una reserva AUSENTE no se puede cancelar", async () => {
      await expect(cancelarReserva(DOS_BOXEO, rB1)).rejects.toMatchObject({ code: "GZ009" });
    });

    it("solo un profesor de la clase o ADMIN la cancela; las reservas pasan a ANULADO y no consumen", async () => {
      await expect(cancelarClase(OTRO_COACH, b3)).rejects.toMatchObject({ code: "42501" });
      await expect(cancelarClase(DOS_BOXEO, b3)).rejects.toMatchObject({ code: "42501" });

      await cancelarClase(COACH, b3);
      expect(await estadoReserva(rB3)).toBe("ANULADO");
      const c = await db.query<{ estado: string; motivo_cancelacion: string }>(
        `SELECT estado, motivo_cancelacion FROM public.clases WHERE id = '${b3}'`
      );
      expect(c.rows[0]).toEqual({ estado: "CANCELADA", motivo_cancelacion: "Feriado" });

      // B1 AUSENTE + B3 ANULADO = 1: puede reservar otra
      await reservar(DOS_BOXEO, b2);
    });

    it("no se reserva una clase cancelada ni se cancela dos veces", async () => {
      await expect(reservar(LIBRE, b3)).rejects.toMatchObject({ code: "GZ007" });
      await expect(cancelarClase(ADMIN, b3)).rejects.toMatchObject({ code: "GZ007" });
      await expect(cancelarReserva(DOS_BOXEO, rB3)).rejects.toMatchObject({ code: "GZ009" });
    });

    it("ADMIN puede cancelar una clase sin estar asignado", async () => {
      const otra = await crearClase("BOXEO", enSemana(0.6), null, [OTRO_COACH]);
      await cancelarClase(ADMIN, otra);
      await expect(cancelarClase(COACH, otra)).rejects.toMatchObject({ code: "42501" });
    });
  });

  describe("pase libre y cupo", () => {
    it("acepta 6 clases de Funcional y Boxeo en la semana", async () => {
      for (let i = 0; i < 6; i++) {
        const clase = await crearClase(i % 2 ? "BOXEO" : "FUNCIONAL", enSemana(0.1 + i * 0.1), 10);
        const r = await reservar(LIBRE, clase);
        expect(r.aviso).toBeNull();
      }
    });

    it("una clase llena responde sin cupo", async () => {
      const clase = await crearClase("FUNCIONAL", enSemana(0.45), 1);
      await reservar(LIBRE, clase);
      await expect(reservar(LIBRE_2, clase)).rejects.toMatchObject({ code: "GZ001", message: "Sin cupo" });
    });

    it("cancelar libera el cupo para otro alumno", async () => {
      const clase = await crearClase("BOXEO", enSemana(0.55), 1);
      const r = await reservar(LIBRE, clase);
      await cancelarReserva(LIBRE, r.reserva_id);
      await reservar(LIBRE_2, clase);
    });
  });

  describe("membresía y ventana de reserva", () => {
    it("POR_VENCER reserva normalmente", async () => {
      const clase = await crearClase("FUNCIONAL", enSemana(0.65));
      const r = await reservar(LIBRE, clase);
      expect(r.aviso).toBeNull();
    });

    it("avisa cuando la membresía vence antes de la clase", async () => {
      // Hoy = lunes 10:00, la membresía vence el lunes, la clase es el miércoles
      const clase = await crearClase("BOXEO", lunesMas(2 * 24 + 10));
      const r = await reservar(RENUEVA, clase, lunesMas(10));
      expect(r.reserva_id).toBeTruthy();
      expect(r.aviso).toMatch(/otro período/);
    });

    it("sin aviso cuando la membresía vence el mismo día de la clase", async () => {
      const clase = await crearClase("FUNCIONAL", lunesMas(19));
      const r = await reservar(RENUEVA, clase, lunesMas(10));
      expect(r.aviso).toBeNull();
    });

    it("fecha_fin ya pasada rechaza aunque el batch no la haya marcado VENCIDA", async () => {
      const clase = await crearClase("FUNCIONAL", enSemana(0.72));
      await expect(reservar(VENCIDA_SIN_BATCH, clase)).rejects.toMatchObject({
        code: "GZ004",
        message: expect.stringMatching(/venció/),
      });
    });

    it("EN_PAUSA, VENCIDA y sin membresía se rechazan", async () => {
      const clase = await crearClase("FUNCIONAL", enSemana(0.75));
      await expect(reservar(EN_PAUSA, clase)).rejects.toMatchObject({ code: "GZ004" });
      await expect(reservar(VENCIDA, clase)).rejects.toMatchObject({ code: "GZ004" });
      await expect(reservar(SIN_PLAN, clase)).rejects.toMatchObject({ code: "GZ004" });
    });

    it("PENDIENTE_RENOVACION puede reservar normalmente (GOZS-104)", async () => {
      const clase = await crearClase("FUNCIONAL", enSemana(0.73));
      const res = await reservar(PENDIENTE_RENOV, clase);
      expect(res.reserva_id).toBeTruthy();
      expect(await estadoReserva(res.reserva_id)).toBe("ANOTADO");
    });

    it("alumno con contratación en curso y otra futura puede reservar (GOZS-104)", async () => {
      // LIBRE_2 ya tiene una contratación VIGENTE en curso (fecha_inicio -10, fecha_fin +30).
      // Al agregarle una VIGENTE futura, el ORDER BY de reservar_clase debe priorizar la
      // vigente en curso; si se revierte el orden, elige la futura y responde GZ004.
      await db.exec(
        `INSERT INTO public.contrataciones (alumno_id, tipo_servicio, dia_vencimiento, fecha_inicio, fecha_fin, estado, plan_membresia_id, actividad)
         VALUES ('${LIBRE_2}','PRESENCIAL',5,CURRENT_DATE + 20, CURRENT_DATE + 50,'VIGENTE','${PLAN_LIBRE}',NULL)`
      );
      const clase = await crearClase("FUNCIONAL", enSemana(0.92));
      const res = await reservar(LIBRE_2, clase);
      expect(res.reserva_id).toBeTruthy();
      expect(await estadoReserva(res.reserva_id)).toBe("ANOTADO");
    });

    it("contratación con fecha_inicio futura se rechaza (GOZS-104)", async () => {
      const clase = await crearClase("FUNCIONAL", enSemana(0.74));
      await expect(reservar(FUTURA, clase)).rejects.toMatchObject({
        code: "GZ004",
        message: expect.stringMatching(/todavía no podés reservar/),
      });
    });

    it("una clase de la semana próxima se rechaza", async () => {
      const clase = await crearClase("FUNCIONAL", `${FIN_SEMANA} + interval '1 hour'`);
      await expect(reservar(LIBRE, clase)).rejects.toMatchObject({ code: "GZ005" });
    });

    it("una clase que ya comenzó no se reserva ni se cancela", async () => {
      const clase = await crearClase("FUNCIONAL", `now() - interval '1 minute'`);
      await expect(reservar(LIBRE, clase)).rejects.toMatchObject({ code: "GZ006" });

      const r = await db.query<{ id: string }>(
        `INSERT INTO public.reservas (clase_id, alumno_id) VALUES ('${clase}', '${LIBRE}') RETURNING id`
      );
      await expect(cancelarReserva(LIBRE, r.rows[0]!.id)).rejects.toMatchObject({ code: "GZ006" });
    });

    it("una clase inexistente devuelve no encontrada", async () => {
      await expect(
        reservar(LIBRE, "30000000-0000-0000-0000-000000000000")
      ).rejects.toMatchObject({ code: "P0002" });
    });

    it("anon no puede ejecutar las RPC", async () => {
      const clase = await crearClase("FUNCIONAL", enSemana(0.8));
      await expect(
        como("anon", null, `SELECT * FROM public.reservar_clase('${clase}')`)
      ).rejects.toThrow(/permission denied/);
    });
  });

  describe("RLS", () => {
    it("un entrenador no puede asignarse a una clase; un admin sí", async () => {
      const clase = await crearClase("BOXEO", enSemana(0.88), null, [OTRO_COACH]);
      await expect(
        como("authenticated", COACH, `INSERT INTO public.clases_profesores (clase_id, profesor_id) VALUES ('${clase}', '${COACH}')`)
      ).rejects.toThrow(/row-level security/);
      await expect(cancelarClase(COACH, clase)).rejects.toMatchObject({ code: "42501" });
      await expect(
        como("authenticated", OTRO_COACH, `DELETE FROM public.clases_profesores WHERE clase_id = '${clase}' RETURNING 1`)
      ).resolves.toMatchObject({ rows: [] });

      await como("authenticated", ADMIN, `INSERT INTO public.clases_profesores (clase_id, profesor_id) VALUES ('${clase}', '${COACH}')`);
      await cancelarClase(COACH, clase);
    });

    it("el alumno solo ve sus reservas; el staff ve todas", async () => {
      const propias = await como<{ alumno_id: string }>("authenticated", DOS_BOXEO, `SELECT alumno_id FROM public.reservas`);
      expect(propias.rows.length).toBeGreaterThan(0);
      expect(propias.rows.every((r) => r.alumno_id === DOS_BOXEO)).toBe(true);

      const ajenas = await como("authenticated", LIBRE, `SELECT 1 FROM public.reservas WHERE alumno_id = '${DOS_BOXEO}'`);
      expect(ajenas.rows).toHaveLength(0);

      const staff = await como<{ n: number }>(
        "authenticated",
        COACH,
        `SELECT count(DISTINCT alumno_id)::int AS n FROM public.reservas`
      );
      expect(staff.rows[0]!.n).toBeGreaterThan(1);

      const anon = await como("anon", null, `SELECT 1 FROM public.reservas`);
      expect(anon.rows).toHaveLength(0);
    });

    it("nadie escribe reservas directamente (solo vía RPC)", async () => {
      const clase = await crearClase("FUNCIONAL", enSemana(0.85));
      await expect(
        como("authenticated", LIBRE, `INSERT INTO public.reservas (clase_id, alumno_id) VALUES ('${clase}', '${LIBRE}')`)
      ).rejects.toThrow(/permission denied/);
      await expect(
        como("authenticated", COACH, `UPDATE public.reservas SET estado = 'AUSENTE'`)
      ).rejects.toThrow(/permission denied/);
    });

    it("el catálogo es de lectura para alumnos y de escritura para el staff", async () => {
      const visibles = await como("authenticated", LIBRE, `SELECT 1 FROM public.clases`);
      expect(visibles.rows.length).toBeGreaterThan(0);
      await expect(
        como("authenticated", LIBRE, `INSERT INTO public.planes_membresia (nombre, cantidad_actividades, duracion_meses, precio) VALUES ('x', 2, 1, 1)`)
      ).rejects.toThrow(/row-level security/);
      const anon = await como("anon", null, `SELECT 1 FROM public.clases`);
      expect(anon.rows).toHaveLength(0);
    });

    it("el staff no cambia el estado de una clase sin cancelar_clase", async () => {
      const clase = await crearClase("BOXEO", enSemana(0.9));
      await como("authenticated", COACH, `UPDATE public.clases SET capacidad = 20 WHERE id = '${clase}'`);
      await expect(
        como("authenticated", COACH, `UPDATE public.clases SET estado = 'CANCELADA' WHERE id = '${clase}'`)
      ).rejects.toMatchObject({ code: "42501" });
    });

    it("solo el profesor asignado o ADMIN pueden cambiar inicio y capacidad de una clase (GOZS-104)", async () => {
      const clase = await crearClase("BOXEO", enSemana(0.85), 10, [COACH]);

      // Un coach no asignado no puede cambiar inicio ni capacidad
      await expect(
        como("authenticated", OTRO_COACH, `UPDATE public.clases SET capacidad = 20 WHERE id = '${clase}'`)
      ).rejects.toMatchObject({ code: "42501" });

      await expect(
        como("authenticated", OTRO_COACH, `UPDATE public.clases SET inicio = ${enSemana(0.87)} WHERE id = '${clase}'`)
      ).rejects.toMatchObject({ code: "42501" });

      // El profesor asignado SÍ puede cambiar inicio y capacidad
      await como("authenticated", COACH, `UPDATE public.clases SET capacidad = 15 WHERE id = '${clase}'`);
      const c1 = await db.query<{ capacidad: number }>(`SELECT capacidad FROM public.clases WHERE id = '${clase}'`);
      expect(c1.rows[0]!.capacidad).toBe(15);

      // ADMIN también puede cambiar inicio y capacidad
      await como("authenticated", ADMIN, `UPDATE public.clases SET capacidad = 25 WHERE id = '${clase}'`);
      const c2 = await db.query<{ capacidad: number }>(`SELECT capacidad FROM public.clases WHERE id = '${clase}'`);
      expect(c2.rows[0]!.capacidad).toBe(25);
    });
  });
});
