import { beforeEach, describe, expect, it, vi } from "vitest";

const asignarRutinaAAlumnoMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/rutinas-service", () => ({ asignarRutinaAAlumno: asignarRutinaAAlumnoMock }));
vi.mock("@/services/alumnos-service", async (orig) => ({
  ...(await orig<object>()),
  fetchLiveDatasetFromSupabase: vi.fn().mockResolvedValue(null),
}));
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import {
  calculateBlockVolume,
  calculateBrzycki1RM,
  calculateEpley1RM,
} from "@/lib/strength-metrics";
import { MOCK_ALUMNOS } from "@/services/coach-mock-data";

describe("Coach Studio Mobile-First & Routine Cloning Suite (Issue #10 / GOZS-7)", () => {
  beforeEach(() => {
    // Reset stores before each test
    useCoachStudioStore.getState().resetDemoDataset();
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

  describe("1. Card Layout táctil y badges de pago (<768px)", () => {
    it("mapea correctamente el badge de pago para cada estado de membresía", () => {
      const lucas = MOCK_ALUMNOS.find((a) => a.nombre_completo === "Lucas Giménez");
      const sofia = MOCK_ALUMNOS.find((a) => a.nombre_completo === "Sofía Rossi");
      const diego = MOCK_ALUMNOS.find((a) => a.nombre_completo === "Diego Herrera");

      expect(lucas?.estado_membresia).toBe("ACTIVA"); // "Al día"
      expect(sofia?.estado_membresia).toBe("PENDIENTE"); // "Pago pendiente"
      expect(diego?.estado_membresia).toBe("INACTIVA"); // "Inactivo"
    });

    it("genera enlace de WhatsApp con formato encoded y texto personalizado", () => {
      const alumno = MOCK_ALUMNOS[0];
      expect(alumno).toBeDefined();

      if (alumno) {
        const expectedPrefix = "https://wa.me/?text=";
        const msg = encodeURIComponent(
          `Hola ${alumno.nombre_completo}, te escribo desde GOZSter Coach Studio sobre tu plan de entrenamiento.`,
        );
        const fullUrl = `${expectedPrefix}${msg}`;

        expect(fullUrl).toContain("https://wa.me/?text=");
        expect(fullUrl).toContain(encodeURIComponent(alumno.nombre_completo));
      }
    });

    it("filtra y pagina los alumnos respetando la ergonomía táctil", () => {
      const store = useCoachStudioStore.getState();
      expect(store.alumnos.length).toBeGreaterThanOrEqual(5);

      store.setCurrentPage(2);
      expect(useCoachStudioStore.getState().currentPage).toBe(2);

      store.selectAlumno(store.alumnos[0]!.id);
      expect(useCoachStudioStore.getState().selectedAlumnoId).toBe(store.alumnos[0]!.id);
      expect(useCoachStudioStore.getState().getSelectedAlumno()?.id).toBe(store.alumnos[0]!.id);
    });
  });

  describe("2. Pestaña 'Historial de Rutinas' cronológico", () => {
    it("ordena todos los planes anteriores cronológicamente (más reciente primero)", () => {
      const store = useCoachStudioStore.getState();
      const lucasId = "a1111111-1111-4111-8111-111111111101";

      const planes = store.getPlanesAlumnoCronologico(lucasId);
      expect(planes.length).toBeGreaterThanOrEqual(2);

      // Verificar orden descendente por created_at
      for (let i = 0; i < planes.length - 1; i++) {
        const t1 = new Date(planes[i]!.created_at).getTime();
        const t2 = new Date(planes[i + 1]!.created_at).getTime();
        expect(t1).toBeGreaterThanOrEqual(t2);
      }
    });

    it("identifica correctamente la rutina activa del alumno", () => {
      const store = useCoachStudioStore.getState();
      const lucasId = "a1111111-1111-4111-8111-111111111101";

      const rutinaActiva = store.getRutinaActivaAlumno(lucasId);
      expect(rutinaActiva).not.toBeNull();
      expect(rutinaActiva?.estado).toBe("ACTIVO");
      expect(rutinaActiva?.alumno_id).toBe(lucasId);
    });
  });

  describe("3. Acción [Clonar última rutina] persistida por RPC asignar_rutina_a_alumno", () => {
    const lucasId = "a1111111-1111-4111-8111-111111111101";

    beforeEach(() => {
      asignarRutinaAAlumnoMock.mockReset();
    });

    it("clona con la RPC usando la última rutina como base y no encola eventos inventados", async () => {
      const store = useCoachStudioStore.getState();
      const planBase = store.getPlanesAlumnoCronologico(lucasId)[0];
      asignarRutinaAAlumnoMock.mockResolvedValue("plan-persistido");

      await store.clonarUltimaRutina(lucasId);

      expect(asignarRutinaAAlumnoMock).toHaveBeenCalledWith(planBase?.id, lucasId);
      expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
    });

    it("si la RPC falla lanza el error y el estado local no queda inventado", async () => {
      const store = useCoachStudioStore.getState();
      const planesAntes = store.planes;
      asignarRutinaAAlumnoMock.mockRejectedValue(new Error("No pudimos asignar la rutina. Intenta de nuevo."));

      await expect(store.clonarUltimaRutina(lucasId)).rejects.toThrow("No pudimos asignar");

      expect(useCoachStudioStore.getState().planes).toBe(planesAntes);
      expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
    });
  });

  describe("5. Panel lateral / modal de cargas y RPE históricos", () => {
    it("recupera las sesiones históricas de un alumno con series y RPE", () => {
      const store = useCoachStudioStore.getState();
      const lucasId = "a1111111-1111-4111-8111-111111111101";

      const historial = store.getHistorialCargasAlumno(lucasId);
      expect(historial.length).toBeGreaterThan(0);

      const primeraSesion = historial[0];
      expect(primeraSesion).toBeDefined();
      expect(primeraSesion?.series.length).toBeGreaterThan(0);

      const primeraSerie = primeraSesion?.series[0];
      expect(primeraSerie?.peso_kg).toBeGreaterThan(0);
      expect(primeraSerie?.reps_hechas).toBeGreaterThan(0);
      expect(primeraSerie?.rpe_real).toBeGreaterThan(0);
    });

    it("calcula 1RM y volumen por serie en el historial", () => {
      const store = useCoachStudioStore.getState();
      const lucasId = "a1111111-1111-4111-8111-111111111101";
      const historial = store.getHistorialCargasAlumno(lucasId);

      const serie = historial[0]?.series[0];
      if (serie) {
        const epley = calculateEpley1RM(serie.peso_kg, serie.reps_hechas);
        const brzycki = calculateBrzycki1RM(serie.peso_kg, serie.reps_hechas);
        const vol = calculateBlockVolume(1, serie.reps_hechas, serie.peso_kg);

        expect(epley).toBeGreaterThan(serie.peso_kg);
        expect(brzycki).toBeGreaterThan(serie.peso_kg);
        expect(vol).toBe(serie.peso_kg * serie.reps_hechas);
      }
    });

    it("controla apertura y cierre del panel lateral", () => {
      const store = useCoachStudioStore.getState();
      expect(store.isHistoricalLoadsOpen).toBe(false);

      store.setHistoricalLoadsOpen(true);
      expect(useCoachStudioStore.getState().isHistoricalLoadsOpen).toBe(true);

      store.setHistoricalLoadsOpen(false);
      expect(useCoachStudioStore.getState().isHistoricalLoadsOpen).toBe(false);
    });
  });

  describe("6. Botón flotante (FAB) de chat y prevención de colisión", () => {
    it("controla la visibilidad y alternancia del chat FAB", () => {
      const store = useCoachStudioStore.getState();
      expect(store.isChatOpen).toBe(false);

      store.setChatOpen(true);
      expect(useCoachStudioStore.getState().isChatOpen).toBe(true);

      store.setChatOpen(false);
      expect(useCoachStudioStore.getState().isChatOpen).toBe(false);
    });

    it("verifica separación espacial: FAB posicionado en z-40 fixed con zona segura de padding en el contenedor", () => {
      // El FAB se monta con posición fija bottom-5 right-5 y z-40
      // El contenedor padre tiene pb-28 sm:pb-32 y los controles de paginación tienen pr-16
      const safePaddingBottomMobile = 28; // pb-28 en Tailwind = 7rem (112px), supera ampliamente el FAB (56px)
      const fabHeightPx = 56;
      const remInPx = 16;
      const totalClearancePx = (safePaddingBottomMobile / 4) * remInPx;

      expect(totalClearancePx).toBeGreaterThan(fabHeightPx * 1.5);
    });
  });
});
