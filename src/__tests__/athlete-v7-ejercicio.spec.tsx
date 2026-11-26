import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as soundModule from "@/lib/sound";

vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u-1" } } }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
  SUPABASE_URL: "http://localhost",
  SUPABASE_ANON_KEY: "x",
}));

vi.mock("@/store/use-athlete-store", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-athlete-store")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) => (sel ? sel(mod.useAthleteStore.getState()) : mod.useAthleteStore.getState()),
    mod.useAthleteStore,
  );
  return { ...mod, useAthleteStore: hook };
});

vi.mock("@/store/use-offline-queue", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-offline-queue")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) => (sel ? sel(mod.useOfflineQueueStore.getState()) : mod.useOfflineQueueStore.getState()),
    mod.useOfflineQueueStore,
  );
  return { ...mod, useOfflineQueueStore: hook };
});

import { EjercicioActivo, discosPorLado, parsearPesoDecimal } from "@/components/athlete/ejercicio-activo";
import { RestTimer } from "@/components/athlete/rest-timer";
import { resolverPasoUnilateral, useLiveWorkout } from "@/components/athlete/use-live-workout";
import { useAthleteStore, type LiveWorkoutSession } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

const SESION_BASE: LiveWorkoutSession = {
  id: "11111111-1111-4111-8111-111111111111",
  nombre_rutina: "Lucía Fernández: DÍA 1",
  fecha: "2026-11-17",
  studentId: "22222222-2222-4222-8222-222222222222",
  studentName: "Lucía Fernández",
  dia_id: "33333333-3333-4333-8333-333333333333",
  molestias: [],
  ejercicios: [
    {
      id: "ej-sq",
      ejercicio_id: "cat-sq",
      nombre: "Sentadilla con barra",
      musculos_principales: ["Piernas"],
      descanso_segundos: 150,
      rpe_objetivo: 8,
      repeticiones_objetivo: "6-8",
      series: [
        { numero_serie: 1, peso_kg: 62.5, reps_hechas: 7, rpe_real: 8, completada: false, estimated1RM: 77 },
        { numero_serie: 2, peso_kg: 62.5, reps_hechas: 7, rpe_real: 8, completada: false, estimated1RM: 77 },
      ],
    },
    {
      id: "ej-zb",
      ejercicio_id: "cat-zb",
      nombre: "Zancada búlgara",
      musculos_principales: ["Piernas"],
      descanso_segundos: 90,
      rpe_objetivo: 8,
      repeticiones_objetivo: "10",
      es_unilateral: true,
      series: [
        { numero_serie: 1, peso_kg: 14.5, reps_hechas: 10, rpe_real: 8, completada: false, estimated1RM: 19 },
        { numero_serie: 2, peso_kg: 14.5, reps_hechas: 10, rpe_real: 8, completada: false, estimated1RM: 19 },
      ],
    },
  ],
};

