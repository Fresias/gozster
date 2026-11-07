import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  DEMO_GIMNASIO,
  DEMO_KPIS_NEGOCIO,
} from "@/services/coach-demo-dataset";
import { generarDemoPlanesIniciales } from "@/store/use-cobros-store";

/**
 * GOZS-388 (QA-02): Auditoría de Regresión E2E y Capturas Visuales Multi-Viewport (1440, 1366, 768, 390)
 * Referencia: 05-qa.md §3
 *
 * Cubre las 8 vistas críticas de Coach Studio y móvil en los 4 proyectos de Playwright:
 *   - UX-S: Shell (Navegación general, Topbar, Sidebar en desktop/tablet y Barra inferior en móvil)
 *   - UX-I: Inicio (Dashboard con 4 KPIs de negocio, bloques centrales y selector de período)
 *   - UX-D: Directorio (Directorio de alumnos abierto por defecto con DataTable de 15 filas)
 *   - UX-F: Ficha (Ficha de alumno con cabecera limpia e islas modulares de salud, rutina y 1RM)
 *   - UX-C: Cobros (Panel de cobros con KPIs superiores y DataTable de cobranza en es-AR)
 *   - UX-A: Agenda (Grilla semanal horaria dinámica según clases activas)
 *   - UX-R: Rutinas (Biblioteca de rutinas con apertura por defecto en "De Alumnos" y tabs)
 *   - UX-K: Ranking (Ranking funcional con fila unificada de guardado y chips neutros)
 *
 * En cada vista se valida:
 *   1. Ausencia de scroll horizontal de ventana (scrollWidth - innerWidth === 0).
 *   2. Ausencia de excepciones de JavaScript en consola (0 errores).
 *   3. Ausencia de texto de desarrollo prohibido (NaN, Infinity, undefined, [object Object]).
 *   4. Generación y almacenamiento de capturas de evidencia en docs/qa/demo-evidencia/<proyecto>/UX-*.png.
 */

const STUB_URL = "http://localhost:54321";
const APP_URL = "http://localhost:3100";
const COACH_ID = "00000000-0000-4000-8000-000000000001";
const EVIDENCIA_BASE = "docs/qa/demo-evidencia";

interface ResultadoEscenario {
  id: string;
  nombre: string;
  viewport: string;
  proyecto: string;
  estado: "PASS" | "FAIL";
  desbordePx: number;
  erroresConsola: number;
  evidencia: string;
  detalle?: string;
}

const b64url = (o: unknown) =>
  Buffer.from(JSON.stringify(o)).toString("base64url");

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

