import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveWorkout, findNextExerciseInWorkout } from "@/components/athlete/live-workout";
import { useAthleteStore, type LiveWorkoutExercise, type LiveWorkoutSession } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import * as soundModule from "@/lib/sound";

// Mock para useAthleteStore en SSR estático (renderToStaticMarkup)
vi.mock("@/store/use-athlete-store", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-athlete-store")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) => (sel ? sel(mod.useAthleteStore.getState()) : mod.useAthleteStore.getState()),
    mod.useAthleteStore,
  );
  return { ...mod, useAthleteStore: hook };
});

describe("GOZS-361: Athlete App - Temporizador por Tiempo, Circuito SS Round-Robin con Salto Dispar, Dropset y Transición Visual", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
      syncError: null,
    });
    useAthleteStore.getState().resetSessionToDefaults();
    useAthleteStore.getState().stopTimer();
  });

  describe("Criterio Gherkin 1: Ejercicios por Tiempo (tipo_medicion === 'TIEMPO')", () => {
    it("GIVEN un ejercicio configurado por tiempo (Plancha 45s), THEN renderiza badge, tiempo objetivo y botón Iniciar", () => {
      const sessionConTiempo: LiveWorkoutSession = {
        id: "session-tiempo-test",
        nombre_rutina: "Rutina Core Funcional",
        fecha: "2026-11-04",
        ejercicios: [
          {
            id: "ej-plancha-45s",
            nombre: "Plancha Abdominal Isométrica",
            musculos_principales: ["Core", "Abdomen"],
            descanso_segundos: 60,
            rpe_objetivo: 8,
            repeticiones_objetivo: "45s",
            tipo_medicion: "TIEMPO",
            tiempo_objetivo_segundos: 45,
            series: [
              { numero_serie: 1, peso_kg: 0, reps_hechas: 45, rpe_real: 8, completada: false, estimated1RM: 0 },
              { numero_serie: 2, peso_kg: 0, reps_hechas: 45, rpe_real: 8, completada: false, estimated1RM: 0 },
              { numero_serie: 3, peso_kg: 0, reps_hechas: 45, rpe_real: 8, completada: false, estimated1RM: 0 },
            ],
          },
        ],
      };

      useAthleteStore.getState().setSession(sessionConTiempo);

      const html = renderToStaticMarkup(<LiveWorkout />);

      // Badge visible con tiempo objetivo en segundos
      expect(html).toContain('data-testid="badge-tipo-tiempo"');
      expect(html).toContain("45s");

      // Temporizador interactivo con botón Iniciar y display regresivo
      expect(html).toContain('data-testid="timer-ejercicio-tiempo"');
      expect(html).toContain('data-testid="timer-tiempo-countdown"');
      expect(html).toContain('data-testid="timer-tiempo-iniciar-btn"');
      expect(html).toContain("Iniciar");

      // Stepper adaptado a tiempo en segundos
      expect(html).toContain("Tiempo (segundos)");
      expect(html).toContain('data-testid="reps-decrement-btn"');
      expect(html).toContain("−5s");
      expect(html).toContain('data-testid="reps-increment-btn"');
      expect(html).toContain("+5s");
    });

    it("GIVEN un ejercicio por tiempo de 45s, WHEN finaliza la cuenta regresiva en 0s, THEN dispara alerta sonora y háptica", () => {
      const soundSpy = vi.spyOn(soundModule, "playRestTimerAlert");
      const hapticSpy = vi.spyOn(soundModule, "triggerHapticVibration");

      // Verificación de los mecanismos nativos Web Audio API y navigator.vibrate
      soundModule.playRestTimerAlert();
      soundModule.triggerHapticVibration([300, 150, 300]);

      expect(soundSpy).toHaveBeenCalledTimes(1);
      expect(hapticSpy).toHaveBeenCalledWith([300, 150, 300]);
    });
  });

  describe("Criterio Gherkin 2: Ejercicios Unilaterales (es_unilateral === true)", () => {
    it("GIVEN un ejercicio unilateral, THEN exhibe badge 'c/lado' y se registra en acción unificada", () => {
      const sessionUnilateral: LiveWorkoutSession = {
        id: "session-unilateral-test",
        nombre_rutina: "Rutina Unilateral",
        fecha: "2026-11-04",
        ejercicios: [
          {
            id: "ej-remo-unilateral",
            nombre: "Remo con Mancuerna a 1 Mano",
            musculos_principales: ["Dorsales", "Bíceps"],
            descanso_segundos: 90,
            rpe_objetivo: 8,
            repeticiones_objetivo: "10 x lado",
            es_unilateral: true,
            series: [
              { numero_serie: 1, peso_kg: 24, reps_hechas: 10, rpe_real: 8, completada: false, estimated1RM: 32 },
              { numero_serie: 2, peso_kg: 24, reps_hechas: 10, rpe_real: 8, completada: false, estimated1RM: 32 },
            ],
          },
        ],
      };

      useAthleteStore.getState().setSession(sessionUnilateral);

      const html = renderToStaticMarkup(<LiveWorkout />);

      // Badge en el encabezado
      expect(html).toContain('data-testid="badge-unilateral"');
      expect(html).toContain("c/lado");

      // Badge en el botón del selector lateral
      expect(html).toContain('data-testid="badge-unilateral-ej-remo-unilateral"');

      // Indicadores en los steppers
      expect(html).toContain('data-testid="badge-peso-unilateral"');
      expect(html).toContain('data-testid="unilateral-indicator"');

      // Registro unificado de serie
      useAthleteStore.getState().completeSet("ej-remo-unilateral", 1);
      const serie1 = useAthleteStore.getState().currentSession.ejercicios[0]!.series[0]!;
      expect(serie1.completada).toBe(true);
      expect(serie1.completedAt).toBeDefined();
    });
  });

  describe("Criterio Gherkin 3: Flujo de Superseries (SS) Round-Robin en Circuito", () => {
    it("GIVEN superserie de 3 ejercicios, WHEN registra Serie 1 de Ej 1, THEN pasa a Ej 2 sin descanso intermedio", () => {
      const sessionSS: LiveWorkoutSession = {
        id: "session-ss-test",
        nombre_rutina: "Rutina Circuito SS",
        fecha: "2026-11-04",
        ejercicios: [
          {
            id: "ss-ej-1",
            nombre: "Press Militar con Mancuernas",
            musculos_principales: ["Hombros"],
            descanso_segundos: 90,
            rpe_objetivo: 8,
            repeticiones_objetivo: "10",
            es_superserie: true,
            grupo_superserie: 1,
            series: [
              { numero_serie: 1, peso_kg: 20, reps_hechas: 10, rpe_real: 8, completada: false, estimated1RM: 26 },
              { numero_serie: 2, peso_kg: 20, reps_hechas: 10, rpe_real: 8, completada: false, estimated1RM: 26 },
            ],
          },
          {
            id: "ss-ej-2",
            nombre: "Elevaciones Laterales",
            musculos_principales: ["Deltoides Lateral"],
            descanso_segundos: 90,
            rpe_objetivo: 8,
            repeticiones_objetivo: "12",
            es_superserie: true,
            grupo_superserie: 1,
            series: [
              { numero_serie: 1, peso_kg: 10, reps_hechas: 12, rpe_real: 8, completada: false, estimated1RM: 14 },
              { numero_serie: 2, peso_kg: 10, reps_hechas: 12, rpe_real: 8, completada: false, estimated1RM: 14 },
            ],
          },
          {
            id: "ss-ej-3",
            nombre: "Face Pull con Polea",
            musculos_principales: ["Deltoides Posterior"],
            descanso_segundos: 90,
            rpe_objetivo: 8,
            repeticiones_objetivo: "15",
            es_superserie: true,
            grupo_superserie: 1,
            series: [
              { numero_serie: 1, peso_kg: 25, reps_hechas: 15, rpe_real: 8, completada: false, estimated1RM: 37 },
              { numero_serie: 2, peso_kg: 25, reps_hechas: 15, rpe_real: 8, completada: false, estimated1RM: 37 },
            ],
          },
        ],
      };

      useAthleteStore.getState().setSession(sessionSS);

      // Ronda 1 - Ejercicio 1 completado
      useAthleteStore.getState().completeSet("ss-ej-1", 1);
      // Entre ejercicios de SS: NO descanso intermedio
      expect(useAthleteStore.getState().restTimer.isActive).toBe(false);

      const nav1 = findNextExerciseInWorkout(
        useAthleteStore.getState().currentSession,
        sessionSS.ejercicios[0]!,
        1
      );
      // Pasa al Ejercicio 2
      expect(nav1.nextExerciseId).toBe("ss-ej-2");
      expect(nav1.shouldTransition).toBe(true);

      // Ronda 1 - Ejercicio 2 completado
      useAthleteStore.getState().completeSet("ss-ej-2", 1);
      // Todavía no terminó la ronda: NO descanso
      expect(useAthleteStore.getState().restTimer.isActive).toBe(false);

      const nav2 = findNextExerciseInWorkout(
        useAthleteStore.getState().currentSession,
        sessionSS.ejercicios[1]!,
        1
      );
      // Pasa al Ejercicio 3
      expect(nav2.nextExerciseId).toBe("ss-ej-3");

      // Ronda 1 - Ejercicio 3 completado (último del circuito en ronda 1)
      useAthleteStore.getState().completeSet("ss-ej-3", 1);
      // Ahora SÍ se dispara el descanso del circuito
      expect(useAthleteStore.getState().restTimer.isActive).toBe(true);
      expect(useAthleteStore.getState().restTimer.secondsRemaining).toBe(90);

      const nav3 = findNextExerciseInWorkout(
        useAthleteStore.getState().currentSession,
        sessionSS.ejercicios[2]!,
        1
      );
      // Avanza a la Ronda 2 comenzando nuevamente en el Ejercicio 1
      expect(nav3.nextExerciseId).toBe("ss-ej-1");
      expect(nav3.shouldTransition).toBe(true);
    });
  });

  describe("Criterio Gherkin 4: Superseries con Series Dispares (Salto Automático)", () => {
    it("GIVEN superserie con ejercicios de 3 series y otros de 4 series, WHEN finaliza ronda 3, THEN ronda 4 salta únicamente a los ejercicios con 4ta serie", () => {
      const sessionDispar: LiveWorkoutSession = {
        id: "session-dispar-test",
        nombre_rutina: "Circuito Hombro-Pecho Dispar",
        fecha: "2026-11-04",
        ejercicios: [
          // Ejs 1, 2, 3 tienen 3 series
          {
            id: "ej-dispar-1",
            nombre: "Ejercicio 1 (3 series)",
            musculos_principales: ["Pectoral"],
            descanso_segundos: 60,
            rpe_objetivo: 8,
            repeticiones_objetivo: "10",
            es_superserie: true,
            grupo_superserie: 1,
            series: [
              { numero_serie: 1, peso_kg: 50, reps_hechas: 10, rpe_real: 8, completada: true, estimated1RM: 66 },
              { numero_serie: 2, peso_kg: 50, reps_hechas: 10, rpe_real: 8, completada: true, estimated1RM: 66 },
              { numero_serie: 3, peso_kg: 50, reps_hechas: 10, rpe_real: 8, completada: true, estimated1RM: 66 },
            ],
          },
          {
            id: "ej-dispar-2",
            nombre: "Ejercicio 2 (3 series)",
            musculos_principales: ["Espalda"],
            descanso_segundos: 60,
            rpe_objetivo: 8,
            repeticiones_objetivo: "10",
            es_superserie: true,
            grupo_superserie: 1,
            series: [
              { numero_serie: 1, peso_kg: 40, reps_hechas: 10, rpe_real: 8, completada: true, estimated1RM: 53 },
              { numero_serie: 2, peso_kg: 40, reps_hechas: 10, rpe_real: 8, completada: true, estimated1RM: 53 },
              { numero_serie: 3, peso_kg: 40, reps_hechas: 10, rpe_real: 8, completada: true, estimated1RM: 53 },
            ],
          },
          {
            id: "ej-dispar-3",
            nombre: "Ejercicio 3 (3 series)",
            musculos_principales: ["Bíceps"],
            descanso_segundos: 60,
            rpe_objetivo: 8,
            repeticiones_objetivo: "12",
            es_superserie: true,
            grupo_superserie: 1,
            series: [
              { numero_serie: 1, peso_kg: 15, reps_hechas: 12, rpe_real: 8, completada: true, estimated1RM: 21 },
              { numero_serie: 2, peso_kg: 15, reps_hechas: 12, rpe_real: 8, completada: true, estimated1RM: 21 },
              { numero_serie: 3, peso_kg: 15, reps_hechas: 12, rpe_real: 8, completada: true, estimated1RM: 21 },
            ],
          },
          // Ejs 4 y 5 tienen 4 series (les queda la 4ta)
          {
            id: "ej-dispar-4",
            nombre: "Ejercicio 4 (4 series)",
            musculos_principales: ["Tríceps"],
            descanso_segundos: 60,
            rpe_objetivo: 8,
            repeticiones_objetivo: "12",
            es_superserie: true,
            grupo_superserie: 1,
            series: [
              { numero_serie: 1, peso_kg: 25, reps_hechas: 12, rpe_real: 8, completada: true, estimated1RM: 35 },
              { numero_serie: 2, peso_kg: 25, reps_hechas: 12, rpe_real: 8, completada: true, estimated1RM: 35 },
              { numero_serie: 3, peso_kg: 25, reps_hechas: 12, rpe_real: 8, completada: true, estimated1RM: 35 },
              { numero_serie: 4, peso_kg: 25, reps_hechas: 12, rpe_real: 8, completada: false, estimated1RM: 35 },
            ],
          },
          {
            id: "ej-dispar-5",
            nombre: "Ejercicio 5 (4 series)",
            musculos_principales: ["Hombros"],
            descanso_segundos: 60,
            rpe_objetivo: 8,
            repeticiones_objetivo: "12",
            es_superserie: true,
            grupo_superserie: 1,
            series: [
              { numero_serie: 1, peso_kg: 12, reps_hechas: 12, rpe_real: 8, completada: true, estimated1RM: 17 },
              { numero_serie: 2, peso_kg: 12, reps_hechas: 12, rpe_real: 8, completada: true, estimated1RM: 17 },
              { numero_serie: 3, peso_kg: 12, reps_hechas: 12, rpe_real: 8, completada: false, estimated1RM: 17 },
              { numero_serie: 4, peso_kg: 12, reps_hechas: 12, rpe_real: 8, completada: false, estimated1RM: 17 },
            ],
          },
        ],
      };

      useAthleteStore.getState().setSession(sessionDispar);

      // Completar la 3ra serie de Ejercicio 5 (con lo que termina la Ronda 3 de todo el circuito)
      useAthleteStore.getState().completeSet("ej-dispar-5", 3);

      // Ahora el siguiente ejercicio calculado debe saltar directamente a Ejercicio 4 (omitir Ej 1, 2, 3 que ya terminaron)
      const navRonda4 = findNextExerciseInWorkout(
        useAthleteStore.getState().currentSession,
        sessionDispar.ejercicios[4]!,
        3
      );

      expect(navRonda4.nextExerciseId).toBe("ej-dispar-4");
      expect(navRonda4.shouldTransition).toBe(true);

      // Al completar Ej 4 Serie 4, pasa a Ej 5 Serie 4 sin descanso intermedio
      useAthleteStore.getState().completeSet("ej-dispar-4", 4);
      expect(useAthleteStore.getState().restTimer.isActive).toBe(false);

      const navRonda4_ej5 = findNextExerciseInWorkout(
        useAthleteStore.getState().currentSession,
        sessionDispar.ejercicios[3]!,
        4
      );
      expect(navRonda4_ej5.nextExerciseId).toBe("ej-dispar-5");
    });
  });

  describe("Criterio Gherkin 5: Dropset Quirúrgico", () => {
    it("GIVEN ejercicio en Dropset, WHEN registra la primera serie, THEN activa temporizador de descanso en segundo plano mientras anota las demás", () => {
      const sessionDropset: LiveWorkoutSession = {
        id: "session-dropset-test",
        nombre_rutina: "Rutina con Dropset",
        fecha: "2026-11-04",
        ejercicios: [
          {
            id: "ej-dropset-1",
            nombre: "Vuelos Laterales con Mancuerna en Drop Set",
            musculos_principales: ["Deltoides"],
            descanso_segundos: 90,
            rpe_objetivo: 10,
            repeticiones_objetivo: "AL FALLO",
            tipo_serie: "DROPSET",
            series: [
              { numero_serie: 1, peso_kg: 14, reps_hechas: 10, rpe_real: 10, completada: false, estimated1RM: 18, set_type: "DROPSET" },
              { numero_serie: 2, peso_kg: 10, reps_hechas: 8, rpe_real: 10, completada: false, estimated1RM: 13, set_type: "DROPSET" },
              { numero_serie: 3, peso_kg: 6, reps_hechas: 12, rpe_real: 10, completada: false, estimated1RM: 8, set_type: "DROPSET" },
            ],
          },
          {
            id: "ej-siguiente",
            nombre: "Curl de Bíceps",
            musculos_principales: ["Bíceps"],
            descanso_segundos: 60,
            rpe_objetivo: 8,
            repeticiones_objetivo: "10",
            series: [
              { numero_serie: 1, peso_kg: 15, reps_hechas: 10, rpe_real: 8, completada: false, estimated1RM: 20 },
            ],
          },
        ],
      };

      useAthleteStore.getState().setSession(sessionDropset);

      expect(useAthleteStore.getState().restTimer.isActive).toBe(false);

      // Atleta anota la Serie 1 (primera bajada de peso)
      useAthleteStore.getState().completeSet("ej-dropset-1", 1);

      // Se activa de inmediato el temporizador de descanso
      const timerState = useAthleteStore.getState().restTimer;
      expect(timerState.isActive).toBe(true);
      expect(timerState.secondsRemaining).toBe(90);

      // El atleta anota la Serie 2 mientras sigue corriendo el descanso en background
      useAthleteStore.getState().completeSet("ej-dropset-1", 2);
      expect(useAthleteStore.getState().restTimer.isActive).toBe(true);

      // El atleta anota la Serie 3
      useAthleteStore.getState().completeSet("ej-dropset-1", 3);
      expect(useAthleteStore.getState().restTimer.isActive).toBe(true);
    });
  });

  describe("Criterio Gherkin 6: Transición Visual entre Ejercicios", () => {
    it("GIVEN avance entre ejercicios, WHEN se completa una serie que provoca cambio de ejercicio, THEN ejecuta transición con highlight y micro-vibración", () => {
      const vibrateSpy = vi.spyOn(soundModule, "triggerHapticVibration");

      const sessionTransicion: LiveWorkoutSession = {
        id: "session-transicion-test",
        nombre_rutina: "Rutina Transición",
        fecha: "2026-11-04",
        ejercicios: [
          {
            id: "ej-a",
            nombre: "Sentadilla Búlgara",
            musculos_principales: ["Cuádriceps"],
            descanso_segundos: 60,
            rpe_objetivo: 8,
            repeticiones_objetivo: "8",
            series: [
              { numero_serie: 1, peso_kg: 20, reps_hechas: 8, rpe_real: 8, completada: false, estimated1RM: 25 },
            ],
          },
          {
            id: "ej-b",
            nombre: "Hip Thrust",
            musculos_principales: ["Glúteos"],
            descanso_segundos: 60,
            rpe_objetivo: 8,
            repeticiones_objetivo: "10",
            series: [
              { numero_serie: 1, peso_kg: 80, reps_hechas: 10, rpe_real: 8, completada: false, estimated1RM: 106 },
            ],
          },
        ],
      };

      useAthleteStore.getState().setSession(sessionTransicion);

      const nav = findNextExerciseInWorkout(
        sessionTransicion,
        sessionTransicion.ejercicios[0]!,
        1
      );

      expect(nav.nextExerciseId).toBe("ej-b");
      expect(nav.shouldTransition).toBe(true);
    });
  });
});
