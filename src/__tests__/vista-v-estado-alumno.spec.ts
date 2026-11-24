import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { aplicarMigracion, crearDbMigrada, MIGRATIONS_DIR } from "./helpers/pglite-migrada";

const NEW_MIGRATION = "20261123060000_vista_v_estado_alumno.sql";

const COACH_A = "00000000-0000-0000-0000-0000000007a1";
const COACH_B = "00000000-0000-0000-0000-0000000007b1";
const AL_DIA = "00000000-0000-0000-0000-0000000007a2";
const POR_VENCER = "00000000-0000-0000-0000-0000000007a3";
const DEUDA = "00000000-0000-0000-0000-0000000007a4";
const FIN_PASADO = "00000000-0000-0000-0000-0000000007a5";
const PAUSA = "00000000-0000-0000-0000-0000000007a6";
const PENDIENTE = "00000000-0000-0000-0000-0000000007a7";
const SIN_CONTRATO = "00000000-0000-0000-0000-0000000007a8";
const AJENO = "00000000-0000-0000-0000-0000000007b2";

const C_DEUDA = "10000000-0000-0000-0000-0000000007a4";

type Rol = "anon" | "authenticated" | "service_role";
type Fila = {
  alumno_id: string;
  estado: string;
  al_dia: boolean;
  cobros_vencidos: number;
  fecha_vencimiento: string | null;
};

// Fecha relativa a "hoy" en Argentina, igual que la vista.
const HOY = `(now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`;
const dia = (n: number) => `(${HOY} + ${n})`;

