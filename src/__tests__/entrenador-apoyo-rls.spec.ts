import { beforeAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { aplicarMigracion, crearDbMigrada, MIGRATIONS_DIR } from "./helpers/pglite-migrada";

// GOZS-758: entrenador de apoyo (perfiles.profesor_apoyo_id) con bloqueo financiero por defecto.

const MIGRACION = "20261123160000_entrenador_apoyo_acceso_financiero.sql";

const ADMIN = "00000000-0000-0000-0000-0000000758ad";
const TITULAR = "00000000-0000-0000-0000-0000000758c1";
const APOYO = "00000000-0000-0000-0000-0000000758c2";
const AJENO = "00000000-0000-0000-0000-0000000758c3";
const ALUMNO = "00000000-0000-0000-0000-0000000758a1";
const OTRO_ALUMNO = "00000000-0000-0000-0000-0000000758a2";

const MEMBRESIA_ID = "75800000-0000-4000-8000-000000000001";
const CONTR_ID = "75800000-0000-4000-8000-000000000011";
const COBRO_ID = "75800000-0000-4000-8000-000000000021";
const SESION_ID = "75800000-0000-4000-8000-000000000031";
const CONV_ID = "75800000-0000-4000-8000-000000000041";
const EJERCICIO_ID = "75800000-0000-4000-8000-000000000051";

const SEED = `
  INSERT INTO auth.users (id, email, raw_app_meta_data) VALUES
    ('${ADMIN}', 'admin@t758', '{"rol":"ADMIN"}'),
    ('${TITULAR}', 'titular@t758', '{"rol":"ENTRENADOR"}'),
    ('${APOYO}', 'apoyo@t758', '{"rol":"ENTRENADOR"}'),
    ('${AJENO}', 'ajeno@t758', '{"rol":"ENTRENADOR"}'),
    ('${ALUMNO}', 'alumno@t758', '{"rol":"ALUMNO"}'),
    ('${OTRO_ALUMNO}', 'otro@t758', '{"rol":"ALUMNO"}');

  INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia, profesor_asignado_id) VALUES
    ('${ADMIN}', 'admin@t758', 'Admin', 'ADMIN', 'ACTIVA', NULL),
    ('${TITULAR}', 'titular@t758', 'Titular', 'ENTRENADOR', 'ACTIVA', NULL),
    ('${APOYO}', 'apoyo@t758', 'Apoyo', 'ENTRENADOR', 'ACTIVA', NULL),
    ('${AJENO}', 'ajeno@t758', 'Ajeno', 'ENTRENADOR', 'ACTIVA', NULL),
    ('${ALUMNO}', 'alumno@t758', 'Alumno', 'ALUMNO', 'ACTIVA', '${TITULAR}'),
    ('${OTRO_ALUMNO}', 'otro@t758', 'Otro', 'ALUMNO', 'ACTIVA', '${TITULAR}')
  ON CONFLICT (id) DO UPDATE SET rol = EXCLUDED.rol, profesor_asignado_id = EXCLUDED.profesor_asignado_id;

  UPDATE public.perfiles SET profesor_apoyo_id = '${APOYO}' WHERE id = '${ALUMNO}';

  INSERT INTO public.ejercicios (id, nombre) VALUES ('${EJERCICIO_ID}', 'Sentadilla 758');

  INSERT INTO public.planes_membresia (id, nombre, limite_semanal, cantidad_actividades, duracion_meses, precio) VALUES
    ('${MEMBRESIA_ID}', 'Plan 758', NULL, 2, 1, 35000);

  INSERT INTO public.contrataciones
    (id, alumno_id, tipo_servicio, dia_vencimiento, fecha_inicio, fecha_fin, estado, plan_membresia_id, precio_pactado)
  VALUES
    ('${CONTR_ID}', '${ALUMNO}', 'PRESENCIAL', 5, CURRENT_DATE - 10, CURRENT_DATE + 20, 'VIGENTE', '${MEMBRESIA_ID}', 35000);

  INSERT INTO public.cobros (id, contratacion_id, alumno_id, periodo, monto, fecha_vencimiento) VALUES
    ('${COBRO_ID}', '${CONTR_ID}', '${ALUMNO}', date_trunc('month', CURRENT_DATE)::date, 35000, CURRENT_DATE + 5);

  INSERT INTO public.pagos (contratacion_id, alumno_id, cobro_id, monto, medio_pago, estado, idempotency_key) VALUES
    ('${CONTR_ID}', '${ALUMNO}', NULL, 1000, 'TRANSFERENCIA', 'CONFIRMADO', 'idem-758');

  INSERT INTO public.registro_sesiones (id, alumno_id, duracion_minutos, volumen_total_kg) VALUES
    ('${SESION_ID}', '${ALUMNO}', 50, 1200);

  INSERT INTO public.alumno_historial_dolor (alumno_id, ejercicio_id, zona_articular, severidad) VALUES
    ('${ALUMNO}', '${EJERCICIO_ID}', 'RODILLA', 'LEVE');

  INSERT INTO public.conversaciones (id, alumno_id) VALUES ('${CONV_ID}', '${ALUMNO}');
  INSERT INTO public.mensajes (conversacion_id, remitente_id, contenido) VALUES ('${CONV_ID}', '${ALUMNO}', 'Hola');
`;

let db: PGlite;

function como<T>(sub: string, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub, role: "authenticated" }),
    ]);
    await tx.query(`SET LOCAL ROLE authenticated`);
    return tx.query<T>(sql, params);
  });
}

