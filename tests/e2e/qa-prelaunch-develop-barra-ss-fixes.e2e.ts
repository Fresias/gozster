import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

// GOZS-879 · Suite permanente de los fixes GOZS-871 (PR #702 usa_barra y PR #703 fixes a/b/c/d):
// (a) línea conectora de superserie, (b) sin cartel "repetir", (c) Barra/Aproximación,
// (d) superserie activa con D/I y vueltas dispares. Mobile 390×844, Claro y Oscuro.
// Stub local de Supabase y fixture sintético: cero PII (G4).
const STUB_URL = process.env.E2E_STUB_URL ?? "http://localhost:54321";
const APP_URL = process.env.E2E_APP_URL ?? "http://localhost:3100";

type Fila = Record<string, unknown>;
type Fixture = {
  user: { id: string };
  ejercicios: Fila[];
  ejercicios_en_rutina: Fila[];
  registro_sesiones: Fila[];
  registro_series: Fila[];
  dias_rutina: Fila[];
  [k: string]: unknown;
};

const FIXTURE_BASE: Fixture = JSON.parse(
  readFileSync(join(process.cwd(), "tests", "e2e", "fixtures", "athlete-v7.json"), "utf8"),
);
const USER = FIXTURE_BASE.user;
const EJ = FIXTURE_BASE.ejercicios_en_rutina.map((e) => e.id as string);
const EJ_SQ = EJ[0]!; // Día 1 · no superserie · history en el catálogo
const EJ_BP = EJ[1]!; // superserie grupo 1
const EJ_RM = EJ[2]!; // superserie grupo 1
const EJ_PL = EJ[3]!; // Día 1 · se suma a la superserie en los tests de vueltas dispares
const CAT_SQ = FIXTURE_BASE.ejercicios_en_rutina[0]!.ejercicio_id as string;
const SESION_FIJA_ID = "aaaaaaaa-1111-4111-8111-111111111101";
const STORE_KEY = `gozster-athlete-store:${USER.id}`;

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

type Tema = "light" | "dark";

/** Clona la fixture base y aplica la mutación del caso. */
function fixture(mutar?: (f: Fixture) => void): Fixture {
  const f = structuredClone(FIXTURE_BASE);
  mutar?.(f);
  return f;
}

const setCatalogo = (f: Fixture, id: string, campos: Fila) => {
  const ej = f.ejercicios.find((e) => e.id === id);
  if (!ej) throw new Error(`catálogo sin ${id}`);
  Object.assign(ej, campos);
};
const setRutina = (f: Fixture, id: string, campos: Fila) => {
  const ej = f.ejercicios_en_rutina.find((e) => e.id === id);
  if (!ej) throw new Error(`rutina sin ${id}`);
  Object.assign(ej, campos);
};

/** Reemplaza el historial de la sentadilla por `n` sesiones semanales, todas con peso/reps dados. */
function historialSentadilla(f: Fixture, sesiones: number, peso: number, reps: number) {
  f.registro_series = f.registro_series.filter((r) => r.ejercicio_id !== CAT_SQ);
  for (let i = 0; i < sesiones; i += 1) {
    const dia = 10 - 7 * i; // 10/11, 3/11, 27/10…
    const fecha = new Date(Date.UTC(2026, 10, dia, 21, 0, 0)).toISOString();
    const sesionId = `66666666-6666-4666-8666-6666666667${String(i).padStart(2, "0")}`;
    f.registro_sesiones.push({
      ...f.registro_sesiones[0]!,
      id: sesionId,
      dia_id: f.dias_rutina[0]!.id,
      fecha,
      created_at: fecha,
      updated_at: fecha,
    });
    for (let n = 1; n <= 4; n += 1) {
      f.registro_series.push({
        ...f.registro_series[0]!,
        id: `77777777-7777-4777-8777-${String(900 + i * 10 + n).padStart(12, "0")}`,
        sesion_id: sesionId,
        ejercicio_id: CAT_SQ,
        numero_serie: n,
        peso_kg: peso,
        reps_hechas: reps,
        rpe_real: 8,
        set_type: "NORMAL",
        created_at: fecha,
        updated_at: fecha,
      });
    }
  }
}

