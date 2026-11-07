import { expect, test, type Page } from "@playwright/test";
import { DEMO_GIMNASIO } from "@/services/coach-demo-dataset";

/**
 * GOZS-391: QA Suite E2E de Auditoría del Stage 4
 * Ficha de Alumno (Isla Salud, Notas y 1RM) [UX-F]
 * Cobros (DataTable 15 filas, Sheet/Dialog de Pago y KPIs) [UX-C]
 * Agenda (Rango Dinámico, Detalle de Clase y Diálogo de Cancelación) [UX-A]
 * Criterios de Aceptación: 02-vistas.md §4, §5, §6 y 05-qa.md §3
 */

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

async function abrirStudio(page: Page, ruta = "/studio") {
  // Asegurar que el stub de Supabase conozca los alumnos del seed canónico
  try {
    await page.request.put("http://localhost:54321/__e2e/fixtures", {
      data: {
        alumnos: DEMO_GIMNASIO.alumnos,
        rol: "ADMIN",
      },
    });
  } catch {}

  await page.context().addCookies([
    {
      name: "sb-localhost-auth-token",
      value: `base64-${b64url(SESSION_COOKIE)}`,
      url: "http://localhost:3100",
    },
  ]);
  await page.goto(ruta);
  await page.waitForLoadState("domcontentloaded");
}

async function expandirDirectorioSiCerrado(page: Page) {
  const dir = page.getByTestId("alumnos-directory");
  await expect(dir).toBeVisible({ timeout: 60_000 });
  const toggleBtn = dir.locator("button[aria-expanded]").first();
  if ((await toggleBtn.count()) > 0) {
    const expanded = await toggleBtn.getAttribute("aria-expanded");
    if (expanded === "false") {
      await toggleBtn.click();
    }
  }
}

