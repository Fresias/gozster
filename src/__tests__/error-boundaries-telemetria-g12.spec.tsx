import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createClient: createClientMock,
}));

import { reportarErrorApp } from "@/lib/reportar-error-app";
import AthleteError from "@/app/(athlete)/athlete/error";
import StudioError from "@/app/(coach)/studio/error";

type MockSupabaseOptions = {
  userId?: string | null;
  authError?: { message: string } | null;
  authThrows?: Error;
  insertError?: { message: string } | null;
  insertThrows?: Error;
};

function setupSupabaseMock(opts: MockSupabaseOptions = {}) {
  const getUserMock = opts.authThrows
    ? vi.fn().mockRejectedValue(opts.authThrows)
    : vi.fn().mockResolvedValue({
        data: { user: opts.userId === null ? null : { id: opts.userId ?? "user-123" } },
        error: opts.authError ?? null,
      });

  const insertMock = opts.insertThrows
    ? vi.fn().mockRejectedValue(opts.insertThrows)
    : vi.fn().mockResolvedValue({
        data: null,
        error: opts.insertError ?? null,
      });

  const fromMock = vi.fn().mockReturnValue({ insert: insertMock });

  createClientMock.mockReturnValue({
    auth: { getUser: getUserMock },
    from: fromMock,
  });

  return { getUserMock, fromMock, insertMock };
}

/**
 * Monta un componente funcional de React 19 con un dispatcher persistente para `useRef`
 * y ejecución controlada de `useEffect` (permite simular StrictMode y re-renders).
 */
