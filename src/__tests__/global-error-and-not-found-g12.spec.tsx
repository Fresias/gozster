import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createClient: createClientMock,
}));

import GlobalError from "@/app/global-error";
import NotFound from "@/app/not-found";

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

function findElementByTestId(node: React.ReactNode, testId: string): React.ReactElement | null {
  if (!React.isValidElement(node)) return null;
  const props = node.props as Record<string, unknown>;
  if (props["data-testid"] === testId) return node;
  const children = props.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findElementByTestId(child, testId);
      if (found) return found;
    }
  } else if (children) {
    return findElementByTestId(children as React.ReactNode, testId);
  }
  return null;
}

async function flushMicrotasks() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe("GOZS-857 (G12): Global Error Boundary src/app/global-error.tsx", () => {
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

  it("SSR: renderiza <html lang='es'><body> autónomos con testids, role=alert, Reintentar, /login y sin exponer error.message ni PII/demo", () => {
    const html = renderToStaticMarkup(
      <GlobalError error={new Error("detalle-interno-secreto")} reset={vi.fn()} />,
    );
    expect(html).toContain('<html lang="es">');
    expect(html).toContain("<body");
    expect(html).toContain('data-testid="global-error-boundary"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain('data-testid="global-error-retry-btn"');
    expect(html).toContain("Reintentar");
    expect(html).toContain("No pudimos cargar GOZSter");
    expect(html).toContain('href="/login"');
    expect(html).toContain('data-testid="global-error-login-link"');
    expect(html).not.toContain("detalle-interno-secreto");
    expect(html).not.toMatch(/mynter/i);
  });

  it("botón Reintentar invoca reset()", () => {
    setupSupabaseMock({ userId: null });
    const reset = vi.fn();
    const tree = montarConHooks(GlobalError).render({ error: new Error("crash"), reset });
    const retryBtn = findElementByTestId(tree, "global-error-retry-btn");
    expect(retryBtn).not.toBeNull();
    (retryBtn!.props as { onClick: () => void }).onClick();
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("reporta con contexto global_error_boundary, deduplica en StrictMode y re-reporta si cambia el error", async () => {
    (globalThis as { window?: unknown }).window = { location: { pathname: "/studio" } };
    const { insertMock } = setupSupabaseMock({ userId: "uid-global-1" });
    const err1 = Object.assign(new Error("Crash layout 1"), { digest: "glob-dig-1" });
    const err2 = Object.assign(new Error("Crash layout 2"), { digest: "glob-dig-2" });
    const mounted = montarConHooks(GlobalError);

    mounted.render({ error: err1, reset: vi.fn() }, { strictModeDoubleEffect: true });
    mounted.render({ error: err1, reset: vi.fn() });
    mounted.reRunEffect();
    await flushMicrotasks();

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0]![0]).toMatchObject({
      usuario_id: "uid-global-1",
      contexto: "global_error_boundary",
      mensaje_humano: "Error inesperado crítico en GOZSter",
      payload_resumen: { ruta: "/studio", digest: "glob-dig-1" },
    });

    mounted.render({ error: err2, reset: vi.fn() }, { strictModeDoubleEffect: true });
    await flushMicrotasks();
    expect(insertMock).toHaveBeenCalledTimes(2);
    expect(insertMock.mock.calls[1]![0]).toMatchObject({
      contexto: "global_error_boundary",
      payload_resumen: { digest: "glob-dig-2" },
    });
  });

  it("usuario anónimo: renderiza sin lanzar y no inserta en errores_app", async () => {
    const { insertMock } = setupSupabaseMock({ userId: null });
    const mounted = montarConHooks(GlobalError);
    expect(() => mounted.render({ error: new Error("anon"), reset: vi.fn() })).not.toThrow();
    await flushMicrotasks();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("no lanza si reportarErrorApp falla (auth o insert rechazan)", async () => {
    setupSupabaseMock({ authThrows: new Error("Offline") });
    expect(() =>
      montarConHooks(GlobalError).render({ error: new Error("a"), reset: vi.fn() }),
    ).not.toThrow();
    await flushMicrotasks();

    setupSupabaseMock({ insertThrows: new Error("Timeout") });
    expect(() =>
      montarConHooks(GlobalError).render({ error: new Error("b"), reset: vi.fn() }),
    ).not.toThrow();
    await flushMicrotasks();
  });
});

describe("GOZS-857 (UX 404): Página src/app/not-found.tsx", () => {
  it("SSR: renderiza 404 accesible en español con testids, enlaces seguros (/login, /athlete, /studio) y sin PII/demo", () => {
    const html = renderToStaticMarkup(<NotFound />);
    expect(html).toContain('data-testid="not-found-page"');
    expect(html).toContain("<main");
    expect(html).toContain("<h1");
    expect(html).toContain("Error 404");
    expect(html).toContain("Página no encontrada");
    expect(html).toContain("<nav");
    expect(html).toContain('href="/login"');
    expect(html).toContain('href="/athlete"');
    expect(html).toContain('href="/studio"');
    expect(html).toContain('data-testid="not-found-login-link"');
    expect(html).toContain('data-testid="not-found-athlete-link"');
    expect(html).toContain('data-testid="not-found-studio-link"');
    expect(html).not.toContain("This page could not be found");
    expect(html).not.toMatch(/mynter/i);
  });
});
