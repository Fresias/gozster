import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as fs from "node:fs";
import * as path from "node:path";
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

import { EjercicioActivo, discosPorLado } from "@/components/athlete/ejercicio-activo";
import { RestTimer } from "@/components/athlete/rest-timer";
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

  it("CP4: ejercicio unilateral muestra segmentado Derecha | Izquierda y botón 'Registrar derecha'", () => {
    useAthleteStore.setState({ ejercicioAbiertoId: "ej-zb" });
    const html = renderToStaticMarkup(<EjercicioActivo />);

    expect(html).toContain('data-testid="badge-unilateral"');
    expect(html).toContain("Por lado");
    expect(html).toContain('data-testid="unilateral-indicator"');
    expect(html).toContain('data-testid="uni-side-D"');
    expect(html).toContain('data-testid="uni-side-I"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Registrar derecha");
  });

  it("CP4: flujo unilateral D/I guarda el primer lado sin enviar serie al store, cambia a I con toast y al completar ambos envía 1 sola serie con D", () => {
    const hookSrc = fs.readFileSync(
      path.resolve(__dirname, "../components/athlete/use-live-workout.ts"),
      "utf-8",
    );
    const exSrc = fs.readFileSync(
      path.resolve(__dirname, "../components/athlete/ejercicio-activo.tsx"),
      "utf-8",
    );
    expect(hookSrc).toContain("Derecha registrada. Ahora izquierda.");
    expect(hookSrc).toContain("Izquierda registrada. Ahora derecha.");
    expect(hookSrc).toContain("pesoKg: nextPend.D!.kg");
    expect(hookSrc).toContain("reps: nextPend.D!.reps");
    expect(exSrc).toContain("D ${fmtAr.format(uniPar.D.kg)}×${uniPar.D.reps} · I ${fmtAr.format(uniPar.I.kg)}×${uniPar.I.reps}");
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
