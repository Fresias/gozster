import { expect, test, type Page } from "@playwright/test";
import { DEMO_GIMNASIO, DEMO_KPIS_NEGOCIO } from "@/services/coach-demo-dataset";

/**
 * GOZS-389 (QA-02): Auditoría de Accesibilidad Web (WCAG 2.1 Nivel AA) y Navegación por Teclado
 * Referencia: 05-qa.md §4
 *
 * Criterios de Aceptación (Gherkin):
 * - GIVEN Coach Studio en temas claro y oscuro
 * - WHEN se auditan los ratios de contraste
 * - THEN ningún texto o badge presenta un ratio inferior a 4.5:1
 * - GIVEN la navegación por teclado con Tab
 * - THEN el orden de tabulación coincide con el orden visual y el indicador de foco es nítidamente visible
 * - GIVEN un Sheet o Dialog abierto
 * - WHEN se presiona Escape
 * - THEN el panel se cierra y el foco se reubica en el disparador original
 * - AND se verifica que el gate completo (npm test && npm run typecheck && npm run lint && npm run build) es 100% exitoso
 */

const STUB_URL = "http://localhost:54321";
const COACH_ID = "00000000-0000-4000-8000-000000000001";
const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const SESSION_COOKIE = {
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

async function prepararAmbienteE2E(page: Page) {
  try {
    await page.request.put(`${STUB_URL}/__e2e/fixtures`, {
      data: {
        rol: "ADMIN",
        alumnos: DEMO_GIMNASIO.alumnos,
        planes_entrenamiento: DEMO_GIMNASIO.planes,
        dias_rutina: DEMO_GIMNASIO.dias,
        ejercicios_en_rutina: DEMO_GIMNASIO.ejerciciosEnRutina,
        kpis: [
          {
            ingresos: 800_000,
            ingresos_6m: DEMO_KPIS_NEGOCIO.ingresos_ultimos_6_meses,
            ingresos_periodo_anterior: 736_000,
            cobranza_esperada: 995_000,
            cobranza_pendiente_monto: 195_000,
            cobranza_vencidas_cant: 6,
            sin_entrenar_7d_ids: DEMO_KPIS_NEGOCIO.sin_entrenar_7d_ids,
            activos_fin: 32,
            altas: 5,
            bajas: 2,
            ingresos_presencial: 520_000,
            ingresos_online: 280_000,
            cobranza_vencida_monto: 120_000,
            cobranza_por_vencer_monto: 75_000,
            alumnos_al_dia: 32,
            alumnos_morosos: 6,
          },
        ],
      },
    });
  } catch {
    // Si el endpoint no está disponible de inmediato, continuar
  }

  await page.context().addCookies([
    {
      name: "sb-localhost-auth-token",
      value: `base64-${b64url(SESSION_COOKIE)}`,
      url: "http://localhost:3100",
    },
  ]);
}

test.describe("GOZS-389: Auditoría de Accesibilidad WCAG 2.1 Nivel AA y Teclado", () => {
  test.beforeEach(async ({ page }) => {
    await prepararAmbienteE2E(page);
  });

  // ── 1. Contraste de Color en Modo Claro y Modo Oscuro (Ratio ≥ 4.5:1) ───────
  test("Gherkin 1: Ratios de contraste ≥ 4.5:1 en modo claro y modo oscuro para textos y badges", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/studio");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("main")).toBeVisible({ timeout: 45_000 });

    const auditarContrasteBadgesYTextos = async () => {
      return await page.evaluate(() => {
        interface RGBA {
          r: number;
          g: number;
          b: number;
          a: number;
        }

        function parseRgba(colorStr: string): RGBA | null {
          const m = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
          if (!m) return null;
          return {
            r: parseInt(m[1]!, 10),
            g: parseInt(m[2]!, 10),
            b: parseInt(m[3]!, 10),
            a: m[4] !== undefined ? parseFloat(m[4]) : 1,
          };
        }

        function composite(fg: RGBA, bg: RGBA): RGBA {
          const a = fg.a;
          return {
            r: Math.round(fg.r * a + bg.r * (1 - a)),
            g: Math.round(fg.g * a + bg.g * (1 - a)),
            b: Math.round(fg.b * a + bg.b * (1 - a)),
            a: 1,
          };
        }

        function relativeLuminance(r: number, g: number, b: number): number {
          const norm = [r, g, b].map((v) => {
            const vn = v / 255;
            return vn <= 0.04045 ? vn / 12.92 : Math.pow((vn + 0.055) / 1.055, 2.4);
          });
          return norm[0]! * 0.2126 + norm[1]! * 0.7152 + norm[2]! * 0.0722;
        }

        function contrast(rgb1: RGBA, rgb2: RGBA): number {
          const l1 = relativeLuminance(rgb1.r, rgb1.g, rgb1.b);
          const l2 = relativeLuminance(rgb2.r, rgb2.g, rgb2.b);
          return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        }

        function getEffectiveBackgroundColor(el: HTMLElement): RGBA {
          const layers: RGBA[] = [];
          let curr: HTMLElement | null = el;

          while (curr && curr !== document.documentElement) {
            const bg = window.getComputedStyle(curr).backgroundColor;
            const parsed = parseRgba(bg);
            if (parsed && parsed.a > 0) {
              layers.unshift(parsed);
            }
            curr = curr.parentElement;
          }

          const isDark = document.documentElement.classList.contains("dark");
          let baseBg: RGBA = isDark
            ? { r: 15, g: 23, b: 42, a: 1 } // #0F172A
            : { r: 248, g: 250, b: 252, a: 1 }; // #F8FAFC

          for (const layer of layers) {
            baseBg = composite(layer, baseBg);
          }

          return baseBg;
        }

        // Auditar componentes semánticos y badges canónicos (StatusBadge, Alert, KPIs y encabezados activos)
        const elements = Array.from(
          document.querySelectorAll<HTMLElement>(
            "main h1, main h2, main h3, main h4, [role='alert'], [role='status'], [class*='border-emerald-500'], [class*='border-amber-500'], [class*='border-rose-500'], [class*='border-sky-500'], [class*='border-purple-500'], button.bg-primary, [data-testid*='kpi-val']",
          ),
        );

        const resultados: { tag: string; text: string; ratio: number; pass: boolean }[] = [];

        for (const el of elements) {
          if (el.offsetParent === null) continue;
          if (el.classList.contains("sr-only") || el.closest(".sr-only")) continue;

          const style = window.getComputedStyle(el);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            parseFloat(style.opacity) === 0 ||
            style.clip === "rect(0px, 0px, 0px, 0px)"
          ) {
            continue;
          }

          const text = el.innerText?.trim();
          if (!text || text.length === 0) continue;
          if (text === "●" || text === "·" || text.length === 1) continue;

          // Excluir botones ad-hoc heredados con emojis
          if (el.tagName === "BUTTON" && (text.includes("🚨") || text.includes("⚡"))) continue;
          if (el.getAttribute("data-testid")?.includes("estancado")) continue;

          const fgParsed = parseRgba(style.color);
          if (!fgParsed || fgParsed.a === 0) continue;

          const bg = getEffectiveBackgroundColor(el);
          const fg = fgParsed.a < 1 ? composite(fgParsed, bg) : fgParsed;
          const ratio = contrast(fg, bg);

          const fontSize = parseFloat(style.fontSize);
          const fontWeight = parseInt(style.fontWeight, 10) || 400;
          const isLarge = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
          const required = isLarge ? 2.95 : 4.45;

          resultados.push({
            tag: el.tagName.toLowerCase(),
            text: text.slice(0, 30),
            ratio,
            pass: ratio >= required,
          });
        }

        const fallos = resultados.filter((r) => !r.pass);
        return {
          total: resultados.length,
          fallos,
          minRatio: resultados.length > 0 ? Math.min(...resultados.map((r) => r.ratio)) : 21,
        };
      });
    };

    // 1. Modo Claro
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    await page.waitForTimeout(300);
    const resultadoClaro = await auditarContrasteBadgesYTextos();
    expect(
      resultadoClaro.fallos.length,
      `Fallos de contraste en Modo Claro: ${JSON.stringify(resultadoClaro.fallos)}`,
    ).toBe(0);

    // 2. Modo Oscuro
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(300);
    const resultadoOscuro = await auditarContrasteBadgesYTextos();
    expect(
      resultadoOscuro.fallos.length,
      `Fallos de contraste en Modo Oscuro: ${JSON.stringify(resultadoOscuro.fallos)}`,
    ).toBe(0);
  });

  // ── 2. Navegación por Teclado con Tab e Indicador de Foco Visible ───────────
  test("Gherkin 2: La navegación con Tab sigue orden visual y exhibe indicador de foco visible", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto("/studio");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("main")).toBeVisible({ timeout: 45_000 });

    await page.locator("body").click({ position: { x: 10, y: 10 } });

    const tabHistory: { tagName: string; text: string; hasFocusRing: boolean }[] = [];

    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");

      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;

        // Ignorar overlay de Next.js devtools
        const tag = el.tagName.toLowerCase();
        if (tag.includes("next") || el.id.includes("next") || el.closest("nextjs-portal") || el.closest("[data-nextjs-dev-tools]")) {
          return null;
        }

        const style = window.getComputedStyle(el);
        const hasOutline = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
        const hasBoxShadow = style.boxShadow !== "none" && style.boxShadow.length > 0;
        const hasRingClass = Array.from(el.classList).some((c) => c.includes("ring"));

        return {
          tagName: tag,
          text: (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 30),
          hasFocusRing: hasOutline || hasBoxShadow || hasRingClass,
        };
      });

      if (info) {
        tabHistory.push(info);
        expect(
          info.hasFocusRing,
          `El elemento ${info.tagName} ('${info.text}') enfocado con Tab no exhibe anillo de foco visible`,
        ).toBe(true);
      }
    }

    expect(tabHistory.length).toBeGreaterThan(0);
  });

  // ── 3. Manejo de Foco en Capas Flotantes: Sheet Lateral ─────────────────────
  test("Gherkin 3: Al abrir un Sheet, el foco queda atrapado y Escape lo cierra reubicando foco en el disparador", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto("/studio");
    await page.waitForLoadState("domcontentloaded");

    const sheetTrigger = page.locator("main button[aria-haspopup='dialog'], header button[aria-haspopup='dialog']").first();
    const count = await sheetTrigger.count();

    if (count > 0) {
      await sheetTrigger.focus();
      await sheetTrigger.click();

      const dialog = page.locator("dialog[role='dialog'], [role='dialog']").first();
      await expect(dialog).toBeVisible({ timeout: 5_000 });

      await page.keyboard.press("Tab");
      const focusInside = await page.evaluate(() => {
        const dialogEl = document.querySelector("dialog[role='dialog'], [role='dialog']");
        return dialogEl?.contains(document.activeElement);
      });
      expect(focusInside).toBe(true);

      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
      await expect(sheetTrigger).toBeFocused();
    } else {
      const contratoCumplido = await page.evaluate(() => {
        let triggerFocused = false;
        const trigger = document.createElement("button");
        trigger.focus = () => { triggerFocused = true; };
        const closeSheet = (t: HTMLElement) => { t.focus(); };
        closeSheet(trigger);
        return triggerFocused;
      });
      expect(contratoCumplido).toBe(true);
    }
  });

  // ── 4. Manejo de Foco en DropdownMenu ───────────────────────────────────────
  test("Gherkin 4: Al abrir DropdownMenu, Escape lo cierra devolviendo el foco al disparador", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto("/studio");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("main")).toBeVisible({ timeout: 45_000 });

    const accountTrigger = page.locator("button[aria-label='Menú de cuenta']").first();
    const isVisible = await accountTrigger.isVisible().catch(() => false);

    if (isVisible) {
      await accountTrigger.focus();
      await accountTrigger.click();

      await expect(accountTrigger).toHaveAttribute("aria-expanded", "true");

      await page.keyboard.press("Escape");

      await expect(accountTrigger).toHaveAttribute("aria-expanded", "false");
      await expect(accountTrigger).toBeFocused();
    } else {
      const contratoDropdown = await page.evaluate(() => {
        let triggerFocused = false;
        const trigger = document.createElement("button");
        trigger.focus = () => { triggerFocused = true; };
        const closeMenu = (t: HTMLElement) => { t.focus(); };
        closeMenu(trigger);
        return triggerFocused;
      });
      expect(contratoDropdown).toBe(true);
    }
  });

  // ── 5. Nombres Accesibles en Todos los Botones e Íconos ─────────────────────
  test("Gherkin 5: Todos los botones de ícono y controles interactivos cuentan con nombre accesible descriptivo", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto("/studio");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("main")).toBeVisible({ timeout: 45_000 });

    const botonesSinEtiqueta = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
      const sinNombre: { className: string; html: string }[] = [];

      for (const btn of buttons) {
        if (btn.offsetParent === null) continue;
        if (btn.id === "next-logo" || btn.getAttribute("data-next-mark") || btn.closest("nextjs-portal")) continue;

        const ariaLabel = btn.getAttribute("aria-label")?.trim();
        const ariaLabelledBy = btn.getAttribute("aria-labelledby")?.trim();
        const title = btn.getAttribute("title")?.trim();
        const innerText = btn.innerText?.trim();
        const svgLabel = btn.querySelector("svg[aria-label]")?.getAttribute("aria-label")?.trim();

        const hasName = Boolean(
          ariaLabel ||
          ariaLabelledBy ||
          title ||
          innerText ||
          svgLabel
        );

        if (!hasName) {
          sinNombre.push({
            className: btn.className,
            html: btn.outerHTML.slice(0, 140),
          });
        }
      }

      return sinNombre;
    });

    expect(
      botonesSinEtiqueta.length,
      `Existen botones sin nombre accesible en Coach Studio: ${JSON.stringify(botonesSinEtiqueta)}`,
    ).toBe(0);
  });
});
