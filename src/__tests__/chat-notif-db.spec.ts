import { beforeAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { aplicarMigracion, crearDbMigrada, MIGRATIONS_DIR } from "./helpers/pglite-migrada";

const NEW_MIGRATION = "20261120140000_chat_requiere_lectura_y_cancelacion_aviso.sql";
const TZ = "America/Argentina/Buenos_Aires";

const ADMIN = "00000000-0000-0000-0000-0000000000ad";
const COACH = "00000000-0000-0000-0000-00000000c0ac";
const OTRO_COACH = "00000000-0000-0000-0000-0000000000c2";
const ALUMNO_1 = "00000000-0000-0000-0000-0000000000a1";
const ALUMNO_2 = "00000000-0000-0000-0000-0000000000a2";
const ALUMNO_3 = "00000000-0000-0000-0000-0000000000a3";
const ALUMNO_AJENO = "00000000-0000-0000-0000-0000000000a4";
const PLAN_LIBRE = "20000000-0000-0000-0000-000000000002";

type Rol = "anon" | "authenticated" | "service_role";

const SEED = `
  INSERT INTO auth.users (id, email) VALUES
    ('${ADMIN}', 'admin@t'),
    ('${COACH}', 'coach@t'),
    ('${OTRO_COACH}', 'coach2@t'),
    ('${ALUMNO_1}', 'a1@t'),
    ('${ALUMNO_2}', 'a2@t'),
    ('${ALUMNO_3}', 'a3@t'),
    ('${ALUMNO_AJENO}', 'a4@t');

  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${ADMIN}', 'admin@t', 'Admin', 'ADMIN', NULL, 'ACTIVA'),
    ('${COACH}', 'coach@t', 'Coach Principal', 'ENTRENADOR', NULL, 'ACTIVA'),
    ('${OTRO_COACH}', 'coach2@t', 'Otro Coach', 'ENTRENADOR', NULL, 'ACTIVA'),
    ('${ALUMNO_1}', 'a1@t', 'Alumno Uno', 'ALUMNO', '${COACH}', 'ACTIVA'),
    ('${ALUMNO_2}', 'a2@t', 'Alumno Dos', 'ALUMNO', '${COACH}', 'ACTIVA'),
    ('${ALUMNO_3}', 'a3@t', 'Alumno Tres', 'ALUMNO', '${COACH}', 'ACTIVA'),
    ('${ALUMNO_AJENO}', 'a4@t', 'Alumno Ajeno', 'ALUMNO', '${OTRO_COACH}', 'ACTIVA');

  INSERT INTO public.planes_membresia (id, nombre, limite_semanal, cantidad_actividades, duracion_meses, precio) VALUES
    ('${PLAN_LIBRE}', 'Pase libre', NULL, 2, 1, 35000);

  INSERT INTO public.contrataciones
    (alumno_id, tipo_servicio, dia_vencimiento, fecha_inicio, fecha_fin, estado, plan_membresia_id, actividad) VALUES
    ('${ALUMNO_1}', 'PRESENCIAL', 5, CURRENT_DATE - 10, CURRENT_DATE + 30, 'VIGENTE', '${PLAN_LIBRE}', NULL),
    ('${ALUMNO_2}', 'PRESENCIAL', 5, CURRENT_DATE - 10, CURRENT_DATE + 30, 'VIGENTE', '${PLAN_LIBRE}', NULL),
    ('${ALUMNO_3}', 'PRESENCIAL', 5, CURRENT_DATE - 10, CURRENT_DATE + 30, 'VIGENTE', '${PLAN_LIBRE}', NULL),
    ('${ALUMNO_AJENO}', 'PRESENCIAL', 5, CURRENT_DATE - 10, CURRENT_DATE + 30, 'VIGENTE', '${PLAN_LIBRE}', NULL);
`;

const FIN_SEMANA = `((date_trunc('week', now() AT TIME ZONE '${TZ}') + interval '7 days') AT TIME ZONE '${TZ}')`;
const enSemana = (f: number) => `now() + (${FIN_SEMANA} - now()) * ${f}`;

let db: PGlite;

function como<T>(rol: Rol, sub: string | null, sql: string) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub ? { sub, role: rol } : { role: rol }),
    ]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query<T>(sql);
  });
}

