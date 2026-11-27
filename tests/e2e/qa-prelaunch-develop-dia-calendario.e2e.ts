import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// GOZS-913 · Suite permanente del ciclo de día calendario AR (fix GOZS-908 / PR #721):
// tras entrenar hoy el héroe pasa a "Próximo entrenamiento" (+ "Entrenaste hoy"), al día calendario
// siguiente (America/Argentina/Buenos_Aires) vuelve a "Te toca hoy", la elección manual de día expira
// y la semana completa se muestra sin errores. Mobile 390×844, Claro y Oscuro, reloj controlado con
// page.clock. Stub local y fixture sintético (G4); no toca src/ ni el stub.
const STUB_URL = process.env.E2E_STUB_URL ?? "http://localhost:54321";
const APP_URL = process.env.E2E_APP_URL ?? "http://localhost:3100";

type Fila = Record<string, unknown>;
type Fixture = { user: { id: string; email?: string }; dias_rutina: Fila[]; ejercicios_en_rutina: Fila[]; registro_sesiones?: Fila[]; [k: string]: unknown };

const FIXTURE_BASE: Fixture = JSON.parse(
  readFileSync(join(process.cwd(), "tests", "e2e", "fixtures", "athlete-v7.json"), "utf8"),
);
const USER = FIXTURE_BASE.user;
const EJ_SQ = FIXTURE_BASE.ejercicios_en_rutina[0]!.id as string;
const [DIA1, DIA2, DIA3] = FIXTURE_BASE.dias_rutina.map((d) => d.id as string) as [string, string, string];
const SESION_ID = "aaaaaaaa-1111-4111-8111-111111111913";
const STORE_KEY = `gozster-athlete-store:${USER.id}`;

// Martes 17/11/2026 10:00 AR → 23:30 AR → 00:15 AR del miércoles 18/11 (misma semana ISO).
const HOY = "2026-11-17T10:00:00-03:00";
const NOCHE = "2026-11-17T23:30:00-03:00";
const MADRUGADA = "2026-11-18T00:15:00-03:00";

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

type Tema = "light" | "dark";

