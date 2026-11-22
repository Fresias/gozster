import { describe, it, expect, beforeAll } from "vitest";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { crearDbMigrada } from "./helpers/pglite-migrada";

// GOZS-323: CHECKs de ejercicios_en_rutina / planes / días y mensajes humanos de guardar_rutina (PGlite real).

const COACH = "00000000-0000-0000-0000-0000000000c1";
const EJ = "10000000-0000-0000-0000-0000000000e1";

let db: PGlite;

beforeAll(async () => {
  db = await crearDbMigrada();
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${COACH}','c@t');
    INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia)
      VALUES ('${COACH}','c@t','Coach','ENTRENADOR','ACTIVA')
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, nombre_completo = EXCLUDED.nombre_completo, rol = EXCLUDED.rol, estado_membresia = EXCLUDED.estado_membresia;
    INSERT INTO public.ejercicios (id, nombre) VALUES ('${EJ}','Press de Banca');
  `);
});

const ej = (o: Record<string, unknown> = {}) => ({
  ejercicio_id: EJ, nombre: "Press de Banca", series: 3, repeticiones: "8-12", descanso_segundos: 90, ...o,
});
const payload = (ejercicio: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  nombre: "Rutina", dias: [{ nombre: "Día 1", ejercicios: [ejercicio] }], ...extra,
});

async function guardar(p: unknown) {
  try {
    await db.transaction(async (tx: Transaction) => {
      await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: COACH, role: "authenticated" })]);
      await tx.query(`SET LOCAL ROLE authenticated`);
      await tx.query(`SELECT public.guardar_rutina($1::jsonb)`, [JSON.stringify(p)]);
    });
    return null;
  } catch (e) {
    return e as { message: string; code?: string };
  }
}

const planes = async () => (await db.query<{ n: string }>(`SELECT count(*)::text n FROM public.planes_entrenamiento`)).rows[0]!.n;

describe("guardar_rutina rechaza basura con GZ010, mensaje humano y sin escribir", () => {
  it("acepta un payload válido", async () => {
    expect(await guardar(payload(ej()))).toBeNull();
    expect(await guardar(payload(ej({ repeticiones: "3x10", rpe_objetivo: 8.5 })))).toBeNull();
  });

  it.each([
    ["repeticiones abc", { repeticiones: "abc" }, "las repeticiones deben ser como"],
    ["repeticiones emoji", { repeticiones: "💪" }, "las repeticiones deben ser como"],
    ["repeticiones 0 (sin dígitos válidos)", { repeticiones: "" }, "las repeticiones deben ser como"],
    ["repeticiones de 200 caracteres", { repeticiones: "x".repeat(200) }, "las repeticiones deben ser como"],
    ["series 0", { series: 0 }, "las series deben estar entre 1 y 20"],
    ["series 21", { series: 21 }, "las series deben estar entre 1 y 20"],
    ["descanso 99999", { descanso_segundos: 99999 }, "el descanso debe estar entre 0 y 900"],
    ["descanso negativo", { descanso_segundos: -1 }, "el descanso debe estar entre 0 y 900"],
    ["rpe 0", { rpe_objetivo: 0 }, "el RPE objetivo debe estar entre 1 y 10"],
    ["rpe 11", { rpe_objetivo: 11 }, "el RPE objetivo debe estar entre 1 y 10"],
    ["notas de 5000 caracteres", { notas: "n".repeat(5000) }, "las notas no pueden superar los 2000"],
  ])("%s", async (_n, campos, mensaje) => {
    const antes = await planes();
    const err = await guardar(payload(ej(campos)));
    expect(err?.code).toBe("GZ010");
    expect(err?.message).toContain(mensaje);
    expect(await planes()).toBe(antes);
  });

  it("comentarios del plan de 10000 caracteres", async () => {
    const antes = await planes();
    const err = await guardar(payload(ej(), { comentarios: "c".repeat(10000) }));
    expect(err?.code).toBe("GZ010");
    expect(err?.message).toContain("5000 caracteres");
    expect(await planes()).toBe(antes);
  });

  it("límites exactos son válidos", async () => {
    expect(await guardar(payload(ej({ series: 20, descanso_segundos: 900, notas: "n".repeat(2000), repeticiones: "12-10-8" }), { comentarios: "c".repeat(5000) }))).toBeNull();
    expect(await guardar(payload(ej({ series: 1, descanso_segundos: 0, rpe_objetivo: 1 })))).toBeNull();
  });
});

describe("CHECKs directos (cualquier cliente)", () => {
  it("nombre de plan y de día vacíos se rechazan", async () => {
    await expect(db.query(`INSERT INTO public.planes_entrenamiento (profesor_id, nombre) VALUES ('${COACH}', '   ')`))
      .rejects.toThrow(/chk_planes_nombre_no_vacio/);
    const plan = (await db.query<{ id: string }>(
      `INSERT INTO public.planes_entrenamiento (profesor_id, nombre) VALUES ('${COACH}', 'P') RETURNING id`)).rows[0]!.id;
    await expect(db.query(`INSERT INTO public.dias_rutina (plan_id, nombre, orden) VALUES ('${plan}', ' ', 1)`))
      .rejects.toThrow(/chk_dias_nombre_no_vacio/);
  });

  it("los CHECK quedan validados cuando no había datos que los violen", async () => {
    const r = await db.query<{ conname: string; convalidated: boolean }>(
      `SELECT conname, convalidated FROM pg_constraint WHERE conname LIKE 'chk\\_eer\\_%' OR conname IN
       ('chk_planes_comentarios_largo','chk_planes_nombre_no_vacio','chk_dias_nombre_no_vacio')`);
    expect(r.rows).toHaveLength(8);
    expect(r.rows.every((x) => x.convalidated)).toBe(true);
  });
});
