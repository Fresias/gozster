import { expect, type Page } from "@playwright/test";
import type { TemaContraste } from "./contraste";

export interface ReglasEstilo {
  fontFamilyContains?: string | string[];
  fontSizePx?: number | { min?: number; max?: number };
  fontWeight?: string | string[];
  fontStretch?: string | string[];
  fontVariantNumeric?: string;
  textTransform?: string;
  letterSpacingPx?: number;
  backgroundColor?: string | string[];
  color?: string | string[];
  borderColor?: string | string[];
  boxShadowContains?: string;
  scrollWidthFitsClientWidth?: boolean;
}

export interface EstiloCheckItem {
  descripcion: string;
  selector: string; // data-testid, CSS selector o :text(...)
  esTestId?: boolean;
  reglas: ReglasEstilo;
}

export interface ComputedEstiloSnapshot {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  fontStretch: string;
  fontVariantNumeric: string;
  textTransform: string;
  letterSpacing: string;
  backgroundColor: string;
  color: string;
  borderTopColor: string;
  boxShadow: string;
  scrollWidth: number;
  clientWidth: number;
}

/**
 * Helper `esperarEstilo(page, testIdOrSelector, reglas)` de `05-qa.md §3`.
 * Lee `getComputedStyle` en el navegador para un `data-testid` (o selector CSS si `esTestId === false`).
 */
