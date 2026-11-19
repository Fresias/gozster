import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { auditarContrasteV7 } from "./helpers/a11y-contraste";
import {
  ALL_RECETAS,
  APP_URL,
  EJ_BP,
  EJ_SQ,
  entrarADia1,
  GRUPOS_RECETAS,
  prepararEntorno,
  SERIE_HIST_EDITABLE,
  STUB_URL,
} from "./helpers/athlete-v7-recetas";
import { type TemaContraste } from "./helpers/contraste";
import { esperarEstilo } from "./helpers/estilo-v7";

interface DesbordeElemento {
  tag: string;
  id: string;
  className: string;
  testId: string | null;
  scrollWidth: number;
  clientWidth: number;
  overflowX: string;
  text: string;
}

interface DesbordeReporte {
  docScrollWidth: number;
  innerWidth: number;
  elementos: DesbordeElemento[];
}

async function auditarDesbordesEnPagina(page: Page): Promise<DesbordeReporte> {
  return page.evaluate(
    () =>
      new Promise<DesbordeReporte>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const docScrollWidth = document.documentElement.scrollWidth;
            const innerWidth = window.innerWidth;
            const root = document.querySelector(".theme-athlete") ?? document.body;
            const elementos: DesbordeElemento[] = [];

            const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
            let node: Node | null = walker.currentNode;
            while (node) {
              if (node instanceof HTMLElement) {
                const cs = window.getComputedStyle(node);
                const rect = node.getBoundingClientRect();
                const visible =
                  cs.display !== "none" &&
                  cs.visibility !== "hidden" &&
                  rect.width > 0 &&
                  rect.height > 0;

                if (visible) {
                  const overflowAuto =
                    cs.overflowX === "auto" ||
                    cs.overflowX === "scroll" ||
                    cs.overflow === "auto" ||
                    cs.overflow === "scroll";
                  const ellipsis =
                    cs.overflowX === "hidden" && cs.textOverflow === "ellipsis";
                  const isSrOnly =
                    node.classList.contains("sr-only") ||
                    node.classList.contains("a-vfile") ||
                    (node.clientWidth <= 1 && node.clientHeight <= 1);
                  const isWedgeClipHost =
                    cs.overflowX === "hidden" &&
                    (node.classList.contains("a-hero") ||
                      node.classList.contains("a-hhero") ||
                      node.classList.contains("a-dk"));
                  const isFabWithBadge =
                    node.classList.contains("a-fab") && Boolean(node.querySelector(".a-fab-badge, b"));
                  const insideSvg = Boolean(node.closest("svg"));

                  if (
                    !overflowAuto &&
                    !ellipsis &&
                    !isSrOnly &&
                    !isWedgeClipHost &&
                    !isFabWithBadge &&
                    !insideSvg &&
                    node.scrollWidth > node.clientWidth
                  ) {
                    elementos.push({
                      tag: node.tagName.toLowerCase(),
                      id: node.id,
                      className: typeof node.className === "string" ? node.className : "",
                      testId: node.getAttribute("data-testid"),
                      scrollWidth: node.scrollWidth,
                      clientWidth: node.clientWidth,
                      overflowX: cs.overflowX,
                      text: (node.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
                    });
                  }
                }
              }
              node = walker.nextNode();
            }

            resolve({ docScrollWidth, innerWidth, elementos });
          });
        });
      }),
  );
}

async function verificarSinDesborde(page: Page, contexto: string, errores: string[]) {
  const rep = await auditarDesbordesEnPagina(page);
  if (rep.docScrollWidth !== rep.innerWidth) {
    errores.push(
      `${contexto}: documentElement.scrollWidth (${rep.docScrollWidth}) !== innerWidth (${rep.innerWidth})`,
    );
  }
  if (rep.elementos.length > 0) {
    errores.push(
      `${contexto}: ${rep.elementos.length} elemento(s) con scrollWidth > clientWidth: ${JSON.stringify(rep.elementos)}`,
    );
  }
}

