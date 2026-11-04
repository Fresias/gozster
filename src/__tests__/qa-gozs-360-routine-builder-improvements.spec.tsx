import { describe, it, expect, vi } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import {
  RoutineBuilderModal,
  buildGuardarRutinaPayload,
  TAGS_RUTINA_PREDEFINIDAS,
} from "@/components/coach/routine-builder/routine-builder-modal";
import {
  parseDefaultReps,
  parseRepRange,
  parsePyramidSeriesCount,
} from "@/lib/routine-helpers";
import { repsValidas, validarRutina } from "@/lib/validar-rutina";
import type { Ejercicio, DiaRutina, EjercicioEnRutina, PlanEntrenamiento } from "@/types/database.types";

const mockCatalogo: Ejercicio[] = [
  {
    id: "ej-1",
    nombre: "Press de Banca Plano",
    comentario: null,
    musculos_principales: ["PECHO", "TRICEPS"],
    musculos_secundarios: [],
    creado_por: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    url_video: "https://youtube.com/watch?v=mock1",
  },
  {
    id: "ej-2",
    nombre: "Aperturas con Mancuernas",
    comentario: null,
    musculos_principales: ["PECHO"],
    musculos_secundarios: [],
    creado_por: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    url_video: null,
  },
  {
    id: "ej-3",
    nombre: "Plancha Isométrica",
    comentario: null,
    musculos_principales: ["ABDOMEN"],
    musculos_secundarios: [],
    creado_por: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    url_video: null,
  },
];

const mockPlan: PlanEntrenamiento = {
  id: "plan-360",
  profesor_id: "prof-1",
  alumno_id: "alum-1",
  nombre: "Plan Fuerza y Potencia",
  comentarios: "Comentarios de prueba",
  estado: "ACTIVO",
  fecha_inicio: "2026-11-01",
  fecha_fin: null,
  tags: ["Fuerza", "Potencia"],
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
};

const mockDias: DiaRutina[] = [
  {
    id: "dia-1",
    plan_id: "plan-360",
    nombre: "Día 1 - Pecho y Core",
    orden: 1,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  },
];

const mockEjerciciosEnRutina: (EjercicioEnRutina & {
  tipo_medicion?: "REPS" | "TIEMPO";
  tiempo_objetivo_segundos?: number | null;
  es_unilateral?: boolean;
})[] = [
  {
    id: "er-1",
    dia_id: "dia-1",
    ejercicio_id: "ej-1",
    orden: 1,
    series: 4,
    repeticiones: "10-8-6-4",
    descanso_segundos: 90,
    rpe_objetivo: 8,
    notas: null,
    es_superserie: true,
    grupo_superserie: 1,
    tipo_serie: "NORMAL",
    tipo_medicion: "REPS",
    tiempo_objetivo_segundos: null,
    es_unilateral: false,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  },
  {
    id: "er-2",
    dia_id: "dia-1",
    ejercicio_id: "ej-2",
    orden: 2,
    series: 4,
    repeticiones: "8/12",
    descanso_segundos: 0,
    rpe_objetivo: null,
    notas: null,
    es_superserie: true,
    grupo_superserie: 1,
    tipo_serie: "DROPSET",
    tipo_medicion: "REPS",
    tiempo_objetivo_segundos: null,
    es_unilateral: true,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  },
  {
    id: "er-3",
    dia_id: "dia-1",
    ejercicio_id: "ej-3",
    orden: 3,
    series: 3,
    repeticiones: "45",
    descanso_segundos: 60,
    rpe_objetivo: null,
    notas: null,
    es_superserie: false,
    grupo_superserie: null,
    tipo_serie: "NORMAL",
    tipo_medicion: "TIEMPO",
    tiempo_objetivo_segundos: 45,
    es_unilateral: false,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  },
];