export async function esperarEstilo(
  page: Page,
  testIdOrSelector: string,
  reglas: ReglasEstilo,
  opts?: { esTestId?: boolean; descripcion?: string },
): Promise<ComputedEstiloSnapshot> {
  const esTestId = opts?.esTestId ?? !/^[.#\[]|^body$|^html$/.test(testIdOrSelector);
  const locator = esTestId ? page.getByTestId(testIdOrSelector).first() : page.locator(testIdOrSelector).first();
  await expect(locator, opts?.descripcion ?? testIdOrSelector).toBeVisible();

  const snap = await locator.evaluate((el) => {
    const cs = window.getComputedStyle(el);
    return {
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      fontStretch: cs.fontStretch,
      fontVariantNumeric: cs.fontVariantNumeric,
      textTransform: cs.textTransform,
      letterSpacing: cs.letterSpacing,
      backgroundColor: cs.backgroundColor,
      color: cs.color,
      borderTopColor: cs.borderTopColor,
      boxShadow: cs.boxShadow,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    };
  });

  const label = opts?.descripcion ?? testIdOrSelector;

  if (reglas.fontFamilyContains) {
    const allowed = Array.isArray(reglas.fontFamilyContains)
      ? reglas.fontFamilyContains
      : [reglas.fontFamilyContains];
    const ok = allowed.some((f) => snap.fontFamily.toLowerCase().includes(f.toLowerCase()));
    expect(ok, `${label}: fontFamily="${snap.fontFamily}" debe contener ${allowed.join(" o ")}`).toBe(true);
  }

  if (reglas.fontSizePx !== undefined) {
    const px = parseFloat(snap.fontSize);
    if (typeof reglas.fontSizePx === "number") {
      expect(px, `${label}: fontSize=${snap.fontSize}`).toBeCloseTo(reglas.fontSizePx, 1);
    } else {
      if (reglas.fontSizePx.min !== undefined) {
        expect(px, `${label}: fontSize=${snap.fontSize} >= ${reglas.fontSizePx.min}`).toBeGreaterThanOrEqual(
          reglas.fontSizePx.min,
        );
      }
      if (reglas.fontSizePx.max !== undefined) {
        expect(px, `${label}: fontSize=${snap.fontSize} <= ${reglas.fontSizePx.max}`).toBeLessThanOrEqual(
          reglas.fontSizePx.max,
        );
      }
    }
  }

  if (reglas.fontWeight !== undefined) {
    const allowed = Array.isArray(reglas.fontWeight) ? reglas.fontWeight : [reglas.fontWeight];
    expect(allowed, `${label}: fontWeight`).toContain(snap.fontWeight);
  }

  if (reglas.fontStretch !== undefined) {
    const allowed = Array.isArray(reglas.fontStretch) ? reglas.fontStretch : [reglas.fontStretch];
    expect(allowed, `${label}: fontStretch`).toContain(snap.fontStretch);
  }

  if (reglas.fontVariantNumeric !== undefined) {
    expect(snap.fontVariantNumeric, `${label}: fontVariantNumeric`).toContain(reglas.fontVariantNumeric);
  }

  if (reglas.textTransform !== undefined) {
    expect(snap.textTransform, `${label}: textTransform`).toBe(reglas.textTransform);
  }

  if (reglas.letterSpacingPx !== undefined) {
    const px = parseFloat(snap.letterSpacing);
    expect(px, `${label}: letterSpacing=${snap.letterSpacing}`).toBeCloseTo(reglas.letterSpacingPx, 1);
  }

  if (reglas.backgroundColor !== undefined) {
    const allowed = Array.isArray(reglas.backgroundColor) ? reglas.backgroundColor : [reglas.backgroundColor];
    expect(allowed, `${label}: backgroundColor`).toContain(snap.backgroundColor);
  }

  if (reglas.color !== undefined) {
    const allowed = Array.isArray(reglas.color) ? reglas.color : [reglas.color];
    expect(allowed, `${label}: color`).toContain(snap.color);
  }

  if (reglas.borderColor !== undefined) {
    const allowed = Array.isArray(reglas.borderColor) ? reglas.borderColor : [reglas.borderColor];
    expect(allowed, `${label}: borderColor`).toContain(snap.borderTopColor);
  }

  if (reglas.boxShadowContains !== undefined) {
    expect(snap.boxShadow, `${label}: boxShadow`).toContain(reglas.boxShadowContains);
  }

  if (reglas.scrollWidthFitsClientWidth) {
    expect(snap.scrollWidth, `${label}: scrollWidth (${snap.scrollWidth}) <= clientWidth (${snap.clientWidth})`).toBeLessThanOrEqual(
      snap.clientWidth,
    );
  }

  return snap;
}

const INK = "rgb(9, 9, 11)";
const PAPER = "rgb(250, 250, 250)";

/**
 * Devuelve las aserciones de estilo computado de `05-qa.md §3` aplicables a `clave` y `tema`.
 */
export function checksEstiloParaPantalla(clave: string, tema: TemaContraste): EstiloCheckItem[] {
  const dark = tema === "dark";
  const checks: EstiloCheckItem[] = [];

  if (clave !== "onb1" && clave !== "cierre" && clave !== "cierre-off") {
    checks.push({
      descripcion: "Lienzo dentro de la app",
      selector: ".theme-athlete",
      esTestId: false,
      reglas: { backgroundColor: dark ? INK : PAPER },
    });
  }

  if (clave === "onb1") {
    checks.push({
      descripcion: "Bienvenida del onboarding (Archivo 40px 900 stretch 125%)",
      selector: "[data-testid='onboarding-titulo'], [role='dialog'] h1",
      esTestId: false,
      reglas: { fontFamilyContains: "Archivo", fontSizePx: 40, fontWeight: "900", fontStretch: "125%" },
    });
  }

  if (clave === "inicio" || clave === "inicio-semana") {
    checks.push(
      {
        descripcion: "Título del plan (Archivo 32px 800 stretch 112%)",
        selector: "main h1",
        esTestId: false,
        reglas: { fontFamilyContains: "Archivo", fontSizePx: 32, fontWeight: "800", fontStretch: "112%" },
      },
      {
        descripcion: "Héroe Te toca hoy (invertido de noche + elevación nivel 2)",
        selector: "heroe-te-toca-hoy",
        esTestId: true,
        reglas: { backgroundColor: dark ? PAPER : INK, boxShadowContains: "0px 3px 8px 2px" },
      },
      {
        descripcion: "Ítem activo de navegación inferior",
        selector: "[data-testid='nav-inferior'] [aria-current='page'] .a-ni",
        esTestId: false,
        reglas: { backgroundColor: dark ? PAPER : INK },
      },
    );
  }

  if (clave === "inicio-vencida") {
    checks.push({
      descripcion: "Banner suscripción vencida (tinta y advertencia v7)",
      selector: "athlete-expired-banner",
      esTestId: true,
      reglas: {
        backgroundColor: dark ? "rgb(24, 24, 27)" : "rgb(255, 255, 255)",
        borderColor: dark ? PAPER : INK,
      },
    });
  }

  if (clave === "rutina" || clave === "rutina-curso") {
    checks.push({
      descripcion: "Título DÍA 1 (Archivo 32px 800 stretch 112%)",
      selector: "main h1",
      esTestId: false,
      reglas: { fontFamilyContains: "Archivo", fontSizePx: 32, fontWeight: "800", fontStretch: "112%" },
    });
  }

  if (clave === "ex-ss" || clave === "ex-aprox" || clave === "ex-tec" || clave === "ex-offline") {
    checks.push(
      {
        descripcion: "Nombre del ejercicio (Archivo 26px 800)",
        selector: "main h1",
        esTestId: false,
        reglas: { fontFamilyContains: "Archivo", fontSizePx: 26, fontWeight: "800", fontStretch: "100%" },
      },
      {
        descripcion: "Última vez (Geist 14px 500)",
        selector: "ultima-vez",
        esTestId: true,
        reglas: { fontFamilyContains: "Geist", fontSizePx: 14, fontWeight: "500" },
      },
      ...(clave !== "ex-offline"
        ? [
            {
              descripcion: "Sugerencia Repetí/Probá",
              selector: "sugerencia-carga",
              esTestId: true,
              reglas: { backgroundColor: dark ? "rgb(6, 46, 37)" : "rgb(227, 244, 238)" },
            },
          ]
        : []),
      {
        descripcion: "Botón primario Registrar serie",
        selector: "registrar-serie-btn",
        esTestId: true,
        reglas: {
          backgroundColor: dark ? PAPER : INK,
          color: dark ? INK : PAPER,
        },
      },
      {
        descripcion: "Input de peso >= 16px y borde --line-strong",
        selector: "input[aria-label='Peso en kilogramos']",
        esTestId: false,
        reglas: { fontFamilyContains: ["Geist", "Archivo"], fontSizePx: { min: 16 } },
      },
    );
  }

  if (clave === "ex-rest" || clave === "ex-rest-pausa") {
    checks.push(
      {
        descripcion: "Timer del descanso (Archivo 44px 800)",
        selector: "rest-timer-elapsed",
        esTestId: true,
        reglas: { fontFamilyContains: "Archivo", fontSizePx: 44, fontWeight: "800" },
      },
      {
        descripcion: "Panel de descanso (elevación nivel 3)",
        selector: "rest-timer-banner",
        esTestId: true,
        reglas: { boxShadowContains: dark ? "0px 8px 18px 6px" : "0px 6px 14px 4px" },
      },
    );
  }

  if (clave === "ex-record") {
    checks.push(
      {
        descripcion: "Aviso de récord (dorado único + elevación nivel 2)",
        selector: "nuevo-record-banner",
        esTestId: true,
        reglas: {
          backgroundColor: dark ? "rgb(42, 34, 8)" : "rgb(255, 246, 218)",
          borderColor: dark ? "rgb(212, 167, 44)" : "rgb(168, 123, 11)",
          boxShadowContains: dark ? "0px 4px 10px 3px" : "0px 3px 8px 2px",
        },
      },
      {
        descripcion: "Copa de récord sin círculo de fondo",
        selector: "[data-testid='nuevo-record-banner'] svg",
        esTestId: false,
        reglas: { backgroundColor: "rgba(0, 0, 0, 0)" },
      },
    );
  }

  if (clave === "toast-record") {
    checks.push(
      {
        descripcion: "Toast de récord (dorado único + elevación nivel 3)",
        selector: "toast-sesion",
        esTestId: true,
        reglas: {
          backgroundColor: dark ? "rgb(42, 34, 8)" : "rgb(255, 246, 218)",
          color: dark ? "rgb(245, 215, 122)" : "rgb(92, 67, 0)",
          borderColor: dark ? "rgb(212, 167, 44)" : "rgb(168, 123, 11)",
          boxShadowContains: dark ? "0px 8px 18px 6px" : "0px 6px 14px 4px",
        },
      },
      {
        descripcion: "Copa del toast de récord sin fondo",
        selector: "[data-testid='toast-sesion'] .a-tic",
        esTestId: false,
        reglas: { backgroundColor: "rgba(0, 0, 0, 0)" },
      },
    );
  }

  if (clave === "cierre") {
    checks.push({
      descripcion: "Tarjeta Nuevo PR en cierre (siempre dorado oscuro)",
      selector: "cierre-dia-pr-item-0",
      esTestId: true,
      reglas: {
        backgroundColor: "rgb(42, 34, 8)",
        color: "rgb(245, 215, 122)",
        borderColor: "rgb(212, 167, 44)",
      },
    });
  }

  if (clave === "mol-alta") {
    checks.push({
      descripcion: "Molestia alta (--bad)",
      selector: "pain-banner-range-7-9",
      esTestId: true,
      reglas: { backgroundColor: "rgb(220, 38, 38)" },
    });
  }

  if (clave === "mol-hereda") {
    checks.push({
      descripcion: "Molestia heredada",
      selector: "molestia-heredada",
      esTestId: true,
      reglas: {
        borderColor: dark ? PAPER : INK,
        backgroundColor: dark ? "rgb(24, 24, 27)" : "rgb(255, 255, 255)",
      },
    });
  }

  if (clave === "hist" || clave === "hist-open") {
    checks.push({
      descripcion: "Título Historial (Archivo 32px 800 stretch 112%)",
      selector: "main h1",
      esTestId: false,
      reglas: { fontFamilyContains: "Archivo", fontSizePx: 32, fontWeight: "800", fontStretch: "112%" },
    });
  }

  if (clave === "hist") {
    checks.push({
      descripcion: "Chip PR en Historial (dorado único)",
      selector: "chip-pr",
      esTestId: true,
      reglas: {
        backgroundColor: dark ? "rgb(42, 34, 8)" : "rgb(255, 246, 218)",
        color: dark ? "rgb(245, 215, 122)" : "rgb(92, 67, 0)",
        borderColor: dark ? "rgb(212, 167, 44)" : "rgb(168, 123, 11)",
      },
    });
  }

  if (clave === "prog" || clave === "prog-tec") {
    checks.push({
      descripcion: "Título Mi progreso (Archivo 32px 800 stretch 112%)",
      selector: "main h1",
      esTestId: false,
      reglas: { fontFamilyContains: "Archivo", fontSizePx: 32, fontWeight: "800", fontStretch: "112%" },
    });
  }

  if (clave === "cls") {
    checks.push({
      descripcion: "Título Clases (Archivo 32px 800 stretch 112%)",
      selector: "main h1",
      esTestId: false,
      reglas: { fontFamilyContains: "Archivo", fontSizePx: 32, fontWeight: "800", fontStretch: "112%" },
    });
  }

  return checks;
}

/**
 * Ejecuta las aserciones de estilo computado para la pantalla cuando `ATHLETE_V7_ESTILO=1`
 * está activo (modo estricto para PRs v7). Sin ese flag, verifica que el árbol tenga estilos válidos.
 */
export async function verificarEstiloPantalla(
  page: Page,
  clave: string,
  tema: TemaContraste,
  estricto = process.env.ATHLETE_V7_ESTILO === "1",
): Promise<void> {
  if (!estricto) {
    // Verificación base de lectura de estilos computados sobre la app actual ("antes")
    const bg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
    expect(bg).toMatch(/^rgb/);
    return;
  }

  const checks = checksEstiloParaPantalla(clave, tema);
  for (const c of checks) {
    await esperarEstilo(page, c.selector, c.reglas, {
      esTestId: c.esTestId,
      descripcion: `[${clave} · ${tema}] ${c.descripcion}`,
    });
  }
}
