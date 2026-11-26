import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SUPABASE_URL } from "@/lib/supabase/browser";

interface QueryResult<T = unknown> {
  data: T;
  error: Record<string, unknown> | null;
}

const createServerClientMock = vi.fn();
const createAdminClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createServerClientMock(...args),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

import { GET } from "@/app/api/coach/entrenadores/route";

const COACH_ID = "00000000-0000-0000-0000-000000086301";
const ADMIN_ID = "00000000-0000-0000-0000-000000086302";
const ALUMNO_ID = "00000000-0000-0000-0000-000000086303";
const STAFF_EMPTY_NAME_ID = "00000000-0000-0000-0000-000000086304";
const FAKE_SERVICE_ROLE_KEY = "test-service-role-key-863-never-leak";

function crearMockClienteSupabase(config: {
  authResult?: { data: { user: Record<string, unknown> | null } | null; error: Record<string, unknown> | null };
  perfilPropioResult?: QueryResult;
  staffListResult?: QueryResult;
}) {
  const getUser = vi.fn().mockResolvedValue(
    config.authResult ?? { data: { user: null }, error: null },
  );

  const perfilMaybeSingle = vi.fn().mockResolvedValue(
    config.perfilPropioResult ?? { data: null, error: null },
  );
  const perfilEq = vi.fn().mockReturnValue({ maybeSingle: perfilMaybeSingle });

  const staffOrder = vi.fn().mockResolvedValue(
    config.staffListResult ?? { data: [], error: null },
  );
  const staffIn = vi.fn().mockReturnValue({ order: staffOrder });

  const select = vi.fn((columns: string) => ({
    columns,
    eq: perfilEq,
    in: staffIn,
  }));

  const from = vi.fn(() => ({ select }));

  return {
    client: {
      auth: { getUser },
      from,
    },
    spies: {
      getUser,
      from,
      select,
      perfilEq,
      perfilMaybeSingle,
      staffIn,
      staffOrder,
    },
  };
}

