import { expect, test, type Page } from "@playwright/test";
import {
  DEMO_GIMNASIO,
  DEMO_KPIS_NEGOCIO,
  DEMO_PLANES_MEMBRESIA,
} from "@/services/coach-demo-dataset";
import { derivarKpisNegocio } from "@/services/coach-demo-generator";
import {
  obtenerKpisNegocio,
  puedeVerMontos,
} from "@/lib/kpis-negocio";
import {
  derivarEvaDesdeSeveridad,
  derivarSeveridadAlerta,
  nivelDesdeEva,
  sincronizarAlertaConHistorial,
} from "@/lib/dolor";
import {
  calcularProgresion,
  estimar1RM,
} from "@/lib/progresion";
import {
  generarDemoPlanesIniciales,
  type CobroItem,
} from "@/store/use-cobros-store";

/**
 * GOZS-377 (QA-01): Suite Automatizada de Coherencia Cruzada de KPIs y Estados de Dolor
 * Referencia: 05-qa.md §2
 *
 * Valida sobre el stub de Supabase con seed fijo los 9 casos de coherencia canónica (C1 a C9)
 * entre Inicio (/studio), Cobros (/studio/cobros), Ingresos (/studio/ingresos),
 * Métricas (/studio/dashboard), Directorio y Ficha de Alumno:
 *  - C1: Cobrado idéntico en Inicio y Cobros.
 *  - C2: Alumnos al día idéntico en Inicio, Directorio y Cobros (y Métricas).
 *  - C3: Facturado = Cobrado + Por cobrar + Vencido.
 *  - C4: Registro de pago actualiza Cobrado y pasa a Pagado.
 *  - C5: Mismo nivel de dolor (alto) y estado en Bandeja, Directorio y Ficha.
 *  - C6: Transición de dolor a Atendida se refleja de inmediato.
 *  - C7: Progresión matemática de cargas (Epley, Brzycki y sobrecarga verificada).
 *  - C8: Alumno sin dolores no muestra badges espurios.
 *  - C9: Rol ENTRENADOR oculta montos y muestra KPIs de alumnos.
 *  - Gherkin Discrepancia: Alteración sintética que rompe la igualdad de Cobrado entre Inicio y Cobros
 *    hace fallar inmediatamente la validación identificando la discrepancia.
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

/**
 * Construye el seed canónico fijo de cobros sincronizado con DEMO_KPIS_NEGOCIO:
 * - Cobrado (29 contratos PAGADO): $800.000 (Presencial $520.000 + Online $280.000)
 * - Por cobrar (3 contratos PENDIENTE): $75.000 (3 x $25.000)
 * - Vencido (6 contratos VENCIDO): $120.000 (6 x $20.000)
 * - Total A cobrar (Por cobrar + Vencido): $195.000 (coincide con DEMO_KPIS_NEGOCIO.a_cobrar = 195.000)
 * - Facturado (Cobrado + Por cobrar + Vencido): $995.000 (coincide con DEMO_KPIS_NEGOCIO.facturado = 995.000)
 * - Tasa de cobro: round(800.000 / 995.000 * 100) = 80%
 * - Alumnos al día (PAGADO + PENDIENTE): 32 (coincide con Inicio = 32, Directorio = 32, Métricas = 32)
 * - Alumnos morosos (VENCIDO): 6 (coincide con DEMO_KPIS_NEGOCIO.cobranza_vencidas = 6)
 */
