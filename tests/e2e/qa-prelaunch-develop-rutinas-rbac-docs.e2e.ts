import { expect, test, type Page } from "@playwright/test";
import { FORBIDDEN_DEMO_LITERALS } from "@/test-utils/no-demo-literals";

// GOZS-930 · Suite permanente pre-corte sobre develop (datos 100 % sintéticos, G4/G5; cero cambios en src/):
//  - Bloque 1: /studio/rutinas — pestañas de biblioteca, plantilla compartida (duplicar/asignar sin borrar)
//    y bloqueo de eliminación de ejercicios en uso.
//  - Bloque 2: RBAC visual ENTRENADOR vs ADMIN (G1) — sin montos monetarios para el entrenador de apoyo.
//  - Bloque 3: /studio/documentacion y /studio/metricas — carga limpia, índice navegable, sin desborde.
// Contrato observado en develop: las pestañas se llaman "De alumnos" (rutinas asignadas), "Mis plantillas",
// "Compartidas conmigo", "Borradores" y "Archivadas"; "Ejercicios" es la pestaña principal "Biblioteca de Ejercicios".
const STUB_URL = process.env.E2E_STUB_URL ?? "http://localhost:54321";
const APP_URL = process.env.E2E_APP_URL ?? "http://localhost:3100";
const COACH_ID = "00000000-0000-4000-8000-000000000001";
const OTRO_COACH_ID = "00000000-0000-4000-8000-0000000000c2";
const ALUMNO_ID = "00000000-0000-4000-8000-0000000000a1";

test.use({ viewport: { width: 1280, height: 800 } });

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

type Fila = Record<string, unknown>;
type Llamada = { method: string; path: string; body: unknown };

async function iniciarSesion(page: Page, rol: "ADMIN" | "ENTRENADOR", fixtures: Fila = {}) {
  const res = await page.request.put(`${STUB_URL}/__e2e/fixtures`, {
    data: { rol, perfil: { nombre_completo: "Staff Sintético QA", profesor_asignado_id: COACH_ID }, ...fixtures },
  });
  expect(res.ok()).toBe(true);
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
      app_metadata: { rol },
      user_metadata: {},
    },
  };
  await page.context().addCookies([{ name: "sb-localhost-auth-token", value: `base64-${b64url(sesion)}`, url: APP_URL }]);
}

async function llamadas(page: Page): Promise<Llamada[]> {
  const res = await page.request.get(`${STUB_URL}/__llamadas`);
  return ((await res.json()) as { llamadas: Llamada[] }).llamadas;
}

/** Errores de consola y de página, sin el ruido de recursos que el stub no sirve. */
function vigilarConsola(page: Page): string[] {
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // El stub no sirve recursos opcionales ni Realtime (WebSocket): ruido del entorno, no del producto.
    if (/Failed to load resource|WebSocket connection to 'ws:\/\/localhost:54321/i.test(t)) return;
    errores.push(`console.error: ${t}`);
  });
  return errores;
}

const textoDePantalla = async (page: Page) => `${await page.locator("body").innerText()}\n${await page.content()}`;
const desborde = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const plan = (over: Fila): Fila => ({
  profesor_id: COACH_ID,
  alumno_id: null,
  estado: "ACTIVO",
  comentarios: null,
  fecha_inicio: "2026-10-01T00:00:00Z",
  fecha_fin: null,
  tipo: "PLANTILLA",
  etiqueta: null,
  plan_origen_id: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  ...over,
});
const ejercicio = (id: string, nombre: string): Fila => ({
  id,
  nombre,
  comentario: null,
  url_video: null,
  musculos_principales: ["cuadriceps"],
  musculos_secundarios: [],
  usa_barra: false,
  created_at: "2026-11-02T10:00:00-03:00",
  updated_at: "2026-11-02T10:00:00-03:00",
});

const P_PROPIA = "10000000-0000-4000-8000-000000000001";
const P_AJENA = "10000000-0000-4000-8000-000000000002";
const P_ALUMNO_VIEJA = "10000000-0000-4000-8000-000000000003";
const P_ALUMNO_NUEVA = "10000000-0000-4000-8000-000000000004";
const P_CLON = "10000000-0000-4000-8000-000000000005";
const DIA_PROPIA = "20000000-0000-4000-8000-000000000001";
const EJ_USO = "30000000-0000-4000-8000-000000000001";
const EJ_LIBRE = "30000000-0000-4000-8000-000000000002";

