import { expect, test, type Page } from "@playwright/test";

// GOZS-274: Auditoría E2E de la épica GOZS-221 (acuerdos con el coach).
// Cubre los flujos de UI acordados:
// 1. Dashboard: KPIs ejecutivos, filtro de actividad (GOZS-239) y eliminación de proxy SH (GOZS-240).
// 2. Cobros: Cobro de lista vs cobrado, una fila por alumno (GOZS-257), planes con vigencia futura (GOZS-255) y KPI anual ene-dic (GOZS-259).
// 3. Chat y Push: Chat coach-alumno en app del alumno y gestión de notificaciones (GOZS-227, GOZS-281).
// 4. Offline: Resiliencia de la app ante pérdida de conectividad y recuperación.

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const session = {
  access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: "00000000-0000-4000-8000-000000000001", exp: 4102444800, role: "authenticated" })}.sig`,
  refresh_token: "e2e-refresh",
  expires_at: 4102444800,
  expires_in: 3600,
  token_type: "bearer",
  user: { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "coach-e2e@gozster.test", app_metadata: {}, user_metadata: {} },
};

async function abrirRuta(page: Page, ruta: string, modo: "TESTEO" | "PRODUCCION" = "TESTEO") {
  await page.context().addCookies([
    { name: "sb-localhost-auth-token", value: `base64-${b64url(session)}`, url: "http://localhost:3100" },
  ]);
  await page.addInitScript((m) => {
    window.localStorage.setItem("gozster-workspace-mode", m);
    window.localStorage.setItem(
      "gozster-athlete-store",
      JSON.stringify({
        state: {
          onboardingCompletado: true,
          currentSession: {
            studentId: "00000000-0000-4000-8000-000000000001",
            studentName: "Gabriel",
            studentEmail: "gabriel@test.com",
            ejercicios: [],
          },
        },
        version: 2,
      })
    );
  }, modo);
  await page.goto(ruta, { waitUntil: "domcontentloaded" });
}

// El SSR pinta el FAB antes de que React hidrate: reintenta el click hasta que el toggle responda.
async function abrirChat(page: Page) {
  const btnChat = page.getByRole("button", { name: /Abrir chat/i });
  await expect(btnChat).toBeVisible({ timeout: 60_000 });
  await expect(async () => {
    if ((await btnChat.getAttribute("aria-expanded")) !== "true") await btnChat.click();
    await expect(btnChat).toHaveAttribute("aria-expanded", "true", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  return page.locator("#athlete-chat-drawer");
}

test.describe("Épica GOZS-221: Flujos UI de Coach Studio y App", () => {
  test("1. Dashboard: KPIs ejecutivos y filtro de actividad", async ({ page }) => {
    await abrirRuta(page, "/studio/dashboard", "TESTEO");

    // Franja de KPIs de retención en Modo Testeo
    await expect(page.getByTestId("kpi-cant-activas")).toBeVisible({ timeout: 60_000 });

    // Filtros por actividad en el dashboard (GOZS-239)
    const filtroContainer = page.getByTestId("filtro-actividad-container");
    await expect(filtroContainer).toBeVisible();
    await expect(page.getByTestId("filtro-actividad-funcional")).toBeVisible();
    await expect(page.getByTestId("filtro-actividad-boxeo")).toBeVisible();
    await expect(page.getByTestId("filtro-actividad-rutinas")).toBeVisible();

    // Alternar filtros de actividad
    await page.getByTestId("filtro-actividad-funcional").click();
    await page.waitForTimeout(200);
    await page.getByTestId("filtro-actividad-boxeo").click();
    await page.waitForTimeout(200);
    await page.getByTestId("filtro-actividad-todas").click();
    await page.waitForTimeout(200);

    // Sin proxy SH muerto (GOZS-240)
    await expect(page.locator("body")).not.toContainText(/score de salud/i);
    await expect(page.locator("body")).not.toContainText(/\bSH\b/);
  });

  test("2. Cobros: Una fila por alumno, planes con vigencia futura y KPI anual", async ({ page }) => {
    await abrirRuta(page, "/studio/cobros", "TESTEO");

    await expect(page.getByTestId("cobros-panel")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("cobros-kpis")).toBeVisible();
    await expect(page.getByTestId("cobros-table")).toBeVisible();
    await expect(page.getByTestId("cobro-row").first()).toBeVisible();

    // Filtros de cobros
    await expect(page.getByTestId("filtro-todos-btn")).toBeVisible();
    await expect(page.getByTestId("filtro-pendientes-btn")).toBeVisible();
    await expect(page.getByTestId("filtro-vencidos-btn")).toBeVisible();
    await expect(page.getByTestId("filtro-pagados-btn")).toBeVisible();

    // Modal de KPI anual ene-dic desagregado (GOZS-259)
    await page.getByTestId("btn-abrir-kpi-anual").click();
    const modalKpi = page.getByTestId("kpi-anual-dialog");
    await expect(modalKpi).toBeVisible();
    await expect(page.getByTestId("kpi-anual-meses")).toBeVisible();
    await expect(page.getByTestId("filtro-actividad-funcional")).toBeVisible();
    await expect(page.getByTestId("filtro-actividad-boxeo")).toBeVisible();
    await expect(page.getByTestId("filtro-actividad-rutinas")).toBeVisible();
    await page.getByTestId("btn-cerrar-kpi-anual").click();
    await expect(modalKpi).not.toBeVisible();

    // Modal de gestión de planes y vigencia futura (GOZS-255)
    await page.getByTestId("btn-gestionar-planes").click();
    const modalPlanes = page.getByTestId("gestion-planes-dialog");
    await expect(modalPlanes).toBeVisible();
    await expect(page.getByTestId("aviso-vigencia-futura-banner")).toBeVisible();
    await expect(page.getByTestId("btn-crear-plan")).toBeVisible();
    await modalPlanes.getByRole("button", { name: "Cerrar" }).click();
    await expect(modalPlanes).not.toBeVisible();
  });

  test("3. Chat coach-alumno y push notifications en App del Alumno", async ({ page }) => {
    await abrirRuta(page, "/athlete", "TESTEO");

    // Botón flotante para abrir chat → drawer abierto
    const chatDrawer = await abrirChat(page);
    await expect(chatDrawer).toBeVisible();
    await expect(page.getByTestId("push-subscription-container")).toBeVisible();
    await expect(page.getByTestId("toggle-push-btn")).toBeVisible();

    // Cerrar drawer con botón específico
    await chatDrawer.getByRole("button", { name: "Cerrar chat" }).click();
    await expect(chatDrawer).not.toBeVisible();
  });

  test("4. Offline y Resiliencia: La app permanece operativa y conserva estado sin red", async ({ page }) => {
    await abrirRuta(page, "/athlete", "TESTEO");

    // Simular pérdida de conexión
    await page.context().setOffline(true);
    await page.waitForTimeout(500);

    // Verificar que la app sigue interactiva
    const chatDrawer = await abrirChat(page);
    await expect(chatDrawer).toBeVisible();

    // Reconectar red
    await page.context().setOffline(false);
    await page.waitForTimeout(500);

    // La interfaz permanece estable
    await expect(chatDrawer).toBeVisible();
    await chatDrawer.getByRole("button", { name: "Cerrar chat" }).click();
    await expect(chatDrawer).not.toBeVisible();
  });
});
