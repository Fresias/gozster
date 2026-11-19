import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { ejercicioBloqueado } from "@/lib/athlete/molestias";

const readSource = (relPath: string) =>
  fs.readFileSync(path.resolve(__dirname, relPath), "utf-8");

describe("Stage 2: Frontend & Mobile UI - Molestias, Red Flags y Sustituciones Trazables (Issue #67 / GOZS-42)", () => {
  beforeEach(() => {
    // Reset stores
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
    });

    useAthleteStore.getState().resetSessionToDefaults();
    useAthleteStore.getState().setStopProtocolActive(false);

    useCoachStudioStore.setState({
      selectedAlumnoId: null,
      sustituciones: [],
      toast: null,
    });

    vi.restoreAllMocks();
  });

  describe("1. Athlete App: Botón 'Tengo una molestia' y Ergonomía Táctil", () => {
    const rutinaContent = readSource("../components/athlete/rutina-del-dia.tsx");
    const ejercicioContent = readSource("../components/athlete/ejercicio-activo.tsx");
    const painModalContent = readSource("../components/athlete/pain-report-modal.tsx");

    it("incluye el botón 'Tengo una molestia' visible en RutinaDelDia con objetivo táctil >= 44px", () => {
      expect(rutinaContent).toContain('data-testid="header-pain-report-btn"');
      expect(rutinaContent).toContain("Tengo una molestia");
      expect(rutinaContent).toContain("a-molbtn");
    });

    it("incluye el botón 'Tengo una molestia' en EjercicioActivo", () => {
      expect(ejercicioContent).toContain("data-testid={`exercise-pain-report-btn-${ej.id}`}");
      expect(ejercicioContent).toContain("Tengo una molestia");
    });

    it("dispone de modal de reporte con 8 zonas anatómicas normalizadas", () => {
      const zonasEsperadas = [
        "HOMBRO",
        "RODILLA",
        "LUMBAR",
        "CODO",
        "CUELLO",
        "CADERA",
        "TOBILLO",
        "OTRO",
      ];
      for (const zona of zonasEsperadas) {
        expect(painModalContent).toContain(`id: "${zona}"`);
        expect(painModalContent).toContain(
          `data-testid={\`zona-btn-\${zone.id.toLowerCase()}\`}`,
        );
      }
    });

    it("incluye selector de intensidad del 1 al 10 con rangos LEVE, MODERADO y AGUDO", () => {
      expect(painModalContent).toContain('id="pain-intensity-range"');
      expect(painModalContent).toContain('data-testid="pain-severity-badge"');
      expect(painModalContent).toContain('data-testid={`intensity-chip-${val}`}');
      expect(painModalContent).toContain('severidad === "LEVE"');
      expect(painModalContent).toContain('severidad === "MODERADO"');
      expect(painModalContent).toContain('"AGUDO"');
    });

    it("incluye selector del momento de aparición (CALENTAMIENTO, EN_SERIE, POST_EJERCICIO)", () => {
      expect(painModalContent).toContain('id: "CALENTAMIENTO"');
      expect(painModalContent).toContain('id: "EN_SERIE"');
      expect(painModalContent).toContain('id: "POST_EJERCICIO"');
      expect(painModalContent).toContain(
        'data-testid={`momento-btn-${momento.id.toLowerCase()}`}',
      );
    });

    it("contiene los 4 checkboxes explícitos de Síntomas de Alarma (Red Flags)", () => {
      const redFlags = [
        "Dolor punzante/súbito",
        "Irradiación/adormecimiento",
        "Mareo/falta de aire",
        "Inestabilidad articular",
      ];
      for (const rf of redFlags) {
        expect(painModalContent).toContain(`id: "${rf}"`);
        expect(painModalContent).toContain(
          'data-testid={`red-flag-checkbox-${rf.id}`}',
        );
      }
      expect(painModalContent).toContain("Síntomas de Alarma (Red Flags)");
    });

    it("permite ingresar un comentario libre opcional para contexto adicional", () => {
      expect(painModalContent).toContain('data-testid="pain-notes-input"');
      expect(painModalContent).toContain("Comentario opcional para el Coach:");
    });
  });

  describe("2. Regla Ponytail & ADR-002: Alumno SIN visualización de alternativas y Protocolo de Freno", () => {
    const painModalContent = readSource("../components/athlete/pain-report-modal.tsx");
    const ejercicioContent = readSource("../components/athlete/ejercicio-activo.tsx");

    it("el modal del alumno NO contiene selectores ni dropdowns de ejercicios alternativos", () => {
      // Prohibido que el atleta elija o vea alternativas automáticas
      expect(painModalContent).not.toContain("ejercicios_alternativas");
      expect(painModalContent).not.toContain("selector-alternativas");
      expect(painModalContent).not.toContain("cambiar-por");
      expect(painModalContent).not.toContain("elegir-sustituto");
      expect(painModalContent).not.toContain("quick_swap_ejercicio");
    });

    it("muestra advertencia médica obligatoria al detectar síntomas de alarma o dolor agudo", () => {
      expect(painModalContent).toContain('data-testid="protocolo-freno-alert"');
      expect(painModalContent).toContain(
        "Te recomendamos frenar el entrenamiento por hoy y avisar inmediatamente al personal del gimnasio o a tu entrenador.",
      );
      expect(painModalContent).toContain(
        "PROTOCOLO DE FRENO POR SEGURIDAD MÉDICA",
      );
    });

    it("muestra banner persistente de freno en ejercicio-activo si el protocolo de freno está activo", () => {
      expect(ejercicioContent).toContain(
        'data-testid="live-workout-stop-protocol-banner"',
      );
      expect(ejercicioContent).toContain(
        "PROTOCOLO DE FRENO POR SÍNTOMA DE ALARMA ACTIVADO",
      );
      expect(ejercicioContent).toContain(
        "Te recomendamos frenar el entrenamiento por hoy y avisar inmediatamente al personal del gimnasio o a tu entrenador.",
      );
    });
  });

  describe("3. useAthleteStore: Gestión de dolor, Outbox propia y Red Flags", () => {
    it("activa protocolo de freno si hay red flags marcadas", async () => {
      const store = useAthleteStore.getState();
      expect(store.stopProtocolActive).toBe(false);

      await store.reportarMolestia({
        ejercicioEnRutinaId: "ej-sentadilla-1",
        ejercicioId: "ej-sentadilla-con-barra",
        numeroSerie: 2,
        zona: "RODILLA",
        eva: 5,
        momento: "EN_SERIE",
        sintomas: ["Dolor punzante/súbito"],
        notas: "Sentí un pinchazo agudo al bajar",
      });

      expect(useAthleteStore.getState().stopProtocolActive).toBe(true);
    });

    it("EVA 8 bloquea el ejercicio y EVA 10 activa protocolo de freno aunque no marque red flags", async () => {
      const store = useAthleteStore.getState();
      expect(store.stopProtocolActive).toBe(false);

      const alta = await store.reportarMolestia({
        ejercicioEnRutinaId: "ej-press-1",
        ejercicioId: "ej-press-banca",
        numeroSerie: 3,
        zona: "HOMBRO",
        eva: 8,
        momento: "EN_SERIE",
        sintomas: [],
        notas: "Dolor muy intenso en cara anterior",
      });

      expect(alta.nivel).toBe("alta");
      expect(
        ejercicioBloqueado("ej-press-1", useAthleteStore.getState().currentSession.molestias ?? []),
      ).toBe(true);

      await store.reportarMolestia({
        ejercicioEnRutinaId: "ej-press-1",
        ejercicioId: "ej-press-banca",
        numeroSerie: 3,
        zona: "HOMBRO",
        eva: 10,
        momento: "EN_SERIE",
        sintomas: [],
        notas: "Dolor insoportable",
      });

      expect(useAthleteStore.getState().stopProtocolActive).toBe(true);
    });

    it("soporta modo avión guardando la molestia como pendiente en currentSession.molestias sin perderla ni usar la cola de series", async () => {
      const offlineQueue = useOfflineQueueStore.getState();
      offlineQueue.setOnlineStatus(false);
      expect(useOfflineQueueStore.getState().isOnline).toBe(false);

      const store = useAthleteStore.getState();
      const creada = await store.reportarMolestia({
        ejercicioEnRutinaId: "ej-peso-muerto-1",
        ejercicioId: "ej-peso-muerto-convencional",
        numeroSerie: 1,
        zona: "LUMBAR",
        eva: 8,
        momento: "EN_SERIE",
        sintomas: ["Inestabilidad articular"],
        notas: "Tirón lumbar en despegue",
      });

      expect(creada.envio).toBe("pendiente");
      expect(creada.zona).toBe("LUMBAR");
      expect(creada.nivel).toBe("alarma");

      const molestias = useAthleteStore.getState().currentSession.molestias ?? [];
      expect(molestias).toHaveLength(1);
      expect(molestias[0]?.envio).toBe("pendiente");

      // El protocolo de freno se activa localmente de inmediato (Offline-First)
      expect(useAthleteStore.getState().stopProtocolActive).toBe(true);
    });
  });

  describe("4. Coach Studio: CriticalAlertsInbox y Ciclo de Vida de Alertas", () => {
    const alertsInboxContent = readSource("../components/coach/critical-alerts-inbox.tsx");

    it("soporta los 3 estados del ciclo de vida (PENDIENTE, ATENDIDO, CERRADO)", () => {
      expect(alertsInboxContent).toContain('"PENDIENTE"');
      expect(alertsInboxContent).toContain('"ATENDIDO"');
      expect(alertsInboxContent).toContain('"CERRADO"');
    });

    it("la bandeja lista solo alertas pendientes sin pestañas de filtrado", () => {
      expect(alertsInboxContent).not.toContain("filter-tab-pendientes");
      expect(alertsInboxContent).toContain('return estado === "PENDIENTE" && a.type === "DOLOR";');
    });

    const painSection = readSource("../components/coach/student-pain-alerts.tsx");

    it("la ficha del alumno muestra Síntomas de Alarma en las alertas con red flag", () => {
      expect(painSection).toContain("Síntomas de Alarma");
    });

    it("la ficha ofrece botón para abrir Quick Swap directamente desde la alerta", () => {
      expect(painSection).toContain("data-testid={`student-quick-swap-btn-${alert.id}`}");
      expect(painSection).toContain("Sustituir Ejercicio");
    });

    it("la ficha ofrece botones para cambiar el estado a Atendido o Cerrado", () => {
      expect(painSection).toContain("data-testid={`student-status-btn-${e.value.toLowerCase()}-${alert.id}`}");
      expect(painSection).toContain("Atendido");
      expect(painSection).toContain("Cerrado");
    });
  });

  describe("5. Coach Studio: QuickSwapModal, Alternativas Biomecánicas y Seguridad Médica", () => {
    const quickSwapModalContent = readSource("../components/coach/quick-swap-modal.tsx");

    it("muestra el aviso obligatorio y explícito de seguridad médica", () => {
      expect(quickSwapModalContent).toContain('data-testid="biomechanical-safety-notice"');
      expect(quickSwapModalContent).toContain(
        "La similitud biomecánica no garantiza seguridad automática ante una lesión.",
      );
    });

    it("clasifica las alternativas por patrón de movimiento, equipamiento y nivel de exigencia", () => {
      expect(quickSwapModalContent).toContain("patron_movimiento");
      expect(quickSwapModalContent).toContain("equipamiento");
      expect(quickSwapModalContent).toContain("nivel_exigencia");
      expect(quickSwapModalContent).toContain("restricciones_articulares");
      expect(quickSwapModalContent).toContain("explicacion_tecnica");
      expect(quickSwapModalContent).toContain('data-testid="alternatives-catalog-list"');
      expect(quickSwapModalContent).toContain('data-testid={`alternative-card-');
    });

    it("permite ingresar motivo con chips predefinidos rápidos", () => {
      expect(quickSwapModalContent).toContain('data-testid="swap-motive-input"');
      expect(quickSwapModalContent).toContain("Molestia articular informada por atleta");
    });

    it("permite confirmar la sustitución en 1 toque por el Coach", () => {
      expect(quickSwapModalContent).toContain('data-testid={`confirm-swap-btn-');
      expect(quickSwapModalContent).toContain("Sustituir en 1-Toque");
    });
  });

  describe("6. useCoachStudioStore: Registro Trazable de Sustitución e Inmutabilidad (ADR-002)", () => {
    it("reemplaza el ejercicio en la rutina activa y registra la traza inmutable en el store", async () => {
      const coachStore = useCoachStudioStore.getState();

      const initialSustituciones = coachStore.sustituciones.length;

      const nuevaSust = await coachStore.registrarSustitucion({
        planId: "demo-plan-1",
        ejercicioOriginalId: "30000000-0000-0000-0000-000000000001",
        ejercicioSustitutoId: "30000000-0000-0000-0000-000000000002",
        originalNombre: "Press de Banca Plano",
        nuevoNombre: "Press con Mancuernas en Suelo (Floor Press)",
        motivo: "Molestia en cara anterior de hombro derecho",
        responsableId: "prof-demo-1",
      });

      expect(nuevaSust).toBeDefined();
      expect(nuevaSust.ejercicio_original_id).toBe("30000000-0000-0000-0000-000000000001");
      expect(nuevaSust.ejercicio_sustituto_id).toBe("30000000-0000-0000-0000-000000000002");
      expect(nuevaSust.motivo).toBe("Molestia en cara anterior de hombro derecho");

      const stateAfter = useCoachStudioStore.getState();
      expect(stateAfter.sustituciones.length).toBe(initialSustituciones + 1);
      expect(stateAfter.toast?.title).toContain("Sustitución confirmada");
    });

    it("provee getters getSustitucionesPlan y getSustitucionesAlumno", async () => {
      const coachStore = useCoachStudioStore.getState();

      await coachStore.registrarSustitucion({
        planId: "plan-atleta-test",
        ejercicioOriginalId: "ej-orig",
        ejercicioSustitutoId: "ej-sust",
        motivo: "Test sustitucion",
      });

      const sustitucionesPlan = coachStore.getSustitucionesPlan("plan-atleta-test");
      expect(sustitucionesPlan.length).toBeGreaterThanOrEqual(1);
      expect(sustitucionesPlan[0]?.motivo).toBe("Test sustitucion");
    });
  });

  describe("7. Coach Studio: Visualización en Ficha del Alumno (StudentDetail)", () => {
    const studentDetailContent = readSource("../components/coach/student-detail.tsx");

    it("renderiza la sección de Historial de Sustituciones en la pestaña de historial", () => {
      expect(studentDetailContent).toContain('data-testid="routine-substitutions-history-section"');
      expect(studentDetailContent).toContain("Registro de Sustituciones Trazables");
      expect(studentDetailContent).toContain('data-testid={`substitution-record-${sust.id}`}');
    });

    it("muestra el ejercicio original, sustituto, fecha, motivo y profesor responsable", () => {
      expect(studentDetailContent).toContain("Motivo:");
      expect(studentDetailContent).toContain("Profesor Responsable:");
      expect(studentDetailContent).toContain("Toda la Rutina Vigente");
    });

    it("muestra aviso explícito de inmutabilidad estricta de sesiones finalizadas", () => {
      expect(studentDetailContent).toContain('data-testid="aviso-inmutabilidad-sustituciones"');
      expect(studentDetailContent).toContain(
        "Sesiones y series completadas previamente permanecen 100% inmutables.",
      );
    });
  });
});
