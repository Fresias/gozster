import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// GOZS-865 · Certificación E2E del rediseño PR #695 (GOZS-853): Rutina del Día Opción 4,
// <AnilloProgreso />, Ciclo Unificado de Superserie, Unilateral D/I y molestia discreta.
// Mobile 390×844, Claro y Oscuro. Stub local de Supabase y fixture sintético: cero PII (G4).
const STUB_URL = process.env.E2E_STUB_URL ?? "http://localhost:54321";
const APP_URL = process.env.E2E_APP_URL ?? "http://localhost:3100";

const FIXTURE_BASE = JSON.parse(
  readFileSync(join(process.cwd(), "tests", "e2e", "fixtures", "athlete-v7.json"), "utf8"),
);
const USER = FIXTURE_BASE.user;
type EjFixture = { id: string; dia_id: string; series: number };
const EJERCICIOS = FIXTURE_BASE.ejercicios_en_rutina as EjFixture[];
const DIA_2 = FIXTURE_BASE.dias_rutina[1].id as string;
const EJ_SQ = EJERCICIOS[0]!.id;
const EJ_BP = EJERCICIOS[1]!.id; // superserie grupo 1
const EJ_RM = EJERCICIOS[2]!.id; // superserie grupo 1
const EJ_ZB = EJERCICIOS[6]!.id; // unilateral (Día 2)
const seriesDelDia = (diaId: string) =>
  EJERCICIOS.filter((e) => e.dia_id === diaId).reduce((acc, e) => acc + e.series, 0);
const EJERCICIOS_DIA_1 = EJERCICIOS.filter((e) => e.dia_id === FIXTURE_BASE.dias_rutina[0].id).length;
const SERIES_DIA_1 = seriesDelDia(FIXTURE_BASE.dias_rutina[0].id);
const SERIES_DIA_2 = seriesDelDia(DIA_2);
const SESION_FIJA_ID = "aaaaaaaa-1111-4111-8111-111111111101";
const STORE_KEY = `gozster-athlete-store:${USER.id}`;

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

type Tema = "light" | "dark";

async function prepararEntorno(page: Page, tema: Tema) {
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
  await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date("2026-11-17T10:00:00-03:00"));

  const store = JSON.stringify({
    state: {
      onboardingCompletado: true,
      mostrarTimerDescanso: true,
      nivelVistaAlumno: "SIMPLE",
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

async function entrarARutina(page: Page, dia: 1 | 2 = 1) {
  await page.goto("/athlete");
  await expect(page.getByTestId("empezar-dia-btn")).toBeVisible({ timeout: 25_000 });
  if (dia === 2) {
    await page.getByTestId("hacer-otro-dia-btn").click();
    await page.getByTestId(`sheet-option-dia-${DIA_2}`).click();
    await page.getByTestId("confirmar-cambio-dia-btn").click();
  }
  await page.getByTestId("empezar-dia-btn").click();
  await expect(page.getByTestId("live-workout-container")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("rutina-progress-card")).toBeVisible();
}

async function abrirEjercicio(page: Page, ejId: string) {
  await page.getByTestId(`exercise-select-btn-${ejId}`).click();
  await expect(page.getByTestId("registrar-serie-btn")).toBeVisible({ timeout: 15_000 });
}

async function sinDesborde(page: Page) {
  const { scroll, ancho } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    ancho: window.innerWidth,
  }));
  expect(scroll).toBeLessThanOrEqual(ancho);
}

const pct = (hechas: number, total: number) => Math.round((hechas / total) * 100);