describe("GET /api/coach/entrenadores — contrato y seguridad (G1/G4, GOZS-863)", () => {
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    if (originalServiceRoleKey === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
    }
  });

  describe("Autenticación obligatoria (401)", () => {
    it("responde 401 sin sesión (user: null) y no instancia el cliente admin ni consulta perfiles", async () => {
      const ssr = crearMockClienteSupabase({
        authResult: { data: { user: null }, error: null },
      });
      createServerClientMock.mockResolvedValue(ssr.client);

      const res = await GET();
      const body = (await res.json()) as { error?: string };

      expect(res.status).toBe(401);
      expect(body).toEqual({ error: "No autenticado" });
      expect(createAdminClientMock).not.toHaveBeenCalled();
      expect(ssr.spies.from).not.toHaveBeenCalled();
    });

    it("responde 401 ante authError sin filtrar detalles internos ni instanciar el cliente admin", async () => {
      const ssr = crearMockClienteSupabase({
        authResult: {
          data: { user: { id: COACH_ID } },
          error: { message: "JWT signature verification failed: internal secret mismatch" },
        },
      });
      createServerClientMock.mockResolvedValue(ssr.client);

      const res = await GET();
      const rawBody = await res.text();
      const body = JSON.parse(rawBody) as { error?: string };

      expect(res.status).toBe(401);
      expect(body).toEqual({ error: "No autenticado" });
      expect(rawBody).not.toContain("JWT signature");
      expect(createAdminClientMock).not.toHaveBeenCalled();
      expect(ssr.spies.from).not.toHaveBeenCalled();
    });

    it("responde 401 si authData es null y no instancia el cliente admin", async () => {
      const ssr = crearMockClienteSupabase({
        authResult: { data: null, error: null },
      });
      createServerClientMock.mockResolvedValue(ssr.client);

      const res = await GET();
      const body = (await res.json()) as { error?: string };

      expect(res.status).toBe(401);
      expect(body).toEqual({ error: "No autenticado" });
      expect(createAdminClientMock).not.toHaveBeenCalled();
      expect(ssr.spies.from).not.toHaveBeenCalled();
    });
  });

  describe("Autorización estricta de staff en public.perfiles (403 — G1)", () => {
    it("responde 403 para ALUMNO aunque user_metadata reclame ADMIN, sin usar admin client ni leer terceros", async () => {
      const ssr = crearMockClienteSupabase({
        authResult: {
          data: {
            user: {
              id: ALUMNO_ID,
              user_metadata: { rol: "ADMIN" },
            },
          },
          error: null,
        },
        perfilPropioResult: { data: { rol: "ALUMNO" }, error: null },
      });
      createServerClientMock.mockResolvedValue(ssr.client);

      const res = await GET();
      const body = (await res.json()) as { error?: string };

      expect(res.status).toBe(403);
      expect(body).toEqual({ error: "No autorizado" });
      expect(createAdminClientMock).not.toHaveBeenCalled();
      expect(ssr.spies.from).toHaveBeenCalledTimes(1);
      expect(ssr.spies.from).toHaveBeenCalledWith("perfiles");
      expect(ssr.spies.select).toHaveBeenCalledWith("rol");
      expect(ssr.spies.perfilEq).toHaveBeenCalledWith("id", ALUMNO_ID);
      expect(ssr.spies.perfilMaybeSingle).toHaveBeenCalledTimes(1);
      expect(ssr.spies.staffIn).not.toHaveBeenCalled();
    });

    it.each(["INVITADO", "SUPERADMIN", "COACH", ""])(
      "responde 403 para rol desconocido (%j) sin instanciar admin client ni consultar terceros",
      async (rolDesconocido) => {
        const ssr = crearMockClienteSupabase({
          authResult: { data: { user: { id: ALUMNO_ID } }, error: null },
          perfilPropioResult: { data: { rol: rolDesconocido }, error: null },
        });
        createServerClientMock.mockResolvedValue(ssr.client);

        const res = await GET();
        const body = (await res.json()) as { error?: string };

        expect(res.status).toBe(403);
        expect(body).toEqual({ error: "No autorizado" });
        expect(createAdminClientMock).not.toHaveBeenCalled();
        expect(ssr.spies.from).toHaveBeenCalledTimes(1);
        expect(ssr.spies.staffIn).not.toHaveBeenCalled();
      },
    );

    it("responde 403 cuando perfilPropio es null sin instanciar admin client ni consultar terceros", async () => {
      const ssr = crearMockClienteSupabase({
        authResult: { data: { user: { id: ALUMNO_ID } }, error: null },
        perfilPropioResult: { data: null, error: null },
      });
      createServerClientMock.mockResolvedValue(ssr.client);

      const res = await GET();
      const body = (await res.json()) as { error?: string };

      expect(res.status).toBe(403);
      expect(body).toEqual({ error: "No autorizado" });
      expect(createAdminClientMock).not.toHaveBeenCalled();
      expect(ssr.spies.from).toHaveBeenCalledTimes(1);
      expect(ssr.spies.staffIn).not.toHaveBeenCalled();
    });

    it("responde 403 ante perfilError sin filtrar detalles de Postgres ni instanciar admin client", async () => {
      const ssr = crearMockClienteSupabase({
        authResult: { data: { user: { id: ALUMNO_ID } }, error: null },
        perfilPropioResult: {
          data: null,
          error: { code: "42501", message: "permission denied for table perfiles" },
        },
      });
      createServerClientMock.mockResolvedValue(ssr.client);

      const res = await GET();
      const rawBody = await res.text();
      const body = JSON.parse(rawBody) as { error?: string };

      expect(res.status).toBe(403);
      expect(body).toEqual({ error: "No autorizado" });
      expect(rawBody).not.toContain("42501");
      expect(rawBody).not.toContain("permission denied");
      expect(createAdminClientMock).not.toHaveBeenCalled();
      expect(ssr.spies.from).toHaveBeenCalledTimes(1);
      expect(ssr.spies.staffIn).not.toHaveBeenCalled();
    });
  });

  describe("Staff autorizado con SUPABASE_SERVICE_ROLE_KEY (200, no-store y minimización PII — G1/G4)", () => {
    it.each(["ENTRENADOR", "ADMIN"] as const)(
      "permite %s, configura admin client sin persistencia, filtra roles no-staff y expone únicamente { id, nombre_completo, rol }",
      async (rolActual) => {
        const currentUserId = rolActual === "ADMIN" ? ADMIN_ID : COACH_ID;
        const ssr = crearMockClienteSupabase({
          authResult: { data: { user: { id: currentUserId } }, error: null },
          perfilPropioResult: { data: { rol: rolActual }, error: null },
        });
        const admin = crearMockClienteSupabase({
          staffListResult: {
            data: [
              {
                id: ADMIN_ID,
                nombre_completo: "Admin Principal",
                rol: "ADMIN",
                email: "admin-privado@example.test",
                telefono: "+5491100001111",
                dni: "30111222",
                direccion: "Calle Falsa 123",
              },
              {
                id: COACH_ID,
                nombre_completo: "Entrenador Alfa",
                rol: "ENTRENADOR",
                email: "coach-privado@example.test",
                telefono: "+5491100002222",
              },
              // Filas que deben descartarse defensivamente
              {
                id: ALUMNO_ID,
                nombre_completo: "Alumno Filtrado",
                rol: "ALUMNO",
                email: "alumno-privado@example.test",
              },
              {
                id: "00000000-0000-0000-0000-000000086399",
                nombre_completo: "Rol Invalido",
                rol: "INVITADO",
              },
              {
                id: null,
                nombre_completo: "Fila Sin Id",
                rol: "ENTRENADOR",
              },
              null,
            ],
            error: null,
          },
        });

        createServerClientMock.mockResolvedValue(ssr.client);
        createAdminClientMock.mockReturnValue(admin.client);

        const res = await GET();
        const rawBody = await res.text();
        const body = JSON.parse(rawBody) as {
          entrenadores: Array<Record<string, unknown>>;
        };

        expect(res.status).toBe(200);
        expect(res.headers.get("Cache-Control")).toBe("no-store");

        expect(createAdminClientMock).toHaveBeenCalledTimes(1);
        expect(createAdminClientMock).toHaveBeenCalledWith(
          SUPABASE_URL,
          FAKE_SERVICE_ROLE_KEY,
          { auth: { autoRefreshToken: false, persistSession: false } },
        );

        expect(admin.spies.from).toHaveBeenCalledWith("perfiles");
        expect(admin.spies.select).toHaveBeenCalledWith("id, nombre_completo, rol");
        expect(admin.spies.staffIn).toHaveBeenCalledWith("rol", ["ENTRENADOR", "ADMIN"]);
        expect(admin.spies.staffOrder).toHaveBeenCalledWith("nombre_completo", {
          ascending: true,
        });
        expect(ssr.spies.staffIn).not.toHaveBeenCalled();

        expect(body).toEqual({
          entrenadores: [
            { id: ADMIN_ID, nombre_completo: "Admin Principal", rol: "ADMIN" },
            { id: COACH_ID, nombre_completo: "Entrenador Alfa", rol: "ENTRENADOR" },
          ],
        });

        // Verifica estrictamente que no se filtran claves extra de PII ni secretos (G4)
        for (const item of body.entrenadores) {
          expect(Object.keys(item).sort()).toEqual(["id", "nombre_completo", "rol"]);
        }
        expect(rawBody).not.toContain("admin-privado@example.test");
        expect(rawBody).not.toContain("coach-privado@example.test");
        expect(rawBody).not.toContain("alumno-privado@example.test");
        expect(rawBody).not.toContain("+5491100001111");
        expect(rawBody).not.toContain("+5491100002222");
        expect(rawBody).not.toContain("30111222");
        expect(rawBody).not.toContain("Calle Falsa 123");
        expect(rawBody).not.toContain(FAKE_SERVICE_ROLE_KEY);
      },
    );
  });

  describe("Fallback limpio sin SUPABASE_SERVICE_ROLE_KEY (cliente SSR con RLS)", () => {
    it.each([undefined, ""])(
      "usa el cliente SSR autenticado sin lanzar excepción cuando SUPABASE_SERVICE_ROLE_KEY es %j",
      async (envValue) => {
        if (envValue === undefined) {
          delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        } else {
          process.env.SUPABASE_SERVICE_ROLE_KEY = envValue;
        }

        const ssr = crearMockClienteSupabase({
          authResult: { data: { user: { id: COACH_ID } }, error: null },
          perfilPropioResult: { data: { rol: "ENTRENADOR" }, error: null },
          staffListResult: {
            data: [
              {
                id: COACH_ID,
                nombre_completo: "Entrenador Alfa",
                rol: "ENTRENADOR",
                email: "no-exponer@example.test",
              },
            ],
            error: null,
          },
        });
        createServerClientMock.mockResolvedValue(ssr.client);

        const res = await GET();
        const rawBody = await res.text();
        const body = JSON.parse(rawBody) as {
          entrenadores: Array<Record<string, unknown>>;
        };

        expect(res.status).toBe(200);
        expect(res.headers.get("Cache-Control")).toBe("no-store");
        expect(createAdminClientMock).not.toHaveBeenCalled();

        // 1ra consulta: perfil propio; 2da consulta: nómina de staff sobre el mismo cliente SSR
        expect(ssr.spies.from).toHaveBeenCalledTimes(2);
        expect(ssr.spies.select).toHaveBeenNthCalledWith(1, "rol");
        expect(ssr.spies.select).toHaveBeenNthCalledWith(2, "id, nombre_completo, rol");
        expect(ssr.spies.staffIn).toHaveBeenCalledWith("rol", ["ENTRENADOR", "ADMIN"]);
        expect(ssr.spies.staffOrder).toHaveBeenCalledWith("nombre_completo", {
          ascending: true,
        });

        expect(body).toEqual({
          entrenadores: [
            { id: COACH_ID, nombre_completo: "Entrenador Alfa", rol: "ENTRENADOR" },
          ],
        });
        expect(rawBody).not.toContain("no-exponer@example.test");
      },
    );
  });

  describe("Normalización de nombre vacío y errores controlados de DB (500)", () => {
    it("usa fallback 'Entrenador' cuando nombre_completo es vacío, null o undefined", async () => {
      const ssr = crearMockClienteSupabase({
        authResult: { data: { user: { id: COACH_ID } }, error: null },
        perfilPropioResult: { data: { rol: "ENTRENADOR" }, error: null },
      });
      const admin = crearMockClienteSupabase({
        staffListResult: {
          data: [
            { id: COACH_ID, nombre_completo: "", rol: "ENTRENADOR" },
            { id: ADMIN_ID, nombre_completo: null, rol: "ADMIN" },
            { id: STAFF_EMPTY_NAME_ID, nombre_completo: undefined, rol: "ENTRENADOR" },
          ],
          error: null,
        },
      });
      createServerClientMock.mockResolvedValue(ssr.client);
      createAdminClientMock.mockReturnValue(admin.client);

      const res = await GET();
      const body = (await res.json()) as {
        entrenadores: Array<{ id: string; nombre_completo: string; rol: string }>;
      };

      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(body.entrenadores).toEqual([
        { id: COACH_ID, nombre_completo: "Entrenador", rol: "ENTRENADOR" },
        { id: ADMIN_ID, nombre_completo: "Entrenador", rol: "ADMIN" },
        { id: STAFF_EMPTY_NAME_ID, nombre_completo: "Entrenador", rol: "ENTRENADOR" },
      ]);
    });

    it("responde 500 genérico ante error de consulta en DB sin filtrar detalles internos de Postgres", async () => {
      const ssr = crearMockClienteSupabase({
        authResult: { data: { user: { id: COACH_ID } }, error: null },
        perfilPropioResult: { data: { rol: "ENTRENADOR" }, error: null },
      });
      const admin = crearMockClienteSupabase({
        staffListResult: {
          data: null,
          error: {
            code: "42P01",
            message: 'relation "public.perfiles" does not exist',
            details: "pg_catalog internal trace",
            hint: "check schema search_path",
          },
        },
      });
      createServerClientMock.mockResolvedValue(ssr.client);
      createAdminClientMock.mockReturnValue(admin.client);

      const res = await GET();
      const rawBody = await res.text();
      const body = JSON.parse(rawBody) as { error?: string };

      expect(res.status).toBe(500);
      expect(body).toEqual({ error: "No se pudieron cargar los entrenadores" });
      expect(rawBody).not.toContain("42P01");
      expect(rawBody).not.toContain("public.perfiles");
      expect(rawBody).not.toContain("pg_catalog");
      expect(rawBody).not.toContain("search_path");
    });

    it("responde 500 genérico si data no es un arreglo (null sin error) y también en fallback SSR", async () => {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      const ssr = crearMockClienteSupabase({
        authResult: { data: { user: { id: COACH_ID } }, error: null },
        perfilPropioResult: { data: { rol: "ENTRENADOR" }, error: null },
        staffListResult: { data: null, error: null },
      });
      createServerClientMock.mockResolvedValue(ssr.client);

      const res = await GET();
      const body = (await res.json()) as { error?: string };

      expect(res.status).toBe(500);
      expect(body).toEqual({ error: "No se pudieron cargar los entrenadores" });
      expect(createAdminClientMock).not.toHaveBeenCalled();
    });
  });
});
