import { describe, it, expect, beforeEach } from "vitest";
import {
  DEMO_GIMNASIO,
  DEMO_KPIS_NEGOCIO,
  DEMO_CRITICAL_ALERTS,
  getDemoAlumnoAlerts,
} from "../services/coach-demo-dataset";
import { getDemoCriticalAlerts } from "../components/coach/critical-alerts-data";
import {
  calculateEpley1RM,
  calculateBrzycki1RM,
  calculateTotalTonnage,
} from "../lib/strength-metrics";
import { calcularProgresion } from "../lib/progresion";
import { mapearRpcAKpis, puedeVerMontos } from "../lib/kpis-negocio";
import {
  useDemoAlertEstados,
  applyDemoEstados,
} from "../components/coach/critical-alerts-store";

interface SeedCobroItem {
  id: string;
  alumno_id: string;
  alumno_nombre: string;
  plan_nombre: string;
  monto: number;
  moneda: string;
  fecha_vencimiento: string;
  estado: "PAGADO" | "PENDIENTE" | "VENCIDO";
  fecha_pago: string | null;
}

function buildFixedCoherenceCobrosSeed(): SeedCobroItem[] {
  const cobros: SeedCobroItem[] = [];

  for (let i = 0; i < 29; i++) {
    const monto = i === 0 ? 30_000 : 27_500;
    cobros.push({
      id: `seed-cobro-pagado-${i + 1}`,
      alumno_id: `demo-alumno-${String(i + 1).padStart(2, "0")}`,
      alumno_nombre: `Alumno Al Día ${i + 1}`,
      plan_nombre: "Plan Mensual Full",
      monto,
      moneda: "ARS",
      fecha_vencimiento: "2026-04-05",
      estado: "PAGADO",
      fecha_pago: "2026-04-03",
    });
  }

  const pendientes = [
    { id: "seed-cobro-pendiente-1", alumno_id: "demo-alumno-06-facundo", nombre: "Facundo Medina", monto: 25_000 },
    { id: "seed-cobro-pendiente-2", alumno_id: "demo-alumno-31", nombre: "Alumno Pendiente 2", monto: 25_000 },
    { id: "seed-cobro-pendiente-3", alumno_id: "demo-alumno-32", nombre: "Alumno Pendiente 3", monto: 25_000 },
  ];
  for (const p of pendientes) {
    cobros.push({
      id: p.id,
      alumno_id: p.alumno_id,
      alumno_nombre: p.nombre,
      plan_nombre: "Plan Mensual Full",
      monto: p.monto,
      moneda: "ARS",
      fecha_vencimiento: "2026-04-28",
      estado: "PENDIENTE",
      fecha_pago: null,
    });
  }

  for (let i = 0; i < 6; i++) {
    cobros.push({
      id: `seed-cobro-vencido-${i + 1}`,
      alumno_id: `demo-alumno-vencido-${i + 1}`,
      alumno_nombre: `Alumno Moroso ${i + 1}`,
      plan_nombre: "Plan Trimestral",
      monto: 20_000,
      moneda: "ARS",
      fecha_vencimiento: "2026-04-01",
      estado: "VENCIDO",
      fecha_pago: null,
    });
  }

  return cobros;
}

function summarizeCobros(cobros: SeedCobroItem[]) {
  const cobrado = cobros
    .filter((c) => c.estado === "PAGADO")
    .reduce((acc, c) => acc + c.monto, 0);
  const porCobrar = cobros
    .filter((c) => c.estado === "PENDIENTE")
    .reduce((acc, c) => acc + c.monto, 0);
  const vencido = cobros
    .filter((c) => c.estado === "VENCIDO")
    .reduce((acc, c) => acc + c.monto, 0);
  const facturado = cobrado + porCobrar + vencido;
  const alDiaCount = cobros.filter((c) => c.estado === "PAGADO" || c.estado === "PENDIENTE").length;
  const morososCount = cobros.filter((c) => c.estado === "VENCIDO").length;
  const tasaCobroPct = facturado > 0 ? Math.round((cobrado / facturado) * 100) : 0;

  return {
    cobrado,
    porCobrar,
    vencido,
    facturado,
    alDiaCount,
    morososCount,
    tasaCobroPct,
  };
}

