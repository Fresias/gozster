import * as React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Mocks de Next.js
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/studio/cobros",
}));

import { IslaSaludAnamnesis } from "@/components/coach/student-detail/islas/isla-salud-anamnesis";
import { IslaMetricas1RM } from "@/components/coach/student-detail/islas/isla-metricas-1rm";
import { CobrosPanel } from "@/components/coach/cobros-panel";
import { ClassAgenda } from "@/components/coach/class-agenda";
import { calcularRangoHorarioUtil } from "@/lib/clases";
import { estimar1RM } from "@/lib/progresion";
import { derivarSeveridadDesdeEva, nivelDesdeEva } from "@/lib/dolor";
import { useCobrosStore } from "@/store/use-cobros-store";
import { useClasesStore } from "@/store/use-clases-store";
import { calculateEpley1RM, calculateBrzycki1RM, calculateTotalTonnage } from "../../tests/strength-metrics.spec";

/**
 * GOZS-391: QA Suite de Auditoría del Stage 4
 * Ficha de Alumno (UX-F), Cobros con DataTable y Modal (UX-C), Agenda Dinámica y Cancelación (UX-A)
 * Referencias: 02-vistas.md §4, §5, §6 y 05-qa.md §3
 */

describe("GOZS-391: Auditoría QA Stage 4 - Ficha de Alumno, Cobros y Agenda", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useCobrosStore.getState().resetDemoDataset();
    useClasesStore.getState().resetDemoDataset(new Date("2026-11-05T12:00:00-03:00"));
  });

  // =========================================================================
  // SECCIÓN 1: Verificación Matemática Estricta de Fuerza y Tonelaje
  // =========================================================================
  describe("1. Verificación Matemática Estricta de Fórmulas de Fuerza (Epley, Brzycki, Tonelaje)", () => {
    it("Epley: 1RM = Peso * (1 + Reps / 30) - precisión y concordancia con estimar1RM", () => {
      // Caso 1: 100 kg x 5 reps -> 100 * (1 + 5/30) = 116.6666...
      const epley100_5 = calculateEpley1RM(100, 5);
      expect(epley100_5).toBeCloseTo(116.6667, 4);
      expect(estimar1RM(100, 5, "epley")).toBeCloseTo(epley100_5, 1);

      // Caso 2: 140 kg x 8 reps -> 140 * (1 + 8/30) = 177.3333...
      const epley140_8 = calculateEpley1RM(140, 8);
      expect(epley140_8).toBeCloseTo(177.3333, 4);
      expect(estimar1RM(140, 8, "epley")).toBeCloseTo(epley140_8, 1);

      // Caso 3: 1 repetición máxima real -> 100 kg x 1 rep = 103.33 kg estimado
      expect(calculateEpley1RM(100, 1)).toBeCloseTo(103.3333, 4);
    });

    it("Brzycki: 1RM = Peso / (1.0278 - 0.0278 * Reps) - precisión y casos límite", () => {
      // Caso 1: 100 kg x 1 rep -> 100 / (1.0278 - 0.0278) = 100 kg exactos
      expect(calculateBrzycki1RM(100, 1)).toBeCloseTo(100, 4);

      // Caso 2: 120 kg x 6 reps -> 120 / (1.0278 - 0.1668) = 120 / 0.861 = 139.3728...
      expect(calculateBrzycki1RM(120, 6)).toBeCloseTo(139.3728, 3);
      expect(estimar1RM(120, 6, "brzycki")).toBeCloseTo(139.4, 1);

      // Denominador no positivo (reps >= 37) o inválido retorna 0
      expect(calculateBrzycki1RM(100, 37)).toBe(0);
      expect(calculateBrzycki1RM(100, 40)).toBe(0);
    });

    it("Tonelaje semanal: Σ (Series * Reps * Peso) calcula el volumen total acumulado", () => {
      const bloques = [
        { series: 4, reps: 6, peso: 100 }, // 4 * 6 * 100 = 2400 kg
        { series: 3, reps: 8, peso: 80 },  // 3 * 8 * 80 = 1920 kg
        { series: 3, reps: 10, peso: 60 }, // 3 * 10 * 60 = 1800 kg
      ];
      const tonelaje = calculateTotalTonnage(bloques);
      expect(tonelaje).toBe(2400 + 1920 + 1800); // 6120 kg
    });

    it("Casos límite en fórmulas: reps 0, peso 0, cargas negativas y valores NaN devuelven 0", () => {
      expect(calculateEpley1RM(0, 10)).toBe(0);
      expect(calculateEpley1RM(100, 0)).toBe(0);
      expect(calculateEpley1RM(-100, 5)).toBe(0);
      expect(calculateEpley1RM(100, -5)).toBe(0);
      expect(calculateEpley1RM(NaN, 5)).toBe(0);

      expect(calculateBrzycki1RM(0, 10)).toBe(0);
      expect(calculateBrzycki1RM(100, 0)).toBe(0);
      expect(calculateBrzycki1RM(-100, 5)).toBe(0);
      expect(calculateBrzycki1RM(100, -5)).toBe(0);
      expect(calculateBrzycki1RM(NaN, 5)).toBe(0);

      expect(calculateTotalTonnage([{ series: -1, reps: 10, peso: 100 }])).toBe(0);
      expect(calculateTotalTonnage([{ series: 3, reps: 0, peso: 100 }])).toBe(0);
      expect(calculateTotalTonnage([])).toBe(0);
    });
  });

  // =========================================================================
  // SECCIÓN 2: Ficha de Alumno - Isla de Salud y Detalle (UX-F)
  // =========================================================================
  describe("2. Ficha de Alumno: Isla de Salud y Telemetría de Fuerza (UX-F)", () => {
    it("GIVEN un reporte de molestia con EVA = 8 THEN el Alert de salud exhibe severidad Agudo con estilo destructivo y estado Pendiente", () => {
      const html = renderToStaticMarkup(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          evaDolorActual={8}
          zonaDolorActual="Rodilla derecha"
          ejercicioNombre="Sentadilla trasera, serie 3"
          fechaReporte="hoy 10:15"
          alumnoId="alumno-martina"
        />
      );

      // Alert semántico de dolor activo
      expect(html).toContain('data-testid="alert-salud"');
      expect(html).toContain("Agudo");
      expect(html).toContain("Rodilla derecha");
      expect(html).toContain("EVA 8");
      expect(html).toContain("Pendiente");
      expect(html).toContain("border-destructive");

      // Control Segmented con las 3 opciones de intervención
      expect(html).toContain('role="tablist"');
      expect(html).toContain("Pendiente");
      expect(html).toContain("Atendida");
      expect(html).toContain("Resuelta");
    });

    it("GIVEN un alumno sin molestias activas THEN exhibe alert-salud-empty con texto 'Sin dolores activos'", () => {
      const html = renderToStaticMarkup(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          evaDolorActual={0}
          zonaDolorActual="Ninguna"
          dolorActivo={null}
          alumnoId="alumno-esteban"
        />
      );

      expect(html).toContain('data-testid="alert-salud-empty"');
      expect(html).toContain("Sin dolores activos.");
      expect(html).not.toContain('data-testid="alert-salud"');
    });

    it("GIVEN la bitácora de intervención THEN incluye textarea accesible para notas y botón de guardado", () => {
      const html = renderToStaticMarkup(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          evaDolorActual={5}
          zonaDolorActual="Hombro"
          alumnoId="alumno-test"
        />
      );

      expect(html).toContain('aria-label="Nota de intervención"');
      expect(html).toContain("Se guarda al salir del campo.");
      expect(html).toContain("Guardar Registro en la Ficha");
      expect(html).toContain('data-testid="anamnesis-summary-collapsible"');
    });

    it("GIVEN la Isla de Métricas 1RM THEN renderiza 1RM Epley, 1RM Brzycki y tooltips explicativos", () => {
      const historial = [
        {
          sesion: { id: "s1", fecha: "2026-10-01" },
          series: [{ id: "ser1", ejercicioNombre: "Press de Banca", peso_kg: 100, reps_hechas: 5 }],
        },
      ];

      const html = renderToStaticMarkup(
        <IslaMetricas1RM
          historialCargas={historial as any}
          pesoCorporalActual={82}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
        />
      );

      expect(html).toContain('data-testid="isla-metricas-1rm"');
      expect(html).toContain('data-testid="metricas-1rm-epley"');
      expect(html).toContain('data-testid="metricas-1rm-brzycki"');
      expect(html).toContain('data-testid="help-icon-epley"');
      expect(html).toContain('data-testid="help-icon-brzycki"');
    });
  });

  // =========================================================================
  // SECCIÓN 3: Cobros - DataTable 15 Filas y Modal de Pago (UX-C)
  // =========================================================================
  describe("3. Cobros: DataTable 15 Filas, KPIs y Diálogo de Registro de Pago (UX-C)", () => {
    it("GIVEN el listado de contratos WHEN se renderiza CobrosPanel THEN muestra 15 filas por página con contratos vencidos en primer orden", () => {
      const store = useCobrosStore.getState();
      expect(store.cobros.length).toBeGreaterThanOrEqual(15);

      const html = renderToStaticMarkup(<CobrosPanel />);

      // Tabla DataTable presente
      expect(html).toContain('data-testid="cobros-table"');

      // Exactamente 15 filas en la primera página
      const rows = html.match(/data-testid="cobro-row"/g);
      expect(rows).not.toBeNull();
      expect(rows?.length).toBe(15);

      // Leyenda de paginación
      expect(html).toContain("Mostrando 15 de");

      // Botón para registrar pago en contratos pendientes/vencidos
      expect(html).toContain('data-testid="registrar-pago-btn"');
    });

    it("GIVEN los 4 KPIs de negocio WHEN se accede a CobrosPanel THEN muestra Ingresos, Cobranza Pendiente, Vencido y Tasa de Cobranza", () => {
      const html = renderToStaticMarkup(<CobrosPanel />);
      expect(html).toContain('data-testid="cobros-kpis"');
      expect(html).toContain('data-testid="kpi-ingresos-mes"');
      expect(html).toContain('data-testid="kpi-cobranza-pendiente"');
      expect(html).toContain('data-testid="kpi-vencido"');
      expect(html).toContain('data-testid="kpi-tasa-cobranza"');
    });

    it("GIVEN el diálogo de registrar pago WHEN se confirma un pago THEN actualiza optimistamente el contrato y recalcula montos", async () => {
      const store = useCobrosStore.getState();
      const contratoPendiente = store.cobros.find((c) => c.estado === "PENDIENTE" || c.estado === "VENCIDO");
      expect(contratoPendiente).toBeDefined();

      const cobradoAntes = store.metricas().ingresosMes;
      const montoAbonado = 30000;

      const comprobante = await store.registrarPago({
        contratacionId: contratoPendiente!.contratacionId,
        monto: montoAbonado,
        medioPago: "TRANSFERENCIA",
        notas: "Pago auditado QA",
      });

      expect(comprobante).toBeDefined();
      expect(comprobante.alumnoNombre).toBe(contratoPendiente!.alumnoNombre);
      expect(comprobante.medioPago).toBe("TRANSFERENCIA");

      // El contrato cambió de estado a PAGADO
      const updatedStore = useCobrosStore.getState();
      const contratoActualizado = updatedStore.cobros.find((c) => c.contratacionId === contratoPendiente!.contratacionId);
      expect(contratoActualizado?.estado).toBe("PAGADO");

      // El monto cobrado total se incrementó exactamente en el monto pagado
      expect(updatedStore.metricas().ingresosMes).toBe(cobradoAntes + montoAbonado);
    });
  });

  // =========================================================================
  // SECCIÓN 4: Agenda - Grilla Horaria Dinámica y Cancelación de Clase (UX-A)
  // =========================================================================
  describe("4. Agenda: Grilla Adaptativa y Diálogo Modal de Cancelación (UX-A)", () => {
    it("calcularRangoHorarioUtil acota la grilla al horario útil (17:00 - 21:00) y oculta franjas vacías", () => {
      const clasesDemo = [
        { inicio: "2026-11-05T17:00:00-03:00", duracion_minutos: 60 },
        { inicio: "2026-11-05T18:00:00-03:00", duracion_minutos: 60 },
        { inicio: "2026-11-05T19:30:00-03:00", duracion_minutos: 60 },
      ];

      const rango = calcularRangoHorarioUtil(clasesDemo);
      expect(rango.tieneClases).toBe(true);
      expect(rango.horaMin).toBe(17);
      expect(rango.horaMax).toBe(21);
      expect(rango.textoLeyenda).toContain("17:00 - 21:00");
    });

    it("GIVEN ClassAgenda WHEN se renderiza THEN contiene grilla de clases, selector de semana y modales de clase", () => {
      const html = renderToStaticMarkup(<ClassAgenda />);

      // Agenda presente
      expect(html).toContain('data-testid="class-agenda"');
      expect(html).toContain('data-testid="view-week-btn"');
      expect(html).toContain('data-testid="view-day-btn"');

      // Tarjetas de clase presentes
      expect(html).toContain('data-testid="class-block-card"');

      // Diálogos modales
      expect(html).toContain('data-testid="enroll-student-dialog"');
      expect(html).toContain('data-testid="cancel-class-reason"');
      expect(html).toContain('data-testid="confirm-cancel-class-btn"');
    });

    it("GIVEN una clase con alumnos anotados WHEN el coach la cancela THEN pasa a estado CANCELADA en el store", async () => {
      const store = useClasesStore.getState();
      // Buscar una clase que tenga alumnos inscriptos
      const claseConInscriptos = store.clases.find(
        (c) => c.estado === "PROGRAMADA" && store.agendaReservas.some((r) => r.clase_id === c.id)
      );
      expect(claseConInscriptos).toBeDefined();

      const resultado = await useClasesStore.getState().cancelarClase(claseConInscriptos!.id, "Feriado no laborable declarado");
      expect(resultado).toBe(true);

      const updatedStore = useClasesStore.getState();
      const claseCancelada = updatedStore.clases.find((c) => c.id === claseConInscriptos!.id);
      expect(claseCancelada?.estado).toBe("CANCELADA");
      expect(claseCancelada?.motivo_cancelacion).toBe("Feriado no laborable declarado");
    });
  });
});
