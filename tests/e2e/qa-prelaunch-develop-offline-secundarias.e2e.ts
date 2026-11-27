import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";

// GOZS-905 · Suite permanente de acciones secundarias offline-first (Ola D · GOZS-885, PR #711):
// HISTORIAL_SERIE_UPDATED (corregir serie en /athlete/historial) y ENVIAR_MENSAJE_CHAT (chat del alumno).
// Mobile 390×844, Claro y Oscuro. Stub sin modificar + page.route; datos 100 % sintéticos (G4).
const STUB_URL = process.env.E2E_STUB_URL ?? "http://localhost:54321";
const APP_URL = process.env.E2E_APP_URL ?? "http://localhost:3100";

type Fila = Record<string, unknown>;
type Fixture = { user: { id: string; email?: string }; [k: string]: unknown };
type Llamada = { method: string; path: string; body: unknown };

const FIXTURE_BASE: Fixture = JSON.parse(
  readFileSync(join(process.cwd(), "tests", "e2e", "fixtures", "athlete-v7.json"), "utf8"),
);
const USER = FIXTURE_BASE.user;
const SESION_ID = "66666666-6666-4666-8666-666666666606";
const SERIE_ID = "77777777-7777-4777-8777-777777777101"; // 30 kg × 10 en la fixture
const CONV_ID = "88888888-8888-4888-8888-888888888801";
const COLA_KEY = "gozster-offline-queue";
const TEXTO_CHAT = "Mensaje sintético QA GOZS-905 sin señal";

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "*",
};

type Tema = "light" | "dark";

async function preparar(page: Page, tema: Tema) {
  await page.request.put(`${STUB_URL}/__e2e/fixtures`, { data: structuredClone(FIXTURE_BASE) });
  await page.request.delete(`${STUB_URL}/__llamadas`).catch(() => {});
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
  await rpc("obtener_ranking_funcional_alumno", []);
  await rpc("resumen_clases_alumno", [{ usadas_semana: 0, limite_semanal: null, racha_semanas: 0, asistencias: [] }]);

  const store = JSON.stringify({
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
        studentId: USER.id,
        studentName: "Alumno Sintético",
      },
    },
    version: 2,
  });
  await page.addInitScript(
    ({ theme, userId, json }) => {
      window.localStorage.setItem("gozster-theme", theme);
      if (!window.localStorage.getItem("__e2e_seeded")) {
        window.localStorage.setItem("__e2e_seeded", "1");
        window.localStorage.setItem(`gozster-athlete-store:${userId}`, json);
      }
    },
    { theme: tema, userId: USER.id, json: store },
  );
}

function vigilarErrores(page: Page): string[] {
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // Ruido esperado: recursos no mockeados, fallos de red del corte simulado y WebSocket de Realtime (el stub no lo implementa).
    if (/Failed to load resource|net::ERR|WebSocket connection to 'ws:\/\/localhost/i.test(t)) return;
    errores.push(`console.error: ${t}`);
  });
  return errores;
}

async function sinDesborde(page: Page) {
  const { scroll, ancho } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    ancho: window.innerWidth,
  }));
  expect(scroll).toBeLessThanOrEqual(ancho);
}

/** G4/G5: ningún correo ajeno al fixture sintético en DOM y localStorage. */
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

/** Eventos pendientes persistidos (cualquier clave `gozster-offline-queue*`). */
async function eventosEnCola(page: Page): Promise<{ id: string; action: string; payload: Fila }[]> {
  return page.evaluate((k) => {
    const out: { id: string; action: string; payload: Record<string, unknown> }[] = [];
    for (const [n, v] of Object.entries(window.localStorage)) {
      if (!n.includes(k)) continue;
      try {
        const evs = JSON.parse(v)?.state?.pendingEvents;
        if (Array.isArray(evs)) out.push(...evs);
      } catch {
        /* valor ajeno */
      }
    }
    return out;
  }, COLA_KEY);
}
const pendientes = async (page: Page, action: string) =>
  (await eventosEnCola(page)).filter((e) => e.action === action);

async function irAHistorial(page: Page) {
  await page.goto("/athlete");
  await expect(page.getByTestId("empezar-dia-btn")).toBeVisible({ timeout: 45_000 });
  await page.getByRole("link", { name: "Historial", exact: true }).click();
  await expect(page.getByTestId("historial-sesiones-container")).toBeVisible({ timeout: 45_000 });
}

