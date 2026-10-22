import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { REAL_ALUMNOS } from "@/services/real-mynter-data";
import { supabase } from "@/lib/supabase/client";

describe("GH #123 / GOZS-111: Vista SIMPLE vs TÉCNICA - Elección del Alumno vs Recomendación del Coach", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAthleteStore.getState().resetSessionToDefaults();
    useAthleteStore.setState({
      vistaElegidaPorAlumno: null,
      vistaRecomendadaCoach: "SIMPLE",
      nivelVistaAlumno: "SIMPLE",
    });
  });

  describe("Criterio 1: Coach recomienda SIMPLE y alumno no eligió nada", () => {
    it("GIVEN coach recomendó SIMPLE y alumno no eligió nada WHEN entrena THEN ve Vista Simple con texto Recomendada por tu coach: Simple", () => {
      const store = useAthleteStore.getState();
      expect(store.vistaElegidaPorAlumno).toBeNull();
      expect(store.vistaRecomendadaCoach).toBe("SIMPLE");
      expect(store.nivelVistaAlumno).toBe("SIMPLE");

      // Cargar rutina de alumno con nivel_vista_alumno = SIMPLE
      const mockStudent = {
        ...REAL_ALUMNOS[0],
        nivel_vista_alumno: "SIMPLE" as const,
      };
      store.loadStudentSession(mockStudent.id);

      const state = useAthleteStore.getState();
      expect(state.vistaElegidaPorAlumno).toBeNull();
      expect(state.vistaRecomendadaCoach).toBe("SIMPLE");
      expect(state.nivelVistaAlumno).toBe("SIMPLE");
    });
  });

  describe("Criterio 2: El alumno elige Vista Técnica y persiste tras recargas", () => {
    it("GIVEN alumno tocó Vista Técnica WHEN cierra y vuelve a abrir o carga otra rutina THEN sigue en Técnica", () => {
      const store = useAthleteStore.getState();

      // Alumno toca Vista Técnica
      store.setNivelVistaAlumno("TECNICA");

      expect(useAthleteStore.getState().vistaElegidaPorAlumno).toBe("TECNICA");
      expect(useAthleteStore.getState().nivelVistaAlumno).toBe("TECNICA");

      // Cargar otra rutina con recomendación coach = SIMPLE
      const firstStudent = REAL_ALUMNOS[0];
      useAthleteStore.getState().loadStudentSession(firstStudent!.id);

      // Sigue en TECNICA a pesar de que la rutina sea cargada
      const postLoadState = useAthleteStore.getState();
      expect(postLoadState.vistaElegidaPorAlumno).toBe("TECNICA");
      expect(postLoadState.nivelVistaAlumno).toBe("TECNICA");
      expect(postLoadState.vistaRecomendadaCoach).toBe("SIMPLE");

      // Reinicio de sesión a defaults tampoco borra la elección del alumno
      useAthleteStore.getState().resetSessionToDefaults();
      expect(useAthleteStore.getState().vistaElegidaPorAlumno).toBe("TECNICA");
      expect(useAthleteStore.getState().nivelVistaAlumno).toBe("TECNICA");
    });
  });

  describe("Criterio 3: Alumno eligió Técnica y coach cambia recomendación a SIMPLE", () => {
    it("GIVEN alumno eligió Técnica y coach cambia recomendación a SIMPLE WHEN alumno abre app THEN sigue en Técnica y muestra nueva recomendación", () => {
      const store = useAthleteStore.getState();

      // Alumno ya eligió Técnica
      store.setNivelVistaAlumno("TECNICA");

      // Coach cambia la recomendación del alumno a SIMPLE en el backend/sesión
      const alumnoId = REAL_ALUMNOS[0]!.id;
      useAthleteStore.getState().loadStudentSession(alumnoId);

      const state = useAthleteStore.getState();
      expect(state.vistaElegidaPorAlumno).toBe("TECNICA");
      expect(state.nivelVistaAlumno).toBe("TECNICA");
      expect(state.vistaRecomendadaCoach).toBe("SIMPLE");

      // El texto calculado debe indicar Simple y que tiene vista distinta
      const recomendadaTexto = state.vistaRecomendadaCoach === "TECNICA" ? "Técnica" : "Simple";
      expect(recomendadaTexto).toBe("Simple");

      const tieneVistaDistinta = Boolean(
        state.vistaElegidaPorAlumno &&
        state.vistaElegidaPorAlumno !== state.vistaRecomendadaCoach
      );
      expect(tieneVistaDistinta).toBe(true);
    });
  });

  describe("Criterio 4: Alumno con vista distinta toca 'Usar la recomendada'", () => {
    it("GIVEN alumno eligió vista distinta a la recomendada WHEN toca 'Usar la recomendada' THEN vuelve a la del coach y la sigue en adelante", () => {
      const store = useAthleteStore.getState();

      // Alumno con Técnica y Coach con Simple
      store.setNivelVistaAlumno("TECNICA");
      useAthleteStore.setState({ vistaRecomendadaCoach: "SIMPLE" });

      expect(useAthleteStore.getState().nivelVistaAlumno).toBe("TECNICA");

      // Alumno toca "Usar la recomendada"
      useAthleteStore.getState().usarVistaRecomendada();

      const stateAfter = useAthleteStore.getState();
      expect(stateAfter.vistaElegidaPorAlumno).toBeNull();
      expect(stateAfter.nivelVistaAlumno).toBe("SIMPLE");
      expect(stateAfter.vistaRecomendadaCoach).toBe("SIMPLE");

      // Y a partir de allí sigue la recomendación del coach en nuevas cargas
      useAthleteStore.setState({ vistaRecomendadaCoach: "TECNICA" });
      const current = useAthleteStore.getState();
      // Si el alumno no tiene elección propia, la vista efectiva toma la del coach
      expect(current.vistaElegidaPorAlumno ?? current.vistaRecomendadaCoach).toBe("TECNICA");
    });
  });

  describe("Criterio 5: Reversión ante error de Supabase en Coach Studio", () => {
    it("GIVEN update del coach rechazado por Supabase WHEN cambia recomendación THEN revierte al valor anterior y notifica", async () => {
      const coachStore = useCoachStudioStore.getState();
      const mockAlumno = coachStore.alumnos[0];
      expect(mockAlumno).toBeDefined();

      const valorInicial = mockAlumno!.nivel_vista_alumno;
      const nuevoValor = valorInicial === "SIMPLE" ? "TECNICA" : "SIMPLE";

      // Mockeamos Supabase para que falle
      if (supabase) {
        vi.spyOn(supabase, "from").mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: null,
              error: { message: "Error simulado de red en Supabase", code: "500" },
            }),
          }),
        } as any);
      }

      const exito = await useCoachStudioStore
        .getState()
        .actualizarNivelVistaAlumno(mockAlumno!.id, nuevoValor);

      expect(exito).toBe(false);

      // Estado de alumnos debe volver al original
      const alumnoPost = useCoachStudioStore
        .getState()
        .alumnos.find((a) => a.id === mockAlumno!.id);
      expect(alumnoPost?.nivel_vista_alumno).toBe(valorInicial);

      // Toast de error/advertencia registrado
      const toast = useCoachStudioStore.getState().toast;
      expect(toast?.message).toBe("No se pudo guardar, intentá de nuevo");
    });
  });

  describe("Criterio 6: Integridad de componentes y accesibilidad táctil", () => {
    it("Athlete App (live-workout.tsx) expone texto de recomendación y botón 'Usar la recomendada'", () => {
      const liveWorkoutPath = path.resolve(__dirname, "../components/athlete/live-workout.tsx");
      const content = fs.readFileSync(liveWorkoutPath, "utf-8");

      expect(content).toContain('data-testid="athlete-vista-recomendada-texto"');
      expect(content).toContain('data-testid="athlete-usar-vista-recomendada-btn"');
      expect(content).toContain("Recomendada por tu coach:");
      expect(content).toContain("Usar la recomendada");
      expect(content).toContain("usarVistaRecomendada");
    });

    it("Coach Studio (student-detail.tsx) titula el bloque 'Vista recomendada' y expone contenedor de error", () => {
      const studentDetailPath = path.resolve(__dirname, "../components/coach/student-detail.tsx");
      const content = fs.readFileSync(studentDetailPath, "utf-8");

      expect(content).toContain("Vista recomendada");
      expect(content).toContain('data-testid="coach-nivel-vista-error"');
      expect(content).toContain("No se pudo guardar, intentá de nuevo");
      expect(content).toContain('data-testid="coach-nivel-vista-card"');
      expect(content).toContain('data-testid="coach-toggle-vista-simple"');
      expect(content).toContain('data-testid="coach-toggle-vista-tecnica"');
    });
  });
});
