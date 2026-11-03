import { describe, expect, it, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { middleware, config as middlewareConfig } from "@/middleware";
import { fetchLiveDatasetFromSupabase, fetchPlanAlumno } from "@/services/alumnos-service";
import {
  calculateBrzycki1RM,
  calculateEpley1RM,
  calculateTotalTonnage,
  calculateBlockVolume,
  type VolumeBlock,
} from "@/lib/strength-metrics";
import { FunctionsHttpError } from "@supabase/supabase-js";

// Mock @supabase/ssr for middleware testing
vi.mock("@supabase/ssr", () => {
  return {
    createServerClient: vi.fn(),
    createBrowserClient: vi.fn(() => ({
      auth: {
        getUser: vi.fn(),
        getSession: vi.fn(),
        signInWithPassword: vi.fn(),
        updateUser: vi.fn(),
        exchangeCodeForSession: vi.fn(),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      },
      from: vi.fn(),
      functions: {
        invoke: vi.fn(),
      },
    })),
  };
});

import { createServerClient } from "@supabase/ssr";

/**
 * ============================================================================
 * QA SUITE: VERIFICACIÓN INTEGRAL DE AUTENTICACIÓN SSR, RBAC E INVITACIÓN
 * Issue #52 / Issue #51 (GOZS-31 / GOZS-30)
 *
 * Guardián Técnico Inflexible: @qa-eng
 *
 * Módulos Verificados:
 * 1. Middleware RBAC y Redirecciones de Sesión (Gatekeeper de Calidad).
 * 2. Aislamiento Multi-Coach en Consultas Server Component (/studio).
 * 3. Flujo de Aceptación de Invitación y Cambio de Contraseña (/invitacion).
 * 4. Invocación de Edge Function "invitar-alumno" y Manejo de Errores HTTP.
 * 5. Interfaz de Login y Enrutamiento según Rol de Perfil (/login).
 * 6. Certificación Matemática Estricta de Métricas de Fuerza (Epley, Brzycki, Tonelaje).
 * 7. Precisión y Resiliencia de Temporizadores de Descanso en Background.
 * 8. Auditoría Arquitectural Ponytail (Cero Bloatware) y Karpathy (Simplicidad).
 * ============================================================================
 */

describe("QA Suite: Autenticación SSR, Control de Acceso RBAC e Invitación (GOZS-31)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // 1. PRUEBAS DE REDIRECCIÓN Y MIDDLEWARE RBAC
  // ==========================================================================
  describe("1. Middleware RBAC y Redirección de Rutas Protegidas", () => {
    it("debe verificar que el matcher del middleware protege estrictamente /studio y /athlete", () => {
      expect(middlewareConfig.matcher).toBeDefined();
      expect(middlewareConfig.matcher).toContain("/studio/:path*");
      expect(middlewareConfig.matcher).toContain("/athlete/:path*");
      // Verifica que no intercepte assets ni rutas públicas
      expect(middlewareConfig.matcher).not.toContain("/login");
      expect(middlewareConfig.matcher).not.toContain("/invitacion");
      expect(middlewareConfig.matcher).not.toContain("/_next/:path*");
    });

    it("debe redirigir a un usuario anónimo de /studio a /login?redirectTo=/studio", async () => {
      const mockGetUser = vi.fn().mockResolvedValue({ data: { user: null } });
      (createServerClient as any).mockReturnValue({
        auth: { getUser: mockGetUser },
        from: vi.fn(),
      });

      const request = new NextRequest("https://gozster.com/studio");
      const response = await middleware(request);

      expect(response.status).toBe(307);
      const location = response.headers.get("location");
      expect(location).toBeDefined();
      const redirectUrl = new URL(location!);
      expect(redirectUrl.pathname).toBe("/login");
      expect(redirectUrl.searchParams.get("redirectTo")).toBe("/studio");
    });

    it("debe redirigir a un usuario anónimo de /studio/alumnos/123 a /login?redirectTo=/studio", async () => {
      const mockGetUser = vi.fn().mockResolvedValue({ data: { user: null } });
      (createServerClient as any).mockReturnValue({
        auth: { getUser: mockGetUser },
        from: vi.fn(),
      });

      const request = new NextRequest("https://gozster.com/studio/alumnos/123");
      const response = await middleware(request);

      expect(response.status).toBe(307);
      const redirectUrl = new URL(response.headers.get("location")!);
      expect(redirectUrl.pathname).toBe("/login");
      expect(redirectUrl.searchParams.get("redirectTo")).toBe("/studio");
    });

    it("debe redirigir a un usuario anónimo de /athlete a /login?redirectTo=/athlete", async () => {
      const mockGetUser = vi.fn().mockResolvedValue({ data: { user: null } });
      (createServerClient as any).mockReturnValue({
        auth: { getUser: mockGetUser },
        from: vi.fn(),
      });

      const request = new NextRequest("https://gozster.com/athlete");
      const response = await middleware(request);

      expect(response.status).toBe(307);
      const redirectUrl = new URL(response.headers.get("location")!);
      expect(redirectUrl.pathname).toBe("/login");
      expect(redirectUrl.searchParams.get("redirectTo")).toBe("/athlete");
    });

    it("debe bloquear a un ALUMNO autenticado en /studio y redirigirlo a /login?roleMismatch=1", async () => {
      const mockUser = { id: "alumno-uuid-1", email: "alumno@gozster.com" };
      const mockGetUser = vi.fn().mockResolvedValue({ data: { user: mockUser } });

      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: { rol: "ALUMNO" },
        error: null,
      });
      const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

      (createServerClient as any).mockReturnValue({
        auth: { getUser: mockGetUser },
        from: mockFrom,
      });

      const request = new NextRequest("https://gozster.com/studio");
      const response = await middleware(request);

      expect(response.status).toBe(307);
      const redirectUrl = new URL(response.headers.get("location")!);
      expect(redirectUrl.pathname).toBe("/login");
      expect(redirectUrl.searchParams.get("roleMismatch")).toBe("1");
    });

    it("debe bloquear a un ALUMNO autenticado en una subruta de /studio y redirigirlo a /login?roleMismatch=1", async () => {
      const mockUser = { id: "alumno-uuid-2", email: "alumno2@gozster.com" };
      const mockGetUser = vi.fn().mockResolvedValue({ data: { user: mockUser } });
      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: { rol: "ALUMNO" } });
      const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

      (createServerClient as any).mockReturnValue({
        auth: { getUser: mockGetUser },
        from: vi.fn().mockReturnValue({ select: mockSelect }),
      });

      const request = new NextRequest("https://gozster.com/studio/analytics/retencion");
      const response = await middleware(request);

      expect(response.status).toBe(307);
      const redirectUrl = new URL(response.headers.get("location")!);
      expect(redirectUrl.pathname).toBe("/login");
      expect(redirectUrl.searchParams.get("roleMismatch")).toBe("1");
    });

    it("debe permitir el acceso a /studio a un ENTRENADOR autenticado", async () => {
      const mockCoach = { id: "coach-uuid-1", email: "coach@gozster.com" };
      const mockGetUser = vi.fn().mockResolvedValue({ data: { user: mockCoach } });
      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: { rol: "ENTRENADOR" } });
      const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

      (createServerClient as any).mockReturnValue({
        auth: { getUser: mockGetUser },
        from: vi.fn().mockReturnValue({ select: mockSelect }),
      });

      const request = new NextRequest("https://gozster.com/studio");
      const response = await middleware(request);

      // Status 200 (passthrough a la ruta)
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    });

    it("debe permitir el acceso a /studio a un ADMIN autenticado", async () => {
      const mockAdmin = { id: "admin-uuid-1", email: "admin@gozster.com" };
      const mockGetUser = vi.fn().mockResolvedValue({ data: { user: mockAdmin } });
      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: { rol: "ADMIN" } });
      const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

      (createServerClient as any).mockReturnValue({
        auth: { getUser: mockGetUser },
        from: vi.fn().mockReturnValue({ select: mockSelect }),
      });

      const request = new NextRequest("https://gozster.com/studio");
      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    });

    it("GOZS-335: permite el acceso a /studio a Gonzalo Salas con su perfil ADMIN persistido", async () => {
      const gonzaloUser = { id: "f4819866-b758-424e-90b2-555b7887c601", email: "gonzasalas2016@gmail.com" };
      const mockGetUser = vi.fn().mockResolvedValue({ data: { user: gonzaloUser } });
      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: { rol: "ADMIN", nombre_completo: "Gonzalo Salas" } });
      const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

      (createServerClient as any).mockReturnValue({
        auth: { getUser: mockGetUser },
        from: vi.fn().mockReturnValue({ select: mockSelect }),
      });

      const request = new NextRequest("https://gozster.com/studio");
      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    });

    it("GOZS-339: permite el acceso a /studio a 94.gabriel.sanchez@gmail.com como ADMIN principal", async () => {
      const gabiUser = { id: "00000000-0000-4000-8000-0000000000a1", email: "94.gabriel.sanchez@gmail.com" };
      const mockGetUser = vi.fn().mockResolvedValue({ data: { user: gabiUser } });
      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: { rol: "ADMIN", nombre_completo: "Gabriel Sanchez" } });
      const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

      (createServerClient as any).mockReturnValue({
        auth: { getUser: mockGetUser },
        from: vi.fn().mockReturnValue({ select: mockSelect }),
      });

      const request = new NextRequest("https://gozster.com/studio");
      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    });

    it("GOZS-339: permite el acceso a /studio a ds.gabriel.sanchez@gmail.com como ADMIN auxiliar", async () => {
      const coachUser = { id: "00000000-0000-4000-8000-0000000000c1", email: "ds.gabriel.sanchez@gmail.com" };
      const mockGetUser = vi.fn().mockResolvedValue({ data: { user: coachUser } });
      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: { rol: "ADMIN", nombre_completo: "Gabriel Sanchez" } });
      const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

      (createServerClient as any).mockReturnValue({
        auth: { getUser: mockGetUser },
        from: vi.fn().mockReturnValue({ select: mockSelect }),
      });

      const request = new NextRequest("https://gozster.com/studio");
      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    });

    it("GOZS-335: permite el acceso a /athlete a un ADMIN para autogestionar su propia rutina (Rol Dual)", async () => {
      const adminUser = { id: "f4819866-b758-424e-90b2-555b7887c601", email: "gonzasalas2016@gmail.com" };
      const mockGetUser = vi.fn().mockResolvedValue({ data: { user: adminUser } });

      (createServerClient as any).mockReturnValue({
        auth: { getUser: mockGetUser },
        from: vi.fn(),
      });

      const request = new NextRequest("https://gozster.com/athlete");
      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    });

    it("GOZS-339: permite el acceso a /athlete a 94.gabriel.sanchez@gmail.com con rol ADMIN (Rol Dual / Autogestión)", async () => {
      const gabiUser = { id: "00000000-0000-4000-8000-0000000000a1", email: "94.gabriel.sanchez@gmail.com" };
      const mockGetUser = vi.fn().mockResolvedValue({ data: { user: gabiUser } });

      (createServerClient as any).mockReturnValue({
        auth: { getUser: mockGetUser },
        from: vi.fn(),
      });

      const request = new NextRequest("https://gozster.com/athlete");
      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    });
    it("debe permitir el acceso a /athlete a un ALUMNO autenticado", async () => {
      const mockUser = { id: "alumno-uuid-3", email: "atleta@gozster.com" };
      const mockGetUser = vi.fn().mockResolvedValue({ data: { user: mockUser } });

      (createServerClient as any).mockReturnValue({
        auth: { getUser: mockGetUser },
        from: vi.fn(),
      });

      const request = new NextRequest("https://gozster.com/athlete");
      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    });

    it("debe permitir el acceso a /athlete a un ADMIN autenticado (Rol Dual GOZS-336)", async () => {
      const mockAdmin = { id: "admin-uuid-dual", email: "admin@gozster.com" };
      const mockGetUser = vi.fn().mockResolvedValue({ data: { user: mockAdmin } });

      (createServerClient as any).mockReturnValue({
        auth: { getUser: mockGetUser },
        from: vi.fn(),
      });

      const request = new NextRequest("https://gozster.com/athlete");
      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    });

    it("debe redirigir a login si el usuario tiene rol desconocido o inexistente en perfiles", async () => {
      const mockUser = { id: "unknown-uuid", email: "unknown@gozster.com" };
      const mockGetUser = vi.fn().mockResolvedValue({ data: { user: mockUser } });
      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null }); // Perfil sin fila o sin rol
      const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

      (createServerClient as any).mockReturnValue({
        auth: { getUser: mockGetUser },
        from: vi.fn().mockReturnValue({ select: mockSelect }),
      });

      const request = new NextRequest("https://gozster.com/studio");
      const response = await middleware(request);

      expect(response.status).toBe(307);
      const redirectUrl = new URL(response.headers.get("location")!);
      expect(redirectUrl.pathname).toBe("/login");
      expect(redirectUrl.searchParams.get("redirectTo")).toBe("/studio");
    });

    it("debe sincronizar cookies en request y response durante el refresco de sesión", async () => {
      let cookieHandler: any;
      (createServerClient as any).mockImplementation((_url: string, _key: string, options: any) => {
        cookieHandler = options.cookies;
        return {
          auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
          from: vi.fn(),
        };
      });

      const request = new NextRequest("https://gozster.com/studio");
      request.cookies.set("sb-access-token", "old-token");

      await middleware(request);

      expect(cookieHandler).toBeDefined();
      expect(typeof cookieHandler.getAll).toBe("function");
      expect(typeof cookieHandler.setAll).toBe("function");

      // Validar getAll
      const cookies = cookieHandler.getAll();
      expect(cookies).toEqual(expect.arrayContaining([expect.objectContaining({ name: "sb-access-token" })]));

      // Validar setAll
      cookieHandler.setAll([
        { name: "sb-access-token", value: "new-refreshed-token", options: { path: "/" } },
      ]);
      expect(request.cookies.get("sb-access-token")?.value).toBe("new-refreshed-token");
    });
  });

  // ==========================================================================
  // 2. PRUEBAS DE AISLAMIENTO MULTI-COACH EN SERVER COMPONENTS
  // ==========================================================================
  describe("2. Aislamiento Multi-Coach y Seguridad SSR", () => {
    it("debe delegar la consulta en el cliente autenticado provisto a fetchLiveDatasetFromSupabase", async () => {
      const mockAlumnos = [
        { id: "a1", nombre_completo: "Alumno Uno", rol: "ALUMNO", profesor_asignado_id: "coach-a" },
        { id: "a2", nombre_completo: "Alumno Dos", rol: "ALUMNO", profesor_asignado_id: "coach-a" },
      ];

      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === "perfiles") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: mockAlumnos, error: null }),
                }),
              }),
            };
          }
          if (table === "planes_entrenamiento" || table === "dias_rutina" || table === "ejercicios_en_rutina" || table === "ejercicios") {
            return {
              select: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            };
          }
          return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [] }) }) };
        }),
      } as any;

      const dataset = await fetchLiveDatasetFromSupabase(mockClient);

      expect(mockClient.from).toHaveBeenCalledWith("perfiles");
      expect(mockClient.from).toHaveBeenCalledWith("planes_entrenamiento");
      expect(mockClient.from).toHaveBeenCalledWith("dias_rutina");
      expect(mockClient.from).toHaveBeenCalledWith("ejercicios_en_rutina");
      expect(mockClient.from).toHaveBeenCalledWith("ejercicios");
      expect(dataset.alumnos).toHaveLength(2);
      expect(dataset.alumnos[0]!.nombre_completo).toBe("Alumno Uno");
    });

    it("debe aislar estrictamente los alumnos de Coach A frente a Coach B", async () => {
      const coachAId = "coach-uuid-alpha";
      const coachBId = "coach-uuid-beta";

      const dbAlumnos = [
        { id: "al-1", nombre_completo: "Atleta de Alpha", rol: "ALUMNO", profesor_asignado_id: coachAId },
        { id: "al-2", nombre_completo: "Atleta de Beta", rol: "ALUMNO", profesor_asignado_id: coachBId },
      ];

      // Simulación de RLS en servidor para Coach A
      const createScopedClient = (coachId: string) => {
        return {
          from: vi.fn((table: string) => ({
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockImplementation(() => {
                  if (table === "perfiles") {
                    const scoped = dbAlumnos.filter(
                      (a) => a.rol === "ALUMNO" && a.profesor_asignado_id === coachId,
                    );
                    return Promise.resolve({ data: scoped, error: null });
                  }
                  return Promise.resolve({ data: [], error: null });
                }),
              }),
            }),
          })),
        } as any;
      };

      const datasetCoachA = await fetchLiveDatasetFromSupabase(createScopedClient(coachAId));
      const datasetCoachB = await fetchLiveDatasetFromSupabase(createScopedClient(coachBId));

      expect(datasetCoachA.alumnos).toHaveLength(1);
      expect(datasetCoachA.alumnos[0]!.nombre_completo).toBe("Atleta de Alpha");

      expect(datasetCoachB.alumnos).toHaveLength(1);
      expect(datasetCoachB.alumnos[0]!.nombre_completo).toBe("Atleta de Beta");

      // Coach A no debe tener ningún alumno de Coach B
      expect(datasetCoachA.alumnos.some((a) => a.profesor_asignado_id === coachBId)).toBe(false);
      expect(datasetCoachB.alumnos.some((a) => a.profesor_asignado_id === coachAId)).toBe(false);
    });

    it("debe proveer un fallback seguro sin crashear si Supabase retorna error en SSR", async () => {
      const errorClient = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: null, error: new Error("Network timeout") }),
            }),
            order: vi.fn().mockResolvedValue({ data: null, error: new Error("Network timeout") }),
          }),
        })),
      } as any;

      const fallbackDataset = await fetchLiveDatasetFromSupabase(errorClient);

      expect(fallbackDataset).toBeDefined();
      expect(fallbackDataset.alumnos.length).toBeGreaterThan(0);
      expect(fallbackDataset.planes.length).toBeGreaterThan(0);
      expect(fallbackDataset.ejercicios.length).toBeGreaterThan(0);
    });

    it("debe verificar que /studio/page.tsx está configurado como dynamic = force-dynamic", () => {
      const pagePath = path.resolve(__dirname, "../app/(coach)/studio/page.tsx");
      const content = fs.readFileSync(pagePath, "utf-8");

      expect(content).toContain('export const dynamic = "force-dynamic"');
      expect(content).toContain("await createClient()");
      expect(content).toContain("fetchLiveDatasetFromSupabase(supabase)");
    });

    it("GOZS-339: carga de rutina activa 'GABI AGOSTO' (3 días + antebrazos) para 94.gabriel.sanchez@gmail.com (ADMIN)", async () => {
      const gabiId = "00000000-0000-4000-8000-0000000000a1";
      const planGabiId = "cab4ad3d-8595-47be-a220-6dc52117048e";
      const gabiUser = { id: gabiId, email: "94.gabriel.sanchez@gmail.com" };

      const mockPerfil = {
        id: gabiId,
        email: "94.gabriel.sanchez@gmail.com",
        nombre_completo: "Gabriel Sanchez",
        rol: "ADMIN",
        estado_membresia: "ACTIVA",
      };

      const mockPlan = {
        id: planGabiId,
        profesor_id: "00000000-0000-4000-8000-0000000000c1",
        alumno_id: gabiId,
        nombre: "GABI AGOSTO",
        estado: "ACTIVO",
      };

      const mockDias = [
        { id: "d-1", plan_id: planGabiId, nombre: "Día 1 - Empuje + Antebrazos", orden: 1 },
        { id: "d-2", plan_id: planGabiId, nombre: "Día 2 - Piernas + Antebrazos", orden: 2 },
        { id: "d-3", plan_id: planGabiId, nombre: "Día 3 - Tracción + Antebrazos", orden: 3 },
      ];

      const mockEjerciciosEnRutina = [
        { id: "er-1", dia_id: "d-1", ejercicio_id: "e-1", orden: 1, series: 4, repeticiones: "8-10" },
        { id: "er-2", dia_id: "d-1", ejercicio_id: "e-4", orden: 2, series: 3, repeticiones: "12-15" },
        { id: "er-3", dia_id: "d-2", ejercicio_id: "e-2", orden: 1, series: 4, repeticiones: "10-12" },
        { id: "er-4", dia_id: "d-3", ejercicio_id: "e-3", orden: 1, series: 4, repeticiones: "8-12" },
      ];

      const mockEjercicios = [
        { id: "e-1", nombre: "Press Plano con Barra" },
        { id: "e-2", nombre: "Prensa 45°" },
        { id: "e-3", nombre: "Jalón al pecho agarre neutro" },
        { id: "e-4", nombre: "Curl de muñeca con barra" },
      ];

      const mockClient = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: gabiUser } }),
        },
        from: vi.fn((table: string) => {
          if (table === "perfiles") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: mockPerfil, error: null }),
                }),
              }),
            };
          }
          if (table === "planes_entrenamiento") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: [mockPlan], error: null }),
                }),
              }),
            };
          }
          if (table === "dias_rutina") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: mockDias, error: null }),
                }),
              }),
            };
          }
          if (table === "ejercicios_en_rutina") {
            return {
              select: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: mockEjerciciosEnRutina, error: null }),
                }),
              }),
            };
          }
          if (table === "ejercicios") {
            return {
              select: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: mockEjercicios, error: null }),
              }),
            };
          }
          return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [] }) }) };
        }),
      } as any;

      const dataset = await fetchPlanAlumno(mockClient);

      expect(dataset).not.toBeNull();
      expect(dataset?.alumnos[0]?.rol).toBe("ADMIN");
      expect(dataset?.alumnos[0]?.nombre_completo).toBe("Gabriel Sanchez");
      expect(dataset?.alumnos[0]?.email).toBe("94.gabriel.sanchez@gmail.com");
      expect(dataset?.planes[0]?.nombre).toBe("GABI AGOSTO");
      expect(dataset?.planes[0]?.estado).toBe("ACTIVO");
      expect(dataset?.dias).toHaveLength(3);
      expect(dataset?.ejerciciosEnRutina.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // 3. PRUEBAS DE ACEPTACIÓN DE INVITACIÓN (/invitacion)
  // ==========================================================================
  describe("3. Flujo de Aceptación de Invitación y Cambio de Contraseña", () => {
    it("debe validar que la contraseña cumpla con una longitud mínima de 8 caracteres", () => {
      const isValidPassword = (p: string) => p.length >= 8;

      expect(isValidPassword("")).toBe(false);
      expect(isValidPassword("1234567")).toBe(false);
      expect(isValidPassword("12345678")).toBe(true);
      expect(isValidPassword("PasswordSegura2026!")).toBe(true);
    });

    it("debe rechazar contraseñas que no coincidan en la confirmación", () => {
      const matchesConfirmation = (p: string, c: string) => p === c;

      expect(matchesConfirmation("secret123", "secret1234")).toBe(false);
      expect(matchesConfirmation("secret123", "secret123")).toBe(true);
    });

    it("debe simular el llamado a supabase.auth.updateUser({ password })", async () => {
      const mockUpdateUser = vi.fn().mockResolvedValue({
        data: { user: { id: "user-invited", email: "alumno@gozster.com" } },
        error: null,
      });

      const mockSupabase = {
        auth: {
          updateUser: mockUpdateUser,
        },
      };

      const newPassword = "MiNuevaClaveSegura2026!";
      const { data, error } = await mockSupabase.auth.updateUser({ password: newPassword });

      expect(mockUpdateUser).toHaveBeenCalledWith({ password: newPassword });
      expect(error).toBeNull();
      expect(data.user.email).toBe("alumno@gozster.com");
    });

    it("debe manejar error cuando el token de invitación ha expirado o es inválido", async () => {
      const mockUpdateUser = vi.fn().mockResolvedValue({
        data: { user: null },
        error: { message: "Token has expired or is invalid", status: 401 },
      });

      const mockSupabase = {
        auth: {
          updateUser: mockUpdateUser,
        },
      };

      const { data, error } = await mockSupabase.auth.updateUser({ password: "CualquierClaveValida" });

      expect(error).toBeDefined();
      expect(error.status).toBe(401);
      expect(data.user).toBeNull();
    });

    it("debe verificar en el código de invitacion/page.tsx la presencia de intercambio PKCE y redirección a /athlete", () => {
      const invitacionPath = path.resolve(__dirname, "../app/invitacion/page.tsx");
      const content = fs.readFileSync(invitacionPath, "utf-8");

      expect(content).toContain("exchangeCodeForSession");
      expect(content).toContain("supabase.auth.updateUser");
      expect(content).toContain('window.location.assign("/athlete")');
      expect(content).toContain("MIN_PASSWORD = 8");
    });
  });

  // ==========================================================================
  // 4. PRUEBAS DE INVOCACIÓN DE EDGE FUNCTION \"invitar-alumno\"
  // ==========================================================================
  describe("4. Invocación de Edge Function y Manejo de Errores HTTP", () => {
    it("debe validar el regex de email y requerimiento de nombre no vacío", () => {
      const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const isValid = (nombre: string, email: string) => {
        return Boolean(nombre.trim()) && EMAIL_RE.test(email.trim().toLowerCase());
      };

      expect(isValid("", "test@gozster.com")).toBe(false);
      expect(isValid("   ", "test@gozster.com")).toBe(false);
      expect(isValid("Juan Perez", "")).toBe(false);
      expect(isValid("Juan Perez", "invalid-email")).toBe(false);
      expect(isValid("Juan Perez", "juan@")).toBe(false);
      expect(isValid("Juan Perez", "juan@gozster.com")).toBe(true);
    });

    it("debe simular éxito 201 en la invocación de invitar-alumno", async () => {
      const mockInvoke = vi.fn().mockResolvedValue({
        data: { ok: true, usuario_id: "new-user-id" },
        error: null,
      });

      const mockSupabase = {
        functions: {
          invoke: mockInvoke,
        },
      };

      const payload = {
        email: "nuevo.alumno@gozster.com",
        nombre_completo: "Nuevo Alumno",
        telefono: "+5491123456789",
      };

      const { data, error } = await mockSupabase.functions.invoke("invitar-alumno", {
        body: payload,
      });

      expect(mockInvoke).toHaveBeenCalledWith("invitar-alumno", { body: payload });
      expect(error).toBeNull();
      expect(data.ok).toBe(true);
    });

    it("debe mapear correctamente error 400 (parámetros inválidos)", () => {
      const mockErrorResponse = new Response(
        JSON.stringify({ error: "Faltan datos obligatorios: email y nombre_completo" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
      const fnError = new FunctionsHttpError(mockErrorResponse);

      expect(fnError.context.status).toBe(400);
    });

    it("debe mapear correctamente error 403 (intento de invitación sin rol entrenador)", () => {
      const mockErrorResponse = new Response(
        JSON.stringify({ error: "Solo los roles ENTRENADOR o ADMIN pueden invitar alumnos" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
      const fnError = new FunctionsHttpError(mockErrorResponse);

      expect(fnError.context.status).toBe(403);
    });

    it("debe mapear correctamente error 409 (email repetido/usuario existente)", () => {
      const mockErrorResponse = new Response(
        JSON.stringify({ error: "Ya existe un usuario registrado con ese email" }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
      const fnError = new FunctionsHttpError(mockErrorResponse);

      expect(fnError.context.status).toBe(409);
    });

    it("debe verificar en invite-student-modal.tsx el tratamiento de estados 201, 400, 403, 409, 500", () => {
      const modalPath = path.resolve(__dirname, "../components/coach/invite-student-modal.tsx");
      const content = fs.readFileSync(modalPath, "utf-8");

      // Alta directa (#55): el modal invoca alta-alumno-directa, no el obsoleto invitar-alumno.
      expect(content).toContain('"alta-alumno-directa"');
      expect(content).toContain("case 400:");
      expect(content).toContain("case 403:");
      expect(content).toContain("case 409:");
      expect(content).toContain("case 500:");
      expect(content).toContain("case 502:");
      expect(content).toContain("onInvited");
      expect(content).toContain("FunctionsHttpError");
    });
  });

  // ==========================================================================
  // 5. PRUEBAS DE LA VISTA DE LOGIN Y ENRUTAMIENTO POR ROL
  // ==========================================================================
  describe("5. Vista de Login y Enrutamiento por Rol (/login)", () => {
    it("debe verificar que login/page.tsx contiene inputs para email y password, soporte bimodal y redirección", () => {
      const loginPath = path.resolve(__dirname, "../app/login/page.tsx");
      const content = fs.readFileSync(loginPath, "utf-8");

      expect(content).toContain('type="email"');
      expect(content).toContain('type="password"');
      expect(content).toContain("signInWithPassword");
      expect(content).toContain("ThemeToggle");
      expect(content).toContain('perfil?.rol === "ALUMNO" ? "/athlete" : redirectTo');
    });

    it("debe determinar el destino según rol: ALUMNO siempre va a /athlete, ENTRENADOR a redirectTo", () => {
      const resolveDestination = (rol: string | undefined, redirectTo: string) => {
        return rol === "ALUMNO" ? "/athlete" : redirectTo;
      };

      expect(resolveDestination("ALUMNO", "/studio")).toBe("/athlete");
      expect(resolveDestination("ALUMNO", "/studio/alumnos")).toBe("/athlete");
      expect(resolveDestination("ENTRENADOR", "/studio")).toBe("/studio");
      expect(resolveDestination("ADMIN", "/studio/analytics")).toBe("/studio/analytics");
      expect(resolveDestination(undefined, "/studio")).toBe("/studio");
    });

    it("debe verificar que login/page.tsx incluye el tratamiento transparente de roleMismatch=1 (GOZS-336)", () => {
      const loginPath = path.resolve(__dirname, "../app/login/page.tsx");
      const content = fs.readFileSync(loginPath, "utf-8");

      expect(content).toContain('searchParams.get("roleMismatch")');
      expect(content).toContain("Tu cuenta actual es de Alumno. Para ingresar al Studio requerís una cuenta de Entrenador/Admin");
      expect(content).toContain("Volver a mi rutina");
      expect(content).toContain("Cerrar sesión e ingresar con otra cuenta");
    });

    it("debe verificar que los layouts de studio y athlete integran ModeSwitcher para soporte de rol dual ADMIN (GOZS-336)", () => {
      const studioShellPath = path.resolve(__dirname, "../components/coach/studio-shell.tsx");
      const athleteShellPath = path.resolve(__dirname, "../components/athlete/athlete-shell.tsx");
      const modeSwitcherPath = path.resolve(__dirname, "../components/navigation/mode-switcher.tsx");

      const studioContent = fs.readFileSync(studioShellPath, "utf-8");
      const athleteContent = fs.readFileSync(athleteShellPath, "utf-8");
      const switcherContent = fs.readFileSync(modeSwitcherPath, "utf-8");

      expect(studioContent).toContain('<ModeSwitcher current="studio"');
      expect(athleteContent).toContain('<ModeSwitcher');
      expect(athleteContent).toContain('current="athlete"');
      expect(athleteContent).toContain("showReturnButton={true}");

      expect(switcherContent).toContain("Modo Studio");
      expect(switcherContent).toContain("Modo Entrenamiento");
      expect(switcherContent).toContain("Volver a Coach Studio");
      expect(switcherContent).toContain('rol !== "ADMIN"');
    });
  });

  // ==========================================================================
  // 6. CERTIFICACIÓN MATEMÁTICA ESTRICTA DE MÉTRICAS DE FUERZA (Mandato QA)
  // ==========================================================================
  describe("6. Certificación Matemática Estricta de Fórmulas de Fuerza", () => {
    describe("Fórmula de Epley: 1RM = Peso * (1 + Reps / 30)", () => {
      it("debe calcular con exactitud 1RM para combinaciones estándar", () => {
        // 100kg x 10 reps = 100 * (1 + 10/30) = 133.333...
        expect(calculateEpley1RM(100, 10)).toBeCloseTo(133.333, 2);

        // 80kg x 8 reps = 80 * (1 + 8/30) = 101.333...
        expect(calculateEpley1RM(80, 8)).toBeCloseTo(101.333, 2);

        // 140kg x 5 reps = 140 * (1 + 5/30) = 163.333...
        expect(calculateEpley1RM(140, 5)).toBeCloseTo(163.333, 2);
      });

      it("debe manejar edge cases: 1 repetición", () => {
        // 100kg x 1 rep = 100 * (1 + 1/30) = 103.333...
        expect(calculateEpley1RM(100, 1)).toBeCloseTo(103.333, 2);
      });

      it("debe retornar 0 para valores no válidos o nulos (edge cases defensivos)", () => {
        expect(calculateEpley1RM(0, 10)).toBe(0);
        expect(calculateEpley1RM(-100, 10)).toBe(0);
        expect(calculateEpley1RM(100, 0)).toBe(0);
        expect(calculateEpley1RM(100, -5)).toBe(0);
        expect(calculateEpley1RM(Number.NaN, 10)).toBe(0);
        expect(calculateEpley1RM(100, Number.POSITIVE_INFINITY)).toBe(0);
      });
    });

    describe("Fórmula de Brzycki: 1RM = Peso / (1.0278 - 0.0278 * Reps)", () => {
      it("debe calcular con exactitud 1RM para combinaciones estándar", () => {
        // 100kg x 10 reps = 100 / (1.0278 - 0.0278 * 10) = 100 / 0.7498 = 133.3688...
        expect(calculateBrzycki1RM(100, 10)).toBeCloseTo(133.368, 2);

        // 100kg x 1 rep = 100 / (1.0278 - 0.0278 * 1) = 100 / 1.0000 = 100.00
        expect(calculateBrzycki1RM(100, 1)).toBeCloseTo(100.0, 2);

        // 60kg x 6 reps = 60 / (1.0278 - 0.0278 * 6) = 60 / 0.861 = 69.686...
        expect(calculateBrzycki1RM(60, 6)).toBeCloseTo(69.686, 2);
      });

      it("debe manejar la singularidad matemática cuando reps >= 37 (denominador <= 0)", () => {
        // 1.0278 / 0.0278 ≈ 36.97. Para reps >= 37 el denominador es negativo.
        expect(calculateBrzycki1RM(100, 37)).toBe(0);
        expect(calculateBrzycki1RM(100, 50)).toBe(0);
      });

      it("debe retornar 0 para valores no válidos o negativos", () => {
        expect(calculateBrzycki1RM(0, 5)).toBe(0);
        expect(calculateBrzycki1RM(-50, 5)).toBe(0);
        expect(calculateBrzycki1RM(50, 0)).toBe(0);
        expect(calculateBrzycki1RM(50, -2)).toBe(0);
        expect(calculateBrzycki1RM(Number.NaN, 5)).toBe(0);
      });
    });

    describe("Cálculo de Tonelaje Total Semanal: Σ (Series * Reps * Peso)", () => {
      it("debe calcular con exactitud el tonelaje de múltiples bloques de volumen", () => {
        const blocks: VolumeBlock[] = [
          { series: 4, reps: 10, peso: 100 }, // 4 * 10 * 100 = 4000
          { series: 3, reps: 8, peso: 80 },   // 3 * 8 * 80 = 1920
          { series: 5, reps: 5, peso: 120 },  // 5 * 5 * 120 = 3000
        ];

        expect(calculateBlockVolume(4, 10, 100)).toBe(4000);
        expect(calculateBlockVolume(3, 8, 80)).toBe(1920);
        expect(calculateBlockVolume(5, 5, 120)).toBe(3000);
        expect(calculateTotalTonnage(blocks)).toBe(8920);
      });

      it("debe manejar listas vacías y bloques con ceros o negativos", () => {
        expect(calculateTotalTonnage([])).toBe(0);

        const invalidBlocks: VolumeBlock[] = [
          { series: 0, reps: 10, peso: 100 },
          { series: 3, reps: -5, peso: 80 },
          { series: 3, reps: 8, peso: -10 },
          { series: 3, reps: 8, peso: 50 }, // Único válido: 3 * 8 * 50 = 1200
        ];

        expect(calculateTotalTonnage(invalidBlocks)).toBe(1200);
      });
    });
  });

  // ==========================================================================
  // 7. PRECISIÓN Y RESILIENCIA DE TEMPORIZADORES DE DESCANSO EN BACKGROUND
  // ==========================================================================
  describe("7. Precisión de Temporizadores de Descanso en Pestañas Inactivas", () => {
    it("debe calcular el tiempo restante mediante timestamp delta inmune a la suspensión del navegador", () => {
      /**
       * En navegadores móviles y pestañas de fondo, los timers setInterval se throttelan a 1Hz o se suspenden.
       * El algoritmo correcto de GOZSter almacena el timestamp de finalización esperado:
       * targetTime = startTime + durationMs
       * remainingMs = Math.max(0, targetTime - Date.now())
       */
      const calculateRemainingSeconds = (targetTimestampMs: number, currentTimestampMs: number) => {
        const diffMs = targetTimestampMs - currentTimestampMs;
        return Math.max(0, Math.ceil(diffMs / 1000));
      };

      const durationSeconds = 90; // 90 segundos de descanso
      const startTime = 1_000_000;
      const targetTime = startTime + durationSeconds * 1000;

      // Al inicio: 90s
      expect(calculateRemainingSeconds(targetTime, startTime)).toBe(90);

      // Transcurridos 30 segundos normales: 60s
      expect(calculateRemainingSeconds(targetTime, startTime + 30_000)).toBe(60);

      // Pestaña suspendida por 80 segundos (retoma en +80s): 10s exactos sin pérdida de tiempo
      expect(calculateRemainingSeconds(targetTime, startTime + 80_000)).toBe(10);

      // Pestaña suspendida por 120 segundos (excedió el descanso): 0s exactos sin desbordamiento negativo
      expect(calculateRemainingSeconds(targetTime, startTime + 120_000)).toBe(0);
    });
  });

  // ==========================================================================
  // 8. AUDITORÍA ARQUITECTURAL PONYTAIL & KARPATHY
  // ==========================================================================
  describe("8. Auditoría de Dependencias (Ponytail) y Simplicidad de Código (Karpathy)", () => {
    it("debe confirmar estricto cumplimiento de Ponytail: solo @supabase/ssr agregado a package.json", () => {
      const packageJsonPath = path.resolve(__dirname, "../../package.json");
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

      const deps = Object.keys(pkg.dependencies || {});

      // Verificación de dependencia autorizada
      expect(deps).toContain("@supabase/ssr");
      expect(deps).toContain("@supabase/supabase-js");
      expect(deps).toContain("next");
      expect(deps).toContain("react");
      expect(deps).toContain("zustand");

      // Verificación de cero bloatware (PROHIBIDO según Ponytail)
      expect(deps).not.toContain("formik");
      expect(deps).not.toContain("react-hook-form");
      expect(deps).not.toContain("yup");
      expect(deps).not.toContain("zod");
      expect(deps).not.toContain("axios");
      expect(deps).not.toContain("lodash");
      expect(deps).not.toContain("moment");
    });

    it("debe verificar que el cliente de Supabase (client.ts) mantiene compatibilidad dual (Browser Cookies / Node)", () => {
      const clientPath = path.resolve(__dirname, "../lib/supabase/client.ts");
      const content = fs.readFileSync(clientPath, "utf-8");

      expect(content).toContain('typeof document !== "undefined"');
      expect(content).toContain("createBrowser");
      expect(content).toContain("createPlainClient");
    });

    it("debe verificar que los clientes dedicados browser.ts y server.ts existen sin abstracciones parasitarias", () => {
      const browserPath = path.resolve(__dirname, "../lib/supabase/browser.ts");
      const serverPath = path.resolve(__dirname, "../lib/supabase/server.ts");

      expect(fs.existsSync(browserPath)).toBe(true);
      expect(fs.existsSync(serverPath)).toBe(true);

      const browserContent = fs.readFileSync(browserPath, "utf-8");
      const serverContent = fs.readFileSync(serverPath, "utf-8");

      expect(browserContent).toContain("createBrowserClient");
      expect(serverContent).toContain("createServerClient");
      expect(serverContent).toContain("cookies");
    });
  });
});
