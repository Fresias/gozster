import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  RoutineBuilderModal,
  buildGuardarRutinaPayload,
  type BuilderDay,
} from "@/components/coach/routine-builder/routine-builder-modal";
import type {
  DiaRutina,
  Ejercicio,
  EjercicioEnRutina,
  PlanEntrenamiento,
} from "@/types/database.types";

// Mock de Supabase para evitar llamadas de red en renderizado
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
          single: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
      insert: () => Promise.resolve({ data: null, error: null }),
    }),
    rpc: () => Promise.resolve({ data: "plan-mock-id", error: null }),
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    },
  },
}));

const mockCatalogo: Ejercicio[] = [
  {
    id: "ej-1",
    nombre: "Press de Banca Plano",
    comentario: null,
    musculos_principales: ["PECHO"],
    musculos_secundarios: [],
    creado_por: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    url_video: null,
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
    nombre: "Flexiones de Brazos",
    comentario: null,
    musculos_principales: ["PECHO", "TRICEPS"],
    musculos_secundarios: [],
    creado_por: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    url_video: null,
  },
  {
    id: "ej-4",
    nombre: "Plancha Abdominal",
    comentario: null,
    musculos_principales: ["CORE"],
    musculos_secundarios: [],
    creado_por: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    url_video: null,
  },
];

const mockPlan: PlanEntrenamiento = {
  id: "plan-414",
  profesor_id: "prof-1",
  alumno_id: "alum-1",
  nombre: "Rutina Superseries Avanzadas",
  comentarios: "Feedback Entrenador",
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
    plan_id: "plan-414",
    nombre: "Día 1 - Superseries y Circuito",
    orden: 1,
    created_at: "2026-11-08T00:00:00Z",
    updated_at: "2026-11-08T00:00:00Z",
  },
];

