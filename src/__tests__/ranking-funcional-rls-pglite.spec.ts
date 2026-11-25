import { beforeAll, describe, expect, it } from "vitest";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { crearDbMigrada } from "./helpers/pglite-migrada";

// GOZS-829 (B1): marcas_funcional (RLS) + obtener_ranking_funcional / obtener_progreso_funcional_alumno.

const ADMIN = "00000000-0000-0000-0000-000000829ad0";
const COACH = "00000000-0000-0000-0000-000000829c01";
const COACH_AJENO = "00000000-0000-0000-0000-000000829c02";
const A = "00000000-0000-0000-0000-000000829a01"; // M, 80 kg
const B = "00000000-0000-0000-0000-000000829a02"; // M, 100 kg
const C = "00000000-0000-0000-0000-000000829a03"; // F, 60 kg
const D = "00000000-0000-0000-0000-000000829a04"; // sin peso corporal
const E = "00000000-0000-0000-0000-000000829a05"; // sin Funcional ni marcas

const EJ = "82900000-0000-4000-8000-000000000001";
const EJ2 = "82900000-0000-4000-8000-000000000002";
const CLASE = "82900000-0000-4000-8000-0000000000c1";

const SEED = `
  INSERT INTO auth.users (id, email) VALUES
    ('${ADMIN}', 'ad@t829'), ('${COACH}', 'co@t829'), ('${COACH_AJENO}', 'ca@t829'),
    ('${A}', 'a@t829'), ('${B}', 'b@t829'), ('${C}', 'c@t829'), ('${D}', 'd@t829'), ('${E}', 'e@t829');
  INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia, profesor_asignado_id, peso_corporal_kg, sexo, telefono) VALUES
    ('${ADMIN}', 'ad@t829', 'Admin', 'ADMIN', 'ACTIVA', NULL, NULL, NULL, NULL),
    ('${COACH}', 'co@t829', 'Coach', 'ENTRENADOR', 'ACTIVA', NULL, NULL, NULL, NULL),
    ('${COACH_AJENO}', 'ca@t829', 'Coach Ajeno', 'ENTRENADOR', 'ACTIVA', NULL, NULL, NULL, NULL),
    ('${A}', 'a@t829', 'Lucas Giménez', 'ALUMNO', 'ACTIVA', '${COACH}', 80, 'M', '111'),
    ('${B}', 'b@t829', 'Pedro Juan Álvarez', 'ALUMNO', 'ACTIVA', '${COACH}', 100, 'M', '222'),
    ('${C}', 'c@t829', 'Camila', 'ALUMNO', 'ACTIVA', '${COACH}', 60, 'F', '333'),
    ('${D}', 'd@t829', 'Dario Sinpeso', 'ALUMNO', 'ACTIVA', '${COACH}', NULL, 'M', '444'),
    ('${E}', 'e@t829', 'Eva Ajena', 'ALUMNO', 'ACTIVA', '${COACH}', 55, 'F', '555')
  ON CONFLICT (id) DO UPDATE SET nombre_completo = EXCLUDED.nombre_completo, telefono = EXCLUDED.telefono, rol = EXCLUDED.rol, profesor_asignado_id = EXCLUDED.profesor_asignado_id,
    peso_corporal_kg = EXCLUDED.peso_corporal_kg, sexo = EXCLUDED.sexo;
  INSERT INTO public.alumno_actividades (alumno_id, actividad, veces_por_semana) VALUES
    ('${A}', 'FUNCIONAL', 2), ('${B}', 'FUNCIONAL', 2), ('${C}', 'FUNCIONAL', 2), ('${D}', 'FUNCIONAL', 2),
    ('${E}', 'BOXEO', 2);
  INSERT INTO public.ejercicios (id, nombre) VALUES ('${EJ}', 'Peso muerto 829'), ('${EJ2}', 'Sentadilla 829');
  INSERT INTO public.clases (id, actividad, inicio, duracion_minutos) VALUES ('${CLASE}', 'FUNCIONAL', now(), 60);
`;

let db: PGlite;

function como<T>(sub: string | null, sql: string, params: unknown[] = [], role = "authenticated") {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub ? { sub, role } : { role }),
    ]);
    await tx.query(`SET LOCAL ROLE ${role}`);
    return tx.query<T>(sql, params);
  });
}

