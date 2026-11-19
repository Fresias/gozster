import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const STUB_URL = "http://localhost:54321";
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

async function prepararShell(page: Page, tema: "light" | "dark") {
  await page.request.put(`${STUB_URL}/__e2e/fixtures`, { data: FIXTURE_BASE });
  await page.context().addCookies([
    {
      name: "sb-localhost-auth-token",
      value: `base64-${b64url(buildSessionCookie())}`,
      url: "http://localhost:3100",
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

test.describe("@mobile Athlete v7 · FE-02 Shell móvil", () => {
  test.afterAll(async ({ request }) => {
    await request.delete(`${STUB_URL}/__e2e/fixtures`).catch(() => {});
  });

  test("alterna tema, muestra FAB solo en Entrenar, oculta nav en rutina y no desborda a 360px", async ({
    page,
  }) => {
    await prepararShell(page, "light");
    await page.goto("/athlete");
    await expect(page.getByTestId("inicio-mis-dias-container")).toBeVisible({ timeout: 25_000 });

    // Header + tema + chip Online + nav + FAB visibles en /athlete
    await expect(page.getByTestId("chip-red")).toHaveText("Online");
    await expect(page.getByTestId("nav-inferior")).toBeVisible();
    await expect(page.getByTestId("athlete-chat-fab")).toBeVisible();

    const themeBtn = page.getByTestId("theme-toggle");
    await expect(themeBtn).toHaveAttribute("aria-label", "Usar tema oscuro");
    await themeBtn.click();
    await expect(themeBtn).toHaveAttribute("aria-label", "Usar tema claro");

    // Sin desborde horizontal a 360px
    await page.setViewportSize({ width: 360, height: 800 });
    const overflow360 = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow360).toBe(false);
    await page.setViewportSize({ width: 390, height: 844 });

    // En /athlete/historial se mantiene la nav pero se oculta el FAB de chat
    await page.getByTestId("nav-inferior").getByRole("link", { name: "Historial" }).click();
    await expect(page.getByTestId("historial-sesiones-container")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("nav-inferior")).toBeVisible();
    await expect(page.getByTestId("athlete-chat-fab")).toBeHidden();

    // Volver a Entrenar y entrar a Rutina: se ocultan nav y FAB
    await page
      .getByTestId("nav-inferior")
      .getByRole("link", { name: "Entrenar" })
      .click({ position: { x: 64, y: 16 } });
    await expect(page.getByTestId("empezar-dia-btn")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("empezar-dia-btn").click();
    await expect(page.getByTestId("live-workout-container")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("nav-inferior")).toBeHidden();
    await expect(page.getByTestId("athlete-chat-fab")).toBeHidden();
  });
});

test.describe("Athlete v7 · FE-02 Shell escritorio (28rem centrado)", () => {
  test.afterAll(async ({ request }) => {
    await request.delete(`${STUB_URL}/__e2e/fixtures`).catch(() => {});
  });

  test("en 1440px centra columna y nav inferior a max-width 28rem (448px)", async ({ page }) => {
    await prepararShell(page, "light");
    await page.goto("/athlete");
    await expect(page.getByTestId("inicio-mis-dias-container")).toBeVisible({ timeout: 25_000 });

    const medidas = await page.evaluate(() => {
      const scroll = document.querySelector(".a-scroll") as HTMLElement;
      const bnav = document.querySelector("[data-testid='nav-inferior']") as HTMLElement;
      const sRect = scroll.getBoundingClientRect();
      const bRect = bnav.getBoundingClientRect();
      return {
        scrollW: sRect.width,
        scrollLeft: sRect.left,
        bnavW: bRect.width,
        bnavLeft: bRect.left,
        docOverflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });

    expect(medidas.docOverflow).toBe(false);
    expect(medidas.scrollW).toBeLessThanOrEqual(448.5);
    expect(medidas.bnavW).toBeLessThanOrEqual(448.5);
    expect(medidas.scrollLeft).toBeGreaterThan(400);
    expect(medidas.bnavLeft).toBeGreaterThan(400);
  });
});
