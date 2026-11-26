import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// GOZS-858 · Regresión permanente Athlete v7 + Ranking Funcional sin peso sobre develop (mobile 390×844, Claro y Oscuro).
// Cubre: historial compacto + Historial de clases, leyenda de Clases, Mi Progreso (plan + Funcional / solo Funcional,
// regresión #688/#692) y cierre del día con nombre largo (GOZS-850/853). Cero cambios en src/.
// Deliberadamente NO hace aserciones sobre rutina-del-dia.tsx (en rediseño en GOZS-853). Datos 100 % sintéticos.
const STUB_URL = process.env.E2E_STUB_URL ?? "http://localhost:54321";
const APP_URL = process.env.E2E_APP_URL ?? "http://localhost:3100";

const FIXTURE_BASE = JSON.parse(
  readFileSync(join(process.cwd(), "tests", "e2e", "fixtures", "athlete-v7.json"), "utf8"),
);
const USER_ID: string = FIXTURE_BASE.user.id;
const EJ_SQ = FIXTURE_BASE.ejercicios_en_rutina[0].id as string;
const EJ_CATALOGO_ID = FIXTURE_BASE.ejercicios_en_rutina[0].ejercicio_id as string;
const NOMBRE_LARGO = "Constantinopolitanizacion"; // una sola palabra de 25 letras: no debe cortarse con guion

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "*",
};