async function contar(sub: string, tabla: string, where: string): Promise<number> {
  const r = await como<{ n: number }>(sub, `SELECT count(*)::int AS n FROM public.${tabla} WHERE ${where}`);
  return r.rows[0]!.n;
}

async function bool(sub: string, fn: string, alumno = ALUMNO): Promise<boolean> {
  const r = await como<{ ok: boolean }>(sub, `SELECT public.${fn}($1) AS ok`, [alumno]);
  return r.rows[0]!.ok;
}

async function setFinanciero(valor: boolean) {
  await como(TITULAR, `UPDATE public.perfiles SET apoyo_acceso_financiero = $2 WHERE id = $1`, [ALUMNO, valor]);
}

const RPCS_FINANCIERAS: Array<[string, string, unknown[]]> = [
  ["renovar_contratacion", `SELECT public.renovar_contratacion($1, 35000, 'EFECTIVO', 'k-758-ren')`, [CONTR_ID]],
  [
    "extender_contratacion_excepcional",
    `SELECT public.extender_contratacion_excepcional($1, CURRENT_DATE + 60, 'cobertura')`,
    [CONTR_ID],
  ],
  ["registrar_pago", `SELECT public.registrar_pago($1, 1000, 'EFECTIVO', 'k-758-pago')`, [COBRO_ID]],
  [
    "registrar_y_confirmar_renovacion",
    `SELECT public.registrar_y_confirmar_renovacion($1, 35000, 'EFECTIVO', 'k-758-conf')`,
    [CONTR_ID],
  ],
  [
    "asignar_suscripcion_y_cobro",
    `SELECT * FROM public.asignar_suscripcion_y_cobro($1, $2, NULL, 35000)`,
    [ALUMNO, MEMBRESIA_ID],
  ],
];