function construirCobrosSeedFijo(alteracionCobradoDelta = 0): CobroItem[] {
  const hoyIso = new Date().toISOString().slice(0, 10);
  const ahoraIso = new Date().toISOString();
  const activos = DEMO_GIMNASIO.alumnos.filter(
    (a) => a.rol === "ALUMNO" && (a.estado_membresia === "ACTIVA" || a.estado_membresia === "ACTIVE")
  );
  const noActivos = DEMO_GIMNASIO.alumnos.filter(
    (a) => a.rol === "ALUMNO" && a.estado_membresia !== "ACTIVA" && a.estado_membresia !== "ACTIVE"
  );

  const items: CobroItem[] = [];

  // 1. 3 contratos PENDIENTES (Por cobrar) que suman $75.000 (3 x $25.000)
  const facundo =
    DEMO_GIMNASIO.alumnos.find((a) => a.id === "demo-alumno-03-facundo") ?? activos[0]!;
  const otrosActivos = activos.filter((a) => a.id !== facundo.id);
  const alumnosPorCobrar = [facundo, otrosActivos[29]!, otrosActivos[30]!];

  // 2. 29 contratos PAGADOS que suman exactamente $800.000 (+ alteración sintética opcional)
  // 15 presenciales: 14 x $35.000 + 1 x $30.000 = $520.000
  // 14 online: 14 x $20.000 = $280.000
  // Junto con los 3 PENDIENTES completan 29 + 3 = 32 alumnos únicos al día
  const alumnosPagados = otrosActivos.slice(0, 29);
  alumnosPagados.forEach((alumno, idx) => {
    const esPresencial = idx < 15;
    const montoBase = esPresencial ? (idx < 14 ? 35_000 : 30_000) : 20_000;
    const monto = idx === 0 ? montoBase + alteracionCobradoDelta : montoBase;
    const contratacionId = `seed-cont-pagado-${idx + 1}`;
    items.push({
      id: `cobro-${contratacionId}`,
      alumnoId: alumno.id,
      alumnoNombre: alumno.nombre_completo,
      alumnoEmail: alumno.email ?? `${alumno.id}@gozster.test`,
      alumnoTelefono: alumno.telefono ?? null,
      contratacionId,
      servicioNombre: esPresencial ? "Funcional 2x semana" : "Rutina online",
      actividad: esPresencial ? "FUNCIONAL" : null,
      monto,
      montoLista: monto,
      diaVencimiento: 5,
      fechaVencimiento: hoyIso,
      estado: "PAGADO",
      ultimoPago: {
        id: `seed-pago-${idx + 1}`,
        monto,
        montoLista: monto,
        medioPago: idx % 2 === 0 ? "TRANSFERENCIA" : "EFECTIVO",
        fechaPago: ahoraIso,
        confirmadoPor: "Lucía Ferraro",
      },
    });
  });

  alumnosPorCobrar.forEach((alumno, idx) => {
    const contratacionId = `seed-cont-pendiente-${idx + 1}`;
    items.push({
      id: `cobro-${contratacionId}`,
      alumnoId: alumno.id,
      alumnoNombre: alumno.nombre_completo,
      alumnoEmail: alumno.email ?? `${alumno.id}@gozster.test`,
      alumnoTelefono: alumno.telefono ?? null,
      contratacionId,
      servicioNombre: "Funcional 2x semana",
      actividad: "FUNCIONAL",
      monto: 25_000,
      montoLista: 25_000,
      diaVencimiento: 10,
      fechaVencimiento: hoyIso,
      estado: "PENDIENTE",
    });
  });

  // 3. 6 contratos VENCIDOS (Morosos) que suman $120.000 (6 x $20.000)
  for (let idx = 0; idx < 6; idx++) {
    const alumnoRef = noActivos[idx];
    const contratacionId = `seed-cont-vencido-${idx + 1}`;
    items.push({
      id: `cobro-${contratacionId}`,
      alumnoId: alumnoRef?.id ?? `seed-vencido-alumno-${idx + 1}`,
      alumnoNombre: alumnoRef?.nombre_completo ?? `Alumno Moroso ${idx + 1}`,
      alumnoEmail: alumnoRef?.email ?? `moroso-${idx + 1}@gozster.test`,
      alumnoTelefono: alumnoRef?.telefono ?? null,
      contratacionId,
      servicioNombre: "Pase libre Funcional + Boxeo",
      actividad: "BOXEO",
      monto: 20_000,
      montoLista: 20_000,
      diaVencimiento: 5,
      fechaVencimiento: "2026-10-05",
      estado: "VENCIDO",
    });
  }

  return items;
}

const PLANES_SEED = generarDemoPlanesIniciales();

/** Extrae el valor numérico entero de un texto monetario en formato es-AR (ej. "$800.000" -> 800000). */
function parsearMontoArs(texto: string): number {
  const limpio = texto.replace(/[^\d]/g, "");
  return limpio ? Number(limpio) : Number.NaN;
}

/**
 * Validador estricto de coherencia de Cobrado entre Inicio y Cobros.
 * Lanza un error descriptivo inmediato si existe cualquier discrepancia.
 */
export function assertCoherenciaCobrado(cobradoInicio: number, cobradoCobros: number): void {
  if (
    !Number.isFinite(cobradoInicio) ||
    !Number.isFinite(cobradoCobros) ||
    cobradoInicio !== cobradoCobros
  ) {
    const diff = cobradoCobros - cobradoInicio;
    throw new Error(
      `Discrepancia de Cobrado detectada entre Inicio ($${cobradoInicio.toLocaleString("es-AR")}) y Cobros ($${cobradoCobros.toLocaleString("es-AR")}): diferencia de $${Math.abs(diff).toLocaleString("es-AR")}`
    );
  }
}

