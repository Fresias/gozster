import { expect, test, type Page, type Route } from "@playwright/test";

// GOZS-813 · Red de seguridad pre-lanzamiento del Coach Studio (Go/No-go 4/12, alpha cerrada sin Resend).
// F-1 alta directa, F-7 reseteo de contraseña, F-12 renovar / extensión excepcional. Fixtures 100 % sintéticos.
// Las Edge Functions y RPCs se interceptan con page.route (el stub no las implementa); cero cambios en src/.
const STUB_URL = process.env.E2E_STUB_URL ?? "http://localhost:54321";
const APP_URL = process.env.E2E_APP_URL ?? "http://localhost:3100";

const COACH_ID = "00000000-0000-4000-8000-000000000001";
const ALUMNO_ID = "bbbbbbbb-0000-4000-8000-000000000b01";
const CONTRATACION_ID = "cccccccc-0000-4000-8000-000000000c01";
const ALUMNO_NOMBRE = "Alumno Sintético QA";
const PASSWORD_ALTA = "Temp-Alta-7Q2x";
const PASSWORD_RESET = "Temp-Reset-9K4m";

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const SESSION = {
  access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({
    sub: COACH_ID,
    exp: 4102444800,
    role: "authenticated",
  })}.sig`,
  refresh_token: "e2e-refresh",
  expires_at: 4102444800,
  expires_in: 3600,
  token_type: "bearer",
  user: {
    id: COACH_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "coach-e2e@gozster.test",
    app_metadata: {},
    user_metadata: {},
  },
};

const ALUMNO = {
  id: ALUMNO_ID,
  nombre_completo: ALUMNO_NOMBRE,
  email: "alumno.sintetico@example.test",
  telefono: "+54 9 11 0000-0000",
  rol: "ALUMNO",
  estado_membresia: "ACTIVA",
  peso_corporal_kg: 70,
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

async function prepararCoach(page: Page) {
  await page.request.put(`${STUB_URL}/__e2e/fixtures`, {
    data: { rol: "ADMIN", alumnos: [ALUMNO], contrataciones: [CONTRATACION] },
  });
  await page.context().addCookies([
    { name: "sb-localhost-auth-token", value: `base64-${b64url(SESSION)}`, url: APP_URL },
  ]);
}

/**
 * El SSR del stub no lista alumnos (solo atiende `rol=eq.ALUMNO`, la carga usa `or=(rol.eq.ALUMNO,…)`).
 * Se llega a la ficha por el camino real del coach: un alta (Edge Function interceptada) recarga la
 * lista en el navegador, donde `page.route` sí sirve al alumno sintético.
 */
async function abrirFicha(page: Page, pestana: RegExp) {
  await page.route("**/rest/v1/perfiles?*", (route) => {
    const req = route.request();
    if (req.method() !== "GET" || !decodeURIComponent(req.url()).includes("rol.eq.ALUMNO")) return route.continue();
    return responder(route, 200, [ALUMNO]);
  });
  await page.route("**/functions/v1/alta-alumno-directa", (route) =>
    responder(route, 201, {
      alumno_id: ALUMNO_ID,
      email: ALUMNO.email,
      password_temporal: PASSWORD_ALTA,
      email_enviado: false,
      mensaje: "Alumno creado.",
    }),
  );
  await page.goto("/studio");
  await expect(page.getByTestId("open-invite-student-btn")).toBeVisible({ timeout: 45_000 });
  await page.getByTestId("open-invite-student-btn").click();
  await page.getByTestId("alta-email").fill(ALUMNO.email);
  await page.getByTestId("alta-monto-suscripcion").fill("15000");
  await page.getByTestId("invite-student-submit").click();
  await expect(page.getByTestId("alta-alumno-success")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Listo", exact: true }).click();

  const buscador = page.getByTestId("studio-quick-search-input");
  await expect(buscador).toBeVisible({ timeout: 45_000 });
  await buscador.click();
  await buscador.fill("Sintético");
  await page.getByTestId(`search-result-${ALUMNO_ID}`).first().click();
  await expect(page.getByTestId("student-detail-header")).toContainText(ALUMNO_NOMBRE, { timeout: 15_000 });
  // Contratación y acceso viven en la gestión ampliada de la isla Membresía (<details> + pestañas).
  await page.getByText("Más gestión de la membresía", { exact: true }).click();
  await page.getByRole("button", { name: pestana }).click();
}

test.describe("QA pre-lanzamiento · Coach Studio (GOZS-813)", () => {
  test.afterEach(async ({ request }) => {
    await request.delete(`${STUB_URL}/__e2e/fixtures`).catch(() => {});
  });

  test("S-01: alta directa envía el payload correcto y muestra la contraseña temporal copiable", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: APP_URL });
    await prepararCoach(page);
    const payloads: unknown[] = [];
    await page.route("**/functions/v1/alta-alumno-directa", (route) =>
      responder(
        route,
        201,
        {
          alumno_id: "dddddddd-0000-4000-8000-000000000d01",
          email: "nuevo.sintetico@example.test",
          password_temporal: PASSWORD_ALTA,
          email_enviado: false,
          mensaje: "Alumno creado. Compartile las credenciales.",
        },
        (b) => payloads.push(b),
      ),
    );

    await page.goto("/studio");
    await expect(page.getByTestId("open-invite-student-btn")).toBeVisible({ timeout: 45_000 });
    await page.getByTestId("open-invite-student-btn").click();

    await page.getByTestId("alta-email").fill("Nuevo.Sintetico@Example.test");
    await page.getByTestId("alta-nombre").fill("Nuevo Sintético QA");
    await page.getByTestId("alta-telefono").fill("+54 9 11 1111-1111");
    await page.getByTestId("alta-peso").fill("62.5");
    await page.getByTestId("alta-monto-suscripcion").fill("15000");
    await page.getByTestId("invite-student-submit").click();

    const exito = page.getByTestId("alta-alumno-success");
    await expect(exito).toBeVisible({ timeout: 15_000 });
    await expect(exito.getByText(PASSWORD_ALTA, { exact: true })).toBeVisible();

    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toEqual({
      email: "nuevo.sintetico@example.test",
      nombre_completo: "Nuevo Sintético QA",
      telefono: "+54 9 11 1111-1111",
      sexo: "F",
      peso_corporal_kg: 62.5,
    });

    await page.getByTestId("alta-alumno-copiar").click();
    await expect(page.getByTestId("alta-alumno-copiar")).toContainText("copiadas");
    const portapapeles = await page.evaluate(() => navigator.clipboard.readText());
    expect(portapapeles).toContain(PASSWORD_ALTA);
  });

  test("S-02: reseteo de contraseña muestra la clave temporal y maneja el error de la función", async ({ page }) => {
    await prepararCoach(page);
    const payloads: unknown[] = [];
    let intento = 0;
    await page.route("**/functions/v1/resetear-password-alumno", (route) => {
      if (route.request().method() === "OPTIONS") return responder(route, 204, {});
      intento += 1;
      return intento === 1
        ? responder(route, 500, { error: "boom" }, (b) => payloads.push(b))
        : responder(
            route,
            200,
            { alumno_id: ALUMNO_ID, password_temporal: PASSWORD_RESET, mensaje: "Contraseña reseteada." },
            (b) => payloads.push(b),
          );
    });

    await abrirFicha(page, /Nivel de Vista/);
    const panel = page.getByTestId("reset-password-alumno");
    await panel.scrollIntoViewIfNeeded();

    // 1.º intento: la función falla → mensaje de error y se puede reintentar.
    await page.getByTestId("btn-resetear-password").click();
    await page.getByTestId("reset-password-confirmar").click();
    await expect(page.getByTestId("reset-password-error")).toContainText("No se pudo resetear la contraseña");
    await expect(page.getByTestId("reset-password-temporal")).toHaveCount(0);

    // 2.º intento: éxito → clave temporal visible.
    await page.getByTestId("btn-resetear-password").click();
    await page.getByTestId("reset-password-confirmar").click();
    await expect(page.getByTestId("reset-password-exito")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("reset-password-temporal")).toHaveText(PASSWORD_RESET);
    expect(payloads).toEqual([{ alumno_id: ALUMNO_ID }, { alumno_id: ALUMNO_ID }]);
  });

  test("S-03: F-12 renovar + extensión excepcional vía RPC, sin botón «Extender vigencia»", async ({ page }) => {
    await prepararCoach(page);
    const renovar: unknown[] = [];
    const extender: unknown[] = [];
    await page.route("**/rest/v1/rpc/renovar_contratacion", (route) =>
      responder(route, 200, [{ fecha_fin: "2027-01-10", estado: "ACTIVA" }], (b) => renovar.push(b)),
    );
    await page.route("**/rest/v1/rpc/extender_contratacion_excepcional", (route) =>
      responder(route, 200, [{ ...CONTRATACION, fecha_fin: "2027-02-15" }], (b) => extender.push(b)),
    );

    await abrirFicha(page, /Contratación & Renovación/);
    const panel = page.getByTestId("contratacion-panel");
    await panel.scrollIntoViewIfNeeded();
    await expect(panel).toBeVisible();

    // Poda F-12: no existe ningún control «Extender vigencia».
    await expect(page.getByRole("button", { name: /extender vigencia/i })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(/extender vigencia/i);

    await expect(page.getByTestId("fecha-vencimiento")).toContainText("2026");
    await page.getByTestId("renovacion-medio").selectOption("EFECTIVO");
    await page.getByTestId("renovacion-monto").fill("15000");
    await page.getByTestId("renovacion-confirmar").click();
    await expect(page.getByTestId("fecha-vencimiento")).toContainText("2027", { timeout: 15_000 });
    expect(renovar).toEqual([
      {
        p_contratacion_id: CONTRATACION_ID,
        p_monto: 15000,
        p_medio_pago: "EFECTIVO",
        p_idempotency_key: `renov-${CONTRATACION_ID}-2026-12-10-EFECTIVO`,
      },
    ]);

    await page.getByTestId("extension-fecha").fill("2027-02-15");
    await page.getByTestId("extension-motivo").fill("Compensación por viaje coordinado (sintético).");
    await page.getByTestId("extension-confirmar").click();
    await expect(page.getByTestId("fecha-vencimiento")).toContainText("feb", { timeout: 15_000 });
    expect(extender).toEqual([
      {
        p_contratacion_id: CONTRATACION_ID,
        p_nueva_fecha_fin: "2027-02-15",
        p_motivo: "Compensación por viaje coordinado (sintético).",
      },
    ]);
  });
});
