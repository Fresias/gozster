import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// GOZS-637: Agenda Online Real — creación única/recurrente (crear_clases_agenda),
// reactivar_clase, eliminar_clase_vacia, anotar_alumno_coach, quitar_reserva_coach
// y soporte multiactividad / alumno_actividades en reservar_clase.

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const NEW_MIGRATION = "20261120200000_agenda_online_rpc_reactivar_recurrencia.sql";
const TZ = "America/Argentina/Buenos_Aires";

const ADMIN = "00000000-0000-0000-0000-00000000637a";
const COACH_A = "00000000-0000-0000-0000-00000000637b";
const COACH_B = "00000000-0000-0000-0000-00000000637c";
const ALU_LIBRE = "00000000-0000-0000-0000-000000006371";
const ALU_FUNC_ONLY = "00000000-0000-0000-0000-000000006372";
const ALU_MULTI_CONTR = "00000000-0000-0000-0000-000000006373"; // FUNCIONAL + BOXEO (2 contrataciones)
const ALU_ACT_BOXEO = "00000000-0000-0000-0000-000000006374"; // ASESORIA_ONLINE + alumno_actividades(BOXEO)
const ALU_SIN_PLAN = "00000000-0000-0000-0000-000000006375";
const ALU_VENCIDA_ACT = "00000000-0000-0000-0000-000000006376"; // VENCIDA + alumno_actividades(BOXEO)

const PLAN_1_ACT_2X = "20000000-0000-0000-0000-000000006371";
const PLAN_LIBRE = "20000000-0000-0000-0000-000000006372";

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
    ('${ADMIN}','admin637@t'),('${COACH_A}','ca637@t'),('${COACH_B}','cb637@t'),
    ('${ALU_LIBRE}','al1@t'),('${ALU_FUNC_ONLY}','al2@t'),
    ('${ALU_MULTI_CONTR}','al3@t'),('${ALU_ACT_BOXEO}','al4@t'),
    ('${ALU_SIN_PLAN}','al5@t'),('${ALU_VENCIDA_ACT}','al6@t');

  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${ADMIN}','admin637@t','Admin 637','ADMIN',NULL,'ACTIVA'),
    ('${COACH_A}','ca637@t','Coach A','ENTRENADOR',NULL,'ACTIVA'),
    ('${COACH_B}','cb637@t','Coach B','ENTRENADOR',NULL,'ACTIVA'),
    ('${ALU_LIBRE}','al1@t','Alumno Libre','ALUMNO','${COACH_A}','ACTIVA'),
    ('${ALU_FUNC_ONLY}','al2@t','Alumno Funcional','ALUMNO','${COACH_A}','ACTIVA'),
    ('${ALU_MULTI_CONTR}','al3@t','Alumno Multi Contrataciones','ALUMNO','${COACH_A}','ACTIVA'),
    ('${ALU_ACT_BOXEO}','al4@t','Alumno Rutina y Boxeo','ALUMNO','${COACH_A}','ACTIVA'),
    ('${ALU_SIN_PLAN}','al5@t','Alumno Sin Plan','ALUMNO','${COACH_A}','ACTIVA'),
    ('${ALU_VENCIDA_ACT}','al6@t','Alumno Vencida','ALUMNO','${COACH_A}','ACTIVA');

  INSERT INTO public.planes_membresia (id, nombre, limite_semanal, cantidad_actividades, duracion_meses, precio) VALUES
    ('${PLAN_1_ACT_2X}','2 por semana',2,1,1,20000),
    ('${PLAN_LIBRE}','Pase libre',NULL,2,1,35000);

  INSERT INTO public.contrataciones
    (alumno_id, tipo_servicio, dia_vencimiento, fecha_inicio, fecha_fin, estado, plan_membresia_id, actividad) VALUES
    ('${ALU_LIBRE}','PRESENCIAL',5,CURRENT_DATE - 10,CURRENT_DATE + 30,'VIGENTE','${PLAN_LIBRE}',NULL),
    ('${ALU_FUNC_ONLY}','PRESENCIAL',5,CURRENT_DATE - 10,CURRENT_DATE + 30,'VIGENTE','${PLAN_1_ACT_2X}','FUNCIONAL'),
    ('${ALU_MULTI_CONTR}','PRESENCIAL',5,CURRENT_DATE - 10,CURRENT_DATE + 30,'VIGENTE','${PLAN_1_ACT_2X}','FUNCIONAL'),
    ('${ALU_MULTI_CONTR}','PRESENCIAL',5,CURRENT_DATE - 5,CURRENT_DATE + 30,'VIGENTE','${PLAN_1_ACT_2X}','BOXEO'),
    ('${ALU_ACT_BOXEO}','ASESORIA_ONLINE',5,CURRENT_DATE - 10,CURRENT_DATE + 30,'VIGENTE',NULL,NULL),
    ('${ALU_SIN_PLAN}','ASESORIA_ONLINE',5,CURRENT_DATE - 10,CURRENT_DATE + 30,'VIGENTE',NULL,NULL),
    ('${ALU_VENCIDA_ACT}','PRESENCIAL',5,CURRENT_DATE - 40,CURRENT_DATE - 5,'VENCIDA','${PLAN_1_ACT_2X}','BOXEO');

  INSERT INTO public.alumno_actividades (alumno_id, actividad, veces_por_semana, pase_libre) VALUES
    ('${ALU_ACT_BOXEO}','RUTINAS',3,false),
    ('${ALU_ACT_BOXEO}','BOXEO',2,false),
    ('${ALU_VENCIDA_ACT}','BOXEO',2,false);
