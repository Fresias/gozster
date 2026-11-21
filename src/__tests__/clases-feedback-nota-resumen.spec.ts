import { describe, it, expect, beforeAll } from "vitest";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { crearDbMigrada } from "./helpers/pglite-migrada";
import {
  actualizarNotaClase,
  guardarFeedbackClase,
  obtenerFeedbackDeReservas,
  obtenerResumenClasesAlumno,
} from "@/lib/clases";

const TZ = "America/Argentina/Buenos_Aires";

const ADMIN = "00000000-0000-0000-0000-0000000003ad";
const COACH = "00000000-0000-0000-0000-0000000003c0";
const ALUMNA_3X = "00000000-0000-0000-0000-00000000030a";
const ALUMNA_LIBRE = "00000000-0000-0000-0000-00000000030b";
const ALUMNA_ACT = "00000000-0000-0000-0000-00000000030c";

const PLAN_3X = "20000000-0000-0000-0000-000000000301";
const PLAN_LIBRE = "20000000-0000-0000-0000-000000000302";

// Miércoles 2026-11-18 14:00:00 ART (semana 2026-11-16..2026-11-22)
const AHORA_FIJO = "2026-11-18T14:00:00-03:00";

type Rol = "anon" | "authenticated" | "service_role";

const SEED = `
  INSERT INTO auth.users (id, email) VALUES
    ('${ADMIN}','be-admin@t'),
    ('${COACH}','be-coach@t'),
    ('${ALUMNA_3X}','be-3x@t'),
    ('${ALUMNA_LIBRE}','be-libre@t'),
    ('${ALUMNA_ACT}','be-act@t');

  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${ADMIN}','be-admin@t','Admin','ADMIN',NULL,'ACTIVA'),
    ('${COACH}','be-coach@t','Coach','ENTRENADOR',NULL,'ACTIVA'),
    ('${ALUMNA_3X}','be-3x@t','Alumna 3x','ALUMNO','${COACH}','ACTIVA'),
    ('${ALUMNA_LIBRE}','be-libre@t','Alumna Libre','ALUMNO','${COACH}','ACTIVA'),
    ('${ALUMNA_ACT}','be-act@t','Alumna Act','ALUMNO','${COACH}','ACTIVA');

  INSERT INTO public.planes_membresia (id, nombre, limite_semanal, cantidad_actividades, duracion_meses, precio) VALUES
    ('${PLAN_3X}','3 por semana',3,1,1,25000),
    ('${PLAN_LIBRE}','Pase libre',NULL,2,1,35000);

  INSERT INTO public.contrataciones
    (alumno_id, tipo_servicio, dia_vencimiento, fecha_inicio, fecha_fin, estado, plan_membresia_id, actividad) VALUES
    ('${ALUMNA_3X}','PRESENCIAL',5,'2026-11-01','2026-12-31','VIGENTE','${PLAN_3X}','FUNCIONAL'),
    ('${ALUMNA_LIBRE}','PRESENCIAL',5,'2026-11-01','2026-12-31','VIGENTE','${PLAN_LIBRE}',NULL);

  INSERT INTO public.alumno_actividades (alumno_id, actividad, veces_por_semana, pase_libre) VALUES
    ('${ALUMNA_ACT}','BOXEO',2,false);
`;

const RELOJ = `
  CREATE SCHEMA IF NOT EXISTS reloj;
  CREATE OR REPLACE FUNCTION reloj.now() RETURNS timestamptz LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('test.ahora', true), '')::timestamptz, pg_catalog.now())
  $$;
  GRANT USAGE ON SCHEMA reloj TO authenticated;
  ALTER FUNCTION public.resumen_clases_alumno(DATE) SET search_path = reloj, pg_catalog, public;
`;

let db: PGlite;

function como<T>(rol: Rol, sub: string | null, sql: string, params: unknown[] = [], ahora?: string) {
  return db.transaction(async (tx: Transaction) => {
    if (ahora) await tx.query(`SELECT set_config('test.ahora', $1, true)`, [ahora]);
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub ? { sub, role: rol } : { role: rol }),
    ]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query<T>(sql, params);
  });
}

async function crearClase(opts: {
  actividad?: "FUNCIONAL" | "BOXEO";
  inicio: string;
  estado?: "PROGRAMADA" | "CANCELADA";
  nota?: string | null;
}) {
  const r = await db.query<{ id: string }>(
    `INSERT INTO public.clases (actividad, inicio, duracion_minutos, capacidad, estado, nota)
     VALUES ($1, $2::timestamptz, 60, 12, $3, $4)
     RETURNING id`,
    [opts.actividad ?? "FUNCIONAL", opts.inicio, opts.estado ?? "PROGRAMADA", opts.nota ?? null],
  );
  return r.rows[0]!.id;
}