describe("Athlete v7 · FE-05 Pantalla del ejercicio", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
      syncError: null,
    });
    useAthleteStore.setState({
      onboardingCompletado: true,
      diaActivoId: SESION_BASE.dia_id!,
      ejercicioAbiertoId: "ej-sq",
      sessionStartedAt: Date.now() - 60_000,
      nivelVistaAlumno: "SIMPLE",
      vistaRecomendadaCoach: "SIMPLE",
      vistaElegidaPorAlumno: null,
      mostrarTimerDescanso: true,
      toastSesion: null,
      restTimer: {
        isActive: false,
        isPaused: false,
        secondsRemaining: 0,
        totalSeconds: 0,
        exerciseName: "",
        setNumber: 1,
      },
      currentSession: structuredClone(SESION_BASE),
    });
  });

  it("CP1-CP3 & CP5: renderiza cabecera, aproximación en línea, tarjeta de serie y vista Técnica (discosPorLado)", () => {
    const htmlSimple = renderToStaticMarkup(<EjercicioActivo />);
    expect(htmlSimple).toContain("Sentadilla con barra");
    expect(htmlSimple).toContain("Aproximación");
    expect(htmlSimple).toContain("Calculada desde tu peso de trabajo (62,5 kg) · opcional");
    expect(htmlSimple).toContain("Registrar serie 1");
    expect(htmlSimple).not.toContain('data-testid="vista-tecnica"');

    useAthleteStore.setState({ nivelVistaAlumno: "TECNICA" });
    const htmlTec = renderToStaticMarkup(<EjercicioActivo />);
    expect(htmlTec).toContain('data-testid="vista-tecnica"');
    expect(htmlTec).toContain("Carga por lado");
    expect(discosPorLado(70, 20)).toEqual({ perSide: 25, discos: [25], resto: 0 });
  });

  it("CP4: ejercicio unilateral muestra selector Igual D/I | Separar D/I y botón 'Registrar serie 1'", () => {
    useAthleteStore.setState({ ejercicioAbiertoId: "ej-zb" });
    const html = renderToStaticMarkup(<EjercicioActivo />);

    expect(html).toContain('data-testid="badge-unilateral"');
    expect(html).toContain("Por lado");
    expect(html).toContain('data-testid="unilateral-indicator"');
    expect(html).toContain('data-testid="uni-mode-same"');
    expect(html).toContain('data-testid="uni-mode-split"');
    expect(html).toContain("Igual D/I");
    expect(html).toContain("Separar D/I");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Registrar serie 1");
  });

  it("CP2: ingreso manual decimal acepta punto y coma ('62,5' y '62.5' -> 62.5, nunca 625) y actualiza el store", () => {
    expect(parsearPesoDecimal("62,5")).toBe(62.5);
    expect(parsearPesoDecimal("62.5")).toBe(62.5);
    expect(parsearPesoDecimal("12.5")).toBe(12.5);
    expect(parsearPesoDecimal("62.")).toBe(62);
    expect(parsearPesoDecimal("62,")).toBe(62);
    expect(parsearPesoDecimal("")).toBe(0);
    expect(parsearPesoDecimal("-10")).toBe(0);

    let hookApi!: ReturnType<typeof useLiveWorkout>;
    function HookProbe() {
      hookApi = useLiveWorkout();
      return null;
    }

    renderToStaticMarkup(<HookProbe />);
    hookApi.handleDirectUpdatePeso(parsearPesoDecimal("12.5"));
    expect(useAthleteStore.getState().currentSession.ejercicios[0]?.series[0]?.peso_kg).toBe(12.5);

    hookApi.handleDirectUpdatePeso(parsearPesoDecimal("62.5"));
    expect(useAthleteStore.getState().currentSession.ejercicios[0]?.series[0]?.peso_kg).toBe(62.5);

    hookApi.handleDirectUpdatePeso(parsearPesoDecimal("62,5"));
    expect(useAthleteStore.getState().currentSession.ejercicios[0]?.series[0]?.peso_kg).toBe(62.5);

    const html = renderToStaticMarkup(<EjercicioActivo />);
    expect(html).toContain('value="62,5"');
  });

  it("CP4: flujo unilateral D/I guarda el primer lado sin enviar serie al store, cambia a I con toast y al completar ambos envía 1 sola serie con D", () => {
    useAthleteStore.setState({ ejercicioAbiertoId: "ej-zb" });

    let hookApi!: ReturnType<typeof useLiveWorkout>;
    function HookProbe() {
      hookApi = useLiveWorkout();
      return null;
    }

    renderToStaticMarkup(<HookProbe />);
    expect(hookApi.uniSide).toBe("D");
    expect(hookApi.uniPend).toEqual({ D: null, I: null });

    // Primer toque: registra D sin completar ninguna serie en el store ni encolar offline
    hookApi.handleRegistrarUnilateral(false);
    const ejTrasD = useAthleteStore.getState().currentSession.ejercicios.find((e) => e.id === "ej-zb");
    expect(ejTrasD?.series[0]?.completada).toBe(false);
    expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
    expect(useAthleteStore.getState().toastSesion).toEqual({
      mensaje: "Derecha registrada. Ahora izquierda.",
      tipo: "ok",
    });

    // Transición completa D -> I -> 1 serie enviada con payload de D y orden inverso I -> D
    const paso1 = resolverPasoUnilateral("D", { D: null, I: null }, { kg: 14.5, reps: 10 });
    expect(paso1).toEqual({
      completed: false,
      nextPend: { D: { kg: 14.5, reps: 10 }, I: null },
      nextSide: "I",
      toastMensaje: "Derecha registrada. Ahora izquierda.",
    });
    if (paso1.completed) throw new Error("Se esperaba paso intermedio");

    const paso2 = resolverPasoUnilateral(paso1.nextSide, paso1.nextPend, { kg: 12, reps: 8 });
    expect(paso2).toEqual({
      completed: true,
      nextPend: { D: null, I: null },
      nextSide: "D",
      pair: { D: { kg: 14.5, reps: 10 }, I: { kg: 12, reps: 8 } },
      payload: { pesoKg: 14.5, reps: 10 },
    });
    if (!paso2.completed) throw new Error("Se esperaba confirmación del par unilateral");

    const inverso = resolverPasoUnilateral("I", { D: null, I: null }, { kg: 14.5, reps: 10 });
    expect(inverso).toEqual({
      completed: false,
      nextPend: { D: null, I: { kg: 14.5, reps: 10 } },
      nextSide: "D",
      toastMensaje: "Izquierda registrada. Ahora derecha.",
    });

    // Al completar ambos lados se registra 1 sola serie en el store con el payload de D
    hookApi.handleRegistrarSerie(false, paso2.payload);
    const ejTrasAmbos = useAthleteStore.getState().currentSession.ejercicios.find((e) => e.id === "ej-zb");
    expect(ejTrasAmbos?.series[0]?.completada).toBe(true);
    expect(ejTrasAmbos?.series[0]?.peso_kg).toBe(14.5);
    expect(ejTrasAmbos?.series[0]?.reps_hechas).toBe(10);
    expect(ejTrasAmbos?.series[1]?.completada).toBe(false);
    expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(1);

    const html = renderToStaticMarkup(<EjercicioActivo />);
    expect(html).toContain('data-testid="registradas"');
    expect(html).toContain("D 14,5×10 · I 14,5×10");
  });

  it("CP6: Registradas muestra 'En el teléfono' o 'Guardada' según pendingEvents (D3-A) y barra de error", () => {
    useAthleteStore.getState().completeSet("ej-sq", 1);
    useOfflineQueueStore.setState({
      syncError: "Error de red",
      pendingEvents: [
        {
          id: "ev-1",
          action: "WORKOUT_SET_COMPLETED",
          payload: { exerciseId: "ej-sq", setNumber: 1, sessionId: SESION_BASE.id },
          createdAt: "2026-11-17T10:00:00Z",
        },
      ],
    });
    const html = renderToStaticMarkup(<EjercicioActivo />);
    expect(html).toContain('data-testid="sync-error-notice"');
    expect(html).toContain('data-testid="registradas"');
    expect(html).toContain('data-testid="serie-en-telefono"');
    expect(html).toContain("En el teléfono");
  });

  it("CP7: RestTimer muestra tiempo transcurrido en .a-restbar y tickTimer al terminar dispara sonido, vibración y toast", () => {
    const soundSpy = vi.spyOn(soundModule, "playRestTimerAlert");
    const vibSpy = vi.spyOn(soundModule, "triggerHapticVibration");

    useAthleteStore.getState().startRestTimer(90, "Sentadilla con barra", 2);
    useAthleteStore.getState().tickTimer();

    const html = renderToStaticMarkup(<RestTimer />);
    expect(html).toContain('class="a-restbar"');
    expect(html).toContain("0:01");
    expect(html).toContain("de 1:30 · faltan 1:29");

    useAthleteStore.getState().startRestTimer(1, "Sentadilla con barra", 2);
    useAthleteStore.getState().tickTimer();

    expect(soundSpy).toHaveBeenCalledTimes(1);
    expect(vibSpy).toHaveBeenCalledWith([300, 150, 300]);
    expect(useAthleteStore.getState().toastSesion).toEqual({
      mensaje: "Terminó el descanso. A la serie.",
      tipo: "ok",
    });
  });
});
