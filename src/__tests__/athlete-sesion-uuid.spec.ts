import { beforeEach, describe, expect, it, vi } from "vitest";
import { esUuid } from "@/lib/athlete/uuid";

const ALUMNO_ID = "11111111-1111-4111-8111-111111111111";
const PLAN_ID = "22222222-2222-4222-8222-222222222222";
const DIA_1_ID = "33333333-3333-4333-8333-333333333331";
const DIA_2_ID = "33333333-3333-4333-8333-333333333332";
const EJ_1_ID = "44444444-4444-4444-8444-444444444441";

const planMock = {
  alumnos: [
    {
      id: ALUMNO_ID,
      nombre_completo: "Lucía Fernández",
      nivel_vista_alumno: "SIMPLE" as const,
    },
  ],
  planes: [
    {
      id: PLAN_ID,
      alumno_id: ALUMNO_ID,
      nombre: "Fuerza Base",
      estado: "ACTIVO" as const,
    },
  ],
  dias: [
    { id: DIA_1_ID, plan_id: PLAN_ID, orden: 1, nombre: "Día 1" },
    { id: DIA_2_ID, plan_id: PLAN_ID, orden: 2, nombre: "Día 2" },
  ],
  ejerciciosEnRutina: [
    {
      id: "55555555-5555-4555-8555-555555555551",
      dia_id: DIA_1_ID,
      ejercicio_id: EJ_1_ID,
      orden: 1,
      series: 3,
      repeticiones: "8",
      descanso_segundos: 90,
      rpe_objetivo: 8,
    },
    {
      id: "55555555-5555-4555-8555-555555555552",
      dia_id: DIA_2_ID,
      ejercicio_id: EJ_1_ID,
      orden: 1,
      series: 3,
      repeticiones: "10",
      descanso_segundos: 90,
      rpe_objetivo: 8,
    },
  ],
  ejercicios: [{ id: EJ_1_ID, nombre: "Sentadilla", musculos_principales: ["Cuádriceps"] }],
};

vi.mock("@/services/alumnos-service", () => ({
  fetchPlanAlumno: vi.fn(async () => planMock),
}));

import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

describe("BE-00 CP3 · Id de sesión UUID en loadStudentSession", () => {
  beforeEach(() => {
    useOfflineQueueStore.setState({ isOnline: false, pendingEvents: [], syncError: null });
    useAthleteStore.getState().resetSessionToDefaults();
    useAthleteStore.setState({
      sesionesCompletadas: [],
      historialSesiones: [],
      planAlumno: planMock as any,
    });
  });

  it("crea una sesión nueva con UUID v4 válido (nunca session-<alumno>-<día>)", () => {
    const ok = useAthleteStore.getState().loadStudentSession(ALUMNO_ID, DIA_1_ID);
    expect(ok).toBe(true);

    const { currentSession } = useAthleteStore.getState();
    expect(esUuid(currentSession.id)).toBe(true);
    expect(currentSession.id).not.toContain("session-");
  });

  it("conserva el mismo id y el progreso al recargar una sesión en curso", async () => {
    useAthleteStore.getState().empezarDia(DIA_2_ID);
    const idInicial = useAthleteStore.getState().currentSession.id;
    expect(esUuid(idInicial)).toBe(true);

    // Completar primera serie
    const ejId = useAthleteStore.getState().currentSession.ejercicios[0]!.id;
    useAthleteStore.getState().completeSet(ejId, 1);

    // Simular recarga llamando a cargarPlanAlumno() (sin pasar diaId explícito)
    await useAthleteStore.getState().cargarPlanAlumno();

    const trasRecarga = useAthleteStore.getState().currentSession;
    expect(trasRecarga.id).toBe(idInicial);
    expect(trasRecarga.dia_id).toBe(DIA_2_ID);
    expect(trasRecarga.ejercicios[0]!.series[0]!.completada).toBe(true);

    // También si se re-invoca loadStudentSession con el mismo día en curso
    useAthleteStore.getState().loadStudentSession(ALUMNO_ID, DIA_2_ID);
    expect(useAthleteStore.getState().currentSession.id).toBe(idInicial);
  });

  it("asigna un UUID nuevo en la siguiente sesión del mismo día tras cerrar la anterior", () => {
    useAthleteStore.getState().empezarDia(DIA_1_ID);
    const id1 = useAthleteStore.getState().currentSession.id;
    expect(esUuid(id1)).toBe(true);

    // Cerrar sesión
    useAthleteStore.getState().marcarDiaCompletado(DIA_1_ID);

    // Iniciar otra sesión del mismo día
    useAthleteStore.getState().empezarDia(DIA_1_ID);
    const id2 = useAthleteStore.getState().currentSession.id;

    expect(esUuid(id2)).toBe(true);
    expect(id2).not.toBe(id1);
  });

  it("resetSessionToDefaults deja el próximo loadStudentSession con un UUID nuevo", () => {
    useAthleteStore.getState().loadStudentSession(ALUMNO_ID, DIA_1_ID);
    const id1 = useAthleteStore.getState().currentSession.id;

    useAthleteStore.getState().resetSessionToDefaults();
    useAthleteStore.getState().loadStudentSession(ALUMNO_ID, DIA_1_ID);
    const id2 = useAthleteStore.getState().currentSession.id;

    expect(esUuid(id1)).toBe(true);
    expect(esUuid(id2)).toBe(true);
    expect(id2).not.toBe(id1);
  });
});
