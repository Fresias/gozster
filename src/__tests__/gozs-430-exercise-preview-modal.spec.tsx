import * as React from "react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import { RoutineBuilderModal } from "@/components/coach/routine-builder/routine-builder-modal";
import { ExercisePreviewModal } from "@/components/coach/routine-builder/exercise-preview-modal";
import {
  assertNoDemoLiteralsInLiveMode,
  fireEvent,
  render,
} from "@/test-utils/no-demo-literals";
import type { Ejercicio, DiaRutina, EjercicioEnRutina, PlanEntrenamiento } from "@/types/database.types";

const ts = "2026-11-01T00:00:00Z";
const catalogo: Ejercicio[] = [
  {
    id: "ej-1", nombre: "Remo con Soporte en Pecho", comentario: "Retraer escápulas antes de tirar.",
    musculos_principales: ["ESPALDA"], musculos_secundarios: ["BICEPS"], creado_por: null,
    created_at: ts, updated_at: ts, url_video: "https://www.youtube.com/watch?v=noTGHlQVKfA",
  },
  {
    id: "ej-2", nombre: "Sentadilla Goblet", comentario: null,
    musculos_principales: ["CUADRICEPS"], musculos_secundarios: [], creado_por: null,
    created_at: ts, updated_at: ts, url_video: null,
  },
];
const plan: PlanEntrenamiento = {
  id: "p1", profesor_id: "pr", alumno_id: "al", nombre: "Plan 430", comentarios: "", estado: "ACTIVO",
  fecha_inicio: "2026-11-01", fecha_fin: null, tags: [], created_at: ts, updated_at: ts,
};
const dias: DiaRutina[] = [{ id: "d1", plan_id: "p1", nombre: "Día 1", orden: 1, created_at: ts, updated_at: ts }];
const enRutina: EjercicioEnRutina[] = [
  {
    id: "er-1", dia_id: "d1", ejercicio_id: "ej-1", orden: 1, series: 3, repeticiones: "10",
    descanso_segundos: 60, rpe_objetivo: 8, notas: "Pausa 1s arriba", es_superserie: false,
    grupo_superserie: null, tipo_serie: "NORMAL", created_at: ts, updated_at: ts,
  } as EjercicioEnRutina,
];

const mountBuilder = () =>
  render(
    <RoutineBuilderModal
      isOpen
      onClose={() => {}}
      planInicial={plan}
      catalogoEjercicios={catalogo}
      diasIniciales={dias}
      ejerciciosEnRutinaIniciales={enRutina}
    />
  );

describe("GOZS-430: ExercisePreviewModal en el constructor", () => {
  it("abre desde el nombre de la tarjeta con video, chips, comentario y notas del coach", () => {
    const ui = mountBuilder();
    expect(ui.queryByTestId("exercise-preview-modal")).toBeNull();
    fireEvent.click(ui.getByTestId("preview-ejercicio-er-1"));
    const dialog = ui.getByRole("dialog");
    expect(dialog).toBeTruthy();
    const iframe = ui.getByTestId("exercise-preview-iframe") as any;
    expect(iframe.getAttribute?.("src") ?? iframe.src).toContain("youtube-nocookie.com/embed/noTGHlQVKfA");
    const text = ui.getByTestId("exercise-preview-modal").textContent ?? "";
    expect(text).toContain("ESPALDA");
    expect(text).toContain("BICEPS");
    expect(text).toContain("Retraer escápulas antes de tirar.");
    expect(text).toContain("Pausa 1s arriba");
    assertNoDemoLiteralsInLiveMode(ui.container);
  });

  it("abre desde el botón Ver Técnica y cierra con X, Escape y backdrop", () => {
    const ui = mountBuilder();
    const open = () => fireEvent.click(ui.getByTestId("preview-btn-er-1"));
    open();
    fireEvent.click(ui.getByTestId("close-exercise-preview-btn"));
    expect(ui.queryByTestId("exercise-preview-modal")).toBeNull();
    open();
    fireEvent.keyDown(ui.getByTestId("exercise-preview-modal"), { key: "Escape" });
    expect(ui.queryByTestId("exercise-preview-modal")).toBeNull();
    open();
    fireEvent.click(ui.getByTestId("exercise-preview-modal"));
    expect(ui.queryByTestId("exercise-preview-modal")).toBeNull();
    expect(ui.queryByTestId("exercise-preview-iframe")).toBeNull();
  });

  it("abre desde el catálogo; sin video muestra fallback y permite añadir", () => {
    const ui = mountBuilder();
    fireEvent.click(ui.getByTestId("open-exercise-catalog-btn"));
    fireEvent.click(ui.getByTestId("catalog-preview-ej-2"));
    expect(ui.queryByTestId("exercise-preview-iframe")).toBeNull();
    const fb = ui.getByTestId("exercise-preview-no-video");
    expect(fb.textContent).toContain("Sin video oficial en el catálogo");
    expect(fb.textContent).toContain("Buscar técnica en YouTube");
    fireEvent.click(ui.getByTestId("exercise-preview-add-btn"));
    expect(ui.queryByTestId("exercise-preview-modal")).toBeNull();
    expect(ui.container.textContent).toContain("Sentadilla Goblet");
  });
});

describe("ExercisePreviewModal aislado", () => {
  it("no renderiza cerrado y enlaza búsqueda con noopener noreferrer", () => {
    const closed = render(<ExercisePreviewModal exercise={null} isOpen={false} onClose={() => {}} />);
    expect(closed.queryByTestId("exercise-preview-modal")).toBeNull();
    const ui = render(
      <ExercisePreviewModal exercise={{ nombre: "X", musculos_principales: ["A"] }} isOpen onClose={() => {}} />
    );
    const a = ui.getByText(/Buscar técnica en YouTube/) as any;
    expect(a.getAttribute?.("rel") ?? a.rel).toBe("noopener noreferrer");
  });
});
