import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { aplicarMigracion, crearDbMigrada, MIGRATIONS_DIR } from "./helpers/pglite-migrada";
import { calcularSemanaPlan } from "@/lib/athlete-dias";

/**
 * GOZS-630 (Stage 1):
 * 1) Herencia de fecha_inicio en guardar_rutina cuando se guarda una nueva versión
 *    de una rutina ya asignada al mismo alumno (como_nueva = true), conservando SEMANA N.
 * 2) Reinicio a fecha_inicio = now() (SEMANA 1) cuando se asigna una rutina completa
 *    nueva mediante asignar_rutina_a_alumno o al clonar plantillas / crear desde cero.
 * 3) Auditoría RLS + publicación supabase_realtime sobre public.reservas y public.clases.
 */

const NEW_MIGRATION = "20261120171500_guardar_rutina_heredar_fecha_inicio_y_realtime_reservas.sql";
const TZ = "America/Argentina/Buenos_Aires";

const COACH = "00000000-0000-0000-0000-00000000c0a1";
const ALUMNO_1 = "00000000-0000-0000-0000-00000000a101";
const ALUMNO_2 = "00000000-0000-0000-0000-00000000a102";
const EJ_PRESS = "10000000-0000-0000-0000-00000000e001";
const EJ_REMO = "10000000-0000-0000-0000-00000000e002";

const PLAN_MEMBRESIA_LIBRE = "20000000-0000-0000-0000-000000000001";
const PLAN_ACTIVO_A1 = "30000000-0000-0000-0000-000000000001";
const PLANTILLA_NUEVA = "30000000-0000-0000-0000-000000000002";

type Rol = "anon" | "authenticated" | "service_role";

let db: PGlite;
let fechaInicioHace10Dias: string;

function como<T>(rol: Rol, sub: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub ? { sub, role: rol } : { role: rol }),
    ]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query<T>(sql, params);
  });
}