async function fijarPeso1475SiVisible(page: Page, clave: string, errores: string[]) {
  if (clave === "ex-x10") return;
  const pesoInput = page.getByLabel("Peso en kilogramos").first();
  if (await pesoInput.isVisible().catch(() => false)) {
    const inputType = await pesoInput.getAttribute("type");
    const valor = inputType === "number" ? "147.5" : "147,5";
    await pesoInput.fill(valor);
    await pesoInput.blur();
    await expect(pesoInput).toHaveValue(valor);
    try {
      await esperarEstilo(
        page,
        'input[aria-label="Peso en kilogramos"]',
        {
          fontFamilyContains: "Archivo",
          fontSizePx: { max: 32 },
          fontWeight: "800",
          scrollWidthFitsClientWidth: true,
        },
        { esTestId: false, descripcion: `${clave}: campo de peso con "${valor}"` },
      );
    } catch (err) {
      errores.push(err instanceof Error ? err.message : String(err));
    }
  }
}

async function withFreshMobilePage(
  browser: Browser,
  fn: (page: Page) => Promise<void>,
) {
  const context = await browser.newContext({
    baseURL: APP_URL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  try {
    await fn(page);
  } finally {
    await context.close();
  }
}

async function verificarCicloHoja(
  page: Page,
  nombre: string,
  trigger: Locator,
  dialog: Locator,
  errores: string[],
) {
  await trigger.scrollIntoViewIfNeeded();
  await trigger.focus();
  await trigger.click();
  await expect(dialog, `${nombre}: debe abrirse`).toBeVisible();

  // Reduced motion: 0 animaciones activas al abrir la hoja
  const animCount = await page.evaluate(() => document.getAnimations().length);
  if (animCount > 0) {
    errores.push(`${nombre}: document.getAnimations().length = ${animCount} (esperado 0 con reducedMotion: reduce)`);
  }

  // Verificar que el foco inicial quedó dentro del dialog
  const initialFocusInside = await dialog.evaluate((dlg) => dlg.contains(document.activeElement));
  if (!initialFocusInside) {
    errores.push(`${nombre}: el foco inicial no cayó dentro del diálogo`);
  }

  // Shift+Tab desde el título/foco inicial debe envolver dentro del diálogo (regla focus trap)
  await page.keyboard.press("Shift+Tab");
  const shiftFromInitialInside = await dialog.evaluate((dlg) => dlg.contains(document.activeElement));
  if (!shiftFromInitialInside) {
    const escapedTag = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? `${el.tagName}.${el.className}` : "null";
    });
    errores.push(`${nombre}: el foco escapó en Shift+Tab inicial hacia ${escapedTag}`);
  }

  // Recorrer 15 Tab y 4 Shift+Tab: ninguno puede escapar del diálogo
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press("Tab");
    const inside = await dialog.evaluate((dlg) => dlg.contains(document.activeElement));
    if (!inside) {
      const escapedTag = await page.evaluate(() => {
        const el = document.activeElement;
        return el ? `${el.tagName}.${el.className}` : "null";
      });
      errores.push(`${nombre}: el foco escapó del diálogo en Tab #${i + 1} hacia ${escapedTag}`);
      break;
    }
  }

  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Shift+Tab");
    const inside = await dialog.evaluate((dlg) => dlg.contains(document.activeElement));
    if (!inside) {
      const escapedTag = await page.evaluate(() => {
        const el = document.activeElement;
        return el ? `${el.tagName}.${el.className}` : "null";
      });
      errores.push(`${nombre}: el foco escapó del diálogo en Shift+Tab #${i + 1} hacia ${escapedTag}`);
      break;
    }
  }

  // Escape debe cerrar y devolver el foco al disparador
  await page.keyboard.press("Escape");
  if (await dialog.isVisible().catch(() => false)) {
    errores.push(`${nombre}: Escape no cerró el diálogo`);
    const closeBtn = dialog.locator(".a-icon-btn, [aria-label*='Cerrar']").first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
    }
  } else {
    const returned = await trigger.evaluate((el) => document.activeElement === el);
    if (!returned) {
      errores.push(`${nombre}: Escape cerró el diálogo pero no devolvió el foco al disparador`);
    }
  }
}