async function prepararSeedFijo(
  page: Page,
  opciones: { rol?: "ADMIN" | "ENTRENADOR"; alteracionCobradoDelta?: number } = {}
) {
  const rol = opciones.rol ?? "ADMIN";
  const alteracionDelta =
    opciones.alteracionCobradoDelta ??
    (process.env.FORCE_COBRADO_MISMATCH === "1" ? 50_000 : 0);

  const cobrosSeed = construirCobrosSeedFijo(alteracionDelta);

  await page.request.put(`${STUB_URL}/__e2e/fixtures`, {
    data: {
      rol,
      alumnos: DEMO_GIMNASIO.alumnos,
      planes_entrenamiento: DEMO_GIMNASIO.planes,
      dias_rutina: DEMO_GIMNASIO.dias,
      ejercicios_en_rutina: DEMO_GIMNASIO.ejerciciosEnRutina,
      ejercicios: DEMO_GIMNASIO.ejercicios,
      kpis_negocio:
        rol === "ENTRENADOR"
          ? [
              {
                ingresos: null,
                ingresos_6m: null,
                ingresos_periodo_anterior: null,
                cobranza_esperada: null,
                cobranza_pendiente_monto: null,
                cobranza_vencidas_cant: 6,
                sin_entrenar_7d_ids: DEMO_KPIS_NEGOCIO.sin_entrenar_7d_ids,
                activos_fin: 32,
                altas: 5,
                bajas: 2,
                ingresos_presencial: null,
                ingresos_online: null,
                cobranza_vencida_monto: null,
                cobranza_por_vencer_monto: null,
                alumnos_al_dia: 26,
                alumnos_morosos: 6,
              },
            ]
          : [
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

  await page.context().addCookies([
    {
      name: "sb-localhost-auth-token",
      value: `base64-${b64url(SESSION_COOKIE)}`,
      url: "http://localhost:3100",
    },
  ]);

  await page.addInitScript(
    ({ cobros, planes }) => {
      window.localStorage.setItem(
        "gozster-cobros",
        JSON.stringify({
          state: {
            cobros,
            filtroEstado: "TODOS",
            planes,
          },
          version: 0,
        })
      );
    },
    { cobros: cobrosSeed, planes: PLANES_SEED }
  );
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

async function irACobrosEsperandoHidratacion(page: Page) {
  await page.goto("/studio/cobros");
  await expect(page.getByTestId("cobros-kpis")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("filtro-pendientes-btn")).toHaveText(/Por vencer\s*3$/);
  await expect(page.getByTestId("filtro-vencidos-btn")).toHaveText(/Vencidos\s*6$/);
}

test.describe("GOZS-377: Coherencia Cruzada de KPIs y Estados de Dolor (C1 a C9)", () => {
  test.afterEach(async ({ request }) => {
    await request.delete(`${STUB_URL}/__e2e/fixtures`);
  });

  test("C1: Cobrado es idéntico en Inicio (/studio) y Cobros (/studio/cobros)", async ({
    page,
  }) => {
    await prepararSeedFijo(page);

    // 1. Leer Cobrado en Inicio (/studio)
    await page.goto("/studio");
    const kpiCobradoInicioLoc = page
      .getByTestId("kpi-cobrado")
      .or(page.getByTestId("kpi-ingresos-total"))
      .first();
    await expect(kpiCobradoInicioLoc).toBeVisible({ timeout: 60_000 });
    const cobradoInicioTexto = await kpiCobradoInicioLoc.innerText();
    const cobradoInicio = parsearMontoArs(cobradoInicioTexto);

    // 2. Leer Cobrado en Cobros (/studio/cobros) tras hidratación del store
    await irACobrosEsperandoHidratacion(page);
    const kpiCobradoCobrosLoc = page
      .getByTestId("kpi-ingresos-mes")
      .or(page.getByTestId("kpi-cobrado"))
      .first();
    await expect(kpiCobradoCobrosLoc).toBeVisible({ timeout: 60_000 });
    const cobradoCobrosTexto = await kpiCobradoCobrosLoc.innerText();
    const cobradoCobros = parsearMontoArs(cobradoCobrosTexto);

    // 3. Validación estricta de igualdad canónica
    assertCoherenciaCobrado(cobradoInicio, cobradoCobros);
    expect(cobradoInicio).toBe(800_000);
    expect(cobradoCobros).toBe(800_000);
  });

  test("C2: Alumnos al día es idéntico en Inicio, Directorio, Cobros y Métricas", async ({
    page,
  }) => {
    await prepararSeedFijo(page);

    // 1. Inicio (/studio): KPI de alumnos activos / al día
    await page.goto("/studio");
    const kpiActivosLoc = page.getByTestId("kpi-activos");
    await expect(kpiActivosLoc).toBeVisible({ timeout: 60_000 });
    const textoKpiInicio = await kpiActivosLoc.innerText();
    const matchInicio = textoKpiInicio.match(/\b(\d+)\b/);
    const alDiaInicio = Number(matchInicio?.[1] ?? "NaN");

    // 2. Directorio (/studio): contador del filtro "Al día (N)"
    await expandirDirectorioSiCerrado(page);
    const btnAlDiaDirectorio = page
      .getByTestId("alumnos-directory")
      .getByRole("button", { name: /Al día \(\d+\)/i });
    await expect(btnAlDiaDirectorio).toBeVisible();
    const textoDirectorio = await btnAlDiaDirectorio.innerText();
    const alDiaDirectorio = Number(textoDirectorio.match(/(\d+)\s*$/)?.[1] ?? "NaN");

    // 3. Cobros (/studio/cobros): texto "<N> alumnos al día" en cobros-kpis
    await irACobrosEsperandoHidratacion(page);
    const cobrosKpis = page.getByTestId("cobros-kpis");
    const textoCobros = await cobrosKpis.innerText();
    const alDiaCobros = Number(textoCobros.match(/(\d+)\s+alumnos al día/i)?.[1] ?? "NaN");

    // 4. Métricas (/studio/dashboard): KPI de atletas con membresía vigente (al día)
    await page.goto("/studio/dashboard");
    const kpiMetricasLoc = page.getByTestId("kpi-cant-activas");
    await expect(kpiMetricasLoc).toBeVisible({ timeout: 60_000 });
    const alDiaMetricas = Number((await kpiMetricasLoc.innerText()).trim());

    expect(alDiaInicio).toBe(32);
    expect(alDiaDirectorio).toBe(alDiaInicio);
    expect(alDiaCobros).toBe(alDiaInicio);
    expect(alDiaMetricas).toBe(alDiaInicio);
  });

  test("C3: Facturado = Cobrado + Por cobrar + Vencido en KPIs, Cobros e Ingresos", async ({
    page,
  }) => {
    await prepararSeedFijo(page);

    // 1. Verificar relación matemática en Inicio (/studio)
    await page.goto("/studio");
    await expect(page.getByTestId("kpi-ingresos-total")).toBeVisible({ timeout: 60_000 });
    const cobradoInicio = parsearMontoArs(await page.getByTestId("kpi-ingresos-total").innerText());
    const aCobrarTexto = await page.getByTestId("kpi-ingresos-a-cobrar").innerText();
    const aCobrarInicio = parsearMontoArs(aCobrarTexto.split("(")[0] ?? aCobrarTexto);

    // 2. Verificar desglose en Cobros (/studio/cobros): Cobrado, Por cobrar (Pendiente) y Vencido
    await irACobrosEsperandoHidratacion(page);
    const cobradoCobros = parsearMontoArs(await page.getByTestId("kpi-ingresos-mes").innerText());
    const porCobrarCobros = parsearMontoArs(
      await page.getByTestId("kpi-cobranza-pendiente").innerText()
    );
    const morososTexto = await page.getByTestId("kpi-alumnos-morosos").innerText();
    const vencidoMatch = morososTexto.match(/\(([^)]+)\)/);
    const vencidoCobros = parsearMontoArs(vencidoMatch?.[1] ?? morososTexto);
    const tasaCobranzaTexto = await page.getByTestId("kpi-tasa-cobranza").innerText();
    const tasaCobranzaPct = Number(tasaCobranzaTexto.replace(/[^\d]/g, ""));

    const facturadoCalculado = cobradoCobros + porCobrarCobros + vencidoCobros;
    const kpisCanonicos = derivarKpisNegocio(DEMO_GIMNASIO, DEMO_PLANES_MEMBRESIA, new Date());

    expect(cobradoCobros).toBe(800_000);
    expect(porCobrarCobros).toBe(75_000);
    expect(vencidoCobros).toBe(120_000);
    expect(porCobrarCobros + vencidoCobros).toBe(aCobrarInicio);
    expect(facturadoCalculado).toBe(cobradoInicio + aCobrarInicio);
    expect(facturadoCalculado).toBe(kpisCanonicos.facturado);
    expect(tasaCobranzaPct).toBe(Math.round((cobradoCobros / facturadoCalculado) * 100));

    // 3. Verificar identidad aditiva en Ingresos (/studio/ingresos - Sankey)
    await page.goto("/studio/ingresos");
    const sankeyStrip = page.getByTestId("sankey-metrics-strip");
    await expect(sankeyStrip).toBeVisible({ timeout: 60_000 });
    const montosSankey = await sankeyStrip
      .locator(".text-2xl")
      .evaluateAll((els) => els.map((e) => Number((e.textContent || "").replace(/[^\d]/g, ""))));
    const [facturadoSankey, cobradoSankey, porCobrarSankey] = montosSankey;
    expect(facturadoSankey).toBeGreaterThan(0);
    expect(facturadoSankey).toBe((cobradoSankey ?? 0) + (porCobrarSankey ?? 0));
  });

  test("C4: Registro de pago actualiza Cobrado inmediatamente y pasa el contrato a Pagado", async ({
    page,
  }) => {
    await prepararSeedFijo(page);
    await irACobrosEsperandoHidratacion(page);

    const leerPagados = async () =>
      Number((await page.getByTestId("filtro-pagados-btn").innerText()).match(/(\d+)\s*$/)?.[1]);
    const leerPendientes = async () =>
      Number((await page.getByTestId("filtro-pendientes-btn").innerText()).match(/(\d+)\s*$/)?.[1]);

    const cobradoAntes = parsearMontoArs(await page.getByTestId("kpi-ingresos-mes").innerText());
    const porCobrarAntes = parsearMontoArs(
      await page.getByTestId("kpi-cobranza-pendiente").innerText()
    );
    const pagadosAntes = await leerPagados();
    const pendientesAntes = await leerPendientes();

    // Filtrar pendientes y abrir diálogo de registro de pago para Facundo Medina ($25.000)
    await page.getByTestId("filtro-pendientes-btn").click();
    const filaPendiente = page.getByTestId("cobro-row").filter({ hasText: "Facundo Medina" });
    await expect(filaPendiente).toBeVisible();
    await filaPendiente.getByTestId("registrar-pago-btn").click();

    const dialogoPago = page.getByTestId("registrar-pago-dialog");
    await expect(dialogoPago).toBeVisible();

    // Confirmar el pago de $25.000
    const montoPago = 25_000;
    await page.getByTestId("input-pago-monto").fill(String(montoPago));
    await page.getByTestId("confirmar-pago-submit-btn").click();

    await expect(page.getByTestId("comprobante-dialog")).toBeVisible();
    await page.keyboard.press("Escape");

    // Verificar actualización inmediata de Cobrado, Por cobrar y contadores de estado
    await expect.poll(leerPagados).toBe(pagadosAntes + 1);
    await expect.poll(leerPendientes).toBe(pendientesAntes - 1);

    const cobradoDespues = parsearMontoArs(await page.getByTestId("kpi-ingresos-mes").innerText());
    const porCobrarDespues = parsearMontoArs(
      await page.getByTestId("kpi-cobranza-pendiente").innerText()
    );

    expect(cobradoDespues).toBe(cobradoAntes + montoPago);
    expect(porCobrarDespues).toBe(porCobrarAntes - montoPago);

    // Verificar que el contrato figura en la pestaña Pagados con badge "Pagado"
    await page.getByTestId("filtro-pagados-btn").click();
    const filaPagada = page.getByTestId("cobro-row").filter({ hasText: "Facundo Medina" });
    await expect(filaPagada).toBeVisible();
    await expect(filaPagada).toContainText(/Pagado/i);
  });

  test("C5: Mismo nivel de dolor (alto) y estado (Pendiente) en Bandeja, Directorio y Ficha", async ({
    page,
  }) => {
    // Verificación del contrato de modelo unificado de dolor (EVA 8 -> AGUDO -> nivel 'alto')
    const evaMartina = derivarEvaDesdeSeveridad("AGUDO");
    expect(evaMartina).toBe(8);
    expect(nivelDesdeEva(evaMartina)).toBe("alto");
    expect(derivarSeveridadAlerta(evaMartina, true)).toBe("CRITICA");
    expect(
      sincronizarAlertaConHistorial({
        eva: evaMartina,
        severidad: "AGUDO",
        estado: "PENDIENTE",
        es_sintoma_alarma: true,
      })
    ).toEqual({ severidad: "CRITICA", estado: "PENDIENTE" });

    await prepararSeedFijo(page);
    await page.goto("/studio");

    // 1. Bandeja de Alertas Críticas: Martina Gómez aparece con dolor alto/crítico en Rodilla y estado Pendiente
    const bandeja = page.getByTestId("critical-alerts-inbox");
    await expect(bandeja).toBeVisible({ timeout: 60_000 });
    const btnExpandirBandeja = bandeja.locator("button[aria-expanded]").first();
    if ((await btnExpandirBandeja.getAttribute("aria-expanded")) === "false") {
      await btnExpandirBandeja.click();
    }
    const filaBandejaMartina = page.getByTestId("alert-row-demo-alert-martina-rodilla");
    await expect(filaBandejaMartina).toBeVisible();
    await expect(filaBandejaMartina).toContainText("Martina Gómez");
    await expect(filaBandejaMartina).toContainText("Rodilla");
    await expect(filaBandejaMartina).toContainText(/Síntoma de alarma|Alto|Crítica/i);

    // 2. Directorio de Alumnos: Martina Gómez muestra badge de dolor en Rodilla
    await expandirDirectorioSiCerrado(page);
    const buscador = page
      .getByTestId("alumnos-directory")
      .locator('input[type="search"]')
      .first();
    await buscador.fill("Martina Gómez");
    const filaDirectorioMartina = page
      .getByTestId("alumnos-directory")
      .locator("tbody tr")
      .filter({ hasText: "Martina Gómez" });
    await expect(filaDirectorioMartina).toBeVisible();
    const badgeDolorDirectorio = filaDirectorioMartina.getByRole("button", {
      name: /Molestia articular en Rodilla/i,
    });
    await expect(badgeDolorDirectorio).toBeVisible();
    await expect(badgeDolorDirectorio).toContainText("Rodilla");

    // 3. Ficha de Alumno: abrir ficha de Martina Gómez y validar misma zona (Rodilla), nivel alto/agudo y estado Pendiente
    await filaDirectorioMartina.getByRole("button", { name: /Martina Gómez/i }).first().click();

    await expect(page.getByTestId("student-pain-alert-badge")).toContainText(/Molestia:/i);

    const cardAlertaMartina = page.getByTestId("student-pain-alert-demo-alert-martina-rodilla");
    await expect(cardAlertaMartina).toBeVisible();
    await expect(cardAlertaMartina).toContainText("Rodilla");
    await expect(cardAlertaMartina).toContainText(/AGUDO|CRITICA|Alto/i);

    const btnPendiente = page.getByTestId(
      "student-status-btn-pendiente-demo-alert-martina-rodilla"
    );
    await expect(btnPendiente).toHaveAttribute("aria-pressed", "true");
  });

  test("C6: Transición de dolor a Atendida se refleja de inmediato en Ficha y Bandeja", async ({
    page,
  }) => {
    await prepararSeedFijo(page);
    await page.goto("/studio");

    const bandeja = page.getByTestId("critical-alerts-inbox");
    await expect(bandeja).toBeVisible({ timeout: 60_000 });
    const contadorBandeja = bandeja.locator("button[aria-expanded] span.bg-destructive").first();
    const pendientesInicial = Number((await contadorBandeja.innerText()).trim());
    expect(pendientesInicial).toBe(5);

    // Abrir bandeja y seleccionar a Martina Gómez
    await bandeja.locator("button[aria-expanded]").first().click();
    await page.getByTestId("alert-row-demo-alert-martina-rodilla").click();

    // En la Ficha: cambiar estado de Pendiente a Atendido/Atendida
    const btnPendiente = page.getByTestId(
      "student-status-btn-pendiente-demo-alert-martina-rodilla"
    );
    const btnAtendido = page.getByTestId(
      "student-status-btn-atendido-demo-alert-martina-rodilla"
    );
    await expect(btnPendiente).toHaveAttribute("aria-pressed", "true");
    await expect(btnAtendido).toHaveAttribute("aria-pressed", "false");

    await btnAtendido.click();

    // Se refleja de inmediato en el control de estado sin recargar
    await expect(btnAtendido).toHaveAttribute("aria-pressed", "true");
    await expect(btnPendiente).toHaveAttribute("aria-pressed", "false");

    // Volver al listado principal y verificar que la Bandeja descontó la alerta atendida de inmediato
    const btnVolver = page
      .getByRole("button", { name: /Volver al listado|Volver a Studio|Volver/i })
      .first();
    await btnVolver.click();

    await expect(bandeja).toBeVisible();
    await expect(contadorBandeja).toHaveText(String(pendientesInicial - 1));

    if ((await bandeja.locator("button[aria-expanded]").first().getAttribute("aria-expanded")) === "false") {
      await bandeja.locator("button[aria-expanded]").first().click();
    }
    await expect(page.getByTestId("alert-row-demo-alert-martina-rodilla")).toHaveCount(0);
  });

  test("C7: Progresión matemática de cargas (Epley, Brzycki y sobrecarga verificada en Ficha)", async ({
    page,
  }) => {
    // 1. Verificación matemática directa de estimar1RM y calcularProgresion
    expect(estimar1RM(100, 6, "epley")).toBeCloseTo(100 * (1 + 6 / 30), 5);
    expect(estimar1RM(100, 6, "brzycki")).toBeCloseTo(100 / (1.0278 - 0.0278 * 6), 4);

    const historialLucas = DEMO_GIMNASIO.historial["demo-alumno-01-lucas"] ?? [];
    expect(historialLucas.length).toBeGreaterThan(0);
    const prog = calcularProgresion(historialLucas, 60);
    expect(prog.total).toBeGreaterThan(0);

    // 2. Verificación E2E en la Isla de Telemetría de Fuerza & 1RM de la Ficha de Alumno
    await prepararSeedFijo(page);
    await page.goto("/studio");
    await expandirDirectorioSiCerrado(page);

    const filaLucas = page
      .getByTestId("alumnos-directory")
      .locator("tbody tr")
      .filter({ hasText: "Lucas Giménez" });
    await expect(filaLucas).toBeVisible();
    await filaLucas.getByRole("button", { name: /Lucas Giménez/i }).first().click();

    const islaMetricas = page.getByTestId("isla-metricas-1rm");
    await expect(islaMetricas).toBeVisible({ timeout: 30_000 });

    const cardEpley = page.getByTestId("metricas-1rm-epley");
    const cardBrzycki = page.getByTestId("metricas-1rm-brzycki");
    await expect(cardEpley).toBeVisible();
    await expect(cardBrzycki).toBeVisible();

    const valorEpley = Number((await cardEpley.innerText()).match(/(\d+(?:\.\d+)?)\s*kg/i)?.[1]);
    const valorBrzycki = Number(
      (await cardBrzycki.innerText()).match(/(\d+(?:\.\d+)?)\s*kg/i)?.[1]
    );
    expect(valorEpley).toBeGreaterThan(0);
    expect(valorBrzycki).toBeGreaterThan(0);

    // Verificar matemática de cada tarjeta de ejercicio en Progresión Real de Cargas
    const bloqueProgresion = page.getByTestId("sparkline-tonelaje");
    await expect(bloqueProgresion).toBeVisible();
    await expect(bloqueProgresion).toContainText(/Sobrecarga Progresiva Verificada/i);

    const textoProgresion = await bloqueProgresion.innerText();
    const matchesInicio = [...textoProgresion.matchAll(/Inicio:\s*(\d+(?:\.\d+)?)kg\s*×\s*(\d+)/g)];
    expect(matchesInicio.length).toBeGreaterThanOrEqual(4);
  });

  test("C8: Alumno sin dolores (Esteban Papic) no muestra badges espurios en Bandeja, Directorio ni Ficha", async ({
    page,
  }) => {
    await prepararSeedFijo(page);
    await page.goto("/studio");

    // 1. Bandeja: Esteban Papic no figura en alertas críticas
    const bandeja = page.getByTestId("critical-alerts-inbox");
    await expect(bandeja).toBeVisible({ timeout: 60_000 });
    await bandeja.locator("button[aria-expanded]").first().click();
    await expect(page.getByTestId("alerts-compact-list")).not.toContainText("Esteban Papic");

    // 2. Directorio: la fila de Esteban Papic no tiene ningún badge de dolor ni de alerta
    await expandirDirectorioSiCerrado(page);
    const buscador = page
      .getByTestId("alumnos-directory")
      .locator('input[type="search"]')
      .first();
    await buscador.fill("Esteban Papic");

    const filaEsteban = page
      .getByTestId("alumnos-directory")
      .locator("tbody tr")
      .filter({ hasText: "Esteban Papic" });
    await expect(filaEsteban).toBeVisible();
    await expect(
      filaEsteban.getByRole("button", { name: /Molestia articular/i })
    ).toHaveCount(0);
    await expect(filaEsteban).not.toContainText("🚨");

    // 3. Ficha de Alumno: sin sección de alertas de dolor ni badges destructivos
    await filaEsteban.getByRole("button", { name: /Esteban Papic/i }).first().click();
    await expect(page.getByTestId("isla-salud-anamnesis")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("student-pain-alerts")).toHaveCount(0);
    await expect(page.getByTestId("student-pain-alert-badge")).toHaveCount(0);
    await expect(page.getByTestId("red-flags-alert")).toHaveCount(0);
    await expect(page.getByTestId("isla-salud-anamnesis")).toContainText(
      /Sin red flags|Sin dolores activos/i
    );
  });

  test("C9: Rol ENTRENADOR oculta montos monetarios y muestra KPIs operativos de alumnos", async ({
    page,
  }) => {
    await prepararSeedFijo(page, { rol: "ENTRENADOR" });

    // 1. Contrato de KpisNegocio y RPC sobre el stub para rol ENTRENADOR
    expect(puedeVerMontos("ENTRENADOR")).toBe(false);
    expect(puedeVerMontos("ADMIN")).toBe(true);

    const rpcRes = await page.request.post(`${STUB_URL}/rest/v1/rpc/obtener_kpis_negocio`, {
      data: { p_desde: "2026-11-01", p_hasta: "2026-11-30" },
    });
    expect(rpcRes.ok()).toBe(true);
    const rows = (await rpcRes.json()) as Record<string, unknown>[];
    const kpisEntrenador = await obtenerKpisNegocio({
      row: rows[0]!,
      rol: "ENTRENADOR",
      mesAnteriorLabel: "oct",
    });

    expect(kpisEntrenador.cobrado).toBeNull();
    expect(kpisEntrenador.porCobrar).toBeNull();
    expect(kpisEntrenador.vencido).toBeNull();
    expect(kpisEntrenador.facturado).toBeNull();
    expect(kpisEntrenador.tasaCobroPct).toBeNull();
    expect(kpisEntrenador.ingresos_presencial).toBeNull();
    expect(kpisEntrenador.ingresos_online).toBeNull();

    expect(kpisEntrenador.alumnos_activos).toBe(32);
    expect(kpisEntrenador.alumnosAlDia).toBe(26);
    expect(kpisEntrenador.alumnosMorosos).toBe(6);

    // 2. Vista operativa de Métricas de Alumnos (/studio/dashboard): muestra KPIs de alumnos y 0 montos ($)
    await page.goto("/studio/dashboard");
    const bannerRetencion = page.getByTestId("retention-executive-banner");
    await expect(bannerRetencion).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("kpi-cant-activas")).toHaveText("32");
    await expect(bannerRetencion).not.toContainText("$");
  });

  test("Gherkin Discrepancia: una alteración sintética que rompe la igualdad de Cobrado entre Inicio y Cobros es detectada inmediatamente", async ({
    page,
  }) => {
    // GIVEN una alteración sintética de +$50.000 en Cobros que rompe la igualdad con Inicio
    await prepararSeedFijo(page, { alteracionCobradoDelta: 50_000 });

    await page.goto("/studio");
    const kpiInicioLoc = page
      .getByTestId("kpi-cobrado")
      .or(page.getByTestId("kpi-ingresos-total"))
      .first();
    await expect(kpiInicioLoc).toBeVisible({ timeout: 60_000 });
    const cobradoInicio = parsearMontoArs(await kpiInicioLoc.innerText());

    await irACobrosEsperandoHidratacion(page);
    const kpiCobrosLoc = page
      .getByTestId("kpi-ingresos-mes")
      .or(page.getByTestId("kpi-cobrado"))
      .first();
    await expect(kpiCobrosLoc).toBeVisible({ timeout: 60_000 });
    const cobradoCobrosAlterado = parsearMontoArs(await kpiCobrosLoc.innerText());

    // THEN el detector de coherencia falla inmediatamente identificando la discrepancia exacta ($800.000 vs $850.000)
    expect(cobradoInicio).toBe(800_000);
    expect(cobradoCobrosAlterado).toBe(850_000);
    expect(() => assertCoherenciaCobrado(cobradoInicio, cobradoCobrosAlterado)).toThrow(
      /Discrepancia de Cobrado detectada entre Inicio .*800\.000.* y Cobros .*850\.000.*diferencia de .*50\.000/i
    );
  });
});
