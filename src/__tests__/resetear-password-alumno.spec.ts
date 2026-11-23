import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { crearDbMigrada } from "./helpers/pglite-migrada";
import { middleware } from "@/middleware";
import {
  crearHandler,
  type PerfilResumen,
  type ResetearPasswordDeps,
} from "../../supabase/functions/resetear-password-alumno/handler";

// GOZS-692: el coach resetea la contraseña de su alumno y el cambio de clave
// obligatorio vive en app_metadata (el usuario no puede apagarlo solo).

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));

const COACH = "00000000-0000-0000-0000-00000000c0ac";
const OTRO_COACH = "00000000-0000-0000-0000-0000000000c2";
const ADMIN = "00000000-0000-0000-0000-0000000000ad";
const ALUMNO = "00000000-0000-0000-0000-00000000000a";

// ============================================================================
// 1. Edge Function (dependencias simuladas)
// ============================================================================
const PERFILES: Record<string, PerfilResumen> = {
  [COACH]: { rol: "ENTRENADOR", profesor_asignado_id: null },
  [OTRO_COACH]: { rol: "ENTRENADOR", profesor_asignado_id: null },
  [ADMIN]: { rol: "ADMIN", profesor_asignado_id: null },
  [ALUMNO]: { rol: "ALUMNO", profesor_asignado_id: COACH },
};

function deps(llamante: string | null, over: Partial<ResetearPasswordDeps> = {}) {
  const orden: string[] = [];
  const d: ResetearPasswordDeps = {
    usuarioDesdeToken: vi.fn(async () => llamante),
    perfil: vi.fn(async (id: string) => PERFILES[id] ?? null),
    cambiarPassword: vi.fn(async () => {
      orden.push("password");
      return true;
    }),
    marcarCambioObligatorio: vi.fn(async () => {
      orden.push("marca");
      return true;
    }),
    ...over,
  };
  return { d, orden };
}

