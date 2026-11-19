import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  generarContrastePar,
  generarResumenContraste,
  type FilaContraste,
  type SinRecetaEntry,
  type TemaContraste,
} from "./helpers/contraste";
import { checksEstiloParaPantalla, esperarEstilo, verificarEstiloPantalla } from "./helpers/estilo-v7";

function leerPantallasReferencia(): string[] {
  const src = readFileSync(
    join(process.cwd(), "docs", "athlete-v7", "referencia", "capturar.mjs"),
    "utf8",
  );
  const match = src.match(/export const PANTALLAS\s*=\s*\[([\s\S]*?)\];/);
  if (!match) throw new Error("No se encontró export const PANTALLAS en capturar.mjs");
  return [...match[1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

const PANTALLAS = leerPantallasReferencia();

const STUB_URL = "http://localhost:54321";
const APP_OUT_DIR = join(process.cwd(), "test-results", "athlete-v7", "app");
const REF_PNG_DIR = join(process.cwd(), "docs", "athlete-v7", "referencia", "png");
const EVIDENCIA_DIR = process.env.ATHLETE_V7_EVIDENCIA_DIR
  ? join(process.cwd(), process.env.ATHLETE_V7_EVIDENCIA_DIR)
  : null;

const FIXTURE_BASE = JSON.parse(
  readFileSync(join(process.cwd(), "tests", "e2e", "fixtures", "athlete-v7.json"), "utf8"),
);
const LUCIA_ID: string = FIXTURE_BASE.user.id;
const DIA_1 = FIXTURE_BASE.dias_rutina[0].id as string;
const DIA_2 = FIXTURE_BASE.dias_rutina[1].id as string;
const EJ_SQ = FIXTURE_BASE.ejercicios_en_rutina[0].id as string;
const EJ_BP = FIXTURE_BASE.ejercicios_en_rutina[1].id as string;
const EJ_RM = FIXTURE_BASE.ejercicios_en_rutina[2].id as string;
const EJ_PL = FIXTURE_BASE.ejercicios_en_rutina[3].id as string;
const EJ_JL = FIXTURE_BASE.ejercicios_en_rutina[4].id as string;
const EJ_ZB = FIXTURE_BASE.ejercicios_en_rutina[6].id as string;

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

export interface PrepararOpciones {
  tema: TemaContraste;
  fixture?: Record<string, unknown>;
  onboardingCompletado?: boolean;
  athleteStore?: Record<string, unknown>;
  offline?: boolean;
}

async function prepararEntorno(page: Page, opts: PrepararOpciones) {
  const fixture = opts.fixture ?? structuredClone(FIXTURE_BASE);
  await page.request.put(`${STUB_URL}/__e2e/fixtures`, { data: fixture });

  await page.context().addCookies([
    {
      name: "sb-localhost-auth-token",
      value: `base64-${b64url(buildSessionCookie(FIXTURE_BASE.user))}`,
      url: "http://localhost:3100",
    },
  ]);

  await page.emulateMedia({ colorScheme: opts.tema, reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date("2026-11-17T10:00:00-03:00"));

  const athleteStoreSeed = {
    state: {
      onboardingCompletado: opts.onboardingCompletado ?? true,
      mostrarTimerDescanso: true,
      nivelVistaAlumno: "SIMPLE",
      membershipStatus: "ACTIVE",
      currentSession: {
        id: "aaaaaaaa-1111-4111-8111-111111111101",
        nombre_rutina: "Lucía Fernández: DÍA 1",
        fecha: "2026-11-17",
        ejercicios: [],
        studentId: LUCIA_ID,
        studentName: "Lucía Fernández",
      },
      ...(opts.athleteStore ?? {}),
    },
    version: 2,
  };

  await page.addInitScript(
    ({ tema, userId, storeJson }) => {
      try {
        window.localStorage.setItem("gozster-theme", tema);
        window.sessionStorage.setItem("gozster-fondo-semilla", "3");
        window.localStorage.setItem(`gozster-athlete-store:${userId}`, storeJson);
      } catch {
        // ignore
      }
    },
    { tema: opts.tema, userId: LUCIA_ID, storeJson: JSON.stringify(athleteStoreSeed) },
  );

  if (opts.offline) {
    await page.context().setOffline(true);
  }
}

async function capturarAppYContraste(
  browser: Browser,
  page: Page,
  clave: string,
  tema: TemaContraste,
  filas: FilaContraste[],
) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  mkdirSync(APP_OUT_DIR, { recursive: true });
  const appPngPath = join(APP_OUT_DIR, `${clave}-${tema}.png`);
  await page.screenshot({ path: appPngPath });

  if (EVIDENCIA_DIR) {
    const refPngPath = join(REF_PNG_DIR, `${clave}-${tema}.png`);
    const outPngPath = join(EVIDENCIA_DIR, `${clave}-${tema}.png`);
    const fila = await generarContrastePar(browser, {
      clave,
      tema,
      refPngPath,
      appPngPath,
      outPngPath,
    });
    filas.push(fila);
  }
}

type RecetaRunner = (page: Page, tema: TemaContraste) => Promise<void>;

export const SIN_RECETA: Record<string, string> = {
  // Entrenar
  "inicio-error": "sin receta (falta FE-03)",
  "inicio-instalar": "sin receta (falta FE-03)",
  "inicio-instalar-android": "sin receta (falta FE-03)",
  // Sesión
  "rutina-molestia": "sin receta (falta FE-08)",
  // Ejercicio
  "ex-tec-rpe": "sin receta (falta FE-05)",
  "ex-drop-2": "sin receta (falta FE-05)",
  "ex-uni-izq": "sin receta (falta FE-05)",
  "toast-record": "sin receta (falta FE-06)",
  "ex-rej": "sin receta (falta FE-05)",
  "toast-sinsenal": "sin receta (falta FE-05)",
  "ex-videos": "sin receta (falta FE-07)",
  "ex-video-estados": "sin receta (falta FE-07)",
  setvideo: "sin receta (falta FE-07)",
  // Molestias
  "mol-hereda": "sin receta (falta FE-08)",
  "mol-lumbar": "sin receta (falta FE-08)",
  "mol-no-hereda": "sin receta (falta FE-08)",
  "mol-otro": "sin receta (falta FE-08)",
  // Clases
  "cls-mes": "sin receta (falta FE-10)",
};

export const RECETAS_ACCESO_ENTRENAR: Record<string, RecetaRunner> = {
  // ── Acceso ──
  onb1: async (page, tema) => {
    await prepararEntorno(page, { tema, onboardingCompletado: false });
    await page.goto("/athlete");
    await expect(page.getByRole("dialog", { name: "Bienvenida a GOZSter" })).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText(/Tu plan ya está listo\./)).toBeVisible();
  },
  onbname: async (page, tema) => {
    await RECETAS_ACCESO_ENTRENAR.onb1!(page, tema);
    const dlg = page.getByRole("dialog", { name: "Bienvenida a GOZSter" });
    await dlg.getByRole("button", { name: "Empezar" }).click();
    await expect(dlg.getByTestId("onboarding-paso-nombre")).toBeVisible();
  },
  onb2: async (page, tema) => {
    await RECETAS_ACCESO_ENTRENAR.onbname!(page, tema);
    const dlg = page.getByRole("dialog", { name: "Bienvenida a GOZSter" });
    await dlg.getByRole("button", { name: "Continuar" }).click();
    await expect(dlg.getByText("¿Cómo querés ver tus ejercicios?")).toBeVisible();
  },
  onb3: async (page, tema) => {
    await RECETAS_ACCESO_ENTRENAR.onb2!(page, tema);
    const dlg = page.getByRole("dialog", { name: "Bienvenida a GOZSter" });
    await dlg.getByRole("button", { name: /Continuar con/i }).click();
    await expect(dlg.getByText(/descanso después de cada serie/i)).toBeVisible();
  },

  // ── Entrenar ──
  inicio: async (page, tema) => {
    await prepararEntorno(page, { tema });
    await page.goto("/athlete");
    await expect(page.getByTestId("inicio-mis-dias-container")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("hero-dia-hoy")).toBeVisible();
  },
  "inicio-semana": async (page, tema) => {
    await prepararEntorno(page, {
      tema,
      athleteStore: {
        sesionesCompletadas: [
          {
            id: "66666666-6666-4666-8666-666666666699",
            dia_id: FIXTURE_BASE.dias_rutina[0].id,
            fecha: "2026-11-16T18:00:00-03:00",
          },
        ],
      },
    });
    await page.goto("/athlete");
    await expect(page.getByTestId("inicio-mis-dias-container")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText(/1\/3 esta semana/i)).toBeVisible();
  },
  "inicio-dia": async (page, tema) => {
    await RECETAS_ACCESO_ENTRENAR.inicio!(page, tema);
    await page.getByTestId("hacer-otro-dia-btn").click();
    await expect(page.getByText("¿Qué día querés hacer hoy?")).toBeVisible();
  },
  "inicio-sinplan": async (page, tema) => {
    const fixtureSinPlan = structuredClone(FIXTURE_BASE);
    fixtureSinPlan.planes_entrenamiento = [];
    fixtureSinPlan.dias_rutina = [];
    fixtureSinPlan.ejercicios_en_rutina = [];
    await prepararEntorno(page, { tema, fixture: fixtureSinPlan });
    await page.goto("/athlete");
    await expect(page.getByTestId("inicio-sin-plan")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText(/Todavía no tenés un plan asignado/i)).toBeVisible();
  },
  "inicio-cargando": async (page, tema) => {
    await prepararEntorno(page, { tema });
    // Navegar primero a Historial para que AthleteShell active userScopedStorage antes de montar InicioMisDias
    await page.goto("/athlete/historial");
    await expect(page.getByTestId("historial-sesiones-container")).toBeVisible({ timeout: 25_000 });
    await page.route("**/rest/v1/planes_entrenamiento*", async (route) => {
      await new Promise((r) => setTimeout(r, 8_000));
      await route.abort().catch(() => {});
    });
    await page.getByRole("link", { name: "Entrenar", exact: true }).click({ position: { x: 64, y: 16 } });
    await expect(page.getByText("Cargando tu plan…")).toBeVisible({ timeout: 10_000 });
  },
  "inicio-offline": async (page, tema) => {
    await RECETAS_ACCESO_ENTRENAR.inicio!(page, tema);
    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(page.getByTestId("chip-red")).toContainText("Sin señal · se guarda igual");
  },
  "inicio-pendientes": async (page, tema) => {
    await entrarADia1(page, tema);
    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await page.getByTestId(`exercise-select-btn-${EJ_SQ}`).click();
    for (let i = 0; i < 3; i++) {
      await page.getByTestId(`single-exercise-container-${EJ_SQ}`).scrollIntoViewIfNeeded();
      await page.getByTestId("registrar-serie-btn").click();
      const omitir = page.getByRole("button", { name: "Omitir" });
      if (await omitir.isVisible().catch(() => false)) await omitir.click();
    }
    await page.getByTestId("volver-a-rutina-btn").click();
    await page.getByTestId("volver-a-mis-dias-btn").click();
    await expect(page.getByTestId("inicio-mis-dias-container")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("chip-red")).toContainText("Sin señal · 3 series");
  },
  "inicio-vencida": async (page, tema) => {
    await prepararEntorno(page, {
      tema,
      athleteStore: { membershipStatus: "EXPIRED_PAYMENT_PENDING" },
    });
    await page.goto("/athlete");
    await expect(page.getByTestId("athlete-expired-dialog")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("expired-dismiss").click();
    await expect(page.getByTestId("athlete-expired-banner")).toBeVisible();
  },
  "inicio-suscripcion": async (page, tema) => {
    await prepararEntorno(page, {
      tema,
      athleteStore: { membershipStatus: "EXPIRED_PAYMENT_PENDING" },
    });
    await page.goto("/athlete");
    await expect(page.getByTestId("athlete-expired-dialog")).toBeVisible({ timeout: 25_000 });
  },
  chat: async (page, tema) => {
    await RECETAS_ACCESO_ENTRENAR.inicio!(page, tema);
    await page.getByTestId("athlete-chat-fab").click();
    await expect(page.getByTestId("athlete-chat-messages-container")).toBeVisible();
  },
};

async function entrarADia1(page: Page, tema: TemaContraste, opts?: Omit<PrepararOpciones, "tema">) {
  await prepararEntorno(page, { tema, ...opts });
  await page.goto("/athlete");
  await expect(page.getByTestId("inicio-mis-dias-container")).toBeVisible({ timeout: 25_000 });
  await page.getByTestId("empezar-dia-btn").click();
  await expect(page.getByTestId("live-workout-container")).toBeVisible({ timeout: 15_000 });
}

async function entrarADia2(page: Page, tema: TemaContraste) {
  await prepararEntorno(page, { tema });
  await page.goto("/athlete");
  await expect(page.getByTestId("inicio-mis-dias-container")).toBeVisible({ timeout: 25_000 });
  await page.getByTestId("hacer-otro-dia-btn").click();
  await page.getByTestId(`sheet-option-dia-${DIA_2}`).click();
  await page.getByTestId("confirmar-cambio-dia-btn").click();
  await page.getByTestId("empezar-dia-btn").click();
  await expect(page.getByTestId("live-workout-container")).toBeVisible({ timeout: 15_000 });
}

export const RECETAS_SESION: Record<string, RecetaRunner> = {
  rutina: async (page, tema) => {
    await entrarADia1(page, tema);
    await expect(page.getByTestId("exercise-selector-column")).toBeVisible();
  },
  "rutina-curso": async (page, tema) => {
    await entrarADia1(page, tema);
    await page.getByTestId(`exercise-select-btn-${EJ_SQ}`).click();
    for (let i = 0; i < 4; i++) {
      await page.getByTestId("registrar-serie-btn").click();
      const omitir = page.getByRole("button", { name: "Omitir" });
      if (await omitir.isVisible().catch(() => false)) await omitir.click();
    }
    await page.getByTestId("registrar-serie-btn").click();
    const omitirBp = page.getByRole("button", { name: "Omitir" });
    if (await omitirBp.isVisible().catch(() => false)) await omitirBp.click();
    await page.getByTestId("registrar-serie-btn").click();
    if (await omitirBp.isVisible().catch(() => false)) await omitirBp.click();
    await page.getByTestId("volver-a-rutina-btn").click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByTestId("exercise-selector-column")).toBeVisible();
  },
  "rutina-terminar": async (page, tema) => {
    await RECETAS_SESION["rutina-curso"]!(page, tema);
    await page.getByTestId("terminar-entrenamiento-btn-entrenar").click();
    await expect(page.getByTestId("confirmar-terminar-card")).toBeVisible();
    await page.getByTestId("confirmar-terminar-card").scrollIntoViewIfNeeded();
  },
  registro: async (page, tema) => {
    await entrarADia1(page, tema);
    await page.getByTestId("tab-registro-dia").click();
    await expect(page.getByTestId("registro-dia-container")).toBeVisible();
  },
  "registro-datos": async (page, tema) => {
    await entrarADia1(page, tema);
    await page.getByTestId(`exercise-select-btn-${EJ_SQ}`).click();
    for (let i = 0; i < 4; i++) {
      await page.getByTestId("registrar-serie-btn").click();
      const omitir = page.getByRole("button", { name: "Omitir" });
      if (await omitir.isVisible().catch(() => false)) await omitir.click();
    }
    await page.getByTestId("registrar-serie-btn").click();
    const omitir1 = page.getByRole("button", { name: "Omitir" });
    if (await omitir1.isVisible().catch(() => false)) await omitir1.click();
    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await page.getByTestId(`exercise-select-btn-${EJ_BP}`).click();
    await page.getByTestId("registrar-serie-btn").click();
    const omitir2 = page.getByRole("button", { name: "Omitir" });
    if (await omitir2.isVisible().catch(() => false)) await omitir2.click();
    await page.getByTestId("volver-a-rutina-btn").click();
    await page.getByTestId("tab-registro-dia").click();
    await expect(page.getByTestId("registro-dia-container")).toBeVisible();
    await expect(page.getByTestId(`log-row-${EJ_SQ}-1`)).toBeVisible();
  },
  config: async (page, tema) => {
    await entrarADia1(page, tema);
    await page.getByTestId("athlete-settings-btn").click();
    await expect(page.getByRole("dialog", { name: "Configuración" })).toBeVisible();
  },
  cuest: async (page, tema) => {
    await RECETAS_SESION.config!(page, tema);
    await page.getByTestId("tab-cuestionario").click();
    await expect(page.getByTestId("cuestionario-inicial-container")).toBeVisible();
  },
  "cuest-hecho": async (page, tema) => {
    await entrarADia1(page, tema, {
      athleteStore: {
        cuestionarioInicial: {
          id: "cccccccc-1111-4111-8111-111111111101",
          alumno_id: LUCIA_ID,
          objetivo_principal: "Hipertrofia / ganancia muscular",
          experiencia_previa: "Intermedio (1 a 3 años)",
          dias_disponibles_semana: 4,
          molestias_o_lesiones_previas: "Ninguna",
          equipamiento_disponible: "Gimnasio comercial completo",
          respuestas_extra: {},
          completado_at: "2026-11-02T10:00:00-03:00",
          updated_at: "2026-11-02T10:00:00-03:00",
        },
      },
    });
    await page.getByTestId("athlete-settings-btn").click();
    await page.getByTestId("tab-cuestionario").click();
    await expect(page.getByTestId("cuestionario-completado-badge")).toBeVisible();
  },
  cierre: async (page, tema) => {
    await entrarADia1(page, tema);
    await page.getByTestId(`exercise-select-btn-${EJ_SQ}`).click();
    await page.getByTestId("registrar-serie-btn").click();
    const omitir = page.getByRole("button", { name: "Omitir" });
    if (await omitir.isVisible().catch(() => false)) await omitir.click();
    await page.getByTestId("volver-a-rutina-btn").click();
    await page.getByTestId("tab-registro-dia").click();
    await page.getByTestId("terminar-entrenamiento-btn").click();
    await expect(page.getByTestId("cierre-dia-modal")).toBeVisible({ timeout: 15_000 });
  },
  "cierre-off": async (page, tema) => {
    await entrarADia1(page, tema);
    await page.getByTestId(`exercise-select-btn-${EJ_SQ}`).click();
    await page.getByTestId("registrar-serie-btn").click();
    const omitir = page.getByRole("button", { name: "Omitir" });
    if (await omitir.isVisible().catch(() => false)) await omitir.click();
    await page.getByTestId("volver-a-rutina-btn").click();
    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    for (let i = 0; i < 3; i++) {
      await page.getByTestId(`single-exercise-container-${EJ_SQ}`).scrollIntoViewIfNeeded();
      await page.getByTestId("registrar-serie-btn").click();
      const omitir = page.getByRole("button", { name: "Omitir" });
      if (await omitir.isVisible().catch(() => false)) await omitir.click();
    }
    await page.getByTestId("tab-registro-dia").click();
    await page.getByTestId("terminar-entrenamiento-btn").click();
    await expect(page.getByTestId("cierre-dia-modal")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("cierre-dia-estado-chip")).toContainText("Guardada en el teléfono");
  },
  "toast-sesion": async (page, tema) => {
    await RECETAS_SESION.cierre!(page, tema);
    await page.getByTestId("cierre-dia-volver-athlete-btn").click();
    await expect(page.getByTestId("historial-sesiones-container")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("toast-sesion")).toBeVisible();
  },
};

export const RECETAS_EJERCICIO: Record<string, RecetaRunner> = {
  "ex-aprox": async (page, tema) => {
    await entrarADia1(page, tema);
    await page.getByTestId(`exercise-select-btn-${EJ_SQ}`).click();
    await page.getByTestId(`single-exercise-container-${EJ_SQ}`).scrollIntoViewIfNeeded();
    await expect(page.getByTestId(`single-exercise-container-${EJ_SQ}`)).toBeVisible();
  },
  "ex-ss": async (page, tema) => {
    await entrarADia1(page, tema);
    await page.getByTestId(`exercise-select-btn-${EJ_BP}`).click();
    await page.getByTestId(`single-exercise-container-${EJ_BP}`).scrollIntoViewIfNeeded();
    await expect(page.getByTestId("superserie-circuit-banner")).toBeVisible();
  },
  "ex-tec": async (page, tema) => {
    await entrarADia1(page, tema, {
      athleteStore: { nivelVistaAlumno: "TECNICA", vistaElegidaPorAlumno: "TECNICA" },
    });
    await page.getByTestId(`exercise-select-btn-${EJ_BP}`).click();
    await page.getByTestId(`single-exercise-container-${EJ_BP}`).scrollIntoViewIfNeeded();
    await expect(page.getByTestId("input-rpe")).toBeVisible();
  },
  "ex-tiempo": async (page, tema) => {
    await entrarADia1(page, tema);
    await page.getByTestId(`exercise-select-btn-${EJ_PL}`).click();
    await page.getByTestId("timer-ejercicio-tiempo").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("timer-ejercicio-tiempo")).toBeVisible();
  },
  "ex-tiempo-run": async (page, tema) => {
    await RECETAS_EJERCICIO["ex-tiempo"]!(page, tema);
    await page.getByTestId("timer-tiempo-iniciar-btn").click();
    await expect(page.getByTestId("timer-tiempo-pausar-btn")).toBeVisible();
  },
  "ex-drop": async (page, tema) => {
    await entrarADia2(page, tema);
    await page.getByTestId(`exercise-select-btn-${EJ_JL}`).click();
    await page.getByTestId(`single-exercise-container-${EJ_JL}`).scrollIntoViewIfNeeded();
    await expect(page.getByTestId("dropset-banner")).toBeVisible();
  },
  "ex-uni": async (page, tema) => {
    await entrarADia2(page, tema);
    await page.getByTestId(`exercise-select-btn-${EJ_ZB}`).click();
    await page.getByTestId(`single-exercise-container-${EJ_ZB}`).scrollIntoViewIfNeeded();
    await expect(page.getByTestId("unilateral-indicator")).toBeVisible();
  },
  "ex-rest": async (page, tema) => {
    await entrarADia1(page, tema);
    await page.getByTestId(`exercise-select-btn-${EJ_SQ}`).click();
    await page.getByTestId(`single-exercise-container-${EJ_SQ}`).scrollIntoViewIfNeeded();
    await page.getByTestId("registrar-serie-btn").click();
    await expect(page.getByTestId("rest-timer-banner")).toBeVisible();
  },
  "ex-rest-pausa": async (page, tema) => {
    await RECETAS_EJERCICIO["ex-rest"]!(page, tema);
    await page.getByRole("button", { name: "Pausar descanso" }).click();
    await expect(page.getByRole("button", { name: "Reanudar descanso" })).toBeVisible();
  },
  "ex-descanso-info": async (page, tema) => {
    await entrarADia1(page, tema);
    await page.getByTestId(`exercise-select-btn-${EJ_BP}`).click();
    await page.getByTestId(`descanso-chip-${EJ_BP}`).click();
    await expect(page.getByTestId("descanso-popover-content")).toBeVisible();
  },
  "ex-record": async (page, tema) => {
    await entrarADia1(page, tema);
    await page.getByTestId(`exercise-select-btn-${EJ_BP}`).click();
    await expect(page.getByTestId("ultima-vez")).toBeVisible({ timeout: 10_000 });
    await page.getByLabel("Peso en kilogramos").fill("47.5");
    await page.getByLabel("Cantidad de repeticiones").fill("8");
    await page.getByTestId("registrar-serie-btn").click();
    await expect(page.getByTestId("nuevo-record-banner")).toBeVisible();
  },
  "ex-x10": async (page, tema) => {
    await entrarADia1(page, tema);
    await page.getByTestId(`exercise-select-btn-${EJ_BP}`).click();
    await expect(page.getByTestId("ultima-vez")).toBeVisible({ timeout: 10_000 });
    await page.getByLabel("Peso en kilogramos").fill("450");
    await page.getByTestId("registrar-serie-btn").click();
    await expect(page.getByTestId("atypical-confirmation-dialog")).toBeVisible();
  },
  "ex-offline": async (page, tema) => {
    await entrarADia1(page, tema);
    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await page.getByTestId(`exercise-select-btn-${EJ_BP}`).click();
    await page.getByTestId(`single-exercise-container-${EJ_BP}`).scrollIntoViewIfNeeded();
    await page.getByTestId("registrar-serie-btn").click();
    await page.getByTestId(`exercise-select-btn-${EJ_BP}`).click();
    await expect(page.getByTestId(`single-exercise-container-${EJ_BP}`)).toBeVisible();
  },
  "ex-completo": async (page, tema) => {
    await entrarADia1(page, tema);
    for (let i = 0; i < 3; i++) {
      await page.getByTestId(`exercise-select-btn-${EJ_RM}`).click();
      await page.getByTestId(`single-exercise-container-${EJ_RM}`).scrollIntoViewIfNeeded();
      await page.getByTestId("registrar-serie-btn").click();
      const omitir = page.getByRole("button", { name: "Omitir" });
      if (await omitir.isVisible().catch(() => false)) await omitir.click();
    }
    await page.getByTestId(`exercise-select-btn-${EJ_RM}`).click();
    await expect(page.getByText("¡Ejercicio completado!")).toBeVisible();
  },
  notes: async (page, tema) => {
    await entrarADia1(page, tema);
    await page.getByTestId(`exercise-select-btn-${EJ_SQ}`).click();
    await page.getByTestId(`exercise-notes-btn-${EJ_SQ}`).click();
    await expect(page.getByTestId("exercise-notes-modal")).toBeVisible();
  },
  video: async (page, tema) => {
    await entrarADia1(page, tema);
    await page.getByTestId(`exercise-select-btn-${EJ_BP}`).click();
    await page.getByTestId(`demo-technique-btn-${EJ_BP}`).click();
    await expect(page.getByTestId("exercise-video-modal")).toBeVisible();
  },
};

export const RECETAS_MOLESTIAS: Record<string, RecetaRunner> = {
  "mol-modal": async (page, tema) => {
    await entrarADia1(page, tema);
    await page.getByTestId(`exercise-select-btn-${EJ_BP}`).click();
    await page.getByTestId(`exercise-pain-report-btn-${EJ_BP}`).click();
    await expect(page.getByTestId("pain-report-modal")).toBeVisible();
    await page.getByTestId("zona-btn-hombro").click();
    await page.getByTestId("intensity-chip-5").click();
    await expect(page.getByTestId("pain-modal-cartel-4-6")).toBeVisible();
  },
  "mol-modal-alta": async (page, tema) => {
    await RECETAS_MOLESTIAS["mol-modal"]!(page, tema);
    await page.getByTestId("intensity-chip-8").click();
    await expect(page.getByTestId("pain-modal-cartel-7-9")).toBeVisible();
  },
  "mol-modal-alarma": async (page, tema) => {
    await RECETAS_MOLESTIAS["mol-modal"]!(page, tema);
    await page.getByTestId("red-flag-label-Dolor punzante/súbito").click();
    await expect(page.getByTestId("protocolo-freno-alert")).toBeVisible();
  },
  "mol-leve": async (page, tema) => {
    await entrarADia1(page, tema);
    await page.getByTestId(`exercise-select-btn-${EJ_BP}`).click();
    await page.getByTestId(`exercise-pain-report-btn-${EJ_BP}`).click();
    await page.getByTestId("zona-btn-hombro").click();
    await page.getByTestId("intensity-chip-2").click();
    await page.getByTestId("submit-pain-report-btn").click();
    await expect(page.getByTestId("pain-banner-range-1-3")).toBeVisible();
  },
  "mol-mod": async (page, tema) => {
    await RECETAS_MOLESTIAS["mol-modal"]!(page, tema);
    await page.getByTestId("submit-pain-report-btn").click();
    await expect(page.getByTestId("pain-banner-range-4-6")).toBeVisible();
  },
  "mol-alta": async (page, tema) => {
    await RECETAS_MOLESTIAS["mol-modal-alta"]!(page, tema);
    await page.getByTestId("submit-pain-report-btn").click();
    await expect(page.getByTestId("pain-banner-range-7-9")).toBeVisible();
  },
  "mol-alarma": async (page, tema) => {
    await RECETAS_MOLESTIAS["mol-modal-alarma"]!(page, tema);
    await page.getByTestId("submit-pain-report-btn").click();
    await expect(page.getByTestId("live-workout-stop-protocol-banner")).toBeVisible();
  },
};

const SESION_HIST_RECIENTE = FIXTURE_BASE.registro_sesiones[0].id as string;
const SERIE_HIST_EDITABLE = FIXTURE_BASE.registro_series[1].id as string;

async function irAHistorial(page: Page, tema: TemaContraste, opts?: Omit<PrepararOpciones, "tema">) {
  await prepararEntorno(page, { tema, ...opts });
  await page.goto("/athlete");
  await expect(page.getByTestId("inicio-mis-dias-container")).toBeVisible({ timeout: 25_000 });
  await page.getByRole("link", { name: "Historial" }).first().click();
  await expect(page.getByTestId("historial-sesiones-container")).toBeVisible({ timeout: 25_000 });
}

export const RECETAS_HISTORIAL_PROGRESO: Record<string, RecetaRunner> = {
  hist: async (page, tema) => {
    await irAHistorial(page, tema);
    await expect(page.getByTestId(`sesion-card-${SESION_HIST_RECIENTE}`)).toBeVisible({ timeout: 25_000 });
    await page.getByTestId(`btn-expand-sesion-${SESION_HIST_RECIENTE}`).click();
    await expect(page.getByTestId(`detalle-sesion-${SESION_HIST_RECIENTE}`)).toBeHidden();
  },
  "hist-open": async (page, tema) => {
    await irAHistorial(page, tema);
    await expect(page.getByTestId(`detalle-sesion-${SESION_HIST_RECIENTE}`)).toBeVisible({ timeout: 25_000 });
  },
  "hist-open-tec": async (page, tema) => {
    await irAHistorial(page, tema, {
      athleteStore: { nivelVistaAlumno: "TECNICA", vistaElegidaPorAlumno: "TECNICA" },
    });
    await expect(page.getByTestId(`detalle-sesion-${SESION_HIST_RECIENTE}`)).toBeVisible({ timeout: 25_000 });
  },
  "hist-fix": async (page, tema) => {
    await RECETAS_HISTORIAL_PROGRESO["hist-open"]!(page, tema);
    await page.getByTestId(`btn-editar-serie-${SERIE_HIST_EDITABLE}`).click();
    await expect(page.getByTestId(`form-editar-serie-${SERIE_HIST_EDITABLE}`)).toBeVisible();
  },
  "hist-dash": async (page, tema) => {
    await irAHistorial(page, tema);
    await expect(page.getByTestId(`sesion-card-${SESION_HIST_RECIENTE}`)).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("tab-dashboard").click();
    await expect(page.getByTestId("mini-dashboard-container")).toBeVisible();
  },
  "hist-vacio": async (page, tema) => {
    const fixtureVacio = structuredClone(FIXTURE_BASE);
    fixtureVacio.registro_sesiones = [];
    fixtureVacio.registro_series = [];
    await prepararEntorno(page, { tema, fixture: fixtureVacio });
    await page.goto("/athlete/historial");
    await expect(page.getByText("No hay sesiones completadas aún")).toBeVisible({ timeout: 25_000 });
  },
  "hist-off": async (page, tema) => {
    await RECETAS_HISTORIAL_PROGRESO["hist-open"]!(page, tema);
    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(page.getByText("Offline (Modo Avión)")).toBeVisible();
  },
  prog: async (page, tema) => {
    await prepararEntorno(page, { tema });
    await page.goto("/athlete/progreso");
    await expect(page.getByTestId("progreso-ejercicio").first()).toBeVisible({ timeout: 25_000 });
  },
  "prog-tec": async (page, tema) => {
    await prepararEntorno(page, {
      tema,
      athleteStore: { nivelVistaAlumno: "TECNICA", vistaElegidaPorAlumno: "TECNICA" },
    });
    await page.goto("/athlete/progreso");
    await expect(page.getByText(/1RM estimado/i).first()).toBeVisible({ timeout: 25_000 });
  },
  "prog-vacio": async (page, tema) => {
    const fixtureVacio = structuredClone(FIXTURE_BASE);
    fixtureVacio.registro_sesiones = [];
    fixtureVacio.registro_series = [];
    await prepararEntorno(page, { tema, fixture: fixtureVacio });
    await page.goto("/athlete/progreso");
    await expect(page.getByText("Todavía no hay entrenamientos")).toBeVisible({ timeout: 25_000 });
  },
  "prog-off": async (page, tema) => {
    await RECETAS_HISTORIAL_PROGRESO.prog!(page, tema);
    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(page.getByText(/Sin conexión · datos del/i)).toBeVisible();
  },
};

async function irAClases(page: Page, tema: TemaContraste) {
  await prepararEntorno(page, { tema });
  await page.goto("/athlete");
  await expect(page.getByTestId("inicio-mis-dias-container")).toBeVisible({ timeout: 25_000 });
  await page.getByRole("link", { name: "Clases" }).first().click();
  await expect(page.getByTestId("athlete-classes")).toBeVisible({ timeout: 25_000 });
}

export const RECETAS_CLASES: Record<string, RecetaRunner> = {
  cls: async (page, tema) => {
    await irAClases(page, tema);
    await expect(page.getByTestId("class-booking-card").first()).toBeVisible();
  },
  "cls-reservada": async (page, tema) => {
    await RECETAS_CLASES.cls!(page, tema);
    await page.getByTestId("book-class-btn").first().click();
    await expect(page.getByTestId("cancel-booking-btn").first()).toBeVisible();
  },
  "cls-cupo": async (page, tema) => {
    await RECETAS_CLASES.cls!(page, tema);
    await page.getByTestId("book-class-btn").first().click();
    await page.getByTestId("book-class-btn").first().click();
    await page.getByTestId("days-strip").getByRole("tab", { name: /Mié/i }).click();
    await expect(page.getByTestId("attempt-limit-class-btn").first()).toBeVisible();
  },
  "cls-dia-vacio": async (page, tema) => {
    await RECETAS_CLASES.cls!(page, tema);
    await page.getByTestId("days-strip").getByRole("tab", { name: /Dom/i }).click();
    await expect(page.getByText("No hay clases este día.")).toBeVisible();
  },
  "cls-off": async (page, tema) => {
    await RECETAS_CLASES.cls!(page, tema);
    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(page.getByText("Sin conexión · datos guardados")).toBeVisible();
  },
};

const ALL_RECETAS: Record<string, RecetaRunner> = {
  ...RECETAS_ACCESO_ENTRENAR,
  ...RECETAS_SESION,
  ...RECETAS_EJERCICIO,
  ...RECETAS_MOLESTIAS,
  ...RECETAS_HISTORIAL_PROGRESO,
  ...RECETAS_CLASES,
};

const GRUPOS_RECETAS: Array<[string, Record<string, RecetaRunner>]> = [
  [
    "Acceso",
    {
      onb1: RECETAS_ACCESO_ENTRENAR.onb1!,
      onbname: RECETAS_ACCESO_ENTRENAR.onbname!,
      onb2: RECETAS_ACCESO_ENTRENAR.onb2!,
      onb3: RECETAS_ACCESO_ENTRENAR.onb3!,
    },
  ],
  [
    "Entrenar",
    Object.fromEntries(
      Object.entries(RECETAS_ACCESO_ENTRENAR).filter(
        ([k]) => !["onb1", "onbname", "onb2", "onb3"].includes(k),
      ),
    ),
  ],
  ["Sesión", RECETAS_SESION],
  ["Ejercicio", RECETAS_EJERCICIO],
  ["Molestias", RECETAS_MOLESTIAS],
  ["Historial y progreso", RECETAS_HISTORIAL_PROGRESO],
  ["Clases", RECETAS_CLASES],
];

const TEMAS: TemaContraste[] = ["light", "dark"];
const filasGeneradas: FilaContraste[] = [];

test.describe("@mobile Athlete v7 · Harness de fidelidad visual", () => {
  test.afterAll(async ({ request }) => {
    await request.delete(`${STUB_URL}/__e2e/fixtures`).catch(() => {});
    if (EVIDENCIA_DIR) {
      const sinRecetaList: SinRecetaEntry[] = Object.entries(SIN_RECETA).map(([clave, motivo]) => ({
        clave,
        motivo,
      }));
      generarResumenContraste({
        outDir: EVIDENCIA_DIR,
        filas: filasGeneradas,
        sinReceta: sinRecetaList,
        titulo: "Evidencia visual Athlete v7 (antes)",
      });
    }
  });

  for (const [grupo, recetas] of GRUPOS_RECETAS) {
    for (const [clave, run] of Object.entries(recetas)) {
      for (const tema of TEMAS) {
        test(`[${grupo}] ${clave} (${tema})`, async ({ page, browser }) => {
          await run(page, tema);
          await verificarEstiloPantalla(page, clave, tema);
          await capturarAppYContraste(browser, page, clave, tema, filasGeneradas);
        });
      }
    }
  }

  test("[Estilo] helper esperarEstilo valida tabla 05 §3 (tipografía, color y elevación)", async ({ page }) => {
    await page.setContent(`<!doctype html>
<html>
<head>
  <style>
    .t-title { font-family: "Archivo", sans-serif; font-size: 32px; font-weight: 800; font-stretch: 112%; }
    .t-eb { font-family: "Geist Mono", monospace; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.44px; }
    .hero { background-color: rgb(9, 9, 11); color: rgb(250, 250, 250); box-shadow: rgba(9, 9, 11, 0.08) 0px 3px 8px 2px; }
    .rec { background-color: rgb(255, 246, 218); border: 1.5px solid rgb(168, 123, 11); box-shadow: rgba(9, 9, 11, 0.08) 0px 3px 8px 2px; }
    .peso-largo { font-family: "Archivo", sans-serif; font-size: 28px; font-weight: 800; width: 120px; border: 1px solid rgb(113, 113, 122); }
  </style>
</head>
<body style="background-color: rgb(250, 250, 250)">
  <h1 class="t-title" data-testid="v7-title">PLAN GENERAL</h1>
  <span class="t-eb" data-testid="v7-eb">RUTINA</span>
  <div class="hero" data-testid="heroe-te-toca-hoy">Día 1</div>
  <div class="rec" data-testid="nuevo-record-banner">¡Nuevo récord!</div>
  <input class="peso-largo" data-testid="peso-largo" value="147,5" />
</body>
</html>`);

    await esperarEstilo(page, "v7-title", {
      fontFamilyContains: "Archivo",
      fontSizePx: 32,
      fontWeight: "800",
      fontStretch: "112%",
    });
    await esperarEstilo(page, "v7-eb", {
      fontFamilyContains: "Geist Mono",
      fontSizePx: 12,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacingPx: 1.44,
    });
    await esperarEstilo(page, "heroe-te-toca-hoy", {
      backgroundColor: "rgb(9, 9, 11)",
      color: "rgb(250, 250, 250)",
      boxShadowContains: "0px 3px 8px 2px",
    });
    await esperarEstilo(page, "nuevo-record-banner", {
      backgroundColor: "rgb(255, 246, 218)",
      borderColor: "rgb(168, 123, 11)",
      boxShadowContains: "0px 3px 8px 2px",
    });
    await esperarEstilo(page, "peso-largo", {
      fontFamilyContains: "Archivo",
      fontSizePx: { max: 32 },
      fontWeight: "800",
      borderColor: "rgb(113, 113, 122)",
      scrollWidthFitsClientWidth: true,
    });

    expect(checksEstiloParaPantalla("inicio", "dark").length).toBeGreaterThanOrEqual(3);
  });

  test("[Cobertura] Todas las 82 claves de PANTALLAS tienen receta o motivo sin receta", async () => {
    const cubiertas = new Set([...Object.keys(ALL_RECETAS), ...Object.keys(SIN_RECETA)]);
    expect(PANTALLAS).toHaveLength(82);
    for (const k of PANTALLAS) {
      expect(cubiertas.has(k), `Falta definir receta o sinReceta para ${k}`).toBe(true);
    }
  });
});