describe("GOZS-630: fecha_inicio en guardar_rutina y contrato RLS/Realtime reservas + clases", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
    // Idempotencia de la migración nueva
    await aplicarMigracion(db, fs.readFileSync(path.join(MIGRATIONS_DIR, NEW_MIGRATION), "utf-8"));

    fechaInicioHace10Dias = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const fechaPlantillaAntigua = new Date(Date.now() - 60 * 86_400_000).toISOString();

    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES
        ('${COACH}', 'coach@t'),
        ('${ALUMNO_1}', 'a1@t'),
        ('${ALUMNO_2}', 'a2@t');

      INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
        ('${COACH}', 'coach@t', 'Coach', 'ENTRENADOR', NULL, 'ACTIVA'),
        ('${ALUMNO_1}', 'a1@t', 'Alumno Uno', 'ALUMNO', '${COACH}', 'ACTIVA'),
        ('${ALUMNO_2}', 'a2@t', 'Alumno Dos', 'ALUMNO', '${COACH}', 'ACTIVA')
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, nombre_completo = EXCLUDED.nombre_completo, rol = EXCLUDED.rol, profesor_asignado_id = EXCLUDED.profesor_asignado_id, estado_membresia = EXCLUDED.estado_membresia;

      INSERT INTO public.ejercicios (id, nombre, musculos_principales) VALUES
        ('${EJ_PRESS}', 'Press Banca', ARRAY['PECHO']),
        ('${EJ_REMO}', 'Remo con Barra', ARRAY['ESPALDA']);

      INSERT INTO public.planes_entrenamiento
        (id, profesor_id, alumno_id, nombre, estado, tipo, fecha_inicio, fecha_fin)
      VALUES
        ('${PLAN_ACTIVO_A1}', '${COACH}', '${ALUMNO_1}', 'Plan Activo A1', 'ACTIVO', 'DE_ALUMNO', '${fechaInicioHace10Dias}', NULL),
        ('${PLANTILLA_NUEVA}', '${COACH}', NULL, 'Plantilla Hipertrofia', 'ACTIVO', 'PLANTILLA', '${fechaPlantillaAntigua}', NULL);
    `);

    const diaRes = await db.query<{ id: string }>(
      `INSERT INTO public.dias_rutina (plan_id, nombre, orden) VALUES ('${PLAN_ACTIVO_A1}', 'Día 1', 1) RETURNING id`,
    );
    const diaId = diaRes.rows[0]!.id;
    await db.query(
      `INSERT INTO public.ejercicios_en_rutina (dia_id, ejercicio_id, orden, series, repeticiones) VALUES ($1, $2, 1, 3, '10')`,
      [diaId, EJ_PRESS],
    );
    await db.query(
      `INSERT INTO public.registro_sesiones (alumno_id, dia_id, fecha) VALUES ($1, $2, $3)`,
      [ALUMNO_1, diaId, new Date(Date.now() - 3 * 86_400_000).toISOString()],
    );

    await db.exec(`
      INSERT INTO public.dias_rutina (plan_id, nombre, orden) VALUES ('${PLANTILLA_NUEVA}', 'Torso', 1);
      INSERT INTO public.ejercicios_en_rutina (dia_id, ejercicio_id, orden, series, repeticiones)
      SELECT id, '${EJ_REMO}', 1, 4, '8-12' FROM public.dias_rutina WHERE plan_id = '${PLANTILLA_NUEVA}';

      INSERT INTO public.planes_membresia (id, nombre, limite_semanal, cantidad_actividades, duracion_meses, precio) VALUES
        ('${PLAN_MEMBRESIA_LIBRE}', 'Pase Libre', NULL, 2, 1, 35000);

      INSERT INTO public.contrataciones
        (alumno_id, tipo_servicio, dia_vencimiento, fecha_inicio, fecha_fin, estado, plan_membresia_id, actividad)
      VALUES
        ('${ALUMNO_1}', 'PRESENCIAL', 5, CURRENT_DATE - 10, CURRENT_DATE + 30, 'VIGENTE', '${PLAN_MEMBRESIA_LIBRE}', NULL),
        ('${ALUMNO_2}', 'PRESENCIAL', 5, CURRENT_DATE - 10, CURRENT_DATE + 30, 'VIGENTE', '${PLAN_MEMBRESIA_LIBRE}', NULL);
    `);
  }, 60_000);

  describe("1. Herencia de fecha_inicio en guardar_rutina y reinicio en asignar_rutina_a_alumno", () => {
    let version2Id: string;

    it("editar/versionar una rutina activa con sesiones (como_nueva = true) hereda fecha_inicio y mantiene SEMANA 2", async () => {
      // Sin como_nueva, rechaza porque ya tiene sesiones registradas
      await expect(
        como("authenticated", COACH, `SELECT public.guardar_rutina($1::jsonb)`, [
          JSON.stringify({
            plan_id: PLAN_ACTIVO_A1,
            nombre: "Plan Activo A1",
            dias: [
              {
                nombre: "Día 1",
                ejercicios: [{ ejercicio_id: EJ_REMO, series: 4, repeticiones: "12-10-8-6", rpe_objetivo: "6-7-8-9" }],
              },
            ],
          }),
        ]),
      ).rejects.toThrow(/sesiones registradas/i);

      // Con como_nueva = true, crea v2 heredando fecha_inicio del plan origen
      const res = await como<{ id: string }>(
        "authenticated",
        COACH,
        `SELECT public.guardar_rutina($1::jsonb)::text AS id`,
        [
          JSON.stringify({
            plan_id: PLAN_ACTIVO_A1,
            como_nueva: true,
            alumno_id: ALUMNO_1,
            nombre: "Plan Activo A1 v2",
            dias: [
              {
                nombre: "Día 1",
                ejercicios: [
                  {
                    ejercicio_id: EJ_REMO,
                    series: 4,
                    repeticiones: "12-10-8-6",
                    rpe_objetivo: "6-7-8-9",
                    tipo_medicion: "REPS",
                    es_unilateral: true,
                  },
                ],
              },
            ],
          }),
        ],
      );
      version2Id = res.rows[0]!.id;
      expect(version2Id).not.toBe(PLAN_ACTIVO_A1);

      const filas = await db.query<{
        id: string;
        estado: string;
        plan_origen_id: string | null;
        fecha_inicio: Date;
        fecha_fin: Date | null;
      }>(
        `SELECT id::text, estado::text, plan_origen_id::text, fecha_inicio, fecha_fin
         FROM public.planes_entrenamiento WHERE id IN ($1, $2)`,
        [PLAN_ACTIVO_A1, version2Id],
      );
      const origen = filas.rows.find((r) => r.id === PLAN_ACTIVO_A1)!;
      const nueva = filas.rows.find((r) => r.id === version2Id)!;

      expect(origen.estado).toBe("INACTIVO");
      expect(origen.fecha_fin).not.toBeNull();
      expect(nueva.estado).toBe("ACTIVO");
      expect(nueva.plan_origen_id).toBe(PLAN_ACTIVO_A1);
      expect(nueva.fecha_fin).toBeNull();
      expect(nueva.fecha_inicio.toISOString()).toBe(origen.fecha_inicio.toISOString());

      // Validación de semana con helper de frontend: 10 días corridos => SEMANA 2
      const semana = calcularSemanaPlan(nueva.fecha_inicio.toISOString(), null);
      expect(semana.actual).toBe(2);

      // Conserva soporte GOZS-418 / GOZS-358 (rpe piramidal TEXT + es_unilateral)
      const ej = await db.query<{ rpe_objetivo: string; es_unilateral: boolean }>(
        `SELECT er.rpe_objetivo, er.es_unilateral
         FROM public.ejercicios_en_rutina er
         JOIN public.dias_rutina d ON d.id = er.dia_id
         WHERE d.plan_id = $1`,
        [version2Id],
      );
      expect(ej.rows[0]).toEqual({ rpe_objetivo: "6-7-8-9", es_unilateral: true });
    });

    it("una tercera versión consecutiva sigue conservando el fecha_inicio original", async () => {
      const res = await como<{ id: string }>(
        "authenticated",
        COACH,
        `SELECT public.guardar_rutina($1::jsonb)::text AS id`,
        [
          JSON.stringify({
            plan_id: version2Id,
            como_nueva: true,
            nombre: "Plan Activo A1 v3",
            dias: [
              {
                nombre: "Día 1",
                ejercicios: [{ ejercicio_id: EJ_PRESS, series: 3, repeticiones: "10" }],
              },
            ],
          }),
        ],
      );
      const v3Id = res.rows[0]!.id;

      const row = await db.query<{ fecha_inicio: Date }>(
        `SELECT fecha_inicio FROM public.planes_entrenamiento WHERE id = $1`,
        [v3Id],
      );
      const origRow = await db.query<{ fecha_inicio: Date }>(
        `SELECT fecha_inicio FROM public.planes_entrenamiento WHERE id = $1`,
        [PLAN_ACTIVO_A1],
      );
      expect(row.rows[0]!.fecha_inicio.toISOString()).toBe(origRow.rows[0]!.fecha_inicio.toISOString());
    });

    it("clonar una plantilla con como_nueva = true o crear un plan desde cero usa now() (no hereda fecha antigua)", async () => {
      const copiaRes = await como<{ id: string }>(
        "authenticated",
        COACH,
        `SELECT public.guardar_rutina($1::jsonb)::text AS id`,
        [
          JSON.stringify({
            plan_id: PLANTILLA_NUEVA,
            como_nueva: true,
            nombre: "Plantilla Copiada",
            estado: "ACTIVO",
            dias: [
              {
                nombre: "Día 1",
                ejercicios: [{ ejercicio_id: EJ_PRESS, series: 3, repeticiones: "10" }],
              },
            ],
          }),
        ],
      );
      const copiaId = copiaRes.rows[0]!.id;

      const rows = await db.query<{ id: string; fecha_inicio: Date; alumno_id: string | null }>(
        `SELECT id::text, fecha_inicio, alumno_id::text FROM public.planes_entrenamiento WHERE id IN ($1, $2)`,
        [PLANTILLA_NUEVA, copiaId],
      );
      const plantilla = rows.rows.find((r) => r.id === PLANTILLA_NUEVA)!;
      const copia = rows.rows.find((r) => r.id === copiaId)!;

      expect(copia.alumno_id).toBeNull();
      expect(copia.fecha_inicio.getTime()).toBeGreaterThan(plantilla.fecha_inicio.getTime() + 30 * 86_400_000);
      expect(calcularSemanaPlan(copia.fecha_inicio.toISOString(), null).actual).toBe(1);
    });

    it("asignar_rutina_a_alumno crea un plan.id nuevo con fecha_inicio actual (reinicia a SEMANA 1)", async () => {
      const antesMs = Date.now() - 5_000;
      const res = await como<{ id: string }>(
        "authenticated",
        COACH,
        `SELECT public.asignar_rutina_a_alumno($1, $2)::text AS id`,
        [PLANTILLA_NUEVA, ALUMNO_1],
      );
      const nuevoPlanId = res.rows[0]!.id;
      expect(nuevoPlanId).not.toBe(PLAN_ACTIVO_A1);

      const nuevo = await db.query<{ estado: string; fecha_inicio: Date; fecha_fin: Date | null }>(
        `SELECT estado::text, fecha_inicio, fecha_fin FROM public.planes_entrenamiento WHERE id = $1`,
        [nuevoPlanId],
      );
      expect(nuevo.rows[0]!.estado).toBe("ACTIVO");
      expect(nuevo.rows[0]!.fecha_fin).toBeNull();
      expect(nuevo.rows[0]!.fecha_inicio.getTime()).toBeGreaterThanOrEqual(antesMs);
      expect(calcularSemanaPlan(nuevo.rows[0]!.fecha_inicio.toISOString(), null).actual).toBe(1);
    });
  });

  describe("2. Auditoría RLS y Realtime sobre public.reservas y public.clases", () => {
    let clase1Id: string;
    let clase2Id: string;
    let reservaA1Id: string;
    let reservaA2Id: string;

    beforeAll(async () => {
      // Crear dos clases futuras dentro de la semana en curso (lunes a domingo ART)
      const finSemana = `((date_trunc('week', now() AT TIME ZONE '${TZ}') + interval '7 days') AT TIME ZONE '${TZ}')`;
      const enSemana = (f: number) => `now() + (${finSemana} - now()) * ${f}`;

      const c1 = await db.query<{ id: string }>(
        `INSERT INTO public.clases (actividad, inicio, duracion_minutos, capacidad)
         VALUES ('FUNCIONAL', ${enSemana(0.3)}, 60, 10) RETURNING id`,
      );
      const c2 = await db.query<{ id: string }>(
        `INSERT INTO public.clases (actividad, inicio, duracion_minutos, capacidad)
         VALUES ('BOXEO', ${enSemana(0.6)}, 60, 10) RETURNING id`,
      );
      clase1Id = c1.rows[0]!.id;
      clase2Id = c2.rows[0]!.id;
      await db.query(`INSERT INTO public.clases_profesores (clase_id, profesor_id) VALUES ($1, $2), ($3, $2)`, [
        clase1Id,
        COACH,
        clase2Id,
      ]);

      const r1 = await como<{ reserva_id: string }>(
        "authenticated",
        ALUMNO_1,
        `SELECT reserva_id FROM public.reservar_clase($1)`,
        [clase1Id],
      );
      reservaA1Id = r1.rows[0]!.reserva_id;

      const r2 = await como<{ reserva_id: string }>(
        "authenticated",
        ALUMNO_2,
        `SELECT reserva_id FROM public.reservar_clase($1)`,
        [clase2Id],
      );
      reservaA2Id = r2.rows[0]!.reserva_id;
    });

    it("un alumno autenticado solo ve sus propias reservas activas + datos de la clase (sin fugas entre alumnos)", async () => {
      const consultaProxima = `
        SELECT r.id::text AS reserva_id, r.alumno_id::text, r.estado AS reserva_estado,
               c.id::text AS clase_id, c.actividad, c.estado AS clase_estado
        FROM public.reservas r
        JOIN public.clases c ON c.id = r.clase_id
        WHERE r.estado = 'ANOTADO' AND c.estado = 'PROGRAMADA'
        ORDER BY c.inicio ASC
      `;

      const visA1 = await como<{ reserva_id: string; alumno_id: string; actividad: string }>(
        "authenticated",
        ALUMNO_1,
        consultaProxima,
      );
      expect(visA1.rows).toHaveLength(1);
      expect(visA1.rows[0]!.reserva_id).toBe(reservaA1Id);
      expect(visA1.rows[0]!.alumno_id).toBe(ALUMNO_1);
      expect(visA1.rows[0]!.actividad).toBe("FUNCIONAL");

      // Sin filtrar por alumno_id en WHERE, RLS igualmente impide ver reservas de ALUMNO_2
      const todasA1 = await como<{ id: string }>("authenticated", ALUMNO_1, `SELECT id::text FROM public.reservas`);
      expect(todasA1.rows.map((r) => r.id)).toEqual([reservaA1Id]);

      // anon recibe permission denied (42501) en reservas y clases
      await expect(como("anon", null, `SELECT id FROM public.reservas`)).rejects.toMatchObject({
        code: "42501",
      });
      await expect(como("anon", null, `SELECT id FROM public.clases`)).rejects.toMatchObject({
        code: "42501",
      });
    });

    it("impide escritura directa del alumno en reservas (solo vía RPC)", async () => {
      await expect(
        como("authenticated", ALUMNO_1, `UPDATE public.reservas SET estado = 'CANCELADO' WHERE id = $1`, [reservaA1Id]),
      ).rejects.toThrow(/permission denied/i);
    });

    it("refleja cancelación del alumno (cancelar_reserva) y cancelación de clase por el coach (cancelar_clase)", async () => {
      const consultaActiva = `
        SELECT r.id::text AS reserva_id
        FROM public.reservas r
        JOIN public.clases c ON c.id = r.clase_id
        WHERE r.estado = 'ANOTADO' AND c.estado = 'PROGRAMADA'
      `;

      // Alumno 1 cancela su reserva
      await como("authenticated", ALUMNO_1, `SELECT * FROM public.cancelar_reserva($1)`, [reservaA1Id]);
      const trasBajaA1 = await como("authenticated", ALUMNO_1, consultaActiva);
      expect(trasBajaA1.rows).toHaveLength(0);

      // Coach cancela la clase 2 -> reserva de Alumno 2 pasa a ANULADO y clase a CANCELADA
      await como("authenticated", COACH, `SELECT * FROM public.cancelar_clase($1, 'Lluvia')`, [clase2Id]);
      const trasCancelClaseA2 = await como("authenticated", ALUMNO_2, consultaActiva);
      expect(trasCancelClaseA2.rows).toHaveLength(0);

      const estadoA2 = await como<{ r_estado: string; c_estado: string }>(
        "authenticated",
        ALUMNO_2,
        `SELECT r.estado AS r_estado, c.estado AS c_estado
         FROM public.reservas r JOIN public.clases c ON c.id = r.clase_id
         WHERE r.id = $1`,
        [reservaA2Id],
      );
      expect(estadoA2.rows[0]).toEqual({ r_estado: "ANULADO", c_estado: "CANCELADA" });
    });

    it("public.reservas y public.clases están en la publicación supabase_realtime con REPLICA IDENTITY FULL", async () => {
      const pub = await db.query<{ tablename: string }>(
        `SELECT tablename FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
           AND tablename IN ('reservas', 'clases')
         ORDER BY tablename`,
      );
      expect(pub.rows.map((r) => r.tablename)).toEqual(["clases", "reservas"]);

      const repl = await db.query<{ relname: string; relreplident: string }>(
        `SELECT c.relname, c.relreplident::text
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname IN ('reservas', 'clases')
         ORDER BY c.relname`,
      );
      expect(repl.rows).toEqual([
        { relname: "clases", relreplident: "f" },
        { relname: "reservas", relreplident: "f" },
      ]);
    });
  });
});