describe("GOZS-414: Superseries - Bloqueo de descanso en intermedios (0s) y descanso al final de ronda", () => {
  describe("Criterio Gherkin 1: Renderizado en routine-builder-modal.tsx", () => {
    it("GIVEN un día con ejercicios agrupados en superserie, THEN los ejercicios intermedios quedan bloqueados a 0s con '0s (inmediato: superserie)'", () => {
      const mockEjercicios: EjercicioEnRutina[] = [
        {
          id: "er-ss-1",
          dia_id: "dia-1",
          ejercicio_id: "ej-1",
          orden: 1,
          series: 4,
          repeticiones: "10",
          descanso_segundos: 90,
          rpe_objetivo: 8,
          notas: null,
          es_superserie: true,
          grupo_superserie: 1,
          tipo_serie: "NORMAL",
          created_at: "2026-11-08T00:00:00Z",
          updated_at: "2026-11-08T00:00:00Z",
        },
        {
          id: "er-ss-2",
          dia_id: "dia-1",
          ejercicio_id: "ej-2",
          orden: 2,
          series: 4,
          repeticiones: "12",
          descanso_segundos: 120,
          rpe_objetivo: 8,
          notas: null,
          es_superserie: true,
          grupo_superserie: 1,
          tipo_serie: "NORMAL",
          created_at: "2026-11-08T00:00:00Z",
          updated_at: "2026-11-08T00:00:00Z",
        },
        {
          id: "er-normal-3",
          dia_id: "dia-1",
          ejercicio_id: "ej-4",
          orden: 3,
          series: 3,
          repeticiones: "15",
          descanso_segundos: 60,
          rpe_objetivo: null,
          notas: null,
          es_superserie: false,
          grupo_superserie: null,
          tipo_serie: "NORMAL",
          created_at: "2026-11-08T00:00:00Z",
          updated_at: "2026-11-08T00:00:00Z",
        },
      ];

      const html = renderToStaticMarkup(
        createElement(RoutineBuilderModal, {
          isOpen: true,
          onClose: () => {},
          planInicial: mockPlan,
          catalogoEjercicios: mockCatalogo,
          diasIniciales: mockDias,
          ejerciciosEnRutinaIniciales: mockEjercicios,
        })
      );

      // er-ss-1 es intermedio: muestra la etiqueta indicadora "0s (inmediato: superserie)"
      expect(html).toContain("0s (inmediato: superserie)");
      expect(html).toContain('data-testid="superserie-descanso-inmediato"');

      // er-ss-2 es el último de la superserie: muestra "Descanso de ronda (s):"
      expect(html).toContain("Descanso de ronda (s):");

      // er-normal-3 no es superserie: muestra "Descanso (s):"
      expect(html).toContain("Descanso (s):");

      // El estilo visual del campo bloqueado contiene opacity-60 bg-muted cursor-not-allowed
      expect(html).toContain("opacity-60 bg-muted cursor-not-allowed");
    });

    it("GIVEN superserie de 3 ejercicios (triserie/circuito), THEN los 2 primeros quedan bloqueados y solo el 3ro tiene descanso de ronda", () => {
      const mockEjercicios: EjercicioEnRutina[] = [
        {
          id: "er-tri-1",
          dia_id: "dia-1",
          ejercicio_id: "ej-1",
          orden: 1,
          series: 3,
          repeticiones: "10",
          descanso_segundos: 90,
          rpe_objetivo: 8,
          notas: null,
          es_superserie: true,
          grupo_superserie: 2,
          tipo_serie: "NORMAL",
          created_at: "2026-11-08T00:00:00Z",
          updated_at: "2026-11-08T00:00:00Z",
        },
        {
          id: "er-tri-2",
          dia_id: "dia-1",
          ejercicio_id: "ej-2",
          orden: 2,
          series: 3,
          repeticiones: "12",
          descanso_segundos: 90,
          rpe_objetivo: 8,
          notas: null,
          es_superserie: true,
          grupo_superserie: 2,
          tipo_serie: "NORMAL",
          created_at: "2026-11-08T00:00:00Z",
          updated_at: "2026-11-08T00:00:00Z",
        },
        {
          id: "er-tri-3",
          dia_id: "dia-1",
          ejercicio_id: "ej-3",
          orden: 3,
          series: 3,
          repeticiones: "15",
          descanso_segundos: 150,
          rpe_objetivo: 9,
          notas: null,
          es_superserie: true,
          grupo_superserie: 2,
          tipo_serie: "NORMAL",
          created_at: "2026-11-08T00:00:00Z",
          updated_at: "2026-11-08T00:00:00Z",
        },
      ];

      const html = renderToStaticMarkup(
        createElement(RoutineBuilderModal, {
          isOpen: true,
          onClose: () => {},
          planInicial: mockPlan,
          catalogoEjercicios: mockCatalogo,
          diasIniciales: mockDias,
          ejerciciosEnRutinaIniciales: mockEjercicios,
        })
      );

      // Hay 2 ejercicios intermedios bloqueados a 0s
      const matches = html.match(/0s \(inmediato: superserie\)/g);
      expect(matches).not.toBeNull();
      expect(matches?.length).toBe(2);

      // Y exactamente 1 ejercicio con Descanso de ronda (s):
      const rondaMatches = html.match(/Descanso de ronda \(s\):/g);
      expect(rondaMatches).not.toBeNull();
      expect(rondaMatches?.length).toBe(1);
    });
  });

  describe("Criterio Gherkin 2: Persistencia de descanso_segundos = 0 vía buildGuardarRutinaPayload", () => {
    it("al serializar la rutina para guardar_rutina, los ejercicios intermedios persisten descanso_segundos = 0 y el último conserva su descanso de ronda", () => {
      const days: BuilderDay[] = [
        {
          id: "d1",
          nombre: "Día 1",
          orden: 1,
          ejercicios: [
            {
              id: "b-ex-1",
              ejercicio_id: "ej-1",
              nombre: "Press de Banca Plano",
              series: 4,
              repeticiones: "10",
              descanso_segundos: 90, // intermedio en superserie 1 -> debe persistir 0
              rpe_objetivo: 8,
              tempo: "2-0-1-0",
              tempo_activo: false,
              force_rpe_required: false,
              notas: "",
              es_superserie: true,
              grupo_superserie: 1,
              tipo_serie: "NORMAL",
            },
            {
              id: "b-ex-2",
              ejercicio_id: "ej-2",
              nombre: "Aperturas con Mancuernas",
              series: 4,
              repeticiones: "12",
              descanso_segundos: 90, // intermedio en superserie 1 -> debe persistir 0
              rpe_objetivo: 8,
              tempo: "2-0-1-0",
              tempo_activo: false,
              force_rpe_required: false,
              notas: "",
              es_superserie: true,
              grupo_superserie: 1,
              tipo_serie: "NORMAL",
            },
            {
              id: "b-ex-3",
              ejercicio_id: "ej-3",
              nombre: "Flexiones de Brazos",
              series: 4,
              repeticiones: "AL FALLO",
              descanso_segundos: 120, // último de superserie 1 -> conserva 120 (descanso de ronda)
              rpe_objetivo: 9,
              tempo: "2-0-1-0",
              tempo_activo: false,
              force_rpe_required: false,
              notas: "",
              es_superserie: true,
              grupo_superserie: 1,
              tipo_serie: "NORMAL",
            },
            {
              id: "b-ex-4",
              ejercicio_id: "ej-4",
              nombre: "Plancha Abdominal",
              series: 3,
              repeticiones: "45",
              descanso_segundos: 60, // ejercicio independiente -> conserva 60
              rpe_objetivo: null,
              tempo: "0",
              tempo_activo: false,
              force_rpe_required: false,
              notas: "",
              es_superserie: false,
              grupo_superserie: null,
              tipo_serie: "NORMAL",
            },
          ],
        },
      ];

      const payload = buildGuardarRutinaPayload({
        comoNueva: false,
        nombre: "Rutina Test",
        comentarios: "",
        days,
      });

      const e1 = payload.dias[0]!.ejercicios[0]!;
      const e2 = payload.dias[0]!.ejercicios[1]!;
      const e3 = payload.dias[0]!.ejercicios[2]!;
      const e4 = payload.dias[0]!.ejercicios[3]!;

      // Intermedios quedan con descanso_segundos = 0
      expect(e1.descanso_segundos).toBe(0);
      expect(e2.descanso_segundos).toBe(0);

      // Último de la superserie conserva el descanso de ronda
      expect(e3.descanso_segundos).toBe(120);

      // Ejercicio individual conserva su descanso
      expect(e4.descanso_segundos).toBe(60);
    });
  });
});
