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
  // Acceso
  onbname: "sin receta (falta FE-11)",
  // Entrenar
  "inicio-error": "sin receta (falta FE-03)",
  "inicio-pendientes": "sin receta (falta FE-03)",
  "inicio-instalar": "sin receta (falta FE-03)",
  "inicio-instalar-android": "sin receta (falta FE-03)",
};

export const RECETAS_ACCESO_ENTRENAR: Record<string, RecetaRunner> = {
  // ── Acceso ──
  onb1: async (page, tema) => {
    await prepararEntorno(page, { tema, onboardingCompletado: false });
    await page.goto("/athlete");
    await expect(page.getByRole("dialog", { name: "Bienvenida a GOZSter" })).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText(/Tu plan ya está listo\./)).toBeVisible();
  },
  onb2: async (page, tema) => {
    await RECETAS_ACCESO_ENTRENAR.onb1!(page, tema);
    const dlg = page.getByRole("dialog", { name: "Bienvenida a GOZSter" });
    await dlg.getByRole("button", { name: "Empezar" }).click();
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
    await page.getByRole("link", { name: "Entrenar", exact: true }).click();
    await expect(page.getByText("Cargando tu plan…")).toBeVisible({ timeout: 10_000 });
  },
  "inicio-offline": async (page, tema) => {
    await RECETAS_ACCESO_ENTRENAR.inicio!(page, tema);
    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(page.getByRole("banner").getByText("Modo Avión")).toBeVisible();
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
    await page.getByRole("button", { name: "Abrir chat con el equipo GOZS" }).click();
    await expect(page.getByTestId("athlete-chat-messages-container")).toBeVisible();
  },
};

const ALL_RECETAS: Record<string, RecetaRunner> = {
  ...RECETAS_ACCESO_ENTRENAR,
};

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

  for (const [clave, run] of Object.entries(RECETAS_ACCESO_ENTRENAR)) {
    const grupo = ["onb1", "onb2", "onb3"].includes(clave) ? "Acceso" : "Entrenar";
    for (const tema of TEMAS) {
      test(`[${grupo}] ${clave} (${tema})`, async ({ page, browser }) => {
        await run(page, tema);
        await capturarAppYContraste(browser, page, clave, tema, filasGeneradas);
      });
    }
  }

  test("[Cobertura] Claves sin receta documentadas para Acceso y Entrenar", async () => {
    const cubiertas = new Set([...Object.keys(ALL_RECETAS), ...Object.keys(SIN_RECETA)]);
    for (const k of PANTALLAS.slice(0, 17)) {
      expect(cubiertas.has(k), `Falta definir receta o sinReceta para ${k}`).toBe(true);
    }
  });
});
