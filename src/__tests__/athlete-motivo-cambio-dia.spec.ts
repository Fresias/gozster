import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import {
  CHIPS_MOTIVOS_CAMBIO,
} from "@/components/athlete/inicio-mis-dias";
import {
  formatCambioDia,
  MOTIVOS_CAMBIO_DIA_MAP,
} from "@/components/coach/historical-loads-drawer";
import { REAL_DIAS } from "@/services/real-mynter-data";
import type { DiaRutina, MotivoCambioDia } from "@/types/database.types";

describe("GOZS-149: Athlete App motivo del cambio de día (chips + vista coach)", () => {
  const inicioMisDiasPath = path.resolve(__dirname, "../components/athlete/inicio-mis-dias.tsx");
  const historicalDrawerPath = path.resolve(__dirname, "../components/coach/historical-loads-drawer.tsx");
  const athleteStorePath = path.resolve(__dirname, "../store/use-athlete-store.ts");

  const inicioCode = fs.readFileSync(inicioMisDiasPath, "utf-8");
  const drawerCode = fs.readFileSync(historicalDrawerPath, "utf-8");
  const storeCode = fs.readFileSync(athleteStorePath, "utf-8");

  beforeEach(() => {
    useAthleteStore.getState().resetSessionToDefaults();
    useOfflineQueueStore.getState().clearQueue();
    vi.restoreAllMocks();
  });

  describe("1. Chips de motivo en el Sheet 'Hacer otro día'", () => {
    it("define los 4 chips con los valores y textos exactos requeridos", () => {
      expect(CHIPS_MOTIVOS_CAMBIO).toHaveLength(4);
      expect(CHIPS_MOTIVOS_CAMBIO).toEqual([
        { id: "CANSANCIO_DEPORTE", label: "Cansancio / otro deporte" },
        { id: "MOLESTIA", label: "Molestia" },
        { id: "POCO_TIEMPO", label: "Poco tiempo" },
        { id: "EQUIPO_OCUPADO", label: "Máquina ocupada" },
      ]);
    });

    it("el componente InicioMisDias contiene la sección con el label y los chips con altura h-11", () => {
      expect(inicioCode).toContain('data-testid="seccion-motivo-cambio-dia"');
      expect(inicioCode).toContain("¿Por qué cambiás? (opcional)");
      expect(inicioCode).toContain("h-11");
      expect(inicioCode).toContain("rounded-full");
      expect(inicioCode).toContain('data-testid={`chip-motivo-${chip.id.toLowerCase()}`}');
    });

    it("los chips son deseleccionables (toggle a null al tocar el chip activo)", () => {
      expect(inicioCode).toContain("setSheetMotivo((prev) => (prev === chip.id ? null : chip.id))");
    });

    it("el motivo es opcional: confirmar sin elegir motivo permite continuar normalmente", () => {
      const store = useAthleteStore.getState();
      // Cambiar de día sin motivo
      store.elegirOtroDia("dia-test-3", null, "dia-test-2");

      expect(useAthleteStore.getState().diaElegidoHoyId).toBe("dia-test-3");
      expect(useAthleteStore.getState().motivoCambioDia).toBeNull();
      expect(useAthleteStore.getState().diaSugeridoId).toBe("dia-test-2");
    });
  });

  describe("2. Persistencia en store y cola offline al empezar el día elegido", () => {
    it("al empezar el día elegido con motivo, guarda dia_sugerido_id y motivo_cambio_dia en la cola offline", () => {
      const store = useAthleteStore.getState();
      const motivo: MotivoCambioDia = "CANSANCIO_DEPORTE";
      const diaSugerido = REAL_DIAS[0]!.id;
      const diaElegido = REAL_DIAS[1]!.id;

      store.elegirOtroDia(diaElegido, motivo, diaSugerido);
      store.empezarDia(diaElegido);

      // Verificamos currentSession
      const currentSession = useAthleteStore.getState().currentSession;
      expect(currentSession.dia_id).toBe(diaElegido);
      expect(currentSession.dia_sugerido_id).toBe(diaSugerido);
      expect(currentSession.motivo_cambio_dia).toBe(motivo);

      // Verificamos cola offline
      const queue = useOfflineQueueStore.getState().pendingEvents;
      const cambioEvent = queue.find((e) => e.action === "CAMBIO_DIA_REGISTRADO");
      expect(cambioEvent).toBeDefined();
      expect(cambioEvent?.payload).toMatchObject({
        diaElegidoId: diaElegido,
        diaSugeridoId: diaSugerido,
        motivoCambioDia: motivo,
      });
    });

    it("al empezar el día elegido SIN motivo, guarda dia_sugerido_id y motivo_cambio_dia null en la cola offline", () => {
      const store = useAthleteStore.getState();
      const diaSugerido = "dia-test-1";
      const diaElegido = "dia-test-3";

      store.elegirOtroDia(diaElegido, null, diaSugerido);
      store.empezarDia(diaElegido);

      const queue = useOfflineQueueStore.getState().pendingEvents;
      const cambioEvent = queue.find((e) => e.action === "CAMBIO_DIA_REGISTRADO");
      expect(cambioEvent).toBeDefined();
      expect(cambioEvent?.payload).toMatchObject({
        diaElegidoId: diaElegido,
        diaSugeridoId: diaSugerido,
        motivoCambioDia: null,
      });
    });

    it("deshacerCambioDia limpia diaElegidoHoyId, motivoCambioDia y diaSugeridoId", () => {
      const store = useAthleteStore.getState();
      store.elegirOtroDia("dia-3", "MOLESTIA", "dia-2");
      expect(useAthleteStore.getState().motivoCambioDia).toBe("MOLESTIA");

      store.deshacerCambioDia();
      expect(useAthleteStore.getState().diaElegidoHoyId).toBeNull();
      expect(useAthleteStore.getState().motivoCambioDia).toBeNull();
      expect(useAthleteStore.getState().diaSugeridoId).toBeNull();
    });

    it("el store persiste motivoCambioDia y diaSugeridoId en partialize", () => {
      expect(storeCode).toContain("diaSugeridoId: state.diaSugeridoId");
      expect(storeCode).toContain("motivoCambioDia: state.motivoCambioDia");
    });
  });

  describe("3. Coach Studio: Visualización en el historial de sesiones", () => {
    const mockDias: DiaRutina[] = [
      {
        id: "d-1",
        plan_id: "plan-1",
        nombre: "Full body",
        orden: 1,
        created_at: "2026-10-01",
        updated_at: "2026-10-01",
      },
      {
        id: "d-2",
        plan_id: "plan-1",
        nombre: "Tren inferior",
        orden: 2,
        created_at: "2026-10-01",
        updated_at: "2026-10-01",
      },
      {
        id: "d-3",
        plan_id: "plan-1",
        nombre: "Tren superior",
        orden: 3,
        created_at: "2026-10-01",
        updated_at: "2026-10-01",
      },
      {
        id: "d-4",
        plan_id: "plan-1",
        nombre: "Movilidad",
        orden: 4,
        created_at: "2026-10-01",
        updated_at: "2026-10-01",
      },
    ];

    it("MOTIVOS_CAMBIO_DIA_MAP mapea todos los motivos al texto en español del mockup", () => {
      expect(MOTIVOS_CAMBIO_DIA_MAP.CANSANCIO_DEPORTE).toBe("Cansancio / otro deporte");
      expect(MOTIVOS_CAMBIO_DIA_MAP.MOLESTIA).toBe("Molestia");
      expect(MOTIVOS_CAMBIO_DIA_MAP.POCO_TIEMPO).toBe("Poco tiempo");
      expect(MOTIVOS_CAMBIO_DIA_MAP.EQUIPO_OCUPADO).toBe("Máquina ocupada");
    });

    it("formatCambioDia genera la línea exacta 'Cambió Día 2 → Día 3 · Cansancio / otro deporte'", () => {
      const linea = formatCambioDia("d-2", "d-3", "CANSANCIO_DEPORTE", mockDias);
      expect(linea).toBe("Cambió Día 2 → Día 3 · Cansancio / otro deporte");
    });

    it("formatCambioDia genera 'Cambió Día 2 → Día 3' si no se seleccionó motivo opcional", () => {
      const linea = formatCambioDia("d-2", "d-3", null, mockDias);
      expect(linea).toBe("Cambió Día 2 → Día 3");
    });

    it("formatCambioDia retorna null si no hubo cambio de día", () => {
      const linea = formatCambioDia(null, "d-2", null, mockDias);
      expect(linea).toBeNull();
    });

    it("HistoricalLoadsDrawer incluye el bloque y testid para la línea discreta de cambio de día", () => {
      expect(drawerCode).toContain('data-testid="sesion-cambio-dia-info"');
      expect(drawerCode).toContain("formatCambioDia(");
      expect(drawerCode).toContain("text-amber-700");
    });
  });
});