function assertCrossScreenCobradoCoherence(params: {
  cobradoInicio: number;
  cobradoCobros: number;
  cobradoIngresos: number;
}): void {
  const { cobradoInicio, cobradoCobros, cobradoIngresos } = params;
  if (cobradoInicio !== cobradoCobros) {
    throw new Error(
      `[DISCREPANCIA_COBRADO] Inicio reporta $${cobradoInicio} pero Cobros reporta $${cobradoCobros} (diferencia: $${Math.abs(
        cobradoInicio - cobradoCobros
      )})`
    );
  }
  if (cobradoInicio !== cobradoIngresos) {
    throw new Error(
      `[DISCREPANCIA_COBRADO] Inicio reporta $${cobradoInicio} pero Ingresos reporta $${cobradoIngresos} (diferencia: $${Math.abs(
        cobradoInicio - cobradoIngresos
      )})`
    );
  }
}

describe("GOZS-377 — Coherencia Cruzada de KPIs, Estados de Dolor y Progresión Matemática (C1..C9)", () => {
  beforeEach(() => {
    useDemoAlertEstados.setState({ estados: {} });
  });

  it("C1: Cobrado idéntico en Inicio (/studio), Cobros (/studio/cobros) e Ingresos (/studio/ingresos)", () => {
    const cobrosSummary = summarizeCobros(buildFixedCoherenceCobrosSeed());
    const cobradoInicio = DEMO_KPIS_NEGOCIO.ingresos_mes;
    const cobradoIngresos = DEMO_KPIS_NEGOCIO.cobrado ?? 0;
    const cobradoCobros = cobrosSummary.cobrado;

    expect(cobradoInicio).toBe(800_000);
    expect(cobradoCobros).toBe(800_000);
    expect(cobradoIngresos).toBe(800_000);

    expect(() =>
      assertCrossScreenCobradoCoherence({
        cobradoInicio,
        cobradoCobros,
        cobradoIngresos,
      })
    ).not.toThrow();
  });

  it("C1 (Criterio Gherkin de Discrepancia Sintética): detecta inmediatamente alteración sintética de Cobrado entre Inicio y Cobros", () => {
    const cobrosSummary = summarizeCobros(buildFixedCoherenceCobrosSeed());
    const cobradoInicioSintetico = DEMO_KPIS_NEGOCIO.ingresos_mes + 75_000; // $875.000 vs $800.000

    expect(() =>
      assertCrossScreenCobradoCoherence({
        cobradoInicio: cobradoInicioSintetico,
        cobradoCobros: cobrosSummary.cobrado,
        cobradoIngresos: DEMO_KPIS_NEGOCIO.cobrado ?? 0,
      })
    ).toThrow(/\[DISCREPANCIA_COBRADO\] Inicio reporta \$875000 pero Cobros reporta \$800000 \(diferencia: \$75000\)/);
  });

  it("C2: Alumnos al día idéntico en Inicio, Directorio, Cobros y Métricas", () => {
    const cobrosSummary = summarizeCobros(buildFixedCoherenceCobrosSeed());
    const activosInicio = DEMO_KPIS_NEGOCIO.alumnos_activos;
    const activosDirectorio = DEMO_GIMNASIO.alumnos.filter(
      (a) => a.estado_membresia === "ACTIVA"
    ).length;

    expect(activosInicio).toBe(32);
    expect(activosDirectorio).toBe(32);
    expect(cobrosSummary.alDiaCount).toBe(32);
    expect(activosInicio).toBe(activosDirectorio);
    expect(activosDirectorio).toBe(cobrosSummary.alDiaCount);
  });

  it("C3: Identidad contable Facturado = Cobrado + Por cobrar + Vencido y Tasa de Cobranza", () => {
    const cobrosSummary = summarizeCobros(buildFixedCoherenceCobrosSeed());

    expect(cobrosSummary.cobrado).toBe(800_000);
    expect(cobrosSummary.porCobrar).toBe(75_000);
    expect(cobrosSummary.vencido).toBe(120_000);
    expect(cobrosSummary.porCobrar + cobrosSummary.vencido).toBe(DEMO_KPIS_NEGOCIO.a_cobrar);
    expect(cobrosSummary.facturado).toBe(DEMO_KPIS_NEGOCIO.facturado);
    expect(cobrosSummary.facturado).toBe(
      cobrosSummary.cobrado + cobrosSummary.porCobrar + cobrosSummary.vencido
    );
    expect(cobrosSummary.tasaCobroPct).toBe(DEMO_KPIS_NEGOCIO.tasaCobroPct);
    expect(cobrosSummary.morososCount).toBe(DEMO_KPIS_NEGOCIO.cobranza_vencidas);
  });

  it("C4: Registro de pago actualiza Cobrado (+monto), reduce Por cobrar (-monto), conserva Facturado y pasa a PAGADO", () => {
    const cobros = buildFixedCoherenceCobrosSeed();
    const antes = summarizeCobros(cobros);

    const facundoIdx = cobros.findIndex((c) => c.id === "seed-cobro-pendiente-1");
    expect(facundoIdx).toBeGreaterThanOrEqual(0);
    const itemFacundo = cobros[facundoIdx]!;
    const montoPagado = itemFacundo.monto;

    cobros[facundoIdx] = {
      ...itemFacundo,
      estado: "PAGADO",
      fecha_pago: "2026-04-19",
    };

    const despues = summarizeCobros(cobros);
    expect(despues.cobrado).toBe(antes.cobrado + montoPagado);
    expect(despues.porCobrar).toBe(antes.porCobrar - montoPagado);
    expect(despues.facturado).toBe(antes.facturado);
    expect(cobros[facundoIdx]?.estado).toBe("PAGADO");
  });

  it("C5: Mismo nivel de dolor (alto/AGUDO) y estado (PENDIENTE) para Martina Gómez en Bandeja, Directorio y Ficha", () => {
    const alertasBandeja = getDemoCriticalAlerts();
    const alertaMartina = alertasBandeja.find(
      (a) => a.id === "demo-alert-martina-rodilla"
    );
    const badgesDirectorio = getDemoAlumnoAlerts("Martina Gómez");

    expect(alertaMartina).toBeDefined();
    expect(alertaMartina?.severidad).toBe("CRITICA");
    expect(alertaMartina?.zona).toBe("Rodilla");
    expect(alertaMartina?.detalle).toContain("[Dolor: AGUDO] Rodilla");
    expect(alertaMartina?.estado).toBe("PENDIENTE");

    expect(badgesDirectorio.length).toBeGreaterThan(0);
    expect(badgesDirectorio[0]?.zona).toBe("Rodilla");
    expect(badgesDirectorio[0]?.detalle).toContain("[Dolor: AGUDO] Rodilla");
  });

  it("C6: Transición de dolor PENDIENTE -> ATENDIDO -> CERRADO se refleja de inmediato en el store compartido", () => {
    const alertId = "demo-alert-martina-rodilla";
    const baseAlerts = getDemoCriticalAlerts();
    const pendientesInicial = applyDemoEstados(baseAlerts, useDemoAlertEstados.getState().estados).filter(
      (a) => (a.estado || "PENDIENTE") === "PENDIENTE" && !a.resolved
    ).length;

    useDemoAlertEstados.getState().setEstado(alertId, "ATENDIDO");
    const trasRevision = applyDemoEstados(baseAlerts, useDemoAlertEstados.getState().estados);
    const martinaRevision = trasRevision.find((a) => a.id === alertId);
    expect(martinaRevision?.estado).toBe("ATENDIDO");
    expect(
      trasRevision.filter((a) => (a.estado || "PENDIENTE") === "PENDIENTE" && !a.resolved).length
    ).toBe(pendientesInicial - 1);

    useDemoAlertEstados.getState().setEstado(alertId, "CERRADO");
    const trasCierre = applyDemoEstados(baseAlerts, useDemoAlertEstados.getState().estados);
    const martinaCerrada = trasCierre.find((a) => a.id === alertId);
    expect(martinaCerrada?.estado).toBe("CERRADO");
    expect(martinaCerrada?.resolved).toBe(true);
  });

  it("C7: Progresión matemática de cargas (1RM Epley, 1RM Brzycki, tonelaje y sobrecarga progresiva)", () => {
    // 100 kg x 5 reps -> Epley: 100 * (1 + 5/30) = 116.666... kg
    expect(calculateEpley1RM(100, 5)).toBeCloseTo(116.67, 2);
    // 105 kg x 5 reps -> Epley: 105 * (1 + 5/30) = 122.5 kg
    expect(calculateEpley1RM(105, 5)).toBeCloseTo(122.5, 2);

    // Brzycki: 100 / (1.0278 - 0.0278 * 5) = 100 / 0.8888 = 112.511... kg
    expect(calculateBrzycki1RM(100, 5)).toBeCloseTo(112.51, 2);
    expect(calculateBrzycki1RM(105, 5)).toBeCloseTo(118.14, 2);

    // Tonelaje semanal: Σ (Series * Reps * Peso)
    expect(
      calculateTotalTonnage([
        { series: 3, reps: 5, peso: 100 },
        { series: 3, reps: 5, peso: 105 },
      ])
    ).toBe(1500 + 1575);

    // Sobrecarga progresiva verificada (100x5 en Semana 1 -> 105x5 en Semana 4, +5% > 2.5%)
    const progresion = calcularProgresion(
      [
        {
          fecha: "2026-03-01T10:00:00Z",
          ejercicioNombre: "Sentadilla Trasera",
          peso_kg: 100,
          reps_hechas: 5,
          completada: true,
        },
        {
          fecha: "2026-03-29T10:00:00Z",
          ejercicioNombre: "Sentadilla Trasera",
          peso_kg: 105,
          reps_hechas: 5,
          completada: true,
        },
      ],
      60,
      ["Sentadilla Trasera"],
      { fechaReferencia: "2026-03-30T10:00:00Z" }
    );

    expect(progresion.verificada).toBe(true);
    expect(progresion.enProgresion).toBe(1);
    expect(progresion.tendencias["Sentadilla Trasera"]).toBe("sube");
    expect(progresion.ejercicios[0]?.gananciaKg).toBe(5);
  });

  it("C8: Alumno sin dolores (Esteban Papic) no registra alertas ni badges espurios", () => {
    const estebanId = "demo-alumno-09-esteban";
    const alertasCriticasEsteban = DEMO_CRITICAL_ALERTS.filter((a) => a.alumnoId === estebanId);
    const badgesEsteban = getDemoAlumnoAlerts("Esteban Papic").filter((b) => b.type === "pain");

    expect(alertasCriticasEsteban).toHaveLength(0);
    expect(badgesEsteban).toHaveLength(0);
  });

  it("C9: Separación de métricas de alumnos (sin montos $) para Rol ENTRENADOR y vista de Métricas", () => {
    expect(puedeVerMontos("ADMIN")).toBe(true);
    expect(puedeVerMontos("ENTRENADOR")).toBe(false);

    const kpisEntrenador = mapearRpcAKpis(
      {
        ingresos: 800_000,
        cobranza_pendiente_monto: 195_000,
        cobranza_vencida_monto: 120_000,
        cobranza_por_vencer_monto: 75_000,
        activos_fin: 32,
        alumnos_al_dia: 32,
        alumnos_morosos: 6,
        cobranza_vencidas_cant: 6,
        sin_entrenar_7d_ids: ["id-1", "id-2", "id-3"],
        altas: 3,
        bajas: 1,
      },
      "mar.",
      "ENTRENADOR"
    );

    // Rol ENTRENADOR oculta todos los montos monetarios
    expect(kpisEntrenador.cobrado).toBeNull();
    expect(kpisEntrenador.porCobrar).toBeNull();
    expect(kpisEntrenador.vencido).toBeNull();
    expect(kpisEntrenador.facturado).toBeNull();
    expect(kpisEntrenador.tasaCobroPct).toBeNull();
    expect(kpisEntrenador.a_cobrar).toBeNull();
    expect(kpisEntrenador.ingresos_mes).toBeNull();

    // Pero conserva las métricas operativas de alumnos intactas
    expect(kpisEntrenador.alumnos_activos).toBe(32);
    expect(kpisEntrenador.alumnos_al_dia).toBe(32);
    expect(kpisEntrenador.alumnos_morosos).toBe(6);
    expect(kpisEntrenador.sin_entrenar_7d_ids).toHaveLength(3);
  });
});
