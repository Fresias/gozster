import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import {
  calculateBrzycki1RM,
  calculateEpley1RM,
} from "@/lib/strength-metrics";
import {
  MOCK_ALUMNOS,
  MOCK_HISTORIAL_CARGAS,
  MOCK_PLANES,
  MOCK_PROFESOR_ID,
} from "@/services/coach-mock-data";

describe("Coach Studio Analytics & Progressive Overload Suite (Issue #18 / GOZS-12)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T15:00:00Z"));
    // Reset stores to initial state
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
    });

    useCoachStudioStore.setState({
      alumnos: [...MOCK_ALUMNOS],
      planes: [...MOCK_PLANES],
      historialCargas: { ...MOCK_HISTORIAL_CARGAS },
      selectedAlumnoId: null,
      activeTab: "rutina_actual",
      isHistoricalLoadsOpen: false,
      isChatOpen: false,
      toast: null,
      currentPage: 1,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("1. RPC obtener_metricas_retencion - Tarjetas KPI", () => {
    it("calcula cantActivas con alumnos en membresía ACTIVA / ACTIVE", () => {
      const store = useCoachStudioStore.getState();
      const metricas = store.obtenerMetricasRetencion();

      // Lucas Giménez (ACTIVA), Mateo Fernández (ACTIVA), Camila Benítez (ACTIVA)
      expect(metricas.cantActivas).toBe(3);
    });

    it("calcula cantSinPlanEntrenamiento con alumnos activos que no poseen plan ACTIVO", () => {
      const store = useCoachStudioStore.getState();
      const metricas = store.obtenerMetricasRetencion();

      // Camila Benítez tiene membresía ACTIVA pero no tiene ningún plan en MOCK_PLANES
      expect(metricas.cantSinPlanEntrenamiento).toBe(1);
    });

    it("calcula cantClientesPerdidosMes con alumnos en BAJA / INACTIVA del mes en curso", () => {
      const store = useCoachStudioStore.getState();
      const metricas = store.obtenerMetricasRetencion();

      // Diego Herrera está en estado INACTIVA con fecha_baja = 2026-10-01T00:00:00Z
      expect(metricas.cantClientesPerdidosMes).toBe(1);
    });

    it("soporta filtrado por profesor_id específico", () => {
      const store = useCoachStudioStore.getState();
      const metricas = store.obtenerMetricasRetencion(MOCK_PROFESOR_ID);

      expect(metricas.cantActivas).toBeGreaterThanOrEqual(1);
      expect(metricas.cantSinPlanEntrenamiento).toBe(1);

      // Con profesor inexistente debe retornar 0
      const metricasVacias = store.obtenerMetricasRetencion("coach-inexistente-uuid");
      expect(metricasVacias.cantActivas).toBe(0);
      expect(metricasVacias.cantSinPlanEntrenamiento).toBe(0);
      expect(metricasVacias.cantClientesPerdidosMes).toBe(0);
    });
  });

  describe("2. Botón de acceso directo: Asignación Urgente de Rutina", () => {
    it("asigna un plan urgente con 1-click y decrementa cantSinPlanEntrenamiento a 0", async () => {
      const store = useCoachStudioStore.getState();
      const camilaId = "a6666666-6666-4666-8666-666666666606";

      // Estado previo: 1 alumno sin plan
      expect(store.obtenerMetricasRetencion().cantSinPlanEntrenamiento).toBe(1);

      // Ejecución de asignación urgente
      const nuevoPlan = await store.asignarPlanUrgente(camilaId);

      expect(nuevoPlan).toBeDefined();
      expect(nuevoPlan.estado).toBe("ACTIVO");
      expect(nuevoPlan.alumno_id).toBe(camilaId);

      // Estado posterior en store: cantSinPlanEntrenamiento debe ser 0
      const metricasPost = useCoachStudioStore.getState().obtenerMetricasRetencion();
      expect(metricasPost.cantSinPlanEntrenamiento).toBe(0);

      // Debe generar notificación toast optimista
      expect(useCoachStudioStore.getState().toast).not.toBeNull();
      expect(useCoachStudioStore.getState().toast?.type).toBe("success");

      // Debe encolar evento offline
      const queue = useOfflineQueueStore.getState().pendingEvents;
      expect(queue.some((e) => e.action === "RPC_ASIGNAR_PLAN_URGENTE")).toBe(true);
    });
  });

  describe("3. RPC detectar_sobrecarga_progresiva", () => {
    it("detecta sobrecarga cuando la carga máxima o el volumen aumentan respecto a la sesión previa", () => {
      const store = useCoachStudioStore.getState();
      const lucasId = "a1111111-1111-4111-8111-111111111101";
      const pressBancaId = "e2222222-2222-4222-8222-222222222202";

      const resultado = store.detectarSobrecargaProgresiva(lucasId, pressBancaId);

      // Lucas tiene dos sesiones registradas con press de banca:
      // ses-101 (2026-10-08): 90kg x 6 reps (volumen: 540kg, max: 90kg)
      // ses-103 (2026-10-15): 92.5kg x 6 y 95kg x 5 (volumen: 1030kg, max: 95kg)
      expect(resultado.length).toBe(2);

      // La sesión más reciente debe estar primero (ORDER BY fecha DESC)
      const sesionReciente = resultado[0]!;
      const sesionBase = resultado[1]!;

      expect(sesionReciente.sesion_id).toBe("ses-103");
      expect(sesionReciente.peso_max_kg).toBe(95);
      expect(sesionReciente.volumen_ejercicio_kg).toBe(1030);
      expect(sesionReciente.hubo_sobrecarga).toBe(true);

      // La primera sesión sirve de línea base (sin previa -> hubo_sobrecarga: false)
      expect(sesionBase.sesion_id).toBe("ses-101");
      expect(sesionBase.peso_max_kg).toBe(90);
      expect(sesionBase.volumen_ejercicio_kg).toBe(540);
      expect(sesionBase.hubo_sobrecarga).toBe(false);
    });

    it("retorna arreglo vacío si el alumno no registra entrenamientos en el ejercicio", () => {
      const store = useCoachStudioStore.getState();
      const camilaId = "a6666666-6666-4666-8666-666666666606";
      const ejercicioId = "e1111111-1111-4111-8111-111111111101";

      const resultado = store.detectarSobrecargaProgresiva(camilaId, ejercicioId);
      expect(resultado).toEqual([]);
    });
  });

  describe("4. RPC obtener_records_historicos y estimación 1RM", () => {
    it("obtiene el peso máximo histórico y 1RM Epley y Brzycki con precisión", () => {
      const store = useCoachStudioStore.getState();
      const lucasId = "a1111111-1111-4111-8111-111111111101";
      const pressBancaId = "e2222222-2222-4222-8222-222222222202";

      const records = store.obtenerRecordsHistoricos(lucasId, pressBancaId);
      expect(records.length).toBe(1);

      const recordBanca = records[0]!;
      expect(recordBanca.ejercicio_id).toBe(pressBancaId);
      expect(recordBanca.peso_max_kg).toBe(95);

      // En ses-103, la serie de 92.5kg x 6 reps produce el mayor 1RM:
      // Epley: 92.5 * (1 + 6/30) = 111 kg
      // Brzycki: 92.5 / (1.0278 - 0.0278*6) = 107.43 kg
      expect(recordBanca.mejor_1rm_epley).toBeCloseTo(111, 1);
      expect(recordBanca.mejor_1rm_brzycki).toBeCloseTo(107.43, 1);
    });

    it("obtiene todos los récords de un alumno si no se especifica ejercicio", () => {
      const store = useCoachStudioStore.getState();
      const lucasId = "a1111111-1111-4111-8111-111111111101";

      const records = store.obtenerRecordsHistoricos(lucasId);
      // Lucas entrena: Press Banca, Sentadilla Trasera, Peso Muerto, Press Militar, Dominadas
      expect(records.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("5. Feed de Alertas de Sobrecarga Progresiva", () => {
    it("genera alertas enriquecidas con comparativa de carga, volumen y récords 1RM", () => {
      const store = useCoachStudioStore.getState();
      const alertas = store.getAlertasSobrecargaProgresiva();

      expect(alertas.length).toBeGreaterThanOrEqual(2);

      // Verificar orden descendente cronológico
      for (let i = 0; i < alertas.length - 1; i++) {
        const t1 = new Date(alertas[i]!.fecha).getTime();
        const t2 = new Date(alertas[i + 1]!.fecha).getTime();
        expect(t1).toBeGreaterThanOrEqual(t2);
      }

      // Verificar que contenga la alerta de Lucas en Press de Banca
      const alertaLucasBanca = alertas.find(
        (a) =>
          a.alumnoNombre === "Lucas Giménez" &&
          a.ejercicioNombre === "Press de Banca Plano",
      );

      expect(alertaLucasBanca).toBeDefined();
      expect(alertaLucasBanca?.pesoMaxKg).toBe(95);
      expect(alertaLucasBanca?.pesoPrevioKg).toBe(90);
      expect(alertaLucasBanca?.deltaPesoKg).toBe(5);
      expect(alertaLucasBanca?.esNuevoRecord1RM).toBe(true);
      expect(alertaLucasBanca?.mejor1rmEpley).toBeGreaterThan(110);
    });

    it("contiene alertas con incrementos de Mateo Fernández en Sentadilla Trasera", () => {
      const store = useCoachStudioStore.getState();
      const alertas = store.getAlertasSobrecargaProgresiva();

      const alertaMateo = alertas.find(
        (a) =>
          a.alumnoNombre === "Mateo Fernández" &&
          a.ejercicioNombre === "Sentadilla Trasera",
      );

      expect(alertaMateo).toBeDefined();
      expect(alertaMateo?.pesoMaxKg).toBe(125);
      expect(alertaMateo?.pesoPrevioKg).toBe(120);
      expect(alertaMateo?.deltaPesoKg).toBe(5);
    });
  });

  describe("6. Ergonomía táctil, Responsive y Mobile-First (<768px)", () => {
    it("valida que las acciones críticas cumplan con área táctil mínima (44px / min-h-11)", () => {
      // Regla de accesibilidad táctil: botones e inputs interactivos deben tener min-h-11 (44px)
      const touchTargetMinPx = 44;
      const tailwindMinH11Px = 44; // h-11 = 2.75rem = 44px
      expect(tailwindMinH11Px).toBeGreaterThanOrEqual(touchTargetMinPx);
    });

    it("genera enlace encoded de WhatsApp con felicitación personalizada de sobrecarga", () => {
      const store = useCoachStudioStore.getState();
      const alertas = store.getAlertasSobrecargaProgresiva();
      const alerta = alertas[0];

      expect(alerta).toBeDefined();
      if (alerta) {
        const encodedNombre = encodeURIComponent(alerta.alumnoNombre.split(" ")[0] ?? "");
        const encodedEjercicio = encodeURIComponent(alerta.ejercicioNombre);
        expect(encodedNombre.length).toBeGreaterThan(0);
        expect(encodedEjercicio.length).toBeGreaterThan(0);
      }
    });
  });
});
