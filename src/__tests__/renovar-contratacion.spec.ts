import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { aplicarMigracion, crearDbMigrada, MIGRATIONS_DIR } from "./helpers/pglite-migrada";

const NEW_MIGRATION = "20261122230000_renovar_contratacion.sql";

const ADMIN = "00000000-0000-0000-0000-000000000001";
const COACH_A = "00000000-0000-0000-0000-0000000000a1";
const COACH_B = "00000000-0000-0000-0000-0000000000b1";
const ALU_A1 = "00000000-0000-0000-0000-0000000000a2";
const ALU_A2 = "00000000-0000-0000-0000-0000000000a3";
const ALU_B = "00000000-0000-0000-0000-0000000000b2";

const PLAN_FUNCIONAL = "20000000-0000-0000-0000-000000000001";

type Rol = "anon" | "authenticated" | "service_role";

const SEED = `
  INSERT INTO auth.users (id, email) VALUES
    ('${ADMIN}', 'admin@test.local'),
    ('${COACH_A}', 'coacha@test.local'),
    ('${COACH_B}', 'coachb@test.local'),
    ('${ALU_A1}', 'alu1@test.local'),
    ('${ALU_A2}', 'alu2@test.local'),
    ('${ALU_B}', 'alub@test.local');

  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${ADMIN}', 'admin@test.local', 'Admin Principal', 'ADMIN', NULL, 'ACTIVA'),
    ('${COACH_A}', 'coacha@test.local', 'Coach Alpha', 'ENTRENADOR', NULL, 'ACTIVA'),
    ('${COACH_B}', 'coachb@test.local', 'Coach Beta', 'ENTRENADOR', NULL, 'ACTIVA'),
    ('${ALU_A1}', 'alu1@test.local', 'Alumno Renueva', 'ALUMNO', '${COACH_A}', 'ACTIVA'),
    ('${ALU_A2}', 'alu2@test.local', 'Alumno Fin de Mes', 'ALUMNO', '${COACH_A}', 'ACTIVA'),
    ('${ALU_B}', 'alub@test.local', 'Alumno Ajeno', 'ALUMNO', '${COACH_B}', 'ACTIVA')
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, nombre_completo = EXCLUDED.nombre_completo, rol = EXCLUDED.rol, profesor_asignado_id = EXCLUDED.profesor_asignado_id, estado_membresia = EXCLUDED.estado_membresia;


  INSERT INTO public.planes_membresia (id, nombre, limite_semanal, cantidad_actividades, duracion_meses, precio) VALUES
    ('${PLAN_FUNCIONAL}', 'Funcional 2x', 2, 1, 1, 25000);
`;

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

type Renovacion = {
  contratacion_id: string;
  cobro_id: string;
  pago_id: string;
  periodo: string;
  fecha_fin: string;
  estado: string;
};

const renovar = (rol: Rol, sub: string | null, contratacionId: string, monto: number, key: string) =>
  como<Renovacion>(
    rol,
    sub,
    `SELECT contratacion_id, cobro_id, pago_id, periodo::text, fecha_fin::text, estado
     FROM public.renovar_contratacion($1::uuid, $2::numeric, 'TRANSFERENCIA', $3)`,
    [contratacionId, monto, key]
  );

/** Alta real vía RPC y luego fija fechas deterministas (como superusuario, sin trigger de rol). */
async function altaConPeriodo(alumnoId: string, fechaInicio: string, fechaFin: string, dia: number) {
  const alta = await como<{ contratacion_id: string; cobro_id: string }>(
    "authenticated",
    COACH_A,
    `SELECT contratacion_id, cobro_id FROM public.asignar_suscripcion_y_cobro(
      p_alumno_id => $1::uuid, p_plan_id => '${PLAN_FUNCIONAL}'::uuid, p_actividad => 'FUNCIONAL',
      p_monto => 25000, p_pagado => true, p_es_adicional => false
    )`,
    [alumnoId]
  );
  const { contratacion_id, cobro_id } = alta.rows[0]!;
  await db.query(
    `UPDATE public.contrataciones SET fecha_inicio = $2, fecha_fin = $3, dia_vencimiento = $4 WHERE id = $1`,
    [contratacion_id, fechaInicio, fechaFin, dia]
  );
  await db.query(`UPDATE public.cobros SET periodo = date_trunc('month', $2::date)::date WHERE id = $1`, [
    cobro_id,
    fechaInicio,
  ]);
  return contratacion_id;
}

