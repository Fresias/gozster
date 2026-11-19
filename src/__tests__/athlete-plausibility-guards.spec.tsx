import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as fs from "node:fs";
import * as path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { LiveWorkout } from "@/components/athlete/live-workout";
import { HistorialSesiones } from "@/components/athlete/historial-sesiones";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

describe("Guardas de plausibilidad y UI táctil en la app móvil (GOZS-200)", () => {
  beforeEach(() => {
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
      syncError: null,
    });
    useAthleteStore.getState().resetSessionToDefaults();
  });

  describe("UI Móvil: Atributos de input, teclado móvil y touch target ≥ 44px", () => {
    it("el input de peso en LiveWorkout tiene inputMode='decimal', min='0' y max='500'", () => {
      const html = renderToStaticMarkup(<LiveWorkout />);
      expect(html).toContain('inputMode="decimal"');
      expect(html).toContain('min="0"');
      expect(html).toContain('max="500"');
    });

    it("el input de repeticiones en LiveWorkout tiene inputMode='numeric', min='0' y max='100'", () => {
      const html = renderToStaticMarkup(<LiveWorkout />);
      expect(html).toContain('inputMode="numeric"');
      expect(html).toContain('max="100"');
    });

    it("los inputs y botones tienen área táctil accesible (D-15: .a-stepper button min-height 56px en athlete-v7.css)", () => {
      const html = renderToStaticMarkup(<LiveWorkout />);
      expect(html).toContain('class="a-stepper"');
      expect(html).toContain('data-testid="peso-decrement-btn"');
      expect(html).toContain('data-testid="peso-increment-btn"');
      const css = fs.readFileSync(
        path.resolve(__dirname, "../app/(athlete)/athlete/athlete-v7.css"),
        "utf-8",
      );
      expect(css).toContain(".a-stepper button");
      expect(css).toContain("min-height: 56px;");
    });
  });

  describe("Aviso en línea de serie atípica (v7 .a-kgwarn en 02-pantallas.md §3)", () => {
    it("EjercicioActivo expone el aviso en línea .a-kgwarn con Sí, es correcto y Corregir", () => {
      const code = fs.readFileSync(
        path.resolve(__dirname, "../components/athlete/ejercicio-activo.tsx"),
        "utf-8",
      );
      expect(code).toContain('className="a-kgwarn"');
      expect(code).toContain('data-testid="atypical-confirmation-dialog"');
      expect(code).toContain('data-testid="atypical-confirmar-btn"');
      expect(code).toContain('data-testid="atypical-corregir-btn"');
      expect(code).toContain("Sí, es correcto");
    });

    it("HistorialSesiones renderiza el diálogo de confirmación atípica para edición", () => {
      const html = renderToStaticMarkup(<HistorialSesiones />);
      expect(html).toContain('data-testid="historial-atypical-dialog"');
      expect(html).toContain('data-testid="historial-atypical-confirmar-btn"');
      expect(html).toContain('data-testid="historial-atypical-corregir-btn"');
    });
  });

  describe("Store de Atleta: flag 'atipica' en registro de series", () => {
    it("completeSet marca 'atipica: true' cuando se confirma como serie atípica", () => {
      const store = useAthleteStore.getState();
      const exerciseId = store.currentSession.ejercicios[0]!.id;

      store.completeSet(exerciseId, 1, true);

      const setCompletado = useAthleteStore
        .getState()
        .currentSession.ejercicios.find((e) => e.id === exerciseId)
        ?.series.find((s) => s.numero_serie === 1);

      expect(setCompletado?.completada).toBe(true);
      expect(setCompletado?.atipica).toBe(true);

      const events = useOfflineQueueStore.getState().pendingEvents;
      const lastEvent = events[events.length - 1];
      expect(lastEvent?.payload).toHaveProperty("atipica", true);
    });

    it("editCompletedSet permite actualizar el flag 'atipica'", () => {
      const store = useAthleteStore.getState();
      const exerciseId = store.currentSession.ejercicios[0]!.id;

      store.completeSet(exerciseId, 1, false);
      store.editCompletedSet(exerciseId, 1, 200, 5, true);

      const setActualizado = useAthleteStore
        .getState()
        .currentSession.ejercicios.find((e) => e.id === exerciseId)
        ?.series.find((s) => s.numero_serie === 1);

      expect(setActualizado?.peso_kg).toBe(200);
      expect(setActualizado?.atipica).toBe(true);
    });
  });
});
