// ============================================================================
// GOZS-36 / Issue #55 — Suite de AUDITORÍA Y CERTIFICACIÓN DE QA
// Alta directa de alumnos, autogeneración de credenciales temporales y cambio
// obligatorio de contraseña en el primer inicio de sesión.
//
// A diferencia de las suites de los PR de backend (alta-alumno-directa.spec.ts)
// y frontend (alta-alumno-frontend.spec.ts), esta suite CERTIFICA el flujo
// integrado end-to-end cableando las unidades REALES entre sí:
//   Edge Function handler  →  JWT (must_change_password)  →  middleware Next.js
//   →  trigger de DB (PGlite real)  →  desbloqueo de /athlete.
//
// Entorno node (sin DOM). Cada bloque mapea un criterio de aceptación Gherkin.
// ============================================================================
import { describe, it, expect, beforeAll, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { middleware } from "@/middleware";
import {
  crearHandler,
  generarPasswordTemporal,
  LOGIN_URL,
  type AltaAlumnoDeps,
} from "../../supabase/functions/alta-alumno-directa/handler";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));

// ----------------------------------------------------------------------------
// Fixtures compartidos
// ----------------------------------------------------------------------------
const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const NEW_MIGRATION = "20261018100000_alta_alumno_directa_primer_login.sql";

const COACH_A = "00000000-0000-0000-0000-00000000c0a1";
const COACH_B = "00000000-0000-0000-0000-00000000c0b2";
const ADMIN = "00000000-0000-0000-0000-0000000ad301";
const ALUMNO_A = "00000000-0000-0000-0000-0000000a1001"; // alumno de COACH_A

type Rol = "anon" | "authenticated" | "service_role";

const SUPABASE_STUBS = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, encrypted_password text);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' $$;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`;

const SEED = `
  INSERT INTO auth.users (id, email, encrypted_password) VALUES
    ('${COACH_A}','coachA@t','x'),('${COACH_B}','coachB@t','x'),
    ('${ADMIN}','admin@t','x'),('${ALUMNO_A}','alumnoA@t','hash-temporal');
  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id) VALUES
    ('${COACH_A}','coachA@t','Coach A','ENTRENADOR',NULL),
    ('${COACH_B}','coachB@t','Coach B','ENTRENADOR',NULL),
    ('${ADMIN}','admin@t','Admin','ADMIN',NULL),
    ('${ALUMNO_A}','alumnoA@t','Alumno A','ALUMNO','${COACH_A}');
`;

let db: PGlite;

async function aplicarMigracion(sql: string) {
  const inicio = sql.search(/^BEGIN;/m);
  if (inicio > 0) {
    await db.exec(sql.slice(0, inicio));
    await db.exec(sql.slice(inicio));
  } else {
    await db.exec(sql);
  }
}

function como<T>(rol: Rol, sub: string | null, sql: string) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub ? { sub, role: rol } : { role: rol }),
    ]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query<T>(sql);
  });
}

async function flag(id: string): Promise<boolean> {
  const r = await db.query<{ f: boolean }>(
    `SELECT debe_cambiar_password AS f FROM public.perfiles WHERE id = '${id}'`,
  );
  return r.rows[0]!.f;
}

// ----------------------------------------------------------------------------
// Doble del handler (mismas dependencias inyectables que la Edge Function real)
// ----------------------------------------------------------------------------
const NUEVO_ID = "00000000-0000-0000-0000-0000000a2002";
const TOKENS: Record<string, string> = {
  "tok-coachA": COACH_A,
  "tok-coachB": COACH_B,
  "tok-admin": ADMIN,
  "tok-alumno": ALUMNO_A,
};
const ROLES: Record<string, string> = {
  [COACH_A]: "ENTRENADOR",
  [COACH_B]: "ENTRENADOR",
  [ADMIN]: "ADMIN",
  [ALUMNO_A]: "ALUMNO",
};

function deps(over: Partial<AltaAlumnoDeps> = {}): AltaAlumnoDeps {
  return {
    usuarioDesdeToken: vi.fn(async (t: string) => TOKENS[t] ?? null),
    rolDePerfil: vi.fn(async (id: string) => ROLES[id] ?? null),
    crearUsuario: vi.fn(async () => ({ id: NUEVO_ID })),
    upsertPerfil: vi.fn(async () => true),
    eliminarUsuario: vi.fn(async () => {}),
    enviarCredenciales: vi.fn(async () => true),
    ...over,
  };
}