test.describe("@mobile Athlete v7 · QA-03 CP2: Desbordes (390 y 360 px, 147,5 y letra grande)", () => {
  test.afterAll(async ({ request }) => {
    await request.delete(`${STUB_URL}/__e2e/fixtures`).catch(() => {});
  });

  for (const [grupo, recetas] of GRUPOS_RECETAS) {
    test(`[${grupo}] todas las recetas sin desborde a 390 px y 360 px (con peso 147,5)`, async ({
      browser,
    }) => {
      test.setTimeout(300_000);
      const errores: string[] = [];

      for (const [clave, run] of Object.entries(recetas)) {
        await withFreshMobilePage(browser, async (page) => {
          try {
            await page.setViewportSize({ width: 390, height: 844 });
            await run(page, "light");
            await page.evaluate(() => document.fonts.ready);
            await fijarPeso1475SiVisible(page, clave, errores);

            await verificarSinDesborde(page, `${clave} @ 390px`, errores);

            await page.setViewportSize({ width: 360, height: 844 });
            await verificarSinDesborde(page, `${clave} @ 360px`, errores);
          } catch (err) {
            errores.push(`${clave}: error ejecutando receta: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
          }
        });
      }

      expect(errores, `Desbordes en grupo [${grupo}]:\n${errores.join("\n")}`).toEqual([]);
    });
  }

  test("letra grande del teléfono (html { font-size: 20px }): Inicio y tarjeta de serie sin scroll horizontal a 390 y 360 px", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const errores: string[] = [];

    await withFreshMobilePage(browser, async (page) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await ALL_RECETAS.inicio!(page, "light");
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "20px";
      });
      await verificarSinDesborde(page, "inicio con html 20px @ 390px", errores);

      await page.setViewportSize({ width: 360, height: 844 });
      await verificarSinDesborde(page, "inicio con html 20px @ 360px", errores);
    });

    await withFreshMobilePage(browser, async (page) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await ALL_RECETAS["ex-ss"]!(page, "light");
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "20px";
      });
      await fijarPeso1475SiVisible(page, "ex-ss-20px", errores);
      await verificarSinDesborde(page, "tarjeta de serie con html 20px y 147,5 @ 390px", errores);

      await page.setViewportSize({ width: 360, height: 844 });
      await verificarSinDesborde(page, "tarjeta de serie con html 20px y 147,5 @ 360px", errores);
    });

    expect(errores, `Desbordes con letra grande (20px):\n${errores.join("\n")}`).toEqual([]);
  });
});

test.describe("@mobile Athlete v7 · QA-03 CP3: Contraste, teclado y movimiento reducido", () => {
  test.afterAll(async ({ request }) => {
    await request.delete(`${STUB_URL}/__e2e/fixtures`).catch(() => {});
  });

  const CLAVES_CONTRASTE = [
    "onb1",
    "inicio",
    "inicio-vencida",
    "rutina",
    "ex-ss",
    "ex-tec",
    "ex-record",
    "toast-record",
    "ex-rest",
    "mol-leve",
    "mol-mod",
    "mol-alta",
    "mol-alarma",
    "mol-hereda",
    "hist-open",
    "prog",
    "cls",
    "cierre",
    "chat",
    "notes",
    "setvideo",
  ] as const;

  for (const tema of ["light", "dark"] as TemaContraste[]) {
    test(`contraste WCAG (>= 4,5:1 texto, >= 3:1 grande/bordes/copa) en tema ${tema}`, async ({
      browser,
    }) => {
      test.setTimeout(300_000);
      const fallos: string[] = [];

      for (const clave of CLAVES_CONTRASTE) {
        await withFreshMobilePage(browser, async (page) => {
          await ALL_RECETAS[clave]!(page, tema);
          await page.evaluate(() => document.fonts.ready);
          const res = await auditarContrasteV7(page, `${clave} (${tema})`);
          for (const f of res.fallos) {
            fallos.push(
              `[${clave} · ${tema}] ${f.tipo}: ${f.descripcion} (${f.fg} sobre ${f.bg} -> ${f.ratio}:1 < ${f.requerido}:1)`,
            );
          }
        });
      }

      expect(fallos, `Fallos de contraste en ${tema}:\n${fallos.join("\n")}`).toEqual([]);
    });
  }

  test("teclado y movimiento reducido: focus trap, Escape, retorno de foco y getAnimations() === 0 en todas las hojas", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const errores: string[] = [];

    // 1. Hojas de Inicio: hacer otro día, instalar app, chat
    await withFreshMobilePage(browser, async (page) => {
      await ALL_RECETAS.inicio!(page, "light");
      await verificarCicloHoja(
        page,
        "Hoja Hacer otro día",
        page.getByTestId("hacer-otro-dia-btn"),
        page.getByTestId("sheet-cambiar-dia"),
        errores,
      );
      await verificarCicloHoja(
        page,
        "Hoja Instalar app",
        page.getByTestId("instalar-app-btn"),
        page.getByTestId("instalar-app-sheet"),
        errores,
      );
      await verificarCicloHoja(
        page,
        "Hoja Chat",
        page.getByTestId("athlete-chat-fab"),
        page.locator("#athlete-chat-drawer"),
        errores,
      );
    });

    // 2. Hoja Suscripción vencida (desde "Ver detalle")
    await withFreshMobilePage(browser, async (page) => {
      await ALL_RECETAS["inicio-vencida"]!(page, "light");
      await verificarCicloHoja(
        page,
        "Hoja Suscripción vencida",
        page.getByTestId("expired-open-details"),
        page.getByTestId("athlete-expired-dialog"),
        errores,
      );
    });

    // 3. Hoja Configuración (desde Rutina)
    await withFreshMobilePage(browser, async (page) => {
      await entrarADia1(page, "light");
      await verificarCicloHoja(
        page,
        "Hoja Configuración",
        page.getByTestId("athlete-settings-btn"),
        page.getByRole("dialog", { name: "Configuración" }),
        errores,
      );
    });

    // 4. Hojas del ejercicio: Indicaciones, Video demostrativo, Molestia, Video de la serie
    await withFreshMobilePage(browser, async (page) => {
      await entrarADia1(page, "light");
      await page.getByTestId(`exercise-select-btn-${EJ_SQ}`).click();
      await verificarCicloHoja(
        page,
        "Hoja Indicaciones",
        page.getByTestId(`exercise-notes-btn-${EJ_SQ}`),
        page.getByTestId("exercise-notes-modal"),
        errores,
      );
      await page.getByTestId("volver-a-rutina-btn").click();
      await page.getByTestId(`exercise-select-btn-${EJ_BP}`).click();
      await verificarCicloHoja(
        page,
        "Hoja Video demostrativo",
        page.getByTestId(`demo-technique-btn-${EJ_BP}`),
        page.getByTestId("exercise-video-modal"),
        errores,
      );
      await verificarCicloHoja(
        page,
        "Hoja Tengo una molestia",
        page.getByTestId(`exercise-pain-report-btn-${EJ_BP}`),
        page.getByTestId("pain-report-modal"),
        errores,
      );
      await page.getByTestId("registrar-serie-btn").click();
      const omitir = page.getByRole("button", { name: "Omitir" });
      if (await omitir.isVisible().catch(() => false)) await omitir.click();
      // Al registrar en biserie A1 (Press banca), puede auto-avanzar a A2 (Remo): volver a Press banca
      if (await page.getByTestId("volver-a-rutina-btn").isVisible().catch(() => false)) {
        await page.getByTestId("volver-a-rutina-btn").click();
      }
      await page.getByTestId(`exercise-select-btn-${EJ_BP}`).click();
      await verificarCicloHoja(
        page,
        "Hoja Video de la serie",
        page.getByTestId("serie-video-btn-1"),
        page.getByTestId("video-upload-modal"),
        errores,
      );
    });

    // 5. Hoja Corregir serie (Historial)
    await withFreshMobilePage(browser, async (page) => {
      await ALL_RECETAS["hist-open"]!(page, "light");
      await verificarCicloHoja(
        page,
        "Hoja Corregir serie",
        page.getByTestId(`btn-editar-serie-${SERIE_HIST_EDITABLE}`),
        page.getByTestId(`form-editar-serie-${SERIE_HIST_EDITABLE}`),
        errores,
      );
    });

    expect(errores, `Fallos de teclado/movimiento reducido en hojas:\n${errores.join("\n")}`).toEqual([]);
  });

  test("navegación inferior con aria-current='page' y todo botón con nombre accesible (getByRole)", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const errores: string[] = [];

    const rutasNav: Array<{ url: string; label: string; readyTestId: string }> = [
      { url: "/athlete", label: "Entrenar", readyTestId: "inicio-mis-dias-container" },
      { url: "/athlete/historial", label: "Historial", readyTestId: "historial-sesiones-container" },
      { url: "/athlete/progreso", label: "Progreso", readyTestId: "progreso-container" },
      { url: "/athlete/clases", label: "Clases", readyTestId: "athlete-classes" },
    ];

    await withFreshMobilePage(browser, async (page) => {
      await prepararEntorno(page, { tema: "light" });
      for (const r of rutasNav) {
        await page.goto(r.url);
        if (r.url === "/athlete/progreso") {
          await expect(page.getByRole("heading", { name: "Mi progreso" })).toBeVisible({ timeout: 25_000 });
        } else {
          await expect(page.getByTestId(r.readyTestId)).toBeVisible({ timeout: 25_000 });
        }
        const nav = page.getByTestId("nav-inferior");
        const activeLinks = nav.locator('[aria-current="page"]');
        const count = await activeLinks.count();
        if (count !== 1) {
          errores.push(`${r.url}: se esperaba 1 enlace con aria-current="page", hubo ${count}`);
        } else {
          const text = (await activeLinks.first().innerText()).trim();
          if (text !== r.label) {
            errores.push(`${r.url}: aria-current="page" apunta a "${text}" en lugar de "${r.label}"`);
          }
        }
      }
    });

    // Verificar que todo botón visible (incluidos icon-only) tiene nombre accesible detectable por getByRole("button", { name })
    for (const clave of ["inicio", "rutina", "ex-ss", "hist-open", "prog", "cls"] as const) {
      await withFreshMobilePage(browser, async (page) => {
        await ALL_RECETAS[clave]!(page, "light");
        const infoBotones = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
          const sinNombre: string[] = [];
          const nombres: string[] = [];
          for (const b of btns) {
            const cs = window.getComputedStyle(b);
            const rect = b.getBoundingClientRect();
            if (cs.display === "none" || cs.visibility === "hidden" || rect.width === 0 || rect.height === 0) {
              continue;
            }
            const ariaLabel = b.getAttribute("aria-label")?.trim() ?? "";
            const title = b.getAttribute("title")?.trim() ?? "";
            const text = (b.innerText ?? "").replace(/\s+/g, " ").trim();
            const nombre = ariaLabel || text || title;
            if (!nombre) {
              sinNombre.push(b.outerHTML.slice(0, 120));
            } else {
              nombres.push(nombre);
            }
          }
          return { sinNombre, nombres };
        });

        for (const s of infoBotones.sinNombre) {
          errores.push(`[${clave}] botón sin nombre accesible: ${s}`);
        }
        for (const nombre of new Set(infoBotones.nombres)) {
          const found = await page.getByRole("button", { name: nombre }).count();
          if (found === 0) {
            errores.push(`[${clave}] getByRole("button", { name: ${JSON.stringify(nombre)} }) devolvió 0`);
          }
        }
      });
    }

    expect(errores, `Fallos de navegación/botones accesibles:\n${errores.join("\n")}`).toEqual([]);
  });
});
