import { describe, it, expect, vi } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import {
  RoutineBuilderModal,
} from "@/components/coach/routine-builder/routine-builder-modal";
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
];

const mockPlan: PlanEntrenamiento = {
  id: "plan-412",
  profesor_id: "prof-1",
  alumno_id: "alum-1",
  nombre: "Plan Fuerza y Acondicionamiento",
  comentarios: "Rutina de torso",
  estado: "ACTIVO",
  fecha_inicio: "2026-11-01",
  fecha_fin: null,
  tags: ["Fuerza"],
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
};

const mockDiasConEjercicios: DiaRutina[] = [
  {
    id: "dia-1",
    plan_id: "plan-412",
    nombre: "Día 1 - Torso",
    orden: 1,
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
    repeticiones: "10-8-6-4",
    descanso_segundos: 90,
    rpe_objetivo: 8,
    notas: null,
    es_superserie: false,
    grupo_superserie: null,
    tipo_serie: "NORMAL",
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  },
];

describe("GOZS-412: Constructor - CTA '+ Añadir Ejercicio' al pie del día y botón accesible", () => {
  it("GIVEN un día con ejercicios cargados, THEN renderiza el botón amplio '+ Añadir otro ejercicio' al pie con testid accesible y borde punteado", () => {
    const html = renderToStaticMarkup(
      createElement(RoutineBuilderModal, {
        isOpen: true,
        onClose: () => {},
        planInicial: mockPlan,
        catalogoEjercicios: mockCatalogo,
        diasIniciales: mockDiasConEjercicios,
        ejerciciosEnRutinaIniciales: mockEjerciciosEnRutina,
      })
    );

    // Botón superior existente en cabecera
    expect(html).toContain('data-testid="open-exercise-catalog-btn"');
    expect(html).toContain("+ Añadir Ejercicio del Catálogo");

    // Nuevo CTA al pie de la lista de ejercicios
    expect(html).toContain('data-testid="add-another-exercise-btn"');
    expect(html).toContain("+ Añadir otro ejercicio");

    // Valida tokens visuales y ergonomía táctil (amplio, outline, border-dashed, rounded-lg, min-h-11)
    const btnRegex = /<button[^>]*data-testid="add-another-exercise-btn"[^>]*>|<button[^>]*class="[^"]*"[^>]*data-testid="add-another-exercise-btn"[^>]*>/;
    const match = html.match(/<button[^>]*data-testid="add-another-exercise-btn"[^>]*>[^<]*<\/button>/);
    expect(match).toBeTruthy();
    const btnHtml = match![0];
    expect(btnHtml).toContain("border-dashed");
    expect(btnHtml).toContain("w-full");
    expect(btnHtml).toContain("min-h-11");
    expect(btnHtml).toContain("rounded-lg");
    expect(btnHtml).toContain("+ Añadir otro ejercicio");
  });

  it("GIVEN un día vacío sin ejercicios cargados, THEN exhibe el mensaje de día vacío y no duplica el botón al pie", () => {
    const html = renderToStaticMarkup(
      createElement(RoutineBuilderModal, {
        isOpen: true,
        onClose: () => {},
        planInicial: mockPlan,
        catalogoEjercicios: mockCatalogo,
        diasIniciales: [
          {
            id: "dia-vacio",
            plan_id: "plan-412",
            nombre: "Día Vacío",
            orden: 1,
            created_at: "2026-11-01T00:00:00Z",
            updated_at: "2026-11-01T00:00:00Z",
          },
        ],
        ejerciciosEnRutinaIniciales: [],
      })
    );

    // Muestra aviso de día sin ejercicios
    expect(html).toContain("No hay ejercicios cargados en este día");
    // Conserva el botón superior
    expect(html).toContain('data-testid="open-exercise-catalog-btn"');
    // NO exhibe el botón al pie de ejercicios
    expect(html).not.toContain('data-testid="add-another-exercise-btn"');
  });
});
