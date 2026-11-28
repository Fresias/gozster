import { expect, test, type Page, type Route } from "@playwright/test";

// GOZS-936 · Suite pre-corte sobre `develop`: Alta directa (F-1), Ficha sin datos demo (G5),
// Reset de contraseña (F-7 / S-5) y Clases fijas con errores reales visibles (G12).
// Fixtures 100 % sintéticos (G4). Las Edge Functions y RPCs se interceptan con page.route
// (el stub no las implementa); cero cambios en src/, supabase/ y supabase-stub.mjs.
const STUB_URL = process.env.E2E_STUB_URL ?? "http://localhost:54321";
const APP_URL = process.env.E2E_APP_URL ?? "http://localhost:3100";

const COACH_ID = "00000000-0000-4000-8000-000000000001";
const ALUMNO_ID = "bbbbbbbb-0000-4000-8000-000000000f01";
const CONTRATACION_ID = "cccccccc-0000-4000-8000-000000000f01";
const HORARIO_LUN = "eeeeeeee-0000-4000-8000-000000000f01";
const HORARIO_MIE = "eeeeeeee-0000-4000-8000-000000000f02";
const FIJA_ID = "ffffffff-0000-4000-8000-000000000f01";
const ALUMNO_NOMBRE = "Alumna Ficha Sintética";
const EMAIL_ALTA = "alta.sintetica@example.test";
const PASSWORD_ALTA = "Temp-Alta-3F8k";
const PASSWORD_RESET = "Temp-Reset-6P1w";

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const SESSION = {
  access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: COACH_ID, exp: 4102444800, role: "authenticated" })}.sig`,
  refresh_token: "e2e-refresh",
  expires_at: 4102444800,
  expires_in: 3600,
  token_type: "bearer",
  user: { id: COACH_ID, aud: "authenticated", role: "authenticated", email: "coach-e2e@gozster.test", app_metadata: {}, user_metadata: {} },
};

const ALUMNO = {
  id: ALUMNO_ID,
  nombre_completo: ALUMNO_NOMBRE,
  email: EMAIL_ALTA,
  telefono: "+54 9 11 0000-0000",
  rol: "ALUMNO",
  estado_membresia: "ACTIVA",
  peso_corporal_kg: 62,
  sexo: "F",
  profesor_asignado_id: COACH_ID,
  fecha_baja: null,
  fecha_vencimiento_cuota: "2026-12-10",
  ultimo_entreno_at: null,
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
};

const CONTRATACION = {
  id: CONTRATACION_ID,
  alumno_id: ALUMNO_ID,
  tipo_servicio: "MEMBRESIA",
  estado: "ACTIVA",
  dia_vencimiento: 10,
  fecha_inicio: "2026-11-10",
  fecha_fin: "2026-12-10",
  plan_membresia_id: null,
  actividad: "RUTINAS",
  precio_pactado: 15000,
};

const HORARIOS = [
  { id: HORARIO_LUN, actividad: "FUNCIONAL", dia_semana: 1, hora_inicio: "18:00:00" },
  { id: HORARIO_MIE, actividad: "FUNCIONAL", dia_semana: 3, hora_inicio: "19:30:00" },
];
const FIJAS = [
  {
    id: FIJA_ID,
    horario_id: HORARIO_LUN,
    clases_horario: { actividad: "FUNCIONAL", dia_semana: 1, hora_inicio: "18:00:00" },
  },
];

const CORS = {
  "access-control-allow-origin": APP_URL,
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "*",
};

/** Responde a la petición real; el preflight CORS se contesta aparte para no contarlo como llamada. */
async function responder(route: Route, status: number, body: unknown, onBody?: (b: unknown) => void) {
  const req = route.request();
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
  onBody?.(req.postDataJSON());
  return route.fulfill({
    status,
    headers: { ...CORS, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Errores de consola de la página. Se ignora el aviso del navegador "Failed to load resource" porque los
 * escenarios de error fuerzan 400/403/409/500 a propósito, y el WebSocket de Realtime, que el stub no implementa.
 * Cualquier otro error (hidratación, excepciones) cuenta.
 */
const RUIDO_ENTORNO = /Failed to load resource|WebSocket connection to 'ws:\/\/localhost:\d+\/realtime\//i;
function vigilarConsola(page: Page) {
  const errores: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !RUIDO_ENTORNO.test(msg.text())) errores.push(msg.text());
  });
  page.on("pageerror", (err) => errores.push(err.message));
  return errores;
}

async function prepararCoach(page: Page, extra: Record<string, unknown> = {}) {
  await page.request.put(`${STUB_URL}/__e2e/fixtures`, {
    data: { rol: "ADMIN", alumnos: [ALUMNO], contrataciones: [CONTRATACION], ...extra },
  });
  await page.context().addCookies([{ name: "sb-localhost-auth-token", value: `base64-${b64url(SESSION)}`, url: APP_URL }]);
}

async function abrirStudio(page: Page) {
  await page.goto("/studio");
  await expect(page.getByTestId("open-invite-student-btn")).toBeVisible({ timeout: 45_000 });
}

/**
 * El SSR del stub no lista alumnos (solo atiende `rol=eq.ALUMNO`; la carga usa `or=(…)`). Se llega a la ficha por
 * el camino real del coach: un alta (Edge Function interceptada) recarga la lista en el navegador, donde
 * `page.route` sí sirve al alumno sintético; luego se abre desde el buscador rápido.
 */
async function abrirFicha(page: Page) {
  await page.route("**/rest/v1/perfiles?*", (route) => {
    const req = route.request();
    if (req.method() !== "GET" || !decodeURIComponent(req.url()).includes("rol.eq.ALUMNO")) return route.continue();
    return responder(route, 200, [ALUMNO]);
  });
  await page.route("**/functions/v1/alta-alumno-directa", (route) =>
    responder(route, 201, {
      alumno_id: ALUMNO_ID,
      email: EMAIL_ALTA,
      password_temporal: PASSWORD_ALTA,
      email_enviado: false,
      mensaje: "Alumno creado.",
    }),
  );
  await abrirStudio(page);
  await page.getByTestId("open-invite-student-btn").click();
  await page.getByTestId("alta-email").fill(EMAIL_ALTA);
  await page.getByTestId("alta-monto-suscripcion").fill("15000");
  await page.getByTestId("invite-student-submit").click();
  await expect(page.getByTestId("alta-alumno-success")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Listo", exact: true }).click();

  const buscador = page.getByTestId("studio-quick-search-input");
  await expect(buscador).toBeVisible({ timeout: 45_000 });
  await buscador.click();
  await buscador.fill("Sintética");
  await page.getByTestId(`search-result-${ALUMNO_ID}`).first().click();
  await expect(page.getByTestId("student-detail-header")).toContainText(ALUMNO_NOMBRE, { timeout: 15_000 });
}

async function abrirPestanaGestion(page: Page, pestana: RegExp) {
  await page.getByText("Más gestión de la membresía", { exact: true }).click();
  await page.getByRole("button", { name: pestana }).click();
}

test.describe("GOZS-936 · Coach Studio pre-corte (develop): Alta, Ficha, Reset y Clases fijas", () => {
  test.afterEach(async ({ request }) => {
    await request.delete(`${STUB_URL}/__e2e/fixtures`).catch(() => {});
  });

  test.describe("Bloque A · Alta directa de alumno", () => {
    test("A-01: alta 201 muestra email y contraseña temporal, sin errores de consola", async ({ page }) => {
      const consola = vigilarConsola(page);
      await prepararCoach(page);
      const payloads: unknown[] = [];
      await page.route("**/functions/v1/alta-alumno-directa", (route) =>
        responder(
          route,
          201,
          { alumno_id: ALUMNO_ID, email: EMAIL_ALTA, password_temporal: PASSWORD_ALTA, email_enviado: false, mensaje: "Alumno creado." },
          (b) => payloads.push(b),
        ),
      );

      await abrirStudio(page);
      await page.getByTestId("open-invite-student-btn").click();
      await page.getByTestId("alta-email").fill(EMAIL_ALTA);
      await page.getByTestId("alta-monto-suscripcion").fill("15000");
      await page.getByTestId("invite-student-submit").click();

      const exito = page.getByTestId("alta-alumno-success");
      await expect(exito).toBeVisible({ timeout: 15_000 });
      await expect(exito).toContainText(EMAIL_ALTA);
      await expect(exito.getByText(PASSWORD_ALTA, { exact: true })).toBeVisible();
      expect(payloads).toHaveLength(1);
      expect(payloads[0]).toMatchObject({ email: EMAIL_ALTA });
      expect(consola).toEqual([]);
    });

    test("A-02: alta 409 muestra la alerta sin cerrar el modal y permite corregir el email", async ({ page }) => {
      const consola = vigilarConsola(page);
      await prepararCoach(page);
      const payloads: Array<{ email?: string }> = [];
      await page.route("**/functions/v1/alta-alumno-directa", (route) => {
        if (route.request().method() === "OPTIONS") return responder(route, 204, {});
        const email = (route.request().postDataJSON() as { email?: string }).email;
        return email === EMAIL_ALTA
          ? responder(route, 409, { error: "Ya existe un usuario registrado con ese email" }, (b) => payloads.push(b as { email?: string }))
          : responder(
              route,
              201,
              { alumno_id: ALUMNO_ID, email, password_temporal: PASSWORD_ALTA, email_enviado: false, mensaje: "Alumno creado." },
              (b) => payloads.push(b as { email?: string }),
            );
      });

      await abrirStudio(page);
      await page.getByTestId("open-invite-student-btn").click();
      await page.getByTestId("alta-email").fill(EMAIL_ALTA);
      await page.getByTestId("alta-monto-suscripcion").fill("15000");
      await page.getByTestId("invite-student-submit").click();

      const alerta = page.getByRole("alert").filter({ hasText: "Ya existe un usuario registrado con ese email" });
      await expect(alerta).toBeVisible({ timeout: 15_000 });
      // El modal sigue abierto con los datos cargados: no hubo éxito ni se perdió lo escrito.
      await expect(page.getByTestId("alta-alumno-success")).toHaveCount(0);
      await expect(page.getByTestId("alta-email")).toHaveValue(EMAIL_ALTA);

      // Corregir el email y reenviar funciona.
      await page.getByTestId("alta-email").fill("otra.sintetica@example.test");
      await page.getByTestId("invite-student-submit").click();
      await expect(page.getByTestId("alta-alumno-success")).toBeVisible({ timeout: 15_000 });
      expect(payloads.map((p) => p.email)).toEqual([EMAIL_ALTA, "otra.sintetica@example.test"]);
      expect(consola).toEqual([]);
    });
  });

  test.describe("Bloque B · Ficha sin datos demo y Reset de contraseña", () => {
    test("B-01: reset 200 → confirmación → clave temporal visible y se puede ocultar", async ({ page }) => {
      const consola = vigilarConsola(page);
      await prepararCoach(page);
      const payloads: unknown[] = [];
      await page.route("**/functions/v1/resetear-password-alumno", (route) =>
        responder(route, 200, { alumno_id: ALUMNO_ID, password_temporal: PASSWORD_RESET, mensaje: "Contraseña reseteada." }, (b) =>
          payloads.push(b),
        ),
      );

      await abrirFicha(page);
      await abrirPestanaGestion(page, /Nivel de Vista/);
      const panel = page.getByTestId("reset-password-alumno");
      await panel.scrollIntoViewIfNeeded();
      await expect(panel).toBeVisible();

      await page.getByTestId("btn-resetear-password").click();
      await expect(page.getByTestId("reset-password-confirmacion")).toBeVisible();
      await page.getByTestId("reset-password-confirmar").click();

      await expect(page.getByTestId("reset-password-exito")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("reset-password-temporal")).toHaveText(PASSWORD_RESET);
      expect(payloads).toEqual([{ alumno_id: ALUMNO_ID }]);

      await page.getByTestId("reset-password-listo").click();
      await expect(page.getByTestId("reset-password-exito")).toHaveCount(0);
      await expect(page.getByTestId("reset-password-temporal")).toHaveCount(0);
      await expect(page.getByTestId("btn-resetear-password")).toBeVisible();
      expect(consola).toEqual([]);
    });

    test("B-02: reset 403 muestra error humano (role=alert) y deja intacta la ficha", async ({ page }) => {
      const consola = vigilarConsola(page);
      await prepararCoach(page);
      await page.route("**/functions/v1/resetear-password-alumno", (route) => responder(route, 403, { error: "forbidden" }));

      await abrirFicha(page);
      // G5: la ficha muestra al alumno real (sintético) y ningún dato demo.
      await expect(page.getByTestId("student-detail-header")).toContainText(ALUMNO_NOMBRE);
      await expect(page.locator("body")).not.toContainText(/\bdemo\b/i);

      await abrirPestanaGestion(page, /Nivel de Vista/);
      await page.getByTestId("reset-password-alumno").scrollIntoViewIfNeeded();
      await page.getByTestId("btn-resetear-password").click();
      await page.getByTestId("reset-password-confirmar").click();

      const error = page.getByTestId("reset-password-error");
      await expect(error).toBeVisible({ timeout: 15_000 });
      await expect(error).toHaveAttribute("role", "alert");
      await expect(error).toContainText("No tenés permisos para resetear la contraseña de este alumno");
      await expect(page.getByTestId("reset-password-temporal")).toHaveCount(0);
      await expect(page.getByTestId("reset-password-exito")).toHaveCount(0);

      // La ficha sigue intacta y se puede reintentar.
      await expect(page.getByTestId("student-detail-header")).toContainText(ALUMNO_NOMBRE);
      await expect(page.getByTestId("btn-resetear-password")).toBeVisible();
      expect(consola).toEqual([]);
    });
  });

  test.describe("Bloque C · Clases fijas y errores reales (G12)", () => {
    async function servirHorarios(page: Page) {
      await page.route("**/rest/v1/clases_horario?*", (route) =>
        route.request().method() === "GET" ? responder(route, 200, HORARIOS) : route.continue(),
      );
      await page.route("**/rest/v1/clases_fijas?*", (route) =>
        route.request().method() === "GET" ? responder(route, 200, FIJAS) : route.continue(),
      );
    }

    test("C-01: renderiza clase fija del alumno y solo los horarios disponibles, sin datos demo", async ({ page }) => {
      const consola = vigilarConsola(page);
      await prepararCoach(page);
      await servirHorarios(page);

      await abrirFicha(page);
      await abrirPestanaGestion(page, /Contratación & Renovación/);
      const panel = page.getByTestId("clases-fijas-panel");
      await panel.scrollIntoViewIfNeeded();
      await expect(panel).toBeVisible();

      await expect(panel).toContainText("Lunes 18:00 · FUNCIONAL");
      await expect(panel.getByRole("button", { name: /Quitar clase fija Lunes 18:00 · FUNCIONAL/ })).toBeVisible();
      await expect(panel).not.toContainText("Sin clases fijas asignadas.");
      // El horario ya fijado no se ofrece de nuevo; el otro sí.
      const select = panel.getByLabel("Horario a fijar");
      await expect(select.locator("option")).toHaveText(["Elegí un horario…", "Miércoles 19:30 · FUNCIONAL"]);
      await expect(panel.getByRole("button", { name: "Fijar", exact: true })).toBeDisabled();
      await expect(panel.getByRole("alert")).toHaveCount(0);
      await expect(panel).not.toContainText(/\bdemo\b/i);
      expect(consola).toEqual([]);
    });

    for (const [status, code] of [
      [400, "GZ010"],
      [500, "XX000"],
    ] as const) {
      test(`C-02: asignar_clase_fija con HTTP ${status} muestra alerta dentro del panel sin romper la vista`, async ({ page }) => {
        const consola = vigilarConsola(page);
        await prepararCoach(page);
        await servirHorarios(page);
        const rpc: unknown[] = [];
        await page.route("**/rest/v1/rpc/asignar_clase_fija", (route) =>
          responder(route, status, { code, message: "fallo sintético", details: null, hint: null }, (b) => rpc.push(b)),
        );

        await abrirFicha(page);
        await abrirPestanaGestion(page, /Contratación & Renovación/);
        const panel = page.getByTestId("clases-fijas-panel");
        await panel.scrollIntoViewIfNeeded();
        await panel.getByLabel("Horario a fijar").selectOption(HORARIO_MIE);
        await panel.getByRole("button", { name: "Fijar", exact: true }).click();

        const alerta = panel.getByRole("alert");
        await expect(alerta).toBeVisible({ timeout: 15_000 });
        await expect(alerta).not.toBeEmpty();
        expect(rpc).toEqual([{ p_horario_id: HORARIO_MIE, p_alumno_id: ALUMNO_ID }]);

        // La vista sigue entera: el panel, la clase fija previa y la ficha no se rompieron.
        await expect(panel).toBeVisible();
        await expect(panel).toContainText("Lunes 18:00 · FUNCIONAL");
        await expect(page.getByTestId("student-detail-header")).toContainText(ALUMNO_NOMBRE);
        await expect(panel.getByRole("button", { name: "Fijar", exact: true })).toBeEnabled();
        expect(consola).toEqual([]);
      });
    }
  });
});
