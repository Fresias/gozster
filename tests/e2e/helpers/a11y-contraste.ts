import { expect, type Page } from "@playwright/test";

export interface ContrasteFallo {
  tipo: "texto" | "borde" | "copa";
  descripcion: string;
  fg: string;
  bg: string;
  ratio: number;
  requerido: number;
}

export interface ContrasteResultado {
  total: number;
  minRatio: number;
  fallos: ContrasteFallo[];
}

export async function auditarContrasteV7(
  page: Page,
  contexto: string,
): Promise<ContrasteResultado> {
  const res = await page.evaluate(() => {
    interface RGBA {
      r: number;
      g: number;
      b: number;
      a: number;
    }

    function parseColor(colorStr: string): RGBA | null {
      const m = colorStr.match(
        /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/i,
      );
      if (!m) return null;
      return {
        r: Math.round(parseFloat(m[1]!)),
        g: Math.round(parseFloat(m[2]!)),
        b: Math.round(parseFloat(m[3]!)),
        a: m[4] !== undefined ? parseFloat(m[4]) : 1,
      };
    }

    function fmtRgb(c: RGBA): string {
      return `rgb(${c.r}, ${c.g}, ${c.b})`;
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

    function getEffectiveBackground(el: Element | null, skipSelf = false): RGBA {
      const layers: RGBA[] = [];
      let curr: Element | null = skipSelf ? el?.parentElement ?? null : el;

      while (curr && curr !== document.documentElement) {
        const bg = window.getComputedStyle(curr).backgroundColor;
        const parsed = parseColor(bg);
        if (parsed && parsed.a > 0) {
          layers.unshift(parsed);
        }
        curr = curr.parentElement;
      }

      const isDark = document.documentElement.classList.contains("dark");
      let base: RGBA = isDark ? { r: 9, g: 9, b: 11, a: 1 } : { r: 250, g: 250, b: 250, a: 1 };
      for (const layer of layers) {
        base = composite(layer, base);
      }
      return base;
    }

    function isVisible(el: Element): boolean {
      if (!(el instanceof HTMLElement || el instanceof SVGElement)) return false;
      const cs = window.getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) {
        return false;
      }
      if (el.classList.contains("sr-only") || el.closest(".sr-only")) return false;
      if (el.getAttribute("aria-hidden") === "true") return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    function hasDirectText(el: HTMLElement): boolean {
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent && node.textContent.trim().length > 0) {
          return true;
        }
      }
      return false;
    }

    const root = document.querySelector(".theme-athlete") ?? document.body;
    const fallos: Array<{
      tipo: "texto" | "borde" | "copa";
      descripcion: string;
      fg: string;
      bg: string;
      ratio: number;
      requerido: number;
    }> = [];
    let total = 0;
    let minRatio = 21;

    // 1. Auditar todos los elementos visibles con texto directo
    const allEls = Array.from(root.querySelectorAll<HTMLElement>("*"));
    for (const el of allEls) {
      if (!isVisible(el)) continue;
      if (!hasDirectText(el)) continue;
      // Elementos deshabilitados quedan exentos en WCAG 2.1 (1.4.3), pero si no está disabled se exige ratio completo
      if (el.matches(":disabled") || el.closest(":disabled") || el.getAttribute("aria-disabled") === "true") {
        continue;
      }
      // Ignorar marca decorativa "G" al 4%
      if (el.classList.contains("a-bigG")) continue;

      const txt = (el.innerText ?? "").replace(/\s+/g, " ").trim();
      if (!txt || txt === "·" || txt === "●") continue;

      const cs = window.getComputedStyle(el);
      const fgParsed = parseColor(cs.color);
      if (!fgParsed || fgParsed.a === 0) continue;

      const bg = getEffectiveBackground(el);
      const fg = fgParsed.a < 1 ? composite(fgParsed, bg) : fgParsed;
      const ratio = Number(contrast(fg, bg).toFixed(2));
      const fontSize = parseFloat(cs.fontSize);
      const fontWeight = parseInt(cs.fontWeight, 10) || 400;
      const isLarge = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
      const requerido = isLarge ? 3.0 : 4.5;

      total += 1;
      if (ratio < minRatio) minRatio = ratio;

      if (ratio < requerido) {
        fallos.push({
          tipo: "texto",
          descripcion: `${el.tagName.toLowerCase()}.${typeof el.className === "string" ? el.className.split(" ").slice(0, 3).join(".") : ""} "${txt.slice(0, 40)}"`,
          fg: fmtRgb(fg),
          bg: fmtRgb(bg),
          ratio,
          requerido,
        });
      }
    }

    // 2. Bordes de controles y advertencias de 05-qa.md §3.2 y §6 (>= 3:1)
    const borderSelectors = [
      'input[aria-label="Peso en kilogramos"]',
      'input[aria-label="Repeticiones realizadas"]',
      ".a-val",
      ".a-stepper button",
      ".a-fin",
      '[data-testid="molestia-heredada"]',
      '[data-testid="nuevo-record-banner"]',
      '[data-testid="chip-pr"]',
      '[data-testid="toast-sesion"].a-rec',
      '[data-testid="cierre-dia-pr-item-0"]',
    ];
    for (const sel of borderSelectors) {
      const el = root.querySelector<HTMLElement>(sel);
      if (!el || !isVisible(el)) continue;
      const cs = window.getComputedStyle(el);
      const bWidth = parseFloat(cs.borderTopWidth);
      if (!bWidth || bWidth <= 0) continue;
      const bParsed = parseColor(cs.borderTopColor);
      if (!bParsed || bParsed.a === 0) continue;
      const parentBg = getEffectiveBackground(el, true);
      const bColor = bParsed.a < 1 ? composite(bParsed, parentBg) : bParsed;
      const ratio = Number(contrast(bColor, parentBg).toFixed(2));
      total += 1;
      if (ratio < minRatio) minRatio = ratio;
      if (ratio < 3.0) {
        fallos.push({
          tipo: "borde",
          descripcion: `Borde de ${sel}`,
          fg: fmtRgb(bColor),
          bg: fmtRgb(parentBg),
          ratio,
          requerido: 3.0,
        });
      }
    }

    // 3. Copa del récord y SVGs en íconos de estado / nav activo (>= 3:1)
    const iconSelectors = [
      '[data-testid="nuevo-record-banner"] svg',
      '[data-testid="toast-sesion"].a-rec svg',
      '[data-testid="chip-pr"] svg',
      '[data-testid="cierre-dia-pr-item-0"] svg',
      '[data-testid="nav-inferior"] [aria-current="page"] .a-ni svg',
    ];
    for (const sel of iconSelectors) {
      const svg = root.querySelector<SVGElement>(sel);
      if (!svg || !isVisible(svg)) continue;
      const cs = window.getComputedStyle(svg);
      const strokeOrColor = parseColor(cs.stroke !== "none" ? cs.stroke : cs.color) ?? parseColor(cs.color);
      if (!strokeOrColor || strokeOrColor.a === 0) continue;
      const bg = getEffectiveBackground(svg);
      const fg = strokeOrColor.a < 1 ? composite(strokeOrColor, bg) : strokeOrColor;
      const ratio = Number(contrast(fg, bg).toFixed(2));
      total += 1;
      if (ratio < minRatio) minRatio = ratio;
      if (ratio < 3.0) {
        fallos.push({
          tipo: "copa",
          descripcion: `Ícono ${sel}`,
          fg: fmtRgb(fg),
          bg: fmtRgb(bg),
          ratio,
          requerido: 3.0,
        });
      }
    }

    return { total, minRatio, fallos };
  });

  expect(res.total, `${contexto}: debe auditar al menos un elemento visible`).toBeGreaterThan(0);
  return res;
}
