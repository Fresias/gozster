import { describe, it, expect, beforeAll } from "vitest";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { crearDbMigrada } from "./helpers/pglite-migrada";

// Issue GH #125 (GOZS-116): obtener_o_crear_conversacion debe rechazar llamadas
// anónimas (auth.uid() NULL) con ERRCODE 42501 y no crear filas. Entrenador ajeno
// también 42501. El alumno, su entrenador y un ADMIN reciben el ID y responsable_id
// queda inicializado con profesor_asignado_id.

const ADMIN = "00000000-0000-0000-0000-0000000000ad";
const COACH_ASIGNADO = "00000000-0000-0000-0000-00000000c0ac";
const COACH_AJENO = "00000000-0000-0000-0000-0000000000c3";
const ALUMNO = "00000000-0000-0000-0000-00000000000a";

type Rol = "anon" | "authenticated" | "service_role";

const SEED_PERFILES = `
  INSERT INTO auth.users (id, email) VALUES
    ('${ADMIN}','admin@t'),
    ('${COACH_ASIGNADO}','coach1@t'),
    ('${COACH_AJENO}','coach3@t'),
    ('${ALUMNO}','alumno@t');
  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${ADMIN}','admin@t','Admin GOZS','ADMIN',NULL,'ACTIVA'),
    ('${COACH_ASIGNADO}','coach1@t','Coach Asignado','ENTRENADOR',NULL,'ACTIVA'),
    ('${COACH_AJENO}','coach3@t','Coach Ajeno','ENTRENADOR',NULL,'ACTIVA'),
    ('${ALUMNO}','alumno@t','Alumno GOZS','ALUMNO','${COACH_ASIGNADO}','ACTIVA');
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

async function contarConversaciones(alumnoId: string): Promise<number> {
  const res = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM public.conversaciones WHERE alumno_id = '${alumnoId}'`
  );
  return res.rows[0]!.n;
}

describe("GH #125 (GOZS-116): hardening de obtener_o_crear_conversacion", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
    await db.exec(SEED_PERFILES);
  }, 60_000);

  describe("1. Privilegios de ejecución (REVOKE / GRANT)", () => {
    it("anon y PUBLIC no tienen permiso de ejecución", async () => {
      const resAnon = await db.query<{ tiene: boolean }>(
        `SELECT has_function_privilege('anon', 'public.obtener_o_crear_conversacion(uuid)', 'EXECUTE') AS tiene`
      );
      expect(resAnon.rows[0]!.tiene).toBe(false);

      const resPublic = await db.query<{ tiene: boolean }>(
        `SELECT has_function_privilege('public', 'public.obtener_o_crear_conversacion(uuid)', 'EXECUTE') AS tiene`
      );
      expect(resPublic.rows[0]!.tiene).toBe(false);
    });

    it("authenticated y service_role sí tienen permiso de ejecución", async () => {
      const resAuth = await db.query<{ tiene: boolean }>(
        `SELECT has_function_privilege('authenticated', 'public.obtener_o_crear_conversacion(uuid)', 'EXECUTE') AS tiene`
      );
      expect(resAuth.rows[0]!.tiene).toBe(true);

      const resService = await db.query<{ tiene: boolean }>(
        `SELECT has_function_privilege('service_role', 'public.obtener_o_crear_conversacion(uuid)', 'EXECUTE') AS tiene`
      );
      expect(resService.rows[0]!.tiene).toBe(true);
    });
  });

  describe("2. Rechazos (ERRCODE 42501) sin efectos secundarios", () => {
    it("un usuario anónimo recibe 42501 por falta de permiso de ejecución (REVOKE) y no se crea ninguna fila", async () => {
      await expect(
        como("anon", null, `SELECT public.obtener_o_crear_conversacion('${ALUMNO}')`)
      ).rejects.toMatchObject({ code: "42501" });
      expect(await contarConversaciones(ALUMNO)).toBe(0);
    });

    it("una llamada con rol authenticated pero sin auth.uid() (sub NULL) recibe 42501 por falta de autenticación y no crea filas", async () => {
      await expect(
        como(
          "authenticated",
          null,
          `SELECT public.obtener_o_crear_conversacion('${ALUMNO}')`
        )
      ).rejects.toMatchObject({
        code: "42501",
        message: expect.stringMatching(/se requiere autenticación/),
      });
      expect(await contarConversaciones(ALUMNO)).toBe(0);
    });

    it("un entrenador ajeno recibe 42501 por falta de autorización y no se crea ninguna fila", async () => {
      await expect(
        como(
          "authenticated",
          COACH_AJENO,
          `SELECT public.obtener_o_crear_conversacion('${ALUMNO}')`
        )
      ).rejects.toMatchObject({
        code: "42501",
        message: expect.stringMatching(/No autorizado para acceder/),
      });
      expect(await contarConversaciones(ALUMNO)).toBe(0);
    });
  });

  describe("3. Accesos autorizados inicializan responsable_id", () => {
    let conversacionId: string;

    it("el alumno recibe el ID y responsable_id = profesor_asignado_id", async () => {
      const res = await como<{ obtener_o_crear_conversacion: string }>(
        "authenticated",
        ALUMNO,
        `SELECT public.obtener_o_crear_conversacion('${ALUMNO}')`
      );
      conversacionId = res.rows[0]!.obtener_o_crear_conversacion;
      expect(conversacionId).toBeTruthy();

      const conv = await db.query<{ responsable_id: string | null }>(
        `SELECT responsable_id FROM public.conversaciones WHERE id = '${conversacionId}'`
      );
      expect(conv.rows[0]!.responsable_id).toBe(COACH_ASIGNADO);
      expect(await contarConversaciones(ALUMNO)).toBe(1);
    });

    it("su entrenador recibe el mismo ID (idempotente)", async () => {
      const res = await como<{ obtener_o_crear_conversacion: string }>(
        "authenticated",
        COACH_ASIGNADO,
        `SELECT public.obtener_o_crear_conversacion('${ALUMNO}')`
      );
      expect(res.rows[0]!.obtener_o_crear_conversacion).toBe(conversacionId);
      expect(await contarConversaciones(ALUMNO)).toBe(1);
    });

    it("un ADMIN recibe el ID de la conversación", async () => {
      const res = await como<{ obtener_o_crear_conversacion: string }>(
        "authenticated",
        ADMIN,
        `SELECT public.obtener_o_crear_conversacion('${ALUMNO}')`
      );
      expect(res.rows[0]!.obtener_o_crear_conversacion).toBe(conversacionId);
      expect(await contarConversaciones(ALUMNO)).toBe(1);
    });
  });
});
