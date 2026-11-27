import { expect, test, type Locator, type Page } from "@playwright/test";
import { FORBIDDEN_DEMO_LITERALS } from "@/test-utils/no-demo-literals";

// GOZS-918 · Suite permanente E2E de resiliencia G5/G12 en Coach Studio (datos 100 % sintéticos, G4):
//  - GE-02 (PR #715): error de carga de plantillas (/studio/rutinas). GE-01 (alumnos, /studio) queda pendiente: el stub no
//    aplica /__e2e/fallos a `perfiles` y la lectura SSR no es interceptable sin modificar supabase-stub.mjs (fuera de alcance).
//  - GE-03/GE-04 (PR #719): errores de carga en /studio/cobros y /studio/agenda.
//  - GE-05 (PR #723): errores de KPIs (SSR) y retención (cliente) en /studio/ingresos y /studio/dashboard.
// Ciclo: fallo 500 → role="alert" + 0 demo + sin SQL crudo → restaurar → Reintentar → datos reales.
// Mecanismos existentes del stub: PUT /__e2e/fixtures, PUT /__e2e/fallos y page.route (RPC de cliente).
const STUB_URL = process.env.E2E_STUB_URL ?? "http://localhost:54321";
const APP_URL = process.env.E2E_APP_URL ?? "http://localhost:3100";
const COACH_ID = "00000000-0000-4000-8000-000000000001";
const ALUMNO_ID = "55555555-5555-4555-8555-555555555501";
const PLAN_ID = "66666666-6666-4666-8666-666666666601";
const CLASE_ID = "77777777-7777-4777-8777-777777777701";
const ALUMNO_NOMBRE = "Alumno Sintético Uno";
const PLAN_NOMBRE = "Plantilla Sintética Fuerza";
const ahora = "2026-11-27T10:00:00-03:00";