async function sinSenal(page: Page, offline: boolean) {
  await page.context().setOffline(offline);
  await page.evaluate((o) => window.dispatchEvent(new Event(o ? "offline" : "online")), offline);
}

/** Abre la sesión sintética, la hoja "Corregir serie" y sube +2,5 kg / +1 rep (no dispara serie atípica). */
async function corregirSerie(page: Page) {
  await page.getByTestId(`btn-expand-sesion-${SESION_ID}`).click();
  await page.getByTestId(`btn-editar-serie-${SERIE_ID}`).click();
  await expect(page.getByTestId(`form-editar-serie-${SERIE_ID}`)).toBeVisible();
  await page.getByRole("button", { name: "Sumar 2,5 kg" }).click();
  await page.getByRole("button", { name: "Sumar una repetición" }).click();
  await page.getByTestId(`btn-guardar-serie-${SERIE_ID}`).click();
}

async function abrirChat(page: Page) {
  await page.goto("/athlete");
  await expect(page.getByTestId("empezar-dia-btn")).toBeVisible({ timeout: 45_000 });
  await page.getByTestId("athlete-chat-fab").click();
  await expect(page.locator("#athlete-chat-drawer")).toBeVisible();
}

const filaSerie = async (page: Page) =>
  (await filasStub(page, "registro_series")).find((s) => s.id === SERIE_ID)!;

