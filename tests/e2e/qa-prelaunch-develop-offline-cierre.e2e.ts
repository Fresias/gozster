import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// GOZS-890 · Suite permanente del cierre offline-first (Olas A/B: PR #707 y #709):
// guardado batch (sesión COMPLETADA + series en lote), soft-timeout 1,2 s, chip de 3 estados,
// cola offline y durabilidad. Mobile 390×844, Claro y Oscuro. Stub local y fixture sintético (G4).
const STUB_URL = process.env.E2E_STUB_URL ?? "http://localhost:54321";
const APP_URL = process.env.E2E_APP_URL ?? "http://localhost:3100";

type Fila = Record<string, unknown>;
type Fixture = { user: { id: string; email?: string }; ejercicios_en_rutina: Fila[]; registro_sesiones?: Fila[]; [k: string]: unknown };
type Llamada = { method: string; path: string; body: unknown };

const FIXTURE_BASE: Fixture = JSON.parse(
  readFileSync(join(process.cwd(), "tests", "e2e", "fixtures", "athlete-v7.json"), "utf8"),
);
const USER = FIXTURE_BASE.user;
const EJ_SQ = FIXTURE_BASE.ejercicios_en_rutina[0]!.id as string;
const SESION_ID = "aaaaaaaa-1111-4111-8111-111111111190";
const STORE_KEY = `gozster-athlete-store:${USER.id}`;
const COLA_KEY = "gozster-offline-queue";
const SOFT_MS = 1200;
const DEMORA_MS = 2200;

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

type Tema = "light" | "dark";

async function preparar(page: Page, tema: Tema) {
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

/** Entra a la rutina, completa 1 serie y deja el botón de terminar visible. */
async function hastaTerminar(page: Page) {
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
  await expect(page.getByTestId("terminar-entrenamiento-btn")).toBeVisible();
}

async function llamadas(page: Page): Promise<Llamada[]> {
  const res = await page.request.get(`${STUB_URL}/__llamadas`);
  return ((await res.json()) as { llamadas: Llamada[] }).llamadas;
}

const escribe = (l: Llamada[], tabla: string) =>
  l.filter((c) => c.path.endsWith(`/${tabla}`) && ["POST", "PUT", "PATCH"].includes(c.method));

async function filasStub(page: Page, tabla: string): Promise<Fila[]> {
  const res = await page.request.get(`${STUB_URL}/rest/v1/${tabla}?select=*`);
  return (await res.json()) as Fila[];
}

// La app asigna su propio id de sesión: las "nuevas" son las que no vienen en la fixture.
const IDS_FIXTURE = new Set(((FIXTURE_BASE.registro_sesiones as Fila[]) ?? []).map((s) => s.id));
const sesionesCierre = async (page: Page) =>
  (await filasStub(page, "registro_sesiones")).filter((s) => !IDS_FIXTURE.has(s.id));

async function sinDesborde(page: Page) {
  const { scroll, ancho } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    ancho: window.innerWidth,
  }));
  expect(scroll).toBeLessThanOrEqual(ancho);
}

/** G4/G5: ningún correo ajeno al fixture sintético ni literales demo en DOM y localStorage. */
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

const chip = (page: Page) => page.getByTestId("cierre-dia-estado-chip");