const PLAN_PROPIA = plan({ id: P_PROPIA, nombre: "Plantilla QA Propia" });
const PLAN_AJENA = plan({ id: P_AJENA, nombre: "Plantilla QA Ajena", profesor_id: OTRO_COACH_ID });
const PLAN_ALUMNO_VIEJA = plan({ id: P_ALUMNO_VIEJA, nombre: "Rutina QA Vieja", alumno_id: ALUMNO_ID, tipo: "DE_ALUMNO" });
const PLAN_ALUMNO_NUEVA = plan({
  id: P_ALUMNO_NUEVA,
  nombre: "Plantilla QA Ajena",
  alumno_id: ALUMNO_ID,
  tipo: "DE_ALUMNO",
  plan_origen_id: P_AJENA,
  fecha_inicio: "2026-11-28T12:00:00Z",
});

const FIXTURES_RUTINAS: Fila = {
  alumnos: [{ id: ALUMNO_ID, nombre_completo: "Alumno Sintético Uno", rol: "ALUMNO", email: "alumno-uno@gozster.test" }],
  planes_entrenamiento: [PLAN_PROPIA, PLAN_AJENA, PLAN_ALUMNO_VIEJA],
  planes_compartidos: [
    { id: "40000000-0000-4000-8000-000000000001", plan_id: P_AJENA, profesor_id: COACH_ID, created_at: "2026-11-01T10:00:00Z" },
  ],
  dias_rutina: [{ id: DIA_PROPIA, plan_id: P_PROPIA, nombre: "Día 1", orden: 1 }],
  ejercicios: [ejercicio(EJ_USO, "Sentadilla Sintética En Uso"), ejercicio(EJ_LIBRE, "Remo Sintético Libre")],
  ejercicios_en_rutina: [
    { id: "50000000-0000-4000-8000-000000000001", dia_id: DIA_PROPIA, ejercicio_id: EJ_USO, orden: 1, series: 3, repeticiones: "8" },
  ],
};

async function abrirBiblioteca(page: Page) {
  await iniciarSesion(page, "ADMIN", FIXTURES_RUTINAS);
  await page.goto("/studio/rutinas");
  await expect(page.getByTestId("rutinas-library")).toBeVisible({ timeout: 60_000 });
}

