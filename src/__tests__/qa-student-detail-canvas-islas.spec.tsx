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
      expect(html).toContain("Sesiones");
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

      // Fuera de Personalizar no se renderizan drag-handles ni flechas visibles
      expect(html).not.toContain('data-testid="drag-handle-timeline"');
      expect(html).not.toContain("⠿");

      // Botones de colapso para cada isla
      expect(html).toContain('data-testid="collapse-btn-timeline"');
      expect(html).toContain('data-testid="collapse-btn-activity_feed"');
      expect(html).toContain('data-testid="collapse-btn-routine_workbench"');
      expect(html).toContain('data-testid="collapse-btn-metricas_1rm"');
      expect(html).toContain('data-testid="collapse-btn-salud_anamnesis"');
      expect(html).toContain('data-testid="collapse-btn-administracion"');

      // Los botones "..." están eliminados a favor de controles directos y colapso explícito
      expect(html).not.toContain('data-testid="menu-btn-timeline"');
      expect(html).not.toContain('data-testid="menu-btn-activity_feed"');
      expect(html).not.toContain('data-testid="move-up-timeline"');
      expect(html).not.toContain('data-testid="move-down-timeline"');
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

  describe("Criterio 6: IslaSaludAnamnesis sin Escala EVA (1-10) y con Red Flags directos", () => {
    it("elimina monitor visual de escala EVA 1-10 y exhibe reporte directo de molestia y anamnesis", () => {
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
      // Directiva de Gabriel: EVA 1-10 eliminado
      expect(html).not.toContain('data-testid="eva-scale-display"');
      expect(html).toContain('data-testid="red-flags-alert"');
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

  describe("Criterio 8: Datos de Lucas Giménez (2 Meses Reales, 21 Sesiones y Cuestionario)", () => {
    it("MOCK_HISTORIAL_CARGAS contiene 21 sesiones reales espaciadas en 2 meses con progresión de sobrecarga", async () => {
      const { MOCK_HISTORIAL_CARGAS, LUCAS_2_MONTHS_HISTORIAL } = await import("@/services/coach-mock-data");
      const lucasLoads = LUCAS_2_MONTHS_HISTORIAL || MOCK_HISTORIAL_CARGAS["demo-alumno-01-lucas"];

      expect(lucasLoads).toBeDefined();
      expect(lucasLoads!.length).toBeGreaterThanOrEqual(20);

      // Verificación de rango temporal de 2 meses (Sep a Nov 2026)
      const fechas = lucasLoads!.map((l) => new Date(l.sesion.fecha).getTime());
      const minFecha = Math.min(...fechas);
      const maxFecha = Math.max(...fechas);
      const diffDays = Math.round((maxFecha - minFecha) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBeGreaterThanOrEqual(55);

      // Verificación de progresión de cargas reales en ejercicios clave
      const allSeries = lucasLoads!.flatMap((l) => l.series);
      const bancaSeries = allSeries.filter((s) => s.ejercicioNombre.includes("Press de Banca"));
      expect(bancaSeries.length).toBeGreaterThanOrEqual(4);
      const maxBanca = Math.max(...bancaSeries.map((s) => s.peso_kg));
      expect(maxBanca).toBeGreaterThanOrEqual(95); // PR de 95kg
    });
  });

  describe("Criterio 9: Erradicación del Tonelaje Mensual y Sustitución por Cargas por Ejercicio", () => {
    it("isla-metricas-1rm no exhibe 'Sparkline de Tonelaje Mensual' sino Progresión Real de Cargas Clave", () => {
      const html = renderToStaticMarkup(
        <IslaMetricas1RM
          historialCargas={mockHistoricalLoads as any}
          pesoCorporalActual={78.5}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
        />
      );

      // data-testid conservado para compatibilidad
      expect(html).toContain('data-testid="sparkline-tonelaje"');
      // Progresión por ejercicio presente
      expect(html).toContain("Progresión Real de Cargas");
      expect(html).toContain("Sobrecarga");
      expect(html).not.toContain("Sparkline de Tonelaje Mensual");
    });

    it("isla-timeline-ribbon exhibe ejercicio principal y series en vez de sumatoria de volumen", () => {
      const html = renderToStaticMarkup(
        <IslaTimelineRibbon
          historialCargas={mockHistoricalLoads as any}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
        />
      );

      expect(html).toContain('data-testid="ribbon-node"');
      expect(html).toContain("Sentadilla");
      expect(html).toContain("110kg");
    });
  });

  describe("Criterio 10: Sección Clínica con Acceso Rápido a Cuestionario, Toggle de Dolor y Bitácora", () => {
    it("IslaSaludAnamnesis exhibe acceso rápido a cuestionario, estado de molestia atendido y bitácora del coach", () => {
      const html = renderToStaticMarkup(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          evaDolorActual={3}
          zonaDolorActual="Hombro derecho"
        />
      );

      expect(html).toContain("Ficha de Anamnesis &amp; Cuestionario Inicial");
      expect(html).toContain("Reporte de Molestia en Ejercicio");
      expect(html).toContain("Bitácora de Intervención del Entrenador");
      expect(html).toContain("Se guarda al salir del campo.");
    });
  });

  describe("Criterio 11: Configuración de Visibilidad y Posicionamiento en el Canvas", () => {
    it("student-detail.tsx incluye botón de configuración de islas y acciones de movimiento en IslaCardShell", () => {
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

      expect(html).toContain('data-testid="btn-configurar-islas"');
      expect(html).toContain("Configurar Islas");
      expect(html).toContain('data-testid="collapse-btn-timeline"');
      expect(html).toContain('aria-label="Colapsar isla Sesiones"');
    });
  });

  describe("Criterio 12: Sidebar Colapsable a la Izquierda sin Desbordamiento ni Superposición", () => {
    it("studio-shell.tsx oculta etiquetas de texto y aplica overflow-x-hidden cuando isSidebarCollapsed es true", () => {
      const source = fs.readFileSync(
        path.resolve(process.cwd(), "src/components/coach/studio-shell.tsx"),
        "utf-8"
      );

      // Verificación de overflow-x-hidden en el aside
      expect(source).toContain("overflow-x-hidden");
      expect(source).toContain("lg:grid-cols-[56px_1fr]");
      expect(source).toContain("data-testid=\"sidebar-toggle-btn\"");

      // Verificación de que los textos están condicionados a !isSidebarCollapsed
      expect(source).toContain('{!isSidebarCollapsed && <span className="hidden lg:inline">Métricas</span>}');
      expect(source).toContain('{!isSidebarCollapsed && <span className="hidden lg:inline">Alumnos</span>}');
      expect(source).toContain('{!isSidebarCollapsed && <span className="hidden lg:inline">Rutinas</span>}');
      expect(source).toContain('{!isSidebarCollapsed && <span className="hidden lg:inline">Agenda</span>}');
      expect(source).toContain('isSidebarCollapsed ? "justify-center px-0"');
    });
  });

  describe("Criterio 13: Canvas por Filas con Ancho 100% por Defecto, Split 50/50 y Resize Horizontal", () => {
    it("student-detail.tsx implementa canvasRows con soporte de filas independientes y resize adaptable", () => {
      const source = fs.readFileSync(
        path.resolve(process.cwd(), "src/components/coach/student-detail.tsx"),
        "utf-8"
      );

      // Verificación del modelo de filas CanvasRow
      expect(source).toContain("DEFAULT_CANVAS_ROWS");
      expect(source).toContain("canvasRows");
      expect(source).toContain("resizeIslandWidth");
      expect(source).toContain("separateIslandToOwnRow");
      expect(source).toContain("moveIslandLeft");
      expect(source).toContain("moveIslandRight");

      // Verificación del CSS Grid con fractional units para resize adaptable
      expect(source).toContain("minmax(0,");
      expect(source).toContain("gridTemplateColumns");
    });

    it("IslaCardShell en modo Personalizar incluye controles de resize horizontal (-, +, ⤢) y asa grip-vertical sin flechas visibles", async () => {
      const { IslaCardShell } = await import(
        "@/components/coach/student-detail/islas/isla-card-shell"
      );

      const html = renderToStaticMarkup(
        <IslaCardShell
          id="test-shared"
          title="Isla Compartida"
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          isCanvasMode={true}
          isSharedRow={true}
          currentWidth={60}
          onResizeWidth={vi.fn()}
          onSeparateRow={vi.fn()}
          onMoveLeft={vi.fn()}
          onMoveRight={vi.fn()}
          canMoveLeft={true}
          canMoveRight={true}
        >
          <div>Contenido de prueba</div>
        </IslaCardShell>
      );

      // Controles de resize horizontal en fila compartida
      expect(html).toContain('data-testid="resize-dec-test-shared"');
      expect(html).toContain('data-testid="resize-inc-test-shared"');
      expect(html).toContain('data-testid="separate-row-test-shared"');
      expect(html).toContain("60%");

      // Asa grip-vertical en Personalizar sin flechas visibles
      expect(html).toContain('data-testid="drag-handle-test-shared"');
      expect(html).not.toContain("⬅️");
      expect(html).not.toContain("➡️");
    });
  });
});
