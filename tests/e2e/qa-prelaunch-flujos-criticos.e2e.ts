import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// GOZS-806 · Red de seguridad pre-lanzamiento (Go/No-go 4/12). Fixtures sintéticos, cero PII.
// No duplica athlete-v7-funcional (F-10b molestia offline, F-00 serie online) ni fidelidad (banner superserie).
const STUB_URL = process.env.E2E_STUB_URL ?? "http://localhost:54321";
const APP_URL = process.env.E2E_APP_URL ?? "http://localhost:3100";

const FIXTURE_BASE = JSON.parse(
  readFileSync(join(process.cwd(), "tests", "e2e", "fixtures", "athlete-v7.json"), "utf8"),
);
const USER = FIXTURE_BASE.user;
const EJ_SQ = FIXTURE_BASE.ejercicios_en_rutina[0].id as string;
const EJ_SQ_CATALOG_ID = FIXTURE_BASE.ejercicios_en_rutina[0].ejercicio_id as string;
const EJ_BP = FIXTURE_BASE.ejercicios_en_rutina[1].id as string;
const EJ_RM = FIXTURE_BASE.ejercicios_en_rutina[2].id as string;
const SESION_FIJA_ID = "aaaaaaaa-1111-4111-8111-111111111101";
const STORE_KEY = `gozster-athlete-store:${USER.id}`;

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

async function prepararEntorno(page: Page) {
  await page.request.put(`${STUB_URL}/__e2e/fixtures`, { data: structuredClone(FIXTURE_BASE) });
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
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date("2026-11-17T10:00:00-03:00"));

  const store = JSON.stringify({
    state: {
      onboardingCompletado: true,
      mostrarTimerDescanso: true,
      nivelVistaAlumno: "TECNICA",
      vistaElegidaPorAlumno: "TECNICA",
      membershipStatus: "ACTIVE",
      currentSession: {
        id: SESION_FIJA_ID,
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
    ({ key, json }) => {
      // Solo en la primera carga: page.reload() debe probar persistencia real.
      if (!window.localStorage.getItem("__e2e_seeded")) {
        window.localStorage.setItem("__e2e_seeded", "1");
        window.localStorage.setItem(key, json);
      }
    },
    { key: STORE_KEY, json: store },
  );
}

async function entrarARutina(page: Page) {
  await page.goto("/athlete");
  await expect(page.getByTestId("empezar-dia-btn")).toBeVisible({ timeout: 25_000 });
  await page.getByTestId("empezar-dia-btn").click();
  await expect(page.getByTestId("live-workout-container")).toBeVisible({ timeout: 15_000 });
}

async function abrirEjercicio(page: Page, ejId: string) {
  await page.getByTestId(`exercise-select-btn-${ejId}`).click();
  await expect(page.getByTestId("registrar-serie-btn")).toBeVisible({ timeout: 15_000 });
}

async function omitirDescansoSiVisible(page: Page) {
  const omitir = page.getByRole("button", { name: "Omitir" });
  if (await omitir.isVisible().catch(() => false)) await omitir.click();
}

async function seriesEnStub(page: Page, sesionId: string) {
  const res = await page.request.get(`${STUB_URL}/rest/v1/registro_series?sesion_id=eq.${sesionId}`);
  return (await res.json()) as Array<{ ejercicio_id: string; numero_serie: number }>;
}

async function sesionIdActual(page: Page): Promise<string> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return (JSON.parse(raw ?? "{}") as { state?: { currentSession?: { id?: string } } }).state?.currentSession
      ?.id as string;
  }, STORE_KEY);
}

