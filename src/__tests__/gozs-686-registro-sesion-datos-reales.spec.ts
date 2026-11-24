import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/lib/supabase/client";
import { setStorageUser } from "@/lib/user-storage";
import {
  DEFAULT_ATHLETE_ID,
  useAthleteStore,
  type LiveWorkoutSession,
} from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

const ALUMNO_REAL_ID = "11111111-1111-4111-8111-111111111111";
const PLAN_ID = "22222222-2222-4222-8222-222222222222";
const DIA_ID = "33333333-3333-4333-8333-333333333333";
const EJ_WARMUP_ID = "44444444-4444-4444-8444-444444444441";
const EJ_NORMAL_ID = "44444444-4444-4444-8444-444444444442";
const EJ_DROP_ID = "44444444-4444-4444-8444-444444444443";
const ER_WARMUP_ID = "55555555-5555-4555-8555-555555555551";
const ER_NORMAL_ID = "55555555-5555-4555-8555-555555555552";
const ER_DROP_ID = "55555555-5555-4555-8555-555555555553";

function construirPlanPrueba() {
  return {
    alumnos: [
      {
        id: ALUMNO_REAL_ID,
        nombre_completo: "Alumno Real",
        nivel_vista_alumno: "TECNICA" as const,
      },
    ],
    planes: [
      {
        id: PLAN_ID,
        alumno_id: ALUMNO_REAL_ID,
        nombre: "Plan Real",
        estado: "ACTIVO" as const,
      },
    ],
    dias: [{ id: DIA_ID, plan_id: PLAN_ID, orden: 1, nombre: "Día 1" }],
    ejerciciosEnRutina: [
      {
        id: ER_WARMUP_ID,
        dia_id: DIA_ID,
        ejercicio_id: EJ_WARMUP_ID,
        orden: 1,
        series: 1,
        repeticiones: "10",
        descanso_segundos: 60,
        rpe_objetivo: 6,
        tipo_serie: "WARMUP",
      },
      {
        id: ER_NORMAL_ID,
        dia_id: DIA_ID,
        ejercicio_id: EJ_NORMAL_ID,
        orden: 2,
        series: 1,
        repeticiones: "5",
        descanso_segundos: 90,
        rpe_objetivo: "8-9",
        tipo_serie: "NORMAL",
      },
      {
        id: ER_DROP_ID,
        dia_id: DIA_ID,
        ejercicio_id: EJ_DROP_ID,
        orden: 3,
        series: 1,
        repeticiones: "8",
        descanso_segundos: 60,
        rpe_objetivo: undefined,
        tipo_serie: "DROPSET",
      },
    ],
    ejercicios: [
      { id: EJ_WARMUP_ID, nombre: "Movilidad con barra", musculos_principales: ["Piernas"] },
      { id: EJ_NORMAL_ID, nombre: "Sentadilla trasera", musculos_principales: ["Piernas"] },
      { id: EJ_DROP_ID, nombre: "Extensión de tríceps", musculos_principales: ["Tríceps"] },
    ],
  };
}

