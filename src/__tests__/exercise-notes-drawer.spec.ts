/**
 * ============================================================================
 * GOZSter QA & Unit Tests: Bottom Sheet / Drawer de Notas Técnicas en LiveWorkout
 * Archivo: src/__tests__/exercise-notes-drawer.spec.ts
 * GitHub Issue: #173 (Multica GOZS-169)
 * ============================================================================
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseExerciseNotes } from "@/lib/exercise-notes";
import { useAthleteStore } from "@/store/use-athlete-store";

describe("GOZS-169 / Issue #173: Parser y Estructurador de Notas Técnicas (lib/exercise-notes)", () => {
  it("debe retornar estructura vacía cuando el comentario es nulo, indefinido o vacío", () => {
    const emptyNull = parseExerciseNotes(null);
    expect(emptyNull.hasStructuredSections).toBe(false);
    expect(emptyNull.configuracion).toEqual([]);
    expect(emptyNull.ejecucion).toEqual([]);
    expect(emptyNull.indicaciones).toEqual([]);

    const emptyUndefined = parseExerciseNotes(undefined);
    expect(emptyUndefined.hasStructuredSections).toBe(false);

    const emptyString = parseExerciseNotes("   ");
    expect(emptyString.hasStructuredSections).toBe(false);
  });

  it("debe parsear correctamente guías con 'Configuración:' y 'Ejecución:' con viñetas", () => {
    const rawComment = `Configuración:
- Acostarse boca arriba sobre banco plano.
- Puntos de apoyo en pies, glúteos y escapular.
- Agarrar barra mayor al ancho de hombros.

Ejecución:
- Realizar una retracción escapular.
- Sacar barra del soporte.
- Tomar aire y bajar barra direccionada al pecho.
- Codos a 45 grados en movimiento de bajada y subida.
- Levantar la barra hacia el punto de inicio.`;

    const parsed = parseExerciseNotes(rawComment);
    expect(parsed.hasStructuredSections).toBe(true);
    expect(parsed.configuracion).toHaveLength(3);
    expect(parsed.configuracion[0]).toBe("Acostarse boca arriba sobre banco plano.");
    expect(parsed.configuracion[1]).toBe("Puntos de apoyo en pies, glúteos y escapular.");
    expect(parsed.configuracion[2]).toBe("Agarrar barra mayor al ancho de hombros.");

    expect(parsed.ejecucion).toHaveLength(5);
    expect(parsed.ejecucion[0]).toBe("Realizar una retracción escapular.");
    expect(parsed.ejecucion[4]).toBe("Levantar la barra hacia el punto de inicio.");
  });

  it("debe soportar variantes tipográficas como 'Ejecucción:' o números ordinales", () => {
    const rawComment = `1. Configuración:
1. Comience a pararse erguido, con los pies debajo de las caderas.
2. Pecho arriba y mancuernas a los costados.

2. Ejecucción:
1. Dé un paso largo hacia adelante.
2. Flexione la rodilla trasera a 90 grados.`;

    const parsed = parseExerciseNotes(rawComment);
    expect(parsed.hasStructuredSections).toBe(true);
    expect(parsed.configuracion).toHaveLength(2);
    expect(parsed.configuracion[0]).toBe("Comience a pararse erguido, con los pies debajo de las caderas.");
    expect(parsed.ejecucion).toHaveLength(2);
    expect(parsed.ejecucion[0]).toBe("Dé un paso largo hacia adelante.");
  });

  it("debe procesar comentarios de texto libre o indicaciones breves del coach", () => {
    const rawComment = "Serie 1: 4 a 6 @ RPE 8. Serie 2-3: 2 a 4 @ RPE 9. Mantener el pecho erguido y descenso controlado.";
    const parsed = parseExerciseNotes(rawComment);

    expect(parsed.hasStructuredSections).toBe(false);
    expect(parsed.configuracion).toEqual([]);
    expect(parsed.ejecucion).toEqual([]);
    expect(parsed.indicaciones).toContain(rawComment);
  });
});

describe("GOZS-169 / Issue #173: Criterios Gherkin y Arquitectura en LiveWorkout", () => {
  const liveWorkoutPath = path.resolve(__dirname, "../components/athlete/live-workout.tsx");
  const liveWorkoutCode = fs.readFileSync(liveWorkoutPath, "utf-8");

  const drawerComponentPath = path.resolve(__dirname, "../components/athlete/exercise-notes-drawer.tsx");
  const drawerComponentCode = fs.readFileSync(drawerComponentPath, "utf-8");

  beforeEach(() => {
    useAthleteStore.getState().resetSessionToDefaults();
  });

  describe("Criterio Gherkin 1: Eliminación del Popover rígido de 320px que causaba recorte horizontal", () => {
    it("el Popover fijo de 'w-80' para notas del coach fue eliminado de LiveWorkout", () => {
      // El Popover anterior tenía 'w-80 text-xs p-3 space-y-1.5 bg-popover'
      expect(liveWorkoutCode).not.toContain('PopoverContent className="w-80 text-xs p-3');
    });

    it("el botón de notas técnicas ahora abre el Drawer táctil mediante estado reactivo", () => {
      expect(liveWorkoutCode).toContain("setNotesExercise(currentExercise)");
      expect(liveWorkoutCode).toContain("data-testid={`exercise-notes-btn-${currentExercise.id}`}");
      expect(liveWorkoutCode).toContain("<ExerciseNotesDrawer");
    });
  });

  describe("Criterio Gherkin 2: Responsive táctil sin desbordes en viewport móvil de 360px", () => {
    it("el Drawer utiliza un contenedor responsive con ancho adaptativo max-w-lg y break-words", () => {
      expect(drawerComponentCode).toContain("max-w-lg");
      expect(drawerComponentCode).toContain("break-words");
      expect(drawerComponentCode).toContain("overflow-y-auto");
      // No contiene anchos fijos en píxeles que desborden 360px
      expect(drawerComponentCode).not.toMatch(/w-\[\d{3,}px\]/);
      expect(drawerComponentCode).not.toContain("w-80");
    });

    it("posee scroll interno vertical con límites de viewport (max-h-[88vh])", () => {
      expect(drawerComponentCode).toContain("max-h-[88vh]");
    });
  });

  describe("Criterio Gherkin 3: Estructura visual clara entre Configuración, Ejecución e Indicaciones", () => {
    it("renderiza identificadores de sección específicos con data-testids", () => {
      expect(drawerComponentCode).toContain('data-testid="notes-section-configuracion"');
      expect(drawerComponentCode).toContain('data-testid="notes-section-ejecucion"');
      expect(drawerComponentCode).toContain('data-testid="notes-section-adicionales"');
      expect(drawerComponentCode).toContain('data-testid="notes-section-general"');
    });

    it("incluye barra visual superior (pull handle) para ergonomía táctil", () => {
      expect(drawerComponentCode).toContain('data-testid="exercise-notes-drag-handle"');
      expect(drawerComponentCode).toContain("touch-none select-none");
    });
  });

  describe("Criterio Gherkin 4: Facilidad de cierre (backdrop, botón X, botón Entendido y swipe down)", () => {
    it("soporta cierre por toque en backdrop", () => {
      expect(drawerComponentCode).toContain('data-testid="exercise-notes-drawer-backdrop"');
      expect(drawerComponentCode).toContain("onClick={onClose}");
    });

    it("soporta botón táctil 'X' en la cabecera y botón principal en el footer", () => {
      expect(drawerComponentCode).toContain('data-testid="close-exercise-notes-btn"');
      expect(drawerComponentCode).toContain('data-testid="exercise-notes-close-action-btn"');
      expect(drawerComponentCode).toContain("Entendido, volver al entrenamiento");
    });

    it("implementa detección de arrastre táctil hacia abajo (swipe-to-dismiss)", () => {
      expect(drawerComponentCode).toContain("onTouchStart={handleTouchStart}");
      expect(drawerComponentCode).toContain("onTouchMove={handleTouchMove}");
      expect(drawerComponentCode).toContain("onTouchEnd={handleTouchEnd}");
      expect(drawerComponentCode).toContain("dragOffset > 70");
    });

    it("implementa tecla Escape para accesibilidad", () => {
      expect(drawerComponentCode).toContain('e.key === "Escape"');
      expect(drawerComponentCode).toContain('role="dialog"');
      expect(drawerComponentCode).toContain('aria-modal="true"');
    });
  });

  describe("Criterio Gherkin 5: Integración con catálogo real de ejercicios", () => {
    it("los ejercicios de la sesión actual contienen comentarios que pueden ser parseados y mostrados", () => {
      const session = useAthleteStore.getState().currentSession;
      const sentadilla = session.ejercicios.find((e) => e.nombre.toLowerCase().includes("sentadilla"));
      expect(sentadilla).toBeDefined();
      expect(sentadilla?.comentario).toBeTruthy();

      const parsed = parseExerciseNotes(sentadilla?.comentario);
      expect(parsed.rawText.length).toBeGreaterThan(0);
    });
  });
});
