import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { aplicarMigracion, crearDbMigrada, MIGRATIONS_DIR } from "./helpers/pglite-migrada";

// GOZS-713 (PL-15): el job diario crea la cuota del período siguiente
// (mes de fecha_fin, vence en fecha_fin) y convive con renovar_contratacion.

const MIGRATION_FILE = "20261123030000_job_diario_generar_cuotas_mensuales.sql";
const SQL = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION_FILE), "utf-8");

const COACH = "00000000-0000-0000-0000-0000000713c0";
const ALUMNO = "00000000-0000-0000-0000-0000000713a0";
const C_EN_VENTANA = "71300000-0000-0000-0000-000000000001";
const C_LEJOS = "71300000-0000-0000-0000-000000000002";
const C_PAUSA = "71300000-0000-0000-0000-000000000003";
const C_VENCIDA_SIN_MARCAR = "71300000-0000-0000-0000-000000000004";
const C_SIN_MONTO = "71300000-0000-0000-0000-000000000005";
const C_SIN_PRECIO = "71300000-0000-0000-0000-000000000006";

// Fechas relativas a CURRENT_DATE (dias_aviso_previo por defecto = 5).
// La vencida usa -2 para que v_morosos (fecha argentina) la tome a cualquier hora UTC.
const SEED = `
  INSERT INTO auth.users (id, email) VALUES ('${COACH}','c713@t'),('${ALUMNO}','a713@t');
  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${COACH}','c713@t','Coach 713','ENTRENADOR',NULL,'ACTIVA'),
    ('${ALUMNO}','a713@t','Alumno 713','ALUMNO','${COACH}','ACTIVA')
  ON CONFLICT (id) DO UPDATE SET nombre_completo = EXCLUDED.nombre_completo, rol = EXCLUDED.rol,
    profesor_asignado_id = EXCLUDED.profesor_asignado_id, estado_membresia = EXCLUDED.estado_membresia;
  INSERT INTO public.entrenador_alumnos (entrenador_id, alumno_id) VALUES ('${COACH}','${ALUMNO}');
  INSERT INTO public.contrataciones (id, alumno_id, dia_vencimiento, fecha_inicio, fecha_fin, estado, precio_pactado) VALUES
    ('${C_EN_VENTANA}','${ALUMNO}',5,CURRENT_DATE - 27,CURRENT_DATE + 3,'VIGENTE',25000),
    ('${C_LEJOS}','${ALUMNO}',5,CURRENT_DATE,CURRENT_DATE + 30,'VIGENTE',25000),
    ('${C_PAUSA}','${ALUMNO}',5,CURRENT_DATE - 27,CURRENT_DATE + 3,'EN_PAUSA',25000),
    ('${C_VENCIDA_SIN_MARCAR}','${ALUMNO}',5,CURRENT_DATE - 32,CURRENT_DATE - 2,'VIGENTE',18000),
    ('${C_SIN_MONTO}','${ALUMNO}',5,CURRENT_DATE - 27,CURRENT_DATE + 3,'VIGENTE',NULL),
    ('${C_SIN_PRECIO}','${ALUMNO}',5,CURRENT_DATE - 27,CURRENT_DATE + 3,'VIGENTE',NULL);
  -- Primera cuota (alta): mes de fecha_inicio, con concepto propio.
  INSERT INTO public.cobros (contratacion_id, alumno_id, periodo, monto, fecha_vencimiento, estado, concepto) VALUES
    ('${C_EN_VENTANA}','${ALUMNO}',date_trunc('month', CURRENT_DATE - 27)::date,25000,CURRENT_DATE - 27,'PAGADO','Funcional 2x'),
    ('${C_SIN_PRECIO}','${ALUMNO}',date_trunc('month', CURRENT_DATE - 27)::date,21000,CURRENT_DATE - 27,'PAGADO',NULL);
`;

let db: PGlite;

type Cuota = { id: string; periodo: string; monto: string; fecha_vencimiento: string; estado: string; concepto: string | null };

/** Cuota del período siguiente: mes de la fecha_fin vigente. */
async function cuotasSiguientes(contratacionId: string): Promise<Cuota[]> {
  const r = await db.query<Cuota>(
    `SELECT cb.id, cb.periodo::text, cb.monto::text, cb.fecha_vencimiento::text, cb.estado, cb.concepto
     FROM public.cobros cb JOIN public.contrataciones c ON c.id = cb.contratacion_id
     WHERE cb.contratacion_id = $1 AND cb.periodo = date_trunc('month', c.fecha_fin::timestamp)::date`,
    [contratacionId]
  );
  return r.rows;
}