async function crearReserva(
  claseId: string,
  alumnoId: string,
  estado: "ANOTADO" | "AUSENTE" | "CANCELADO" | "ANULADO" = "ANOTADO",
) {
  const r = await db.query<{ id: string }>(
    `INSERT INTO public.reservas (clase_id, alumno_id, estado)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [claseId, alumnoId, estado],
  );
  return r.rows[0]!.id;
}

interface ResumenRow {
  usadas_semana: number;
  limite_semanal: number | null;
  racha_semanas: number;
  asistencias: Array<{
    reserva_id: string;
    clase_id: string;
    actividad: "FUNCIONAL" | "BOXEO";
    inicio: string;
    sensacion: number | null;
    nota: string | null;
  }>;
}

async function resumenComo(alumnoId: string, desde: string | null = null, ahora = AHORA_FIJO) {
  const r = await como<ResumenRow>(
    "authenticated",
    alumnoId,
    `SELECT * FROM public.resumen_clases_alumno($1::date)`,
    [desde],
    ahora,
  );
  return r.rows[0]!;
}

describe("GOZS-663: feedback post-clase, nota de clase y resumen semanal (PGlite)", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
    await db.exec(SEED);
    await db.exec(RELOJ);
  }, 60_000);

  describe("esquema y firma de RPC", () => {
    it("resumen_clases_alumno es SECURITY INVOKER con search_path fijo y sin acceso anon", async () => {
      const r = await db.query<{ secdef: boolean; args: string[]; config: string[] }>(
        `SELECT prosecdef AS secdef,
                coalesce((proargnames)[1:pronargs], '{}') AS args,
                proconfig AS config
         FROM pg_proc
         WHERE pronamespace = 'public'::regnamespace AND proname = 'resumen_clases_alumno'`,
      );
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0]!.secdef).toBe(false);
      expect(r.rows[0]!.args).toEqual(["p_desde"]);
      expect(r.rows[0]!.config?.[0]).toContain("search_path=");

      await expect(
        como("anon", null, `SELECT * FROM public.resumen_clases_alumno()`),
      ).rejects.toMatchObject({ code: "42501" });
    });

    it("clases.nota rechaza más de 280 caracteres y acepta hasta 280", async () => {
      const cId = await crearClase({ inicio: "2026-11-18T10:00:00-03:00" });
      const ok280 = "a".repeat(280);
      await como("authenticated", COACH, `UPDATE public.clases SET nota = $1 WHERE id = $2`, [ok280, cId]);
      const checkOk = await db.query<{ nota: string }>(`SELECT nota FROM public.clases WHERE id = $1`, [cId]);
      expect(checkOk.rows[0]!.nota).toBe(ok280);

      await expect(
        como("authenticated", COACH, `UPDATE public.clases SET nota = $1 WHERE id = $2`, ["a".repeat(281), cId]),
      ).rejects.toMatchObject({ code: "23514" });
    });

    it("GIVEN un alumno WHEN intenta escribir clases.nota THEN RLS lo rechaza; un profesor sí puede", async () => {
      const cId = await crearClase({ inicio: "2026-10-18T11:00:00-03:00" });
      await crearReserva(cId, ALUMNA_3X, "ANOTADO");

      // RLS UPDATE sin policy para ALUMNO filtra la fila (0 rows updated) y mantiene nota = NULL
      const resAlumno = await como(
        "authenticated",
        ALUMNA_3X,
        `UPDATE public.clases SET nota = 'Intento alumno' WHERE id = $1 RETURNING id`,
        [cId],
      );
      expect(resAlumno.rows).toHaveLength(0);

      // Coach escribe la nota
      await como(
        "authenticated",
        COACH,
        `UPDATE public.clases SET nota = 'Hoy: circuito de piernas' WHERE id = $1`,
        [cId],
      );

      // Alumno con reserva puede leerla
      const lectura = await como<{ nota: string | null }>(
        "authenticated",
        ALUMNA_3X,
        `SELECT nota FROM public.clases WHERE id = $1`,
        [cId],
      );
      expect(lectura.rows[0]!.nota).toBe("Hoy: circuito de piernas");
    });
  });

  describe("resumen_clases_alumno: contador semanal, límite y racha por asistencia", () => {
    it("GIVEN alumna con 2 reservas ANOTADO pasadas esta semana y plan 3/semana THEN usadas_semana=2, limite_semanal=3", async () => {
      const c1 = await crearClase({ inicio: "2026-11-16T18:00:00-03:00", nota: "Bloque A" });
      const c2 = await crearClase({ inicio: "2026-11-17T18:00:00-03:00" });
      // Clase cancelada / reserva cancelada no deben contar
      const cCancelada = await crearClase({ inicio: "2026-11-17T19:00:00-03:00", estado: "CANCELADA" });
      await crearReserva(c1, ALUMNA_3X, "ANOTADO");
      await crearReserva(c2, ALUMNA_3X, "ANOTADO");
      await crearReserva(cCancelada, ALUMNA_3X, "ANULADO");

      const res = await resumenComo(ALUMNA_3X);
      expect(res.usadas_semana).toBe(2);
      expect(res.limite_semanal).toBe(3);
      expect(res.asistencias.length).toBeGreaterThanOrEqual(2);
      expect(res.asistencias.some((a) => a.clase_id === c1 && a.nota === "Bloque A")).toBe(true);
      expect(res.asistencias.some((a) => a.clase_id === cCancelada)).toBe(false);
    });

    it("GIVEN asistencias en 3 semanas consecutivas THEN racha_semanas=3 y AUSENTE no cuenta", async () => {
      // ALUMNA_LIBRE: asistencias en W0 (2026-11-16..22), W-1 (2026-11-09..15) y W-2 (2026-11-02..08)
      // Además domingo 2026-11-08 23:30 ART (= 2026-11-09 02:30 UTC!) debe caer en W-2 (2026-11-02), no W-1.
      const w0 = await crearClase({ actividad: "BOXEO", inicio: "2026-11-17T19:00:00-03:00" });
      const w1 = await crearClase({ actividad: "FUNCIONAL", inicio: "2026-11-11T19:00:00-03:00" });
      const w2DomNoche = await crearClase({ actividad: "FUNCIONAL", inicio: "2026-11-08T23:30:00-03:00" });
      // W-3 solo tiene AUSENTE -> no debe sumar semana 4
      const w3Ausente = await crearClase({ actividad: "FUNCIONAL", inicio: "2026-10-28T19:00:00-03:00" });
      // Clase futura en W0 -> no es asistencia todavía
      const w0Futura = await crearClase({ actividad: "BOXEO", inicio: "2026-11-20T19:00:00-03:00" });

      await crearReserva(w0, ALUMNA_LIBRE, "ANOTADO");
      await crearReserva(w1, ALUMNA_LIBRE, "ANOTADO");
      await crearReserva(w2DomNoche, ALUMNA_LIBRE, "ANOTADO");
      await crearReserva(w3Ausente, ALUMNA_LIBRE, "AUSENTE");
      await crearReserva(w0Futura, ALUMNA_LIBRE, "ANOTADO");

      const res = await resumenComo(ALUMNA_LIBRE);
      expect(res.limite_semanal).toBeNull(); // Pase libre
      expect(res.racha_semanas).toBe(3);
      expect(res.usadas_semana).toBe(2); // w0 + w0Futura ocupan cupo semanal
      expect(res.asistencias.map((a) => a.clase_id)).toEqual([w0, w1, w2DomNoche]);

      // Filtro p_desde acota el historial pero conserva la racha real
      const resFiltrado = await resumenComo(ALUMNA_LIBRE, "2026-11-10");
      expect(resFiltrado.racha_semanas).toBe(3);
      expect(resFiltrado.asistencias.map((a) => a.clase_id)).toEqual([w0, w1]);
    });

    it("mantiene racha si la semana en curso no tiene asistencias pero la anterior sí; alumno_actividades resuelve límite", async () => {
      // ALUMNA_ACT tiene BOXEO 2/sem por alumno_actividades; asistencias solo en W-1 y W-2
      const w1 = await crearClase({ actividad: "BOXEO", inicio: "2026-11-12T20:00:00-03:00" });
      const w2 = await crearClase({ actividad: "BOXEO", inicio: "2026-11-05T20:00:00-03:00" });
      await crearReserva(w1, ALUMNA_ACT, "ANOTADO");
      await crearReserva(w2, ALUMNA_ACT, "ANOTADO");

      const res = await resumenComo(ALUMNA_ACT);
      expect(res.usadas_semana).toBe(0);
      expect(res.limite_semanal).toBe(2);
      expect(res.racha_semanas).toBe(2);
    });
  });

  describe("RLS de public.feedback_clase (ventana 48 h, upsert sin duplicar, privacidad)", () => {
    it("GIVEN clase iniciada (<48h) WHEN envía sensación 3 THEN guarda; segundo envío actualiza sin duplicar", async () => {
      const claseReciente = await crearClase({ inicio: new Date(Date.now() - 2 * 3600_000).toISOString() });
      const resId = await crearReserva(claseReciente, ALUMNA_3X, "ANOTADO");

      await como(
        "authenticated",
        ALUMNA_3X,
        `INSERT INTO public.feedback_clase (reserva_id, sensacion) VALUES ($1, 3)`,
        [resId],
      );

      await como(
        "authenticated",
        ALUMNA_3X,
        `INSERT INTO public.feedback_clase (reserva_id, sensacion)
         VALUES ($1, 4)
         ON CONFLICT (reserva_id) DO UPDATE SET sensacion = EXCLUDED.sensacion`,
        [resId],
      );

      const filas = await db.query<{ sensacion: number }>(
        `SELECT sensacion FROM public.feedback_clase WHERE reserva_id = $1`,
        [resId],
      );
      expect(filas.rows).toEqual([{ sensacion: 4 }]);

      // Coach puede leer el feedback; otro alumno NO
      const coachVe = await como<{ sensacion: number }>(
        "authenticated",
        COACH,
        `SELECT sensacion FROM public.feedback_clase WHERE reserva_id = $1`,
        [resId],
      );
      expect(coachVe.rows).toEqual([{ sensacion: 4 }]);

      const otraVe = await como(
        "authenticated",
        ALUMNA_LIBRE,
        `SELECT sensacion FROM public.feedback_clase WHERE reserva_id = $1`,
        [resId],
      );
      expect(otraVe.rows).toHaveLength(0);
    });

    it("GIVEN clase futura, reserva ajena, AUSENTE o >48h WHEN intenta insertar feedback THEN RLS lo rechaza", async () => {
      const claseFutura = await crearClase({ inicio: new Date(Date.now() + 3600_000).toISOString() });
      const resFutura = await crearReserva(claseFutura, ALUMNA_3X, "ANOTADO");

      const clasePasada = await crearClase({ inicio: new Date(Date.now() - 3 * 3600_000).toISOString() });
      const resAjena = await crearReserva(clasePasada, ALUMNA_3X, "ANOTADO");
      const resAusente = await crearReserva(clasePasada, ALUMNA_LIBRE, "AUSENTE");

      const claseVieja = await crearClase({ inicio: new Date(Date.now() - 49 * 3600_000).toISOString() });
      const resVieja = await crearReserva(claseVieja, ALUMNA_3X, "ANOTADO");

      // Clase futura
      await expect(
        como("authenticated", ALUMNA_3X, `INSERT INTO public.feedback_clase (reserva_id, sensacion) VALUES ($1, 2)`, [
          resFutura,
        ]),
      ).rejects.toMatchObject({ code: "42501" });

      // Reserva ajena
      await expect(
        como("authenticated", ALUMNA_LIBRE, `INSERT INTO public.feedback_clase (reserva_id, sensacion) VALUES ($1, 2)`, [
          resAjena,
        ]),
      ).rejects.toMatchObject({ code: "42501" });

      // Reserva AUSENTE
      await expect(
        como("authenticated", ALUMNA_LIBRE, `INSERT INTO public.feedback_clase (reserva_id, sensacion) VALUES ($1, 2)`, [
          resAusente,
        ]),
      ).rejects.toMatchObject({ code: "42501" });

      // Más de 48 h desde inicio
      await expect(
        como("authenticated", ALUMNA_3X, `INSERT INTO public.feedback_clase (reserva_id, sensacion) VALUES ($1, 2)`, [
          resVieja,
        ]),
      ).rejects.toMatchObject({ code: "42501" });

      // Coach tampoco puede insertar feedback ajeno
      await expect(
        como("authenticated", COACH, `INSERT INTO public.feedback_clase (reserva_id, sensacion) VALUES ($1, 2)`, [
          resAjena,
        ]),
      ).rejects.toMatchObject({ code: "42501" });
    });

    it("feedback histórico (>48h) sigue visible para el alumno en SELECT y en resumen_clases_alumno", async () => {
      const claseVieja = await crearClase({ inicio: new Date(Date.now() - 72 * 3600_000).toISOString() });
      const resVieja = await crearReserva(claseVieja, ALUMNA_3X, "ANOTADO");
      await db.query(`INSERT INTO public.feedback_clase (reserva_id, sensacion) VALUES ($1, 1)`, [resVieja]);

      // UPDATE > 48h rechazado por RLS (0 filas afectadas porque USING falla)
      const upd = await como(
        "authenticated",
        ALUMNA_3X,
        `UPDATE public.feedback_clase SET sensacion = 2 WHERE reserva_id = $1 RETURNING id`,
        [resVieja],
      );
      expect(upd.rows).toHaveLength(0);

      // SELECT del alumno sí devuelve la sensación histórica
      const sel = await como<{ sensacion: number }>(
        "authenticated",
        ALUMNA_3X,
        `SELECT sensacion FROM public.feedback_clase WHERE reserva_id = $1`,
        [resVieja],
      );
      expect(sel.rows).toEqual([{ sensacion: 1 }]);

      // resumen_clases_alumno (using real now) la incluye en asistencias
      const resumen = await como<ResumenRow>(
        "authenticated",
        ALUMNA_3X,
        `SELECT * FROM public.resumen_clases_alumno(NULL)`,
      );
      const item = resumen.rows[0]!.asistencias.find((a) => a.reserva_id === resVieja);
      expect(item?.sensacion).toBe(1);
    });
  });

  describe("funciones de acceso en src/lib/clases.ts", () => {
    it("obtenerResumenClasesAlumno desenvuelve la RPC", async () => {
      const mockClient = {
        rpc: async (fn: string, args: unknown) => {
          expect(fn).toBe("resumen_clases_alumno");
          expect(args).toEqual({ p_desde: "2026-11-01" });
          return {
            data: [{ usadas_semana: 2, limite_semanal: 3, racha_semanas: 4, asistencias: [] }],
            error: null,
          };
        },
      } as any;

      const res = await obtenerResumenClasesAlumno("2026-11-01", mockClient);
      expect(res).toEqual({
        usadas_semana: 2,
        limite_semanal: 3,
        racha_semanas: 4,
        asistencias: [],
      });
    });

    it("guardarFeedbackClase hace upsert por reserva_id", async () => {
      let upsertArgs: any = null;
      const fila = { id: "f1", reserva_id: "r1", sensacion: 3, created_at: "2026-11-21T12:00:00Z", updated_at: "2026-11-21T12:00:00Z" };
      const mockClient = {
        from: (tabla: string) => {
          expect(tabla).toBe("feedback_clase");
          return {
            upsert: (payload: unknown, opts: unknown) => {
              upsertArgs = { payload, opts };
              return {
                select: () => ({
                  single: async () => ({ data: fila, error: null }),
                }),
              };
            },
          };
        },
      } as any;

      const res = await guardarFeedbackClase({ reservaId: "r1", sensacion: 3 }, mockClient);
      expect(res).toEqual(fila);
      expect(upsertArgs).toEqual({
        payload: { reserva_id: "r1", sensacion: 3 },
        opts: { onConflict: "reserva_id" },
      });
    });

    it("actualizarNotaClase normaliza espacios, valida 280 chars y limpia nota vacía", async () => {
      let updatedPayload: any = null;
      const mockClient = {
        from: () => ({
          update: (payload: unknown) => {
            updatedPayload = payload;
            return {
              eq: () => ({
                select: () => ({
                  single: async () => ({ data: { id: "c1", ...updatedPayload }, error: null }),
                }),
              }),
            };
          },
        }),
      } as any;

      await actualizarNotaClase({ claseId: "c1", nota: "  Circuito de piernas  " }, mockClient);
      expect(updatedPayload).toEqual({ nota: "Circuito de piernas" });

      await actualizarNotaClase({ claseId: "c1", nota: "   " }, mockClient);
      expect(updatedPayload).toEqual({ nota: null });

      await expect(
        actualizarNotaClase({ claseId: "c1", nota: "x".repeat(281) }, mockClient),
      ).rejects.toThrow("280");
    });

    it("obtenerFeedbackDeReservas corta en [] sin llamar a Supabase", async () => {
      let llamado = false;
      const mockClient = {
        from: () => {
          llamado = true;
          return {};
        },
      } as any;
      expect(await obtenerFeedbackDeReservas([], mockClient)).toEqual([]);
      expect(llamado).toBe(false);
    });
  });
});
