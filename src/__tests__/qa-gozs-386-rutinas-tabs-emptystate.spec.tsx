import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RutinasLibrary } from "@/components/coach/rutinas-library";
import {
  clasificarRutinas,
  determinarPestanaPorDefecto,
  filtrarRutinas,
  filtrarRutinasPorTag,
} from "@/lib/rutinas-biblioteca";
import type { LiveSupabaseDataset } from "@/services/alumnos-service";
import type { Perfil, PlanEntrenamiento } from "@/types/database.types";

const mock14Alumnos: Perfil[] = Array.from({ length: 14 }, (_, i) => ({
  id: `alumno-${i + 1}`,
  nombre_completo: `Alumno Prueba ${i + 1}`,
  email: `alumno${i + 1}@example.com`,
  rol: "ALUMNO",
  estado_membresia: "ACTIVA",
  profesor_asignado_id: "coach-1",
  fecha_baja: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
}));

const mock14RutinasAlumnos: PlanEntrenamiento[] = Array.from({ length: 14 }, (_, i) => {
  const tags = i % 3 === 0 ? ["Fuerza"] : i % 3 === 1 ? ["Hipertrofia"] : ["Rehabilitación"];
  return {
    id: `plan-alumno-${i + 1}`,
    profesor_id: "coach-1",
    alumno_id: `alumno-${i + 1}`,
    nombre: `Rutina Alumno ${i + 1} (${tags[0]})`,
    tipo: "DE_ALUMNO",
    estado: "ACTIVO",
    comentarios: `Plan activo de alumno ${i + 1}`,
    fecha_inicio: "2026-10-01T00:00:00Z",
    fecha_fin: null,
    tags,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  };
});

const datasetCon14AlumnosY0Plantillas: LiveSupabaseDataset = {
  alumnos: mock14Alumnos,
  planes: mock14RutinasAlumnos,
  dias: [],
  ejerciciosEnRutina: [],
  ejercicios: [],
};

const datasetVacio: LiveSupabaseDataset = {
  alumnos: [],
  planes: [],
  dias: [],
  ejerciciosEnRutina: [],
  ejercicios: [],
};

