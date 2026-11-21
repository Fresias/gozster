import { describe, it, expect, beforeAll } from "vitest";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { crearDbMigrada } from "./helpers/pglite-migrada";

const COACH = "00000000-0000-0000-0000-000000000002";
const ALUMNO = "00000000-0000-0000-0000-000000000004";
const OTRO_ALUMNO = "00000000-0000-0000-0000-000000000005";
const ALUMNO_NUEVO = "00000000-0000-0000-0000-000000000006";

type Rol = "anon" | "authenticated" | "service_role";

const SEED_PERFILES = `
  INSERT INTO auth.users (id, email) VALUES
    ('${COACH}','coach@t'),('${ALUMNO}','a@t'),('${OTRO_ALUMNO}','b@t');
  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${COACH}','coach@t','Coach','ENTRENADOR',NULL,'ACTIVA'),
    ('${ALUMNO}','a@t','Lucía Fernández','ALUMNO','${COACH}','ACTIVA'),
    ('${OTRO_ALUMNO}','b@t','Marcos Díaz','ALUMNO','${COACH}','ACTIVA');
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

describe("GH #548: perfiles.onboarding_completado y RPC completar_onboarding_alumno (PGlite)", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
    await db.exec(SEED_PERFILES);
  }, 120_000);

  it("1. crea la columna onboarding_completado con DEFAULT false NOT NULL", async () => {
    const existentes = await db.query<{ id: string; onboarding_completado: boolean }>(
      `SELECT id, onboarding_completado FROM public.perfiles WHERE id IN ($1, $2) ORDER BY id`,
      [ALUMNO, OTRO_ALUMNO],
    );
    expect(existentes.rows).toEqual([
      { id: ALUMNO, onboarding_completado: false },
      { id: OTRO_ALUMNO, onboarding_completado: false },
    ]);

    // Un perfil recién creado también arranca en false por defecto
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'nuevo@t')`, [ALUMNO_NUEVO]);
    await db.query(
      `INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia)
       VALUES ($1, 'nuevo@t', 'Nuevo Alumno', 'ALUMNO', $2, 'ACTIVA')`,
      [ALUMNO_NUEVO, COACH],
    );
    const nuevo = await db.query<{ onboarding_completado: boolean }>(
      `SELECT onboarding_completado FROM public.perfiles WHERE id = $1`,
      [ALUMNO_NUEVO],
    );
    expect(nuevo.rows[0]?.onboarding_completado).toBe(false);

    // NOT NULL impide insertar NULL explícito
    await expect(
      db.query(`UPDATE public.perfiles SET onboarding_completado = NULL WHERE id = $1`, [
        ALUMNO_NUEVO,
      ]),
    ).rejects.toThrow();
  });

  it("2. usuario autenticado ejecuta completar_onboarding_alumno() -> marca true solo su fila y es idempotente", async () => {
    const res = await como<{ completar_onboarding_alumno: boolean }>(
      "authenticated",
      ALUMNO,
      `SELECT public.completar_onboarding_alumno()`,
    );
    expect(res.rows[0]?.completar_onboarding_alumno).toBe(true);

    const lectura = await como<{ onboarding_completado: boolean }>(
      "authenticated",
      ALUMNO,
      `SELECT onboarding_completado FROM public.perfiles WHERE id = $1`,
      [ALUMNO],
    );
    expect(lectura.rows[0]?.onboarding_completado).toBe(true);

    // Llamarla nuevamente sigue devolviendo true sin error
    const resRepetida = await como<{ completar_onboarding_alumno: boolean }>(
      "authenticated",
      ALUMNO,
      `SELECT public.completar_onboarding_alumno()`,
    );
    expect(resRepetida.rows[0]?.completar_onboarding_alumno).toBe(true);
  });

  it("3. no modifica filas de otros alumnos", async () => {
    const otro = await db.query<{ onboarding_completado: boolean }>(
      `SELECT onboarding_completado FROM public.perfiles WHERE id = $1`,
      [OTRO_ALUMNO],
    );
    expect(otro.rows[0]?.onboarding_completado).toBe(false);

    const nuevo = await db.query<{ onboarding_completado: boolean }>(
      `SELECT onboarding_completado FROM public.perfiles WHERE id = $1`,
      [ALUMNO_NUEVO],
    );
    expect(nuevo.rows[0]?.onboarding_completado).toBe(false);
  });

  it("4. rechaza ejecución para anon y para llamadas sin auth.uid() con SQLSTATE 42501", async () => {
    let anonCode: string | undefined;
    try {
      await como("anon", null, `SELECT public.completar_onboarding_alumno()`);
    } catch (err: unknown) {
      anonCode = (err as { code?: string }).code;
    }
    expect(anonCode).toBe("42501");

    let unauthCode: string | undefined;
    try {
      await como("authenticated", null, `SELECT public.completar_onboarding_alumno()`);
    } catch (err: unknown) {
      unauthCode = (err as { code?: string }).code;
    }
    expect(unauthCode).toBe("42501");
  });
});