async function correrJob() {
  // Igual que pg_cron: sesión de base sin request.jwt.claims.
  const r = await db.query<{ resultado: { cuotas_generadas: number; por_vencer: number; vencidas: number } }>(
    `SELECT public.job_diario_contrataciones() AS resultado`
  );
  return r.rows[0]!.resultado;
}

function comoCoach<T>(sql: string, params: unknown[] = []) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: COACH, role: "authenticated" }),
    ]);
    await tx.query(`SET LOCAL ROLE authenticated`);
    return tx.query<T>(sql, params);
  });
}

async function contarCobros(contratacionId: string) {
  const r = await db.query<{ n: number; pagados: number }>(
    `SELECT count(*)::int AS n, count(*) FILTER (WHERE estado = 'PAGADO')::int AS pagados
     FROM public.cobros WHERE contratacion_id = $1`,
    [contratacionId]
  );
  return r.rows[0]!;
}

describe("GOZS-713: generación automática de cuotas mensuales", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
    await aplicarMigracion(db, SQL); // idempotente
    await db.exec(SEED);
  }, 120_000);

  it("la migración es posterior a las de main y PRs abiertos y no toca el schedule", () => {
    expect(MIGRATION_FILE > "20261123020000").toBe(true);
    expect(SQL).not.toMatch(/cron\.schedule/);
  });

  it("GIVEN contrataciones activas WHEN corre el job THEN crea la cuota del período siguiente solo en la ventana de aviso", async () => {
    const resultado = await correrJob();
    expect(resultado.cuotas_generadas).toBe(3);

    const fin = await db.query<{ fecha_fin: string; periodo: string }>(
      `SELECT fecha_fin::text, date_trunc('month', fecha_fin::timestamp)::date::text AS periodo
       FROM public.contrataciones WHERE id = $1`,
      [C_EN_VENTANA]
    );
    const [cuota] = await cuotasSiguientes(C_EN_VENTANA);
    expect(cuota).toMatchObject({
      periodo: fin.rows[0]!.periodo,
      monto: "25000.00",
      fecha_vencimiento: fin.rows[0]!.fecha_fin,
      estado: "PENDIENTE",
      concepto: "Funcional 2x",
    });

    // Sin precio pactado: hereda el monto de la última cuota.
    expect((await cuotasSiguientes(C_SIN_PRECIO))[0]?.monto).toBe("21000.00");

    expect(await cuotasSiguientes(C_LEJOS)).toHaveLength(0);
    expect(await cuotasSiguientes(C_PAUSA)).toHaveLength(0);
    expect(await cuotasSiguientes(C_SIN_MONTO)).toHaveLength(0);
  });

  it("una contratación vencida sin marcar recibe su cuota, queda VENCIDA y aparece en v_morosos", async () => {
    expect(await cuotasSiguientes(C_VENCIDA_SIN_MARCAR)).toHaveLength(1);
    const c = await db.query<{ estado: string }>(`SELECT estado FROM public.contrataciones WHERE id = $1`, [
      C_VENCIDA_SIN_MARCAR,
    ]);
    expect(c.rows[0]!.estado).toBe("VENCIDA");
    const m = await db.query(`SELECT 1 FROM public.v_morosos WHERE contratacion_id = $1`, [C_VENCIDA_SIN_MARCAR]);
    expect(m.rows).toHaveLength(1);
  });

  it("es idempotente: una segunda corrida no duplica cuotas", async () => {
    expect((await correrJob()).cuotas_generadas).toBe(0);
    expect(await contarCobros(C_EN_VENTANA)).toEqual({ n: 2, pagados: 1 });
  });

  it("renovar_contratacion toma la cuota generada por el job, sin duplicarla", async () => {
    const [generada] = await cuotasSiguientes(C_EN_VENTANA);

    const r = await comoCoach<{ cobro_id: string }>(
      `SELECT cobro_id FROM public.renovar_contratacion($1::uuid, 25000, 'TRANSFERENCIA', 'gozs713-renov')`,
      [C_EN_VENTANA]
    );
    expect(r.rows[0]!.cobro_id).toBe(generada!.id);
    expect(await contarCobros(C_EN_VENTANA)).toEqual({ n: 2, pagados: 2 });

    // Tras renovar, fecha_fin pasa al mes siguiente (fuera de la ventana): el job no genera otra.
    expect((await correrJob()).cuotas_generadas).toBe(0);
    expect(await contarCobros(C_EN_VENTANA)).toEqual({ n: 2, pagados: 2 });
  });
});