test.describe("GOZS-930 · Rutinas, RBAC y Documentación (pre-corte develop)", () => {
  test.afterEach(async ({ request }) => {
    await request.delete(`${STUB_URL}/__e2e/fixtures`).catch(() => {});
  });

  test.describe("Bloque 1 · /studio/rutinas", () => {
    test("RB-01 · pestañas de biblioteca: propia, compartida (solo lectura sin eliminar) y asignada", async ({ page }) => {
      await abrirBiblioteca(page);
      const items = page.getByTestId("rutina-item");

      await page.getByTestId("tab-plantillas-maestras").click();
      const propia = items.filter({ hasText: "Plantilla QA Propia" });
      await expect(propia).toBeVisible();
      await expect(items.filter({ hasText: "Plantilla QA Ajena" })).toHaveCount(0);
      await propia.getByTestId("rutina-acciones-btn").click();
      await expect(page.getByTestId(`menu-eliminar-${P_PROPIA}`)).toBeVisible();
      await page.keyboard.press("Escape");

      await page.getByTestId("tab-compartidas-conmigo").click();
      const ajena = items.filter({ hasText: "Plantilla QA Ajena" });
      await expect(ajena).toBeVisible();
      await expect(ajena.getByTestId("badge-solo-lectura")).toBeVisible();
      await expect(items.filter({ hasText: "Plantilla QA Propia" })).toHaveCount(0);
      await ajena.getByTestId("rutina-acciones-btn").click();
      await expect(page.getByTestId(`menu-duplicar-${P_AJENA}`)).toBeVisible();
      await expect(page.getByTestId(`menu-asignar-${P_AJENA}`)).toBeVisible();
      await expect(page.getByTestId(`menu-eliminar-${P_AJENA}`)).toHaveCount(0);
      await expect(page.getByTestId(`menu-compartir-${P_AJENA}`)).toHaveCount(0);
      await page.keyboard.press("Escape");

      await page.getByTestId("tab-de-alumnos").click();
      const asignada = items.filter({ hasText: "Rutina QA Vieja" });
      await expect(asignada).toBeVisible();

      await page.getByTestId("tab-biblioteca-ejercicios").click();
      await expect(page.getByTestId("ejercicios-library-tab")).toBeVisible();

      expect((await textoDePantalla(page)).match(new RegExp(FORBIDDEN_DEMO_LITERALS.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")))).toBeNull();
    });

    test("RB-02 · duplicar plantilla compartida invoca clonar_plan_entrenamiento, avisa y no borra nada", async ({ page }) => {
      await abrirBiblioteca(page);
      const enviado: unknown[] = [];
      await page.route("**/rest/v1/rpc/clonar_plan_entrenamiento", async (route) => {
        enviado.push(route.request().postDataJSON());
        await route.fulfill({ json: P_CLON });
      });

      await page.getByTestId("tab-compartidas-conmigo").click();
      await page.getByTestId(`btn-duplicar-${P_AJENA}`).click();

      await expect(page.getByRole("status").filter({ hasText: /Duplicaste “Plantilla QA Ajena”/ })).toBeVisible();
      expect(enviado).toHaveLength(1);
      expect(enviado[0]).toMatchObject({ p_plan_id: P_AJENA });
      expect((enviado[0] as { p_nuevo_nombre: string }).p_nuevo_nombre).toContain("Plantilla QA Ajena");
      expect((await llamadas(page)).filter((c) => c.method === "DELETE")).toHaveLength(0);
    });

    test("RB-03 · asignar plantilla compartida deja una sola rutina ACTIVA y la anterior archivada", async ({ page }) => {
      await abrirBiblioteca(page);
      // El stub no sirve la consulta `or=` de perfiles del SSR; la recarga del navegador (tras duplicar) sí trae alumnos.
      await page.route("**/rest/v1/perfiles?*", (route) =>
        route.request().url().includes("id=eq.")
          ? route.fallback()
          : route.fulfill({ json: FIXTURES_RUTINAS.alumnos }),
      );
      await page.route("**/rest/v1/rpc/clonar_plan_entrenamiento", (route) => route.fulfill({ json: P_CLON }));
      await page.getByTestId("tab-compartidas-conmigo").click();
      await page.getByTestId(`btn-duplicar-${P_AJENA}`).click();
      await expect(page.getByRole("status").filter({ hasText: /Duplicaste/ })).toBeVisible();

      const enviado: unknown[] = [];
      await page.route("**/rest/v1/rpc/asignar_rutina_a_alumno", async (route) => {
        enviado.push(route.request().postDataJSON());
        // Tras la RPC, la recarga del navegador ve el estado que deja asignar_rutina_a_alumno.
        await page.route("**/rest/v1/planes_entrenamiento?*", (r) =>
          r.fulfill({
            json: [PLAN_PROPIA, PLAN_AJENA, PLAN_ALUMNO_NUEVA, { ...PLAN_ALUMNO_VIEJA, estado: "INACTIVO", fecha_fin: "2026-11-28T12:00:00Z" }],
          }),
        );
        await route.fulfill({ json: P_ALUMNO_NUEVA });
      });

      await page.getByTestId("tab-compartidas-conmigo").click();
      await page.getByTestId(`btn-asignar-${P_AJENA}`).click();
      const dialogo = page.locator("dialog[open]");
      await expect(dialogo).toBeVisible();
      await expect(dialogo.getByRole("button", { name: "Asignar", exact: true })).toBeDisabled();
      await dialogo.locator("#rutinas-alumno").selectOption(ALUMNO_ID);
      await dialogo.getByRole("button", { name: "Asignar", exact: true }).click();

      // Abre el clon asignado en el Constructor Visual (develop: pestaña, no modal).
      await expect(page.getByTestId("tab-constructor-visual")).toHaveAttribute("aria-selected", "true");
      expect(enviado).toEqual([{ p_plan_id: P_AJENA, p_alumno_id: ALUMNO_ID }]);
      await page.getByTestId("tab-biblioteca-plantillas").click();

      await page.getByTestId("tab-de-alumnos").click();
      const activas = page.getByTestId("rutina-item").filter({ hasText: "Vigente" });
      await expect(activas).toHaveCount(1);
      await page.getByTestId("tab-archivadas").click();
      await expect(page.getByTestId("rutina-item").filter({ hasText: "Rutina QA Vieja" })).toBeVisible();
    });

    test("RB-04 · ejercicio en uso bloquea la eliminación (sin DELETE); el libre se puede eliminar", async ({ page }) => {
      await abrirBiblioteca(page);
      await page.getByTestId("tab-biblioteca-ejercicios").click();
      await expect(page.getByTestId("ejercicios-library-tab")).toBeVisible();

      await page.getByTestId(`btn-eliminar-ejercicio-${EJ_USO}`).click();
      await expect(page.getByTestId("alerta-ejercicio-en-uso")).toContainText("1 instancia");
      const confirmar = page.getByTestId("btn-confirmar-eliminar");
      await expect(confirmar).toBeDisabled();
      await expect(confirmar).toHaveText("Eliminar bloqueado");
      await confirmar.click({ force: true });
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("modal-confirmar-eliminar-ejercicio")).toHaveCount(0);
      expect((await llamadas(page)).filter((c) => c.method === "DELETE")).toHaveLength(0);
      await expect(page.getByTestId(`ejercicio-card-${EJ_USO}`)).toBeVisible();

      await page.getByTestId(`btn-eliminar-ejercicio-${EJ_LIBRE}`).click();
      await expect(page.getByTestId("alerta-ejercicio-en-uso")).toHaveCount(0);
      await expect(page.getByTestId("btn-confirmar-eliminar")).toBeEnabled();
    });
  });

  test.describe("Bloque 2 · RBAC visual ENTRENADOR vs ADMIN (G1)", () => {
    const KPIS_CON_MONTOS: Fila = {
      ingresos: 987654,
      ingresos_6m: [100000, 200000, 300000, 400000, 500000, 987654],
      ingresos_periodo_anterior: 800000,
      cobranza_esperada: 1000000,
      cobranza_pendiente_monto: 12345,
      cobranza_vencidas_cant: 1,
      sin_entrenar_7d_ids: [],
      activos_fin: 7,
      altas: 2,
      bajas: 1,
      ingresos_presencial: 600000,
      ingresos_online: 387654,
      cobranza_vencida_monto: 12345,
      cobranza_por_vencer_monto: 0,
      alumnos_al_dia: 6,
      alumnos_morosos: 1,
    };
    const fixtures: Fila = {
      alumnos: [{ id: ALUMNO_ID, nombre_completo: "Alumno Sintético Uno", rol: "ALUMNO", email: "alumno-uno@gozster.test" }],
      planes_entrenamiento: [],
      kpis_negocio: [KPIS_CON_MONTOS],
    };

    test("RBAC-01 · ADMIN (control) ve los montos del negocio en el Inicio (/studio)", async ({ page }) => {
      await iniciarSesion(page, "ADMIN", fixtures);
      await page.goto("/studio");
      await expect(page.getByTestId("business-kpi-strip")).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId("kpi-ingresos-total")).toContainText("987.654");
    });

    test("RBAC-02 · ENTRENADOR ve KPIs operativos y ningún monto en /studio, /studio/dashboard y /studio/metricas", async ({ page }) => {
      const errores = vigilarConsola(page);
      await iniciarSesion(page, "ENTRENADOR", fixtures);

      // La tira de KPIs de negocio vive en el Inicio; /studio/dashboard es "Métricas & Retención".
      await page.goto("/studio");
      await expect(page.getByTestId("business-kpi-strip")).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId("kpi-activos")).toBeVisible();
      await expect(page.getByTestId("kpi-alumnos-al-dia")).toHaveText(/^\d+/);
      await expect(page.getByTestId("kpi-ingresos-total")).toHaveText("—");
      await expect(page.getByTestId("kpi-ingresos-desagregado")).toHaveCount(0);
      const txt = await textoDePantalla(page);
      for (const monto of ["987.654", "987654", "600.000", "387.654", "12.345"]) {
        expect(txt, `monto ${monto} visible para ENTRENADOR`).not.toContain(monto);
      }

      for (const ruta of ["/studio/dashboard", "/studio/metricas"]) {
        await page.goto(ruta);
        await expect(page.locator("main, [data-testid]").first()).toBeVisible({ timeout: 60_000 });
        const txtRuta = await textoDePantalla(page);
        for (const monto of ["987.654", "987654", "600.000", "387.654"]) {
          expect(txtRuta, `monto ${monto} en ${ruta}`).not.toContain(monto);
        }
      }
      expect(errores).toEqual([]);
    });

    test("RBAC-03 · ENTRENADOR carga /studio y /studio/agenda sin errores de consola ni literales demo", async ({ page }) => {
      const errores = vigilarConsola(page);
      await iniciarSesion(page, "ENTRENADOR", fixtures);
      for (const ruta of ["/studio", "/studio/agenda"]) {
        const resp = await page.goto(ruta);
        expect(resp?.status(), `HTTP ${ruta}`).toBeLessThan(400);
        await expect(page).toHaveURL(new RegExp(`${ruta.replace(/\//g, "\\/")}(\\?|$)`));
        await expect(page.locator("main, [data-testid]").first()).toBeVisible({ timeout: 60_000 });
        const txt = await textoDePantalla(page);
        expect(FORBIDDEN_DEMO_LITERALS.filter((l) => txt.includes(l)), `demo en ${ruta}`).toEqual([]);
        expect(txt).not.toContain("987.654");
      }
      expect(errores).toEqual([]);
    });

    test("RBAC-04 · contrato observado: ENTRENADOR en /studio/ingresos no ve montos", async ({ page }) => {
      await iniciarSesion(page, "ENTRENADOR", fixtures);
      const resp = await page.goto("/studio/ingresos");
      expect(resp?.status()).toBeLessThan(400);
      await expect(page.locator("main, [data-testid]").first()).toBeVisible({ timeout: 60_000 });
      const txt = await textoDePantalla(page);
      for (const monto of ["987.654", "987654", "600.000", "387.654"]) expect(txt).not.toContain(monto);
    });
  });

  test.describe("Bloque 3 · /studio/documentacion y /studio/metricas", () => {
    test("DOC-01 · documentación: índice con anclas válidas, contenido útil, sin errores ni desborde", async ({ page }) => {
      const errores = vigilarConsola(page);
      await iniciarSesion(page, "ADMIN", { alumnos: [], planes_entrenamiento: [] });
      await page.goto("/studio/documentacion");
      await expect(page.getByTestId("documentacion-pagina")).toBeVisible({ timeout: 60_000 });
      expect((await page.getByTestId("documentacion-pagina").innerText()).length).toBeGreaterThan(500);

      const links = page.getByTestId("documentacion-indice").locator('a[href^="#"]');
      const n = await links.count();
      expect(n).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) {
        const href = (await links.nth(i).getAttribute("href"))!;
        await expect(page.locator(href), `ancla ${href} sin destino`).toHaveCount(1);
      }
      await links.last().click();
      await expect(page).toHaveURL(new RegExp(`${(await links.last().getAttribute("href"))!}$`));

      await expect(page.locator("body")).not.toContainText(/mynter/i);
      const txt = await textoDePantalla(page);
      expect(FORBIDDEN_DEMO_LITERALS.filter((l) => txt.includes(l))).toEqual([]);
      expect(await desborde(page)).toBeLessThanOrEqual(1);
      expect(errores).toEqual([]);
    });

    test("DOC-02 · métricas (ADMIN, base vacía): carga limpia sin demo ni desborde horizontal", async ({ page }) => {
      const errores = vigilarConsola(page);
      await iniciarSesion(page, "ADMIN", { alumnos: [], planes_entrenamiento: [] });
      const resp = await page.goto("/studio/metricas");
      expect(resp?.status()).toBeLessThan(400);
      await expect(page.locator("main, [data-testid]").first()).toBeVisible({ timeout: 60_000 });
      const txt = await textoDePantalla(page);
      expect(FORBIDDEN_DEMO_LITERALS.filter((l) => txt.includes(l))).toEqual([]);
      expect(txt).not.toMatch(/\bNaN\b|\[object Object\]/);
      expect(await desborde(page)).toBeLessThanOrEqual(1);
      expect(errores).toEqual([]);
    });
  });
});
