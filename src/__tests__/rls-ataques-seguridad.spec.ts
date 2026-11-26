import { beforeAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { aplicarMigracion, crearDbMigrada, MIGRATIONS_DIR } from "./helpers/pglite-migrada";

type Rol = "anon" | "authenticated" | "service_role";

const ADMIN = "00000000-0000-0000-0000-0000000000ad";
const A1 = "00000000-0000-0000-0000-0000000000a1";
const A2 = "00000000-0000-0000-0000-0000000000a2";
const C1 = "00000000-0000-0000-0000-0000000000c1";
const C2_APOYO = "00000000-0000-0000-0000-0000000758c2";

const EJERCICIO_1 = "11111111-1111-4111-8111-111111111101";
const PLANTILLA_ID = "22222222-2222-4222-8222-222222222201";
const DIA_PLANTILLA_ID = "22222222-2222-4222-8222-222222222202";
const PLAN_A1_ID = "33333333-3333-4333-8333-333333333333";

const MEMBRESIA_ID = "44444444-4444-4444-8444-444444444401";
const CONTR_A1_ID = "44444444-4444-4444-8444-444444444411";
const CONTR_A2_ID = "44444444-4444-4444-8444-444444444412";
const COBRO_A1_ID = "55555555-5555-4555-8555-555555555511";
const COBRO_A2_ID = "55555555-5555-4555-8555-555555555512";

const SESION_A1_ID = "66666666-6666-4666-8666-666666666611";
const SESION_A2_ID = "66666666-6666-4666-8666-666666666612";
const CONV_A1_ID = "77777777-7777-4777-8777-777777777711";
const CONV_A2_ID = "77777777-7777-4777-8777-777777777712";
const CLASE_ID = "88888888-8888-4888-8888-888888888801";
const RESERVA_A1_ID = "88888888-8888-4888-8888-888888888811";
const RESERVA_A2_ID = "88888888-8888-4888-8888-888888888812";

const SEED = `
  INSERT INTO auth.users (id, email, raw_app_meta_data) VALUES
    ('${ADMIN}', 'admin@test.local', '{"rol":"ADMIN"}'),
    ('${C1}', 'coach@test.local', '{"rol":"ENTRENADOR"}'),
    ('${A1}', 'alumno1@test.local', '{"rol":"ALUMNO"}'),
    ('${A2}', 'alumno2@test.local', '{"rol":"ALUMNO"}');

  INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia, profesor_asignado_id) VALUES
    ('${ADMIN}', 'admin@test.local', 'Admin Test', 'ADMIN', 'ACTIVA', NULL),
    ('${C1}', 'coach@test.local', 'Coach Uno', 'ENTRENADOR', 'ACTIVA', NULL),
    ('${A1}', 'alumno1@test.local', 'Alumno Uno', 'ALUMNO', 'ACTIVA', '${C1}'),
    ('${A2}', 'alumno2@test.local', 'Alumno Dos', 'ALUMNO', 'ACTIVA', NULL)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    nombre_completo = EXCLUDED.nombre_completo,
    rol = EXCLUDED.rol,
    estado_membresia = EXCLUDED.estado_membresia,
    profesor_asignado_id = EXCLUDED.profesor_asignado_id;

  INSERT INTO public.ejercicios (id, nombre) VALUES
    ('${EJERCICIO_1}', 'Sentadilla Test');

  -- profesor_id NULL reproduce plantillas legacy y cubre comparaciones de tres valores con NULL.
  INSERT INTO public.planes_entrenamiento (id, profesor_id, alumno_id, nombre, estado, tipo) VALUES
    ('${PLANTILLA_ID}', NULL, NULL, 'Plantilla Base', 'BORRADOR', 'PLANTILLA');

  INSERT INTO public.dias_rutina (id, plan_id, nombre, orden) VALUES
    ('${DIA_PLANTILLA_ID}', '${PLANTILLA_ID}', 'Día 1', 1);

  INSERT INTO public.ejercicios_en_rutina (dia_id, ejercicio_id, orden, series, repeticiones) VALUES
    ('${DIA_PLANTILLA_ID}', '${EJERCICIO_1}', 1, 3, '10');

  INSERT INTO public.planes_membresia (id, nombre, limite_semanal, cantidad_actividades, duracion_meses, precio) VALUES
    ('${MEMBRESIA_ID}', 'Pase Libre Test', NULL, 2, 1, 35000);

  INSERT INTO public.contrataciones
    (id, alumno_id, tipo_servicio, dia_vencimiento, fecha_inicio, fecha_fin, estado, plan_membresia_id, precio_pactado)
  VALUES
    ('${CONTR_A1_ID}', '${A1}', 'PRESENCIAL', 5, CURRENT_DATE - 10, CURRENT_DATE + 20, 'VIGENTE', '${MEMBRESIA_ID}', 35000),
    ('${CONTR_A2_ID}', '${A2}', 'PRESENCIAL', 5, CURRENT_DATE - 10, CURRENT_DATE + 20, 'VIGENTE', '${MEMBRESIA_ID}', 35000);

  INSERT INTO public.cobros (id, contratacion_id, alumno_id, periodo, monto, fecha_vencimiento) VALUES
    ('${COBRO_A1_ID}', '${CONTR_A1_ID}', '${A1}', date_trunc('month', CURRENT_DATE)::date, 35000, CURRENT_DATE + 5),
    ('${COBRO_A2_ID}', '${CONTR_A2_ID}', '${A2}', date_trunc('month', CURRENT_DATE)::date, 35000, CURRENT_DATE + 5);

  INSERT INTO public.pagos (contratacion_id, alumno_id, cobro_id, monto, medio_pago, estado, idempotency_key) VALUES
    ('${CONTR_A1_ID}', '${A1}', '${COBRO_A1_ID}', 35000, 'TRANSFERENCIA', 'CONFIRMADO', 'idem-a1-rls'),
    ('${CONTR_A2_ID}', '${A2}', '${COBRO_A2_ID}', 35000, 'TRANSFERENCIA', 'CONFIRMADO', 'idem-a2-rls');

  INSERT INTO public.registro_sesiones (id, alumno_id, duracion_minutos, volumen_total_kg) VALUES
    ('${SESION_A1_ID}', '${A1}', 50, 1200),
    ('${SESION_A2_ID}', '${A2}', 45, 900);

  INSERT INTO public.registro_series (sesion_id, ejercicio_id, numero_serie, peso_kg, reps_hechas, completada) VALUES
    ('${SESION_A1_ID}', '${EJERCICIO_1}', 1, 80, 10, true),
    ('${SESION_A2_ID}', '${EJERCICIO_1}', 1, 60, 10, true);

  INSERT INTO public.alumno_historial_dolor (alumno_id, ejercicio_id, zona_articular, severidad) VALUES
    ('${A1}', '${EJERCICIO_1}', 'RODILLA', 'LEVE'),
    ('${A2}', '${EJERCICIO_1}', 'HOMBRO', 'LEVE');

  INSERT INTO public.conversaciones (id, alumno_id) VALUES
    ('${CONV_A1_ID}', '${A1}'),
    ('${CONV_A2_ID}', '${A2}');

  INSERT INTO public.mensajes (conversacion_id, remitente_id, contenido) VALUES
    ('${CONV_A1_ID}', '${A1}', 'Hola coach'),
    ('${CONV_A2_ID}', '${A2}', 'Consulta');

  INSERT INTO public.clases (id, actividad, inicio, duracion_minutos, capacidad, estado) VALUES
    ('${CLASE_ID}', 'FUNCIONAL', now() - interval '2 hours', 60, 12, 'PROGRAMADA');

  INSERT INTO public.reservas (id, clase_id, alumno_id, estado) VALUES
    ('${RESERVA_A1_ID}', '${CLASE_ID}', '${A1}', 'ANOTADO'),
    ('${RESERVA_A2_ID}', '${CLASE_ID}', '${A2}', 'ANOTADO');

  INSERT INTO public.feedback_clase (reserva_id, sensacion) VALUES
    ('${RESERVA_A1_ID}', 3),
    ('${RESERVA_A2_ID}', 4);

  INSERT INTO public.errores_app (usuario_id, contexto, mensaje_humano) VALUES
    ('${A1}', 'test-ctx-1', 'Error A1'),
    ('${A2}', 'test-ctx-2', 'Error A2');

  INSERT INTO public.auditoria_cambios (entidad, entidad_id, accion, autorizado_por) VALUES
    ('contrataciones', '${CONTR_A1_ID}', 'CREACION', '${ADMIN}');
`;

let db: PGlite;

function como<T>(rol: Rol, sub: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx: Transaction) => {
    const claims =
      rol === "service_role"
        ? { role: "service_role" }
        : sub
          ? { sub, role: rol }
          : { role: rol };
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query<T>(sql, params);
  });
}

async function obtenerPerfil(id: string) {
  const res = await db.query<{
    rol: string;
    estado_membresia: string;
    debe_cambiar_password: boolean;
    profesor_asignado_id: string | null;
    email: string | null;
    nombre_completo: string;
  }>(
    `SELECT rol::text, estado_membresia::text, debe_cambiar_password, profesor_asignado_id::text, email, nombre_completo
     FROM public.perfiles WHERE id = $1`,
    [id],
  );
  return res.rows[0];
}

async function existeFuncion(firma: string): Promise<boolean> {
  const res = await db.query<{ existe: boolean }>(
    `SELECT to_regprocedure($1) IS NOT NULL AS existe`,
    [firma],
  );
  return res.rows[0]?.existe ?? false;
}

