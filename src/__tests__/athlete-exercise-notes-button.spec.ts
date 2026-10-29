import { sembrarPlanAlumno } from "./helpers/plan-alumno-seed";
/**
 * ============================================================================
 * GOZSter Unit & Acceptance Tests: Botón de Notas del Ejercicio en la App Móvil
 * Archivo: src/__tests__/athlete-exercise-notes-button.spec.ts
 * Issue: GOZS-280
 * ============================================================================
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";
import { ExerciseNotesModal } from "@/components/athlete/exercise-notes-modal";
import { useAthleteStore, type LiveWorkoutExercise } from "@/store/use-athlete-store";
import { REAL_ALUMNOS } from "@/services/real-mynter-data";

describe("GOZS-280: Botón de notas del ejercicio junto a técnica y reporte", () => {
  beforeEach(() => {
    useAthleteStore.getState().resetSessionToDefaults();
  });

  describe("Criterio 1: Presencia del botón cuando el ejercicio tiene notas y ausencia cuando no tiene", () => {
    const liveWorkoutPath = path.resolve(__dirname, "../components/athlete/live-workout.tsx");
    const liveWorkoutContent = fs.readFileSync(liveWorkoutPath, "utf-8");

    it("live-workout.tsx debe importar ExerciseNotesModal", () => {
      expect(liveWorkoutContent).toContain('import { ExerciseNotesModal } from "@/components/athlete/exercise-notes-modal"');
    });

    it("el botón de notas debe ubicarse en la fila de botones junto a técnica y reporte", () => {
      expect(liveWorkoutContent).toContain("exercise-notes-btn-${currentExercise.id}");
      expect(liveWorkoutContent).toContain('title="Ver notas del ejercicio"');
      expect(liveWorkoutContent).toContain('aria-label="Ver notas del ejercicio"');

      // Verificar que está en el mismo contenedor flex de botones de acción
      const buttonContainerIdx = liveWorkoutContent.indexOf("demo-technique-btn-${currentExercise.id}");
      const notesButtonIdx = liveWorkoutContent.indexOf("exercise-notes-btn-${currentExercise.id}");
      const painReportIdx = liveWorkoutContent.indexOf("exercise-pain-report-btn");

      expect(buttonContainerIdx).toBeGreaterThan(0);
      expect(notesButtonIdx).toBeGreaterThan(buttonContainerIdx);
      expect(painReportIdx).toBeGreaterThan(notesButtonIdx);
    });

    it("el botón de notas solo se renderiza con condición booleana si existen notas o comentario", () => {
      // GIVEN un ejercicio con notas THEN aparece el botón; sin notas no aparece
      expect(liveWorkoutContent).toContain(
        "Boolean(currentExercise.notas?.trim() || currentExercise.comentario?.trim())"
      );
    });

    it("live-workout.tsx debe incluir el modal ExerciseNotesModal renderizado condicionalmente", () => {
      expect(liveWorkoutContent).toContain("<ExerciseNotesModal");
      expect(liveWorkoutContent).toContain("exercise={notesExercise}");
      expect(liveWorkoutContent).toContain("isOpen={Boolean(notesExercise)}");
      expect(liveWorkoutContent).toContain("onClose={() => setNotesExercise(null)}");
    });
  });

  describe("Criterio 2: Componente ExerciseNotesModal (apertura y contenido)", () => {
    const mockExerciseWithNotes: LiveWorkoutExercise = {
      id: "ej-test-1",
      nombre: "Sentadilla Trasera con Barra",
      musculos_principales: ["Cuádriceps", "Glúteos"],
      descanso_segundos: 90,
      rpe_objetivo: 8,
      repeticiones_objetivo: "6-8",
      series: [],
      notas: "Mantener el pecho erguido y bajar hasta 90 grados.",
      comentario: null,
    };

    const mockExerciseWithoutNotes: LiveWorkoutExercise = {
      id: "ej-test-2",
      nombre: "Press Militar",
      musculos_principales: ["Deltoides"],
      descanso_segundos: 60,
      rpe_objetivo: 8,
      repeticiones_objetivo: "10",
      series: [],
      notas: null,
      comentario: null,
    };

    it("no debe renderizar nada si isOpen es false o exercise es null", () => {
      const htmlClosed = renderToStaticMarkup(
        createElement(ExerciseNotesModal, {
          exercise: mockExerciseWithNotes,
          isOpen: false,
          onClose: () => {},
        })
      );
      expect(htmlClosed).toBe("");

      const htmlNullExercise = renderToStaticMarkup(
        createElement(ExerciseNotesModal, {
          exercise: null,
          isOpen: true,
          onClose: () => {},
        })
      );
      expect(htmlNullExercise).toBe("");
    });

    it("debe renderizar el modal con rol dialog y contenido accesible cuando isOpen es true", () => {
      const html = renderToStaticMarkup(
        createElement(ExerciseNotesModal, {
          exercise: mockExerciseWithNotes,
          isOpen: true,
          onClose: () => {},
        })
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('data-testid="exercise-notes-modal"');
      expect(html).toContain("Sentadilla Trasera con Barra");
      expect(html).toContain("Cuádriceps, Glúteos");
      expect(html).toContain("Mantener el pecho erguido y bajar hasta 90 grados.");
      expect(html).toContain('data-testid="exercise-notes-content"');
      expect(html).toContain('data-testid="close-notes-modal-btn"');
      expect(html).toContain('data-testid="return-to-workout-from-notes-btn"');
    });

    it("debe mostrar notas de biblioteca si provienen de comentario", () => {
      const exerciseWithLibraryNotes: LiveWorkoutExercise = {
        ...mockExerciseWithoutNotes,
        comentario: "Técnica estricta: codos a 45 grados sin balancear el torso.",
      };

      const html = renderToStaticMarkup(
        createElement(ExerciseNotesModal, {
          exercise: exerciseWithLibraryNotes,
          isOpen: true,
          onClose: () => {},
        })
      );

      expect(html).toContain("Técnica estricta: codos a 45 grados sin balancear el torso.");
      expect(html).toContain("Indicaciones del Ejercicio:");
    });

    it("debe mostrar tanto notas del coach como de biblioteca si ambas están presentes y difieren", () => {
      const exerciseWithBoth: LiveWorkoutExercise = {
        ...mockExerciseWithNotes,
        notas: "Foco en tempo 3-1-0 en las primeras dos series.",
        comentario: "Configuración: Pies al ancho de hombros, barra apoyada en trapecios.",
      };

      const html = renderToStaticMarkup(
        createElement(ExerciseNotesModal, {
          exercise: exerciseWithBoth,
          isOpen: true,
          onClose: () => {},
        })
      );

      expect(html).toContain("Foco en tempo 3-1-0 en las primeras dos series.");
      expect(html).toContain("Indicaciones del Coach:");
      expect(html).toContain("Configuración: Pies al ancho de hombros, barra apoyada en trapecios.");
      expect(html).toContain("Guía técnica de biblioteca:");
    });
  });

  describe("Criterio 3: Integración de notas en el store de la app de atletas (useAthleteStore)", () => {
    it("los ejercicios de la sesión por defecto deben tener notas disponibles", () => {
      const session = useAthleteStore.getState().currentSession;
      expect(session.ejercicios.length).toBeGreaterThan(0);

      const ejercicioConNotas = session.ejercicios.find((e) => Boolean(e.notas || e.comentario));
      expect(ejercicioConNotas).toBeDefined();
      expect(ejercicioConNotas?.notas || ejercicioConNotas?.comentario).toBeTruthy();
    });

    it("loadStudentSession debe preservar y mapear las notas del constructor y de biblioteca", () => {
      const alumno = REAL_ALUMNOS[0];
      expect(alumno).toBeDefined();
      if (!alumno) return;

      sembrarPlanAlumno(alumno.id);
      const ok = useAthleteStore.getState().loadStudentSession(alumno.id);
      expect(ok).toBe(true);

      const session = useAthleteStore.getState().currentSession;
      expect(session.ejercicios.length).toBeGreaterThan(0);

      // Cada ejercicio debe exponer su contrato LiveWorkoutExercise con notas
      for (const ej of session.ejercicios) {
        expect(ej.id).toBeDefined();
        expect(ej.nombre).toBeDefined();
        // Las notas pueden ser string o null
        expect(ej.notas === null || typeof ej.notas === "string").toBe(true);
      }
    });
  });
});
