import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { aplicarMigracion, crearDbMigrada, MIGRATIONS_DIR } from "./helpers/pglite-migrada";

const NEW_MIGRATION = "20261121150000_clase_feedback_nota_resumen_asistencias.sql";
const TZ = "America/Argentina/Buenos_Aires";

const ADMIN = "00000000-0000-0000-0000-00000000667a";
const COACH_A = "00000000-0000-0000-0000-00000000667b";
const COACH_B = "00000000-0000-0000-0000-00000000667c";
const ALU_1 = "00000000-0000-0000-0000-000000006671"; // Plan 2/semana
const ALU_2 = "00000000-0000-0000-0000-000000006672"; // Pase libre
const ALU_3 = "00000000-0000-0000-0000-000000006673"; // Solo alumno_actividades (3/semana)
const ALU_4 = "00000000-0000-0000-0000-000000006674"; // Sin asistencias / racha desde semana anterior

const PLAN_2X = "20000000-0000-0000-0000-000000006671";
const PLAN_LIBRE = "20000000-0000-0000-0000-000000006672";

type Rol = "anon" | "authenticated" | "service_role";

const SEED = `
  INSERT INTO auth.users (id, email) VALUES
    ('${ADMIN}','admin667@t'),('${COACH_A}','ca667@t'),('${COACH_B}','cb667@t'),
    ('${ALU_1}','al1_667@t'),('${ALU_2}','al2_667@t'),('${ALU_3}','al3_667@t'),('${ALU_4}','al4_667@t');

  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${ADMIN}','admin667@t','Admin 667','ADMIN',NULL,'ACTIVA'),
    ('${COACH_A}','ca667@t','Coach A','ENTRENADOR',NULL,'ACTIVA'),
    ('${COACH_B}','cb667@t','Coach B','ENTRENADOR',NULL,'ACTIVA'),
    ('${ALU_1}','al1_667@t','Alumno 1','ALUMNO','${COACH_A}','ACTIVA'),
    ('${ALU_2}','al2_667@t','Alumno 2','ALUMNO','${COACH_B}','ACTIVA'),
    ('${ALU_3}','al3_667@t','Alumno 3','ALUMNO','${COACH_A}','ACTIVA'),
    ('${ALU_4}','al4_667@t','Alumno 4','ALUMNO','${COACH_A}','ACTIVA');

  INSERT INTO public.planes_membresia (id, nombre, limite_semanal, cantidad_actividades, duracion_meses, precio) VALUES
    ('${PLAN_2X}','2 por semana',2,1,1,20000),
    ('${PLAN_LIBRE}','Pase libre',NULL,2,1,35000);

  INSERT INTO public.contrataciones
    (alumno_id, tipo_servicio, dia_vencimiento, fecha_inicio, fecha_fin, estado, plan_membresia_id, actividad) VALUES
    ('${ALU_1}','PRESENCIAL',5,CURRENT_DATE - 30,CURRENT_DATE + 30,'VIGENTE','${PLAN_2X}','FUNCIONAL'),
    ('${ALU_2}','PRESENCIAL',5,CURRENT_DATE - 30,CURRENT_DATE + 30,'VIGENTE','${PLAN_LIBRE}',NULL),
    ('${ALU_3}','ASESORIA_ONLINE',5,CURRENT_DATE - 30,CURRENT_DATE + 30,'VIGENTE',NULL,NULL),
    ('${ALU_4}','PRESENCIAL',5,CURRENT_DATE - 30,CURRENT_DATE + 30,'VIGENTE','${PLAN_2X}','BOXEO');

  INSERT INTO public.alumno_actividades (alumno_id, actividad, veces_por_semana, pase_libre) VALUES
    ('${ALU_3}','FUNCIONAL',3,false);
`;

const LUNES_ACTUAL = `(date_trunc('week', now() AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}')`;

let db: PGlite;

function como<T>(rol: Rol, sub: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub ? { sub, role: rol } : { role: rol }),
    ]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query<T>(sql, params);
  });
}