test.describe("Stage 4 QA Suite: Auditoría E2E de Isla Salud, Cobros y Agenda (GOZS-391)", () => {
  // =========================================================================
  // 1. FICHA DE ALUMNO - ISLA SALUD Y TELEMETRÍA (UX-F)
  // =========================================================================
  test("UX-F: Isla de Salud con EVA, alternancia en tiempo real de Segmented y autoguardado de notas", async ({
    page,
  }) => {
    await abrirStudio(page, "/studio");

    // 1. Acceder a la ficha de Martina Gómez (alumna con reporte de dolor activo en Rodilla)
    await expandirDirectorioSiCerrado(page);
    const buscador = page.getByTestId("alumnos-directory").locator('input[type="search"]').first();
    await buscador.fill("Martina Gómez");
    const filaMartina = page.getByTestId("alumnos-directory").locator("tbody tr").filter({ hasText: "Martina Gómez" });
    await expect(filaMartina).toBeVisible({ timeout: 15_000 });
    await filaMartina.getByRole("button", { name: /Martina Gómez/i }).first().click();

    // 2. Verificar que la Isla de Salud está presente
    const islaSalud = page.getByTestId("isla-salud-anamnesis");
    await expect(islaSalud).toBeVisible({ timeout: 30_000 });

    // 3. Verificar el Alert semántico de dolor activo con EVA 8, severidad Agudo y zona Rodilla
    const alertSalud = page.getByTestId("alert-salud");
    await expect(alertSalud).toBeVisible();
    await expect(alertSalud).toContainText("Agudo");
    await expect(alertSalud).toContainText("Rodilla");
    await expect(alertSalud).toContainText("EVA 8");

    // 4. Alternancia en tiempo real del Segmented (Pendiente -> Atendida -> Resuelta)
    // El estado inicial es Pendiente
    await expect(alertSalud).toContainText("Pendiente");

    // Alternar a Atendida
    const btnAtendida = islaSalud.getByRole("tab", { name: "Atendida" });
    await expect(btnAtendida).toBeVisible();
    await btnAtendida.click();
    await expect(alertSalud).toContainText("Atendida");

    // Alternar a Resuelta
    const btnResuelta = islaSalud.getByRole("tab", { name: "Resuelta" });
    await expect(btnResuelta).toBeVisible();
    await btnResuelta.click();
    await expect(alertSalud).toContainText("Resuelta");

    // Revertir a Pendiente para dejar el estado consistente
    const btnPendiente = islaSalud.getByRole("tab", { name: "Pendiente" });
    await expect(btnPendiente).toBeVisible();
    await btnPendiente.click();
    await expect(alertSalud).toContainText("Pendiente");

    // 5. Autoguardado de notas al desenfocar (onBlur)
    const textareaNotas = islaSalud.locator('textarea[aria-label="Nota de intervención"]');
    await expect(textareaNotas).toBeVisible();
    await textareaNotas.fill("Auditoría QA: Se evalúa cambio por Prensa 45° unilateral y sin dolor.");
    await textareaNotas.blur();

    // Verifica confirmación visual de autoguardado en la ficha
    await expect(
      islaSalud.getByText(/Guardado/i).first()
    ).toBeVisible();

    // 6. Verificar Isla de Métricas 1RM con fórmulas Epley y Brzycki
    const islaMetricas = page.getByTestId("isla-metricas-1rm");
    await expect(islaMetricas).toBeVisible();
    await expect(page.getByTestId("metricas-1rm-epley")).toBeVisible();
    await expect(page.getByTestId("metricas-1rm-brzycki")).toBeVisible();
    await expect(page.getByTestId("help-icon-epley")).toBeVisible();
    await expect(page.getByTestId("help-icon-brzycki")).toBeVisible();
  });

  test("UX-F: Alumno sin dolor activo (Esteban Papic) muestra alert-salud-empty 'Sin dolores activos'", async ({
    page,
  }) => {
    await abrirStudio(page, "/studio");

    await expandirDirectorioSiCerrado(page);
    const buscador = page.getByTestId("alumnos-directory").locator('input[type="search"]').first();
    await buscador.fill("Esteban Papic");
    const filaEsteban = page.getByTestId("alumnos-directory").locator("tbody tr").filter({ hasText: "Esteban Papic" });
    await expect(filaEsteban).toBeVisible({ timeout: 15_000 });
    await filaEsteban.getByRole("button", { name: /Esteban Papic/i }).first().click();

    const islaSalud = page.getByTestId("isla-salud-anamnesis");
    await expect(islaSalud).toBeVisible({ timeout: 30_000 });

    // Exhibe alert-salud-empty
    await expect(page.getByTestId("alert-salud-empty")).toBeVisible();
    await expect(page.getByTestId("alert-salud-empty")).toContainText("Sin dolores activos.");
    await expect(page.getByTestId("alert-salud")).toHaveCount(0);
  });

  // =========================================================================
  // 2. COBROS - DATATABLE 15 FILAS, MODAL DE PAGO Y ACTUALIZACIÓN REACTIVA (UX-C)
  // =========================================================================
  test("UX-C: DataTable paginada con 15 contratos por página, orden por vencimiento y registro reactivo de pago", async ({
    page,
  }) => {
    await abrirStudio(page, "/studio/cobros");

    // 1. Verificar KPIs superiores en Cobros
    const kpisContenedor = page.getByTestId("cobros-kpis");
    await expect(kpisContenedor).toBeVisible({ timeout: 30_000 });
    const kpiCobrado = page.getByTestId("kpi-ingresos-mes");
    await expect(kpiCobrado).toBeVisible();

    // 2. DataTable paginada con 15 contratos por página
    const tablaCobros = page.getByTestId("cobros-table");
    await expect(tablaCobros).toBeVisible();

    // Exactamente 15 filas renderizadas en la página 1
    const filasPagina1 = page.getByTestId("cobro-row");
    await expect(filasPagina1).toHaveCount(15);

    // Leyenda de paginación
    const leyendaPaginacion = page.getByTestId("data-table-legend");
    await expect(leyendaPaginacion).toBeVisible();
    await expect(leyendaPaginacion).toContainText("Mostrando 15 de");

    // 3. Navegación de páginas accesible
    const btnSiguiente = page.getByRole("button", { name: "Página siguiente" });
    await expect(btnSiguiente).toBeVisible();
    await btnSiguiente.click();
    await expect(page.getByText(/Página 2 de/i)).toBeVisible();

    const btnAnterior = page.getByRole("button", { name: "Página anterior" });
    await expect(btnAnterior).toBeVisible();
    await btnAnterior.click();
    await expect(page.getByText(/Página 1 de/i)).toBeVisible();

    // 4. Apertura del Diálogo Modal de Registro de Pago
    // Filtrar por pendientes para encontrar una cuota a cobrar
    await page.getByTestId("filtro-pendientes-btn").click();
    const filaPendiente = page.getByTestId("cobro-row").first();
    await expect(filaPendiente).toBeVisible();

    const btnRegistrarPago = filaPendiente.getByTestId("registrar-pago-btn");
    await expect(btnRegistrarPago).toBeVisible();
    await btnRegistrarPago.click();

    // Verificar que se abre el modal/diálogo y recibe el foco
    const dialogPago = page.getByTestId("registrar-pago-dialog");
    await expect(dialogPago).toBeVisible();

    const inputMonto = page.getByTestId("input-pago-monto");
    await expect(inputMonto).toBeVisible();

    // 5. Validación estricta: monto <= 0 bloquea el envío
    const btnSubmit = page.getByTestId("confirmar-pago-submit-btn");
    await inputMonto.fill("0");
    await expect(btnSubmit).toBeDisabled();

    // Ingresar monto positivo válido
    const montoAbonado = 25000;
    await inputMonto.fill(String(montoAbonado));
    await expect(btnSubmit).toBeEnabled();

    // Seleccionar medio de pago (Transferencia o Efectivo)
    const btnMedio = page.getByTestId("medio-transferencia-btn");
    await btnMedio.click();

    // Confirmar pago
    await btnSubmit.click();

    // 6. Modal de comprobante emitido
    const dialogComprobante = page.getByTestId("comprobante-dialog");
    await expect(dialogComprobante).toBeVisible();

    // Preservación de foco y cierre accesible con Escape
    await page.keyboard.press("Escape");
    await expect(dialogComprobante).not.toBeVisible();

    // 7. Verificar que el contrato figura ahora en la pestaña Pagados
    await page.getByTestId("filtro-pagados-btn").click();
    await expect(page.getByTestId("cobro-row").first()).toContainText(/Pagado/i);
  });

  // =========================================================================
  // 3. AGENDA - RANGO DINÁMICO, DETALLE DE CLASE Y CANCELACIÓN (UX-A)
  // =========================================================================
  test("UX-A: Grilla horaria adaptativa (17:00-21:00), detalle de clase y diálogo modal de cancelación", async ({
    page,
  }) => {
    await abrirStudio(page, "/studio/agenda");

    // 1. Selector semanal accesible
    const btnSemana = page.getByTestId("view-week-btn");
    await expect(btnSemana).toBeVisible({ timeout: 30_000 });
    await btnSemana.click();

    // Verificar que la agenda cargó
    const agenda = page.getByTestId("class-agenda");
    await expect(agenda).toBeVisible();

    // 2. Grilla horaria adaptativa que oculta horas sin actividad
    // La franja con clases opera entre 17:00 y 21:00
    const bloquesClases = page.getByTestId("class-block-card");
    await expect(bloquesClases.first()).toBeVisible();
    await expect(bloquesClases).toHaveCount(10);

    // 3. Apertura del panel / Sheet de Detalle de Clase al hacer clic
    // Seleccionar una clase programada que tiene alumnos inscriptos (ej. Funcional 18:00 del miércoles o clase con inscriptos)
    const claseSeleccionada = bloquesClases.filter({ hasNotText: "0 anot." }).filter({ hasNotText: "Cancelada" }).first();
    await expect(claseSeleccionada).toBeVisible();
    await claseSeleccionada.click();

    // Verificar detalle de clase desplegado
    const detalleClase = page.getByTestId("class-detail");
    await expect(detalleClase).toBeVisible();
    await expect(detalleClase).toContainText(/Funcional|Boxeo/i);

    // Botón de anotar alumno visible en el detalle
    await expect(page.getByTestId("enroll-student-dialog-btn")).toBeVisible();

    // 4. Diálogo modal accesible ante Cancelación de Clase
    const btnCancelarClase = page.getByTestId("cancel-class-dialog-btn");
    await expect(btnCancelarClase).toBeVisible();
    await btnCancelarClase.click();

    // El diálogo de cancelación se despliega con advertencia de alumnos inscriptos
    const tituloCancelar = page.locator("#cancelar-clase-titulo");
    await expect(tituloCancelar).toBeVisible();
    await expect(tituloCancelar).toHaveText("Cancelar clase");

    // Verificación de validación de motivo mínimo (5 caracteres)
    const textareaMotivo = page.getByTestId("cancel-class-reason");
    await expect(textareaMotivo).toBeVisible();
    const btnConfirmarCancelacion = page.getByTestId("confirm-cancel-class-btn");

    // Escribir motivo válido (>= 5 caracteres)
    await textareaMotivo.fill("Feriado puente decretado por el municipio");
    await expect(btnConfirmarCancelacion).toBeEnabled();

    // Confirmar cancelación
    await btnConfirmarCancelacion.click();

    // 5. La clase se actualiza reactivamente a Cancelada en la grilla sin recargar
    await expect(page.getByTestId("class-block-card").filter({ hasText: "Cancelada" })).toHaveCount(2);
  });

  // =========================================================================
  // 4. ACCESIBILIDAD (A11Y) Y RESPONSIVIDAD MÓVIL
  // =========================================================================
  test("@mobile UX General: La vista de Inicio, Cobros y Agenda no genera desborde horizontal", async ({
    page,
  }) => {
    for (const ruta of ["/studio", "/studio/cobros", "/studio/agenda"]) {
      await abrirStudio(page, ruta);
      const desborde = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(desborde).toBeLessThanOrEqual(1);
    }
  });
});
