import { describe, it, expect, beforeAll } from "vitest";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { crearDbMigrada } from "./helpers/pglite-migrada";
import { prsDeClasesDesdeVista } from "@/lib/ranking-prs";

// GOZS-725 (PL-13): PRs derivados de registro_series vía la vista v_prs (PGlite real).

const COACH = "00000000-0000-0000-0000-0000000725c1";
const ALUMNO = "00000000-0000-0000-0000-0000000725a1";
const OTRO = "00000000-0000-0000-0000-0000000725a2";
const EJ = "10000000-0000-0000-0000-0000000725e1";
const SES1 = "20000000-0000-0000-0000-000000072501";
const SES2 = "20000000-0000-0000-0000-000000072502";
const SES_OTRO = "20000000-0000-0000-0000-000000072503";

let db: PGlite;

type Fila = { alumno_id: string; ejercicio_id: string; peso_kg: string; reps: number; fecha: string };

async function como(sub: string | null, sql: string): Promise<Fila[]> {
  let filas: Fila[] = [];
  await db.transaction(async (tx: Transaction) => {
    if (sub) {
      await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub, role: "authenticated" }),
      ]);
      await tx.query(`SET LOCAL ROLE authenticated`);
    } else {
      await tx.query(`SET LOCAL ROLE anon`);
    }
    filas = (await tx.query<Fila>(sql)).rows;
  });
  return filas;
}

beforeAll(async () => {
  db = await crearDbMigrada();
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${COACH}','c725@t'), ('${ALUMNO}','a725@t'), ('${OTRO}','o725@t');
    INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia)
      VALUES ('${COACH}','c725@t','Coach','ENTRENADOR','ACTIVA')
      ON CONFLICT (id) DO UPDATE SET rol = EXCLUDED.rol, estado_membresia = EXCLUDED.estado_membresia;
    INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia)
      VALUES ('${ALUMNO}','a725@t','Alumno','ALUMNO','${COACH}','ACTIVA'),
             ('${OTRO}','o725@t','Otro','ALUMNO',NULL,'ACTIVA')
      ON CONFLICT (id) DO UPDATE SET rol = EXCLUDED.rol, profesor_asignado_id = EXCLUDED.profesor_asignado_id, estado_membresia = EXCLUDED.estado_membresia;
    INSERT INTO public.ejercicios (id, nombre) VALUES ('${EJ}','Press 725');
    INSERT INTO public.registro_sesiones (id, alumno_id, fecha) VALUES
      ('${SES1}', '${ALUMNO}', '2026-11-01 12:00+00'),
      ('${SES2}', '${ALUMNO}', '2026-11-08 12:00+00'),
      ('${SES_OTRO}', '${OTRO}', '2026-11-08 12:00+00');
    INSERT INTO public.registro_series (sesion_id, ejercicio_id, numero_serie, peso_kg, reps_hechas, completada, set_type) VALUES
      ('${SES1}', '${EJ}', 1, 150, 5, true, 'WARMUP'),
      ('${SES1}', '${EJ}', 2, 100, 3, true, 'NORMAL'),
      ('${SES1}', '${EJ}', 3, 200, 1, false, 'NORMAL'),
      ('${SES2}', '${EJ}', 1, 100, 5, true, 'NORMAL'),
      ('${SES2}', '${EJ}', 2, 90, 8, true, 'NORMAL'),
      ('${SES_OTRO}', '${EJ}', 1, 60, 5, true, 'NORMAL');
  `);
});

describe("vista v_prs", () => {
  it("toma la serie completada de mayor peso (desempate por reps), sin calentamientos ni series incompletas", async () => {
    const filas = await como(ALUMNO, `SELECT alumno_id, ejercicio_id, peso_kg::text, reps, fecha::text FROM public.v_prs`);
    expect(filas).toEqual([
      { alumno_id: ALUMNO, ejercicio_id: EJ, peso_kg: "100.00", reps: 5, fecha: "2026-11-08" },
    ]);
  });

  it("RLS: el entrenador ve los PRs de su alumno, no los de alumnos ajenos", async () => {
    const filas = await como(COACH, `SELECT alumno_id, peso_kg::text FROM public.v_prs ORDER BY alumno_id`);
    expect(filas.map((f) => f.alumno_id)).toEqual([ALUMNO]);
  });

  it("anon no puede leer la vista", async () => {
    await expect(como(null, `SELECT * FROM public.v_prs`)).rejects.toThrow(/permission denied/);
  });
});

describe("prsDeClasesDesdeVista", () => {
  it("asigna cada PR a las clases en las que el alumno tiene reserva", () => {
    const prs = prsDeClasesDesdeVista(
      [{ alumno_id: "a1", ejercicio_id: "e1", peso_kg: 80, reps: 3, fecha: "2026-11-08", serie_id: "s1" }],
      [
        { clase_id: "c1", alumno_id: "a1" },
        { clase_id: "c2", alumno_id: "a1" },
        { clase_id: "c1", alumno_id: "a2" },
      ],
    );
    expect(prs.map((p) => [p.id, p.clase_id, p.alumno_id, p.peso_kg, p.reps])).toEqual([
      ["c1:s1", "c1", "a1", 80, 3],
      ["c2:s1", "c2", "a1", 80, 3],
    ]);
  });
});
