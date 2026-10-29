import { expect, test, type Page } from "@playwright/test";

// Sesión falsa aceptada por el stub: cookie sb-<host>-auth-token que lee @supabase/ssr.
const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const session = {
  access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: "00000000-0000-4000-8000-000000000001", exp: 4102444800, role: "authenticated" })}.sig`,
  refresh_token: "e2e-refresh",
  expires_at: 4102444800,
  expires_in: 3600,
  token_type: "bearer",
  user: { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "coach-e2e@gozster.test", app_metadata: {}, user_metadata: {} },
};

async function abrirStudio(page: Page, ruta = "/studio/agenda") {
  await page.context().addCookies([
    { name: "sb-localhost-auth-token", value: `base64-${b64url(session)}`, url: "http://localhost:3100" },
  ]);
  await page.goto(ruta);
  if (ruta === "/studio/agenda") await expect(page.getByTestId("class-agenda")).toBeVisible({ timeout: 60_000 });
}

// El aria-label de cada bloque trae "<Actividad>, <hora>, <n> de <cap> cupos[, Cancelada]".
const bloques = (page: Page, nombre: string, hora: string) =>
  page.getByTestId("class-block-card").and(page.locator(`[aria-label^="${nombre}, ${hora},"]`));

test.describe("Agenda", () => {
  test("vista Semana muestra el horario del seed", async ({ page }) => {
    await abrirStudio(page);
    await page.getByTestId("view-week-btn").click();
    await expect(page.getByTestId("demo-coach-badge")).toBeVisible();

    await expect(bloques(page, "Funcional", "18:00")).toHaveCount(5);
    await expect(bloques(page, "Funcional", "17:00")).toHaveCount(2);
    await expect(bloques(page, "Boxeo", "19:30")).toHaveCount(3);
    await expect(page.getByTestId("class-block-card")).toHaveCount(10);
    // Clase cancelada del viernes
    await expect(page.getByTestId("class-block-card").filter({ hasText: "Cancelada" })).toHaveCount(1);
  });

  test("día actual resaltado en la cabecera de la semana", async ({ page }) => {
    await abrirStudio(page);
    await page.getByTestId("view-week-btn").click();
    const pill = page.locator("span.font-mono.bg-primary.text-primary-foreground").first();
    await expect(pill).toBeVisible();
    await expect(pill).toHaveText(String(new Date().getDate()));
  });

  test("stats del panel visibles con datos del seed", async ({ page }) => {
    await abrirStudio(page, "/studio");
    await expect(page.getByTestId("business-kpi-strip")).toBeVisible();
    await expect(page.getByTestId("kpi-ingresos")).toBeVisible();
    await expect(page.getByTestId("kpi-activos")).toBeVisible();
  });

  test("detalle de clase lista anotados y estados del seed", async ({ page }) => {
    await abrirStudio(page);
    await page.getByTestId("view-week-btn").click();
    await bloques(page, "Funcional", "18:00").nth(2).click(); // miércoles: llena + 2 en espera
    await expect(page.getByTestId("class-detail")).toBeVisible();
    await expect(page.getByTestId("student-row").first()).toBeVisible();
    await expect(page.getByTestId("class-detail")).toContainText("Camila Navarro");
  });

  test("selector Anotar alumno sigue listando los alumnos del seed", async ({ page }) => {
    await abrirStudio(page);
    await page.getByTestId("view-week-btn").click();
    await bloques(page, "Funcional", "18:00").first().click();
    await expect(page.getByTestId("class-detail")).toBeVisible();
    await page.getByTestId("enroll-student-dialog-btn").click();
    await expect(page.getByTestId("enroll-student-dialog")).toBeVisible();
    const select = page.getByTestId("enroll-student-select");
    await expect(select).toBeVisible();
    await expect(select.locator("option")).not.toHaveCount(0);
    await expect(select).toContainText("Camila Navarro");
  });

  test("@mobile vista móvil: la agenda carga sin desborde horizontal de la página", async ({ page }) => {
    await abrirStudio(page);
    await expect(page.getByTestId("class-agenda")).toBeVisible();
    await expect(page.getByTestId("class-block-card").first()).toBeVisible();
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(desborde).toBeLessThanOrEqual(1);
  });
});

