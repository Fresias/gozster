import { expect, test, type Page } from "@playwright/test";

// GOZS-897 · Suite permanente de resiliencia del Coach Studio contra el stub local (datos sintéticos, G4/G5):
//  - GOZS-893 (PR #713): error de carga del catálogo de ejercicios + Reintentar.
//  - GOZS-872 (PR #702): usa_barra (chip, filtro, toggle y payload).
//  - GOZS-885 (PR #711): señal de sincronización del Ranking Funcional (sin conexión / error / reintento).
// El stub fuerza fallos de lectura por tabla con PUT /__e2e/fallos; los fallos de RPC se simulan con page.route.
const STUB_URL = process.env.E2E_STUB_URL ?? "http://localhost:54321";
const APP_URL = process.env.E2E_APP_URL ?? "http://localhost:3100";
const COACH_ID = "00000000-0000-4000-8000-000000000001";

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

type Fila = Record<string, unknown>;
type Llamada = { method: string; path: string; body: unknown };

async function iniciarSesionStaff(page: Page, fixtures: Fila) {
  const res = await page.request.put(`${STUB_URL}/__e2e/fixtures`, { data: fixtures });
  expect(res.ok()).toBe(true);
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

async function llamadas(page: Page): Promise<Llamada[]> {
  const res = await page.request.get(`${STUB_URL}/__llamadas`);
  return ((await res.json()) as { llamadas: Llamada[] }).llamadas;
}

const ejercicio = (id: string, nombre: string, usa_barra: boolean): Fila => ({
  id,
  nombre,
  comentario: null,
  url_video: null,
  musculos_principales: ["cuadriceps"],
  musculos_secundarios: [],
  usa_barra,
  created_at: "2026-11-02T10:00:00-03:00",
  updated_at: "2026-11-02T10:00:00-03:00",
});

async function abrirCatalogo(page: Page) {
  await page.goto("/studio/rutinas");
  await expect(page.getByTestId("rutinas-library")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("tab-biblioteca-ejercicios").click();
  await expect(page.getByTestId("ejercicios-library-tab")).toBeVisible();
}

const ID_CON = "44444444-4444-4444-8444-4444444444c1";
const ID_SIN = "44444444-4444-4444-8444-4444444444c2";
const CATALOGO = [ejercicio(ID_CON, "Sentadilla Sintética", true), ejercicio(ID_SIN, "Jalón Sintético agarre neutro", false)];

test.describe("GOZS-897 · Studio resiliencia", () => {
  test.afterEach(async ({ request }) => {
    await request.delete(`${STUB_URL}/__e2e/fixtures`).catch(() => {});
  });

  test("SR-01 · GOZS-893: catálogo con error 500 muestra alerta (no vacío) y Reintentar recupera", async ({ page }) => {
    await iniciarSesionStaff(page, { alumnos: [], planes_entrenamiento: [], ejercicios: CATALOGO });
    await forzarFallos(page, { ejercicios: 500 });
    await abrirCatalogo(page);

    const alerta = page.getByTestId("ejercicios-load-error");
    await expect(alerta).toBeVisible();
    await expect(alerta).toHaveAttribute("role", "alert");
    await expect(page.getByTestId("empty-state-ejercicios")).toHaveCount(0);
    await expect(page.getByTestId("ejercicios-list")).toHaveCount(0);

    // Se restaura la respuesta del catálogo y se reintenta.
    await forzarFallos(page, {});
    await page.getByTestId("btn-reintentar-carga-ejercicios").click();

    await expect(page.getByTestId("ejercicios-load-error")).toHaveCount(0);
    await expect(page.getByTestId("ejercicios-list")).toBeVisible();
    await expect(page.getByTestId(`ejercicio-card-${ID_CON}`)).toBeVisible();
    await expect(page.getByTestId(`ejercicio-card-${ID_SIN}`)).toBeVisible();
    await expect(page.getByTestId("empty-state-ejercicios")).toHaveCount(0);
  });

  test("SR-02 · GOZS-872: usa_barra en chip, filtro, edición y alta (payload)", async ({ page }) => {
    await iniciarSesionStaff(page, { alumnos: [], planes_entrenamiento: [], ejercicios: CATALOGO });
    await abrirCatalogo(page);

    await expect(page.getByTestId(`ejercicio-barra-${ID_CON}`)).toBeVisible();
    await expect(page.getByTestId(`ejercicio-barra-${ID_SIN}`)).toHaveCount(0);

    const filtro = page.getByTestId("filtro-barra");
    await filtro.click();
    await expect(filtro).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId(`ejercicio-card-${ID_CON}`)).toBeVisible();
    await expect(page.getByTestId(`ejercicio-card-${ID_SIN}`)).toHaveCount(0);
    await filtro.click();
    await expect(page.getByTestId(`ejercicio-card-${ID_SIN}`)).toBeVisible();

    // Editar: el ejercicio sin barra pasa a usar barra y el PATCH lo persiste.
    await page.getByTestId(`btn-editar-ejercicio-${ID_SIN}`).click();
    const chip = page.getByTestId("chip-usa-barra");
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("btn-guardar-ejercicio").click();
    await expect(page.getByTestId("dialog-ejercicio")).toHaveCount(0);
    await expect
      .poll(async () => (await llamadas(page)).filter((c) => c.method === "PATCH" && c.path.endsWith("/ejercicios")).length)
      .toBe(1);
    const patch = (await llamadas(page)).find((c) => c.method === "PATCH" && c.path.endsWith("/ejercicios"))!;
    expect(patch.body).toMatchObject({ nombre: "Jalón Sintético agarre neutro", usa_barra: true });
    await expect(page.getByTestId(`ejercicio-barra-${ID_SIN}`)).toBeVisible();

    // Alta: arranca sin barra; con el chip activo el POST lleva usa_barra: true.
    await page.getByTestId("ejercicios-filters-container").getByTestId("btn-nuevo-ejercicio").click();
    await expect(page.getByTestId("chip-usa-barra")).toHaveAttribute("aria-pressed", "false");
    await page.getByTestId("input-ejercicio-nombre").fill("Press Sintético");
    await page.getByTestId("chip-usa-barra").click();
    await page.getByTestId("btn-guardar-ejercicio").click();
    await expect(page.getByTestId("dialog-ejercicio")).toHaveCount(0);
    await expect
      .poll(async () => (await llamadas(page)).filter((c) => c.method === "POST" && c.path.endsWith("/ejercicios")).length)
      .toBe(1);
    const post = (await llamadas(page)).find((c) => c.method === "POST" && c.path.endsWith("/ejercicios"))!;
    expect(post.body).toMatchObject({ nombre: "Press Sintético", usa_barra: true });
  });

  test.describe("Ranking Funcional · GOZS-885", () => {
    const ALUMNO = "55555555-5555-4555-8555-555555555501";
    const EJ = "66666666-6666-4666-8666-666666666601";
    const CLASE = "77777777-7777-4777-8777-777777777701";
    const ahora = "2026-11-27T10:00:00-03:00";
    const fixtures: Fila = {
      alumnos: [
        {
          id: ALUMNO,
          nombre_completo: "Alumno Sintético Uno",
          rol: "ALUMNO",
          email: "alumno-uno@gozster.test",
          sexo: "M",
          peso_corporal_kg: 80,
        },
      ],
      planes_entrenamiento: [],
      ejercicios: [ejercicio(EJ, "Dominadas Sintéticas", false)],
      clases: [
        {
          id: CLASE,
          horario_id: "88888888-8888-4888-8888-888888888801",
          actividad: "FUNCIONAL",
          inicio: "2099-01-01T10:00:00-03:00",
          duracion_minutos: 60,
          capacidad: 8,
          estado: "PROGRAMADA",
          motivo_cancelacion: null,
          created_at: ahora,
          updated_at: ahora,
        },
      ],
      reservas: [
        { id: "99999999-9999-4999-8999-999999999901", clase_id: CLASE, alumno_id: ALUMNO, estado: "ANOTADO", created_at: ahora, updated_at: ahora },
      ],
      v_prs: [],
    };
    const estado = (page: Page) => page.getByTestId("ranking-sync-estado");

    async function abrirRanking(page: Page) {
      await page.goto("/studio/ranking-funcional");
      await expect(page.getByTestId("ranking-funcional-view")).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId(`student-row-${ALUMNO}`)).toBeVisible();
    }

    test("SR-03 · error al cargar PRs → señal de error → Reintentar → al día", async ({ page }) => {
      await iniciarSesionStaff(page, fixtures);
      await forzarFallos(page, { v_prs: 500 });
      await abrirRanking(page);

      await expect(estado(page)).toHaveAttribute("data-estado", "error");
      await expect(page.getByTestId("ranking-sync-reintentar")).toBeVisible();

      await forzarFallos(page, {});
      await page.getByTestId("ranking-sync-reintentar").click();
      await expect(estado(page)).toHaveAttribute("data-estado", "al-dia");
      await expect(page.getByTestId("ranking-sync-reintentar")).toHaveCount(0);
    });

    test("SR-04 · sin conexión: la marca no se pierde y la señal vuelve a al-día al reconectar", async ({ page, context }) => {
      await iniciarSesionStaff(page, fixtures);
      await abrirRanking(page);
      await expect(estado(page)).toHaveAttribute("data-estado", "al-dia");

      await context.setOffline(true);
      await expect(estado(page)).toHaveAttribute("data-estado", "sin-conexion");
      await expect(estado(page)).toContainText("Sin conexión");

      await page.getByTestId(`input-pr-peso-${ALUMNO}`).fill("100");
      await page.getByTestId(`save-pr-btn-${ALUMNO}`).click();
      await expect(page.getByText(/Sin conexión: la marca se sincroniza al reconectar/)).toBeVisible();
      await expect(page.getByTestId(`input-pr-peso-${ALUMNO}`)).toHaveValue("100");
      // Sin red no se intenta la RPC: la marca queda solo en la cola local.
      expect((await llamadas(page)).filter((c) => c.path.endsWith("/rpc/registrar_marca_funcional"))).toHaveLength(0);

      await context.setOffline(false);
      await expect(estado(page)).toHaveAttribute("data-estado", "al-dia");
      await expect(page.getByTestId(`input-pr-peso-${ALUMNO}`)).toHaveValue("100");
    });

    test("SR-05 · RPC de marca falla (500) conserva el dato; al recuperar, el reintento envía la marca", async ({ page }) => {
      await iniciarSesionStaff(page, fixtures);
      await abrirRanking(page);

      await page.route("**/rest/v1/rpc/registrar_marca_funcional", (route) =>
        route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ code: "XX000", message: "fallo forzado" }) }),
      );
      await page.getByTestId(`input-pr-peso-${ALUMNO}`).fill("90");
      await page.getByTestId(`save-pr-btn-${ALUMNO}`).click();
      await expect(page.getByRole("alert").filter({ hasText: /No se pudo guardar en el servidor/ })).toBeVisible();
      await expect(page.getByTestId(`input-pr-peso-${ALUMNO}`)).toHaveValue("90");

      await page.unroute("**/rest/v1/rpc/registrar_marca_funcional");
      await page.getByTestId(`input-pr-peso-${ALUMNO}`).fill("95");
      await page.getByTestId(`save-pr-btn-${ALUMNO}`).click();
      await expect
        .poll(async () => (await llamadas(page)).filter((c) => c.path.endsWith("/rpc/registrar_marca_funcional")).length)
        .toBe(1);
      const rpc = (await llamadas(page)).find((c) => c.path.endsWith("/rpc/registrar_marca_funcional"))!;
      expect(rpc.body).toMatchObject({ p_alumno_id: ALUMNO, p_ejercicio_id: EJ, p_peso_kg: 95 });
      await expect(estado(page)).toHaveAttribute("data-estado", "al-dia");
    });
  });
});