// El perfil guarda a propósito valores contradictorios (ACTIVA / VENCIDA)
// para probar que la vista no los lee.
const SEED = `
  INSERT INTO auth.users (id, email) VALUES
    ('${COACH_A}', 'c7a@test.local'), ('${COACH_B}', 'c7b@test.local'),
    ('${AL_DIA}', 'a1@test.local'), ('${POR_VENCER}', 'a2@test.local'),
    ('${DEUDA}', 'a3@test.local'), ('${FIN_PASADO}', 'a4@test.local'),
    ('${PAUSA}', 'a5@test.local'), ('${PENDIENTE}', 'a6@test.local'),
    ('${SIN_CONTRATO}', 'a7@test.local'), ('${AJENO}', 'b1@test.local');

  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${COACH_A}', 'c7a@test.local', 'Coach A', 'ENTRENADOR', NULL, 'ACTIVA'),
    ('${COACH_B}', 'c7b@test.local', 'Coach B', 'ENTRENADOR', NULL, 'ACTIVA'),
    ('${AL_DIA}', 'a1@test.local', 'Al Dia', 'ALUMNO', '${COACH_A}', 'VENCIDA'),
    ('${POR_VENCER}', 'a2@test.local', 'Por Vencer', 'ALUMNO', '${COACH_A}', 'ACTIVA'),
    ('${DEUDA}', 'a3@test.local', 'Con Deuda', 'ALUMNO', '${COACH_A}', 'ACTIVA'),
    ('${FIN_PASADO}', 'a4@test.local', 'Fin Pasado', 'ALUMNO', '${COACH_A}', 'ACTIVA'),
    ('${PAUSA}', 'a5@test.local', 'En Pausa', 'ALUMNO', '${COACH_A}', 'ACTIVA'),
    ('${PENDIENTE}', 'a6@test.local', 'Pendiente', 'ALUMNO', '${COACH_A}', 'ACTIVA'),
    ('${SIN_CONTRATO}', 'a7@test.local', 'Sin Contrato', 'ALUMNO', '${COACH_A}', 'ACTIVA'),
    ('${AJENO}', 'b1@test.local', 'Ajeno', 'ALUMNO', '${COACH_B}', 'ACTIVA')
  ON CONFLICT (id) DO UPDATE SET rol = EXCLUDED.rol, profesor_asignado_id = EXCLUDED.profesor_asignado_id,
    estado_membresia = EXCLUDED.estado_membresia;


  INSERT INTO public.contrataciones (id, alumno_id, estado, dia_vencimiento, fecha_inicio, fecha_fin) VALUES
    (gen_random_uuid(), '${AL_DIA}', 'VIGENTE', 1, ${dia(-10)}, ${dia(20)}),
    -- Una contratación vieja vencida no pesa: manda la de fecha_fin más reciente.
    (gen_random_uuid(), '${AL_DIA}', 'VENCIDA', 1, ${dia(-70)}, ${dia(-40)}),
    (gen_random_uuid(), '${POR_VENCER}', 'VIGENTE', 1, ${dia(-25)}, ${dia(3)}),
    ('${C_DEUDA}', '${DEUDA}', 'VIGENTE', 1, ${dia(-10)}, ${dia(20)}),
    (gen_random_uuid(), '${FIN_PASADO}', 'VIGENTE', 1, ${dia(-40)}, ${dia(-1)}),
    (gen_random_uuid(), '${PAUSA}', 'EN_PAUSA', 1, ${dia(-40)}, ${dia(-1)}),
    (gen_random_uuid(), '${PENDIENTE}', 'PENDIENTE_RENOVACION', 1, ${dia(-10)}, ${dia(20)}),
    (gen_random_uuid(), '${AJENO}', 'VIGENTE', 1, ${dia(-10)}, ${dia(20)});

  INSERT INTO public.cobros (contratacion_id, alumno_id, periodo, monto, fecha_vencimiento, estado) VALUES
    ('${C_DEUDA}', '${DEUDA}', date_trunc('month', ${dia(-40)})::date, 1000, ${dia(-5)}, 'PENDIENTE'),
    ('${C_DEUDA}', '${DEUDA}', date_trunc('month', ${dia(-80)})::date, 1000, ${dia(-35)}, 'PAGADO');
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

async function filasPorAlumno(rol: Rol, sub: string | null) {
  const r = await como<Fila>(rol, sub, `SELECT * FROM public.v_estado_alumno`);
  return new Map(r.rows.map((f) => [f.alumno_id, f]));
}

describe("v_estado_alumno (GOZS-719)", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
    await aplicarMigracion(db, fs.readFileSync(path.join(MIGRATIONS_DIR, NEW_MIGRATION), "utf-8"));
    await db.exec(SEED);
  }, 120_000);

  it("deriva el estado desde contrataciones y cobros, ignorando perfiles.estado_membresia", async () => {
    const f = await filasPorAlumno("service_role", null);
    expect(f.get(AL_DIA)).toMatchObject({ estado: "AL_DIA", al_dia: true, cobros_vencidos: 0 });
    expect(f.get(POR_VENCER)).toMatchObject({ estado: "POR_VENCER", al_dia: true });
    expect(f.get(DEUDA)).toMatchObject({ estado: "VENCIDA", al_dia: false, cobros_vencidos: 1 });
    expect(f.get(FIN_PASADO)).toMatchObject({ estado: "VENCIDA", al_dia: false });
    expect(f.get(PAUSA)).toMatchObject({ estado: "EN_PAUSA", al_dia: false });
    expect(f.get(PENDIENTE)).toMatchObject({ estado: "PENDIENTE", al_dia: false });
    expect(f.get(SIN_CONTRATO)).toMatchObject({ estado: "SIN_CONTRATACION", al_dia: false, fecha_vencimiento: null });
  });

  it("no incluye a entrenadores sin contratación", async () => {
    const f = await filasPorAlumno("service_role", null);
    expect(f.has(COACH_A)).toBe(false);
    expect(f.has(COACH_B)).toBe(false);
  });

  it("respeta el RLS: el coach ve solo a sus alumnos y el alumno solo su fila", async () => {
    const coach = await filasPorAlumno("authenticated", COACH_A);
    expect(coach.has(AJENO)).toBe(false);
    expect(coach.get(DEUDA)?.estado).toBe("VENCIDA");

    const alumno = await filasPorAlumno("authenticated", DEUDA);
    expect([...alumno.keys()]).toEqual([DEUDA]);
    expect(alumno.get(DEUDA)).toMatchObject({ estado: "VENCIDA", cobros_vencidos: 1 });
  });

  it("anon no puede leer la vista", async () => {
    await expect(como("anon", null, `SELECT 1 FROM public.v_estado_alumno`)).rejects.toThrow(/permission denied/);
  });
});