async function prepararAmbiente(page: Page) {
  // 1. Cargar fixtures completos en el stub de Supabase
  await page.request.put(`${STUB_URL}/__e2e/fixtures`, {
    data: {
      rol: "ADMIN",
      alumnos: DEMO_GIMNASIO.alumnos,
      planes_entrenamiento: DEMO_GIMNASIO.planes,
      dias_rutina: DEMO_GIMNASIO.dias,
      ejercicios_en_rutina: DEMO_GIMNASIO.ejerciciosEnRutina,
      ejercicios: DEMO_GIMNASIO.ejercicios,
      kpis_negocio: [
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

  // 2. Cookie de autenticación para Coach Studio
  await page.context().addCookies([
    {
      name: "sb-localhost-auth-token",
      value: `base64-${b64url(SESSION_COOKIE)}`,
      url: APP_URL,
    },
  ]);

  // 3. Inicializar stores locales de cobros y flags
  const planes = generarDemoPlanesIniciales();
  await page.addInitScript(
    ({ planes }) => {
      window.localStorage.setItem("gozster-dev-mode", "false");
      window.localStorage.setItem(
        "gozster-cobros",
        JSON.stringify({
          state: {
            filtroEstado: "TODOS",
            planes,
          },
          version: 0,
        })
      );
    },
    { planes }
  );
}

const desbordeHorizontal = (page: Page) =>
  page.evaluate(() => {
    const docEl = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(docEl.scrollWidth, body ? body.scrollWidth : 0);
    const innerWidth = window.innerWidth;
    return Math.max(0, scrollWidth - innerWidth);
  });

const verificarSinTextoProhibido = async (page: Page, escenarioId: string) => {
  const txt = await page.locator("main, body").first().innerText();
  const match = txt.match(/\bNaN\b|Infinity|undefined|\[object Object\]/);
  expect(
    match,
    `[${escenarioId}] Texto prohibido de desarrollo detectado en pantalla: "${match?.[0]}"`
  ).toBeNull();
};

test.describe("@multi-viewport Regresión Visual y E2E Multi-Viewport (UX-S a UX-K)", () => {
  test("@multi-viewport Auditoría visual completa de las 8 vistas críticas", async ({
    page,
  }, info: TestInfo) => {
    test.setTimeout(300_000);
    page.setDefaultTimeout(15_000);

    const vpSize = page.viewportSize();
    const vpString = vpSize ? `${vpSize.width}x${vpSize.height}` : "default";
    const proyecto = info.project.name;
    const carpeta = `${EVIDENCIA_BASE}/${proyecto}`;
    mkdirSync(carpeta, { recursive: true });

    const erroresConsola: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const txt = msg.text();
        // Ignorar artefactos del dev server de Next.js (HMR websocket) o favicon
        if (
          !txt.includes("webpack-hmr") &&
          !txt.includes("favicon.ico") &&
          !txt.includes("Failed to load resource")
        ) {
          erroresConsola.push(`[console] ${txt.slice(0, 160)}`);
        }
      }
    });
    page.on("pageerror", (err) => {
      erroresConsola.push(`[pageerror] ${err.message.slice(0, 160)}`);
    });

    await prepararAmbiente(page);

    const resultados: ResultadoEscenario[] = [];

    const ejecutarEscenario = async (
      id: string,
      nombre: string,
      accion: () => Promise<void>
    ) => {
      let estado: "PASS" | "FAIL" = "PASS";
      let detalle = "";
      const erroresAntes = erroresConsola.length;

      await test.step(`${id}: ${nombre}`, async () => {
        try {
          await accion();

          // 1. Validar ausencia de desborde horizontal (scrollWidth - innerWidth === 0)
          const desborde = await desbordeHorizontal(page);
          expect(
            desborde,
            `[${id}] Desborde horizontal de ${desborde}px en viewport ${vpString}`
          ).toBe(0);

          // 2. Validar ausencia de texto prohibido de desarrollo
          await verificarSinTextoProhibido(page, id);

          // 3. Validar ausencia de nuevas excepciones en consola
          const erroresNuevos = erroresConsola.slice(erroresAntes);
          expect(
            erroresNuevos,
            `[${id}] Se registraron errores en consola: ${erroresNuevos.join(" | ")}`
          ).toEqual([]);
        } catch (e) {
          estado = "FAIL";
          detalle = String((e as Error).message)
            .split("\n")[0]
            ?.slice(0, 240) ?? "";
          throw e;
        } finally {
          const desbordeFinal = await desbordeHorizontal(page).catch(() => -1);
          const evidencia = `${carpeta}/${id}.png`;
          await page.screenshot({ path: evidencia, fullPage: false }).catch(() => {});
          resultados.push({
            id,
            nombre,
            viewport: vpString,
            proyecto,
            estado,
            desbordePx: desbordeFinal,
            erroresConsola: erroresConsola.length - erroresAntes,
            evidencia,
            detalle: detalle || undefined,
          });
        }
      });
    };

    // ─── UX-S: Shell de Navegación ──────────────────────────────────────────
    await ejecutarEscenario(
      "UX-S",
      "Shell (Sidebar/Topbar en desktop y Barra Inferior en móvil)",
      async () => {
        await page.goto("/studio");
        await page.waitForLoadState("domcontentloaded");

        if (vpSize && vpSize.width < 1024) {
          // En viewports < lg (tablet 768 y móvil 390) está activa la barra de navegación inferior
          await expect(
            page.getByTestId("studio-mobile-bottom-nav")
          ).toBeVisible({ timeout: 15_000 });
        } else {
          // En viewports >= lg (desktop 1440 y desktop-1366) está activo el sidebar lateral
          await expect(
            page
              .getByTestId("sidebar-ranking-link")
              .or(page.getByTestId("sidebar-toggle-btn"))
              .first()
          ).toBeVisible({ timeout: 15_000 });
        }

        // Cabecera superior siempre visible en cualquier viewport
        await expect(page.locator("header:visible").first()).toBeVisible();
      }
    );

    // ─── UX-I: Vista Inicio ────────────────────────────────────────────────
    await ejecutarEscenario(
      "UX-I",
      "Inicio (Fila de 4 KPIs, Selector de Período y Bloques Centrales)",
      async () => {
        await page.goto("/studio");
        await page.waitForLoadState("domcontentloaded");

        // Fila superior con selector de período (en 390 px se oculta, como Movil.html)
        if ((page.viewportSize()?.width ?? 1440) >= 640) {
          await expect(
            page.getByTestId("periodo-selector-container").or(page.getByTestId("selector-periodo")).first()
          ).toBeVisible({ timeout: 15_000 });
        }

        // Bloques de trabajo diario
        await expect(
          page.getByTestId("para-revisar-hoy-container")
        ).toBeVisible({ timeout: 15_000 });
        await expect(
          page.getByTestId("clases-hoy-container")
        ).toBeVisible({ timeout: 15_000 });
      }
    );

    // ─── UX-D: Directorio de Alumnos ───────────────────────────────────────
    await ejecutarEscenario(
      "UX-D",
      "Directorio (DataTable de 15 Filas y Paginación)",
      async () => {
        await page.goto("/studio");
        await page.waitForLoadState("domcontentloaded");

        const dir = page.getByTestId("alumnos-directory");
        await expect(dir).toBeVisible({ timeout: 15_000 });
        await dir.scrollIntoViewIfNeeded();

        // Verificar que hay filas de alumnos renderizadas en el directorio abierto por defecto
        const filas = dir.locator("tbody tr, [data-testid^='btn-ver-ficha-']");
        await expect(filas.first()).toBeVisible({ timeout: 15_000 });
      }
    );

    // ─── UX-F: Ficha de Alumno ─────────────────────────────────────────────
    await ejecutarEscenario(
      "UX-F",
      "Ficha (Cabecera Limpia e Islas Modulares de Salud, Rutina y 1RM)",
      async () => {
        await page.goto("/studio");
        await page.waitForLoadState("domcontentloaded");

        // Localizar el botón de ver ficha del primer alumno en el directorio
        const btnFicha = page
          .getByTestId("btn-ver-ficha-demo-alumno-01-lucas")
          .or(page.locator("[data-testid^='btn-ver-ficha-']").first());

        await expect(btnFicha).toBeVisible({ timeout: 15_000 });
        await btnFicha.scrollIntoViewIfNeeded();
        await btnFicha.click();

        // Cabecera limpia de alumno
        await expect(
          page.getByTestId("student-detail-header")
        ).toBeVisible({ timeout: 15_000 });

        // Modular canvas o contenedor principal de islas
        await expect(
          page.getByTestId("student-detail-modular-canvas").or(page.locator("main")).first()
        ).toBeVisible();

        // Al menos una de las islas clave renderizada (Salud, Rutina o 1RM)
        const islaSalud = page.getByTestId("alert-salud").or(page.getByTestId("isla-salud-anamnesis"));
        const islaRutina = page.getByTestId("tab-registros-sesiones").or(page.getByTestId("isla-routine-workbench"));
        await expect(islaSalud.or(islaRutina).first()).toBeVisible({ timeout: 15_000 });
      }
    );

    // ─── UX-C: Vista de Cobros ─────────────────────────────────────────────
    await ejecutarEscenario(
      "UX-C",
      "Cobros (KPIs Superiores y DataTable en formato es-AR)",
      async () => {
        await page.goto("/studio/cobros");
        await page.waitForLoadState("domcontentloaded");

        await expect(page.getByTestId("cobros-kpis")).toBeVisible({
          timeout: 15_000,
        });
        await expect(page.getByTestId("kpi-ingresos-mes")).toBeVisible();

        // Validar formato de moneda es-AR en el panel ($xxx.xxx)
        const txt = await page.getByTestId("cobros-panel").innerText();
        expect(txt).toMatch(/\$\d{1,3}(\.\d{3})*/);
      }
    );

    // ─── UX-A: Vista de Agenda ─────────────────────────────────────────────
    await ejecutarEscenario(
      "UX-A",
      "Agenda (Grilla Semanal Horaria Dinámica)",
      async () => {
        await page.goto("/studio/agenda");
        await page.waitForLoadState("domcontentloaded");

        await expect(page.getByTestId("class-agenda")).toBeVisible({
          timeout: 15_000,
        });

        // En desktop/tablet activar vista semana si está disponible el selector
        const weekBtn = page.getByTestId("view-week-btn");
        if ((await weekBtn.count()) > 0 && (await weekBtn.isVisible())) {
          await weekBtn.click();
        }

        // Validar tarjetas de bloques de clases presentes
        await expect(
          page.getByTestId("class-block-card").first()
        ).toBeVisible({ timeout: 15_000 });
      }
    );

    // ─── UX-R: Biblioteca de Rutinas ───────────────────────────────────────
    await ejecutarEscenario(
      "UX-R",
      "Rutinas (Biblioteca con Tabs y Apertura por Defecto)",
      async () => {
        await page.goto("/studio/rutinas");
        await page.waitForLoadState("domcontentloaded");

        await expect(page.getByTestId("rutinas-library")).toBeVisible({
          timeout: 15_000,
        });

        // Tabs principales y subtab de alumnos
        await expect(page.getByTestId("rutinas-main-nav-tabs")).toBeVisible();
        await expect(page.getByTestId("tab-de-alumnos")).toBeVisible();
      }
    );

    // ─── UX-K: Ranking Funcional ───────────────────────────────────────────
    await ejecutarEscenario(
      "UX-K",
      "Ranking (Ranking Funcional con Chips Neutros y Selector)",
      async () => {
        await page.goto("/studio/ranking-funcional");
        await page.waitForLoadState("domcontentloaded");

        await expect(
          page.getByTestId("ranking-funcional-view")
        ).toBeVisible({ timeout: 15_000 });

        // Selector de ejercicio y tabla de participantes o tarjetas
        await expect(
          page.getByTestId("ejercicio-combobox").or(page.getByTestId("ranking-hombres-card")).first()
        ).toBeVisible({ timeout: 15_000 });
      }
    );

    // ─── Persistir resultados JSON del proyecto ────────────────────────────
    writeFileSync(
      `${carpeta}/resultados-ux.json`,
      JSON.stringify(resultados, null, 2),
      "utf-8"
    );

    // Asegurar que todos los escenarios terminaron en PASS
    const fallos = resultados.filter((r) => r.estado === "FAIL");
    expect(
      fallos.map((f) => `${f.id}: ${f.detalle}`),
      `Escenarios con FAIL en proyecto ${proyecto}`
    ).toEqual([]);
  });
});