function cookieSesion() {
  return {
    access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({
      sub: USER_ID,
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

type Tema = "light" | "dark";

interface Opciones {
  tema: Tema;
  fixture?: Record<string, unknown>;
  estado?: Record<string, unknown>;
  ranking?: unknown[];
  asistencias?: unknown[];
  /** Fija la hora del navegador. En SSR (p. ej. /athlete/clases) provoca mismatch de hydration: desactivar ahí. */
  reloj?: boolean;
}

/** Siembra stub, sesión, tema y store del alumno; intercepta las RPC que el stub no implementa. */
async function preparar(page: Page, o: Opciones) {
  const fixture = o.fixture ?? structuredClone(FIXTURE_BASE);
  expect((await page.request.put(`${STUB_URL}/__e2e/fixtures`, { data: fixture })).ok()).toBeTruthy();
  await page.context().addCookies([
    { name: "sb-localhost-auth-token", value: `base64-${b64url(cookieSesion())}`, url: APP_URL },
  ]);
  await page.emulateMedia({ colorScheme: o.tema, reducedMotion: "reduce" });
  if (o.reloj !== false) await page.clock.setFixedTime(new Date("2026-11-17T10:00:00-03:00"));

  const rpc = (nombre: string, cuerpo: unknown) =>
    page.route(`${STUB_URL}/rest/v1/rpc/${nombre}`, (route) =>
      route.request().method() === "OPTIONS"
        ? route.fulfill({ status: 204, headers: CORS })
        : route.fulfill({
            status: 200,
            headers: { ...CORS, "content-type": "application/json" },
            body: JSON.stringify(cuerpo),
          }),
    );
  await rpc("obtener_ranking_funcional_alumno", o.ranking ?? []);
  await rpc("resumen_clases_alumno", [
    { usadas_semana: 0, limite_semanal: null, racha_semanas: 0, asistencias: o.asistencias ?? [] },
  ]);

  const store = {
    state: {
      onboardingCompletado: true,
      mostrarTimerDescanso: true,
      nivelVistaAlumno: "SIMPLE",
      membershipStatus: "ACTIVE",
      currentSession: {
        id: "aaaaaaaa-1111-4111-8111-111111111101",
        nombre_rutina: "DÍA 1",
        fecha: "2026-11-17",
        ejercicios: [],
        studentId: USER_ID,
        studentName: "Alumno Sintetico",
      },
      ...(o.estado ?? {}),
    },
    version: 2,
  };
  await page.addInitScript(
    ({ theme, userId, json }) => {
      window.localStorage.setItem("gozster-theme", theme);
      if (!window.localStorage.getItem("__e2e_seeded")) {
        window.localStorage.setItem("__e2e_seeded", "1");
        window.localStorage.setItem(`gozster-athlete-store:${userId}`, json);
      }
    },
    { theme: o.tema, userId: USER_ID, json: JSON.stringify(store) },
  );
}

function vigilarErrores(page: Page): string[] {
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // Ruido del stub: recursos no mockeados y el WebSocket de Realtime (el stub no lo implementa).
    if (/Failed to load resource|net::ERR|WebSocket connection to 'ws:\/\/localhost/i.test(t)) return;
    errores.push(`console.error: ${t}`);
  });
  return errores;
}

/** Entra por Inicio (carga plan/rutina en el store) y navega por la barra inferior, como el alumno real. */
async function irDesdeInicio(page: Page, seccion: "Historial" | "Progreso") {
  await page.goto("/athlete");
  await expect(page.getByTestId("empezar-dia-btn")).toBeVisible({ timeout: 45_000 });
  await page.getByRole("link", { name: seccion, exact: true }).click();
}

const sinDesborde = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

const FILA = (nombre: string, posicion: number, propia = false) => ({
  ejercicio_id: EJ_CATALOGO_ID,
  es_usuario_actual: propia,
  nombre_corto: nombre,
  sexo: "F",
  peso_kg: propia ? 62 : null, // terceros: la RPC devuelve NULL
  reps: 5,
  fecha: "2026-11-10",
  ratio: Number((1.4 - posicion * 0.1).toFixed(2)),
  posicion,
});
const RANKING = [FILA("Sofía R.", 1), FILA("Camila T.", 2), FILA("Lucía F.", 3, true), FILA("Marina G.", 4)];

for (const tema of ["light", "dark"] as const) {
  test.describe(`@mobile Prelaunch develop · Athlete v7 · ${tema === "light" ? "Claro" : "Oscuro"}`, () => {
    test.afterEach(async ({ page }) => {
      await page.request.delete(`${STUB_URL}/__e2e/fixtures`);
    });

    test(`1 · /athlete/historial: sesiones colapsadas + Historial de clases (${tema})`, async ({ page }) => {
      const errores = vigilarErrores(page);
      await preparar(page, {
        tema,
        asistencias: [
          {
            reserva_id: "bbbbbbbb-0000-4000-8000-000000000001",
            clase_id: "bbbbbbbb-0000-4000-8000-000000000002",
            actividad: "FUNCIONAL",
            inicio: "2026-11-12T19:00:00-03:00",
            sensacion: null,
            nota: null,
          },
        ],
      });
      await irDesdeInicio(page, "Historial");
      await expect(page.getByTestId("historial-sesiones-container")).toBeVisible({ timeout: 45_000 });

      const botones = page.locator('[data-testid^="btn-expand-sesion-"]');
      await expect(botones.first()).toBeVisible({ timeout: 30_000 });
      const total = await botones.count();
      expect(total).toBeGreaterThan(0);
      for (let i = 0; i < total; i++) await expect(botones.nth(i)).toHaveAttribute("aria-expanded", "false");

      const clases = page.getByTestId("historial-clases-section");
      await expect(clases).toBeVisible({ timeout: 15_000 });
      await expect(clases.getByRole("heading", { name: "Historial de clases" })).toBeVisible();
      await expect(page.getByTestId("historial-clase-item")).toHaveCount(1);

      expect(await sinDesborde(page), "sin desborde horizontal a 390px").toBe(true);
      expect(errores, "sin errores de consola").toEqual([]);
    });

    test(`2 · /athlete/clases: leyenda hoy vs día elegido (${tema})`, async ({ page }) => {
      const errores = vigilarErrores(page);
      await preparar(page, { tema, reloj: false });
      await page.goto("/athlete/clases");
      const leyenda = page.locator(".a-legend");
      await expect(leyenda).toBeVisible({ timeout: 45_000 });
      await expect(leyenda.getByText("hoy", { exact: true })).toBeVisible();
      await expect(leyenda.getByText("día elegido", { exact: true })).toBeVisible();
      expect(await sinDesborde(page), "sin desborde horizontal a 390px").toBe(true);
      expect(errores, "sin errores de consola").toEqual([]);
    });

    test(`3 · /athlete/progreso con plan + Funcional: cumplimiento y ranking sin kg ajeno (${tema})`, async ({ page }) => {
      const errores = vigilarErrores(page);
      const fixture = structuredClone(FIXTURE_BASE);
      fixture.alumno_actividades = [{ id: "cccccccc-0000-4000-8000-000000000001", alumno_id: USER_ID, actividad: "FUNCIONAL" }];
      await preparar(page, { tema, fixture, ranking: RANKING });
      await irDesdeInicio(page, "Progreso");

      await expect(page.getByTestId("progreso-cumplimiento")).toContainText(/\d+\s?%|Cumplimiento/, { timeout: 45_000 });
      const ranking = page.getByTestId("ranking-funcional-alumno");
      await expect(ranking).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("ranking-funcional-propia")).toHaveCount(1);
      await expect(page.getByTestId("ranking-funcional-fila")).toHaveCount(RANKING.length - 1);
      await expect(page.getByTestId("progreso-vacio")).toHaveCount(0);
      expect(await ranking.innerText(), "el ranking no filtra kg").not.toMatch(/\bkg\b/i);

      expect(await sinDesborde(page), "sin desborde horizontal a 390px").toBe(true);
      expect(errores, "sin errores de consola").toEqual([]);
    });

    test(`4 · /athlete/progreso solo Funcional (sinHistorial, #688/#692): ranking sin kg y sin EstadoVacio (${tema})`, async ({ page }) => {
      const errores = vigilarErrores(page);
      const fixture = structuredClone(FIXTURE_BASE);
      fixture.registro_sesiones = [];
      fixture.registro_series = [];
      fixture.planes_entrenamiento = [];
      fixture.dias_rutina = [];
      fixture.ejercicios_en_rutina = [];
      fixture.alumno_actividades = [{ id: "cccccccc-0000-4000-8000-000000000001", alumno_id: USER_ID, actividad: "FUNCIONAL" }];
      await preparar(page, { tema, fixture, ranking: RANKING });
      await page.goto("/athlete/progreso");

      const ranking = page.getByTestId("ranking-funcional-alumno");
      await expect(ranking).toBeVisible({ timeout: 45_000 });
      await expect(page.getByTestId("ranking-funcional-propia")).toHaveCount(1);
      await expect(page.getByTestId("ranking-funcional-fila")).toHaveCount(RANKING.length - 1);
      await expect(page.getByTestId("progreso-vacio")).toHaveCount(0);
      expect(await ranking.innerText(), "filas propia y ajenas sin kg").not.toMatch(/\bkg\b/i);

      expect(await sinDesborde(page), "sin desborde horizontal a 390px").toBe(true);
      expect(errores, "sin errores de consola").toEqual([]);
    });

    test(`5 · Cierre del día con nombre largo: sin guiones ni desborde (${tema})`, async ({ page }) => {
      const fixture = structuredClone(FIXTURE_BASE);
      fixture.perfil = { ...fixture.perfil, nombre_preferido: NOMBRE_LARGO };
      await preparar(page, { tema, fixture, estado: { nombrePreferido: NOMBRE_LARGO } });
      await page.goto("/athlete");
      await expect(page.getByTestId("empezar-dia-btn")).toBeVisible({ timeout: 45_000 });
      await page.getByTestId("empezar-dia-btn").click();
      await page.getByTestId(`exercise-select-btn-${EJ_SQ}`).click();
      await expect(page.getByTestId("registrar-serie-btn")).toBeVisible({ timeout: 15_000 });
      await page.getByTestId("registrar-serie-btn").click();
      const omitir = page.getByRole("button", { name: "Omitir" });
      if (await omitir.isVisible().catch(() => false)) await omitir.click();
      await page.getByTestId("volver-a-rutina-btn").click();
      await page.getByTestId("tab-registro-dia").click();
      await page.getByTestId("terminar-entrenamiento-btn").click();

      const titulo = page.getByTestId("cierre-dia-titulo");
      await expect(titulo).toBeVisible({ timeout: 15_000 });
      await expect(titulo).toContainText(NOMBRE_LARGO);
      await expect(titulo).toHaveCSS("hyphens", "none");
      const texto = await titulo.innerText();
      expect(texto, "sin guion de corte").not.toMatch(/\w-\s/);
      expect(await sinDesborde(page), "sin desborde horizontal a 390px").toBe(true);
      expect(
        await titulo.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        "el titular cabe en su caja",
      ).toBe(true);
    });
  });
}