describe("GOZS-386: Coach Studio - Biblioteca de Rutinas (/studio/rutinas) Tabs y EmptyState", () => {
  describe("Criterio 1: Apertura inmediata en pestaña 'De alumnos' cuando existen 14 rutinas de alumnos y 0 plantillas maestras", () => {
    it("determinarPestanaPorDefecto resuelve 'alumnos' si plantillas=0 y deAlumnos>0", () => {
      const { plantillas, deAlumnos } = clasificarRutinas(datasetCon14AlumnosY0Plantillas.planes);
      expect(plantillas).toHaveLength(0);
      expect(deAlumnos).toHaveLength(14);
      expect(determinarPestanaPorDefecto(datasetCon14AlumnosY0Plantillas.planes)).toBe("alumnos");
    });

    it("GIVEN una base con 14 rutinas de alumnos y 0 plantillas maestras, WHEN el entrenador ingresa a /studio/rutinas, THEN la vista abre inmediatamente en la pestaña 'De alumnos'", () => {
      const html = renderToStaticMarkup(
        createElement(RutinasLibrary, { initialDataset: datasetCon14AlumnosY0Plantillas }),
      );

      // Tab 'De alumnos' está seleccionado
      expect(html).toContain('data-testid="tab-de-alumnos"');
      expect(html).toContain('aria-selected="true"');

      // Las rutinas de alumnos se renderizan en pantalla
      expect(html).toContain("Alumno Prueba 1");
      expect(html).toContain("Rutina Alumno 1 (Fuerza)");
      expect(html).toContain("De alumnos (14)");

      // No se muestra la pantalla vacía de plantillas
      expect(html).not.toContain('data-testid="empty-state-plantillas"');
    });
  });

  describe("Criterio 2: EmptyState accesible en pestaña 'Plantillas maestras' sin plantillas", () => {
    it("GIVEN la pestaña 'Plantillas maestras' sin plantillas, WHEN se visualiza, THEN renderiza el EmptyState accesible con botón para 'Crear plantilla'", () => {
      // Forzamos visualización de la pestaña 'plantillas'
      const html = renderToStaticMarkup(
        createElement(RutinasLibrary, {
          initialDataset: datasetCon14AlumnosY0Plantillas,
          defaultSubTab: "plantillas",
        }),
      );

      // Renderiza el EmptyState con testid y textos accesibles
      expect(html).toContain('data-testid="empty-state-plantillas"');
      expect(html).toContain("Todavía no hay plantillas.");

      // Botón accesible de llamado a la acción 'Crear plantilla'
      expect(html).toContain('data-testid="btn-crear-plantilla"');
      expect(html).toContain("Crear plantilla");

      // Botón secundario para ver rutinas de alumnos
      expect(html).toContain('data-testid="btn-ver-rutinas-alumnos"');
      expect(html).toContain("Ver rutinas de alumnos");
    });

    it("GIVEN una base completamente vacía, WHEN se visualiza 'plantillas', THEN el EmptyState ofrece crear plantilla", () => {
      const html = renderToStaticMarkup(
        createElement(RutinasLibrary, { initialDataset: datasetVacio }),
      );

      expect(html).toContain('data-testid="empty-state-plantillas"');
      expect(html).toContain('data-testid="btn-crear-plantilla"');
      expect(html).toContain("Crear plantilla");
    });
  });

  describe("Criterio 3: Barra de filtros por objetivos (Fuerza, Hipertrofia, etc.)", () => {
    it("GIVEN los chips de filtro por objetivo, WHEN se activa 'Fuerza', THEN la lista filtra instantáneamente las rutinas etiquetadas con dicha categoría", () => {
      const soloFuerza = filtrarRutinasPorTag(datasetCon14AlumnosY0Plantillas.planes, "Fuerza");
      expect(soloFuerza.length).toBeGreaterThan(0);
      expect(soloFuerza.every((p) => p.tags?.includes("Fuerza"))).toBe(true);

      const soloHipertrofia = filtrarRutinasPorTag(datasetCon14AlumnosY0Plantillas.planes, "Hipertrofia");
      expect(soloHipertrofia.length).toBeGreaterThan(0);
      expect(soloHipertrofia.every((p) => p.tags?.includes("Hipertrofia"))).toBe(true);

      const combinada = filtrarRutinas(datasetCon14AlumnosY0Plantillas.planes, "Fuerza", "Rutina Alumno 1 (");
      expect(combinada.length).toBe(1);
      expect(combinada[0]!.id).toBe("plan-alumno-1");
    });
  });

  describe("Criterio 4: Header unificado (Tabs + Barra de filtros en un único header limpio)", () => {
    it("unifica los selectores de pestañas y la barra de filtros en un único contenedor", () => {
      const html = renderToStaticMarkup(
        createElement(RutinasLibrary, { initialDataset: datasetCon14AlumnosY0Plantillas }),
      );

      // Contenedor unificado
      expect(html).toContain('data-testid="rutinas-filters-container"');

      // Sub-tabs dentro del header unificado
      expect(html).toContain('data-testid="rutinas-sub-tabs"');
      expect(html).toContain('data-testid="tab-de-alumnos"');
      expect(html).toContain('data-testid="tab-plantillas-maestras"');
      expect(html).toContain('data-testid="tab-borradores"');
      expect(html).toContain('data-testid="tab-archivadas"');

      // Buscador reactivo y chips de tags dentro del header unificado
      expect(html).toContain('data-testid="search-rutinas-input"');
      expect(html).toContain('data-testid="rutinas-tags-filter"');
      expect(html).toContain('data-testid="tag-filter-fuerza"');
      expect(html).toContain('data-testid="tag-filter-hipertrofia"');
      expect(html).toContain('data-testid="tag-filter-rehabilitacion"');
    });
  });
});
