import { mkdirSync } from "node:fs";
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
import {
  ALL_RECETAS,
  EJ_BP,
  entrarADia1,
  GRUPOS_RECETAS,
  PANTALLAS,
  RECETAS_ACCESO_ENTRENAR,
  RECETAS_CLASES,
  RECETAS_EJERCICIO,
  RECETAS_HISTORIAL_PROGRESO,
  RECETAS_MOLESTIAS,
  RECETAS_SESION,
  SIN_RECETA,
  STUB_URL,
  type PrepararOpciones,
} from "./helpers/athlete-v7-recetas";

export {
  RECETAS_ACCESO_ENTRENAR,
  RECETAS_CLASES,
  RECETAS_EJERCICIO,
  RECETAS_HISTORIAL_PROGRESO,
  RECETAS_MOLESTIAS,
  RECETAS_SESION,
  SIN_RECETA,
  type PrepararOpciones,
};

const APP_OUT_DIR = join(process.cwd(), "test-results", "athlete-v7", "app");
const REF_PNG_DIR = join(process.cwd(), "docs", "athlete-v7", "referencia", "png");
const EVIDENCIA_DIR = process.env.ATHLETE_V7_EVIDENCIA_DIR
  ? join(process.cwd(), process.env.ATHLETE_V7_EVIDENCIA_DIR)
  : null;

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
          await page.unrouteAll({ behavior: "ignoreErrors" });
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

  test("[Molestias] hoja Tengo una molestia atrapa foco, cierra con Escape y devuelve foco al disparador", async ({
    page,
  }) => {
    await entrarADia1(page, "light");
    await page.getByTestId(`exercise-select-btn-${EJ_BP}`).click();

    const trigger = page.getByTestId(`exercise-pain-report-btn-${EJ_BP}`);
    await expect(trigger).toBeVisible();
    await trigger.click();

    const modal = page.getByTestId("pain-report-modal");
    await expect(modal).toBeVisible();
    await expect(page.locator("#pain-report-title")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.focus();
    await trigger.click();
    await expect(modal).toBeVisible();
    await expect(page.locator("#pain-report-title")).toBeFocused();

    await page.keyboard.press("Shift+Tab");
    await expect(page.getByTestId("submit-pain-report-btn")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(modal.getByRole("button", { name: "Cerrar" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
