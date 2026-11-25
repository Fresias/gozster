import { expect, test, type Page } from "@playwright/test";
import {
  DEMO_ALUMNOS,
  DEMO_ALUMNOS_CLASES,
  DEMO_COACH_LUCIA,
  DEMO_GIMNASIO,
} from "@/services/coach-demo-dataset";
import { FORBIDDEN_DEMO_LITERALS } from "@/test-utils/no-demo-literals";

/**
 * GOZS-709 / GOZS-805 (G5, regresión permanente): con una base vacía (solo staff ADMIN dual,
 * sin alumnos), ninguna pantalla del Studio ni la app del alumno muestra datos demo.
 */

const STUB_URL = process.env.E2E_STUB_URL ?? "http://localhost:54321";
const APP_URL = process.env.E2E_APP_URL ?? "http://localhost:3100";
const ADMIN_ID = "00000000-0000-4000-8000-000000000001";

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const SESSION_COOKIE = {
  access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({
    sub: ADMIN_ID,
    exp: 4102444800,
    role: "authenticated",
  })}.sig`,
  refresh_token: "e2e-refresh",
  expires_at: 4102444800,
  expires_in: 3600,
  token_type: "bearer",
  user: {
    id: ADMIN_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "coach-e2e@gozster.test",
    app_metadata: { rol: "ADMIN" },
    user_metadata: {},
  },
};

const NOMBRES_DEMO = Array.from(
  new Set(
    [...DEMO_ALUMNOS, ...DEMO_ALUMNOS_CLASES, ...DEMO_GIMNASIO.alumnos, DEMO_COACH_LUCIA]
      .map((p) => p.nombre_completo)
      .filter((n): n is string => typeof n === "string" && n.length > 0)
  )
);
// Cifras demo conocidas de Cobros / Ingresos / Inicio (GOZS-685).
const CIFRAS_DEMO = ["$767.000", "$105.000", "$215.000", "$995.000", "$195.000"];
const PROHIBIDOS = [...FORBIDDEN_DEMO_LITERALS, ...NOMBRES_DEMO, ...CIFRAS_DEMO, "demo-alumno-"];

const RUTAS_STUDIO = [
  "/studio",
  "/studio/dashboard",
  "/studio/agenda",
  "/studio/cobros",
  "/studio/ingresos",
  "/studio/metricas",
  "/studio/ranking-funcional",
  "/studio/rutinas",
  "/studio/auditoria",
];

async function prepararBaseVaciaSoloStaff(page: Page) {
  // Base vacía: solo el perfil del staff (ADMIN dual con profesor_asignado_id a sí mismo).
  const res = await page.request.put(`${STUB_URL}/__e2e/fixtures`, {
    data: {
      rol: "ADMIN",
      perfil: { nombre_completo: "Staff E2E", profesor_asignado_id: ADMIN_ID },
    },
  });
  expect(res.ok()).toBe(true);
  await page.context().addCookies([
    {
      name: "sb-localhost-auth-token",
      value: `base64-${b64url(SESSION_COOKIE)}`,
      url: APP_URL,
    },
  ]);
}

async function textoDePantalla(page: Page): Promise<string> {
  await page.waitForLoadState("networkidle").catch(() => {});
  return `${await page.locator("body").innerText()}\n${await page.content()}`;
}

test.describe("GOZS-709 · G5: base vacía sin datos demo", () => {
  test.afterEach(async ({ request }) => {
    await request.delete(`${STUB_URL}/__e2e/fixtures`).catch(() => {});
  });

  for (const ruta of RUTAS_STUDIO) {
    test(`${ruta} con base vacía no muestra datos demo`, async ({ page }) => {
      await prepararBaseVaciaSoloStaff(page);
      const resp = await page.goto(ruta);
      expect(resp?.status(), `HTTP ${ruta}`).toBeLessThan(400);
      await expect(page).toHaveURL(new RegExp(`${ruta.replace(/\//g, "\\/")}(\\?|$)`));
      await expect(page.locator("main, [data-testid]").first()).toBeVisible({ timeout: 45_000 });
      const txt = await textoDePantalla(page);
      const filtrados = PROHIBIDOS.filter((lit) => txt.includes(lit));
      expect(filtrados, `Literales demo en ${ruta}`).toEqual([]);
      expect(txt).not.toMatch(/\bNaN\b|\[object Object\]/);
    });
  }

  test("/athlete (ADMIN dual) con base vacía no muestra datos demo", async ({ page }) => {
    await prepararBaseVaciaSoloStaff(page);
    const resp = await page.goto("/athlete");
    expect(resp?.status()).toBeLessThan(400);
    await expect(page.locator("body")).toBeVisible();
    const txt = await textoDePantalla(page);
    expect(PROHIBIDOS.filter((lit) => txt.includes(lit))).toEqual([]);
  });
});
