import { expect, test, type Page, type Route } from "@playwright/test";

// GOZS-818 · Red de seguridad pre-lanzamiento (Go/No-go 4/12): autenticación, RBAC y cambio obligatorio
// de contraseña (F-1 alta directa / F-7 reseteo / G1) con el middleware SSR real de Next.js.
// Fixtures 100 % sintéticos (@example.test); cero cambios en src/.
const STUB_URL = process.env.E2E_STUB_URL ?? "http://localhost:54321";
const APP_URL = process.env.E2E_APP_URL ?? "http://localhost:3100";

const USER_ID = "aaaaaaaa-0000-4000-8000-000000000a01";
const EMAIL = "alumno.auth.sintetico@example.test";
const PASSWORD_OK = "e2e-ok"; // única clave que acepta el stub en /auth/v1/token
const PASSWORD_NUEVA = "Definitiva-4Rt8";

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

function usuario(appMetadata: Record<string, unknown>) {
  return {
    id: USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: EMAIL,
    app_metadata: appMetadata,
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  };
}

function sesion(appMetadata: Record<string, unknown>) {
  return {
    access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({
      sub: USER_ID,
      exp: 4102444800,
      role: "authenticated",
    })}.sig`,
    refresh_token: "e2e-refresh",
    expires_at: 4102444800,
    expires_in: 3600,
    token_type: "bearer",
    user: usuario(appMetadata),
  };
}

/** Deja al stub con el usuario/rol dado; el middleware valida el JWT contra su /auth/v1/user. */
async function configurarStub(page: Page, rol: string, appMetadata: Record<string, unknown>) {
  const res = await page.request.put(`${STUB_URL}/__e2e/fixtures`, {
    data: { rol, user: usuario(appMetadata) },
  });
  expect(res.ok()).toBeTruthy();
}

async function conSesion(page: Page, rol: string, appMetadata: Record<string, unknown> = {}) {
  await configurarStub(page, rol, appMetadata);
  await page.context().addCookies([
    { name: "sb-localhost-auth-token", value: `base64-${b64url(sesion(appMetadata))}`, url: APP_URL },
  ]);
}

const CORS = {
  "access-control-allow-origin": APP_URL,
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "*",
};

test.describe("Auth · RBAC · cambio obligatorio de contraseña (GOZS-818)", () => {
  test.afterEach(async ({ page }) => {
    await page.request.delete(`${STUB_URL}/__e2e/fixtures`);
  });

  test("A-01 · sin sesión, /studio y /athlete redirigen a /login?redirectTo", async ({ page }) => {
    for (const destino of ["/studio", "/athlete"]) {
      await page.goto(destino);
      await expect(page).toHaveURL(new RegExp(`/login\\?redirectTo=${encodeURIComponent(destino)}$`), {
        timeout: 45_000,
      });
      await expect(page.getByTestId("login-submit")).toBeVisible();
    }
  });

  test("A-02 · ALUMNO en /studio es bloqueado con banner roleMismatch", async ({ page }) => {
    await conSesion(page, "ALUMNO");
    await page.goto("/studio");
    await expect(page).toHaveURL(/\/login\?roleMismatch=1$/, { timeout: 45_000 });

    const banner = page.getByTestId("role-mismatch-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Acceso restringido a Coach Studio");
    await expect(page.getByTestId("btn-volver-rutina")).toBeVisible();
    await expect(page.getByTestId("btn-cerrar-sesion-otra-cuenta")).toBeVisible();
  });

  for (const ruta of ["/athlete", "/studio"]) {
    test(`A-03 · contraseña temporal en ${ruta} fuerza el cambio y desbloquea /athlete`, async ({ page }) => {
      await conSesion(page, "ALUMNO", { must_change_password: true });

      let putUser: Record<string, unknown> | null = null;
      let patchPerfil: Record<string, unknown> | null = null;

      await page.route("**/auth/v1/user", async (route: Route) => {
        const req = route.request();
        if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
        if (req.method() !== "PUT") return route.continue();
        putUser = req.postDataJSON();
        // El stub deja de reportar la bandera, como haría GoTrue tras updateUser.
        await configurarStub(page, "ALUMNO", {});
        return route.fulfill({
          status: 200,
          headers: { ...CORS, "content-type": "application/json" },
          body: JSON.stringify(usuario({})),
        });
      });
      await page.route("**/rest/v1/perfiles?*", async (route: Route) => {
        const req = route.request();
        if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
        if (req.method() !== "PATCH") return route.continue();
        patchPerfil = req.postDataJSON();
        return route.fulfill({
          status: 200,
          headers: { ...CORS, "content-type": "application/json" },
          body: "[]",
        });
      });

      await page.goto(ruta);
      await expect(page).toHaveURL(/\/login\?forceChange=1$/, { timeout: 45_000 });
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15_000 });

      const submit = page.getByTestId("force-password-submit");
      const nueva = page.locator("#force-password");
      const repetir = page.locator("#force-password-confirm");
      await expect(submit).toBeDisabled();

      // Largo mínimo (< 8): el submit sigue deshabilitado y la pista no marca "Largo suficiente".
      await nueva.fill("corta1");
      await repetir.fill("corta1");
      await expect(submit).toBeDisabled();
      await expect(page.getByText("✓ Largo suficiente")).toHaveCount(0);

      // No coincidencia.
      await nueva.fill(PASSWORD_NUEVA);
      await repetir.fill(`${PASSWORD_NUEVA}x`);
      await expect(page.getByText("Las contraseñas no coinciden.")).toBeVisible();
      await expect(submit).toBeDisabled();

      // Contraseña válida: actualiza auth + perfil y navega a /athlete.
      await repetir.fill(PASSWORD_NUEVA);
      await expect(submit).toBeEnabled();
      await submit.click();

      await expect(page).toHaveURL(/\/athlete$/, { timeout: 45_000 });
      expect(putUser).toMatchObject({ password: PASSWORD_NUEVA, data: { must_change_password: false } });
      expect(patchPerfil).toMatchObject({ debe_cambiar_password: false });
    });
  }

  test("A-04 · credenciales inválidas muestran alert; login válido de ALUMNO va a /athlete", async ({ page }) => {
    await configurarStub(page, "ALUMNO", {});
    await page.goto("/login");

    await page.locator("#email").fill(EMAIL);
    await page.locator("#password").fill("clave-incorrecta");
    await page.getByTestId("login-submit").click();

    const alerta = page.getByRole("alert").filter({ hasText: "Email o contraseña incorrectos" });
    await expect(alerta).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/login(\?.*)?$/);

    await page.locator("#password").fill(PASSWORD_OK);
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/athlete$/, { timeout: 45_000 });
  });
});
