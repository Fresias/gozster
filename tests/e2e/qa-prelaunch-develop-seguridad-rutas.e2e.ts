import { expect, test, type Page } from "@playwright/test";
import { FORBIDDEN_DEMO_LITERALS } from "@/test-utils/no-demo-literals";

// GOZS-924 · Suite permanente (datos sintéticos, G4/G5/G12) de superficies críticas del lanzamiento:
//  - Cabeceras de seguridad HTTP O-5 (next.config.ts) en rutas públicas y protegidas.
//  - /studio/auditoria: listado, filtros, estado vacío y error 500 de auditoria_cambios.
//  - /invitacion, /entrenadores y 404 controlado (not-found.tsx).
//  - GET /api/coach/entrenadores: 401 sin sesión, 403 ALUMNO, 200 + no-store para staff.
const STUB_URL = process.env.E2E_STUB_URL ?? "http://localhost:54321";
const APP_URL = process.env.E2E_APP_URL ?? "http://localhost:3100";
const STAFF_ID = "00000000-0000-4000-8000-000000000001";

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

type Fila = Record<string, unknown>;

async function iniciarSesion(page: Page, rol: "ADMIN" | "ALUMNO", fixtures: Fila = {}) {
  const res = await page.request.put(`${STUB_URL}/__e2e/fixtures`, { data: { rol, ...fixtures } });
  expect(res.ok()).toBe(true);
  const sesion = {
    access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: STAFF_ID, exp: 4102444800, role: "authenticated" })}.sig`,
    refresh_token: "e2e-refresh",
    expires_at: 4102444800,
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: STAFF_ID,
      aud: "authenticated",
      role: "authenticated",
      email: "coach-e2e@gozster.test",
      app_metadata: { rol },
      user_metadata: {},
    },
  };
  await page.context().addCookies([{ name: "sb-localhost-auth-token", value: `base64-${b64url(sesion)}`, url: APP_URL }]);
}

const forzarFallos = async (page: Page, fallos: Record<string, number>) => {
  const res = await page.request.put(`${STUB_URL}/__e2e/fallos`, { data: fallos });
  expect(res.ok()).toBe(true);
};

/** Falla ante cualquier pageerror o console.error inesperado. */
// El stub no implementa Realtime (websocket): ese único ruido se ignora.
const RUIDO_REALTIME_STUB = /WebSocket connection to .*\/realtime\/v1\/websocket/;

function vigilarConsola(page: Page, ignorar: RegExp[] = [RUIDO_REALTIME_STUB]) {
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !ignorar.some((r) => r.test(m.text()))) errores.push(`console: ${m.text()}`);
  });
  return errores;
}

async function sinLiteralesProhibidos(page: Page) {
  const texto = await page.locator("body").innerText();
  for (const lit of FORBIDDEN_DEMO_LITERALS) expect(texto, `literal demo: ${lit}`).not.toContain(lit);
  expect(texto).not.toMatch(/\b(select|insert)\b.+\b(from|into)\b/i);
  expect(texto).not.toMatch(/PGRST|stack|at .+\(.+:\d+:\d+\)/);
}

const registro = (id: string, entidad: string, accion: string, minuto: number, motivo: string): Fila => ({
  id,
  entidad,
  entidad_id: "55555555-5555-4555-8555-555555555501",
  accion,
  motivo,
  valores_anteriores: { estado: "ACTIVA" },
  valores_nuevos: { estado: "VENCIDA" },
  created_at: `2026-11-20T10:${String(minuto).padStart(2, "0")}:00-03:00`,
});

const AUDITORIA = [
  registro("66666666-6666-4666-8666-666666666601", "contrataciones", "UPDATE", 1, "Motivo sintético A"),
  registro("66666666-6666-4666-8666-666666666602", "contrataciones", "EXTENSION_EXCEPCIONAL", 2, "Motivo sintético B"),
  registro("66666666-6666-4666-8666-666666666603", "planes_entrenamiento", "INSERT", 3, "Motivo sintético C"),
];

test.describe("GOZS-924 · Seguridad, auditoría y rutas públicas", () => {
  test.afterEach(async ({ request }) => {
    await request.delete(`${STUB_URL}/__e2e/fixtures`).catch(() => {});
  });

  test("SG-01 · cabeceras O-5 en rutas públicas y protegidas (staff y alumno)", async ({ page }) => {
    const verificar = (headers: Record<string, string>, ruta: string) => {
      const csp = headers["content-security-policy"] ?? "";
      expect(csp, `CSP en ${ruta}`).toContain("frame-ancestors 'none'");
      expect(csp, `CSP en ${ruta}`).toContain("object-src 'none'");
      expect(headers["x-content-type-options"], ruta).toBe("nosniff");
      expect(headers["referrer-policy"], ruta).toBe("strict-origin-when-cross-origin");
      expect(headers["permissions-policy"], ruta).toBeTruthy();
    };

    for (const ruta of ["/", "/login", "/invitacion", "/entrenadores"]) {
      const res = await page.request.get(`${APP_URL}${ruta}`);
      expect(res.status(), ruta).toBe(200);
      verificar(res.headers(), ruta);
    }

    await iniciarSesion(page, "ADMIN", { alumnos: [] });
    const studio = await page.request.get(`${APP_URL}/studio`);
    expect(studio.status()).toBe(200);
    verificar(studio.headers(), "/studio");

    await iniciarSesion(page, "ALUMNO", { alumnos: [] });
    const athlete = await page.request.get(`${APP_URL}/athlete`);
    expect(athlete.status()).toBe(200);
    verificar(athlete.headers(), "/athlete");
  });

  test("SG-02 · /studio/auditoria lista registros y filtra por entidad y acción", async ({ page }) => {
    const errores = vigilarConsola(page);
    await iniciarSesion(page, "ADMIN", { alumnos: [], auditoria_cambios: AUDITORIA });

    await page.goto("/studio/auditoria");
    await expect(page.getByTestId("auditoria-cambios-panel")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("auditoria-registro")).toHaveCount(3);
    await expect(page.getByTestId("auditoria-error")).toHaveCount(0);
    await sinLiteralesProhibidos(page);

    await page.locator('select[name="entidad"]').selectOption("planes_entrenamiento");
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page).toHaveURL(/entidad=planes_entrenamiento/);
    await expect(page.getByTestId("auditoria-registro")).toHaveCount(1);
    await expect(page.getByTestId("auditoria-registro")).toContainText("Motivo sintético C");

    await page.goto("/studio/auditoria?entidad=contrataciones&accion=EXTENSION_EXCEPCIONAL");
    await expect(page.getByTestId("auditoria-registro")).toHaveCount(1);
    await expect(page.getByTestId("auditoria-registro")).toContainText("Motivo sintético B");

    expect(errores).toEqual([]);
  });

  test("SG-03 · /studio/auditoria en base vacía muestra estado vacío sin demo", async ({ page }) => {
    const errores = vigilarConsola(page);
    await iniciarSesion(page, "ADMIN", { alumnos: [], auditoria_cambios: [] });

    await page.goto("/studio/auditoria");
    await expect(page.getByTestId("auditoria-vacia")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("auditoria-registro")).toHaveCount(0);
    await sinLiteralesProhibidos(page);

    await page.goto("/studio/auditoria?entidad=contrataciones");
    await expect(page.getByTestId("auditoria-vacia")).toContainText("Sin cambios para este filtro");
    expect(errores).toEqual([]);
  });

  test("SG-04 · /studio/auditoria con error 500 muestra alerta limpia sin crashear", async ({ page }) => {
    await iniciarSesion(page, "ADMIN", { alumnos: [], auditoria_cambios: AUDITORIA });
    await forzarFallos(page, { auditoria_cambios: 500 });

    await page.goto("/studio/auditoria");
    const alerta = page.getByTestId("auditoria-error");
    await expect(alerta).toBeVisible({ timeout: 60_000 });
    await expect(alerta).toHaveAttribute("role", "alert");
    await expect(alerta).toContainText("No pudimos cargar el historial de cambios.");
    await expect(page.getByTestId("auditoria-registro")).toHaveCount(0);
    await expect(page.getByTestId("auditoria-vacia")).toHaveCount(0);
    await sinLiteralesProhibidos(page);
  });

  test("SG-05 · /invitacion sin token y con token inválido queda en estado controlado", async ({ page }) => {
    const errores = vigilarConsola(page, [RUIDO_REALTIME_STUB, /Failed to load resource/i]);
    for (const ruta of ["/invitacion", "/invitacion?token=invalido"]) {
      const res = await page.goto(ruta);
      expect(res?.status(), ruta).toBe(200);
      await expect(page.locator("main, body").first()).toBeVisible();
      // Sin sesión de invitación: no se ofrece el formulario de clave y hay salida a /login.
      await expect(page.locator('input[type="password"]')).toHaveCount(0, { timeout: 30_000 });
      await expect(page.getByRole("link", { name: /iniciar sesi|login|ingres/i }).first()).toBeVisible();
      await sinLiteralesProhibidos(page);
    }
    expect(errores).toEqual([]);
  });

  test("SG-06 · /entrenadores renderiza sin errores de consola ni PII/demo", async ({ page }) => {
    const errores = vigilarConsola(page);
    const res = await page.goto("/entrenadores");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await sinLiteralesProhibidos(page);
    const texto = await page.locator("body").innerText();
    expect(texto).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(errores).toEqual([]);
  });

  test("SG-07 · ruta inexistente responde 404 con not-found.tsx y sin stack trace", async ({ page }) => {
    const res = await page.goto("/ruta-inexistente-e2e-g12");
    expect(res?.status()).toBe(404);
    await expect(page.getByTestId("not-found-page")).toBeVisible();
    await expect(page.getByTestId("not-found-login-link")).toBeVisible();
    await sinLiteralesProhibidos(page);
  });

  test("SG-08 · GET /api/coach/entrenadores: 401 sin sesión, 403 ALUMNO, 200 no-store staff", async ({ page, playwright }) => {
    // Sin cookie de sesión.
    const anonimo = await playwright.request.newContext({ baseURL: APP_URL });
    const sinSesion = await anonimo.get("/api/coach/entrenadores");
    expect(sinSesion.status()).toBe(401);
    await anonimo.dispose();

    // ALUMNO.
    await iniciarSesion(page, "ALUMNO", { alumnos: [] });
    const comoAlumno = await page.request.get(`${APP_URL}/api/coach/entrenadores`);
    expect(comoAlumno.status()).toBe(403);

    // Staff ADMIN: el stub devuelve filas de perfiles con campos extra que la API NO debe filtrar a la respuesta.
    await iniciarSesion(page, "ADMIN", { alumnos: [] });
    const comoStaff = await page.request.get(`${APP_URL}/api/coach/entrenadores`);
    expect(comoStaff.status()).toBe(200);
    expect(comoStaff.headers()["cache-control"]).toContain("no-store");
    const cuerpo = (await comoStaff.json()) as { entrenadores: Array<Record<string, unknown>> };
    for (const e of cuerpo.entrenadores) {
      expect(Object.keys(e).sort()).toEqual(["id", "nombre_completo", "rol"]);
    }
    expect(JSON.stringify(cuerpo)).not.toMatch(/email|telefono|@/);
  });
});
