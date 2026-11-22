import { beforeAll, describe, expect, it } from "vitest";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { crearDbMigrada } from "./helpers/pglite-migrada";

type Rol = "anon" | "authenticated" | "service_role";

const ADMIN = "00000000-0000-0000-0000-0000000000ad";
const A1 = "00000000-0000-0000-0000-0000000000a1";
const A2 = "00000000-0000-0000-0000-0000000000a2";
const C1 = "00000000-0000-0000-0000-0000000000c1";

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

  INSERT INTO public.alumno_historial_dolor (alumno_id, ejercicio_id, zona_articular, severidad, estado_recuperacion) VALUES
    ('${A1}', '${EJERCICIO_1}', 'RODILLA', 'LEVE', 'ACTIVO'),
    ('${A2}', '${EJERCICIO_1}', 'HOMBRO', 'LEVE', 'ACTIVO');

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
    it("anon no ve ninguna fila de tablas protegidas (0 filas o 42501)", async () => {
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
        expect([0, "42501"], `anon en ${tabla}`).toContain(res);
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
      expect(await contarComo("authenticated", C1, "planes_entrenamiento", `id = '${PLANTILLA_ID}'`)).toBe(1);
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
    it("anon no puede invocar extender_vigencia_plan (42501 o podada 42883)", async () => {
      let caught: unknown;
      try {
        await como("anon", null, `SELECT public.extender_vigencia_plan($1, 1)`, [PLANTILLA_ID]);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeDefined();
      expect(["42501", "42883"]).toContain((caught as { code?: string }).code);
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

    it("alumno no puede extender vigencia de una plantilla (o RPC podada)", async () => {
      if (!(await existeFuncion("public.extender_vigencia_plan(uuid,integer)"))) {
        return;
      }
      await expect(
        como("authenticated", A2, `SELECT public.extender_vigencia_plan($1, 365)`, [PLANTILLA_ID]),
      ).rejects.toThrow();
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

    it("admin puede clonar (y extender si la RPC existe) una plantilla", async () => {
      const clon = await como<{ clonar_plan_entrenamiento: string }>(
        "authenticated",
        ADMIN,
        `SELECT public.clonar_plan_entrenamiento($1, 'copia')`,
        [PLANTILLA_ID],
      );
      expect(clon.rows[0]?.clonar_plan_entrenamiento).toBeTruthy();

      if (await existeFuncion("public.extender_vigencia_plan(uuid,integer)")) {
        const ext = await como(
          "authenticated",
          ADMIN,
          `SELECT public.extender_vigencia_plan($1, 30)`,
          [PLANTILLA_ID],
        );
        expect(ext.rows).toHaveLength(1);
      }
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

    it("anon no ve filas en perfiles, registro_series, planes_entrenamiento ni mensajes", async () => {
      expect(await contarComo("anon", null, "perfiles")).toBe(0);
      expect(await contarComo("anon", null, "registro_series")).toBe(0);
      expect(await contarComo("anon", null, "planes_entrenamiento")).toBe(0);
      expect(await contarComo("anon", null, "mensajes")).toBe(0);
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
});