function post(body: unknown, token = "tok") {
  return new Request("https://fn.test/resetear-password-alumno", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GOZS-692 · Edge Function resetear-password-alumno", () => {
  it("GIVEN un coach y su alumno WHEN resetea THEN recibe clave temporal y queda marcado el cambio obligatorio", async () => {
    const { d, orden } = deps(COACH);
    const res = await crearHandler(d, "*")(post({ alumno_id: ALUMNO }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as { password_temporal: string; alumno_id: string };
    expect(body.alumno_id).toBe(ALUMNO);
    expect(body.password_temporal).toMatch(/^.{12,16}$/);
    expect(d.cambiarPassword).toHaveBeenCalledWith(ALUMNO, body.password_temporal);
    expect(d.marcarCambioObligatorio).toHaveBeenCalledWith(ALUMNO);
    // La marca va después: el cambio de clave la limpia en auth.users
    expect(orden).toEqual(["password", "marca"]);
  });

  it("un admin puede resetear a cualquier alumno", async () => {
    const { d } = deps(ADMIN);
    expect((await crearHandler(d, "*")(post({ alumno_id: ALUMNO }))).status).toBe(200);
  });

  it("GIVEN un coach WHEN resetea a un alumno ajeno THEN 403 y no toca la clave", async () => {
    const { d } = deps(OTRO_COACH);
    const res = await crearHandler(d, "*")(post({ alumno_id: ALUMNO }));
    expect(res.status).toBe(403);
    expect(d.cambiarPassword).not.toHaveBeenCalled();
    expect(d.marcarCambioObligatorio).not.toHaveBeenCalled();
  });

  it("un coach no puede resetear a otro coach ni a un id inexistente (403)", async () => {
    for (const objetivo of [OTRO_COACH, "00000000-0000-0000-0000-000000000999"]) {
      const { d } = deps(COACH);
      expect((await crearHandler(d, "*")(post({ alumno_id: objetivo }))).status).toBe(403);
      expect(d.cambiarPassword).not.toHaveBeenCalled();
    }
  });

  it("un alumno no puede resetear a nadie, ni siquiera a sí mismo (403)", async () => {
    const { d } = deps(ALUMNO);
    expect((await crearHandler(d, "*")(post({ alumno_id: ALUMNO }))).status).toBe(403);
    expect(d.cambiarPassword).not.toHaveBeenCalled();
  });

  it("admin sobre un usuario que no es alumno → 404 sin tocar la clave", async () => {
    const { d } = deps(ADMIN);
    expect((await crearHandler(d, "*")(post({ alumno_id: COACH }))).status).toBe(404);
    expect(d.cambiarPassword).not.toHaveBeenCalled();
  });

  it("sin token o con token inválido → 401", async () => {
    const { d } = deps(null);
    expect((await crearHandler(d, "*")(post({ alumno_id: ALUMNO }))).status).toBe(401);
    const sinToken = new Request("https://fn.test", { method: "POST", body: "{}" });
    expect((await crearHandler(deps(COACH).d, "*")(sinToken)).status).toBe(401);
  });

  it("alumno_id inválido → 400; método distinto de POST → 405", async () => {
    const h = crearHandler(deps(COACH).d, "*");
    expect((await h(post({ alumno_id: "x' OR 1=1" }))).status).toBe(400);
    expect((await h(new Request("https://fn.test", { method: "GET" }))).status).toBe(405);
  });

  it("si falla la consulta de perfiles → 500 sin tocar la clave", async () => {
    const { d } = deps(COACH, { perfil: vi.fn(async () => Promise.reject(new Error("db"))) });
    expect((await crearHandler(d, "*")(post({ alumno_id: ALUMNO }))).status).toBe(500);
    expect(d.cambiarPassword).not.toHaveBeenCalled();
  });

  it("si falla el cambio de clave → 502 sin marcar; si falla la marca → 500 sin devolver clave", async () => {
    const a = deps(COACH, { cambiarPassword: vi.fn(async () => false) });
    expect((await crearHandler(a.d, "*")(post({ alumno_id: ALUMNO }))).status).toBe(502);
    expect(a.d.marcarCambioObligatorio).not.toHaveBeenCalled();

    const b = deps(COACH, { marcarCambioObligatorio: vi.fn(async () => false) });
    const res = await crearHandler(b.d, "*")(post({ alumno_id: ALUMNO }));
    expect(res.status).toBe(500);
    expect(await res.json()).not.toHaveProperty("password_temporal");
  });
});

// ============================================================================
// 2. Migración: la marca de app_metadata solo se baja cambiando la clave (PGlite)
// ============================================================================
let db: PGlite;

function como<T>(rol: "authenticated" | "service_role", sub: string | null, sql: string) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub ? { sub, role: rol } : { role: rol }),
    ]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query<T>(sql);
  });
}

async function appMeta(): Promise<Record<string, unknown>> {
  const r = await db.query<{ m: Record<string, unknown> | null }>(
    `SELECT raw_app_meta_data AS m FROM auth.users WHERE id = '${ALUMNO}'`,
  );
  return r.rows[0]!.m ?? {};
}

/** Reproduce el reset de la Edge Function: clave nueva y, después, las dos marcas. */
async function resetearComoEdgeFunction(hash: string) {
  await db.query(`UPDATE auth.users SET encrypted_password = $1 WHERE id = $2`, [hash, ALUMNO]);
  await db.query(
    `UPDATE auth.users SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"must_change_password": true}' WHERE id = $1`,
    [ALUMNO],
  );
  await como("service_role", null, `UPDATE public.perfiles SET debe_cambiar_password = true WHERE id = '${ALUMNO}'`);
}