const INSERTAR = `INSERT INTO public.marcas_funcional (alumno_id, ejercicio_id, clase_id, fecha, peso_kg, reps) VALUES ($1, $2, $3, $4, $5, $6)`;

describe("GOZS-829: marcas_funcional + ranking Funcional", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
    await db.exec(SEED);
    // Semilla vía staff (RLS real): A 120x3 (ratio 1.50), A 100x5 (peor), B 140x1 (1.40), C 90x2 (1.50), D 200x1 (sin peso), A en otro ejercicio.
    await como(COACH, INSERTAR, [A, EJ, CLASE, "2026-11-01", 100, 5]);
    await como(COACH, INSERTAR, [A, EJ, null, "2026-11-10", 120, 3]);
    await como(COACH, INSERTAR, [B, EJ, CLASE, "2026-11-02", 140, 1]);
    await como(COACH, INSERTAR, [C, EJ, null, "2026-11-03", 90, 2]);
    await como(COACH, INSERTAR, [D, EJ, null, "2026-11-04", 200, 1]);
    await como(COACH, INSERTAR, [A, EJ2, null, "2026-11-05", 60, 8]);
  }, 120_000);

  it("RLS: el alumno solo lee lo suyo y no puede escribir; staff ajeno no ve", async () => {
    const propias = await como<{ n: number }>(A, `SELECT count(*)::int AS n FROM public.marcas_funcional`);
    expect(propias.rows[0]!.n).toBe(3);
    const deB = await como<{ n: number }>(A, `SELECT count(*)::int AS n FROM public.marcas_funcional WHERE alumno_id = $1`, [B]);
    expect(deB.rows[0]!.n).toBe(0);

    await expect(como(A, INSERTAR, [A, EJ, null, "2026-11-20", 500, 1])).rejects.toThrow();
    const upd = await como(A, `UPDATE public.marcas_funcional SET peso_kg = 1 WHERE alumno_id = $1`, [B]);
    expect(upd.affectedRows).toBe(0);
    const del = await como(A, `DELETE FROM public.marcas_funcional WHERE alumno_id = $1`, [B]);
    expect(del.affectedRows).toBe(0);
    const propioUpd = await como(A, `UPDATE public.marcas_funcional SET peso_kg = 1 WHERE alumno_id = $1`, [A]);
    expect(propioUpd.affectedRows).toBe(0);

    const ajeno = await como<{ n: number }>(COACH_AJENO, `SELECT count(*)::int AS n FROM public.marcas_funcional`);
    expect(ajeno.rows[0]!.n).toBe(0);
    await expect(como(COACH_AJENO, INSERTAR, [A, EJ, null, "2026-11-20", 1, 1])).rejects.toThrow();
  });

  it("RLS: staff del alumno actualiza y borra; registrado_por debe ser quien inserta; anon sin acceso", async () => {
    await como(COACH, INSERTAR, [E, EJ, null, "2026-11-06", 50, 5]);
    const upd = await como(COACH, `UPDATE public.marcas_funcional SET reps = 6 WHERE alumno_id = $1`, [E]);
    expect(upd.affectedRows).toBe(1);
    const del = await como(COACH, `DELETE FROM public.marcas_funcional WHERE alumno_id = $1`, [E]);
    expect(del.affectedRows).toBe(1);

    await expect(
      como(
        COACH,
        `INSERT INTO public.marcas_funcional (alumno_id, ejercicio_id, peso_kg, reps, registrado_por) VALUES ($1, $2, 1, 1, $3)`,
        [A, EJ, COACH_AJENO],
      ),
    ).rejects.toThrow();
    await expect(como(null, `SELECT 1 FROM public.marcas_funcional`, [], "anon")).rejects.toThrow();
  });

  it("ranking: mejor marca por alumno, ratio, posición por categoría y es_usuario_actual", async () => {
    const r = await como<Record<string, unknown>>(A, `SELECT * FROM public.obtener_ranking_funcional($1)`, [EJ]);
    expect(r.rows.map((x) => [x.nombre_corto, x.categoria, x.posicion, Number(x.ratio), x.es_usuario_actual])).toEqual([
      ["Camila", "F", 1, 1.5, false],
      ["Lucas G.", "M", 1, 1.5, true],
      ["Pedro Á.", "M", 2, 1.4, false],
    ]);
    const lucas = r.rows.find((x) => x.nombre_corto === "Lucas G.")!;
    expect(Number(lucas.peso_kg)).toBe(120);
    expect(lucas.reps).toBe(3);
  });

  it("ranking: filtra por clase", async () => {
    const r = await como<Record<string, unknown>>(COACH, `SELECT * FROM public.obtener_ranking_funcional($1, $2)`, [EJ, CLASE]);
    expect(r.rows.map((x) => [x.nombre_corto, Number(x.peso_kg)])).toEqual([
      ["Pedro Á.", 140],
      ["Lucas G.", 100],
    ]);
    expect(r.rows.every((x) => x.es_usuario_actual === false)).toBe(true);
  });

  it("ranking: sin fugas de PII ni peso corporal ni alumno_id", async () => {
    const r = await como<Record<string, unknown>>(A, `SELECT * FROM public.obtener_ranking_funcional($1)`, [EJ]);
    expect(Object.keys(r.rows[0]!).sort()).toEqual(
      ["categoria", "es_usuario_actual", "fecha", "nombre_corto", "peso_kg", "posicion", "ratio", "reps"].sort(),
    );
    const texto = JSON.stringify(r.rows, (_k, v) => (typeof v === "bigint" ? Number(v) : v));
    for (const prohibido of ["@t829", "Giménez", "Álvarez", "111", "222", "333", A, B, C, D, '"peso_corporal_kg"']) {
      expect(texto).not.toContain(prohibido);
    }
  });

  it("ranking: autorización por rol/actividad", async () => {
    await expect(como(E, `SELECT * FROM public.obtener_ranking_funcional($1)`, [EJ])).rejects.toMatchObject({ code: "42501" });
    await expect(como(null, `SELECT * FROM public.obtener_ranking_funcional($1)`, [EJ], "anon")).rejects.toThrow();
    await expect(
      como(null, `SELECT * FROM public.obtener_ranking_funcional($1)`, [EJ], "authenticated"),
    ).rejects.toMatchObject({ code: "42501" });
    const staff = await como(ADMIN, `SELECT * FROM public.obtener_ranking_funcional($1)`, [EJ]);
    expect(staff.rows).toHaveLength(3);
    // Alumno D (Funcional pero sin peso corporal): autorizado, pero fuera del ranking.
    const d = await como<{ nombre_corto: string }>(D, `SELECT nombre_corto FROM public.obtener_ranking_funcional($1)`, [EJ]);
    expect(d.rows.map((x) => x.nombre_corto)).not.toContain("Dario S.");
  });

  it("nombre corto: Nombre + inicial; sin apellido queda el nombre", async () => {
    const r = await db.query<{ a: string; b: string; c: string; d: string }>(
      `SELECT public.formatear_nombre_corto('Lucas Giménez') AS a,
              public.formatear_nombre_corto('  lucas   gimenez  ') AS b,
              public.formatear_nombre_corto('Lucas') AS c,
              public.formatear_nombre_corto(NULL) AS d`,
    );
    expect(r.rows[0]).toEqual({ a: "Lucas G.", b: "lucas G.", c: "Lucas", d: "" });
  });

  it("progreso: solo marcas propias, cronológico, con mejor marca histórica", async () => {
    const r = await como<Record<string, unknown>>(A, `SELECT * FROM public.obtener_progreso_funcional_alumno($1)`, [EJ]);
    expect(r.rows.map((x) => [Number(x.peso_kg), Number(x.mejor_marca_historica), x.ejercicio_nombre])).toEqual([
      [100, 120, "Peso muerto 829"],
      [120, 120, "Peso muerto 829"],
    ]);
    const todos = await como(A, `SELECT * FROM public.obtener_progreso_funcional_alumno()`);
    expect(todos.rows).toHaveLength(3);
    // El coach no recibe marcas de alumnos por esta RPC (solo las propias).
    const coach = await como(COACH, `SELECT * FROM public.obtener_progreso_funcional_alumno()`);
    expect(coach.rows).toHaveLength(0);
    await expect(como(null, `SELECT * FROM public.obtener_progreso_funcional_alumno()`, [], "anon")).rejects.toThrow();
  });

  it("respaldo: restaurar_filas_respaldo acepta marcas_funcional solo a service_role", async () => {
    const ok = await como<{ n: number }>(null, `SELECT public.restaurar_filas_respaldo('marcas_funcional', '[]'::jsonb) AS n`, [], "service_role");
    expect(ok.rows[0]!.n).toBe(0);
  });
});