describe("GOZS-758: entrenador de apoyo con bloqueo financiero", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
    await db.exec(SEED);
  }, 60_000);

  it("la migración es idempotente y crea columnas, constraint y función financiera", async () => {
    await aplicarMigracion(db, fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRACION), "utf-8"));
    const cols = await db.query<{ column_name: string; is_nullable: string; column_default: string | null }>(
      `SELECT column_name, is_nullable, column_default FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'perfiles'
         AND column_name IN ('profesor_apoyo_id', 'apoyo_acceso_financiero') ORDER BY column_name`,
    );
    expect(cols.rows).toEqual([
      { column_name: "apoyo_acceso_financiero", is_nullable: "NO", column_default: "false" },
      { column_name: "profesor_apoyo_id", is_nullable: "YES", column_default: null },
    ]);
    const fk = await db.query<{ d: string }>(
      `SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint
       WHERE conrelid = 'public.perfiles'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%profesor_apoyo_id%'`,
    );
    expect(fk.rows[0]!.d).toContain("ON DELETE SET NULL");
    expect((await db.query(`SELECT to_regprocedure('public.es_entrenador_financiero_de(uuid)') AS f`)).rows[0]).not.toEqual({
      f: null,
    });
  });

  describe("apoyo sin permiso financiero", () => {
    it("es entrenador del alumno pero no entrenador financiero", async () => {
      expect(await bool(APOYO, "es_entrenador_de")).toBe(true);
      expect(await bool(APOYO, "es_entrenador_financiero_de")).toBe(false);
      expect(await bool(TITULAR, "es_entrenador_financiero_de")).toBe(true);
      expect(await bool(APOYO, "es_entrenador_de", OTRO_ALUMNO)).toBe(false);
    });

    it("opera con normalidad sobre perfil, sesiones, molestias y chat", async () => {
      expect(await contar(APOYO, "perfiles", `id = '${ALUMNO}'`)).toBe(1);
      expect(await contar(APOYO, "registro_sesiones", `alumno_id = '${ALUMNO}'`)).toBe(1);
      expect(await contar(APOYO, "alumno_historial_dolor", `alumno_id = '${ALUMNO}'`)).toBe(1);
      expect(await contar(APOYO, "mensajes", `conversacion_id = '${CONV_ID}'`)).toBe(1);
      await como(
        APOYO,
        `INSERT INTO public.mensajes (conversacion_id, remitente_id, contenido) VALUES ($1, $2, 'Te cubro hoy')`,
        [CONV_ID, APOYO],
      );
      await como(APOYO, `UPDATE public.perfiles SET nivel_vista_alumno = 'TECNICA' WHERE id = $1`, [ALUMNO]);
    });

    it("no ve contrataciones, cobros, pagos ni v_estado_alumno", async () => {
      expect(await contar(APOYO, "contrataciones", `alumno_id = '${ALUMNO}'`)).toBe(0);
      expect(await contar(APOYO, "cobros", `alumno_id = '${ALUMNO}'`)).toBe(0);
      expect(await contar(APOYO, "pagos", `alumno_id = '${ALUMNO}'`)).toBe(0);
      expect(await contar(APOYO, "v_estado_alumno", `alumno_id = '${ALUMNO}'`)).toBe(0);
      expect(await contar(TITULAR, "v_estado_alumno", `alumno_id = '${ALUMNO}'`)).toBe(1);
    });

    it("no puede crear contrataciones ni cobros (42501)", async () => {
      await expect(
        como(
          APOYO,
          `INSERT INTO public.contrataciones (alumno_id, tipo_servicio, dia_vencimiento, fecha_inicio, fecha_fin, estado, plan_membresia_id, precio_pactado)
           VALUES ($1, 'PRESENCIAL', 5, CURRENT_DATE, CURRENT_DATE + 30, 'VIGENTE', $2, 1)`,
          [ALUMNO, MEMBRESIA_ID],
        ),
      ).rejects.toMatchObject({ code: "42501" });
      // trg_cobros_alumno corre antes del WITH CHECK y tampoco ve la contratación (23514).
      const errCobro = await como(
        APOYO,
        `INSERT INTO public.cobros (contratacion_id, alumno_id, periodo, monto, fecha_vencimiento)
         VALUES ($1, $2, date_trunc('month', CURRENT_DATE + 31)::date, 1, CURRENT_DATE + 40)`,
        [CONTR_ID, ALUMNO],
      ).then(
        () => null,
        (e: { code?: string }) => e.code,
      );
      expect(["42501", "23514"]).toContain(errCobro);
    });

    it("no actualiza contrataciones (0 filas)", async () => {
      const r = await como(APOYO, `UPDATE public.contrataciones SET dias_aviso_previo = 9 WHERE id = $1`, [CONTR_ID]);
      expect(r.affectedRows).toBe(0);
    });

    it.each(RPCS_FINANCIERAS)("RPC %s lo rechaza con 42501", async (_nombre, sql, params) => {
      await expect(como(APOYO, sql, params)).rejects.toMatchObject({ code: "42501" });
    });

    it("no puede cambiar membresía, cuenta ni baja del alumno (42501)", async () => {
      await expect(
        como(APOYO, `UPDATE public.perfiles SET estado_membresia = 'VENCIDA' WHERE id = $1`, [ALUMNO]),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        como(APOYO, `UPDATE public.perfiles SET fecha_vencimiento_cuota = CURRENT_DATE WHERE id = $1`, [ALUMNO]),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  describe("gestión del vínculo de apoyo", () => {
    it("el apoyo no puede concederse acceso financiero ni tocar asignación o apoyo (42501)", async () => {
      for (const set of [
        `apoyo_acceso_financiero = true`,
        `profesor_asignado_id = '${APOYO}', profesor_apoyo_id = NULL`,
        `profesor_apoyo_id = '${AJENO}'`,
        `profesor_apoyo_id = NULL`,
      ]) {
        await expect(
          como(APOYO, `UPDATE public.perfiles SET ${set} WHERE id = $1`, [ALUMNO]),
        ).rejects.toMatchObject({ code: "42501" });
      }
    });

    it("un coach ajeno no puede asignarse como apoyo (0 filas)", async () => {
      const r = await como(AJENO, `UPDATE public.perfiles SET profesor_apoyo_id = $2 WHERE id = $1`, [
        OTRO_ALUMNO,
        AJENO,
      ]);
      expect(r.affectedRows).toBe(0);
    });

    it("el apoyo no puede ser el propio alumno, el titular ni un alumno", async () => {
      await expect(
        db.query(`UPDATE public.perfiles SET profesor_apoyo_id = id WHERE id = $1`, [TITULAR]),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        db.query(`UPDATE public.perfiles SET profesor_apoyo_id = profesor_asignado_id WHERE id = $1`, [OTRO_ALUMNO]),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        como(TITULAR, `UPDATE public.perfiles SET profesor_apoyo_id = $2 WHERE id = $1`, [OTRO_ALUMNO, ALUMNO]),
      ).rejects.toMatchObject({ code: "22023" });
    });

    it("sin apoyo no puede haber acceso financiero", async () => {
      const r = await como<{ apoyo_acceso_financiero: boolean }>(
        TITULAR,
        `UPDATE public.perfiles SET apoyo_acceso_financiero = true WHERE id = $1 RETURNING apoyo_acceso_financiero`,
        [OTRO_ALUMNO],
      );
      expect(r.rows[0]!.apoyo_acceso_financiero).toBe(false);
    });

    it("titular concede acceso financiero: el apoyo opera cobros y contrataciones", async () => {
      await setFinanciero(true);
      expect(await bool(APOYO, "es_entrenador_financiero_de")).toBe(true);
      expect(await contar(APOYO, "contrataciones", `alumno_id = '${ALUMNO}'`)).toBe(1);
      expect(await contar(APOYO, "cobros", `alumno_id = '${ALUMNO}'`)).toBe(1);
      expect(await contar(APOYO, "pagos", `alumno_id = '${ALUMNO}'`)).toBe(1);
      expect(await contar(APOYO, "v_estado_alumno", `alumno_id = '${ALUMNO}'`)).toBe(1);
      const r = await como(APOYO, `UPDATE public.contrataciones SET dias_aviso_previo = 9 WHERE id = $1`, [CONTR_ID]);
      expect(r.affectedRows).toBe(1);
      await como(APOYO, `SELECT public.registrar_pago($1, 1000, 'EFECTIVO', 'k-758-pago-ok')`, [COBRO_ID]);
      // Con permiso financiero sigue sin poder gestionar su propio vínculo.
      await expect(
        como(APOYO, `UPDATE public.perfiles SET apoyo_acceso_financiero = false WHERE id = $1`, [ALUMNO]),
      ).rejects.toMatchObject({ code: "42501" });
    });

    it("dar de baja el apoyo revoca el permiso financiero y todo el acceso", async () => {
      await como(TITULAR, `UPDATE public.perfiles SET profesor_apoyo_id = NULL WHERE id = $1`, [ALUMNO]);
      const p = await db.query<{ apoyo_acceso_financiero: boolean }>(
        `SELECT apoyo_acceso_financiero FROM public.perfiles WHERE id = $1`,
        [ALUMNO],
      );
      expect(p.rows[0]!.apoyo_acceso_financiero).toBe(false);
      expect(await bool(APOYO, "es_entrenador_de")).toBe(false);
      expect(await contar(APOYO, "registro_sesiones", `alumno_id = '${ALUMNO}'`)).toBe(0);
      expect(await contar(APOYO, "cobros", `alumno_id = '${ALUMNO}'`)).toBe(0);
    });

    it("ADMIN puede asignar apoyo y conceder acceso financiero", async () => {
      await como(
        ADMIN,
        `UPDATE public.perfiles SET profesor_apoyo_id = $2, apoyo_acceso_financiero = true WHERE id = $1`,
        [ALUMNO, AJENO],
      );
      expect(await bool(AJENO, "es_entrenador_financiero_de")).toBe(true);
    });

    it("si el apoyo pasa a titular deja de ser apoyo", async () => {
      await como(ADMIN, `UPDATE public.perfiles SET profesor_asignado_id = $2 WHERE id = $1`, [ALUMNO, AJENO]);
      const p = await db.query<{ apoyo: string | null; fin: boolean }>(
        `SELECT profesor_apoyo_id::text AS apoyo, apoyo_acceso_financiero AS fin FROM public.perfiles WHERE id = $1`,
        [ALUMNO],
      );
      expect(p.rows[0]).toEqual({ apoyo: null, fin: false });
    });
  });

  describe("regresiones de auditoría QA", () => {
    async function vincular(titular: string, apoyo: string | null, financiero: boolean) {
      await db.query(
        `UPDATE public.perfiles SET profesor_asignado_id = $2, profesor_apoyo_id = $3, apoyo_acceso_financiero = $4 WHERE id = $1`,
        [ALUMNO, titular, apoyo, financiero],
      );
    }

    async function codigo(sub: string, sql: string, params: unknown[]): Promise<string | null> {
      return como(sub, sql, params).then(
        () => null,
        (e: { code?: string }) => e.code ?? "sin-codigo",
      );
    }

    it("sin oráculo de rol: alumno y apoyo reciben 42501 para cualquier UUID destino", async () => {
      await vincular(TITULAR, APOYO, false);
      for (const destino of [OTRO_ALUMNO, AJENO, ADMIN]) {
        expect(
          await codigo(ALUMNO, `UPDATE public.perfiles SET profesor_apoyo_id = $1 WHERE id = auth.uid()`, [destino]),
        ).toBe("42501");
        expect(
          await codigo(APOYO, `UPDATE public.perfiles SET profesor_apoyo_id = $2 WHERE id = $1`, [ALUMNO, destino]),
        ).toBe("42501");
      }
    });

    it("ADMIN asignado como apoyo sin permiso financiero sigue viendo v_estado_alumno", async () => {
      await vincular(TITULAR, ADMIN, false);
      expect(await contar(ADMIN, "v_estado_alumno", `alumno_id = '${ALUMNO}'`)).toBe(1);
    });

    it("auditoria_cambios de contrataciones sigue la regla financiera", async () => {
      await db.query(
        `INSERT INTO public.auditoria_cambios (entidad, entidad_id, accion, autorizado_por)
         VALUES ('contrataciones', $1, 'CREACION', $2)`,
        [CONTR_ID, ADMIN],
      );
      const filtro = `entidad = 'contrataciones' AND entidad_id = '${CONTR_ID}' AND autorizado_por = '${ADMIN}'`;
      await vincular(TITULAR, APOYO, false);
      expect(await contar(APOYO, "auditoria_cambios", filtro)).toBe(0);
      await vincular(TITULAR, APOYO, true);
      expect(await contar(APOYO, "auditoria_cambios", filtro)).toBe(1);
    });

    it("ON DELETE SET NULL al borrar el perfil del apoyo limpia el vínculo y el permiso", async () => {
      const COACH_TMP = "00000000-0000-0000-0000-0000000758c9";
      await db.exec(`
        INSERT INTO auth.users (id, email, raw_app_meta_data) VALUES ('${COACH_TMP}', 'tmp@t758', '{"rol":"ENTRENADOR"}');
        INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia)
        VALUES ('${COACH_TMP}', 'tmp@t758', 'Coach Tmp', 'ENTRENADOR', 'ACTIVA')
        ON CONFLICT (id) DO UPDATE SET rol = EXCLUDED.rol;
      `);
      await vincular(TITULAR, COACH_TMP, true);
      const borrado = await como(ADMIN, `DELETE FROM public.perfiles WHERE id = $1`, [COACH_TMP]);
      expect(borrado.affectedRows).toBe(1);
      const p = await db.query<{ apoyo: string | null; fin: boolean }>(
        `SELECT profesor_apoyo_id::text AS apoyo, apoyo_acceso_financiero AS fin FROM public.perfiles WHERE id = $1`,
        [ALUMNO],
      );
      expect(p.rows[0]).toEqual({ apoyo: null, fin: false });
    });

    it("transferir_conversacion_gozs: el apoyo no se autopromueve (42501) y el titular sí lo promueve", async () => {
      await vincular(TITULAR, APOYO, true);
      expect(
        await codigo(APOYO, `SELECT public.transferir_conversacion_gozs($1, $2, 'autopromocion')`, [CONV_ID, APOYO]),
      ).toBe("42501");
      const sinCambio = await db.query<{ titular: string }>(
        `SELECT profesor_asignado_id::text AS titular FROM public.perfiles WHERE id = $1`,
        [ALUMNO],
      );
      expect(sinCambio.rows[0]!.titular).toBe(TITULAR);

      await como(TITULAR, `SELECT public.transferir_conversacion_gozs($1, $2, 'cobertura')`, [CONV_ID, APOYO]);
      const p = await db.query<{ titular: string; apoyo: string | null; fin: boolean }>(
        `SELECT profesor_asignado_id::text AS titular, profesor_apoyo_id::text AS apoyo, apoyo_acceso_financiero AS fin
         FROM public.perfiles WHERE id = $1`,
        [ALUMNO],
      );
      expect(p.rows[0]).toEqual({ titular: APOYO, apoyo: null, fin: false });
    });
  });
});