function montarConHooks<P>(
  Component: (props: P) => React.ReactNode,
) {
  const refs: Array<{ current: unknown }> = [];
  let lastEffect: (() => void | (() => void)) | null = null;
  let lastDeps: unknown[] | undefined;

  function render(props: P, opts?: { strictModeDoubleEffect?: boolean }) {
    const internals = (React as unknown as {
      __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { H: unknown };
    }).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    const prevDispatcher = internals.H;
    let refIndex = 0;

    internals.H = {
      useRef: (initialValue: unknown) => {
        const idx = refIndex++;
        if (!refs[idx]) {
          refs[idx] = { current: initialValue };
        }
        return refs[idx];
      },
      useEffect: (fn: () => void | (() => void), deps?: unknown[]) => {
        const depsChanged =
          !lastDeps ||
          !deps ||
          deps.length !== lastDeps.length ||
          deps.some((d, i) => !Object.is(d, lastDeps![i]));
        if (depsChanged) {
          lastDeps = deps ? [...deps] : undefined;
          lastEffect = fn;
          const cleanup = fn();
          if (opts?.strictModeDoubleEffect) {
            if (typeof cleanup === "function") cleanup();
            fn();
          }
        }
      },
    };

    try {
      return Component(props);
    } finally {
      internals.H = prevDispatcher;
    }
  }

  function reRunEffect() {
    lastEffect?.();
  }

  return { render, reRunEffect };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("GOZS-817 (G12): Telemetría de Error Boundaries en public.errores_app", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  describe("1. Helper reportarErrorApp()", () => {
    it("inserta en public.errores_app con usuario_id, contexto, mensaje_humano, detalle_tecnico <= 500 chars y payload_resumen.digest sin query params ni secretos", async () => {
      (globalThis as { window?: unknown }).window = {
        location: {
          pathname: "/athlete/entrenar",
          search: "?token=secret-jwt&email=user@example.com",
        },
      };
      const { fromMock, insertMock } = setupSupabaseMock({ userId: "11111111-2222-3333-4444-555555555555" });

      const mensajeLargo = "Fallo crítico de render ".repeat(40);
      const err = Object.assign(new TypeError(mensajeLargo), {
        digest: "DIGEST-ABC-123",
        headers: { authorization: "Bearer super-secret-token" },
        cookie: "sb-access-token=super-secret-cookie",
      });

      const ok = await reportarErrorApp({
        contexto: "athlete_error_boundary",
        mensajeHumano: "Error inesperado en pantalla de Athlete App",
        error: err,
        payloadResumen: { origen: "boundary_test", intento: 1 },
      });

      expect(ok).toBe(true);
      expect(fromMock).toHaveBeenCalledWith("errores_app");
      expect(insertMock).toHaveBeenCalledTimes(1);

      const inserted = insertMock.mock.calls[0]![0] as {
        usuario_id: string;
        contexto: string;
        mensaje_humano: string;
        detalle_tecnico: string;
        payload_resumen: Record<string, unknown>;
      };

      expect(inserted.usuario_id).toBe("11111111-2222-3333-4444-555555555555");
      expect(inserted.contexto).toBe("athlete_error_boundary");
      expect(inserted.mensaje_humano).toBe("Error inesperado en pantalla de Athlete App");
      expect(inserted.detalle_tecnico.length).toBeLessThanOrEqual(500);
      expect(inserted.detalle_tecnico).toContain("TypeError:");
      expect(inserted.detalle_tecnico).toContain("DIGEST-ABC-123");
      expect(inserted.detalle_tecnico).not.toContain("super-secret-token");
      expect(inserted.detalle_tecnico).not.toContain("super-secret-cookie");

      expect(inserted.payload_resumen).toEqual({
        ruta: "/athlete/entrenar",
        digest: "DIGEST-ABC-123",
        origen: "boundary_test",
        intento: 1,
      });
      expect(JSON.stringify(inserted.payload_resumen)).not.toContain("secret-jwt");
      expect(JSON.stringify(inserted.payload_resumen)).not.toContain("user@example.com");
    });

    it("no inserta y devuelve false cuando no hay usuario autenticado (user: null)", async () => {
      const { fromMock, insertMock } = setupSupabaseMock({ userId: null });

      const ok = await reportarErrorApp({
        contexto: "studio_error_boundary",
        mensajeHumano: "Error inesperado en pantalla de Coach Studio",
        error: new Error("Sin sesión"),
      });

      expect(ok).toBe(false);
      expect(fromMock).not.toHaveBeenCalled();
      expect(insertMock).not.toHaveBeenCalled();
    });

    it("jamás lanza excepción y devuelve false si getUser() falla o rechaza (modo offline)", async () => {
      setupSupabaseMock({ authThrows: new Error("NetworkError: Failed to fetch") });

      await expect(
        reportarErrorApp({
          contexto: "athlete_error_boundary",
          mensajeHumano: "Error inesperado en pantalla de Athlete App",
          error: new Error("Crash offline"),
        }),
      ).resolves.toBe(false);

      setupSupabaseMock({ authError: { message: "AuthSessionMissingError" }, userId: null });

      await expect(
        reportarErrorApp({
          contexto: "athlete_error_boundary",
          mensajeHumano: "Error inesperado en pantalla de Athlete App",
          error: new Error("Sin sesión"),
        }),
      ).resolves.toBe(false);
    });

    it("jamás lanza excepción y devuelve false si insert() falla, rechaza o createClient() lanza", async () => {
      setupSupabaseMock({ insertError: { message: "permission denied for table errores_app" } });
      await expect(
        reportarErrorApp({
          contexto: "studio_error_boundary",
          mensajeHumano: "Error inesperado en pantalla de Coach Studio",
          error: new Error("Error RLS"),
        }),
      ).resolves.toBe(false);

      setupSupabaseMock({ insertThrows: new Error("Timeout de red") });
      await expect(
        reportarErrorApp({
          contexto: "studio_error_boundary",
          mensajeHumano: "Error inesperado en pantalla de Coach Studio",
          error: new Error("Crash red"),
        }),
      ).resolves.toBe(false);

      createClientMock.mockImplementation(() => {
        throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL");
      });
      await expect(
        reportarErrorApp({
          contexto: "studio_error_boundary",
          mensajeHumano: "Error inesperado en pantalla de Coach Studio",
          error: new Error("Sin env"),
        }),
      ).resolves.toBe(false);
    });
  });

  describe("2. Integración en AthleteError y StudioError (deduplicación StrictMode y degradación segura)", () => {
    it("AthleteError reporta con contexto athlete_error_boundary y deduplica ante StrictMode y re-renders con la misma instancia de error", async () => {
      (globalThis as { window?: unknown }).window = { location: { pathname: "/athlete" } };
      const { insertMock } = setupSupabaseMock({ userId: "athlete-uid-1" });

      const err1 = Object.assign(new Error("Render roto en Athlete"), { digest: "ath-dig-1" });
      const err2 = Object.assign(new Error("Segundo fallo en Athlete"), { digest: "ath-dig-2" });
      const reset = vi.fn();

      const mounted = montarConHooks(AthleteError);

      // Montaje inicial con doble invocación simulando React StrictMode
      mounted.render({ error: err1, reset }, { strictModeDoubleEffect: true });
      // Re-render con misma instancia de error + ejecución redundante del efecto
      mounted.render({ error: err1, reset: vi.fn() });
      mounted.reRunEffect();

      await flushMicrotasks();

      expect(insertMock).toHaveBeenCalledTimes(1);
      expect(insertMock.mock.calls[0]![0]).toMatchObject({
        usuario_id: "athlete-uid-1",
        contexto: "athlete_error_boundary",
        mensaje_humano: "Error inesperado en pantalla de Athlete App",
        payload_resumen: { ruta: "/athlete", digest: "ath-dig-1" },
      });

      // Una instancia distinta de error sí vuelve a reportarse
      mounted.render({ error: err2, reset }, { strictModeDoubleEffect: true });
      await flushMicrotasks();

      expect(insertMock).toHaveBeenCalledTimes(2);
      expect(insertMock.mock.calls[1]![0]).toMatchObject({
        usuario_id: "athlete-uid-1",
        contexto: "athlete_error_boundary",
        payload_resumen: { ruta: "/athlete", digest: "ath-dig-2" },
      });
    });

    it("StudioError reporta con contexto studio_error_boundary y deduplica ante StrictMode y re-renders con la misma instancia de error", async () => {
      (globalThis as { window?: unknown }).window = { location: { pathname: "/studio/alumnos" } };
      const { insertMock } = setupSupabaseMock({ userId: "coach-uid-1" });

      const err1 = Object.assign(new Error("Render roto en Studio"), { digest: "stu-dig-1" });
      const err2 = Object.assign(new Error("Segundo fallo en Studio"), { digest: "stu-dig-2" });
      const reset = vi.fn();

      const mounted = montarConHooks(StudioError);

      mounted.render({ error: err1, reset }, { strictModeDoubleEffect: true });
      mounted.render({ error: err1, reset: vi.fn() });
      mounted.reRunEffect();

      await flushMicrotasks();

      expect(insertMock).toHaveBeenCalledTimes(1);
      expect(insertMock.mock.calls[0]![0]).toMatchObject({
        usuario_id: "coach-uid-1",
        contexto: "studio_error_boundary",
        mensaje_humano: "Error inesperado en pantalla de Coach Studio",
        payload_resumen: { ruta: "/studio/alumnos", digest: "stu-dig-1" },
      });

      mounted.render({ error: err2, reset }, { strictModeDoubleEffect: true });
      await flushMicrotasks();

      expect(insertMock).toHaveBeenCalledTimes(2);
      expect(insertMock.mock.calls[1]![0]).toMatchObject({
        usuario_id: "coach-uid-1",
        contexto: "studio_error_boundary",
        payload_resumen: { ruta: "/studio/alumnos", digest: "stu-dig-2" },
      });
    });

    it("con sesión inexistente o red caída, ambos boundaries renderizan la pantalla de recuperación ('Reintentar') sin excepciones secundarias", async () => {
      setupSupabaseMock({ authThrows: new Error("Offline") });
      const err = new Error("Crash sin red");

      const athleteMounted = montarConHooks(AthleteError);
      const studioMounted = montarConHooks(StudioError);

      expect(() => athleteMounted.render({ error: err, reset: vi.fn() })).not.toThrow();
      expect(() => studioMounted.render({ error: err, reset: vi.fn() })).not.toThrow();
      await flushMicrotasks();

      const athleteHtml = renderToStaticMarkup(<AthleteError error={err} reset={vi.fn()} />);
      const studioHtml = renderToStaticMarkup(<StudioError error={err} reset={vi.fn()} />);

      expect(athleteHtml).toContain('data-testid="athlete-error-boundary"');
      expect(athleteHtml).toContain('data-testid="athlete-error-retry-btn"');
      expect(athleteHtml).toContain("Reintentar");

      expect(studioHtml).toContain('data-testid="studio-error-boundary"');
      expect(studioHtml).toContain('data-testid="studio-error-retry-btn"');
      expect(studioHtml).toContain("Reintentar");
    });
  });
});