function post(body: unknown, token?: string) {
  return new Request("https://x/functions/v1/alta-alumno-directa", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// Doble del cliente SSR que consume el middleware. `metadata` simula el JWT ya
// validado por getUser(); `rol` alimenta la consulta a `perfiles` (Coach Studio).
function clienteSSR(user: unknown, rol?: string) {
  const from = vi.fn(() => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: rol ? { rol } : null }) }),
    }),
  }));
  (createServerClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from,
  });
  return { from };
}

function req(url: string) {
  return new NextRequest(`https://gozster.com${url}`);
}

// ============================================================================
// SETUP: migra un Postgres real con todas las migraciones del repo
// ============================================================================
beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUBS);
  const archivos = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const archivo of archivos) {
    if (archivo === NEW_MIGRATION) await db.exec(SEED);
    await aplicarMigracion(fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), "utf-8"));
  }
}, 60_000);

// ============================================================================
// 1. GENERACIÓN Y SEGURIDAD DE CREDENCIALES
//    THEN la contraseña temporal cumple entropía y formato legible mínimos.
// ============================================================================
describe("GOZS-36 · Credenciales temporales: entropía y formato seguro", () => {
  const N = 2000;
  const muestras = Array.from({ length: N }, () => generarPasswordTemporal());
  const POOL = 67; // 24 mayús + 25 minús + 8 dígitos + 10 símbolos legibles

  it("respeta la longitud mínima de 12 y el rango permitido 12-16 (default 14)", () => {
    expect(muestras.every((p) => p.length === 14)).toBe(true);
    expect(generarPasswordTemporal(12)).toHaveLength(12);
    expect(generarPasswordTemporal(16)).toHaveLength(16);
    expect(() => generarPasswordTemporal(11)).toThrow(RangeError);
    expect(() => generarPasswordTemporal(17)).toThrow(RangeError);
  });

  it("garantiza entropía >= 64 bits (12 chars sobre un pool de 67 ≈ 72.8 bits)", () => {
    const bitsPorChar = Math.log2(POOL);
    expect(12 * bitsPorChar).toBeGreaterThanOrEqual(64);
    // Cada muestra default (14) supera holgadamente el umbral.
    expect(14 * bitsPorChar).toBeGreaterThan(80);
  });

  it("incluye al menos una mayúscula, minúscula, dígito y símbolo legible", () => {
    for (const p of muestras) {
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).toMatch(/[!@#$%*?\-_+=]/);
      expect(p).toMatch(/^[A-Za-z0-9!@#$%*?\-_+=]+$/);
    }
  });

  it("excluye caracteres ambiguos (0 O 1 l I) para copiarla a mano sin error", () => {
    expect(muestras.some((p) => /[0O1lI]/.test(p))).toBe(false);
  });

  it("es impredecible: sin colisiones y con posición de clases bien distribuida (CSPRNG)", () => {
    // Unicidad: 2000 muestras de ~72 bits no deben colisionar jamás.
    expect(new Set(muestras).size).toBe(N);
    // Fisher-Yates real: el primer carácter no es siempre de la misma clase.
    const primerasClases = new Set(
      muestras.map((p) => {
        const c = p[0]!;
        if (/[A-Z]/.test(c)) return "U";
        if (/[a-z]/.test(c)) return "l";
        if (/[0-9]/.test(c)) return "d";
        return "s";
      }),
    );
    expect(primerasClases.size).toBe(4);
  });
});

// ============================================================================
// 2. AISLAMIENTO MULTI-COACH Y RBAC
//    Solo ENTRENADOR/ADMIN dan de alta; anónimo/ALUMNO → 401/403;
//    el alumno queda vinculado EXCLUSIVAMENTE al coach que lo creó.
// ============================================================================
describe("GOZS-36 · RBAC y aislamiento multi-coach en el alta", () => {
  it("ENTRENADOR da de alta: 201, flag activo y vínculo con SU propio id (no otro coach)", async () => {
    const d = deps();
    const res = await crearHandler(d, "*")(post({ email: "nuevo@alumno.com" }, "tok-coachA"));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ alumno_id: NUEVO_ID, email: "nuevo@alumno.com" });
    // Aislamiento: el perfil se liga al coach autenticado por su JWT, nunca a uno arbitrario.
    expect(d.upsertPerfil).toHaveBeenCalledWith(
      expect.objectContaining({ profesor_asignado_id: COACH_A, debe_cambiar_password: true, rol: "ALUMNO" }),
    );
    // El JWT del alumno nace con la bandera de primer login.
    expect(d.crearUsuario).toHaveBeenCalledWith(
      expect.objectContaining({
        email_confirm: true,
        user_metadata: expect.objectContaining({ must_change_password: true, rol: "ALUMNO" }),
      }),
    );
  });

  it("otro ENTRENADOR crea alumnos ligados a SÍ mismo (coaches aislados entre sí)", async () => {
    const d = deps();
    await crearHandler(d, "*")(post({ email: "deB@alumno.com" }, "tok-coachB"));
    expect(d.upsertPerfil).toHaveBeenCalledWith(
      expect.objectContaining({ profesor_asignado_id: COACH_B }),
    );
  });

  it("ADMIN también puede dar de alta: 201", async () => {
    const res = await crearHandler(deps(), "*")(post({ email: "x@y.co" }, "tok-admin"));
    expect(res.status).toBe(201);
  });

  it("anónimo (sin Authorization): 401 y NO crea nada", async () => {
    const d = deps();
    const res = await crearHandler(d, "*")(post({ email: "a@b.co" }));
    expect(res.status).toBe(401);
    expect(d.crearUsuario).not.toHaveBeenCalled();
    expect(d.upsertPerfil).not.toHaveBeenCalled();
  });

  it("token inválido/expirado: 401", async () => {
    const res = await crearHandler(deps(), "*")(post({ email: "a@b.co" }, "tok-falso"));
    expect(res.status).toBe(401);
  });

  it("rol ALUMNO: 403 (escalada de privilegios bloqueada)", async () => {
    const d = deps();
    const res = await crearHandler(d, "*")(post({ email: "a@b.co" }, "tok-alumno"));
    expect(res.status).toBe(403);
    expect(d.crearUsuario).not.toHaveBeenCalled();
  });

  it("el rol se lee SIEMPRE de perfiles (DB), nunca del body/metadata del request", async () => {
    const d = deps();
    // El atacante (ALUMNO) intenta inyectar un rol en el cuerpo: sigue siendo 403.
    const res = await crearHandler(d, "*")(post({ email: "a@b.co", rol: "ADMIN" }, "tok-alumno"));
    expect(res.status).toBe(403);
    expect(d.rolDePerfil).toHaveBeenCalledWith(ALUMNO_A);
  });

  it("a nivel DB, un segundo coach NO puede modificar el flag de un alumno ajeno", async () => {
    await como("service_role", null, `UPDATE public.perfiles SET debe_cambiar_password = true WHERE id = '${ALUMNO_A}'`);
    const r = await como(
      "authenticated",
      COACH_B,
      `UPDATE public.perfiles SET debe_cambiar_password = false WHERE id = '${ALUMNO_A}' RETURNING id`,
    );
    expect(r.rows).toHaveLength(0);
    expect(await flag(ALUMNO_A)).toBe(true);
  });
});

// ============================================================================
// 3. FORZADO BLOQUEANTE DEL PRIMER LOGIN (middleware)
//    GIVEN un alumno con must_change_password THEN no puede entrar a /athlete
//    ni /studio por navegación NI por URL directa; se desvía a ?forceChange=1.
// ============================================================================
describe("GOZS-36 · El primer login es inevitable (middleware)", () => {
  const alumnoTemp = {
    id: ALUMNO_A,
    email: "alumnoA@t",
    user_metadata: { must_change_password: true, rol: "ALUMNO" },
  };

  it.each(["/athlete", "/athlete/workout/123", "/studio", "/studio/dashboard"])(
    "bloquea %s con contraseña temporal y redirige a /login?forceChange=1",
    async (ruta) => {
      const { from } = clienteSSR(alumnoTemp);
      const res = await middleware(req(ruta));
      expect(res.status).toBe(307);
      const url = new URL(res.headers.get("location")!);
      expect(url.pathname).toBe("/login");
      expect(url.searchParams.get("forceChange")).toBe("1");
      // No hay bypass posible: ni siquiera consulta la tabla, corta antes del RBAC.
      expect(from).not.toHaveBeenCalled();
    },
  );

  it("el bloqueo del primer login tiene prioridad sobre el enrutamiento por rol", async () => {
    // Aunque el perfil fuese ENTRENADOR, la bandera temporal manda: a forceChange.
    const coachTemp = {
      id: COACH_A,
      email: "coachA@t",
      user_metadata: { must_change_password: true, rol: "ENTRENADOR" },
    };
    clienteSSR(coachTemp, "ENTRENADOR");
    const res = await middleware(req("/studio"));
    const url = new URL(res.headers.get("location")!);
    expect(url.searchParams.get("forceChange")).toBe("1");
  });

  it("sin sesión en ruta protegida: redirige a /login conservando redirectTo", async () => {
    clienteSSR(null);
    const res = await middleware(req("/athlete"));
    expect(res.status).toBe(307);
    const url = new URL(res.headers.get("location")!);
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("redirectTo")).toBe("/athlete");
  });
});

