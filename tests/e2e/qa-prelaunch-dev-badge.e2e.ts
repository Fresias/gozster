import { expect, test, type Page } from "@playwright/test";

// GOZS-844 · Cobertura E2E del DevEnvBadge (GOZS-836): visible solo fuera de producción, sin bloquear
// la UI, y ausente (count 0) en producción. El entorno se hornea en el arranque del servidor
// (next.config.ts → NEXT_PUBLIC_APP_ENV), por eso el spec se parametriza con E2E_EXPECT_APP_ENV:
//   development (default) | preview | production
// y se corre contra un servidor levantado con ese NEXT_PUBLIC_APP_ENV (E2E_APP_URL / E2E_STUB_URL).
// Fixtures 100 % sintéticos (@example.test); cero cambios en src/.
const STUB_URL = process.env.E2E_STUB_URL ?? "http://localhost:54321";
const APP_URL = process.env.E2E_APP_URL ?? "http://localhost:3100";
const ENTORNO = (process.env.E2E_EXPECT_APP_ENV ?? "development") as "development" | "preview" | "production";

const ETIQUETAS = { development: "DEV", preview: "DEV · PREVIEW" } as const;

const USER_ID = "aaaaaaaa-0000-4000-8000-000000000b01";
const EMAIL = "alumno.badge.sintetico@example.test";
const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

const usuario = {
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: EMAIL,
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};

/** Recolecta errores de consola/hydration y excepciones de página. */
function vigilarErrores(page: Page): string[] {
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // Ruido de red esperado con el stub (recursos no mockeados); no es regresión de UI.
    if (/Failed to load resource|net::ERR/i.test(t)) return;
    errores.push(`console.error: ${t}`);
  });
  return errores;
}

const sinHydration = (errores: string[]) =>
  errores.filter((e) => /hydrat|did not match|text content does not match/i.test(e));

test.describe(`DevEnvBadge · entorno ${ENTORNO} (GOZS-836)`, () => {
  test.afterEach(async ({ page }) => {
    await page.request.delete(`${STUB_URL}/__e2e/fixtures`);
  });

  test("B-01 · /login: badge según entorno, no bloquea el formulario @multi-viewport", async ({ page }) => {
    const errores = vigilarErrores(page);
    await page.goto("/login");
    await expect(page.getByTestId("login-submit")).toBeVisible({ timeout: 45_000 });
    const badge = page.getByTestId("dev-env-badge");

    if (ENTORNO === "production") {
      await expect(badge).toHaveCount(0);
      // Fail-closed: ni siquiera el texto de etiqueta existe en el DOM.
      await expect(page.getByText(/^DEV( · PREVIEW)?$/)).toHaveCount(0);
    } else {
      await expect(badge).toHaveCount(1);
      await expect(badge).toBeVisible();
      await expect(badge).toHaveText(ETIQUETAS[ENTORNO]);
      await expect(badge).toHaveCSS("pointer-events", "none");
      await expect(badge).toHaveAttribute("aria-label", "Entorno de desarrollo");

      // Un toque/clic en el centro del badge atraviesa al elemento de abajo (no es el objetivo del hit-test).
      const box = (await badge.boundingBox())!;
      const esBadge = await page.evaluate(
        ({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[data-testid="dev-env-badge"]'),
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      );
      expect(esBadge, "el badge no debe ser objetivo de hit-test").toBe(false);
    }

    // El formulario sigue operativo en cualquier entorno.
    await page.locator("#email").fill(EMAIL);
    await page.locator("#password").fill("clave-cualquiera");
    await expect(page.getByTestId("login-submit")).toBeEnabled();
    await page.getByTestId("login-submit").click();
    // Credenciales inválidas para el stub: el clic llegó al submit y la UI responde con un alert.
    await expect(page.getByText(/Email o contraseña incorrectos/)).toBeVisible({ timeout: 15_000 });

    expect(sinHydration(errores), "sin errores de hydration").toEqual([]);
  });

  test("B-02 · /athlete (post GOZS-825) renderiza sin errores y con el badge correcto", async ({ page }) => {
    const errores = vigilarErrores(page);
    const sesion = {
      access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({
        sub: USER_ID,
        exp: 4102444800,
        role: "authenticated",
      })}.sig`,
      refresh_token: "e2e-refresh",
      expires_at: 4102444800,
      expires_in: 3600,
      token_type: "bearer",
      user: usuario,
    };
    const res = await page.request.put(`${STUB_URL}/__e2e/fixtures`, { data: { rol: "ALUMNO", user: usuario } });
    expect(res.ok()).toBeTruthy();
    await page.context().addCookies([
      { name: "sb-localhost-auth-token", value: `base64-${b64url(sesion)}`, url: APP_URL },
    ]);

    await page.goto("/athlete");
    await expect(page).toHaveURL(/\/athlete$/, { timeout: 45_000 });
    await expect(page.locator("main, [data-testid]").first()).toBeVisible({ timeout: 45_000 });

    await expect(page.getByTestId("dev-env-badge")).toHaveCount(ENTORNO === "production" ? 0 : 1);
    expect(sinHydration(errores), "sin errores de hydration").toEqual([]);
    expect(errores.filter((e) => e.startsWith("pageerror")), "sin excepciones de página").toEqual([]);
  });
});