async function preparar(page: Page, tema: Tema, opts: { sesiones?: Fila[] } = {}) {
  const fixture = structuredClone(FIXTURE_BASE);
  if (opts.sesiones) fixture.registro_sesiones = [...(fixture.registro_sesiones ?? []), ...opts.sesiones];
  await page.request.put(`${STUB_URL}/__e2e/fixtures`, { data: fixture });
  const session = {
    access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({
      sub: USER.id,
      exp: 4102444800,
      role: "authenticated",
    })}.sig`,
    refresh_token: "e2e-refresh",
    expires_at: 4102444800,
    expires_in: 3600,
    token_type: "bearer",
    user: USER,
  };
  await page.context().addCookies([
    { name: "sb-localhost-auth-token", value: `base64-${b64url(session)}`, url: APP_URL },
  ]);
  await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date(HOY));
  const store = JSON.stringify({
    state: {
      onboardingCompletado: true,
      mostrarTimerDescanso: true,
      nivelVistaAlumno: "SIMPLE",
      membershipStatus: "ACTIVE",
      currentSession: {
        id: SESION_ID,
        nombre_rutina: "Alumno Sintético: DÍA 1",
        fecha: "2026-11-17",
        ejercicios: [],
        studentId: USER.id,
        studentName: "Alumno Sintético",
      },
    },
    version: 2,
  });
  await page.addInitScript(
    ({ theme, key, json }) => {
      window.localStorage.setItem("gozster-theme", theme);
      if (!window.localStorage.getItem("__e2e_seeded")) {
        window.localStorage.setItem("__e2e_seeded", "1");
        window.localStorage.setItem(key, json);
      }
    },
    { theme: tema, key: STORE_KEY, json: store },
  );
}

/** Entra a Día 1, completa 1 serie, termina y vuelve a Inicio. */
async function entrenarDia1YVolver(page: Page) {
  await page.goto("/athlete");
  await expect(page.getByTestId("empezar-dia-btn")).toBeVisible({ timeout: 25_000 });
  await page.getByTestId("empezar-dia-btn").click();
  await expect(page.getByTestId("live-workout-container")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId(`exercise-select-btn-${EJ_SQ}`).click();
  await expect(page.getByTestId("registrar-serie-btn")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("registrar-serie-btn").click();
  const omitir = page.getByRole("button", { name: "Omitir" });
  if (await omitir.isVisible().catch(() => false)) await omitir.click();
  await page.getByTestId("volver-a-rutina-btn").click();
  await page.getByTestId("tab-registro-dia").click();
  await page.getByTestId("terminar-entrenamiento-btn").click();
  await expect(page.getByTestId("cierre-dia-modal")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("cierre-dia-estado-chip")).toHaveAttribute("data-estado", "lista", { timeout: 10_000 });
  await page.getByTestId("cierre-dia-volver-athlete-btn").click();
  await expect(page.getByTestId("cierre-dia-modal")).toHaveCount(0);
  // La app navega sola a Historial tras guardar: volver a Inicio por la barra inferior.
  await page.waitForURL(/\/athlete\/historial/, { timeout: 15_000 });
  await page.getByTestId("nav-inferior").locator('a[href="/athlete"]').dispatchEvent("click"); // el overlay de Next dev intercepta el puntero
  await expect(page.getByTestId("heroe-te-toca-hoy")).toBeVisible({ timeout: 15_000 });
}

/** Mueve el reloj y simula el regreso de la PWA a primer plano. */
async function avanzarA(page: Page, iso: string) {
  await page.clock.setFixedTime(new Date(iso));
  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
}

const heroe = (page: Page) => page.getByTestId("heroe-te-toca-hoy");
const fila = (page: Page, id: string) => page.getByTestId(`dia-row-${id}`);

async function sinDesborde(page: Page) {
  const { scroll, ancho } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    ancho: window.innerWidth,
  }));
  expect(scroll).toBeLessThanOrEqual(ancho);
}

/** G4/G5: sin correos ajenos al fixture sintético ni literales demo en DOM y localStorage. */
async function sinPII(page: Page) {
  const { dom, ls } = await page.evaluate(() => ({
    dom: document.body.innerText,
    ls: JSON.stringify(Object.fromEntries(Object.entries(window.localStorage))),
  }));
  for (const texto of [dom, ls]) {
    const correos = (texto.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? []).filter((c) => c !== USER.email);
    expect(correos, "sin correos de terceros (G4)").toEqual([]);
    expect(texto).not.toMatch(/mynter/i);
  }
}

function vigilarErrores(page: Page): string[] {
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));
  return errores;
}

const sesionSintetica = (id: string, dia: string, fecha: string): Fila => ({
  id,
  alumno_id: USER.id,
  dia_id: dia,
  fecha,
  estado: "COMPLETADA",
  duracion_minutos: 45,
  volumen_total_kg: 1000,
  effective_volume_kg: 1000,
  motivo_cambio_dia: null,
  dia_sugerido_id: null,
  created_at: fecha,
  updated_at: fecha,
});

for (const tema of ["light", "dark"] as const) {
  test.describe(`@mobile Ciclo día calendario AR · GOZS-913 · tema ${tema}`, () => {
    test(`DC-01 · entrena hoy: Próximo entrenamiento + Entrenaste hoy + sheet (${tema})`, async ({ page }) => {
      const errores = vigilarErrores(page);
      await preparar(page, tema, {});
      await entrenarDia1YVolver(page);

      await expect(heroe(page)).toContainText("Próximo entrenamiento");
      await expect(heroe(page)).not.toContainText("Te toca hoy");
      await expect(page.getByTestId("tag-entrenaste-hoy")).toContainText("Entrenaste hoy");
      await expect(fila(page, DIA1)).toContainText("Hecho hoy");
      await expect(fila(page, DIA2)).toContainText("Próximo día");

      await page.getByTestId("hacer-otro-dia-btn").click();
      await expect(page.getByText("Ya lo hiciste hoy")).toBeVisible();
      await expect(page.getByTestId(`sheet-option-dia-${DIA2}`)).toContainText("Próximo día");

      await sinDesborde(page);
      await sinPII(page);
      expect(errores, "sin pageerror").toEqual([]);
    });

    test(`DC-02 · medianoche AR (23:30 → 00:15) con focus y recarga vuelve a Te toca hoy (${tema})`, async ({ page }) => {
      const errores = vigilarErrores(page);
      await preparar(page, tema, {});
      await entrenarDia1YVolver(page);
      await expect(page.getByTestId("tag-entrenaste-hoy")).toBeVisible();

      // 23:30 AR sigue siendo el mismo día calendario: no cambia nada.
      await avanzarA(page, NOCHE);
      await expect(heroe(page)).toContainText("Próximo entrenamiento");
      await expect(page.getByTestId("tag-entrenaste-hoy")).toBeVisible();

      // 00:15 AR del día siguiente: visibilitychange/focus re-evalúa el héroe.
      await avanzarA(page, MADRUGADA);
      await expect(heroe(page)).toContainText("Te toca hoy");
      await expect(heroe(page)).not.toContainText("Próximo entrenamiento");
      await expect(page.getByTestId("tag-entrenaste-hoy")).toHaveCount(0);
      await expect(fila(page, DIA2)).toContainText("Te toca hoy");
      await expect(fila(page, DIA1)).not.toContainText("Hecho hoy");

      // Recarga en el día siguiente: mismo resultado desde el servidor.
      await page.reload();
      await expect(heroe(page)).toContainText("Te toca hoy", { timeout: 25_000 });
      await expect(page.getByTestId("tag-entrenaste-hoy")).toHaveCount(0);

      await sinDesborde(page);
      await sinPII(page);
      expect(errores, "sin pageerror").toEqual([]);
    });

    test(`DC-03 · la elección manual de día expira al día siguiente (${tema})`, async ({ page }) => {
      const errores = vigilarErrores(page);
      await preparar(page, tema);
      await page.goto("/athlete");
      await expect(page.getByTestId("empezar-dia-btn")).toBeVisible({ timeout: 25_000 });
      await expect(heroe(page)).toContainText("Te toca hoy");

      await page.getByTestId("hacer-otro-dia-btn").click();
      await page.getByTestId(`sheet-option-dia-${DIA3}`).click();
      await page.getByTestId("confirmar-cambio-dia-btn").click();
      await expect(page.getByTestId("tag-cambiaste-dia")).toBeVisible();
      await expect(fila(page, DIA3)).toContainText("Hoy");
      await expect(fila(page, DIA1)).toContainText("Pendiente · te toca el próximo");

      await avanzarA(page, MADRUGADA);
      await expect(page.getByTestId("tag-cambiaste-dia")).toHaveCount(0);
      await expect(heroe(page)).toContainText("Te toca hoy");
      await expect(fila(page, DIA1)).toContainText("Te toca hoy");
      await expect(fila(page, DIA3)).not.toContainText("Hoy");

      await sinPII(page);
      expect(errores, "sin pageerror").toEqual([]);
    });

    test(`DC-04 · semana completa sin errores de consola (${tema})`, async ({ page }) => {
      const errores = vigilarErrores(page);
      await preparar(page, tema, {
        sesiones: [
          sesionSintetica("bbbbbbbb-1111-4111-8111-111111111901", DIA1, "2026-11-16T18:00:00-03:00"),
          sesionSintetica("bbbbbbbb-1111-4111-8111-111111111902", DIA2, "2026-11-16T19:30:00-03:00"),
          sesionSintetica("bbbbbbbb-1111-4111-8111-111111111903", DIA3, "2026-11-17T08:00:00-03:00"),
        ],
      });
      await page.goto("/athlete");
      await expect(page.getByTestId("tag-semana-completa")).toContainText("Semana completa", { timeout: 25_000 });
      await expect(heroe(page)).toContainText("Próximo entrenamiento");
      await expect(fila(page, DIA3)).toContainText("Hecho hoy");

      await sinDesborde(page);
      await sinPII(page);
      expect(errores, "sin pageerror").toEqual([]);
    });
  });
}