describe("GOZS-667: clase_feedback, nota_coach y RPCs resumen/historial de asistencias (PGlite)", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
    // Verificar idempotencia re-aplicando la migración
    await aplicarMigracion(db, fs.readFileSync(path.join(MIGRATIONS_DIR, NEW_MIGRATION), "utf-8"));
    await db.exec(SEED);
  }, 60_000);

  describe("1. Seguridad y permisos de tablas y RPCs", () => {
    it("las RPCs tienen search_path=public y acceso revocado para anon", async () => {
      const nombres = [
        "registrar_feedback_clase",
        "guardar_nota_clase",
        "resumen_clases_alumno",
        "historial_asistencias_alumno",
      ];
      const r = await db.query<{
        proname: string;
        prosecdef: boolean;
        proconfig: string[] | null;
        anon_exec: boolean;
        auth_exec: boolean;
      }>(
        `SELECT p.proname, p.prosecdef, p.proconfig,
                has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
                has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
         FROM pg_proc p
         WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY($1)
         ORDER BY p.proname`,
        [nombres],
      );
      expect(r.rows).toHaveLength(4);
      for (const fn of r.rows) {
        expect(fn.proconfig).toContain("search_path=public");
        expect(fn.anon_exec).toBe(false);
        expect(fn.auth_exec).toBe(true);
      }
      const guardarNota = r.rows.find((f) => f.proname === "guardar_nota_clase");
      expect(guardarNota?.prosecdef).toBe(true);
    });

    it("anon no puede leer ni escribir clase_feedback", async () => {
      await expect(
        como("anon", null, `SELECT * FROM public.clase_feedback`),
      ).rejects.toThrow();
    });
  });

  describe("2. Feedback post-clase (clase_feedback + registrar_feedback_clase + RLS)", () => {
    let clasePasadaId: string;
    let claseFuturaId: string;
    let claseCanceladaId: string;
    let resAnotadoPasada: string;
    let resAusentePasada: string;
    let resCanceladoPasada: string;
    let resAnotadoFutura: string;
    let resAnuladoCancelada: string;
    let resAlu2Pasada: string;

    beforeAll(async () => {
      const cPas = await db.query<{ id: string }>(
        `INSERT INTO public.clases (actividad, inicio, duracion_minutos, estado)
         VALUES ('FUNCIONAL', now() - interval '2 hours', 60, 'PROGRAMADA')
         RETURNING id`,
      );
      clasePasadaId = cPas.rows[0]!.id;
      await db.query(
        `INSERT INTO public.clases_profesores (clase_id, profesor_id) VALUES ($1, $2)`,
        [clasePasadaId, COACH_A],
      );

      const cFut = await db.query<{ id: string }>(
        `INSERT INTO public.clases (actividad, inicio, duracion_minutos, estado)
         VALUES ('FUNCIONAL', now() + interval '4 hours', 60, 'PROGRAMADA')
         RETURNING id`,
      );
      claseFuturaId = cFut.rows[0]!.id;

      const cCanc = await db.query<{ id: string }>(
        `INSERT INTO public.clases (actividad, inicio, duracion_minutos, estado, motivo_cancelacion)
         VALUES ('FUNCIONAL', now() - interval '3 hours', 60, 'CANCELADA', 'Lluvia')
         RETURNING id`,
      );
      claseCanceladaId = cCanc.rows[0]!.id;

      const r1 = await db.query<{ id: string }>(
        `INSERT INTO public.reservas (clase_id, alumno_id, estado) VALUES ($1, $2, 'ANOTADO') RETURNING id`,
        [clasePasadaId, ALU_1],
      );
      resAnotadoPasada = r1.rows[0]!.id;

      const r2 = await db.query<{ id: string }>(
        `INSERT INTO public.reservas (clase_id, alumno_id, estado) VALUES ($1, $2, 'AUSENTE') RETURNING id`,
        [clasePasadaId, ALU_2],
      );
      resAusentePasada = r2.rows[0]!.id;

      const r3 = await db.query<{ id: string }>(
        `INSERT INTO public.reservas (clase_id, alumno_id, estado) VALUES ($1, $2, 'CANCELADO') RETURNING id`,
        [clasePasadaId, ALU_3],
      );
      resCanceladoPasada = r3.rows[0]!.id;

      const r4 = await db.query<{ id: string }>(
        `INSERT INTO public.reservas (clase_id, alumno_id, estado) VALUES ($1, $2, 'ANOTADO') RETURNING id`,
        [claseFuturaId, ALU_1],
      );
      resAnotadoFutura = r4.rows[0]!.id;

      const r5 = await db.query<{ id: string }>(
        `INSERT INTO public.reservas (clase_id, alumno_id, estado) VALUES ($1, $2, 'ANULADO') RETURNING id`,
        [claseCanceladaId, ALU_1],
      );
      resAnuladoCancelada = r5.rows[0]!.id;

      // Reserva anotada de ALU_2 en clase pasada para probar aislamiento entre alumnos y coaches
      const cPas2 = await db.query<{ id: string }>(
        `INSERT INTO public.clases (actividad, inicio, duracion_minutos, estado)
         VALUES ('BOXEO', now() - interval '4 hours', 60, 'PROGRAMADA')
         RETURNING id`,
      );
      await db.query(
        `INSERT INTO public.clases_profesores (clase_id, profesor_id) VALUES ($1, $2)`,
        [cPas2.rows[0]!.id, COACH_B],
      );
      const r6 = await db.query<{ id: string }>(
        `INSERT INTO public.reservas (clase_id, alumno_id, estado) VALUES ($1, $2, 'ANOTADO') RETURNING id`,
        [cPas2.rows[0]!.id, ALU_2],
      );
      resAlu2Pasada = r6.rows[0]!.id;
      await como("authenticated", ALU_2, `SELECT * FROM public.registrar_feedback_clase($1, 'FACIL')`, [
        resAlu2Pasada,
      ]);
    });

    it("GIVEN reserva ANOTADO de clase ya iniciada WHEN registra DURA y luego BIEN THEN queda una sola fila con BIEN", async () => {
      const first = await como<{ reserva_id: string; sensacion: string }>(
        "authenticated",
        ALU_1,
        `SELECT reserva_id, sensacion FROM public.registrar_feedback_clase($1, 'DURA')`,
        [resAnotadoPasada],
      );
      expect(first.rows[0]).toEqual({ reserva_id: resAnotadoPasada, sensacion: "DURA" });

      const second = await como<{ reserva_id: string; sensacion: string }>(
        "authenticated",
        ALU_1,
        `SELECT reserva_id, sensacion FROM public.registrar_feedback_clase($1, 'BIEN')`,
        [resAnotadoPasada],
      );
      expect(second.rows[0]).toEqual({ reserva_id: resAnotadoPasada, sensacion: "BIEN" });

      const count = await db.query<{ c: string; sensacion: string }>(
        `SELECT count(*)::text AS c, max(sensacion) AS sensacion FROM public.clase_feedback WHERE reserva_id = $1`,
        [resAnotadoPasada],
      );
      expect(count.rows[0]).toEqual({ c: "1", sensacion: "BIEN" });
    });

    it("GIVEN reserva AUSENTE, CANCELADO, ANULADO o clase futura WHEN intenta registrar feedback THEN se rechaza (RPC y RLS directo)", async () => {
      await expect(
        como("authenticated", ALU_2, `SELECT * FROM public.registrar_feedback_clase($1, 'BIEN')`, [
          resAusentePasada,
        ]),
      ).rejects.toThrow();

      await expect(
        como("authenticated", ALU_3, `SELECT * FROM public.registrar_feedback_clase($1, 'BIEN')`, [
          resCanceladoPasada,
        ]),
      ).rejects.toThrow();

      await expect(
        como("authenticated", ALU_1, `SELECT * FROM public.registrar_feedback_clase($1, 'BIEN')`, [
          resAnuladoCancelada,
        ]),
      ).rejects.toThrow();

      await expect(
        como("authenticated", ALU_1, `SELECT * FROM public.registrar_feedback_clase($1, 'BIEN')`, [
          resAnotadoFutura,
        ]),
      ).rejects.toThrow();

      // También rechazado vía INSERT directo por RLS
      await expect(
        como(
          "authenticated",
          ALU_1,
          `INSERT INTO public.clase_feedback (reserva_id, sensacion) VALUES ($1, 'FACIL')`,
          [resAnotadoFutura],
        ),
      ).rejects.toThrow();

      await expect(
        como(
          "authenticated",
          ALU_2,
          `INSERT INTO public.clase_feedback (reserva_id, sensacion) VALUES ($1, 'FACIL')`,
          [resAusentePasada],
        ),
      ).rejects.toThrow();
    });

    it("rechaza sensación inválida fuera del CHECK", async () => {
      await expect(
        como("authenticated", ALU_1, `SELECT * FROM public.registrar_feedback_clase($1, 'IMPOSIBLE')`, [
          resAnotadoPasada,
        ]),
      ).rejects.toThrow();
    });

    it("GIVEN otro alumno WHEN lee clase_feedback ajeno THEN no obtiene filas; GIVEN el coach de la clase THEN sí", async () => {
      // ALU_2 no ve el feedback de ALU_1
      const otroAlumno = await como<{ reserva_id: string }>(
        "authenticated",
        ALU_2,
        `SELECT reserva_id FROM public.clase_feedback WHERE reserva_id = $1`,
        [resAnotadoPasada],
      );
      expect(otroAlumno.rows).toHaveLength(0);

      // ALU_2 tampoco puede insertar/modificar sobre la reserva de ALU_1
      await expect(
        como(
          "authenticated",
          ALU_2,
          `SELECT * FROM public.registrar_feedback_clase($1, 'DURISIMA')`,
          [resAnotadoPasada],
        ),
      ).rejects.toThrow();

      // COACH_A dicta clasePasadaId y es entrenador de ALU_1 -> sí lee
      const coachClase = await como<{ reserva_id: string; sensacion: string }>(
        "authenticated",
        COACH_A,
        `SELECT reserva_id, sensacion FROM public.clase_feedback WHERE reserva_id = $1`,
        [resAnotadoPasada],
      );
      expect(coachClase.rows).toEqual([{ reserva_id: resAnotadoPasada, sensacion: "BIEN" }]);

      // COACH_B no dicta clasePasadaId ni entrena a ALU_1 -> no lee feedback de ALU_1
      const coachAjeno = await como<{ reserva_id: string }>(
        "authenticated",
        COACH_B,
        `SELECT reserva_id FROM public.clase_feedback WHERE reserva_id = $1`,
        [resAnotadoPasada],
      );
      expect(coachAjeno.rows).toHaveLength(0);
    });
  });

  describe("3. Nota opcional del coach (clases.nota_coach + guardar_nota_clase + triggers)", () => {
    let claseId: string;

    beforeAll(async () => {
      const c = await db.query<{ id: string }>(
        `INSERT INTO public.clases (actividad, inicio, duracion_minutos, estado)
         VALUES ('FUNCIONAL', now() - interval '1 hour', 60, 'PROGRAMADA')
         RETURNING id`,
      );
      claseId = c.rows[0]!.id;
      await db.query(
        `INSERT INTO public.clases_profesores (clase_id, profesor_id) VALUES ($1, $2)`,
        [claseId, COACH_A],
      );
    });

    it("GIVEN coach que dicta la clase WHEN llama guardar_nota_clase THEN guarda texto y normaliza string vacío a NULL sin ser bloqueado por fn_proteger_estado_clase", async () => {
      const saved = await como<{ nota_coach: string | null }>(
        "authenticated",
        COACH_A,
        `SELECT nota_coach FROM public.guardar_nota_clase($1, '  Buen trabajo de zona media  ')`,
        [claseId],
      );
      expect(saved.rows[0]?.nota_coach).toBe("Buen trabajo de zona media");

      const cleared = await como<{ nota_coach: string | null }>(
        "authenticated",
        COACH_A,
        `SELECT nota_coach FROM public.guardar_nota_clase($1, '   ')`,
        [claseId],
      );
      expect(cleared.rows[0]?.nota_coach).toBeNull();
    });

    it("GIVEN admin WHEN llama guardar_nota_clase THEN puede guardar nota", async () => {
      const saved = await como<{ nota_coach: string | null }>(
        "authenticated",
        ADMIN,
        `SELECT nota_coach FROM public.guardar_nota_clase($1, 'Nota admin')`,
        [claseId],
      );
      expect(saved.rows[0]?.nota_coach).toBe("Nota admin");
    });

    it("GIVEN un coach que no dicta la clase o un alumno WHEN llama guardar_nota_clase o intenta UPDATE directo THEN se rechaza", async () => {
      await expect(
        como("authenticated", COACH_B, `SELECT * FROM public.guardar_nota_clase($1, 'Intruso')`, [
          claseId,
        ]),
      ).rejects.toThrow();

      await expect(
        como("authenticated", COACH_B, `UPDATE public.clases SET nota_coach = 'Directo' WHERE id = $1`, [
          claseId,
        ]),
      ).rejects.toThrow();

      await expect(
        como("authenticated", ALU_1, `SELECT * FROM public.guardar_nota_clase($1, 'Alumno')`, [
          claseId,
        ]),
      ).rejects.toThrow();
    });
  });

  describe("4. RPCs resumen_clases_alumno() y historial_asistencias_alumno()", () => {
    // Usamos un alumno dedicado (ALU_1) limpiando sus reservas previas para escenarios deterministas,
    // y ALU_4 para racha que termina en semana anterior.
    beforeAll(async () => {
      await db.query(`DELETE FROM public.reservas WHERE alumno_id IN ($1, $2, $3)`, [
        ALU_1,
        ALU_3,
        ALU_4,
      ]);

      // Limpiar reservas de prueba solo? Creamos clases nuevas con offsets deterministas desde lunes actual.
      // Para ALU_1 (plan 2/semana):
      // - 1 asistencia esta semana (lunes + 1 hora, pasada? Wait: si hoy es lunes 00:05 podría ser futuro;
      //   por eso usamos now() - interval '10 minutes' si está en esta semana, o lunes_actual si ya pasó).
      // Mejor aún: usar clases en semanas pasadas para racha y una en la semana en curso:
      // Para la semana en curso: si now() - LUNES_ACTUAL >= 10 minutes, now() - 5 min está en esta semana y es pasada;
      // si justo fuera lunes 00:00-00:10, lunes_actual + 1 second es pasada y está en esta semana.
      const cSem0Pasada = await db.query<{ id: string }>(
        `INSERT INTO public.clases (actividad, inicio, duracion_minutos, estado, nota_coach)
         VALUES ('FUNCIONAL', GREATEST(${LUNES_ACTUAL} + interval '1 second', now() - interval '1 hour'), 60, 'PROGRAMADA', 'Excelente técnica')
         RETURNING id`,
      );
      const cSem1 = await db.query<{ id: string }>(
        `INSERT INTO public.clases (actividad, inicio, duracion_minutos, estado, nota_coach)
         VALUES ('FUNCIONAL', ${LUNES_ACTUAL} - interval '5 days', 60, 'PROGRAMADA', 'Semana -1')
         RETURNING id`,
      );
      const cSem2 = await db.query<{ id: string }>(
        `INSERT INTO public.clases (actividad, inicio, duracion_minutos, estado)
         VALUES ('FUNCIONAL', ${LUNES_ACTUAL} - interval '12 days', 45, 'PROGRAMADA')
         RETURNING id`,
      );
      // Salto en semana -3 -> la racha debe ser 3 (actual, -1, -2), sin contar semana -4
      const cSem4 = await db.query<{ id: string }>(
        `INSERT INTO public.clases (actividad, inicio, duracion_minutos, estado)
         VALUES ('FUNCIONAL', ${LUNES_ACTUAL} - interval '26 days', 60, 'PROGRAMADA')
         RETURNING id`,
      );
      // Clase futura (próxima reserva) — en semana +1 para no alterar clases_semana_usadas de esta semana
      const cFutura1 = await db.query<{ id: string }>(
        `INSERT INTO public.clases (actividad, inicio, duracion_minutos, estado)
         VALUES ('FUNCIONAL', ${LUNES_ACTUAL} + interval '8 days', 60, 'PROGRAMADA')
         RETURNING id`,
      );
      const cFutura2 = await db.query<{ id: string }>(
        `INSERT INTO public.clases (actividad, inicio, duracion_minutos, estado)
         VALUES ('FUNCIONAL', ${LUNES_ACTUAL} + interval '10 days', 45, 'PROGRAMADA')
         RETURNING id`,
      );

      const rSem0 = await db.query<{ id: string }>(
        `INSERT INTO public.reservas (clase_id, alumno_id, estado) VALUES ($1, $2, 'ANOTADO') RETURNING id`,
        [cSem0Pasada.rows[0]!.id, ALU_1],
      );
      await db.query(
        `INSERT INTO public.clase_feedback (reserva_id, sensacion) VALUES ($1, 'DURA')`,
        [rSem0.rows[0]!.id],
      );
      await db.query(
        `INSERT INTO public.reservas (clase_id, alumno_id, estado) VALUES ($1, $2, 'ANOTADO')`,
        [cSem1.rows[0]!.id, ALU_1],
      );
      await db.query(
        `INSERT INTO public.reservas (clase_id, alumno_id, estado) VALUES ($1, $2, 'ANOTADO')`,
        [cSem2.rows[0]!.id, ALU_1],
      );
      await db.query(
        `INSERT INTO public.reservas (clase_id, alumno_id, estado) VALUES ($1, $2, 'ANOTADO')`,
        [cSem4.rows[0]!.id, ALU_1],
      );
      await db.query(
        `INSERT INTO public.reservas (clase_id, alumno_id, estado) VALUES ($1, $2, 'ANOTADO')`,
        [cFutura1.rows[0]!.id, ALU_1],
      );
      await db.query(
        `INSERT INTO public.reservas (clase_id, alumno_id, estado) VALUES ($1, $2, 'ANOTADO')`,
        [cFutura2.rows[0]!.id, ALU_1],
      );

      // ALU_4: sin asistencias esta semana (solo un AUSENTE esta semana, que NO cuenta como asistencia),
      // y asistencias en semana -1 y semana -2 -> racha_semanas = 2
      const cSem0Aus = await db.query<{ id: string }>(
        `INSERT INTO public.clases (actividad, inicio, duracion_minutos, estado)
         VALUES ('BOXEO', GREATEST(${LUNES_ACTUAL} + interval '1 second', now() - interval '30 minutes'), 60, 'PROGRAMADA')
         RETURNING id`,
      );
      await db.query(
        `INSERT INTO public.reservas (clase_id, alumno_id, estado) VALUES ($1, $2, 'AUSENTE')`,
        [cSem0Aus.rows[0]!.id, ALU_4],
      );
      await db.query(
        `INSERT INTO public.reservas (clase_id, alumno_id, estado) VALUES ($1, $2, 'ANOTADO')`,
        [cSem1.rows[0]!.id, ALU_4],
      );
      await db.query(
        `INSERT INTO public.reservas (clase_id, alumno_id, estado) VALUES ($1, $2, 'ANOTADO')`,
        [cSem2.rows[0]!.id, ALU_4],
      );
    });

    it("GIVEN alumno con plan 2/semana y 1 asistencia esta semana WHEN llama resumen_clases_alumno() THEN devuelve usada=1, limite=2, racha=3 y proxima_reserva más cercana", async () => {
      const res = await como<{
        resumen: {
          proxima_reserva: {
            reserva_id: string;
            clase_id: string;
            actividad: string;
            inicio: string;
            duracion_minutos: number;
          } | null;
          clases_semana_usadas: number;
          limite_semanal: number | null;
          racha_semanas: number;
        };
      }>("authenticated", ALU_1, `SELECT public.resumen_clases_alumno() AS resumen`);

      const resumen = res.rows[0]!.resumen;
      expect(resumen.clases_semana_usadas).toBe(1);
      expect(resumen.limite_semanal).toBe(2);
      expect(resumen.racha_semanas).toBe(3);
      expect(resumen.proxima_reserva).not.toBeNull();
      expect(resumen.proxima_reserva?.actividad).toBe("FUNCIONAL");
      expect(resumen.proxima_reserva?.duracion_minutos).toBe(60);
    });

    it("GIVEN alumno sin asistencia esta semana (solo AUSENTE) y asistencias en 2 semanas previas THEN racha_semanas=2, clases_semana_usadas=1 (AUSENTE consume cupo) y proxima_reserva=null", async () => {
      const res = await como<{
        resumen: {
          proxima_reserva: unknown;
          clases_semana_usadas: number;
          limite_semanal: number | null;
          racha_semanas: number;
        };
      }>("authenticated", ALU_4, `SELECT public.resumen_clases_alumno() AS resumen`);

      const resumen = res.rows[0]!.resumen;
      expect(resumen.proxima_reserva).toBeNull();
      expect(resumen.clases_semana_usadas).toBe(1); // AUSENTE consume límite semanal igual que reservar_clase
      expect(resumen.limite_semanal).toBe(2);
      expect(resumen.racha_semanas).toBe(2); // AUSENTE no cuenta como asistencia, racha continúa desde semana anterior
    });

    it("GIVEN alumno con pase libre WHEN llama resumen_clases_alumno() THEN limite_semanal es null; GIVEN alumno_actividades 3/semana THEN limite_semanal=3", async () => {
      const libre = await como<{ resumen: { limite_semanal: number | null } }>(
        "authenticated",
        ALU_2,
        `SELECT public.resumen_clases_alumno() AS resumen`,
      );
      expect(libre.rows[0]!.resumen.limite_semanal).toBeNull();

      const act = await como<{ resumen: { limite_semanal: number | null; clases_semana_usadas: number } }>(
        "authenticated",
        ALU_3,
        `SELECT public.resumen_clases_alumno() AS resumen`,
      );
      expect(act.rows[0]!.resumen.limite_semanal).toBe(3);
      expect(act.rows[0]!.resumen.clases_semana_usadas).toBe(0);
    });

    it("GIVEN alumno con asistencias WHEN llama historial_asistencias_alumno THEN devuelve asistencias ordenadas desc con sensacion y nota_coach", async () => {
      const hist = await como<{
        reserva_id: string;
        clase_id: string;
        actividad: string;
        inicio: string;
        sensacion: string | null;
        nota_coach: string | null;
      }>("authenticated", ALU_1, `SELECT * FROM public.historial_asistencias_alumno(10)`);

      expect(hist.rows).toHaveLength(4);
      expect(hist.rows[0]!.sensacion).toBe("DURA");
      expect(hist.rows[0]!.nota_coach).toBe("Excelente técnica");
      expect(hist.rows[1]!.sensacion).toBeNull();
      expect(hist.rows[1]!.nota_coach).toBe("Semana -1");
      expect(hist.rows[2]!.nota_coach).toBeNull();

      // Verificar límite
      const histLimit = await como<{ reserva_id: string }>(
        "authenticated",
        ALU_1,
        `SELECT reserva_id FROM public.historial_asistencias_alumno(2)`,
      );
      expect(histLimit.rows).toHaveLength(2);

      // AUSENTE no aparece en historial de asistencias
      const histAlu4 = await como<{ reserva_id: string }>(
        "authenticated",
        ALU_4,
        `SELECT reserva_id FROM public.historial_asistencias_alumno()`,
      );
      expect(histAlu4.rows).toHaveLength(2);
    });
  });
});
