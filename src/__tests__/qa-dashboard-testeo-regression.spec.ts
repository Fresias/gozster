import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DEMO_GIMNASIO, DEMO_KPIS_NEGOCIO, DEMO_ALUMNOS } from "@/services/coach-demo-dataset";
import { DIAS_ALUMNO_NUEVO, esAlumnoNuevo } from "@/lib/alumno-nuevo";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";
import { getDemoCriticalAlerts } from "@/components/coach/critical-alerts-data";
import { REAL_ALUMNOS } from "@/services/real-mynter-data";

/**
 * QA Regresión Formal - Issue GOZS-152:
 * Revisión funcional y visual de:
 * 1. Dashboard en Modo Testeo (#133, #142, #141, #134-#140, #144, #145)
 * 2. Dataset demo de ~40 alumnos con un mes de historia y KPIs derivados (#147 / GOZS-139)
 * 3. Elección de vista SIMPLE / TÉCNICA del alumno vs recomendación del coach (#131 / GOZS-111)
 */

describe("GOZS-152 QA Regresión: Dashboard Modo Testeo, Dataset Demo y Vista SIMPLE/TÉCNICA", () => {
  const coachStudioViewPath = path.resolve(__dirname, "../components/coach/coach-studio-view.tsx");
  const criticalInboxPath = path.resolve(__dirname, "../components/coach/critical-alerts-inbox.tsx");
  const studentDetailPath = path.resolve(__dirname, "../components/coach/student-detail.tsx");
  const studentPainAlertsPath = path.resolve(__dirname, "../components/coach/student-pain-alerts.tsx");
  const businessKpiStripPath = path.resolve(__dirname, "../components/coach/business-kpi-strip.tsx");

  const coachStudioView = fs.readFileSync(coachStudioViewPath, "utf-8");
  const criticalInbox = fs.readFileSync(criticalInboxPath, "utf-8");
  const studentDetail = fs.readFileSync(studentDetailPath, "utf-8");
  const studentPainAlerts = fs.readFileSync(studentPainAlertsPath, "utf-8");
  const businessKpiStrip = fs.readFileSync(businessKpiStripPath, "utf-8");

  beforeEach(() => {
    vi.restoreAllMocks();
    useWorkspaceModeStore.setState({ mode: "TESTEO" });
    useAthleteStore.getState().resetSessionToDefaults();
    useAthleteStore.setState({
      vistaElegidaPorAlumno: null,
      vistaRecomendadaCoach: "SIMPLE",
      nivelVistaAlumno: "SIMPLE",
    });
  });

  describe("Criterio 1: Dashboard en Modo Testeo (Bandeja, Tabla, Densidad, Filtros y Apertura de Ficha)", () => {
    it("GIVEN dashboard en Modo Testeo WHEN se abre THEN bandeja y tabla aparecen colapsadas", () => {
      // Bandeja de alertas colapsada por defecto en Testeo
      expect(criticalInbox).toContain('const [isExpanded, setIsExpanded] = React.useState(mode !== "TESTEO");');
      expect(criticalInbox).toMatch(/\{isExpanded && isTesteo && \(/);

      // Tabla de alumnos colapsada por defecto en Testeo
      expect(coachStudioView).toContain("const [isAlumnosExpanded, setIsAlumnosExpanded] = React.useState(false);");
      expect(coachStudioView).toContain("const showAlumnosBody = !isTestMode || isAlumnosExpanded;");
      expect(coachStudioView).toContain("{showAlumnosBody && (<>");
    });

    it("GIVEN dashboard en Modo Testeo WHEN se renderiza THEN no muestra email ni mención a INDEC ni vista Tarjetas", () => {
      // Sin email en filas en Testeo
      expect(coachStudioView).toMatch(/\{!isTestMode && \(\s*<span[^>]*>\s*\{alumno\.email \?\? "—"\}/);

      // Sin INDEC en Testeo
      expect(coachStudioView).not.toContain("Demostración Conceptual INDEC");
      expect(coachStudioView).not.toContain("Dataset Demo INDEC");
      expect(coachStudioView).toContain("MODO TESTEO ACTIVO</span>");
      expect(coachStudioView).toContain("Modo Testeo (Dataset demo)");

      // Selector de modo de tarjetas oculto en Testeo
      expect(coachStudioView).toContain("{!isTestMode && (");
      expect(coachStudioView).toContain("Selector de Modo de Visualización (INDEC vs Tarjetas); oculto en Modo Testeo");

      // Filtro Sin Plan oculto en Testeo
      expect(coachStudioView).toContain("{!isTestMode && (");
      expect(coachStudioView).toContain('setPaymentFilter("SIN_PLAN");');
    });

    it("GIVEN la tabla de alumnos en Modo Testeo THEN la densidad de filas es exactamente h-12 (48px)", () => {
      expect(coachStudioView).toContain('const isCompact = !isTestMode && tableDensity === "compact";');
      expect(coachStudioView).toContain('"min-h-[48px] py-2.5"');
    });

    it("GIVEN el filtro Nuevos en Modo Testeo WHEN se activa THEN filtra por ventana de 90 días", () => {
      expect(DIAS_ALUMNO_NUEVO).toBe(90);

      const ahora = Date.now();
      const DIA = 86_400_000;
      expect(esAlumnoNuevo(new Date(ahora - 10 * DIA).toISOString(), ahora)).toBe(true);
      expect(esAlumnoNuevo(new Date(ahora - 95 * DIA).toISOString(), ahora)).toBe(false);

      // Verificamos que el demo tenga atletas nuevos y atletas antiguos
      const nuevos = DEMO_ALUMNOS.filter((a) => esAlumnoNuevo(a.created_at));
      expect(nuevos.length).toBeGreaterThan(0);
      expect(nuevos.length).toBeLessThan(DEMO_ALUMNOS.length);
    });

    it("GIVEN alerta en la bandeja WHEN se hace click THEN ejecuta onSelectAlumno con el alumnoId y la ficha incluye Alertas de dolor", () => {
      // Fila de alerta tiene onClick con onSelectAlumno
      expect(criticalInbox).toContain("onClick={() => onSelectAlumno?.(alert.alumnoId)}");

      // Coach studio view pasa selectAlumno a CriticalAlertsInbox
      expect(coachStudioView).toContain("onSelectAlumno={(id) => selectAlumno(id)}");

      // StudentDetail integra StudentPainAlerts con alumnoId
      expect(studentDetail).toContain("<StudentPainAlerts alumnoId={alumno.id} onQuickSwap={onQuickSwap} />");

      // StudentPainAlerts filtra alertas por alumnoId
      expect(studentPainAlerts).toContain("getDemoCriticalAlerts().filter((a) => a.alumnoId === alumnoId)");
    });
  });

  describe("Criterio 2: Dataset Demo cargado y KPIs coherentes", () => {
    it("GIVEN el dataset demo cargado WHEN se analizan los atletas THEN son ~40 alumnos con histórico", () => {
      expect(DEMO_GIMNASIO.alumnos.length).toBe(40);
      expect(DEMO_GIMNASIO.pagos.length).toBeGreaterThan(0);
      expect(Object.keys(DEMO_GIMNASIO.historial).length).toBeGreaterThan(0);
    });

    it("GIVEN el dataset demo WHEN se inspeccionan los 4 KPIs THEN son coherentes con las reglas de negocio", () => {
      const kpis = DEMO_KPIS_NEGOCIO;
      const alumnos = DEMO_GIMNASIO.alumnos;

      // Alumnos activos
      const activosReales = alumnos.filter((a) => a.estado_membresia === "ACTIVA").length;
      expect(kpis.alumnos_activos).toBe(activosReales);

      // Alumnos sin entrenar +7 días
      expect(kpis.sin_entrenar_7d_ids.length).toBeGreaterThan(0);
      for (const id of kpis.sin_entrenar_7d_ids) {
        const alumno = alumnos.find((a) => a.id === id);
        expect(alumno).toBeDefined();
        expect(alumno?.estado_membresia).toBe("ACTIVA");
      }

      // Cobranza % cálculo verificado: round(ingresos_mes / (ingresos_mes + cobranza_faltante) * 100)
      const esperadoPct = Math.round((kpis.ingresos_mes / (kpis.ingresos_mes + kpis.cobranza_faltante)) * 100);
      expect(kpis.cobranza_pct).toBe(esperadoPct);

      // Franja de KPIs configurada en CoachStudioView para Testeo
      expect(coachStudioView).toContain("const showKpiStrip = isTestMode;");
      expect(coachStudioView).toContain("<BusinessKpiStrip");
    });
  });

  describe("Criterio 3: Elección de vista SIMPLE / TÉCNICA (Prevalencia del Alumno y Estabilidad en Producción)", () => {
    it("GIVEN coach que recomienda SIMPLE y alumno que elige TÉCNICA THEN prevalece la elección del alumno", () => {
      const athleteStore = useAthleteStore.getState();

      // Coach recomienda SIMPLE
      useAthleteStore.setState({ vistaRecomendadaCoach: "SIMPLE" });

      // Alumno elige TECNICA
      athleteStore.setNivelVistaAlumno("TECNICA");

      const estado = useAthleteStore.getState();
      expect(estado.vistaElegidaPorAlumno).toBe("TECNICA");
      expect(estado.nivelVistaAlumno).toBe("TECNICA");
      expect(estado.vistaRecomendadaCoach).toBe("SIMPLE");

      // La vista efectiva del alumno es TECNICA aunque el coach recomiende SIMPLE
      const vistaEfectiva = estado.vistaElegidaPorAlumno ?? estado.vistaRecomendadaCoach;
      expect(vistaEfectiva).toBe("TECNICA");
    });

    it("GIVEN coach que recomienda TECNICA y alumno que elige SIMPLE THEN prevalece SIMPLE", () => {
      const athleteStore = useAthleteStore.getState();

      useAthleteStore.setState({ vistaRecomendadaCoach: "TECNICA" });
      athleteStore.setNivelVistaAlumno("SIMPLE");

      const estado = useAthleteStore.getState();
      expect(estado.vistaElegidaPorAlumno).toBe("SIMPLE");
      expect(estado.nivelVistaAlumno).toBe("SIMPLE");
      expect(estado.vistaRecomendadaCoach).toBe("TECNICA");

      const vistaEfectiva = estado.vistaElegidaPorAlumno ?? estado.vistaRecomendadaCoach;
      expect(vistaEfectiva).toBe("SIMPLE");
    });

    it("GIVEN alumno con vista propia THEN al tocar 'Usar la recomendada' resetea su elección a null y adopta la del coach", () => {
      useAthleteStore.setState({
        vistaRecomendadaCoach: "SIMPLE",
        vistaElegidaPorAlumno: "TECNICA",
        nivelVistaAlumno: "TECNICA",
      });

      useAthleteStore.getState().usarVistaRecomendada();

      const estado = useAthleteStore.getState();
      expect(estado.vistaElegidaPorAlumno).toBeNull();
      expect(estado.nivelVistaAlumno).toBe("SIMPLE");
      expect(estado.vistaRecomendadaCoach).toBe("SIMPLE");
    });

    it("GIVEN entorno Producción THEN mantiene contratos y no rompe flujos", () => {
      useWorkspaceModeStore.setState({ mode: "PRODUCCION" });
      expect(useWorkspaceModeStore.getState().mode).toBe("PRODUCCION");

      // En Producción la franja de retención original está disponible
      expect(coachStudioView).toMatch(/\{showKpiStrip \? \(\s*<BusinessKpiStrip[\s\S]*?\) : \(\s*<RetentionKpiCards/);
      expect(businessKpiStrip).toContain("const isTestMode = propIsTestMode ?? storeMode === \"TESTEO\";");
    });
  });
});