test.describe("@mobile QA pre-lanzamiento · flujos críticos (GOZS-806)", () => {
  test.afterEach(async ({ context, request }) => {
    await context.setOffline(false).catch(() => {});
    await request.delete(`${STUB_URL}/__e2e/fixtures`).catch(() => {});
  });

  test("P-01: sin señal registra peso/reps/RPE, persiste y al volver sincroniza sin duplicar", async ({ page }) => {
    await prepararEntorno(page);
    await entrarARutina(page);
    await abrirEjercicio(page, EJ_SQ);
    const sesionId = await sesionIdActual(page);

    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    await page.getByTestId("peso-increment-btn").click();
    await page.getByTestId("reps-increment-btn").click();
    const rpe8 = page.getByRole("group", { name: "Tu RPE" }).getByRole("button", { name: "8", exact: true });
    await rpe8.click();
    await expect(rpe8).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("registrar-serie-btn").click();
    await expect(page.getByTestId(`log-row-${EJ_SQ}-1`)).toBeVisible();

    // Cola local: la serie quedó guardada en el teléfono y nada llegó al servidor.
    const almacenado = await page.evaluate((key) => window.localStorage.getItem(key) ?? "", STORE_KEY);
    expect(almacenado).toContain('"completada":true');
    expect(await seriesEnStub(page, sesionId)).toHaveLength(0);

    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect.poll(async () => (await seriesEnStub(page, sesionId)).length, { timeout: 20_000 }).toBe(1);

    // Recarga ya online: la serie sigue y no se re-envía.
    await page.reload();
    await expect(page.getByTestId("empezar-dia-btn")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("empezar-dia-btn").click();
    await abrirEjercicio(page, EJ_SQ);
    await expect(page.getByTestId(`log-row-${EJ_SQ}-1`)).toBeVisible();
    await page.waitForTimeout(1500);
    const finales = await seriesEnStub(page, sesionId);
    expect(finales).toHaveLength(1);
    expect(finales[0]!.ejercicio_id).toBe(EJ_SQ_CATALOG_ID);
    expect(finales[0]!.numero_serie).toBe(1);
  });

  test("P-02: cronómetro de descanso corre, ajusta y se cierra sin bloquear la serie siguiente", async ({ page }) => {
    await prepararEntorno(page);
    await entrarARutina(page);
    await abrirEjercicio(page, EJ_SQ);

    await page.getByTestId("registrar-serie-btn").click();
    const banner = page.getByTestId("rest-timer-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute("role", "timer");
    await expect(banner).toContainText("Serie 1");
    await expect(banner).toContainText("Descanso");

    const total = banner.locator("small").filter({ hasText: /^de / });
    const antes = (await total.textContent()) ?? "";
    await page.getByRole("button", { name: "Sumar 30 segundos" }).click();
    await expect.poll(async () => (await total.textContent()) ?? "").not.toBe(antes);

    await page.getByRole("button", { name: "Pausar descanso" }).click();
    await expect(banner).toContainText("Pausado");
    await page.getByRole("button", { name: "Reanudar descanso" }).click();
    await expect(banner).toContainText("Descanso");

    // Con el descanso activo se puede registrar la serie 2.
    await page.getByTestId("registrar-serie-btn").click();
    await expect(page.getByTestId(`log-row-${EJ_SQ}-2`)).toBeVisible();

    await page.getByRole("button", { name: "Omitir" }).click();
    await expect(banner).toBeHidden();
    await expect(page.getByTestId("registrar-serie-btn")).toBeEnabled();
  });

  test("P-03: superserie se muestra agrupada y registra series de cada ejercicio por separado", async ({ page }) => {
    await prepararEntorno(page);
    await entrarARutina(page);

    const grupo = page.getByTestId("superserie-grupo-1");
    await expect(grupo).toBeVisible();
    await expect(grupo).toContainText("sin descanso entre ejercicios");
    await expect(grupo.getByTestId(`exercise-select-btn-${EJ_BP}`)).toBeVisible();
    await expect(grupo.getByTestId(`exercise-select-btn-${EJ_RM}`)).toBeVisible();
    await expect(grupo.getByTestId(`exercise-select-btn-${EJ_SQ}`)).toHaveCount(0);
    await expect(page.getByTestId(`exercise-select-btn-${EJ_SQ}`)).toBeVisible();
    await expect(grupo).toContainText("0/3");

    await abrirEjercicio(page, EJ_BP);
    await expect(page.getByTestId("superserie-circuit-banner")).toBeVisible();
    await page.getByTestId("registrar-serie-btn").click();

    // El circuito pasa solo al siguiente ejercicio del grupo, sin descanso entre ejercicios.
    await expect(page.getByTestId(`single-exercise-container-${EJ_RM}`)).toBeVisible();
    await expect(page.getByTestId("rest-timer-banner")).toHaveCount(0);
    await expect(page.getByTestId(`log-row-${EJ_RM}-1`)).toHaveCount(0);

    await page.getByTestId("registrar-serie-btn").click();
    // Cierra la ronda 1: vuelve al primer ejercicio del grupo, ahora en su serie 2.
    await expect(page.getByTestId(`single-exercise-container-${EJ_BP}`)).toBeVisible();
    await expect(page.getByTestId("registrar-serie-btn")).toContainText("Registrar serie 2");
    await expect(page.getByTestId(`log-row-${EJ_BP}-1`)).toBeVisible();
    await omitirDescansoSiVisible(page);

    // Ronda completa: el grupo avanza a 1/3 y cada ejercicio conserva su propia serie 1.
    await page.getByTestId("volver-a-rutina-btn").click();
    await expect(page.getByTestId("superserie-grupo-1")).toContainText("1/3");
    await abrirEjercicio(page, EJ_RM);
    await expect(page.getByTestId(`log-row-${EJ_RM}-1`)).toBeVisible();
  });

  test("P-04: molestia intensa genera alerta al coach vinculada al reporte y sin datos demo", async ({ page }) => {
    await prepararEntorno(page);
    await entrarARutina(page);
    await abrirEjercicio(page, EJ_BP);
    const sesionId = await sesionIdActual(page);

    await page.getByTestId(`exercise-pain-report-btn-${EJ_BP}`).click();
    await expect(page.getByTestId("pain-report-modal")).toBeVisible();
    await page.getByTestId("zona-btn-hombro").click();
    await page.getByTestId("intensity-chip-8").click();
    await page.getByTestId("submit-pain-report-btn").click();
    await expect(page.getByTestId("pain-report-modal")).toBeHidden();

    let reporteId = "";
    await expect
      .poll(async () => {
        const res = await page.request.get(`${STUB_URL}/rest/v1/alumno_historial_dolor?sesion_id=eq.${sesionId}`);
        const rows = (await res.json()) as Array<{ id: string }>;
        reporteId = rows[0]?.id ?? "";
        return rows.length;
      })
      .toBe(1);

    const alertasRes = await page.request.get(
      `${STUB_URL}/rest/v1/alertas_entrenador?reporte_dolor_id=eq.${reporteId}`,
    );
    const alertas = (await alertasRes.json()) as Array<{ alumno_id: string; estado: string }>;
    expect(alertas).toHaveLength(1);
    expect(alertas[0]!.alumno_id).toBe(USER.id);
    expect(alertas[0]!.estado).toBe("PENDIENTE");

    // Persiste tras recargar y la UI no se contamina con literales demo.
    await page.reload();
    await expect(page.getByTestId("empezar-dia-btn")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("empezar-dia-btn").click();
    await expect(page.getByTestId(`molestia-chip-${EJ_BP}`)).toBeVisible();
    const texto = (await page.locator("body").innerText()).toLowerCase();
    expect(texto).not.toContain("mynter");
  });
});
