import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { useAthleteStore } from "@/store/use-athlete-store";

describe("Athlete App: Taxonomía de series en Vista Técnica (02-pantallas.md §3 / C2)", () => {
  const ejercicioActivoPath = path.resolve(__dirname, "../components/athlete/ejercicio-activo.tsx");
  const iconsPath = path.resolve(__dirname, "../components/athlete/icons.tsx");

  const ejercicioActivoCode = fs.readFileSync(ejercicioActivoPath, "utf-8");
  const iconsCode = fs.readFileSync(iconsPath, "utf-8");

  beforeEach(() => {
    vi.restoreAllMocks();
    useAthleteStore.getState().resetSessionToDefaults();
    useAthleteStore.getState().stopTimer();
  });

  describe("Criterio 1: Tipo de serie en Vista Técnica (solo lectura, sin selector manual W/N/F/D)", () => {
    it("muestra el chip read-only de 'Tipo de serie' en Vista Técnica", () => {
      expect(ejercicioActivoCode).toContain("Tipo de serie");
      expect(ejercicioActivoCode).toContain('data-testid="vista-tecnica"');
      expect(ejercicioActivoCode).toContain("fixed-normal-badge");
      expect(ejercicioActivoCode).toContain("fixed-dropset-badge");
    });

    it("no renderiza selector manual W/N/F/D ni popover de taxonomía en runtime (GOZS-351 / v7)", () => {
      expect(ejercicioActivoCode).not.toContain('data-testid="set-type-help-btn"');
      expect(ejercicioActivoCode).not.toContain('data-testid="set-type-popover-content"');
    });
  });

  describe("Criterio 2: Sin colores de tema viejo (C2, 01-sistema-visual.md)", () => {
    it("distingue Normal, Drop set y Aproximación con tokens v7 sin clases amber/rose/purple", () => {
      expect(ejercicioActivoCode).toContain("Drop set");
      expect(ejercicioActivoCode).toContain("Aproximación");
      expect(ejercicioActivoCode).toContain("Normal");
      expect(ejercicioActivoCode).not.toContain("bg-amber-500");
      expect(ejercicioActivoCode).not.toContain("bg-rose-600");
      expect(ejercicioActivoCode).not.toContain("bg-purple-600");
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
