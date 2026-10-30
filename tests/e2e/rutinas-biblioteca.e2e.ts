import { expect, test, type Page, type Route } from "@playwright/test";
import type { PlanEntrenamiento } from "@/types/database.types";

// GOZS-297: biblioteca /studio/rutinas contra el stub. El SSR lee las fixtures del stub;
// las llamadas del navegador (RPC, errores_app, recarga) se interceptan con page.route.
const STUB = "http://localhost:54321";
const COACH = "00000000-0000-4000-8000-000000000001";
const ANA = "00000000-0000-4000-8000-0000000000a1";
const BRUNO = "00000000-0000-4000-8000-0000000000b2";

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const session = {
  access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: COACH, exp: 4102444800, role: "authenticated" })}.sig`,
  refresh_token: "e2e-refresh",
  expires_at: 4102444800,
  expires_in: 3600,
  token_type: "bearer",
  user: { id: COACH, aud: "authenticated", role: "authenticated", email: "coach-e2e@gozster.test", app_metadata: {}, user_metadata: {} },
};

const alumno = (id: string, nombre_completo: string) => ({ id, nombre_completo, rol: "ALUMNO", email: `${id}@gozster.test` });
const plan = (over: Partial<PlanEntrenamiento> & Pick<PlanEntrenamiento, "id" | "nombre">): PlanEntrenamiento => ({
  profesor_id: COACH,
  alumno_id: null,
  estado: "ACTIVO",
  comentarios: null,
  fecha_inicio: "2026-10-01T00:00:00Z",
  fecha_fin: null,
  tipo: "DE_ALUMNO",
  etiqueta: null,
  plan_origen_id: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  ...over,
});

const PLANTILLA = plan({ id: "p-plantilla", nombre: "Fuerza Base", alumno_id: null, tipo: "PLANTILLA", etiqueta: "STANDARD" });
const ANA_VIEJA = plan({ id: "p-ana-octubre", nombre: "Ana Octubre", alumno_id: ANA });
const ANA_ARCHIVADA: PlanEntrenamiento = { ...ANA_VIEJA, estado: "INACTIVO", fecha_fin: "2026-10-29T12:00:00Z" };
const ANA_NUEVA = plan({ id: "p-ana-clon", nombre: "Fuerza Base", alumno_id: ANA, plan_origen_id: PLANTILLA.id, fecha_inicio: "2026-10-29T12:00:00Z" });
const ALUMNOS = [alumno(ANA, "Ana Pérez"), alumno(BRUNO, "Bruno Díaz")];

async function abrirBiblioteca(page: Page) {
  await page.request.put(`${STUB}/__e2e/fixtures`, { data: { alumnos: ALUMNOS, planes_entrenamiento: [PLANTILLA, ANA_VIEJA] } });
  await page.context().addCookies([
    { name: "sb-localhost-auth-token", value: `base64-${b64url(session)}`, url: "http://localhost:3100" },
  ]);
  await page.goto("/studio/rutinas");
  await expect(page.getByTestId("rutinas-library")).toBeVisible({ timeout: 60_000 });
}

/** Intercepta la RPC y errores_app del navegador; devuelve lo que la app envió. */
async function interceptar(page: Page, rpc: (route: Route) => Promise<void>) {
  const enviado = { rpc: [] as unknown[], errores: [] as Record<string, unknown>[] };
  await page.route("**/rest/v1/rpc/asignar_rutina_a_alumno", async (route) => {
    enviado.rpc.push(route.request().postDataJSON());
    await rpc(route);
  });
  await page.route("**/rest/v1/errores_app*", async (route) => {
    enviado.errores.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, body: "" });
  });
  return enviado;
}

const pestaña = (page: Page, nombre: RegExp) => page.getByRole("button", { name: nombre }).or(page.getByRole("tab", { name: nombre }));

test.describe("GOZS-297: biblioteca /studio/rutinas", () => {
  test.afterEach(async ({ request }) => {
    await request.delete(`${STUB}/__e2e/fixtures`);
  });

  test("asignar plantilla deja una sola ACTIVA y la anterior en Archivadas", async ({ page }) => {
    await abrirBiblioteca(page);
    await expect(pestaña(page, /Plantillas \(1\)/)).toBeVisible();
    await expect(pestaña(page, /Archivadas \(0\)/)).toBeVisible();
    await expect(page.getByTestId("rutina-item").filter({ hasText: "Fuerza Base" })).toContainText("STANDARD");

    const enviado = await interceptar(page, async (route) => {
      // Tras la RPC, la recarga del navegador ve el estado que deja asignar_rutina_a_alumno.
      await page.route("**/rest/v1/planes_entrenamiento?*", (r) =>
        r.fulfill({ json: [ANA_NUEVA, PLANTILLA, ANA_ARCHIVADA] }),
      );
      await route.fulfill({ json: ANA_NUEVA.id });
    });

    await page.getByTestId("rutina-item").filter({ hasText: "Fuerza Base" }).getByRole("button", { name: "Asignar a alumno" }).click();
    const dialogo = page.locator("dialog[open]");
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByRole("button", { name: "Asignar", exact: true })).toBeDisabled();
    await dialogo.locator("#rutinas-alumno").selectOption(ANA);
    await dialogo.getByRole("button", { name: "Asignar", exact: true }).click();

    // Abre el clon en el constructor con el alumno en contexto.
    const builder = page.getByTestId("routine-builder-modal");
    await expect(builder).toBeVisible();
    await expect(builder).toContainText("Ana Pérez");
    expect(enviado.rpc).toEqual([{ p_plan_id: PLANTILLA.id, p_alumno_id: ANA }]);
    expect(enviado.errores).toHaveLength(0);
    await builder.getByRole("button", { name: "✕" }).click();

    await pestaña(page, /De alumnos \(1\)/).click();
    const activas = page.getByTestId("rutina-item").filter({ hasText: "ACTIVO" });
    await expect(activas).toHaveCount(1);
    await expect(activas).toContainText("Ana Pérez");
    await expect(activas).not.toContainText("STANDARD");

    await pestaña(page, /Archivadas \(1\)/).click();
    const archivada = page.getByTestId("rutina-item").filter({ hasText: "Ana Octubre" });
    await expect(archivada).toBeVisible();
    await expect(archivada).toContainText("Ana Pérez");
    await expect(archivada.getByRole("button")).toHaveCount(0); // solo lectura
  });

  test("error técnico: mensaje humano en pantalla y fila en errores_app", async ({ page }) => {
    await abrirBiblioteca(page);
    const crudo = 'permission denied for table planes_entrenamiento';
    const enviado = await interceptar(page, (route) =>
      route.fulfill({ status: 403, json: { code: "42501", message: crudo, details: null, hint: null } }),
    );

    await page.getByRole("button", { name: "Asignar a alumno" }).click();
    const dialogo = page.locator("dialog[open]");
    await dialogo.locator("#rutinas-alumno").selectOption(BRUNO);
    await dialogo.getByRole("button", { name: "Asignar", exact: true }).click();

    await expect(dialogo.getByRole("alert")).toHaveText("No pudimos asignar la rutina. Intenta de nuevo.");
    await expect(page.getByText(crudo)).toHaveCount(0);
    await expect(page.getByTestId("routine-builder-modal")).toHaveCount(0);
    await expect.poll(() => enviado.errores.length).toBe(1);
    expect(enviado.errores[0]).toMatchObject({
      usuario_id: COACH,
      contexto: "asignar_rutina",
      mensaje_humano: "No pudimos asignar la rutina. Intenta de nuevo.",
      detalle_tecnico: `42501: ${crudo}`,
      payload_resumen: { plan_id: PLANTILLA.id, alumno_id: BRUNO },
    });
  });

  test("error de negocio GZ010: muestra el mensaje de la RPC", async ({ page }) => {
    await abrirBiblioteca(page);
    const enviado = await interceptar(page, (route) =>
      route.fulfill({ status: 400, json: { code: "GZ010", message: "Ese alumno no está asignado a tu cuenta", details: null, hint: null } }),
    );

    await page.getByRole("button", { name: "Asignar a alumno" }).click();
    const dialogo = page.locator("dialog[open]");
    await dialogo.locator("#rutinas-alumno").selectOption(BRUNO);
    await dialogo.getByRole("button", { name: "Asignar", exact: true }).click();

    await expect(dialogo.getByRole("alert")).toHaveText("Ese alumno no está asignado a tu cuenta");
    await expect.poll(() => enviado.errores.length).toBe(1);
    expect(enviado.errores[0]).toMatchObject({ contexto: "asignar_rutina", detalle_tecnico: "GZ010: Ese alumno no está asignado a tu cuenta" });

    // Cancelar cierra el diálogo y al reabrirlo no queda el error anterior.
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await page.getByRole("button", { name: "Asignar a alumno" }).click();
    await expect(page.locator("dialog[open]").getByRole("alert")).toHaveCount(0);
  });
});