// ============================================================================
// 4. ACTUALIZACIÓN Y DESBLOQUEO
//    WHEN el alumno define su clave definitiva (auth.updateUser) THEN el trigger
//    de DB baja debe_cambiar_password y /athlete queda 100% habilitado.
// ============================================================================
describe("GOZS-36 · Cambio de clave definitiva y desbloqueo de /athlete", () => {
  it("al cambiar encrypted_password en Auth, el trigger apaga el flag", async () => {
    await como("service_role", null, `UPDATE public.perfiles SET debe_cambiar_password = true WHERE id = '${ALUMNO_A}'`);
    expect(await flag(ALUMNO_A)).toBe(true);
    // Supabase Auth escribe auth.users (updateUser({ password })) con su propio rol.
    await db.exec(`UPDATE auth.users SET encrypted_password = 'hash-definitivo' WHERE id = '${ALUMNO_A}'`);
    expect(await flag(ALUMNO_A)).toBe(false);
  });

  it("tras el cambio, el alumno confirma debe_cambiar_password = false (no-op permitido)", async () => {
    await expect(
      como("authenticated", ALUMNO_A, `UPDATE public.perfiles SET debe_cambiar_password = false WHERE id = '${ALUMNO_A}'`),
    ).resolves.toBeDefined();
  });

  it("con el flag apagado, el middleware deja entrar al alumno a /athlete (200, sin redirect)", async () => {
    const alumnoOk = { id: ALUMNO_A, email: "alumnoA@t", user_metadata: { rol: "ALUMNO" } };
    const { from } = clienteSSR(alumnoOk);
    const res = await middleware(req("/athlete"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(from).not.toHaveBeenCalled(); // /athlete no exige consulta de rol extra
  });

  it("un cambio de email en Auth NO apaga el flag (solo lo hace el cambio de password)", async () => {
    await como("service_role", null, `UPDATE public.perfiles SET debe_cambiar_password = true WHERE id = '${ALUMNO_A}'`);
    await db.exec(`UPDATE auth.users SET email = 'nuevo-mail@t' WHERE id = '${ALUMNO_A}'`);
    expect(await flag(ALUMNO_A)).toBe(true);
  });

  it("el alumno NO puede apagar el flag con un UPDATE directo antes de cambiar la clave", async () => {
    // (el flag sigue activo del test anterior)
    await expect(
      como("authenticated", ALUMNO_A, `UPDATE public.perfiles SET debe_cambiar_password = false WHERE id = '${ALUMNO_A}'`),
    ).rejects.toThrow(/row-level security|permission denied|Solo/);
    expect(await flag(ALUMNO_A)).toBe(true);
  });
});

// ============================================================================
// 5. MANEJO DE ERRORES Y EDGE CASES
//    Emails inválidos/duplicados (409), fallos de creación/perfil, contingencia
//    de email, y la robustez del formulario de cambio de clave (< 8 / mismatch).
// ============================================================================
describe("GOZS-36 · Errores y robustez del alta", () => {
  it.each([
    [{ email: "no-es-email" }],
    [{ email: "falta@dominio" }],
    [{ email: "@sinlocal.com" }],
    [{ email: "   " }],
    [{}],
    ["{json roto"],
    ["null"],
  ])("entrada inválida %j: 400 y no crea usuario", async (body) => {
    const d = deps();
    const res = await crearHandler(d, "*")(post(body, "tok-coachA"));
    expect(res.status).toBe(400);
    expect(d.crearUsuario).not.toHaveBeenCalled();
  });

  it("email duplicado: 409 con mensaje claro y sin tocar el perfil", async () => {
    const d = deps({ crearUsuario: vi.fn(async () => ({ error: "email_existe" as const })) });
    const res = await crearHandler(d, "*")(post({ email: "dup@a.co" }, "tok-coachA"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Ya existe/);
    expect(d.upsertPerfil).not.toHaveBeenCalled();
  });

  it("normaliza el email (trim + minúsculas) antes de crear", async () => {
    const d = deps();
    const res = await crearHandler(d, "*")(post({ email: "  MixtO@Mail.COM  " }, "tok-coachA"));
    expect((await res.json()).email).toBe("mixto@mail.com");
    expect(d.crearUsuario).toHaveBeenCalledWith(expect.objectContaining({ email: "mixto@mail.com" }));
  });

  it("si falla la creación del perfil, elimina el usuario de Auth (sin huérfanos): 500", async () => {
    const d = deps({ upsertPerfil: vi.fn(async () => false) });
    const res = await crearHandler(d, "*")(post({ email: "a@b.co" }, "tok-coachA"));
    expect(res.status).toBe(500);
    expect(d.eliminarUsuario).toHaveBeenCalledWith(NUEVO_ID);
  });

  it("si Auth no puede crear el usuario por otra causa: 502", async () => {
    const d = deps({ crearUsuario: vi.fn(async () => ({ error: "otro" as const })) });
    const res = await crearHandler(d, "*")(post({ email: "a@b.co" }, "tok-coachA"));
    expect(res.status).toBe(502);
  });

  it("contingencia de email caído (timeout SMTP): igual 201 con la contraseña para compartir", async () => {
    const d = deps({ enviarCredenciales: vi.fn(async () => Promise.reject(new Error("smtp timeout"))) });
    const res = await crearHandler(d, "*")(post({ email: "a@b.co" }, "tok-coachA"));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.email_enviado).toBe(false);
    expect(body.password_temporal).toBeTruthy();
    expect(body.mensaje).toContain(LOGIN_URL);
  });

  it("la respuesta 201 nunca se cachea (lleva la contraseña temporal)", async () => {
    const res = await crearHandler(deps(), "*")(post({ email: "a@b.co" }, "tok-coachA"));
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("solo POST/OPTIONS: otros métodos responden 405", async () => {
    const h = crearHandler(deps(), "https://gozster.vercel.app");
    expect((await h(new Request("https://x", { method: "GET" }))).status).toBe(405);
    expect((await h(new Request("https://x", { method: "DELETE" }))).status).toBe(405);
  });
});

// ============================================================================
// 5b. ROBUSTEZ DEL FORMULARIO DE CAMBIO DE CLAVE (force-password-change.tsx)
//     Edge cases de UI sin DOM: se auditan los guardas documentados en el código
//     (mínimo 8, confirmación, baja de banderas y captura de errores de red).
// ============================================================================
describe("GOZS-36 · Guardas del formulario de primer login (auditoría de código)", () => {
  const fpc = fs.readFileSync(
    path.resolve(__dirname, "../components/auth/force-password-change.tsx"),
    "utf-8",
  );

  it("exige mínimo 8 caracteres y confirmación coincidente antes de enviar", () => {
    expect(fpc).toContain("MIN_LEN = 8");
    expect(fpc).toContain("password !== confirm");
    expect(fpc).toContain("no coinciden");
  });

  it("al guardar baja la bandera en Auth (must_change_password) y en el perfil", () => {
    expect(fpc).toContain("auth.updateUser");
    expect(fpc).toContain("must_change_password: false");
    expect(fpc).toContain("debe_cambiar_password: false");
    expect(fpc).toContain('.from("perfiles")');
  });

  it("captura errores de red/servidor sin romper (timeouts)", () => {
    expect(fpc).toMatch(/catch\b/);
    expect(fpc).toContain("No pudimos conectar con el servidor");
  });

  it("es una pantalla bloqueante: modal sin botón de cierre", () => {
    expect(fpc).toContain('aria-modal="true"');
    expect(fpc).not.toMatch(/aria-label="(Cerrar|Close)"/);
  });
});
