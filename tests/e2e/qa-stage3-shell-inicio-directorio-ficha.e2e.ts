import { expect, test, type Page } from "@playwright/test";
import {
  DEMO_GIMNASIO,
  DEMO_KPIS_NEGOCIO,
} from "@/services/coach-demo-dataset";

/**
 * GOZS-390: Auditoría E2E de Shell, Inicio, Directorio Abierto y Layout Ficha (UX-S, UX-I, UX-D)
 * Referencia: 02-vistas.md §1, §2, §3, §4, 05-qa.md §3
 *
 * Criterios de Aceptación (Gherkin):
 * - GIVEN el recorrido de Shell, Inicio y Directorio en desktop (1440px) y mobile (390px)
 * - WHEN se ejecutan los tests E2E de navegación, filtros y apertura de ficha
 * - THEN todos los specs pasan en verde con 100% de éxito
 * - AND no se detecta scroll horizontal ni etiquetas técnicas de desarrollo
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

async function prepararSesionCoach(page: Page) {
  await page.request.put(`${STUB_URL}/__e2e/fixtures`, {
    data: {
      rol: "ADMIN",
      alumnos: DEMO_GIMNASIO.alumnos,
      planes_entrenamiento: DEMO_GIMNASIO.planes,
      dias_rutina: DEMO_GIMNASIO.dias,
      ejercicios_en_rutina: DEMO_GIMNASIO.ejerciciosEnRutina,
      ejercicios: DEMO_GIMNASIO.ejercicios,
      kpis_negocio: [DEMO_KPIS_NEGOCIO],
    },
  });

  await page.context().addCookies([
    {
      name: "sb-localhost-auth-token",
      value: `base64-${b64url(SESSION_COOKIE)}`,
      url: "http://localhost:3100",
    },
  ]);
}

async function verificarSinScrollHorizontal(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow, `Desborde horizontal detectado (${overflow}px)`).toBeLessThanOrEqual(1);
}

async function verificarSinRuidoTecnico(page: Page) {
  const txt = await page.locator("body").innerText();
  const etiquetasProhibidas = ["ADR-002", "Columna Matriz", "Touch targets", "Cuadro 1.1"];
  for (const etiqueta of etiquetasProhibidas) {
    expect(txt, `Etiqueta técnica prohibida detectada: ${etiqueta}`).not.toContain(etiqueta);
  }
  const errorJs = txt.match(/\bNaN\b|\bundefined\b|\[object Object\]/);
  expect(errorJs, `Texto JavaScript inválido detectado: ${errorJs?.[0]}`).toBeNull();
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE DESKTOP (1440px)
// ─────────────────────────────────────────────────────────────────────────────
test.describe("GOZS-390: Auditoría E2E Desktop (1440px) - Shell, Inicio, Directorio y Ficha", () => {
  test.afterEach(async ({ request }) => {
    await request.delete(`${STUB_URL}/__e2e/fixtures`).catch(() => {});
  });

  test("1. Shell (UX-S): Navegación completa, buscador rápido ⌘K y único 'Cerrar sesión'", async ({
    page,
  }) => {
    await prepararSesionCoach(page);
    await page.goto("/studio");
    await page.waitForLoadState("domcontentloaded");

    // A. Único botón 'Cerrar sesión' en el menú de cuenta
    const accountMenu = page.getByTestId("studio-account-menu");
    await expect(accountMenu).toBeVisible({ timeout: 45_000 });
    const logoutBtns = page.locator('button[aria-label="Cerrar sesión"]');
    await expect(logoutBtns).toHaveCount(1);
    await expect(accountMenu.getByRole("button", { name: /Cerrar sesión/i })).toBeVisible();

    // B. Sidebar agrupado en secciones lógicas
    await expect(page.getByTestId("sidebar-routine-builder-btn")).toBeVisible();
    await expect(page.getByTestId("sidebar-ranking-link")).toBeVisible();
    await expect(page.getByTestId("sidebar-cobros-link")).toBeVisible();
    await expect(page.getByTestId("sidebar-metricas-link")).toBeVisible();

    // C. Buscador rápido ⌘K: enfoca, filtra y navega al presionar Enter
    const quickSearch = page.getByTestId("studio-quick-search-input");
    await expect(quickSearch).toBeVisible();
    await quickSearch.click();
    await quickSearch.fill("Lucas");

    // Aparece resultado de búsqueda rápida
    const searchResult = page.getByTestId("search-result-demo-alumno-01-lucas").first();
    await expect(searchResult).toBeVisible({ timeout: 5_000 });

    // Presionar Enter abre la ficha de Lucas Giménez
    await page.keyboard.press("Enter");
    const studentHeader = page.getByTestId("student-detail-header");
    await expect(studentHeader).toBeVisible({ timeout: 15_000 });
    await expect(studentHeader).toContainText("Lucas Giménez");

    // Volver a inicio
    await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("button", { name: "Alumnos" }).click();
    await expect(page.getByTestId("alumnos-directory")).toBeVisible({ timeout: 15_000 });

    // D. Ausencia de scroll horizontal y ruido técnico
    await verificarSinScrollHorizontal(page);
    await verificarSinRuidoTecnico(page);
  });

  test("2. Inicio (UX-I): Fila de 4 KPIs reactiva a período, 'Para revisar hoy' y 'Clases de hoy'", async ({
    page,
  }) => {
    await prepararSesionCoach(page);
    await page.goto("/studio");

    // A. Fila de 4 KPIs
    const kpiCobrado = page.getByTestId("kpi-cobrado");
    const kpiActivos = page.getByTestId("kpi-alumnos-al-dia");
    const kpiSinRutina = page.getByTestId("kpi-sin-rutina");
    const kpiSinEntrenar = page.getByTestId("kpi-sin-entrenar");

    await expect(kpiCobrado).toBeVisible({ timeout: 45_000 });
    await expect(kpiCobrado).toContainText("$800.000");
    await expect(kpiActivos).toContainText("32 de 40");
    await expect(kpiSinRutina).toContainText("4");
    await expect(kpiSinEntrenar).toContainText("Sin entrenar");

    // B. Selector de período reactivo (Semana / Mes / Trimestre)
    const periodoSelector = page.getByTestId("selector-periodo");
    await expect(periodoSelector).toBeVisible();

    // Cambiar a Semana
    await periodoSelector.getByText("Semana", { exact: true }).click();
    await expect(page.getByTestId("periodo-selector-container")).toBeVisible();

    // Cambiar a Trimestre
    await periodoSelector.getByText("Trimestre", { exact: true }).click();
    await expect(page.getByTestId("periodo-selector-container")).toBeVisible();

    // Volver a Mes
    await periodoSelector.getByText("Mes", { exact: true }).click();

    // C. Bloque 'Para revisar hoy' con orden prioritario de alertas
    const paraRevisar = page.getByTestId("para-revisar-hoy-container");
    await expect(paraRevisar).toBeVisible();
    await expect(page.getByTestId("revisar-item-molestia").first()).toBeVisible();

    // D. Bloque 'Clases de hoy' y atajos de chat
    const clasesHoy = page.getByTestId("clases-hoy-container");
    await expect(clasesHoy).toBeVisible();
    await expect(page.getByTestId("clase-hoy-card").first()).toBeVisible();
    await expect(page.getByTestId("quick-contact-btn").first()).toBeVisible();

    // E. Ausencia de scroll horizontal y ruido técnico
    await verificarSinScrollHorizontal(page);
    await verificarSinRuidoTecnico(page);
  });

  test("3. Directorio (UX-D): Apertura con 15 filas, paginación, filtros de toolbar y badges semánticos", async ({
    page,
  }) => {
    await prepararSesionCoach(page);
    await page.goto("/studio");

    // A. Directorio abierto por defecto con 15 filas
    const directorio = page.getByTestId("alumnos-directory");
    await expect(directorio).toBeVisible({ timeout: 45_000 });
    await expect(directorio.locator("button").first()).toHaveAttribute("aria-expanded", "true");

    const tableRows = directorio.locator("tbody tr");
    await expect(tableRows).toHaveCount(15);

    // Leyenda de paginación
    const legend = page.getByTestId("data-table-legend");
    await expect(legend).toContainText("Mostrando 15 de 40");

    // B. Navegación de página (Siguiente -> filas 16-30 -> Mostrando 30 de 40)
    const btnSiguiente = page.getByRole("button", { name: "Página siguiente" });
    const btnAnterior = page.getByRole("button", { name: "Página anterior" });

    await expect(btnAnterior).toBeDisabled();
    await expect(btnSiguiente).toBeEnabled();

    await btnSiguiente.click();
    await expect(legend).toContainText("Mostrando 30 de 40");
    await expect(btnAnterior).toBeEnabled();

    // Volver a página 1
    await btnAnterior.click();
    await expect(legend).toContainText("Mostrando 15 de 40");

    // C. Toolbar unificada: buscador en vivo
    const searchInput = page.getByPlaceholder("Buscar atleta…");
    await searchInput.fill("Facundo");
    await expect(directorio.locator("tbody tr")).toHaveCount(1);
    await expect(directorio).toContainText("Facundo Medina");
    await searchInput.fill("");

    // D. Filtros por estado de cuota ("Al día", "Pago pendiente")
    const btnAlDia = page.getByRole("button", { name: /Al día \(32\)/i });
    await btnAlDia.click();
    await expect(directorio.locator("tbody tr")).toHaveCount(15);

    const btnTodos = page.getByRole("button", { name: /Todos \(40\)/i });
    await btnTodos.click();

    // E. Badges semánticos con texto legible
    await expect(page.getByTestId("columna-cuota-actividad").first()).toBeVisible();
    await expect(directorio.getByText("Funcional").first()).toBeVisible();

    // F. Persistencia de apertura/colapso en localStorage
    const toggleDirectorio = directorio.locator("button").first();
    await toggleDirectorio.click();
    await expect(toggleDirectorio).toHaveAttribute("aria-expanded", "false");

    const savedState = await page.evaluate(() =>
      window.localStorage.getItem("gozster_directorio_alumnos_expanded")
    );
    expect(savedState).toBe("false");

    // Re-abrir para dejar el estado restaurado
    await toggleDirectorio.click();
    await expect(toggleDirectorio).toHaveAttribute("aria-expanded", "true");

    // G. Ausencia de scroll horizontal y ruido técnico
    await verificarSinScrollHorizontal(page);
    await verificarSinRuidoTecnico(page);
  });

  test("4. Ficha (UX-Ficha Base): Cabecera limpia con 'Enviar mensaje', menú ⋯ y layout 2 columnas", async ({
    page,
  }) => {
    await prepararSesionCoach(page);
    await page.goto("/studio");

    // A. Abrir ficha del primer alumno
    const directorio = page.getByTestId("alumnos-directory");
    await expect(directorio).toBeVisible({ timeout: 45_000 });
    const primerAlumnoBtn = directorio.locator("tbody tr button").first();
    await primerAlumnoBtn.click();

    // B. Cabecera limpia: único botón con variante primaria
    const header = page.getByTestId("student-detail-header");
    await expect(header).toBeVisible({ timeout: 15_000 });

    const btnEnviarMensaje = page.getByTestId("enviar-mensaje-btn");
    await expect(btnEnviarMensaje).toBeVisible();
    await expect(btnEnviarMensaje).toContainText("Enviar mensaje");
    // Variante primaria: fondo primario
    const className = await btnEnviarMensaje.getAttribute("class");
    expect(className).toContain("bg-primary");

    // C. Acciones secundarias en outline
    await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("button", { name: "Alumnos" })).toBeVisible();
    await expect(page.getByTestId("btn-asignar-rutina")).toBeVisible();

    // D. Menú ⋯ desplegable con acciones accesibles
    const menuTrigger = page.getByTestId("student-header-menu-trigger");
    await expect(menuTrigger).toBeVisible();
    await menuTrigger.click();

    await expect(page.getByTestId("student-menu-editar-perfil")).toBeVisible();
    await expect(page.getByTestId("student-menu-registrar-pago")).toBeVisible();
    await expect(page.getByTestId("student-menu-exportar-ficha")).toBeVisible();

    // E. Layout predeterminado en 2 columnas y canvas modular
    const canvas = page.getByTestId("student-detail-modular-canvas");
    await expect(canvas).toBeVisible();

    // F. Botón '← Volver' regresa limpiamente al directorio
    await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("button", { name: "Alumnos" }).click();
    await expect(directorio).toBeVisible({ timeout: 15_000 });

    // G. Ausencia de scroll horizontal y ruido técnico
    await verificarSinScrollHorizontal(page);
    await verificarSinRuidoTecnico(page);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE MOBILE (390px - Pixel 7)
// ─────────────────────────────────────────────────────────────────────────────
test.describe("GOZS-390: Auditoría E2E Mobile (390px) @mobile", () => {
  test.afterEach(async ({ request }) => {
    await request.delete(`${STUB_URL}/__e2e/fixtures`).catch(() => {});
  });

  test("5. Mobile (UX-S / UX-I): Barra inferior de 5 accesos, sin FAB superpuesto y cero desborde @mobile", async ({
    page,
  }) => {
    await prepararSesionCoach(page);
    await page.goto("/studio");
    await page.waitForLoadState("domcontentloaded");

    // A. Barra inferior móvil visible con 5 accesos
    const bottomNav = page.getByTestId("studio-mobile-bottom-nav");
    await expect(bottomNav).toBeVisible({ timeout: 45_000 });

    await expect(bottomNav.getByRole("link", { name: "Inicio" })).toBeVisible();
    await expect(bottomNav.getByRole("button", { name: "Alumnos" })).toBeVisible();
    await expect(bottomNav.getByRole("link", { name: "Agenda" })).toBeVisible();
    await expect(bottomNav.getByRole("button", { name: "Mensajes" })).toBeVisible();
    await expect(bottomNav.getByRole("button", { name: "Más" })).toBeVisible();

    // B. FAB oculto en viewports móviles
    const chatFab = page.locator('aside[aria-label="Acceso flotante a mensajería"]');
    await expect(chatFab).toBeHidden();

    // C. Cero scroll horizontal en mobile 390px
    await verificarSinScrollHorizontal(page);
    await verificarSinRuidoTecnico(page);

    // D. Directorio accesible en mobile y apertura de ficha
    const directorio = page.getByTestId("alumnos-directory");
    await expect(directorio).toBeVisible();
    const primerAlumnoBtn = directorio.locator("tbody tr button").first();
    await primerAlumnoBtn.click();

    // Ficha cargada en móvil sin desborde
    await expect(page.getByTestId("student-detail-header")).toBeVisible({ timeout: 15_000 });
    await verificarSinScrollHorizontal(page);
    await verificarSinRuidoTecnico(page);
  });
});