async function crearClase(inicio: string, profesores: string[] = [COACH]): Promise<string> {
  const r = await db.query<{ id: string }>(
    `INSERT INTO public.clases (actividad, inicio, duracion_minutos, capacidad)
     VALUES ('FUNCIONAL', ${inicio}, 60, 10) RETURNING id`
  );
  const id = r.rows[0]!.id;
  for (const p of profesores) {
    await db.query(`INSERT INTO public.clases_profesores (clase_id, profesor_id) VALUES ('${id}', '${p}')`);
  }
  return id;
}

describe("GOZS-626: requiere_lectura_inicio, Realtime, marcar_mensajes_leidos y cancelar_clase_con_aviso (PGlite)", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
    // Idempotencia de la nueva migración
    await aplicarMigracion(db, fs.readFileSync(path.join(MIGRATIONS_DIR, NEW_MIGRATION), "utf-8"));
    await db.exec(SEED);
  }, 60_000);

  describe("1. Esquema, índice parcial y publicación supabase_realtime", () => {
    it("GIVEN un mensaje insertado sin especificar requiere_lectura_inicio WHEN se consulta en Postgres THEN requiere_lectura_inicio es false y leido es false", async () => {
      const convRes = await como<{ id: string }>(
        "authenticated",
        COACH,
        `SELECT public.obtener_o_crear_conversacion('${ALUMNO_1}') AS id`
      );
      const convId = convRes.rows[0]!.id;

      const msgRes = await como<{ requiere_lectura_inicio: boolean; leido: boolean }>(
        "authenticated",
        COACH,
        `INSERT INTO public.mensajes (conversacion_id, remitente_id, contenido)
         VALUES ('${convId}', '${COACH}', 'Mensaje normal de seguimiento')
         RETURNING requiere_lectura_inicio, leido`
      );

      expect(msgRes.rows[0]).toEqual({ requiere_lectura_inicio: false, leido: false });
    });

    it("permite insertar explícitamente con requiere_lectura_inicio = true", async () => {
      const convRes = await como<{ id: string }>(
        "authenticated",
        COACH,
        `SELECT public.obtener_o_crear_conversacion('${ALUMNO_1}') AS id`
      );
      const convId = convRes.rows[0]!.id;

      const msgRes = await como<{ requiere_lectura_inicio: boolean; leido: boolean }>(
        "authenticated",
        COACH,
        `INSERT INTO public.mensajes (conversacion_id, remitente_id, contenido, requiere_lectura_inicio)
         VALUES ('${convId}', '${COACH}', 'Aviso importante para leer al inicio', true)
         RETURNING requiere_lectura_inicio, leido`
      );

      expect(msgRes.rows[0]).toEqual({ requiere_lectura_inicio: true, leido: false });
    });

    it("crea el índice parcial idx_mensajes_push_inicio_no_leidos y configura supabase_realtime + REPLICA IDENTITY FULL", async () => {
      const idx = await db.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'mensajes' AND indexname = 'idx_mensajes_push_inicio_no_leidos'`
      );
      expect(idx.rows).toHaveLength(1);
      expect(idx.rows[0]!.indexdef).toContain("WHERE ((requiere_lectura_inicio = true) AND (leido = false))");

      const replica = await db.query<{ relreplident: string }>(
        `SELECT relreplident FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = 'mensajes'`
      );
      expect(replica.rows[0]!.relreplident).toBe("f");

      const pub = await db.query<{ tablename: string; pubinsert: boolean; pubupdate: boolean }>(
        `SELECT pt.tablename, p.pubinsert, p.pubupdate
         FROM pg_publication_tables pt
         JOIN pg_publication p ON p.pubname = pt.pubname
         WHERE pt.pubname = 'supabase_realtime' AND pt.schemaname = 'public'
           AND pt.tablename IN ('conversaciones', 'mensajes')
         ORDER BY pt.tablename`
      );
      expect(pub.rows).toEqual([
        { tablename: "conversaciones", pubinsert: true, pubupdate: true },
        { tablename: "mensajes", pubinsert: true, pubupdate: true },
      ]);
    });
  });

  describe("2. Lectura unidireccional vía marcar_mensajes_leidos", () => {
    it("GIVEN un mensaje del entrenador con requiere_lectura_inicio = true y leido = false WHEN el alumno ejecuta marcar_mensajes_leidos THEN leido pasa a true únicamente en mensajes donde remitente_id <> auth.uid()", async () => {
      const convRes = await como<{ id: string }>(
        "authenticated",
        ALUMNO_2,
        `SELECT public.obtener_o_crear_conversacion('${ALUMNO_2}') AS id`
      );
      const convId = convRes.rows[0]!.id;

      // Coach envía mensaje normal + mensaje pusheado
      await como(
        "authenticated",
        COACH,
        `INSERT INTO public.mensajes (conversacion_id, remitente_id, contenido, requiere_lectura_inicio)
         VALUES
           ('${convId}', '${COACH}', 'Hola alumno 2', false),
           ('${convId}', '${COACH}', 'Aviso urgente inicio', true)`
      );

      // Alumno envía su propio mensaje (queda con leido = false)
      await como(
        "authenticated",
        ALUMNO_2,
        `INSERT INTO public.mensajes (conversacion_id, remitente_id, contenido)
         VALUES ('${convId}', '${ALUMNO_2}', 'Recibido profe')`
      );

      // Alumno marca mensajes recibidos como leídos
      const res = await como<{ count: number }>(
        "authenticated",
        ALUMNO_2,
        `SELECT public.marcar_mensajes_leidos('${convId}') AS count`
      );
      expect(res.rows[0]!.count).toBe(2);

      const estado = await como<{ remitente_id: string; leido: boolean; requiere_lectura_inicio: boolean }>(
        "authenticated",
        ALUMNO_2,
        `SELECT remitente_id, leido, requiere_lectura_inicio
         FROM public.mensajes
         WHERE conversacion_id = '${convId}'
         ORDER BY created_at ASC, contenido ASC`
      );
      expect(estado.rows.filter((m) => m.remitente_id === COACH).every((m) => m.leido === true)).toBe(true);
      expect(estado.rows.filter((m) => m.remitente_id === ALUMNO_2).every((m) => m.leido === false)).toBe(true);
    });

    it("rechaza ejecución anónima, sin sub y de usuarios no participantes", async () => {
      const convRes = await como<{ id: string }>(
        "authenticated",
        ALUMNO_2,
        `SELECT public.obtener_o_crear_conversacion('${ALUMNO_2}') AS id`
      );
      const convId = convRes.rows[0]!.id;

      await expect(
        como("anon", null, `SELECT public.marcar_mensajes_leidos('${convId}')`)
      ).rejects.toThrow(/permission denied/);

      await expect(
        como("authenticated", null, `SELECT public.marcar_mensajes_leidos('${convId}')`)
      ).rejects.toMatchObject({ code: "42501" });

      await expect(
        como("authenticated", ALUMNO_AJENO, `SELECT public.marcar_mensajes_leidos('${convId}')`)
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  describe("3. Cancelación de clase con aviso in-app", () => {
    it("GIVEN una clase con 2 alumnos ANOTADO y 1 CANCELADO WHEN el entrenador ejecuta cancelar_clase_con_aviso con push habilitado THEN anula las 2 activas e inserta mensaje pusheado solo para los 2 anotados", async () => {
      const claseId = await crearClase(enSemana(0.4), [COACH]);

      await como("authenticated", ALUMNO_1, `SELECT * FROM public.reservar_clase('${claseId}')`);
      await como("authenticated", ALUMNO_2, `SELECT * FROM public.reservar_clase('${claseId}')`);
      const r3 = await como<{ reserva_id: string }>(
        "authenticated",
        ALUMNO_3,
        `SELECT reserva_id FROM public.reservar_clase('${claseId}')`
      );
      await como("authenticated", ALUMNO_3, `SELECT * FROM public.cancelar_reserva('${r3.rows[0]!.reserva_id}')`);

      const msgsAntesA3 = await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM public.mensajes m JOIN public.conversaciones c ON c.id = m.conversacion_id WHERE c.alumno_id = '${ALUMNO_3}'`
      );

      await como(
        "authenticated",
        COACH,
        `SELECT * FROM public.cancelar_clase_con_aviso('${claseId}', 'Corte de luz en el gimnasio', true)`
      );

      const claseRow = await db.query<{ estado: string; motivo_cancelacion: string }>(
        `SELECT estado, motivo_cancelacion FROM public.clases WHERE id = '${claseId}'`
      );
      expect(claseRow.rows[0]).toEqual({
        estado: "CANCELADA",
        motivo_cancelacion: "Corte de luz en el gimnasio",
      });

      const reservas = await db.query<{ alumno_id: string; estado: string }>(
        `SELECT alumno_id, estado FROM public.reservas WHERE clase_id = '${claseId}' ORDER BY alumno_id`
      );
      expect(reservas.rows).toEqual([
        { alumno_id: ALUMNO_1, estado: "ANULADO" },
        { alumno_id: ALUMNO_2, estado: "ANULADO" },
        { alumno_id: ALUMNO_3, estado: "CANCELADO" },
      ]);

      for (const alumnoId of [ALUMNO_1, ALUMNO_2]) {
        const msgs = await como<{ contenido: string; requiere_lectura_inicio: boolean; leido: boolean; remitente_id: string }>(
          "authenticated",
          alumnoId,
          `SELECT m.contenido, m.requiere_lectura_inicio, m.leido, m.remitente_id
           FROM public.mensajes m
           JOIN public.conversaciones c ON c.id = m.conversacion_id
           WHERE c.alumno_id = '${alumnoId}'
           ORDER BY m.created_at DESC
           LIMIT 1`
        );
        expect(msgs.rows[0]).toMatchObject({
          requiere_lectura_inicio: true,
          leido: false,
          remitente_id: COACH,
        });
        expect(msgs.rows[0]!.contenido).toContain("cancelada");
        expect(msgs.rows[0]!.contenido).toContain("Corte de luz en el gimnasio");
      }

      const msgsDespuesA3 = await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM public.mensajes m JOIN public.conversaciones c ON c.id = m.conversacion_id WHERE c.alumno_id = '${ALUMNO_3}'`
      );
      expect(msgsDespuesA3.rows[0]!.n).toBe(msgsAntesA3.rows[0]!.n);
    });

    it("permite cancelar con p_pushear_inicio = false (mensaje en chat sin push de inicio) y también notifica a alumno asignado a otro coach", async () => {
      const claseId = await crearClase(enSemana(0.5), [COACH]);
      await como("authenticated", ALUMNO_AJENO, `SELECT * FROM public.reservar_clase('${claseId}')`);

      await como(
        "authenticated",
        COACH,
        `SELECT * FROM public.cancelar_clase_con_aviso('${claseId}', NULL, false)`
      );

      const msgs = await como<{ contenido: string; requiere_lectura_inicio: boolean; leido: boolean }>(
        "authenticated",
        ALUMNO_AJENO,
        `SELECT m.contenido, m.requiere_lectura_inicio, m.leido
         FROM public.mensajes m
         JOIN public.conversaciones c ON c.id = m.conversacion_id
         WHERE c.alumno_id = '${ALUMNO_AJENO}'
         ORDER BY m.created_at DESC
         LIMIT 1`
      );
      expect(msgs.rows[0]).toMatchObject({
        requiere_lectura_inicio: false,
        leido: false,
      });
      expect(msgs.rows[0]!.contenido).toContain("cancelada");
    });

    it("mantiene compatibilidad de 2 parámetros en cancelar_clase(p_clase_id, p_motivo) enviando aviso pusheado por defecto", async () => {
      const claseId = await crearClase(enSemana(0.6), [COACH]);
      await como("authenticated", ALUMNO_3, `SELECT * FROM public.reservar_clase('${claseId}')`);

      await como(
        "authenticated",
        COACH,
        `SELECT * FROM public.cancelar_clase('${claseId}', 'Feriado nacional')`
      );

      const msgs = await como<{ contenido: string; requiere_lectura_inicio: boolean }>(
        "authenticated",
        ALUMNO_3,
        `SELECT m.contenido, m.requiere_lectura_inicio
         FROM public.mensajes m
         JOIN public.conversaciones c ON c.id = m.conversacion_id
         WHERE c.alumno_id = '${ALUMNO_3}'
         ORDER BY m.created_at DESC
         LIMIT 1`
      );
      expect(msgs.rows[0]!.requiere_lectura_inicio).toBe(true);
      expect(msgs.rows[0]!.contenido).toContain("Feriado nacional");
    });
  });
});
