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

async function prepararInicio(page: Page) {
  await page.request.put(`${STUB_URL}/__e2e/fixtures`, { data: FIXTURE_BASE });
  await page.context().addCookies([
    {
      name: "sb-localhost-auth-token",
      value: `base64-${b64url(buildSessionCookie())}`,
      url: "http://localhost:3100",
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
}

test.describe("@mobile Athlete v7 · FE-10 Focus trap del chat", () => {
  test.afterAll(async ({ request }) => {
    await request.delete(`${STUB_URL}/__e2e/fixtures`).catch(() => {});
  });

  test("foco inicial al título, ciclo Tab/Shift+Tab contenido en #athlete-chat-drawer, Escape cierra y vuelve a athlete-chat-fab", async ({
    page,
  }) => {
    await prepararInicio(page);
    await page.goto("/athlete");
    await expect(page.getByTestId("inicio-mis-dias-container")).toBeVisible({ timeout: 25_000 });

    const fab = page.getByTestId("athlete-chat-fab");
    await expect(fab).toBeVisible();
    await fab.focus();
    await fab.click();

    const drawer = page.locator("#athlete-chat-drawer");
    await expect(drawer).toBeVisible();
    await expect(page.locator("#athlete-chat-title")).toBeFocused();

    // Shift+Tab desde el título inicial debe envolver al último control del drawer (Enviar)
    await page.keyboard.press("Shift+Tab");
    const sendBtn = drawer.getByRole("button", { name: "Enviar" });
    await expect(sendBtn).toBeFocused();

    // Tab desde Enviar debe envolver al primer control del drawer (Cerrar chat)
    await page.keyboard.press("Tab");
    const closeBtn = drawer.getByRole("button", { name: "Cerrar chat" });
    await expect(closeBtn).toBeFocused();

    // Shift+Tab desde el primer control vuelve a Enviar sin escapar al fondo
    await page.keyboard.press("Shift+Tab");
    await expect(sendBtn).toBeFocused();

    // Recorrido completo con Tab: cada paso permanece dentro de #athlete-chat-drawer
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      const isInside = await page.evaluate(() => {
        const d = document.getElementById("athlete-chat-drawer");
        return Boolean(d && d.contains(document.activeElement));
      });
      expect(isInside, `El foco escapó de #athlete-chat-drawer en Tab #${i + 1}`).toBe(true);
    }

    // Escape cierra la hoja y devuelve el foco a athlete-chat-fab
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(fab).toBeFocused();
  });
});
