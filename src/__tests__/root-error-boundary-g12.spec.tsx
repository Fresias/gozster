import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createClient: createClientMock,
}));

import RootError from "@/app/error";

function setupSupabaseMock(
  opts: { userId?: string | null; authThrows?: Error; insertThrows?: Error } = {},
) {
  const getUserMock = opts.authThrows
    ? vi.fn().mockRejectedValue(opts.authThrows)
    : vi.fn().mockResolvedValue({
        data: { user: opts.userId === null ? null : { id: opts.userId ?? "user-123" } },
        error: null,
      });
  const insertMock = opts.insertThrows
    ? vi.fn().mockRejectedValue(opts.insertThrows)
    : vi.fn().mockResolvedValue({ data: null, error: null });
  const fromMock = vi.fn().mockReturnValue({ insert: insertMock });
  createClientMock.mockReturnValue({ auth: { getUser: getUserMock }, from: fromMock });
  return { fromMock, insertMock };
}

function montarConHooks<P>(Component: (props: P) => React.ReactNode) {
  const refs: Array<{ current: unknown }> = [];
  let lastEffect: (() => void | (() => void)) | null = null;
  let lastDeps: unknown[] | undefined;

  function render(props: P, opts?: { strictModeDoubleEffect?: boolean }) {
    const internals = (React as unknown as {
      __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { H: unknown };
    }).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    const prev = internals.H;
    let refIndex = 0;
    internals.H = {
      useRef: (initialValue: unknown) => {
        const idx = refIndex++;
        if (!refs[idx]) refs[idx] = { current: initialValue };
        return refs[idx];
      },
      useEffect: (fn: () => void | (() => void), deps?: unknown[]) => {
        const changed =
          !lastDeps ||
          !deps ||
          deps.length !== lastDeps.length ||
          deps.some((d, i) => !Object.is(d, lastDeps![i]));
        if (changed) {
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
      internals.H = prev;
    }
  }

  return { render, reRunEffect: () => lastEffect?.() };
}

async function flushMicrotasks() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe("GOZS-843 (G12): Error Boundary raíz src/app/error.tsx", () => {
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

  it("SSR: expone testids, role=alert, mensaje en español, enlace al inicio y sin PII/demo", () => {
    const html = renderToStaticMarkup(<RootError error={new Error("boom")} reset={vi.fn()} />);
    expect(html).toContain('data-testid="root-error-boundary"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain('data-testid="root-error-retry-btn"');
    expect(html).toContain("Reintentar");
    expect(html).toContain("No pudimos cargar la pantalla");
    expect(html).toContain('href="/login"');
    expect(html).toContain("Ir al inicio");
    expect(html).not.toContain("boom");
    expect(html).not.toMatch(/mynter/i);
  });

  it("reporta con contexto root_error_boundary, deduplica en StrictMode y re-reporta si cambia el error", async () => {
    (globalThis as { window?: unknown }).window = { location: { pathname: "/login" } };
    const { insertMock } = setupSupabaseMock({ userId: "uid-1" });
    const err1 = Object.assign(new Error("Fallo 1"), { digest: "root-dig-1" });
    const err2 = Object.assign(new Error("Fallo 2"), { digest: "root-dig-2" });
    const mounted = montarConHooks(RootError);

    mounted.render({ error: err1, reset: vi.fn() }, { strictModeDoubleEffect: true });
    mounted.render({ error: err1, reset: vi.fn() });
    mounted.reRunEffect();
    await flushMicrotasks();

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0]![0]).toMatchObject({
      usuario_id: "uid-1",
      contexto: "root_error_boundary",
      mensaje_humano: "Error inesperado en pantalla de GOZSter",
      payload_resumen: { ruta: "/login", digest: "root-dig-1" },
    });

    mounted.render({ error: err2, reset: vi.fn() }, { strictModeDoubleEffect: true });
    await flushMicrotasks();
    expect(insertMock).toHaveBeenCalledTimes(2);
    expect(insertMock.mock.calls[1]![0]).toMatchObject({
      payload_resumen: { digest: "root-dig-2" },
    });
  });

  it("usuario anónimo: renderiza sin lanzar y no inserta", async () => {
    const { insertMock } = setupSupabaseMock({ userId: null });
    const mounted = montarConHooks(RootError);
    expect(() => mounted.render({ error: new Error("x"), reset: vi.fn() })).not.toThrow();
    await flushMicrotasks();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("no lanza si reportarErrorApp falla (auth o insert rechazan)", async () => {
    setupSupabaseMock({ authThrows: new Error("Offline") });
    expect(() =>
      montarConHooks(RootError).render({ error: new Error("a"), reset: vi.fn() }),
    ).not.toThrow();
    await flushMicrotasks();

    setupSupabaseMock({ insertThrows: new Error("Timeout") });
    expect(() =>
      montarConHooks(RootError).render({ error: new Error("b"), reset: vi.fn() }),
    ).not.toThrow();
    await flushMicrotasks();
  });
});
