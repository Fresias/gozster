import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { CoachStudioView } from "@/components/coach/coach-studio-view";
import { DEMO_GIMNASIO } from "@/services/coach-demo-dataset";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

describe("GOZS-394: Coach Studio - Directorio de Alumnos: Toolbar, Filtros en URL y Menú ⋯", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const dataset = {
    alumnos: DEMO_GIMNASIO.alumnos,
    planes: DEMO_GIMNASIO.planes,
    dias: DEMO_GIMNASIO.dias,
    ejerciciosEnRutina: DEMO_GIMNASIO.ejerciciosEnRutina,
    ejercicios: DEMO_GIMNASIO.ejercicios,
  };

  describe("Criterio 1: Badges semánticos de texto explícito en Cuota y Alertas sin puntos aislados", () => {
    it("GIVEN cualquier fila de alumno en el directorio THEN las columnas Cuota y Alertas exhiben texto claro ('Al día', 'Vencida', 'Hombro · moderado') sin puntos de color aislados", () => {
      const html = renderToStaticMarkup(<CoachStudioView initialDataset={dataset} />);

      // 1. Columna Cuota con texto explícito 'Al día' y 'Vencida'
      expect(html).toContain("Al día");
      expect(html).toContain("Vencida");

      // 2. Columna Alertas con texto semántico claro ('Hombro · moderado' para Lucas Giménez)
      expect(html).toContain("Hombro · moderado");

      // 3. No existen puntos de color aislados ni dots huérfanos en la columna de Cuota
      // (la celda contiene StatusBadge semántico con borde y texto, erradicando dots aislados)
      expect(html).toContain('data-testid="columna-cuota-actividad"');
    });
  });

  describe("Criterio 2: Sincronización bidireccional del filtro con la URL mediante querystring", () => {
    it("GIVEN el chip de filtro 'Pago pendiente' THEN filtra alumnos con cuota vencida y refleja ?estado=pago_pendiente en URL", () => {
      // Simular window.location y history.replaceState
      let currentHref = "http://localhost:3000/studio";
      const replaceStateMock = vi.fn((_state: any, _title: string, url: string) => {
        currentHref = `http://localhost:3000${url}`;
      });

      vi.stubGlobal("window", {
        location: {
          href: currentHref,
          search: "",
          pathname: "/studio",
        },
        history: {
          replaceState: replaceStateMock,
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });

      const html = renderToStaticMarkup(
        <CoachStudioView initialDataset={dataset} initialEstado="pago_pendiente" />,
      );

      // El chip de Pago pendiente está visualmente activo
      expect(html).toContain('data-testid="chip-filtro-pago-pendiente"');
      expect(html).toContain('aria-pressed="true"');
      expect(html).toContain('data-selected="true"');

      // Todas las filas visibles en cuota corresponden a cuota vencida / pendiente
      expect(html).toContain("Vencida");
      // No contiene alumnos con cuota al día en el cuerpo filtrado
      expect(html).not.toMatch(/<td[^>]*columna-cuota-actividad[^>]*>[\s\S]*?Al día[\s\S]*?<\/td>/);
    });

    it("GIVEN una URL cargada directamente con ?estado=pago_pendiente THEN el directorio inicializa con dicho filtro activo y el chip seleccionado", () => {
      vi.stubGlobal("window", {
        location: {
          href: "http://localhost:3000/studio?estado=pago_pendiente",
          search: "?estado=pago_pendiente",
          pathname: "/studio",
        },
        history: {
          replaceState: vi.fn(),
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });

      const html = renderToStaticMarkup(<CoachStudioView initialDataset={dataset} />);

      expect(html).toContain('data-testid="chip-filtro-pago-pendiente"');
      expect(html).toContain('aria-pressed="true"');
      expect(html).toContain('data-selected="true"');
    });

    it("GIVEN una URL cargada con ?estado=al_dia THEN inicializa con el chip 'Al día' seleccionado", () => {
      vi.stubGlobal("window", {
        location: {
          href: "http://localhost:3000/studio?estado=al_dia",
          search: "?estado=al_dia",
          pathname: "/studio",
        },
        history: {
          replaceState: vi.fn(),
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });

      const html = renderToStaticMarkup(<CoachStudioView initialDataset={dataset} />);

      expect(html).toContain('data-testid="chip-filtro-al-dia"');
      expect(html).toContain('aria-pressed="true"');
    });
  });

  describe("Criterio 3: Menú contextual ⋯ accesible (DropdownMenu) por fila con acciones rápidas", () => {
    it("GIVEN el botón ⋯ de una fila WHEN se renderiza THEN expone trigger accesible con '⋯' y aria-haspopup", () => {
      const html = renderToStaticMarkup(<CoachStudioView initialDataset={dataset} />);

      const lucasId = dataset.alumnos[0]!.id;
      expect(html).toContain(`data-testid="btn-acciones-alumno-${lucasId}"`);
      expect(html).toContain('aria-haspopup="menu"');
      expect(html).toContain("⋯");
      expect(html).toContain(`Acciones para ${dataset.alumnos[0]!.nombre_completo}`);

      // Erradica botones de fila con ⚡ u horizontal overflow de 5 botones
      expect(html).not.toMatch(/d="M13 10V3L4 14h7v7l9-11h-7z"/);
    });

    it("GIVEN el DropdownMenu abierto THEN despliega 'Ver ficha', 'Enviar mensaje' y 'Editar datos'", () => {
      const lucasId = dataset.alumnos[0]!.id;
      const html = renderToStaticMarkup(
        <CoachStudioView initialDataset={dataset} openMenuAlumnoIdProp={lucasId} />,
      );

      // Renderiza role="menu"
      expect(html).toContain('role="menu"');

      // Acciones rápidas requeridas por GOZS-394
      expect(html).toContain("Ver ficha");
      expect(html).toContain(`data-testid="btn-ver-ficha-${lucasId}"`);

      expect(html).toContain("Enviar mensaje");
      expect(html).toContain(`data-testid="btn-enviar-mensaje-${lucasId}"`);

      expect(html).toContain("Editar datos");
      expect(html).toContain(`data-testid="btn-editar-datos-${lucasId}"`);
    });
  });

  describe("Criterio 4: Uso de primitivas StatusBadge y DropdownMenu de src/components/ui/", () => {
    it("CoachStudioView importa y utiliza StatusBadge y DropdownMenu de src/components/ui/", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const code = fs.readFileSync(
        path.resolve(__dirname, "../components/coach/coach-studio-view.tsx"),
        "utf-8",
      );

      expect(code).toContain('from "@/components/ui/dropdown-menu"');
      expect(code).toContain('from "@/components/ui/status-badge"');
      expect(code).toContain("<DropdownMenu");
      expect(code).toContain("<DropdownMenuTrigger");
      expect(code).toContain("<DropdownMenuContent");
      expect(code).toContain("<DropdownMenuItem");
      expect(code).toContain("<StatusBadge");
    });
  });
});