async function contarComo(rol: Rol, sub: string | null, tabla: string, where = "true"): Promise<number> {
  const res = await como<{ n: number }>(rol, sub, `SELECT count(*)::int AS n FROM public.${tabla} WHERE ${where}`);
  return res.rows[0]!.n;
}

async function contarOCodigoPermiso(rol: Rol, sub: string | null, tabla: string): Promise<number | "42501"> {
  try {
    return await contarComo(rol, sub, tabla);
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "42501") {
      return "42501";
    }
    throw err;
  }
}

describe("Suite de regresión RLS/RPC y matriz de lectura por rol", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
    await db.exec(SEED);
  }, 60_000);

  describe("1. Matriz de lectura por rol", () => {
    it("anon recibe 42501 en todas las tablas protegidas", async () => {
      const tablas = [
        "perfiles",
        "registro_sesiones",
        "registro_series",
        "alumno_historial_dolor",
        "contrataciones",
        "pagos",
        "cobros",
        "conversaciones",
        "mensajes",
        "reservas",
        "feedback_clase",
        "errores_app",
        "planes_entrenamiento",
        "auditoria_cambios",
      ];
      for (const tabla of tablas) {
        const res = await contarOCodigoPermiso("anon", null, tabla);
        expect(res, `anon en ${tabla}`).toBe("42501");
      }
    });

    it("alumno1 y alumno2 solo ven sus propias filas y nunca las del otro", async () => {
      for (const [yo, otro] of [
        [A1, A2],
        [A2, A1],
      ] as const) {
        expect(await contarComo("authenticated", yo, "perfiles")).toBe(1);
        expect(await contarComo("authenticated", yo, "perfiles", `id = '${otro}'`)).toBe(0);

        expect(await contarComo("authenticated", yo, "registro_sesiones")).toBe(1);
        expect(await contarComo("authenticated", yo, "registro_sesiones", `alumno_id <> auth.uid()`)).toBe(0);

        expect(await contarComo("authenticated", yo, "registro_series")).toBe(1);
        expect(await contarComo("authenticated", yo, "alumno_historial_dolor")).toBe(1);
        expect(await contarComo("authenticated", yo, "alumno_historial_dolor", `alumno_id <> auth.uid()`)).toBe(0);

        expect(await contarComo("authenticated", yo, "contrataciones")).toBe(1);
        expect(await contarComo("authenticated", yo, "pagos")).toBe(1);
        expect(await contarComo("authenticated", yo, "cobros")).toBe(1);
        expect(await contarComo("authenticated", yo, "cobros", `alumno_id <> auth.uid()`)).toBe(0);

        expect(await contarComo("authenticated", yo, "conversaciones")).toBe(1);
        expect(await contarComo("authenticated", yo, "mensajes")).toBe(1);
        expect(await contarComo("authenticated", yo, "reservas")).toBe(1);
        expect(await contarComo("authenticated", yo, "feedback_clase")).toBe(1);
        expect(await contarComo("authenticated", yo, "errores_app")).toBe(0);
        expect(await contarComo("authenticated", yo, "planes_entrenamiento")).toBe(0);
        expect(await contarComo("authenticated", yo, "auditoria_cambios")).toBe(0);
      }
    });

    it("coach solo ve a su alumno asignado (A1) y no al no asignado (A2)", async () => {
      const fixturePerfiles = `id IN ('${ADMIN}', '${C1}', '${A1}', '${A2}')`;
      expect(await contarComo("authenticated", C1, "perfiles", fixturePerfiles)).toBe(2);
      expect(await contarComo("authenticated", C1, "perfiles", `id = '${A2}'`)).toBe(0);

      expect(await contarComo("authenticated", C1, "registro_sesiones")).toBe(1);
      expect(await contarComo("authenticated", C1, "registro_sesiones", `alumno_id = '${A2}'`)).toBe(0);
      expect(await contarComo("authenticated", C1, "registro_series")).toBe(1);
      expect(await contarComo("authenticated", C1, "alumno_historial_dolor")).toBe(1);
      expect(await contarComo("authenticated", C1, "contrataciones")).toBe(1);
      expect(await contarComo("authenticated", C1, "pagos")).toBe(1);
      expect(await contarComo("authenticated", C1, "cobros")).toBe(1);
      expect(await contarComo("authenticated", C1, "conversaciones")).toBe(1);
      expect(await contarComo("authenticated", C1, "mensajes")).toBe(1);
      expect(await contarComo("authenticated", C1, "reservas")).toBe(1);
      expect(await contarComo("authenticated", C1, "feedback_clase")).toBe(1);
      expect(await contarComo("authenticated", C1, "errores_app")).toBe(1);
      // GOZS-759: las plantillas son privadas de su autor; un coach no ve plantillas ajenas no compartidas.
      expect(await contarComo("authenticated", C1, "planes_entrenamiento", `id = '${PLANTILLA_ID}'`)).toBe(0);
      expect(await contarComo("authenticated", C1, "auditoria_cambios", `entidad_id = '${CONTR_A1_ID}'`)).toBe(1);
    });

    it("admin ve todos los registros de la matriz", async () => {
      const fixturePerfiles = `id IN ('${ADMIN}', '${C1}', '${A1}', '${A2}')`;
      expect(await contarComo("authenticated", ADMIN, "perfiles", fixturePerfiles)).toBe(4);
      expect(await contarComo("authenticated", ADMIN, "registro_sesiones")).toBe(2);
      expect(await contarComo("authenticated", ADMIN, "registro_series")).toBe(2);
      expect(await contarComo("authenticated", ADMIN, "alumno_historial_dolor")).toBe(2);
      expect(await contarComo("authenticated", ADMIN, "contrataciones")).toBe(2);
      expect(await contarComo("authenticated", ADMIN, "pagos")).toBe(2);
      expect(await contarComo("authenticated", ADMIN, "cobros")).toBe(2);
      expect(await contarComo("authenticated", ADMIN, "conversaciones")).toBe(2);
      expect(await contarComo("authenticated", ADMIN, "mensajes")).toBe(2);
      expect(await contarComo("authenticated", ADMIN, "reservas")).toBe(2);
      expect(await contarComo("authenticated", ADMIN, "feedback_clase")).toBe(2);
      expect(await contarComo("authenticated", ADMIN, "errores_app")).toBe(2);
      expect(await contarComo("authenticated", ADMIN, "planes_entrenamiento", `id = '${PLANTILLA_ID}'`)).toBe(1);
      expect(await contarComo("authenticated", ADMIN, "auditoria_cambios", `entidad_id = '${CONTR_A1_ID}'`)).toBe(1);
    });
  });

  describe("2. Alta de usuarios, perfiles y protección de columnas", () => {
    it("signUp con rol ADMIN en user_metadata queda con rol ALUMNO", async () => {
      const uid = "00000000-0000-0000-0000-0000000000e1";
      await db.query(
        `INSERT INTO auth.users (id, email, raw_user_meta_data)
         VALUES ($1, 'signup-admin@test.local', '{"rol":"ADMIN"}'::jsonb)`,
        [uid],
      );
      const perfil = await obtenerPerfil(uid);
      expect(perfil?.rol).toBe("ALUMNO");
    });

    it("alta de staff via raw_app_meta_data respeta rol ENTRENADOR", async () => {
      const uid = "00000000-0000-0000-0000-0000000000e2";
      await db.query(
        `INSERT INTO auth.users (id, email, raw_app_meta_data)
         VALUES ($1, 'staff@test.local', '{"rol":"ENTRENADOR"}'::jsonb)`,
        [uid],
      );
      const perfil = await obtenerPerfil(uid);
      expect(perfil?.rol).toBe("ENTRENADOR");
    });

    it("alumno no puede sobrescribir perfil ajeno con INSERT plano", async () => {
      await expect(
        como(
          "authenticated",
          A2,
          `INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia, debe_cambiar_password)
           VALUES ($1, 'pwned@evil.local', 'X', NULL, NULL, NULL)`,
          [ADMIN],
        ),
      ).rejects.toThrow();

      const adminPerfil = await obtenerPerfil(ADMIN);
      expect(adminPerfil?.email).toBe("admin@test.local");
      expect(adminPerfil?.rol).toBe("ADMIN");
    });

    it("alumno no puede sobrescribir perfil ajeno con upsert ON CONFLICT", async () => {
      await expect(
        como(
          "authenticated",
          A2,
          `INSERT INTO public.perfiles (id, nombre_completo)
           VALUES ($1, 'X')
           ON CONFLICT (id) DO UPDATE SET nombre_completo = 'Coach (soporte)'`,
          [ADMIN],
        ),
      ).rejects.toThrow();

      const adminPerfil = await obtenerPerfil(ADMIN);
      expect(adminPerfil?.nombre_completo).toBe("Admin Test");
    });

    it("service_role re-inserta perfil ADMIN sin rol: no degrada ni pisa rol (o rechaza 23505)", async () => {
      try {
        await como(
          "service_role",
          null,
          `INSERT INTO public.perfiles (id, email, nombre_completo)
           VALUES ($1, 'admin@test.local', 'Admin Test')`,
          [ADMIN],
        );
      } catch (err) {
        expect(err).toMatchObject({ code: "23505" });
      }
      const adminPerfil = await obtenerPerfil(ADMIN);
      expect(adminPerfil?.rol).toBe("ADMIN");
    });

    it("alumno con cambio de clave pendiente no puede saltearlo con INSERT plano sin columna", async () => {
      await db.query(`UPDATE public.perfiles SET debe_cambiar_password = true WHERE id = $1`, [A2]);
      try {
        try {
          await como(
            "authenticated",
            A2,
            `INSERT INTO public.perfiles (id, nombre_completo) VALUES (auth.uid(), 'Alumno Dos')`,
          );
        } catch (err) {
          expect(err).toMatchObject({ code: "23505" });
        }
        const perfil = await obtenerPerfil(A2);
        expect(perfil?.debe_cambiar_password).toBe(true);
      } finally {
        await db.query(`UPDATE public.perfiles SET debe_cambiar_password = false WHERE id = $1`, [A2]);
      }
    });

    it("alumno edita su propio perfil con upsert real y conserva debe_cambiar_password", async () => {
      await db.query(`UPDATE public.perfiles SET debe_cambiar_password = true WHERE id = $1`, [A2]);
      try {
        await como(
          "authenticated",
          A2,
          `INSERT INTO public.perfiles (id, nombre_completo)
           VALUES (auth.uid(), 'Alumno Dos')
           ON CONFLICT (id) DO UPDATE SET nombre_completo = 'Alumno Dos Editado'`,
        );
        const perfil = await obtenerPerfil(A2);
        expect(perfil?.nombre_completo).toBe("Alumno Dos Editado");
        expect(perfil?.debe_cambiar_password).toBe(true);
      } finally {
        await db.query(
          `UPDATE public.perfiles SET debe_cambiar_password = false, nombre_completo = 'Alumno Dos' WHERE id = $1`,
          [A2],
        );
      }
    });

    it("alta directa vía service_role (createUser + upsert) persiste todos los campos", async () => {
      const uid = "00000000-0000-0000-0000-0000000000e3";
      await db.query(
        `INSERT INTO auth.users (id, email, raw_user_meta_data)
         VALUES ($1, 'nuevo@test.local', '{"nombre_completo":"Nuevo","rol":"ALUMNO"}'::jsonb)`,
        [uid],
      );
      await como(
        "service_role",
        null,
        `INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia, profesor_asignado_id, debe_cambiar_password)
         VALUES ($1, 'nuevo@test.local', 'Nuevo', 'ALUMNO', 'ACTIVA', $2, true)
         ON CONFLICT (id) DO UPDATE SET
           email = EXCLUDED.email,
           nombre_completo = EXCLUDED.nombre_completo,
           rol = EXCLUDED.rol,
           estado_membresia = EXCLUDED.estado_membresia,
           profesor_asignado_id = EXCLUDED.profesor_asignado_id,
           debe_cambiar_password = EXCLUDED.debe_cambiar_password`,
        [uid, C1],
      );
      const perfil = await obtenerPerfil(uid);
      expect(perfil).toMatchObject({
        rol: "ALUMNO",
        estado_membresia: "ACTIVA",
        debe_cambiar_password: true,
        profesor_asignado_id: C1,
        email: "nuevo@test.local",
      });
    });

    it("alumno no puede mover su propia fecha_vencimiento_cuota", async () => {
      await expect(
        como(
          "authenticated",
          A2,
          `UPDATE public.perfiles SET fecha_vencimiento_cuota = '2030-01-01' WHERE id = auth.uid()`,
        ),
      ).rejects.toThrow();
    });

    it("coach puede actualizar fecha_vencimiento_cuota de su alumno asignado", async () => {
      const res = await como(
        "authenticated",
        C1,
        `UPDATE public.perfiles SET fecha_vencimiento_cuota = '2027-01-10' WHERE id = $1`,
        [A1],
      );
      expect(res.affectedRows).toBe(1);
    });

    it("alumno no puede cambiar su propio rol a ADMIN", async () => {
      await expect(
        como("authenticated", A2, `UPDATE public.perfiles SET rol = 'ADMIN' WHERE id = auth.uid()`),
      ).rejects.toThrow();
    });
  });

  describe("3. RPCs de planes, ranking, cobros, visibilidad y Realtime", () => {
    it("anon no puede invocar extender_vigencia_plan (podada, 42883)", async () => {
      await expect(
        como("anon", null, `SELECT public.extender_vigencia_plan($1, 1)`, [PLANTILLA_ID]),
      ).rejects.toMatchObject({ code: "42883" });
    });

    it("anon no puede invocar clonar_plan_entrenamiento (42501)", async () => {
      await expect(
        como("anon", null, `SELECT public.clonar_plan_entrenamiento($1, 'x')`, [PLANTILLA_ID]),
      ).rejects.toMatchObject({ code: "42501" });
    });

    it("alumno no puede clonar una plantilla", async () => {
      await expect(
        como("authenticated", A2, `SELECT public.clonar_plan_entrenamiento($1, 'robado')`, [PLANTILLA_ID]),
      ).rejects.toThrow();
    });

    it("extender_vigencia_plan está podada: alumno no puede invocarla (42883)", async () => {
      expect(await existeFuncion("public.extender_vigencia_plan(uuid,integer)")).toBe(false);
      await expect(
        como("authenticated", A2, `SELECT public.extender_vigencia_plan($1, 365)`, [PLANTILLA_ID]),
      ).rejects.toMatchObject({ code: "42883" });
    });

    it("alumno no puede activar el plan de otro alumno (o RPC podada)", async () => {
      if (!(await existeFuncion("public.activar_rutina(uuid)"))) {
        return;
      }
      await db.query(
        `INSERT INTO public.planes_entrenamiento (id, alumno_id, profesor_id, nombre, estado)
         VALUES ($1, $2, NULL, 'Plan Ajeno', 'INACTIVO')`,
        [PLAN_A1_ID, A1],
      );
      await expect(
        como("authenticated", A2, `SELECT public.activar_rutina($1)`, [PLAN_A1_ID]),
      ).rejects.toThrow();
    });

    it("admin puede clonar una plantilla", async () => {
      const clon = await como<{ clonar_plan_entrenamiento: string }>(
        "authenticated",
        ADMIN,
        `SELECT public.clonar_plan_entrenamiento($1, 'copia')`,
        [PLANTILLA_ID],
      );
      expect(clon.rows[0]?.clonar_plan_entrenamiento).toBeTruthy();
    });

    it("alumno no puede invocar obtener_ranking_ejercicio (o RPC podada)", async () => {
      if (!(await existeFuncion("public.obtener_ranking_ejercicio(uuid)"))) {
        return;
      }
      await expect(
        como("authenticated", A2, `SELECT * FROM public.obtener_ranking_ejercicio(gen_random_uuid())`),
      ).rejects.toMatchObject({ code: "42501" });
    });

    it("alumno no puede registrar su propio pago via registrar_pago", async () => {
      await expect(
        como(
          "authenticated",
          A2,
          `SELECT public.registrar_pago((SELECT id FROM public.cobros WHERE alumno_id = auth.uid() LIMIT 1), 1000, 'EFECTIVO', 'yo')`,
        ),
      ).rejects.toThrow();
    });

    it("alumno no ve datos ajenos (registro_sesiones, perfiles, dolor, cobros)", async () => {
      expect(await contarComo("authenticated", A2, "registro_sesiones", "alumno_id <> auth.uid()")).toBe(0);
      expect(await contarComo("authenticated", A2, "perfiles", "id <> auth.uid()")).toBe(0);
      expect(await contarComo("authenticated", A2, "alumno_historial_dolor", "alumno_id <> auth.uid()")).toBe(0);
      expect(await contarComo("authenticated", A2, "cobros", "alumno_id <> auth.uid()")).toBe(0);
    });

    it("coach no ve alumno no asignado en perfiles ni registro_sesiones", async () => {
      expect(await contarComo("authenticated", C1, "perfiles", `id = '${A2}'`)).toBe(0);
      expect(await contarComo("authenticated", C1, "registro_sesiones", `alumno_id = '${A2}'`)).toBe(0);
    });

    it("GOZS-759: coach no lee, clona, asigna ni se auto-comparte una plantilla ajena no compartida", async () => {
      expect(await contarComo("authenticated", C1, "dias_rutina", `plan_id = '${PLANTILLA_ID}'`)).toBe(0);
      expect(await contarComo("authenticated", C1, "ejercicios_en_rutina", `dia_id = '${DIA_PLANTILLA_ID}'`)).toBe(0);
      await expect(
        como("authenticated", C1, `SELECT public.clonar_plan_entrenamiento($1, 'robada')`, [PLANTILLA_ID]),
      ).rejects.toThrow();
      await expect(
        como("authenticated", C1, `SELECT public.asignar_rutina_a_alumno($1, $2)`, [PLANTILLA_ID, A1]),
      ).rejects.toThrow();
      await expect(
        como(
          "authenticated",
          C1,
          `INSERT INTO public.planes_compartidos (plan_id, profesor_id, compartido_por) VALUES ($1, $2, $2)`,
          [PLANTILLA_ID, C1],
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        como(
          "authenticated",
          C1,
          `INSERT INTO public.planes_compartidos (plan_id, profesor_id, compartido_por) VALUES ($1, $2, $3)`,
          [PLANTILLA_ID, C1, ADMIN],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    });

    it("GOZS-759: plantilla compartida con el coach es solo lectura y anon no accede a planes_compartidos", async () => {
      await db.query(
        `INSERT INTO public.planes_compartidos (plan_id, profesor_id, compartido_por) VALUES ($1, $2, $3)`,
        [PLANTILLA_ID, C1, ADMIN],
      );
      try {
        expect(await contarComo("authenticated", C1, "planes_entrenamiento", `id = '${PLANTILLA_ID}'`)).toBe(1);
        expect(await contarComo("authenticated", C1, "ejercicios_en_rutina", `dia_id = '${DIA_PLANTILLA_ID}'`)).toBe(1);
        const upd = await como("authenticated", C1, `UPDATE public.planes_entrenamiento SET nombre = 'x' WHERE id = $1`, [
          PLANTILLA_ID,
        ]);
        expect(upd.affectedRows).toBe(0);
        const del = await como("authenticated", C1, `DELETE FROM public.dias_rutina WHERE plan_id = $1`, [PLANTILLA_ID]);
        expect(del.affectedRows).toBe(0);
        const revoca = await como("authenticated", C1, `DELETE FROM public.planes_compartidos WHERE plan_id = $1`, [
          PLANTILLA_ID,
        ]);
        expect(revoca.affectedRows).toBe(0);
        expect(await contarOCodigoPermiso("anon", null, "planes_compartidos")).toBe("42501");
      } finally {
        await db.query(`DELETE FROM public.planes_compartidos WHERE plan_id = $1`, [PLANTILLA_ID]);
      }
    });

    it("anon recibe 42501 en perfiles, registro_series, planes_entrenamiento y mensajes", async () => {
      expect(await contarOCodigoPermiso("anon", null, "perfiles")).toBe("42501");
      expect(await contarOCodigoPermiso("anon", null, "registro_series")).toBe("42501");
      expect(await contarOCodigoPermiso("anon", null, "planes_entrenamiento")).toBe("42501");
      expect(await contarOCodigoPermiso("anon", null, "mensajes")).toBe("42501");
    });

    it("feedback_clase está publicado en supabase_realtime", async () => {
      const res = await db.query<{ ok: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM pg_publication_tables
           WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'feedback_clase'
         ) AS ok`,
      );
      expect(res.rows[0]?.ok).toBe(true);
    });
  });

  describe("4. Revocación de permisos a anon y endurecimiento RLS", () => {
    it("la migración es idempotente al volver a aplicarse", async () => {
      const sql = fs.readFileSync(
        path.join(MIGRATIONS_DIR, "20261122120000_revocar_anon_y_refinar_rls.sql"),
        "utf-8",
      );
      await expect(aplicarMigracion(db, sql)).resolves.toBeUndefined();
      // GOZS-718 y GOZS-721: re-aplicar en orden cronológico las versiones vigentes (ambas idempotentes)
      await expect(
        aplicarMigracion(
          db,
          fs.readFileSync(path.join(MIGRATIONS_DIR, "20261123120000_unificar_vinculo_coach_alumno.sql"), "utf-8"),
        ),
      ).resolves.toBeUndefined();
      await expect(
        aplicarMigracion(
          db,
          fs.readFileSync(path.join(MIGRATIONS_DIR, "20261123130000_limpiar_columnas_sin_uso.sql"), "utf-8"),
        ),
      ).resolves.toBeUndefined();
    });

    it("anon no tiene privilegios sobre ninguna tabla ni vista de public y recibe 42501", async () => {
      const objetos = await db.query<{ relname: string; sel: boolean; ins: boolean; upd: boolean; del: boolean }>(
        `SELECT c.relname,
                has_table_privilege('anon', c.oid, 'SELECT') AS sel,
                has_table_privilege('anon', c.oid, 'INSERT') AS ins,
                has_table_privilege('anon', c.oid, 'UPDATE') AS upd,
                has_table_privilege('anon', c.oid, 'DELETE') AS del
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm', 'p')
         ORDER BY c.relname`,
      );
      expect(objetos.rows.length).toBeGreaterThan(20);
      for (const obj of objetos.rows) {
        expect(obj.sel, `SELECT anon en ${obj.relname}`).toBe(false);
        expect(obj.ins, `INSERT anon en ${obj.relname}`).toBe(false);
        expect(obj.upd, `UPDATE anon en ${obj.relname}`).toBe(false);
        expect(obj.del, `DELETE anon en ${obj.relname}`).toBe(false);
        expect(await contarOCodigoPermiso("anon", null, obj.relname), `query anon en ${obj.relname}`).toBe("42501");
      }
    });

    it("anon no tiene EXECUTE sobre ninguna función de la app en public y recibe 42501", async () => {
      const procs = await db.query<{ sig: string; anon_exec: boolean }>(
        `SELECT p.oid::regprocedure::text AS sig,
                has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND NOT EXISTS (
             SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'
           )
         ORDER BY sig`,
      );
      expect(procs.rows.length).toBeGreaterThan(20);
      for (const fn of procs.rows) {
        expect(fn.anon_exec, `EXECUTE anon en ${fn.sig}`).toBe(false);
      }

      const llamadasAnon = [
        `SELECT public.actualizar_nombre_preferido('Anon')`,
        `SELECT public.calcular_volumen_semanal('${A1}', now())`,
        `SELECT * FROM public.detectar_sobrecarga_progresiva('${A1}', '${EJERCICIO_1}')`,
        `SELECT * FROM public.obtener_metricas_retencion(NULL)`,
        `SELECT * FROM public.obtener_records_historicos('${A1}', NULL)`,
        `SELECT public.transferir_conversacion_gozs('${CONV_A1_ID}', '${C1}', 'x')`,
        `SELECT public.contar_mensajes_no_leidos()`,
        `SELECT public.registrar_molestia(gen_random_uuid(), gen_random_uuid(), '${EJERCICIO_1}', 'HOMBRO', 4)`,
        `SELECT public.actualizar_estado_dolor(gen_random_uuid(), 'RESUELTO', NULL)`,
      ];
      for (const sql of llamadasAnon) {
        await expect(como("anon", null, sql), sql).rejects.toMatchObject({ code: "42501" });
      }
    });

    it("alumno no puede marcar como RESUELTO su reporte en alumno_historial_dolor ni editar notas_profesor", async () => {
      const dolorA1 = await db.query<{ id: string }>(
        `SELECT id FROM public.alumno_historial_dolor WHERE alumno_id = '${A1}' LIMIT 1`,
      );
      const dolorId = dolorA1.rows[0]!.id;

      await expect(
        como("authenticated", A1, `UPDATE public.alumno_historial_dolor SET estado = 'RESUELTO' WHERE id = $1`, [
          dolorId,
        ]),
      ).rejects.toMatchObject({ code: "42501" });

      await expect(
        como(
          "authenticated",
          A1,
          `UPDATE public.alumno_historial_dolor SET estado_recuperacion = 'RESUELTO' WHERE id = $1`,
          [dolorId],
        ),
        // GOZS-721: la columna redundante ya no existe; el único estado es `estado`.
      ).rejects.toMatchObject({ code: "42703" });

      await expect(
        como(
          "authenticated",
          A1,
          `UPDATE public.alumno_historial_dolor SET notas_profesor = 'Alta médica' WHERE id = $1`,
          [dolorId],
        ),
      ).rejects.toMatchObject({ code: "42501" });

      await expect(
        como(
          "authenticated",
          A1,
          `INSERT INTO public.alumno_historial_dolor (alumno_id, ejercicio_id, zona_articular, eva, estado)
           VALUES ($1, $2, 'HOMBRO', 4, 'RESUELTO')`,
          [A1, EJERCICIO_1],
        ),
      ).rejects.toMatchObject({ code: "42501" });

      // El coach no asignado no puede resolver el dolor de A2
      const dolorA2 = await db.query<{ id: string }>(
        `SELECT id FROM public.alumno_historial_dolor WHERE alumno_id = '${A2}' LIMIT 1`,
      );
      await expect(
        como("authenticated", C1, `SELECT public.actualizar_estado_dolor($1, 'RESUELTO', 'No mío')`, [
          dolorA2.rows[0]!.id,
        ]),
      ).rejects.toMatchObject({ code: "42501" });

      // El coach asignado sí puede resolver vía actualizar_estado_dolor
      const res = await como<{ estado: string }>(
        "authenticated",
        C1,
        `SELECT estado FROM public.actualizar_estado_dolor($1, 'RESUELTO', 'Evaluado en sesión')`,
        [dolorId],
      );
      expect(res.rows[0]?.estado).toBe("RESUELTO");

      // Sin regresión: alumno puede reportar molestia vía registrar_molestia (y EVA 8 genera alerta interna)
      const reporteId = "99999999-9999-4999-8999-999999999901";
      const sesionNueva = "99999999-9999-4999-8999-999999999902";
      await como(
        "authenticated",
        A1,
        `SELECT public.registrar_molestia($1, $2, $3, 'RODILLA', 8)`,
        [reporteId, sesionNueva, EJERCICIO_1],
      );
      const alertaInterna = await db.query<{ severidad: string }>(
        `SELECT severidad FROM public.alertas_entrenador WHERE reporte_dolor_id = $1`,
        [reporteId],
      );
      expect(alertaInterna.rows[0]?.severidad).toBe("ALTA");
    });

    it("alertas_entrenador rechaza profesor_id no asignado o severidad no acotada para alumnos", async () => {
      const coachAjeno = "00000000-0000-0000-0000-0000000000c2";
      await db.exec(`
        INSERT INTO auth.users (id, email, raw_app_meta_data) VALUES
          ('${coachAjeno}', 'coach2@test.local', '{"rol":"ENTRENADOR"}')
        ON CONFLICT (id) DO NOTHING;
        INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia) VALUES
          ('${coachAjeno}', 'coach2@test.local', 'Coach Dos', 'ENTRENADOR', 'ACTIVA')
        ON CONFLICT (id) DO UPDATE SET rol = EXCLUDED.rol;
      `);

      // Profesor no asignado (coachAjeno) u otro alumno (A2) rechazados con 42501
      await expect(
        como(
          "authenticated",
          A1,
          `INSERT INTO public.alertas_entrenador (alumno_id, profesor_id, tipo_alerta, severidad, titulo)
           VALUES ($1, $2, 'DOLOR_ARTICULAR', 'MEDIA', 'Coach ajeno')`,
          [A1, coachAjeno],
        ),
      ).rejects.toMatchObject({ code: "42501" });

      await expect(
        como(
          "authenticated",
          A1,
          `INSERT INTO public.alertas_entrenador (alumno_id, profesor_id, tipo_alerta, severidad, titulo)
           VALUES ($1, $2, 'DOLOR_ARTICULAR', 'MEDIA', 'Otro alumno')`,
          [A1, A2],
        ),
      ).rejects.toMatchObject({ code: "42501" });

      // Severidad CRITICA / ALTA o estado RESUELTO rechazados para alumno aunque sea su coach
      await expect(
        como(
          "authenticated",
          A1,
          `INSERT INTO public.alertas_entrenador (alumno_id, profesor_id, tipo_alerta, severidad, titulo)
           VALUES ($1, $2, 'DOLOR_ARTICULAR', 'CRITICA', 'Falsa crítica')`,
          [A1, C1],
        ),
      ).rejects.toMatchObject({ code: "42501" });

      await expect(
        como(
          "authenticated",
          A1,
          `INSERT INTO public.alertas_entrenador (alumno_id, profesor_id, tipo_alerta, severidad, titulo)
           VALUES ($1, $2, 'DOLOR_ARTICULAR', 'ALTA', 'Falsa alta')`,
          [A1, C1],
        ),
      ).rejects.toMatchObject({ code: "42501" });

      // Alumno sin coach asignado (A2) no puede insertar alerta dirigida a nadie
      await expect(
        como(
          "authenticated",
          A2,
          `INSERT INTO public.alertas_entrenador (alumno_id, profesor_id, tipo_alerta, severidad, titulo)
           VALUES ($1, $2, 'DOLOR_ARTICULAR', 'BAJA', 'Sin coach')`,
          [A2, C1],
        ),
      ).rejects.toMatchObject({ code: "42501" });

      // Caso válido: alumno con su profesor asignado y severidad acotada
      const ok = await como<{ id: string }>(
        "authenticated",
        A1,
        `INSERT INTO public.alertas_entrenador (alumno_id, profesor_id, tipo_alerta, severidad, titulo)
         VALUES ($1, $2, 'DOLOR_ARTICULAR', 'MEDIA', 'Consulta válida')
         RETURNING id`,
        [A1, C1],
      );
      expect(ok.rows).toHaveLength(1);
    });

    it("conversaciones.responsable_id solo apunta a staff y el alumno no puede reasignarlo", async () => {
      const coachAjeno = "00000000-0000-0000-0000-0000000000c2";

      await expect(
        como(
          "authenticated",
          A1,
          `UPDATE public.conversaciones SET responsable_id = $1 WHERE id = $2`,
          [A2, CONV_A1_ID],
        ),
      ).rejects.toMatchObject({ code: "42501" });

      await expect(
        como(
          "authenticated",
          A1,
          `UPDATE public.conversaciones SET responsable_id = $1 WHERE id = $2`,
          [coachAjeno, CONV_A1_ID],
        ),
      ).rejects.toMatchObject({ code: "42501" });

      // Incluso staff/admin no pueden asignar un ALUMNO como responsable_id
      await expect(
        como(
          "authenticated",
          ADMIN,
          `UPDATE public.conversaciones SET responsable_id = $1 WHERE id = $2`,
          [A2, CONV_A1_ID],
        ),
      ).rejects.toMatchObject({ code: "42501" });

      // Alumno creando conversación nueva tampoco puede fijar un responsable_id ajeno
      const alumnoNuevo = "00000000-0000-0000-0000-0000000000a9";
      await db.exec(`
        INSERT INTO auth.users (id, email) VALUES ('${alumnoNuevo}', 'a9@test.local');
        INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia)
        VALUES ('${alumnoNuevo}', 'a9@test.local', 'Alumno Nueve', 'ALUMNO', 'ACTIVA')
        ON CONFLICT (id) DO UPDATE SET rol = EXCLUDED.rol;
      `);
      await expect(
        como(
          "authenticated",
          alumnoNuevo,
          `INSERT INTO public.conversaciones (alumno_id, responsable_id) VALUES ($1, $2)`,
          [alumnoNuevo, A2],
        ),
      ).rejects.toMatchObject({ code: "42501" });

      // El coach asignado puede transferir a otro ENTRENADOR vía transferir_conversacion_gozs
      const tr = await como<{ responsable_id: string }>(
        "authenticated",
        C1,
        `SELECT responsable_id FROM public.transferir_conversacion_gozs($1, $2, 'Cobertura')`,
        [CONV_A1_ID, coachAjeno],
      );
      expect(tr.rows[0]?.responsable_id).toBe(coachAjeno);

      // GOZS-718: vínculo único: la transferencia reasigna al alumno; C1 pierde el acceso
      const asignado = await db.query<{ profesor_asignado_id: string }>(
        `SELECT profesor_asignado_id FROM public.perfiles WHERE id = $1`,
        [A1],
      );
      expect(asignado.rows[0]?.profesor_asignado_id).toBe(coachAjeno);
      const c1Ve = await como<{ ok: boolean }>("authenticated", C1, `SELECT public.es_entrenador_de($1) AS ok`, [A1]);
      expect(c1Ve.rows[0]?.ok).toBe(false);

      // El nuevo coach asignado puede devolverla (restaura el fixture para el resto de la suite)
      await como("authenticated", coachAjeno, `SELECT public.transferir_conversacion_gozs($1, $2, 'Fin cobertura')`, [CONV_A1_ID, C1]);
    });

    it("coach solo ve errores_app y feedback_clase de sus alumnos (o clases asignadas)", async () => {
      // C1 ve el error de A1 pero no el de A2; además ve su propio error
      expect(await contarComo("authenticated", C1, "errores_app")).toBe(1);
      expect(await contarComo("authenticated", C1, "errores_app", `usuario_id = '${A2}'`)).toBe(0);

      await como(
        "authenticated",
        C1,
        `INSERT INTO public.errores_app (usuario_id, contexto, mensaje_humano) VALUES ($1, 'coach-ctx', 'Error propio')`,
        [C1],
      );
      expect(await contarComo("authenticated", C1, "errores_app")).toBe(2);

      // feedback_clase: C1 solo ve el de A1, no el de A2
      expect(await contarComo("authenticated", C1, "feedback_clase")).toBe(1);
      expect(await contarComo("authenticated", C1, "feedback_clase", `reserva_id = '${RESERVA_A2_ID}'`)).toBe(0);

      // Si C1 es profesor de la clase en clases_profesores, también ve el feedback de la clase
      await db.query(
        `INSERT INTO public.clases_profesores (clase_id, profesor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [CLASE_ID, C1],
      );
      expect(await contarComo("authenticated", C1, "feedback_clase")).toBe(2);
    });
  });

  describe("5. Entrenador de apoyo sin acceso financiero (GOZS-758)", () => {
    beforeAll(async () => {
      // La sección 4 re-aplica migraciones previas: se re-aplica la vigente (idempotente).
      await aplicarMigracion(
        db,
        fs.readFileSync(path.join(MIGRATIONS_DIR, "20261123160000_entrenador_apoyo_acceso_financiero.sql"), "utf-8"),
      );
      await db.exec(`
        INSERT INTO auth.users (id, email, raw_app_meta_data) VALUES
          ('${C2_APOYO}', 'apoyo@test.local', '{"rol":"ENTRENADOR"}');
        INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia) VALUES
          ('${C2_APOYO}', 'apoyo@test.local', 'Coach Apoyo', 'ENTRENADOR', 'ACTIVA')
        ON CONFLICT (id) DO UPDATE SET rol = EXCLUDED.rol;
        UPDATE public.perfiles SET profesor_apoyo_id = '${C2_APOYO}', apoyo_acceso_financiero = false
        WHERE id = '${A1}';
      `);
    });

    it("apoyo ve el entrenamiento del alumno pero 0 filas financieras", async () => {
      expect(await contarComo("authenticated", C2_APOYO, "registro_sesiones", `alumno_id = '${A1}'`)).toBeGreaterThan(0);
      for (const tabla of ["contrataciones", "cobros", "pagos", "v_estado_alumno"]) {
        expect(await contarComo("authenticated", C2_APOYO, tabla, `alumno_id = '${A1}'`)).toBe(0);
      }
    });

    it("apoyo no puede ejecutar RPCs financieras (42501)", async () => {
      const ataques: Array<[string, unknown[]]> = [
        [`SELECT public.renovar_contratacion($1, 35000, 'EFECTIVO', 'atk-ren')`, [CONTR_A1_ID]],
        [`SELECT public.extender_contratacion_excepcional($1, CURRENT_DATE + 90, 'atk')`, [CONTR_A1_ID]],
        [`SELECT public.registrar_pago($1, 1, 'EFECTIVO', 'atk-pago')`, [COBRO_A1_ID]],
        [`SELECT public.registrar_y_confirmar_renovacion($1, 1, 'EFECTIVO', 'atk-conf')`, [CONTR_A1_ID]],
        [`SELECT * FROM public.asignar_suscripcion_y_cobro($1, $2, NULL, 1)`, [A1, MEMBRESIA_ID]],
      ];
      for (const [sql, params] of ataques) {
        await expect(como("authenticated", C2_APOYO, sql, params)).rejects.toMatchObject({ code: "42501" });
      }
    });

    it("apoyo no puede autoconcederse acceso financiero ni reasignarse (42501)", async () => {
      for (const set of [
        "apoyo_acceso_financiero = true",
        `profesor_asignado_id = '${C2_APOYO}', profesor_apoyo_id = NULL`,
        "profesor_apoyo_id = NULL",
        "estado_membresia = 'VENCIDA'",
      ]) {
        await expect(
          como("authenticated", C2_APOYO, `UPDATE public.perfiles SET ${set} WHERE id = $1`, [A1]),
        ).rejects.toMatchObject({ code: "42501" });
      }
      expect((await obtenerPerfil(A1))?.profesor_asignado_id).toBe(C1);
    });
  });

  describe("6. RPCs de marcas y ranking de Funcional (20261125140000)", () => {
    const COACH_AJENO = "00000000-0000-0000-0000-00000000c0a1";
    const A3 = "00000000-0000-0000-0000-0000000000a3";
    const FIRMA_REGISTRAR =
      "public.registrar_marca_funcional(uuid,uuid,numeric,integer,date,uuid,numeric,text)";
    const FIRMA_RANKING = "public.obtener_ranking_funcional_alumno(uuid)";
    const CLASE_NO_FUNCIONAL_ID = "88888888-8888-4888-8888-888888888899";

    const registrar = (
      rol: Rol,
      sub: string | null,
      alumno: string,
      extra: { peso?: number; reps?: number; fecha?: string; clase?: string | null; pc?: number | null; sexo?: string | null } = {},
    ) =>
      como(
        rol,
        sub,
        `SELECT public.registrar_marca_funcional($1, $2, $3, $4, ${extra.fecha ?? "CURRENT_DATE"}, $5, $6, $7)`,
        [alumno, EJERCICIO_1, extra.peso ?? 80, extra.reps ?? 5, extra.clase ?? null, extra.pc ?? null, extra.sexo ?? null],
      );

    beforeAll(async () => {
      await db.exec(`
        INSERT INTO auth.users (id, email, raw_app_meta_data) VALUES
          ('${COACH_AJENO}', 'ajeno@test.local', '{"rol":"ENTRENADOR"}'),
          ('${A3}', 'tercero.privado@test.local', '{"rol":"ALUMNO"}');
        INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia) VALUES
          ('${COACH_AJENO}', 'ajeno@test.local', 'Coach Ajeno', 'ENTRENADOR', 'ACTIVA'),
          ('${A3}', 'tercero.privado@test.local', 'Tercero Largo Apellido', 'ALUMNO', 'ACTIVA')
        ON CONFLICT (id) DO UPDATE SET rol = EXCLUDED.rol, nombre_completo = EXCLUDED.nombre_completo;
        INSERT INTO public.alumno_actividades (alumno_id, actividad, pase_libre) VALUES
          ('${A1}', 'FUNCIONAL', true),
          ('${A3}', 'FUNCIONAL', true)
        ON CONFLICT DO NOTHING;
        INSERT INTO public.clases (id, actividad, inicio, duracion_minutos, capacidad, estado)
        VALUES ('${CLASE_NO_FUNCIONAL_ID}', 'BOXEO', now() - interval '1 day', 60, 10, 'PROGRAMADA');
      `);
      // Datos de ranking: marca de A3 con peso corporal, cargada por admin.
      await registrar("authenticated", ADMIN, A3, { peso: 100, reps: 3, pc: 70, sexo: "M" });
    });

    it("catálogo: SECURITY DEFINER, search_path fijo y EXECUTE revocado a PUBLIC/anon", async () => {
      for (const firma of [FIRMA_REGISTRAR, FIRMA_RANKING]) {
        const res = await db.query<{
          secdef: boolean;
          cfg: string[] | null;
          anon: boolean;
          authenticated: boolean;
          publico: boolean;
        }>(
          `SELECT p.prosecdef AS secdef, p.proconfig AS cfg,
                  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
                  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
                  (p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0)) AS publico
           FROM pg_proc p WHERE p.oid = to_regprocedure($1)`,
          [firma],
        );
        const fila = res.rows[0]!;
        expect(fila.secdef).toBe(true);
        expect(fila.cfg).toContain("search_path=public, pg_temp");
        expect(fila.anon).toBe(false);
        expect(fila.publico).toBe(false);
        expect(fila.authenticated).toBe(true);
      }
    });

    describe("registrar_marca_funcional: autorización", () => {
      it("anon es rechazado (42501)", async () => {
        await expect(registrar("anon", null, A1)).rejects.toMatchObject({ code: "42501" });
      });

      it("alumno no puede registrar sobre sí mismo ni sobre otro alumno (42501)", async () => {
        await expect(registrar("authenticated", A1, A1)).rejects.toMatchObject({ code: "42501" });
        await expect(registrar("authenticated", A1, A2)).rejects.toMatchObject({ code: "42501" });
      });

      it("coach sin vínculo con el alumno es rechazado (42501)", async () => {
        await expect(registrar("authenticated", COACH_AJENO, A1)).rejects.toMatchObject({ code: "42501" });
      });

      it("coach asignado sí puede, pero no sobre un alumno ajeno (42501)", async () => {
        const ok = await registrar("authenticated", C1, A1);
        expect(ok.rows).toHaveLength(1);
        await expect(registrar("authenticated", C1, A2)).rejects.toMatchObject({ code: "42501" });
      });

      it("entrenador de apoyo (profesor_apoyo_id) está autorizado por es_entrenador_de y puede registrar", async () => {
        // Comportamiento vigente: es_entrenador_de incluye al apoyo; la marca no es dato financiero.
        const res = await registrar("authenticated", C2_APOYO, A1, { peso: 82 });
        expect(res.rows).toHaveLength(1);
      });
    });

    describe("registrar_marca_funcional: validaciones de integridad (22023)", () => {
      it("alumno sin actividad FUNCIONAL", async () => {
        await expect(registrar("authenticated", ADMIN, A2)).rejects.toMatchObject({ code: "22023" });
      });

      it("peso_kg fuera de (0, 1000]", async () => {
        for (const peso of [0, -5, 1001]) {
          await expect(registrar("authenticated", C1, A1, { peso })).rejects.toMatchObject({ code: "22023" });
        }
      });

      it("reps fuera de [1, 100]", async () => {
        for (const reps of [0, 101]) {
          await expect(registrar("authenticated", C1, A1, { reps })).rejects.toMatchObject({ code: "22023" });
        }
      });

      it("fecha futura", async () => {
        await expect(
          registrar("authenticated", C1, A1, { fecha: "CURRENT_DATE + 1" }),
        ).rejects.toMatchObject({ code: "22023" });
      });

      it("peso_corporal_kg fuera de [20, 500]", async () => {
        for (const pc of [19, 501]) {
          await expect(registrar("authenticated", C1, A1, { pc })).rejects.toMatchObject({ code: "22023" });
        }
      });

      it("sexo distinto de M/F", async () => {
        await expect(registrar("authenticated", C1, A1, { sexo: "X" })).rejects.toMatchObject({ code: "22023" });
      });

      it("clase inexistente o no-FUNCIONAL", async () => {
        for (const clase of ["99999999-9999-4999-8999-999999999999", CLASE_NO_FUNCIONAL_ID]) {
          await expect(registrar("authenticated", C1, A1, { clase })).rejects.toMatchObject({ code: "22023" });
        }
      });
    });

    describe("obtener_ranking_funcional_alumno", () => {
      const EJERCICIO_2 = "11111111-1111-4111-8111-111111111102";

      const ranking = (rol: Rol, sub: string | null, ejercicioId: string | null = null) =>
        como<Record<string, unknown>>(
          rol,
          sub,
          `SELECT * FROM public.obtener_ranking_funcional_alumno($1::uuid)`,
          [ejercicioId],
        );

      beforeAll(async () => {
        await db.exec(`
          INSERT INTO public.ejercicios (id, nombre) VALUES
            ('${EJERCICIO_2}', 'Peso Muerto Test')
          ON CONFLICT (id) DO NOTHING;
        `);
        // Marca propia de A1 en EJERCICIO_1 con peso corporal/sexo (ratio 84/80 = 1.05, detrás de A3 100/70 = 1.43).
        await registrar("authenticated", C1, A1, { peso: 84, reps: 5, pc: 80, sexo: "M" });
        // Segunda marca de A3 en EJERCICIO_2 para verificar el filtro por p_ejercicio_id.
        await como(
          "authenticated",
          ADMIN,
          `SELECT public.registrar_marca_funcional($1, $2, $3, $4, CURRENT_DATE, NULL, NULL, NULL)`,
          [A3, EJERCICIO_2, 120, 2],
        );
      });

      it("anon es rechazado (42501)", async () => {
        await expect(ranking("anon", null)).rejects.toMatchObject({ code: "42501" });
      });

      it("alumno sin actividad FUNCIONAL es rechazado (42501)", async () => {
        await expect(ranking("authenticated", A2)).rejects.toMatchObject({ code: "42501" });
      });

      it("alumno con FUNCIONAL solo recibe columnas públicas, sin PII ni peso corporal crudo", async () => {
        const res = await ranking("authenticated", A1);
        expect(res.rows.length).toBeGreaterThan(0);
        const columnas = [
          "ejercicio_id", "es_usuario_actual", "nombre_corto", "sexo", "peso_kg", "reps", "fecha", "ratio", "posicion",
        ];
        for (const fila of res.rows) {
          expect(Object.keys(fila).sort()).toEqual([...columnas].sort());
        }
        const ajena = res.rows.find((f) => f.es_usuario_actual === false);
        expect(ajena?.nombre_corto).toBe("Tercero A.");
        const serializado = JSON.stringify(res.rows);
        for (const privado of ["tercero.privado", "@test.local", "Apellido", "peso_corporal"]) {
          expect(serializado).not.toContain(privado);
        }
      });

      it("enmascara peso_kg y reps en filas ajenas, preserva la fila propia y respeta filtro por p_ejercicio_id", async () => {
        const todas = await ranking("authenticated", A1, null);
        const filtradasEj1 = await ranking("authenticated", A1, EJERCICIO_1);
        const filtradasEj2 = await ranking("authenticated", A1, EJERCICIO_2);

        expect(todas.rows).toHaveLength(3);
        expect(new Set(todas.rows.map((f) => f.ejercicio_id))).toEqual(new Set([EJERCICIO_1, EJERCICIO_2]));

        expect(filtradasEj1.rows).toHaveLength(2);
        expect(filtradasEj1.rows.every((f) => f.ejercicio_id === EJERCICIO_1)).toBe(true);

        for (const rows of [todas.rows, filtradasEj1.rows]) {
          const ajenas = rows.filter((f) => f.es_usuario_actual === false);
          expect(ajenas.length).toBeGreaterThan(0);
          for (const fila of ajenas) {
            expect(fila.peso_kg).toBeNull();
            expect(fila.reps).toBeNull();
            expect(fila.nombre_corto).toBe("Tercero A.");
            expect(fila.sexo).toBe("M");
            expect(Number(fila.ratio)).toBeGreaterThan(0);
            expect(Number(fila.posicion)).toBe(1);
          }

          const propia = rows.find((f) => f.es_usuario_actual === true);
          expect(propia).toBeDefined();
          expect(propia!.ejercicio_id).toBe(EJERCICIO_1);
          expect(propia!.peso_kg).not.toBeNull();
          expect(Number(propia!.peso_kg)).toBe(84);
          expect(propia!.reps).toBe(5);
          expect(propia!.nombre_corto).toBe("Alumno U.");
          expect(propia!.sexo).toBe("M");
          expect(Number(propia!.ratio)).toBe(1.05);
          expect(Number(propia!.posicion)).toBe(2);

          const ej1 = rows.filter((f) => f.ejercicio_id === EJERCICIO_1);
          expect(ej1).toHaveLength(2);
          expect(ej1[0]).toMatchObject({ es_usuario_actual: false, nombre_corto: "Tercero A.", sexo: "M", peso_kg: null, reps: null });
          expect(Number(ej1[0]!.ratio)).toBe(1.43);
          expect(Number(ej1[0]!.posicion)).toBe(1);
          expect(ej1[1]).toMatchObject({ es_usuario_actual: true, nombre_corto: "Alumno U.", sexo: "M", reps: 5 });
          expect(Number(ej1[1]!.peso_kg)).toBe(84);
          expect(Number(ej1[1]!.ratio)).toBe(1.05);
          expect(Number(ej1[1]!.posicion)).toBe(2);
          expect(Number(ej1[0]!.posicion)).toBeLessThan(Number(ej1[1]!.posicion));
          expect(Number(ej1[0]!.ratio)).toBeGreaterThan(Number(ej1[1]!.ratio));
        }

        expect(filtradasEj2.rows).toHaveLength(1);
        expect(filtradasEj2.rows[0]).toMatchObject({
          ejercicio_id: EJERCICIO_2,
          es_usuario_actual: false,
          nombre_corto: "Tercero A.",
          sexo: "M",
          peso_kg: null,
          reps: null,
        });
        expect(Number(filtradasEj2.rows[0]!.ratio)).toBe(1.71);
        expect(Number(filtradasEj2.rows[0]!.posicion)).toBe(1);
      });

      it("ENTRENADOR y ADMIN acceden al ranking sin error, sin exponer peso_kg/reps ni PII y manteniendo el orden", async () => {
        for (const actor of [C1, ADMIN]) {
          const res = await ranking("authenticated", actor, null);
          expect(res.rows).toHaveLength(3);

          for (const fila of res.rows) {
            expect(fila.es_usuario_actual).toBe(false);
            expect(fila.peso_kg).toBeNull();
            expect(fila.reps).toBeNull();
            expect(fila.nombre_corto).toBeTruthy();
            expect(fila.sexo).toBe("M");
            expect(Number(fila.ratio)).toBeGreaterThan(0);
            expect(Number(fila.posicion)).toBeGreaterThanOrEqual(1);
          }

          const ej1 = res.rows.filter((f) => f.ejercicio_id === EJERCICIO_1);
          expect(ej1).toHaveLength(2);
          expect(ej1[0]!.nombre_corto).toBe("Tercero A.");
          expect(Number(ej1[0]!.posicion)).toBe(1);
          expect(Number(ej1[0]!.ratio)).toBe(1.43);
          expect(ej1[1]!.nombre_corto).toBe("Alumno U.");
          expect(Number(ej1[1]!.posicion)).toBe(2);
          expect(Number(ej1[1]!.ratio)).toBe(1.05);
          expect(Number(ej1[0]!.posicion)).toBeLessThan(Number(ej1[1]!.posicion));
          expect(Number(ej1[0]!.ratio)).toBeGreaterThan(Number(ej1[1]!.ratio));

          const serializado = JSON.stringify(res.rows);
          for (const privado of ["tercero.privado", "alumno1@test.local", "@test.local", "Apellido", "Uno", "peso_corporal"]) {
            expect(serializado).not.toContain(privado);
          }
        }
      });
    });
  });

  describe("7. Catálogo de ejercicios (usa_barra) y ejercicios_en_rutina: integridad RLS (G1/G2)", () => {
    const C_AJENO = "00000000-0000-0000-0000-0000000877c9";
    const EJ_CATALOGO_ID = "11111111-1111-4111-8111-000000087701";
    const PLAN_C1_A1_ID = "33333333-3333-4333-8333-000000087701";
    const DIA_C1_A1_ID = "33333333-3333-4333-8333-000000087702";
    const EJR_C1_A1_ID = "33333333-3333-4333-8333-000000087703";

    beforeAll(async () => {
      await db.exec(`
        INSERT INTO auth.users (id, email, raw_app_meta_data) VALUES
          ('${C_AJENO}', 'coach.ajeno877@test.local', '{"rol":"ENTRENADOR"}')
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia) VALUES
          ('${C_AJENO}', 'coach.ajeno877@test.local', 'Coach Ajeno 877', 'ENTRENADOR', 'ACTIVA')
        ON CONFLICT (id) DO UPDATE SET
          rol = EXCLUDED.rol,
          estado_membresia = EXCLUDED.estado_membresia;

        INSERT INTO public.ejercicios (id, nombre, url_video, musculos_principales, usa_barra) VALUES
          ('${EJ_CATALOGO_ID}', 'Ejercicio Catálogo 877', 'vid-original-877', ARRAY['Piernas'], false)
        ON CONFLICT (id) DO UPDATE SET
          nombre = EXCLUDED.nombre,
          url_video = EXCLUDED.url_video,
          usa_barra = EXCLUDED.usa_barra;

        INSERT INTO public.planes_entrenamiento (id, profesor_id, alumno_id, nombre, estado, tipo) VALUES
          ('${PLAN_C1_A1_ID}', '${C1}', '${A1}', 'Plan Privado C1-A1 877', 'ACTIVO', 'DE_ALUMNO')
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.dias_rutina (id, plan_id, nombre, orden) VALUES
          ('${DIA_C1_A1_ID}', '${PLAN_C1_A1_ID}', 'Día 1 C1-A1', 1)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones) VALUES
          ('${EJR_C1_A1_ID}', '${DIA_C1_A1_ID}', '${EJ_CATALOGO_ID}', 1, 4, '10')
        ON CONFLICT (id) DO NOTHING;
      `);
    });

    it("anon es rechazado (42501) en SELECT/INSERT/UPDATE/DELETE sobre ejercicios y ejercicios_en_rutina, y ejercicios_alternativas está podada", async () => {
      // public.ejercicios_alternativas fue podada en 20261123100000_podar_tablas_muertas.sql (sin superficie de ataque)
      const alt = await db.query<{ rel: string | null }>(
        `SELECT to_regclass('public.ejercicios_alternativas')::text AS rel`,
      );
      expect(alt.rows[0]?.rel).toBeNull();

      // Confirmar RLS habilitado y cero privilegios para anon en ejercicios y ejercicios_en_rutina
      const meta = await db.query<{
        relname: string;
        rls: boolean;
        sel: boolean;
        ins: boolean;
        upd: boolean;
        del: boolean;
      }>(
        `SELECT c.relname,
                c.relrowsecurity AS rls,
                has_table_privilege('anon', c.oid, 'SELECT') AS sel,
                has_table_privilege('anon', c.oid, 'INSERT') AS ins,
                has_table_privilege('anon', c.oid, 'UPDATE') AS upd,
                has_table_privilege('anon', c.oid, 'DELETE') AS del
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname IN ('ejercicios', 'ejercicios_en_rutina')
         ORDER BY c.relname`,
      );
      expect(meta.rows).toHaveLength(2);
      for (const row of meta.rows) {
        expect(row.rls, `RLS en ${row.relname}`).toBe(true);
        expect(row.sel, `SELECT anon en ${row.relname}`).toBe(false);
        expect(row.ins, `INSERT anon en ${row.relname}`).toBe(false);
        expect(row.upd, `UPDATE anon en ${row.relname}`).toBe(false);
        expect(row.del, `DELETE anon en ${row.relname}`).toBe(false);
      }

      // public.ejercicios: SELECT, INSERT, UPDATE y DELETE como anon -> 42501
      await expect(
        como("anon", null, `SELECT id, usa_barra FROM public.ejercicios LIMIT 1`),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        como("anon", null, `INSERT INTO public.ejercicios (nombre, usa_barra) VALUES ('Anon Hack', true)`),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        como("anon", null, `UPDATE public.ejercicios SET usa_barra = true WHERE id = $1`, [EJ_CATALOGO_ID]),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        como("anon", null, `DELETE FROM public.ejercicios WHERE id = $1`, [EJ_CATALOGO_ID]),
      ).rejects.toMatchObject({ code: "42501" });

      // public.ejercicios_en_rutina: SELECT, INSERT, UPDATE y DELETE como anon -> 42501
      await expect(
        como("anon", null, `SELECT id FROM public.ejercicios_en_rutina LIMIT 1`),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        como(
          "anon",
          null,
          `INSERT INTO public.ejercicios_en_rutina (dia_id, ejercicio_id, orden, series, repeticiones)
           VALUES ($1, $2, 99, 3, '10')`,
          [DIA_C1_A1_ID, EJ_CATALOGO_ID],
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        como("anon", null, `UPDATE public.ejercicios_en_rutina SET series = 99 WHERE id = $1`, [EJR_C1_A1_ID]),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        como("anon", null, `DELETE FROM public.ejercicios_en_rutina WHERE id = $1`, [EJR_C1_A1_ID]),
      ).rejects.toMatchObject({ code: "42501" });
    });

    it("ALUMNO puede leer el catálogo public.ejercicios pero no puede crear, modificar (usa_barra/nombre/url_video) ni borrar ejercicios ni ejercicios_en_rutina", async () => {
      // Lectura permitida del catálogo maestro
      const lectura = await como<{ id: string; nombre: string; usa_barra: boolean }>(
        "authenticated",
        A1,
        `SELECT id, nombre, usa_barra FROM public.ejercicios WHERE id = $1`,
        [EJ_CATALOGO_ID],
      );
      expect(lectura.rows).toEqual([
        { id: EJ_CATALOGO_ID, nombre: "Ejercicio Catálogo 877", usa_barra: false },
      ]);

      // INSERT en public.ejercicios rechazado por WITH CHECK (42501)
      await expect(
        como("authenticated", A1, `INSERT INTO public.ejercicios (nombre, usa_barra) VALUES ('Alumno Hack 877', true)`),
      ).rejects.toMatchObject({ code: "42501" });

      // UPDATE en public.ejercicios (usa_barra, nombre, url_video) bloqueado por USING (0 filas) y estado intacto
      const updUsaBarra = await como(
        "authenticated",
        A1,
        `UPDATE public.ejercicios SET usa_barra = true WHERE id = $1`,
        [EJ_CATALOGO_ID],
      );
      expect(updUsaBarra.affectedRows).toBe(0);

      const updMeta = await como(
        "authenticated",
        A1,
        `UPDATE public.ejercicios SET nombre = 'Hackeado', url_video = 'evil-vid' WHERE id = $1`,
        [EJ_CATALOGO_ID],
      );
      expect(updMeta.affectedRows).toBe(0);

      // DELETE en public.ejercicios bloqueado por USING (0 filas)
      const delEj = await como(
        "authenticated",
        A1,
        `DELETE FROM public.ejercicios WHERE id = $1`,
        [EJ_CATALOGO_ID],
      );
      expect(delEj.affectedRows).toBe(0);

      // Confirmar integridad intacta del registro del catálogo
      const estadoEj = await db.query<{ nombre: string; url_video: string | null; usa_barra: boolean }>(
        `SELECT nombre, url_video, usa_barra FROM public.ejercicios WHERE id = $1`,
        [EJ_CATALOGO_ID],
      );
      expect(estadoEj.rows).toEqual([
        { nombre: "Ejercicio Catálogo 877", url_video: "vid-original-877", usa_barra: false },
      ]);

      // En ejercicios_en_rutina: A1 lee su propia rutina, A2 no la ve, y A1 no puede INSERT/UPDATE/DELETE
      const propio = await como<{ id: string }>(
        "authenticated",
        A1,
        `SELECT id FROM public.ejercicios_en_rutina WHERE id = $1`,
        [EJR_C1_A1_ID],
      );
      expect(propio.rows).toHaveLength(1);

      const ajeno = await como<{ id: string }>(
        "authenticated",
        A2,
        `SELECT id FROM public.ejercicios_en_rutina WHERE id = $1`,
        [EJR_C1_A1_ID],
      );
      expect(ajeno.rows).toHaveLength(0);

      await expect(
        como(
          "authenticated",
          A1,
          `INSERT INTO public.ejercicios_en_rutina (dia_id, ejercicio_id, orden, series, repeticiones)
           VALUES ($1, $2, 99, 5, '5')`,
          [DIA_C1_A1_ID, EJ_CATALOGO_ID],
        ),
      ).rejects.toMatchObject({ code: "42501" });

      const updRutina = await como(
        "authenticated",
        A1,
        `UPDATE public.ejercicios_en_rutina SET series = 99, repeticiones = '99' WHERE id = $1`,
        [EJR_C1_A1_ID],
      );
      expect(updRutina.affectedRows).toBe(0);

      const delRutina = await como(
        "authenticated",
        A1,
        `DELETE FROM public.ejercicios_en_rutina WHERE id = $1`,
        [EJR_C1_A1_ID],
      );
      expect(delRutina.affectedRows).toBe(0);

      const estadoRutina = await db.query<{ series: number; repeticiones: string }>(
        `SELECT series, repeticiones FROM public.ejercicios_en_rutina WHERE id = $1`,
        [EJR_C1_A1_ID],
      );
      expect(estadoRutina.rows).toEqual([{ series: 4, repeticiones: "10" }]);
    });

    it("ENTRENADOR sin vínculo no puede leer ni mutar (INSERT/UPDATE/DELETE) ejercicios_en_rutina de otro entrenador/alumno", async () => {
      const selAjeno = await como<{ id: string }>(
        "authenticated",
        C_AJENO,
        `SELECT id FROM public.ejercicios_en_rutina WHERE id = $1`,
        [EJR_C1_A1_ID],
      );
      expect(selAjeno.rows).toHaveLength(0);

      await expect(
        como(
          "authenticated",
          C_AJENO,
          `INSERT INTO public.ejercicios_en_rutina (dia_id, ejercicio_id, orden, series, repeticiones)
           VALUES ($1, $2, 99, 5, '5')`,
          [DIA_C1_A1_ID, EJ_CATALOGO_ID],
        ),
      ).rejects.toMatchObject({ code: "42501" });

      const updAjeno = await como(
        "authenticated",
        C_AJENO,
        `UPDATE public.ejercicios_en_rutina SET series = 88, repeticiones = '88' WHERE id = $1`,
        [EJR_C1_A1_ID],
      );
      expect(updAjeno.affectedRows).toBe(0);

      const delAjeno = await como(
        "authenticated",
        C_AJENO,
        `DELETE FROM public.ejercicios_en_rutina WHERE id = $1`,
        [EJR_C1_A1_ID],
      );
      expect(delAjeno.affectedRows).toBe(0);

      // Estado intacto
      const estado = await db.query<{ series: number; repeticiones: string }>(
        `SELECT series, repeticiones FROM public.ejercicios_en_rutina WHERE id = $1`,
        [EJR_C1_A1_ID],
      );
      expect(estado.rows).toEqual([{ series: 4, repeticiones: "10" }]);

      // Control positivo: el entrenador dueño/asignado (C1) sí puede leer, insertar, actualizar y borrar en su plan
      const insertPropio = await como<{ id: string }>(
        "authenticated",
        C1,
        `INSERT INTO public.ejercicios_en_rutina (dia_id, ejercicio_id, orden, series, repeticiones)
         VALUES ($1, $2, 2, 3, '12')
         RETURNING id`,
        [DIA_C1_A1_ID, EJ_CATALOGO_ID],
      );
      expect(insertPropio.rows).toHaveLength(1);
      const nuevoEjdId = insertPropio.rows[0]!.id;

      const updPropio = await como(
        "authenticated",
        C1,
        `UPDATE public.ejercicios_en_rutina SET series = 5 WHERE id = $1`,
        [nuevoEjdId],
      );
      expect(updPropio.affectedRows).toBe(1);

      const delPropio = await como(
        "authenticated",
        C1,
        `DELETE FROM public.ejercicios_en_rutina WHERE id = $1`,
        [nuevoEjdId],
      );
      expect(delPropio.affectedRows).toBe(1);
    });

    it("ENTRENADOR y ADMIN sí pueden crear y actualizar usa_barra en public.ejercicios", async () => {
      const casos = [
        { rolNombre: "ENTRENADOR", sub: C1, nombre: "Ejercicio Coach Barra 877", inicial: true, actualizado: false },
        { rolNombre: "ADMIN", sub: ADMIN, nombre: "Ejercicio Admin Barra 877", inicial: false, actualizado: true },
      ];

      for (const caso of casos) {
        const creado = await como<{ id: string; usa_barra: boolean }>(
          "authenticated",
          caso.sub,
          `INSERT INTO public.ejercicios (nombre, musculos_principales, usa_barra)
           VALUES ($1, ARRAY['Pecho'], $2)
           RETURNING id, usa_barra`,
          [caso.nombre, caso.inicial],
        );
        expect(creado.rows, `INSERT ${caso.rolNombre}`).toHaveLength(1);
        expect(creado.rows[0]!.usa_barra).toBe(caso.inicial);
        const ejId = creado.rows[0]!.id;

        const actualizado = await como<{ usa_barra: boolean }>(
          "authenticated",
          caso.sub,
          `UPDATE public.ejercicios SET usa_barra = $2 WHERE id = $1 RETURNING usa_barra`,
          [ejId, caso.actualizado],
        );
        expect(actualizado.affectedRows, `UPDATE ${caso.rolNombre}`).toBe(1);
        expect(actualizado.rows[0]!.usa_barra).toBe(caso.actualizado);

        const borrado = await como(
          "authenticated",
          caso.sub,
          `DELETE FROM public.ejercicios WHERE id = $1`,
          [ejId],
        );
        expect(borrado.affectedRows, `DELETE ${caso.rolNombre}`).toBe(1);
      }
    });
  });
});
