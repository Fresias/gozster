import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RutinasLibrary } from "@/components/coach/rutinas-library";
import {
  filtrarRutinas,
  filtrarRutinasPorBusqueda,
  filtrarRutinasPorTag,
  heredarTagsDePlantilla,
  getTagBadgeStyles,
  getTagChipFilterStyles,
  TAGS_FILTRO_BIBLIOTECA,
  tagToSlug,
} from "@/lib/rutinas-biblioteca";
import type { LiveSupabaseDataset } from "@/services/alumnos-service";
import type { PlanEntrenamiento, Perfil, DiaRutina, Ejercicio, EjercicioEnRutina } from "@/types/database.types";

const mockAlumnos: Perfil[] = [
  {
    id: "alumno-1",
    nombre_completo: "Lucas Rodríguez",
    email: "lucas@example.com",
    rol: "ALUMNO",
    estado_membresia: "ACTIVA",
    profesor_asignado_id: "coach-1",
    fecha_baja: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  },
  {
    id: "alumno-2",
    nombre_completo: "Camila Navarro",
    email: "camila@example.com",
    rol: "ALUMNO",
    estado_membresia: "ACTIVA",
    profesor_asignado_id: "coach-1",
    fecha_baja: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  },
];

const mockPlanes: PlanEntrenamiento[] = [
  {
    id: "plan-plantilla-fuerza",
    profesor_id: "coach-1",
    alumno_id: null,
    nombre: "Plantilla Fuerza 5x5",
    tipo: "PLANTILLA",
    estado: "ACTIVO",
    comentarios: "Fuerza básica con barra libre",
    fecha_inicio: "2026-10-01T00:00:00Z",
    fecha_fin: null,
    tags: ["Fuerza", "Potencia"],
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  },
  {
    id: "plan-plantilla-hipertrofia",
    profesor_id: "coach-1",
    alumno_id: null,
    nombre: "Plantilla Hipertrofia Push-Pull",
    tipo: "PLANTILLA",
    estado: "ACTIVO",
    comentarios: "Volumen muscular alto RPE 8",
    fecha_inicio: "2026-10-02T00:00:00Z",
    fecha_fin: null,
    tags: ["Hipertrofia"],
    created_at: "2026-10-02T00:00:00Z",
    updated_at: "2026-10-02T00:00:00Z",
  },
  {
    id: "plan-plantilla-rehab",
    profesor_id: "coach-1",
    alumno_id: null,
    nombre: "Plantilla Hombro Sano",
    tipo: "PLANTILLA",
    estado: "ACTIVO",
    comentarios: "Movilidad y manguito rotador",
    fecha_inicio: "2026-10-03T00:00:00Z",
    fecha_fin: null,
    tags: ["Rehabilitación"],
    created_at: "2026-10-03T00:00:00Z",
    updated_at: "2026-10-03T00:00:00Z",
  },
  {
    id: "plan-alumno-lucas",
    profesor_id: "coach-1",
    alumno_id: "alumno-1",
    nombre: "Lucas Fuerza & Potencia",
    tipo: "DE_ALUMNO",
    estado: "ACTIVO",
    comentarios: "Plan vigente de Lucas",
    fecha_inicio: "2026-10-05T00:00:00Z",
    fecha_fin: null,
    tags: ["Fuerza", "Potencia"],
    created_at: "2026-10-05T00:00:00Z",
    updated_at: "2026-10-05T00:00:00Z",
  },
  {
    id: "plan-alumno-camila-borrador",
    profesor_id: "coach-1",
    alumno_id: "alumno-2",
    nombre: "Camila Calistenia",
    tipo: "DE_ALUMNO",
    estado: "BORRADOR",
    comentarios: "Borrador en ajuste",
    fecha_inicio: "2026-10-06T00:00:00Z",
    fecha_fin: null,
    tags: ["Peso Corporal"],
    created_at: "2026-10-06T00:00:00Z",
    updated_at: "2026-10-06T00:00:00Z",
  },
];

const mockDataset: LiveSupabaseDataset = {
  alumnos: mockAlumnos,
  planes: mockPlanes,
  dias: [],
  ejerciciosEnRutina: [],
  ejercicios: [],
};