for (const tema of ["light", "dark"] as const) {
  test.describe(`@mobile Rutina M3 · PR #695 · tema ${tema}`, () => {
    test.afterEach(async ({ context, request }) => {
      await context.setOffline(false).catch(() => {});
      await request.delete(`${STUB_URL}/__e2e/fixtures`).catch(() => {});
    });

    test("R-01: cabecera Opción 4 con subtítulo y anillo sin texto interior, sin botón de molestia", async ({ page }) => {
      await prepararEntorno(page, tema);
      await entrarARutina(page);

      const anillo = page.getByTestId("rutina-progress-card");
      await expect(anillo).toHaveAttribute("role", "progressbar");
      await expect(anillo).toHaveAttribute("aria-valuenow", "0");
      await expect(anillo).toHaveAccessibleName("Avance de la sesión");
      await expect(anillo).not.toContainText(/\d+\s*\/\s*\d+/);
      expect(((await anillo.textContent()) ?? "").trim()).toBe("");

      await expect(page.locator(".a-wk-subrow")).toContainText(
        new RegExp(`${EJERCICIOS_DIA_1} ejercicios · ~\\d+ min`),
      );

      await expect(page.getByRole("button", { name: "Tengo una molestia" })).toHaveCount(0);
      await expect(page.locator('[data-testid^="exercise-pain-report-btn-"]')).toHaveCount(0);
      await expect(page.locator('[data-testid^="molestia-chip-"]')).toHaveCount(0);
      await sinDesborde(page);
    });

    test("R-02: tarjeta de superserie con píldora SS y popover accesible", async ({ page }) => {
      await prepararEntorno(page, tema);
      await entrarARutina(page);

      const grupo = page.getByTestId("superserie-grupo-1");
      await expect(grupo).toBeVisible();
      const pill = page.getByTestId("ss-pill-1");
      await expect(pill).toHaveText("SS");
      await expect(pill).toHaveAttribute("aria-expanded", "false");
      await pill.click();
      await expect(pill).toHaveAttribute("aria-expanded", "true");
      const popover = grupo.getByRole("tooltip");
      await expect(popover).toBeVisible();
      await expect(popover).toContainText("Superserie");
      await expect(grupo.getByRole("progressbar", { name: /Superserie 0 de 3 vueltas/ })).toBeVisible();
      await pill.click();
      await expect(pill).toHaveAttribute("aria-expanded", "false");
      await sinDesborde(page);
    });

    test("R-03: ciclo unificado de superserie registra la vuelta 1, avanza el anillo y dispara un solo descanso", async ({ page }) => {
      await prepararEntorno(page, tema);
      await entrarARutina(page);
      await abrirEjercicio(page, EJ_BP);

      await expect(page.getByTestId("ss-cycle-card-1-1")).toBeVisible();
      await expect(page.getByTestId(`ss-cycle-item-${EJ_BP}`)).toBeVisible();
      await expect(page.getByTestId(`ss-cycle-item-${EJ_RM}`)).toBeVisible();
      const registrar = page.getByTestId("registrar-serie-btn");
      await expect(registrar).toContainText("Registrar vuelta 1");
      await sinDesborde(page);

      await registrar.click();
      await expect(page.getByTestId("ss-cycle-card-1-2")).toBeVisible();
      await expect(page.getByTestId("registrar-serie-btn")).toContainText("Registrar vuelta 2");
      await expect(page.getByTestId("rest-timer-banner")).toHaveCount(1);
      await sinDesborde(page);

      await page.getByRole("button", { name: "Omitir" }).click();
      await expect(page.getByTestId("rest-timer-banner")).toHaveCount(0);

      await page.getByTestId("volver-a-rutina-btn").click();
      await expect(page.getByTestId("rutina-progress-card")).toHaveAttribute(
        "aria-valuenow",
        String(pct(2, SERIES_DIA_1)),
      );
      await expect(
        page.getByTestId("superserie-grupo-1").getByRole("progressbar", { name: /Superserie 1 de 3 vueltas/ }),
      ).toBeVisible();
      await sinDesborde(page);
    });

    test("R-04: unilateral alterna Igual D/I y Separar D/I con bloques DER/IZQ y registra el par", async ({ page }) => {
      await prepararEntorno(page, tema);
      await entrarARutina(page, 2);
      await abrirEjercicio(page, EJ_ZB);

      const grupo = page.getByTestId("unilateral-indicator");
      await expect(grupo).toBeVisible();
      await expect(grupo).toHaveAttribute("role", "group");
      await expect(grupo).toHaveAttribute("aria-label", "Cargas por lado");
      await expect(page.getByTestId("uni-mode-same")).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("uni-side-D")).toHaveCount(0);

      await page.getByTestId("uni-mode-split").click();
      await expect(page.getByTestId("uni-mode-split")).toHaveAttribute("aria-pressed", "true");
      const der = page.getByTestId("uni-side-D");
      const izq = page.getByTestId("uni-side-I");
      await expect(der).toBeVisible();
      await expect(izq).toBeVisible();
      await expect(der).toContainText("DER");
      await expect(izq).toContainText("IZQ");
      const bd = await der.boundingBox();
      const bi = await izq.boundingBox();
      expect(bd && bi).toBeTruthy();
      expect(bd!.y).toBeLessThan(bi!.y); // DER antes que IZQ
      for (const b of [bd!, bi!]) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(390);
      }
      await sinDesborde(page);

      await page.getByTestId("registrar-serie-btn").click();
      await expect(page.getByTestId(`log-row-${EJ_ZB}-1`)).toBeVisible();
      await page.getByTestId("volver-a-rutina-btn").click();
      await expect(page.getByTestId("rutina-progress-card")).toHaveAttribute(
        "aria-valuenow",
        String(pct(1, SERIES_DIA_2)),
      );
      await sinDesborde(page);
    });

    test("R-05: botón discreto de molestia accesible en la barra del ejercicio, sin texto visible", async ({ page }) => {
      await prepararEntorno(page, tema);
      await entrarARutina(page);
      await abrirEjercicio(page, EJ_SQ);

      const boton = page.getByRole("button", { name: "Tengo una molestia" });
      await expect(boton).toBeVisible();
      await expect(boton).toHaveAttribute("aria-label", "Tengo una molestia");
      await expect(boton).toHaveAttribute("data-testid", `exercise-pain-report-btn-${EJ_SQ}`);
      expect(((await boton.textContent()) ?? "").trim()).toBe("");
      await expect(boton).not.toContainText("Molestia");
      await sinDesborde(page);
    });

    test("R-06: sin señal, registrar una vuelta de superserie no rompe y conserva el estado completado", async ({ page }) => {
      const errores: string[] = [];
      page.on("pageerror", (e) => errores.push(e.message));
      await prepararEntorno(page, tema);
      await entrarARutina(page);
      await abrirEjercicio(page, EJ_BP);

      await page.context().setOffline(true);
      await page.evaluate(() => window.dispatchEvent(new Event("offline")));

      await page.getByTestId("registrar-serie-btn").click();
      await expect(page.getByTestId("ss-cycle-card-1-2")).toBeVisible();
      await page.getByRole("button", { name: "Omitir" }).click();

      await page.getByTestId("volver-a-rutina-btn").click();
      await expect(page.getByTestId("rutina-progress-card")).toHaveAttribute(
        "aria-valuenow",
        String(pct(2, SERIES_DIA_1)),
      );
      const almacenado = await page.evaluate((key) => window.localStorage.getItem(key) ?? "", STORE_KEY);
      expect(almacenado).toContain('"completada":true');
      await sinDesborde(page);
      expect(errores).toEqual([]);
    });
  });
}
