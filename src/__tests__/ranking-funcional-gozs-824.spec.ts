import { describe, it, expect, beforeAll } from "vitest";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { crearDbMigrada } from "./helpers/pglite-migrada";

// GOZS-824: persistencia de marcas de Funcional + ranking seguro (PGlite real).

const COACH = "00000000-0000-0000-0000-000000082401";
const LUCAS = "00000000-0000-0000-0000-000000082411"; // Funcional, M
const ANA = "00000000-0000-0000-0000-000000082412"; // Funcional, F
const ONLINE = "00000000-0000-0000-0000-000000082413"; // solo online
const EJ = "10000000-0000-0000-0000-000000082401";

let db: PGlite;

async function como<T>(sub: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  let filas: T[] = [];
  await db.transaction(async (tx: Transaction) => {
    if (sub) {
      await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub, role: "authenticated" }),
      ]);
      await tx.query(`SET LOCAL ROLE authenticated`);
    } else {
      await tx.query(`SET LOCAL ROLE anon`);
    }
    filas = (await tx.query<T>(sql, params)).rows;
  });
  return filas;
}

const marca = (sub: string, alumno: string, peso: number, reps: number, extra = "NULL, NULL, NULL") =>
  como<{ id: string }>(
    sub,
    `SELECT public.registrar_marca_funcional('${alumno}', '${EJ}', ${peso}, ${reps}, DATE '2026-11-20', ${extra}) AS id`,
  );

beforeAll(async () => {
  db = await crearDbMigrada();
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${COACH}','c824@t'), ('${LUCAS}','l824@t'), ('${ANA}','a824@t'), ('${ONLINE}','o824@t');
    INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia)
      VALUES ('${COACH}','c824@t','Coach Uno','ENTRENADOR','ACTIVA')
      ON CONFLICT (id) DO UPDATE SET rol = EXCLUDED.rol, estado_membresia = EXCLUDED.estado_membresia;
    INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia, telefono)
      VALUES ('${LUCAS}','l824@t','Lucas Gomez','ALUMNO','${COACH}','ACTIVA','111'),
             ('${ANA}','a824@t','Ana María Lopez','ALUMNO','${COACH}','ACTIVA','222'),
             ('${ONLINE}','o824@t','Pedro Online','ALUMNO','${COACH}','ACTIVA','333')
      ON CONFLICT (id) DO UPDATE SET nombre_completo = EXCLUDED.nombre_completo, rol = EXCLUDED.rol, profesor_asignado_id = EXCLUDED.profesor_asignado_id, estado_membresia = EXCLUDED.estado_membresia;
    INSERT INTO public.alumno_actividades (alumno_id, actividad, veces_por_semana) VALUES
      ('${LUCAS}','FUNCIONAL',2), ('${ANA}','FUNCIONAL',2), ('${ONLINE}','RUTINAS',3);
    INSERT INTO public.ejercicios (id, nombre) VALUES ('${EJ}','Sentadilla 824');
  `);
});

describe("registrar_marca_funcional", () => {
  it("el coach persiste la marca en registro_series y aparece en v_prs (idempotente)", async () => {
    await marca(COACH, LUCAS, 100, 5, "NULL, 80, 'M'");
    await marca(COACH, LUCAS, 100, 5, "NULL, NULL, NULL");
    await marca(COACH, ANA, 60, 5, "NULL, 60, 'F'");
    const series = (await db.query(`SELECT count(*)::int AS n FROM public.registro_series WHERE ejercicio_id='${EJ}'`)).rows as { n: number }[];
    expect(series[0]!.n).toBe(2);
    const prs = await como<{ peso_kg: string; reps: number; fecha: string }>(
      LUCAS,
      `SELECT peso_kg::text, reps, fecha::text FROM public.v_prs WHERE ejercicio_id='${EJ}'`,
    );
    expect(prs).toEqual([{ peso_kg: "100.00", reps: 5, fecha: "2026-11-20" }]);
  });

  it("el alumno no puede invocarla; anon tampoco", async () => {
    await expect(marca(LUCAS, LUCAS, 200, 1)).rejects.toThrow(/entrenador del alumno/);
    await expect(
      como(null, `SELECT public.registrar_marca_funcional('${LUCAS}','${EJ}',1,1)`),
    ).rejects.toThrow(/permission denied/);
  });

  it("valida rango y que el alumno tenga Funcional", async () => {
    await expect(marca(COACH, LUCAS, 0, 5)).rejects.toThrow(/peso_kg/);
    await expect(marca(COACH, ONLINE, 50, 5)).rejects.toThrow(/Funcional/);
  });
});

describe("obtener_ranking_funcional_alumno", () => {
  it("el alumno de Funcional ve Nombre + inicial, ratio y posición, sin PII ni peso corporal", async () => {
    const filas = await como<Record<string, unknown>>(
      ANA,
      `SELECT * FROM public.obtener_ranking_funcional_alumno('${EJ}')`,
    );
    expect(filas).toHaveLength(2);
    const nombres = filas.map((f) => f.nombre_corto).sort();
    expect(nombres).toEqual(["Ana L.", "Lucas G."]);
    const lucas = filas.find((f) => f.nombre_corto === "Lucas G.")!;
    expect(lucas).toMatchObject({ sexo: "M", ratio: "1.25", posicion: 1, es_usuario_actual: false });
    expect(filas.find((f) => f.es_usuario_actual)).toMatchObject({ nombre_corto: "Ana L.", ratio: "1.00", posicion: 1 });
    for (const f of filas) {
      expect(Object.keys(f).sort()).toEqual(
        ["ejercicio_id", "es_usuario_actual", "fecha", "nombre_corto", "peso_kg", "posicion", "ratio", "reps", "sexo"],
      );
    }
    expect(JSON.stringify(filas)).not.toMatch(/@t|111|222|Gomez|Lopez/);
  });

  it("alumno sin Funcional y anon quedan bloqueados", async () => {
    await expect(
      como(ONLINE, `SELECT * FROM public.obtener_ranking_funcional_alumno()`),
    ).rejects.toThrow(/solo para Funcional/);
    await expect(
      como(null, `SELECT * FROM public.obtener_ranking_funcional_alumno()`),
    ).rejects.toThrow(/permission denied/);
  });
});
