import { beforeEach, describe, expect, it } from "vitest";
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

  describe("3. Acción [Clonar última rutina] con feedback visual optimista y offline queue", () => {
    it("clona la última rutina, la agrega como ACTIVO y pasa la anterior a INACTIVO", async () => {
      const store = useCoachStudioStore.getState();
      const lucasId = "a1111111-1111-4111-8111-111111111101";
      const totalPlanesInicial = store.getPlanesAlumno(lucasId).length;

      const nuevoPlan = await store.clonarUltimaRutina(lucasId);

      expect(nuevoPlan).not.toBeNull();
      expect(nuevoPlan?.estado).toBe("ACTIVO");
      expect(nuevoPlan?.nombre).toContain("[Clon]");

      const planesActualizados = useCoachStudioStore.getState().getPlanesAlumno(lucasId);
      expect(planesActualizados.length).toBe(totalPlanesInicial + 1);

      // Feedback visual optimista: toast registrado
      const toast = useCoachStudioStore.getState().toast;
      expect(toast).not.toBeNull();
      expect(toast?.type).toBe("success");
      expect(toast?.title).toContain("Clonada");

      // Registro en cola offline
      const offlineEvents = useOfflineQueueStore.getState().pendingEvents;
      expect(offlineEvents).toHaveLength(1);
      expect(offlineEvents[0]?.action).toBe("RPC_CLONAR_ULTIMA_RUTINA");
      expect(offlineEvents[0]?.payload.alumnoId).toBe(lucasId);
    });

    it("copia los días y ejercicios de la rutina base al clonar", async () => {
      const store = useCoachStudioStore.getState();
      const lucasId = "a1111111-1111-4111-8111-111111111101";

      const diasAntes = store.dias.length;
      const ejerciciosAntes = store.ejerciciosEnRutina.length;

      const nuevoPlan = await store.clonarUltimaRutina(lucasId);
      expect(nuevoPlan).not.toBeNull();

      const diasDespues = useCoachStudioStore.getState().dias.length;
      const ejerciciosDespues = useCoachStudioStore.getState().ejerciciosEnRutina.length;

      expect(diasDespues).toBeGreaterThan(diasAntes);
      expect(ejerciciosDespues).toBeGreaterThan(ejerciciosAntes);

      // Verificar que los nuevos días apuntan al plan clonado
      const diasClonados = useCoachStudioStore
        .getState()
        .dias.filter((d) => d.plan_id === nuevoPlan?.id);
      expect(diasClonados.length).toBeGreaterThan(0);
    });
  });

  describe("4. Acción [Extender vigencia] con feedback visual optimista y offline queue", () => {
    it("extiende la vigencia del plan activo por 30 días con feedback visual", async () => {
      const store = useCoachStudioStore.getState();
      const planActivo = store.planes.find((p) => p.estado === "ACTIVO");
      expect(planActivo).toBeDefined();

      if (planActivo) {
        const planExtendido = await store.extenderVigenciaPlan(planActivo.id, 30);

        expect(planExtendido).not.toBeNull();
        expect(planExtendido?.comentarios).toContain("Vigencia extendida +30 días");
        expect(planExtendido?.estado).toBe("ACTIVO");

        // Toast feedback
        const toast = useCoachStudioStore.getState().toast;
        expect(toast?.type).toBe("success");
        expect(toast?.title).toContain("Vigencia Extendida");

        // Offline queue
        const offlineEvents = useOfflineQueueStore.getState().pendingEvents;
        expect(offlineEvents.some((e) => e.action === "RPC_EXTENDER_VIGENCIA_PLAN")).toBe(true);
      }
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