async function prepararEntorno(page: Page, tema: Tema, fx: Fixture = fixture()) {
  await page.request.put(`${STUB_URL}/__e2e/fixtures`, { data: fx });
  const session = {
    access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({
      sub: USER.id,
      exp: 4102444800,
      role: "authenticated",
    })}.sig`,
    refresh_token: "e2e-refresh",
    expires_at: 4102444800,
    expires_in: 3600,
    token_type: "bearer",
    user: USER,
  };
  await page.context().addCookies([
    { name: "sb-localhost-auth-token", value: `base64-${b64url(session)}`, url: APP_URL },
  ]);
  await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date("2026-11-17T10:00:00-03:00"));

  const store = JSON.stringify({
    state: {
      onboardingCompletado: true,
      mostrarTimerDescanso: true,
      nivelVistaAlumno: "SIMPLE",
      membershipStatus: "ACTIVE",
      currentSession: {
        id: SESION_FIJA_ID,
        nombre_rutina: "Alumno Sintético: DÍA 1",
        fecha: "2026-11-17",
        ejercicios: [],
        studentId: USER.id,
        studentName: "Alumno Sintético",
      },
    },
    version: 2,
  });
  await page.addInitScript(
    ({ theme, key, json }) => {
      window.localStorage.setItem("gozster-theme", theme);
      if (!window.localStorage.getItem("__e2e_seeded")) {
        window.localStorage.setItem("__e2e_seeded", "1");
        window.localStorage.setItem(key, json);
      }
    },
    { theme: tema, key: STORE_KEY, json: store },
  );
}

async function entrarARutina(page: Page) {
  await page.goto("/athlete");
  await expect(page.getByTestId("empezar-dia-btn")).toBeVisible({ timeout: 25_000 });
  await page.getByTestId("empezar-dia-btn").click();
  await expect(page.getByTestId("live-workout-container")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("rutina-progress-card")).toBeVisible();
}

async function abrirEjercicio(page: Page, ejId: string) {
  await page.getByTestId(`exercise-select-btn-${ejId}`).click();
  await expect(page.getByTestId("registrar-serie-btn")).toBeVisible({ timeout: 15_000 });
}

async function sinDesborde(page: Page) {
  const { scroll, ancho } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    ancho: window.innerWidth,
  }));
  expect(scroll).toBeLessThanOrEqual(ancho);
}

type Caja = { x: number; y: number; width: number; height: number };
async function caja(l: Locator): Promise<Caja> {
  const b = await l.boundingBox();
  expect(b).toBeTruthy();
  return b!;
}
const solapan = (a: Caja, b: Caja) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Tramo vertical (y absoluto) que dibujan los pseudo-elementos ::before/::after de cada hijo de
 * `contenedor` que matchea `fila`, y centro vertical del círculo `.a-num` de cada una.
 */
async function medirLinea(page: Page, contenedor: string, fila: string) {
  return page.evaluate(
    ({ contenedor: cont, fila: sel }) => {
      const filas = Array.from(document.querySelectorAll(`${cont} > ${sel}`));
      const tramos: Array<{ desde: number; hasta: number }> = [];
      const centros: number[] = [];
      for (const el of filas) {
        const r = el.getBoundingClientRect();
        const num = el.querySelector(".a-num")!.getBoundingClientRect();
        centros.push(num.top + num.height / 2);
        for (const pseudo of ["::before", "::after"] as const) {
          const cs = getComputedStyle(el, pseudo);
          if (cs.content === "none" || cs.content === "normal") continue;
          const top = r.top + parseFloat(cs.top);
          tramos.push({ desde: top, hasta: top + parseFloat(cs.height) });
        }
      }
      return { tramos, centros, filas: filas.length };
    },
    { contenedor, fila },
  );
}

function verificarLinea(m: Awaited<ReturnType<typeof medirLinea>>, tol = 3) {
  expect(m.filas).toBeGreaterThanOrEqual(2);
  const inicio = Math.min(...m.tramos.map((t) => t.desde));
  const fin = Math.max(...m.tramos.map((t) => t.hasta));
  expect(Math.abs(inicio - m.centros[0]!)).toBeLessThanOrEqual(tol); // arranca en el centro del 1
  expect(Math.abs(fin - m.centros[m.centros.length - 1]!)).toBeLessThanOrEqual(tol); // termina en el último
  // Sin huecos: cada tramo empieza donde (o antes de) termina el anterior.
  const orden = [...m.tramos].sort((a, b) => a.desde - b.desde);
  for (let i = 1; i < orden.length; i += 1) {
    expect(orden[i]!.desde).toBeLessThanOrEqual(orden[i - 1]!.hasta + tol);
  }
}

const num = (txt: string) => Number(txt.replace(/[^\d,.-]/g, "").replace(",", "."));

for (const tema of ["light", "dark"] as const) {
  test.describe(`@mobile Barra + SS · GOZS-871 · tema ${tema}`, () => {
    test.afterEach(async ({ context, request }) => {
      await context.setOffline(false).catch(() => {});
      await request.delete(`${STUB_URL}/__e2e/fixtures`).catch(() => {});
    });

    test("BS-01 (a): la línea de la superserie en Rutina va del centro del 1 al centro del último círculo", async ({ page }) => {
      await prepararEntorno(page, tema);
      await entrarARutina(page);
      await expect(page.getByTestId("superserie-grupo-1")).toBeVisible();
      verificarLinea(await medirLinea(page, ".a-ss-timeline", ".a-row"));
      await sinDesborde(page);
    });

    test("BS-02 (b): con sugerencia «repetir» solo queda «Última vez», precarga el peso y no hay cartel verde", async ({ page }) => {
      await prepararEntorno(
        page,
        tema,
        fixture((f) => historialSentadilla(f, 2, 55, 6)), // reps < tope 8 → "repetir"
      );
      await entrarARutina(page);
      await abrirEjercicio(page, EJ_SQ);

      await expect(page.getByTestId("ultima-vez")).toContainText(/Última vez:\s*55\s*kg\s*×\s*6/);
      await expect(page.getByRole("textbox", { name: "Peso en kilogramos" })).toHaveValue(/^55([.,]0)?$/);
      await expect(page.getByTestId("sugerencia-carga")).toHaveCount(0);
      await expect(page.locator(".a-sug")).toHaveCount(0);
      await sinDesborde(page);
    });

    test("BS-03 (b): la sugerencia de progresión («subir») sigue mostrándose", async ({ page }) => {
      await prepararEntorno(
        page,
        tema,
        fixture((f) => historialSentadilla(f, 4, 55, 8)), // ≥21 días sosteniendo el tope → "subir"
      );
      await entrarARutina(page);
      await abrirEjercicio(page, EJ_SQ);

      const sug = page.getByTestId("sugerencia-carga");
      await expect(sug).toBeVisible();
      await expect(sug).toHaveAttribute("data-tipo", "subir");
      await expect(page.getByTestId("ultima-vez")).toContainText("Última vez");
      await sinDesborde(page);
    });

    test("BS-04 (c): sin usa_barra no hay chip Barra ni bloque Aproximación", async ({ page }) => {
      await prepararEntorno(
        page,
        tema,
        fixture((f) => {
          historialSentadilla(f, 2, 55, 6);
          setCatalogo(f, CAT_SQ, { usa_barra: false });
        }),
      );
      await entrarARutina(page);
      await abrirEjercicio(page, EJ_SQ);

      await expect(page.getByTestId("ultima-vez")).toBeVisible();
      await expect(page.getByTestId("badge-barra")).toHaveCount(0);
      await expect(page.getByTestId("warmup-sets-section")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Cargar \d+ series/ })).toHaveCount(0);
      await sinDesborde(page);
    });

    test("BS-05 (c): con usa_barra (55 kg) la aproximación va en múltiplos de 5 y «Cargar N series» no pisa W1", async ({ page }) => {
      await prepararEntorno(
        page,
        tema,
        fixture((f) => {
          historialSentadilla(f, 2, 55, 6);
          setCatalogo(f, CAT_SQ, { usa_barra: true });
        }),
      );
      await entrarARutina(page);
      await abrirEjercicio(page, EJ_SQ);

      await expect(page.getByTestId("badge-barra")).toBeVisible();
      const seccion = page.getByTestId("warmup-sets-section");
      await expect(seccion).toBeVisible();

      const filas = seccion.locator('[data-testid^="warmup-set-card-"]');
      const n = await filas.count();
      expect(n).toBeGreaterThanOrEqual(2);
      const pesos: number[] = [];
      for (let i = 0; i < n; i += 1) {
        const txt = (await filas.nth(i).locator("b").first().textContent()) ?? "";
        const [kg] = txt.split("×");
        pesos.push(num(kg!));
      }
      for (const kg of pesos) {
        expect(kg % 5, `aproximación ${kg} kg debe ser múltiplo de 5`).toBe(0);
        expect(kg).not.toBe(27.5);
        expect(kg).toBeLessThan(55);
      }

      await page.getByTestId(`aproximacion-btn-${EJ_SQ}`).click();
      await expect(seccion).toHaveCount(0);

      // El store es la fuente de verdad: W1 conserva su peso de calentamiento y la 1ª efectiva vuelve a 55.
      await expect
        .poll(async () => {
          const raw = await page.evaluate((key) => window.localStorage.getItem(key) ?? "", STORE_KEY);
          const ses = JSON.parse(raw || "{}").state?.currentSession;
          const series = ses?.ejercicios?.find((e: { id: string }) => e.id === EJ_SQ)?.series ?? [];
          const w = series.filter((s: { set_type?: string }) => /^(W|WARMUP)$/i.test(s.set_type ?? ""));
          const efectivas = series.filter((s: { set_type?: string }) => !/^(W|WARMUP)$/i.test(s.set_type ?? ""));
          return {
            w1: w[0]?.peso_kg ?? null,
            cantW: w.length,
            primeraEfectiva: efectivas[0]?.peso_kg ?? null,
          };
        })
        .toEqual({ w1: pesos[0], cantW: n, primeraEfectiva: 55 });
      expect(pesos[0]).not.toBe(55);
      await expect(page.getByRole("textbox", { name: "Peso en kilogramos" })).toHaveValue(/^(20|\d+)([.,]0)?$/);
      await sinDesborde(page);
    });

    test("BS-06 (d): superserie activa con toggle D/I compacto y carril de 2 columnas sin solapamientos", async ({ page }) => {
      await prepararEntorno(
        page,
        tema,
        fixture((f) => setRutina(f, EJ_RM, { es_unilateral: true })),
      );
      await entrarARutina(page);
      await abrirEjercicio(page, EJ_BP);

      const ciclo = page.getByTestId("ss-cycle-card-1-1");
      await expect(ciclo).toBeVisible();
      const igual = page.getByTestId(`ss-uni-same-${EJ_RM}`);
      const separar = page.getByTestId(`ss-uni-split-${EJ_RM}`);
      await expect(igual).toHaveAttribute("aria-label", "Mismo peso en Derecha e Izquierda");
      await expect(separar).toHaveAttribute("aria-label", "Separar Derecha e Izquierda");
      await expect(igual).toHaveAttribute("aria-pressed", "true");
      await expect(igual).toHaveText(/=\s*D\/I/);
      await expect(separar).toHaveText("D/I");
      await expect(page.getByRole("group", { name: /Carga por lado en/ })).toBeVisible();

      const verificarCarril = async () => {
        const bloques = ciclo.locator(".a-ss-ex-block");
        const total = await bloques.count();
        expect(total).toBe(2);
        for (let i = 0; i < total; i += 1) {
          const bloque = bloques.nth(i);
          const badge = await caja(bloque.locator(".a-num"));
          const cuerpo = await caja(bloque.locator(".a-ss-ex-body"));
          expect(badge.x + badge.width).toBeLessThanOrEqual(cuerpo.x + 0.5);
          const controles = bloque.locator(".a-ss-ex-body button, .a-ss-ex-body input");
          for (let j = 0; j < (await controles.count()); j += 1) {
            const c = await caja(controles.nth(j));
            expect(solapan(badge, c), `control ${j} del bloque ${i} pisa el badge`).toBe(false);
            expect(c.x + c.width).toBeLessThanOrEqual(390.5);
          }
        }
        const desborde = await page.evaluate(() => {
          const el = document.querySelector(".a-ss-cycle")!;
          return { sw: el.scrollWidth, cw: el.clientWidth };
        });
        expect(desborde.sw).toBeLessThanOrEqual(desborde.cw);
        await sinDesborde(page);
      };

      await verificarCarril(); // = D/I
      await separar.click();
      await expect(separar).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId(`ss-uni-side-D-${EJ_RM}`)).toContainText("DER");
      await expect(page.getByTestId(`ss-uni-side-I-${EJ_RM}`)).toContainText("IZQ");
      await verificarCarril(); // D/I separado
    });

    test("BS-07 (d): la línea del carril de superserie activa va de círculo a círculo", async ({ page }) => {
      await prepararEntorno(page, tema);
      await entrarARutina(page);
      await abrirEjercicio(page, EJ_BP);
      await expect(page.getByTestId("ss-cycle-card-1-1")).toBeVisible();
      verificarLinea(await medirLinea(page, ".a-ss-inline-list", ".a-ss-ex-block"));
    });

    test("BS-08 (d): superserie con series dispares (3, 4 y 4) cierra la vuelta 4 en 4/4 en Ejercicio Activo y Rutina", async ({ page }) => {
      await prepararEntorno(
        page,
        tema,
        fixture((f) => {
          setRutina(f, EJ_BP, { series: 3 });
          setRutina(f, EJ_RM, { series: 4 });
          setRutina(f, EJ_PL, {
            series: 4,
            es_superserie: true,
            grupo_superserie: 1,
            tipo_medicion: "REPS",
            repeticiones: "10-12",
            tiempo_objetivo_segundos: null,
          });
        }),
      );
      await entrarARutina(page);
      await abrirEjercicio(page, EJ_BP);

      for (let vuelta = 1; vuelta <= 3; vuelta += 1) {
        await expect(page.getByTestId(`ss-cycle-card-1-${vuelta}`)).toBeVisible();
        await page.getByTestId("registrar-serie-btn").click();
        await expect(page.getByTestId(`ss-cycle-card-1-${vuelta + 1}`)).toBeVisible();
        await page.getByRole("button", { name: "Omitir" }).click();
      }

      // Vuelta 4: el ejercicio de 3 series ya terminó; los otros dos siguen.
      await expect(page.getByTestId(`ss-cycle-item-done-${EJ_BP}`)).toHaveText("Completado · 3/3 series");
      await expect(page.getByTestId(`ss-cycle-item-${EJ_RM}`)).toBeVisible();
      await expect(page.getByTestId(`ss-cycle-item-${EJ_PL}`)).toBeVisible();
      await expect(page.getByRole("progressbar", { name: "Superserie 3 de 4 vueltas" })).toBeVisible();
      await sinDesborde(page);

      await page.getByTestId("registrar-serie-btn").click();
      await expect(page.getByRole("progressbar", { name: "Superserie 4 de 4 vueltas" })).toBeVisible();
      await expect(page.getByRole("progressbar", { name: "Superserie 4 de 4 vueltas" })).toHaveAttribute(
        "aria-valuenow",
        "100",
      );
      const omitir = page.getByRole("button", { name: "Omitir" });
      if (await omitir.isVisible().catch(() => false)) await omitir.click();

      await page.getByTestId("volver-a-rutina-btn").click();
      const anilloGrupo = page.getByTestId("superserie-grupo-1").getByRole("progressbar", {
        name: "Superserie 4 de 4 vueltas",
      });
      await expect(anilloGrupo).toBeVisible();
      await expect(anilloGrupo).toHaveAttribute("aria-valuenow", "100");
      await sinDesborde(page);
    });

    test("BS-09 (G4): el DOM de Rutina y Ejercicio Activo no contiene datos de terceros", async ({ page }) => {
      await prepararEntorno(page, tema);
      await entrarARutina(page);
      const rutina = await page.locator("body").innerText();
      await abrirEjercicio(page, EJ_BP);
      const activo = await page.locator("body").innerText();
      const prohibidos = [
        "Lucas M.",
        "Valentina R.",
        "Sofía G.",
        "Martín P.",
        "Camila D.",
        "28 oct: agarre neutro",
        "Landmine Press 3x10 25 kg",
        "Mynter",
      ];
      for (const lit of prohibidos) {
        expect(rutina).not.toContain(lit);
        expect(activo).not.toContain(lit);
      }
      expect(`${rutina}\n${activo}`).not.toMatch(/[\w.+-]+@(?!gozster\.test)[\w-]+\.[a-z]{2,}/i);
    });
  });
}

// (c) Coach Studio · Biblioteca de Ejercicios: chip Barra, filtro Barra y toggle del modal.
test.describe("@mobile Coach Studio · catálogo Barra · GOZS-871", () => {
  const COACH_ID = "00000000-0000-4000-8000-000000000001";
  const ID_CON = "44444444-4444-4444-8444-4444444444c1";
  const ID_SIN = "44444444-4444-4444-8444-4444444444c2";

  test.afterEach(async ({ request }) => {
    await request.delete(`${STUB_URL}/__e2e/fixtures`).catch(() => {});
  });

  test("BS-10: chip Barra en la tarjeta, filtro Barra y toggle del modal Crear/Editar", async ({ page }) => {
    const ejercicio = (id: string, nombre: string, usa_barra: boolean) => ({
      id,
      nombre,
      comentario: null,
      url_video: null,
      musculos_principales: ["cuadriceps"],
      musculos_secundarios: [],
      usa_barra,
      created_at: "2026-11-02T10:00:00-03:00",
      updated_at: "2026-11-02T10:00:00-03:00",
    });
    await page.request.put(`${STUB_URL}/__e2e/fixtures`, {
      data: {
        alumnos: [],
        planes_entrenamiento: [],
        ejercicios: [
          ejercicio(ID_CON, "Sentadilla Sintética", true),
          ejercicio(ID_SIN, "Jalón Sintético agarre neutro", false),
        ],
      },
    });
    const sesion = {
      access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: COACH_ID, exp: 4102444800, role: "authenticated" })}.sig`,
      refresh_token: "e2e-refresh",
      expires_at: 4102444800,
      expires_in: 3600,
      token_type: "bearer",
      user: {
        id: COACH_ID,
        aud: "authenticated",
        role: "authenticated",
        email: "coach-e2e@gozster.test",
        app_metadata: { rol: "ADMIN" },
        user_metadata: {},
      },
    };
    await page.context().addCookies([
      { name: "sb-localhost-auth-token", value: `base64-${b64url(sesion)}`, url: APP_URL },
    ]);
    await page.goto("/studio/rutinas");
    await expect(page.getByTestId("rutinas-library")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("tab-biblioteca-ejercicios").click();
    await expect(page.getByTestId("ejercicios-library-tab")).toBeVisible();

    // Chip solo en el ejercicio con barra.
    await expect(page.getByTestId(`ejercicio-barra-${ID_CON}`)).toHaveText("Barra");
    await expect(page.getByTestId(`ejercicio-barra-${ID_SIN}`)).toHaveCount(0);

    // Filtro Barra: deja solo el ejercicio con barra.
    const filtro = page.getByTestId("filtro-barra");
    await expect(filtro).toHaveAttribute("aria-pressed", "false");
    await filtro.click();
    await expect(filtro).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId(`ejercicio-card-${ID_CON}`)).toBeVisible();
    await expect(page.getByTestId(`ejercicio-card-${ID_SIN}`)).toHaveCount(0);
    await filtro.click();
    await expect(page.getByTestId(`ejercicio-card-${ID_SIN}`)).toBeVisible();

    // Modal Editar: el toggle refleja el valor guardado y alterna.
    await page.getByTestId(`btn-editar-ejercicio-${ID_CON}`).click();
    const toggle = page.getByTestId("chip-usa-barra");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("Escape");

    // Modal Crear: arranca sin barra.
    await page.getByTestId("ejercicios-filters-container").getByTestId("btn-nuevo-ejercicio").click();
    await expect(page.getByTestId("chip-usa-barra")).toHaveAttribute("aria-pressed", "false");
    await page.getByTestId("chip-usa-barra").click();
    await expect(page.getByTestId("chip-usa-barra")).toHaveAttribute("aria-pressed", "true");
  });
});