const SQL_CRUDO = [/PGRST/, /42501/, /relation ["'`]?\w+/i, /XX000/];
const CIFRAS_DEMO = ["$767.000", "$105.000", "$215.000", "$995.000", "$195.000", "demo-alumno-"];
const PROHIBIDOS = [...FORBIDDEN_DEMO_LITERALS, ...CIFRAS_DEMO];

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

type Fila = Record<string, unknown>;

const alumno: Fila = {
  id: ALUMNO_ID,
  nombre_completo: ALUMNO_NOMBRE,
  rol: "ALUMNO",
  email: "alumno-uno@gozster.test",
  sexo: "M",
  peso_corporal_kg: 80,
  profesor_asignado_id: COACH_ID,
  estado_cuenta: "ACTIVA",
  created_at: ahora,
  updated_at: ahora,
};
const plan: Fila = {
  id: PLAN_ID,
  profesor_id: COACH_ID,
  alumno_id: null,
  nombre: PLAN_NOMBRE,
  estado: "ACTIVO",
  comentarios: null,
  tipo: "PLANTILLA",
  etiqueta: null,
  plan_origen_id: null,
  tags: [],
  fecha_inicio: null,
  fecha_fin: null,
  created_at: ahora,
  updated_at: ahora,
};
// Clase de hoy (hora local del navegador/servidor) para verla en la vista Día.
const inicioClase = (() => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
})();
const clase: Fila = {
  id: CLASE_ID,
  horario_id: "88888888-8888-4888-8888-888888888801",
  actividad: "FUNCIONAL",
  inicio: inicioClase,
  duracion_minutos: 60,
  capacidad: 8,
  estado: "PROGRAMADA",
  motivo_cancelacion: null,
  created_at: ahora,
  updated_at: ahora,
};
const KPIS_SINTETICOS: Fila = {
  ingresos: 123456,
  ingresos_6m: [],
  ingresos_periodo_anterior: 100000,
  cobranza_esperada: 150000,
  cobranza_pendiente_monto: 26544,
  cobranza_vencidas_cant: 0,
  sin_entrenar_7d_ids: [],
  activos_fin: 1,
  altas: 1,
  bajas: 0,
  ingresos_presencial: 123456,
  ingresos_online: 0,
  cobranza_vencida_monto: 0,
  cobranza_por_vencer_monto: 26544,
  alumnos_al_dia: 1,
  alumnos_morosos: 0,
};
const FIXTURES: Fila = {
  rol: "ADMIN",
  alumnos: [alumno],
  planes_entrenamiento: [plan],
  ejercicios: [],
  clases: [clase],
  reservas: [],
  clases_profesores: [],
  cobros: [],
  contrataciones: [],
  pagos: [],
  alumno_actividades: [],
  kpis_negocio: KPIS_SINTETICOS,
};

async function cargarFixtures(page: Page) {
  const res = await page.request.put(`${STUB_URL}/__e2e/fixtures`, { data: FIXTURES });
  expect(res.ok()).toBe(true);
}

async function iniciarSesionStaff(page: Page) {
  await cargarFixtures(page);
  const sesion = {
    access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: COACH_ID, exp: 4102444800, role: "authenticated" })}.sig`,
    refresh_token: "e2e-refresh",
    expires_at: 4102444800,
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: COACH_ID,
      aud: "authenticated",
      role: "authenticated",
      email: "coach-e2e@gozster.test",
      app_metadata: { rol: "ADMIN" },
      user_metadata: {},
    },
  };
  await page.context().addCookies([{ name: "sb-localhost-auth-token", value: `base64-${b64url(sesion)}`, url: APP_URL }]);
}

const forzarFallos = async (page: Page, fallos: Record<string, number>) => {
  const res = await page.request.put(`${STUB_URL}/__e2e/fallos`, { data: fallos });
  expect(res.ok()).toBe(true);
};

/** G5 (0 demo) + G12 (alerta visible sin SQL crudo). */
async function expectAlertaLimpia(page: Page, alerta: Locator) {
  await expect(alerta).toBeVisible({ timeout: 60_000 });
  const texto = (await alerta.innerText()) ?? "";
  for (const re of SQL_CRUDO) expect(texto, `SQL crudo ${re} en la alerta`).not.toMatch(re);
  const cuerpo = await page.locator("body").innerText();
  for (const lit of PROHIBIDOS) expect(cuerpo, `literal demo "${lit}"`).not.toContain(lit);
  for (const re of SQL_CRUDO) expect(cuerpo, `SQL crudo ${re} en pantalla`).not.toMatch(re);
}

test.describe("GOZS-918 · Studio errores de carga G5/G12", () => {
  const errores: string[] = [];

  test.beforeEach(async ({ page }) => {
    errores.length = 0;
    page.on("pageerror", (e) => errores.push(e.message));
  });

  test.afterEach(async ({ request }) => {
    expect(errores, "pageerror inesperados").toEqual([]);
    await request.delete(`${STUB_URL}/__e2e/fixtures`).catch(() => {});
  });

  test("GE-02 · /studio/rutinas: fallo en planes_entrenamiento → alerta → Reintentar → plantilla sintética", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await iniciarSesionStaff(page);
    await forzarFallos(page, { planes_entrenamiento: 500 });
    await page.goto("/studio/rutinas");

    const alerta = page.getByTestId("rutinas-load-error");
    await expect(alerta).toHaveAttribute("role", "alert", { timeout: 60_000 });
    await expectAlertaLimpia(page, alerta);

    await forzarFallos(page, {});
    await page.getByTestId("btn-reintentar-carga-rutinas").click();
    await expect(page.getByTestId("rutinas-load-error")).toHaveCount(0);
    await expect(page.getByText(PLAN_NOMBRE).first()).toBeVisible({ timeout: 30_000 });
  });

  test("GE-03 · /studio/cobros: fallo en contrataciones → alerta → Reintentar → vista real", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await iniciarSesionStaff(page);
    await forzarFallos(page, { contrataciones: 500, pagos: 500 });
    await page.goto("/studio/cobros");

    const alerta = page.getByTestId("cobros-error-alert");
    await expect(alerta).toHaveAttribute("role", "alert", { timeout: 60_000 });
    await expectAlertaLimpia(page, alerta);

    await forzarFallos(page, {});
    await page.getByTestId("cobros-error-reintentar").click();
    await expect(page.getByTestId("cobros-error-alert")).toHaveCount(0);
    await expect(page.getByTestId("cobros-panel")).toBeVisible();
  });

  test("GE-04 · /studio/agenda: fallo en clases → alerta → Reintentar → clase sintética", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await iniciarSesionStaff(page);
    await forzarFallos(page, { clases: 500 });
    await page.goto("/studio/agenda");

    const alerta = page.getByTestId("agenda-error-alert");
    await expect(alerta).toHaveAttribute("role", "alert", { timeout: 60_000 });
    await expectAlertaLimpia(page, alerta);
    await expect(page.getByTestId("class-block-card")).toHaveCount(0);

    await forzarFallos(page, {});
    await page.getByTestId("agenda-error-reintentar").click();
    await expect(page.getByTestId("agenda-error-alert")).toHaveCount(0);
    await page.getByTestId("view-day-btn").click();
    await expect(page.getByTestId("class-block-card").first()).toBeVisible({ timeout: 30_000 });
  });

  test("GE-05a · /studio/ingresos (tema oscuro): KPIs fallan → alerta sin montos demo → Reintentar → KPIs reales", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.addInitScript(() => localStorage.setItem("theme", "dark"));
    await iniciarSesionStaff(page);
    // El stub responde [] a obtener_kpis_negocio (sin fila): la RPC SSR falla de verdad en el servidor.
    expect((await page.request.put(`${STUB_URL}/__e2e/fixtures`, { data: { ...FIXTURES, kpis_negocio: [] } })).ok()).toBe(true);
    await page.goto("/studio/ingresos");

    const alerta = page.getByTestId("sankey-error-carga");
    await expect(alerta).toHaveAttribute("role", "alert", { timeout: 60_000 });
    await expectAlertaLimpia(page, alerta);

    await cargarFixtures(page); // restaura la RPC de KPIs
    await alerta.getByRole("button", { name: "Reintentar" }).click();
    await expect(page.getByTestId("sankey-error-carga")).toHaveCount(0, { timeout: 30_000 });
  });

  test("GE-05b · /studio/dashboard: retención (RPC cliente) falla → alerta → Reintentar → sin alerta", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await iniciarSesionStaff(page);
    const RUTA = "**/rest/v1/rpc/obtener_metricas_retencion";
    await page.route(RUTA, (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ code: "XX000", message: "fallo forzado" }) }),
    );
    await page.goto("/studio/dashboard");

    const alerta = page.getByTestId("dashboard-error-carga");
    await expect(alerta).toHaveAttribute("role", "alert", { timeout: 60_000 });
    await expect(alerta).toContainText("retención");
    await expectAlertaLimpia(page, alerta);

    await page.unroute(RUTA);
    await page.route(RUTA, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ retencion_30d: 100, retencion_90d: 100, tasa_abandono: 0, activos: 1 }]),
      }),
    );
    await alerta.getByRole("button", { name: "Reintentar" }).click();
    await expect(page.getByTestId("dashboard-error-carga")).toHaveCount(0, { timeout: 30_000 });
  });
});
