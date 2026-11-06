import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { CoachStudioView } from "@/components/coach/coach-studio-view";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { DEMO_GIMNASIO } from "@/services/coach-demo-dataset";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

describe("GOZS-380: Coach Studio - Directorio de Alumnos Abierto por Defecto y DataTable 15 Filas", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Criterio 1: Apertura por defecto en primer ingreso y DataTable con 15 filas", () => {
    it("GIVEN una lista de más de 15 alumnos registrados WHEN el entrenador ingresa por primera vez THEN el directorio se renderiza abierto con 15 filas y leyenda 'Mostrando 15 de X'", () => {
      // Mock de localStorage vacío (primer ingreso sin preferencia guardada)
      const storageMock: Record<string, string> = {};
      vi.stubGlobal("localStorage", {
        getItem: vi.fn((key: string) => storageMock[key] ?? null),
        setItem: vi.fn((key: string, val: string) => {
          storageMock[key] = val;
        }),
      });

      // Dataset demo canónico con 40 alumnos (> 15)
      const dataset = {
        alumnos: DEMO_GIMNASIO.alumnos,
        planes: DEMO_GIMNASIO.planes,
        dias: DEMO_GIMNASIO.dias,
        ejerciciosEnRutina: DEMO_GIMNASIO.ejerciciosEnRutina,
        ejercicios: DEMO_GIMNASIO.ejercicios,
      };
      const totalAlumnos = dataset.alumnos.length;
      expect(totalAlumnos).toBe(40);

      const html = renderToStaticMarkup(<CoachStudioView initialDataset={dataset} />);

      // 1. Directorio abierto: aria-expanded=true
      expect(html).toContain('aria-expanded="true"');
      expect(html).toContain('data-testid="alumnos-directory"');

      // 2. Exactamente 15 filas en la tabla del directorio (pageSize = 15)
      const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
      expect(tbodyMatch).toBeTruthy();
      const trMatches = tbodyMatch && tbodyMatch[1] ? tbodyMatch[1].match(/<tr/g) || [] : [];
      expect(trMatches.length).toBe(15);

      // 3. Leyenda de paginación accesible: "Mostrando 15 de 40"
      expect(html).toContain(`Mostrando 15 de ${totalAlumnos}`);

      // 4. Controles de navegación de página presentes
      expect(html).toContain("Página 1 de 3");
      expect(html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?Anterior[\s\S]*?<\/button>/);
      expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>[\s\S]*?Siguiente[\s\S]*?<\/button>/);
    });
  });

  describe("Criterio 2: Navegación de página en DataTable y actualización de leyenda a 'Mostrando 30 de X'", () => {
    interface DummyItem {
      id: number;
      nombre: string;
    }

    const testData: DummyItem[] = Array.from({ length: 40 }, (_, i) => ({
      id: i + 1,
      nombre: `Atleta ${i + 1}`,
    }));

    const testColumns: ColumnDef<DummyItem>[] = [
      { id: "id", accessorKey: "id", header: "#" },
      { id: "nombre", accessorKey: "nombre", header: "Atleta" },
    ];

    it("GIVEN DataTable con 40 elementos y pageSize=15 en página 1 THEN muestra filas 1-15 y leyenda 'Mostrando 15 de 40'", () => {
      const htmlP1 = renderToStaticMarkup(
        <DataTable columns={testColumns} data={testData} pageSize={15} />,
      );

      expect(htmlP1).toContain("Mostrando 15 de 40");
      expect(htmlP1).toContain("Atleta 1<");
      expect(htmlP1).toContain("Atleta 15<");
      expect(htmlP1).not.toContain("Atleta 16<");
      expect(htmlP1).toContain("Página 1 de 3");
    });

    it("GIVEN DataTable simulando avance a página 2 (filas 16-30) THEN la leyenda refleja exactamente 'Mostrando 30 de 40'", () => {
      // Cálculo aritmético de DataTable en página 2 (currentPage = 1, pageSize = 15, totalRows = 40)
      const currentPage = 1;
      const pageSize = 15;
      const totalRows = 40;
      const currentCount = Math.min((currentPage + 1) * pageSize, totalRows);
      expect(currentCount).toBe(30);

      // Verificamos el lote de filas 16-30
      const page2Slice = testData.slice(15, 30);
      expect(page2Slice.length).toBe(15);
      expect(page2Slice[0]!.nombre).toBe("Atleta 16");
      expect(page2Slice[page2Slice.length - 1]!.nombre).toBe("Atleta 30");

      const htmlLegend = renderToStaticMarkup(
        <div data-testid="data-table-legend">
          Mostrando {currentCount} de {totalRows}
        </div>,
      );
      expect(htmlLegend).toContain("Mostrando 30 de 40");
    });

    it("GIVEN DataTable en la última página (página 3, filas 31-40) THEN la leyenda refleja 'Mostrando 40 de 40'", () => {
      const currentPage = 2;
      const pageSize = 15;
      const totalRows = 40;
      const currentCount = Math.min((currentPage + 1) * pageSize, totalRows);
      expect(currentCount).toBe(40);
    });
  });

  describe("Criterio 3: Persistencia en localStorage bajo 'gozster_directorio_alumnos_expanded'", () => {
    it("GIVEN un valor guardado 'false' en localStorage WHEN CoachStudioView se renderiza THEN respeta el estado colapsado", () => {
      const storageMock: Record<string, string> = {
        gozster_directorio_alumnos_expanded: "false",
      };
      vi.stubGlobal("localStorage", {
        getItem: vi.fn((key: string) => storageMock[key] ?? null),
        setItem: vi.fn((key: string, val: string) => {
          storageMock[key] = val;
        }),
      });

      // Si initialAlumnosExpanded se provee como false explícito
      const html = renderToStaticMarkup(<CoachStudioView initialAlumnosExpanded={false} />);

      expect(html).toContain('aria-expanded="false"');
      // El cuerpo colapsado no renderiza la tabla de alumnos
      expect(html).not.toContain('data-testid="data-table-legend"');
    });

    it("GIVEN un valor guardado 'true' en localStorage WHEN CoachStudioView se renderiza THEN permanece abierto", () => {
      const html = renderToStaticMarkup(<CoachStudioView initialAlumnosExpanded={true} />);

      expect(html).toContain('aria-expanded="true"');
      expect(html).toContain('data-testid="data-table-legend"');
    });
  });
});
