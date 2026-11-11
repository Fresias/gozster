import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/supabase/client", () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));

import {
  RoutineBuilderModal,
  buildGuardarRutinaPayload,
  mapPlanToBuilderDays,
  type BuilderDay,
} from "@/components/coach/routine-builder/routine-builder-modal";
import {
  RoutineBuilderWeeklyBoard,
} from "@/components/coach/routine-builder/routine-builder-weekly-board";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { normalizarSuperseries, moverEjercicio, asignarGrupo } from "@/lib/superseries";
import type { Ejercicio, PlanEntrenamiento, DiaRutina, EjercicioEnRutina } from "@/types/database.types";

const mockCatalogo: Ejercicio[] = [
  {
    id: "ej-1",
    nombre: "Sentadilla Trasera con Barra",
    musculos_principales: ["Piernas", "Cuádriceps", "Glúteos"],
    musculos_secundarios: ["Core", "Espalda baja"],
    url_video: "https://www.youtube.com/watch?v=mock1",
    creado_por: null,
    comentario: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "ej-2",
    nombre: "Press de Banca Plano",
    musculos_principales: ["Pecho", "Pectorales"],
    musculos_secundarios: ["Tríceps"],
    url_video: null,
    creado_por: null,
    comentario: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "ej-3",
    nombre: "Dominadas Pronas",
    musculos_principales: ["Espalda", "Dorsales"],
    musculos_secundarios: ["Bíceps"],
    url_video: "https://www.youtube.com/watch?v=mock3",
    creado_por: null,
    comentario: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

const mockPlan: PlanEntrenamiento = {
  id: "plan-476",
  profesor_id: "prof-1",
  alumno_id: "alum-1",
  nombre: "Fuerza e Hipertrofia 4 Días",
  comentarios: "Plan semestral",
  estado: "ACTIVO",
  fecha_inicio: "2026-11-01",
  fecha_fin: null,
  tags: ["Fuerza", "Hipertrofia"],
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
};

const mockDias: DiaRutina[] = [
  {
    id: "dia-1",
    plan_id: "plan-476",
    nombre: "Día 1 · Piernas Pesado",
    orden: 1,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  },
  {
    id: "dia-2",
    plan_id: "plan-476",
    nombre: "Día 2 · Empuje",
    orden: 2,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  },
];

const mockEjerciciosEnRutina: EjercicioEnRutina[] = [
  {
    id: "er-1",
    dia_id: "dia-1",
    ejercicio_id: "ej-1",
    orden: 1,
    series: 4,
    repeticiones: "10-8-8-6",
    descanso_segundos: 120,
    rpe_objetivo: 8,
    notas: "Controlar bajada en 3s",
    es_superserie: false,
    grupo_superserie: null,
    tipo_serie: "NORMAL",
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  },
  {
    id: "er-2",
    dia_id: "dia-1",
    ejercicio_id: "ej-2",
    orden: 2,
    series: 3,
    repeticiones: "10",
    descanso_segundos: 0,
    rpe_objetivo: null,
    notas: null,
    es_superserie: true,
    grupo_superserie: 1,
    tipo_serie: "NORMAL",
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  },
  {
    id: "er-3",
    dia_id: "dia-1",
    ejercicio_id: "ej-3",
    orden: 3,
    series: 3,
    repeticiones: "10",
    descanso_segundos: 90,
    rpe_objetivo: null,
    notas: null,
    es_superserie: true,
    grupo_superserie: 1,
    tipo_serie: "NORMAL",
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  },
];

describe("GOZS-487: Constructor de Rutinas en modo Tablero Semanal (Planner)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCoachStudioStore.setState({ routineBuilderMode: "modal" });
  });

  describe("Criterio Gherkin 1: Switcher y Preservación de la Vista Modal Clásica", () => {
    it("GIVEN un entrenador en Coach Studio abriendo el constructor, THEN la vista modal clásica sigue siendo la experiencia predeterminada sin alteraciones destructivas", () => {
      const html = renderToStaticMarkup(
        createElement(RoutineBuilderModal, {
          isOpen: true,
          onClose: () => {},
          catalogoEjercicios: mockCatalogo,
          alumnoNombre: "Valentina Paz",
        })
      );

      // Preserva el contenedor modal clásico original
      expect(html).toContain('data-testid="routine-builder-modal"');
      // Contiene el switcher de modo
      expect(html).toContain('data-testid="routine-builder-view-switcher"');
      expect(html).toContain('data-testid="view-mode-classic-btn"');
      expect(html).toContain('data-testid="view-mode-board-btn"');
      // Contiene el campo de nombre del constructor original
      expect(html).toContain('data-testid="plan-name-input"');
    });

    it("GIVEN el switcher de vistas, WHEN se selecciona initialMode='tablero', THEN se despliega el Tablero Semanal", () => {
      const html = renderToStaticMarkup(
        createElement(RoutineBuilderModal, {
          isOpen: true,
          onClose: () => {},
          catalogoEjercicios: mockCatalogo,
          alumnoNombre: "Valentina Paz",
          initialMode: "tablero",
        })
      );

      // Se despliega la interfaz del tablero semanal
      expect(html).toContain('data-testid="routine-builder-weekly-board"');
      expect(html).toContain('data-testid="board-days-chips-container"');
      expect(html).toContain('data-testid="board-catalog-panel"');
      expect(html).toContain('data-testid="board-switch-to-classic"');
    });
  });

  describe("Criterio Gherkin 2: Selector de Días en Chips Horizontales y Botón '+ Día'", () => {
    it("GIVEN un plan con días existentes, THEN renderiza chips para cada día con su nombre y el botón '+ Día'", () => {
      const html = renderToStaticMarkup(
        createElement(RoutineBuilderWeeklyBoard, {
          isOpen: true,
          catalogoEjercicios: mockCatalogo,
          alumnoNombre: "Santiago Ramos",
          planInicial: mockPlan,
          diasIniciales: mockDias,
          ejerciciosEnRutinaIniciales: mockEjerciciosEnRutina,
        })
      );

      // Chips para Día 1 y Día 2
      expect(html).toContain('data-testid="board-day-chip-0"');
      expect(html).toContain("Día 1 · Piernas Pesado");
      expect(html).toContain('data-testid="board-day-chip-1"');
      expect(html).toContain("Día 2 · Empuje");

      // Botón + Día disponible
      expect(html).toContain('data-testid="board-add-day-btn"');
    });
  });

  describe("Criterio Gherkin 3: Tarjetas de Ejercicios del Día y Edición Inline", () => {
    it("GIVEN un día con ejercicios, THEN renderiza tarjetas con nombre, series, repeticiones y descansos editables inline", () => {
      const html = renderToStaticMarkup(
        createElement(RoutineBuilderWeeklyBoard, {
          isOpen: true,
          catalogoEjercicios: mockCatalogo,
          alumnoNombre: "Santiago Ramos",
          planInicial: mockPlan,
          diasIniciales: mockDias,
          ejerciciosEnRutinaIniciales: mockEjerciciosEnRutina,
        })
      );

      // Tarjeta de ejercicio Sentadilla Trasera
      expect(html).toContain('data-testid="board-exercise-card-er-1"');
      expect(html).toContain("Sentadilla Trasera con Barra");

      // Inputs inline para series, reps y descanso
      expect(html).toContain('data-testid="board-exercise-series-input-er-1"');
      expect(html).toContain('value="4"');
      expect(html).toContain('data-testid="board-exercise-reps-input-er-1"');
      expect(html).toContain('value="10-8-8-6"');
      expect(html).toContain('data-testid="board-exercise-rest-input-er-1"');
      expect(html).toContain('value="120"');

      // Botón '+ Agregar ejercicio' al pie de la lista
      expect(html).toContain('data-testid="board-add-exercise-btn"');
    });

    it("GIVEN ejercicios agrupados en superserie, THEN muestra el indicador visual de grupo y el badge correspondiente", () => {
      const html = renderToStaticMarkup(
        createElement(RoutineBuilderWeeklyBoard, {
          isOpen: true,
          catalogoEjercicios: mockCatalogo,
          alumnoNombre: "Santiago Ramos",
          planInicial: mockPlan,
          diasIniciales: mockDias,
          ejerciciosEnRutinaIniciales: mockEjerciciosEnRutina,
        })
      );

      // er-2 y er-3 pertenecen a Superserie #1
      expect(html).toContain('data-testid="board-superserie-badge-er-2"');
      expect(html).toContain("Superserie #1");
      expect(html).toContain('data-testid="board-superserie-badge-er-3"');
    });
  });

  describe("Criterio Gherkin 4: Panel Lateral con la Biblioteca Maestro de Ejercicios", () => {
    it("GIVEN la biblioteca lateral, THEN renderiza el buscador, categorías y botón de agregado rápido '+'", () => {
      const html = renderToStaticMarkup(
        createElement(RoutineBuilderWeeklyBoard, {
          isOpen: true,
          catalogoEjercicios: mockCatalogo,
          alumnoNombre: "Santiago Ramos",
        })
      );

      // Panel de catálogo maestro
      expect(html).toContain('data-testid="board-catalog-panel"');
      expect(html).toContain('data-testid="board-catalog-search-input"');
      expect(html).toContain('data-testid="board-catalog-cat-Todos"');
      expect(html).toContain('data-testid="board-catalog-cat-Piernas"');

      // Botones rápidos '+' para cada ejercicio del catálogo
      expect(html).toContain('data-testid="board-catalog-add-ej-1"');
      expect(html).toContain('data-testid="board-catalog-add-ej-2"');
      expect(html).toContain('data-testid="board-catalog-add-ej-3"');
    });
  });

  describe("Criterio Gherkin 5: Persistencia y Contratos Relacionales", () => {
    it("GIVEN un plan armado en el tablero, WHEN se genera el payload, THEN respeta íntegramente los contratos relacionales de Supabase", () => {
      const daysMapped: BuilderDay[] = mapPlanToBuilderDays(
        mockPlan.id,
        mockDias,
        mockEjerciciosEnRutina,
        mockCatalogo
      );

      expect(daysMapped).toHaveLength(2);
      expect(daysMapped[0]!.ejercicios).toHaveLength(3);

      const payload = buildGuardarRutinaPayload({
        planId: mockPlan.id,
        nombre: "Fuerza Bloque 2",
        comentarios: "Optimizado vía Tablero Semanal",
        comoNueva: false,
        days: daysMapped,
      });

      expect(payload.plan_id).toBe(mockPlan.id);
      expect(payload.nombre).toBe("Fuerza Bloque 2");
      expect(payload.comentarios).toBe("Optimizado vía Tablero Semanal");
      expect(payload.dias).toHaveLength(2);
      expect(payload.dias[0]!.nombre).toBe("Día 1 · Piernas Pesado");
      expect(payload.dias[0]!.ejercicios[0]!.ejercicio_id).toBe("ej-1");
      expect(payload.dias[0]!.ejercicios[0]!.series).toBe(4);
      expect(payload.dias[0]!.ejercicios[0]!.descanso_segundos).toBe(120);

      // er-2 en superserie intermedia tiene descanso_segundos = 0
      expect(payload.dias[0]!.ejercicios[1]!.descanso_segundos).toBe(0);
      expect(payload.dias[0]!.ejercicios[1]!.es_superserie).toBe(true);
      expect(payload.dias[0]!.ejercicios[1]!.grupo_superserie).toBe(1);

      // er-3 es el último de la superserie, conserva su descanso
      expect(payload.dias[0]!.ejercicios[2]!.descanso_segundos).toBe(90);
    });

    it("GIVEN el store de Coach Studio en Zustand, WHEN se cambia routineBuilderMode, THEN se sincroniza de forma bidireccional", () => {
      const store = useCoachStudioStore.getState();
      expect(store.routineBuilderMode).toBe("modal");

      store.setRoutineBuilderMode("tablero");
      expect(useCoachStudioStore.getState().routineBuilderMode).toBe("tablero");

      store.setRoutineBuilderMode("modal");
      expect(useCoachStudioStore.getState().routineBuilderMode).toBe("modal");
    });
  });

  describe("Criterio Gherkin 6: Dominio de Superseries y Reordenamiento", () => {
    it("normalizarSuperseries preserva grupos con 2 o más ejercicios y reasigna los inválidos", () => {
      const listaEjercicios = [
        { id: "e1", es_superserie: true, grupo_superserie: 1 },
        { id: "e2", es_superserie: true, grupo_superserie: 1 },
        { id: "e3", es_superserie: true, grupo_superserie: 99 }, // Grupo de 1: debe quedar desvinculado
      ];

      const diasTest = [{ ejercicios: listaEjercicios }];
      const normalizados = normalizarSuperseries(diasTest, null);

      expect(normalizados[0]!.ejercicios[0]!.grupo_superserie).toBe(1);
      expect(normalizados[0]!.ejercicios[1]!.grupo_superserie).toBe(1);
      expect(normalizados[0]!.ejercicios[2]!.es_superserie).toBe(false);
      expect(normalizados[0]!.ejercicios[2]!.grupo_superserie).toBe(null);
    });

    it("asignarGrupo y moverEjercicio respetan la coherencia de circuito", () => {
      const lista = [
        { id: "e1", es_superserie: false, grupo_superserie: null },
        { id: "e2", es_superserie: false, grupo_superserie: null },
      ];

      const conGrupo = asignarGrupo(lista, "e1", 2);
      expect(conGrupo.find((e) => e.id === "e1")?.grupo_superserie).toBe(2);

      const movido = moverEjercicio(conGrupo, 0, "DOWN");
      expect(movido[0]!.id).toBe("e1");
      expect(movido[1]!.id).toBe("e2");
    });
  });
});