`;

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

function como<T>(rol: Rol, sub: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub ? { sub, role: rol } : { role: rol }),
    ]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query<T>(sql, params);
  });
}

describe("GOZS-637: Agenda online, recurrencia, reactivar_clase, eliminar_clase_vacia y multiactividad (PGlite)", () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(SUPABASE_STUBS);
    const archivos = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const archivo of archivos) {
      await aplicarMigracion(fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), "utf-8"));
    }
    // Idempotencia de la nueva migración
    await aplicarMigracion(fs.readFileSync(path.join(MIGRATIONS_DIR, NEW_MIGRATION), "utf-8"));
    await db.exec(SEED);
  }, 60_000);

  describe("1. Seguridad de funciones (SECURITY DEFINER, search_path y GRANTS)", () => {
    it("las nuevas RPCs tienen SECURITY DEFINER, search_path=public y permisos restringidos a authenticated/service_role", async () => {
      const nombres = [
        "crear_clases_agenda",
        "reactivar_clase",
        "eliminar_clase_vacia",
        "anotar_alumno_coach",
        "quitar_reserva_coach",
      ];
      const r = await db.query<{ proname: string; secdef: boolean; config: string[] | null }>(
        `SELECT proname, prosecdef AS secdef, proconfig AS config
         FROM pg_proc
         WHERE pronamespace = 'public'::regnamespace AND proname = ANY($1)
         ORDER BY proname`,
        [nombres]
      );
      expect(r.rows).toHaveLength(nombres.length);
      for (const fn of r.rows) {
        expect(fn.secdef).toBe(true);
        expect(fn.config).toContain("search_path=public");
      }

      const privs = await db.query<{ proname: string; anon_exec: boolean; auth_exec: boolean }>(
        `SELECT p.proname,
                has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
                has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
         FROM pg_proc p
         WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY($1)`,
        [nombres]
      );
      for (const p of privs.rows) {
        expect(p.anon_exec).toBe(false);
        expect(p.auth_exec).toBe(true);
      }
    });
  });

  describe("2. crear_clases_agenda (única y recurrente con idempotencia + clases_profesores)", () => {
    it("creación única inserta 1 clase y vincula automáticamente al coach creador en clases_profesores", async () => {
      const res = await como<{ id: string; actividad: string; horario_id: string | null; capacidad: number }>(
        "authenticated",
        COACH_A,
        `SELECT id, actividad, horario_id, capacidad
         FROM public.crear_clases_agenda('BOXEO', ${enSemana(0.5)}, 60, 12)`
      );
      expect(res.rows).toHaveLength(1);
      const claseId = res.rows[0]!.id;
      expect(res.rows[0]!.actividad).toBe("BOXEO");
      expect(res.rows[0]!.horario_id).toBeNull();
      expect(res.rows[0]!.capacidad).toBe(12);

      const profs = await db.query<{ profesor_id: string }>(
        `SELECT profesor_id FROM public.clases_profesores WHERE clase_id = $1`,
        [claseId]
      );
      expect(profs.rows).toEqual([{ profesor_id: COACH_A }]);

      // Gracias al vínculo automático en clases_profesores, Coach A puede editar capacidad sin ser ADMIN
      await como("authenticated", COACH_A, `UPDATE public.clases SET capacidad = 15 WHERE id = $1`, [claseId]);
      const updated = await db.query<{ capacidad: number }>(`SELECT capacidad FROM public.clases WHERE id = $1`, [claseId]);
      expect(updated.rows[0]!.capacidad).toBe(15);
    });

    it("GIVEN un coach creando Boxeo recurrente Lun/Mié/Vie 19:30 WHEN invoca crear_clases_agenda THEN crea horarios e instancias visibles bajo RLS e idempotentes", async () => {
      // Lunes 2026-12-07 a domingo 2026-12-20 (2 semanas exactas: 6 clases Lun/Mié/Vie)
      const res = await como<{ id: string; horario_id: string | null; hora_art: string; dia_iso: number }>(
        "authenticated",
        COACH_A,
        `SELECT id, horario_id,
                to_char(inicio AT TIME ZONE '${TZ}', 'HH24:MI') AS hora_art,
                EXTRACT(ISODOW FROM (inicio AT TIME ZONE '${TZ}'))::int AS dia_iso
         FROM public.crear_clases_agenda(
           p_actividad := 'BOXEO',
           p_duracion_minutos := 60,
           p_capacidad := 10,
           p_recurrente := true,
           p_dias_semana := ARRAY[1, 3, 5]::smallint[],
           p_hora_inicio := '19:30'::time,
           p_fecha_inicio := '2026-12-07'::date,
           p_fecha_fin := '2026-12-20'::date
         )`
      );

      expect(res.rows).toHaveLength(6);
      expect(res.rows.every((r) => r.horario_id !== null)).toBe(true);
      expect(res.rows.every((r) => r.hora_art === "19:30")).toBe(true);
      expect(res.rows.map((r) => r.dia_iso)).toEqual([1, 3, 5, 1, 3, 5]);

      // Verificar clases_profesores automático en las 6 instancias
      const ids = res.rows.map((r) => r.id);
      const profCount = await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM public.clases_profesores WHERE clase_id = ANY($1) AND profesor_id = $2`,
        [ids, COACH_A]
      );
      expect(profCount.rows[0]!.n).toBe(6);

      // Visibilidad bajo RLS del alumno
      const visibles = await como<{ n: number }>(
        "authenticated",
        ALU_LIBRE,
        `SELECT count(*)::int AS n FROM public.clases WHERE id = ANY($1)`,
        [ids]
      );
      expect(visibles.rows[0]!.n).toBe(6);

      // Idempotencia: repetir la misma llamada no genera duplicados en clases ni clases_horario
      const horariosAntes = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.clases_horario`);
      const resDup = await como<{ id: string }>(
        "authenticated",
        COACH_A,
        `SELECT id FROM public.crear_clases_agenda(
           p_actividad := 'BOXEO',
           p_duracion_minutos := 60,
           p_capacidad := 10,
           p_recurrente := true,
           p_dias_semana := ARRAY[1, 3, 5]::smallint[],
           p_hora_inicio := '19:30'::time,
           p_fecha_inicio := '2026-12-07'::date,
           p_fecha_fin := '2026-12-20'::date
         )`
      );
      expect(resDup.rows).toHaveLength(0);
      const horariosDespues = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.clases_horario`);
      expect(horariosDespues.rows[0]!.n).toBe(horariosAntes.rows[0]!.n);
    });

    it("rechaza creación por alumno, anon y parámetros fuera de rango (>12 semanas)", async () => {
      await expect(
        como("authenticated", ALU_LIBRE, `SELECT * FROM public.crear_clases_agenda('FUNCIONAL', now() + interval '1 day')`)
      ).rejects.toMatchObject({ code: "42501" });

      await expect(
        como("anon", null, `SELECT * FROM public.crear_clases_agenda('FUNCIONAL', now() + interval '1 day')`)
      ).rejects.toThrow(/permission denied/);

      await expect(
        como(
          "authenticated",
          COACH_A,
          `SELECT * FROM public.crear_clases_agenda(
             p_actividad := 'FUNCIONAL',
             p_recurrente := true,
             p_dias_semana := ARRAY[2]::smallint[],
             p_hora_inicio := '18:00'::time,
             p_fecha_inicio := '2027-01-04'::date,
             p_semanas := 20
           )`
        )
      ).rejects.toMatchObject({ code: "22023" });
    });
  });

  describe("3. reactivar_clase (des-cancelar y restaurar reservas ANULADO + aviso)", () => {
    it("GIVEN una clase cancelada con alumnos en ANULADO WHEN reactivar_clase THEN clase pasa a PROGRAMADA, ANULADO->ANOTADO, CANCELADO intacto y aviso push", async () => {
      const created = await como<{ id: string }>(
        "authenticated",
        COACH_A,
        `SELECT id FROM public.crear_clases_agenda('FUNCIONAL', ${enSemana(0.45)}, 60, 10)`
      );
      const claseId = created.rows[0]!.id;

      // Alumno Libre reserva y queda ANOTADO; Alumno Funcional reserva y cancela voluntariamente
      const r1 = await como<{ reserva_id: string }>(
        "authenticated",
        ALU_LIBRE,
        `SELECT reserva_id FROM public.reservar_clase($1)`,
        [claseId]
      );
      const r2 = await como<{ reserva_id: string }>(
        "authenticated",
        ALU_FUNC_ONLY,
        `SELECT reserva_id FROM public.reservar_clase($1)`,
        [claseId]
      );
      await como("authenticated", ALU_FUNC_ONLY, `SELECT * FROM public.cancelar_reserva($1)`, [r2.rows[0]!.reserva_id]);

      await como("authenticated", COACH_A, `SELECT * FROM public.cancelar_clase_con_aviso($1, 'Lluvia fuerte', true)`, [
        claseId,
      ]);

      const msgsAntesA2 = await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM public.mensajes m JOIN public.conversaciones c ON c.id = m.conversacion_id WHERE c.alumno_id = $1`,
        [ALU_FUNC_ONLY]
      );

      // Reactivar la clase
      const reactivada = await como<{ estado: string; motivo_cancelacion: string | null }>(
        "authenticated",
        COACH_A,
        `SELECT estado, motivo_cancelacion FROM public.reactivar_clase($1)`,
        [claseId]
      );
      expect(reactivada.rows[0]).toEqual({ estado: "PROGRAMADA", motivo_cancelacion: null });

      const reservas = await db.query<{ id: string; estado: string }>(
        `SELECT id, estado FROM public.reservas WHERE clase_id = $1 ORDER BY alumno_id`,
        [claseId]
      );
      expect(reservas.rows).toEqual([
        { id: r1.rows[0]!.reserva_id, estado: "ANOTADO" },
        { id: r2.rows[0]!.reserva_id, estado: "CANCELADO" },
      ]);

      // Alumno restaurado recibe mensaje con requiere_lectura_inicio = true
      const msgsA1 = await db.query<{ contenido: string; requiere_lectura_inicio: boolean; leido: boolean }>(
        `SELECT m.contenido, m.requiere_lectura_inicio, m.leido
         FROM public.mensajes m
         JOIN public.conversaciones c ON c.id = m.conversacion_id
         WHERE c.alumno_id = $1
         ORDER BY m.created_at DESC LIMIT 1`,
        [ALU_LIBRE]
      );
      expect(msgsA1.rows[0]!.requiere_lectura_inicio).toBe(true);
      expect(msgsA1.rows[0]!.leido).toBe(false);
      expect(msgsA1.rows[0]!.contenido).toContain("volvió a programarse");

      // Alumno que canceló voluntariamente no recibe aviso
      const msgsDespuesA2 = await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM public.mensajes m JOIN public.conversaciones c ON c.id = m.conversacion_id WHERE c.alumno_id = $1`,
        [ALU_FUNC_ONLY]
      );
      expect(msgsDespuesA2.rows[0]!.n).toBe(msgsAntesA2.rows[0]!.n);
    });

    it("rechaza reactivar una clase que ya está PROGRAMADA o sin permisos", async () => {
      const created = await como<{ id: string }>(
        "authenticated",
        COACH_A,
        `SELECT id FROM public.crear_clases_agenda('BOXEO', ${enSemana(0.52)}, 60, 10)`
      );
      const claseId = created.rows[0]!.id;

      await expect(
        como("authenticated", COACH_A, `SELECT * FROM public.reactivar_clase($1)`, [claseId])
      ).rejects.toMatchObject({ code: "22023" });

      await como("authenticated", COACH_A, `SELECT * FROM public.cancelar_clase($1, 'Motivo')`, [claseId]);

      await expect(
        como("authenticated", COACH_B, `SELECT * FROM public.reactivar_clase($1)`, [claseId])
      ).rejects.toMatchObject({ code: "42501" });

      await expect(
        como("authenticated", ALU_LIBRE, `SELECT * FROM public.reactivar_clase($1)`, [claseId])
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  describe("4. eliminar_clase_vacia", () => {
    it("elimina una clase con 0 inscriptos activos (incluso si tuvo reservas CANCELADO/ANULADO)", async () => {
      const created = await como<{ id: string }>(
        "authenticated",
        COACH_A,
        `SELECT id FROM public.crear_clases_agenda('FUNCIONAL', ${enSemana(0.6)}, 60, 10)`
      );
      const claseId = created.rows[0]!.id;

      const r = await como<{ reserva_id: string }>(
        "authenticated",
        ALU_LIBRE,
        `SELECT reserva_id FROM public.reservar_clase($1)`,
        [claseId]
      );
      await como("authenticated", ALU_LIBRE, `SELECT * FROM public.cancelar_reserva($1)`, [r.rows[0]!.reserva_id]);

      const deleted = await como<{ ok: boolean }>(
        "authenticated",
        COACH_A,
        `SELECT public.eliminar_clase_vacia($1) AS ok`,
        [claseId]
      );
      expect(deleted.rows[0]!.ok).toBe(true);

      const exists = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.clases WHERE id = $1`, [claseId]);
      expect(exists.rows[0]!.n).toBe(0);
    });

    it("falla si la clase tiene al menos 1 inscripto activo (ANOTADO/AUSENTE) o falta de permisos", async () => {
      const created = await como<{ id: string }>(
        "authenticated",
        COACH_A,
        `SELECT id FROM public.crear_clases_agenda('FUNCIONAL', ${enSemana(0.62)}, 60, 10)`
      );
      const claseId = created.rows[0]!.id;

      await como("authenticated", ALU_LIBRE, `SELECT * FROM public.reservar_clase($1)`, [claseId]);

      await expect(
        como("authenticated", COACH_A, `SELECT public.eliminar_clase_vacia($1)`, [claseId])
      ).rejects.toMatchObject({ code: "GZ010" });

      await expect(
        como("authenticated", COACH_B, `SELECT public.eliminar_clase_vacia($1)`, [claseId])
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  describe("5. anotar_alumno_coach, quitar_reserva_coach y multiactividad en reservar_clase", () => {
    it("alumno con multiactividad (2 contrataciones: FUNCIONAL + BOXEO) puede ser anotado y reservar Boxeo", async () => {
      const created = await como<{ id: string }>(
        "authenticated",
        COACH_A,
        `SELECT id FROM public.crear_clases_agenda('BOXEO', ${enSemana(0.65)}, 60, 10)`
      );
      const boxeoId = created.rows[0]!.id;

      // Coach anota con anotar_alumno_coach sin forzar -> ok directo
      const coachRes = await como<{
        reserva_id: string | null;
        requiere_confirmacion: boolean;
        tipo_aviso: string;
        sobrecupo: boolean;
      }>("authenticated", COACH_A, `SELECT * FROM public.anotar_alumno_coach($1, $2, false)`, [
        boxeoId,
        ALU_MULTI_CONTR,
      ]);
      expect(coachRes.rows[0]!.reserva_id).toBeTruthy();
      expect(coachRes.rows[0]!.requiere_confirmacion).toBe(false);
      expect(coachRes.rows[0]!.tipo_aviso).toBe("NINGUNO");

      // Coach quita esa reserva -> queda CANCELADO y alumno puede reservar por sí mismo vía reservar_clase
      const quitada = await como<{ estado: string }>(
        "authenticated",
        COACH_A,
        `SELECT estado FROM public.quitar_reserva_coach($1)`,
        [coachRes.rows[0]!.reserva_id]
      );
      expect(quitada.rows[0]!.estado).toBe("CANCELADO");

      const reservaPropia = await como<{ reserva_id: string; aviso: string | null }>(
        "authenticated",
        ALU_MULTI_CONTR,
        `SELECT reserva_id, aviso FROM public.reservar_clase($1)`,
        [boxeoId]
      );
      expect(reservaPropia.rows[0]!.reserva_id).toBeTruthy();
    });

    it("alumno con ASESORIA_ONLINE + alumno_actividades(BOXEO, 2x) puede ser anotado y reservar Boxeo hasta 2x/semana", async () => {
      const c1 = (
        await como<{ id: string }>(
          "authenticated",
          COACH_A,
          `SELECT id FROM public.crear_clases_agenda('BOXEO', ${enSemana(0.7)}, 60, 10)`
        )
      ).rows[0]!.id;
      const c2 = (
        await como<{ id: string }>(
          "authenticated",
          COACH_A,
          `SELECT id FROM public.crear_clases_agenda('BOXEO', ${enSemana(0.75)}, 60, 10)`
        )
      ).rows[0]!.id;
      const c3 = (
        await como<{ id: string }>(
          "authenticated",
          COACH_A,
          `SELECT id FROM public.crear_clases_agenda('BOXEO', ${enSemana(0.8)}, 60, 10)`
        )
      ).rows[0]!.id;
      const cFunc = (
        await como<{ id: string }>(
          "authenticated",
          COACH_A,
          `SELECT id FROM public.crear_clases_agenda('FUNCIONAL', ${enSemana(0.82)}, 60, 10)`
        )
      ).rows[0]!.id;

      // 1ra clase anotada por coach (sin forzar)
      const a1 = await como<{ reserva_id: string | null; requiere_confirmacion: boolean }>(
        "authenticated",
        COACH_A,
        `SELECT reserva_id, requiere_confirmacion FROM public.anotar_alumno_coach($1, $2, false)`,
        [c1, ALU_ACT_BOXEO]
      );
      expect(a1.rows[0]!.requiere_confirmacion).toBe(false);
      expect(a1.rows[0]!.reserva_id).toBeTruthy();

      // 2da clase reservada por el propio alumno vía reservar_clase
      const r2 = await como<{ reserva_id: string }>(
        "authenticated",
        ALU_ACT_BOXEO,
        `SELECT reserva_id FROM public.reservar_clase($1)`,
        [c2]
      );
      expect(r2.rows[0]!.reserva_id).toBeTruthy();

      // 3ra clase de Boxeo excede su frecuencia 2x/semana (GZ002)
      await expect(
        como("authenticated", ALU_ACT_BOXEO, `SELECT * FROM public.reservar_clase($1)`, [c3])
      ).rejects.toMatchObject({ code: "GZ002" });

      // Funcional no está en alumno_actividades -> falla en reservar_clase (GZ004 sin plan presencial de Funcional)
      await expect(
        como("authenticated", ALU_ACT_BOXEO, `SELECT * FROM public.reservar_clase($1)`, [cFunc])
      ).rejects.toMatchObject({ code: "GZ004" });
    });

    it("alumno con suscripción VENCIDA no puede reservar aunque tenga fila en alumno_actividades", async () => {
      const c = (
        await como<{ id: string }>(
          "authenticated",
          COACH_A,
          `SELECT id FROM public.crear_clases_agenda('BOXEO', ${enSemana(0.84)}, 60, 10)`
        )
      ).rows[0]!.id;

      await expect(
        como("authenticated", ALU_VENCIDA_ACT, `SELECT * FROM public.reservar_clase($1)`, [c])
      ).rejects.toMatchObject({ code: "GZ004" });
    });

    it("anotar_alumno_coach advierte sin insertar cuando p_forzar=false y permite forzar con p_forzar=true (sin suscripción, otra actividad y sobrecupo)", async () => {
      const boxeoLlena = (
        await como<{ id: string }>(
          "authenticated",
          COACH_A,
          `SELECT id FROM public.crear_clases_agenda('BOXEO', ${enSemana(0.88)}, 60, 1)`
        )
      ).rows[0]!.id;

      // 1) Sin suscripción (ALU_SIN_PLAN): p_forzar=false pide confirmación, p_forzar=true inserta
      const warnSin = await como<{
        reserva_id: string | null;
        requiere_confirmacion: boolean;
        tipo_aviso: string;
        aviso: string | null;
      }>("authenticated", COACH_A, `SELECT * FROM public.anotar_alumno_coach($1, $2, false)`, [
        boxeoLlena,
        ALU_SIN_PLAN,
      ]);
      expect(warnSin.rows[0]!.reserva_id).toBeNull();
      expect(warnSin.rows[0]!.requiere_confirmacion).toBe(true);
      expect(warnSin.rows[0]!.tipo_aviso).toBe("SIN_SUSCRIPCION");

      const okSin = await como<{ reserva_id: string | null; requiere_confirmacion: boolean }>(
        "authenticated",
        COACH_A,
        `SELECT reserva_id, requiere_confirmacion FROM public.anotar_alumno_coach($1, $2, true)`,
        [boxeoLlena, ALU_SIN_PLAN]
      );
      expect(okSin.rows[0]!.reserva_id).toBeTruthy();
      expect(okSin.rows[0]!.requiere_confirmacion).toBe(false);

      // Ahora la clase está llena (1/1).
      // 2) Otra actividad (ALU_FUNC_ONLY en BOXEO): p_forzar=false pide confirmación (ACTIVIDAD_DISTINTA + sobrecupo)
      const warnAct = await como<{
        reserva_id: string | null;
        requiere_confirmacion: boolean;
        tipo_aviso: string;
        sobrecupo: boolean;
      }>("authenticated", COACH_A, `SELECT * FROM public.anotar_alumno_coach($1, $2, false)`, [
        boxeoLlena,
        ALU_FUNC_ONLY,
      ]);
      expect(warnAct.rows[0]!.reserva_id).toBeNull();
      expect(warnAct.rows[0]!.requiere_confirmacion).toBe(true);
      expect(warnAct.rows[0]!.tipo_aviso).toBe("ACTIVIDAD_DISTINTA");
      expect(warnAct.rows[0]!.sobrecupo).toBe(true);

      // 3) Sobrecupo puro (ALU_LIBRE en clase llena): p_forzar=false pide confirmación SOBRECUPO, p_forzar=true anota con sobrecupo=true
      const warnCupo = await como<{
        reserva_id: string | null;
        requiere_confirmacion: boolean;
        tipo_aviso: string;
        sobrecupo: boolean;
      }>("authenticated", COACH_A, `SELECT * FROM public.anotar_alumno_coach($1, $2, false)`, [
        boxeoLlena,
        ALU_LIBRE,
      ]);
      expect(warnCupo.rows[0]!.reserva_id).toBeNull();
      expect(warnCupo.rows[0]!.requiere_confirmacion).toBe(true);
      expect(warnCupo.rows[0]!.tipo_aviso).toBe("SOBRECUPO");
      expect(warnCupo.rows[0]!.sobrecupo).toBe(true);

      const okCupo = await como<{
        reserva_id: string | null;
        requiere_confirmacion: boolean;
        sobrecupo: boolean;
      }>("authenticated", COACH_A, `SELECT * FROM public.anotar_alumno_coach($1, $2, true)`, [
        boxeoLlena,
        ALU_LIBRE,
      ]);
      expect(okCupo.rows[0]!.reserva_id).toBeTruthy();
      expect(okCupo.rows[0]!.requiere_confirmacion).toBe(false);
      expect(okCupo.rows[0]!.sobrecupo).toBe(true);

      // Coach B (ajeno ni profesor) no puede quitar la reserva ni anotar
      await expect(
        como("authenticated", COACH_B, `SELECT * FROM public.quitar_reserva_coach($1)`, [okCupo.rows[0]!.reserva_id])
      ).rejects.toMatchObject({ code: "42501" });
    });
  });
});
