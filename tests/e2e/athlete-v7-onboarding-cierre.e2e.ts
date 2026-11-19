import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const STUB_URL = process.env.E2E_STUB_URL || "http://localhost:54321";
const APP_URL = process.env.E2E_APP_URL || "http://localhost:3100";
const FIXTURE_BASE = JSON.parse(
  readFileSync(join(process.cwd(), "tests", "e2e", "fixtures", "athlete-v7.json"), "utf8"),
);
const LUCIA_ID: string = FIXTURE_BASE.user.id;
const EJ_SQ = FIXTURE_BASE.ejercicios_en_rutina[0].id as string;
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

async function prepararOnboarding(page: Page) {
  await page.request.put(`${STUB_URL}/__e2e/fixtures`, { data: FIXTURE_BASE });
  await page.context().addCookies([
    {
      name: "sb-localhost-auth-token",
      value: `base64-${b64url(buildSessionCookie())}`,
      url: APP_URL,
    },
  ]);
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date("2026-11-17T10:00:00-03:00"));

  const storeSeed = {
    state: {
      onboardingCompletado: false,
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
    ({ userId, storeJson }) => {
      window.localStorage.setItem("gozster-theme", "light");
      window.localStorage.setItem(`gozster-athlete-store:${userId}`, storeJson);
    },
    { userId: LUCIA_ID, storeJson: JSON.stringify(storeSeed) },
  );
}

test.describe("@mobile Athlete v7 · FE-11 Onboarding de 4 pasos y cierre", () => {
  test.afterAll(async ({ request }) => {
    await request.delete(`${STUB_URL}/__e2e/fixtures`).catch(() => {});
  });

  test("recorre los 4 pasos, guarda nombre preferido y no desborda a 360px", async ({
    page,
    request,
  }) => {
    await prepararOnboarding(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/athlete");

    const dlg = page.getByRole("dialog", { name: "Bienvenida a GOZSter" });
    await expect(dlg).toBeVisible({ timeout: 25_000 });
    await expect(dlg.getByText("Paso 1 de 4")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
      false,
    );

    await dlg.getByRole("button", { name: "Empezar" }).click();
    await expect(dlg.getByTestId("onboarding-paso-nombre")).toBeVisible();
    await expect(dlg.getByText("Paso 2 de 4")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
      false,
    );

    const input = dlg.getByLabel("Nombre o apodo");
    await input.fill("Lu");
    await dlg.getByRole("button", { name: "Continuar" }).click();

    await expect(dlg.getByText("Paso 3 de 4")).toBeVisible();
    await dlg.getByRole("button", { name: /Técnica/ }).click();
    await dlg.getByRole("button", { name: "Continuar con Técnica" }).click();

    await expect(dlg.getByText("Paso 4 de 4")).toBeVisible();
    await dlg.getByRole("button", { name: /No, voy a mi ritmo/ }).click();
    await dlg.getByRole("button", { name: "Listo, ver mis días" }).click();

    await expect(page.getByTestId("inicio-mis-dias-container")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Hola, Lu")).toBeVisible();

    const callsRes = await request.get(`${STUB_URL}/__llamadas`);
    const { llamadas } = (await callsRes.json()) as {
      llamadas: Array<{ path: string; body?: { p_nombre?: string } }>;
    };
    const rpcCall = llamadas.find((c) => c.path.includes("actualizar_nombre_preferido"));
    expect(rpcCall?.body?.p_nombre).toBe("Lu");
  });

  test("cierre muestra pantalla oscura sin ranking y al volver al inicio navega a Historial con toast-sesion", async ({
    page,
  }) => {
    await page.request.put(`${STUB_URL}/__e2e/fixtures`, { data: FIXTURE_BASE });
    await page.context().addCookies([
      {
        name: "sb-localhost-auth-token",
        value: `base64-${b64url(buildSessionCookie())}`,
        url: APP_URL,
      },
    ]);
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
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
      ({ userId, storeJson }) => {
        window.localStorage.setItem("gozster-theme", "light");
        window.localStorage.setItem(`gozster-athlete-store:${userId}`, storeJson);
      },
      { userId: LUCIA_ID, storeJson: JSON.stringify(storeSeed) },
    );

    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/athlete");
    await expect(page.getByTestId("empezar-dia-btn")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("empezar-dia-btn").click();
    await page.getByTestId(`exercise-select-btn-${EJ_SQ}`).click();
    await expect(page.getByTestId("registrar-serie-btn")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("registrar-serie-btn").click();
    const omitir = page.getByRole("button", { name: "Omitir" });
    if (await omitir.isVisible().catch(() => false)) await omitir.click();
    await page.getByTestId("volver-a-rutina-btn").click();

    await page.getByTestId("tab-registro-dia").click();
    await page.getByTestId("terminar-entrenamiento-btn").click();

    await expect(page.getByTestId("cierre-dia-modal")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("cierre-dia-ranking-constancia")).toHaveCount(0);
    await expect(page.getByTestId("cierre-dia-estado-chip")).toContainText("Guardada y sincronizada");
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
      false,
    );

    await page.getByTestId("cierre-dia-volver-athlete-btn").click();
    await expect(page.getByTestId("historial-sesiones-container")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("toast-sesion")).toContainText("Sesión guardada en tu historial");
  });
});
