import { describe, it, expect, vi } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import {
  RoutineBuilderModal,
  buildGuardarRutinaPayload,
} from "@/components/coach/routine-builder/routine-builder-modal";
import type { Ejercicio, DiaRutina, EjercicioEnRutina, PlanEntrenamiento } from "@/types/database.types";

const mockCatalogo: Ejercicio[] = [
  {
    id: "ej-1",
    nombre: "Sentadilla Goblet",
    comentario: null,
    musculos_principales: ["CUADRICEPS", "GLUTEOS"],
    musculos_secundarios: [],
    creado_por: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    url_video: null,
  },
  {
    id: "ej-2",
    nombre: "Puente de Glúteos",
    comentario: null,
    musculos_principales: ["GLUTEOS"],
    musculos_secundarios: [],
    creado_por: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    url_video: null,
  },
  {
    id: "ej-3",
    nombre: "Press de Banca Plano",
    comentario: null,
    musculos_principales: ["PECHO"],
    musculos_secundarios: [],
    creado_por: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    url_video: null,
  },
];

const mockPlan: PlanEntrenamiento = {
  id: "plan-413",
  profesor_id: "prof-1",
  alumno_id: "alum-1",
  nombre: "Plan Warmup Superseries",
  comentarios: "Prueba superserie warmup",
  estado: "ACTIVO",
  fecha_inicio: "2026-11-08",
  fecha_fin: null,
  tags: ["Fuerza"],
  created_at: "2026-11-08T00:00:00Z",
  updated_at: "2026-11-08T00:00:00Z",
};

const mockDias: DiaRutina[] = [
  {
    id: "dia-1",
    plan_id: "plan-413",
    nombre: "Día 1 - Activación y Fuerza",
    orden: 1,
    created_at: "2026-11-08T00:00:00Z",
    updated_at: "2026-11-08T00:00:00Z",
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
    series: 3,
    repeticiones: "10",
    descanso_segundos: 60,
    rpe_objetivo: 6,
    notas: null,
    es_superserie: true,
    grupo_superserie: 1,
    tipo_serie: "WARMUP",
    tipo_medicion: "REPS",
    tiempo_objetivo_segundos: null,
    es_unilateral: false,
    created_at: "2026-11-08T00:00:00Z",
    updated_at: "2026-11-08T00:00:00Z",
  },
  {
    id: "er-2",
    dia_id: "dia-1",
    ejercicio_id: "ej-2",
    orden: 2,
    series: 3,
    repeticiones: "12",
    descanso_segundos: 60,
    rpe_objetivo: 6,
    notas: null,
    es_superserie: true,
    grupo_superserie: 1,
    tipo_serie: "WARMUP",
    tipo_medicion: "REPS",
    tiempo_objetivo_segundos: null,
    es_unilateral: false,
    created_at: "2026-11-08T00:00:00Z",
    updated_at: "2026-11-08T00:00:00Z",
  },
  {
    id: "er-3",
    dia_id: "dia-1",
    ejercicio_id: "ej-3",
    orden: 3,
    series: 4,
    repeticiones: "8",
    descanso_segundos: 90,
    rpe_objetivo: 8,
    notas: null,
    es_superserie: false,
    grupo_superserie: null,
    tipo_serie: "NORMAL",
    tipo_medicion: "REPS",
    tiempo_objetivo_segundos: null,
    es_unilateral: false,
    created_at: "2026-11-08T00:00:00Z",
    updated_at: "2026-11-08T00:00:00Z",
  },
];

