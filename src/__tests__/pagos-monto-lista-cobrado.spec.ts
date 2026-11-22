import { describe, it, expect, beforeAll } from "vitest";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { crearDbMigrada } from "./helpers/pglite-migrada";

// GOZS-222: pagos con monto de lista, monto cobrado y nota.
// Migración probada sobre Postgres real (PGlite) con roles de Supabase simulados.

const ADMIN = "00000000-0000-0000-0000-000000000001";
const COACH_A = "00000000-0000-0000-0000-0000000000a1";
const COACH_B = "00000000-0000-0000-0000-0000000000b1";
const ALU_A1 = "00000000-0000-0000-0000-0000000000a2"; // 1 clase/semana, solo BOXEO
const ALU_A2 = "00000000-0000-0000-0000-0000000000a3"; // pase libre
const ALU_B = "00000000-0000-0000-0000-0000000000b2";
const PLAN_1_BOXEO = "20000000-0000-0000-0000-0000000000a1";
const PLAN_LIBRE = "20000000-0000-0000-0000-0000000000a2";

type Rol = "anon" | "authenticated" | "service_role";

const SEED = `
  INSERT INTO auth.users (id, email) VALUES
    ('${ADMIN}','ad@t'),
    ('${COACH_A}','ca@t'),('${COACH_B}','cb@t'),
    ('${ALU_A1}','a1@t'),('${ALU_A2}','a2@t'),('${ALU_B}','b@t');
  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${ADMIN}','ad@t','Admin','ADMIN',NULL,'ACTIVA'),
    ('${COACH_A}','ca@t','Coach A','ENTRENADOR',NULL,'ACTIVA'),
    ('${COACH_B}','cb@t','Coach B','ENTRENADOR',NULL,'ACTIVA'),
    ('${ALU_A1}','a1@t','Alumno A1','ALUMNO','${COACH_A}','ACTIVA'),
    ('${ALU_A2}','a2@t','Alumno A2','ALUMNO','${COACH_A}','ACTIVA'),
    ('${ALU_B}','b@t','Alumno B','ALUMNO','${COACH_B}','ACTIVA')
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, nombre_completo = EXCLUDED.nombre_completo, rol = EXCLUDED.rol, profesor_asignado_id = EXCLUDED.profesor_asignado_id, estado_membresia = EXCLUDED.estado_membresia;
  INSERT INTO public.planes_membresia (id, nombre, limite_semanal, cantidad_actividades, duracion_meses, precio) VALUES
    ('${PLAN_1_BOXEO}','1 por semana',1,1,1,15000),
    ('${PLAN_LIBRE}','Pase libre',NULL,2,1,35000);
  INSERT INTO public.contrataciones
    (alumno_id, tipo_servicio, dia_vencimiento, fecha_inicio, fecha_fin, estado, plan_membresia_id, actividad, precio_pactado) VALUES
    ('${ALU_A1}','PRESENCIAL',5,CURRENT_DATE - 10,CURRENT_DATE + 30,'VIGENTE','${PLAN_1_BOXEO}','BOXEO',14000),
    ('${ALU_A2}','PRESENCIAL',5,CURRENT_DATE - 10,CURRENT_DATE + 30,'VIGENTE','${PLAN_LIBRE}',NULL,30000),
    ('${ALU_B}','PRESENCIAL',5,CURRENT_DATE - 10,CURRENT_DATE + 30,'VIGENTE','${PLAN_LIBRE}',NULL,30000);
`;

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

async function crearCobro(contratacionAlumno: string, monto: number, venceEnDias: number, periodo: string) {
  const r = await db.query<{ id: string }>(
    `INSERT INTO public.cobros (contratacion_id, alumno_id, periodo, monto, fecha_vencimiento)
     SELECT id, alumno_id, '${periodo}', ${monto}, CURRENT_DATE + ${venceEnDias}
     FROM public.contrataciones WHERE alumno_id = '${contratacionAlumno}' RETURNING id`
  );
  return r.rows[0]!.id;
}


describe("GOZS-222: pagos con monto de lista, cobrado y nota (PGlite)", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
    await db.exec(SEED);
  }, 60_000);

  it("pago con 20% de descuento persiste lista, cobrado y nota; ingresos suma lo cobrado", async () => {
    const cobro = await crearCobro(ALU_A1, 40000, 5, "2026-10-01");
    await como(
      "authenticated",
      COACH_A,
      `SELECT * FROM public.registrar_pago('${cobro}', 32000, 'EFECTIVO', 'descuento 20%')`
    );
    const p = await db.query(
      `SELECT monto_lista::int AS l, monto_cobrado::int AS c, nota FROM public.pagos WHERE cobro_id = '${cobro}'`
    );
    expect(p.rows).toEqual([{ l: 40000, c: 32000, nota: "descuento 20%" }]);
    const ing = await como<{ ingresos: string }>(
      "authenticated",
      ADMIN,
      `SELECT ingresos::text FROM public.obtener_kpis_negocio(
         date_trunc('month', now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
         (date_trunc('month', now() AT TIME ZONE 'America/Argentina/Buenos_Aires') + interval '1 month - 1 day')::date
       )`
    );
    expect(Number(ing.rows[0]!.ingresos)).toBe(32000);
    const d = await como<{ descuento: string; nota: string }>(
      "authenticated",
      COACH_A,
      `SELECT descuento::text, nota FROM public.v_descuentos_otorgados`
    );
    expect(d.rows.map((r) => [Number(r.descuento), r.nota])).toEqual([[8000, "descuento 20%"]]);
    const otro = await como("authenticated", COACH_B, `SELECT * FROM public.v_descuentos_otorgados`);
    expect(otro.rows.length).toBe(0);
  });

  it("sin monto distinto se cobra la lista y no es descuento; monto <= 0 o NULL se rechaza", async () => {
    const cobro = await crearCobro(ALU_A2, 30000, 5, "2026-11-01");
    for (const montoInvalido of ["0", "-10", "NULL"]) {
      await expect(
        como("authenticated", COACH_A, `SELECT * FROM public.registrar_pago('${cobro}', ${montoInvalido}, 'EFECTIVO', NULL)`)
      ).rejects.toMatchObject({ code: "22023" });
    }
    await como("authenticated", COACH_A, `SELECT * FROM public.registrar_pago('${cobro}', 30000, 'EFECTIVO', NULL)`);
    const p = await db.query(`SELECT monto_lista::int AS l, monto_cobrado::int AS c FROM public.pagos WHERE cobro_id = '${cobro}'`);
    expect(p.rows).toEqual([{ l: 30000, c: 30000 }]);
    const d = await como("authenticated", COACH_A, `SELECT * FROM public.v_descuentos_otorgados`);
    expect(d.rows.length).toBe(1);
  });
});
