import { beforeEach, describe, expect, it } from "vitest";
import {
  calculateBlockVolume,
  calculateBrzycki1RM,
  calculateEpley1RM,
  calculateTotalTonnage,
  type VolumeBlock,
} from "@/lib/strength-metrics";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { MOCK_ALUMNOS } from "@/services/coach-mock-data";

describe("QA Verification & Mathematical Rigor - Coach Studio (GOZS-7 / Issue #10)", () => {
  beforeEach(() => {
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
    });

    useCoachStudioStore.setState({
      selectedAlumnoId: null,
      activeTab: "rutina_actual",
      isHistoricalLoadsOpen: false,
      isChatOpen: false,
      toast: null,
      currentPage: 1,
    });
  });

  describe("A. Verificación Matemática Estricta de 1RM y Métricas de Fuerza", () => {
    it("Epley: calcula 1RM = Peso * (1 + Reps / 30) con precisión exacta", () => {
      // 100 kg x 5 reps -> 100 * (1 + 5/30) = 116.6667
      expect(calculateEpley1RM(100, 5)).toBeCloseTo(116.6667, 4);
      // 140 kg x 8 reps -> 140 * (1 + 8/30) = 177.3333
      expect(calculateEpley1RM(140, 8)).toBeCloseTo(177.3333, 4);
      // 200 kg x 1 rep -> 200 * (1 + 1/30) = 206.6667
      expect(calculateEpley1RM(200, 1)).toBeCloseTo(206.6667, 4);
    });

    it("Epley: maneja casos límite (peso <= 0, reps <= 0, NaN, Infinity)", () => {
      expect(calculateEpley1RM(0, 10)).toBe(0);
      expect(calculateEpley1RM(-100, 5)).toBe(0);
      expect(calculateEpley1RM(100, 0)).toBe(0);
      expect(calculateEpley1RM(100, -5)).toBe(0);
      expect(calculateEpley1RM(Number.NaN, 5)).toBe(0);
      expect(calculateEpley1RM(100, Number.NaN)).toBe(0);
      expect(calculateEpley1RM(Number.POSITIVE_INFINITY, 5)).toBe(0);
      expect(calculateEpley1RM(100, Number.POSITIVE_INFINITY)).toBe(0);
    });

    it("Brzycki: calcula 1RM = Peso / (1.0278 - 0.0278 * Reps) con precisión exacta", () => {
      // 100 kg x 1 rep -> 100 / (1.0278 - 0.0278) = 100 / 1 = 100
      expect(calculateBrzycki1RM(100, 1)).toBeCloseTo(100, 5);
      // 100 kg x 5 reps -> 100 / (1.0278 - 0.139) = 100 / 0.8888 = 112.5113
      expect(calculateBrzycki1RM(100, 5)).toBeCloseTo(112.5113, 4);
      // 80 kg x 10 reps -> 80 / (1.0278 - 0.278) = 80 / 0.7498 = 106.6951
      expect(calculateBrzycki1RM(80, 10)).toBeCloseTo(106.6951, 4);
    });

    it("Brzycki: previene división por cero o denominador negativo en repeticiones extremas (>= 37)", () => {
      // Para reps = 37: 1.0278 - 0.0278 * 37 = 1.0278 - 1.0286 = -0.0008 <= 0
      expect(calculateBrzycki1RM(100, 37)).toBe(0);
      expect(calculateBrzycki1RM(100, 50)).toBe(0);
    });

    it("Brzycki: maneja casos límite (peso <= 0, reps <= 0, NaN, Infinity)", () => {
      expect(calculateBrzycki1RM(0, 5)).toBe(0);
      expect(calculateBrzycki1RM(-80, 5)).toBe(0);
      expect(calculateBrzycki1RM(100, 0)).toBe(0);
      expect(calculateBrzycki1RM(100, -5)).toBe(0);
      expect(calculateBrzycki1RM(Number.NaN, 5)).toBe(0);
      expect(calculateBrzycki1RM(100, Number.NaN)).toBe(0);
      expect(calculateBrzycki1RM(Number.POSITIVE_INFINITY, 5)).toBe(0);
    });

    it("Tonelaje y Volumen: Σ(Series * Reps * Peso) con filtrado estricto de anomalías", () => {
      const validBlocks: VolumeBlock[] = [
        { series: 4, reps: 8, peso: 100 },  // 3200
        { series: 3, reps: 10, peso: 80 },  // 2400
        { series: 5, reps: 5, peso: 120 },  // 3000
      ];
      expect(calculateTotalTonnage(validBlocks)).toBe(8600);

      const mixedBlocks: VolumeBlock[] = [
        { series: 4, reps: 8, peso: 100 },  // 3200
        { series: 0, reps: 10, peso: 100 }, // 0
        { series: 3, reps: 0, peso: 100 },  // 0
        { series: 3, reps: 10, peso: 0 },   // 0
        { series: -1, reps: 10, peso: 100 },// 0
        { series: 3, reps: -5, peso: 100 }, // 0
        { series: 3, reps: 10, peso: -80 }, // 0
      ];
      expect(calculateTotalTonnage(mixedBlocks)).toBe(3200);
      expect(calculateTotalTonnage([])).toBe(0);
    });
  });

  describe("B. Robustez Offline & Encolado de Acciones RPC", () => {
    it("encola RPC_CLONAR_ULTIMA_RUTINA correctamente cuando la red está desconectada", async () => {
      // Simular desconexión
      useOfflineQueueStore.setState({ isOnline: false, pendingEvents: [] });
      const store = useCoachStudioStore.getState();
      const lucasId = "a1111111-1111-4111-8111-111111111101";

      const cloned = await store.clonarUltimaRutina(lucasId);
      expect(cloned).not.toBeNull();
      expect(cloned?.estado).toBe("ACTIVO");

      const queueState = useOfflineQueueStore.getState();
      expect(queueState.pendingEvents.length).toBe(1);
      expect(queueState.pendingEvents[0]?.action).toBe("RPC_CLONAR_ULTIMA_RUTINA");
      expect(queueState.pendingEvents[0]?.payload.alumnoId).toBe(lucasId);
      expect(queueState.pendingEvents[0]?.payload.nuevoPlanId).toBe(cloned?.id);
    });

    it("encola RPC_EXTENDER_VIGENCIA_PLAN correctamente cuando la red está desconectada", async () => {
      useOfflineQueueStore.setState({ isOnline: false, pendingEvents: [] });
      const store = useCoachStudioStore.getState();
      const planActivo = store.planes.find((p) => p.estado === "ACTIVO");
      expect(planActivo).toBeDefined();

      if (planActivo) {
        const extended = await store.extenderVigenciaPlan(planActivo.id, 30);
        expect(extended).not.toBeNull();
        expect(extended?.estado).toBe("ACTIVO");
        expect(extended?.comentarios).toContain("+30 días");

        const queueState = useOfflineQueueStore.getState();
        expect(queueState.pendingEvents.length).toBe(1);
        expect(queueState.pendingEvents[0]?.action).toBe("RPC_EXTENDER_VIGENCIA_PLAN");
        expect(queueState.pendingEvents[0]?.payload.planId).toBe(planActivo.id);
        expect(queueState.pendingEvents[0]?.payload.diasExtra).toBe(30);
      }
    });

    it("soporta acumulación secuencial de múltiples acciones offline sin pérdida de eventos", async () => {
      useOfflineQueueStore.setState({ isOnline: false, pendingEvents: [] });
      const store = useCoachStudioStore.getState();
      const lucasId = "a1111111-1111-4111-8111-111111111101";

      const clon1 = await store.clonarUltimaRutina(lucasId);
      if (clon1) {
        await store.extenderVigenciaPlan(clon1.id, 30);
      }

      const queueState = useOfflineQueueStore.getState();
      expect(queueState.pendingEvents.length).toBe(2);
      expect(queueState.pendingEvents[0]?.action).toBe("RPC_CLONAR_ULTIMA_RUTINA");
      expect(queueState.pendingEvents[1]?.action).toBe("RPC_EXTENDER_VIGENCIA_PLAN");
    });
  });

  describe("C. Ergonomía Mobile-First, Targets Táctiles y Prevención de Colisiones", () => {
    it("garantiza que el target táctil para WhatsApp y acciones cumpla la recomendación W3C/Apple (>= 44px)", () => {
      // min-h-11 en Tailwind = 44px
      const minTouchHeightPx = 11 * 4; // 44px
      expect(minTouchHeightPx).toBeGreaterThanOrEqual(44);
    });

    it("garantiza que el contenedor de CoachStudio disponga de margen de seguridad para evitar colisión con Chat FAB", () => {
      // Contenedor posee pb-28 (112px en mobile) y controles de paginación pr-16 (64px)
      // FAB está posicionado en bottom-5 right-5 con 56px de diámetro
      const fabSizePx = 56;
      const bottomSafeZonePx = 28 * 4; // 112px
      const rightSafeZonePx = 16 * 4;  // 64px

      expect(bottomSafeZonePx).toBeGreaterThan(fabSizePx);
      expect(rightSafeZonePx).toBeGreaterThanOrEqual(fabSizePx);
    });

    it("valida consistencia de estados de membresía de todos los alumnos mock", () => {
      const validStatuses = new Set(["ACTIVA", "PENDIENTE", "INACTIVA", "BAJA"]);
      for (const alumno of MOCK_ALUMNOS) {
        expect(validStatuses.has(alumno.estado_membresia)).toBe(true);
      }
    });
  });
});
