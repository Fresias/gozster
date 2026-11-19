import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const STUB_URL = process.env.E2E_STUB_URL ?? "http://localhost:54321";
const APP_URL = process.env.E2E_APP_URL ?? "http://localhost:3100";

const FIXTURE_BASE = JSON.parse(
  readFileSync(join(process.cwd(), "tests", "e2e", "fixtures", "athlete-v7.json"), "utf8"),
);

const LUCIA_ID: string = FIXTURE_BASE.user.id;
const EJ_SQ = FIXTURE_BASE.ejercicios_en_rutina[0].id as string;
const EJ_SQ_CATALOG_ID = FIXTURE_BASE.ejercicios_en_rutina[0].ejercicio_id as string;
const EJ_BP = FIXTURE_BASE.ejercicios_en_rutina[1].id as string;
const EJ_BP_CATALOG_ID = FIXTURE_BASE.ejercicios_en_rutina[1].ejercicio_id as string;
const SESION_FIJA_ID = "aaaaaaaa-1111-4111-8111-111111111101";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

function buildSessionCookie(user = FIXTURE_BASE.user) {
  return {
    access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({
      sub: user.id,
      exp: 4102444800,
      role: "authenticated",
    })}.sig`,
    refresh_token: "e2e-refresh",
    expires_at: 4102444800,
    expires_in: 3600,
    token_type: "bearer",
    user,
  };
}

interface PrepararOpciones {
  tema?: "light" | "dark";
  fixture?: Record<string, unknown>;
  onboardingCompletado?: boolean;
  seedCurrentSession?: boolean;
  athleteStore?: Record<string, unknown>;
}

async function prepararEntorno(page: Page, opts: PrepararOpciones = {}) {
  const tema = opts.tema ?? "light";
  const fixture = opts.fixture ?? structuredClone(FIXTURE_BASE);
  await page.request.put(`${STUB_URL}/__e2e/fixtures`, { data: fixture });

  await page.context().addCookies([
    {
      name: "sb-localhost-auth-token",
      value: `base64-${b64url(buildSessionCookie(FIXTURE_BASE.user))}`,
      url: APP_URL,
    },
  ]);

  await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date("2026-11-17T10:00:00-03:00"));

  const state: Record<string, unknown> = {
    onboardingCompletado: opts.onboardingCompletado ?? true,
    mostrarTimerDescanso: true,
    nivelVistaAlumno: "SIMPLE",
    membershipStatus: "ACTIVE",
    ...(opts.seedCurrentSession === false
      ? {}
      : {
          currentSession: {
            id: SESION_FIJA_ID,
            nombre_rutina: "Lucía Fernández: DÍA 1",
            fecha: "2026-11-17",
            ejercicios: [],
            studentId: LUCIA_ID,
            studentName: "Lucía Fernández",
          },
        }),
    ...(opts.athleteStore ?? {}),
  };

  const storeJson = JSON.stringify({ state, version: 2 });

  await page.addInitScript(
    ({ theme, userId, json }) => {
      try {
        window.localStorage.setItem("gozster-theme", theme);
        // Sembrar solo en la primera carga para que page.reload() pruebe persistencia real.
        if (!window.localStorage.getItem("__e2e_seeded")) {
          window.localStorage.setItem("__e2e_seeded", "1");
          window.localStorage.setItem(`gozster-athlete-store:${userId}`, json);
        }
      } catch {
        // ignore
      }
    },
    { theme: tema, userId: LUCIA_ID, json: storeJson },
  );
}

async function omitirDescansoSiVisible(page: Page) {
  const omitir = page.getByRole("button", { name: "Omitir" });
  if (await omitir.isVisible().catch(() => false)) {
    await omitir.click();
  }
}

async function getLlamadas(request: APIRequestContext) {
  const res = await request.get(`${STUB_URL}/__llamadas`);
  const json = (await res.json()) as {
    llamadas: Array<{ method: string; path: string; query: string; body: Record<string, unknown> }>;
  };
  return json.llamadas;
}

test.describe("@mobile Athlete v7 · Capa C Funcional (QA-02)", () => {
  test.afterEach(async ({ context, request }) => {
    await context.setOffline(false).catch(() => {});
    await request.put(`${STUB_URL}/__e2e/storage-error`, { data: { status: null } }).catch(() => {});
  });

  test.afterAll(async ({ request }) => {
    await request.delete(`${STUB_URL}/__e2e/fixtures`).catch(() => {});
  });

  test("F-00: sesión nueva usa UUID real y la serie registrada llega a registro_series", async ({
    page,
    request,
  }) => {
    const fixture = structuredClone(FIXTURE_BASE);
    const idsBase = new Set<string>(
      (fixture.registro_sesiones as Array<{ id: string }>).map((s) => s.id),
    );
    await prepararEntorno(page, { fixture, seedCurrentSession: false });

    await page.goto("/athlete");
    await expect(page.getByTestId("empezar-dia-btn")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("empezar-dia-btn").click();
    await page.getByTestId(`exercise-select-btn-${EJ_SQ}`).click();
    await expect(page.getByTestId("registrar-serie-btn")).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("registrar-serie-btn").click();
    await omitirDescansoSiVisible(page);
    await expect(page.getByTestId(`log-row-${EJ_SQ}-1`)).toBeVisible();

    await page.getByTestId("volver-a-rutina-btn").click();
    await page.getByTestId("terminar-entrenamiento-btn-entrenar").click();
    await page.getByTestId("terminar-confirmar-btn").click();
    await expect(page.getByTestId("cierre-dia-modal")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("cierre-dia-estado-chip")).toContainText("Guardada y sincronizada");

    await expect
      .poll(async () => {
        const seriesRes = await request.get(
          `${STUB_URL}/rest/v1/registro_series?ejercicio_id=eq.${EJ_SQ_CATALOG_ID}`,
        );
        const series = (await seriesRes.json()) as Array<{
          sesion_id: string;
          ejercicio_id: string;
          numero_serie: number;
          completada: boolean;
        }>;
        return series.find((s) => !idsBase.has(s.sesion_id) && s.numero_serie === 1) ?? null;
      })
      .not.toBeNull();

    const sesionesRes = await request.get(`${STUB_URL}/rest/v1/registro_sesiones`);
    const sesiones = (await sesionesRes.json()) as Array<{ id: string }>;
    const nuevasSesiones = sesiones.filter((s) => !idsBase.has(s.id));
    expect(nuevasSesiones).toHaveLength(1);
    const nuevaSesionId = nuevasSesiones[0]!.id;
    expect(nuevaSesionId).toMatch(UUID_REGEX);

    const seriesRes = await request.get(
      `${STUB_URL}/rest/v1/registro_series?sesion_id=eq.${nuevaSesionId}`,
    );
    const seriesNuevas = (await seriesRes.json()) as Array<{
      sesion_id: string;
      ejercicio_id: string;
      numero_serie: number;
      completada: boolean;
    }>;
    expect(seriesNuevas).toHaveLength(1);
    expect(seriesNuevas[0]!.ejercicio_id).toBe(EJ_SQ_CATALOG_ID);
    expect(seriesNuevas[0]!.completada).toBe(true);
  });

  test("F-01: paso 2 del onboarding guarda nombre preferido y persiste al recargar", async ({
    page,
    request,
  }) => {
    const fixture = structuredClone(FIXTURE_BASE);
    fixture.perfil.nombre_preferido = null;
    fixture.alumnos[0].nombre_preferido = null;
    await prepararEntorno(page, { fixture, onboardingCompletado: false });

    await page.goto("/athlete");
    const dlg = page.getByRole("dialog", { name: "Bienvenida a GOZSter" });
    await expect(dlg).toBeVisible({ timeout: 25_000 });
    await dlg.getByRole("button", { name: "Empezar" }).click();
    await expect(dlg.getByTestId("onboarding-paso-nombre")).toBeVisible();

    await dlg.getByLabel("Nombre o apodo").fill("Lu");
    await dlg.getByRole("button", { name: "Continuar" }).click();
    await dlg.getByRole("button", { name: "Continuar con Simple" }).click();
    await dlg.getByRole("button", { name: "Listo, ver mis días" }).click();

    const inicio = page.getByTestId("inicio-mis-dias-container");
    await expect(inicio).toBeVisible({ timeout: 15_000 });
    await expect(inicio.getByText("Hola, Lu", { exact: true })).toBeVisible();

    const llamadas = await getLlamadas(request);
    const rpc = llamadas.find((c) => c.path.includes("actualizar_nombre_preferido"));
    expect(rpc?.body?.p_nombre).toBe("Lu");

    await page.reload();
    await expect(inicio).toBeVisible({ timeout: 25_000 });
    await expect(inicio.getByText("Hola, Lu", { exact: true })).toBeVisible();
  });

  test("F-02: paso 2 vacío muestra primer nombre del nombre completo y deja nombre_preferido NULL", async ({
    page,
    request,
  }) => {
    const fixture = structuredClone(FIXTURE_BASE);
    fixture.perfil.nombre_preferido = null;
    fixture.alumnos[0].nombre_preferido = null;
    await prepararEntorno(page, { fixture, onboardingCompletado: false });

    await page.goto("/athlete");
    const dlg = page.getByRole("dialog", { name: "Bienvenida a GOZSter" });
    await expect(dlg).toBeVisible({ timeout: 25_000 });
    await dlg.getByRole("button", { name: "Empezar" }).click();
    await expect(dlg.getByTestId("onboarding-paso-nombre")).toBeVisible();

    await dlg.getByLabel("Nombre o apodo").fill("");
    await dlg.getByRole("button", { name: "Continuar" }).click();
    await dlg.getByRole("button", { name: "Continuar con Simple" }).click();
    await dlg.getByRole("button", { name: "Listo, ver mis días" }).click();

    await expect(page.getByTestId("inicio-mis-dias-container")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Hola, Lucía")).toBeVisible();

    const perfilRes = await request.get(`${STUB_URL}/rest/v1/perfiles?id=eq.${LUCIA_ID}`);
    const perfiles = (await perfilRes.json()) as Array<{ nombre_preferido: string | null }>;
    expect(perfiles[0]?.nombre_preferido).toBeNull();
  });

  test("F-03: Configuración cambia el nombre con toast y reintenta al volver la señal sin conexión", async ({
    page,
    request,
  }) => {
    await prepararEntorno(page);

    await page.goto("/athlete");
    await expect(page.getByTestId("empezar-dia-btn")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("empezar-dia-btn").click();
    await page.getByRole("button", { name: "Configuración" }).click();

    const inputNombre = page.getByTestId("config-nombre-input");
    await expect(inputNombre).toBeVisible();
    await inputNombre.fill("Luli");
    await inputNombre.blur();

    await expect(page.getByTestId("config-nombre-toast")).toContainText("Listo, te llamamos Luli");
    await page.getByTestId("config-cerrar-btn").click();
    await page.getByTestId("volver-a-mis-dias-btn").click();
    await expect(page.getByText("Hola, Luli")).toBeVisible();

    // Sin señal: actualiza saludo localmente y envía la RPC al volver la conexión
    await page.getByTestId("empezar-dia-btn").click();
    await page.getByRole("button", { name: "Configuración" }).click();
    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    await inputNombre.fill("Lulita");
    await inputNombre.blur();
    await expect(page.getByTestId("config-nombre-toast")).toContainText("Listo, te llamamos Lulita");
    await page.getByTestId("config-cerrar-btn").click();
    await page.getByTestId("volver-a-mis-dias-btn").click();
    await expect(page.getByText("Hola, Lulita")).toBeVisible();

    await request.delete(`${STUB_URL}/__llamadas`);
    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    await expect
      .poll(async () => {
        const calls = await getLlamadas(request);
        return calls.find(
          (c) => c.path.includes("actualizar_nombre_preferido") && c.body?.p_nombre === "Lulita",
        );
      })
      .toBeTruthy();

    const perfilRes = await request.get(`${STUB_URL}/rest/v1/perfiles?id=eq.${LUCIA_ID}`);
    const perfiles = (await perfilRes.json()) as Array<{ nombre_preferido: string | null }>;
    expect(perfiles[0]?.nombre_preferido).toBe("Lulita");
  });
});
