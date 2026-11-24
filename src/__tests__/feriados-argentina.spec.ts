import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { crearDbMigrada } from "./helpers/pglite-migrada";

// GOZS-229 / GOZS-726: feriados de Argentina y flag hay_clases sobre el esquema actual (PGlite).

const COACH = "00000000-0000-0000-0000-0000000000a1";
const ALUMNO = "00000000-0000-0000-0000-0000000000a2";

type Rol = "anon" | "authenticated" | "service_role";

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

describe("GOZS-229: feriados", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
    const seedPath = path.resolve(__dirname, "../../supabase/seed_data/feriados_ar_2026.sql");
    await db.exec(fs.readFileSync(seedPath, "utf-8"));
    await db.exec(fs.readFileSync(seedPath, "utf-8")); // idempotente
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${COACH}','c@t'),('${ALUMNO}','a@t');
      INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia) VALUES
        ('${COACH}','c@t','Coach','ENTRENADOR','ACTIVA'),('${ALUMNO}','a@t','Alumno','ALUMNO','ACTIVA')
        ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, nombre_completo = EXCLUDED.nombre_completo, rol = EXCLUDED.rol, estado_membresia = EXCLUDED.estado_membresia;
    `);
  }, 60_000);

  it("devuelve feriados de un rango con tipo, hay_clases en false y fuente documentada", async () => {
    const r = await como<{ fecha: string; tipo: string; hay_clases: boolean; fuente: string }>(
      "authenticated",
      ALUMNO,
      "SELECT fecha::text, tipo, hay_clases, fuente FROM public.feriados_en_rango('2026-03-01','2026-04-30')"
    );
    expect(r.rows.map((x) => x.fecha)).toEqual(["2026-03-23", "2026-03-24", "2026-04-02", "2026-04-03"]);
    expect(r.rows[0]!.tipo).toBe("PUENTE");
    expect(r.rows.every((x) => x.hay_clases === false)).toBe(true);
    expect(r.rows.every((x) => x.fuente.includes("argentina.gob.ar"))).toBe(true);
  });

  it("feriado no habilita clases por defecto y día común no figura en feriados_en_rango", async () => {
    const podada = await db.query<{ oid: string | null }>(
      "SELECT to_regprocedure('public.fecha_habilita_clases(date)')::text AS oid"
    );
    expect(podada.rows[0]?.oid).toBeNull();

    const r = await como<{ fecha: string; hay_clases: boolean }>(
      "authenticated",
      ALUMNO,
      "SELECT fecha::text, hay_clases FROM public.feriados_en_rango('2026-05-25','2026-05-26')"
    );
    expect(r.rows).toEqual([{ fecha: "2026-05-25", hay_clases: false }]);
  });

  it("solo entrenador/admin escribe; anon no lee", async () => {
    await expect(
      como("authenticated", ALUMNO, "INSERT INTO public.feriados (fecha, nombre, tipo) VALUES ('2026-09-01','x','PUENTE')")
    ).rejects.toMatchObject({ code: "42501" });

    await como("authenticated", ALUMNO, "UPDATE public.feriados SET hay_clases = true WHERE fecha = '2026-05-25'");
    const trasAlumno = await como<{ hay_clases: boolean }>(
      "authenticated",
      ALUMNO,
      "SELECT hay_clases FROM public.feriados_en_rango('2026-05-25','2026-05-25')"
    );
    expect(trasAlumno.rows[0]!.hay_clases).toBe(false);

    await como("authenticated", COACH, "UPDATE public.feriados SET hay_clases = true WHERE fecha = '2026-05-25'");
    const trasCoach = await como<{ hay_clases: boolean }>(
      "authenticated",
      ALUMNO,
      "SELECT hay_clases FROM public.feriados_en_rango('2026-05-25','2026-05-25')"
    );
    expect(trasCoach.rows[0]!.hay_clases).toBe(true);

    await expect(
      como("anon", null, "SELECT * FROM public.feriados_en_rango('2026-01-01','2026-12-31')")
    ).rejects.toMatchObject({ code: "42501" });

    await expect(como("anon", null, "SELECT * FROM public.feriados")).rejects.toMatchObject({ code: "42501" });
  });
});