for (const tema of ["light", "dark"] as const) {
  test.describe(`@mobile Secundarias offline-first · GOZS-905 · tema ${tema}`, () => {
    test.afterEach(async ({ page }) => {
      await page.context().setOffline(false);
      await page.request.delete(`${STUB_URL}/__e2e/fixtures`);
    });

    test(`OD-01 · corregir serie sin señal y drenar PATCH a registro_series al reconectar (${tema})`, async ({ page }) => {
      const errores = vigilarErrores(page);
      await preparar(page, tema);
      await irAHistorial(page);
      expect(await pendientes(page, "HISTORIAL_SERIE_UPDATED")).toHaveLength(0);

      await sinSenal(page, true);
      await expect(page.getByTestId("historial-sin-conexion")).toBeVisible();
      await corregirSerie(page);

      await expect(page.getByTestId(`serie-item-${SERIE_ID}`)).toContainText("32,5 kg × 11");
      await expect(page.getByTestId(`serie-item-${SERIE_ID}`)).toContainText("Corregida");
      const cola = await pendientes(page, "HISTORIAL_SERIE_UPDATED");
      expect(cola, "evento secundario persistido en localStorage").toHaveLength(1);
      expect(cola[0]!.payload).toMatchObject({ sesionId: SESION_ID, serieId: SERIE_ID, pesoKg: 32.5, repsHechas: 11 });
      expect(escribe(await llamadas(page), "registro_series"), "nada llegó al stub sin señal").toHaveLength(0);
      expect(await filaSerie(page)).toMatchObject({ peso_kg: 30, reps_hechas: 10 });

      await sinSenal(page, false);
      await expect.poll(async () => (await pendientes(page, "HISTORIAL_SERIE_UPDATED")).length, { timeout: 20_000 }).toBe(0);
      const parches = escribe(await llamadas(page), "registro_series").filter((c) => c.method === "PATCH");
      expect(parches, "un solo PATCH, sin duplicar").toHaveLength(1);
      expect(parches[0]!.body).toMatchObject({ peso_kg: 32.5, reps_hechas: 11 });
      expect(await filaSerie(page)).toMatchObject({ peso_kg: 32.5, reps_hechas: 11 });
      await expect(page.getByTestId(`serie-item-${SERIE_ID}`)).toContainText("32,5 kg × 11");
      expect(errores).toEqual([]);
    });

    test(`OD-02 · mensaje de chat sin señal y drenaje a mensajes al reconectar sin duplicar (${tema})`, async ({ page }) => {
      const errores = vigilarErrores(page);
      await preparar(page, tema);
      await abrirChat(page);

      await sinSenal(page, true);
      await page.getByLabel("Mensaje", { exact: true }).fill(TEXTO_CHAT);
      await page.getByRole("button", { name: "Enviar", exact: true }).click();

      await expect(page.locator("#athlete-chat-drawer").getByText(TEXTO_CHAT)).toBeVisible();
      const cola = await pendientes(page, "ENVIAR_MENSAJE_CHAT");
      expect(cola, "ENVIAR_MENSAJE_CHAT persistido en la cola").toHaveLength(1);
      expect(cola[0]!.payload).toMatchObject({ contenido: TEXTO_CHAT });
      expect(escribe(await llamadas(page), "mensajes"), "nada llegó al stub sin señal").toHaveLength(0);

      await sinSenal(page, false);
      await expect.poll(async () => (await pendientes(page, "ENVIAR_MENSAJE_CHAT")).length, { timeout: 20_000 }).toBe(0);
      const envios = escribe(await llamadas(page), "mensajes");
      expect(envios, "un solo envío real a mensajes").toHaveLength(1);
      expect(envios[0]!.body).toMatchObject({ contenido: TEXTO_CHAT, conversacion_id: CONV_ID });
      const enStub = (await filasStub(page, "mensajes")).filter((m) => m.contenido === TEXTO_CHAT);
      expect(enStub, "mensaje persistido una sola vez").toHaveLength(1);
      await expect(page.locator("#athlete-chat-drawer").getByText(TEXTO_CHAT)).toHaveCount(1);
      expect(errores).toEqual([]);
    });

    test(`OD-03 · durabilidad: la cola sobrevive al reload y drena íntegra una sola vez (${tema})`, async ({ page }) => {
      await preparar(page, tema);
      // Los envíos reales quedan retenidos hasta soltar la barrera: simula "aún sin señal" tras recargar.
      let retener = true;
      const barrera = (route: Route) =>
        retener && !["GET", "OPTIONS"].includes(route.request().method()) ? route.abort("internetdisconnected") : route.fallback();
      await page.route(/\/rest\/v1\/(registro_series|mensajes)(\?|$)/, barrera);

      await irAHistorial(page);
      await sinSenal(page, true);
      await corregirSerie(page);
      expect(await pendientes(page, "HISTORIAL_SERIE_UPDATED")).toHaveLength(1);

      await sinSenal(page, false);
      await page.reload();
      await expect(page.getByTestId("historial-sesiones-container")).toBeVisible({ timeout: 45_000 });
      await expect
        .poll(async () => (await pendientes(page, "HISTORIAL_SERIE_UPDATED")).length, {
          message: "tras recargar el evento sigue rehidratado desde localStorage",
        })
        .toBe(1);
      expect(escribe(await llamadas(page), "registro_series"), "con la barrera nada llegó al stub").toHaveLength(0);

      retener = false;
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await expect.poll(async () => (await pendientes(page, "HISTORIAL_SERIE_UPDATED")).length, { timeout: 25_000 }).toBe(0);
      const parches = escribe(await llamadas(page), "registro_series").filter((c) => c.method === "PATCH");
      expect(parches, "drenado una sola vez").toHaveLength(1);
      expect(await filaSerie(page)).toMatchObject({ peso_kg: 32.5, reps_hechas: 11 });

      await page.reload();
      await expect(page.getByTestId("historial-sesiones-container")).toBeVisible({ timeout: 45_000 });
      expect(await pendientes(page, "HISTORIAL_SERIE_UPDATED")).toHaveLength(0);
      expect(escribe(await llamadas(page), "registro_series").filter((c) => c.method === "PATCH"), "el reload no reenvía").toHaveLength(1);
    });

    test(`OD-04 · 390×844 sin desborde, 0 PII y 0 errores de consola (${tema})`, async ({ page }) => {
      const errores = vigilarErrores(page);
      await preparar(page, tema);
      await irAHistorial(page);
      await sinSenal(page, true);
      await corregirSerie(page);
      expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
      await sinDesborde(page);
      await sinPII(page);

      // Para navegar al chat se recupera la red real, pero las escrituras siguen retenidas: la cola no se drena.
      await page.context().setOffline(false);
      await page.route(/\/rest\/v1\/(registro_series|mensajes)(\?|$)/, (route) =>
        ["GET", "OPTIONS"].includes(route.request().method()) ? route.fallback() : route.abort("internetdisconnected"),
      );
      await abrirChat(page);
      await sinSenal(page, true);
      await page.getByLabel("Mensaje", { exact: true }).fill(TEXTO_CHAT);
      await page.getByRole("button", { name: "Enviar", exact: true }).click();
      await expect(page.locator("#athlete-chat-drawer").getByText(TEXTO_CHAT)).toBeVisible();
      await sinDesborde(page);
      await sinPII(page);
      expect(errores, "0 pageerror / console.error inesperados").toEqual([]);
    });
  });
}
