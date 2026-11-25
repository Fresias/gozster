import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchCriticalAlerts,
  getReactiveCriticalAlerts,
} from "@/components/coach/critical-alerts-data";
import {
  useCriticalAlertsStore,
  getReactiveAlertsForStudent,
} from "@/components/coach/critical-alerts-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { useAthleteStore, DEFAULT_ATHLETE_ID, DEFAULT_ATHLETE_NAME } from "@/store/use-athlete-store";

const ALUMNO_REAL_ID = "11111111-2222-4333-8444-555555555555";

vi.mock("@/lib/supabase/client", async () => {
  const { createSupabaseClientMock } = await import("./helpers/supabase-client-mock");
  return {
    supabase: createSupabaseClientMock({
      tables: {
        alumno_historial_dolor: [
          {
            id: "hist-regresion-1",
            alumno_id: "11111111-2222-4333-8444-555555555555",
            zona_articular: "RODILLA",
            severidad: "AGUDO",
            es_sintoma_alarma: true,
            sintomas_alarma: [],
            estado: "PENDIENTE",
            created_at: "2026-11-24T10:00:00Z",
            ejercicios: { id: "e1", nombre: "Sentadilla" },
            perfiles: { id: "11111111-2222-4333-8444-555555555555", nombre_completo: "Fernando Pérez" },
          },
        ],
      },
    }),
  };
});

describe("GOZS-802: alertas de dolor no sobrescriben nombres por coincidencia de texto", () => {
  beforeEach(() => {
    useOfflineQueueStore.setState({ pendingEvents: [] } as never);
  });

  it("alumno_historial_dolor: un alumno real 'Fernando Pérez' conserva nombre e id", async () => {
    const alerts = await fetchCriticalAlerts();
    const a = alerts.find((x) => x.id === "hist-regresion-1");
    expect(a?.alumnoNombre).toBe("Fernando Pérez");
    expect(a?.alumnoId).toBe(ALUMNO_REAL_ID);
  });

  it("cola offline: un alumno real 'Fernando Pérez' conserva nombre e id", () => {
    useOfflineQueueStore.getState().enqueueEvent({
      id: "offline-regresion-1",
      action: "PAIN_REPORT_SUBMITTED",
      payload: {
        studentId: ALUMNO_REAL_ID,
        studentName: "Fernando Pérez",
        exerciseName: "Sentadilla",
        zonaArticular: "RODILLA",
        severidad: "AGUDO",
      },
    });
    const a = getReactiveCriticalAlerts().find((x) => x.id === "offline-regresion-1");
    expect(a?.alumnoNombre).toBe("Fernando Pérez");
    expect(a?.alumnoId).toBe(ALUMNO_REAL_ID);
  });

  it("cola offline sin nombre ni id usa el respaldo neutro", () => {
    useOfflineQueueStore.getState().enqueueEvent({
      id: "offline-regresion-2",
      action: "PAIN_REPORT_SUBMITTED",
      payload: { exerciseName: "Sentadilla", zonaArticular: "RODILLA", severidad: "AGUDO" },
    });
    const a = getReactiveCriticalAlerts().find((x) => x.id === "offline-regresion-2");
    expect(a?.alumnoNombre).toBe("Alumno GOZSter");
    expect(a?.alumnoId).toBe("");
  });

  it("consultas con texto vacío no devuelven coincidencias", () => {
    expect(useCriticalAlertsStore.getState().getAlertsForAlumno("")).toEqual([]);
    expect(getReactiveAlertsForStudent("")).toEqual([]);
  });

  it("el estado por defecto del atleta usa identificadores sintéticos neutros", () => {
    const s = useAthleteStore.getState().currentSession;
    expect(DEFAULT_ATHLETE_NAME).toBe("Alumno GOZSter");
    expect(DEFAULT_ATHLETE_ID).toBe("00000000-0000-4000-8000-000000000001");
    expect(s?.studentName).toBe(DEFAULT_ATHLETE_NAME);
    expect(s?.studentId).toBe(DEFAULT_ATHLETE_ID);
  });
});
