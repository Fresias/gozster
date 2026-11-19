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
const EJ_RM = FIXTURE_BASE.ejercicios_en_rutina[2].id as string;
const EJ_PL = FIXTURE_BASE.ejercicios_en_rutina[3].id as string;
const EJ_JL = FIXTURE_BASE.ejercicios_en_rutina[4].id as string;
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

async function obtenerSesionIdActual(page: Page): Promise<string> {
  return page.evaluate((userId) => {
    const raw = window.localStorage.getItem(`gozster-athlete-store:${userId}`);
    if (!raw) throw new Error("No se encontró store en localStorage");
    const parsed = JSON.parse(raw) as { state?: { currentSession?: { id?: string } } };
    const id = parsed.state?.currentSession?.id;
    if (!id) throw new Error("No se encontró currentSession.id");
    return id;
  }, LUCIA_ID);
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

  // ── CP2 · F-04 a F-10c (Molestias) ──
  async function entrarARutinaDia1(page: Page) {
    await page.goto("/athlete");
    await expect(page.getByTestId("empezar-dia-btn")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("empezar-dia-btn").click();
    await expect(page.getByTestId("live-workout-container")).toBeVisible({ timeout: 15_000 });
  }

  async function reportarMolestiaEnEjercicio(
    page: Page,
    ejId: string,
    opts: { zonaTestId: string; intensidad: number; alarma?: boolean },
  ) {
    await page.getByTestId(`exercise-select-btn-${ejId}`).click();
    await expect(page.getByTestId(`single-exercise-container-${ejId}`)).toBeVisible({ timeout: 15_000 });
    await page.getByTestId(`exercise-pain-report-btn-${ejId}`).click();
    await expect(page.getByTestId("pain-report-modal")).toBeVisible();
    await page.getByTestId(opts.zonaTestId).click();
    await page.getByTestId(`intensity-chip-${opts.intensidad}`).click();
    if (opts.alarma) {
      await page.getByTestId("red-flag-label-Dolor punzante/súbito").click();
    }
    await page.getByTestId("submit-pain-report-btn").click();
    await expect(page.getByTestId("pain-report-modal")).toBeHidden();
  }

  test("F-04: Hombro 5/10 en Press banca muestra aviso propio y hereda solo en Remo", async ({ page }) => {
    await prepararEntorno(page);
    await entrarARutinaDia1(page);

    await reportarMolestiaEnEjercicio(page, EJ_BP, { zonaTestId: "zona-btn-hombro", intensidad: 5 });

    const modBanner = page.getByTestId("pain-banner-range-4-6");
    await expect(modBanner).toBeVisible();
    await expect(modBanner).toContainText("Molestia moderada · Hombro · 5/10");

    // Remo (Espalda, tren superior) muestra solo el formato chico heredado
    await page.getByTestId("volver-a-rutina-btn").click();
    await page.getByTestId(`exercise-select-btn-${EJ_RM}`).click();
    await expect(page.getByTestId("molestia-heredada")).toBeVisible();
    await expect(page.getByTestId("molestia-heredada")).toContainText("Molestia reportada");
    await expect(page.getByTestId("pain-banner-range-4-6")).toBeHidden();

    // Sentadilla (Piernas) y Plancha (Core) no muestran nada
    await page.getByTestId("volver-a-rutina-btn").click();
    await page.getByTestId(`exercise-select-btn-${EJ_SQ}`).click();
    await expect(page.getByTestId("molestia-heredada")).toBeHidden();
    await expect(page.getByTestId("pain-banner-range-4-6")).toBeHidden();

    await page.getByTestId("volver-a-rutina-btn").click();
    await page.getByTestId(`exercise-select-btn-${EJ_PL}`).click();
    await expect(page.getByTestId("molestia-heredada")).toBeHidden();
    await expect(page.getByTestId("pain-banner-range-4-6")).toBeHidden();
  });

  test("F-05: Lumbar 3/10 en Sentadilla hereda en Press banca, Remo y Plancha", async ({ page }) => {
    await prepararEntorno(page);
    await entrarARutinaDia1(page);

    await reportarMolestiaEnEjercicio(page, EJ_SQ, { zonaTestId: "zona-btn-lumbar", intensidad: 3 });
    await expect(page.getByTestId("pain-banner-range-1-3")).toContainText("Molestia leve · Espalda baja / Lumbar · 3/10");

    for (const ejId of [EJ_BP, EJ_RM, EJ_PL]) {
      await page.getByTestId("volver-a-rutina-btn").click();
      await page.getByTestId(`exercise-select-btn-${ejId}`).click();
      await expect(page.getByTestId("molestia-heredada")).toBeVisible();
      await expect(page.getByTestId("molestia-heredada")).toContainText("Molestia reportada");
    }
  });

  test("F-06: zona Otro 5/10 en Press banca no hereda a ningún otro ejercicio", async ({ page }) => {
    await prepararEntorno(page);
    await entrarARutinaDia1(page);

    await reportarMolestiaEnEjercicio(page, EJ_BP, { zonaTestId: "zona-btn-otro", intensidad: 5 });
    await expect(page.getByTestId("pain-banner-range-4-6")).toBeVisible();

    for (const ejId of [EJ_RM, EJ_SQ, EJ_PL]) {
      await page.getByTestId("volver-a-rutina-btn").click();
      await page.getByTestId(`exercise-select-btn-${ejId}`).click();
      await expect(page.getByTestId("molestia-heredada")).toBeHidden();
      await expect(page.getByTestId("pain-banner-range-4-6")).toBeHidden();
    }
  });

  test("F-07: Hombro 8/10 bloquea Press banca pero permite registrar en Remo", async ({ page }) => {
    await prepararEntorno(page);
    await entrarARutinaDia1(page);

    await reportarMolestiaEnEjercicio(page, EJ_BP, { zonaTestId: "zona-btn-hombro", intensidad: 8 });

    await expect(page.getByTestId("pain-banner-range-7-9")).toContainText("Suspendé este ejercicio");
    await expect(page.getByTestId("registrar-serie-btn")).toBeDisabled();

    await page.getByTestId("volver-a-rutina-btn").click();
    await page.getByTestId(`exercise-select-btn-${EJ_RM}`).click();
    await expect(page.getByTestId("molestia-heredada")).toBeVisible();
    await expect(page.getByTestId("registrar-serie-btn")).toBeEnabled();
    await page.getByTestId("registrar-serie-btn").click();
    await omitirDescansoSiVisible(page);
    // Remo es A2 de biserie y salta al siguiente ejercicio: volvemos a Remo para ver Registradas.
    await page.getByTestId("volver-a-rutina-btn").click();
    await page.getByTestId(`exercise-select-btn-${EJ_RM}`).click();
    await expect(page.getByTestId(`log-row-${EJ_RM}-1`)).toBeVisible();
  });

  test("F-08: síntoma de alarma muestra Frená por hoy + Terminar sesión y genera alerta con reporte_dolor_id", async ({
    page,
    request,
  }) => {
    await prepararEntorno(page);
    await entrarARutinaDia1(page);

    await reportarMolestiaEnEjercicio(page, EJ_BP, {
      zonaTestId: "zona-btn-rodilla",
      intensidad: 6,
      alarma: true,
    });

    const banner = page.getByTestId("live-workout-stop-protocol-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Frená por hoy");
    await expect(page.getByTestId("molestia-terminar-sesion-btn")).toContainText("Terminar sesión");

    const sesionId = await obtenerSesionIdActual(page);

    await expect
      .poll(async () => {
        const res = await request.get(`${STUB_URL}/rest/v1/alertas_entrenador`);
        const rows = (await res.json()) as Array<{ reporte_dolor_id?: string | null }>;
        return rows.length;
      })
      .toBeGreaterThan(0);

    const dolorRes = await request.get(
      `${STUB_URL}/rest/v1/alumno_historial_dolor?sesion_id=eq.${sesionId}`,
    );
    const dolores = (await dolorRes.json()) as Array<{ id: string }>;
    expect(dolores.length).toBeGreaterThanOrEqual(1);

    const alertasRes = await request.get(`${STUB_URL}/rest/v1/alertas_entrenador`);
    const alertas = (await alertasRes.json()) as Array<{ reporte_dolor_id?: string | null }>;
    expect(alertas.some((a) => a.reporte_dolor_id === dolores[0]!.id)).toBe(true);
  });

  test("F-09: al terminar la sesión y empezar otra no queda ningún aviso de molestia", async ({ page }) => {
    await prepararEntorno(page);
    await entrarARutinaDia1(page);

    await reportarMolestiaEnEjercicio(page, EJ_BP, { zonaTestId: "zona-btn-hombro", intensidad: 5 });
    await page.getByTestId("volver-a-rutina-btn").click();
    await expect(page.getByTestId(`molestia-chip-${EJ_BP}`)).toBeVisible();

    await page.getByTestId("terminar-entrenamiento-btn-entrenar").click();
    await page.getByTestId("terminar-confirmar-btn").click();
    await expect(page.getByTestId("cierre-dia-modal")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("cierre-dia-volver-athlete-btn").click();
    await expect(page.getByTestId("inicio-mis-dias-container")).toBeVisible({ timeout: 15_000 });

    // Empezar la siguiente sesión (Día 2): ningún aviso ni herencia del Día 1 anterior
    await page.getByTestId("empezar-dia-btn").click();
    await expect(page.getByTestId("live-workout-container")).toBeVisible({ timeout: 15_000 });

    await expect(page.getByTestId(`molestia-chip-${EJ_JL}`)).toHaveCount(0);
    await page.getByTestId(`exercise-select-btn-${EJ_JL}`).click();
    await expect(page.getByTestId("pain-banner-range-4-6")).toBeHidden();
    await expect(page.getByTestId("molestia-heredada")).toBeHidden();
  });

  test("F-10: molestia con señal guarda en alumno_historial_dolor con ids reales (nunca 30000000-...)", async ({
    page,
    request,
  }) => {
    await prepararEntorno(page);
    await entrarARutinaDia1(page);

    await reportarMolestiaEnEjercicio(page, EJ_BP, { zonaTestId: "zona-btn-hombro", intensidad: 5 });
    const sesionId = await obtenerSesionIdActual(page);

    await expect
      .poll(async () => {
        const res = await request.get(
          `${STUB_URL}/rest/v1/alumno_historial_dolor?sesion_id=eq.${sesionId}`,
        );
        const rows = (await res.json()) as unknown[];
        return rows.length;
      })
      .toBe(1);

    const res = await request.get(
      `${STUB_URL}/rest/v1/alumno_historial_dolor?sesion_id=eq.${sesionId}`,
    );
    const rows = (await res.json()) as Array<{
      eva: number;
      ejercicio_id: string;
      sesion_id: string;
      ejercicio_en_rutina_id: string;
    }>;
    expect(rows[0]!.eva).toBe(5);
    expect(rows[0]!.ejercicio_id).toBe(EJ_BP_CATALOG_ID);
    expect(rows[0]!.ejercicio_id).not.toMatch(/^30000000-/);
    expect(rows[0]!.sesion_id).toBe(sesionId);
    expect(rows[0]!.sesion_id).toMatch(UUID_REGEX);
    expect(rows[0]!.ejercicio_en_rutina_id).toBe(EJ_BP);
  });

  test("F-10b: sin señal muestra aviso al instante y al reconectar llama registrar_molestia una sola vez", async ({
    page,
    request,
  }) => {
    await prepararEntorno(page);
    await entrarARutinaDia1(page);

    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    await reportarMolestiaEnEjercicio(page, EJ_BP, { zonaTestId: "zona-btn-hombro", intensidad: 5 });
    await expect(page.getByTestId("pain-banner-range-4-6")).toBeVisible();
    const sesionId = await obtenerSesionIdActual(page);

    const callsOffline = await getLlamadas(request);
    expect(callsOffline.filter((c) => c.path.includes("registrar_molestia"))).toHaveLength(0);

    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    await expect
      .poll(async () => {
        const rowsRes = await request.get(
          `${STUB_URL}/rest/v1/alumno_historial_dolor?sesion_id=eq.${sesionId}`,
        );
        const rows = (await rowsRes.json()) as unknown[];
        return rows.length;
      })
      .toBe(1);

    const callsOnline = await getLlamadas(request);
    expect(callsOnline.filter((c) => c.path.includes("registrar_molestia"))).toHaveLength(1);
  });

  test("F-10c: al recargar la página en medio de la sesión persisten aviso propio y heredado", async ({
    page,
    request,
  }) => {
    await prepararEntorno(page);
    await entrarARutinaDia1(page);

    await reportarMolestiaEnEjercicio(page, EJ_BP, { zonaTestId: "zona-btn-hombro", intensidad: 5 });
    await expect(page.getByTestId("pain-banner-range-4-6")).toBeVisible();
    const sesionId = await obtenerSesionIdActual(page);

    await expect
      .poll(async () => {
        const rowsRes = await request.get(
          `${STUB_URL}/rest/v1/alumno_historial_dolor?sesion_id=eq.${sesionId}`,
        );
        return ((await rowsRes.json()) as unknown[]).length;
      })
      .toBe(1);

    await page.reload();
    await expect(page.getByTestId("empezar-dia-btn")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("empezar-dia-btn").click();
    await expect(page.getByTestId(`molestia-chip-${EJ_BP}`)).toBeVisible();

    await page.getByTestId(`exercise-select-btn-${EJ_BP}`).click();
    await expect(page.getByTestId("pain-banner-range-4-6")).toContainText("Molestia moderada · Hombro · 5/10");

    await page.getByTestId("volver-a-rutina-btn").click();
    await page.getByTestId(`exercise-select-btn-${EJ_RM}`).click();
    await expect(page.getByTestId("molestia-heredada")).toBeVisible();
  });

  // ── CP3 · F-11 a F-16 (Video e Indicaciones) ──
  async function registrarSerie1EnSentadilla(page: Page) {
    await entrarARutinaDia1(page);
    await page.getByTestId(`exercise-select-btn-${EJ_SQ}`).click();
    await expect(page.getByTestId("registrar-serie-btn")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("registrar-serie-btn").click();
    await omitirDescansoSiVisible(page);
    await expect(page.getByTestId(`log-row-${EJ_SQ}-1`)).toBeVisible();
  }

  test("F-11: video por enlace en serie 1 muestra chip VIDEO y guarda video_url en registro_series", async ({
    page,
    request,
  }) => {
    await prepararEntorno(page);
    await registrarSerie1EnSentadilla(page);
    const sesionId = await obtenerSesionIdActual(page);

    await page.getByTestId("serie-video-btn-1").click();
    await expect(page.getByTestId("video-upload-modal")).toBeVisible();
    await page.getByTestId("video-link-toggle-btn").click();
    await page.getByTestId("video-link-input").fill("https://youtu.be/x");
    await page.getByTestId("submit-video-url-btn").click();

    await expect(page.getByTestId("serie-video-listo-1")).toBeVisible();

    // Disparar flush silencioso de la cola (online / cierre) para verificar persistencia en registro_series
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    await expect
      .poll(async () => {
        const res = await request.get(
          `${STUB_URL}/rest/v1/registro_series?sesion_id=eq.${sesionId}&ejercicio_id=eq.${EJ_SQ_CATALOG_ID}&numero_serie=eq.1`,
        );
        const rows = (await res.json()) as Array<{ video_url?: string | null }>;
        return rows[0]?.video_url ?? null;
      })
      .toBe("https://youtu.be/x");
  });

  test("F-11b: video de 5 MB sin señal queda en teléfono y al reconectar sube a videos-series", async ({
    page,
    request,
  }) => {
    await prepararEntorno(page);
    await registrarSerie1EnSentadilla(page);
    const sesionId = await obtenerSesionIdActual(page);

    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    const video5Mb = Buffer.alloc(5 * 1024 * 1024);
    Buffer.from("00000018667479706d703432", "hex").copy(video5Mb, 0);

    await page.getByTestId("serie-video-btn-1").click();
    await page.getByTestId("video-gallery-input").setInputFiles({
      name: "serie-5mb.mp4",
      mimeType: "video/mp4",
      buffer: video5Mb,
    });
    await expect(page.getByTestId("video-selection-confirm")).toBeVisible();
    await page.getByTestId("submit-video-url-btn").click();

    await expect(page.getByTestId("serie-video-telefono-1")).toContainText("Video en el teléfono");

    // Al volver la red, interceptamos brevemente para observar "Subiendo…" antes de completarse
    let liberarUpload!: () => void;
    const uploadPausado = new Promise<void>((resolve) => {
      liberarUpload = resolve;
    });
    await page.route("**/storage/v1/object/videos-series/**", async (route) => {
      await uploadPausado;
      await route.continue();
    });

    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    await expect(page.getByTestId("serie-video-subiendo-1")).toBeVisible({ timeout: 10_000 });
    liberarUpload();

    await expect(page.getByTestId("serie-video-listo-1")).toBeVisible({ timeout: 15_000 });
    await page.unroute("**/storage/v1/object/videos-series/**");

    // Verificar objeto en Storage del stub
    const storageRes = await request.get(`${STUB_URL}/__e2e/storage`);
    const storage = (await storageRes.json()) as { keys: string[] };
    const prefijoEsperado = `videos-series/${LUCIA_ID}/${sesionId}/`;
    expect(storage.keys.some((k) => k.startsWith(prefijoEsperado))).toBe(true);

    // Disparar flush para sincronizar la serie reencolada con storage:videos-series/...
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    await expect
      .poll(async () => {
        const res = await request.get(
          `${STUB_URL}/rest/v1/registro_series?sesion_id=eq.${sesionId}&ejercicio_id=eq.${EJ_SQ_CATALOG_ID}&numero_serie=eq.1`,
        );
        const rows = (await res.json()) as Array<{ video_url?: string | null }>;
        return rows[0]?.video_url ?? "";
      })
      .toMatch(new RegExp(`^storage:videos-series/${LUCIA_ID}/${sesionId}/`));
  });

  test("F-11c: archivo mayor a 100 MB muestra error y no se adjunta", async ({ page }) => {
    await prepararEntorno(page);
    await registrarSerie1EnSentadilla(page);

    await page.getByTestId("serie-video-btn-1").click();
    await expect(page.getByTestId("video-upload-modal")).toBeVisible();

    await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('[data-testid="video-gallery-input"]');
      if (!input) throw new Error("No se encontró video-gallery-input");
      const file = new File([new Uint8Array(101 * 1024 * 1024)], "enorme.mp4", { type: "video/mp4" });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await expect(page.getByTestId("video-upload-error")).toContainText("El video pesa más de 100 MB");
    await expect(page.getByTestId("submit-video-url-btn")).toBeDisabled();
    await page.getByTestId("close-video-upload-modal-btn").click();
    await expect(page.getByTestId("serie-video-btn-1")).toBeVisible();
  });

  test("F-11d: fallo en Storage permite reintentar hasta quedar Video listo (4xx Reintentar y 500 recuperable)", async ({
    page,
    request,
  }) => {
    await prepararEntorno(page);
    await registrarSerie1EnSentadilla(page);

    const videoChico = {
      name: "serie.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("00000018667479706d703432", "hex"),
    };

    // 1) Error 500 del stub de Storage: se trata como transitorio ("Video en el teléfono") y se recupera al volver la red
    await request.put(`${STUB_URL}/__e2e/storage-error`, { data: { status: 500 } });
    await page.getByTestId("serie-video-btn-1").click();
    await page.getByTestId("video-gallery-input").setInputFiles(videoChico);
    await page.getByTestId("submit-video-url-btn").click();
    await expect(page.getByTestId("serie-video-telefono-1")).toBeVisible({ timeout: 10_000 });

    // 2) Error 413 del stub de Storage: muestra "Reintentar video" y al recuperarse sube a "Video"
    await request.put(`${STUB_URL}/__e2e/storage-error`, { data: { status: 413 } });
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.getByTestId("serie-video-reintentar-1")).toBeVisible({ timeout: 10_000 });

    await request.put(`${STUB_URL}/__e2e/storage-error`, { data: { status: null } });
    await page.getByTestId("serie-video-reintentar-1").click();
    await expect(page.getByTestId("serie-video-listo-1")).toBeVisible({ timeout: 10_000 });
  });

  test("F-12 y F-13: botón de video demostrativo solo con url_video y sin opciones de subida", async ({
    page,
  }) => {
    await prepararEntorno(page);
    await entrarARutinaDia1(page);

    // F-13: Sentadilla no tiene url_video -> sin botón de video en herramientas
    await page.getByTestId(`exercise-select-btn-${EJ_SQ}`).click();
    await expect(page.getByTestId(`single-exercise-container-${EJ_SQ}`)).toBeVisible();
    await expect(page.getByTestId(`demo-technique-btn-${EJ_SQ}`)).toHaveCount(0);

    // F-12: Press banca tiene url_video -> abre hoja solo con video demostrativo
    await page.getByTestId("volver-a-rutina-btn").click();
    await page.getByTestId(`exercise-select-btn-${EJ_BP}`).click();
    await page.getByTestId(`demo-technique-btn-${EJ_BP}`).click();

    const modal = page.getByTestId("exercise-video-modal");
    await expect(modal).toBeVisible();
    await expect(modal.getByTestId("youtube-iframe")).toBeVisible();
    await expect(modal.getByText(/Grabar/i)).toHaveCount(0);
    await expect(modal.getByText(/Galería/i)).toHaveCount(0);
    await expect(modal.getByText(/Enlace/i)).toHaveCount(0);
  });

  test("F-14: indicaciones estructuradas muestran Pasos (ol), Puntos clave, Errores comunes y Tempo y respiración en orden", async ({
    page,
  }) => {
    await prepararEntorno(page);
    await entrarARutinaDia1(page);
    await page.getByTestId(`exercise-select-btn-${EJ_SQ}`).click();
    await page.getByTestId(`exercise-notes-btn-${EJ_SQ}`).click();

    const content = page.getByTestId("exercise-notes-content");
    await expect(content).toBeVisible();
    await expect(content.locator("ol.a-steps li").first()).toBeVisible();

    const texto = await content.innerText();
    const iPasos = texto.search(/PASOS/i);
    const iClave = texto.search(/PUNTOS CLAVE/i);
    const iErrores = texto.search(/ERRORES COMUNES/i);
    const iTempo = texto.search(/TEMPO Y RESPIRACI[ÓO]N/i);

    expect(iPasos).toBeGreaterThanOrEqual(0);
    expect(iClave).toBeGreaterThan(iPasos);
    expect(iErrores).toBeGreaterThan(iClave);
    expect(iTempo).toBeGreaterThan(iErrores);
  });

  test("F-15: indicaciones de 40 líneas respetan alto de ventana - 40px, scrollean adentro y dejan título visible", async ({
    page,
  }) => {
    const fixture = structuredClone(FIXTURE_BASE);
    const pasos40 = Array.from({ length: 40 }, (_, idx) => `${idx + 1}. Paso de control técnico número ${idx + 1}.`).join(
      "\n",
    );
    fixture.ejercicios_en_rutina[0].notas = `Pasos:\n${pasos40}`;
    fixture.ejercicios[0].comentario = null;

    await prepararEntorno(page, { fixture });
    await entrarARutinaDia1(page);
    await page.getByTestId(`exercise-select-btn-${EJ_SQ}`).click();
    await page.getByTestId(`exercise-notes-btn-${EJ_SQ}`).click();

    const modal = page.getByTestId("exercise-notes-modal");
    await expect(modal).toBeVisible();

    const metrics = await modal.evaluate((el) => {
      el.scrollTop = 400;
      const rect = el.getBoundingClientRect();
      return {
        height: rect.height,
        innerHeight: window.innerHeight,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      };
    });

    expect(metrics.height).toBeLessThanOrEqual(metrics.innerHeight - 40 + 1);
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
    await expect(page.getByTestId("exercise-notes-modal-title")).toBeInViewport();
  });

  test("F-16: indicaciones viejas sin encabezados se ven como párrafos planos", async ({ page }) => {
    const fixture = structuredClone(FIXTURE_BASE);
    fixture.ejercicios_en_rutina[0].notas =
      "Mantené la espalda neutra durante todo el recorrido.\nBajá controlado hasta romper el paralelo.";
    fixture.ejercicios[0].comentario = null;

    await prepararEntorno(page, { fixture });
    await entrarARutinaDia1(page);
    await page.getByTestId(`exercise-select-btn-${EJ_SQ}`).click();
    await page.getByTestId(`exercise-notes-btn-${EJ_SQ}`).click();

    const content = page.getByTestId("exercise-notes-content");
    await expect(content).toBeVisible();
    await expect(content.locator("p.a-free")).toHaveCount(2);
    await expect(content.locator("ol.a-steps")).toHaveCount(0);
    await expect(content.getByText(/PASOS/i)).toHaveCount(0);
  });
});
