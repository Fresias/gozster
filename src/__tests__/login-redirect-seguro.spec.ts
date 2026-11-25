import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  resolvePostPasswordChangeRedirect,
  sanitizeRedirectTo,
} from "@/lib/auth-redirect";

describe("GOZS-816 · sanitizeRedirectTo", () => {
  it("rechaza URLs absolutas y esquemas peligrosos devolviendo el fallback", () => {
    const casosInvalidos = [
      "https://sitio-externo.test/phish",
      "http://sitio-externo.test/login",
      "HTTPS://sitio-externo.test/studio",
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "mailto:test@example.com",
      "sitio-externo.test/studio",
    ];

    for (const raw of casosInvalidos) {
      expect(sanitizeRedirectTo(raw)).toBe("/studio");
    }
  });

  it("rechaza URLs protocol-relative, barras invertidas y normalizaciones a doble barra", () => {
    const casosInvalidos = [
      "//sitio-externo.test",
      "//sitio-externo.test/studio",
      "///sitio-externo.test",
      "/\\sitio-externo.test",
      "\\/sitio-externo.test",
      "/studio\\externo",
      "/.//sitio-externo.test",
      "/studio/..//..//sitio-externo.test",
    ];

    for (const raw of casosInvalidos) {
      expect(sanitizeRedirectTo(raw)).toBe("/studio");
    }
  });

  it("rechaza valores vacíos, espacios iniciales y caracteres de control", () => {
    const casosInvalidos: Array<string | null | undefined> = [
      null,
      undefined,
      "",
      "   ",
      " /studio",
      " //sitio-externo.test",
      "/\t/sitio-externo.test",
      "/studio\r\nLocation: https://sitio-externo.test",
      "/studio\n/athlete",
      "/studio\u0000",
      "/studio\u001f",
      "/studio\u007f",
    ];

    for (const raw of casosInvalidos) {
      expect(sanitizeRedirectTo(raw)).toBe("/studio");
    }
  });

  it("bloquea bucles hacia /login y /auth (incluyendo subrutas, query, mayúsculas y traversal)", () => {
    const casosBucle = [
      "/login",
      "/login/",
      "/login?redirectTo=/studio",
      "/login#form",
      "/login/reset",
      "/LOGIN",
      "/studio/../login",
      "/auth",
      "/auth/",
      "/auth/callback?code=1",
      "/AUTH/callback?code=1",
      "/studio/../auth/callback",
    ];

    for (const raw of casosBucle) {
      expect(sanitizeRedirectTo(raw)).toBe("/studio");
    }
  });

  it("conserva rutas relativas internas válidas con query strings y hashes", () => {
    expect(sanitizeRedirectTo("/")).toBe("/");
    expect(sanitizeRedirectTo("/studio")).toBe("/studio");
    expect(sanitizeRedirectTo("/athlete")).toBe("/athlete");
    expect(sanitizeRedirectTo("/studio/cobros?estado=vencido")).toBe(
      "/studio/cobros?estado=vencido",
    );
    expect(sanitizeRedirectTo("/athlete/progreso#prs")).toBe("/athlete/progreso#prs");
    expect(sanitizeRedirectTo("/studio/alumnos?q=ana&activo=1#ficha")).toBe(
      "/studio/alumnos?q=ana&activo=1#ficha",
    );
    expect(sanitizeRedirectTo("/author/guia")).toBe("/author/guia");
  });

  it("respeta un fallback personalizado cuando la entrada no es válida", () => {
    expect(sanitizeRedirectTo("https://sitio-externo.test", "/athlete")).toBe("/athlete");
    expect(sanitizeRedirectTo("/login", "/athlete")).toBe("/athlete");
    expect(sanitizeRedirectTo("/studio/rutinas", "/athlete")).toBe("/studio/rutinas");
  });
});

describe("GOZS-816 · resolvePostPasswordChangeRedirect", () => {
  it("enruta a /athlete cuando el rol es ALUMNO sin importar redirectTo", () => {
    expect(resolvePostPasswordChangeRedirect("ALUMNO", "/studio/cobros?estado=vencido")).toBe(
      "/athlete",
    );
    expect(resolvePostPasswordChangeRedirect("ALUMNO", "https://sitio-externo.test")).toBe(
      "/athlete",
    );
  });

  it("enruta a redirectTo sanitizado cuando el rol es ENTRENADOR o ADMIN", () => {
    expect(resolvePostPasswordChangeRedirect("ENTRENADOR", "/studio/cobros?estado=vencido")).toBe(
      "/studio/cobros?estado=vencido",
    );
    expect(resolvePostPasswordChangeRedirect("ADMIN", "/studio/alumnos#activos")).toBe(
      "/studio/alumnos#activos",
    );
    expect(resolvePostPasswordChangeRedirect("ENTRENADOR", "https://sitio-externo.test")).toBe(
      "/studio",
    );
    expect(resolvePostPasswordChangeRedirect("ADMIN", "//sitio-externo.test")).toBe("/studio");
    expect(resolvePostPasswordChangeRedirect("ADMIN", "/auth/callback?code=1")).toBe("/studio");
  });

  it("usa /athlete como fallback seguro si no se pudo leer el perfil o el rol es desconocido", () => {
    expect(resolvePostPasswordChangeRedirect(null, "/studio/cobros")).toBe("/athlete");
    expect(resolvePostPasswordChangeRedirect(undefined, "/studio")).toBe("/athlete");
    expect(resolvePostPasswordChangeRedirect("", "/studio")).toBe("/athlete");
  });
});

describe("GOZS-816 · Integración en src/app/login/page.tsx", () => {
  const loginSource = fs.readFileSync(
    path.resolve(__dirname, "../app/login/page.tsx"),
    "utf-8",
  );

  it("sanitiza redirectTo con sanitizeRedirectTo antes de prefetch, fetch y replace", () => {
    expect(loginSource).toContain("sanitizeRedirectTo");
    expect(loginSource).toContain(
      'const redirectTo = sanitizeRedirectTo(searchParams.get("redirectTo"), "/studio");',
    );
    expect(loginSource).not.toContain('searchParams.get("redirectTo") || "/studio"');

    const sanitizePos = loginSource.indexOf("sanitizeRedirectTo(searchParams.get");
    const prefetchPos = loginSource.indexOf("router.prefetch(redirectTo)");
    const fetchPos = loginSource.indexOf("fetch(redirectTo)");
    const replacePos = loginSource.indexOf("window.location.replace(destino)");

    expect(sanitizePos).toBeGreaterThan(-1);
    expect(prefetchPos).toBeGreaterThan(sanitizePos);
    expect(fetchPos).toBeGreaterThan(sanitizePos);
    expect(replacePos).toBeGreaterThan(sanitizePos);
  });

  it("conserva el enrutamiento post-login por rol (ALUMNO -> /athlete, staff -> redirectTo)", () => {
    expect(loginSource).toContain('perfil?.rol === "ALUMNO" ? "/athlete" : redirectTo');
  });

  it("resuelve por rol en perfiles el destino tras cambioObligatorio en lugar de hardcodear /athlete", () => {
    const start = loginSource.indexOf("if (cambioObligatorio)");
    const end = loginSource.indexOf("if (showRoleMismatch)");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const block = loginSource.slice(start, end);
    expect(block).toContain('.from("perfiles")');
    expect(block).toContain('.select("rol")');
    expect(block).toContain("resolvePostPasswordChangeRedirect(rol, redirectTo)");
    expect(block).not.toContain('window.location.assign("/athlete")');
  });
});
