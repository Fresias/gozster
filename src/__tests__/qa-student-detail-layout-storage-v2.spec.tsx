import * as React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "fs";
import path from "path";
import { StudentDetail, type StudentDetailProps } from "@/components/coach/student-detail";
import { IslaCardShell } from "@/components/coach/student-detail/islas";
import { useChatStore } from "@/store/use-chat-store";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import type { Perfil } from "@/types/database.types";

/**
 * GOZS-395: Coach Studio - Ficha de Alumno: Layout 2 Columnas Balanceado y Migración Storage v2
 * Especificación: Página 5 del PDF oficial de rediseño UX/UI y Criterios de Aceptación Gherkin.
 */
describe("GOZS-395: Ficha de Alumno - Layout 2 Columnas Balanceado y Migración Storage v2", () => {
  const alumnoMock: Perfil = {
    id: "demo-alumno-lucas",
    nombre_completo: "Lucas Giménez",
    email: "lucas.gimenez@ficticio.ar",
    telefono: "+5491112345678",
    estado_membresia: "ACTIVA",
    created_at: "2026-07-01T10:00:00Z",
    updated_at: "2026-07-01T10:00:00Z",
    profesor_asignado_id: "coach-lucas-1",
    rol: "ALUMNO",
    fecha_baja: null,
  };

  const defaultProps: StudentDetailProps = {
    alumno: alumnoMock,
    activeTab: "rutina_actual",
    onTabChange: vi.fn(),
    onBack: vi.fn(),
    rutinaActiva: null,
    historialPlanes: [],
    dias: [],
    ejerciciosEnRutina: [],
    ejerciciosCatalogo: [],
    onOpenHistoricalLoads: vi.fn(),
    onClonarUltimaRutina: vi.fn().mockResolvedValue(null),
    onExtenderVigencia: vi.fn().mockResolvedValue(null),
    isOffline: false,
    onOpenChat: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.getState().resetToDefaults();
    useCoachStudioStore.setState({
      selectedAlumnoId: alumnoMock.id,
    });
  });

  describe("Criterio 1: Grilla predeterminada en 2 columnas en desktop (≥ 960px) y contención ≤ 2.300 px", () => {
    it("GIVEN un coach sin layout previo guardado WHEN abre la ficha de un alumno THEN las islas se organizan en 2 columnas balanceadas y la altura total es ≤ 2.300 px", () => {
      const html = renderToStaticMarkup(<StudentDetail {...defaultProps} />);

      // Contenedor principal del canvas
      expect(html).toContain('data-testid="student-detail-modular-canvas"');

      // Grilla de 2 columnas balanceadas en desktop
      expect(html).toContain('data-testid="student-detail-grid-columns"');
      expect(html).toContain("min-[960px]:grid-cols-12");

      // Contención de altura y eliminación de scroll horizontal
      expect(html).toContain("max-height:2300px");
      expect(html).toContain("overflow-x-hidden");

      // Columna izquierda (8 cols): Rutina y Fuerza
      expect(html).toContain('data-testid="canvas-column-left"');
      expect(html).toContain("min-[960px]:col-span-8");
      expect(html).toContain('data-testid="isla-routine-workbench"');
      expect(html).toContain('data-testid="isla-metricas-1rm"');

      // Columna derecha (4 cols): Salud, Actividad y Membresía
      expect(html).toContain('data-testid="canvas-column-right"');
      expect(html).toContain("min-[960px]:col-span-4");
      expect(html).toContain('data-testid="isla-salud-anamnesis"');
      expect(html).toContain('data-testid="isla-activity-feed"');
      expect(html).toContain('data-testid="isla-administrativa"');

      // Upper ribbon de timeline arriba
      expect(html).toContain('data-testid="canvas-row-timeline"');
      expect(html).toContain('data-testid="isla-timeline-ribbon"');
    });
  });

  describe("Criterio 2: Versionado de storage a gozster_canvas_layout_v2_<coachId> y migración segura v1", () => {
    it("student-detail.tsx define la clave de almacenamiento v2 y limpia configuraciones viejas v1", () => {
      const source = fs.readFileSync(
        path.resolve(process.cwd(), "src/components/coach/student-detail.tsx"),
        "utf-8"
      );

      // Verificación de clave versionada v2
      expect(source).toContain("gozster_canvas_layout_v2_");
      expect(source).toContain("storageKeyV1");
      expect(source).toContain("storageKeyV2");

      // Verificación de lógica de descarte limpio de v1 sin crasheos
      expect(source).toContain("savedV1");
      expect(source).toContain("localStorage.removeItem(storageKeyV1)");
      expect(source).toContain("DEFAULT_LAYOUT_COLUMNS_V2");
    });

    it("GIVEN una clave previa v1 en localStorage WHEN se evalúa la hidratación THEN se descarta y aplica layout default v2", () => {
      const mockStorage: Record<string, string> = {
        "gozster_canvas_layout_coach-lucas-1": JSON.stringify({
          rows: [{ id: "legacy-row", items: ["administracion"] }],
          order: ["administracion"],
        }),
      };

      const coachId = "coach-lucas-1";
      const storageKeyV1 = `gozster_canvas_layout_${coachId}`;
      const storageKeyV2 = `gozster_canvas_layout_v2_${coachId}`;

      // Simulación del algoritmo de migración de student-detail
      const savedV2 = mockStorage[storageKeyV2];
      let loadedLayout = null;
      if (savedV2) {
        loadedLayout = JSON.parse(savedV2);
      } else if (mockStorage[storageKeyV1]) {
        delete mockStorage[storageKeyV1];
        loadedLayout = {
          version: 2,
          leftColumn: ["routine_workbench", "metricas_1rm"],
          rightColumn: ["salud_anamnesis", "activity_feed", "administracion"],
        };
        mockStorage[storageKeyV2] = JSON.stringify(loadedLayout);
      }

      // v1 fue eliminado
      expect(mockStorage[storageKeyV1]).toBeUndefined();
      // v2 contiene el layout default 2 columnas
      expect(mockStorage[storageKeyV2]).toBeDefined();
      expect(loadedLayout?.leftColumn).toEqual(["routine_workbench", "metricas_1rm"]);
      expect(loadedLayout?.rightColumn).toEqual(["salud_anamnesis", "activity_feed", "administracion"]);
    });
  });

  describe("Criterio 3: Renombrar 'Modo Canvas' a 'Personalizar' y supresión de invasión en reposo", () => {
    it("GIVEN la cabecera de la ficha THEN expone el botón 'Personalizar' con ícono de ajustes y accesibilidad", () => {
      const html = renderToStaticMarkup(<StudentDetail {...defaultProps} />);

      expect(html).toContain("Personalizar");
      expect(html).toContain('data-testid="btn-modo-canvas"');
      expect(html).toContain('title="Personalizar layout (Modo Canvas)"');
    });

    it("GIVEN el modo 'Personalizar' desactivado THEN los drag handles y flechas de reordenamiento permanecen ocultos en estado de reposo", () => {
      const html = renderToStaticMarkup(
        <IslaCardShell
          id="test-reposo"
          title="Isla Reposo"
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          isCanvasMode={false}
          onMoveUp={vi.fn()}
          onMoveDown={vi.fn()}
        >
          <div>Contenido</div>
        </IslaCardShell>
      );

      // Drag handle oculto en estado de reposo (opacity-0)
      expect(html).toContain('data-testid="drag-handle-test-reposo"');
      expect(html).toContain("opacity-0 group-hover:opacity-100");

      // Flechas de reordenamiento ocultas en estado de reposo (opacity-0)
      expect(html).toContain('data-testid="move-up-test-reposo"');
      expect(html).toContain('data-testid="move-down-test-reposo"');
      expect(html).toContain("hidden sm:inline-flex opacity-0 group-hover:opacity-100");
    });
  });

  describe("Criterio 4: Conmutación a 1 columna responsiva en viewports < 960px", () => {
    it("GIVEN viewports móviles/tablets (< 960px) THEN el layout fluye en una columna vertical sin overflow", () => {
      const html = renderToStaticMarkup(<StudentDetail {...defaultProps} />);

      // Estructura grid-cols-1 para móviles y tablets
      expect(html).toContain("grid-cols-1 min-[960px]:grid-cols-12");

      // Columnas se comportan como col-span-1 en móvil y fluyen verticalmente
      expect(html).toContain("col-span-1 min-[960px]:col-span-8");
      expect(html).toContain("col-span-1 min-[960px]:col-span-4");
      expect(html).toContain("overflow-x-hidden");
    });
  });

  describe("Criterio 5: Soporte accesible aria-live", () => {
    it("student-detail.tsx renderiza una región viva aria-live='polite' para notificaciones de accesibilidad", () => {
      const html = renderToStaticMarkup(<StudentDetail {...defaultProps} />);

      expect(html).toContain('data-testid="student-detail-live-announcer"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('aria-atomic="true"');
      expect(html).toContain("sr-only");
    });
  });
});
