import * as React from "react";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StudentDetail } from "@/components/coach/student-detail";
import {
  IslaTimelineRibbon,
  IslaActivityFeed,
  IslaRoutineWorkbench,
  IslaMetricas1RM,
  IslaSaludAnamnesis,
  IslaAdministrativa,
  IslaCardShell,
} from "@/components/coach/student-detail/islas";
import { DEMO_ALUMNOS } from "@/services/coach-demo-dataset";
import type { Perfil } from "@/types/database.types";

describe("GOZS-367 / Issue #355: Vista Detallada de Alumno - Canvas Modular con Islas Arrastrables y Colapsables", () => {
  const alumnoLucas: Perfil = {
    ...DEMO_ALUMNOS[0]!,
    id: "demo-alumno-lucas",
    nombre_completo: "Lucas Giménez",
    email: "lucas.gimenez@demo.gozster.com",
    estado_membresia: "ACTIVA",
  };

  const mockHistoricalLoads = [
    {
      sesion: {
        id: "ses-1",
        alumno_id: alumnoLucas.id,
        plan_id: "plan-1",
        dia_id: "dia-1",
        fecha: "2026-10-15T10:00:00Z",
        duracion_minutos: 45,
        rpe_promedio: 8,
        volumen_total_kg: 3450,
      },
      series: [
        {
          id: "s-1",
          sesion_id: "ses-1",
          ejercicio_id: "ej-1",
          ejercicioNombre: "Sentadilla Trasera",
          peso_kg: 100,
          reps_hechas: 8,
          rpe_real: 8,
        },
      ],
    },
    {
      sesion: {
        id: "ses-2",
        alumno_id: alumnoLucas.id,
        plan_id: "plan-1",
        dia_id: "dia-2",
        fecha: "2026-10-18T10:00:00Z",
        duracion_minutos: 50,
        rpe_promedio: 8.5,
        volumen_total_kg: 4200,
      },
      series: [
        {
          id: "s-2",
          sesion_id: "ses-2",
          ejercicio_id: "ej-1",
          ejercicioNombre: "Sentadilla Trasera",
          peso_kg: 110,
          reps_hechas: 6,
          rpe_real: 9,
        },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Criterio 1: Carga de Canvas Modular con Upper Ribbon y Cuerpo Balanceado", () => {
    it("GIVEN un entrenador en la vista de detalle de un alumno WHEN accede a Lucas Giménez THEN la vista carga el Canvas Modular y el Upper Timeline Ribbon", () => {
      const html = renderToStaticMarkup(
        <StudentDetail
          alumno={alumnoLucas}
          activeTab="rutina_actual"
          onTabChange={vi.fn()}
          onBack={vi.fn()}
          rutinaActiva={null}
          historialPlanes={[]}
          dias={[]}
          ejerciciosEnRutina={[]}
          ejerciciosCatalogo={[]}
          historialCargas={mockHistoricalLoads as any}
          onOpenHistoricalLoads={vi.fn()}
          onClonarUltimaRutina={vi.fn().mockResolvedValue(null)}
          onExtenderVigencia={vi.fn().mockResolvedValue(null)}
          isOffline={false}
        />
      );

      // Canvas contenedor presente
      expect(html).toContain('data-testid="student-detail-modular-canvas"');
      expect(html).toContain('data-testid="btn-modo-canvas"');
      expect(html).toContain("Modo Canvas");

      // Upper Timeline Ribbon presente con sus nodos cronológicos
      expect(html).toContain('data-testid="isla-timeline-ribbon"');
      expect(html).toContain('data-testid="ribbon-node"');
      expect(html).toContain("Timeline Biomecánico Ribbon");
    });

    it("la arquitectura desacoplada exporta las islas autónomas desde src/components/coach/student-detail/islas", () => {
      expect(IslaTimelineRibbon).toBeDefined();
      expect(IslaActivityFeed).toBeDefined();
      expect(IslaRoutineWorkbench).toBeDefined();
      expect(IslaMetricas1RM).toBeDefined();
      expect(IslaSaludAnamnesis).toBeDefined();
      expect(IslaAdministrativa).toBeDefined();
      expect(IslaCardShell).toBeDefined();
    });
  });

  describe("Criterio 2: Anatomía de Islas Autónomas con Drag Handle punteado (⠿) y botón de colapsar ([-])", () => {
    it("cada isla incluye cabezal estandarizado con drag handle '⠿', botón de colapso y menú '•••'", () => {
      const html = renderToStaticMarkup(
        <StudentDetail
          alumno={alumnoLucas}
          activeTab="rutina_actual"
          onTabChange={vi.fn()}
          onBack={vi.fn()}
          rutinaActiva={null}
          historialPlanes={[]}
          dias={[]}
          ejerciciosEnRutina={[]}
          ejerciciosCatalogo={[]}
          historialCargas={mockHistoricalLoads as any}
          onOpenHistoricalLoads={vi.fn()}
          onClonarUltimaRutina={vi.fn().mockResolvedValue(null)}
          onExtenderVigencia={vi.fn().mockResolvedValue(null)}
          isOffline={false}
        />
      );

      // Drag handles para cada una de las islas
      expect(html).toContain('data-testid="drag-handle-timeline"');
      expect(html).toContain('data-testid="drag-handle-activity_feed"');
      expect(html).toContain('data-testid="drag-handle-routine_workbench"');
      expect(html).toContain('data-testid="drag-handle-metricas_1rm"');
      expect(html).toContain('data-testid="drag-handle-salud_anamnesis"');
      expect(html).toContain('data-testid="drag-handle-administracion"');

      // Botones de colapso para cada isla
      expect(html).toContain('data-testid="collapse-btn-timeline"');
      expect(html).toContain('data-testid="collapse-btn-activity_feed"');
      expect(html).toContain('data-testid="collapse-btn-routine_workbench"');
      expect(html).toContain('data-testid="collapse-btn-metricas_1rm"');
      expect(html).toContain('data-testid="collapse-btn-salud_anamnesis"');
      expect(html).toContain('data-testid="collapse-btn-administracion"');

      // Menú de opciones
      expect(html).toContain('data-testid="menu-btn-timeline"');
      expect(html).toContain('data-testid="menu-btn-activity_feed"');
    });
  });

  describe("Criterio 3: IslaActivityFeed y repliegue a riel lateral de 56px", () => {
    it("provee botón de repliegue [◀ Colapsar Feed] y renderiza riel de 56px (w-14) sin desmontar", () => {
      // Estado expandido
      const htmlExpanded = renderToStaticMarkup(
        <IslaActivityFeed
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          isRailCollapsed={false}
          onToggleRail={vi.fn()}
        />
      );
      expect(htmlExpanded).toContain('data-testid="isla-activity-feed"');
      expect(htmlExpanded).toContain('data-testid="toggle-collapse-feed"');
      expect(htmlExpanded).toContain("Colapsar Feed");
      expect(htmlExpanded).toContain('data-testid="activity-feed-date-group"');

      // Estado colapsado a riel
      const htmlRail = renderToStaticMarkup(
        <IslaActivityFeed
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          isRailCollapsed={true}
          onToggleRail={vi.fn()}
        />
      );
      expect(htmlRail).toContain('data-testid="activity-feed-rail"');
      expect(htmlRail).toContain("w-14");
      expect(htmlRail).toContain('data-testid="toggle-collapse-feed"');
    });
  });

  describe("Criterio 4: IslaRoutineWorkbench con micro-tablas, superseries y quick swap", () => {
    it("renderiza matriz de entrenamiento activa con conector de superseries y botón quick swap", () => {
      const mockRutina = {
        id: "plan-act-1",
        nombre: "Hipertrofia Piernas & Torso",
        estado: "ACTIVA",
        fecha_fin: "2026-12-31",
        created_at: "2026-10-01",
      };
      const mockDias = [
        { id: "dia-1", plan_id: "plan-act-1", nombre: "Día 1 - Piernas Foco Cuádriceps" },
      ];
      const mockEjerciciosEnRutina = [
        {
          id: "er-1",
          dia_id: "dia-1",
          ejercicio_id: "ej-sq",
          series: 4,
          repeticiones: "8-10",
          descanso_segundos: 90,
          es_superserie: true,
          grupo_superserie: 1,
          rpe_objetivo: 8,
          notas: "Pausa 1s abajo",
        },
      ];
      const mockCatalogo = [
        { id: "ej-sq", nombre: "Sentadilla Hack" },
      ];

      const html = renderToStaticMarkup(
        <IslaRoutineWorkbench
          rutinaActiva={mockRutina as any}
          dias={mockDias as any}
          ejerciciosEnRutina={mockEjerciciosEnRutina as any}
          ejerciciosCatalogo={mockCatalogo as any}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          onQuickSwap={vi.fn()}
        />
      );

      expect(html).toContain('data-testid="isla-routine-workbench"');
      expect(html).toContain('data-testid="workbench-day-accordion"');
      expect(html).toContain('data-testid="workbench-exercise-row"');
      expect(html).toContain('data-testid="workbench-superserie-connector"');
      expect(html).toContain("Superserie G1");
      expect(html).toContain('data-testid="workbench-quick-swap-btn"');
    });
  });

  describe("Criterio 5: IslaMetricas1RM y Telemetría de Fuerza (Epley/Brzycki)", () => {
    it("calcula y exhibe 1RM Epley, Brzycki, sparkline de tonelaje y evolución de peso corporal", () => {
      const html = renderToStaticMarkup(
        <IslaMetricas1RM
          historialCargas={mockHistoricalLoads as any}
          pesoCorporalActual={79.5}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
        />
      );

      expect(html).toContain('data-testid="isla-metricas-1rm"');
      expect(html).toContain('data-testid="metricas-1rm-epley"');
      expect(html).toContain('data-testid="metricas-1rm-brzycki"');
      expect(html).toContain('data-testid="sparkline-tonelaje"');
      expect(html).toContain('data-testid="evolucion-peso-corporal"');
      expect(html).toContain("79.5 kg");
    });
  });

  describe("Criterio 6: IslaSaludAnamnesis con Escala EVA (1-10) y Red Flags", () => {
    it("exhibe monitor visual de escala EVA de 1 a 10 y resumen colapsable de anamnesis", () => {
      const html = renderToStaticMarkup(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          evaDolorActual={4}
          zonaDolorActual="Rodilla Izquierda"
          onQuickSwap={vi.fn()}
        />
      );

      expect(html).toContain('data-testid="isla-salud-anamnesis"');
      expect(html).toContain('data-testid="eva-scale-display"');
      expect(html).toContain('data-testid="red-flags-alert"');
      expect(html).toContain("EVA 4/10");
      expect(html).toContain("Rodilla Izquierda");
      expect(html).toContain('data-testid="anamnesis-summary-collapsible"');
    });
  });

  describe("Criterio 7: Persistencia Local y Reordenamiento Drag & Drop", () => {
    it("student-detail.tsx implementa persistencia en localStorage bajo gozster_canvas_layout_${coachId}", () => {
      const source = fs.readFileSync(
        path.resolve(process.cwd(), "src/components/coach/student-detail.tsx"),
        "utf-8"
      );

      expect(source).toContain("gozster_canvas_layout_");
      expect(source).toContain("localStorage.setItem");
      expect(source).toContain("localStorage.getItem");
      expect(source).toContain("islandOrder");
      expect(source).toContain("collapsedIslands");
      expect(source).toContain("handleDrop");
      expect(source).toContain("data-testid=\"student-detail-modular-canvas\"");
    });
  });
});
