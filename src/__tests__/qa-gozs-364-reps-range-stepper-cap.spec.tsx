import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveWorkout } from "@/components/athlete/live-workout";
import {
  parseDefaultReps,
  parseRepRange,
  type RepRangeInfo,
} from "@/lib/routine-helpers";
import {
  useAthleteStore,
  type LiveWorkoutExercise,
  type LiveWorkoutSession,
} from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

// Mock para useAthleteStore en SSR estático (renderToStaticMarkup)
vi.mock("@/store/use-athlete-store", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-athlete-store")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) => (sel ? sel(mod.useAthleteStore.getState()) : mod.useAthleteStore.getState()),
    mod.useAthleteStore,
  );
  return { ...mod, useAthleteStore: hook };
});

describe("GOZS-364: Athlete App - Rangos de Repeticiones con Barra / (Target Máximo por Defecto y Cap Superior en Stepper)", () => {
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

  describe("1. Parser de Rangos con Barra '/' (src/lib/routine-helpers.ts)", () => {
    it("GIVEN prescripciones con rango '8/12', THEN parseDefaultReps precarga el valor máximo 12", () => {
      expect(parseDefaultReps("8/12", 1)).toBe(12);
      expect(parseDefaultReps("8/12", 2)).toBe(12);
    });

    it("GIVEN prescripciones con rango '10/12' o '10/15', THEN parseDefaultReps precarga 12 y 15 respectivamente", () => {
      expect(parseDefaultReps("10/12", 1)).toBe(12);
      expect(parseDefaultReps("10/15", 1)).toBe(15);
    });

    it("GIVEN variantes con espacios limpios ('8 / 12', '8/ 12', '8 /12', '10 / 15'), THEN parseDefaultReps precarga el máximo", () => {
      expect(parseDefaultReps("8 / 12", 1)).toBe(12);
      expect(parseDefaultReps("8/ 12", 1)).toBe(12);
      expect(parseDefaultReps("8 /12", 1)).toBe(12);
      expect(parseDefaultReps("10 / 15", 1)).toBe(15);
    });

    it("GIVEN parseRepRange con variantes con espacios, THEN devuelve el objeto RepRangeInfo correcto", () => {
      const res1 = parseRepRange("8/12");
      expect(res1).toEqual({ isRange: true, min: 8, max: 12 });

      const res2 = parseRepRange("8 / 12");
      expect(res2).toEqual({ isRange: true, min: 8, max: 12 });

      const res3 = parseRepRange("8/ 12");
      expect(res3).toEqual({ isRange: true, min: 8, max: 12 });

      const res4 = parseRepRange("8 /12");
      expect(res4).toEqual({ isRange: true, min: 8, max: 12 });

      const res5 = parseRepRange("10/15");
      expect(res5).toEqual({ isRange: true, min: 10, max: 15 });
    });

    it("GIVEN un rango invertido '12/8', THEN min es 8 y max es 12", () => {
      const res = parseRepRange("12/8");
      expect(res).toEqual({ isRange: true, min: 8, max: 12 });
      expect(parseDefaultReps("12/8", 1)).toBe(12);
    });
  });

  describe("2. Criterios Gherkin: Precarga por Defecto y Bloqueo en Stepper (LiveWorkout)", () => {
    it("GIVEN un ejercicio con repeticiones prescritas como '8/12', WHEN el atleta inicia la serie, THEN el campo de repeticiones se precarga en 12", () => {
      const sessionConRango: LiveWorkoutSession = {
        id: "session-rango-8-12",
        nombre_rutina: "Rutina Fuerza & Hipertrofia",
        fecha: "2026-11-04",
        ejercicios: [
          {
            id: "ej-press-banca",
            nombre: "Press de Banca Plano",
            musculos_principales: ["Pectoral", "Tríceps"],
            descanso_segundos: 90,
            rpe_objetivo: 8,
            repeticiones_objetivo: "8/12",
            series: [
              { numero_serie: 1, peso_kg: 60, reps_hechas: parseDefaultReps("8/12", 1), rpe_real: 8, completada: false, estimated1RM: 0 },
              { numero_serie: 2, peso_kg: 60, reps_hechas: parseDefaultReps("8/12", 2), rpe_real: 8, completada: false, estimated1RM: 0 },
            ],
          },
        ],
      };

      useAthleteStore.getState().setSession(sessionConRango);

      const html = renderToStaticMarkup(<LiveWorkout />);

      // Verifica precarga en 12
      expect(html).toContain('value="12"');
      // Verifica badge ergonómico con texto exacto
      expect(html).toContain('data-testid="rep-range-badge"');
      expect(html).toContain("Rango: 8 a 12 reps (máx. 12)");
    });

    it("GIVEN el stepper de repeticiones en la serie activa con valor 12, THEN el botón '+' se encuentra deshabilitado y no permite superar 12", () => {
      const sessionConRango: LiveWorkoutSession = {
        id: "session-rango-8-12-max",
        nombre_rutina: "Rutina Hipertrofia",
        fecha: "2026-11-04",
        ejercicios: [
          {
            id: "ej-press-mancuernas",
            nombre: "Press con Mancuernas Inclinado",
            musculos_principales: ["Pectoral"],
            descanso_segundos: 60,
            rpe_objetivo: 8,
            repeticiones_objetivo: "8/12",
            series: [
              { numero_serie: 1, peso_kg: 24, reps_hechas: 12, rpe_real: 8, completada: false, estimated1RM: 0 },
            ],
          },
        ],
      };

      useAthleteStore.getState().setSession(sessionConRango);

      const html = renderToStaticMarkup(<LiveWorkout />);

      // Botón incremento "+" deshabilitado
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="reps-increment-btn"/);
      // Input max acotado a 12
      expect(html).toContain('max="12"');
      // Botón decremento "−" NO deshabilitado
      expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*data-testid="reps-decrement-btn"/);
    });

    it("WHEN el atleta presiona el botón '−' y las repeticiones disminuyen a 11, THEN el botón '+' vuelve a estar habilitado", () => {
      const sessionConRango: LiveWorkoutSession = {
        id: "session-rango-8-12-dec",
        nombre_rutina: "Rutina Hipertrofia",
        fecha: "2026-11-04",
        ejercicios: [
          {
            id: "ej-remo-barra",
            nombre: "Remo con Barra Pendlay",
            musculos_principales: ["Espalda"],
            descanso_segundos: 60,
            rpe_objetivo: 8,
            repeticiones_objetivo: "8/12",
            series: [
              { numero_serie: 1, peso_kg: 70, reps_hechas: 11, rpe_real: 8, completada: false, estimated1RM: 0 },
            ],
          },
        ],
      };

      useAthleteStore.getState().setSession(sessionConRango);

      const html = renderToStaticMarkup(<LiveWorkout />);

      // A 11 reps, el botón incremento "+" NO está deshabilitado
      expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*data-testid="reps-increment-btn"/);
      // El valor del input es 11
      expect(html).toContain('value="11"');
      // El badge de rango sigue visible
      expect(html).toContain("Rango: 8 a 12 reps (máx. 12)");
    });

    it("GIVEN una variante con espacios '10 / 15', THEN el badge refleja 10 a 15 y el cap máximo es 15", () => {
      const sessionConEspacios: LiveWorkoutSession = {
        id: "session-rango-10-15-espacios",
        nombre_rutina: "Rutina Bombeo",
        fecha: "2026-11-04",
        ejercicios: [
          {
            id: "ej-elevaciones-laterales",
            nombre: "Elevaciones Laterales en Polea",
            musculos_principales: ["Deltoides"],
            descanso_segundos: 45,
            rpe_objetivo: 8.5,
            repeticiones_objetivo: "10 / 15",
            series: [
              { numero_serie: 1, peso_kg: 7.5, reps_hechas: 15, rpe_real: 8.5, completada: false, estimated1RM: 0 },
            ],
          },
        ],
      };

      useAthleteStore.getState().setSession(sessionConEspacios);

      const html = renderToStaticMarkup(<LiveWorkout />);

      expect(html).toContain('data-testid="rep-range-badge"');
      expect(html).toContain("Rango: 10 a 15 reps (máx. 15)");
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="reps-increment-btn"/);
      expect(html).toContain('max="15"');
    });

    it("GIVEN un ejercicio con repeticiones estándar sin rango ('10' o '10-8-6'), THEN NO muestra badge de rango y el botón '+' no se bloquea en 12", () => {
      const sessionSinRango: LiveWorkoutSession = {
        id: "session-sin-rango",
        nombre_rutina: "Rutina Clásica",
        fecha: "2026-11-04",
        ejercicios: [
          {
            id: "ej-curl-biceps",
            nombre: "Curl de Bíceps con Barra",
            musculos_principales: ["Bíceps"],
            descanso_segundos: 60,
            rpe_objetivo: 8,
            repeticiones_objetivo: "10",
            series: [
              { numero_serie: 1, peso_kg: 30, reps_hechas: 12, rpe_real: 8, completada: false, estimated1RM: 0 },
            ],
          },
        ],
      };

      useAthleteStore.getState().setSession(sessionSinRango);

      const html = renderToStaticMarkup(<LiveWorkout />);

      expect(html).not.toContain('data-testid="rep-range-badge"');
      // A 12 reps pero sin rango prescrito con barra, el botón "+" NO está deshabilitado
      expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*data-testid="reps-increment-btn"/);
    });
  });
});