describe("GOZS-686 · F-9/F-10/F-11: Registro de sesión con datos reales", () => {
  beforeEach(() => {
    setStorageUser(null);
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
      syncError: null,
    });
    useAthleteStore.getState().resetSessionToDefaults();
    useAthleteStore.setState({
      planAlumno: null,
      sesionesCompletadas: [],
      historialSesiones: [],
      cuestionarioInicial: null,
      toastSesion: null,
      sessionStartedAt: null,
    });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    setStorageUser(null);
    vi.restoreAllMocks();
  });

  describe("F-9: Duración real de la sesión desde inicio y fin", () => {
    it("GIVEN una sesión nueva WHEN se guarda THEN duracion_minutos sale de la hora de inicio y de fin", async () => {
      const sesionUpserts: any[] = [];
      vi.spyOn(supabase, "from").mockImplementation(((table: string) => ({
        upsert: vi.fn().mockImplementation(async (payload: any) => {
          if (table === "registro_sesiones") sesionUpserts.push(payload);
          return { error: null };
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [] }),
        }),
      })) as any);

      useAthleteStore.setState({
        planAlumno: construirPlanPrueba() as any,
      });
      useAthleteStore.getState().empezarDia(DIA_ID);

      const inicioMs = Date.now() - 32 * 60_000;
      useAthleteStore.setState({ sessionStartedAt: inicioMs });

      const ejNormal = useAthleteStore
        .getState()
        .currentSession.ejercicios.find((e) => e.id === ER_NORMAL_ID)!;
      useAthleteStore.getState().updateSetField(ejNormal.id, 1, "peso_kg", 100);
      useAthleteStore.getState().updateSetField(ejNormal.id, 1, "reps_hechas", 5);
      useAthleteStore.getState().completeSet(ejNormal.id, 1);

      const res = await useAthleteStore.getState().syncSessionToSupabase();
      expect(res.success).toBe(true);
      expect(sesionUpserts.length).toBeGreaterThanOrEqual(1);
      expect(sesionUpserts[0].duracion_minutos).toBe(32);

      useAthleteStore.getState().marcarDiaCompletado(DIA_ID);
      const entradaHistorial = useAthleteStore.getState().historialSesiones[0];
      expect(entradaHistorial?.sesion.duracion_minutos).toBe(32);
    });

    it("usa el completedAt más temprano si sessionStartedAt no está presente, y nunca hardcodea 45", async () => {
      const sesionUpserts: any[] = [];
      vi.spyOn(supabase, "from").mockImplementation(((table: string) => ({
        upsert: vi.fn().mockImplementation(async (payload: any) => {
          if (table === "registro_sesiones") sesionUpserts.push(payload);
          return { error: null };
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [] }),
        }),
      })) as any);

      const sesionSinStart: LiveWorkoutSession = {
        id: "66666666-6666-4666-8666-666666666666",
        nombre_rutina: "Día 1",
        fecha: "2026-11-21",
        studentId: ALUMNO_REAL_ID,
        dia_id: DIA_ID,
        ejercicios: [
          {
            id: ER_NORMAL_ID,
            ejercicio_id: EJ_NORMAL_ID,
            nombre: "Sentadilla",
            musculos_principales: ["Piernas"],
            descanso_segundos: 90,
            rpe_objetivo: 8,
            repeticiones_objetivo: "5",
            series: [
              {
                numero_serie: 1,
                peso_kg: 100,
                reps_hechas: 5,
                rpe_real: null,
                completada: true,
                estimated1RM: 117,
                completedAt: new Date(Date.now() - 18 * 60_000).toISOString(),
                set_type: "NORMAL",
              },
            ],
          },
        ],
      };

      useAthleteStore.setState({
        currentSession: sesionSinStart,
        sessionStartedAt: null,
      });

      await useAthleteStore.getState().syncSessionToSupabase();
      expect(sesionUpserts[0].duracion_minutos).toBe(18);
    });
  });

  describe("F-10: rpe_real NULL si no se confirma y set_type fiel al plan", () => {
    it("GIVEN un alumno que no confirma el RPE WHEN se guarda la serie THEN rpe_real es NULL", async () => {
      const seriesUpserts: any[] = [];
      vi.spyOn(supabase, "from").mockImplementation(((table: string) => ({
        upsert: vi.fn().mockImplementation(async (payload: any) => {
          if (table === "registro_series") {
            if (Array.isArray(payload)) seriesUpserts.push(...payload);
            else seriesUpserts.push(payload);
          }
          return { error: null };
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [] }),
        }),
      })) as any);

      useAthleteStore.setState({ planAlumno: construirPlanPrueba() as any });
      useAthleteStore.getState().loadStudentSession(ALUMNO_REAL_ID, DIA_ID);

      // Todas las series cargadas del plan arrancan con rpe_real = null (sin precargar objetivo ni 7.5)
      const ejercicios = useAthleteStore.getState().currentSession.ejercicios;
      for (const ej of ejercicios) {
        for (const s of ej.series) {
          expect(s.rpe_real).toBeNull();
        }
      }

      // Completa serie normal sin tocar RPE, y confirma RPE 8.5 en dropset
      useAthleteStore.getState().updateSetField(ER_NORMAL_ID, 1, "peso_kg", 100);
      useAthleteStore.getState().updateSetField(ER_NORMAL_ID, 1, "reps_hechas", 5);
      useAthleteStore.getState().completeSet(ER_NORMAL_ID, 1);

      useAthleteStore.getState().updateSetField(ER_DROP_ID, 1, "peso_kg", 40);
      useAthleteStore.getState().updateSetField(ER_DROP_ID, 1, "reps_hechas", 8);
      useAthleteStore.getState().updateSetField(ER_DROP_ID, 1, "rpe_real", 8.5);
      useAthleteStore.getState().completeSet(ER_DROP_ID, 1);

      const eventos = useOfflineQueueStore.getState().pendingEvents;
      const evNormal = eventos.find((e) => e.payload.exerciseId === ER_NORMAL_ID);
      const evDrop = eventos.find((e) => e.payload.exerciseId === ER_DROP_ID);
      expect(evNormal?.payload.rpe).toBeNull();
      expect(evDrop?.payload.rpe).toBe(8.5);

      await useAthleteStore.getState().syncSessionToSupabase();
      const rowNormal = seriesUpserts.find((r) => r.ejercicio_id === EJ_NORMAL_ID);
      const rowDrop = seriesUpserts.find((r) => r.ejercicio_id === EJ_DROP_ID);
      expect(rowNormal?.rpe_real).toBeNull();
      expect(rowDrop?.rpe_real).toBe(8.5);

      // Calentamientos agregados tampoco fuerzan RPE 6.0 si no se confirmó
      useAthleteStore.getState().applyWarmupSetsToExercise(ER_NORMAL_ID, [
        { setNumber: 1, peso_kg: 20, reps: 10 },
      ]);
      const warmupAgregado = useAthleteStore
        .getState()
        .currentSession.ejercicios.find((e) => e.id === ER_NORMAL_ID)!.series[0]!;
      expect(warmupAgregado.rpe_real).toBeNull();

      useAthleteStore.getState().registerWarmupSet(ER_NORMAL_ID, { peso_kg: 40, reps: 5 });
      const warmupRegistrado = useAthleteStore
        .getState()
        .currentSession.ejercicios.find((e) => e.id === ER_NORMAL_ID)!
        .series.find((s) => s.completada && s.peso_kg === 40)!;
      expect(warmupRegistrado.rpe_real).toBeNull();
    });

    it("GIVEN un plan con calentamientos WHEN se registran THEN set_type respeta el tipo_serie del plan y el volumen efectivo los excluye", async () => {
      const sesionUpserts: any[] = [];
      const seriesUpserts: any[] = [];
      vi.spyOn(supabase, "from").mockImplementation(((table: string) => ({
        upsert: vi.fn().mockImplementation(async (payload: any) => {
          if (table === "registro_sesiones") sesionUpserts.push(payload);
          if (table === "registro_series") {
            if (Array.isArray(payload)) seriesUpserts.push(...payload);
            else seriesUpserts.push(payload);
          }
          return { error: null };
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [] }),
        }),
      })) as any);

      useAthleteStore.setState({ planAlumno: construirPlanPrueba() as any });
      useAthleteStore.getState().loadStudentSession(ALUMNO_REAL_ID, DIA_ID);

      const session = useAthleteStore.getState().currentSession;
      const ejWarmup = session.ejercicios.find((e) => e.id === ER_WARMUP_ID)!;
      const ejNormal = session.ejercicios.find((e) => e.id === ER_NORMAL_ID)!;
      const ejDrop = session.ejercicios.find((e) => e.id === ER_DROP_ID)!;

      expect(ejWarmup.series[0]?.set_type).toBe("WARMUP");
      expect(ejNormal.series[0]?.set_type).toBe("NORMAL");
      expect(ejDrop.series[0]?.set_type).toBe("DROPSET");

      // Warmup: 20 kg * 10 = 200 kg (NO efectivo)
      useAthleteStore.getState().updateSetField(ER_WARMUP_ID, 1, "peso_kg", 20);
      useAthleteStore.getState().updateSetField(ER_WARMUP_ID, 1, "reps_hechas", 10);
      useAthleteStore.getState().completeSet(ER_WARMUP_ID, 1);

      // Normal: 100 kg * 5 = 500 kg (efectivo)
      useAthleteStore.getState().updateSetField(ER_NORMAL_ID, 1, "peso_kg", 100);
      useAthleteStore.getState().updateSetField(ER_NORMAL_ID, 1, "reps_hechas", 5);
      useAthleteStore.getState().completeSet(ER_NORMAL_ID, 1);

      // Dropset: 40 kg * 8 = 320 kg (efectivo)
      useAthleteStore.getState().updateSetField(ER_DROP_ID, 1, "peso_kg", 40);
      useAthleteStore.getState().updateSetField(ER_DROP_ID, 1, "reps_hechas", 8);
      useAthleteStore.getState().completeSet(ER_DROP_ID, 1);

      // En cola offline también conserva WARMUP y DROPSET
      const eventos = useOfflineQueueStore.getState().pendingEvents;
      expect(eventos.find((e) => e.payload.exerciseId === ER_WARMUP_ID)?.payload.setType).toBe("WARMUP");
      expect(eventos.find((e) => e.payload.exerciseId === ER_DROP_ID)?.payload.setType).toBe("DROPSET");

      await useAthleteStore.getState().syncSessionToSupabase();
      const rowWarmup = seriesUpserts.find((r) => r.ejercicio_id === EJ_WARMUP_ID);
      const rowNormal = seriesUpserts.find((r) => r.ejercicio_id === EJ_NORMAL_ID);
      const rowDrop = seriesUpserts.find((r) => r.ejercicio_id === EJ_DROP_ID);
      expect(rowWarmup?.set_type).toBe("WARMUP");
      expect(rowNormal?.set_type).toBe("NORMAL");
      expect(rowDrop?.set_type).toBe("DROPSET");

      // GOZS-701: el volumen lo calcula la base (trigger); el cliente no lo envía.
      expect(sesionUpserts[0]).not.toHaveProperty("volumen_total_kg");
      expect(sesionUpserts[0]).not.toHaveProperty("effective_volume_kg");

      useAthleteStore.getState().marcarDiaCompletado(DIA_ID);
      const hist = useAthleteStore.getState().historialSesiones[0]!;
      expect(hist.sesion.volumen_total_kg).toBe(1020);
      expect(hist.sesion.effective_volume_kg).toBe(820);
    });

    it("flushQueue de la cola offline envía rpe_real: null si no se confirmó y set_type fiel al plan", async () => {
      const seriesUpserts: any[] = [];
      vi.spyOn(supabase, "from").mockImplementation(((table: string) => ({
        upsert: vi.fn().mockImplementation(async (payload: any) => {
          if (table === "registro_series") {
            if (Array.isArray(payload)) seriesUpserts.push(...payload);
            else seriesUpserts.push(payload);
          }
          return { error: null };
        }),
      })) as any);

      useAthleteStore.setState({ planAlumno: construirPlanPrueba() as any });
      useAthleteStore.getState().loadStudentSession(ALUMNO_REAL_ID, DIA_ID);

      useAthleteStore.getState().updateSetField(ER_WARMUP_ID, 1, "peso_kg", 20);
      useAthleteStore.getState().updateSetField(ER_WARMUP_ID, 1, "reps_hechas", 10);
      useAthleteStore.getState().completeSet(ER_WARMUP_ID, 1);

      await useOfflineQueueStore.getState().flushQueue();

      expect(seriesUpserts).toHaveLength(1);
      expect(seriesUpserts[0]).toMatchObject({
        ejercicio_id: EJ_WARMUP_ID,
        rpe_real: null,
        set_type: "WARMUP",
      });
    });
  });

  describe("F-11: Sin fallback a DEFAULT_ATHLETE_ID en escrituras", () => {
    it("GIVEN que falta el id del alumno WHEN se intenta escribir THEN no se usa un id demo: la escritura se rechaza y se avisa", async () => {
      const fromSpy = vi.spyOn(supabase, "from");

      useAthleteStore.setState((s) => ({
        planAlumno: null,
        diaSugeridoId: "dia-sug",
        motivoCambioDia: "POCO_TIEMPO",
        currentSession: {
          ...s.currentSession,
          studentId: undefined,
        },
      }));

      // 1. empezarDia sin studentId rechaza y avisa
      useAthleteStore.getState().empezarDia(DIA_ID);
      expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
      expect(useAthleteStore.getState().toastSesion?.mensaje).toBeTruthy();
      expect(fromSpy).not.toHaveBeenCalled();

      // 2. syncSessionToSupabase sin studentId rechaza y avisa
      useAthleteStore.setState({ toastSesion: null });
      useOfflineQueueStore.getState().clearSyncError();
      const syncRes = await useAthleteStore.getState().syncSessionToSupabase();
      expect(syncRes.success).toBe(false);
      expect(syncRes.error).toBeTruthy();
      expect(useOfflineQueueStore.getState().syncError).toBeTruthy();
      expect(useAthleteStore.getState().toastSesion?.mensaje).toBeTruthy();
      expect(fromSpy).not.toHaveBeenCalled();

      // 3. marcarDiaCompletado sin studentId rechaza y no guarda DEFAULT_ATHLETE_ID en historial
      useAthleteStore.setState({ toastSesion: null });
      useOfflineQueueStore.getState().clearSyncError();
      useAthleteStore.getState().marcarDiaCompletado(DIA_ID);
      expect(useAthleteStore.getState().sesionesCompletadas).toHaveLength(0);
      expect(useAthleteStore.getState().historialSesiones).toHaveLength(0);
      expect(useOfflineQueueStore.getState().syncError).toBeTruthy();
      expect(useAthleteStore.getState().toastSesion?.mensaje).toBeTruthy();

      // 4. saveCuestionarioInicial sin studentId rechaza y avisa
      useAthleteStore.setState({ toastSesion: null });
      useOfflineQueueStore.getState().clearSyncError();
      const cuestRes = await useAthleteStore.getState().saveCuestionarioInicial({
        objetivo_principal: "Fuerza",
      });
      expect(cuestRes.success).toBe(false);
      expect(cuestRes.error).toBeTruthy();
      expect(useAthleteStore.getState().cuestionarioInicial).toBeNull();
      expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
      expect(useOfflineQueueStore.getState().syncError).toBeTruthy();
      expect(fromSpy).not.toHaveBeenCalled();

      // 5. adjuntarVideoASerie sin studentId rechaza y avisa
      useAthleteStore.setState({ toastSesion: null });
      useOfflineQueueStore.getState().clearSyncError();
      const ejId = useAthleteStore.getState().currentSession.ejercicios[0]!.id;
      const vidRes = await useAthleteStore
        .getState()
        .adjuntarVideoASerie(ejId, 1, { tipo: "enlace", url: "https://youtu.be/abc123" });
      expect(vidRes).toBe("invalido");
      expect(useOfflineQueueStore.getState().syncError).toBeTruthy();
      expect(useAthleteStore.getState().toastSesion?.mensaje).toBeTruthy();

      // Ninguna escritura tocó DEFAULT_ATHLETE_ID
      const serialized = JSON.stringify({
        eventos: useOfflineQueueStore.getState().pendingEvents,
        historial: useAthleteStore.getState().historialSesiones,
        cuestionario: useAthleteStore.getState().cuestionarioInicial,
      });
      expect(serialized).not.toContain(DEFAULT_ATHLETE_ID);
    });
  });
});