describe("GOZS-365: Coach Studio - Filtro por Tags y Badges de Categoría en Biblioteca de Rutinas (/studio/rutinas)", () => {
  describe("Criterio 1: Barra de Chips de Filtro y Buscador Reactivo", () => {
    it("renderiza la barra horizontal de filtros con todos los chips requeridos", () => {
      const html = renderToStaticMarkup(createElement(RutinasLibrary, { initialDataset: mockDataset }));

      // Contenedor de filtros
      expect(html).toContain('data-testid="rutinas-filters-container"');
      expect(html).toContain('data-testid="rutinas-tags-filter"');
      expect(html).toContain('data-testid="search-rutinas-input"');

      // Chips individuales
      for (const tag of TAGS_FILTRO_BIBLIOTECA) {
        const slug = tagToSlug(tag);
        expect(html).toContain(`data-testid="tag-filter-${slug}"`);
        expect(html).toContain(tag);
      }
    });

    it("GIVEN la vista de biblioteca, WHEN se filtra por 'Hipertrofia', THEN únicamente se exhiben las rutinas con ese tag", () => {
      const soloHipertrofia = filtrarRutinasPorTag(mockPlanes, "Hipertrofia");
      expect(soloHipertrofia).toHaveLength(1);
      expect(soloHipertrofia[0]!.id).toBe("plan-plantilla-hipertrofia");
      expect(soloHipertrofia[0]!.tags).toContain("Hipertrofia");
    });

    it("GIVEN la vista de biblioteca, WHEN se filtra por 'Fuerza', THEN incluye plantillas y rutinas de alumnos con Fuerza", () => {
      const soloFuerza = filtrarRutinasPorTag(mockPlanes, "Fuerza");
      expect(soloFuerza).toHaveLength(2);
      expect(soloFuerza.map((p) => p.id)).toEqual(["plan-plantilla-fuerza", "plan-alumno-lucas"]);
    });

    it("GIVEN la vista de biblioteca, WHEN el filtro es 'Todos', THEN exhibe todas las rutinas", () => {
      const todos = filtrarRutinasPorTag(mockPlanes, "Todos");
      expect(todos).toHaveLength(mockPlanes.length);
    });

    it("combina el filtro de tag con búsqueda reactiva por texto", () => {
      // Filtrar por tag Fuerza y texto "Lucas"
      const res1 = filtrarRutinas(mockPlanes, "Fuerza", "Lucas");
      expect(res1).toHaveLength(1);
      expect(res1[0]!.id).toBe("plan-alumno-lucas");

      // Filtrar por tag Fuerza y texto "5x5"
      const res2 = filtrarRutinas(mockPlanes, "Fuerza", "5x5");
      expect(res2).toHaveLength(1);
      expect(res2[0]!.id).toBe("plan-plantilla-fuerza");

      // Tag no coincidente
      const res3 = filtrarRutinas(mockPlanes, "Hipertrofia", "Fuerza");
      expect(res3).toHaveLength(0);
    });
  });

  describe("Criterio 2: Badges de Tags en Tarjetas de Rutinas con Paleta Semántica", () => {
    it("renderiza badges de categoría en las tarjetas de plantillas, alumnos y borradores", () => {
      const html = renderToStaticMarkup(createElement(RutinasLibrary, { initialDataset: mockDataset }));

      // Contenedor de badges de tags
      expect(html).toContain('data-testid="rutina-tags-badges"');

      // Badges específicos con sus testids semánticos
      expect(html).toContain('data-testid="badge-tag-fuerza"');
      expect(html).toContain('data-testid="badge-tag-potencia"');
      expect(html).toContain('data-testid="badge-tag-hipertrofia"');
      expect(html).toContain('data-testid="badge-tag-rehabilitacion"');
    });

    it("aplica clases de contraste alto y paleta distinguible para cada categoría deportiva", () => {
      const estiloFuerza = getTagBadgeStyles("Fuerza");
      expect(estiloFuerza.className).toContain("border-amber-500");
      expect(estiloFuerza.dotColor).toBe("bg-amber-400");

      const estiloHipertrofia = getTagBadgeStyles("Hipertrofia");
      expect(estiloHipertrofia.className).toContain("border-emerald-500");
      expect(estiloHipertrofia.dotColor).toBe("bg-emerald-400");

      const estiloRehab = getTagBadgeStyles("Rehabilitación");
      expect(estiloRehab.className).toContain("border-sky-500");
      expect(estiloRehab.dotColor).toBe("bg-sky-400");

      const estiloPotencia = getTagBadgeStyles("Potencia");
      expect(estiloPotencia.className).toContain("border-purple-500");
      expect(estiloPotencia.dotColor).toBe("bg-purple-400");

      const estiloPeso = getTagBadgeStyles("Peso Corporal");
      expect(estiloPeso.className).toContain("border-slate-500");
      expect(estiloPeso.dotColor).toBe("bg-slate-400");
    });
  });

  describe("Criterio 3: Clonación / Asignación con Preservación de Tags", () => {
    it("GIVEN una plantilla con tags ['Hipertrofia', 'Fuerza'], WHEN se clona o asigna, THEN hereda íntegramente sus tags", () => {
      const plantilla: Partial<PlanEntrenamiento> = {
        id: "plantilla-origen",
        nombre: "Plantilla Base",
        tags: ["Hipertrofia", "Fuerza"],
      };

      const tagsClonados = heredarTagsDePlantilla(plantilla);
      expect(tagsClonados).toEqual(["Hipertrofia", "Fuerza"]);

      // Inmutabilidad
      expect(tagsClonados).not.toBe(plantilla.tags);
    });

    it("si la plantilla carece de tags o tiene array vacío, devuelve array vacío seguro", () => {
      expect(heredarTagsDePlantilla({})).toEqual([]);
      expect(heredarTagsDePlantilla({ tags: [] })).toEqual([]);
      expect(heredarTagsDePlantilla(null)).toEqual([]);
    });
  });
});
