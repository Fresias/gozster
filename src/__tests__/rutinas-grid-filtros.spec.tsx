import * as React from "react";
import { describe, expect, it } from "vitest";
import { RutinasLibrary } from "@/components/coach/rutinas-library";
import type { LiveSupabaseDataset } from "@/services/alumnos-service";
import type { Perfil, PlanEntrenamiento } from "@/types/database.types";
import {
  assertNoDemoLiteralsInLiveMode,
  fireEvent,
  render,
} from "@/test-utils/no-demo-literals";

const alumnosEnVivo: Perfil[] = Array.from({ length: 14 }, (_, i) => ({
  id: `alumno-vivo-${i + 1}`,
  nombre_completo: `Atleta Real ${i + 1}`,
  email: `atleta${i + 1}@gozster.test`,
  rol: "ALUMNO",
  estado_membresia: "ACTIVA",
  profesor_asignado_id: "coach-1",
  fecha_baja: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
}));

const planesEnVivo: PlanEntrenamiento[] = Array.from({ length: 14 }, (_, i) => {
  const tags = i % 3 === 0 ? ["Fuerza"] : i % 3 === 1 ? ["Hipertrofia"] : ["Rehabilitación"];
  return {
    id: `plan-vivo-${i + 1}`,
    profesor_id: "coach-1",
    alumno_id: `alumno-vivo-${i + 1}`,
    nombre: `Bloque Entrenamiento ${i + 1} (${tags[0]})`,
    tipo: "DE_ALUMNO",
    estado: "ACTIVO",
    comentarios: `Ciclo personalizado ${i + 1}`,
    fecha_inicio: "2026-10-01T00:00:00Z",
    fecha_fin: null,
    tags,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  };
});

const datasetEnVivo: LiveSupabaseDataset = {
  alumnos: alumnosEnVivo,
  planes: planesEnVivo,
  dias: [],
  ejerciciosEnRutina: [],
  ejercicios: [],
};

const datasetVacioEnVivo: LiveSupabaseDataset = {
  alumnos: [],
  planes: [],
  dias: [],
  ejerciciosEnRutina: [],
  ejercicios: [],
};

