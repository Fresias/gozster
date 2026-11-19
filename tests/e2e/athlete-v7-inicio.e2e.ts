import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const APP_PORT = process.env.PLAYWRIGHT_APP_PORT ?? "3100";
const STUB_PORT = process.env.PLAYWRIGHT_STUB_PORT ?? "54321";
const APP_URL = `http://localhost:${APP_PORT}`;
const STUB_URL = `http://localhost:${STUB_PORT}`;
const FIXTURE_BASE = JSON.parse(
  readFileSync(join(process.cwd(), "tests", "e2e", "fixtures", "athlete-v7.json"), "utf8"),
);
const LUCIA_ID: string = FIXTURE_BASE.user.id;
const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

function buildSessionCookie() {
  return {
    access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({
      sub: FIXTURE_BASE.user.id,
      exp: 4102444800,
      role: "authenticated",
    })}.sig`,
    refresh_token: "e2e-refresh",
    expires_at: 4102444800,
    expires_in: 3600,
    token_type: "bearer",
    user: FIXTURE_BASE.user,
  };
}

async function prepararInicio(page: Page, opts?: { tema?: "light" | "dark"; storeExtra?: Record<string, unknown> }) {
  const tema = opts?.tema ?? "light";
  await page.request.put(`${STUB_URL}/__e2e/fixtures`, { data: FIXTURE_BASE });
  await page.context().addCookies([
    {
      name: "sb-localhost-auth-token",
      value: `base64-${b64url(buildSessionCookie())}`,
      url: APP_URL,
    },
  ]);
  await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date("2026-11-17T10:00:00-03:00"));

  const storeSeed = {
    state: {
      onboardingCompletado: true,
      mostrarTimerDescanso: true,
      nivelVistaAlumno: "SIMPLE",
      membershipStatus: "ACTIVE",
      currentSession: {
        id: "aaaaaaaa-1111-4111-8111-111111111101",
        nombre_rutina: "Lucía Fernández: DÍA 1",
        fecha: "2026-11-17",
        ejercicios: [],
        studentId: LUCIA_ID,
        studentName: "Lucía Fernández",
      },
      ...(opts?.storeExtra ?? {}),
    },
    version: 2,
  };

  await page.addInitScript(
    ({ theme, userId, storeJson }) => {
      window.localStorage.setItem("gozster-theme", theme);
      window.localStorage.setItem(`gozster-athlete-store:${userId}`, storeJson);
    },
    { theme: tema, userId: LUCIA_ID, storeJson: JSON.stringify(storeSeed) },
  );
}

test.describe("@mobile Athlete v7 · FE-03 Inicio y sus estados", () => {
  test.afterAll(async ({ request }) => {
    await request.delete(`${STUB_URL}/__e2e/fixtures`).catch(() => {});
  });

  test("tarjeta y hoja de instalar (iPhone/Android, Escape y descarte) + cambio de día sin desborde a 360px", async ({
    page,
  }) => {
    await prepararInicio(page, { tema: "light" });
    await page.goto("/athlete");
    await expect(page.getByTestId("inicio-mis-dias-container")).toBeVisible({ timeout: 25_000 });

    // Saludo con nombre_preferido y héroe v7
    await expect(page.getByText("Hola, Lucía")).toBeVisible();
    await expect(page.getByTestId("heroe-te-toca-hoy")).toBeVisible();

    // Tarjeta de instalar -> abrir hoja -> alternar iPhone/Android -> Escape cierra
    await expect(page.getByTestId("instalar-app-card")).toBeVisible();
    await page.getByTestId("instalar-app-btn").click();
    await expect(page.getByTestId("instalar-app-sheet")).toBeVisible();
    await page.getByTestId("instalar-os-ios").click();
    await expect(page.getByText("Abrí GOZSter en Safari.")).toBeVisible();
    await page.getByTestId("instalar-os-android").click();
    await expect(page.getByText("Abrí GOZSter en Chrome.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("instalar-app-sheet")).toBeHidden();

    // Descartar tarjeta con "Ahora no"
    await page.getByTestId("instalar-app-descartar-btn").click();
    await expect(page.getByTestId("instalar-app-card")).toBeHidden();

    // Cambiar de día y deshacer
    await page.getByTestId("hacer-otro-dia-btn").click();
    await expect(page.getByTestId("sheet-cambiar-dia")).toBeVisible();
    const dia2Id = FIXTURE_BASE.dias_rutina[1].id as string;
    await page.getByTestId(`sheet-option-dia-${dia2Id}`).click();
    await expect(page.getByTestId("seccion-motivo-cambio-dia")).toBeVisible();
    await page.getByTestId("confirmar-cambio-dia-btn").click();
    await expect(page.getByTestId("toast-cambio-dia")).toBeVisible();
    await expect(page.getByTestId("empezar-dia-btn")).toContainText("Empezar Día 2");
    await page.getByTestId("deshacer-cambio-dia-btn").click();
    await expect(page.getByTestId("empezar-dia-btn")).toContainText("Empezar Día 1");

    // Sin desborde horizontal a 360px
    await page.setViewportSize({ width: 360, height: 800 });
    const overflow360 = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow360).toBe(false);
  });

  test("estado error con Reintentar y carga sin mostrar 'sin plan' antes de 1s", async ({
    page,
  }) => {
    await prepararInicio(page, { tema: "dark" });
    await page.goto("/athlete/historial");
    await expect(page.getByTestId("historial-sesiones-container")).toBeVisible({ timeout: 25_000 });

    let shouldFail = true;
    await page.route("**/rest/v1/planes_entrenamiento*", async (route) => {
      if (shouldFail) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "Server error" }),
        });
        return;
      }
      await route.continue();
    });

    await page.getByRole("link", { name: "Entrenar", exact: true }).click({ position: { x: 64, y: 16 } });
    await expect(page.getByTestId("inicio-error")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Todavía no tenés un plan")).toHaveCount(0);

    shouldFail = false;
    await page.getByTestId("reintentar-plan-btn").click();
    await expect(page.getByTestId("inicio-mis-dias-container")).toBeVisible({ timeout: 15_000 });
  });
});