describe("GOZS-692 · must_change_password en app_metadata (PGlite)", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
    await db.exec(`
      INSERT INTO auth.users (id, email, encrypted_password, raw_app_meta_data) VALUES
        ('${COACH}','coach@t','x','{"provider":"email"}'),
        ('${ALUMNO}','a@t','hash-original','{"provider":"email"}');
      INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id) VALUES
        ('${COACH}','coach@t','Coach','ENTRENADOR',NULL),
        ('${ALUMNO}','a@t','Alumno','ALUMNO','${COACH}')
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, nombre_completo = EXCLUDED.nombre_completo,
        rol = EXCLUDED.rol, profesor_asignado_id = EXCLUDED.profesor_asignado_id;
    `);
  }, 60_000);

  it("tras el reset del coach el alumno queda con ambas marcas (y conserva el resto de app_metadata)", async () => {
    await resetearComoEdgeFunction("hash-temporal");
    expect(await appMeta()).toEqual({ provider: "email", must_change_password: true });
    const p = await db.query<{ f: boolean }>(`SELECT debe_cambiar_password AS f FROM public.perfiles WHERE id = '${ALUMNO}'`);
    expect(p.rows[0]!.f).toBe(true);
  });

  it("GIVEN cambio obligatorio WHEN el alumno toca su user_metadata (auth.updateUser data) THEN la marca de app_metadata sigue", async () => {
    await resetearComoEdgeFunction("hash-temporal-2");
    await db.query(
      `UPDATE auth.users SET raw_user_meta_data = '{"must_change_password": false}' WHERE id = $1`,
      [ALUMNO],
    );
    expect((await appMeta()).must_change_password).toBe(true);
  });

  it("authenticated no puede escribir auth.users ni ejecutar la función del trigger", async () => {
    await expect(
      como("authenticated", ALUMNO, `UPDATE auth.users SET raw_app_meta_data = '{}' WHERE id = '${ALUMNO}'`),
    ).rejects.toThrow(/permission denied/);
    const r = await db.query<{ ok: boolean }>(
      `SELECT has_function_privilege('authenticated', 'public.fn_quitar_must_change_password_app_metadata()', 'EXECUTE') AS ok`,
    );
    expect(r.rows[0]!.ok).toBe(false);
  });

  it("cuando el alumno cambia efectivamente su clave, la marca de app_metadata y la del perfil se bajan", async () => {
    await resetearComoEdgeFunction("hash-temporal-3");
    await db.query(`UPDATE auth.users SET encrypted_password = 'hash-definitivo' WHERE id = $1`, [ALUMNO]);
    expect(await appMeta()).toEqual({ provider: "email" });
    const p = await db.query<{ f: boolean }>(`SELECT debe_cambiar_password AS f FROM public.perfiles WHERE id = '${ALUMNO}'`);
    expect(p.rows[0]!.f).toBe(false);
  });

  it("si la misma sentencia cambia clave y app_metadata (Admin API), se respeta la marca del administrador", async () => {
    await db.query(
      `UPDATE auth.users SET encrypted_password = 'hash-admin', raw_app_meta_data = raw_app_meta_data || '{"must_change_password": true}' WHERE id = $1`,
      [ALUMNO],
    );
    expect((await appMeta()).must_change_password).toBe(true);
  });
});

// ============================================================================
// 3. Middleware: solo app_metadata manda
// ============================================================================
describe("GOZS-692 · Middleware lee la marca desde app_metadata", () => {
  beforeEach(() => vi.clearAllMocks());

  function clienteSSR(user: unknown) {
    (createServerClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
      from: vi.fn(),
    });
  }

  it("con app_metadata.must_change_password redirige a /login?forceChange=1", async () => {
    clienteSSR({ id: ALUMNO, app_metadata: { must_change_password: true }, user_metadata: {} });
    const res = await middleware(new NextRequest("https://gozster.com/athlete"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).searchParams.get("forceChange")).toBe("1");
  });

  it("aunque el alumno se ponga must_change_password: false en user_metadata, sigue bloqueado", async () => {
    clienteSSR({
      id: ALUMNO,
      app_metadata: { must_change_password: true },
      user_metadata: { must_change_password: false },
    });
    const res = await middleware(new NextRequest("https://gozster.com/athlete"));
    expect(new URL(res.headers.get("location")!).searchParams.get("forceChange")).toBe("1");
  });

  it("la marca en user_metadata (editable por el usuario) ya no se considera", async () => {
    clienteSSR({ id: ALUMNO, app_metadata: {}, user_metadata: { must_change_password: true } });
    const res = await middleware(new NextRequest("https://gozster.com/athlete"));
    expect(res.status).toBe(200);
  });
});