const ingresosHoy = async () => {
  const r = await como<{ ingresos: string }>(
    "authenticated",
    ADMIN,
    `SELECT ingresos::text FROM public.obtener_kpis_negocio(
       (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
       (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)`
  );
  return Number(r.rows[0]!.ingresos);
};

describe("GOZS-699: renovar_contratacion (cuota, pago y extensión en una transacción)", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
    // Idempotencia de la migración nueva
    await aplicarMigracion(db, fs.readFileSync(path.join(MIGRATIONS_DIR, NEW_MIGRATION), "utf-8"));
    await db.exec(SEED);
  }, 60_000);

  it("GIVEN coach y alumno con contratación activa WHEN renueva THEN la cuota del período siguiente queda pagada y fecha_fin se extiende; un reintento no duplica nada e Ingresos suma una sola vez", async () => {
    const contratacionId = await altaConPeriodo(ALU_A1, "2026-10-15", "2026-11-15", 15);
    const ingresosAntes = await ingresosHoy();

    const r1 = await renovar("authenticated", COACH_A, contratacionId, 22000, "renov-a1-2026-11");
    const fila = r1.rows[0]!;
    expect(fila).toMatchObject({
      contratacion_id: contratacionId,
      periodo: "2026-11-01",
      fecha_fin: "2026-12-15",
    });

    const cuota = await db.query<{ periodo: string; estado: string; monto: string; fecha_vencimiento: string; concepto: string }>(
      `SELECT periodo::text, estado, monto::text, fecha_vencimiento::text, concepto
       FROM public.cobros WHERE id = $1`,
      [fila.cobro_id]
    );
    expect(cuota.rows).toEqual([
      { periodo: "2026-11-01", estado: "PAGADO", monto: "22000.00", fecha_vencimiento: "2026-11-15", concepto: "Funcional 2x" },
    ]);

    const pago = await db.query<{ cobro_id: string; monto_lista: string; monto_cobrado: string; estado: string; confirmado_por: string }>(
      `SELECT cobro_id, monto_lista::text, monto_cobrado::text, estado, confirmado_por
       FROM public.pagos WHERE id = $1`,
      [fila.pago_id]
    );
    expect(pago.rows).toEqual([
      { cobro_id: fila.cobro_id, monto_lista: "25000.00", monto_cobrado: "22000.00", estado: "CONFIRMADO", confirmado_por: COACH_A },
    ]);

    // Reintento con la misma clave: mismo resultado, sin efectos nuevos
    const r2 = await renovar("authenticated", COACH_A, contratacionId, 22000, "renov-a1-2026-11");
    expect(r2.rows[0]).toEqual(fila);

    const conteo = await db.query<{ cobros: number; pagos: number; fecha_fin: string }>(
      `SELECT
         (SELECT count(*)::int FROM public.cobros WHERE contratacion_id = $1) AS cobros,
         (SELECT count(*)::int FROM public.pagos WHERE contratacion_id = $1) AS pagos,
         (SELECT fecha_fin::text FROM public.contrataciones WHERE id = $1) AS fecha_fin`,
      [contratacionId]
    );
    expect(conteo.rows[0]).toEqual({ cobros: 2, pagos: 2, fecha_fin: "2026-12-15" });

    expect(await ingresosHoy()).toBe(ingresosAntes + 22000);

    // La misma clave no sirve para otra contratación
    const otra = await altaConPeriodo(ALU_A2, "2026-10-01", "2026-11-01", 1);
    await expect(renovar("authenticated", COACH_A, otra, 25000, "renov-a1-2026-11")).rejects.toMatchObject({
      code: "23505",
    });
  });

  it("toma la cuota ya generada del período (ON CONFLICT) y recorta el día de vencimiento en meses cortos", async () => {
    const contratacionId = await altaConPeriodo(ALU_A2, "2026-12-31", "2027-01-31", 31);
    await db.query(
      `INSERT INTO public.cobros (contratacion_id, alumno_id, periodo, monto, fecha_vencimiento, estado)
       VALUES ($1, $2, '2027-01-01', 25000, '2027-01-31', 'PENDIENTE')`,
      [contratacionId, ALU_A2]
    );

    const r = await renovar("authenticated", COACH_A, contratacionId, 25000, "renov-a2-2027-01");
    expect(r.rows[0]).toMatchObject({ periodo: "2027-01-01", fecha_fin: "2027-02-28" });

    const cuotas = await db.query<{ periodo: string; estado: string }>(
      `SELECT periodo::text, estado FROM public.cobros WHERE contratacion_id = $1 ORDER BY periodo`,
      [contratacionId]
    );
    expect(cuotas.rows).toEqual([
      { periodo: "2026-12-01", estado: "PAGADO" },
      { periodo: "2027-01-01", estado: "PAGADO" },
    ]);
  });

  it("rechaza al coach ajeno, al alumno y a anon sin efectos (42501)", async () => {
    const contratacionId = await altaConPeriodo(ALU_A1, "2027-03-10", "2027-04-10", 10);

    await expect(renovar("authenticated", COACH_B, contratacionId, 25000, "x-coach-b")).rejects.toMatchObject({ code: "42501" });
    await expect(renovar("authenticated", ALU_A1, contratacionId, 25000, "x-alumno")).rejects.toMatchObject({ code: "42501" });
    await expect(renovar("anon", null, contratacionId, 25000, "x-anon")).rejects.toMatchObject({ code: "42501" });

    const estado = await db.query<{ fecha_fin: string; cobros: number; pagos: number }>(
      `SELECT
         (SELECT fecha_fin::text FROM public.contrataciones WHERE id = $1) AS fecha_fin,
         (SELECT count(*)::int FROM public.cobros WHERE contratacion_id = $1) AS cobros,
         (SELECT count(*)::int FROM public.pagos WHERE idempotency_key LIKE 'x-%') AS pagos`,
      [contratacionId]
    );
    expect(estado.rows[0]).toEqual({ fecha_fin: "2027-04-10", cobros: 1, pagos: 0 });
  });

  it("EXECUTE solo para authenticated y el trigger de período nombra la RPC nueva", async () => {
    const grants = await db.query<{ anon: boolean; authenticated: boolean; publico: boolean }>(
      `SELECT
         has_function_privilege('anon', 'public.renovar_contratacion(uuid, numeric, text, text)', 'EXECUTE') AS anon,
         has_function_privilege('authenticated', 'public.renovar_contratacion(uuid, numeric, text, text)', 'EXECUTE') AS authenticated,
         EXISTS (
           SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
           WHERE p.proname = 'renovar_contratacion' AND a.grantee = 0
         ) AS publico`
    );
    expect(grants.rows[0]).toEqual({ anon: false, authenticated: true, publico: false });

    const def = await db.query<{ src: string; secdef: boolean }>(
      `SELECT
         (SELECT prosrc FROM pg_proc WHERE proname = 'fn_proteger_periodo_contratacion') AS src,
         (SELECT prosecdef FROM pg_proc WHERE proname = 'renovar_contratacion') AS secdef`
    );
    expect(def.rows[0]!.src).toContain("renovar_contratacion");
    expect(def.rows[0]!.secdef).toBe(true);
  });
});