describe("FIX-08 / GOZS-386: RutinasLibrary (Grilla, Pestañas y Filtros) montada con render(...) y datos en vivo", () => {
  it("GIVEN 14 rutinas de alumnos en vivo y 0 plantillas maestras WHEN se monta RutinasLibrary con render(...) THEN abre en 'De alumnos', renderiza los 14 planes en el DOM y no contiene literales demo", () => {
    const { container, getByTestId, getAllByTestId, queryByTestId } = render(
      <RutinasLibrary initialDataset={datasetEnVivo} />
    );

    assertNoDemoLiteralsInLiveMode(container);

    const tabAlumnos = getByTestId("tab-de-alumnos");
    expect(tabAlumnos.getAttribute("aria-selected")).toBe("true");
    expect(tabAlumnos.textContent).toMatch(/De alumnos\s*14/);

    const items = getAllByTestId("rutina-item");
    expect(items).toHaveLength(14);
    expect(items[0]!.textContent).toContain("Bloque Entrenamiento 1 (Fuerza)");
    expect(items[0]!.textContent).toContain("Atleta Real 1");

    expect(queryByTestId("empty-state-plantillas")).toBeNull();
  });

  it("GIVEN el componente montado con render(...) WHEN el usuario acciona los chips de filtro por objetivo ('Fuerza', 'Hipertrofia') THEN filtra reactivamente los nodos DOM de la lista", () => {
    const { container, getByTestId, getAllByTestId } = render(
      <RutinasLibrary initialDataset={datasetEnVivo} />
    );

    assertNoDemoLiteralsInLiveMode(container);

    // Inicialmente están los 14 planes
    expect(getAllByTestId("rutina-item")).toHaveLength(14);

    // 1. Clic en chip 'Fuerza' (índices 0, 3, 6, 9, 12 -> 5 rutinas)
    // Objetivo Rutinas.html: selector "Todos los objetivos"
    fireEvent.change(getByTestId("rutinas-objetivo-select"), { target: { value: "Fuerza" } });

    expect((getByTestId("rutinas-objetivo-select") as HTMLSelectElement).value).toBe("Fuerza");
    const itemsFuerza = getAllByTestId("rutina-item");
    expect(itemsFuerza).toHaveLength(5);
    for (const item of itemsFuerza) {
      expect(item.textContent).toContain("(Fuerza)");
      expect(item.textContent).not.toContain("(Hipertrofia)");
    }

    // 2. Clic en chip 'Hipertrofia' (índices 1, 4, 7, 10, 13 -> 5 rutinas)
    fireEvent.change(getByTestId("rutinas-objetivo-select"), { target: { value: "Hipertrofia" } });

    expect((getByTestId("rutinas-objetivo-select") as HTMLSelectElement).value).toBe("Hipertrofia");
    const itemsHipertrofia = getAllByTestId("rutina-item");
    expect(itemsHipertrofia).toHaveLength(5);
    for (const item of itemsHipertrofia) {
      expect(item.textContent).toContain("(Hipertrofia)");
      expect(item.textContent).not.toContain("(Fuerza)");
    }

    // 3. Clic nuevamente en 'Hipertrofia' desactiva el filtro y vuelve a 'Todos' (14 rutinas)
    fireEvent.change(getByTestId("rutinas-objetivo-select"), { target: { value: "Todos" } });
    expect(getAllByTestId("rutina-item")).toHaveLength(14);
  });

  it("GIVEN el buscador reactivo montado en el DOM WHEN se escribe un término de búsqueda THEN filtra las rutinas en el DOM y permite limpiar la búsqueda", () => {
    const { container, getByTestId, getAllByTestId, getByLabelText } = render(
      <RutinasLibrary initialDataset={datasetEnVivo} />
    );

    assertNoDemoLiteralsInLiveMode(container);

    const searchInput = getByTestId("search-rutinas-input");
    fireEvent.change(searchInput, {
      target: { value: "Bloque Entrenamiento 14" },
    });

    const filtradas = getAllByTestId("rutina-item");
    expect(filtradas).toHaveLength(1);
    expect(filtradas[0]!.textContent).toContain("Bloque Entrenamiento 14 (Hipertrofia)");

    // Botón limpiar búsqueda aparece y restaura las 14 rutinas al hacer clic
    const btnLimpiar = getByLabelText("Limpiar búsqueda");
    fireEvent.click(btnLimpiar);

    expect(getAllByTestId("rutina-item")).toHaveLength(14);
  });

  it("GIVEN la pestaña 'Plantillas' sin plantillas maestras WHEN se selecciona la pestaña en el DOM THEN renderiza EmptyState accesible con botón 'Crear plantilla'", () => {
    const { container, getByTestId } = render(
      <RutinasLibrary
        initialDataset={datasetEnVivo}
        defaultSubTab="plantillas"
      />
    );

    assertNoDemoLiteralsInLiveMode(container);

    const emptyPlantillas = getByTestId("empty-state-plantillas");
    expect(emptyPlantillas.textContent).toContain("Todavía no hay plantillas.");

    const btnCrear = getByTestId("btn-crear-plantilla");
    expect(btnCrear.textContent).toContain("Crear plantilla");

    const btnVerAlumnos = getByTestId("btn-ver-rutinas-alumnos");
    expect(btnVerAlumnos.textContent).toContain("Ver rutinas de alumnos");

    // Al hacer clic en 'Ver rutinas de alumnos' cambia a la pestaña 'alumnos' en el DOM
    fireEvent.click(btnVerAlumnos);
    expect(getByTestId("tab-de-alumnos").getAttribute("aria-selected")).toBe("true");
  });

  it("GIVEN una base vacía en vivo WHEN se monta RutinasLibrary THEN renderiza el EmptyState sin literales de demo", () => {
    const { container, getByTestId } = render(
      <RutinasLibrary initialDataset={datasetVacioEnVivo} />
    );

    assertNoDemoLiteralsInLiveMode(container);

    expect(getByTestId("empty-state-plantillas").textContent).toContain(
      "Todavía no hay plantillas."
    );
    expect(getByTestId("btn-crear-plantilla").textContent).toContain("Crear plantilla");
  });
});
