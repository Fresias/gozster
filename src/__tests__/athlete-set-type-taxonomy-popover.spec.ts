import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { useAthleteStore } from "@/store/use-athlete-store";

describe("Athlete App: Tooltip contextual y explicación de taxonomía W, N, F, D (#183 / GOZS-177)", () => {
  const liveWorkoutPath = path.resolve(__dirname, "../components/athlete/live-workout.tsx");
  const iconsPath = path.resolve(__dirname, "../components/athlete/icons.tsx");

  const liveWorkoutCode = fs.readFileSync(liveWorkoutPath, "utf-8");
  const iconsCode = fs.readFileSync(iconsPath, "utf-8");

  beforeEach(() => {
    vi.restoreAllMocks();
    useAthleteStore.getState().resetSessionToDefaults();
    useAthleteStore.getState().stopTimer();
  });

  describe("Criterio 1: Presencia del botón accesible de ayuda en Vista Técnica", () => {
    it("incluye el botón de ayuda accesible junto a la etiqueta 'Tipo de Serie'", () => {
      expect(liveWorkoutCode).toContain("Tipo de Serie");
      expect(liveWorkoutCode).toContain('data-testid="set-type-help-btn"');
      expect(liveWorkoutCode).toContain('aria-label="Ayuda sobre tipos de serie"');
      expect(liveWorkoutCode).toContain('title="Explicación de tipos de serie (W, N, F, D)"');
      expect(liveWorkoutCode).toContain("<HelpCircle");
    });

    it("el botón se encuentra dentro de la sección técnica junto al selector W/N/F/D", () => {
      // Verificar que el bloque de Tipo de Serie contiene tanto el selector como el botón de ayuda y el popover
      const setTypeSection = liveWorkoutCode.split("Selector Taxonomía W/N/F/D")[1];
      expect(setTypeSection).toBeDefined();
      expect(setTypeSection).toContain('data-testid="set-type-help-btn"');
      expect(setTypeSection).toContain('data-testid="set-type-popover-content"');
      expect(setTypeSection).toContain('onClick={() => updateSetType(currentExercise.id, serie.numero_serie, t)}');
    });
  });

  describe("Criterio 2: Explicación completa y precisa de la taxonomía W, N, F, D", () => {
    it("el popover contiene la descripción detallada para cada código de serie", () => {
      expect(liveWorkoutCode).toContain('data-testid="set-type-popover-content"');
      expect(liveWorkoutCode).toContain("Taxonomía de Series");

      // W: Warm-up
      expect(liveWorkoutCode).toContain("Warm-up");
      expect(liveWorkoutCode).toContain("Series de aproximación, no computan al volumen efectivo ni PRs.");

      // N: Normal
      expect(liveWorkoutCode).toContain("Normal");
      expect(liveWorkoutCode).toContain("Serie de trabajo principal programada por el entrenador.");

      // F: Failure
      expect(liveWorkoutCode).toContain("Failure");
      expect(liveWorkoutCode).toContain("Esfuerzo máximo absoluto sin repeticiones en reserva (RIR 0 / RPE 10).");

      // D: Drop Set
      expect(liveWorkoutCode).toContain("Drop Set");
      expect(liveWorkoutCode).toContain("Reducción inmediata de peso sin pausa previa para extender la fatiga metabólica.");
    });

    it("los badges visuales en el popover usan la misma paleta de color que los botones de selección", () => {
      // W -> amber-500
      expect(liveWorkoutCode).toContain("bg-amber-500 text-white");
      // N -> primary
      expect(liveWorkoutCode).toContain("bg-primary text-primary-foreground");
      // F -> rose-600
      expect(liveWorkoutCode).toContain("bg-rose-600 text-white");
      // D -> purple-600
      expect(liveWorkoutCode).toContain("bg-purple-600 text-white");
    });
  });

  describe("Criterio 3: Regla Ponytail - Sin librerías externas para HelpCircle", () => {
    it("HelpCircle está definido como SVG inline en icons.tsx sin depender de lucide-react", () => {
      expect(iconsCode).toContain("export function HelpCircle(");
      expect(iconsCode).toContain('circle cx="12" cy="12" r="10"');
      expect(iconsCode).not.toContain("from \"lucide-react\"");
      expect(iconsCode).not.toContain("from 'lucide-react'");
    });
  });

  describe("Criterio 4: No interrumpe ni altera el temporizador de descanso", () => {
    it("interactuar con la selección de tipo de serie no altera el estado del restTimer", () => {
      const store = useAthleteStore.getState();
      const exerciseId = "ej-sentadilla-1";

      // Simular temporizador activo
      useAthleteStore.setState({
        restTimer: {
          isActive: true,
          isPaused: false,
          secondsRemaining: 90,
          totalSeconds: 90,
          exerciseName: "Sentadilla Trasera con Barra",
          setNumber: 1,
        },
      });
      expect(useAthleteStore.getState().restTimer.isActive).toBe(true);
      expect(useAthleteStore.getState().restTimer.secondsRemaining).toBe(90);

      // Cambiar tipo de serie a "W"
      store.updateSetType(exerciseId, 1, "W");
      expect(useAthleteStore.getState().currentSession.ejercicios[0]?.series[0]?.set_type).toBe("W");
      expect(useAthleteStore.getState().restTimer.isActive).toBe(true);
      expect(useAthleteStore.getState().restTimer.secondsRemaining).toBe(90);

      // Cambiar tipo de serie a "F"
      store.updateSetType(exerciseId, 1, "F");
      expect(useAthleteStore.getState().currentSession.ejercicios[0]?.series[0]?.set_type).toBe("F");
      expect(useAthleteStore.getState().restTimer.isActive).toBe(true);
      expect(useAthleteStore.getState().restTimer.secondsRemaining).toBe(90);

      // Cambiar tipo de serie a "D"
      store.updateSetType(exerciseId, 1, "D");
      expect(useAthleteStore.getState().currentSession.ejercicios[0]?.series[0]?.set_type).toBe("D");
      expect(useAthleteStore.getState().restTimer.isActive).toBe(true);
      expect(useAthleteStore.getState().restTimer.secondsRemaining).toBe(90);
    });
  });
});