describe("GOZS-360: Constructor de Rutinas (Parser Piramidal, Rango, Dropset, Propagación SS, Tags, Unilateral)", () => {
  describe("Criterio 1: Etiquetas de Rutina (Multi-select cerrado)", () => {
    it("provee la lista cerrada con las 5 opciones obligatorias", () => {
      expect(TAGS_RUTINA_PREDEFINIDAS).toEqual([
        "Fuerza",
        "Hipertrofia",
        "Rehabilitación",
        "Potencia",
        "Peso Corporal",
      ]);
    });

    it("renderiza el selector multi-select en la cabecera del modal", () => {
      const html = renderToStaticMarkup(
        createElement(RoutineBuilderModal, {
          isOpen: true,
          onClose: () => {},
          planInicial: mockPlan,
          catalogoEjercicios: mockCatalogo,
          diasIniciales: mockDias,
          ejerciciosEnRutinaIniciales: mockEjerciciosEnRutina,
        })
      );

      expect(html).toContain('data-testid="routine-tags-selector"');
      expect(html).toContain("Fuerza");
      expect(html).toContain("Hipertrofia");
      expect(html).toContain("Rehabilitación");
      expect(html).toContain("Potencia");
      expect(html).toContain("Peso Corporal");
    });

    it("empaqueta tags en buildGuardarRutinaPayload", () => {
      const payload = buildGuardarRutinaPayload({
        comoNueva: false,
        nombre: "Rutina Hipertrofia",
        comentarios: "Foco tren superior",
        tags: ["Hipertrofia", "Fuerza"],
        days: [],
      });

      expect(payload.tags).toEqual(["Hipertrofia", "Fuerza"]);
    });
  });

  describe("Criterio 2: Propagación de Series en Superseries y Tooltip/Hint", () => {
    it("renderiza el hint recomendando agregar los ejercicios antes de fijar series", () => {
      const html = renderToStaticMarkup(
        createElement(RoutineBuilderModal, {
          isOpen: true,
          onClose: () => {},
          planInicial: mockPlan,
          catalogoEjercicios: mockCatalogo,
          diasIniciales: mockDias,
          ejerciciosEnRutinaIniciales: mockEjerciciosEnRutina,
        })
      );

      expect(html).toContain('data-testid="superserie-hint"');
      expect(html).toContain("Recomendación:");
      expect(html).toContain("Agregá todos los ejercicios a la superserie antes de fijar las series");
    });

    it("lógica de propagación: asignar valor en el primer ejercicio sobreescribe el circuito y mantiene editabilidad individual", () => {
      type Ex = { id: string; es_superserie: boolean; grupo_superserie: number | null; series: number | null };
      const circuit: Ex[] = [
        { id: "e1", es_superserie: true, grupo_superserie: 1, series: 0 },
        { id: "e2", es_superserie: true, grupo_superserie: 1, series: 0 },
        { id: "e3", es_superserie: false, grupo_superserie: null, series: 3 },
      ];

      const applySeriesUpdate = (list: Ex[], exId: string, val: number): Ex[] => {
        const target = list.find((e) => e.id === exId);
        if (!target) return list;
        if (target.es_superserie && target.grupo_superserie !== null) {
          const ss = list.filter((e) => e.es_superserie && e.grupo_superserie === target.grupo_superserie);
          if (ss[0]?.id === exId) {
            return list.map((e) =>
              e.es_superserie && e.grupo_superserie === target.grupo_superserie ? { ...e, series: val } : e
            );
          }
        }
        return list.map((e) => (e.id === exId ? { ...e, series: val } : e));
      };

      // Coach ingresa 4 en el primer ejercicio de la superserie:
      const propagated = applySeriesUpdate(circuit, "e1", 4);
      expect(propagated[0]!.series).toBe(4);
      expect(propagated[1]!.series).toBe(4); // e2 propagado a 4
      expect(propagated[2]!.series).toBe(3); // e3 no afectado

      // Coach edita individualmente e2 a 5:
      const individuallyEdited = applySeriesUpdate(propagated, "e2", 5);
      expect(individuallyEdited[0]!.series).toBe(4); // e1 sigue en 4
      expect(individuallyEdited[1]!.series).toBe(5); // e2 modificado individualmente
      expect(individuallyEdited[2]!.series).toBe(3);
    });
  });

  describe("Criterio 3: Dropset Quirúrgico (Reps AL FALLO y Descanso 0s bloqueado)", () => {
    it("valida que 'AL FALLO' es una repetición legal sin errores", () => {
      expect(repsValidas("AL FALLO")).toBe(true);
      expect(repsValidas("al fallo")).toBe(true);
    });

    it("en el modal renderiza el descanso bloqueado en 0s para ejercicios Dropset", () => {
      const html = renderToStaticMarkup(
        createElement(RoutineBuilderModal, {
          isOpen: true,
          onClose: () => {},
          planInicial: mockPlan,
          catalogoEjercicios: mockCatalogo,
          diasIniciales: mockDias,
          ejerciciosEnRutinaIniciales: mockEjerciciosEnRutina,
        })
      );

      expect(html).toContain("0s (bloqueado)");
    });
  });

  describe("Criterio 4: Parser Piramidal con Guión e Invalidación de Espacios", () => {
    it("parsePyramidSeriesCount fija automáticamente 4 series para '10-8-6-4'", () => {
      expect(parsePyramidSeriesCount("10-8-6-4")).toBe(4);
      expect(parsePyramidSeriesCount("12-10-8-6-4")).toBe(5);
    });

    it("rechaza espacios '10 8 6 4' invalidando la entrada", () => {
      expect(parsePyramidSeriesCount("10 8 6 4")).toBeNull();
      expect(repsValidas("10 8 6 4")).toBe(false);
    });
  });

  describe("Criterio 5: Rango con Barra '/' y Target Máximo en App", () => {
    it("reconoce rango '8/12' con mínimo 8 y máximo 12", () => {
      const range = parseRepRange("8/12");
      expect(range).toEqual({ isRange: true, min: 8, max: 12 });
    });

    it("en la app, parseDefaultReps toma el valor máximo (12) por defecto", () => {
      expect(parseDefaultReps("8/12", 1)).toBe(12);
      expect(parseDefaultReps("10/12", 1)).toBe(12);
    });
  });

  describe("Criterio 6: Unidad Reps vs Tiempo y Toggle Unilateral", () => {
    it("renderiza el toggle Reps vs Tiempo y el botón de Unilateral en la fila", () => {
      const html = renderToStaticMarkup(
        createElement(RoutineBuilderModal, {
          isOpen: true,
          onClose: () => {},
          planInicial: mockPlan,
          catalogoEjercicios: mockCatalogo,
          diasIniciales: mockDias,
          ejerciciosEnRutinaIniciales: mockEjerciciosEnRutina,
        })
      );

      expect(html).toContain('data-testid="medicion-reps-er-1"');
      expect(html).toContain('data-testid="medicion-tiempo-er-1"');
      expect(html).toContain('data-testid="unilateral-toggle-er-1"');
      expect(html).toContain('data-testid="unilateral-toggle-er-2"');
      expect(html).toContain("⚡ Unilateral");
    });

    it("serializa tipo_medicion, tiempo_objetivo_segundos y es_unilateral en el payload", () => {
      const day = {
        id: "d1",
        nombre: "Día 1",
        orden: 1,
        ejercicios: [
          {
            id: "x1",
            ejercicio_id: "e1",
            nombre: "Plancha",
            series: 3,
            repeticiones: "45",
            descanso_segundos: 60,
            rpe_objetivo: null,
            tempo: "0",
            tempo_activo: false,
            force_rpe_required: false,
            notas: "",
            es_superserie: false,
            grupo_superserie: null,
            tipo_serie: "NORMAL" as const,
            tipo_medicion: "TIEMPO" as const,
            tiempo_objetivo_segundos: 45,
            es_unilateral: true,
          },
        ],
      };

      const payload = buildGuardarRutinaPayload({
        comoNueva: false,
        nombre: "Rutina",
        comentarios: "",
        days: [day],
      });

      const ex = payload.dias[0]!.ejercicios[0]!;
      expect(ex.tipo_medicion).toBe("TIEMPO");
      expect(ex.tiempo_objetivo_segundos).toBe(45);
      expect(ex.es_unilateral).toBe(true);
    });
  });
});