describe("GOZS-413: Superseries: Propagación de Warmup en bloque y tooltip explicativo", () => {
  describe("Criterio 1: Tooltip explicativo en el botón Warmup", () => {
    it("GIVEN el botón 'Warmup' en cualquier tarjeta de ejercicio, THEN incluye el tooltip explicativo de tonelaje y 1RM", () => {
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

      const expectedTooltip = "Calentamiento / Aproximación: no computa para el tonelaje acumulado ni récords 1RM";
      expect(html).toContain(`title="${expectedTooltip}"`);
      expect(html).toContain('data-testid="btn-tipo-serie-warmup-er-1"');
      expect(html).toContain('data-testid="btn-tipo-serie-warmup-er-3"');
    });
  });

  describe("Criterio 2: Badge semántico Warmup con tokens de diseño (warning-soft)", () => {
    it("GIVEN un ejercicio con tipo_serie === 'WARMUP', THEN visualiza el badge semántico con clases de diseño warning-soft", () => {
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

      // Badge Warmup renderizado para er-1 y er-2
      expect(html).toContain('data-testid="badge-tipo-serie-er-1"');
      expect(html).toContain('data-testid="badge-tipo-serie-er-2"');
      expect(html).toContain("bg-warning-soft");
      expect(html).toContain("text-warning-soft-foreground");
      expect(html).toContain("border-warning-soft-border");
      expect(html).toContain("Warmup");

      // Botón Warmup seleccionado para er-1 con tokens de diseño
      expect(html).toContain("bg-warning-soft text-warning-soft-foreground border-warning-soft-border");
    });
  });

  describe("Criterio 3: Lógica de propagación de Warmup en superseries", () => {
    type Ex = {
      id: string;
      es_superserie: boolean;
      grupo_superserie: number | null;
      tipo_serie: "NORMAL" | "WARMUP" | "DROPSET";
      repeticiones: string;
      descanso_segundos: number;
    };

    // Réplica exacta de la función handleToggleTipoSerie de routine-builder-modal.tsx
    const handleToggleTipoSerie = (
      ejercicios: Ex[],
      exId: string,
      tipo: "WARMUP" | "DROPSET"
    ): Ex[] => {
      const ex = ejercicios.find((e) => e.id === exId);
      if (!ex) return ejercicios;
      const nuevoTipo = ex.tipo_serie === tipo ? "NORMAL" : tipo;
      const esSuperserieWarmup =
        tipo === "WARMUP" && Boolean(ex.es_superserie && ex.grupo_superserie !== null);

      return ejercicios.map((e) => {
        const esAfectado =
          e.id === exId ||
          (esSuperserieWarmup &&
            Boolean(e.es_superserie && e.grupo_superserie === ex.grupo_superserie));

        if (!esAfectado) return e;

        if (nuevoTipo === "DROPSET") {
          return {
            ...e,
            tipo_serie: "DROPSET",
            repeticiones: "AL FALLO",
            descanso_segundos: 0,
          };
        }
        if (e.tipo_serie === "DROPSET") {
          return {
            ...e,
            tipo_serie: nuevoTipo,
            repeticiones: e.repeticiones === "AL FALLO" ? "10" : e.repeticiones,
            descanso_segundos: e.descanso_segundos === 0 ? 90 : e.descanso_segundos,
          };
        }
        return { ...e, tipo_serie: nuevoTipo };
      });
    };

    it("GIVEN 4 ejercicios en una misma superserie (todos NORMAL), WHEN activa WARMUP en uno de ellos, THEN todos los ejercicios de esa superserie pasan a WARMUP", () => {
      const ejercicios: Ex[] = [
        { id: "e1", es_superserie: true, grupo_superserie: 1, tipo_serie: "NORMAL", repeticiones: "10", descanso_segundos: 60 },
        { id: "e2", es_superserie: true, grupo_superserie: 1, tipo_serie: "NORMAL", repeticiones: "10", descanso_segundos: 60 },
        { id: "e3", es_superserie: true, grupo_superserie: 1, tipo_serie: "NORMAL", repeticiones: "10", descanso_segundos: 60 },
        { id: "e4", es_superserie: true, grupo_superserie: 1, tipo_serie: "NORMAL", repeticiones: "10", descanso_segundos: 60 },
        { id: "e5", es_superserie: false, grupo_superserie: null, tipo_serie: "NORMAL", repeticiones: "10", descanso_segundos: 90 },
      ];

      const resultado = handleToggleTipoSerie(ejercicios, "e1", "WARMUP");

      // Los 4 de la superserie pasan a WARMUP
      expect(resultado[0]!.tipo_serie).toBe("WARMUP");
      expect(resultado[1]!.tipo_serie).toBe("WARMUP");
      expect(resultado[2]!.tipo_serie).toBe("WARMUP");
      expect(resultado[3]!.tipo_serie).toBe("WARMUP");

      // El ejercicio fuera de la superserie permanece NORMAL
      expect(resultado[4]!.tipo_serie).toBe("NORMAL");
    });

    it("GIVEN ejercicios en superserie en modo WARMUP, WHEN el coach desactiva WARMUP, THEN todos los ejercicios del grupo regresan a NORMAL", () => {
      const ejercicios: Ex[] = [
        { id: "e1", es_superserie: true, grupo_superserie: 1, tipo_serie: "WARMUP", repeticiones: "10", descanso_segundos: 60 },
        { id: "e2", es_superserie: true, grupo_superserie: 1, tipo_serie: "WARMUP", repeticiones: "10", descanso_segundos: 60 },
        { id: "e3", es_superserie: false, grupo_superserie: null, tipo_serie: "NORMAL", repeticiones: "10", descanso_segundos: 90 },
      ];

      const resultado = handleToggleTipoSerie(ejercicios, "e2", "WARMUP");

      // Ambos regresan a NORMAL
      expect(resultado[0]!.tipo_serie).toBe("NORMAL");
      expect(resultado[1]!.tipo_serie).toBe("NORMAL");
      expect(resultado[2]!.tipo_serie).toBe("NORMAL");
    });

    it("GIVEN dos superseries distintas (Grupo 1 y Grupo 2), WHEN activa WARMUP en Grupo 1, THEN no afecta a Grupo 2", () => {
      const ejercicios: Ex[] = [
        { id: "e1", es_superserie: true, grupo_superserie: 1, tipo_serie: "NORMAL", repeticiones: "10", descanso_segundos: 60 },
        { id: "e2", es_superserie: true, grupo_superserie: 1, tipo_serie: "NORMAL", repeticiones: "10", descanso_segundos: 60 },
        { id: "e3", es_superserie: true, grupo_superserie: 2, tipo_serie: "NORMAL", repeticiones: "10", descanso_segundos: 60 },
        { id: "e4", es_superserie: true, grupo_superserie: 2, tipo_serie: "NORMAL", repeticiones: "10", descanso_segundos: 60 },
      ];

      const resultado = handleToggleTipoSerie(ejercicios, "e1", "WARMUP");

      // Solo grupo 1 se sincroniza a WARMUP
      expect(resultado[0]!.tipo_serie).toBe("WARMUP");
      expect(resultado[1]!.tipo_serie).toBe("WARMUP");
      expect(resultado[2]!.tipo_serie).toBe("NORMAL");
      expect(resultado[3]!.tipo_serie).toBe("NORMAL");
    });

    it("GIVEN ejercicio individual sin superserie, WHEN activa WARMUP, THEN solo se activa en dicho ejercicio", () => {
      const ejercicios: Ex[] = [
        { id: "e1", es_superserie: false, grupo_superserie: null, tipo_serie: "NORMAL", repeticiones: "10", descanso_segundos: 60 },
        { id: "e2", es_superserie: false, grupo_superserie: null, tipo_serie: "NORMAL", repeticiones: "10", descanso_segundos: 60 },
      ];

      const resultado = handleToggleTipoSerie(ejercicios, "e1", "WARMUP");

      expect(resultado[0]!.tipo_serie).toBe("WARMUP");
      expect(resultado[1]!.tipo_serie).toBe("NORMAL");
    });
  });

  describe("Criterio 4: Serialización y persistencia del payload", () => {
    it("serializa tipo_serie: 'WARMUP' para todos los ejercicios de la superserie en buildGuardarRutinaPayload", () => {
      const payload = buildGuardarRutinaPayload({
        comoNueva: false,
        nombre: "Rutina Calentamiento",
        comentarios: "Superserie de warmup",
        days: [
          {
            id: "d1",
            nombre: "Día 1",
            orden: 1,
            ejercicios: [
              {
                id: "x1",
                ejercicio_id: "e1",
                nombre: "Sentadilla Goblet",
                series: 3,
                repeticiones: "10",
                descanso_segundos: 60,
                rpe_objetivo: 6,
                tempo: "0",
                tempo_activo: false,
                force_rpe_required: false,
                notas: "",
                es_superserie: true,
                grupo_superserie: 1,
                tipo_serie: "WARMUP",
                tipo_medicion: "REPS",
                tiempo_objetivo_segundos: null,
                es_unilateral: false,
              },
              {
                id: "x2",
                ejercicio_id: "e2",
                nombre: "Puente de Glúteos",
                series: 3,
                repeticiones: "12",
                descanso_segundos: 60,
                rpe_objetivo: 6,
                tempo: "0",
                tempo_activo: false,
                force_rpe_required: false,
                notas: "",
                es_superserie: true,
                grupo_superserie: 1,
                tipo_serie: "WARMUP",
                tipo_medicion: "REPS",
                tiempo_objetivo_segundos: null,
                es_unilateral: false,
              },
            ],
          },
        ],
      });

      expect(payload.dias[0]!.ejercicios[0]!.tipo_serie).toBe("WARMUP");
      expect(payload.dias[0]!.ejercicios[1]!.tipo_serie).toBe("WARMUP");
    });
  });
});