for (const tema of ["light", "dark"] as const) {
  test.describe(`@mobile Cierre offline-first · GOZS-890 · tema ${tema}`, () => {
    test(`OC-01 · cierre online rápido: lista y batch COMPLETADA (${tema})`, async ({ page }) => {
      await preparar(page, tema);
      await hastaTerminar(page);
      await page.getByTestId("terminar-entrenamiento-btn").click();

      await expect(page.getByTestId("cierre-dia-modal")).toBeVisible({ timeout: 15_000 });
      await expect(chip(page)).toHaveAttribute("data-estado", "lista", { timeout: 10_000 });
      await expect(chip(page)).toContainText("Guardada y sincronizada");

      const l = await llamadas(page);
      const ses = escribe(l, "registro_sesiones");
      expect(ses.length, "una sola escritura de sesión").toBe(1);
      expect(ses[0]!.body).toMatchObject({ estado: "COMPLETADA" });
      expect((ses[0]!.body as Fila).finalizada_at, "finalizada_at presente").toBeTruthy();
      const series = escribe(l, "registro_series");
      expect(series.length, "series en un solo lote").toBe(1);
      expect(Array.isArray(series[0]!.body) && (series[0]!.body as unknown[]).length).toBeGreaterThanOrEqual(1);

      await page.getByTestId("cierre-dia-volver-athlete-btn").click();
      await expect(page.getByTestId("cierre-dia-modal")).toHaveCount(0);
      await sinPII(page);
    });

    test(`OC-02 · soft-timeout 1,2 s con red lenta: Sincronizando… y luego lista (${tema})`, async ({ page }) => {
      await preparar(page, tema);
      await page.route(/\/rest\/v1\/registro_sesiones/, async (route) => {
        if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, DEMORA_MS));
        await route.continue();
      });
      await hastaTerminar(page);
      const t0 = Date.now();
      await page.getByTestId("terminar-entrenamiento-btn").click();

      await expect(page.getByTestId("cierre-dia-modal")).toBeVisible({ timeout: 15_000 });
      const abrio = Date.now() - t0;
      expect(abrio, "abre cerca del tope de 1,2 s, no espera la red entera").toBeGreaterThanOrEqual(SOFT_MS - 300);
      expect(abrio).toBeLessThan(DEMORA_MS + 300);
      await expect(chip(page)).toHaveAttribute("data-estado", "sincronizando");
      await expect(chip(page)).toContainText("Sincronizando…");

      await expect(chip(page)).toHaveAttribute("data-estado", "lista", { timeout: 15_000 });
      await expect(chip(page)).toContainText("Guardada y sincronizada");
      expect(await sesionesCierre(page), "sin sesiones duplicadas").toHaveLength(1);
      await sinDesborde(page);
    });

    test(`OC-03 · cierre offline real y recuperación al volver online (${tema})`, async ({ page, context }) => {
      await preparar(page, tema);
      await hastaTerminar(page);
      await context.setOffline(true);
      await page.evaluate(() => window.dispatchEvent(new Event("offline")));
      const t0 = Date.now();
      await page.getByTestId("terminar-entrenamiento-btn").click();

      await expect(page.getByTestId("cierre-dia-modal")).toBeVisible({ timeout: 5_000 });
      expect(Date.now() - t0, "sin señal abre sin esperar el tope").toBeLessThan(SOFT_MS);
      await expect(chip(page)).toHaveAttribute("data-estado", "offline");
      await expect(chip(page)).toContainText("Guardada en el teléfono");
      const cola = await page.evaluate(
        (k) => Object.entries(window.localStorage).filter(([n]) => n.includes(k)).map(([, v]) => v),
        COLA_KEY,
      );
      expect(cola.join(""), "la cola persiste en localStorage con eventos pendientes").toContain("pendingEvents");
      expect(await sesionesCierre(page), "nada llegó al stub todavía").toHaveLength(0);

      await context.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await expect(chip(page)).toHaveAttribute("data-estado", "lista", { timeout: 20_000 });
      await expect.poll(async () => (await sesionesCierre(page)).length, { timeout: 20_000 }).toBe(1);
      const [nueva] = await sesionesCierre(page);
      const series = (await filasStub(page, "registro_series")).filter((s) => s.sesion_id === nueva!.id);
      const claves = series.map((s) => `${s.ejercicio_id}:${s.numero_serie}`);
      expect(new Set(claves).size, "series sin duplicar").toBe(claves.length);
      expect(claves.length).toBeGreaterThanOrEqual(1);
    });

    test(`OC-04 · anti-doble-clic y durabilidad tras reload (${tema})`, async ({ page }) => {
      await preparar(page, tema);
      await hastaTerminar(page);
      await page.getByTestId("terminar-entrenamiento-btn").dblclick();

      await expect(page.getByTestId("cierre-dia-modal")).toBeVisible({ timeout: 15_000 });
      await expect(chip(page)).toHaveAttribute("data-estado", "lista", { timeout: 10_000 });
      expect(escribe(await llamadas(page), "registro_sesiones").length, "un solo guardado de sesión").toBe(1);
      expect(await sesionesCierre(page)).toHaveLength(1);

      await page.reload();
      await expect(page.getByTestId("empezar-dia-btn").or(page.getByTestId("cierre-dia-modal")).first())
        .toBeVisible({ timeout: 25_000 });
      expect(await sesionesCierre(page), "la sesión persiste tras recargar, sin duplicarse").toHaveLength(1);
      expect(escribe(await llamadas(page), "registro_sesiones").length, "el reload no reenvía la sesión").toBe(1);
      await sinPII(page);
    });

    test(`OC-05 · layout 390×844 sin desborde y 0 PII en modal (${tema})`, async ({ page }) => {
      await preparar(page, tema);
      await hastaTerminar(page);
      await page.getByTestId("terminar-entrenamiento-btn").click();
      const modal = page.getByTestId("cierre-dia-modal");
      await expect(modal).toBeVisible({ timeout: 15_000 });
      await expect(chip(page)).toBeVisible();

      await sinDesborde(page);
      // Los adornos (G gigante, cuña) se recortan a propósito: se mide el contenido real del modal.
      const fuera = await page.getByTestId("cierre-dia-card").evaluate((card) => {
        const ancho = window.innerWidth;
        return Array.from(card.querySelectorAll("*"))
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && (r.right > ancho + 1 || r.left < -1);
          })
          .map((el) => el.getAttribute("data-testid") ?? el.tagName);
      });
      expect(fuera, "ningún elemento del cierre se sale del viewport").toEqual([]);
      expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
      await sinPII(page);
    });
  });
}
